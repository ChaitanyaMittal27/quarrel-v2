# Stage 1 rules coverage

Stage 1's setup-free ready behavior below is historical: Stage 2 now requires a saved position
and the positions phase. The current v2 setup rules and their proof follow in the next section.

## Stage 2 (v2 flow)

The Stage 2 prompt defines v2 behavior. v1 rules 2.1-2.14 in rules.md are reference only;
there is no confirmation/accept step, revision number or editable setup. Stage 3 adds Start.
All API tests below are in [server/tests/setup.test.ts](../server/tests/setup.test.ts),
contract tests in [shared/tests/setup.test.ts](../shared/tests/setup.test.ts), except where noted.

| Rule | Proving tests (all prefixed `rule S2.x:`) | Difference from v1 2.1-2.14 |
| --- | --- | --- |
| S2.1 Fixed setup at create | `creation stores trimmed topic and defaults; setup remains fixed on retries and other writes`; theme/duration matrix; bad-topic and bad-theme/duration cases; `topic length uses code points, allowing one or 240 emoji`; shared request/default/control tests | Replaces 2.1-2.5: one game flow; courtroom default retained, but theme/topic/duration chosen at create and never edited. No revision increments, setup resets or plan invalidation. |
| S2.2 Join enters positions | `join takes B and moves waiting to positions exactly once` | Explicit waiting -> positions transition replaces v1's undifferentiated setup. Repeat joins retain the current phase, including planning. |
| S2.3 Own position, positions phase | `position is own-seat only, trimmed and multiline, with tab/newline allowed`; bad-position cases; code-point boundary/request-shape test; auth/membership/stale/expiry test; waiting and planning rejection tests | Retains own-seat and size limits from 2.6; replaces topic-first setup checks with phase enforcement. Only tab/LF controls allowed; CR and other Cc rejected. |
| S2.4 Public positions | `both players see the same public positions with their own viewer slot`; [sockets.test.ts](../server/tests/sockets.test.ts): `opponent's position is pushed to both players with their own viewer slot`; shared strict setup test | Replaces 2.9: visibility is immediate on save, with no confirmation requirement. |
| S2.5 Reset author's ready | `saving clears only the author's ready, including an identical saved position`; `a changed save increments version/emits once, but an unchanged unready save does neither` | Replaces 2.7-2.8: only the author is unreadied; no confirmation, revision, or plan discard. An identical save still clears a true ready flag. |
| S2.6 Ready preconditions | `ready:true/false and positions are rejected while waiting` (two cases); `ready:true requires own position; ready:false is allowed in positions` | Replaces 2.10: own position required for true; both true and false require positions phase. Waiting no longer permits lobby ready. |
| S2.7 Atomic planning lock | `simultaneous ready requests cause exactly one planning transition, independent of presence` | Replaces the setup boundary in 2.11-2.13. Both non-left ready flags lock positions before planning; presence still affects bothReady but not the phase trigger. The test asserts concurrent responses, final Redis state/version and exactly two ready writes, without MONITOR. Frozen ready/position calls fail without a version/event change. Host-only Start and countdown belong to Stage 3. |
| S2.8 Leave any phase | `leaving during waiting/positions/planning closes the room and preserves setup` (three cases) | Preserves Stage 1 leave behavior at each new phase. Redis Lua preserves 2.14's atomic mutation guarantee. |

[integration/lobby.test.ts](../server/tests/integration/lobby.test.ts) now creates with a topic,
saves both positions, readies both and asserts planning plus both public positions. Its existing
disconnect/reconnect/leave, expiry recovery and two-tab assertions still run on the new flow.

The snapshot stays strict. Its setup contains only phase/theme/topic/durationSec/positions;
the existing version orders pushes, and presence changes still allow equal-version updates.

## Stage 3 (v2 planner and Start)

S3 labels below name this stage's implementation tests. They retain v1 3.5-3.10's planner
behavior; setup is immutable, so there is no regenerate, revision or stale-generation token
(v1 3.1-3.4/3.11). Readiness enters planning once; host Start follows a saved plan.
Server tests below are in [planner.test.ts](../server/tests/planner.test.ts).

| Rule | Test proof | Notes / differences from v1 |
| --- | --- | --- |
| S3.1 Save once | `rule S3.1: save-plan writes once in planning and increments version once`; `save-plan ignores %s rooms` (waiting, positions, debate, closed, expired, missing); `invalid shape or wrong total cannot be saved` | Lua replaces SQL/lease completion; late jobs cannot overwrite or revive a room. |
| S3.2 Host Start | `rule S3.2: only the host starts, in planning with a plan and both live presence keys`; `outsider, stale tab, expired and closed-room checks remain authoritative`; `Lua rechecks presence after Node's key discovery` | Preconditions/version/deadline are one atomic script. No plan generation token; repeat Start fails WRONG_PHASE. StartsAt is Redis TIME+3s. |
| S3.3 Queue and recovery | `rule S3.3: planning enqueues once, stable IDs dedupe, and reads recover a missing job`; `a post-Lua queue failure leaves planning recoverable by the next read` | Fixed safe BullMQ ID plan-roomId (colon ID rejected by installed version); explicit reads recover, internal pushes/TTL refreshes do not enqueue. |
| S3.4 Validated worker (v1 3.5, 3.6, 3.9, 3.10) | `rule S3.4: AI off or unconfigured saves a labelled two-subtopic demo`; `fake AI success is validated, given alternating openers, and saved`; `%s failures retry without a plan, and only final failure saves fallback` (exception, shape, total, fallback source); late/missing/closed/expired and persistence tests | Three BullMQ attempts, 1s/2s backoff. Fake AI only in tests. Final fallback has two balanced allocations; no silent early fallback. |
| S3.5 Live plan and Start push (v1 3.8) | `rule S3.5: a real queued demo plan appears in both players' socket views, then Start pushes the same countdown`; `subscriber setup and shutdown failures always release their connection` | Real Redis/Worker/pub-sub/random-port sockets. Each player receives own snapshot, same public plan/deadline; invalid pub/sub messages skipped. |
| S3.6 Strict plan contract (v1 3.5-3.6) | [shared/tests/plan.test.ts](../shared/tests/plan.test.ts): `rule S3.6: %s subtopics have contiguous ordinals, distinct questions and bounded allocations` (2, 3, 4, 5); `invalid counts, ordinal gaps, duplicate questions, unsafe text, times and extra keys are rejected`; `saved plans require a labelled source and server-assigned alternating openers`; `the room schema rejects plans whose per-player allocations do not match its duration` | 2-5 subtopics, 30-600 seconds, total equals fixed duration. Openers server-assigned A/B. Ported [lawyer-engine.test.ts](../server/tests/ai/lawyer-engine.test.ts) retains detailed generation policy tests and verifies retry mode on provider failure. |
| S3.7 Test UI | [ui/tests/debate.test.ts](../ui/tests/debate.test.ts): `countdown follows the server deadline through 3-2-1 and zero, independent of click time`; `Start is enabled only for a host with a plan and two live seats` | Late reconnect uses remaining time; no click-local countdown. HTTP helper test also covers bodiless Start and schema parsing. |

