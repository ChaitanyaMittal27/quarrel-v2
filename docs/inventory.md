> Describes Quarrel v1 (original repo, ../quarrel-v1); used as the reference and spec for v2.

# v1 → v2 file inventory

Every file in `../quarrel-v1` (skipping `node_modules`, `.git`, `.next`, `coverage` and
`package-lock.json`) and where it goes in v2. Sub-stage C2 copies the rows marked **copy** and
**copy + adapt**; rows marked **rebuild (slice N)** are rewritten from scratch in that slice,
using the v1 file as the reference; **drop** rows don't come to v2.

Taken on 2026-11-12 from v1 as it is on disk. Test counts come from a full Vitest run of a copy of
v1's `src/` and `tests/` in a scratch folder (v1 itself was not touched): **732 tests in 31
files**, the same total as [baseline.md](baseline.md).

## 1. Summary

**Files:** 223 files found in v1. `package-lock.json` is skipped (lockfile), so **222 files are
listed, each exactly once, in 221 rows** (the two generated files share one row).

**Actions** (per file):

| Group | copy | copy + adapt | rebuild | drop | Total |
|---|---|---|---|---|---|
| Shared code | 11 | 2 | 0 | 0 | 13 |
| UI | 19 | 41 | 0 | 12 | 72 |
| AI | 0 | 11 | 0 | 0 | 11 |
| API routes | 0 | 0 | 26 | 7 | 33 |
| Database | 0 | 0 | 0 | 21 | 21 |
| Tests | 0 | 1 | 5 | 3 | 9 |
| Config and tooling | 1 | 1 | 0 | 14 | 16 |
| Assets | 0 | 2 | 0 | 45 | 47 |
| **Total** | **31** | **58** | **31** | **102** | **222** |

Rebuilds by slice (31 files):

| Slice | Files | Which |
|---|---|---|
| 1 | 9 | 5 routes (session, create, join, leave, heartbeat), `room-api.ts`, `room-api.test.ts`, `api.integration.mjs`, `leave.integration.mjs` |
| 2 | 5 | routes: ready, theme, lawyer/topic, lawyer/position, lawyer/start |
| 3 | 3 | route lawyer/plan, `judge-worker.ts`, `judge-worker.test.ts` |
| 4 | 4 | routes lawyer/advance, lawyer/argument, lawyer/consult, `lawyer.integration.mjs` |
| 5 | 0 | No file of its own: its rules live in `room-api.ts`, `lawyer-policy.ts` and the SQL |
| 6 | 1 | route lawyer/retry |
| 7 | 5 | routes lawyer/history, lawyer/acknowledge, lawyer/rematch, `stage-six-api.test.ts`, `stage6a.integration.mjs` |
| 8 | 4 | route lawyer/speech, `speech-receipts.ts`, `speech-server.test.ts`, `stage6b.integration.mjs` |

**Unit tests (Vitest), by area:**

| Area | v1 files | v1 tests | Move to v2 in C2 | Where |
|---|---|---|---|---|
| UI | 18 (+ `setup.ts`) | 317 | **250 tests in 15 files** | `ui/tests/` |
| Shared | 1 | 2 | **2 tests in 1 file** | `shared/tests/` |
| AI | 7 | 160 | **160 tests in 7 files** (153 run + 7 opt-in live tests, skipped by default) | `server/tests/ai/` |
| API / worker | 4 | 244 | 0 (rebuild: reference for slices 1–8) | `server/tests/` (per slice) |
| Tooling | 1 | 9 | 0 (dropped) | — |
| **Total** | **31** | **732** | **412 tests in 23 files** | |

Other v1 tests, none of which move: 264 pgTAP tests in 7 SQL files (dropped with the
migrations), 4 Cloud SQL check files, and 8 integration suite files (58 checks in 7 suites;
`stage6b` only re-runs the lawyer suite with speech on). 5 of the 8 become the reference for
later slices.

**Things I wasn't sure about** (details in §8):

- `judge-engine.ts` keeps the legacy shared-judge AI (`generateJudgeResult`) alongside the lawyer
  AI. Copying "AI code and its tests" brings 53 tests that only cover the dropped `judge` route.
- The UI still *displays* legacy debate/judge snapshots (`debate-ui.tsx`, `judge-panel.tsx`, 54
  tests), even though v2 will never produce them.
- `multiplayer.test.tsx` mixes three things; only 22 of its 55 tests move as-is.
- Which slice adds Socket.IO push; until then the UI relies on polling.
- The layout in `CLAUDE.md` says `shared/themes/`; the decision for this stage says
  `shared/config/`. This inventory uses `shared/config/`.

---

## 2. Files

Paths below are relative to `../quarrel-v1`. "Imports (§7)" means the only change is rewriting
`@/…` imports as listed in §7. "Remove `"use client"`" means deleting that first-line directive,
which Vite doesn't use (it warns about it when bundling).

### Shared code

| v1 path | What it is (one line) | v2 destination | Action | Notes |
|---|---|---|---|---|
| `src/lib/room-types.ts` | `RoomSnapshot`, `RoomPlayer`, `RoomResponse`, `PlayerSlot` | `shared/types/room-types.ts` | copy | Its imports are relative (`./…`) and move with it |
| `src/lib/lawyer-types.ts` | Lawyer-debate snapshot, job, result, verdict and archive types + `lawyerClockSeconds()` | `shared/types/lawyer-types.ts` | copy | |
| `src/lib/debate-types.ts` | Legacy Stage 3 debate snapshot types + `ServerClock` and `remainingTurnSeconds()` | `shared/types/debate-types.ts` | copy | Legacy, but still used by the UI's read-only legacy display and `room-client.ts` (see Q2) |
| `tests/debate-clock.test.ts` | Tests `remainingTurnSeconds()` (2 tests) | `shared/tests/debate-clock.test.ts` | copy + adapt | Import from `../types/debate-types` instead of `@/lib/debate-types` |
| `src/lib/judge-types.ts` | Legacy shared-judge message/snapshot/job/result types | `shared/types/judge-types.ts` | copy | Used by `judge-engine.ts` and `judge-panel.tsx` (see Q1, Q2) |
| `src/lib/game-modes.ts` | `GameMode`, `TeamId`, `getGameMode()` (only "solo" is playable) | `shared/types/game-modes.ts` | copy | |
| `src/themes/types.ts` | `ThemeConfig` and related types, `themeIds`, `neutralityPolicy` | `shared/config/types.ts` | copy | |
| `src/themes/index.ts` | Theme registry: `themes`, `getTheme`, `isThemeId`, `resolvePlayerCharacter`, default theme | `shared/config/index.ts` | copy | Becomes the entry point of `@quarrel/shared/config` |
| `src/themes/jungle.ts` | Jungle theme config (names, palette, judge persona, lines) | `shared/config/jungle.ts` | copy | |
| `src/themes/superhero.ts` | Superhero theme config | `shared/config/superhero.ts` | copy | |
| `src/themes/detective.ts` | Detective theme config | `shared/config/detective.ts` | copy | |
| `src/themes/courtroom.ts` | Courtroom theme config (the default) | `shared/config/courtroom.ts` | copy | |
| `src/themes/speech.ts` | Voice config per theme and role (`getSpeechVoice`) + `chooseBrowserVoice` | `shared/config/speech.ts` | copy + adapt | Move `chooseBrowserVoice` to `ui/src/lib/character-speech.ts`: it uses the browser-only `SpeechSynthesisVoice` type, and `shared/` has no DOM types |

### UI

> **Deferred (UI port, last slice).** Every row in this group, and the UI test rows in it, waits
> for the UI port in the last slice (decided in C1 review, §9). The actions below describe that
> port; Q2, Q3, Q10 and Q11 in §9 change some of them.

