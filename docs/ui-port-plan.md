# UI art port plan

Read-only source review, 2026-11-18. Only this document was created; no installs, builds,
runtime UI verification or changes to either codebase. Reuse art/display pieces; rebuild
screens against v2 contracts and ui/src/lib/api.ts + socket.ts. Existing backend stages 1-4
remain the source of behavior. This original exploration is historical; the decisions at the
end override its open choices and schedule. Stage 5A art/catalog/stage and Stage 5B choices/settings are implemented; 5C game screens are next.

## 1. Asset inventory and extraction

**32 assets:** four backgrounds, eight player characters, eight lawyers, four juries, four
judges, four benches. IDs below are v1 **asset IDs**, not character/personality IDs.
Background and bench IDs overlap intentionally in v1's separate registries.

Source abbreviations (all in ../quarrel-v1):

| Key | File |
| --- | --- |
| P | src/components/pixel-art.tsx |
| B | src/themes/art/backgrounds.tsx |
| C | src/themes/art/characters.tsx, wrapped by art/index.tsx ThemeCharacterSprite |
| K | src/themes/art/benches.tsx, wrapped by art/index.tsx ThemeBench |
| S | src/themes/art/sidekicks.tsx, wrapped by SidekickSprite |

Drawing profiles used in every inventory row:

| Profile | Actual drawing/state behavior | Standalone SVG caveat |
| --- | --- | --- |
| Scene | Fixed-colour paths, generated helper geometry and useId pattern references. No theme palette prop. | Expand helpers, resolve IDs and retain viewBox; scope IDs if later inlined repeatedly. |
| Jungle scene | Scene plus embedded viewport media CSS and separate wide/compact palm/flower groups. | A static export is possible; preserve responsive groups. An img's SVG media viewport differs from page viewport, so use host-selected wide/compact exports or retain React for equivalent behavior. |
| Actor | Fixed drawing; internal Face/Boots palette props resolve from local constants, not ThemeConfig.palette. Body/mouth groups are CSS hooks. | Export one static pose; external img cannot inherit host CSS selectors or variables into internal groups. |
| Counsel | Local fixed Colors objects passed to shared head/suit helpers; animal or human drawing. Wrapper supplies body/mouth hooks. | Bake helper props/scale(2). Arena CSS animates body idle/speaking/thinking; mouth hooks exist but counsel does not use the player mouth-talk selector. |
| Jury | Three fixed jurors plus rail; helper palette props from constants. No dedicated jury pose/state controller in current display. | Bake helpers/scale(2); the rail is part of this composite asset, independent of the judge bench. |
| Bench | Plain static fixed-colour paths; nameplate text is separate DOM. | Preserve transparent nameplate area and alignment. |