v1 3.7's allocation is retained in the plan; starting/advancing actual per-player clocks is
Stage 4. Automated UI tests exercise pure helpers, not browser rendering; visual QA remains
listed in agent-docs/todo.md.

## Stage 4: turns and clocks

Tests below are in [server/tests/clocks.test.ts](../server/tests/clocks.test.ts), unless linked
otherwise. Legal 120-second per-player plans use two 60-second allocations. Lua transition
tests inject script time; loop tests use fake timers. The idle integration stores a short
deadline and awaits socket events while the poller uses real Redis TIME. It runs real Redis,
Fastify, Socket.IO and pub/sub, without player action. Each test cleans its own room keys and
isolated deadline set; no fixed sleeps or live AI calls.

| Rule | Test proof | Implemented behavior / explicit deferral |
| --- | --- | --- |
| 4.1 Separate chess clocks | `rule 4.1-4.2: Start opens subtopic 1, posts its announcement at startsAt and schedules its deadline`; `rule 4.3-4.4: submit preserves raw text, charges only the sender up to now and passes the turn`; [ui/tests/debate.test.ts](../ui/tests/debate.test.ts): `only the active clock ticks, clamps at zero and stays full during the countdown` | Active clock alone ticks after startsAt; inactive allowance unchanged. Stage 6 now proves pauses in server/tests/lawyer.test.ts (argument/consult cases). |
| 4.2 Subtopic announcement/opener | Start test above; `rule 4.7,4.12: a delayed HTTP read catches several transitions, opens B's subtopic, then ends` | Exact Subtopic n: question, timestamp at boundary, alternating opener from plan. |
| 4.3 Charge at submit | Raw submit/charge test above | Stage 6 stores private raw drafts/questions and pauses both clocks on submit; lawyer.test.ts pause cases prove no AI time charge. |
| 4.4 Pass to opponent or retain | `rule 4.4: the turn stays with the sender when the opponent is exhausted`; raw submit/charge test | Stage 6 resumes at completion now + remaining; pause/completion and exhausted-opponent tests in lawyer.test.ts prove the turn pass. |
| 4.5 Consultation resumes author | lawyer.test.ts: `rules 4.1,4.3,5.6-5.9: consult pauses both clocks and exposes only owner records` | Stage 6 uses kind=consult on the messages endpoint, resumes the same owner, and publishes no argument. |
| 4.6 Old-deadline expiry | `rule 4.6,4.14: expiry anchors to the old deadline and ignores disconnected presence`; `rule 4.6,4.8: a poller racing a submit applies the expiry exactly once`; `rule 4.6,4.12: due uses Redis time, respects its limit and leaves members for catch-up` | Expiry passes only unspent allowance, never grants latency time. Sorted-set selection ignores a deliberately skewed Node clock. |
| 4.7 Both zero finishes subtopic | Delayed HTTP read test above | Enters summary with observed-time work budget; next subtopic follows its four-second display, then jury/complete after last (Stage 7 below). |
| 4.8 Ordered submit/idempotency | `replay/conflict precede phase, ordinal and turn checks, including after ended`; `not-started precedes ordinal/turn, stale ordinal precedes turn, and exact expiry catches up first`; `racing same-key submissions create one message; different-content races conflict`; `the defensive TURN_EXPIRED guard rejects even if reconciliation is bypassed` (all prefixed rule 4.8) | Seat-scoped UUID/content hash; different ordinal also conflicts. Stage 6 adds LAWYER_BUSY after ownership; lawyer.test.ts ordered replay/kind-conflict/phase/ordinal/owner/busy test proves it. Defensive expiry test isolates the guard by disabling catch-up only in its Lua test chunk. |
| 4.9 Per-player caps | `rule 4.9-4.10: 12 arguments per player; hitting the cap neither changes nor extends the clock` | 12 presentations and 2 consultations per player/subtopic; lawyer.test.ts consultation cap and clock-preservation test complements the 12-argument regression. |
| 4.10 Cap never ends/extends clock | Same cap test; UI send-disabled test | Both players can reach 12; clocks continue to expire normally. |
| 4.11 Text/UUID | `rule 4.11: HTTP rejects invalid text, UUIDs and ordinals before Lua`; [shared/tests/clocks.test.ts](../shared/tests/clocks.test.ts): raw text/code-point/control, UUIDv4/ordinal and strict public object tests | 1-600 code points, nonblank, tab/LF only. Exact raw text retained, including edge whitespace. API INVALID_REQUEST for bad text/key/ordinal. |
| 4.12 Catch-up and polling | Delayed HTTP read test; `rule 4.12: reads catch up and atomically update the sorted deadline`; `rule 4.6,4.12: two pollers reconcile once, update the set and publish; not-yet-due rooms stay untouched`; `rule 4.12: missing, expired and closed rooms are removed; a room error does not abort the batch`; [deadline-loop.test.ts](../server/tests/deadline-loop.test.ts): non-overlap, in-flight shutdown, error retry and pending-timer cancellation tests | Same Lua transition loop in reads/submits/poller. Read combines catch-up and snapshot, no extra round trip. Start/submit/expiry update the sorted set; ended/leave remove the member. No BullMQ clock jobs or turnSeq. Two pollers are safe; duplicate publishes are harmless. |
| 4.13 Client cannot force advance | `rule 4.13: only server time advances clocks; malformed/outsider/stale/closed/expired requests cannot post` | No advance endpoint/revision flow in v2. Client ordinal guards submissions; client now/slot fields rejected by the strict Stage 6 request. |
| 4.14 Disconnect never pauses | Old-deadline/disconnected test above; `rule 4.1-4.14: an idle turn passes and pushes to two players using real Redis TIME, without player action` | Catch-up/poller do not consult presence; each player gets its own snapshot with identical public transcript. The worker loop fires without reads or submissions. |