| v1 path | What it is (one line) | v2 destination | Action | Notes |
|---|---|---|---|---|
| `src/app/layout.tsx` | Root layout: page metadata, font + global CSS imports, `DisplayPreferencesProvider` | `ui/src/main.tsx` + `ui/index.html` | copy + adapt | `metadata` → `<title>`/`<meta name="description">` in `index.html`; font and CSS imports and the provider wrapper move into `main.tsx` around the router (§3) |
| `src/app/page.tsx` | `/` page: renders `StageFiveApp` | `ui/src/routes/home.tsx` | copy + adapt | Becomes a react-router route element |
| `src/app/share/page.tsx` | `/share?room=CODE` page: validates the code, renders `ShareInvite` | `ui/src/routes/share.tsx` | copy + adapt | Async server component reading `searchParams` → client component using `useSearchParams()`; same code check |
| `src/app/settings/page.tsx` | `/settings` page: renders `SettingsPage` | `ui/src/routes/settings.tsx` | copy + adapt | Becomes a react-router route element |
| `src/app/preview/page.tsx` | `/preview` page: local art preview (`QuarrelApp`) | — | drop | `/preview` is dropped |
| `src/app/globals.css` | Global styles: Tailwind import, `@theme` fonts/colours, base and shared classes (451 lines) | `ui/src/styles/globals.css` | copy | `@import "tailwindcss"` works through PostCSS in Vite unchanged |
| `src/components/stage-five-app.tsx` | Main app for `/`: room entry, lobby, lawyer setup/debate, results, legacy display | `ui/src/components/stage-five-app.tsx` | copy + adapt | Remove `"use client"`; imports (§7); plain `<a href="/?start=1">` can become a router `<Link>` (optional) |
| `src/components/stage-five-app.css` | Styles for `StageFiveApp` | `ui/src/components/stage-five-app.css` | copy | |
| `tests/stage-five-app.test.tsx` | Tests the `/` page (12 tests) | `ui/tests/stage-five-app.test.tsx` | copy + adapt | Imports `@/app/page` → render the `home` route (inside a `MemoryRouter`) |
| `src/components/room-controls.tsx` | `RoomEntry` (create/join form), `RoomLobby` (ready, invite), `LeaveRoomControl` | `ui/src/components/room-controls.tsx` | copy + adapt | Remove `"use client"`; imports (§7). Builds share links as `/share/?room=` (trailing slash; react-router matches it) |
| `src/components/lawyer-debate.tsx` | `LawyerSetup` (topic, positions, plan, start) and `LawyerDebateView` (live debate, jury, recovery) | `ui/src/components/lawyer-debate.tsx` | copy + adapt | Remove `"use client"`; imports (§7) |
| `src/components/lawyer-debate.module.css` | CSS module for the lawyer debate and results | `ui/src/components/lawyer-debate.module.css` | copy | Vite supports `*.module.css` as-is |
| `tests/lawyer-debate-ui.test.tsx` | Tests setup and debate views (32 tests) | `ui/tests/lawyer-debate-ui.test.tsx` | copy + adapt | Imports (§7) |
| `tests/lawyer-speech-integration.test.tsx` | Tests speech controls inside the debate view (4 tests) | `ui/tests/lawyer-speech-integration.test.tsx` | copy + adapt | Imports (§7) |
| `src/components/lawyer-results.tsx` | `SavedVerdict` and `PreviousDebates` (archive list) | `ui/src/components/lawyer-results.tsx` | copy + adapt | Remove `"use client"`; imports (§7) |
| `tests/lawyer-results-ui.test.tsx` | Tests verdict and archive views (5 tests) | `ui/tests/lawyer-results-ui.test.tsx` | copy + adapt | Imports (§7) |
| `src/components/debate-arena.tsx` | Scene: background, bench, judge and both player characters, dialogue | `ui/src/components/debate-arena.tsx` | copy + adapt | Imports (§7) |
| `src/components/debate-arena.module.css` | CSS module for the arena | `ui/src/components/debate-arena.module.css` | copy | |
| `tests/courtroom-roles.test.tsx` | Tests arena roles and labels (6 tests) | `ui/tests/courtroom-roles.test.tsx` | copy + adapt | Imports (§7) |
| `src/components/debate-history-panel.tsx` | Collapsible transcript panel | `ui/src/components/debate-history-panel.tsx` | copy + adapt | Remove `"use client"` |
| `src/components/debate-history-panel.module.css` | CSS module for the transcript panel | `ui/src/components/debate-history-panel.module.css` | copy | |
| `tests/history-panel.test.tsx` | Tests the transcript panel (6 tests) | `ui/tests/history-panel.test.tsx` | copy | `@/components/...` resolves through the ui `@` alias |
| `src/components/courtroom-dialogue.tsx` | Speech-bubble dialogue for the current speaker | `ui/src/components/courtroom-dialogue.tsx` | copy + adapt | Imports (§7) |
| `src/components/courtroom-dialogue.module.css` | CSS module for the dialogue | `ui/src/components/courtroom-dialogue.module.css` | copy | |
| `tests/courtroom-dialogue.test.tsx` | Tests dialogue selection and display (7 tests) | `ui/tests/courtroom-dialogue.test.tsx` | copy + adapt | Imports (§7) |
| `src/components/debate-ui.tsx` | Legacy Stage 3 debate pieces + `formatTurnTime` (used by `lawyer-debate.tsx`) and `DebateHistory` (legacy display) | `ui/src/components/debate-ui.tsx` | copy + adapt | Remove `"use client"`; imports (§7). Most exports were used only by the dropped `LegacyMultiplayerApp` (see Q2) |
| `tests/debate-ui.test.tsx` | Tests legacy setup/turn/record components (26 tests) | `ui/tests/debate-ui.test.tsx` | copy + adapt | Imports (§7); import `RoomLobby` from `room-controls` instead of the dropped `multiplayer-app` |
| `src/components/judge-panel.tsx` | Legacy shared-judge chat: `JudgeConversation` (displayed by `StageFiveApp`), composer, presentation hook | `ui/src/components/judge-panel.tsx` | copy + adapt | Remove `"use client"`; imports (§7) (see Q2) |
| `tests/judge-ui.test.tsx` | Tests the legacy judge chat UI (28 tests) | `ui/tests/judge-ui.test.tsx` | copy + adapt | Imports (§7) |
| `src/components/character-speech.tsx` | Speech provider, toolbar and per-message play controls | `ui/src/components/character-speech.tsx` | copy + adapt | Remove `"use client"`; imports (§7); `<a href="/settings">` (line 98) can become `<Link>` |
| `src/components/character-speech.css` | Styles for speech controls | `ui/src/components/character-speech.css` | copy | |
| `tests/character-speech.test.tsx` | Tests speech playback, voices and audio settings (22 tests) | `ui/tests/character-speech.test.tsx` | copy + adapt | Imports (§7); playback requests go through `api.ts`, so mocks follow it |
| `src/components/audio-preferences.tsx` | Audio settings section | `ui/src/components/audio-preferences.tsx` | copy + adapt | Remove `"use client"` |
| `src/components/display-preferences.tsx` | Display preferences context (saved in `localStorage`) | `ui/src/components/display-preferences.tsx` | copy + adapt | Remove `"use client"` |
| `src/components/display-preferences.css` | Styles for display preferences | `ui/src/components/display-preferences.css` | copy | |
| `src/components/settings-page.tsx` | `/settings`: theme, display and audio settings | `ui/src/components/settings-page.tsx` | copy + adapt | Remove `"use client"`; imports (§7); plain `<a>` navigation can become `<Link>` |
| `src/components/settings-page.css` | Styles for the settings page | `ui/src/components/settings-page.css` | copy | |
| `tests/settings.test.tsx` | Tests the settings page (15 tests) | `ui/tests/settings.test.tsx` | copy + adapt | Imports (§7); render inside a `MemoryRouter` if links become `<Link>` |
| `src/components/share-invite.tsx` | `/share` invite page: join, resume or open a room | `ui/src/components/share-invite.tsx` | copy + adapt | Remove `"use client"`; `next/link` → react-router `Link` (`to` instead of `href`); `useRouter().replace` → `useNavigate()(…, { replace: true })`; imports (§7) |
| `src/components/share-invite.module.css` | CSS module for the invite page | `ui/src/components/share-invite.module.css` | copy | |
| `tests/share-invite.test.tsx` | Tests the invite page (25 tests) | `ui/tests/share-invite.test.tsx` | copy + adapt | Replace the `next/navigation` mock with a mocked `useNavigate`/`MemoryRouter`; `@/app/share/page` → the `share` route |
| `src/components/theme-selector.tsx` | Radio group of the four themes | `ui/src/components/theme-selector.tsx` | copy + adapt | Imports (§7) |
| `src/components/theme-preview.tsx` | Small preview card for one theme | `ui/src/components/theme-preview.tsx` | copy + adapt | Imports (§7) |
| `src/components/pixel-character.tsx` | `PixelCharacter`/`JudgeCharacter`: themed character with state animation | `ui/src/components/pixel-character.tsx` | copy + adapt | Imports (§7) |
| `tests/themes.test.tsx` | Tests theme configs, characters and arena rendering (29 tests) | `ui/tests/themes.test.tsx` | copy + adapt | Imports (§7) |
| `src/components/pixel-art.tsx` | Original SVG art: `CharacterSprite`, `JungleBackdrop`, `JudgeBench` | `ui/src/components/pixel-art.tsx` | copy | |
| `src/components/ui.tsx` | Basic UI pieces: `PixelIcon`, `PixelButton`, `SectionHeading` | `ui/src/components/ui.tsx` | copy | |
| `src/components/multiplayer-app.tsx` | `LegacyMultiplayerApp` (Stage 2–4 flow), re-exports of room controls | — | drop | No page renders it; it is the only caller of `debate/*` and `judge` |
| `tests/debate-app.test.tsx` | Tests the legacy debate flow through `LegacyMultiplayerApp` (13 tests) | — | drop | Tests the dropped component |
| `tests/multiplayer.test.tsx` | Tests `LegacyMultiplayerApp`, `RoomEntry`/`RoomLobby` and the `useRoomClient` hook (55 tests) | `ui/tests/multiplayer.test.tsx` | copy + adapt | Keep the 22 hook/room-control tests; drop the 26 that render `LegacyMultiplayerApp` and the 3 for dropped `debate/*`/`judge` client calls; 4 Supabase Realtime tests wait for Socket.IO. Import `RoomEntry`/`RoomLobby` from `room-controls` (see Q3) |
| `src/components/quarrel-app.tsx` | `QuarrelApp`: the `/preview` local art demo | — | drop | `/preview` only |
| `tests/character-dialogue.test.tsx` | Tests `QuarrelApp` character dialogue (8 tests) | — | drop | Tests a `/preview`-only component |
| `tests/composer-reset.test.tsx` | Tests the `/preview` page composer (13 tests) | — | drop | Imports `@/app/preview/page` |
| `src/components/preview-controls.tsx` | `/preview` character-state controls | — | drop | `/preview` only |
| `src/components/courtroom.tsx` | `/preview` jungle courtroom scene | — | drop | `/preview` only |
| `src/components/character.tsx` | `/preview` character wrapper | — | drop | Used only by `courtroom.tsx` |
| `src/components/debate-history.tsx` | `/preview` sample transcript | — | drop | `/preview` only (different from `debate-ui`'s `DebateHistory`) |
| `src/components/argument-composer.tsx` | `/preview` argument form | — | drop | `/preview` only |
| `src/components/about-dialog.tsx` | `/preview` "about" dialog | — | drop | `/preview` only |
| `src/lib/room-client.ts` | `useRoomClient()` hook: every room request, heartbeat, timers, Realtime subscription | `ui/src/lib/room-client.ts` + `ui/src/lib/api.ts` | copy + adapt | Remove `"use client"`; move `roomRequest`/`fetch` (line 21–37) and the error messages (line 10) into `api.ts`; delete the Supabase Realtime block (lines 137–163; polling stays); delete the `debate/*` and `judge` calls and the legacy `debate/advance` timer (lines 261–278, 294, 302–306); imports (§7) |
| `src/lib/character-speech.ts` | `CharacterSpeechPlayer`: Gemini-audio playback with browser-speech fallback | `ui/src/lib/character-speech.ts` | copy + adapt | The direct `fetch("/api/rooms/lawyer/speech")` (line 87) moves into `api.ts`; receives `chooseBrowserVoice` from `themes/speech.ts`; imports (§7) |
| `src/lib/courtroom-dialogue.ts` | Picks the dialogue line to show from history + playback | `ui/src/lib/courtroom-dialogue.ts` | copy + adapt | Imports (§7) |
| `src/lib/speech-preferences.ts` | Speech preferences hook (saved in `localStorage`) | `ui/src/lib/speech-preferences.ts` | copy + adapt | Remove `"use client"` |
| `src/lib/preview.ts` | `CharacterState`/`CharacterId` types and sample data | `ui/src/lib/preview.ts` | copy | Still imported by kept components despite the name (see Q11) |
| `src/themes/styles.ts` | `themeStyles()`: theme palette → CSS variables | `ui/src/themes/styles.ts` | copy + adapt | `./types` → `@quarrel/shared/config` |
| `src/themes/assets.tsx` | `BackgroundAsset`, `BenchAsset`, `CharacterAsset`: theme asset IDs → art components | `ui/src/themes/assets.tsx` | copy + adapt | `./types` → `@quarrel/shared/config` |
| `src/themes/art/index.tsx` | Shared SVG wrappers for the Stage 2.5 art | `ui/src/themes/art/index.tsx` | copy | |
| `src/themes/art/backgrounds.tsx` | Superhero, Detective, Courtroom backgrounds (SVG) | `ui/src/themes/art/backgrounds.tsx` | copy | |
| `src/themes/art/benches.tsx` | Superhero, Detective, Courtroom judge benches (SVG) | `ui/src/themes/art/benches.tsx` | copy | |
| `src/themes/art/characters.tsx` | Player character art for the three newer themes (SVG) | `ui/src/themes/art/characters.tsx` | copy | |
| `src/themes/art/sidekicks.tsx` | Sidekick (lawyer) art (SVG) | `ui/src/themes/art/sidekicks.tsx` | copy | |
| `tests/sidekick-art.test.tsx` | Tests sidekick art and asset lookup (11 tests) | `ui/tests/sidekick-art.test.tsx` | copy + adapt | Imports (§7) |

### AI

| v1 path | What it is (one line) | v2 destination | Action | Notes |
|---|---|---|---|---|
| `src/server/judge-engine.ts` | Gemini client: `generateLawyerResult` (plan, lawyer, consult, summary, jury) and legacy `generateJudgeResult`, both with demo mode | `server/worker/ai/judge-engine.ts` | copy + adapt | Remove `import "server-only"`; imports (§7); remove `cache: "no-store"` from the two `fetch` calls (lines 165, 212), a Next fetch-cache option; demo mode as-is (see Q1, Q8) |
| `tests/judge-engine.test.ts` | Tests legacy `generateJudgeResult` (50 tests) | `server/tests/ai/judge-engine.test.ts` | copy + adapt | Remove the `server-only` mock; imports (§7) (see Q1) |
| `tests/judge-live.test.ts` | Opt-in live Gemini test for the legacy judge (3 tests, `RUN_LIVE_JUDGE_TESTS`) | `server/tests/ai/judge-live.test.ts` | copy + adapt | Imports (§7) (see Q1) |
| `src/server/lawyer-policy.ts` | Lawyer prompts, response schema, context, safety redirect, validation, demo/fallback results | `server/worker/ai/lawyer-policy.ts` | copy + adapt | Remove `import "server-only"`; imports (§7) |
| `tests/lawyer-engine.test.ts` | Tests the lawyer/summary/jury AI paths and validation (67 tests) | `server/tests/ai/lawyer-engine.test.ts` | copy + adapt | Imports (§7) |
| `tests/concise-summary.test.ts` | Tests the 2–3 sentence / 70-word summary rule (10 tests) | `server/tests/ai/concise-summary.test.ts` | copy + adapt | Imports (§7) |
| `tests/lawyer-live.test.ts` | Opt-in live Gemini test for lawyer output (2 tests, `RUN_LIVE_LAWYER_TESTS`) | `server/tests/ai/lawyer-live.test.ts` | copy + adapt | Imports (§7) |
| `tests/stage-six-live.test.ts` | Opt-in live Gemini test for the jury (2 tests, `RUN_LIVE_STAGE6_TESTS`) | `server/tests/ai/stage-six-live.test.ts` | copy + adapt | Imports (§7) |
| `src/server/lawyer-errors.ts` | `JuryUnavailableError` and the fixed jury failure codes | `server/worker/ai/lawyer-errors.ts` | copy + adapt | Remove `import "server-only"` |
| `src/server/speech-provider.ts` | Gemini TTS client: PCM→WAV, validation, in-memory cache, rate limits, in-flight sharing | `server/worker/ai/speech-provider.ts` | copy + adapt | Remove `import "server-only"`; imports (§7). Its per-process cache and limits need rethinking with several workers in slice 8 (see Q5) |
| `tests/speech-provider.test.ts` | Tests TTS generation, WAV, cache and limits (26 tests) | `server/tests/ai/speech-provider.test.ts` | copy + adapt | Imports (§7) |

### API routes

All 26 route files are 5–6 lines: they set Next's `runtime`/`dynamic` (and sometimes
`maxDuration`) and call `roomRoute(request, action)` in `room-api.ts`.

