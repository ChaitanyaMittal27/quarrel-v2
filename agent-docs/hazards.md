# Hazards and known gotchas

- **WSL Redis on 6379.** Something in WSL listens on localhost:6379. Never use 6379 locally;
  dev Redis is 6380. If a Redis test behaves strangely, check which port it hit.
- **Compose includes Postgres.** API migrations run before health/listen; worker waits for
  healthy API. Database/Redis failure makes readiness 503; no external provider is required.
- **Docker Desktop may be off.** Redis-backed tests then fail with connection errors; that's
  the environment, not the code. Say so in the report.
- **`docs/contract.md` is v1, not a spec.** v2's contract is `shared/contract/`.
- **Cookie lifetime vs token lifetime.** The access cookie lives 30 days on purpose; if it
  expired with the 15-minute JWT, the server couldn't tell "expired" from "no session".
- **Refresh cookie Path is `/api/session`**, so refresh and logout both receive it.
- **Keep shared coverage enabled.** Vitest projects inline @quarrel/shared; server and shared
  have separate enforced thresholds. Do not drop inline configuration or exclude real source.
- **Line endings:** `.gitattributes` enforces LF; v1 files used CRLF, so copied text may need
  converting before string matching.
- **Snapshot privacy checks:** random base64url room IDs can contain the substring `p_`.
  Check raw JSON for complete internal player IDs and player-ID-shaped values, not every
  occurrence of that substring (rule 1.17).
- **Live AI tests cost money.** Never enable them unless the prompt says so.
- **Deadline clock drift.** Redis (Docker VM) and Node (Windows) can disagree about time.
  Do not use BullMQ delayed clock jobs: an early job can complete before Redis's deadline,
  and adding the same job ID then gets ignored, losing the automatic push. Deadline changes
  atomically update the Redis deadlines sorted set. Worker polling uses due.lua/Redis TIME;
  Node timers only control polling cadence. Multiple pollers are safe through atomic catch-up.
