# Status

Last updated: 2026-11-19. Updated at the end of each sub-stage.

## Done
- **Stage 0: setup.** npm workspaces (ui, server, shared); Vite UI (minimal page + API health
  line); local Supabase (Postgres + Storage only); Fastify API + Socket.IO; BullMQ worker;
  shared Zod contract; ported shared types/config and the lawyer AI (`server/worker/ai/`, now
  wired for planning in Stage 3); Docker images, nginx, compose, CI. See `docs/inventory.md`.
- **Stage 1A: contract.** `shared/contract/common.ts`, `rooms.ts`, `socket.ts`; `docs/api.md`.
- **Stage 1B: sessions.** JWT access token + rotating refresh token, central error handling,
  Redis moved to port 6380. Details in [backend.md](backend.md).
- **Stage 1C: rooms in Redis.** Atomic create/join/leave/ready scripts, retained expiry records,
  repository/service/mapper/routes, session snapshots, presence reads and typed room events.
  Includes join.lua. Health responses are strict; refresh rotation Lua lives in its own file.
  52 server room tests; race/collision suite repeated five times. Details in [backend.md](backend.md).
- **Stage 1D: sockets and presence.** Cookie-authenticated Socket.IO, 35 s presence keys
  refreshed every 10 s, per-player RoomResponse pushes and leave-to-null notifications.
  15 real-server socket tests, repeated five times; equal room versions accepted for presence.
- **Stage 1E / Stage 1 complete.** Real-fetch lobby/session-expiry/two-tab integration tests
  (five stability runs), temporary React lobby UI, HTTP/socket client helpers and UI tests.
  Coverage enforced per server/shared workspace (90% statements/lines/functions, 85% branches),
  including ported AI and entry points; CI runs coverage. Audit: zero current advisories.
  Rules 1.1-1.17 mapped to tests in `docs/rules-coverage.md`. Compose verified with Supabase
  healthy; UI and session answered HTTP 200 on port 3000. Visual QA remains a follow-up because
  the browser automation native pipe was unavailable.

- **Stage 2: setup (v2 redesign) complete.** Fixed theme/topic/duration at create, waiting ->
  positions on join, public own-seat position saves, author-only readiness reset and atomic
  planning lock when both ready flags are true. Strict contract, API/errors, Lua, mapper,
  setup test UI and integration flow updated. S2.1-S2.8 mapped in `docs/rules-coverage.md`.
  337 tests passed (server 270, shared 57, UI 10), 4 live AI skipped; coverage thresholds and
  UI build pass. No new dependencies.

- **Stage 3: planner and Start complete.** BullMQ plan jobs with read-triggered recovery,
  demo/fake-tested AI/final fallback, validated public plan and atomic save, Redis pub/sub
  snapshot pushes, host-only atomic Start with presence checks and Redis countdown deadline.
  Test UI shows preparation, plan/openers and synchronized 3-2-1 then Debate started.
  373 tests passed (server 297, shared 64, UI 12), 4 paid AI tests skipped. Server coverage:
  statements 91.62%, branches 93.67%, functions 94.81%, lines 92.69%; shared all 100%.
  Typecheck, lint, UI build and thresholds pass; npm audit reports 0 vulnerabilities.
  No new dependencies. S3 proofs and differences documented in docs/rules-coverage.md.

- **Stage 4: turns and clocks complete.** Atomic Start initializes clocks/transcript;
  shared Lua catch-up handles expiry/subtopic progression through ended. Exact raw arguments,
  ordered submit errors, UUID replay/conflict protection and per-player 12-argument caps.
  Redis deadlines sorted set and a worker poller publish automatic transitions using Redis TIME;
  reads also catch up atomically. BullMQ remains for plans only. Test UI shows transcript,
  ticking clocks, own-turn Send, safe network retry and Debate ended.
  Deadline follow-up replaces delayed clock jobs with atomic sorted-set updates, Redis-time
  due selection and a non-overlapping 250ms poller with graceful shutdown. Clock-drift,
  concurrent-poller, stale-member cleanup and idle automatic-push tests pass.
  402 tests passed (server 319, shared 67, UI 16), 4 paid AI tests skipped. Server coverage:
  statements 91.55%, branches 93.87%, functions 95.10%, lines 92.48%; shared all 100%.
  Typecheck, lint, UI build and coverage thresholds pass; npm audit: 0 vulnerabilities.
  No dependencies added. Rules 4.1-4.14 and all lawyer/consultation/summary deferrals mapped
  in docs/rules-coverage.md. Browser rendering remains manual QA.

- **Stage 5A: art, catalog and stage complete.** Global catalogs (8 characters, 8 lawyers),
  per-theme defaults, 32 role-safe assets, theme-bound scenery/judge/jury, unchanged v1
  geometry split per asset, standalone bench/jury SVGs, and display-only stage with two clocks.
  Gallery at #/gallery previews all cast/theme/motion combinations and a 320px container;
  fonts are the two approved Fontsource packages. Test lobby only gains a gallery link.
  410 tests passed (server 319, shared 68, UI 23), 4 paid AI skipped. Server coverage:
  statements 91.57%, branches 93.90%, functions 95.10%, lines 92.50%; shared all 100%.
  Typecheck, lint, coverage and UI build pass; audit 0 vulnerabilities. Geometry verified
  against v1 (24 drawing functions, 8 rendered SVG bodies). Native browser pipe unavailable;
  visual QA remains manual. No Tailwind or DOM testing dependencies. Settings/backend choice
  persistence followed in Stage 5B below; this stage added no gameplay contract.

- **Stage 5B: character/lawyer choices and settings complete.** Strict catalog-backed own-seat
  choices route and atomic Lua, resolved public snapshot IDs and per-player pushes in every
  phase until ended. No ready/clock changes. In-room pickers show the global catalogs; the
  arena uses both snapshots' choices. Guarded local reduced-motion/pause/text preferences;
  voice/TTS and editable-theme controls skipped. Quinn's apostrophe repaired; UTF-8 verified.
  427 tests passed (server 330, shared 70, UI 27), 4 paid AI skipped. Server coverage:
  statements 91.71%, branches 93.98%, functions 95.24%, lines 92.62%; shared all 100%.
  Typecheck, lint, coverage, UI build pass; npm audit: 0 vulnerabilities. No new dependencies.
  Final coverage used --maxWorkers=1 to avoid the existing MONITOR startup flake; request
  races remain concurrent. Browser interaction/OS preference checks remain manual QA.
  Documentation now uses stage numbering; rule IDs and code/test identifiers are preserved.

## Next: Stage 5C, real game screens
Rebuild lobby, setup, planning and debate screens on the new display stage, replacing the
temporary test UI. Preserve the settings and snapshot-driven choices.

## Later
Stage 6 AI lawyer and consultations (chosen lawyer as a style hint); Stage 7 summaries/judge/
jury; Stage 8 after the game with Postgres archives; Stage 9 TTS; then scale and measure.
