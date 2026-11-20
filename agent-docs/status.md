# Status

Last updated: 2026-11-20. Updated at the end of each sub-stage.

## Done
- **Stage 0: setup.** npm workspaces (ui, server, shared); Vite UI (minimal page + API health
  line); initial provider-backed database (replaced by plain Postgres in Stage 8); Fastify API + Socket.IO; BullMQ worker;
  shared Zod contract; ported shared types/config and the lawyer AI (`server/worker/ai/`, now
  wired for planning in Stage 3); Docker images, nginx, compose, CI. See `agent-docs/plans/v1-port-inventory.md`.
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
  Rules 1.1-1.17 mapped to tests in `docs/rules-coverage.md`. Compose verified with the original database service
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
  The old MONITOR startup flake was subsequently fixed in Stage 5C below.
  Browser interaction/OS preference checks remain manual QA.
  Documentation now uses stage numbering; rule IDs and code/test identifiers are preserved.

- **Stage 5C: real game screens complete.** Snapshot-driven Home/create/join, waiting/positions,
  planning/live plan/host Start, server countdown, chosen-cast debate arena with both clocks,
  transcript/own-turn safe send and Debate ended. Settings in every room phase; scoped v1-look
  responsive CSS, reduced-motion/text-size preferences and #/gallery retained. Temporary App.tsx
  and index.css removed; general helper tests remain because the new screens use them.
  Reconnect correction: transport drops retain the room/drafts/ticking clocks, show a small
  reconnecting banner and keep actions usable. Inactive sockets check GET session once before
  reconnecting. Only null snapshots or unrecoverable session errors return Home. Existing
  automatic token refresh and snapshot version ordering remain supported.
  S2.7 now asserts concurrent responses, final Redis state and exactly two version increments,
  without MONITOR. Five default-parallel full coverage runs all pass: 439 tests (server 330,
  shared 70, UI 39), 4 paid-AI tests skipped. Typecheck, lint, UI build and coverage thresholds
  pass; npm audit: 0 vulnerabilities. UI source is now reported too (no new UI threshold).
  Coverage S/B/F/L: server 91.71/93.98/95.24/92.62%, shared all 100%.
  Native computer-use pipe remains unavailable; desktop/phone rendering needs manual QA.
  Reconnect follow-up: 446 tests pass (server 330, shared 70, UI 46), 4 paid-AI skipped;
  typecheck/lint/coverage/UI build pass and audit remains 0 vulnerabilities.
  Form/encoding follow-up: submit-time shared-schema validation, red accessible fields,
  first-invalid focus and clear-on-edit; exhaustive human error messages, field/action
  placement and quiet transport retries. Repository mojibake repaired; tracked/new-text
  UTF-8/BOM/corruption regression scan runs with npm test and CI. Encoding guidance is in
  agent-docs/hazards.md and coding-standards.md. 478 tests pass (server 330, shared 70, UI 78), 4 paid-AI skipped;
  typecheck, clean lint, coverage thresholds and UI build pass; audit 0 vulnerabilities.
  No new dependencies or live AI calls.

- **Stage 6: AI lawyer and private consultations complete.** Strict argument/consult submit,
  atomic clock pause, independent 12/2 quotas, kind-aware request replay/conflict, opaque
  random work IDs and fenced Lua finish. Private owner drafts/history and remaining quota;
  opponents see only lawyering with no active seat/deadline or consultation metadata.
  Chosen catalog personality is captured as style only. Ported AI/demo/safety policies,
  two bounded provider attempts, raw/fixed fallback and late-result protection are wired.
  Explicit reads recover lost jobs with stable BullMQ IDs. Redis-time work deadlines share
  the existing sorted set; an API-side idempotent poller backs up the worker so stopping
  the worker cannot also disable timeout pushes. No browser polling or API AI calls.
  UI shows paused/preparing states, labelled presentations, brief lawyer motion, private
  consultation history/quota/field errors and own drafts retained after ended.
  Three final default-parallel coverage runs pass: 508 tests (server 356, shared 70, UI 82),
  4 paid-AI tests skipped. Coverage S/B/F/L: server 91.63/94.06/94.87/92.30%; shared all 100%;
  UI 69.67/80.88/70.68/75.29% (reporting only). Thresholds unchanged. Typecheck, clean lint,
  UI build and encoding scan pass; npm audit 0 vulnerabilities. No dependencies or deletions.
  Real Redis/Fastify/Socket.IO/BullMQ/pub-sub demo and independent dead-worker fallback
  integrations pass. Browser/mobile interaction and real model quality remain manual QA;
  automated tests made no live Gemini calls. Full 5.1-5.12/deferred 4.x proof is in rules-coverage.

