# Decisions

The main choices behind Quarrel v2 and why. Newer decisions for a specific stage or sub-stage live
next to that work (for example `inventory.md` §9 for the v1 port).

## Repository

- **Fresh repo.** v2 lives in its own public repository with no shared git history.
  `../quarrel-v1` (the original) is a read-only reference. The README and LICENSE credit the
  original team.
- **Fresh folders, not moves.** `db/` is a fresh `supabase init` and `ui/` a fresh Vite app; only
  the files v2 needs are copied in. v1's SQL migrations are not carried over: their game rules
  move to Redis, Lua and TypeScript.
- **Commits.** Claude Code never commits. The owner commits at the end of each sub-stage or stage.

## Frontend

- **Vite + React, not Next.js.** v2 needs no server rendering or API routes, and several services
  sit behind nginx anyway.
- **Incremental UI port.** Stage 5 rebuilds the UI: 5A art/catalog/stage, 5B choices/settings,
  5C real lobby/setup/planning/debate screens. Then Stage 6 lawyer/consultations, Stage 7
  summaries/judge/jury, Stage 8 Postgres archives, Stage 9 TTS, then scale and measure.

## Contract

- v2 designs its own contract, stage by stage. Zod schemas in `shared/contract/` are the source
  of truth, and TypeScript types come from `z.infer`.
- The UI calls the backend only through `ui/src/lib/api.ts`.
- `docs/contract.md` describes v1's API and is a reference only. What v2 must preserve is the game
  behaviour in `docs/rules.md` (for example, deadlines fire on the server even when nobody is
  connected).
- v2 chooses its own errors, each with a `code` field, and drops legacy fields. The v1 UI is
  adapted to the v2 contract at the end.

## Server

- **Layers.** Routes (`server/api`) call services (the game rules), which use repositories
  (Redis, Supabase). Mappers turn internal state into each player's snapshot; that is where
  private data is filtered out.
- **The API never calls AI.** AI work runs in BullMQ workers.
- **Redis** holds live state, queues, deadlines, presence, pub/sub, rate limits and idempotency
  keys. **Postgres** (through Supabase) is the permanent record.
- **Plain Supabase, no ORM.** supabase-js on the server with the service-role key (server only);
  plain SQL migrations through the Supabase CLI. Postgres and Storage only: Realtime is replaced
  by Socket.IO, and Supabase Auth by the API's own signed session cookie. The local Auth service
  still runs because it issues the API keys Storage needs.
- **Two Redis clients.** The API's fails fast (no offline queue), so requests never hang during
  an outage. BullMQ's waits through outages, so workers resume on their own.
- **Socket.IO push** arrives in stage 1 (lobby) with presence. HTTP polling stays as a fallback.

## Game scope

- **Not ported:** the `debate/*` and `judge` routes and the legacy shared judge (dead code in v1).
- **Demo mode:** v2's demo AI will return a labelled verdict so a full game can finish (v1's demo
  stops at the jury).

## Running and testing

- **Docker.** `server/Dockerfile` has `api` and `worker` targets that run TypeScript through tsx
  (bundling later if needed). `ui/Dockerfile` builds the UI into an nginx image that also routes
  `/api` and `/socket.io` to the API. Supabase runs through its own CLI, outside compose.
- **CI.** Shared and server tests with a Redis service, the UI build, and Docker image builds. UI
  tests join with the UI port.
