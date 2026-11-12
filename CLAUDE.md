# Quarrel v2

Quarrel is a real-time two-player AI debate game, originally built at Fall Hacks 2026 by
Ryan Fu, Alex Lee, Kyunghwan Ko and Chaitanya Mittal (MIT license). v2 is Chaitanya's solo
rebuild of Quarrel's backend. The UI is adapted from v1.

## Target layout
- `ui/`               Vite + React app (adapted from v1's UI). **The UI port is deferred to the
                      last slice**; until then `ui/` is a minimal page with an API health line.
- `server/api/`       API service: checks rules and answers requests
- `server/worker/`    worker service: runs background and AI jobs
- `server/worker/ai/` AI code ported from v1 (Gemini client, lawyer prompts/validation, demo
                      mode, TTS client). Not wired into the worker yet
- `server/common/`    code shared by the API and the worker
- `db/`               Supabase CLI project: Postgres + Storage only. Plain SQL migrations,
                      accessed with supabase-js. No ORM.
- `shared/types/`     TypeScript types shared by UI and server (`@quarrel/shared/types`)
- `shared/contract/`  Zod schemas for every request/response; TS types come from `z.infer`
- `shared/config/`    theme and voice config (`@quarrel/shared/config`)
- `nginx/`            nginx config for the web image: serves the UI, routes `/api` and
                      `/socket.io` to the API
- `docker-compose.yml` redis, api, worker and web (Supabase runs outside, via its CLI)
- `server/Dockerfile`, `ui/Dockerfile` images (`api`/`worker` targets; web = UI + nginx)
- `.github/`          CI: typecheck, shared + server tests (Redis service), UI build, image builds
- `docs/`             `rules.md` (v1's game rules: the behaviour v2 must keep), `contract.md`
                      (v1's API: reference only, not a spec), `baseline.md` (v1's tests),
                      `inventory.md` (every v1 file and where it goes in v2)

`shared/` must not import from `server/` or `ui/`, and must not use Node-only or browser-only APIs.

## Commands
- Dev: `npm run db:start`; Redis via `docker start quarrel-redis` (or
  `docker run -d --name quarrel-redis -p 6379:6379 redis:7`); then `npm run dev:api`,
  `npm run dev:worker`, `npm run dev:ui`.
- Compose: `npm run db:start`, then `docker compose up --build` → http://localhost:3000.
  Stop with `docker compose down`, `npm run db:stop`.
- Checks: `npm run typecheck`, `npm test` (needs Redis), `npm run test:coverage`,
  `npm run build -w @quarrel/ui`.
- Never leave dev servers, compose or Supabase running after a check: start, check, stop.

## Reference
`../quarrel-v1` is the original Quarrel repo. It is READ-ONLY: read it and port from it,
never edit, build into, or run commands that change anything inside it. When behaviour is
unclear, check v1's code and tests or ask. Do not guess game rules.

## Rules
- NEVER run `git commit`, `git push`, or anything that rewrites history (rebase, reset,
  amend, force-push). The owner makes all commits.
- Contract-first: v2 designs its own contract, slice by slice. Write the Zod schema in
  `shared/contract/` before the endpoint that uses it; those schemas are the source of truth.
  `docs/contract.md` describes v1's API and is only a reference for ideas. What v2 must
  preserve is the game behaviour in `docs/rules.md`. The v1 UI is adapted to the v2 contract
  in the last slice.
- Port each v1 rule ONCE, straight into the v2 design, using `docs/rules.md` as the checklist.
- The UI calls the backend only through `ui/src/lib/api.ts`. No other UI file talks to the
  server directly.
- Mappers build each player's snapshot: the server never sends raw rows; a mapper decides
  what each player is allowed to see.
- `JUDGE_AI_MODE=demo` by default. Use real AI only when told to.
- Never print, log or commit secrets or `.env*` files (only `.env.example` is tracked).
- Ask before adding dependencies or deleting files.
- Keep checks quick between steps (typecheck / the relevant tests), and don't call a step
  done while they fail.
- The owner is learning this stack: after each step, explain what was done and why in plain
  language, including any concept used for the first time.