| Asset ID | Type | Theme | v1 file -> drawing component | Drawing profile | Extract .svg? |
| --- | --- | --- | --- | --- | --- |
| jungle | background | jungle | P -> JungleBackdrop | Jungle scene | Yes; responsive caveat above |
| superhero | background | superhero | B -> SuperheroBackground | Scene | Yes |
| detective | background | detective | B -> DetectiveBackground | Scene | Yes |
| courtroom | background | courtroom | B -> CourtroomBackground | Scene | Yes |
| lion | character | jungle | P -> CharacterSprite(lion) / Lion | Actor; literal fills | Yes, static pose |
| zebra | character | jungle | P -> CharacterSprite(zebra) / Zebra | Actor; literal fills | Yes, static pose |
| superhero-scout | character | superhero | C -> HeroScout | Actor | Yes, static pose |
| superhero-inventor | character | superhero | C -> HeroInventor | Actor | Yes, static pose |
| detective-reporter | character | detective | C -> DetectiveReporter | Actor | Yes, static pose |
| detective-witness | character | detective | C -> DetectiveWitness | Actor | Yes, static pose |
| courtroom-advocate-a | character | courtroom | C -> AdvocateA | Actor | Yes, static pose |
| courtroom-advocate-b | character | courtroom | C -> AdvocateB | Actor | Yes, static pose |
| jungle-lawyer-a | lawyer | jungle | S -> ToucanCounsel | Counsel | Yes, static pose |
| jungle-lawyer-b | lawyer | jungle | S -> CapybaraCounsel | Counsel | Yes, static pose |
| superhero-lawyer-a | lawyer | superhero | S -> HeroCounselA | Counsel | Yes, static pose |
| superhero-lawyer-b | lawyer | superhero | S -> HeroCounselB | Counsel | Yes, static pose |
| detective-lawyer-a | lawyer | detective | S -> NoirCounselA | Counsel | Yes, static pose |
| detective-lawyer-b | lawyer | detective | S -> NoirCounselB | Counsel | Yes, static pose |
| courtroom-lawyer-a | lawyer | courtroom | S -> CourtCounselA | Counsel | Yes, static pose |
| courtroom-lawyer-b | lawyer | courtroom | S -> CourtCounselB | Counsel | Yes, static pose |
| jungle-jury | jury | jungle | S -> JuryBox(animals: tortoise/parrot/otter) | Jury | Yes |
| superhero-jury | jury | superhero | S -> JuryBox(hero palettes) | Jury | Yes |
| detective-jury | jury | detective | S -> JuryBox(noir palettes) | Jury | Yes |
| courtroom-jury | jury | courtroom | S -> JuryBox(court palettes) | Jury | Yes |
| lemur | judge | jungle | P -> CharacterSprite(lemur) / Lemur | Actor; literal fills | Yes, static pose |
| superhero-rook | judge | superhero | C -> HeroRook | Actor | Yes, static pose |
| detective-vale | judge | detective | C -> DetectiveVale | Actor | Yes, static pose |
| courtroom-rowan | judge | courtroom | C -> CourtJudge | Actor | Yes, static pose |
| jungle | bench | jungle | P -> JudgeBench | Bench | Yes |
| superhero | bench | superhero | K -> SuperheroBench | Bench | Yes |
| detective | bench | detective | K -> DetectiveBench | Bench | Yes |
| courtroom | bench | courtroom | K -> CourtroomBench | Bench | Yes |

Extraction means the **drawing**, not the complete React API. No drawing fundamentally needs
React at runtime after flattening. None currently requires theme CSS variables for colours;
optional recolourable exports could use variables with literal defaults, but would need inline
SVG for host-driven recolouring. Do not describe existing local helper palettes as theme props.

| Type | Recommended initial format | Why |
| --- | --- | --- |
| Background | Pure inline React SVG first; optional static .svg wide/compact variants later | Preserve page-responsive Jungle behavior and unique pattern IDs before changing representation. |
| Bench | Standalone .svg via Vite URL import | Entirely static; keep accessible label/nameplate in DOM. |
| Character / lawyer / judge | Pure React inline SVG component | Preserve externally controlled body/mouth CSS, useId titles and pause/reduced-motion behavior; no SVGR dependency needed. |
| Jury | Static .svg initially; registry also accepts component renderer | Current panel is static; permits a later independently animated replacement without arena changes. |

Shared coordinate systems: background 960x440, bench 192x92, actors/lawyers 96x112,
jury 192x112. Keep crispEdges, transparent bounds, feet/bench anchors and stacking contracts.
There are no alternate pose sheets: idle/speaking are CSS movement of the same paths.
Interactive judges add CSS listening/thinking/questioning/surprised transforms; objection
and verdict remain placeholders. Record supported states explicitly instead of promising poses.

## 2. Layout and registry

```text
ui/src/assets/
  registry.ts                   # UI-only typed asset metadata and renderer imports
  theme-visuals.ts               # per-theme background/bench/judge/lawyers/jury bindings
  backgrounds/{jungle,superhero,detective,courtroom}.tsx
  benches/*.svg
  characters/*.tsx              # 8 player drawings, not seat-specific identities
  lawyers/*.tsx
  judges/*.tsx
  juries/*.svg
  primitives/                   # shared SVG drawing helpers, if retained
ui/src/themes/{styles.ts,tokens.css,motion.css}
ui/src/components/art/AssetView.tsx
```

