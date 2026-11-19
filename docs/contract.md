> Describes Quarrel v1 (original repo, ../quarrel-v1). **v1 reference only, not a spec for v2.**
>
> **v2 note (2026-11-12):** v2 does not keep this contract. It designs its own, stage by stage, as Zod
> schemas in `shared/contract/` (the source of truth), built around v2's design: its own session cookie,
> Socket.IO push, and server-driven deadlines and workers. Use this file for ideas about what the UI
> needs, not as something to match. What v2 must preserve is the game behaviour in `docs/rules.md`.
> The v1 art is reused while screens are rebuilt on the v2 contract in Stage 5.

# UI ↔ backend contract (v1 reference)

This file records everything the v1 UI depends on from the backend. It was written so that v2
could replace the backend without changing the UI; that is no longer the plan (see the note above).

Sources read: `src/app/api/rooms/**/route.ts`, `src/server/room-api.ts`, `src/server/speech-*.ts`,
`src/server/judge-worker.ts`, `src/lib/room-client.ts`, `src/lib/character-speech.ts`,
`src/lib/*-types.ts`, the components under `src/components/`, and `supabase/migrations/*.sql`
(the database functions behind each route). Where something could not be confirmed from code,
it is marked **UNCLEAR**.

---

## 1. How every request works

Every route file is a five-line wrapper: `roomRoute(request, "<action>")` in
[src/server/room-api.ts](../src/server/room-api.ts). The action name maps to one Postgres function
(RPC), listed in each table below.

### 1.1 Request rules (all POST routes)

| Check | Failure |
|---|---|
| `Origin` header must equal `<protocol>//<Host header>` | 403 `"This request must come from the room page."` |
| `Content-Type` must start with `application/json` | 415 `"Send room requests as JSON."` |
| Body size (bytes): `speech` 32,768 · debate `argument` 16,384 · `judge` and lawyer text routes 8,192 · `propose` 4,096 · `changes` 2,048 · everything else 1,024 | 413 `"The room request is too large."` |
| Body must be a JSON object (not an array) | 400 `"Invalid room request."` |
| Body may contain **only** the listed fields (missing fields are allowed by this check; extra fields are not) | 400 `"Unexpected room request fields. Player identity comes from your session."` |
| `x-quarrel-room-id` header, when present, must be a UUID | 400 `INVALID_ROOM` |
| `rematch`, `juryRetry` and `speech` **require** `x-quarrel-room-id` | 400 `INVALID_ROOM` |
| Text lengths count Unicode code points after trimming. Single-line fields reject all control characters; multi-line fields allow `\t \n \r` | Field-specific 400 (below) |

GET routes (`session`, `lawyer/history`) skip the Origin, Content-Type and body checks.

### 1.2 Identity

1. If the `quarrel_access` cookie is present, it is verified with Supabase Auth (`auth.getUser`).
2. If that fails and `quarrel_refresh` is present, the session is refreshed. New cookies are set
   on the response, **even when the action itself fails**.
3. If there are no cookies: `create` and `join` sign in anonymously (a new Supabase anonymous
   user). `session` returns `{ "room": null }`. Every other action returns 401.
4. An Auth outage (any status other than 400/401/403/422) returns 503 and keeps the cookies, so a
   reserved seat is not lost.

### 1.3 Response envelope

| Action | Success body |
|---|---|
| `session`, `create`, `join`, `ready`, `heartbeat`, `theme`, all `debate/*`, `judge`, `lawyer/topic|position|plan|start|argument|consult|advance|rematch|retry` | `{ "room": RoomSnapshot \| null, "realtime"?: { "url", "key", "accessToken" } }`. `realtime` is present only when `room` is not null. |
| `leave` | `{ "room": null }` |
| `lawyer/history` (GET) | `{ "history": LawyerResultRecord[] }` (list) or `{ "history": LawyerResultDetail }` (one debate) |
| `lawyer/acknowledge` | `{ "results": LawyerResultDetail }` |
| `lawyer/speech` | Raw `audio/wav` bytes, with `X-Content-Type-Options: nosniff` |

Every response carries `Cache-Control: no-store, private` and `Vary: Cookie`.

### 1.4 Error envelope

```json
{ "error": "<human-readable message>", "code": "STALE_ROOM" }
```

- `error` is a **sentence, not a code**. The server maps the database exception name (for example
  `ROOM_FULL`) to `[status, message]` using the `messages` table in `room-api.ts`. The UI shows
  this sentence to the player.