| v1 path | What it is (one line) | v2 destination | Action | Notes |
|---|---|---|---|---|
| `src/app/api/rooms/session/route.ts` | GET `/api/rooms/session` | `server/api` (Fastify route) | rebuild (slice 1) | |
| `src/app/api/rooms/route.ts` | POST `/api/rooms` (create) | `server/api` | rebuild (slice 1) | |
| `src/app/api/rooms/join/route.ts` | POST `/api/rooms/join` | `server/api` | rebuild (slice 1) | |
| `src/app/api/rooms/leave/route.ts` | POST `/api/rooms/leave` | `server/api` | rebuild (slice 1) | |
| `src/app/api/rooms/heartbeat/route.ts` | POST `/api/rooms/heartbeat` | `server/api` | rebuild (slice 1) | |
| `src/app/api/rooms/ready/route.ts` | POST `/api/rooms/ready` | `server/api` | rebuild (slice 2) | rules 2.10, 2.13 |
| `src/app/api/rooms/theme/route.ts` | POST `/api/rooms/theme` | `server/api` | rebuild (slice 2) | rule 2.3 |
| `src/app/api/rooms/lawyer/topic/route.ts` | POST `/api/rooms/lawyer/topic` | `server/api` | rebuild (slice 2) | |
| `src/app/api/rooms/lawyer/position/route.ts` | POST `/api/rooms/lawyer/position` | `server/api` | rebuild (slice 2) | |
| `src/app/api/rooms/lawyer/start/route.ts` | POST `/api/rooms/lawyer/start` | `server/api` | rebuild (slice 2) | rules 2.11–2.12; opening the first clock is slice 4 (see Q12) |
| `src/app/api/rooms/lawyer/plan/route.ts` | POST `/api/rooms/lawyer/plan` (regenerate) | `server/api` | rebuild (slice 3) | |
| `src/app/api/rooms/lawyer/advance/route.ts` | POST `/api/rooms/lawyer/advance` (read-only reconcile) | `server/api` | rebuild (slice 4) | |
| `src/app/api/rooms/lawyer/argument/route.ts` | POST `/api/rooms/lawyer/argument` | `server/api` | rebuild (slice 4) | Submit rules 4.3–4.11; the AI presentation is slice 5 (see Q12) |
| `src/app/api/rooms/lawyer/consult/route.ts` | POST `/api/rooms/lawyer/consult` | `server/api` | rebuild (slice 4) | Same as `argument`; private consultation rules are slice 5 |
| `src/app/api/rooms/lawyer/retry/route.ts` | POST `/api/rooms/lawyer/retry` (manual jury retry) | `server/api` | rebuild (slice 6) | rule 6.21 |
| `src/app/api/rooms/lawyer/history/route.ts` | GET `/api/rooms/lawyer/history` | `server/api` | rebuild (slice 7) | |
| `src/app/api/rooms/lawyer/acknowledge/route.ts` | POST `/api/rooms/lawyer/acknowledge` | `server/api` | rebuild (slice 7) | |
| `src/app/api/rooms/lawyer/rematch/route.ts` | POST `/api/rooms/lawyer/rematch` | `server/api` | rebuild (slice 7) | |
| `src/app/api/rooms/lawyer/speech/route.ts` | POST `/api/rooms/lawyer/speech` (returns `audio/wav`) | `server/api` + worker | rebuild (slice 8) | v1 allows 35 s (`maxDuration`); v2 runs TTS in the worker (rule 8.8) |
| `src/app/api/rooms/debate/propose/route.ts` | POST `/api/rooms/debate/propose` (legacy) | — | drop | Dead code: only `LegacyMultiplayerApp` calls it |
| `src/app/api/rooms/debate/approve/route.ts` | POST `/api/rooms/debate/approve` (legacy) | — | drop | Same |
| `src/app/api/rooms/debate/changes/route.ts` | POST `/api/rooms/debate/changes` (legacy) | — | drop | Same |
| `src/app/api/rooms/debate/start/route.ts` | POST `/api/rooms/debate/start` (legacy) | — | drop | Same |
| `src/app/api/rooms/debate/argument/route.ts` | POST `/api/rooms/debate/argument` (legacy) | — | drop | Same |
| `src/app/api/rooms/debate/advance/route.ts` | POST `/api/rooms/debate/advance` (legacy) | — | drop | Only the legacy timer in `room-client.ts` calls it, and that timer is removed |
| `src/app/api/rooms/judge/route.ts` | POST `/api/rooms/judge` (legacy shared judge chat) | — | drop | Same as `debate/*` |
| `src/server/room-api.ts` | The whole v1 API: input checks, cookie sessions, Supabase RPC calls, error map, auto-planning, `after()` AI work, speech | `server/api/*` | rebuild (slice 1) | Spans slices 1–8. Its error-message map (lines 13–90) and input checks (`input()`, line 146) are the reference for the error envelope and the Zod contract; `after()` becomes a BullMQ job |
| `tests/room-api.test.ts` | Tests `roomRoute` (176 tests) | `server/tests/` | rebuild (slice 1) | Reference for slices 1–5: 73 "session-authorized room API" + 35 "Stage 5" tests apply; 43 Stage 3 + 25 Stage 4 tests cover dropped routes |
| `src/server/judge-worker.ts` | Claims a job through Supabase RPC, runs the AI, saves or fails it; `judgeServerConfig()` | `server/worker` (BullMQ processor) | rebuild (slice 3) | The first worker job is the planner; the fixed error-code list (rule 6.6) carries over |
| `tests/judge-worker.test.ts` | Tests job claiming and failure codes (20 tests) | `server/tests/` | rebuild (slice 3) | 14 "Stage 5 claimed work" tests apply; 6 cover the legacy judge |
| `src/server/speech-receipts.ts` | Signed (HMAC) speech receipts: attach to public messages, verify on playback | `server/api` | rebuild (slice 8) | Small, framework-free code; much of it can likely be reused |
| `tests/speech-server.test.ts` | Tests receipts (10) and the speech route boundary (9) (19 tests) | `server/tests/` | rebuild (slice 8) | |
| `tests/stage-six-api.test.ts` | Tests the history/acknowledge/rematch/retry routes (29 tests) | `server/tests/` | rebuild (slice 7) | Imports the Next route files directly |

