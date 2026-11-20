# Decisions

The main choices behind Quarrel v2 and why. Newer decisions for a specific stage or sub-stage live
next to that work (for example `inventory.md` §9 for the v1 port).

## Repository

- **Fresh repo.** v2 lives in its own public repository with no shared git history.
  `../quarrel-v1` (the original) is a read-only reference. The README and LICENSE credit the
  original team.
- **Fresh folders, not moves.** `db/` is a fresh database directory and `ui/` a fresh Vite app; only
  the files v2 needs are copied in. v1's SQL migrations are not carried over: their game rules
  move to Redis, Lua and TypeScript.
- **Commits.** Claude Code never commits. The owner commits at the end of each sub-stage or stage.

## Frontend

- **Vite + React, not Next.js.** v2 needs no server rendering or API routes, and several services
  sit behind nginx anyway.
- **Incremental UI port.** Stage 5 rebuilds the UI: 5A art/catalog/stage, 5B choices/settings,
  5C real lobby/setup/planning/debate screens. Then Stage 6 lawyer/consultations, Stage 7
  summaries/judge/jury, Stage 8 Postgres archives, Stage 9 TTS, Stage 10 deployment, then scale and measure.

## Contract

- v2 designs its own contract, stage by stage. Zod schemas in `shared/contract/` are the source
  of truth, and TypeScript types come from `z.infer`.
- The UI calls the backend only through `ui/src/lib/api.ts`.
- `docs/contract.md` describes v1's API and is a reference only. What v2 must preserve is the game
  behaviour in `docs/rules.md` (for example, deadlines fire on the server even when nobody is
  connected).
- v2 chooses its own errors, each with a `code` field, and drops legacy fields. The v1 UI is
  adapted to the v2 contract at the end.

## Server

- **Layers.** Routes (`server/api`) call services (the game rules), which use repositories
  (Redis, Postgres). Mappers turn internal state into each player's snapshot; that is where
  private data is filtered out.
- **The API never calls AI.** AI work runs in BullMQ workers.
- **Redis** holds live state, queues, deadlines, presence, pub/sub, rate limits and idempotency
  keys. **Postgres** is the permanent record.
- **Plain Postgres, no ORM.** pg with parameterized SQL and numbered migrations. Socket.IO
  supplies realtime; the API owns signed session cookies. No external auth/storage service.
- **Two Redis clients.** The API's fails fast (no offline queue), so requests never hang during
  an outage. BullMQ's waits through outages, so workers resume on their own.
- **Socket.IO push** arrives in stage 1 (lobby) with presence. HTTP polling stays as a fallback.

## Game scope

- **Not ported:** the `debate/*` and `judge` routes and the legacy shared judge (dead code in v1).
- **Demo mode:** v2's demo AI returns a labelled verdict so a full game can finish (v1's demo
  stops at the jury).

## Running and testing

- **Docker.** `server/Dockerfile` has `api` and `worker` targets that run TypeScript through tsx
  (bundling later if needed). `ui/Dockerfile` builds the UI into an nginx image that also routes
  `/api` and `/socket.io` to the API. Postgres runs inside compose alongside Redis.
- **CI.** Shared and server tests with a Redis service, the UI build, and Docker image builds. UI
  tests join with the UI port.


## 2026-11-19: Stage 7 summaries and jury
- Keep Redis-time deadlines for summary work (30s from observation, no extension on claim)
  and four-second display. AI attempts are bounded at 5s each, one immediate retry; timeout,
  unsafe and invalid output use balanced literal unverified excerpts. Quotes use at most
  230 code points/22 words each, below 430, to fit both labels within 700 characters/70 words.
- Jury has no work deadline. BullMQ owns three attempts and fixed 5s/15s backoff, ignoring
  provider retryAfter. Persist attempts in the room so lost-job recovery cannot reset the budget.
  Random per-claim tokens reject older results; manual retry creates a new round with a
  Redis-time 60s cooldown between manual retries. Missing config/quota are unrecoverable.
- Override v1 rule 6.23: demo saves an explicitly nonjudgmental inconclusive/split verdict,
  source demo, "Demo verdict, not a real judgment", findings copied from saved summaries.
  This lets free demo games complete. Override v1 open question 2: unsafe disputes never call
  AI and save a fixed inconclusive/split/source safety verdict. Neither is an AI-failure fallback.