| Registry decision | Proposal |
| --- | --- |
| Identity | Namespace keys: background:jungle, bench:jungle, character:lion, judge:lemur, lawyer:jungle-lawyer-a, jury:jungle-jury. Explicit aliases from current config assetId values avoid ambiguous IDs. |
| Entry | id, type, nativeThemes: ThemeId[], viewBox, anchors, supportedStates, renderer: {kind: svg, src} OR {kind: component, Component}. One renderer per entry; no renderer-specific branches in screens. |
| Swapping | theme-visuals binds each role separately: background, bench, judge, lawyers.A/B, jury. Characters resolve through the selected character catalog. Change a binding or renderer to replace art; no arena rewrite. Metadata defines ground/nameplate anchors so replacements do not depend on an old sprite's shape. |
| Theme relationship | nativeThemes records origin, not cross-theme permission. Allowed themes for player choices depend on the unresolved policy below. Theme assets.background/bench currently have ThemeId types; widening them to real asset IDs needs a deliberate shared-config change. |
| Boundary | shared/config retains portable IDs, display metadata, defaults and AI personality policy. React components/URLs stay in ui. Keep cosmetic replacements separate from AI behavior/neutrality. |
| Rendering | AssetView validates expected role/type, provides label/state/paused and normalizes bounds. Use an explicit same-role fallback; avoid silently substituting a superhero for any unknown ID. Imported trusted art only; no runtime arbitrary SVG/URL uploads proposed. |
| Checks at port time | All config references resolve, role/type matches, actor/judge separation, both defaults exist, duplicate IDs fail, repeated inline patterns/titles are unique. Gallery checks all assets/states/mobile/reduced-motion before API wiring. |

### Player character choice

Current shared/config already supplies players.characters, per-slot defaults and
resolvePlayerCharacter(theme, slot, characterId). It accepts any character **in that theme**,
otherwise falls back to the seat default; it does not persist a choice. Example: character ID
jungle-lion resolves to assetId lion. v2's strict PlayerView currently has no character field.

| Concern | Proposed implementation when approved |
| --- | --- |
| Shared choice | Store a.characterId / b.characterId in the room hash, initialized from theme defaults. Expose characterId per PlayerView so both players/tabs see the same choice. Persist semantic character ID, never SVG filename, player ID or arbitrary asset URL. |
| Mutation | Contract-first own-seat PUT /api/rooms/:roomId/character {characterId}; validate character catalog + theme policy on server, mutate atomically, bump version and emit roomChanged. Optional create-time preference; guest can choose after join when the room theme is known. Exact lock timing remains open. |
| Rendering | Snapshot characterId -> catalog/resolvePlayerCharacter -> asset registry -> same renderer in picker, lobby, arena and transcript avatars. Preserve a departed seat's selection with its name. |
| Browser default | Optional localStorage preference suggests the next choice; room state remains authoritative. This alone cannot sync the opponent's view. |

| Policy (not decided) | Pros | Cons / required change |
| --- | --- | --- |
| Characters stay per-theme | Uses current resolver/catalog; consistent palettes, scale and story; smaller picker. | Only two choices per theme today; cannot keep one identity across all settings. |
| Any player character in any theme | Eight initial choices everywhere; personal identity carries across settings. | Colour/style clashes (especially noir), broader visual QA; needs a global player catalog and resolver/server-validation changes. Judge/lawyer/jury assets must remain excluded from player choices. |

## 3. What to copy, adapt, rebuild or drop

Paths below are relative to v1/src unless stated. Geometry can be copied unchanged even
where the containing file needs splitting. These are source observations, not reproduced bugs.