### Database

| v1 path | What it is (one line) | v2 destination | Action | Notes |
|---|---|---|---|---|
| `supabase/config.toml` | v1 local Supabase config (project `quarrel-io`, 543xx ports) | — | drop | v2 has `db/supabase/config.toml` |
| `supabase/.gitignore` | Supabase CLI ignore rules | — | drop | v2 has `db/supabase/.gitignore` |
| `supabase/migrations/202611070001_stage2_rooms.sql` | Rooms, members, codes, RLS, Realtime | — | drop | Game rules move to Redis/Lua/TS; source for rules.md |
| `supabase/migrations/202611070002_stage25_themes.sql` | Room themes | — | drop | Same |
| `supabase/migrations/20261107182430_stage3_debate_engine.sql` | Legacy turn engine | — | drop | Same |
| `supabase/migrations/20261107190351_stage4_interactive_judge.sql` | Legacy shared judge, server capability | — | drop | Same |
| `supabase/migrations/20261107191349_stage4_judge_response_validation.sql` | Legacy judge result validation | — | drop | Same |
| `supabase/migrations/20261107195302_leave_rooms.sql` | Leaving rooms, locking, theme rules | — | drop | Same |
| `supabase/migrations/20261107215110_stage5_lawyer_debate.sql` | Lawyer debate: setup, plan, clocks, jobs | — | drop | Same |
| `supabase/migrations/20261107235910_stage6a_reliability.sql` | Leases, jury retries, archives, rematch | — | drop | Same |
| `supabase/tests/database/rooms.test.sql` | pgTAP: rooms | — | drop | Tests SQL rules; cited in rules.md as the spec |
| `supabase/tests/database/themes.test.sql` | pgTAP: themes | — | drop | Same |
| `supabase/tests/database/debate.test.sql` | pgTAP: legacy debate engine | — | drop | Same |
| `supabase/tests/database/judge.test.sql` | pgTAP: legacy judge | — | drop | Same |
| `supabase/tests/database/leave.test.sql` | pgTAP: leaving rooms | — | drop | Same |
| `supabase/tests/database/lawyer.test.sql` | pgTAP: lawyer debate | — | drop | Same |
| `supabase/tests/database/stage6a.test.sql` | pgTAP: reliability, archives, rematch | — | drop | Same |
| `tests/db/debate.cloud.sql` | SQL checks for the Cloud database (legacy debate) | — | drop | Run by hand against Supabase Cloud; tests SQL rules |
| `tests/db/judge.cloud.sql` | SQL checks for the Cloud database (legacy judge) | — | drop | Same |
| `tests/db/lawyer.cloud.sql` | SQL checks for the Cloud database (lawyer debate) | — | drop | Same |
| `tests/db/leave.cloud.sql` | SQL checks for the Cloud database (leaving rooms) | — | drop | Same |

### Tests

Unit tests are listed next to the file they test in the groups above. This group has the
shared test setup and the HTTP integration suites, which run against a live v1 app.