Additional UI proofs in [ui/tests/debate.test.ts](../ui/tests/debate.test.ts): send preconditions,
clock formatting, countdown, and UUID reuse after network failure; [ui/tests/client.test.ts](../ui/tests/client.test.ts)
verifies refresh/retry preserves the complete message body. Browser rendering remains manual QA.

## Stage 5B: choices and settings

| Rule | Test proof | Behavior |
| --- | --- | --- |
| 5B.1 Own seat / phase / isolation | [server/tests/choices.test.ts](../server/tests/choices.test.ts): `own-seat choices work in %s without changing ready, clocks or the other seat` (waiting, positions, planning, debate); `ended is rejected and membership, expiry and stale-room checks are rechecked inside Lua` | Caller membership determines the seat. Only cosmetics and version change; identical saved values are no-ops. Ended -> WRONG_PHASE. |
| 5B.2 Validation | Server: `invalid IDs fail with INVALID_CHOICE; strict empty/extra-field bodies fail INVALID_REQUEST`; [shared/tests/choices.test.ts](../shared/tests/choices.test.ts): `choice requests are strict, catalog-backed and require at least one field` | Catalog IDs rechecked in Lua; no seat override or arbitrary asset paths. |
| 5B.3 Defaults / global duplicates | Server: `unset/empty choices resolve theme $id seat defaults and both seats may choose duplicates` (all four themes); shared: `snapshots require both resolved catalog IDs, including a retained left seat` | Per-seat defaults for legacy unset fields; any character/lawyer in any theme, both seats may match. |
| 5B.4 Push | Server: `each player's sockets receive the saved choice and viewer slot` | Real random-port Socket.IO + Redis; same public choices, own you.slot, no internal identities. |
| 5B.5 Pickers / API action | [ui/tests/settings.test.ts](../ui/tests/settings.test.ts): `pickers render every catalog preview, name and personality and disable only choices after ended`; `choosing posts only the own-seat field through the typed API and rejects an invalid catalog ID` | Full global catalogs; selection from snapshot; no theme editing or voice controls. |
| 5B.6 Arena | UI: `the room arena uses both snapshots choices, including cross-theme cast and empty B fallback` | RoomStage passes resolved snapshot IDs, not hardcoded defaults. |
| 5B.7 Local preferences | UI: `display preferences safely default for blocked storage, bad JSON and invalid values` | OS/on/off reduced motion, artwork pause and text size are local and guarded. No API/clock effects. |