| File(s) | Action | Why / messy part |
| --- | --- | --- |
| themes/art/characters.tsx, benches.tsx | Copy as is initially | Pure local drawing helpers/constants; bench extraction is a later mechanical representation change. |
| themes/art/backgrounds.tsx | Copy and adapt | Keep geometry/useId; own the wrappers and cropping. theme-scenery-wide has no CSS rule found, unlike Jungle's explicit responsive groups. |
| themes/art/sidekicks.tsx | Copy and adapt | Separate lawyer/jury entries and bounds; replace hardcoded unknown-ID fallback to courtroom lawyer A. |
| components/pixel-art.tsx | Copy and adapt | Split Jungle scene/bench/actors; retain original paths, responsive groups and unique IDs. Legacy CharacterSprite ignores caller-provided label because it owns fixed descriptions. |
| themes/art/index.tsx | Copy and adapt | Reuse viewBoxes/titles; remove duplicate registries and silent superhero-scout fallback. |
| themes/assets.tsx | Rebuild | Current switches conflate roles/string IDs; BenchAsset drops className support; legacy labels differ from new sprites. Replace with typed registry/AssetView. |
| themes/styles.ts | Copy and adapt | Palette-to-CSS-variable bridge is useful; import ThemeConfig from @quarrel/shared/config. Colours belong to UI tokens, not hardcoded CSS theme exceptions. |
| public/art/ART.md | Copy and adapt attribution/history into v2 docs | Original-art provenance and dimensions useful; its claim of only default player designs still holds, but sidekick inventory and runtime state behavior need expanding. |
| components/debate-arena.tsx + .module.css | Copy and adapt | Preserve layered scene as a pure display component. Mixes global CSS with module overrides, animal-named positioning and one-clock display; adapt to two clocks, typed roles and independent asset bindings. Jury is outside arena in lawyer-debate. |
| components/pixel-character.tsx | Copy and adapt | Keep nameplates/state hooks; replace lion/zebra/lemur position classes with slot/role attributes and remove preview-only type import. Distinguish supported motion from placeholder poses. |
| components/theme-selector.tsx | Copy and adapt | Useful radio/arrow-key interaction, but v1 says choose theme after creating/change it in lobby. v2 selects before create and fixes it forever; remove old room-edit/pending assumptions and fixed heading IDs for repeated instances. |
| components/theme-preview.tsx | Copy and adapt | Reusable pure scene preview; switch registry imports and scope CSS/tokens. |
| components/settings-page.tsx + .css | Rebuild | Old room hook, URL navigation, editable theme/lock assumptions and 10s polling copy conflict with v2. Retain personal display/audio layout only. |
| components/display-preferences.tsx + .css | Copy and adapt | Good browser-only preferences/storage fallback/tab sync. Narrow global wildcard CSS, retarget text selectors, choose storage-key compatibility and provider placement; saving on storage events merits multi-tab testing. |
| components/audio-preferences.tsx | Copy and adapt at Stage 9 | Depends on lib/speech-preferences.ts and speech CSS/primitives. Keep controls, rebuild provider/API integration; never imply cosmetic pause stops clocks. |
| components/stage-five-app.tsx + .css | Rebuild | Main layout reference only: old room/lawyer snapshots, history/query navigation, hidden legacy modes. Lobby players props omit selectedCharacterId even though active LawyerDebateView forwards it. |
| components/lawyer-debate.tsx + .module.css | Rebuild | Reuse composition ideas (arena, two clocks, jury card, transcript), not revisions/confirm/regenerate/state callbacks or old private/public message shapes. |
| components/room-controls.tsx | Rebuild | Keep invitation/seat arrangement; old modes/readiness/45s presence copy and API types differ. Displays selected characters but contains no character-choice control. |
| components/multiplayer-app.tsx | Drop port; layout reference only | Alternate legacy three-round flow and room client; avoid a second orchestration path. |
| components/quarrel-app.tsx, courtroom.tsx, character.tsx, preview-controls.tsx | Drop from production port | Jungle-only preview state, fixed demo IDs/timer and species-based identity. Build a small registry gallery instead if desired. |
| components/debate-ui.tsx | Rebuild relevant display pieces | Legacy opening/rebuttal/questions rounds differ from v2 subtopics; do not bring its state/form logic. |
| components/ui.tsx | Copy and adapt | PixelIcon/button/headings are reusable; bring minimal CSS, define safe button types and theme tokens. No icon library needed. |
| components/debate-history-panel.tsx + .module.css | Copy and adapt | Reusable presentation-only children/scroll/disclosure shell; verify unread/focus/scroll behavior and adapt styling against new transcript. |
| app/globals.css | Extract and adapt, not wholesale copy | Layered media overrides, very small labels and theme-specific exceptions hide dependencies. Isolate reset/tokens/arena/motion/controls; retain prefers-reduced-motion support. |

Other observed hazards: unknown character IDs fall back silently; JSX-generated pattern/title
IDs cannot be copied verbatim into repeated inline SVG; viewBox sizes differ for jury; asset
filenames alone do not preserve host CSS animation. No browser bugs were reproduced in this pass.

## 4. Dependencies

