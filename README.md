# Quarrel v2

A two-player AI debate game in themed pixel-art courtrooms.

[![CI](https://github.com/ChaitanyaMittal27/quarrel-v2/actions/workflows/ci.yml/badge.svg)](https://github.com/ChaitanyaMittal27/quarrel-v2/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js >=22.12](https://img.shields.io/badge/node-%3E%3D22.12-339933.svg)](package.json)

## What it is

Two players take opposing positions and argue through their chosen AI lawyers, with private
consultations, judge summaries and a jury verdict. Themed pixel-art courtrooms, live clocks
and optional voice turn the exchange into a shared hearing. This v2 rebuild separates the
React UI, real-time API and background workers, with Redis live state and Postgres archives.

## Screenshots

![Home: create a debate or join by room code](docs/images/home.png)

<details>
<summary>Desktop debate, verdict and phone layout</summary>

**Debate**

![Debate: characters, clocks, public presentations and private consultations](docs/images/debate.png)

**Verdict**

![Demo verdict with subtopic findings and after-game controls](docs/images/verdict.png)

**320px phone layout**

<img src="docs/images/debate-phone.png" alt="Debate layout at 320px with stacked controls" width="320">

</details>

These are demo-mode screenshots. The demo verdict is explicitly not a real judgment.
Curated copies live in `docs/images/`; generated E2E output stays ignored.

## Features

- Private two-player rooms joined by code; four themes and globally selectable characters/lawyers.
- Live per-player sync, reconnect recovery and server-driven chess-style clocks.
- AI lawyer presentations and two private consultations per player per subtopic.
- Judge summaries, jury verdicts, bounded retries and an explicit jury retry flow.
- Participant-only results archive, independent reviewed markers and mutual rematches.
- Optional public-item voice, playback settings and permitted browser speech fallback.
- Free demo mode with no AI API key; labelled demo/fallback output.
- Responsive desktop/320px layout, reduced motion and adjustable text size.

## Tech stack

| Area | Technology | Purpose |
| --- | --- | --- |
| UI | React, Vite, plain CSS | Snapshot-driven screens and reusable pixel-art stage |
| API and contract | Fastify, Socket.IO, shared Zod schemas | Typed HTTP, validation and per-player live pushes |
| Sessions | JWT access tokens, rotating refresh tokens | Cookie-based player identity and recovery |
| Live state | Redis hashes, Lua, sorted sets | Atomic rules, presence, idempotency and deadlines |
| Jobs | BullMQ worker | Planning, lawyer, summary, jury and archive work |
| Database | Postgres 17, pg, plain SQL migrations | Permanent public results and participant review state |
| AI and voice | Gemini, Gemini TTS, Web Speech | Text generation, optional server audio and browser fallback |
| Tests | Vitest, Playwright | Unit/real-service coverage and full browser games |
| Infrastructure | Docker, Compose, nginx, GitHub Actions | Local stack, HTTP/WebSocket proxy and CI builds/checks |

## Architecture

```mermaid
flowchart LR
  browser[Browser] -->|HTTP| web[web / nginx]
  browser <-->|Socket.IO / WebSocket| web
  web -->|HTTP /api| api[api / Fastify]
  web <-->|Proxy /socket.io| api
  api <-->|State, sessions, Lua| redis[(Redis)]
  api -->|Enqueue BullMQ jobs| redis
  worker[worker / BullMQ] <-->|Queue, deadlines, Lua| redis
  worker -->|Publish room-events| redis
  redis -->|Pub/sub room-events| api
  worker -->|Archive transactions| postgres[(Postgres)]
  api <-->|Results, review, migrations| postgres
  worker -->|Plan, lawyer, judge, jury| gemini[Gemini / external API]
  api -->|Optional public-item TTS| gemini
```

Services in [docker-compose.yml](docker-compose.yml):

- **web:** builds/serves the UI through nginx and proxies API/Socket.IO traffic; port 3000.
- **api:** sessions, HTTP actions, live snapshots, migrations, results and read-only TTS.
- **worker:** background AI/archive jobs and Redis-time deadline reconciliation.
- **redis:** live rooms, queues, presence, deadlines, cache/limits and pub/sub.
- **postgres:** permanent public debate archives and per-participant reviewed timestamps.

Gemini is an optional external service, not a container; demo mode avoids provider calls.

## How it works

- Lua checks and changes a room atomically, preventing competing actions from corrupting state.
- Redis TIME, a deadline sorted set and catch-up advance clocks; worker/API backstops handle stale work.
- Each player receives their own allowlisted snapshot; opponent drafts and consultations stay private.
- Stable BullMQ job IDs deduplicate recovery, with bounded AI retries, fallbacks and work deadlines.
- Workers publish `room-events`; the API fans out fresh per-player snapshots over sockets.
- An immutable public archive outbox survives rematches until its Postgres transaction succeeds.
- Speech requests contain only a saved public item ID; Redis shares audio cache, locks and limits.

See [architecture](agent-docs/architecture.md), [API](docs/api.md),
[design decisions](docs/decisions.md) and [rule coverage](docs/rules-coverage.md).

## Repository layout

```text
ui/                    React screens, art/assets, settings and voice playback
server/
  api/                 Fastify routes, sessions and Socket.IO wiring
  worker/              BullMQ consumers, deadline loop and AI adapters
  rooms/               Room service/repository, mappers, queues and Lua
  results/             Public archive outbox and Postgres results access
  speech/              Public-item authorization, audio cache and generation
  common/              Configuration, tokens, Redis/Postgres clients and Lua loader
  db/                  SQL migration runner
shared/                Zod contracts, catalogs, themes and shared types/helpers
db/migrations/         Numbered SQL migrations
e2e/                   Playwright helpers/specs and demo compose override
nginx/                 Production UI/API/WebSocket proxy configuration
docs/                  API, decisions, rules, inventory and curated screenshots
agent-docs/            Development instructions, environment, status and backlog
```

## Getting started

### Prerequisites and setup

Use **Node.js >=22.12** and Docker with Compose (Docker Desktop on Windows).
CI and the Docker images use Node 24. The commands below use Windows CMD;
in a POSIX shell use `cp` instead of `copy`, and `export NAME=value` instead of `set NAME=value`.

```cmd
git clone https://github.com/ChaitanyaMittal27/quarrel-v2.git
cd quarrel-v2
npm install
copy .env.example .env.local
```

Privately set `SESSION_SECRET` to a random value of at least 32 characters in `.env.local`.
Keep `JUDGE_AI_MODE=demo` from the template and leave provider keys empty for free demo play.
Never commit local environment files. The current scripts and Compose explicitly read
**`.env.local`**, not `.env`.

### Option A: everything in Docker

```cmd
docker compose up --build
```

Open **http://localhost:3000**. Compose supplies Redis and Postgres, overrides their connection
URLs inside the containers, and waits for readiness. API startup applies migrations.

### Option B: individual services for development

First run (the credentials below are the public local-development defaults):

```cmd
docker run -d --name quarrel-redis -p 6380:6379 redis:7
docker run -d --name quarrel-postgres -p 5433:5432 -e POSTGRES_USER=quarrel -e POSTGRES_PASSWORD=quarrel -e POSTGRES_DB=quarrel -v quarrel-pgdata:/var/lib/postgresql/data postgres:17
npm run db:migrate
```

For subsequent runs, use `docker start quarrel-redis quarrel-postgres` instead of `docker run`.
Start each app process in its own terminal at the repository root:

```cmd
npm run dev:api
```

```cmd
npm run dev:worker
```

```cmd
npm run dev:ui
```

Open **http://localhost:5173** in a normal and private window for two player identities.
Create a room, join by code, save positions, Ready, wait for the plan, then let the host Start.
The migration CLI uses the process `DATABASE_URL` or the dev default; API startup also migrates.
Custom database setup and troubleshooting: [environment guide](agent-docs/environment.md).

### Stopping and resetting

For Compose, `docker compose down` stops/removes containers while retaining the Postgres volume.
**Only for a deliberate disposable-data reset**, `docker compose down -v` also deletes that
stack's volumes and archived results. Neither command removes browser cookies/local preferences.

For individual services, stop the app terminals with Ctrl+C, then:

```cmd
docker stop quarrel-redis quarrel-postgres
```

The dev `quarrel-pgdata` volume is separate from Compose's `pgdata`; stopping preserves it.

## Configuration

The table covers the unique variables in [.env.example](.env.example). Defaults come from
[server/common/config.ts](server/common/config.ts), not a local environment file.

| Variable | Required? | Default | Description |
| --- | --- | --- | --- |
| `JUDGE_AI_MODE` | No | `demo` | `demo`: no provider calls; `auto`: real AI when keys are set |
| `SESSION_SECRET` | Yes | None | Private JWT signing secret, at least 32 characters |
| `SESSION_SECRET_PREVIOUS` | No | Unset | Previous signing secret during rotation |
| `COOKIE_SECURE` | No | `false` | Secure cookie flag; enable with HTTPS |
| `REDIS_URL` | No | `redis://localhost:6380` | Dev Redis URL; Compose overrides it internally |
| `DATABASE_URL` | No | `postgres://quarrel:quarrel@localhost:5433/quarrel` | Dev Postgres URL; Compose overrides it internally |
| `API_PORT` | No | `4000` | API listen port; keep 4000 with the supplied nginx config |
| `GEMINI_API_KEY` | Only for real text AI | Unset | Text-model provider key; unnecessary in demo |
| `GEMINI_MODEL` | No | `gemini-3.6-flash` | Text model ID |
| `GEMINI_FALLBACK_MODEL` | No | Unset | Optional fallback model for adapters that support it |
| `GEMINI_TTS_API_KEY` | Only for server TTS | Unset | Separate voice key; never uses the text key |
| `GEMINI_TTS_MODEL` | No | `gemini-3.8-flash-tts` | Server speech model ID |
| `TTS_TIMEOUT_MS` | No | `20000` | Speech timeout, 1000-30000 ms |
| `TTS_CACHE_MAX_BYTES` | No | `2097152` | Maximum cached raw audio bytes per item |

More worker/time-budget settings and
safe voice setup are in the [environment guide](agent-docs/environment.md).

## Testing

With the dev Redis (6380) and Postgres (5433) containers running:

```cmd
npm run typecheck
npm run lint -w @quarrel/ui
npm test
npm run test:coverage
npm run build -w @quarrel/ui
```

Vitest covers shared contracts, UI helpers/rendering and real Redis/Postgres/API integrations.
Server/shared thresholds are 90% statements/lines/functions and 85% branches; UI coverage is
reported without an enforced threshold. Paid AI tests are skipped unless explicitly opted in
through `RUN_LIVE_LAWYER_TESTS=true` or `RUN_LIVE_STAGE6_TESTS=true`; leave them disabled.

Playwright runs separately from `npm test` and coverage against a demo-only Compose stack:

```cmd
npx playwright install chromium
docker compose -p quarrel-e2e -f docker-compose.yml -f e2e/compose.yml up --build -d --wait
npm run test:e2e
docker compose -p quarrel-e2e -f docker-compose.yml -f e2e/compose.yml down
```

Allow about **10 minutes** for the real-duration desktop/phone games. The override forces
demo mode; browser speech/audio are stubbed, while the API/worker/Redis/Postgres stay real.
Tests stop/restart API and worker, so use this isolated project with port 3000 free.
Screenshots go to `e2e/screenshots/`; traces/results to `test-results/`, and the HTML report
to `playwright-report/`. Never commit those directories or `blob-report/`.

CI runs typecheck, coverage, UI build and Docker image builds. See
[ci.yml](.github/workflows/ci.yml) and the [full testing notes](agent-docs/environment.md).

## Contributing

Fork the repository, create a branch and keep PRs small and focused. Open an issue before
larger changes. Run the checks above before a PR; use demo/fake providers for automated tests.
Follow the [coding standards](agent-docs/coding-standards.md), write text as **UTF-8 without
a BOM**, and never commit secrets or generated test output. Agent-specific instructions start
at [agent-docs/README.md](agent-docs/README.md).

## Roadmap

Planned work from the [backlog](agent-docs/todo.md), not current capabilities:

- AWS EC2 deployment with Compose and HTTPS via Caddy on a free DuckDNS hostname (next).
- Two API servers, Socket.IO Redis adapter, sticky sessions and stale-presence fan-out.
- k6 load tests and measured scaling, an enforced UI coverage threshold, and real-AI quality tuning.

## License

[MIT](LICENSE). The license retains the upstream copyright notice alongside
Copyright (c) 2026 Chaitanya Mittal.

## Acknowledgements

Adapted from [Quarrel v1](https://github.com/diamster/falls-hacks-2026-quarrel), the Fall Hacks 2026 winning project built by the original team.
