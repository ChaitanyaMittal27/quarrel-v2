# Quarrel v2

Quarrel is a real-time two-player AI debate game, originally built at Fall Hacks 2026 by
Ryan Fu, Alex Lee, Kyunghwan Ko and Chaitanya Mittal (MIT license). v2 is Chaitanya's solo
rebuild of Quarrel's backend. The UI is adapted from v1.

## Target layout
- `ui/`             Vite + React app (adapted from v1's UI)
- `server/api/`     API service: checks rules and answers requests
- `server/worker/`  worker service: runs background and AI jobs
- `server/common/`  code shared by the API and the worker
- `db/`             Supabase CLI project: Postgres + Storage only. Plain SQL migrations,
                    accessed with supabase-js. No ORM.
- `shared/types/`    TypeScript types shared by UI and server
- `shared/contract/` Zod schemas for every request/response; TS types come from `z.infer`
- `shared/themes/`   theme and voice config
- `nginx/`          routing / reverse proxy config
- `docs/`           `contract.md`, `rules.md`, `baseline.md` (all describe v1, the spec for v2)

## Reference
`../quarrel-v1` is the original Quarrel repo. It is READ-ONLY: read it and port from it,
never edit, build into, or run commands that change anything inside it. When behaviour is
unclear, check v1's code and tests or ask. Do not guess game rules.

## Rules
- NEVER run `git commit`, `git push`, or anything that rewrites history (rebase, reset,
  amend, force-push). The owner makes all commits.
- Contract-first: `docs/contract.md` defines what the UI expects. Write the Zod schema in
  `shared/contract/` before the endpoint that uses it.
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
