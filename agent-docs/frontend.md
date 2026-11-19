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
- Stage 6 will add lawyer/consultation controls; Stage 7 judge/jury summaries; Stage 8 archives;
  Stage 9 TTS. The existing stage artwork stays decorative with no inactive feature buttons.
- API health remains a small footer. Dev Vite (5173) and compose nginx (3000) proxy /api and
  /socket.io to the API without hardcoded origins. Use normal + private windows for two
  identities; normal tabs intentionally share cookies/the same player.
- Node/Vitest uses React SSR phase/shell fixtures, actual control callbacks and typed action
  tests, plus existing API/socket/clock/asset/settings tests. Real-server lobby/expiry/two-tab
  integration tests still exercise the API/socket flow (they did not import temporary views).
  Coverage now also reports UI source; server/shared thresholds remain 90/90/90 and 85 branches.
  Browser interaction/layout remains manual QA while the computer-use native pipe is missing.

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