| v1 path | What it is (one line) | v2 destination | Action | Notes |
|---|---|---|---|---|
| `tests/setup.ts` | Vitest setup: jest-dom, `server-only` mock, dialog shim, fail on console errors/warnings | `ui/tests/setup.ts` | copy + adapt | Remove the `server-only` mock |
| `tests/db/api.integration.mjs` | HTTP suite: create/join/session/refresh (6 checks) | `server/tests/` (integration) | rebuild (slice 1) | Reference; rewrite against the v2 API |
| `tests/db/leave.integration.mjs` | HTTP suite: leaving and same-browser rooms (7 checks) | `server/tests/` (integration) | rebuild (slice 1) | Same |
| `tests/db/lawyer.integration.mjs` | HTTP suite: full lawyer flow with real clocks (10 checks, ~260 s) | `server/tests/` (integration) | rebuild (slice 4) | Covers slices 2–6; cited as `test:lawyer #N` in rules.md |
| `tests/db/stage6a.integration.mjs` | HTTP suite: results and rematch (5 checks) | `server/tests/` (integration) | rebuild (slice 7) | Same |
| `tests/db/stage6b.integration.mjs` | Wrapper: runs `lawyer.integration.mjs` with live speech on | `server/tests/` (integration) | rebuild (slice 8) | Same |
| `tests/db/supabase.integration.mjs` | Talks to Supabase directly: RLS and Realtime (15 checks) | — | drop | Tests v1's Supabase access rules and Realtime, both dropped |
| `tests/db/debate.integration.mjs` | Legacy debate engine suite (8 checks) | — | drop | Dropped flow |
| `tests/db/judge.integration.mjs` | Legacy shared judge suite (7 checks) | — | drop | Dropped flow |

### Config and tooling

| v1 path | What it is (one line) | v2 destination | Action | Notes |
|---|---|---|---|---|
| `package.json` | Next app scripts and dependencies | — | drop | v2 already has root/ui/server/shared `package.json`; dependencies are redistributed per §4 |
| `tsconfig.json` | Next TS config with `@/*` alias | — | drop | ui keeps Vite's tsconfig; C2 adds the `@` → `ui/src` alias (§7) |
| `vitest.config.mts` | Vitest: jsdom, setup file, `@` alias, 1 worker, 15 s timeout, coverage thresholds | root `vitest.config.ts` (new `ui` project) | copy + adapt | Becomes the `ui` entry in `test.projects` (jsdom, `setupFiles`, alias); coverage settings see Q14 |
| `postcss.config.mjs` | PostCSS with `@tailwindcss/postcss` | `ui/postcss.config.mjs` | copy | Vite reads it automatically |
| `next.config.ts` | `poweredByHeader: false`, `devIndicators: false` | — | drop | Next only; Fastify sends no `X-Powered-By` header |
| `.gitignore` | v1 ignore rules | — | drop | v2 has its own |
| `.env.example` | v1 env template | — | drop | v2 has its own; variables in §5 |
| `.github/workflows/quarrel-stage-1-checks.yml` | CI: unit tests, build, local Supabase, pgTAP, integration suites | — | drop | v2 needs its own CI later (see Q13) |
| `scripts/local-env.mjs` | Writes `.env.local` from `supabase status` | — | drop | v2 sets env by hand (sub-stage B) |
| `scripts/judge-config.mjs` | Generates `JUDGE_SERVER_SECRET` and its SQL hash registration | — | drop | v2's worker is a trusted internal service; no capability hash |
| `tests/judge-config.test.ts` | Tests `judge-config.mjs` (9 tests) | — | drop | Tests a dropped script |
| `AGENTS.md` | Instructions for AI agents working on v1 | — | drop | Replaced by v2's `CLAUDE.md` |
| `README.md` | v1 project readme | — | drop | v2 has its own |
| `LICENSE` | MIT licence (Ryan, 2026) | — | drop | The notice is already carried into v2's `LICENSE` |
| `next-env.d.ts`, `tsconfig.tsbuildinfo` | Generated by Next / TypeScript (2 files) | — | drop | Generated files |

### Assets

| v1 path | What it is (one line) | v2 destination | Action | Notes |
|---|---|---|---|---|
| `src/app/icon.svg` | Favicon (Next file convention) | `ui/public/icon.svg` | copy + adapt | Add `<link rel="icon" href="/icon.svg">` to `ui/index.html` |
| `public/art/ART.md` | Notes on the original pixel art (designs, sizes, files) | `ui/src/themes/art/ART.md` | copy + adapt | Update the file paths it mentions |
| `docs/courtroom-dialogue-improvements.md` | v1 design note | — | drop | v1 history; stays in v1 (see Q15) |
| `docs/share-invite.md` | v1 design note: invitations | — | drop | Same |
| `docs/stage-2-5-cloud.md` | v1 Stage 2.5 Cloud follow-up | — | drop | Same |
| `docs/stage-2-5-testing.md` | v1 Stage 2.5 test record | — | drop | Same |
| `docs/stage-3-testing.md` | v1 Stage 3 test record | — | drop | Same |
| `docs/stage-4-testing.md` | v1 Stage 4 test record | — | drop | Same |
| `docs/stage-5-decisions.md` | v1 Stage 5 decisions | — | drop | Same |
| `docs/stage-5-handoff.md` | v1 Stage 5 handoff | — | drop | Same |
| `docs/stage-5-testing.md` | v1 Stage 5 test record | — | drop | Same |
| `docs/stage-6a-api.md` | v1 Stage 6A API notes | — | drop | Same |
| `docs/stage-6a-testing.md` | v1 Stage 6A test record | — | drop | Same |
| `docs/stage-6b.md` | v1 Stage 6B notes | — | drop | Same |
| `docs/testing-stage-2.md` | v1 Stage 2 test record | — | drop | Same |
| `docs/testing.md` | v1 Stage 1 test record | — | drop | Same |
| `docs/screenshots/desktop-final.png` | Screenshot | — | drop | See Q15 |
| `docs/screenshots/mobile-final.png` | Screenshot | — | drop | See Q15 |
| `docs/screenshots/share-invite-desktop.jpg` | Screenshot | — | drop | See Q15 |
| `docs/screenshots/share-invite-mobile.jpg` | Screenshot | — | drop | See Q15 |
| `docs/screenshots/stage2-desktop.png` | Screenshot | — | drop | See Q15 |
| `docs/screenshots/stage2-mobile.png` | Screenshot | — | drop | See Q15 |
| `docs/screenshots/stage25-cloud-desktop.png` | Screenshot | — | drop | See Q15 |
| `docs/screenshots/stage25-courtroom-desktop.png` | Screenshot | — | drop | See Q15 |
| `docs/screenshots/stage25-courtroom-mobile.png` | Screenshot | — | drop | See Q15 |
| `docs/screenshots/stage25-detective-desktop.png` | Screenshot | — | drop | See Q15 |
| `docs/screenshots/stage25-detective-mobile.png` | Screenshot | — | drop | See Q15 |
| `docs/screenshots/stage25-jungle-desktop.png` | Screenshot | — | drop | See Q15 |
| `docs/screenshots/stage25-jungle-mobile.png` | Screenshot | — | drop | See Q15 |
| `docs/screenshots/stage25-superhero-desktop.png` | Screenshot | — | drop | See Q15 |
| `docs/screenshots/stage25-superhero-mobile.png` | Screenshot | — | drop | See Q15 |
| `docs/screenshots/stage3-desktop-complete.png` | Screenshot | — | drop | See Q15 |
| `docs/screenshots/stage3-desktop-rebuttal.png` | Screenshot | — | drop | See Q15 |
| `docs/screenshots/stage3-mobile-opening.png` | Screenshot | — | drop | See Q15 |
| `docs/screenshots/stage3-start-screen.png` | Screenshot | — | drop | See Q15 |
| `docs/screenshots/stage4-ai-conversation.png` | Screenshot | — | drop | See Q15 |
| `docs/screenshots/stage4-conversation-mobile.png` | Screenshot | — | drop | See Q15 |
| `docs/screenshots/stage4-leave-mobile.png` | Screenshot | — | drop | See Q15 |
| `docs/screenshots/stage4-mobile-chat.png` | Screenshot | — | drop | See Q15 |
| `docs/screenshots/stage4-mobile.png` | Screenshot | — | drop | See Q15 |
| `docs/screenshots/stage4-new-room.png` | Screenshot | — | drop | See Q15 |
| `docs/screenshots/stage4-shared-judge.png` | Screenshot | — | drop | See Q15 |
| `docs/screenshots/stage5-desktop.jpg` | Screenshot | — | drop | See Q15 |
| `docs/screenshots/stage5-mobile.jpg` | Screenshot | — | drop | See Q15 |
| `docs/screenshots/stage5-sidekick-art.png` | Screenshot | — | drop | See Q15 |
| `docs/screenshots/test-desktop.png` | Screenshot | — | drop | See Q15 |
| `docs/screenshots/test-mobile.png` | Screenshot | — | drop | See Q15 |

