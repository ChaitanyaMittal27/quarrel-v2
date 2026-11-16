# Agent docs: start here

Instructions for coding agents working on **Quarrel v2**. Written for agents, kept short.
The root `AGENTS.md` and `CLAUDE.md` only point here; every rule lives in this folder.

**Quarrel** is a real-time two-player AI debate game (Fall Hacks 2026; Ryan Fu, Alex Lee,
Kyunghwan Ko, Chaitanya Mittal; MIT). **v2** is Chaitanya's solo rebuild of the backend:
Fastify API + BullMQ workers + Redis for live state, Supabase for Postgres/Storage only.

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
- `docs/rules.md`: v1's game rules, the behaviour v2 must keep (checklist per slice).
- `docs/inventory.md`: every v1 file and where it went in v2.
- `docs/contract.md`: v1's API. Reference only, **not** a spec for v2.
- `docs/baseline.md`: v1's test baseline.
