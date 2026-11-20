# Frontend

## Stage 5C: game screens and state
- Plain React/CSS with the approved Pixelify Sans/DM Sans fonts, no router/UI/DOM-test library.
  Root.tsx selects #/gallery (offline art preview); every other hash shows the real game.
- game/GameApp.tsx owns session restore, HTTP actions, socket lifetime, drafts, safe message
  retry and monotonic clock anchors. game/GameView.tsx is the display-only shell; HomeScreen
  has create/join forms; RoomScreen selects waiting/positions/planning/debate/ended from the
  snapshot. Transcript remains available after ended or closed. No raw JSON/debug/test lobby.
- Home validates with the shared CreateRoomRequest/JoinRoomRequest schemas in game/actions.ts,
  then calls lib/api.ts. Players see plain messages for full/expired/closed/bad-code errors;
  raw API codes and server detail strings are never rendered.
  Create fixes theme/topic/duration; join immediately sees them. No v1 API hooks were ported.
- Waiting shows the copyable room code; positions offers only your own editable position,
  opponent read-only text and status. Saving changes precedes ready. Unrelated presence
  snapshots do not erase a draft; only a changed saved position or room resynchronizes it.
- Planning shows preparation, then live subtopics/openers. Host-only Start has a disabled
  reason until the plan and both connections exist. Debate shows the current question,
  chosen cast arena, transcript and an own-turn argument box. Ended removes sending controls.
- lib/debate.ts supplies serverNow/startsAt/deadline calculations, using performance.now()
  elapsed since receipt rather than the local wall clock. The 100ms display timer never
  advances server state. Inactive clocks stay still; reduced motion never pauses clocks.
  Send preserves raw text and UUID across network failure; editing text or changing the
  subtopic starts a new attempt. Socket/HTTP snapshots ignore lower versions, accept equal
  presence updates, and a late HTTP reply cannot restore a room after Home recovery.
- lib/api.ts is the only HTTP entry point; all room responses use shared Zod schemas.
  Existing single-flight access refresh + one retry is retained. A terminal session failure
  returns Home with a short error. A null snapshot returns Home with an availability message.
  A dropped socket retains the room, drafts and clock anchor. A small Reconnecting banner
  appears while Socket.IO retries, then disappears on connect; fresh pushes still obey version
  ordering. Actions remain usable during reconnects, with ordinary HTTP errors shown inline.
  An inactive socket checks GET /api/session once per rejection sequence before reconnecting;
  a returned room is applied and retained. Null or an unrecoverable session error returns Home.
  Repeated auth rejection cannot create an HTTP/reconnect loop. Non-session request failures
  keep the room. Cleanup prevents a pending session check from restoring a departed room.
- Settings is reachable in every room phase, including ended (cosmetic choices then disabled).
  Preferences use guarded localStorage. game.css is scoped, switches columns below 900px,
  stacks Home below 650px, supports 320px width, wraps long names/text, and scales readable
  text with the large setting. v1's pixel header, paper panels, hard shadows and arena layout
  were adapted; old confirmation/revision/polling/results/TTS wiring was dropped.
- Stage 6 adds lawyer/consultation controls below; Stage 7 judge/jury summaries; Stage 8 archives;
  Stage 9 TTS. The existing stage artwork stays decorative with no inactive feature buttons.
- API/Redis/Postgres health is a small footer diagnostic only when import.meta.env.DEV is
  true; production builds omit it. Dev Vite (5173) and compose nginx (3000) proxy /api and
  /socket.io to the API without hardcoded origins. Use normal + private windows for two
  identities; normal tabs intentionally share cookies/the same player.
- Node/Vitest uses React SSR phase/shell fixtures, actual control callbacks and typed action
  tests, plus existing API/socket/clock/asset/settings tests. Real-server lobby/expiry/two-tab
  integration tests still exercise the API/socket flow (they did not import temporary views).
  Coverage now also reports UI source; server/shared thresholds remain 90/90/90 and 85 branches.
  Root e2e/ now drives Chromium against the real demo compose stack in two isolated contexts
  at desktop and 320x640. It covers forms/focus, choices/storage, plan/countdown, privacy,
  speech, reconnect, dead-worker fallback, summaries/verdict/results/review/rematch. It stays
  separate from npm test/coverage; see environment.md. Screenshots still need human review.

### Field and action errors
- game/errors.ts maps every shared ErrorCode to a short human message with an exhaustive
  TypeScript Record. Unknown failures use "Something went wrong. Please try again."
- Submit validation uses the shared create/join/position/argument Zod schemas, including
  Unicode code-point lengths and control-character rules. Empty/long/invalid inputs do not
  disable submit: submitting shows feedback. Turn/phase/clock preconditions still apply.