Fonts are not files in v1: they come from the `@fontsource-variable/*` packages (§4).

---

## 3. Next.js-specific spots

Searched for: `next/link`, `next/navigation`, `next/router`, `next/image`, `next/font`,
`next/head`, `next/dynamic`, `next/server`, `"use client"`, `NEXT_PUBLIC_*`, route-segment
exports, `app/` routing files, middleware and `next.config`. **Not used anywhere:**
`next/router`, `next/image`, `next/font`, `next/head`, `next/dynamic`, middleware.

| File | Line | What | Vite / React replacement |
|---|---|---|---|
| `src/app/layout.tsx` | 1, 7–10 | `Metadata` type + `export const metadata` (title, description) | `<title>` and `<meta name="description">` in `ui/index.html` (see Q10 for the title) |
| `src/app/layout.tsx` | 2–5, 12–14 | Root layout: font + CSS imports, `<html>/<body>`, provider | Imports and `<DisplayPreferencesProvider>` in `ui/src/main.tsx`; `index.html` has `<html lang="en">` |
| `src/app/page.tsx` | 1–2 | `app/` routing file for `/` | react-router route `/` → `<StageFiveApp/>` |
| `src/app/share/page.tsx` | 3–9 | Async server component reading `searchParams` | Route `/share`; read `room` with `useSearchParams()`, same regex check |
| `src/app/settings/page.tsx` | 1–3 | `app/` routing file for `/settings` | Route `/settings` → `<SettingsPage/>` |
| `src/app/preview/page.tsx` | 1–2 | `app/` routing file for `/preview` | None (dropped) |
| `src/app/icon.svg` | — | Next file-convention favicon | `ui/public/icon.svg` + `<link rel="icon">` |
| `src/app/globals.css` | — | Imported by the root layout | Imported by `ui/src/main.tsx` |
| `src/components/share-invite.tsx` | 3, 49, 63, 68, 79 | `import Link from "next/link"`, `<Link href=…>` | `import { Link } from "react-router"`, `<Link to=…>` |
| `src/components/share-invite.tsx` | 4, 15, 38 | `useRouter()` from `next/navigation`, `router.replace(…)` | `useNavigate()`, `navigate(…, { replace: true })` |
| `src/components/*.tsx` (13 kept files), `src/lib/room-client.ts`, `src/lib/speech-preferences.ts` | 1 | `"use client"` | Delete the line. Files: audio-preferences, character-speech, debate-history-panel, debate-ui, display-preferences, judge-panel, lawyer-debate, lawyer-results, room-controls, settings-page, share-invite, stage-five-app (+ dropped about-dialog, multiplayer-app, quarrel-app) |
| `src/app/api/rooms/**/route.ts` (26 files) | 1, 3–5 | `NextRequest` + `export const runtime / dynamic / maxDuration` | Fastify routes (rebuild). `maxDuration` 35 s (speech) and 30 s (judge, plan and other AI routes) become request/job timeouts |
| `src/server/room-api.ts` | 2 | `after`, `NextRequest`, `NextResponse` from `next/server` | Fastify request/reply; `after()` → enqueue a BullMQ job (rebuild) |
| `src/server/room-api.ts` | 150 | `request.nextUrl.searchParams` | Fastify `request.query` (rebuild) |
| `src/server/*.ts` (6 files) | 1 | `import "server-only"` (Next bundling guard) | Delete the line; the server is a separate package, so the guard isn't needed |
| `src/server/judge-engine.ts` | 165, 212 | `fetch(…, { cache: "no-store" })` (Next fetch-cache option) | Remove the option in the worker. (`room-client.ts:25` also passes it, but in the browser it is a standard fetch option and can stay) |
| `tests/setup.ts`, `tests/judge-engine.test.ts` | 7, 6 | `vi.mock("server-only")` | Delete |
| `tests/share-invite.test.tsx` | 10 | `vi.mock("next/navigation")` | Mock `useNavigate` from `react-router`, render in `MemoryRouter` |
| `tests/room-api.test.ts`, `tests/speech-server.test.ts`, `tests/stage-six-api.test.ts` | 7, 10, 10 | `vi.mock("next/server")` for `after` | n/a (rebuilt) |
| `tests/db/debate.integration.mjs`, `tests/db/supabase.integration.mjs` | 13–14, 10–11 | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (fallback names) | n/a (dropped). No `NEXT_PUBLIC_*` in `src/` |
| `next.config.ts` | 3–6 | `poweredByHeader`, `devIndicators` | Drop |
| `next-env.d.ts` | all | Next type references | Drop |
| `tsconfig.json` | — | `plugins: [{ name: "next" }]`, `.next/types` includes | ui's Vite tsconfig |
| `package.json` | scripts | `next dev / build / start` | `vite` / `vite build` / `vite preview` |

Not Next-specific but worth knowing: plain `<a href>` links in `character-speech.tsx:98`,
`settings-page.tsx:22–23` and `stage-five-app.tsx:66` reload the whole page. They work as they
are; switching them to `<Link>` is optional.

---

## 4. Dependencies

From v1's only `package.json`. "Already" means v2 already has it from sub-stage A/B.

| Package | v1 version | Type | Keep / drop | v2 workspace | Why / notes |
|---|---|---|---|---|---|
| `react` | ^19.3.1 | dep | keep | ui | Already |
| `react-dom` | ^19.3.1 | dep | keep | ui | Already |
| `@fontsource-variable/dm-sans` | ^5.3.0 | dep | keep | ui | Body font, imported in the layout |
| `@fontsource-variable/pixelify-sans` | ^5.3.0 | dep | keep | ui | Pixel font, imported in the layout |
| `@supabase/supabase-js` | ^2.119.0 | dep | keep | server | Already in server. **Drop from the UI**: v1 used it in the browser only for Realtime, which is dropped |
| `next` | ^16.4.5 | dep | drop | — | Replaced by Vite + react-router + Fastify |
| `server-only` | 0.0.1 | dep | drop | — | Next bundling guard |
| `tailwindcss` | ^4.3.5 | dev | keep | ui | `globals.css` imports it |
| `@tailwindcss/postcss` | ^4.3.5 | dev | keep | ui | Used by `postcss.config.mjs` |
| `@vitejs/plugin-react` | ^6.2.1 | dev | keep | ui | Already (^6.1.2) |
| `@types/react` | ^19.3.0 | dev | keep | ui | Already |
| `@types/react-dom` | ^19.3.0 | dev | keep | ui | Already |
| `@types/node` | ^26.6.6 | dev | keep | root | Already (v2 uses ^24 to match Node 24) |
| `typescript` | ^7.0.2 | dev | keep | root | Already (~7.0.2) |
| `vitest` | ^5.1.0 | dev | keep | root | Already |
| `@vitest/coverage-v8` | ^5.1.0 | dev | keep | root | Coverage for `npm run test:coverage` (see Q14) |
| `jsdom` | ^29.1.1 | dev | keep | ui | Test environment for UI tests |
| `@testing-library/react` | ^16.3.3 | dev | keep | ui | UI tests |
| `@testing-library/jest-dom` | ^7.0.1 | dev | keep | ui | UI test matchers (`tests/setup.ts`) |
| `@testing-library/user-event` | ^14.6.8 | dev | keep | ui | UI tests |
| `supabase` (CLI) | ^3.0.0 | dev | drop | — | v2 runs it through `npx --yes supabase` (see Q9) |

New in v2 (not in v1), already decided: `react-router` in ui. Every "keep" package that v2
doesn't have yet needs your approval before C2 installs it: the two fonts, `tailwindcss`,
`@tailwindcss/postcss`, `@vitest/coverage-v8`, `jsdom` and the three `@testing-library/*`.

---

## 5. Environment variables

v1 reads no browser env vars (`src/` has no `NEXT_PUBLIC_*`), so **no `VITE_*` variables are
needed**. The Realtime URL and key reached the browser inside API responses, not through env.