- **Stage 7: summaries, judge and jury complete.** Redis-time summary work enters once per
  subtopic, public-only context, bounded AI retry and deterministic unverified fallback,
  fenced finish, four-second display and anchored next subtopic. Final summary enters jury.
  Stable BullMQ jobs, persistent per-round attempts, fixed 5s/15s backoff, immediate
  quota/config failures, pending-only recovery and atomic manual retry with 60s cooldown.
  Canonical public summaries attach server-side to strict, cited AI verdicts; demo and safety
  save explicitly labelled inconclusive nonjudgments. Complete preserves private owner notes.
  The UI shows the summary over the arena with judge motion, jury waiting/retry/cooldown,
  findings/cited presentations/summary/compromise, and source labels. No archive/rematch yet.
  Three final default-parallel coverage runs pass: 540 tests (server 382, shared 72, UI 86),
  4 paid-AI skipped each run. Coverage S/B/F/L: server 91.38/93.59/94.75/92.45%; shared 100%;
  UI 70.29/81.37/71.07/75.80% (reporting only). Typecheck, clean lint, UI build and encoding
  scan pass. npm audit: 0 vulnerabilities. No dependencies, deletions or live Gemini calls.
  Real Redis/Fastify/Socket.IO/BullMQ/pub-sub integration reaches a complete demo verdict;
  real BullMQ retry tests prove fixed delays without sleeping. Desktop/320px visual QA and
  actual AI judgment quality remain manual. Rule 6.1-6.24 proof and v2 decisions are documented.

- **Stage 8: plain Postgres and after-game features complete.** pg replaces the original
  provider SDK/CLI; Postgres 17 dev container on 5433 and compose service/volume/readiness.
  One pool per API/worker process, parameterized SQL, advisory-locked numbered migrations,
  startup migration and strict Postgres health. Public-only immutable Redis outbox, idempotent
  SQL debate+participants transaction, capped archive retry backoff and archive timestamp push.
  Results list/detail/review are participant-only and survive leave/Redis deletion; reviewed
  timestamps are independent and first-write-preserving. Atomic rematch flags/new debate ID,
  complete reset of debate state with setup/seats/cosmetics retained; debate-scoped jobs fence
  stale work. A rematch need not wait for SQL because its old public outbox is immutable.
  UI adds My results, public detail/verdict/review and rematch/waiting/availability reasons.
  Three final default-parallel coverage runs pass: 560 tests (server 396, shared 74, UI 90),
  4 paid-AI skipped each run. Coverage S/B/F/L: server 91.22/93.13/94.40/92.42%; shared all
  100%; UI 66.13/78.64/67.64/73.29% (reporting only). Thresholds unchanged. Typecheck, clean
  lint, UI build, compose config validation, migration CLI/fresh/rollback/concurrency tests
  and encoding scan pass; npm audit 0 vulnerabilities. The UI main chunk is 504.77 kB
  minified (150.87 kB gzip), a non-blocking build warning. Browser/320px interaction is manual.
  No live Gemini calls; only approved pg/@types/pg dependencies and provider-specific deletions.

- **Stage 9: voice (TTS) complete.** Shared strict voice/ID/error/preferences contracts,
  catalog lawyer/theme judge voices and public-only snapshot speech metadata. ID-only,
  session/member-checked read-only API bypasses catch-up; private records never speak.
  Threat/provider blocks forbid both engines. Dedicated TTS key/model/timeout, current
  Gemini Interactions request, validated WAV/PCM output, Redis TTL cache/rate limits,
  four tokenized global leases and ownership-safe dedup locks. No process-shared maps.
  Browser fallback requires explicit permission; voice/mute/autoplay/volume/speed/fallback
  settings are guarded locally. FIFO autoplay waits for interaction, skips restored history,
  and actual audio events own lawyer/judge motion. Stop/null/rematch abort stale playback;
  speech errors participate in existing refresh/retry and terminal-session Home recovery.
  Gallery/results use React.lazy; a cacheable React vendor split removes chunk warnings.
  Main504.77kB/150.87gzip ->292.55/85.05; vendor218.74/68.27, gallery2.86/1.14, results2.98/1.16.
  Total initial JS is511.52kB/153.51gzip (voice adds code); individual chunks are all <500kB.
  Three final default-parallel coverage runs: 582 passed (server406/shared77/UI99), four paid
  tests skipped each. Coverage S/B/F/L server runs1-2 91.61/92.72/94.44/92.83%, run3
  91.68/92.80/94.44/92.83%; shared100%; UI69.31/78.18/67.13/75.22% (report only).
  Typecheck, clean lint, coverage thresholds, UI build and encoding scan pass; audit0 issues.
  No dependencies, deletions or live Gemini/TTS calls. Rules8.1-8.7 proof and receipt/state
  decisions documented. Actual browser/OS voice availability, autoplay policy and real TTS
  output remain manual QA; real TTS was validated only with fake responses and official docs.

