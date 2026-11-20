> Describes Quarrel v1 (original repo, ../quarrel-v1); used as the reference and spec for v2.

# Game rules (v1 reference)

Every rule v1 enforces, taken from `supabase/migrations/*.sql` (the source of truth) and the
TypeScript that sits next to it (`src/server/room-api.ts`, `lawyer-policy.ts`, `judge-engine.ts`,
`judge-worker.ts`, `speech-*.ts`). One table per v2 stage. Anything the code does not make clear
is marked **UNCLEAR** and listed under Open questions.

**How to read the columns**

- **v1 source**: migration file (short name) + SQL function, or a TS file. Short names:
  `rooms` = `202611070001_stage2_rooms.sql`, `themes` = `…0002_stage25_themes.sql`,
  `stage3` = `…182430_stage3_debate_engine.sql`, `stage4` = `…190351_stage4_interactive_judge.sql`,
  `leave` = `…195302_leave_rooms.sql`, `stage5` = `…215110_stage5_lawyer_debate.sql`,
  `stage6a` = `…235910_stage6a_reliability.sql`. A later migration that redefines a function wins;
  the newest definition is cited.
- **Test**: pgTAP file › assertion description (from `supabase/tests/database/`), an integration
  suite (`test:lawyer #9` = the 9th `PASS` line in `tests/db/lawyer.integration.mjs`), or a unit
  test in `tests/`. "None found" means no assertion with a matching description was found.
  `test:lawyer` numbering assumes the opt-in speech checks are off (`QUARREL_TEST_SPEECH` unset),
  as in CI. `test:api` doesn't number its checks, so those are cited by their text.
- **Port**: **yes** = rebuild in v2 (Redis + Lua + TS); **v1-only** = compatibility or
  Postgres/Supabase-specific mechanism that v2 replaces or drops; **unclear** = needs a decision.

"Read" below means any request that builds a snapshot: `session`, `heartbeat`, `lawyer/advance`,
and every mutation (they all end by returning the snapshot).

---

## Stage 1: rooms and presence (17 rules)

| # | Rule | v1 source | Test | Port |
|---|---|---|---|---|
| 1.1 | Every caller is a verified anonymous user. `create`/`join` create one if there is no session; other actions return 401 | `room-api.ts` `identity()` | `rooms.sql` › "Missing session identity is rejected"; `test:api` "refresh recovery and actual token renewal retain each player seat" | yes (new session mechanism) |
| 1.2 | Room code: 6 characters, uniformly random from 32 symbols (A–Z without I and O, digits 2–9); regenerate on collision | `rooms` `create_quarrel_room` | `rooms.sql` › "Code is six unambiguous characters" | yes |
| 1.3 | A room expires exactly 24 h after creation. Activity never extends it. After expiry it can't be read (`ROOM_EXPIRED`, 410) or changed | `rooms` table default; `leave` `lock_member_room` | `rooms.sql` › "Expired room cannot be read through RPC", "Expired room cannot be mutated"; `themes.sql` › "Expired-room theme mutation is rejected" | yes |
| 1.4 | One current seat per identity. `create` while seated returns the existing room instead of making another | `rooms` `create_quarrel_room`; `stage5` `create_quarrel_lawyer_room` | `rooms.sql` › "Retry does not create another room"; `lawyer.sql` › "Create retry retains same seat"; `leave.sql` › "Exactly one current identity membership" | yes |
| 1.5 | An expired seat is released (detached, kept as a record) on the next `create`/`join`, so the player can start fresh | `leave` `prepare_player` | `rooms.sql` › "Player may start fresh after expiry" | yes |
| 1.6 | Create, join and leave for the same identity are serialised, so concurrent calls can't create two seats | `leave` `prepare_player` (advisory lock on user id) | `test:leave #4` (same browser, no extra account). No direct concurrency assertion found | yes |
| 1.7 | The creator is slot A (host), the joiner is slot B. At most 2 seats | `rooms` `create_quarrel_room`, `leave` `join_quarrel_room` | `rooms.sql` › "Creator is player A", "Joiner is player B"; `themes.sql` › "Theme support does not permit a third player" | yes |
| 1.8 | Join checks, in order: valid code → room exists → not expired → room header matches → already my room (refresh presence, keep the original name) → `ALREADY_IN_ROOM` → `ROOM_CLOSED` (a seat was vacated) → `ROOM_FULL` | `leave` `join_quarrel_room` | `rooms.sql` › "Malformed code rejected", "Nonexistent code rejected", "Joining again does not replace the established name"; `leave.sql` › "Departed slot cannot be replaced" | yes |
| 1.9 | Two concurrent joiners: exactly one wins, the other gets `ROOM_FULL` | `leave` `join_quarrel_room` (room row lock) | `test:supabase #2` | yes |
| 1.10 | Display name: trimmed, 1–32 code points, no control characters | `leave` `prepare_player`; `room-api.ts` | `rooms.sql` › "Whitespace name rejected", "Long name rejected", "Control characters rejected", "Display name is trimmed" | yes |
| 1.11 | Presence: a player is `connected` if their `last_seen` is within 35 s. Heartbeat, ready and join refresh it. The client heartbeats every 10 s | `stage3` `get_quarrel_room` (via `stage4_room_snapshot`); `leave` `heartbeat_quarrel_room`; `room-client.ts` | `rooms.sql` › "Stale heartbeat marks A disconnected", "Recovered session restores connection"; `test:supabase #15` | yes (TTL presence key) |
| 1.12 | `bothReady` = two seats, both ready and both connected | `get_quarrel_room` | `rooms.sql` › "Both ready produces confirmation", "Disconnected ready player cannot confirm start" | yes |
| 1.13 | Each player sets only their own readiness; `null` is rejected | `stage5` `set_quarrel_ready` | `rooms.sql` › "Changing B never changes A readiness", "Null readiness rejected" | yes |
| 1.14 | Leave: the body's `roomId` must be the current room (`STALE_ROOM` otherwise). The identity is detached; the seat keeps its name; ready is set false and connected false; returns no room. A repeat is a no-op, and a delayed leave can never detach a newer room | `leave` `leave_quarrel_room` | `leave.sql` › "Wrong expected room cannot detach current seat", "Leave retry before next room is idempotent", "Delayed leave cannot detach new room", "Historical slot is retained"; `test:leave #3` | yes |
| 1.15 | A room with a vacated seat is closed to new joiners (`ROOM_CLOSED`). The remaining player can still read it. A departed player can't read it any more | `leave` `join_quarrel_room` | `leave.sql` › "Existing peer can recover closed room", "Departed member cannot read old room through RLS" | yes |
| 1.16 | Stale-tab guard: if `x-quarrel-room-id` differs from the caller's current room, raise `STALE_ROOM` under the room lock. The header never grants access | `leave` `check_room_request`, `lock_member_room` | `leave.sql` › "Stale readiness rejected under lock", "Stale heartbeat cannot update new room", "Correct room header allows authorized change"; `lawyer.sql` › "Room header never grants outsider access" | yes |
| 1.17 | Outsiders see nothing about a room. Snapshots never contain auth user IDs | `get_quarrel_room`; RLS policies | `rooms.sql` › "Snapshot does not expose auth IDs", "Outsider cannot see private rooms", "Outsider cannot forge a heartbeat" | yes |

