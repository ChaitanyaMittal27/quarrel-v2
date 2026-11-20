# Architecture

## v1 vs v2
- **v1** (`../quarrel-v1`, read-only): Next.js app; game rules in Postgres SQL functions;
  hosted authentication and realtime; clients polled to move the game forward.
- **v2**: backend rebuilt for real-time and scale. Game rules in TypeScript + Redis Lua;
  own sessions; Socket.IO push; server-side deadlines and workers move the game forward even
  with nobody connected. The UI is rebuilt incrementally in Stage 5 (5A art, 5B settings, 5C game screens).

## Services
- **web**: nginx serving the built UI; routes `/api` and `/socket.io` to the API.
- **api** (`server/api/`): Fastify REST + Socket.IO. Checks rules, answers requests, pushes
  snapshots. Text AI stays in workers; read-only TTS runs in the API.
- **worker** (`server/worker/`): BullMQ consumers for background and AI jobs
  (`server/worker/ai/` holds the ported lawyer AI).
- **Redis**: live game state, queues, deadlines, presence, pub/sub, rate limits, idempotency,
  refresh tokens. Fast working copy, not the permanent record.
- **Postgres 17**: public debate archives and per-player reviewed timestamps, queried through pg.
  Redis owns live state/session/presence; no hosted auth/storage service is required.

## Layout
- `ui/` Vite + React (snapshot-driven game screens, display stage/settings and offline gallery)
- `server/api/`, `server/worker/`, `server/common/` (config, Redis/Postgres clients, tokens)
- `shared/contract/` (Zod), `shared/types/` (v1 types, replaced stage by stage), `shared/config/`
- `db/` numbered SQL migrations, applied by server/db/migrate.ts; no ORM
- `nginx/`, `docker-compose.yml`, `server/Dockerfile` (api/worker targets), `ui/Dockerfile`
- `docs/` human docs; `agent-docs/` these docs

## Request flow
Browser -> nginx -> API route -> service -> repository (Redis Lua / parameterized Postgres) -> mapper ->
per-player snapshot. Changes also push the snapshot to each player's socket (from 1D).


## After the game (Stage 8)
Completion atomically freezes archive:<debateId> in Redis and records pending-archives routing.
A BullMQ archive worker inserts the public debate and both participant rows in one Postgres
transaction. Frozen outboxes have no TTL and are deleted only after commit; a fast rematch,
leave or live-room TTL cannot erase their input. Results routes read Postgres only once saved,
with participant membership on every list/read/ack. Ack means reviewed, not agreement.
Rematches retain setup/cosmetics, clear debate state, and use a new opaque debateId; queue
identities and result fences include that ID. API/worker each own one pg Pool, closed on stop.

## Deployment status and future work
Quarrel was deployed once on AWS for practice, then the server was discontinued. No live
instance is maintained. The [deployment notes](../deploy/README.md) retain the single-server
Compose/Caddy configuration and runbook for reuse. Scale and measure remain future work.