| Variable | Read in (v1) | v2 name | v2 workspace | Notes |
|---|---|---|---|---|
| `SUPABASE_URL` | `src/server/room-api.ts:96` | `SUPABASE_URL` | server | Already in v2 |
| `SUPABASE_PUBLISHABLE_KEY` | `src/server/room-api.ts:97` | — | drop | v1 acted as each player's Supabase session; v2 uses `SUPABASE_SERVICE_ROLE_KEY` on the server |
| `GEMINI_API_KEY` | `judge-engine.ts:153, 196`; `judge-worker.ts:55` | `GEMINI_API_KEY` | server (worker) | Already in `.env.local` |
| `GEMINI_MODEL` | `judge-engine.ts:158, 200` | `GEMINI_MODEL` | server (worker) | Already |
| `GEMINI_FALLBACK_MODEL` | `judge-engine.ts:201` | `GEMINI_FALLBACK_MODEL` | server (worker) | Already (empty) |
| `JUDGE_AI_MODE` | `judge-engine.ts:154, 197`; `judge-worker.ts:55` | `JUDGE_AI_MODE` | server | Already validated in `server/common/config.ts` (`demo` \| `auto`, default `demo`) |
| `JUDGE_AI_TIMEOUT_MS` | `judge-engine.ts:147` | `JUDGE_AI_TIMEOUT_MS` | server (worker) | Not in v2's `.env.local` yet (v1 default 8000) |
| `JUDGE_MAX_MESSAGES_PER_TURN` | `judge-worker.ts:52` | — | drop | Only the legacy shared judge used it |
| `JUDGE_SERVER_SECRET` | `judge-worker.ts:54`; `speech-receipts.ts:19` | `JUDGE_SERVER_SECRET` | server (api) | Its capability role is dropped; it is still the key for speech receipts (slice 8) (see Q7) |
| `GEMINI_TTS_API_KEY` | `speech-provider.ts:75` | `GEMINI_TTS_API_KEY` | server (worker) | Already |
| `GEMINI_TTS_MODEL` | `speech-provider.ts:78, 122` | `GEMINI_TTS_MODEL` | server (worker) | Already |
| `GEMINI_TTS_TIMEOUT_MS` | `speech-provider.ts:82` | `GEMINI_TTS_TIMEOUT_MS` | server (worker) | Not in v2's `.env.local` yet (v1 default 20000) |
| `RUN_LIVE_JUDGE_TESTS` | `tests/judge-live.test.ts:4` | same | server tests | Turns on the live test |
| `LIVE_JUDGE_DIAGNOSTICS` | `tests/judge-live.test.ts:8` | same | server tests | Extra output for the live test |
| `RUN_LIVE_LAWYER_TESTS` | `tests/lawyer-live.test.ts:8` | same | server tests | |
| `RUN_LIVE_STAGE6_TESTS` | `tests/stage-six-live.test.ts:7` | same | server tests | |
| `QUARREL_TEST_URL` | `tests/db/*.integration.mjs` | — | drop | Integration suites are rebuilt later; names chosen then |
| `QUARREL_ALLOW_REMOTE_TESTS` | `tests/db/*.integration.mjs` | — | drop | Same |
| `QUARREL_TEST_SPEECH` | `tests/db/lawyer.integration.mjs:31`, `stage6b.integration.mjs:6` | — | drop | Same |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `tests/db/debate.integration.mjs`, `supabase.integration.mjs` (fallbacks) | — | drop | Dropped suites |

---

## 6. Test counts (target for C2)

Counts are tests as Vitest runs them (each row of an `it.each` counts once).

**ui/tests: 250 tests in 15 files** (+ `setup.ts`)

| v1 file | Tests moving | v1 total |
|---|---|---|
| `character-speech.test.tsx` | 22 | 22 |
| `courtroom-dialogue.test.tsx` | 7 | 7 |
| `courtroom-roles.test.tsx` | 6 | 6 |
| `debate-ui.test.tsx` | 26 | 26 |
| `history-panel.test.tsx` | 6 | 6 |
| `judge-ui.test.tsx` | 28 | 28 |
| `lawyer-debate-ui.test.tsx` | 32 | 32 |
| `lawyer-results-ui.test.tsx` | 5 | 5 |
| `lawyer-speech-integration.test.tsx` | 4 | 4 |
| `multiplayer.test.tsx` | 22 | 55 |
| `settings.test.tsx` | 15 | 15 |
| `share-invite.test.tsx` | 25 | 25 |
| `sidekick-art.test.tsx` | 11 | 11 |
| `stage-five-app.test.tsx` | 12 | 12 |
| `themes.test.tsx` | 29 | 29 |

**shared/tests: 2 tests in 1 file:** `debate-clock.test.ts` (2).

**server/tests/ai: 160 tests in 7 files** (153 run by default; the 7 live tests are skipped
unless their `RUN_LIVE_*` variable is set, as in v1)

| v1 file | Tests |
|---|---|
| `lawyer-engine.test.ts` | 67 |
| `judge-engine.test.ts` | 50 |
| `speech-provider.test.ts` | 26 |
| `concise-summary.test.ts` | 10 |
| `judge-live.test.ts` | 3 (live) |
| `lawyer-live.test.ts` | 2 (live) |
| `stage-six-live.test.ts` | 2 (live) |

**C2 target: 412 tests in 23 files** (405 run + 7 skipped live tests).

**Not moving in C2:**

| v1 tests | Count | Why |
|---|---|---|
| `multiplayer.test.tsx`: tests rendering `LegacyMultiplayerApp` | 26 | Component dropped (see Q3) |
| `multiplayer.test.tsx`: `debate/*` and `judge` client calls | 3 | Those hook functions are removed with the routes |
| `multiplayer.test.tsx`: Supabase Realtime subscription | 4 | Realtime dropped; rewrite when Socket.IO arrives |
| `debate-app.test.tsx` | 13 | Tests `LegacyMultiplayerApp` |
| `character-dialogue.test.tsx` | 8 | `/preview` only |
| `composer-reset.test.tsx` | 13 | `/preview` only |
| `judge-config.test.ts` | 9 | Tests a dropped script |
| `room-api.test.ts` | 176 | Rebuild reference (slices 1–5); 68 of them cover dropped routes |
| `stage-six-api.test.ts` | 29 | Rebuild reference (slice 7) |
| `judge-worker.test.ts` | 20 | Rebuild reference (slice 3); 6 cover the legacy judge |
| `speech-server.test.ts` | 19 | Rebuild reference (slice 8) |
| pgTAP (`supabase/tests/database/*.sql`) | 264 | Test SQL rules, which are dropped |
| Integration suites (`tests/db/*.mjs`) | 58 checks | 5 suites are rebuild references, 3 dropped |

Check: 412 moving + 33 + 13 + 8 + 13 + 9 + 176 + 29 + 20 + 19 = **732** (all v1 Vitest tests).

---

## 7. Imports to rewrite

v1 has one path alias: `@/*` → `./src/*` (`tsconfig.json` and `vitest.config.mts`).

| v1 import | v2 import | Where it's used in v2 |
|---|---|---|
| `@/lib/room-types`, `@/lib/lawyer-types`, `@/lib/debate-types`, `@/lib/judge-types`, `@/lib/game-modes` | `@quarrel/shared/types` | ui, server |
| `@/themes` (index) and `@/themes/speech` (`getSpeechVoice`, `SpeechRole`) | `@quarrel/shared/config` | ui, server |
| `@/themes/assets`, `@/themes/styles`, `@/themes/art/*` | `@/themes/…` (unchanged; `@` → `ui/src`) | ui |
| `@/components/*`, `@/lib/{room-client,character-speech,courtroom-dialogue,speech-preferences,preview}` | unchanged (`@` → `ui/src`) | ui |
| `@/app/page`, `@/app/share/page` (tests only) | `@/routes/home`, `@/routes/share` | ui tests |
| `@/server/judge-engine`, `@/server/lawyer-policy`, `@/server/lawyer-errors`, `@/server/speech-provider` | relative imports inside `server/worker/ai/` (tests: `../../worker/ai/…`) | server |
| `./types` inside `src/themes/styles.ts` and `src/themes/assets.tsx` | `@quarrel/shared/config` | ui |
| `./room-types` etc. inside the type files | unchanged (they move together) | shared |

What C2 needs to set up for this:

- `shared/package.json` exports: add `"./types"` and `"./config"` (next to `"./contract"`), each
  pointing at a new `index.ts` that re-exports its folder.
- ui: add the `@` → `ui/src` alias to `ui/vite.config.ts`, `ui/tsconfig.app.json` and the `ui`
  Vitest project, and add `@quarrel/shared` as a ui dependency (it's a workspace link, not an
  outside package).

---

## 8. Open questions

1. **Legacy shared judge in `judge-engine.ts`.** It holds both the lawyer AI
   (`generateLawyerResult`, needed) and the legacy shared judge (`generateJudgeResult`,
   `deterministicJudgeResult`, its prompt and schema), which only the dropped `judge` route used.
   Following "AI code and its tests", this inventory copies all of it, including
   `judge-engine.test.ts` (50) and `judge-live.test.ts` (3). Should C2 drop the legacy judge
   parts and those 53 tests? The C2 target would then be 359.
