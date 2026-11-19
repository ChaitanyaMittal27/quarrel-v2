# Coding standards

Nearby existing code is the style reference for details. These are the rules that matter.

## Contract first
- Every request and response has a Zod schema in `shared/contract/`, written **before** the
  endpoint. Types come from `z.infer`, with the same name as the schema.
- Response schemas are strict objects (unknown keys rejected); request schemas are lenient.
- v2 designs its own contract stage by stage. `docs/contract.md` (v1) is for ideas only.
- What must be preserved is game behaviour: `docs/rules.md`. Port each rule once, into the v2
  design, and cite the rule number in a comment or test name.
- Explicit v2 redesigns override the v1 reference: setup follows S2.1-S2.8 in
  `docs/rules-coverage.md`, not the old confirmation/revision flow in v1's Stage 2.

## Server layers
- **Routes** (`server/api/*`): parse input with `parseRequest(schema, input)`, call the service,
  send with `sendParsed(reply, Schema, body)`. No business logic. The one exception is
  session plumbing: refresh/logout orchestration stays in `server/api/session.ts`.
- **Services** (`server/<domain>/*-service.ts`): rules and orchestration; throw
  `new AppError("CODE")` for expected failures.
- **Repositories** (`*-repo.ts` / `*-store.ts`): the only code that knows Redis keys or SQL.
- **Mappers**: build each player's snapshot from internal state. Never send raw state; never
  include player IDs or anything another player shouldn't see.
- The API never calls AI. AI work runs in BullMQ workers.

## Redis
- Any read-check-write on shared state is **one Lua script** (atomic). No multi-step
  read-then-write from Node. New scripts live in `server/<domain>/lua/*.lua`.
- Pass every key a script touches in `KEYS`; use Redis's clock (`TIME`) inside scripts, not Node's.
- Key names are `kind:id` (`room:<id>`, `player:<id>`); list new keys in [backend.md](backend.md).
- Store hashes, never raw tokens. Give keys that should disappear a TTL.

## Errors
- Use the error codes in `shared/contract/common.ts` (`ERROR_STATUS` maps each to one status).
  Add a code there (with a test and a `docs/api.md` line) rather than reusing a wrong one.
- Unexpected errors become 500 `INTERNAL` with nothing leaked; Redis outages become 503.

## shared/
- Must not import from `server/` or `ui/`, and must not use Node-only or browser-only APIs.

## Tests
- Vitest. Tests in `shared/tests/` and `server/tests/` (helpers in `server/tests/helpers.ts`).
- HTTP through Fastify `inject`; real Redis on **6380** (never 6379).
- Every rule gets a test; every race (two joiners, two refreshes, …) gets a concurrency test.
- Never sleep for real time: use short TTLs/grace values in tests or a fake clock.
- Live Gemini tests are opt-in (`RUN_LIVE_LAWYER_TESTS`, `RUN_LIVE_STAGE6_TESTS`) and cost money.
- A feature or fix includes its tests in the same change.

## General
- Comments explain *why*, not what. Keep functions small and named for what they do.
- No new dependencies without asking.
- Always read and write text as UTF-8 without a BOM. On Windows/PowerShell, never use
  Set-Content, Out-File or output redirection (>) without an explicit UTF-8 encoding;
  prefer editor/apply-patch tooling. Windows PowerShell UTF8 output can add a BOM, so use
  an explicit UTF8Encoding(false) writer when scripting instead. Script reads must also
  specify UTF-8; the Windows default encoding can corrupt existing text on a round trip.
- Use plain ASCII apostrophes and quotation marks in UI text and source strings unless
  a specific test or quotation needs other characters. The UI encoding regression test
  checks tracked/new text for corrupt byte-decoding patterns, invalid UTF-8 and BOMs.