Test names are prefixed `rule 5B.x:`. Existing rule IDs S2.x and historical v1 IDs 5.x-8.x
remain unchanged; their v2 stage destinations are now 6-9. Chosen-lawyer prompt style is
implemented in Stage 6 below; voice/TTS settings wait for Stage 9. No live Gemini tests in this stage.

## Stage 1 proofs

These are executable proofs of rules 1.1-1.17 from [rules.md](rules.md), against the v2
[contract](../shared/contract/). Parameterized test names below list their concrete cases.
All server room/socket/integration tests use Redis on 6380. The integration suite uses real
fetch requests, a random-port Fastify + Socket.IO server, and separate cookie jars per player.

| Rule | Test files and proving test names | v2 differences / notes |
| --- | --- | --- |
| 1.1 Identity | [rooms.test.ts](../server/tests/rooms.test.ts): `rule 1.1: create and join establish sessions; leave/ready require one`; [sockets.test.ts](../server/tests/sockets.test.ts): handshake suite; [lobby.test.ts](../server/tests/integration/lobby.test.ts): `rule 1.1: socket survives token expiry; HTTP and reconnect recover only after refresh` | Own JWT/rotating-refresh cookies replace Supabase anonymous auth. Socket auth is connect-only. |
| 1.2 Code | [rooms.test.ts](../server/tests/rooms.test.ts): `rule 1.2: generated IDs and codes use the required formats and alphabet`, `rule 1.2: code collision retries without overwriting the existing room`, `rule 1.2: five code collisions fail cleanly, without a seat`; [shared rooms tests](../shared/tests/rooms.test.ts): `has an alphabet of 32 unique symbols, all of which are valid` | Six independent crypto.randomInt draws; five collision attempts, then 503. |
| 1.3 Expiry | [rooms.test.ts](../server/tests/rooms.test.ts): `rules 1.2-1.3: hashes and code pointers are retained until expiry plus 24h; player has no TTL`, `rule 1.3: Redis time, not Node time, determines creation and snapshot time`, `rule 1.3: configurable lifetime also rejects create's expired response snapshot`, `rule 1.3: expired room rejects read/join/leave/ready without mutation` (four cases) | Fixed 24h, Redis TIME; expired hashes and code pointers retained for another day for 410 responses. Tests inject -1ms lifetime, never wait 24h. |
| 1.4 One seat/create retry | [rooms.test.ts](../server/tests/rooms.test.ts): `rule 1.4: create retry returns the same seat, name, version and room`, `race rules 1.4, 1.6: parallel creates by one identity yield one room` | Same behavior; player pointer enforces membership. |
| 1.5 Expired seat release | [rooms.test.ts](../server/tests/rooms.test.ts): `rule 1.5: expired seat is released on create/join, historical room retained` (two cases) | Deletes the player pointer, retaining expired room fields unchanged; v1 also cleared historical auth/ready/presence fields. Expired rooms remain unreadable in either design. |
| 1.6 Serialization | [rooms.test.ts](../server/tests/rooms.test.ts): `race rules 1.4, 1.6: parallel creates by one identity yield one room`, `race rule 1.6: create and join by the same identity result in one seat`, `race rule 1.6: leave and create serialize without detaching a newer seat` | Redis Lua plus pointer re-check/retry replaces Postgres locks. |
| 1.7 Seats A/B, max two | [rooms.test.ts](../server/tests/rooms.test.ts): `rule 1.7: A creates, B joins, a third identity is refused`; [shared rooms tests](../shared/tests/rooms.test.ts): `rejects 0 or 3 players`, `rejects B before A, and B alone` | Same behavior, explicit ordered strict snapshots. |
| 1.8 Join precedence | [rooms.test.ts](../server/tests/rooms.test.ts), `join precedence (rule 1.8)` suite: `malformed code precedes name and room checks`, `nonexistent room precedes current membership`, `expiry precedes membership and closure`, `already my room precedes closed/full and keeps original name`, `target errors do not release an expired current seat`, `expired current seat is released before closure is checked`, `live current membership precedes closed/full`, `closed precedes full` (all prefixed `rule 1.8:`) | No v1 room-header guard on join. Presence is refreshed by sockets, not repeated join. |
| 1.9 Join race | [rooms.test.ts](../server/tests/rooms.test.ts): `race rules 1.7, 1.9: 20 parallel joins yield one success and 19 ROOM_FULL` | Stronger concurrency test than v1's two joiners. |
| 1.10 Names | [rooms.test.ts](../server/tests/rooms.test.ts): invalid-name cases through both APIs and `rule 1.10: trims names and counts Unicode code points on both APIs`; [shared rooms tests](../shared/tests/rooms.test.ts): `uses JavaScript Unicode trim rather than SQL's ASCII-space btrim`, `checks control characters before trimming (as v1 does)` | JS trim removes surrounding Unicode whitespace; SQL btrim defaults to ASCII space. The v1 HTTP route already used JS trim; this differs from direct SQL RPC behavior. Raw Cc controls are rejected before trimming. |
| 1.11 Presence | [sockets.test.ts](../server/tests/sockets.test.ts): `B connecting/disconnecting changes A's equal-version snapshot and clears the key`, `closing one of two tabs keeps presence; closing the last clears it`, `refreshes a 35s key every 10s while open, and stops refreshing after disconnect`; [lobby.test.ts](../server/tests/integration/lobby.test.ts): full lobby flow | Socket connection/10s refresh/35s TTL replaces heartbeat and last_seen. Final-tab disconnect is immediate. Crash-expiry push is deferred to the multi-server sweeper. Presence does not bump version; equal-version snapshots are accepted. |
| 1.12 bothReady | [rooms.test.ts](../server/tests/rooms.test.ts): `rules 1.12-1.13: bothReady requires both seats, readiness and presence`; [lobby.test.ts](../server/tests/integration/lobby.test.ts): `rules 1.1, 1.11-1.15: full lobby, disconnect, reconnect, leave and closed-room rejection` | Same conjunction; socket pushes replace polling. |
| 1.13 Own readiness | [rooms.test.ts](../server/tests/rooms.test.ts): `rule 1.13: readiness changes only your own seat; repeated value is a no-op`, invalid/missing readiness cases; [lobby.test.ts](../server/tests/integration/lobby.test.ts): `rules 1.13, 1.17: two tabs receive identical updates for the same player` | Readiness does not refresh presence; unchanged ready value is a version/event no-op. |
| 1.14 Leave | [rooms.test.ts](../server/tests/rooms.test.ts): `rules 1.14-1.15: A/B leaves, name stays, remaining player reads closed room` (two cases), `rules 1.14, 1.16: stale/delayed leave and readiness cannot detach or mutate a newer room`; [sockets.test.ts](../server/tests/sockets.test.ts): leaver's tabs receive null test | Expected roomId is in the URL, not body/header. A departed identity's sockets receive `{ room: null }`. |
| 1.15 Closed room | Same A/B leave tests plus [lobby.test.ts](../server/tests/integration/lobby.test.ts) full lobby/closed-room rejection | Same behavior: retained name/seat; no replacement joiner; remaining player can read. |
| 1.16 Stale tabs | [rooms.test.ts](../server/tests/rooms.test.ts): `rules 1.14, 1.16: stale/delayed leave and readiness cannot detach or mutate a newer room`, `rules 1.16-1.17: outsider learns nothing; no-room leave is a no-op` | URL roomId is checked against the player pointer under Lua, replacing x-quarrel-room-id. A caller with no seat gets 404 for ready; leave is idempotent success. |
| 1.17 Privacy | [rooms.test.ts](../server/tests/rooms.test.ts): outsider test and raw-JSON assertions in every snapshot helper; [sockets.test.ts](../server/tests/sockets.test.ts): `all tabs receive their player's view, without room-wide channel membership` and afterEach assertions on every pushed payload; [shared rooms tests](../shared/tests/rooms.test.ts): extra-key rejection tests | Explicit per-player mapper and strict schemas replace RLS. Raw JSON checks reject complete internal IDs (a random room ID can contain the incidental substring p_). |

