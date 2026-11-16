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
- `server/api/refresh-store.ts`: all refresh-token Redis access.
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
| `room:<roomId>` | room hash (planned) | expiry + 24 h | 1C |
| `code:<CODE>` | roomId (planned) | expiry + 24 h | 1C |
| `player:<playerId>` | current roomId (planned) | — | 1C |
| `presence:<playerId>` | connected marker (planned) | 35 s | 1D |
Update this table whenever a key is added or changed.

## Endpoints
See `docs/api.md`; the Zod schemas in `shared/contract/` are authoritative.