| Need in v1 | v2 ui today | Recommendation |
| --- | --- | --- |
| React/useId + inline SVG; CSS Modules | React 19, Vite and TS already support these | No new renderer/image dependency. Replace @/ aliases with local/shared imports. |
| DM Sans Variable + Pixelify Sans Variable via @fontsource-variable packages in app/layout.tsx | System fonts; neither font package installed | Decide approved font packages versus licensed self-hosted font files before implementation; no install in this task. |
| Tailwind v4 import/@theme and PostCSS plugin in global CSS | Plain CSS; no Tailwind/PostCSS package | Most relevant selectors are ordinary CSS. Extract them and standard :root tokens; do not add Tailwind just to draw SVGs. |
| Global arena/motion/nameplate classes + module overrides + display preference CSS | Temporary lobby CSS only | Port a scoped minimal style set; CSS Modules alone do not supply the global classes it references. Preserve OS/personal reduced motion. |
| Next app shell, use client, @/ imports | Vite entry point, no router | Rebuild screens driven by room phase; no Next dependency or copied server-only imports. |
| Supabase-backed room-client, old room/lawyer/debate types | Cookie REST + Socket.IO, shared Zod contracts | Drop old client; retain v2 session refresh, snapshot version ordering and Redis-time clock display. |
| Speech preferences, browser speech/audio, Gemini speech route | Shared voice config + server AI port, no UI speech provider | Defer functioning audio UI to Stage 9; never call providers for art/preview. |
| Testing Library/jsdom visual component tests in v1 | Vitest Node helper tests; no DOM test libraries in ui | Plan browser checks and registry tests first; request approval separately if DOM dependencies are needed. |

## 5. Suggested order and screen coverage

| Order | Work | Screens / stages supported |
| --- | --- | --- |
| 1 | Capture art inventory/provenance, import pure geometry, implement typed registry + gallery with role/type/ID checks | All assets independently swappable before rebuilding screens. No old API imports. |
| 2 | Port minimal font/tokens/themeStyles/motion/preferences; verify repeated SVG IDs, all four themes, narrow layouts and reduced motion | Shared shell, theme/character preview and personal settings. |
| 3 | Adapt AssetView, PixelCharacter and DebateArena; add jury slot and both clocks; test alternative aspect ratios/long labels | Reusable stage behind every later screen. |
| 4 | Implement approved character-selection contract/storage, then rebuild home/create/join, waiting/positions, plan/start/countdown and raw debate/ended | Existing Stages 1-4: fixed setup, own-seat positions, Socket.IO presence, server deadlines. |
| 5 | Add lawyer presentation/private consultation states, preserving separate public/private components | Stage 6 lawyer screens; drawing motion does not own clock timing. |
| 6 | Add summaries/jury deliberation/verdict views | Stage 7; jury art already registered; no fabricated intermediate AI states. |
| 7 | Rebuild saved results/history/rematch controls against new contracts | Stage 8 after-game screens; use lawyer-results only as layout reference. |
| 8 | Adapt audio preferences/playback/state indicators when speech contract exists | Stage 9. Final UI port can integrate all completed stages; do not copy v1 orchestration to accelerate it. |

## 6. Open questions

1. Per-theme characters or all eight everywhere? Can both players pick the same character?
2. When may a choice change: waiting/positions only, until Start, or during debate? Should a
   cosmetic change reset readiness? Should the last browser choice seed future rooms?
3. Does replaceable mean developer-selected bundled assets, per-room host-selected skins, or
   user uploads? This plan assumes bundled replacements; uploads require separate requirements.
4. Should a judge/lawyer/jury skin change only the art, or also its displayed name/personality?
   Recommendation is separate cosmetics from behavior; evaluation neutrality must remain fixed.
5. Keep the current pixel style/coordinates, or support arbitrary image proportions? Are juries
   replaceable as one panel, or should individual jurors/rail be independently replaceable too?
6. Preserve exact font appearance? Approve font packages or provide self-hosted files later?
7. Are CSS idle/speaking effects sufficient, or are actual alternate poses/frames wanted?
8. Keep full UI port after Stage 9, or bring the art gallery/registry forward as a separate task?

## Decisions (2026-11-18)

1. All eight player characters and all eight lawyers are global player choices in any theme.
   Judge, jury, background and bench stay bound to the theme. Shared/config/catalog.ts owns
   the catalogs; each theme keeps defaults.characters/defaults.lawyers for A/B. Resolvers
   resolveCharacter(id, theme, slot) and resolveLawyer(id, theme, slot) accept global IDs and
   fall back only to the corresponding theme/seat default.
2. Both players may choose the same character or lawyer. No uniqueness rule.
3. Choices may change from settings in every phase until ended (WRONG_PHASE). Stage 5B
   implements own-seat persistence and shared snapshots; gallery choices remain local fixtures.