- **Automated full-game browser QA complete.** Root Playwright suite (separate from Vitest)
  runs against an isolated demo-only compose project with two independent player contexts.
  Desktop1280 and phone320x640 flows cover accessible form errors/focus, shared cast choices,
  saved display settings, positions/Ready/plan/Start/countdown, browser voice/playback controls,
  private consultation quota/network privacy, real API outage and dead-worker fallback,
  both real-duration subtopics/four-second summaries, jury/verdict, review/results/rematch/leave.
  36 ordered screenshots are in gitignored e2e/screenshots/. A new-suite polling race missed
  a transient summary on a loaded machine; snapshot event waiters now capture it before peer
  assertions. Final consecutive runs: 4/4 each, no retries/flaky tests, 642.6s and601.1s
  (20m43.7s combined). Speech duplicate waiters now poll200ms while locked up to timeout+1s,
  with early unlock/cache-release race handling and injected wait/clock tests. The browser
  suite found missing live transcript citation labels; they now render beside each speaker.
  Typecheck (including e2e), lint, coverage thresholds, UI build and audit pass (0 vulnerabilities).
  Vitest: 585 passed (server409/shared77/UI99), four paid tests skipped. Coverage S/B/F/L:
  server91.66/92.73/94.45/92.88%; shared100%; UI69.30/78.22/67.12/75.22% (report only).
  No live Gemini/TTS calls, source deletions, staging or commits. Only approved root Playwright
  dependency/browser download. Remaining human checks: screenshots and actual audible browser
  playback/OS voice availability. That run left the results canvas choice open; resolved below.

- **E2E screenshot UI polish complete.** Results list uses Home's canvas and detail uses the
  saved theme; demo/safety labels render once near the verdict title, equal finding/summary
  text renders once, and old archives remain immutable. New demo verdicts and both Lua/worker
  fallback summaries use display names, with long-name/Unicode word and character limits tested.
  Health footer is DEV-only; desktop >900px arena sticky at20px is verified by actual scrolling,
  with phone normal flow unchanged. One E2E run:4/4, no retries/flaky tests,600.4s;36 screenshots
  refreshed. Typecheck/lint/coverage/UI build pass; audit0. Vitest590 passed (server411/shared77/
  UI102), four paid tests skipped; server/shared thresholds unchanged. No dependencies,
  deletions, staging, commits or live Gemini/TTS calls.

- **Free-tier quota handling, room limits and privacy complete (2026-11-20).** Shared429
  classification, per-model Redis daily markers, same-key primary/fallback and immediate
  labelled fallbacks; jury retry blocked atomically until reset and TTS silence across both
  engines. Public AI status, local reset notices, button wait feedback and Home/README privacy.
  Configurable DST-aware Pacific midnight reset; IP create10/join30 defaults and trusted nginx
  forwarding. Normal demo unchanged; explicit E2E-only injected quota mode makes no provider
  calls or room-state edits.623 tests pass (server436/shared79/UI108),4 opt-in live tests skipped.
  Coverage S/B/F/L: server91.94/92.66/94.67/93.19%; shared100%; UI69.50/79.16/66.58/75.18%
  (reporting only). Thresholds unchanged. Typecheck/clean lint/UI build/encoding pass; audit0.
  Final E2E5/5,619.5s, no retries/flaky tests: desktop/320px full games, quota/reset/voice-off,
  IP create limit and privacy. Services stopped; no dependencies/deletions/staging/commits.
  Lasting quota decisions and SDK-source limitation: docs/decisions.md and agent-docs/backend.md.

- **Stage 11B: production deploy files complete (repo prep only).** Production Compose override
  adds Caddy2 HTTPS on SITE_HOST/DuckDNS, only80/tcp+443/tcp+443/udp published, port resets,
  restart policies and10m x3 log rotation across all six services. Redis128mb/noeviction,
  256MB API/worker V8 heaps, inherited pgdata and healthchecks. Placeholder-only production
  template replaces dev DB credentials and explicitly maps app env without loading local
  secrets. Ubuntu/2GB swap/Docker apt/launch/update/stop-start runbook in deploy.md, including
  the explicit no-backup decision and post-launch checks. Base Compose/nginx/Dockerfiles unchanged.
  Compose v5.3.1 resolves only Caddy's ports; placeholder app env passes config.ts validation.
  Caddy config validates with networking disabled. Typecheck/lint pass;623 tests pass
  (server436/shared79/UI108),4 opt-in live tests skipped; encoding passes. No cloud/real-AI work,
  secrets files, npm dependencies, staging or commits. These checks record local config validation;
  no hosted performance results are recorded here.

- **Stage 11: deployment notes retained (11B + 11C + 11D).** Deploy files and runbook prepared
  (11B), deploy README (11C), status wording aligned (11D). Quarrel was deployed once on AWS
  for practice, then the server was discontinued. There is no live instance and the deployment
  is not actively maintained. Notes and configuration are kept for reuse; local Docker Compose
  remains available. No deployment dates, live URL, load metrics or verification results are recorded.

## Next: owner review, commit/push and CI
Owner reviews the changes/screenshots and audible playback, commits/pushes, then confirms CI.
Agents must never stage, commit or push. The practice deployment's server is discontinued;
the runbook is retained for reuse, not an active rollout.

## Later
Keep the prepared Stage 11B files/runbook as an optional deployment plan; no launch is scheduled.
Scale and measure remain future work, including the Socket.IO Redis adapter and load tests.