## Coverage enforcement

`npm run test:coverage` enforces each workspace separately: statements/lines/functions >=90%,
branches >=85%, for all server and shared TypeScript source. Ported AI and executable entry
points remain included. Type-only modules and declarations have no executable statements.
`server.deps.inline` keeps the shared workspace in Vitest's measured module graph. UI helper
tests run in their own Node project; UI source is outside the requested server/shared coverage.

## Audit at Stage 1E

`npm audit --json` on 2026-11-18 reported 0 vulnerabilities, including 0 high-severity
advisories. The earlier 1D install warning is no longer reproduced by the current lockfile.
No audit fixes or direct-major upgrades were needed; only the approved UI socket.io-client
dependency was added in this sub-stage.

| High advisory/package | Dependency path | Fix available | Action |
| --- | --- | --- | --- |
| None reported | N/A | N/A | No fixes required; no force command used |


## Stage 5C: game screen regression proof

| Behaviour | Test proof |
| --- | --- |
| Snapshot phase / Home recovery / settings access | ui/tests/game.test.ts: the whole shell follows room/null/error state, with settings in every phase and no debug lobby |
| Create/join validation and API errors | ui/tests/game.test.ts: validates create/join before HTTP and sends normalized inputs through the real API helper; explains ROOM_FULL / ROOM_EXPIRED / ROOM_NOT_FOUND / ROOM_CLOSED from the server |
| Position editing / ready / opponent visibility | ui/tests/game.test.ts: waiting has no position/ready controls; positions exposes only your editable box and opponent status |
| Live plan / host Start / server countdown / own-turn send | ui/tests/game.test.ts: planning renders the live plan and openers; Start has actionable disabled reasons and is host-only; countdown follows startsAt; send is enabled only on your live turn and escapes the transcript |
| Ended / closed transcript | ui/tests/game.test.ts: ended retains the transcript without Send; closed rooms explain how to start over |
| Expiry / null / reconnect Home messages | ui/tests/game.test.ts: null snapshots and unrecoverable sessions return Home; connection notices never request a reload |
| Safe retry / clocks / real-server flow retained | ui/tests/debate.test.ts (UUID/raw-text retry and deadline tests); server/tests/integration/lobby.test.ts (lobby/session expiry/two tabs); server/tests/clocks.test.ts (automatic turn pushes) |

