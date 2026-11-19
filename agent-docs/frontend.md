# Frontend

- `ui/` contains the temporary setup lobby plus the first UI-port art/gallery step: plain
  React/CSS, no router library or UI library.
  Home restores GET /api/session. Create includes name, theme select, topic textarea and duration
  select; join needs only name/code. Lobby shows fixed setup for both players, plus seats,
  ready/connected/left state, bothReady, code/copy, expiry, connection status and raw JSON debug.
  Keep this lobby small; the v1 UI port now proceeds incrementally, per docs/ui-port-plan.md.
- `ui/src/lib/api.ts` is the only HTTP entry point. Typed session/create/join/ready/leave
  functions (including setPosition and startDebate) parse shared contract schemas; ApiError preserves the server's code and message.
  Bodiless POSTs have no JSON Content-Type. Single-flight refresh and one retry are shared
  between HTTP and the exported refreshAccess used by socket auth recovery.
- `ui/src/lib/socket.ts` connects only while in a room. It parses RoomSnapshotEvent, accepts
  equal/newer versions of the same room, ignores lower ones, accepts a new room's own version
  sequence and disconnects on null. SESSION_EXPIRED refreshes and reconnects once per auth
  failure sequence; a successful connection resets the retry allowance. Disposal prevents a
  pending refresh from reconnecting a departed lobby.
- Waiting shows Waiting for opponent with no ready control. Positions shows your editor/save,
  opponent read-only text, and Ready/Not ready (save changes first). Planning freezes inputs
  and shows Preparing the debate until the plan arrives, then subtopics, allocation and openers.
  Only the host sees Start, disabled with a reason until the plan and both connections exist.
  Debate shows a 3-2-1 countdown from startsAt/serverNow plus monotonic elapsed time since
  receiving the snapshot, then Debate started. Reconnects use the remaining server deadline;
  the click never starts a local three-second timer. lib/debate.ts helpers have Node tests.
  During debate the transcript shows public announcements/arguments labelled with seat/name,
  two chess clocks and an own-turn Send form. Clock display uses the same server deadline/
  elapsed-time helper as countdown; inactive clocks stay still. Raw text is counted in code
  points (600), and 12 arguments disables Send with a clock-keeps-running explanation.
  A pending message's UUID/ordinal/text survive a network failure; retry reuses them. Edits
  or a changed subtopic produce a new key; successful submissions clear the draft. Ended shows
  Debate ended and the retained transcript. HTTP calls go through api.ts submitMessage.
  Draft text resyncs only on saved-position
  or room changes, so unrelated presence pushes do not erase typing.
- App state drives home/lobby; a ref keeps current version checks synchronous across HTTP and
  socket callbacks. UNAUTHENTICATED clears the room and returns home. API health stays in the footer.
- Dev: Vite on 5173 proxies /api and /socket.io (including WebSockets) to API 4000.
  Compose: nginx on 3000 serves the built UI and proxies the same paths; no URLs are hardcoded.
- UI tests run in a Node Vitest project without a DOM dependency: HTTP contracts, shared refresh,
  socket recovery/disposal, payload validation and version ordering. UI is outside the requested
  server/shared coverage thresholds.
- Test two identities in a normal browser window and a private window (or separate profiles).
  Two normal tabs share the same cookies and intentionally represent the same player.
- docs/inventory.md lists the original v1 files and Next.js-to-Vite changes. The dated
  decisions at the end of docs/ui-port-plan.md override that older port schedule.

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
  pauses are cosmetic. The existing test UI keeps its original CSS/behavior.
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
- The test room now has a Settings toggle in every phase and a RoomStage display. Pickers show
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
  for typed API saves/storage failures. No DOM library. Stage 5C next replaces the temporary
  lobby/setup/planning/debate screens on the display stage; no new dependency in 5B.