## Stage 2: setup (14 rules)

| # | Rule | v1 source | Test | Port |
|---|---|---|---|---|
| 2.1 | Every new room is a lawyer room (current game, reliability version 2) | `stage6a` `create_quarrel_lawyer_room_v2` | `stage6a.sql` › "Stage6 room explicitly uses strict backend" | yes (only mode) |
| 2.2 | New rooms default to the Courtroom theme, unlocked | `stage5` `alter … default 'courtroom'` | `themes.sql` › "New room defaults to Courtroom", "New room theme starts unlocked" | yes |
| 2.3 | Theme: host only, one of the 4 canonical IDs, only while not locked. Changing it never changes readiness | `leave` `set_quarrel_theme` | `themes.sql` › "Player B cannot change the theme", "Unknown theme ID rejected by the database", "Host cannot change a locked theme", "Theme changes preserve readiness and a ready lobby is not locked" | yes |
| 2.4 | Topic: host only; 1–240 code points; no control characters; duration one of 120/240/360/600 s per player; only before start; must send the current `revision` | `stage5` `propose_quarrel_lawyer_topic` | `lawyer.sql` › "Guest cannot edit topic/duration", "Topic increments revision" | yes |
| 2.5 | Setting the topic increments `revision`, **clears both positions and confirmations**, discards any plan (`planReady=false`, regeneration reset, generation 0), returns to `setup`, and resets both players' readiness | `stage5` `propose_quarrel_lawyer_topic` | `test:lawyer #2`. No pgTAP assertion found for the position clearing | yes |
| 2.6 | Position: each player writes only their own (slot from the session); 1–600 code points; multi-line allowed; needs a topic first (`DEBATE_NOT_READY`) | `stage5` `set_quarrel_lawyer_position` | `lawyer.sql` › "Host writes only A position", "Guest edits only B position", "Old proposal cannot write peer position" | yes |
| 2.7 | Saving a position confirms it for that player, increments `revision`, discards any plan and resets **both** players' readiness | `stage5` `set_quarrel_lawyer_position` | `lawyer.sql` › "Both positions confirmed independently" | yes |
| 2.8 | Every setup change must carry the current `revision` (`STALE_REVISION` otherwise) | `stage5` topic/position/plan/start functions | `lawyer.sql` › "Stale position edits rejected" | yes |
| 2.9 | Both confirmed positions are visible to both players | `stage5` `lawyer_snapshot` | `lawyer.sql` › "Guest sees submitted host position" | yes |
| 2.10 | `ready: true` needs a topic and your own confirmed position (`DEBATE_NOT_READY`). `ready: false` is always allowed before start | `stage5` `set_quarrel_ready` | `lawyer.sql` › "Cannot ready without own position" | yes |
| 2.11 | Start: host only; `revision` and `planGeneration` must match; plan ready; both positions confirmed; both seats occupied, ready **and connected** (35 s) | `stage5` `start_quarrel_lawyer_debate` | `lawyer.sql` › "Cannot start without saved plan", "Old Start cannot accept regenerated plan"; `test:lawyer #5` | yes |
| 2.12 | Start atomically locks the theme, records `startedAt` and opens subtopic 1 | `stage5` `start_quarrel_lawyer_debate` | `lawyer.sql` › "Theme locked atomically", "Explicit start begins A clock" | yes |
| 2.13 | After start, topic, positions, readiness and theme are frozen (`DEBATE_STARTED`, `THEME_LOCKED`) | `stage5` setup functions; `set_quarrel_ready`; `set_quarrel_theme` | `lawyer.sql` › "Own positions locked after start", "Ready cannot affect running debate", "Started theme cannot change" | yes |
| 2.14 | Mutations in one room are serialised (room row lock) | `leave` `lock_member_room` (`FOR UPDATE`) | Implicit in all concurrency tests (`test:lawyer #4`, `#7`) | yes (Lua atomicity) |

## Stage 3: planner (11 rules)

