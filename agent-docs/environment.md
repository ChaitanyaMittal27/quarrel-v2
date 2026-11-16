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

## Checks
`npm run typecheck` · `npm test` (needs Redis on 6380) · `npm run test:coverage` ·
`npm run build -w @quarrel/ui`.
Always stop what you started: dev servers, compose, Supabase, `quarrel-redis`.

## CI (`.github/workflows/ci.yml`)
Job `test`: Node 24, Redis service on 6380, typecheck, tests, UI build. Job `docker`: builds the
api, worker and web images (no push). No secrets; Supabase isn't used in CI.
