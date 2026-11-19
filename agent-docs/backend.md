# Backend

## Config (`server/common/config.ts`)
Validated with Zod at startup; a missing/invalid variable stops the server naming it (never its
value). Env comes from `.env.local` (`--env-file`) in dev and `env_file` in compose.
`API_PORT` (4000), `REDIS_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `JUDGE_AI_MODE`
(`demo`|`auto`), `SESSION_SECRET` (>= 32 chars), `SESSION_SECRET_PREVIOUS` (optional),
`COOKIE_SECURE` (default false). AI config also lives here: optional `GEMINI_API_KEY`,
`GEMINI_MODEL` (gemini-3.6-flash), optional `GEMINI_FALLBACK_MODEL`, and
`JUDGE_AI_TIMEOUT_MS` (8000 default, clamped to 1000-12000 ms). `loadAiConfig` supports isolated
AI tests; the planner never reads process.env directly. Demo is default; auto without a key
also uses demo. Never opt into paid AI during automated tests.
`DEADLINE_POLL_MS` defaults to 250 (integer 1-60000): delay after each worker polling run.

## Redis clients (`server/common/redis.ts`)
- `createRedis`: the API's client. **Fails fast** (no offline queue) so requests never hang.
- `createQueueRedis`: BullMQ's client. Waits through outages (`maxRetriesPerRequest: null`).
- `redisIsUp()`: health check helper that waits for the first connection attempt.

## Sessions (Stage 1B)
- **Access token**: JWT, HS256 only (jose), `sub` = player ID (`p_` + 16 random bytes,
  base64url), 15-minute `exp`. Cookie `quarrel_access`: HttpOnly, SameSite=Lax, Path=/,
  Max-Age 30 days (the cookie outlives the JWT so the server can answer `SESSION_EXPIRED`),
  Secure only if `COOKIE_SECURE=true`. Verified by signature only.
- **Refresh token**: 32 random bytes (not a JWT). Cookie `quarrel_refresh`: HttpOnly,
  SameSite=Lax, **Path=/api/session**, Max-Age 30 days. Stored only as a SHA-256 hash.
- **Rotation** (Lua, atomic): each refresh token works once and is swapped for a new one in the
  same family. Reuse of a used token -> the whole family is revoked. **Grace window 10 s**: a
  used token presented again within 10 s (two tabs racing) gets a fresh access cookie only, no
  revoke, no cookie clearing.
- `server/common/tokens.ts`: sign/verify, ID and token generation, hashing. Tests can inject
  `AppDeps.session.accessTtlSeconds` (default 900) without changing cookie retention or adding
  an environment variable. Integration tests advance only Date to expire a 1-second token,
  leaving real networking timers and Redis TIME untouched.
- `server/api/refresh-store.ts`: all refresh-token Redis access; rotation Lua is loaded at
  startup from `server/api/lua/rotate-refresh.lua`.
- `server/api/session.ts`: `onRequest` hook sets `request.session` / `request.sessionExpired`;
  `requireSession` (else `SESSION_EXPIRED` / `UNAUTHENTICATED`); `ensureSession` (creates a
  session; only create/join use it); routes `GET /api/session`, `POST /api/session/refresh`,
  `POST /api/session/logout`. `GET /api/session` never creates a session.

## Errors (`server/api/errors.ts`)
`AppError(code)` -> `ERROR_STATUS[code]` + `{ error: { code, message } }`. `parseRequest` ->
400 `INVALID_REQUEST` naming bad fields (never values). `sendParsed` validates responses; a
failure is a server bug -> 500. Unknown routes -> 404 `NOT_FOUND`. Redis connection errors -> 503.

## Redis key map
| Key | Holds | TTL | Since |
| --- | --- | --- | --- |
| `refresh:<sha256>` | `{ playerId, familyId, used, usedAt }` | 30 days | 1B |
| `refresh-family:<familyId>` | `revoked` marker | 30 days | 1B |
| `room:<roomId>` | room hash (live; fields below) | absolute expiry + 24 h | 1C |
| `code:<CODE>` | roomId (live) | absolute expiry + 24 h | 1C |
| `player:<playerId>` | current roomId (live) | none; delete on leave/release | 1C |
| `presence:<playerId>` | connected marker, set/refreshed by sockets (live) | 35 s | 1D |
| `room:<roomId>:messages` | JSON announcement/argument list, oldest first | same expiresAt + 24 h as room | 4 |
| `room:<roomId>:requests` | hash: seat:UUID -> SHA-256 of [ordinal, raw text] | same expiresAt + 24 h as room | 4 |
| `deadlines` | sorted set: roomId -> deadline in Redis epoch ms | none; transitions/leave remove members, poller cleans expired/missing rooms | 4 |
| `bull:default:*` | BullMQ plan queue metadata, jobs, locks and retry state | BullMQ-managed; completed jobs retained 48 h | 3 |
Update this table whenever a key is added or changed.

## Rooms (Stage 1C)
- `server/api/rooms.ts`: room routes; invalid name -> `INVALID_NAME`, invalid code ->
  `INVALID_CODE` (code wins if both are invalid), other malformed input -> `INVALID_REQUEST`.
- `room-service.ts`: session requirements, random IDs/codes, script errors, per-app typed
  `events` emitter (`roomChanged(roomId, change?)`). A successful leave includes
  `{ leftPlayerId }` so sockets can clear all of the departing player's tabs. Registered as `app.rooms`.
- `room-repo.ts`: all room/pointer/presence Redis access; scripts in `server/rooms/lua/`.
  Scripts are read at module startup. `common/lua.ts` uses EVALSHA with EVAL on NOSCRIPT.
- Hash fields: `code`, `createdAt`, `expiresAt` (Redis milliseconds), `version`, `closed`
  (`0`/`1`); `a.player`, `a.name`, `a.ready`, `a.left`, and the same `b.*` after B joins.
  Stage 2 adds `phase`, `theme`, `topic`, `durationSec`, `a.position`, `b.position`: phase starts
  waiting; A position starts empty; B position starts empty on join. Empty position maps to null.
  Theme/topic/duration are fixed at create; durationSec is stored as a numeric string.
  Stage 3 adds `plan` (validated JSON, absent until saved) and `startsAt` (Redis milliseconds,
  absent until Start). The mapper exposes null for absent fields and ISO UTC startsAt.
  IDs use `r_` + 16 random bytes base64url; codes use six crypto.randomInt draws from the
  shared 32-symbol alphabet. Room and code keys expire at `expiresAt + 24 h` (PEXPIREAT/PXAT).
- Room lifetime is fixed at creation, 24 h by default. `AppDeps.rooms.lifetimeMs` injects a
  repository lifetime (tests use -1 ms to create already-expired retained rooms, no sleep).
  This is dependency configuration, not a new environment variable.
- Mutation scripts use Redis TIME, check membership and mutate atomically. create/join/read
  discover dynamic keys in Node, then re-check the pointers (and read's seat IDs) in Lua;
  RETRY is bounded to five attempts, then `SERVICE_UNAVAILABLE`. Code collisions get five
  generated candidates, then `SERVICE_UNAVAILABLE`.
- Expired/missing previous seats are released on create/join by deleting only the player
  pointer; historical room fields remain untouched. Target errors are checked first on join.
- `GET /api/session` returns the caller's current snapshot, null for no seat, or
  `ROOM_EXPIRED` for a retained expired room. A missing room clears its pointer atomically.
- Snapshot Lua reads membership, room fields, presence and Redis time together. The mapper
  allowlists public fields, A then B; connected ignores left seats; bothReady requires two
  non-left, ready, connected seats. Presence is now written by the 1D socket wiring.
- Version starts at 1; join, changed readiness and leave increment once and emit once.
  Create/join retries and identical readiness values during positions are no-ops (no increment/event).
  Expired-pointer cleanup does not change historical rooms or emit an event.
- Leave with no pointer is a no-op; an existing pointer elsewhere gives `STALE_ROOM` before
  any room lookup. Ready with no pointer gives `ROOM_NOT_FOUND`. Expired current rooms give
  `ROOM_EXPIRED`. A missing current room is cleaned up (leave succeeds; ready gives 404).

## Setup (Stage 2, v2 flow)
- Contract-first in shared/contract/rooms.ts: theme IDs derive from shared/config, default
  courtroom; topic trimmed 1-240 code points with no raw Cc controls; duration 120/240/360/600
  (default 240). Missing/invalid topic -> INVALID_TOPIC, bad theme/duration -> INVALID_REQUEST.
- create.lua stores fixed setup and waiting phase. Idempotent create never overwrites setup.
  join.lua takes B and changes phase to positions in the same versioned change.
- PUT /api/rooms/:roomId/position uses position.lua. After auth/membership/expiry checks,
  require positions phase (WRONG_PHASE). Validate text in the contract: trimmed 1-600 code
  points, only tab/newline controls allowed (CR, DEL and C1 rejected). Route maps bad text to
  INVALID_POSITION. Slot comes exclusively from caller membership, never request data.
- A position save changes only that seat's text and clears only its ready. Re-saving identical
  text still clears a true ready flag; identical text with ready=false is a no-op. Public
  snapshot setup.positions always includes A and B (null until saved).
- set-ready.lua requires positions phase for both true/false, and own position for true
  (POSITION_REQUIRED). Both non-left ready flags atomically move to planning in that same
  step/version increment; presence is not a precondition. The separate bothReady snapshot
  indicator still requires both connections. Planning rejects all position/ready changes.
- Every actual position/ready/phase change increments version once and emits roomChanged once.
  No revision, confirmation, accept or setup-edit endpoints. Leave works in every phase,
  including debate. Stage 3 adds plan generation and host-only Start below.
- S2 tests live in server/tests/setup.test.ts and shared/tests/setup.test.ts; the socket suite
  checks opponent position pushes, and integration/lobby.test.ts now saves positions first.

## Sockets (Stage 1D)
- `server/api/sockets.ts`: `registerSockets(io, rooms, redis, { verifyKeys, logger })`, called
  from `api/index.ts` after `app.ready()`. Uses shared client/server event types and typed
  `socket.data.playerId`. Cookie parsing uses the existing @fastify/cookie package.
- Middleware verifies quarrel_access once, using `verifyAccessToken` and the same current/
  previous keys as HTTP. Missing/invalid -> connect_error UNAUTHENTICATED; expired ->
  SESSION_EXPIRED. A valid identity is allowed without a room; clients connect after joining.
- Each socket joins `player:<playerId>`, not a game-room channel. On connect only that socket
  gets RoomService.current; on roomChanged each non-left seated identity gets its own current
  response through its player channel. A leave additionally sends null to leftPlayerId.
- `RoomSnapshotEvent` is now RoomResponse (`{ room: snapshot | null }`), strictly parsed before
  emitting. A failed snapshot is debug-logged and skipped independently per recipient.
- RoomRepo owns presence SET EX 35 / DEL, current-pointer reads and seated-player discovery.
  Each open socket refreshes every 10 s; disconnect clears its timer and fetchSockets checks
  for other tabs. First connect and actual final key deletion emit roomChanged for the current
  room, without bumping version. Clients accept equal versions and ignore only lower versions
  of the same room; null clears the room and a new room has its own version sequence.
- Presence work is serialized per player in this API process so awaited SET/DEL operations
  cannot race across tabs. Push work is also ordered so equal-version notifications retain
  event order. Multi-server coordination and crash-expiry pushes remain later-stage work.
- Shutdown stops the pub/sub subscriber, awaits io.close(), drains socket work/removes the room
  event listener, then closes the plan queue, Fastify and Redis. All timers clear on disconnect.
  Test clients use the approved
  server devDependency socket.io-client; real HTTP/socket servers use a random local port.

## Planner and Start (Stage 3)
- set-ready.lua returns planningStarted only for the atomic transition. RoomService then adds
  `plan` to BullMQ's existing `default` queue. Stable ID is `plan-<roomId>`: installed BullMQ
  rejects the requested two-segment `plan:<roomId>` custom ID. It has the same deduplication.
  Completed jobs remain for 48 h (beyond room lifetime); failed jobs are removed for recovery.
- Missing-job recovery runs on explicit current-room reads (HTTP session/create/join retries
  and initial socket connect), only for open planning rooms without a plan. Ordinary snapshot
  broadcasts pass recoverPlan=false; the 10-second presence heartbeat only refreshes TTL.
  No polling, queue lookup, or enqueue on heartbeats; stable job IDs dedupe simultaneous reads.
- `server/worker/plan-worker.ts` uses the ported lawyer planner. Demo/unconfigured AI returns
  two deterministic subtopics. Configured auto uses AI; untrusted output passes shared
  PlanOutput, including 2-5 distinct, consecutively numbered questions and duration allocation.
  Server assigns alternating A/B openers; DebatePlan validates the final public object.
- Three attempts, exponential backoff starting at 1000 ms (1 s then 2 s). Generation errors,
  invalid output or wrong totals throw a sanitized error on earlier attempts. Only the final
  generation failure saves the two-subtopic fallback. Persistence failures remain job failures.
- save-plan.lua rechecks expiry/closure/planning/no existing plan, checks the duration total,
  saves once and bumps version. Late completion after leave is ignored. No regeneration.
- Worker publishes roomId on Redis channel `room-events` after saving. A retry finding an
  existing plan re-publishes (save may have succeeded before publish failed). API owns a
  dedicated subscription connection, validates room IDs and emits roomChanged for per-player
  pushes. Subscriber connections cannot perform normal commands. Pub/sub is a live signal,
  not durable storage; reconnect/session reads recover the persisted snapshot.
- POST /api/rooms/:roomId/start: membership and host A required (FORBIDDEN for B); phase must
  be planning (WRONG_PHASE), plan required (PLAN_NOT_READY), both presence keys required
  (PLAYER_NOT_CONNECTED). start.lua rechecks discovered seat IDs, room lifetime/closure and
  every precondition, then atomically sets phase=debate, startsAt=Redis TIME+3000 and version++.
  Repeat Start is WRONG_PHASE. Stage 4 initializes the first clocks/announcement in this step.
- Tests: server/tests/planner.test.ts uses unique test queues, real Redis 6380, real workers,
  dedicated subscribers and random-port Socket.IO servers; event waiters/timeouts, no sleeps.
  AI results are fake or demo. Shared plan tests enforce the public contract.
- Stage 5A moved lawyer presentation metadata to shared/config/catalog.ts. Ported AI
  policy uses resolveLawyer(null, theme, slot) for theme seat defaults and treats its combined
  personality/dialogue summary as a style hint only. Selected-lawyer prompting is intentionally
  deferred to Stage 6. Stage 5B persists cosmetic choices below.

## Choices (Stage 5B)
- Optional room-hash fields: a.characterId, a.lawyerId, b.characterId, b.lawyerId. Unset/empty
  means theme/seat default; mapper uses resolveCharacter/resolveLawyer and always returns
  resolved catalog IDs per public player, including left seats. No new Redis keys/TTLs.
- POST /api/rooms/:roomId/choices follows existing URL stale-room guards. Strict shared
  SetChoicesRequest requires at least one valid catalog ID; invalid IDs -> INVALID_CHOICE 400,
  empty/extra fields -> INVALID_REQUEST. No caller-supplied seat/player field.
- choices.lua checks pointer/room/Redis TIME expiry/membership/left/ended, then catalog IDs
  supplied from trusted shared config. Only the caller's supplied fields are written. Waiting,
  positions, planning and debate allow updates in every theme; duplicate cast choices allowed.
  Active remaining occupants of closed rooms may still change cosmetics. Ended -> WRONG_PHASE.
- Changed values bump version once and emit roomChanged; identical saved values are no-ops.
  An implicit default saved for the first time becomes explicit and bumps version. Ready,
  positions, messages, clocks and deadlines are not changed by this script. Snapshot reads
  still perform normal elapsed-time catch-up. Stage 6 will wire chosen lawyers into prompts.

## Turns and clocks (Stage 4)
- New hash fields: ordinal (1-based current subtopic), activeSlot (A/B), a.remainingMs,
  b.remainingMs, deadline (epoch milliseconds), messageSeq, a.arguments, b.arguments.
  Ended phase retains the final ordinal/counts, zeroes both clocks, removes activeSlot/deadline.
  The public mapper reports active remaining time at serverNow, capped at its allocation during
  countdown. Messages map stored millisecond at to ISO UTC. No player IDs/request keys exposed.
- start.lua opens ordinal 1 with plan allocations/opener, announcement at startsAt and deadline
  startsAt+allocation. Version increments once for Start as before.
- clock-common.lua is a shared Lua prelude loaded into start/read/submit/catchup by loadLua.
  It keeps all transition logic identical inside atomic scripts, without a second Redis call.
  Catch-up loops expired turns, anchoring each successor at the OLD deadline, until current or
  ended. Every transition bumps version; both zero opens the next subtopic, with
  B opening even ordinals. Presence is irrelevant. Closed/expired rooms do not advance.
- read.lua catches up after membership/expiry validation, then reads state/messages/presence
  and Redis time in the same script. Existing pointer/seat-key discovery is unchanged; catch-up
  adds no round trip. RoomService emits roomChanged if a read advances state.
- submit.lua catches up before ordered replay/phase/ordinal/active/deadline/cap checks.
  Request hashes include ordinal and exact raw text and are scoped to the author's seat.
  Replay works across turn/subtopic/end boundaries. Text is contract-validated, never trimmed.
  Success charges only the sender and immediately passes to the next seat with time. 12 is
  per player/subtopic; a capped rejection does not mutate its clock. Counts reset on new subtopic.
  Catch-up changes still emit when the subsequent submit is rejected.
- The deadlines sorted set is updated inside the same Lua scripts as room state. The final
  KEYS entry in start/read/submit/catchup is the set; leave also receives it explicitly.
  clock_turn ZADDs the deadline; ended/closed/leave ZREM it. catchup.lua removes missing and
  expired rooms, preserving retained history. No clock jobs, scheduling callbacks or turnSeq
  IDs remain; BullMQ continues handling plan jobs unchanged.
- due.lua uses Redis TIME and ZRANGEBYSCORE LIMIT to select up to 100 due room IDs without
  removing them. clock-worker.ts now owns a poller, despite the retained filename. Each tick
  reconciles the batch sequentially and publishes changed rooms on room-events. Reconciliation
  updates/removes the set atomically. Two pollers are safe: catch-up is atomic and idempotent;
  at worst a duplicate publish is harmless. Selection never claims/removes work prematurely.
- worker/index.ts starts a tick immediately, then waits DEADLINE_POLL_MS after each run completes.
  Runs never overlap; failures are logged and retried on later ticks, and a room failure does
  not abort the rest of the batch. A dedicated fail-fast Redis client prevents offline queues
  from hanging shutdown. Stop cancels the pending timer and awaits the current run before
  closing Redis. Node timers only wake the loop; Redis TIME alone decides what is due.
- Reads still catch up atomically and require no queue operation. Worker downtime can delay
  pushes, not extend clocks; the due members persist for a restarted worker. Pub/sub remains
  ephemeral, so a publish failure can defer delivery until another event/read.
- Tests inject RoomRepoOptions.now for deterministic Lua transitions and deadlinesKey for
  isolated sorted sets. Production has no env/HTTP time or key override. The idle socket
  integration uses real Redis TIME and a short stored deadline, then awaits a poller push
  with no player action. A Node Date.now skew test proves due selection ignores that clock.
  Fake-timer loop tests prove non-overlap, error recovery and awaited shutdown.
- All 4.1-4.14 proofs/AI deferrals: docs/rules-coverage.md; new tests in clocks.test.ts.
  TURN_EXPIRED is defensive: normal catch-up already transfers an expired turn. Its isolated
  test disables catch-up in a test-only Lua chunk to prove the guard without a production hook.

## Endpoints
See `docs/api.md`; the Zod schemas in `shared/contract/` are authoritative.