| # | Rule | v1 source | Test | Port |
|---|---|---|---|---|
| 3.1 | **Automatic planning:** when any response shows `phase=setup`, `bothReady` and both positions confirmed, the server immediately starts planning. The UI never requests the first plan | `room-api.ts` L330–335 → `stage5` `prepare_quarrel_lawyer_plan` | `lawyer.sql` › "Both-ready planning begins"; `test:lawyer #4` | yes |
| 3.2 | Planning is reserved once per revision: a second non-regenerate request while `planning` is a no-op | `stage5` `prepare_quarrel_lawyer_plan`, `lawyer_queue` (unique label) | `lawyer.sql` › "Repeated plan request does not duplicate" | yes |
| 3.3 | The database's planning precondition is: topic, both confirmed, both seats occupied and ready. It does **not** require connection (the automatic trigger does, through `bothReady`) | `stage5` `prepare_quarrel_lawyer_plan` | `lawyer.sql` › "Planning requires both ready" | yes |
| 3.4 | Regenerate: host only, at most once per revision, only once a plan is ready. Increments `planGeneration` from 0 to 1 | `stage5` `prepare_quarrel_lawyer_plan` | `lawyer.sql` › "Only host regenerates", "Regeneration records use", "Second regeneration rejected" | yes |
| 3.5 | Plan validation: 2–5 subtopics; ordinals exactly 1..n; questions distinct (ignoring case), ≤200 characters, safe text; `secondsPerPlayer` an integer from 30 to 600; **total equals `totalSeconds` exactly**; no extra keys. Invalid output changes nothing | `stage5` `lawyer_finish`; `lawyer-policy.ts` `validateLawyerResult` | `lawyer.sql` › "Plan time total validated", "Malformed/unsafe planner output rejected without state change"; `lawyer-engine.test.ts` "enforces exact plan time…" | yes |
| 3.6 | The server assigns openers: odd subtopics open with A, even ones with B | `stage5` `lawyer_finish` | `lawyer.sql` › "Alternating openers saved by server", "Second subtopic starts with B" | yes |
| 3.7 | Each subtopic starts with both clocks at `secondsPerPlayer` | `stage5` `lawyer_finish` | `lawyer.sql` › "B still has full allocation" | yes |
| 3.8 | The plan is saved and shown to both players before Start (`planReady`) | `stage5` `lawyer_finish` | `lawyer.sql` › "Plan saved before Start" | yes |
| 3.9 | Fallback plan (AI unavailable or lease expired): 2 subtopics, `totalSeconds/2` (rounded down) and the remainder, with generic questions built from the topic | `stage5` `lawyer_fallback` | None found for the SQL fallback | yes |
| 3.10 | Demo plan: 2 fixed prompts with the same split | `lawyer-policy.ts` `deterministicLawyerResult` | `test:lawyer #4` (demo run) | yes |
| 3.11 | Start must name the plan generation the host saw (`STALE_PLAN`) | `stage5` `start_quarrel_lawyer_debate`; `room-api.ts` | `lawyer.sql` › "Old Start cannot accept regenerated plan" | yes |

## Stage 4: turns and clocks (14 rules)

| # | Rule | v1 source | Test | Port |
|---|---|---|---|---|
| 4.1 | Chess clock per subtopic: each player has their own allowance. Only the active player's clock runs, and only while `composing` | `stage5` `lawyer_next_writer` | `lawyer.sql` › "Explicit start begins A clock", "Inactive B clock untouched" | yes |
| 4.2 | Opening a subtopic posts the announcement "Subtopic n: question" and starts the opener's clock | `stage5` `lawyer_open_subtopic` | `test:lawyer #9` | yes |
| 4.3 | On submit (argument or consultation), the player is charged up to the submit instant (`remaining = min(remaining, deadline − now)`), then **both clocks stop** (`state` = lawyering/consulting, no deadline) | `stage5` `lawyer_submit` | `lawyer.sql` › "Official submit pauses both clocks", "Consultation pauses writing clock"; `stage6a.sql` › "Lawyer work pauses writing clocks", "Refresh does not reset paused clocks" | yes |
| 4.4 | When a presentation is saved, the turn passes to the opponent if they have time left, otherwise back to the same player. The clock resumes **at the completion time**, so AI time is never charged | `stage5` `lawyer_finish` → `lawyer_next_writer` | `lawyer.sql` › "Opponent clock starts only after committed presentation", "AI time consumes neither clock"; `stage6a.sql` › "Saved lawyer presentation starts opposing clock" | yes |
| 4.5 | When a consultation is answered, the **same** player resumes | `stage5` `lawyer_finish` | `lawyer.sql` › "Consultation resumes same player" | yes |
| 4.6 | Expiry: when the active clock reaches its deadline, its remaining time is set to 0 and the turn passes. The next deadline is anchored to the **old deadline**, not to when someone noticed | `stage6a` `reconcile_lawyer` | `lawyer.sql` › "One exhausted clock transfers remaining time to peer", "Delayed read does not extend opposing clock" | yes |
| 4.7 | A subtopic ends only when **both** clocks are at zero; then the phase becomes `summary` | `stage5` `lawyer_next_writer` | `lawyer.sql` › "Subtopic finishes only after both clocks reach zero"; `stage6a.sql` › "Both clocks must expire before summary" | yes |
| 4.8 | Submit checks, in order: (1) same `requestKey` replay returns the current room, or `LAWYER_REQUEST_CONFLICT` if the content differs; (2) `DEBATE_COMPLETE` / `DEBATE_NOT_STARTED`; (3) subtopic = current (`STALE_TURN`); (4) active slot (`NOT_YOUR_TURN`); (5) `composing` (`LAWYER_BUSY`); (6) deadline not passed (`TURN_EXPIRED`); (7) caps | `stage5` `lawyer_submit` | `lawyer.sql` › "Duplicate request creates no duplicate record", "Nonce cannot change content", "Out-of-turn submit rejected", "Exhausted player cannot send" | yes |
| 4.9 | Caps per player per subtopic: 12 official presentations and 2 consultations (`LAWYER_LIMIT_REACHED`, 429) | `stage5` `lawyer_submit` | `lawyer.sql` › "Official message cap enforced", "Private consultation quota enforced" | yes |
| 4.10 | Reaching a cap neither ends nor extends the clock. The player has to wait it out | `stage5` `lawyer_submit` | `lawyer.sql` › "Cap does not end or extend remaining clock" | yes |
| 4.11 | Message text: 1–600 code points, not blank, no control characters except tab and newline; `requestKey` is a UUIDv4 | `stage5` `lawyer_submit`; `room-api.ts` | `test:lawyer #5` | yes |
| 4.12 | Expiry is applied lazily by any read, which loops until nothing changes (it can catch up several transitions at once) | `stage6a` `reconcile_lawyer`; `get_quarrel_room` | `test:lawyer #9` | yes (mechanism changes: v2 timers) |
| 4.13 | `lawyer/advance` only reads; a client can never force a transition. It must carry the current revision | `stage5` `advance_quarrel_lawyer_debate` | `lawyer.sql` (implicit); `test:lawyer #9` | yes |
| 4.14 | Disconnection never pauses clocks; deadlines keep running | `stage6a` `reconcile_lawyer` (no presence check) | `test:lawyer #9` ("deadlines continue through a disconnected player") | yes |