S2.7 keeps its existing test name in server/tests/setup.test.ts. It now proves concurrent
request responses plus the final planning/ready hash and exactly two version increments,
then rejects further ready/position writes without changing the hash; no Redis MONITOR.

Reconnect regression proof: ui/tests/client.test.ts covers transport drop/fresh snapshot/version
ordering, failed refresh, inactive socket GET-session recovery, null/session/network outcomes
and disposal during recovery. ui/tests/game.test.ts covers banner visibility/removal, retained
room and clock display, and enabled actions/settings while reconnecting.


## Stage 6: lawyer and private consultations

Tests below are in server/tests/lawyer.test.ts unless another file is named. Rule IDs retain
v1 numbering. Stage 7 summaries/jury flow is implemented in the section below; ported policy tests
continue to guard its output validators.

| Rule | Test proof | v2 behavior / differences |
| --- | --- | --- |
| 5.1 Meaning and length | `rule 5.1: fake AI success uses the chosen personality strictly as a style hint`; `rules 5.1-5.4: invalid AI output ... falls back to the raw text`; ported server/tests/ai/lawyer-engine.test.ts | Existing no-new-claims prompt; min(900, floor(1.5 * raw code-point length)) validator. Meaning preservation is prompted, not a semantic proof. |
| 5.2 No invented numbers/URLs | Invalid AI output cases (new number and URL); ported policy tests | Guard also applies to private consultations in v2. |
| 5.3 Outcome tripwire | `rules 5.3,5.5,5.11: outcome/unsafe raw text bypasses AI and remains an unedited fallback`; invalid Player A wins AI result; ported policy tests | Generated outcome language rejected; participant's raw claim may be published only unchanged as fallback. |
| 5.4 Exact fallback | `rule 5.4: read and poller use the same fenced fallback; late AI completion is ignored`; timed-out provider retry test; finish deadline/stale/closed/expired/missing test | API-independent Redis-time work deadline is 30 s. Two provider attempts at most, then raw/fixed-private fallback. |
| 5.5 Demo | `rules 5.1,5.5,5.12: demo finishes the presentation and publishes without AI`; ported demo length/outcome tests | My point wrapper only when it fits, otherwise unchanged raw text. Auto without credentials is demo. |
| 5.6 Author drafts | `rules 4.1,4.3,5.6-5.9: argument pauses both clocks and exposes only owner records`; exhausted-opponent/next-subtopic/ended test | Private own drafts retained across subtopics/ended. Published fallback can equal raw text; separate unpublished drafts never leak. |
| 5.7 Private consultation | Pause/privacy consult case; real HTTP/Socket.IO demo integration; ui/tests/game.test.ts Stage 6 private lawyer UI group | Opponent sees lawyering, no turn routing or other-seat consult metadata/records/counts/IDs. Only own consultsLeft is sent. |
| 5.8 Owner-bound work | Owner selection/private-context test and Lua ownership/busy test | Trusted worker reads the stored work owner; no client claim/finish endpoint or session-bound RPC. |
| 5.9 Advice only | Consult pause/completion case; consultation cap test | Private answer, same player resumes, no public message. |
| 5.10 Bounded context | `rule 5.10: context keeps eight public messages, own drafts and four answered own consultations only`; ported lawyerContext tests | Explicit owner allowlist; last 8 public messages and own official drafts, last 4 answered own consults only for consult jobs. |
| 5.11 Safety redirect | Unsafe raw and unsafe-consult tests; ported no-provider-call safety tests | Unsafe disputes bypass AI even in demo mode; raw fallback presentation or fixed safety consultation. |
| 5.12 Public worker | Demo worker test and `integration: real queued demo arguments and private consultations reach a complete demo verdict` | Trusted service worker replaces either-player browser worker; publishes room-events to existing per-player sockets. |
| Dead worker / no reads | `dead-worker integration: an API-side deadline backstop pushes fallback without reads or a running AI worker` | API and worker share the same idempotent Redis-time tick. No browser polling is needed when the entire worker process stops. |
| Work/job recovery | `lost-job reads re-add a stable lawyer job without duplicates; ordinary broadcasts never enqueue` | Stable three-segment BullMQ ID; explicit reads/socket connect only, not heartbeats/broadcasts. |
| UI and retry | ui/tests/game.test.ts Stage 6 private lawyer UI; ui/tests/client.test.ts typed submit/refresh; ui/tests/debate.test.ts safe UUID retry | Preparing/at-work states, paused clocks, own history/quota/errors, presentation badges and brief same-role speaking animation; no TTS. |

