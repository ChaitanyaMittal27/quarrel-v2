# To-do and backlog

Add follow-ups here when found; remove them when done. Group by when they're due.

## Remaining setup follow-ups
- [ ] Confirm CI goes green on GitHub (action versions `@v7` unverified).
- [ ] Review the generated desktop/320px screenshots in e2e/screenshots/ and listen once to
      real audible playback in a normal browser. Playwright fakes speech, not OS audio policy
      or voice quality. Full-game interactions/outages/privacy are now automated (environment.md).

## Next: owner commit/push and CI
- [ ] Owner reviews the changes/screenshots, commits and pushes; confirm CI passes before
      Stage 10 deployment. Agents must never stage, commit or push.

## Later stages
- [ ] Stage 10: AWS EC2 deployment with Compose and HTTPS via Caddy on a free DuckDNS hostname (next).
      nginx serves the UI (not Vercel); DATABASE_URL points at the Postgres container.
      Then scale and measure.
- [ ] API health: split liveness (process up) from readiness (Redis + Postgres).
- [ ] Pub/sub stage: Socket.IO Redis adapter, second API server behind nginx, sticky sessions.
- [ ] With the multi-server stage, add a presence sweeper: push when a crashed server's
      players go stale after their presence TTL expires.
- [ ] Add k6 load tests and measure performance before scaling further.
- [ ] Add a UI coverage threshold; UI coverage is currently reporting-only.
- [ ] Evaluate and tune real-AI response quality beyond the demo/fake-tested flows.

## Stage 5 UI port (incremental, now)
- [ ] Draw more pixel-art player characters and lawyers.
- [ ] Visually check #/gallery at desktop/320px widths and OS reduced motion; native pipe
      unavailable during Stage 5A. Node SSR/registry tests and dev HTTP checks passed.
- [ ] Remove v1 leftovers in `shared/types` (legacy debate and judge types).