4. Each catalog entry has id/name/assetId/description/personality; personality is at most 400
   Unicode code points. Names/personality are settings metadata, also shown in the requested
   developer gallery. The arena displays player names and generic Counsel / Lawyer A/B labels.
   Lawyer summaries preserve v1 personality + dialogue style as style hints only, never
   evidence or policy. Player summaries are newly written from v1's descriptions because v1
   has no player-personality fields. Backend AI currently resolves the theme's default lawyer;
   selected-lawyer prompt wiring is Stage 6.
5. Bundled assets only; no uploads. Registry roles are separate with explicit same-role
   fallback and normalized ground/nameplate anchors. Theme-bound visuals are independent
   bindings; actor/lawyer choices come from catalogs.
6. Use v1's Pixelify Sans Variable and DM Sans Variable via the two approved UI-only
   @fontsource-variable packages. Plain scoped CSS; no Tailwind or new DOM test dependency.
7. CSS idle/speaking motion only, no extra poses. Keep inline React SVG for actors/backgrounds
   with useId titles/patterns; benches/juries are external SVG files with no internal IDs.
   Reduced motion respects OS settings as well as gallery controls; it never pauses clocks.
8. Port the UI now, stage by stage. Stage 5A delivers art/catalog/stage and #/gallery. Stage 5B adds
   choices/settings and a snapshot-driven arena to the test room. Stage 5C rebuilds real
   lobby, setup, planning and debate screens, replacing the test UI. Game screens will be rebuilt against v2, not copied from v1's API wiring.

Implementation inventory/provenance: ui/src/assets/ART.md. Gallery has a four-theme switcher,
all 16 selectable cast entries, both seats deliberately sharing choices, idle/speaking and
reduced-motion controls, and a 320px container preview. Node tests use React server rendering,
not a DOM library. Native browser automation was unavailable; visual QA remains manual.


## Decisions (2026-11-19): Stage 5C

| Area | Ported / retained | Dropped / interpretation |
| --- | --- | --- |
| Presentation | v1 pixel brand/header, paper panels, hard shadows, two-column court, approved fonts and Stage 5A art | Rebuilt scoped CSS and phase screens, no old API hooks, routes, polling or Tailwind. |
| Flow | v2 fixed create setup, own positions, live plan, host Start, Redis countdown/clocks, transcript and ended | No v1 confirm/accept/revision controls; no regenerate. |
| Settings | All 5B cast/display controls on every in-room screen | Lawyer consultations, judge/jury actions, archives and TTS wait for Stages 6-9; no dead controls. |
| Recovery | Single-flight HTTP/auth refresh retained; null room or unrecoverable session returns Home | Transport drops retain room/drafts/clocks and show a non-blocking reconnect banner; actions remain usable. Inactive sockets check GET session once, then reconnect if the room exists. |
| Testing | Node React SSR whole-screen fixtures, real callbacks/action helpers, existing real-server integration and safe retry tests | No DOM library added. Native computer-use pipe still unavailable; desktop/phone visual QA is manual. |
| Replacement | #/ is the game and #/gallery remains offline | Deleted temporary ui/src/App.tsx and index.css; retained general API/socket/clock/asset/settings tests because the game still uses those helpers. |

The S2.7 race no longer uses MONITOR. Concurrent HTTP requests are checked against their
responses, final ready/phase hash, exactly two version increments, and rejected later writes.
Five full default-parallel coverage runs replace the earlier single-worker workaround.


Stage 5C reconnect correction (2026-11-19): no departed flag or reload instruction. Socket.IO
owns transient retry; successful reconnect hides the banner and accepts current snapshots
through the existing version guard. A permanent rejection first checks the session; a retained
room is not abandoned, and repeated rejection is bounded to avoid an auth retry loop.


## Decisions (2026-11-19, Stage 8)
Saved results/review/rematch screens now use plain Postgres-backed v2 contracts, retaining
VerdictView/public transcript display rather than the old API wiring. A rematch keeps the
fixed theme/topic/duration/cosmetics and starts fresh positions. After Stage 9 TTS comes
Stage 10 deployment (one EC2/compose, Caddy/domain HTTPS, nginx UI, container DATABASE_URL),
then scale and measure. Historical v1 provider names in the inventory remain reference only.