- Field.tsx provides the red border, message, aria-invalid and aria-describedby. The first
  invalid field gets focus after each submit; editing clears that field's error immediately.
  Focus requests are separate from error state so editing another field never steals focus.
- GameApp routes server failures with the action context. Name/topic/code errors belong to
  Home fields; join room-not-found/full/expired/closed errors go under the code. Position and
  position-required errors go under the position editor; rejected input goes under argument.
  State failures appear by Save/Ready/Start/Send/settings/leave, with Start state failures
  used as its disabled reason. Editing clears related stale action errors too.
- Only unassigned/session/server failures use the dismissible top banner. During socket
  retry the only top error banner is Reconnecting; transient connect_error is not reported.
  Existing terminal-session and inactive-socket recovery rules remain unchanged.
- Node tests cover field fixtures, real edit/submit callbacks, focus-target selection and
  focus calls, exhaustive message coverage, server-error placement and quiet socket retries.
  encoding.test.ts also scans repository text for decoding corruption/invalid UTF-8/BOMs;
  see docs/encoding-repairs.md for the complete repair inventory.

## Stage 5A: art, catalog and stage
- shared/config/catalog.ts owns global playerCharacters/lawyers (8 each): id, name, assetId,
  description, personality <=400 code points. Themes retain palette, scenery/judge/jury and
  defaults.characters/defaults.lawyers for A/B. resolveCharacter/resolveLawyer accept choices
  from any theme; unknown IDs fall back to that theme's seat default. Duplicates are allowed.
- Stage 5B now persists own-seat choices until ended; see below. Catalog names/personality belong in settings, not the stage. Gallery
  explicitly previews them. Stage nameplates use player names and generic lawyer labels.
- ui/src/assets/: backgrounds/, characters/, lawyers/, judges/ each have one React SVG file
  per asset; benches/ and juries/ have static SVG files imported as Vite URLs. primitives/
  shares unchanged v1 geometry helpers/palettes and SvgFrame with useId accessibility titles.
  Background pattern IDs also use useId; external static files have no fragment IDs.
- registry.ts contains 32 namespaced entries: id/type/nativeThemes/viewBox/normalized anchors/
  supportedStates/one renderer (component or SVG URL). nativeThemes describes origin, not a
  selection restriction. Unknown/wrong-role IDs resolve to an explicit same-role default;
  AssetView records data-fallback. theme-visuals.ts binds theme background/bench/judge/jury.
- components/art/AssetView, PixelCharacter and DebateArena are display-only: props in, no API,
  timers or room state. Roles/slots drive placement; there are no animal-name CSS classes.
  The arena includes both players/lawyers, judge/bench, jury slot and two caller-supplied clock
  displays. Geometry/provenance and full file inventory are in assets/ART.md.
- themes/styles.ts maps palette/timing to --art-* variables. tokens.css and motion.css are
  scoped to art classes. Main imports the approved Pixelify Sans Variable/DM Sans Variable
  fonts locally. Motion is only idle/speaking with OS/user reduced motion and paused support;
  pauses are cosmetic. Game screens own their scoped shell CSS.
- Root.tsx selects #/gallery via hashchange; Stage 5A added the gallery link; Stage 5B adds in-room settings and the arena. Direct gallery
  loads need no API/Redis/worker. Gallery previews four themes via a switcher, all 16 cast
  descriptions/personality summaries, duplicate choices, motion/reduced motion and a 320px
  stage container. Leaving the lobby for gallery unmounts it/disconnects its socket normally.
- Node/Vitest tests (ui/tests/assets.test.ts) validate references, role-safe fallbacks,
  metadata and renderer shape, static SVGs, repeated title/pattern IDs via React SSR, gallery
  and complete-stage rendering. No DOM test library. Source geometry equivalence was also
  checked against v1 at port time; visual/browser QA remains manual while native pipe is absent.

### Adding or replacing bundled art
1. Add one file in the matching assets/ role directory. Preserve viewBox/ground alignment;
   for React SVG use SvgFrame/useId for titles and useId for all pattern/clip references.
   External SVGs must be self-contained, with no scripts or remote images.
2. Import it into registry.ts and add a unique role-prefixed ID, correct dimensions/anchors,
   supportedStates and exactly one renderer. A replacement can change that renderer without
   changing stage code. Keep geometry metadata truthful for differing sizes.
3. For a selectable character/lawyer, add a shared catalog entry with a unique semantic ID
   and <=400-character personality. assetId is the registry key suffix. Add theme defaults
   only if wanted; all global choices are valid for either seat in every theme.
4. For theme scenery/judge/jury, update theme-visuals.ts and the corresponding shared theme
   asset reference together. Do not change AI policy when replacing a drawing.
