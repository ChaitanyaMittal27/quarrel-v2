# Status

Last updated: 2026-11-18. Updated at the end of each sub-stage.

## Done
- **Stage 0: setup.** npm workspaces (ui, server, shared); Vite UI (minimal page + API health
  line); local Supabase (Postgres + Storage only); Fastify API + Socket.IO; BullMQ worker;
  shared Zod contract; ported shared types/config and the lawyer AI (`server/worker/ai/`, not
  wired into the worker yet); Docker images, nginx, compose, CI. See `docs/inventory.md`.
- **Slice 1A: contract.** `shared/contract/common.ts`, `rooms.ts`, `socket.ts`; `docs/api.md`.
- **Slice 1B: sessions.** JWT access token + rotating refresh token, central error handling,
  Redis moved to port 6380. Details in [backend.md](backend.md).
- **Slice 1C: rooms in Redis.** Atomic create/join/leave/ready scripts, retained expiry records,
  repository/service/mapper/routes, session snapshots, presence reads and typed room events.
  Includes join.lua. Health responses are strict; refresh rotation Lua lives in its own file.
  52 server room tests; race/collision suite repeated five times. Details in [backend.md](backend.md).
- **Slice 1D: sockets and presence.** Cookie-authenticated Socket.IO, 35 s presence keys
  refreshed every 10 s, per-player RoomResponse pushes and leave-to-null notifications.
  15 real-server socket tests, repeated five times; equal room versions accepted for presence.
- **Slice 1E / Slice 1 complete.** Real-fetch lobby/session-expiry/two-tab integration tests
  (five stability runs), temporary React lobby UI, HTTP/socket client helpers and UI tests.
  Coverage enforced per server/shared workspace (90% statements/lines/functions, 85% branches),
  including ported AI and entry points; CI runs coverage. Audit: zero current advisories.
  Rules 1.1-1.17 mapped to tests in `docs/rules-coverage.md`. Compose verified with Supabase
  healthy; UI and session answered HTTP 200 on port 3000. Visual QA remains a follow-up because
  the browser automation native pipe was unavailable.

## Next: Slice 2, setup
Implement the setup rules in `docs/rules.md` through the shared contract and backend layers.

## Later
Slices 3 planner, 4 turns and clocks, 5 lawyer, 6 judge and jury, 7 after the game,
8 TTS; then the UI port (last).
