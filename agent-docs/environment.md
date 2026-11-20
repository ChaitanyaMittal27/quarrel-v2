# Environment

Windows + PowerShell/CMD, Docker Desktop, Node >=22.12. Use curl.exe in PowerShell.
Never print or modify the owner's .env.local; .env.example is the configuration template.

## Ports and first-time dev containers
| Service | Host -> container |
| --- | --- |
| API / Vite / compose nginx | 4000 / 5173 / 3000 |
| quarrel-redis | 6380 -> 6379 (never use local 6379) |
| quarrel-postgres (Postgres 17) | 5433 -> 5432 |

```cmd
npm install
docker run -d --name quarrel-redis -p 6380:6379 redis:7
docker run -d --name quarrel-postgres -p 5433:5432 -e POSTGRES_USER=quarrel -e POSTGRES_PASSWORD=quarrel -e POSTGRES_DB=quarrel -v quarrel-pgdata:/var/lib/postgresql/data postgres:17
npm run db:migrate
```

For subsequent runs: docker start quarrel-redis quarrel-postgres. The known local development
user/password/database are quarrel; named volume quarrel-pgdata persists archives. Do not
remove the volume to restart services. No hosted database CLI, API or Studio is needed.

DATABASE_URL is Zod-validated, default postgres://quarrel:quarrel@localhost:5433/quarrel.
Only .env.example was changed by Stage 8. Existing obsolete provider variables are ignored.
The db:migrate CLI reads DATABASE_URL from the process environment (or dev default), without
requiring session/AI config or reading .env.local. API/worker dev commands retain --env-file.
The API also migrates automatically at startup; two startup runners are advisory-locked.

Inspect SQL from CMD without installing psql locally:

```cmd
docker exec -it quarrel-postgres psql -U quarrel -d quarrel
```

Use \dt, SELECT name FROM schema_migrations;, and SELECT id,topic,completed_at FROM debates;.
Player/session tokens, private drafts and consultations must never be printed or archived.

## Run in Windows CMD (three terminals, demo only)

```cmd
set JUDGE_AI_MODE=demo
npm run dev:api
```

```cmd
set JUDGE_AI_MODE=demo
npm run dev:worker
```

```cmd
npm run dev:ui
```

Open http://localhost:5173 in a normal and private window (different player cookies).
Create with topic/theme/duration, join, save positions, Ready, host Start. A 120-second-per-
player demo plan gives two subtopics of 60 seconds each per player (240 seconds total clock
budget, plus AI/display pauses and countdown). Submit arguments and private consultations;
let both clocks expire per subtopic. See labelled summaries for four seconds, then a demo
inconclusive verdict. Both clocks pause during AI work; disconnect never pauses writing time.
Settings remain available; #/gallery previews assets. Check 320px and reduced motion/text size.

After completion: open My results in both windows, inspect public transcript/summaries/verdict,
mark reviewed independently, and request Rematch on each side. One request waits; the second
returns both to positions with the SAME topic/theme/duration/cosmetics. Previous results stay
available. Leave, then open My results: the saved result remains accessible with those cookies.
An immediate rematch can precede SQL commit: an immutable public Redis outbox protects the
old debate until its archive job succeeds. Results may briefly show a saving/not-ready state.

To test reconnect, stop API for about 10s and restart: keep the room/ticking clocks, show
Reconnecting, then resume with a fresh snapshot. To test dead-worker fallback, stop the worker
BEFORE submitting (demo is fast); API's Redis-time backstop resumes work after about 30s.
Jury has no work deadline and waits for the worker; it never fabricates a failure verdict.

## Safe jury failure/retry without paid AI
Stop the demo worker after the last summary is saved, before its four-second display ends.
Start it with an explicitly whitespace-only key (the space inside the quotes matters):

```cmd
set JUDGE_AI_MODE=auto
set "GEMINI_API_KEY= "
npm run dev:worker
```

This process value overrides the env-file key, then config trims it empty: jury immediately
requires retry without calling the provider. Stop it, set JUDGE_AI_MODE=demo and restart.
Either player presses Retry; both reach the demo verdict. A second manual retry within 60s
is rejected. Never perform this test with auto mode and a real key.

## Compose

```cmd
docker compose up --build
```

Open http://localhost:3000. Compose now includes postgres:17 with named volume pgdata and
pg_isready; API/worker depend on it healthy, worker also waits for API migrations/readiness.
DATABASE_URL is overridden to postgres://quarrel:quarrel@postgres:5432/quarrel. No database
port is published in compose; nginx alone publishes 3000. Inspect with:

```cmd
docker compose exec postgres psql -U quarrel -d quarrel
```

Stop with docker compose down (no -v). For dev stop all terminals, then docker stop
quarrel-redis quarrel-postgres. Stop services started during an agent task.

## Checks and CI
npm run typecheck; npm test; npm run test:coverage; npm run build -w @quarrel/ui; npm audit.
Tests need Redis 6380 and Postgres 5433. Results tests delete only their own rows; migration
tests create/drop their own dedicated temporary database, serialized by an advisory lock.
They never reset/truncate the development archive. Tests use fakes/demo, never live Gemini.
Coverage includes all server/shared source, thresholds S/L/F>=90%, branches>=85%, UI reporting
only. Stage 8 stability runs use three full default-parallel coverage invocations.
CI test job provides redis:7 on 6380 and postgres:17 on 5433; typecheck, coverage, UI build.
Docker job builds api/worker/web without publishing. API image includes numbered migrations.

## Roadmap
Stage 9 TTS, then Stage 10 deployment: one EC2 instance with compose, Caddy HTTPS, a domain,
nginx UI (not Vercel), DATABASE_URL pointing at the Postgres container; then scale and measure.