2. **Read-only legacy display.** `StageFiveApp` still shows `DebateHistory` (from `debate-ui.tsx`)
   and `JudgeConversation` (from `judge-panel.tsx`) if a room has legacy data. v2 never creates
   legacy rooms, so these panels can never appear. Keep them, as the decisions say for UI
   components, or drop them with `debate-types.ts`/`judge-types.ts`, keeping only
   `formatTurnTime`? Dropping would remove `debate-ui.test.tsx` (26) and `judge-ui.test.tsx` (28).
3. **`multiplayer.test.tsx`.** The 26 tests that render `LegacyMultiplayerApp` cover real
   behaviour (create/join, readiness, theme selection, leave) through the dead component.
   Retarget some onto `StageFiveApp`/`SettingsPage`, or rely on the existing
   `stage-five-app`/`settings`/`share-invite` tests? The 4 Realtime tests: rewrite for Socket.IO,
   or drop?
4. **When does Socket.IO push arrive?** Removing Supabase Realtime leaves the UI on polling (10 s
   heartbeat + `lawyer/advance` timers) until push exists. None of the 8 slices names it.
5. **`speech-provider.ts` placement.** It is the Gemini TTS client, so it goes to
   `server/worker/ai/`. Its cache, rate limits and in-flight sharing are in memory, per process,
   so they need Redis once there are 2 workers (slice 8).
6. **`speech-receipts.ts`.** Marked rebuild (slice 8) because it is API-side, but it is small and
   framework-free. Copy + adapt it in slice 8 instead?
7. **`JUDGE_SERVER_SECRET`.** v2 drops its capability role; its only remaining use is deriving
   the speech-receipt signing key. Keep the name, as "server env vars stay as-is" says, or rename
   it (e.g. `SPEECH_RECEIPT_SECRET`)?
8. **AI env reads.** The AI code reads `process.env` directly (demo mode decided at call time).
   Ported as-is; should it go through `server/common/config.ts` later?
9. **Supabase CLI version.** v1 pinned `supabase` ^3.0.0 as a dev dependency; v2 runs
   `npx --yes supabase`, which takes the latest. Pin it as a root dev dependency?
10. **Page title and brand.** v1: "quarrel.io — Four worlds. One fair hearing." (the UI says
    "quarrel.io" throughout). v2's `index.html` currently says "Quarrel v2". Which title?
11. **`src/lib/preview.ts`.** `/preview` is dropped but this file stays: kept components import
    `CharacterState` and `characters` from it. Rename it (e.g. `characters.ts`) during C2?
12. **Slice boundaries.** `lawyer/start` is marked slice 2 (rules 2.11–2.12) although it opens the
    first clock (slice 4); `lawyer/argument` and `lawyer/consult` are marked slice 4 (submit rules)
    although the AI response is slice 5. Fine?
13. **CI.** v1's GitHub workflow is dropped. Does v2 get a workflow, and when?
14. **Coverage.** v1 enforced 90% statements/lines/functions and 85% branches over the UI and
    server code. Keep these thresholds in v2 (needs `@vitest/coverage-v8`)?
15. **v1 docs and screenshots.** All dropped (they stay in v1). Do you want any screenshots in
    v2's README?
16. **Test environment for AI tests.** v1 ran every test under jsdom; v2's `server` project uses
    the Node environment. The AI tests don't touch the DOM as far as I could see, but this is
    unverified until C2 runs them.
17. **`CLAUDE.md` layout.** It lists `shared/themes/` for theme and voice config; this stage's
    decision says `shared/config/`. Update `CLAUDE.md` in C2?

---

## 9. Decisions (C1 review)

Answers to the open questions in §8. §1–8 are kept as written in C1; where they disagree with
this section, this section wins.

**The UI port is deferred to the last slice.** C2 ports only shared code and the AI. `ui/` stays
the minimal Vite page (plus an API health line) until then. No UI files, UI tests, Tailwind,
react-router, fonts or testing-library come over before that.

| # | Decision |
|---|---|
| Q1 | Drop the legacy shared judge (`generateJudgeResult`, `deterministicJudgeResult`, its prompt and schema) and its tests: all of `judge-engine.test.ts` (50) and `judge-live.test.ts` (3), **53 tests**. Keep the lawyer AI and its tests. |
| Q2 | *(Deferred with the UI.)* Drop the legacy debate and judge panels (`debate-ui.tsx`, `judge-panel.tsx`), their types and their 54 tests; keep `formatTurnTime` wherever it is still used. |
| Q3 | *(Deferred with the UI.)* Move the 22 working `multiplayer.test.tsx` tests. Before dropping the 26 `LegacyMultiplayerApp` tests, check that each behaviour (create/join, readiness, theme selection, leave) is covered by the `stage-five-app`/`settings`/`share-invite` tests, and add tests on live components only where there is a gap. Drop the 4 Realtime tests (Socket.IO tests come with push). |
| Q4 | Socket.IO push arrives in slice 1 (lobby), together with presence. Polling stays as the fallback. |
| Q5 | `speech-provider.ts` goes to `server/worker/ai/` now. Moving its cache, rate limits and in-flight sharing to Redis is a slice 8 task. |
| Q6 | `speech-receipts.ts` is copied and adapted in slice 8 (not rebuilt). |
| Q7 | `JUDGE_SERVER_SECRET` becomes `SPEECH_RECEIPT_SECRET` when speech receipts are ported (slice 8). |
| Q8 | The AI code keeps reading `process.env` for now. It moves into `server/common/config.ts` when the AI is wired into the worker (the first AI job). |
| Q9 | The Supabase CLI is pinned as a root dev dependency (C2: `supabase` 3.1.0, exact). |
| Q10 | *(Deferred with the UI.)* Page title: "quarrel.io — Four worlds. One fair hearing." |
| Q11 | *(Deferred with the UI.)* Rename `src/lib/preview.ts` to `characters.ts`. |
| Q12 | Slice boundaries are refined when each slice is planned. |
| Q13 | CI in sub-stage D covers `shared` and `server` (with a Redis service). UI CI comes with the UI port. |
| Q14 | `@vitest/coverage-v8` is installed later (sub-stage D). v1's thresholds (90% statements, lines and functions; 85% branches) apply to the server first, and to the UI after its port. |
| Q15 | No v1 screenshots; fresh v2 ones at the end. |
| Q16 | AI tests run in the Node environment. |
| Q17 | `CLAUDE.md` updated to `shared/config/` (C2). |

**Deferred UI dependency decisions** (for the UI port): the two `@fontsource-variable` fonts,
`tailwindcss` with **`@tailwindcss/vite`** (not `@tailwindcss/postcss`, so `postcss.config.mjs`
is not needed), `react-router`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`,
`@testing-library/user-event`.

**New C2 target: 109 tests in 6 files** (105 run + 4 opt-in live tests, skipped by default):

| Where | Files | Tests |
|---|---|---|
| `shared/tests` | `debate-clock.test.ts` | 2 |
| `server/tests/ai` | `lawyer-engine.test.ts` (67), `speech-provider.test.ts` (26), `concise-summary.test.ts` (10), `lawyer-live.test.ts` (2, live), `stage-six-live.test.ts` (2, live) | 107 |
| **Total** | 6 files | **109** (105 run + 4 skipped) |

This is the §6 shared + AI target (2 + 160 = 162) minus the 53 legacy judge tests.

### C2 port notes

Things the C2 port did that §2 didn't spell out:

- `chooseBrowserVoice` was removed from `shared/config/speech.ts`, because it uses the
  browser-only `SpeechSynthesisVoice` type. The UI port takes it from v1's `src/themes/speech.ts`
  into `ui/src/lib/character-speech.ts`, as §2 says.
- `shared/config/index.ts` gained one line, `export * from "./speech"`, so voice config comes
  from `@quarrel/shared/config` as §7 says. New file `shared/types/index.ts` re-exports the five
  type files.
- `debate-types.ts` and `judge-types.ts` were copied as §2 says. Dropping them (Q2) is deferred
  with the UI, and `room-types.ts` still imports them.
- v2's TypeScript settings are stricter than v1's (`noUncheckedIndexedAccess`; Node's `fetch`
  types instead of the DOM's). 17 **type-only** edits made the ported code compile, with no change
  to what runs: a `!` after an array index in `lawyer-policy.ts` (1), `speech-provider.ts` (1) and
  the tests (14), and one `any` annotation in `stage-six-live.test.ts`. In `lawyer-policy.ts` a
  `!` (not `?.`) keeps v1's behaviour exactly.
- The `server` Vitest project sets `restoreMocks` and `clearMocks`, as v1's config did; the
  ported tests rely on mocks being reset between tests.
- Ported files were converted from Windows (CRLF) to Unix (LF) line endings.
