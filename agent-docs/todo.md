# To-do and backlog

Add follow-ups here when found; remove them when done. Group by when they're due.

## Before or during Slice 1
- [ ] Coverage: add `server.deps.inline` for `@quarrel/shared` so `shared/` is measured, then
      switch on thresholds (90% statements/lines/functions, 85% branches) for server (1E).
- [ ] Confirm CI goes green on GitHub (action versions `@v7` unverified).
- [ ] Check the UI health line once in a real browser.
- [ ] Review the npm audit advisories reported by `npm ci` during 1D (7 high severity at
      install time); dependency fixes need their own scoped change, not automatic audit fix.

## Later slices
- [ ] API health: split liveness (process up) from readiness (Redis + Supabase) so compose can
      start without Supabase.
- [ ] Wire the AI code into the worker; move its `process.env` reads into `config.ts` (first AI job).
- [ ] Demo AI returns a labelled verdict so a full demo game can finish (judge/jury slice).
- [ ] Pub/sub slice: Socket.IO Redis adapter, second API server behind nginx, sticky sessions.
- [ ] With the multi-server slice, add a presence sweeper: push when a crashed server's
      players go stale after their presence TTL expires.
- [ ] Slice 8 (TTS): move speech-provider cache and rate limits to Redis; port
      `speech-receipts.ts`; rename `JUDGE_SERVER_SECRET` to `SPEECH_RECEIPT_SECRET`.

## UI port (last slice)
- [ ] Port v1 UI per `docs/inventory.md` §9; adapt it to the v2 contract.
- [ ] Remove v1 leftovers in `shared/types` (legacy debate and judge types).
- [ ] Move `chooseBrowserVoice` into the UI.
- [ ] Add the ui Vitest project.