The integration uses real Redis 6380, Fastify on a random port, Socket.IO clients and a BullMQ
worker, with demo generation and snapshot waiters/timeouts. Injected Redis-time test clocks
advance turns without real sleeps. Every client/server/worker/queue/subscriber closes in cleanup.


## Stage 7: summaries, judge and jury (v1 rules 6.1-6.24)

Named tests below are in server/tests/judge.test.ts unless specified. All use Redis 6380,
fakes/demo, default parallel execution; no paid model calls. Summary/jury Lua and stable job IDs
replace v1's SQL queue; one current room work item plus BullMQ's job lock owns execution.

| Rule | Test proof | v2 interpretation/difference |
| --- | --- | --- |
| 6.1 One job / claim | `read recovery deduplicates stable job IDs and never recovers retry_required`; `jury claim fencing and wrong-round completion cannot overwrite the current attempt` | BullMQ FIFO/default worker concurrency 1, stable per-room-work IDs; claim tokens fence stalled attempts. |
| 6.2 Deadline | `summary entry once, random work and observed-time deadline; no clock charging` | 30s from observation, not v1 20s or claim-reset. Jury has no deadline. |
| 6.3 Lease fence | `summary claim fence, exactly once, four seconds, anchored next turn`; `jury claim fencing and wrong-round completion cannot overwrite the current attempt` | Random work/claim IDs; jury attempt round replaces revision/debate IDs. |
| 6.4 Non-jury fallback | `read/poller recovers timed-out summary and ignores late result` (parameterized); `bounded summary and jury calls time out without provider details`; Stage 6 lawyer fallback tests | Shared Redis catch-up and bounded worker calls. |
| 6.5 Late results | Summary and jury claim-fence tests above; deadline late-result tests | Lua ignores stale results and duplicates. |
| 6.6 Fixed codes only | `unknown provider errors become fixed codes; attempts survive missing-job recovery`; shared judgment strict contract | Only the eight fixed codes enter room state/BullMQ errors. |
| 6.7 One summary | `summary entry once, random work and observed-time deadline; no clock charging`; stable ID recovery test | Concurrent catch-up changes once; job ID summary:room:ordinal. |
| 6.8 Public summary context | `allowlisted public-only context; Unicode bounded fallback agrees with Lua`; fake summary validation tests | No drafts, consultation records or workText in judge input. Current-topic public presentations only. |
| 6.9 Format / tripwire | `summary invalid/throw/success gets validated, retried once then labelled` (parameterized); server/tests/ai/concise-summary.test.ts and lawyer-engine.test.ts; shared/tests/judgment.test.ts | Reuses ported 2-3 sentence, 70-word, 700-code-point and outcome validation. |
| 6.10 Fallback | Parameterized read/poller fallback; Unicode bounded fallback test | Literal unverified excerpts, <=230 code points/22 words each (within 430); leaves space for labels and both sides. |
| 6.11 Four-second display | `summary claim fence, exactly once, four seconds, anchored next turn`; ui/tests/judgment.test.ts `summary card labels sources, pauses clocks and animates the judge for showUntil` | showUntil Redis timestamp, next turn anchored there. |
| 6.12 Last summary -> jury | `last summary enters jury without deadline; canonical demo finishes once for both players`; full demo integration below | Stable jury:room:round job. |
| 6.13 Public jury context | `a fake AI verdict cites real own presentations and attaches only canonical summaries`; public-only context test; ported lawyer-engine context tests | Entire public transcript/summaries only, no private fields. |
| 6.14 Strict verdict | Fake AI verdict test; `reject missing-side/foreign-citation/bad-shape/invented-summaries without fabricating a verdict`; shared judgment strict test | Canonical topic/positions supplied server-side, strict ported findings plus source/summary contract. |
| 6.15 Both sides required | `reject missing-side without fabricating a verdict`; ported lawyer-engine `cannot declare a winner or tie when either side made no public submission` | Conclusive includes tie; both public presentations required. |
| 6.16 Own real citations | `reject foreign-citation without fabricating a verdict`; valid fake AI test; ported lawyer-engine existing-public-reference test | Real S<ordinal>-P1L1M... / P2L2M... public labels; no private counter. |
| 6.17 Canonical summaries | `missing canonical summaries is SUMMARIES_NOT_READY`; valid fake AI test; invented-summaries rejection | Lua attaches saved summaries; model cannot supply them. |
| 6.18 Complete once / identical | `last summary enters jury without deadline; canonical demo finishes once for both players`; jury claim-fence test; real demo integration | phase/state complete, no archive yet. |
| 6.19 No failure verdict | `unknown provider errors become fixed codes; attempts survive missing-job recovery`; bounded failure/manual retry test | No fallback verdict for provider failures. |
| 6.20 Retry policy | `real BullMQ performs three attempts with fixed 5s/15s backoff, ignoring provider retryAfter`; parameterized quota/missing-configuration UnrecoverableError tests | Exactly 3 claims per round; no provider-detail log. Demo/safety now explicit successful nonjudgments. |
| 6.21 Manual retry | `bounded failures, either seat retry, pending guard and Redis cooldown`; `membership, closure and expiry are rechecked for manual retry`; UI cooldown test | Redis TIME 60s between manual retries, new round, either active seat. |
| 6.22 Worker downtime | Last-summary jury/no-deadline test; pending-only read recovery test | No jury work deadline at all; waits in BullMQ. |
| 6.23 Demo decision (override) | Canonical demo/identical verdict test; server/tests/lawyer.test.ts `integration: real queued demo arguments and private consultations reach a complete demo verdict`; UI label test | Replaces v1 failure: inconclusive/split/source demo, "Demo verdict, not a real judgment", per-topic entries from saved summaries, no invented findings. |
| 6.24 AI time free | Summary clocks/observed-time test; four-second anchored-next-turn test; jury no-deadline test; Stage 6 pause tests | No player clock runs in summary/jury. |

