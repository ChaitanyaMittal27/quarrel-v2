# To-do and backlog

Add follow-ups here when found; remove them when done. Group by when they're due.

## Remaining setup follow-ups
- [ ] Confirm CI goes green on GitHub (action versions `@v7` unverified).
- [ ] Review the generated desktop/320px screenshots in e2e/screenshots/ and listen once to
      real audible playback in a normal browser. Playwright fakes speech, not OS audio policy
      or voice quality. Full-game interactions/outages/privacy are now automated (environment.md).
- [ ] Decide whether My results should keep its neutral white canvas or use a theme canvas;
      compare 14-results-phone.png with the game screens before changing that styling.

## Next: owner commit/push and CI
- [ ] Owner reviews the changes/screenshots, commits and pushes; confirm CI passes before
      Stage 10 deployment. Agents must never stage, commit or push.

## Later stages
- [ ] Stage 10 deployment: one EC2 instance, compose, Caddy HTTPS, domain, nginx UI (not Vercel),
      DATABASE_URL pointing at the Postgres container; then scale and measure.
- [ ] API health: split liveness (process up) from readiness (Redis + Postgres).
- [ ] Pub/sub stage: Socket.IO Redis adapter, second API server behind nginx, sticky sessions.
- [ ] With the multi-server stage, add a presence sweeper: push when a crashed server's
      players go stale after their presence TTL expires.

## Stage 5 UI port (incremental, now)
- [ ] Draw more pixel-art player characters and lawyers.
- [ ] Visually check #/gallery at desktop/320px widths and OS reduced motion; native pipe
      unavailable during Stage 5A. Node SSR/registry tests and dev HTTP checks passed.
- [ ] Remove v1 leftovers in `shared/types` (legacy debate and judge types).
