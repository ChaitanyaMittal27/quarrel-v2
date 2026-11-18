# Backend

## Config (`server/common/config.ts`)
Validated with Zod at startup; a missing/invalid variable stops the server naming it (never its
value). Env comes from `.env.local` (`--env-file`) in dev and `env_file` in compose.
`API_PORT` (4000), `REDIS_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `JUDGE_AI_MODE`
(`demo`|`auto`), `SESSION_SECRET` (>= 32 chars), `SESSION_SECRET_PREVIOUS` (optional),
`COOKIE_SECURE` (default false). Gemini keys are read by the AI code directly for now.

## Redis clients (`server/common/redis.ts`)
- `createRedis`: the API's client. **Fails fast** (no offline queue) so requests never hang.
- `createQueueRedis`: BullMQ's client. Waits through outages (`maxRetriesPerRequest: null`).
- `redisIsUp()`: health check helper that waits for the first connection attempt.

## Sessions (Slice 1B)
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
- `server/common/tokens.ts`: sign/verify, ID and token generation, hashing.
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
Update this table whenever a key is added or changed.

## Rooms (Slice 1C)
- `server/api/rooms.ts`: four room routes; invalid name -> `INVALID_NAME`, invalid code ->
  `INVALID_CODE` (code wins if both are invalid), other malformed input -> `INVALID_REQUEST`.
- `room-service.ts`: session requirements, random IDs/codes, script errors, per-app typed
  `events` emitter (`roomChanged(roomId, change?)`). A successful leave includes
  `{ leftPlayerId }` so sockets can clear all of the departing player's tabs. Registered as `app.rooms`.
- `room-repo.ts`: all room/pointer/presence Redis access; scripts in `server/rooms/lua/`.
  Scripts are read at module startup. `common/lua.ts` uses EVALSHA with EVAL on NOSCRIPT.
- Hash fields: `code`, `createdAt`, `expiresAt` (Redis milliseconds), `version`, `closed`
  (`0`/`1`); `a.player`, `a.name`, `a.ready`, `a.left`, and the same `b.*` after B joins.
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
  Create/join retries and identical readiness values are no-ops (no increment/event).
  Expired-pointer cleanup does not change historical rooms or emit an event.
- Leave with no pointer is a no-op; an existing pointer elsewhere gives `STALE_ROOM` before
  any room lookup. Ready with no pointer gives `ROOM_NOT_FOUND`. Expired current rooms give
  `ROOM_EXPIRED`. A missing current room is cleaned up (leave succeeds; ready gives 404).

## Sockets (Slice 1D)
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
  event order. Multi-server coordination and crash-expiry pushes remain later-slice work.
- Shutdown awaits io.close(), then drains socket work/removes the room event listener, then
  closes Fastify and Redis. All timers are cleared on disconnect. Test clients use the approved
  server devDependency socket.io-client; real HTTP/socket servers use a random local port.

## Endpoints
See `docs/api.md`; the Zod schemas in `shared/contract/` are authoritative.