**v1 open question 2 decision:** unsafe disputes bypass AI and save fixed inconclusive/split/source
safety, proved by `v2 safety decision: unsafe public dispute skips AI and saves fixed inconclusive
verdict` and the UI demo/safety-label test. This and demo 6.23 are intentional v2 replacements.
Public summary/verdict data is identical between players; their separate private notes remain
owner-only through complete, proved by the real full demo HTTP/Socket.IO/BullMQ/pub-sub test.


## Stage 8: archives, results and rematch (rules 7.1-7.9)

All named server tests below are in server/tests/results.test.ts, against Redis 6380 and
Postgres 5433. Migrations use their own fresh temporary database and SQL rows are test-owned.

| Rule | Test proof | v2 behavior |
| --- | --- | --- |
| 7.1 Archive per debate | `concurrent duplicate archives write one public record and both seats, then mark archivedAt once`; `failed transaction rolls back and a retry archives; read recovery re-adds the missing job`; `real archive queue uses stable IDs, retry backoff and publishes archivedAt`; `public outbox survives deletion of the live room before the SQL write` | Immutable public outbox at completion, SQL transaction/ON CONFLICT, retries independent of room retention. |
| 7.2 Participant visibility | `participants get NOT_READY before archive; outsiders cannot distinguish pending, unknown or archived IDs` | Participant SQL join on list/get/ack, still accessible after leave/Redis deletion. |
| 7.3 List ordering/limit/filter | `newest-first, at most 100, and room filtering are enforced in SQL` | 103 seeded test records, descending completion time/ID, 100 maximum, strict optional roomId. |
| 7.4 Detail/privacy/readiness | `a participant cannot read an unfinished debate yet; unauthenticated requests fail`; pending/outsider test; public-record/outbox tests | Public transcript/summaries/verdict only; NOT_FOUND conceals outsiders, actual participants alone get NOT_READY. |
| 7.5 Ack | `acknowledgements keep the first timestamp, are independent and still work after Redis deletion`; ui/tests/results.test.ts `reviewed timestamp, read-not-agreement wording and action-local errors` | First Postgres timestamp preserved; not agreement. |
| 7.6 Both rematch requests | `first request waits, repeat is a no-op, second clears only debate state and preserves archived result`; `simultaneous requests create exactly one new debate; closed and stale requests are rejected` | Atomic Lua, one fresh debate, seat flags pushed to both. |
| 7.7 Seated/current | Concurrent/closed/stale test above; `prior-debate plan and judge jobs cannot affect a rematch` | ROOM_CLOSED / STALE_DEBATE; debate-scoped queue IDs and save/read fences. |
| 7.8 Reset (v2 override) | First-request/reset test above; ui/tests/results.test.ts rematch callback/reasons test | Keep theme/topic/duration/names/seats/cosmetics; new positions and readiness, clear all debate data/deadlines; no revision numbers. |
| 7.9 Old result retained | Reset test above; `a rematch can start before SQL archives the immutable previous debate` | Old public archive survives both rematch and room TTL, results served from SQL only once saved. |

Infrastructure proof: server/tests/migrations.test.ts `fresh database, idempotence, failed-file
rollback and concurrent startup lock`; config/health tests exercise DATABASE_URL and SELECT 1.
Shared results tests prove strict request/list/detail shapes and the 100 cap. UI results tests
cover list/detail/empty/error/loading, review/rematch actions and session refresh through API
helpers. No live AI or new UI library; default parallel coverage thresholds are unchanged.
