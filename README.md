# Quarrel v2

Quarrel is a real-time two-player debate game with AI lawyers, summaries and a jury. v2 is a
solo rebuild: Fastify + Socket.IO, BullMQ workers, Redis live state and plain Postgres archives.
React/Vite supplies the pixel-art UI, with shared Zod contracts and theme/character catalogs.

Adapted from Quarrel (https://github.com/diamster/falls-hacks-2026-quarrel), built at Fall Hacks
2026 by Ryan Fu, Alex Lee, Kyunghwan Ko and Chaitanya Mittal. The art is ported; screens and
backend are rebuilt. Stage 8 adds participant-only saved results, reviewed markers and rematches.
Stage 9 is TTS; Stage 10 deploys compose on one EC2 instance with Caddy HTTPS/domain and nginx
UI (not Vercel), then scale and measure.

## Development
Node >=22.12 and Docker Desktop. Create .env.local from .env.example with SESSION_SECRET
(at least 32 characters). Keep JUDGE_AI_MODE=demo; no Gemini key is needed. DATABASE_URL
has a local Postgres default; never print local env files or credentials.

```cmd
npm install
docker run -d --name quarrel-redis -p 6380:6379 redis:7
docker run -d --name quarrel-postgres -p 5433:5432 -e POSTGRES_USER=quarrel -e POSTGRES_PASSWORD=quarrel -e POSTGRES_DB=quarrel -v quarrel-pgdata:/var/lib/postgresql/data postgres:17
npm run db:migrate
npm run dev:api
```

In separate terminals run npm run dev:worker and npm run dev:ui. Later use docker start
quarrel-redis quarrel-postgres. Default DATABASE_URL is
postgres://quarrel:quarrel@localhost:5433/quarrel. API startup also applies migrations safely.

Compose includes Postgres and Redis: docker compose up --build, open http://localhost:3000.
No external database/auth/storage service is needed. Stop with docker compose down (no -v).
Dev cleanup: stop dev terminals, docker stop quarrel-redis quarrel-postgres; archives persist.

## Try it
Open http://localhost:5173 in normal/private browser windows. Create -> join -> positions ->
Ready -> host Start -> arguments/private consultations -> summaries -> demo verdict. My results
shows only your archived debates. Reviewed means read, not agreement. Both players can request
a rematch with the same setup/cosmetics and fresh positions; old results remain after leaving.
Reconnects retain the room and clocks; #/gallery previews all art. Check a 320px window too.

## Checks and references
npm run typecheck; npm test; npm run test:coverage; npm run build -w @quarrel/ui; npm audit.
Tests require Redis localhost:6380 and Postgres localhost:5433; no live AI calls. Server/shared
coverage thresholds are 90% statements/lines/functions and 85% branches; UI is reported too.

See [environment.md](agent-docs/environment.md) for CMD/psql/compose/manual checks,
[docs/api.md](docs/api.md) for contracts, [decisions.md](docs/decisions.md) for design choices,
and [rules-coverage.md](docs/rules-coverage.md) for the rule-by-rule proof.