## Stage 5: UI port

5A art/catalog/stage, 5B own-seat choices/settings, 5C real game screens. Stage 5B test proofs
are in rules-coverage.md. The existing v1 rule IDs below (5.x through 8.x) remain unchanged;
they map to v2 Stages 6-9. Historical v1 stage names and code/test identifiers are unchanged.

## Stage 6: lawyer (12 rules)

| # | Rule | v1 source | Test | Port |
|---|---|---|---|---|
| 5.1 | A presentation must keep the player's meaning. Length ≤ `min(900, floor(1.5 × raw length))` | `stage5` `lawyer_finish`; `lawyer-policy.ts` | `lawyer.sql` › "Lawyer length/role/output fields enforced"; `lawyer-engine.test.ts` | yes |
| 5.2 | AI output may not add numbers or URLs that are not in the raw text | `lawyer-policy.ts` `validateLawyerResult` | `lawyer-engine.test.ts` | yes |
| 5.3 | Outcome-language tripwire: shared AI text may not declare a winner or score (regex). Applies to presentations, summaries, plan questions and jury text | `stage5` `lawyer_safe_text`; `lawyer-policy.ts` `outcomeLanguage` | `lawyer.sql` › "Malformed jury structures and outcome narrative rejected"; `lawyer-engine.test.ts` "keeps participant outcome claims unedited…" | yes |
| 5.4 | Fallback presentation = the raw text unchanged, labelled `fallback`. This is the only text allowed to bypass the tripwire | `stage5` `lawyer_finish`, `lawyer_fallback` | `lawyer.sql` › "Lost worker publishes unchanged text as fallback"; `lawyer-engine.test.ts` "lawyer failures publish exactly the original argument…" | yes |
| 5.5 | Demo presentation: `"My point: <raw>"` if that fits the length rule, otherwise the raw text. Raw text containing outcome language is published unchanged as `fallback` | `lawyer-policy.ts` `deterministicLawyerResult` | `lawyer-engine.test.ts` | yes |
| 5.6 | The raw draft (`rawText`) is visible only to its author, never to the opponent (pending, complete or after the game) | `stage5` `lawyer_message_json` | `lawyer.sql` › "Opponent rawText key absent, including pending state", "Author draft survives refresh", "Opponent draft remains absent after reveal" | yes |
| 5.7 | Consultations are private: shown only to their owner; the opponent sees `state: lawyering` instead of `consulting`; never in public history | `stage5`/`stage6a` `lawyer_snapshot` | `lawyer.sql` › "Opponent never receives private text or message ID", "Opponent receives no consultation metadata" | yes |
| 5.8 | Only the owner's session may process a consultation job | `stage6a` `lawyer_claim_work` (`requested_by = auth.uid()`) | `lawyer.sql` › "Opponent cannot schedule private work", "Even server-capable opponent cannot claim consultation" | yes |
| 5.9 | A consultation is advice only: no official argument, and the turn doesn't pass | `stage5` `lawyer_finish` (consult branch) | `lawyer.sql` › "Private consultation is not an official argument" | yes |
| 5.10 | Lawyer context: the last 8 public messages plus the player's own official drafts. A consultation also gets the owner's last 4 answered consultations. The opponent's consultations are never included | `lawyer-policy.ts` `lawyerContext`; `stage6a` `lawyer_claim_work` | `lawyer.sql` › "Official lawyer context excludes consultations", "Owner worker receives private context"; `lawyer-engine.test.ts` "private consultation receives its owner's history…" | yes |
| 5.11 | Unsafe dispute (threat/abuse regex over topic, positions and messages): the AI is not called. Presentations use the fallback; consultations and summaries get fixed safety text | `lawyer-policy.ts` `lawyerSafetyRedirect`; `judge-engine.ts` `generateLawyerResult` | `lawyer-engine.test.ts` | yes |
| 5.12 | Public lawyer jobs may be processed through either player's session | `stage6a` `lawyer_claim_work` | `lawyer.sql` › "Either member server can process public presentation" | yes (worker) |

## Stage 7: judge and jury (24 rules)

