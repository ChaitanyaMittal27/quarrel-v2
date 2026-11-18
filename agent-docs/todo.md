# To-do and backlog

Add follow-ups here when found; remove them when done. Group by when they're due.

## Remaining setup follow-ups
- [ ] Confirm CI goes green on GitHub (action versions `@v7` unverified).
- [ ] Visually check the temporary lobby and health footer on desktop/mobile; 1E browser
      automation was unavailable (native pipe missing). Curl, UI helpers and real-server flows passed.

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
