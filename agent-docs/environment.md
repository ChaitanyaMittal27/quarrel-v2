# Environment

Windows + PowerShell/CMD, Docker Desktop, Node >=22.12. Use curl.exe in PowerShell.
Never read, print or modify the owner's .env.local. .env.example and
deploy/env.production.example are placeholder-only configuration templates.

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

## Production deployment notes (Stages 11B-11D)

Follow [deploy.md](deploy.md) for Ubuntu/2GB swap, official Docker apt install, first launch,
updates, stop/start and the post-launch checklist. Quarrel was deployed once on AWS for
practice; that server has since been discontinued and is not maintained. The runbook is
kept for reuse, without recorded hosted performance or verification results.
The dev docker-compose.yml, nginx config and Dockerfiles remain unchanged by this stage.

- [docker-compose.prod.yml](../docker-compose.prod.yml) overrides the base: only Caddy exposes
  80/tcp,443/tcp,443/udp; all services restart unless-stopped and rotate logs at10m x3.
- [deploy/Caddyfile](../deploy/Caddyfile) uses SITE_HOST (your DuckDNS hostname), automatic
  HTTPS, compression/security headers and one proxy to web:80; nginx keeps REST/socket routes.
- [deploy/env.production.example](../deploy/env.production.example) contains placeholders
  only. The owner copies it privately to .env.local on the server; never create/read a real
  env file during agent validation. SITE_HOST must resolve to the Elastic IP before launch.
- Production resets inherited service env_file entries and explicitly maps settings from
  Compose's selected --env-file. DATABASE_URL expands POSTGRES_PASSWORD; the override replaces
  the base dev database password/URL. App config uses auto (not real) for real AI. Secure cookies,
  trusted proxy and API_PORT4000 are enforced; the E2E quota switch is off.
- Redis128mb/noeviction protects queues/state from eviction; cap exhaustion rejects writes.
  API/worker have256MB V8 heap caps (not total RSS limits). Swap/build concurrency/memory need
  checking on the real t3.small. pgdata persists on disk, with **no backup by decision**.

Safe offline config checks (placeholders only; do not print config with real secrets):

```cmd
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file deploy/env.production.example config --quiet
docker compose --env-file deploy/env.production.example config --no-env-resolution --quiet
```

The second validates the unchanged dev model without loading its private service env file.
Require Compose v2.24+ or v5+ for !reset; the official Docker apt plugin supports it. Production
startup uses the owner's private .env.local as shown in deploy.md. Never apply the production
template locally with up: auto mode is intentional production configuration, not a test mode.

## Checks and CI
### Automated full-game browser checks

Playwright is a root dev dependency; install its Chromium once with `npx playwright install chromium`.
The suite is deliberately separate from npm test/coverage. Use Windows CMD at the repo root:

```cmd
docker compose -p quarrel-e2e -f docker-compose.yml -f e2e/compose.yml up --build -d --wait
npm run test:e2e
docker compose -p quarrel-e2e -f docker-compose.yml -f e2e/compose.yml down
```

The override forces API and worker JUDGE_AI_MODE=demo even if .env.local has provider keys.
Do not omit it. Port 3000 must be free. Tests use two isolated Chromium contexts, unique
sessions/topics and real API/worker/Redis/Postgres; no old room/result data is required or
deleted. Serial execution is necessary because outage checks stop/restart API and worker.
Each width plays real 120-second-per-player games; allow about 12 minutes for a full suite.
Speech APIs are stubbed through addInitScript: no sound/provider calls. Only speech engines
are faked; snapshots, work deadlines, clocks and four-second summary display stay real.
Screenshots live in gitignored e2e/screenshots/ (ordered desktop and 320x640 phone PNGs).
Failures retain traces/screenshots under test-results/; open playwright-report/index.html
or use `npx playwright show-report`. Docker access is needed by the test process itself.
Cleanup restores stopped API/worker after failures; always run compose down after testing,
without -v (archive volume retained). These browser checks do not replace listening to real
audio once in a normal browser or visually reviewing the screenshot gallery.

### Unit, integration and coverage checks
npm run typecheck; npm test; npm run test:coverage; npm run build -w @quarrel/ui; npm audit.
Tests need Redis 6380 and Postgres 5433. Results tests delete only their own rows; migration
tests create/drop their own dedicated temporary database, serialized by an advisory lock.
They never reset/truncate the development archive. Tests use fakes/demo, never live Gemini.
Coverage includes all server/shared source, thresholds S/L/F>=90%, branches>=85%, UI reporting
only. Stage 8 stability runs use three full default-parallel coverage invocations.
CI test job provides redis:7 on 6380 and postgres:17 on 5433; typecheck, coverage, UI build.
Docker job builds api/worker/web without publishing. API image includes numbered migrations.

## Roadmap
The AWS practice deployment's server has been discontinued. Stage 11 deployment notes and
configuration are retained for reuse; scale and measure remain future work.


## Stage 9 voice: demo and optional real TTS
No dependency install or secret is needed for demo/browser voice. Start Redis/Postgres, API,
worker and UI as above with JUDGE_AI_MODE=demo. In room Settings, Voice on + Use browser voice
when needed are on by default; Autoplay is OFF. Click Play beside an announcement, presentation,
summary or verdict. The API safely returns fallbackAllowed true without a provider call;
Web Speech speaks it with the catalog pitch/rate. Test Play/Stop, mute/volume/speed, first-
interaction autoplay, two browsers, reduced motion and a 320px window. Clocks keep running.
Blocked text displays Not available for both engines. Browser/OS English voice support varies.

For real TTS LATER, privately set GEMINI_TTS_API_KEY to a separate TTS credential in your local
configuration. Never print it or fall back to GEMINI_API_KEY. Keep the WORKER in demo mode
so planning/lawyer/jury remain free; restart only the API in auto mode:

```cmd
set JUDGE_AI_MODE=auto
npm run dev:api
```

GEMINI_TTS_MODEL defaults to gemini-3.8-flash-tts (must match gemini-*tts*), TTS_TIMEOUT_MS
is milliseconds 1000..30000/default20000, TTS_CACHE_MAX_BYTES defaults to2097152 raw bytes.
Only .env.example was edited by the agent; no local secret file was read or changed. The API uses the
Gemini Interactions REST speech format, returning validated WAV (or PCM wrapped as WAV).
Play the same item in both windows to try shared cache/dedup; missing key/demo/provider errors
show permitted browser fallback, provider content blocks never do. No live TTS calls are part
of automated checks. Stop all processes and both dev containers afterwards.

The E2E override limits room creation to one attempt per IP per hour. Each independent
full-game/quota scenario resets only limits:rooms:* counters in the isolated E2E Redis;
room/result/archive data is retained. The extra quota spec proves the next create displays
a wait under its button, and forms specs verify the always-visible privacy note.
Normal demo ignores model-exhaustion keys. The isolated E2E override explicitly enables
AI_QUOTA_E2E=true and fixed fake model IDs in demo mode, allowing only the requested Redis
quota injection. No providers run and no room state/game deadlines are rewritten. Injected
quota markers expire naturally after15s; the test proves jury blocking and Retry after reset,
voice silence, and Home/room notices. Auto-mode unit/integration tests use provider fakes.
