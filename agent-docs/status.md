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

## Now: Slice 1, rooms and presence (rules 1.1-1.17 in `docs/rules.md`)
- **1E: next.** Integration tests (two players, real API + Redis), throwaway debug page, coverage
  thresholds on.

## Later
Slices 2 setup, 3 planner, 4 turns and clocks, 5 lawyer, 6 judge and jury, 7 after the game,
8 TTS; then the UI port (last).
