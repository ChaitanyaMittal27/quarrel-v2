# Environment

The owner works on **Windows + PowerShell** with Docker Desktop. Use `curl.exe` (plain `curl`
is a PowerShell alias). Node >= 22.12.

## Ports
| What | Port |
| --- | --- |
| API (dev) | 4000 |
| Vite dev server | 5173 |
| Compose web (nginx) | 3000 |
| Dev Redis (`quarrel-redis` container) | **6380** -> 6379 inside |
| Supabase API / DB / Studio | 55321 / 55322 / 55323 (others 553xx) |

## Dev mode
1. `npm install` (once)
2. `npm run db:start` (pinned Supabase CLI, `db/` workdir)
3. `docker start quarrel-redis`, or first time:
   `docker run -d --name quarrel-redis -p 6380:6379 redis:7`
4. `npm run dev:api`, `npm run dev:worker`, `npm run dev:ui`

## Compose mode
`npm run db:start` **first** (the API's health check needs Supabase), then
`docker compose up --build` -> http://localhost:3000. Stop: `docker compose down`, `npm run db:stop`.

## Trying the test lobby

Dev: run db:start, start quarrel-redis, dev:api and dev:ui in separate terminals; open
http://localhost:5173. The worker is optional for Slice 1 (no AI jobs yet).
Compose: db:start first, then docker compose up --build; open http://localhost:3000.

Use a normal browser window for A and a private window (or a different browser profile) for B.
Create as A with a theme, topic and duration; copy the code; join as B. Save each player's
position, then Ready in both. Both should show planning / waiting for the plan (Slice 3).
Close/reopen B's lobby to inspect presence; leave as B to see A's closed room and retained seat.
Two normal tabs share a player: use them to inspect synchronized readiness/leave pushes.
The Debug panel shows the latest response/version; the footer reports API/Redis/Supabase health.

## Checks
`npm run typecheck` · `npm test` (needs Redis on 6380) · `npm run test:coverage` ·
`npm run build -w @quarrel/ui`.
Always stop what you started: dev servers, compose, Supabase, `quarrel-redis`.

## CI (`.github/workflows/ci.yml`)
Job `test`: Node 24, Redis service on 6380, typecheck, coverage with server/shared thresholds, UI build. Job `docker`: builds the
api, worker and web images (no push). No secrets; Supabase isn't used in CI.

Coverage includes all server/shared TypeScript (including ported AI and entry points), with
per-workspace thresholds: 90% statements/lines/functions, 85% branches. No source exclusions
were added. Integration stability: run `npx vitest run --project server server/tests/integration`
five times. Reports are in coverage/; UI helper tests have their own Node project.
