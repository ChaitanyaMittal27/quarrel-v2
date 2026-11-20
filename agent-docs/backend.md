# Backend

## Config (`server/common/config.ts`)
Validated with Zod at startup; a missing/invalid variable stops the server naming it (never its
value). Env comes from `.env.local` (`--env-file`) in dev and `env_file` in compose.
`API_PORT` (4000), `REDIS_URL`, `DATABASE_URL` (default postgres://quarrel:quarrel@localhost:5433/quarrel), `JUDGE_AI_MODE`
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
| `room:<roomId>:requests` | hash: seat:UUID -> SHA-256 of [kind, ordinal, raw text] | same expiresAt + 24 h as room | 4 |
| `deadlines` | sorted set: roomId -> deadline in Redis epoch ms | none; transitions/leave remove members, poller cleans expired/missing rooms | 4 |
| `archive:<debateId>` | immutable public archive input plus participant routing IDs | no TTL; deleted after SQL commit | 8 |
| `pending-archives` | hash debateId -> roomId, permits pending-results authorization after leave | field deleted after SQL commit | 8 |
| `bull:default:*` | BullMQ plan/lawyer/summary/jury/archive queue metadata, jobs, locks and retry state | BullMQ-managed; completed jobs retained 48 h | 3 |
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
  policy uses resolveLawyer(job.lawyerId, theme, slot) with theme seat defaults and treats its
  personality summary as a style hint only. Stage 6 captures the selected ID at submission. Stage 5B persists cosmetic choices below.

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
  still perform normal elapsed-time catch-up. Stage 6 uses the chosen lawyer for subsequent work.

## Turns and clocks (Stage 4)
- New hash fields: ordinal (1-based current subtopic), activeSlot (A/B), a.remainingMs,
  b.remainingMs, deadline (epoch milliseconds), messageSeq, a.arguments, b.arguments.
  Complete (and legacy ended) phase retains the final ordinal/counts, zeroes both clocks, removes activeSlot/deadline.
  The public mapper reports active remaining time at serverNow, capped at its allocation during
  countdown. Messages map stored millisecond at to ISO UTC. No player IDs/request keys exposed.
- start.lua opens ordinal 1 with plan allocations/opener, announcement at startsAt and deadline
  startsAt+allocation. Version increments once for Start as before.
- clock-common.lua is a shared Lua prelude loaded into start/read/submit/catchup by loadLua.
  It keeps all transition logic identical inside atomic scripts, without a second Redis call.
  Catch-up loops expired turns, anchoring each successor at the OLD deadline, until current work is reached. Every transition bumps version; both zero enters a summary
  (Stage 7 below), then the next subtopic opens after its four-second display interval. Presence is irrelevant. Closed/expired rooms do not advance.
- read.lua catches up after membership/expiry validation, then reads state/messages/presence
  and Redis time in the same script. Existing pointer/seat-key discovery is unchanged; catch-up
  adds no round trip. RoomService emits roomChanged if a read advances state.
- submit.lua catches up before ordered replay/phase/ordinal/active/deadline/cap checks.
  Request hashes include ordinal and exact raw text and are scoped to the author's seat.
  Replay works across turn/subtopic/end boundaries. Text is contract-validated, never trimmed.
  Success charges only the sender and pauses both clocks for Stage 6 work; completion passes or resumes the turn. 12 is
  per player/subtopic; a capped rejection does not mutate its clock. Counts reset on new subtopic.
  Catch-up changes still emit when the subsequent submit is rejected.
- The deadlines sorted set is updated inside the same Lua scripts as room state. The final
  KEYS entry in start/read/submit/catchup is the set; leave also receives it explicitly.
  clock_turn ZADDs the deadline; ended/closed/leave ZREM it. catchup.lua removes missing and
  expired rooms, preserving retained history. No clock jobs, scheduling callbacks or turnSeq
  IDs remain; BullMQ handles plans, lawyer work, summaries and jury; there are no clock jobs.
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
- Reads still catch up atomically; explicit reads may recover missing background jobs. Worker downtime can delay
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


## Lawyer work (Stage 6)
- Config: LAWYER_WORK_TIMEOUT_MS is 30000 by default (positive integer <=120000);
  LAWYER_AI_TIMEOUT_MS is 5000 (positive integer <=12000). API passes the former to RoomRepo;
  the worker passes the latter to the ported engine plus an outer Promise deadline. One retry
  stays within the same clock pause. The lawyer job disables the optional alternate model so
  there are at most two provider requests, rather than multiplying model and job retries.
- Room hash adds state (composing/lawyering/consulting/ended) and current work fields:
  workId, workKind (argument/consult), workOwner (A/B), workOrdinal, workText, workLawyerId,
  workDeadline (Redis epoch ms). Work IDs use 128 random bits, not a shared sequence that
  could expose private consultation gaps/counts through a player's own record IDs. Existing a.arguments/b.arguments and new a.consults/b.consults
  reset at each subtopic. Private JSON arrays a.drafts/b.drafts and a.consultations/b.consultations
  share the room retention/TTL; there are no new keys/channels.
- submit.lua keeps membership/expiry/closed guards and catches up before ordered replay,
  phase/countdown, ordinal, owner, composing/LAWYER_BUSY, expiry and quota checks. A successful
  submit stores raw text exactly, charges the author, removes the turn deadline, creates the
  private record/current work and ZADDs workDeadline in deadlines, all atomically. It increments
  version once, then the service enqueues lawyer:<roomId>:<workId> on the existing default queue.
  The pinned BullMQ accepts this three-segment ID. Kind is part of the seat-scoped request hash.
- lawyer-input.lua atomically reads matching, live, open work plus public messages. Worker
  context supplies last 8 public messages, only the owner's official drafts, and for consult
  only the last 4 answered owner consultations. No opponent private data enters the model.
  Selected lawyer ID is frozen at submit; changing settings affects the next work item.
- The ported prompt/policy validates length, no added numbers/URLs and the outcome tripwire;
  number/URL checking now also covers consultations. Unsafe disputes bypass AI in every mode.
  Demo and unconfigured AI use deterministic output. Raw outcome language is unchanged fallback.
  Other AI failure gets one immediate retry, then raw presentation or fixed consultation fallback.
  Meaning preservation also depends on the prompt; the validator cannot prove semantic equivalence.
- finish-lawyer.lua fences by current work ID, live/open debate and deadline. The shared
  clock_finish in clock-common.lua updates the author's private record, publishes a presentation
  or private answer, clears work fields, resumes at Redis completion time, and replaces/removes
  deadlines atomically. A late result is a no-op; an on-time result arriving after its work
  deadline first applies timeout fallback. Consultation completion resumes its author.
- The API starts the same deadline loop on a separate fail-fast Redis connection as a
  worker-death backstop and stops/awaits it before subscriber shutdown. This is necessary
  because stopping the worker also stops its own poller. Both loops safely reconcile the same
  Redis-time sorted set; no API AI calls or browser polling are added.
- clock_catchup uses the same finish for overdue work. The read path emits roomChanged;
  the 250 ms poller publishes room-events. Work fallback resumes at observation/commit time
  (no AI charge); normal composing expiry remains anchored to the OLD turn deadline.
  Ended/closed/leave remove the sorted-set member. Two pollers remain idempotent and safe.
- Explicit current-room reads/initial socket connect re-add work jobs; broadcast reads pass
  recoverPlan=false (now the shared recovery flag), and presence TTL heartbeats do not enqueue.
  The fixed ID deduplicates; completed jobs stay 48 h and failed jobs are removed for recovery.
  Lawyer BullMQ attempts=1: provider retry is internal, and read/deadline recovery covers lost jobs.
- Worker saves then publishes room-events. Queue payload has only roomId/workId, never raw text.
  Public snapshots have no work record. Per-player mapping hides activeSlot/deadline during
  work and masks opponent consulting as lawyering. Only own drafts, own consultation history
  and own consultsLeft are sent, including after ended. Public demo/fallback text can equal raw
  text by design; it is the separately unpublished private records that must remain private.
- Existing pre-Stage-6 rooms without state are treated as composing; their already-public
  raw arguments receive a fallback label. Old public history is not rewritten or made private.
- Tests: server/tests/lawyer.test.ts covers Lua, worker fakes, job recovery and a real HTTP/
  Socket.IO/BullMQ/pub-sub demo game. Existing clock tests use explicit fake completion to
  isolate clock regressions; shared and UI tests cover strict private/public schemas and display.


## Summaries and jury (Stage 7)
- Current phases/state now include summary, jury and complete. There are no new Redis keys:
  room hash, room messages and the existing deadlines sorted set retain the same TTLs.
  New hash fields: summaries (public JSON array), showUntil; workKind=summary uses random
  workId/workOrdinal/workDeadline, plus a per-claim workClaimToken. Jury uses juryStatus,
  juryRound, juryAttempts, juryClaimToken, juryError, juryRetryAvailableAt and verdict.
- Exhaustion atomically enters summary exactly once, with both clocks zero and no active
  seat/turn deadline. Its budget starts at observation time, even after a long outage.
  SUMMARY_WORK_TIMEOUT_MS defaults to 30000 (1..120000). SUMMARY_AI_TIMEOUT_MS defaults
  to 5000 (1..12000): two bounded attempts, no alternate-model multiplication. Unlike v1,
  claiming does not extend the work deadline. Late/current-claim fencing prevents overwrite.
- judge-input.lua claims and allowlists public fields in one Lua call; no drafts, consultations,
  workText or player IDs. Summary prompts get only current-ordinal public presentations.
  Jury prompts get all public messages, including saved summaries. Canonical presentation
  labels are S<ordinal>-P1L1M<public-message-sequence> (A), P2L2 (B); summaries are S<ordinal>-J.
- Summary policy reuses the ported outcome guard and 2-3 sentence / 70-word / 700-code-point
  validation. Demo summaries are deterministic public excerpts. Failure/unsafe/deadline use
  the same explicitly unverified fallback: each side's last literal public point, capped at
  22 words/230 code points (within the requested430 each). Display names replace seat
  placeholders; names' whitespace is normalized and extra name words reduce the excerpt's
  word budget to retain the70-word/700-code-point bound in both TypeScript and Lua.
  Redis and Node use matching normalization/excerpt rules, with no claims treated as fact.
- finish-summary.lua checks the current work and claim, deadline and closure. Saving appends
  one labelled public summary, increments version, and sets showUntil=Redis now+4000 in
  deadlines. Catch-up starts the next subtopic at showUntil; AI/display time costs no player
  time. After the final summary it enters pending jury and removes the sorted-set member.
- The default BullMQ queue now accepts summary:<roomId>:<ordinal> (one job, internal retry)
  and jury:<roomId>:<juryRound> (attempts=3). Custom jury backoff is exactly 5000 then 15000 ms;
  provider retryAfter is ignored. Both IDs have three segments accepted by pinned BullMQ.
  A fixed job ID means repeated recovery adds find the same job rather than duplicating it.
- Writers and deadline ticks enqueue transitions after Lua succeeds. Explicit session reads
  and initial socket connect recover missing summary/pending-jury jobs. Broadcast reads only
  enqueue if that read itself advances state; presence heartbeats never add jobs. A pending
  jury has no work deadline, so worker downtime waits rather than fabricating a verdict.
- Jury claim tokens fence older/stalled attempts; juryAttempts persists across missing-job
  recovery, so queue recreation cannot bypass the three-attempt budget. finish-jury.lua checks
  phase/round/token/status, requires all canonical summaries and attaches them server-side.
  Source ai uses the ported strict shape, both-sides and own-real-citation validation. Save is
  once only, increments version, phase/state complete; both players see the same verdict.
- Failures save only the eight fixed 6.6 codes; provider text is never stored or logged by the
  processor. quota_exhausted/missing_configuration throw BullMQ UnrecoverableError immediately;
  other failures reach retry_required after the third claim, with no fallback verdict.
- POST /api/rooms/:roomId/jury/retry: either seated player, live open jury, retry_required only.
  Lua resets attempts, increments juryRound and sets a 60-second cooldown between manual
  retries using Redis TIME. First manual retry is available immediately after initial failure.
  Pending -> JURY_NOT_READY (409); cooldown -> JURY_RETRY_COOLDOWN (429); missing canonical
  summaries -> SUMMARIES_NOT_READY (409, trusted worker finish). Wrong phase -> WRONG_PHASE.
- Explicit v2 decisions: demo completes with inconclusive/split/source demo, labelled
  "Demo verdict, not a real judgment" in the UI, with both display names in the saved text
  and per-topic entries copied from saved summaries. Unsafe
  disputes skip AI and save a fixed inconclusive/split/source safety verdict. These are explicit
  nonjudgments, not failure fallbacks. Auto mode without a key requires manual jury retry;
  it does not silently save a demo verdict. No new configuration hook or paid tests.
- Both API backstop and worker safely run deadline polling: Lua is atomic/idempotent, at worst
  a duplicate publish. Stop cancels/awaits ticks, closes the producer queue and Redis clients.
  Tests: judge.test.ts (Lua/worker/BullMQ retries), lawyer.test.ts (real full demo integration),
  shared/tests/judgment.test.ts and ui/tests/judgment.test.ts. No API AI calls or browser polling.


## Postgres, results and rematches (Stage 8)
- Supersedes the original provider setup: plain Postgres 17 and pg; common/db.ts creates one
  pool per API/worker process. Only entry points close it with pool.end(), after in-flight work.
  DATABASE_URL accepts postgres/postgresql URLs. CLI db:migrate needs only that variable,
  uses the dev default when absent, and never requires session/AI credentials.
- server/db/migrate.ts discovers numbered db/migrations/*.sql in name order. A session advisory
  lock serializes concurrent runners; schema_migrations tracks applied names. Each file and
  its record commit in one transaction; any error rolls both back. API runs it before listen.
  Docker copies the migrations; worker waits for healthy API in compose, so tables exist first.
- 001_archive.sql creates debates (public setup/names/positions/transcript/summaries/verdict,
  created_at/completed_at) and debate_participants (debate_id/player_id/slot/acknowledged_at,
  plus denormalized completed_at for the player/newest index). PK/FK, slot/theme/duration,
  date-order and JSON-kind constraints protect writes. SQL uses $1 parameters; migrations
  are the only trusted SQL-file execution. No private drafts/consultations are archived.
- Room hash: debateId (d_ + 128 random bits), debateCreatedAt, completedAt, archivedAt,
  a.rematch/b.rematch. createdAt/expiresAt remain the ROOM lifetime across rematches;
  debateCreatedAt resets per debate and completedAt is fixed at jury completion. Reads
  backfill an opaque ID for retained pre-Stage-8 rooms. If an old complete room has no
  completedAt, its frozen archive uses the first recovery-read Redis timestamp.
- finish-jury.lua freezes allowlisted public fields/messages into archive:<debateId>, with
  participant IDs only for internal routing, in the SAME atomic completion step. This outbox
  has no TTL; pending-archives maps the ID back to its room. ArchiveInput also backfills legacy
  completed rooms. No raw drafts, consultation records, workText or credentials enter an outbox.
- Completion and explicit complete-room reads enqueue archive-<debateId>. The pinned BullMQ
  rejects a two-segment colon ID; stable hyphen ID has the requested dedup semantics. Archive
  attempts=2147483647 (effectively continuous), exponential 1s -> maximum 30s backoff. Input
  stays until success, including if the live room is reset/deleted/expired. Retries cannot
  duplicate SQL rows: one transaction inserts debate and both participants ON CONFLICT DO
  NOTHING. Only after commit does archive.lua remove the outbox/pending pointer and record
  archivedAt/version on the matching CURRENT room, publishing room-events. A retry after
  commit or after room deletion is safe; the saved result never depends on Redis.
- ResultsRepo/ResultsService/routes implement GET /api/results (newest first, <=100, roomId
  filter), GET /api/results/:debateId and POST .../ack. All saved reads join participants by
  caller playerId; nonparticipant/unknown IDs both give RESULTS_NOT_FOUND (404). Participant
  pending/unfinished results give RESULTS_NOT_READY (409), using only Redis routing metadata
  for the not-ready decision. Archived data/ack are always Postgres only, even after leave/TTL.
  Ack uses COALESCE(first timestamp,now()), per participant, without affecting the other seat.
- rematch.lua checks membership/expiry/current complete debateId, both original seats and
  closure. First request records its seat flag; repeat is a no-op. Second creates one fresh
  debateId/positions phase and clears every debate field except room metadata, fixed setup,
  seats/names/left/cosmetic choices. It deletes messages/requests and removes deadlines.
  Version stays monotonic; ready flags/positions reset, no revision numbers. Frozen archive
  input makes rematch independent of SQL availability. STALE_DEBATE (409) protects old tabs;
  missing/departed original player -> ROOM_CLOSED. Identical old requests cannot create two.
- Plan, summary and jury job identities are now debate-scoped; expected debate IDs and claim
  tokens fence stale work before reading/saving. Lawyer work already uses random work IDs.
  Without this change, completed ordinal-1 jobs would deduplicate a new rematch's work.
- Tests: migrations.test.ts (fresh DB, rollback, concurrent lock), results.test.ts (real
  Redis/Postgres/BullMQ, privacy, recovery, survivor outboxes, auth/list/ack/rematch races).


## Voice / TTS (Stage 9)
- Explicit exception to the text-AI worker boundary: POST /api/rooms/:roomId/speech generates
  TTS in the API. Body is strict {speechId} only; clients never send text. requireSession and
  speech/lua/read.lua atomically check pointer/membership/left/expiry and read only public
  messages, theme, current lawyer choices and verdict. No room read/catch-up, writes, version
  increments or clock effects. Old rematch IDs fail SPEECH_NOT_FOUND. No receipts/HMAC secret.
- shared/speech.ts allowlists public presentations, announcements, summaries and verdict.text;
  never drafts/consultations/workText. Each snapshot adds speech: SpeechItem[] with stable
  <debateId>:<public-message-id> (or :verdict), exact text/kind/slot, voice profile and
  speechBlocked. The ported narrow threat/abuse regex blocks both engines. Player characters
  have no voice. Replaying uses the seat's current chosen lawyer; announcements/summary/
  verdict use the theme judge. The snapshot and route use the same pure selector.
- Catalog voices preserve v1's origin-seat choices: Puck/pitch1.08 for Tavi/Aster/Marlow/Emery,
  Charon/pitch0.9 for Fern/Vesper/Arden/Sage; all judges Kore/pitch0.95. Origin-theme browser
  rates: courtroom1, jungle1.08, superhero1.02, detective0.9. All 30 featured Gemini voice
  names are a strict shared enum, with browser pitch0..2/rate0.1..10 validation.
- Config: GEMINI_TTS_API_KEY only (never the text key), GEMINI_TTS_MODEL default
  gemini-3.8-flash-tts, pattern gemini-*tts*; TTS_TIMEOUT_MS 1000..30000/default20000;
  TTS_CACHE_MAX_BYTES 1..8388608/default2097152 raw audio bytes. Only .env.example changed.
  Demo mode or missing TTS key returns SPEECH_UNAVAILABLE/fallbackAllowed true, even if
  real audio was previously cached. All env parsing lives in common/config.ts.
- Provider reuses bounded JSON/base64/PCM/WAV validation from the v1 port, with the current
  Gemini Interactions REST request: exact transcript, separate speech_metadata, explicit
  prebuilt voice and WAV response. Accept validated mono16 WAV or wrap PCM with RIFF/header.
  Max decoded audio 8MiB, response12MiB; an outer service timeout bounds even an uncooperative
  fake. No provider response text is exposed or logged; only fixed speech codes.
- Redis keys (all keys are passed to Lua):
  - tts:audio:<sha256([voice,text])>: base64 WAV, 15-minute TTL. Cache raw audio <= configured
    cap (default2MiB; base64 storage is ~4/3 that size). Larger audio is served but not cached;
    no manual eviction. Authentication and blocked checks precede every cache hit.
  - tts:rate:<playerId>: generation count, 60s TTL from first increment, max8. Failed provider
    attempts consume a generation; hits and duplicate waiters do not.
  - tts:lock:<hash>: random ownership token, SET NX PX for timeout+3000ms. Same-key waiters
    poll cache every200ms while the lock exists, for up to TTS_TIMEOUT_MS+1000ms.
    A completed cache entry returns immediately; a vanished lock without audio or the time
    limit returns SPEECH_BUSY/browser-eligible fallback. A second cache read after observing
    unlock handles a release racing the first read. Wait/clock injection keeps tests fast.
  - tts:inflight: sorted-set leased counter, <=4 token members scored by Redis-time expiry;
    expired leases are pruned atomically. Key TTL extends past the latest lease. Token-based
    release cannot decrement another owner's slot or remove/cache under a replaced lock.
  This replaces process maps and the unsafe plain-counter reset race. Crashes self-release
  through lease/lock TTLs. Cache+lock+limit reservation and release are atomic Lua scripts.
- SpeechErrorResponse is strict {error:{code,message},fallbackAllowed}. SPEECH_BLOCKED422,
  SPEECH_NOT_FOUND404 and SPEECH_INVALID_TEXT400 forbid fallback; auth/membership/validation
  errors also forbid it. SPEECH_UNAVAILABLE503, SPEECH_RATE_LIMITED429, SPEECH_BUSY503,
  SPEECH_TIMEOUT504 and SPEECH_PROVIDER_ERROR502 allow it after authorization. Unknown Redis/
  internal failures fail closed. Audio responses use audio/wav and Cache-Control:no-store.
- Tests: server/tests/speech.test.ts (Redis limits, cross-service dedup, auth/privacy/no-state-
  change, errors/timeouts); provider tests fake all fetches and cover current REST audio blocks.
