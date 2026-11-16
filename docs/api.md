# Quarrel v2 API

The Zod schemas in [`shared/contract/`](../shared/contract/) are the source of truth. This file is
a readable summary of them; if the two disagree, the schemas win. Each slice adds its own section.
(`docs/contract.md` describes v1's API and is a reference only.)

All bodies are JSON. Every error has the same shape (see [Errors](#errors)).

---

## Slice 1: rooms and presence

### Session

The server identifies a player with two HttpOnly cookies. They are not part of the JSON
contract, and scripts in the page can't read them.

| Cookie | Holds | Path | Cookie lifetime |
|---|---|---|---|
| `quarrel_access` | A signed token naming the player, valid for **15 minutes** | `/` | 30 days |
| `quarrel_refresh` | A random token used once to get a new pair; it lasts **30 days** from its issue | `/api/session` | 30 days |

Both are `HttpOnly`, `SameSite=Lax`, and `Secure` when the server runs with `COOKIE_SECURE=true`
(HTTPS). The access cookie outlives its 15-minute token on purpose: the browser keeps sending
the expired token, so the server can answer `SESSION_EXPIRED` instead of treating the player as
new. The refresh cookie is only sent to `/api/session/*`.

- **Created by** `POST /api/rooms` and `POST /api/rooms/join` (slice 1C) when there is no session.
- **Renewed by** `POST /api/session/refresh`. Each refresh replaces both cookies, so 30 days
  without any refresh ends the session.
- **Reuse is treated as theft, after a 10-second grace window.** A refresh token can be used
  once. If the same token arrives again **within 10 s** of its first use, the server assumes two
  tabs refreshed at the same moment: it answers 204 with a new access cookie only, and leaves the
  refresh cookie alone (the first request already replaced it; cookies are shared between tabs).
  **After 10 s**, a used token signs out every token descended from the same sign-in (its
  "family"), including the newest one. A signed-out family is refused even within the window.

**Client rule.** On `SESSION_EXPIRED` from any endpoint, call `POST /api/session/refresh` once,
then retry the original request. If the refresh answers `UNAUTHENTICATED`, treat the player as
having no session (back to the start screen). Within one page, share a single in-flight refresh
between all callers (`fetchWithSession` in `ui/src/lib/api.ts` does this).

| Situation | `GET /api/session` | Endpoints that need a session |
|---|---|---|
| No cookie, or a forged/broken access token (it is cleared) | 200 `{ "room": null }` | 401 `UNAUTHENTICATED` |
| Access token expired | 401 `SESSION_EXPIRED` | 401 `SESSION_EXPIRED` |
| Valid | 200 `RoomResponse` | normal |

### Endpoints

| Method | Path | Body | Response | Notes |
|---|---|---|---|---|
| GET | `/api/session` | none | `RoomResponse` | `{ "room": null }` when not seated or no session. Never creates a session |
| POST | `/api/session/refresh` | none | 204, no body | Needs the refresh cookie. Sets new cookies (only a new access cookie if it lost a race within 10 s). Otherwise 401 `UNAUTHENTICATED` and both cookies cleared |
| POST | `/api/session/logout` | none | 204, no body | Revokes the refresh token's family and clears both cookies. Always 204 |
| POST | `/api/rooms` | `CreateRoomRequest` `{ name }` | `RoomResponse` | Caller becomes slot A. Already seated: returns the existing room (rule 1.4) |
| POST | `/api/rooms/join` | `JoinRoomRequest` `{ code, name }` | `RoomResponse` | Caller becomes slot B |
| POST | `/api/rooms/:roomId/leave` | none | `LeaveRoomResponse` `{ "room": null }` | A repeat is a no-op |
| PUT | `/api/rooms/:roomId/ready` | `SetReadyRequest` `{ ready }` | `RoomResponse` | `ready` must be `true` or `false` |

There is no heartbeat endpoint: presence comes from the Socket.IO connection. Requests with no
body must not send `Content-Type: application/json` (an empty JSON body is rejected as
`INVALID_REQUEST`).

**Stale-tab guard.** The `:roomId` in the URL must be the caller's current room; otherwise the
answer is `STALE_ROOM`. It is a check, never a key: it can't give access to a room you're not in.

**Input rules.**
- `name`: trimmed; 1–32 characters, counted as Unicode code points (an emoji is 1); no control
  characters (checked before trimming, so a trailing newline is rejected, not trimmed).
- `code`: trimmed and uppercased; exactly 6 symbols from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`
  (no I, O, 0 or 1).
- `roomId`: `r_` plus 16–32 characters of `A–Z a–z 0–9 _ -`. Clients treat it as opaque.

### Errors

```json
{ "error": { "code": "ROOM_FULL", "message": "This room is full." } }
```

`code` is the stable part; `message` is for people and may change.

| Code | Status | When |
|---|---|---|
| `INVALID_REQUEST` | 400 | The body or URL params fail validation (generic) |
| `INVALID_NAME` | 400 | The display name breaks the name rules (rule 1.10) |
| `INVALID_CODE` | 400 | The room code is malformed (rule 1.8) |
| `UNAUTHENTICATED` | 401 | No valid session where one is required, or a refresh token that is unknown, used twice or revoked (rule 1.1) |
| `SESSION_EXPIRED` | 401 | The access token is genuine but older than 15 minutes: refresh, then retry |
| `NOT_FOUND` | 404 | No such endpoint |
| `ROOM_NOT_FOUND` | 404 | No such room, or you're not in it. Outsiders learn nothing (rule 1.17) |
| `ROOM_EXPIRED` | 410 | The room is past its 24 h expiry (rule 1.3) |
| `STALE_ROOM` | 409 | The `:roomId` isn't your current room, e.g. an old tab (rule 1.16) |
| `ALREADY_IN_ROOM` | 409 | Joining a room while seated in a different one (rule 1.8) |
| `ROOM_CLOSED` | 409 | A seat in the room was vacated, so nobody new can join (rule 1.15) |
| `ROOM_FULL` | 409 | Both seats are taken, including losing a race for the last one (rules 1.7, 1.9) |
| `INTERNAL` | 500 | Unexpected server error |
| `SERVICE_UNAVAILABLE` | 503 | A backing service is down (today: Redis can't be reached) |

### Room snapshot

Every room response and every `room:snapshot` event carries the caller's own view of their room:

```json
{
  "roomId": "r_8fK2mQ9xLp4TzW7a",
  "code": "K7M2QX",
  "version": 3,
  "createdAt": "2026-11-12T18:00:00.000Z",
  "expiresAt": "2026-11-13T18:00:00.000Z",
  "serverNow": "2026-11-12T18:04:10.512Z",
  "closed": false,
  "bothReady": false,
  "you": { "slot": "B" },
  "players": [
    { "slot": "A", "name": "Ann", "ready": true, "connected": true, "left": false },
    { "slot": "B", "name": "Bo", "ready": false, "connected": true, "left": false }
  ]
}
```

- `roomId`: opaque room ID; used in `/api/rooms/:roomId/...` URLs.
- `code`: the 6-symbol code to share with the other player.
- `version`: goes up with every change; a client ignores a snapshot older than one it has.
- `createdAt`: when the room was made (UTC).
- `expiresAt`: exactly 24 h after `createdAt`; activity never extends it.
- `serverNow`: the server's clock when the snapshot was built, so clients can correct for clock skew.
- `closed`: a seat was vacated; nobody new can join.
- `bothReady`: two seats, both ready and both connected (rule 1.12).
- `you.slot`: which seat is yours.
- `players`: 1 or 2 seats, A first, then B.
  - `slot`: `A` (creator) or `B` (joiner).
  - `name`: display name. A seat keeps its name after its player leaves.
  - `ready`: the player's own readiness.
  - `connected`: the player currently has a live Socket.IO connection.
  - `left`: the player left; the seat stays as a record and can't be refilled.

**Never in a snapshot:** any player or session ID, and anything about a room you aren't in. The
snapshot schemas are strict (an unknown key fails parsing), and the server parses every snapshot
before sending it, so an extra field such as an internal ID can't slip out.

### Socket.IO

| Direction | Event | Payload |
|---|---|---|
| server → client | `room:snapshot` | The receiving player's own `RoomSnapshot`, sent after every change to their room |
| client → server | none in slice 1 | |

The connection itself is the presence signal: connected while the socket is open.
