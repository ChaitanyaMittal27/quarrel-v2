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
| Stage 11 AWS practice deployment (server discontinued) and reusable runbook | [deployment notes](../deploy/README.md), [deploy.md](deploy.md) |
| Something behaves oddly, or before debugging | [hazards.md](hazards.md) |
| Known follow-ups and backlog | [todo.md](todo.md) |
| UI art extraction, reuse choices and historical port decisions | [plans/ui-port-plan.md](plans/ui-port-plan.md) |
| Original v1-to-v2 file mapping and migration notes | [plans/v1-port-inventory.md](plans/v1-port-inventory.md) |
| Historical v1 API or test baseline (only when porting/comparing) | [v1 contract](reference/v1/contract.md), [v1 baseline](reference/v1/baseline.md) |

## Human-facing docs (linked, not copied)
- `docs/decisions.md`: why things are the way they are.
- `docs/api.md`: the v2 API so far. `shared/contract/` (Zod) is the source of truth.
- `docs/rules.md`: retained game-rules reference; explicit v2 decisions take precedence.
- `docs/rules-coverage.md`: rule-to-test proof and v2 differences.
- `docs/images/`: curated screenshots used by the root README.

The always-read order above is unchanged. Plans and v1 references are task-specific reads,
not current API/environment instructions. Source paths in historical plans are repo-root
relative unless linked explicitly; the v1 checkout stays read-only. One-off task reports
belong in chat; lasting facts belong in the topic docs, not new report files.

## Current stage numbering
Stage 5 is the UI port: 5A art/catalog/stage, 5B choices/settings, 5C real game screens.
Then Stage 6 AI lawyer/consultations, Stage 7 summaries/judge/jury, Stage 8 after-game Postgres
archives, Stage 9 TTS, Stage 10 deployment, then scale and measure. Rule IDs and historical v1 code/test names stay
unchanged. status.md tracks completion and the next task.
Stage 11B prepared production files; 11C added deployment notes; 11D aligns status wording.
Quarrel was deployed once on AWS for practice, then the server was discontinued. No live
instance is maintained; deploy.md and deploy/README.md are retained for reuse.
