# To-do and backlog

Add follow-ups here when found; remove them when done. Group by when they're due.

## Remaining setup follow-ups
- [ ] Confirm CI goes green on GitHub (action versions `@v7` unverified).
- [ ] Manually check the real game at desktop/320px widths, automatic reconnect and terminal-session Home recovery and
      OS reduced motion; include empty/overlong forms, field focus and clear-on-edit, bad-code
      feedback, Start reasons, and a 10-second API outage. Stage 5C native pipe was unavailable; SSR/action,
      real-server integration tests and the production build passed.

## Later stages
- [ ] API health: split liveness (process up) from readiness (Redis + Supabase) so compose can
      start without Supabase.
- [ ] Demo AI returns a labelled verdict so a full demo game can finish (judge/jury stage).
- [ ] Pub/sub stage: Socket.IO Redis adapter, second API server behind nginx, sticky sessions.
- [ ] With the multi-server stage, add a presence sweeper: push when a crashed server's
      players go stale after their presence TTL expires.
- [ ] Stage 9 (TTS): move speech-provider cache and rate limits to Redis; port
      `speech-receipts.ts`; rename `JUDGE_SERVER_SECRET` to `SPEECH_RECEIPT_SECRET`.

## Stage 5 UI port (incremental, now)
- [ ] Draw more pixel-art player characters and lawyers.
- [ ] Visually check #/gallery at desktop/320px widths and OS reduced motion; native pipe
      unavailable during Stage 5A. Node SSR/registry tests and dev HTTP checks passed.
- [ ] Port v1 UI per `docs/inventory.md` §9; adapt it to the v2 contract.
- [ ] Remove v1 leftovers in `shared/types` (legacy debate and judge types).
- [ ] Stage 9: move `chooseBrowserVoice` into the UI with speech playback/settings.