5. Update assets/ART.md; run typecheck, UI lint/build and Node tests. Inspect #/gallery for
   every theme, repeated/identical choices, 320px width, long labels and reduced motion.

## Stage 5B: choices and settings
- Every room phase has a Settings toggle and a RoomStage display. Pickers show
  all catalog previews/names/personality, derive selection from the own-seat snapshot and save
  one field through api.ts setChoices. Snapshot pushes drive both clients and all tabs. Ended
  disables only cast choices; personal display controls remain available. No theme editing.
- settings/choices.ts contains the picker save action and snapshot-to-arena mapping. RoomStage
  passes both public players' characterId/lawyerId to DebateArena and uses existing Redis-time
  clock display helpers. Stage components make no HTTP calls. Generic lawyer nameplates stay;
  catalog names/personality are shown in settings/gallery, not game dialogue.
- Ported applicable v1 settings: artwork pause, reduced motion (Follow OS / On / Off), and
  standard/large readable text. Stored under quarrel-display-preferences-v2 with guarded read,
  parse and write; blocked/quota storage never prevents play and is explained in the panel.
  Off explicitly overrides OS reduced motion; pause is independent. All styling is scoped,
  with no wildcard global rules. Settings never write gameplay clocks/readiness.
- Skipped v1 voice/TTS controls (enable, mute, autoplay, volume, rate, provider and fallback),
  playback controls and old editable-room-theme settings. TTS is Stage 9; v2 theme is fixed at
  create. Old room hook, router/settings navigation and polling integration were not ported.
- Tests: ui/tests/settings.test.ts uses React SSR for complete pickers/arena and pure handlers
  for typed API saves/storage failures. No DOM library. Stage 5C reuses these controls in
  the real game screens; no new dependency in 5B or 5C.


## Stage 6: presentations and private consultation
- The existing messages helper accepts kind argument/consult. GameApp keeps separate pending
  UUID attempts and drafts for each kind, using the same safe network retry behavior. The
  server schema is strict: kind, text, ordinal, requestKey only. No UI calls AI or finishes work.
- debate.state controls composing/lawyering/consulting/ended. During work, snapshots contain
  null activeSlot/deadline and stored clocks; the arena labels both clocks paused. Own pending
  draft appears with Your lawyer is preparing; opponents see Their lawyer is at work, including
  when the private owner is consulting. The UI cannot read an opponent's private records.
- Consultations.tsx is a private on-turn panel: remaining own quota, 1-600-code-point question,
  and answered/pending history for the current subtopic. Zero remaining disables Ask with a
  reason. Ask does not submit an argument or pass the turn. PrivateNotes keeps own original
  drafts and consultations accessible across subtopics and after ended/closed.
- Field/button feedback extends Stage 5C to consultation: blank/long questions are field
  errors; LAWYER_BUSY and LIMIT_REACHED stay by Send/Ask, with consultation-specific quota
  wording. Editing clears related errors. Reconnect retains the room and pending attempts.
- Public argument messages are presentations with required ai/demo/fallback source labels;
  demo/fallback badges are small, public transcript never includes consultation records.
  Live transcript also displays the server's citation label beside the speaker so verdict
  references can be located in the hearing (browser E2E regression plus game.test.ts).
  newPresentation compares saved public IDs and animates only the presenting lawyer for 1.8 s
  on a fresh push, not initial restore. Arena props carry the slot; reduced motion and artwork
  pause remain respected. No audio/TTS was added. Existing 320px layout/scoped styles apply.
- Tests: Stage 6 private lawyer UI group in ui/tests/game.test.ts, clock/action helpers and
  existing typed HTTP refresh tests. Server demo integration verifies HTTP submits, worker
  completion/pub-sub and both players' distinct pushed snapshots through to ended.


## Stage 7: summary, jury and verdict screens
- Snapshot setup.phase/state adds summary/jury/complete. GameApp's cosmetic 100ms clock runs
  in summary/jury too, so showUntil and retry cooldown use serverNow plus monotonic elapsed
  time, never a click timer or browser polling. Socket version ordering/recovery is unchanged.
- Judgment.tsx supplies SummaryCard above the arena and JudgmentScreen for jury/verdict.
  Saved summaries show source badges and the judge speaks until showUntil; pending summaries
  and all jury work keep both clocks paused. Reduced motion/artwork pause are respected.
- Jury pending shows deliberation. retry_required uses the exhaustive plain-word juryReasons
  map in lib/judgment.ts; Retry shows Redis-derived cooldown, disabled reason and action-local
  errors. api.retryJury keeps shared single-flight refresh and strict response parsing.
- Complete shows decision, strongest arguments with matching saved public presentations,
  weaknesses, per-topic findings plus canonical summaries and compromise. Demo and safety
  have prominent nonjudgment labels. Transcript and own private notes remain accessible.
  Settings remain available; complete freezes character/lawyer choices. No archive/rematch.