- `code` is included **only** for `STALE_ROOM` and `STALE_DEBATE`, and for speech errors
  (`TTS_*`). For every other error the UI only sees the HTTP status and the sentence.
- `speech` errors also include `fallbackAllowed: boolean`. It is `true` only when the speech
  error allows falling back to browser speech.
- Any database exception that is not in the table, and any unexpected error, becomes
  **503** `"The room service is temporarily unavailable. Please try again."`. Worker-side codes
  that can reach this path: `INVALID_JUDGE_RESPONSE`, `INVALID_LAWYER_RESPONSE`,
  `JUDGE_REQUEST_NOT_CLAIMED`, `JUDGE_REQUEST_NOT_FOUND`, `LAWYER_REQUEST_NOT_CLAIMED`,
  `LAWYER_REQUEST_NOT_FOUND`, `SUMMARIES_NOT_READY`.
- On any **401**, both cookies are cleared (`Max-Age=0`).

`room-client.ts` has its own `messages` map keyed by codes (`ROOM_FULL`, …), but because the
server sends sentences, those keys never match and the server's sentence is shown as-is. The UI
behaviour that depends on errors:

| UI reaction | Trigger |
|---|---|
| Forget the room (`room: null`) | HTTP 401 or 410 |
| "Session lost" message | HTTP 401 |
| Re-read `/api/rooms/session` once queued work finishes; never retry the action | `code` is `STALE_ROOM` or `STALE_DEBATE` |
| Mark offline | Request timed out, any failed GET, or a failed heartbeat |
| Browser-speech fallback | Speech error with `fallbackAllowed: true` (and the player's setting allows it) |

**Dead codes:** these appear in the server's message table but are never raised by any database
function or API check: `CONSULTATION_LIMIT_REACHED`, `DEBATE_FINISHED`, `DUPLICATE_SUBMISSION`,
`JUDGE_NOT_ENABLED`, `LAWYER_FORMAT_REQUIRED`, `LEGACY_ACTION_DISABLED`,
`MESSAGE_LIMIT_REACHED`, `PLAYERS_NOT_READY`, `QUESTIONS_PENDING`, `REQUEST_CONFLICT`,
`TOPIC_NOT_APPROVED`. The lawyer per-subtopic caps raise `LAWYER_LIMIT_REACHED` instead.

### 1.5 Errors common to most routes

| Status | Code / message | When |
|---|---|---|
| 401 | `UNAUTHORIZED` | No valid session (except `session`, `create` and `join`) |
| 404 | `ROOM_NOT_FOUND` | The caller has no seat (room-bound actions) |
| 410 | `ROOM_EXPIRED` | The caller's room is past `expiresAt` |
| 409 | `STALE_ROOM` (with `code`) | `x-quarrel-room-id` differs from the caller's current room |
| 503 | `"Rooms are not configured yet…"` | `SUPABASE_URL` or `SUPABASE_PUBLISHABLE_KEY` missing |
| 503 | `"Could not create a player session…"` | Anonymous sign-in failed (`create`, `join`) |
| 503 | `"The session service is temporarily unavailable…"` | Auth outage |
| 503 | `JUDGE_NOT_CONFIGURED` | `debate/start`, `judge`, `lawyer/plan` or `lawyer/retry` with no `JUDGE_SERVER_SECRET` |
| 503 | `JUDGE_SERVER_UNAUTHORIZED` | The server secret's hash is not registered in the database |

---

## 2. Endpoints

26 route files: 24 POST and 2 GET. The tables list request fields, the database function, and the
errors specific to each route (in addition to §1.5).

### 2.1 Rooms (7)

| Method + path | Body | DB function | Success | Specific errors |
|---|---|---|---|---|
| GET `/api/rooms/session` | none | `get_quarrel_room` | Room envelope; `{room:null}` with no cookies or no seat | 410 `ROOM_EXPIRED`, 401 |
| POST `/api/rooms` (create) | `{ name: string }` (1–32 code points, no control chars) | `create_quarrel_lawyer_room_v2` | Room envelope (new lawyer room, slot A). **Idempotent:** a caller who already has a seat gets their existing room back | 400 `INVALID_NAME` |
| POST `/api/rooms/join` | `{ name: string, code: string }` (code is trimmed and upper-cased; `^[A-HJ-NP-Z2-9]{6}$`) | `join_quarrel_room` | Room envelope (slot B). Rejoining your own room only refreshes presence | 400 `INVALID_NAME`, `INVALID_CODE`; 404 `ROOM_NOT_FOUND`; 410 `ROOM_EXPIRED`; 409 `ALREADY_IN_ROOM`, `ROOM_CLOSED` (a seat was vacated), `ROOM_FULL` |
| POST `/api/rooms/leave` | `{ roomId: uuid }` | `leave_quarrel_room` | `{room:null}` (also when the caller has no seat) | 400 `INVALID_ROOM`; 409 `STALE_ROOM` (`roomId` is not the current room) |
| POST `/api/rooms/ready` | `{ ready: boolean }` | `set_quarrel_ready` | Room envelope | 400 `INVALID_READY`; 409 `DEBATE_STARTED`; 409 `DEBATE_NOT_READY` (lawyer room: `ready:true` without a topic or your own confirmed position) |
| POST `/api/rooms/heartbeat` | `{}` | `heartbeat_quarrel_room` | Room envelope | 404 |
| POST `/api/rooms/theme` | `{ themeId: "jungle"\|"superhero"\|"detective"\|"courtroom" }` | `set_quarrel_theme` | Room envelope | 400 `INVALID_THEME`; 403 `HOST_ONLY`; 409 `THEME_LOCKED` |

### 2.2 `debate/*`: Stage 3/4 legacy turn engine (6)

In a lawyer room (every room created today), each of these functions raises
`LAWYER_FLOW_REQUIRED`, which returns **409**.

| Method + path | Body | DB function | Specific errors (legacy rooms) |
|---|---|---|---|
| POST `/api/rooms/debate/propose` | `{ topic (1–240), positionA (1–160), positionB (1–160, not equal ignoring case), revision: int }` | `propose_quarrel_debate` | 403 `HOST_ONLY`; 409 `DEBATE_STARTED`, `STALE_REVISION`; 400 `INVALID_TOPIC`, `INVALID_POSITION`, `INVALID_REVISION` |
| POST `/api/rooms/debate/approve` | `{ revision }` | `approve_quarrel_debate` | 409 `DEBATE_STARTED`, `STALE_REVISION`, `DEBATE_NOT_READY`, `CHANGES_REQUESTED` |
| POST `/api/rooms/debate/changes` | `{ message (1–240), revision }` | `request_quarrel_debate_changes` | 403 `GUEST_ONLY`; 409 `DEBATE_STARTED`, `STALE_REVISION`, `DEBATE_NOT_READY`; 400 `INVALID_CHANGE_REQUEST` |
| POST `/api/rooms/debate/start` | `{ revision }` | `start_quarrel_judged_debate` (the server adds `p_server_key`, `p_mode`, `p_message_limit` and `p_lines`, the theme's judge lines) | 503 `JUDGE_NOT_CONFIGURED`, `INVALID_JUDGE_CONFIG`; 409 `THEME_CHANGED`, `DEBATE_STARTED`, `STALE_REVISION`, `DEBATE_NOT_READY`; 403 `HOST_ONLY` |
| POST `/api/rooms/debate/argument` | `{ text (1–2000, multi-line), revision, turnIndex: 0–5 }` | `submit_quarrel_argument` | 400 `INVALID_ARGUMENT`, `INVALID_TURN`; 403 `NOT_YOUR_TURN`; 409 `STALE_REVISION`, `STALE_TURN`, `DEBATE_NOT_STARTED`, `ALREADY_SUBMITTED`, `TURN_EXPIRED`, `DEBATE_COMPLETE`, `JUDGE_PREPARING_QUESTIONS` |
| POST `/api/rooms/debate/advance` | `{ revision, turnIndex: 0–5 }` | `advance_quarrel_debate` (reads only; expiry is applied by the read) | 400 `INVALID_TURN`; 409 `STALE_REVISION`, `STALE_TURN`, `DEBATE_NOT_STARTED` |

### 2.3 Judge: legacy shared judge chat (1)

| Method + path | Body | DB function | Specific errors |
|---|---|---|---|
| POST `/api/rooms/judge` | `{ text (1–600, multi-line), revision, turnIndex: 0–5, requestKey: UUIDv4 }` | `begin_quarrel_judge_message` | 409 `LAWYER_FLOW_REQUIRED` (lawyer rooms); 400 `INVALID_JUDGE_MESSAGE`, `INVALID_REQUEST_KEY`, `INVALID_JUDGE_REQUEST`; 409 `JUDGE_UNAVAILABLE`, `STALE_REVISION`, `JUDGE_REQUEST_CONFLICT`, `DEBATE_NOT_STARTED`, `DEBATE_COMPLETE`, `JUDGE_PREPARING_QUESTIONS`, `STALE_TURN`, `TURN_EXPIRED`, `JUDGE_BUSY`; 403 `NOT_YOUR_TURN`; 429 `JUDGE_LIMIT_REACHED`, `JUDGE_RATE_LIMITED` |

### 2.4 `lawyer/*`: current game (12)

| Method + path | Body | DB function | Success | Specific errors |
|---|---|---|---|---|
| POST `/api/rooms/lawyer/topic` | `{ topic (1–240), totalSeconds: 120\|240\|360\|600, revision }` | `propose_quarrel_lawyer_topic` | Room envelope | 403 `HOST_ONLY`; 409 `LAWYER_UNAVAILABLE` (legacy room), `DEBATE_STARTED`, `STALE_REVISION`; 400 `INVALID_TOPIC`, `INVALID_DURATION` |
| POST `/api/rooms/lawyer/position` | `{ position (1–600, multi-line), revision }` | `set_quarrel_lawyer_position` | Room envelope | 400 `INVALID_LAWYER_POSITION` (API) or `INVALID_POSITION` (DB); 409 `LAWYER_UNAVAILABLE`, `DEBATE_STARTED`, `STALE_REVISION`, `DEBATE_NOT_READY` (no topic yet) |
| POST `/api/rooms/lawyer/plan` | `{ revision, regenerate: boolean }` | `prepare_quarrel_lawyer_plan` | Room envelope | 400 `"Choose whether to regenerate the plan."` (no code); 503 `JUDGE_NOT_CONFIGURED`, `INVALID_LAWYER_CONFIG`; 403 `HOST_ONLY` (regenerate); 409 `PLAN_REGENERATION_USED`, `PLAN_NOT_READY`, `DEBATE_NOT_READY`, `DEBATE_STARTED`, `STALE_REVISION`, `LAWYER_UNAVAILABLE` |
| POST `/api/rooms/lawyer/start` | `{ revision, planGeneration: 0\|1 }` | `start_quarrel_lawyer_debate` | Room envelope | 409 `STALE_PLAN`, `STALE_REVISION`, `DEBATE_STARTED`, `DEBATE_NOT_READY`, `LAWYER_UNAVAILABLE`; 403 `HOST_ONLY` |
| POST `/api/rooms/lawyer/argument` | `{ text (1–600, multi-line), revision, subtopic: 1–5, requestKey: UUIDv4 }` | `submit_quarrel_lawyer_argument` | Room envelope. **Idempotent** by `(player, revision, requestKey)` | 400 `INVALID_LAWYER_MESSAGE`, `INVALID_TURN`, `INVALID_REQUEST_KEY`; 409 `LAWYER_REQUEST_CONFLICT`, `DEBATE_COMPLETE`, `DEBATE_NOT_STARTED`, `STALE_TURN`, `LAWYER_BUSY`, `TURN_EXPIRED`, `STALE_REVISION`, `LAWYER_UNAVAILABLE`; 403 `NOT_YOUR_TURN`; 429 `LAWYER_LIMIT_REACHED` |
| POST `/api/rooms/lawyer/consult` | Same as `argument` | `consult_quarrel_lawyer` | Same | Same |
| POST `/api/rooms/lawyer/advance` | `{ revision }` | `advance_quarrel_lawyer_debate` (reads only; the read applies expired deadlines and lease repair) | Room envelope | 409 `STALE_REVISION` |
| GET `/api/rooms/lawyer/history` | Query: none, `?roomId=<uuid>` or `?debateId=<uuid>` (at most one key) | `list_quarrel_lawyer_results` / `get_quarrel_lawyer_results` | `{history: LawyerResultRecord[]}` (newest first, at most 100) or `{history: LawyerResultDetail}` | 400 `INVALID_DEBATE`; 404 `RESULTS_NOT_FOUND`; 409 `RESULTS_NOT_READY`. No room header; works after leaving the room |
| POST `/api/rooms/lawyer/acknowledge` | `{ debateId: uuid }` | `acknowledge_quarrel_lawyer_results` | `{results: LawyerResultDetail}`. Idempotent | 400 `INVALID_DEBATE`; 404 `RESULTS_NOT_FOUND`; 409 `RESULTS_NOT_READY` |
| POST `/api/rooms/lawyer/rematch` | `{ debateId: uuid }` + required room header | `request_quarrel_lawyer_rematch` | Room envelope. Idempotent; the second approval starts a new setup | 400 `INVALID_DEBATE`, `INVALID_ROOM`; 404 `RESULTS_NOT_FOUND`; 409 `STALE_DEBATE` (with `code`), `REMATCH_NOT_READY`, `ROOM_CLOSED` |
| POST `/api/rooms/lawyer/retry` | `{ debateId: uuid }` + required room header | `retry_quarrel_lawyer_jury` | Room envelope | 503 `JUDGE_NOT_CONFIGURED`; 409 `STALE_DEBATE` (with `code`), `JURY_RETRY_NOT_READY`; 429 `JURY_RETRY_RATE_LIMITED` |
| POST `/api/rooms/lawyer/speech` | `{ debateId: uuid, messageId: uuid, speechToken: string (≤32,000) }` + required room header | None (no room read or write) | `audio/wav` | JSON `{error, code, fallbackAllowed}`: 400 (bad fields, no code); 401; 403 `TTS_INVALID_RECEIPT`; 422 `TTS_CONTENT_BLOCKED`; 429 `TTS_RATE_LIMITED`, `TTS_QUOTA`; 502 `TTS_INVALID_AUDIO`, `TTS_TIMEOUT`, `TTS_INVALID_RESPONSE`; 503 `TTS_NOT_CONFIGURED`, `TTS_CONFIGURATION`, `TTS_PROVIDER_UNAVAILABLE` |

### 2.5 Server-side side effects after every room response

These happen in `roomRoute` **after** the database call. The UI never asks for them, but it
depends on them:

1. **Automatic planning.** If the returned snapshot has `lawyer.phase === "setup"`, `bothReady`,
   `confirmedA` and `confirmedB`, and a server secret is configured, the server immediately calls
   `prepare_quarrel_lawyer_plan(revision, regenerate=false)` and returns that result. The UI
   **never** sends the first plan request: it calls `lawyer/plan` only with `regenerate: true`
   ([lawyer-debate.tsx:51](../src/components/lawyer-debate.tsx#L51)). Any request (heartbeat,
   ready, session) can trigger planning.
2. **AI work.** If `lawyer.needsWork` (or legacy `judge.needsWork`) is true, the server schedules
   `processLawyerWork` (or `processJudgeWork`) with Next `after()`, using the **caller's**
   session. That claims at most one job, calls the AI and saves the result. The work is done by
   whichever player's request noticed it.
3. **Speech receipts.** Every complete public message in `lawyer.history` (and in archive
   details) gets a signed `speechToken`, or `speechBlocked: true`, before the response is sent.

---

## 3. Response types

Defined in `src/lib/room-types.ts`, `debate-types.ts`, `judge-types.ts` and `lawyer-types.ts`;
built by `get_quarrel_room` and its helpers.

### 3.1 `RoomResponse` and `RoomSnapshot`

| Field | Meaning | Filled |
|---|---|---|
| `room` | The caller's current room, or `null` | Always |
| `realtime` | `{url, key, accessToken}`: Supabase URL, publishable key and the caller's **access token** | Whenever `room` is not null |
| `id` | Room UUID | Always |
| `code` | 6-character invite code | Always |
| `expiresAt` | Creation + 24 h; never extended | Always |
| `you` | `"A"` (host) or `"B"` | Always |
| `players[]` | `{slot, name, ready, connected}`. `connected` means seen in the last 35 s. A departed seat keeps its name with `ready:false, connected:false` | Always |
| `bothReady` | 2 seats, both ready and both connected | Always |
| `themeId` | `jungle \| superhero \| detective \| courtroom` (default `courtroom`) | Always |
| `themeLocked` | true from debate start until a rematch | Always |
| `mode`, `capacity` | Constant `"solo"`, `2` | Always |
| `debate` | Legacy `DebateSnapshot`. **Also present in lawyer rooms**, as an empty `phase:"setup"` object (the database creates the legacy row on first read) | Always |
| `judge` | Legacy `JudgeSnapshot` or `null` | Only legacy rooms started with the judge |
| `lawyer` | `LawyerDebateSnapshot` | Lawyer rooms only |
| `playerId`, `teamId`, `selectedCharacterId` | Reserved optional fields in the type | **Never filled** by v1 |

### 3.2 `LawyerDebateSnapshot` (`room.lawyer`)

Phases: `setup → planning → subtopic ⇄ summary → jury → complete`.

| Field | Meaning | Filled / changes in |
|---|---|---|
| `format` | `"lawyer"` | Always |
| `debateId` | Current debate session UUID. Changes on rematch | Always (Stage 6A) |
| `reliabilityVersion` | 1 or 2 (compatibility marker; see rules.md) | Always |
| `phase` | See above | Always |
| `topic`, `totalSeconds` | Host's topic and writing time per player (120/240/360/600; default 240) | Set in setup |
| `revision` | Counter that increases on every topic/position change and on rematch. Must be echoed back by the client | Always |
| `positionA`, `positionB` | Each player's own position (≤600) | Setup; visible to both |
| `confirmedA`, `confirmedB` | That player has saved a position for this revision | Setup |
| `planReady` | The subtopic plan is saved | planning → true |
| `regenerationUsed`, `planGeneration` | Host's one regeneration used; plan generation 0 or 1 | planning |
| `subtopics[]` | `{ordinal, question, secondsPerPlayer, openerSlot, source, status, remainingMsA, remainingMsB}` | From the saved plan onwards |
| `currentSubtopic` | 1–5 or null | subtopic/summary |
| `state` | `composing` (a clock is running), `lawyering` (AI is presenting), `consulting` (AI private advice), or null. **Opponents see `lawyering` when you are consulting** | subtopic |
| `activeSlot` | Whose clock is running. Null unless `state === "composing"` | subtopic |
| `turnDeadline` | When the active clock hits zero. Null while AI works | subtopic (composing) |
| `remainingMsA/B` | Stored remaining time for the current subtopic | subtopic |
| `serverNow` | Database time when the snapshot was built (clock sync) | Always |
| `startedAt` | Debate start time | From start |
| `history[]` | Public messages (`LawyerPublicMessage`): `{id, label, kind: argument\|judge_summary\|announcement\|jury_verdict, subtopic, slot, text, source, status, createdAt, completedAt, rawText?, speechToken?, speechBlocked?}`. `rawText` (the player's own draft) **only on your own arguments** | From start |
| `consultations[]` | **Your own** private consultations `{id, subtopic, playerText, text, source, status, createdAt}` | From your first consultation |
| `verdict` | `JuryVerdict` (`outcome`, `reasoning`, `perSubtopic`, plus v2 fields `decision`, `topic`, positions, `strongestArguments`, `weaknesses`, `compromise`, `subtopicSummaries`) | phase `complete` |
| `ownMessageCount`, `ownConsultationCount` | Your submissions in the current subtopic (caps 12 and 2) | subtopic |
| `needsWork` | A job you are allowed to process is waiting (server-side use) | Any |
| `acknowledgements` | `{A, B}` timestamps or null | complete |
| `rematch` | `{A, B, nextDebateId}` | complete |
| `juryStatus` | `{state: pending\|processing\|retry_wait\|retry_required\|complete, attempts, retryAt, errorCode}` or null | jury, complete |

### 3.3 Legacy snapshots (`room.debate`, `room.judge`)

`DebateSnapshot`: `phase` (`setup|opening|rebuttal|questions|verdict`), `topic`,
`positionA/B` (≤160), `revision`, `approvedA/B`, `changeRequest`, `activeSlot`, `turnIndex`
(0–5), `turnDeadline`, `serverNow`, `startedAt`, `history[]` (`DebateEntry`; the peer's opening
is hidden until both openings are done), and `questions[]` (2 questions, saved before the answer
turns).

`JudgeSnapshot` (only legacy rooms started with the judge): `enabled`, `mode`, `messages[]`,
`pendingRequestId`, `messagesUsed` (yours, this turn), `maxMessagesPerTurn`, `needsWork`,
`preparingQuestions`.

In the current UI these are read only to display old records
([stage-five-app.tsx:79-80](../src/components/stage-five-app.tsx#L79-L80)) and in a few flags
(`debate.phase === "verdict"`, `debate.startedAt`, `debate.serverNow`).

### 3.4 Archive types

- `LawyerResultRecord`: `{id (debateId), roomId, topic, themeId, totalSeconds, startedAt, completedAt, verdict, acknowledgements, rematch}`.
- `LawyerResultDetail`: the record plus `positions {A,B}`, `players [{slot,name}]`, public
  `history[]` (with `debateId` and speech receipts), and
  `subtopics [{ordinal, question, secondsPerPlayer, summary}]`. It contains no drafts and no
  consultations.

---

## 4. Implicit contract

### 4.1 `x-quarrel-room-id` and stale codes

- The client sends `x-quarrel-room-id: <the room the player was looking at>` on every POST made
  through `request`/`act`, and on speech requests. It is not sent on GETs or on the archive calls
  (`acknowledge` goes through `resultRequest` without a room ID).
- It is **only** a stale-tab guard, never authorization. Postgres compares it with the caller's
  current room under the room lock (`check_room_request`) and raises `STALE_ROOM` if they differ.
  `leave` also compares its body `roomId`.
- `STALE_DEBATE` is raised when a `debateId` is not the room's current debate (rematch, retry).
- On either code the client does **not** retry the action. It waits for queued requests, then
  re-reads `/api/rooms/session` ([room-client.ts:98-105](../src/lib/room-client.ts#L98-L105)).

### 4.2 Clock sync (`serverNow`)

- Each room response includes `lawyer.serverNow` (or legacy `debate.serverNow`).
- The client estimates server time as `serverNow + round-trip / 2` and then advances it with
  `performance.now()` (monotonic), so changing the device clock has no effect
  ([room-client.ts:73-79](../src/lib/room-client.ts#L73-L79)).
- Displayed lawyer clock: `min(remainingMs, turnDeadline − serverTime)` for the active composing
  player, otherwise `remainingMs`. It ticks every 250 ms
  ([lawyer-types.ts:126-131](../src/lib/lawyer-types.ts#L126-L131)).
- Only the server decides expiry. When the local estimate reaches `turnDeadline` (at least 500 ms
  away, or 1 s if there is no deadline), the client calls `POST lawyer/advance {revision}`. It
  then **repeats every 1.5 s** while the phase is not `setup` or `complete` and the plan isn't
  waiting to be started ([room-client.ts:235-249](../src/lib/room-client.ts#L235-L249)). So
  during planning, lawyering, summary and jury, each client polls `lawyer/advance` every 1.5 s.
  In v1 these polls are what drive expiry and AI work forward.
- Legacy rooms do the same with `debate/advance {revision, turnIndex}`.

### 4.3 Heartbeat and presence

- `POST /api/rooms/heartbeat` runs every **10 s** while a room is loaded, plus on the browser's
  `online` and `visibilitychange` events ([room-client.ts:120-135](../src/lib/room-client.ts#L120-L135)).
- A player counts as `connected` if their last heartbeat or other mutation was within **35 s**.
- A failed heartbeat marks the client offline. The `offline` browser event marks it offline and
  not live.

### 4.4 Request timeout and serialisation

- Every room request is aborted after **15 s** ("The room took too long to respond…").
- Speech requests are aborted after 25 s. If audio hasn't started 15 s after loading, playback
  is treated as failed.
- The client sends **one request at a time**: a new request waits for the previous one, and
  player actions (`act`) wait for queued reads first. The comment explains this avoids
  refresh-token rotation races. The server must still tolerate concurrent requests from two tabs.

### 4.5 Realtime channel

- After any room response with `realtime`, the browser creates a Supabase JS client with
  `realtime.url` and `realtime.key`, and calls `setAuth(realtime.accessToken)`.
- It subscribes to channel `room:<roomId>` with Postgres Changes:
  - `*` on `public.quarrel_players` filtered `room_id=eq.<roomId>` (inserts and updates only:
    the publication suppresses deletes)
  - `UPDATE` on `public.quarrel_rooms` filtered `id=eq.<roomId>`
- **Triggers:** any change to a player row (join, ready, heartbeat `last_seen`, leave) and any
  room-row update. Every game-state change bumps `quarrel_rooms.debate_version`, so every
  transition (including AI completions and expiries applied by reads) produces an event. Theme
  changes update the row too.
- **Payload:** the client **ignores** the event payload and simply re-reads
  `/api/rooms/session` (`resync`). The payload is raw table rows: the room row (id, code,
  timestamps, theme, `debate_version`) and player rows (which include `user_id`, `display_name`,
  `ready`, `last_seen`). These are visible only to members (RLS). No game text, positions or
  arguments are ever in a published table.
- `live` (shown in the lobby) is true only while the subscription status is `SUBSCRIBED`.
  The client re-syncs on subscribe to close the gap between the snapshot and the subscription.

### 4.6 Session cookies

| Property | Value |
|---|---|
| Names | `quarrel_access` (Supabase access JWT), `quarrel_refresh` (refresh token) |
| Set when | Anonymous sign-in on `create`/`join`, or after a successful refresh, on **any** response, including error responses |
| Flags | `HttpOnly`, `SameSite=Strict`, `Path=/api/rooms`, `Max-Age=604800` (7 days), `Secure` only over https |
| Refresh | Server-side only: if the access token fails verification and a refresh token exists, the server refreshes and re-sets both cookies. The client never refreshes |
| Cleared | On any 401 (`Max-Age=0`) |
| Note | Although the cookie is HttpOnly, the same access token is returned in the JSON body as `realtime.accessToken` for the Realtime connection |

---

## 5. Which flow the UI uses today

### 5.1 Entry points

| Page | Component | Room calls |
|---|---|---|
| `/` ([src/app/page.tsx](../src/app/page.tsx)) | `StageFiveApp` | All lawyer routes, `create`, `join`, `leave`, `ready`, `heartbeat`, `session`, `lawyer/history`, `lawyer/acknowledge` |
| `/settings` ([settings-page.tsx](../src/components/settings-page.tsx)) | `SettingsPage` | `session`, `heartbeat`, `theme` |
| `/share?room=CODE` ([share-invite.tsx](../src/components/share-invite.tsx)) | `ShareInvite` | `session`, `heartbeat`, `join`, `leave` |
| `/preview` | `QuarrelApp` (local art preview) | None |

`MultiplayerApp` ([multiplayer-app.tsx:16](../src/components/multiplayer-app.tsx#L16)) is marked
"Retained only for legacy component regression coverage; public entry uses StageFiveApp". No page
imports it; only tests do.

### 5.2 Hook function → route → caller

| `useRoomClient()` function | Route | Called from (rendered UI) |
|---|---|---|
| (mount) `refresh` | GET `session` | All pages using the hook |
| (timer) heartbeat | `heartbeat` | All pages using the hook |
| `create` | `POST /api/rooms` | `stage-five-app.tsx` (`RoomEntry`) |
| `join` | `join` | `stage-five-app.tsx`, `share-invite.tsx` |
| `leaveRoom` | `leave` | `stage-five-app.tsx`, `share-invite.tsx` |
| `setReady` | `ready` | `stage-five-app.tsx` (`RoomLobby`) |
| `setTheme` | `theme` | `settings-page.tsx` |
| `proposeLawyerTopic` | `lawyer/topic` | `stage-five-app.tsx` → `LawyerSetup` |
| `setOwnPosition` | `lawyer/position` | `LawyerSetup` |
| `planDebate(rev, true)` | `lawyer/plan` | `LawyerSetup` (regenerate only) |
| `startLawyerDebate` | `lawyer/start` | `LawyerSetup` |
| `sendToLawyer`, `consultLawyer` | `lawyer/argument`, `lawyer/consult` | `LawyerDebateView` → `LawyerComposers` |
| (timer) reconcile | `lawyer/advance` | Hook effect, lawyer rooms |
| `listResults`, `getResult` | GET `lawyer/history` | `PreviousDebates` (`lawyer-results.tsx`) |
| `acknowledgeResults`, `requestRematch`, `retryJury` | `lawyer/acknowledge`, `lawyer/rematch`, `lawyer/retry` | `LawyerDebateView` (`JuryDecision`, `JuryRecovery`) |
| (direct fetch) | `lawyer/speech` | `character-speech.ts:87` |
| `proposeTopic`, `approveTopic`, `requestChanges`, `startDebate`, `submitArgument` | `debate/propose`, `approve`, `changes`, `start`, `argument` | **Only `multiplayer-app.tsx`** (not rendered) |
| `askJudge` | `judge` | **Only `multiplayer-app.tsx`** (not rendered) |
| (timer) legacy reconcile | `debate/advance` | Hook effect; runs only when `room.lawyer` is absent **and** `room.debate.turnDeadline` is set |

### 5.3 Is `debate/*` still reachable?

**Effectively no.**

- Five of the six `debate/*` routes, plus `judge`, are called only from `MultiplayerApp`, which no
  page renders ([page.tsx](../src/app/page.tsx), [preview/page.tsx](../src/app/preview/page.tsx)).
- `debate/advance` can still be fired automatically by the hook
  ([room-client.ts:261-278](../src/lib/room-client.ts#L261-L278)), but only for a room with no
  `lawyer` snapshot and a running legacy deadline.
- `create` always calls `create_quarrel_lawyer_room_v2`, so every new room is a lawyer room. In a
  lawyer room all legacy functions raise `LAWYER_FLOW_REQUIRED`. Rooms expire 24 h after
  creation, and the legacy flow was replaced on 2026-11-07, so no unexpired legacy room can exist
  now.
- Legacy rooms are still **displayed** read-only if one is loaded (`DebateHistory`,
  `JudgeConversation`). Those components make no requests.
- **UNCLEAR:** whether v2 needs to read any v1 data at all (see rules.md, open questions). If it
  doesn't, v2 can drop `debate/*` and `judge` from the server while still returning the fields
  the UI reads (or omitting them, since every read is optional-chained).