| # | Rule | v1 source | Test | Port |
|---|---|---|---|---|
| 6.1 | One AI job runs per room at a time. Jobs are claimed in creation order | `stage6a` `lawyer_claim_work` | `lawyer.sql` › "Claim is at most once"; `stage6a.sql` › "Parallel worker cannot duplicate a claim" | yes |
| 6.2 | A queued job has a 20 s deadline from queueing; each claim resets it to claim time + 20 s | `stage5` `lawyer_queue`; `stage6a` `lawyer_claim_work` | `stage6a.sql` (implicit) | yes |
| 6.3 | Lease fencing: each claim issues a new `claimToken` and increments `attempts`. Finish and fail must present the current token (`STALE_LAWYER_CLAIM`). A job from an older debate or revision is rejected (`STALE_DEBATE`) | `stage6a` `finish_quarrel_lawyer_work_v2`, `fail_quarrel_lawyer_work` | `stage6a.sql` › "Server-generated attempt token returned", "Forged lease token rejected", "Late first attempt cannot finish a later lease" | yes |
| 6.4 | Non-jury job whose lease or deadline passes, or that fails: a deterministic fallback is saved at once (no retry), and the game continues | `stage6a` `reconcile_lawyer`, `lawyer_fail_attempt` | `lawyer.sql` › "Lease recovery resumes next writer" | yes |
| 6.5 | A late result cannot overwrite a saved result (fallback or real) | `stage5` `lawyer_finish` (`status='complete'` → return) | `lawyer.sql` › "Late completion cannot overwrite fallback"; `stage6a.sql` › "Duplicate summary cannot overwrite canonical history" | yes |
| 6.6 | The worker sends only fixed error codes (`quota_exhausted`, `rate_limited`, `provider_unavailable`, `timeout`, `invalid_response`, `missing_configuration`, `demo_mode`, `unsafe_dispute`), never provider text | `judge-worker.ts`; `stage6a` `fail_quarrel_lawyer_work` | `judge-worker.test.ts` | yes |
| 6.7 | When both clocks hit zero, exactly one summary job is queued for that subtopic, timed from **when it is observed** (offline time is not charged to the AI deadline) | `stage5` `lawyer_next_writer` | `stage6a.sql` › "Exactly one summary per subtopic"; `lawyer.sql` › "One summary per subtopic" | yes |
| 6.8 | Summary context: only that subtopic's public presentations, with no drafts and no consultations | `stage6a` `lawyer_claim_work` (null slot); `lawyer-policy.ts` | `stage6a.sql` › "Judge receives public presentations only"; `lawyer.sql` › "Summary excludes private consultation" | yes |
| 6.9 | Summary format: 2–3 sentences, ≤70 words, ≤700 characters (TS check). The database allows ≤1800 characters | `lawyer-policy.ts`; `stage5` `lawyer_finish` | `concise-summary.test.ts` | yes |
| 6.10 | Fallback summary quotes each side's last public point (≤430 characters each) and labels them unverified | `stage5` `lawyer_fallback` | None found | yes |
| 6.11 | A saved summary stays on screen for 4 s, then the next subtopic opens, anchored at that 4 s mark | `stage5` `lawyer_finish` (`summary_until`); `stage6a` `reconcile_lawyer` | `lawyer.sql` › "Summary stays visible during server interval"; `stage6a.sql` › "Saved summary advances to next subtopic" | yes |
| 6.12 | After the last summary, one jury job is queued | `stage5` `lawyer_open_subtopic` | `lawyer.sql` › "Last summary leads to jury", "One jury record" | yes |
| 6.13 | Jury context: the entire public transcript and summaries; never drafts or consultations | `stage6a` `lawyer_claim_work`; `lawyer-policy.ts` | `stage6a.sql` › "Jury public-only context excludes private drafts and consultations"; `lawyer-engine.test.ts` "keeps all 120 public submissions…" | yes |
| 6.14 | Verdict shape: `source` must be `ai`; `decision` is A/B/tie/inconclusive; `outcome` = decision for A/B, otherwise `split`; `topic` and positions must equal the saved ones; strongest argument per side ≤900; ≤5 weaknesses per side, each ≤600; exactly one `perSubtopic` entry per subtopic, ≤600; `compromise` null or ≤600; no extra keys | `stage6a` `lawyer_finish`; `lawyer-policy.ts` | `stage6a.sql` › "All four result decisions are supported"; `lawyer-engine.test.ts` "rejects missing structured findings…" | yes |
| 6.15 | A conclusive decision (A, B or tie) needs public presentations from **both** sides (TS). The database only requires at least one presentation unless the decision is inconclusive | `lawyer-policy.ts`; `stage6a` `lawyer_finish` | `lawyer-engine.test.ts` "cannot declare a winner or tie when either side made no public submission" | yes |
| 6.16 | Each side's strongest argument must cite one of that side's real public labels, and every cited label must exist | `lawyer-policy.ts` | `lawyer-engine.test.ts` "requires existing public references…" | yes |
| 6.17 | The server attaches the saved summaries to the verdict (`subtopicSummaries`); the model never writes them. All summaries must exist (`SUMMARIES_NOT_READY`) | `stage6a` `lawyer_finish` | `stage6a.sql` › "Canonical verdict includes exact saved summaries" | yes |
| 6.18 | The jury completes exactly once; both players see the identical verdict | `stage5`/`stage6a` `lawyer_finish` | `lawyer.sql` › "Jury completes exactly once", "Both members recover identical verdict"; `stage6a.sql` › "Duplicate finish cannot change verdict" | yes |
| 6.19 | A jury failure never produces a verdict (no fallback verdict) | `stage6a` `lawyer_fail_attempt`; `lawyer-policy.ts` | `stage6a.sql` › "Failure never generates fake verdict"; `lawyer-engine.test.ts` "does not fabricate verdicts…" | yes |
| 6.20 | Automatic jury retries: 3 attempts in total. Wait 5 s after the 1st failure and 15 s after the 2nd; after the 3rd the job is `retry_required`. `quota_exhausted`, `missing_configuration`, `demo_mode` and `unsafe_dispute` go straight to `retry_required` | `stage6a` `lawyer_fail_attempt` | `stage6a.sql` › "Temporary failure schedules bounded backoff", "Backoff prevents immediate duplicate provider call", "Three failures stop automatic requests", "Daily quota failure avoids blind automatic retries" | yes |
| 6.21 | Manual jury retry: either player, phase `jury`, only when the job has failed and isn't scheduled or processing; 60 s cooldown between manual retries; resets `attempts` to 0 | `stage6a` `retry_quarrel_lawyer_jury` | `stage6a.sql` › "Manual retries have a server cooldown" | yes |
| 6.22 | An **unclaimed** jury job whose deadline passes is not failed; its deadline becomes "never" and it waits for a claim | `stage6a` `reconcile_lawyer` | None found | yes |
| 6.23 | In demo mode the jury never produces a verdict: the job fails with `demo_mode` and stays `retry_required` | `lawyer-policy.ts` `deterministicLawyerResult`; `stage6a` `lawyer_fail_attempt` | `test:lawyer #10` | **unclear** (see Q1) |
| 6.24 | AI processing (summaries and jury) never consumes player clock time | `stage5`/`stage6a` (no deadline while in summary/jury) | `stage6a.sql` › "Judge processing consumes no player time", "Jury processing consumes no clock" | yes |