- Model jury findings must pass the ported strict shape, both-sides and own-real-citation checks.
  The server attaches canonical topic, positions and summaries. Privacy boundaries are unchanged.
- Recover missing jobs only on explicit reads/connect and actual transitions, never heartbeat
  or ordinary broadcast reads. Pending-only jury recovery cannot restart a failed round.


## 2026-11-19: Stage 8 plain Postgres and after-game records
- Replace Supabase Postgres/Storage and its CLI with plain Postgres 17 + pg. There is
  no current Storage requirement. One pool per process, parameterized queries, numbered
  transaction-per-file migrations and an advisory lock keep setup small and concurrent-safe.
- Completed public data is frozen atomically in a persistent Redis archive outbox. Without
  this, a fast rematch or room TTL could erase input before SQL succeeds. Workers retry with
  bounded backoff, atomically insert the public debate and both participants, then delete the
  outbox. Once committed, results/ack never depend on live rooms. Internal routing IDs stay
  in participant rows/outboxes only; private drafts and consultations are never archived.
- BullMQ rejects archive:<debateId> (two colon segments), so archive-<debateId> is the stable
  equivalent. Archive attempts are effectively continuous, with exponential 1s/2s/.../30s
  capped backoff; no provider calls. Plan/summary/jury IDs and expected-ID fences now include
  the debate to prevent completed old jobs deduplicating or writing a rematch's work.
- Rematch overrides v1 7.8: keep theme/topic/duration and cosmetics; new debateId, positions
  phase, fresh readiness/plan/clocks/public/private histories/jury/verdict. No revision number.
  An immutable pending outbox permits immediate rematch without waiting for the archive.
- Ack means reviewed, not agreement, and stores each player's first Postgres timestamp.
- After Stage 9 TTS comes Stage 10 deployment: one EC2 instance running compose, Caddy HTTPS,
  a domain, nginx UI (not Vercel), DATABASE_URL to the Postgres container; then scale and measure.


## 2026-11-19: Stage 9 voice
- Replace v1 HMAC receipts with a session/member-checked ID-only Redis lookup. The route does
  NOT use room-current/catch-up: pressing Play cannot advance an overdue clock. Stable IDs
  include debateId; only complete public arguments/announcements/summaries/verdict text speak.
- Explicit exception: read-only TTS generation runs in the API; text AI remains in workers.
  A separate GEMINI_TTS_API_KEY is mandatory for real TTS; demo always permits browser fallback.
- Preserve v1 origin-role voices: Puck for the four original A lawyers, Charon for B, Kore for
  all judges. Store those alongside each catalog personality; player characters stay silent.
  Keep v1 pitch/rates (1.08/.9 lawyer pitch, .95 judge; rate by origin theme) across themes.
  The 30 featured prebuilt names come from Google's official speech-generation documentation.
- Reuse validated PCM/RIFF/WAV handling, update to current Gemini3.8 Interactions REST with
  exact transcript and structured style. Serve audio/wav; bounded response/audio and20s default
  timeout, plus a service bound even when an injected generator ignores abort.
- Shared state belongs in Redis (v1 open question8): TTL15m cache, default2MiB raw audio cap,
  8/player/60s, <=4 global leased tokens, timeout+3s locks. A sorted-set leased counter avoids
  plain-counter expiry/release races; stale owners cannot release/cache over newer owners.
  Poll cache every200ms while the lock exists, up to TTS_TIMEOUT_MS+1000ms; return cached
  audio immediately, or permit fallback when the lock disappears without audio/the budget
  expires. Recheck cache after observing unlock to handle an atomic release racing the read.
  Wait and clock are injected in tests. No manual cache eviction or process maps.
- Browser fallback requires explicit permission, user preference and an unblocked item. No
  private speech, and provider details never enter response/log. Autoplay off; restore history
  skipped, new IDs FIFO only after interaction; manual play/stop cancels pending queue.
- Lazy gallery/results plus a stable React vendor chunk remove the old main-chunk warning;
  the extra vendor split was needed because new voice code offset page-only lazy-load savings.
  This reduces individual chunk size, not the sum of all initial JavaScript; thresholds unchanged.