- Scoped summary/verdict CSS keeps long text wrapping at 320px. Node SSR/action tests cover
  labels, pending/retry/cooldown, citations and judge speaking. Desktop/mobile visual QA is manual.


## Stage 8: after the game
- Results list/loading use Home's default theme canvas; saved detail uses that debate's theme.
  Verdicts show the demo/safety notice once beside the title, suppress duplicate text/reasoning
  (including old archives), and show equal per-subtopic findings/summaries once. Distinct text
  remains visible. Archived records are not rewritten. Fresh server fallback summaries and
  demo verdict text use display names; summary excerpt budgets reserve space for long names.
- Above the two-column breakpoint (>900px), the arena column is sticky with a 20px top offset;
  at phone/tablet widths it stays in normal flow. E2E verifies actual scrolling and canvas/
  notice/summary/production-footer rendering at desktop and 320px.
- Every snapshot requires debateId, archivedAt (ISO/null), rematch {A:boolean,B:boolean}.
  GameApp clears pending argument/consult IDs and local drafts on a debateId change, even
  though rematches keep the roomId and the Socket.IO connection. Version remains monotonic.
- results/AfterGame.tsx adds reviewed timestamp/Mark as reviewed and Rematch to complete.
  Saving SQL disables review only; rematch can proceed from the immutable public outbox.
  Own request shows Waiting for <name>, opponent request is visible, and missing/left seats
  disable rematch with a reason. Review/rematch failures stay beside their own action.
- #/results lists archived topic/opponent/date/decision/reviewed status. #/results/<debateId>
  shows the public transcript and reusable VerdictView (findings/citations/summaries/labels),
  plus independent review. Home/header links My results; Back to game restores the session.
  Result detail depends on Postgres, so it works after leave/room expiry. Empty/loading/retry
  states use human messages, never raw codes. No routing/dependency library was added.
- lib/api.ts owns typed results/detail/ack/rematch requests, strict response parsing and the
  existing single-flight refresh/retry. Results pages respect stored text size; static content
  has no animation. Scoped CSS wraps long text at 320px; manual browser QA remains required.
- Tests: shared/tests/results.test.ts, ui/tests/results.test.ts (SSR/control callbacks/API
  refresh/strict parsing); backend tests prove two-player archive/rematch semantics.


## Voice (Stage 9)
- useSpeech owns one SpeechPlayer per mounted game. Controls live beside each public transcript
  item, summary and current verdict; private notes/consultations never get controls. All HTTP
  stays in lib/api.ts: ID-only request through single-flight refresh, strict fallback errors.
  Unknown/malformed failures fail closed. Terminal refreshed-session errors use GameApp's
  existing Home recovery. Saved historical result pages do not call the current-room route.
- Server WAV first; only an explicit fallbackAllowed true plus the user's preference permits
  browser speech. Provider/content blocks cannot be bypassed. Browser uses an available English
  OS voice (or default), catalog pitch/rate and user speed/volume; no player-character speech.
- Speaking begins on audio.onplaying / utterance.onstart, ends on end/error/Stop, and moves
  only the lawyer or judge. The old arrival/summary-display speaking timers were replaced by
  actual playback state. Reduced motion/artwork pause disables motion, never audio. Playback
  never calls gameplay actions or changes a clock. Stops abort fetch and release media URLs.
- Autoplay is off by default. Initial restored history is not replayed. New public IDs queue
  oldest-first, one at a time, after pointer/key interaction. Blocked items are skipped. Manual
  Play/Stop interrupts and clears the queue. Null/rematch snapshots, mute/off/zero volume stop
  playback; stale completions cannot restart it. A 35s startup deadline releases stalled work.
- Audio settings live beside display settings: enabled, mute, autoplay, volume0..1, speed0.5..2,
  browser fallback. LocalStorage access and schema parsing are guarded; failure still works in
  the tab. Speed/volume profiles apply to the next item; mute/off/zero stops immediately.
- Root React.lazy/Suspense loads Gallery and ResultsPage only on navigation. TTS's added code
  offset those savings, so the stable React runtime is also a separate cacheable vendor chunk.
  No warning threshold was changed. Stage8 main504.77kB/150.87gzip -> Stage9 main292.55kB/
  85.05gzip; vendor218.74/68.27, gallery2.86/1.14, results2.98/1.16 (final sizes recorded in report).
- Tests: ui/tests/speech.test.ts pure controller/events, fake audio/browser engines, guarded
  storage, control callbacks, fallback/blocked order, autoplay and animation/reduced motion.
  Browser voice availability/pronunciation/autoplay permissions remain manual checks.