## Stage 8: after the game (9 rules)

| # | Rule | v1 source | Test | Port |
|---|---|---|---|---|
| 7.1 | Every debate session is archived with seats, names, theme, topic, positions, timestamps and verdict. `completedAt` is set once, when the phase becomes `complete` | `stage6a` `lawyer_track_session` trigger | `stage6a.sql` › "One original session and one rematch retained" | yes (Postgres via outbox) |
| 7.2 | Archives are visible only to the two original participants, **even after they leave**. Outsiders can't list, read or acknowledge | `stage6a` `list_/get_/acknowledge_quarrel_lawyer_results` | `stage6a.sql` › "Outsider cannot enumerate results", "Outsider cannot read another debate", "Original participant retains results access after leaving" | yes |
| 7.3 | The list includes completed debates only, newest first, at most 100, optionally filtered by room | `stage6a` `list_quarrel_lawyer_results` | None found for ordering or the 100 limit (`test:stage6a #3` covers unfinished results being hidden) | yes |
| 7.4 | Detail is available only once completed (`RESULTS_NOT_READY`). It contains public history and summaries, never drafts or consultations | `stage6a` `get_quarrel_lawyer_results`, `lawyer_result_json` | `stage6a.sql` › "Historical public record excludes all private data" | yes |
| 7.5 | Acknowledgement: per player, independent, idempotent (the first timestamp is kept). It means "reviewed", not agreement | `stage6a` `acknowledge_quarrel_lawyer_results` | `stage6a.sql` › "Acknowledgement is independent and not agreement", "Repeated acknowledgement preserves timestamp" | yes |
| 7.6 | Rematch needs both original players to request it on the current, completed debate. The first request is recorded; the second creates the new session. Repeats and simultaneous requests create only one | `stage6a` `request_quarrel_lawyer_rematch` | `stage6a.sql` › "One player cannot force a rematch", "Simultaneous/repeated approvals create only one rematch" | yes |
| 7.7 | Rematch requires both original players to still be seated (`ROOM_CLOSED`). A stale `debateId` gets `STALE_DEBATE` | `stage6a` `request_quarrel_lawyer_rematch` | `stage6a.sql` › "Stale old browser" | yes |
| 7.8 | A rematch creates a new `debateId` and `revision+1`, returns to `setup`, clears the topic (duration resets to 240 s), positions, plan, clocks and verdict, resets readiness and **unlocks the theme**. Same room, seats and theme | `stage6a` `request_quarrel_lawyer_rematch` | `stage6a.sql` › "Both approvals create a separate debate session", "Rematch preserves room and theme", "New session contains no old argument, consultation, clock or jury state", "New positions and readiness required", "Old session revisions cannot edit rematch" | yes |
| 7.9 | Earlier verdicts stay available after a rematch | `stage6a` archive table | `stage6a.sql` › "Earlier verdict remains available after rematch" | yes |

## Stage 9: TTS (8 rules)

| # | Rule | v1 source | Test | Port |
|---|---|---|---|---|
| 8.1 | Only complete public messages can be spoken: arguments (lawyer A/B voice); judge summaries, announcements and the jury verdict (judge voice) | `speech-receipts.ts` `attachSpeechReceipts` | `speech-server.test.ts` | yes |
| 8.2 | Each speakable message gets a signed receipt (HMAC, key derived from `JUDGE_SERVER_SECRET`) binding user, room, debate, message, theme, role and exact text, valid 1 h. Playback must match the session user, the room header and the body IDs | `speech-receipts.ts` | `speech-server.test.ts`; `test:lawyer` speech checks (opt-in) | yes |
| 8.3 | Text matching the threat/abuse regex gets `speechBlocked: true` (browser speech too); playback returns 422 | `speech-receipts.ts` | `speech-server.test.ts`, `character-speech.test.tsx` | yes |
| 8.4 | Speech never reads or changes room state, so playback can't advance clocks | `room-api.ts` (speech branch) | `test:lawyer` speech checks: "playback requests do not mutate clocks or text" (opt-in, `QUARREL_TEST_SPEECH`) | yes |
| 8.5 | Limits: ≤4,000 characters; 8 generations per user per 60 s window; ≤4 generations in flight; identical requests share one call; cache 15 min, ≤32 items or 16 MB | `speech-provider.ts` `cachedSpeech` | `speech-provider.test.ts` | yes (**unclear** where state lives, Q8) |
| 8.6 | A separate TTS key is used; there is no fallback to the text key. The model must match `gemini-*tts*`. Timeout 1–30 s (default 20 s) | `speech-provider.ts` `generateSpeech` | `speech-provider.test.ts` | yes |
| 8.7 | Error mapping and `fallbackAllowed`: content blocked and invalid receipt → no browser fallback; others → fallback allowed | `speech-provider.ts`, `speech-receipts.ts` | `speech-server.test.ts` | yes |
| 8.8 | v1 generates speech synchronously inside the API request (the route allows 35 s) | `room-api.ts`; `lawyer/speech/route.ts` | `test:lawyer` speech checks | v1-only (v2 runs TTS in the worker) |

