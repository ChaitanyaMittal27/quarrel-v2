# Architecture

## v1 vs v2
- **v1** (`../quarrel-v1`, read-only): Next.js app; game rules in Postgres SQL functions;
  Supabase Auth + Realtime; clients polled to move the game forward.
- **v2**: backend rebuilt for real-time and scale. Game rules in TypeScript + Redis Lua;
  own sessions; Socket.IO push; server-side deadlines and workers move the game forward even
  with nobody connected. The v1 UI is adapted to v2's contract in the last slice.

## Services
- **web**: nginx serving the built UI; routes `/api` and `/socket.io` to the API.
- **api** (`server/api/`): Fastify REST + Socket.IO. Checks rules, answers requests, pushes
  snapshots. Never calls AI.
- **worker** (`server/worker/`): BullMQ consumers for background and AI jobs
  (`server/worker/ai/` holds the ported lawyer AI).
- **Redis**: live game state, queues, deadlines, presence, pub/sub, rate limits, idempotency,
  refresh tokens. Fast working copy, not the permanent record.
- **Supabase**: Postgres (permanent record, e.g. archives from slice 7) + Storage only.
  No Supabase Auth or Realtime in v2.

## Layout
- `ui/` Vite + React (minimal until the UI port)
- `server/api/`, `server/worker/`, `server/common/` (config, Redis/Supabase clients, tokens)
- `shared/contract/` (Zod), `shared/types/` (v1 types, replaced slice by slice), `shared/config/`
- `db/` Supabase CLI project (plain SQL migrations, supabase-js, no ORM)
- `nginx/`, `docker-compose.yml`, `server/Dockerfile` (api/worker targets), `ui/Dockerfile`
- `docs/` human docs; `agent-docs/` these docs

## Request flow
Browser -> nginx -> API route -> service -> repository (Redis Lua / Supabase) -> mapper ->
per-player snapshot. Changes also push the snapshot to each player's socket (from 1D).
