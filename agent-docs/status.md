# Status

Last updated: 2026-11-16. Updated at the end of each sub-stage.

## Done
- **Stage 0: setup.** npm workspaces (ui, server, shared); Vite UI (minimal page + API health
  line); local Supabase (Postgres + Storage only); Fastify API + Socket.IO; BullMQ worker;
  shared Zod contract; ported shared types/config and the lawyer AI (`server/worker/ai/`, not
  wired into the worker yet); Docker images, nginx, compose, CI. See `docs/inventory.md`.
- **Slice 1A: contract.** `shared/contract/common.ts`, `rooms.ts`, `socket.ts`; `docs/api.md`.
- **Slice 1B: sessions.** JWT access token + rotating refresh token, central error handling,
  Redis moved to port 6380. Details in [backend.md](backend.md).

## Now: Slice 1, rooms and presence (rules 1.1-1.17 in `docs/rules.md`)
- **1C-1 (agent): next.** Redis data model; Lua scripts for create / leave / set-ready; a STUB
  `join.lua`; repository, service, mapper, routes; full test suite **including the join tests**.
- **1C-2 (owner writes it):** `join.lua`, against the join tests. **Do not implement it.**
- **1D:** Socket.IO handshake auth, TTL presence key, per-player `room:snapshot` push.
  Owner writes the presence refresh and snapshot push.
- **1E:** integration tests (two players, real API + Redis), throwaway debug page, coverage
  thresholds on.

## Later
Slices 2 setup, 3 planner, 4 turns and clocks, 5 lawyer, 6 judge and jury, 7 after the game,
8 TTS; then the UI port (last).