---

## v1-only compatibility and mechanisms (not ported)

| Item | v1 source | Why not ported |
|---|---|---|
| `reliability_version` 1 and every branch that checks it (`stage5_lawyer_finish`, `stage5_reconcile_lawyer`, the v1 `needsWork`/claim filters; v1 rooms gave summary/jury jobs the raw drafts) | `stage6a` | Only for rooms started by pre-Stage-6A deployments. v2 has only the strict (v2) behaviour |
| `claim_quarrel_lawyer_work` (v1) and tokenless `finish_quarrel_lawyer_work` | `stage5`, `stage6a` | Kept so old deployments could finish leases; v2 has one worker implementation |
| Upgrade-on-claim in `claim_quarrel_lawyer_work_v2` | `stage6a` | Upgrades version-1 rooms; nothing to upgrade in v2 |
| `create_quarrel_room`, `create_quarrel_lawyer_room` (non-v2) | `rooms`, `stage5` | Superseded by `create_quarrel_lawyer_room_v2` |
| `assert_legacy_debate`, `LAWYER_FLOW_REQUIRED`, `LAWYER_UNAVAILABLE` guards | `stage5` | They separate legacy and lawyer rooms; v2 has only lawyer rooms |
| `stage4_room_snapshot`, `stage4_set_ready` (copied function bodies) | `stage5` | Migration technique for wrapping old functions |
| Lazy creation of a legacy `debates` row for every room (why lawyer rooms return an empty `debate` object) | `stage3`/`leave` `lock_member_room` | Side effect of the legacy engine (see Q5) |
| Server-capability hash (`judge_settings`, `assert_judge_server`, `judge:setup`) | `stage4` | Lets the browser-session-bound worker prove it is the server. The v2 worker is a trusted internal service |
| RLS policies, grants, `security definer`, the insert/update-only Realtime publication, `current_room_id()` | `rooms`, `themes` | Supabase-specific access control and push. v2 enforces access in the API and pushes over Socket.IO |
| `debate_version` counter as the Realtime trigger | `stage3` onward | Replaced by Socket.IO events (the idea of a version number may still be useful) |
| Archive backfill and `lawyer_track_session`/`lawyer_attach_session` triggers | `stage6a` | Migration and bookkeeping. v2 writes archives explicitly through the outbox |

### Legacy Stage 3/4 debate engine (not ported)

No UI path creates these rooms any more (see agent-docs/reference/v1/contract.md §5.3). Every rule below is **v1-only**,
because the lawyer flow replaced this game.

| Rule | v1 source | Test |
|---|---|---|
| Host proposes topic (≤240) and both positions (≤160 each, different ignoring case); the proposal resets readiness and counts as host approval | `stage3` `propose_quarrel_debate` | `debate.sql` › "Proposal increments revision", "Proposal resets readiness" |
| Guest approves, or requests changes (≤240), which block approval and start until the host proposes again | `stage3` `approve_…`, `request_quarrel_debate_changes` | `debate.sql` › "Change request blocks start", "Reproposal clears change request" |
| Six turns A,B,A,B,A,B: opening, rebuttal 45 s each; questions 30 s each; next deadline chained from the previous one | `stage4` `complete_debate_turn` | `debate.sql` › "First opening deadline is exactly 45 database seconds", "Next deadline chains from old deadline rather than late request time" |
| A missed turn is recorded as `expired` (never fabricated); a long offline gap catches up every missed turn | `stage4` `reconcile_debate` | `debate.sql` › "Heartbeat catches up every missed turn after long offline interval" |
| The opponent's opening is hidden until both openings are done | `stage3` `get_quarrel_room` | `debate.sql` › "Peer snapshot completely conceals opening entry" |
| Judge chat: active player only, 1–600 characters, ≤2 per turn (configurable 1–5), 3 s rate limit, one pending message per room, idempotent by request key, doesn't affect the turn | `stage4` `begin_quarrel_judge_message` | `judge.sql` › "Ask does not end turn", "Ask does not reset clock"; `test:judge #3–4` |
| Before the answer turns, two judge questions are generated; the 30 s answer clock starts only once they are saved | `stage4` `complete_debate_turn`, `finish_quarrel_judge_work` | `judge.sql` › "Generation does not consume player clock", "Question generation leaves full 30 seconds" |
| Expired judge lease → saved fallback reply or fallback questions | `stage4` `reconcile_judge` | `judge.sql` (implicit) |
| Themed scripted announcements at introduction, phase changes and completion | `stage4` `judge_announcement` | `judge.sql` › "Introduction persisted" |
| No winner: the debate ends with a placeholder verdict | `stage3` | `debate.sql` › "Stage 3 does not generate a winner" |

---

## Edge cases worth knowing

1. **Clocks pause during AI work.** Submitting (argument or consultation) charges the player up
   to that instant and removes the deadline. No clock runs while `lawyering`, `consulting`,
   `summary`, `planning` or `jury`. The next clock starts at the moment the AI result (or
   fallback) is **saved**, not when the AI call started.
2. **A clock can't hit zero during a consultation.** Its deadline is removed when the
   consultation is submitted, and the remaining time is stored. Afterwards the same player
   resumes with exactly what was left. If only a few milliseconds were left, the clock expires
   again almost at once.
