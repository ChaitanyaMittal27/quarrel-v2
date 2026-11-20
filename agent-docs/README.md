# Agent docs: start here

Instructions for coding agents working on **Quarrel v2**. Written for agents, kept short.
The root `AGENTS.md` and `CLAUDE.md` only point here; every rule lives in this folder.

**Quarrel** is a real-time two-player AI debate game (Fall Hacks 2026; Ryan Fu, Alex Lee,
Kyunghwan Ko, Chaitanya Mittal; MIT). **v2** is Chaitanya's solo rebuild of the backend:
Fastify API + BullMQ workers + Redis for live state, plain Postgres for permanent public archives.

## Always read, in this order
1. [workflow.md](workflow.md): how work is done here, the never-commit rule, the report format.
2. [status.md](status.md): where the project is and what comes next.
3. [coding-standards.md](coding-standards.md): before changing any code.

## Then read what the task needs
| Change area | Read |
| --- | --- |
| Planning, cross-cutting changes, "how does it fit together" | [architecture.md](architecture.md) |
| Anything in `server/` (API, worker, sessions, Redis keys, errors) | [backend.md](backend.md) |
| Anything in `ui/` | [frontend.md](frontend.md) |
| Running, testing, Docker, ports, CI | [environment.md](environment.md) |
| Something behaves oddly, or before debugging | [hazards.md](hazards.md) |
| Known follow-ups and backlog | [todo.md](todo.md) |

## Human-facing docs (linked, not copied)
- `docs/decisions.md`: why things are the way they are.
- `docs/api.md`: the v2 API so far. `shared/contract/` (Zod) is the source of truth.
- `docs/rules.md`: v1's game rules, the behaviour v2 must keep (checklist per stage).
- `docs/inventory.md`: every v1 file and where it went in v2.
- `docs/contract.md`: v1's API. Reference only, **not** a spec for v2.
- `docs/baseline.md`: v1's test baseline.

## Current stage numbering
Stage 5 is the UI port: 5A art/catalog/stage, 5B choices/settings, 5C real game screens.
Then Stage 6 AI lawyer/consultations, Stage 7 summaries/judge/jury, Stage 8 after-game Postgres
archives, Stage 9 TTS, Stage 10 deployment, then scale and measure. Rule IDs and historical v1 code/test names stay
unchanged. status.md tracks completion and the next task.
