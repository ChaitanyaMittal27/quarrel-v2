# Quarrel v2 API

The Zod schemas in [`shared/contract/`](../shared/contract/) are the source of truth. This file is
a readable summary of them; if the two disagree, the schemas win. Each stage adds its own section.
(`agent-docs/reference/v1/contract.md` describes v1's API and is a reference only.)

All bodies are JSON. Every error has the same shape (see [Errors](#errors)).

## Stage 5B: character and lawyer choices

`POST /api/rooms/:roomId/choices` takes strict `{ characterId?, lawyerId? }`, at least one
field. IDs are semantic IDs from shared/config/catalog.ts, not asset paths. Unknown, empty,
null or wrong-type IDs return INVALID_CHOICE (400); empty/extra-field bodies return
INVALID_REQUEST (400). As with other room actions, the URL roomId guards stale tabs.

The caller can change only their own active seat, using any global character/lawyer in any
theme. Duplicates are allowed. Waiting, positions, planning, debate, summary and jury permit choices;
complete (or legacy ended) returns WRONG_PHASE (409). A remaining active seat may change cosmetics in a closed
room until complete. Auth/membership/stale/expiry errors still apply. Lua re-checks membership,
phase and catalog IDs atomically. Omitted fields stay unchanged; an identical saved value is
a no-op. Changed fields bump version once and emit roomChanged for per-player snapshot pushes.
Readiness and clocks are untouched by the choice script; normal snapshot reads still reconcile
elapsed deadlines. A first explicit save of an implicit default records it as a change.

Each snapshot player now always has `characterId` and `lawyerId`, resolved from stored values
or the theme/seat defaults for absent/empty/unknown legacy values. These catalog IDs are public,
including retained left seats. No room/session/player identity leaks. Stage 6 uses the chosen lawyer's
personality as a style hint, captured when work is submitted. There is no theme-edit endpoint.

## Stage 4: turns, clocks and arguments

Start also opens subtopic 1 and posts `Subtopic 1: <question>` at startsAt. Both chess clocks
start at secondsPerPlayer*1000; only the opener's clock runs, beginning after the countdown.
Expired turns use the old deadline as their boundary, so delayed workers/reads never extend
time. Both clocks reaching zero enters summary, then opens the next subtopic after its
four-second summary display, or jury after the last summary. Jury completion sets complete.
Disconnecting does not pause clocks. Stages 6 and 7 add paused AI work below.

`POST /api/rooms/:roomId/messages` takes strict `{ kind: "argument" | "consult", text, requestKey, ordinal }` and returns RoomResponse.
Ordinal is the subtopic the client currently sees (1-5). requestKey must be UUIDv4. Text is
1-600 Unicode code points, not blank; only tab/LF controls are allowed. Spaces and newlines
are preserved, including at the edges. Malformed input returns INVALID_REQUEST (400).

After session/membership/expiry/closure checks, Lua catches up clocks, then checks in order:
same-key replay (same kind/ordinal/text returns current room; different content REQUEST_CONFLICT),
DEBATE_COMPLETE or DEBATE_NOT_STARTED (includes countdown), STALE_TURN, NOT_YOUR_TURN,
LAWYER_BUSY, TURN_EXPIRED (defensive after catch-up), then LIMIT_REACHED. Limits are 12 arguments
and 2 consultations **per player per subtopic**. A rejected cap does not change/extend the deadline. Requests are scoped to
the player's seat within the room; UUIDs/hashes never appear in a snapshot. Retry a network
failure using the same key, ordinal and exact text; generate a fresh key for the next message.

On success the sender keeps max(0, deadline-now), both clocks pause, and the turn deadline
is removed. A fenced background work record and its 30 s deadline are saved atomically.
On argument completion, a labelled presentation is appended and the opponent starts if they
have time, otherwise the author resumes. On consultation completion, a private answer is saved
and the same author resumes. Completion time starts the next clock; AI time is never charged.
Replays add no record, charge or quota use. Version increments on submit and completion.

`debate` remains null before Start; it stays present through summary/jury/complete (and legacy ended). Otherwise it is strict:
- `ordinal`, `clocks: { A, B }` (milliseconds), `yourArgumentsThisSubtopic` (own count).
- `state`: composing, lawyering, consulting, summary, jury, complete (or legacy ended). Opponents always see lawyering for a
  private consultation; there is no public work ID, owner, consultation count or question.
- `activeSlot` and `deadline`: seat/ISO during composing only; null during work and ended.
  Paused clocks are fixed stored allowances; composing clocks use serverNow plus elapsed time.
- `consultsLeft`: 0-2, the caller's quota for the current subtopic only.
- `drafts`: caller-only `{ id, ordinal, text, at: ISO, status: pending|complete }[]` across
  all subtopics, including ended. Raw text is never attached to public messages.
- `consultations`: caller-only `{ id, ordinal, question, at: ISO, answer: string|null,
  source: ai|demo|fallback|null }[]`, retained after ended. A null answer means pending.

`messages` is the oldest-first PUBLIC transcript: `{ id, ordinal, kind: announcement|argument|judge_summary, label?: string,
slot: A|B|null, text, at: ISO, source?: ai|demo|fallback }`. Arguments have a source label;
announcements need none. Private consultations never enter this list. A demo/fallback
presentation may intentionally contain the original words; privacy protects the separate
unpublished draft/consultation records, not text the author deliberately presented publicly.

The worker and an API backstop poll the Redis deadline sorted set and push transitions through room-events,
including with nobody connected. Due selection and reconciliation both use Redis TIME;
Node/Redis clock drift cannot consume an early timer job. Polling waits 250 ms by default
between completed runs. Multiple pollers are safe through atomic catch-up. Every public room
read still catches up atomically with its snapshot. No advance endpoint or client-provided
clock exists. Worker downtime can delay live delivery; it cannot extend a composing clock. Lawyer work
has its own bounded pause/deadline as described below.

## Stage 2: setup (v2 flow)

Create now requires `{ name, topic, theme?, durationSec? }`. Topic is trimmed, 1-240 Unicode
code points, no control characters. Theme is one of shared/config's four IDs (default
courtroom); durationSec is 120/240/360/600 (default 240). Setup is fixed at creation; a create
retry returns the existing setup unchanged. No setup edit, confirm/accept or revision API exists.

Snapshot `setup` is a strict object:
`{ phase: "waiting" | "positions" | "planning" | "debate" | "summary" | "jury" | "complete" | "ended", theme, topic, durationSec, positions: { A: string | null, B: string | null } }`.
Joining B atomically moves waiting to positions. Both players see both saved positions.

`PUT /api/rooms/:roomId/position` with `{ text }` saves only the caller's position, only during
positions. Text is trimmed, 1-600 code points; only tab and newline control characters are
allowed (carriage return is rejected). Saving resets only the author's ready flag. Identical
text with ready already false is a no-op; a save that clears ready is a change.

Ready is allowed only during positions. ready:true requires the caller's saved position;
ready:false does not. When both non-left players' ready flags become true, the same Lua step
locks positions and moves to planning. This does not require socket presence; bothReady remains
the existing ready-and-connected indicator. Planning rejects all position and ready changes.
Leaving in any phase retains/closes the room as before.

New errors: INVALID_TOPIC (400), INVALID_POSITION (400), WRONG_PHASE (409), POSITION_REQUIRED
(409). Theme/duration errors remain INVALID_REQUEST. Membership and expiry checks precede
phase/position checks. A successful change increments version once and emits roomChanged once.
Stage 3 adds the plan, host Start debate and a 3-2-1 UI countdown (below).

## Stage 3: planner and Start

Entering planning queues a background plan job. Both players receive the finished plan through
the existing room:snapshot event; there is no regenerate endpoint. Explicit session reads and
initial socket connections recover a missing job while planning without a plan. Snapshots
gain required nullable root fields `plan` and `startsAt` (both null before generation/Start).

`plan` is strict: `{ source: "ai" | "demo" | "fallback", text, subtopics }`. There are 2-5
subtopics, each `{ ordinal, question, secondsPerPlayer, openerSlot: "A" | "B" }`. Ordinals
start at 1, questions are distinct, allocations are integer 30-600 seconds and sum to the
room's durationSec. Openers alternate A, B, A, B, A. Demo and final-failure fallback have two
subtopics. Text is 1-900 code points; questions 1-200, trimmed, with control/outcome-text guards.
AI output is validated before persistence and snapshot delivery; it cannot choose openers.

`POST /api/rooms/:roomId/start` has no body and returns RoomResponse. Only host A can call it.
The room must be open, unexpired, in planning, have a plan, and both players must have live
presence keys. All checks and the write are atomic. Success changes setup.phase to debate,
increments version and sets startsAt to Redis TIME + 3000 ms, returned as ISO UTC. Both
players receive the same deadline through their own snapshot pushes. Clients use startsAt
with serverNow and elapsed time to show 3-2-1, then Debate started; reconnect never restarts it.
The debate phase begins when Start succeeds; startsAt marks the end of its UI countdown.
Stage 4 adds turn clocks above. Position/ready changes remain frozen. Leave still closes the room.

Start errors: FORBIDDEN (403, guest), WRONG_PHASE (409, including repeat Start), PLAN_NOT_READY
(409), PLAYER_NOT_CONNECTED (409). Existing auth/membership/expiry/ROOM_CLOSED errors apply.

---

## Stage 1: rooms and presence

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

- **Created by** `POST /api/rooms` and `POST /api/rooms/join` when there is no session.
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
| GET | `/api/session` | none | `RoomResponse` | Current snapshot; null when not seated/no session. Expired current room: 410 `ROOM_EXPIRED`. Missing room key: clear pointer and return null. Never creates a session |
| POST | `/api/session/refresh` | none | 204, no body | Needs the refresh cookie. Sets new cookies (only a new access cookie if it lost a race within 10 s). Otherwise 401 `UNAUTHENTICATED` and both cookies cleared |
| POST | `/api/session/logout` | none | 204, no body | Revokes the refresh token's family and clears both cookies. Always 204 |
| POST | `/api/rooms` | `CreateRoomRequest` `{ name, theme?, topic, durationSec? }` | `RoomResponse` | Caller becomes slot A. Already seated: returns the existing room (rule 1.4) |
| POST | `/api/rooms/join` | `JoinRoomRequest` `{ code, name }` | `RoomResponse` | Caller becomes slot B |
| POST | `/api/rooms/:roomId/leave` | none | `LeaveRoomResponse` `{ "room": null }` | A repeat is a no-op |
| POST | `/api/rooms/:roomId/start` | none | `RoomResponse` | Host only; planning, saved plan and both connected; startsAt is 3 s ahead |
| POST | `/api/rooms/:roomId/choices` | `SetChoicesRequest` `{ characterId?, lawyerId? }` | `RoomResponse` | Strict, own-seat, at least one catalog ID; allowed until complete (legacy ended also rejected) |
| POST | `/api/rooms/:roomId/messages` | `SubmitMessageRequest` `{ kind, text, requestKey, ordinal }` | `RoomResponse` | Strict body; argument/consult work, UUIDv4 replay protection, own-turn quotas 12/2 |
| PUT | `/api/rooms/:roomId/ready` | `SetReadyRequest` `{ ready }` | `RoomResponse` | positions phase only; true requires own saved position; both ready flags lock planning atomically |
| PUT | `/api/rooms/:roomId/position` | `SetPositionRequest` `{ text }` | `RoomResponse` | Own seat in positions phase; resets own ready only |

There is no heartbeat endpoint: presence comes from the Socket.IO connection. Requests with no
body must not send `Content-Type: application/json` (an empty JSON body is rejected as
`INVALID_REQUEST`).

**Stale-tab guard.** With a current room, a different `:roomId` gives `STALE_ROOM` before
looking up that room. Without a current room, ready gives `ROOM_NOT_FOUND`; leave is a no-op
success. The URL never grants access or reveals another room's existence.

**Room operation errors and precedence (implemented in 1C).**
- Create: invalid name -> `INVALID_NAME`, invalid topic -> `INVALID_TOPIC`, invalid theme/duration
  -> `INVALID_REQUEST`; expired access token -> `SESSION_EXPIRED`.
  Already seated in a live room returns that room unchanged, preserving the name. An expired
  or missing prior room releases the pointer before a new room is made. Five code collisions
  or exhausted pointer retries -> `SERVICE_UNAVAILABLE`.
- Join: malformed code -> `INVALID_CODE`, invalid name -> `INVALID_NAME` (code wins if both
  are invalid). After session resolution: `ROOM_NOT_FOUND` -> `ROOM_EXPIRED` -> already my
  room (unchanged, original name) -> release expired/missing prior seat -> `ALREADY_IN_ROOM`
  -> `ROOM_CLOSED` -> `ROOM_FULL` -> join as B. Session errors apply as for create.
- Leave: session required; no current room -> null success; another current room ->
  `STALE_ROOM`; expired current room -> `ROOM_EXPIRED`. Success retains the old seat/name,
  clears readiness and membership, closes the room and returns null. A missing current room
  clears the pointer and succeeds. Repeats are no-ops; delayed leave cannot detach a new room.
- Ready: session required; no current room -> `ROOM_NOT_FOUND`; another current room ->
  `STALE_ROOM`; missing current room -> pointer cleanup and `ROOM_NOT_FOUND`; expired current
  room -> `ROOM_EXPIRED`. Invalid ready/body/params -> `INVALID_REQUEST`. Setup phase and
  own-position preconditions are described in Stage 2 above.
- Malformed JSON/body shape/URL params -> `INVALID_REQUEST`. Redis outages ->
  `SERVICE_UNAVAILABLE`; unexpected failures -> `INTERNAL`.

Version starts at 1 and increases on actual changes. Repeated create/join and identical ready
values during positions do not increment it or emit `roomChanged`. Phase checks still reject
ready retries during planning. Expired seat release only removes membership;
the historical room record is retained unchanged. Socket presence changes push a fresh view
without increasing the room version; equal-version snapshots must be accepted.

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
| `INVALID_TOPIC` | 400 | Invalid/missing topic (S2.1) |
| `INVALID_POSITION` | 400 | Invalid/missing position text (S2.3) |
| `INVALID_CHOICE` | 400 | Character/lawyer ID is not in its global catalog |
| `WRONG_PHASE` | 409 | Position/ready outside positions, or Start outside planning (including repeat Start) |
| `POSITION_REQUIRED` | 409 | ready:true without own position (S2.6) |
| `FORBIDDEN` | 403 | Only host A can Start |
| `PLAN_NOT_READY` | 409 | Start before the plan exists |
| `PLAYER_NOT_CONNECTED` | 409 | Start without both live presence keys |
| `LAWYER_BUSY` | 409 | The room is not composing; lawyer work is in progress |
| `REQUEST_CONFLICT` | 409 | Same request key used with different kind, ordinal or text |
| `DEBATE_COMPLETE` | 409 | Submit after the final subtopic |
| `DEBATE_NOT_STARTED` | 409 | Submit before debate or during countdown |
| `STALE_TURN` | 409 | Client ordinal differs from current subtopic |
| `NOT_YOUR_TURN` | 409 | Caller is not the active seat |
| `TURN_EXPIRED` | 409 | Defensive deadline check after reconciliation |
| `LIMIT_REACHED` | 429 | Caller reached 12 arguments or 2 consultations this subtopic |
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

The `room` field of each `RoomResponse` (HTTP or socket) contains the caller's own view,
or null when they have no current room. The non-null `RoomSnapshot` looks like this:

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
  "plan": null,
  "startsAt": null,
  "debate": null,
  "messages": [],
  "setup": {
    "phase": "positions",
    "theme": "courtroom",
    "topic": "Should lectures be mandatory?",
    "durationSec": 240,
    "positions": { "A": "Attendance supports participation.", "B": null }
  },
  "you": { "slot": "B" },
  "players": [
    { "slot": "A", "name": "Ann", "characterId": "courtroom-advocate-a", "lawyerId": "courtroom-emery", "ready": true, "connected": true, "left": false },
    { "slot": "B", "name": "Bo", "characterId": "courtroom-advocate-b", "lawyerId": "courtroom-sage", "ready": false, "connected": true, "left": false }
  ]
}
```

- `roomId`: opaque room ID; used in `/api/rooms/:roomId/...` URLs.
- `code`: the 6-symbol code to share with the other player.
- `version`: goes up with room mutations. For the same room, ignore lower versions; accept
  equal versions, because presence changes do not bump the version. A different room starts
  its own version sequence; `{ room: null }` clears the current room.
- `createdAt`: when the room was made (UTC).
- `expiresAt`: exactly 24 h after `createdAt`; activity never extends it.
- `serverNow`: the server's clock when the snapshot was built, so clients can correct for clock skew.
- `closed`: a seat was vacated; nobody new can join.
- `bothReady`: two seats, both ready and both connected (rule 1.12).
- `setup`: fixed theme/topic/duration plus current phase and both public positions (Stage 2).
  Phase can be planning even if bothReady is false after a disconnect; positions stay locked.
- `you.slot`: which seat is yours.
- `plan`: null until the background planner saves the public plan (shape above).
- `startsAt`: null until Start; ISO UTC countdown deadline, shared by both players.
- `debate` and `messages`: clock state and public transcript (Stage 4 above).
- `players`: 1 or 2 seats, A first, then B.
  - `slot`: `A` (creator) or `B` (joiner).
  - `name`: display name. A seat keeps its name after its player leaves.
  - `characterId`, `lawyerId`: always resolved global catalog IDs, never empty; shared with
    both players and retained after leave. They do not reveal the internal player identity.
  - `ready`: the player's own readiness.
  - `connected`: the player currently has a live Socket.IO connection.
  - `left`: the player left; the seat stays as a record and can't be refilled.

**Never in a snapshot:** any player or session ID, and anything about a room you aren't in. The
snapshot schemas are strict (an unknown key fails parsing), and the server parses every snapshot
before sending it, so an extra field such as an internal ID can't slip out.

### Socket.IO (Stage 1D)

Connect to `/socket.io` **after joining or creating a room**. The browser sends the
`quarrel_access` cookie; the handshake verifies it with the same current/previous signing keys
as HTTP. Authentication is checked only at connect, not periodically while connected.

- Missing/invalid/tampered token: `connect_error` with message `UNAUTHENTICATED`.
- Genuine expired token: `connect_error` with message `SESSION_EXPIRED`. Refresh over HTTP,
  then reconnect. No new identity is created by a socket connection.
- The handshake identifies the player only. No client room ID grants membership; the server
  finds the current room from the player's Redis pointer. A valid identity with no room can
  connect and receives `{ room: null }`, though clients should normally connect after joining.

| Direction | Event | Payload |
|---|---|---|
| server to client | `room:snapshot` | `RoomResponse`: `{ room: RoomSnapshot \| null }` |
| client to server | none in stage 1 | |

The newly connected socket receives its current response immediately. Every socket joins only
its own `player:<playerId>` channel (plus its private Socket.IO channel). Room changes push a
separately built, schema-validated response to each seated, non-left player's channel; all of
that player's tabs receive the same view, with their own `you.slot`. There is no room-wide
snapshot broadcast. Leaving also sends `{ room: null }` to all the leaver's tabs.

Presence (rule 1.11): connect sets a key with a **35-second TTL**, refreshed every **10 seconds**
while open. Closing one tab keeps the player connected if another tab remains; closing the
last removes the key. First-connect and last-disconnect transitions push updated views without
bumping the room version. For the same room, clients **ignore lower versions and accept equal
versions**. This lets presence and `bothReady` update without a game-state mutation.

If a snapshot cannot be built (for example, `ROOM_EXPIRED`) or fails its schema, that player's
push is skipped and debug-logged; other recipients continue. HTTP remains the source of error
responses. Server crashes are bounded by the presence TTL; an active push when stale keys
expire will be added with the multi-server presence sweeper.


## Stage 6: lawyer work and private consultation

The messages endpoint above is the only submit route; kind is required, no extra keys.
No browser endpoint claims/finishes AI work. Trusted BullMQ workers select the current work
owner and private context on the server. This replaces v1's session-bound worker RPCs (5.8/5.12).
There is no regeneration or consultation-to-public-submit shortcut.

Configured auto mode uses the ported prompt/policy with the selected catalog lawyer as style
only. Two provider attempts at most, 5 s each by default. No new numbers/URLs or outcome claims;
presentations keep meaning and are bounded by min(900, floor(1.5 * raw code-point length)).
Demo wraps with "My point: " only if it fits; outcome claims remain unchanged fallback text.
Unsafe disputes skip AI; presentations remain raw fallback and consultations get fixed safety
text. Other consultation failures say "Your lawyer couldn't answer this time."

Worker death cannot hold clocks forever: Redis-time read/poller catch-up saves the same
raw/fixed-unavailable fallback after LAWYER_WORK_TIMEOUT_MS (default 30000), through the shared
finish logic. The API keeps an independent deadline loop so stopping the worker cannot stop
this fallback push. Late work cannot overwrite it. Explicit session reads and initial socket connect
re-add missing work with the same stable job ID; ordinary broadcasts/heartbeats do not enqueue.


## Stage 7: summaries and jury

All room responses/pushes gain required fields (strict contract in judgment.ts):

| Field | Shape |
| --- | --- |
| summaries | PublicSummary[]: { ordinal, text, source: ai/demo/fallback, at: ISO } |
| summary | null, or { ordinal, current: PublicSummary/null, showUntil: ISO/null } during summary |
| jury | null, or { status: pending/retry_required, errorCode: fixed code/null, retryAvailableAt: ISO/null } during jury |
| verdict | null until complete; strict JuryVerdict below |

Both clocks are paused through summary and jury. Summary work is timed from when exhaustion
is observed; its 30-second deadline triggers the same public fallback on read or poller.
The fallback quotes the last public point on each side as unverified. A saved summary remains
for four seconds from save time. The next subtopic starts at showUntil, not at a late poll.
Public messages include judge_summary with label S<ordinal>-J and a source label. Presentation
labels are S<ordinal>-P1L1M<number> or P2L2M<number>, distinct from internal player IDs.

POST /api/rooms/:roomId/jury/retry has no request body and returns RoomResponse. Either seated
player can call it during jury/retry_required. Pending -> JURY_NOT_READY (409); another manual
retry within 60 seconds -> JURY_RETRY_COOLDOWN (429); non-jury -> WRONG_PHASE (409). Standard
membership/expiry/closure errors apply. The new attempt round resets attempts. First retry
is immediately available. SUMMARIES_NOT_READY (409) protects trusted worker completion when
canonical summaries are missing; it is not a browser work endpoint.

Jury errorCode is only rate_limited/quota_exhausted/provider_unavailable/timeout/invalid_response/
missing_configuration/demo_mode/unsafe_dispute, never provider text. Pending jury waits through
worker downtime, without a work deadline. Automatic retries are three attempts, waits 5s then
15s; quota/missing config fail immediately. Read recovery only re-adds pending jobs.

Verdict fields: source (ai/demo/safety), text, decision (A/B/tie/inconclusive), outcome (A/B/split),
topic, positionA, positionB, reasoning, strongestArguments {A,B}, weaknesses {A:string[],B:string[]},
perSubtopic [{ordinal,text}], compromise (string/null), subtopicSummaries (canonical PublicSummary[]).
AI decisions need valid own-side public citations; conclusive decisions need both sides' public
presentations. The server attaches topic/positions and saved summaries. No drafts or private
consultations enter summary/jury context, public summaries or verdicts. Per-player private history
remains owner-only after complete. No archive/rematch yet.

Demo verdict: inconclusive/split/source demo, clearly "Demo verdict, not a real judgment";
per-topic entries repeat canonical summaries without invented findings. Unsafe disputes skip AI
and produce a fixed inconclusive/split/source safety notice. Both decisions override v1.


## Stage 8: Postgres archives, results and rematch

GET /api/health now returns strict { ok, redis: up/down, postgres: up/down }; the database probe
is SELECT 1. No hosted database SDK/service is required.

Every RoomSnapshot adds required debateId (d_ + 22 URL-safe characters), archivedAt (ISO/null)
and rematch { A:boolean, B:boolean }. debateId identifies one debate, roomId identifies the
continuing room. Completion freezes a public archive outbox atomically, then an archive job
writes Postgres. archivedAt/version push when the matching current debate is archived; an old
debate's commit never marks its rematch archived. Snapshot version remains monotonic.

| Method | Route | Input | Strict response |
| --- | --- | --- | --- |
| GET | /api/results | optional ?roomId=r_...; no other query fields | { results: ResultItem[] }, <=100 |
| GET | /api/results/:debateId | current authenticated session | { result: ResultDetail } |
| POST | /api/results/:debateId/ack | no body | { result: ResultDetail } |
| POST | /api/rooms/:roomId/rematch | strict { debateId } | RoomResponse |

ResultItem: { debateId, roomId, theme, topic, durationSec, names:{A,B}, you:A/B, decision,
createdAt, completedAt, acknowledgedAt:ISO/null }. Results are newest completed first (stable
ID tie-break), optionally filtered by room, and visible only to original participants.
ResultDetail adds positions:{A,B}, transcript:DebateMessage[], summaries:PublicSummary[] and
verdict:JuryVerdict. No player IDs, drafts, consultation records or private work enter responses.
Saved result data and acknowledgements come from Postgres, independently of live Redis rooms.

RESULTS_NOT_FOUND (404) conceals both unknown and nonparticipant IDs, including ack. Only an
actual participant can receive RESULTS_NOT_READY (409) for an unfinished/pending archive.
No list entries appear before archive commit. Ack uses each participant's first timestamp,
kept by an atomic COALESCE update: reviewed means read, not agreement, and does not affect the
other player. Session expiration/refresh behavior is unchanged; results do not create identities.

Rematch: current complete debateId only (STALE_DEBATE,409 otherwise), both original players
still seated and room open (ROOM_CLOSED otherwise), normal auth/expiry/stale-room guards.
One request records the seat flag; repeats are no-ops; the second starts exactly one new
debateId in positions. Clears positions, ready, plan/countdown/clocks, public transcript,
request keys, private drafts/consultations, summary/jury/verdict state and archive/rematch flags;
removes deadlines. Keeps room lifetime/code, names/seats, theme/topic/duration and cosmetics.
Old results remain readable, even if SQL commit follows the rematch: the immutable public
outbox survives live-room reset/TTL. This intentionally replaces v1's topic/duration reset.


## Stage 9: voice
Each RoomSnapshot gains required speech: SpeechItem[]. Item fields are strict:
{speechId,text,kind:argument/announcement/summary/verdict,slot:A/B/null,
voice:{geminiVoice,browserVoice:{pitch,rate}},speechBlocked:boolean}. ID is stable within
one debate, <debateId>:<public-message-id> or :verdict. Voices are catalog-bound current-lawyer
or theme judge. Only saved complete PUBLIC items are selected, never drafts/consultations.

POST /api/rooms/:roomId/speech takes strict {speechId} ONLY. Text/voice supplied by a client
are rejected. Valid session + own current seated room are required; stale/missing/departed/
expired room checks precede ID lookup. SPEECH_NOT_FOUND404 or SPEECH_BLOCKED422 never fall
back to browser voice. Speech reads public Redis state directly and NEVER catches up/mutates
room state, versions or clocks, including when a composing deadline is overdue.

Success: audio/wav binary, Cache-Control:no-store. Failure: strict SpeechErrorResponse
{error:{code,message},fallbackAllowed:boolean}. Existing session/membership/validation errors
and unknown infrastructure failures set false. Speech-specific codes:

| Code | HTTP | Browser fallback |
| --- | --- | --- |
| SPEECH_NOT_FOUND | 404 | no |
| SPEECH_BLOCKED | 422 | no |
| SPEECH_INVALID_TEXT | 400 | no |
| SPEECH_UNAVAILABLE | 503 | yes |
| SPEECH_RATE_LIMITED | 429 | yes |
| SPEECH_BUSY | 503 | yes |
| SPEECH_TIMEOUT | 504 | yes |
| SPEECH_PROVIDER_ERROR | 502 | yes |

Text limit4000 Unicode code points. No TTS key or demo mode returns SPEECH_UNAVAILABLE.
Only the dedicated TTS key is used. Redis shares 15-minute voice/text audio cache, per-player
8-generation/60s limits, four global leased slots and per-item generation locks. Cache defaults
2MiB raw audio/item; oversized items are served uncached. Waiters poll every200ms while the
generation lock exists, up to TTS_TIMEOUT_MS+1000ms. Cached audio returns immediately; an
unlocked item without cached audio or an exhausted wait budget returns SPEECH_BUSY with
fallback allowed, without starting another call. Every request authorizes before cache access.

This intentionally replaces v1 HMAC speech receipts: no browser text, tokens or speech-signing
secret. Browser fallback must respect speechBlocked and explicit fallbackAllowed; unknown or
malformed responses cannot enable fallback. Audio is optional and never controls gameplay.


## Free-tier AI status and room attempt limits
`GET /api/ai/status` is public, sends Cache-Control:no-store, and returns a strict object:
```json
{"text":"exhausted","voice":"off","resetsAt":"2026-11-21T08:00:00.000Z"}
```
text: ok | fallback | exhausted; voice: ok | off; resetsAt: ISO timestamp or null.
Fallback-model use has no player notice. Demo always reports ok/ok/null. No participant or
provider information is included. Clients refresh operational status separately from snapshots.

New errors: ROOM_RATE_LIMITED (429) on create/join, JURY_QUOTA_EXHAUSTED (409) on jury retry.
ROOM_RATE_LIMITED adds optional top-level positive integer retryAfterSeconds to the normal
ErrorResponse, and the Retry-After header. Per-IP first-attempt hour windows count successful
and failed attempts (default create10/join30). Other errors retain their existing shape.
Jury quota exhaustion sets retry_required/quota_exhausted and juryRetryAvailableAt to reset;
manual retry is atomically rejected while all configured text models remain exhausted.
Daily TTS exhaustion returns existing SPEECH_UNAVAILABLE with fallbackAllowed:false, overriding
browser fallback preference. Speech works again when its model's exhaustion key expires.
