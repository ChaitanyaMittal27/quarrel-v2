# Quarrel v2

Quarrel is a real-time two-player debate game where AI lawyers argue each side and an AI judge
and jury decide the winner. v2 is a solo rebuild of Quarrel's backend: a separate API service and
worker, Postgres and Storage via Supabase, and a shared, schema-checked contract between the UI
and the server.

Adapted from Quarrel (https://github.com/diamster/falls-hacks-2026-quarrel), built at Fall Hacks
2026 by Ryan Fu, Alex Lee, Kyunghwan Ko and Chaitanya Mittal. The UI is adapted from the original;
the backend is rebuilt from scratch.

Status: in progress. The foundations are in place (services, Docker, CI, the AI code ported from
v1); the game is being rebuilt stage by stage. Stage 5C completes the core UI port:
the web app has snapshot-driven create/join, positions, planning, debate and ended screens,
with selectable pixel-art cast, settings and a gallery at #/gallery.

## Architecture

- **web**: nginx serves the React UI (Vite build) and routes `/api` and `/socket.io` to the API.
- **api**: Fastify + Socket.IO. Checks game rules and answers requests; never calls AI.
- **worker**: BullMQ worker for background and AI jobs (Gemini).
- **Redis**: live state, job queues, deadlines, presence, pub/sub.
- **Supabase** (Postgres + Storage): the permanent record, run with the Supabase CLI.

Code shared by the UI and server (types, theme config, Zod contract) lives in `shared/`.
Design choices are explained in [docs/decisions.md](docs/decisions.md).

## Prerequisites

- Node.js >= 22.12
- Docker (for Redis, Supabase and compose mode)

Create `.env.local` from `.env.example` and fill in the values. After `npm run db:start`,
`npx supabase status --workdir db` shows the local Supabase URL and the service-role key.
`SESSION_SECRET` (required, signs session tokens) can be generated with
`node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.
The Gemini keys are only needed for real AI (`JUDGE_AI_MODE=auto`); the default is
`JUDGE_AI_MODE=demo`.

## Running

**Dev mode** (hot reload):

```sh
npm install
npm run db:start                                    # local Supabase
docker run -d --name quarrel-redis -p 6380:6379 redis:7   # or: docker start quarrel-redis
npm run dev:api        # API on http://localhost:4000
npm run dev:worker     # in another terminal
npm run dev:ui         # in another terminal; open the URL Vite prints
```

**Compose mode** (everything in containers):

```sh
npm run db:start
docker compose up --build
# open http://localhost:3000
```

Stop with `docker compose down` and `npm run db:stop`.

## Try the lobby

In dev open http://localhost:5173; in compose open http://localhost:3000.
Use a normal window for A and a private window (or different browser profile) for B, so they
have separate cookies. A creates with name/theme/topic/duration and shares the code; B joins.
Each saves a position, then both click Ready. Run `npm run dev:worker` alongside the API/UI
with demo AI: both see **Preparing the debate**, then the plan. Host A presses Start debate
while both are connected; both see 3-2-1, then Debate started. Send raw arguments on your turn;
chess clocks pass turns on submit/expiry, then advance subtopics and finish at Debate ended.
The 120-second setting gives each player two 60-second subtopic clocks. Disconnect B to see presence
turn off, reconnect to restore it, then leave to see the closed room with a retained seat. The expiry time is visible in the room; settings controls cast and local display.
Losing a connection shows Reconnecting and resumes automatically without leaving the room. Two normal tabs share one player and stay in sync.

AI lawyer and consultations arrive in Stage 6, summaries/judge/jury in Stage 7. Socket presence expires
after 35 seconds if a server crashes; proactive stale-presence pushes are a later follow-up.

## Tests

```sh
npm test               # needs Redis on localhost:6380
npm run test:coverage  # enforced 90/90/90/85 thresholds per server/shared workspace
npm run typecheck
```

CI runs test:coverage. All server/shared source, including ported AI, remains measured.
The Slice 1-4 rule-by-rule proof is in [docs/rules-coverage.md](docs/rules-coverage.md).