3. **Expiry is anchored to the old deadline.** When A's clock expires, B's deadline is computed
   from A's original deadline, not from when someone noticed. A late read can't give B extra time.
4. **Nothing happens while nobody is connected.** v1 has no scheduler: deadlines, lease expiry,
   fallbacks and summary timers are applied only when a player's request reads the room. Clients
   poll `lawyer/advance` every 1.5 s during the debate, so in practice it moves on while at least
   one tab is open. If both players are away, every missed transition is caught up on the next
   read. Summary jobs are queued at observation time on purpose, so offline time doesn't count
   against the AI deadline.
5. **Disconnects don't pause anything.** The departed or offline player's clock keeps running
   and passes the turn when it expires. A consultation job can only be processed through its
   owner's session. If the owner disappears, the job hits its 20 s deadline and gets the
   fallback text.
6. **Leaving mid-debate** detaches the seat, but the debate continues for the remaining player.
   The leaver's clocks run out each subtopic. A rematch is then impossible (`ROOM_CLOSED`), but
   both original players keep archive access.
7. **Late AI results are dropped.** Once a job is complete (real or fallback), a later finish
   returns silently without changing anything. A finish carrying an old `claimToken`
   (`STALE_LAWYER_CLAIM`) or an old debate (`STALE_DEBATE`, after a rematch) is rejected.
8. **Retry timing (jury only).** Attempt 1 fails → retry after 5 s; attempt 2 fails → after 15 s;
   attempt 3 fails → `retry_required`. A claimed attempt that times out (20 s lease) counts as a
   failure with code `timeout`. A manual retry resets attempts to 0, with at most one manual
   retry per 60 s. The provider's own `retryAfterSeconds` hint is computed in
   `judge-engine.ts` but **never used**; the database's fixed 5/15 s timing applies.
9. **Non-jury failures never retry.** The plan, presentations, consultations and summaries get
   a deterministic fallback immediately, so the game always moves on. Only the jury waits.
10. **Hitting a cap doesn't speed things up.** After 12 presentations in a subtopic, the player
    can only consult (up to 2) or wait for their own clock to run out.
11. **Editing after planning resets everything.** Any topic or position change increments the
    revision, throws away the plan and regeneration, and unreadies both players. Changing the
    topic also wipes both positions. Stale plan jobs from the old revision stay pending forever
    but are ignored.
12. **Automatic planning can start from any request,** including a heartbeat, the moment both
    players are ready, connected and confirmed.
13. **One room at a time per player.** A second tab that joins or creates another room makes the
    first tab's next action fail with `STALE_ROOM`. That tab then re-reads the session and
    follows the new room.
14. **Room expiry is absolute.** A room expires 24 h after creation even mid-debate or after a
    rematch. The archive survives, because it isn't tied to room expiry.
15. **Opponent privacy in the snapshot:** while you are consulting, the opponent sees
    `lawyering`. `activeSlot` and `turnDeadline` are hidden unless someone is composing.

## Open questions

1. **Demo mode can never finish a game.** In demo mode the jury always fails with `demo_mode`,
   which is not retryable, so a demo game stops at `jury` / `retry_required`. Results,
   acknowledgement and rematch can't be reached without a real Gemini key. The integration test
   asserts this on purpose. Should v2 keep it, or add a clearly labelled demo verdict for
   development?
2. **Unsafe disputes are stuck at the jury.** If the topic, positions or messages match the
   threat regex, the jury is never called (`unsafe_dispute`, not retryable), and manual retries
   fail the same way. The instructions say "the jury must use inconclusive for unsuitable
   disputes", but no path produces that. Intended?
3. **Provider retry hints:** `retryAfterSeconds` is computed but dropped by `judge-worker.ts`.
   Should v2 honour it?
4. **v1 data:** does v2 need to import anything from v1's Postgres (archives in
   `lawyer_sessions`, unexpired rooms), or does it start empty? This decides whether
   `debate/*`, `judge` and the legacy snapshot fields can be dropped server-side.
5. **The empty `debate` object in lawyer rooms:** v1 always returns `room.debate` (phase
   `setup`) and `room.judge: null` for lawyer rooms. Every UI read is optional-chained, so
   omitting them looks safe, but "response JSON must not change" is strict. Keep them or drop them?
6. **Server-driven timers:** v2 plans deadlines in Redis with a worker. v1 only advances while a
   client polls. Should v2 fire deadlines with nobody connected? That's a visible behaviour
   change, for example a summary generated while both players are away.
7. **Error codes:** v1 sends a sentence plus a code only for `STALE_ROOM`/`STALE_DEBATE`/`TTS_*`.
   Must v2 reproduce the exact sentences, or is matching the HTTP status and those codes enough?
   Adding a `code` field to every error would be additive, but it is still a change.
8. **Speech limits are per process** (in-memory cache, per-user limit, in-flight cap). With
   2 API and 2 worker instances, should the cache and limits move to Redis?
9. **Room expiry isn't extended by a rematch or by activity.** Is a fixed 24 h from creation
   intended for v2?
10. **Announcements are labelled `demo`.** The "Subtopic n: …" announcements are saved with
    `source: 'demo'` even in AI mode. A bug, or intended?
11. **Planning preconditions differ:** the automatic trigger requires both players connected
    (`bothReady`), the database function only requires them ready. Which one is the rule?
12. **Jury evidence rule differs:** TS requires presentations from both sides for a conclusive
    decision; the database only requires at least one. v2 should validate in one place. Which
    rule wins (presumably the stricter TS one)?
13. **The access token is exposed to JavaScript** through `realtime.accessToken`, even though the
    cookie is HttpOnly. v2 replaces Realtime, so this field could go. But `room-client.ts` is
    allowed to change, so is dropping `realtime` from the response acceptable?
