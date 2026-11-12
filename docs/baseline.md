> Describes Quarrel v1 (original repo, ../quarrel-v1); used as the reference and spec for v2.

# v1 baseline

Recorded on **2026-11-11**, on branch `v2/stage-0` (v1 code unchanged from `main` at `5c1c540`).
This record shows what v1 does on a local Windows machine before any v2 work, so that later
stages can be compared against it. Failures are recorded as found and have **not** been fixed.

## Environment

| Item | Version |
|---|---|
| OS | Windows 11 Home 10.0.26200 |
| Node | v24.18.0 (`engines` requires >= 22.12.0) |
| npm | 11.16.0 |
| Docker | Docker Desktop, engine 29.6.2 |
| Supabase CLI | 3.0.0 (from `devDependencies`; 3.1.0 available) |
| AI mode | `JUDGE_AI_MODE=demo` set in the shell for every command (overrides `.env.local`) |

`.env.local` points at the **local** Supabase stack (`http://127.0.0.1:54321`). No Cloud project
was contacted. Demo mode was confirmed by the suites themselves: the judge suite reported
response sources `demo, demo, demo, demo`, and the lawyer suite reported
`{"ai":0,"demo":7,"fallback":0}`. No Gemini text or speech requests were made.

## How to rerun the baseline

Prerequisites: Docker running, `npm ci` done, and a `.env.local` with the local Supabase values
and a registered judge capability (`npm run supabase:env`, then `npm run judge:setup` and apply
its SQL; see the CI workflow). Then run:

```
npm run supabase:start     # local Postgres/Auth/Realtime in Docker (first run downloads images)
npm run typecheck
npm run check              # unit tests with coverage, then the production build
npm run test:db            # pgTAP database tests
npm run test:integration   # builds, starts the app on 127.0.0.1:3001 in demo mode, runs all 7 suites, stops the app
npm run supabase:stop
```

`npm run test:integration` always forces `JUDGE_AI_MODE=demo` and stops the app even if a suite
fails. It refuses to start if something is already listening on port 3001. If you have just
run `check`, add `-- --no-build` to skip the second build.

### Windows: lower-case drive letter

VS Code on Windows often opens its terminal in `c:\projects\quarrel-v2` (lower-case `c:`).
From there, every Vitest file fails with `Vitest failed to find the runner` and no tests run.
Node treats `c:\…` and `C:\…` as different paths, so it loads two copies of `vitest`.
To avoid it, switch to the upper-case path before running tests:

```
cd C:\projects\quarrel-v2
```

Opening the folder in VS Code as `C:\projects\quarrel-v2` (for example `code C:\projects\quarrel-v2`
from a terminal) also works.

## Rerun after tooling fixes (2026-11-11)

Same machine and versions as below. Run from `C:\projects\quarrel-v2` (upper-case drive) with
the commands in "How to rerun the baseline". `JUDGE_AI_MODE=demo` throughout.

| Command | First run | Rerun |
|---|---|---|
| `npm run supabase:start` | ✅ ~643 s (first image download) | ✅ 24 s |
| `npm run supabase:env` | ❌ `spawnSync … ENOENT` | ✅ writes the same 2 lines (checked against the existing file, then restored) |
| `npm run typecheck` | ✅ 2 s | ✅ 1 s |
| `npm run check` | ❌ 722 passed, 3 failed, 7 skipped; build skipped | ✅ **725 passed, 0 failed, 7 skipped**; build passed; 127 s |
| Coverage (lines / statements / functions / branches) | 98.62 / 96.73 / 95.98 / 93.58% (diagnostic run) | 98.62 / 96.73 / 95.98 / 93.58% (from `check`) |
| `npm run test:db` | ✅ 264 tests, 30 s | ✅ 264 tests, 3 s |
| Integration suites | ✅ 7 of 7, 58 checks (run by hand) | ✅ 7 of 7, 58 checks via `npm run test:integration`; 404 s including build |
| Per suite (checks, seconds) | api 6/4, supabase 15/50, debate 8/57, judge 7/17, leave 7/4, lawyer 10/264, stage6a 5/2 | api 6/2, supabase 15/50, debate 8/56, judge 7/15, leave 7/3, lawyer 10/263, stage6a 5/2 |
| AI sources reported | judge `demo` ×4; lawyer `{"ai":0,"demo":7,"fallback":0}` | same |

The 3 previously failing judge-config tests now pass on Windows, with their POSIX-only
assertions skipped. The rest of each test still runs.

`test:integration`'s failure path was also checked: with Supabase deliberately unreachable,
all 7 suites failed, the command exited 1, and port 3001 was free afterwards.

## Results (first run, before fixes)

The commands follow the order of `.github/workflows/quarrel-stage-1-checks.yml`.
Durations are wall-clock times on this machine.

| # | Command | Result | Counts | Duration |
|---|---|---|---|---|
| 1 | `npm ci` | ✅ pass | 171 packages added, 0 vulnerabilities | 37 s |
| 2 | `npm run supabase:start` | ✅ pass | 8 migrations applied | ~643 s (first run, includes image downloads) |
| 3 | `npm run supabase:env` | ❌ **failed on Windows** | n/a | 1 s |
| 4 | `npm run judge:setup -- --sql-out <temp>` + `npx supabase db query --file <temp>` | ✅ pass | capability hash registered; temp SQL deleted | 4 s |
| 5 | `npm run typecheck` | ✅ pass | no errors | 2 s |
| 6a | `npm run check`, run from the VS Code terminal (`c:\` lower-case drive) | ❌ fail | 31 of 31 test files failed to load, 0 tests ran; build skipped | 105 s |
| 6b | `npm run check`, run from `C:\` (upper-case drive) | ❌ fail | 722 passed, 3 failed, 7 skipped (732 tests, 31 files: 27 passed, 1 failed, 3 skipped); build skipped | 219 s |
| 6c | `npm run build` (run alone, because `check` stops before it) | ✅ pass | compiled; 7 static pages | 38 s |
| 6d | `npx vitest run --coverage --coverage.reportOnFailure` (diagnostic, to get coverage) | ❌ fail (same 3 tests) | see coverage below | 200 s |
| 7 | `npm run test:db` | ✅ pass | 7 files, 264 pgTAP tests | 30 s (includes `pg_prove` image download) |
| 8 | Start app: `node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3001` | ✅ ready | `GET /api/rooms/session` returned 200 | < 5 s |
| 9 | `npm run test:api` | ✅ pass | 6 checks | 4 s |
| 10 | `npm run test:supabase` | ✅ pass | 15 checks | 50 s |
| 11 | `npm run test:debate` | ✅ pass | 8 checks (includes a real 45 s deadline) | 57 s |
| 12 | `QUARREL_TEST_URL=http://127.0.0.1:3001 npm run test:judge` | ✅ pass | 7 checks | 17 s |
| 13 | `QUARREL_TEST_URL=http://127.0.0.1:3001 npm run test:leave` | ✅ pass | 7 checks | 4 s |
| 14 | `QUARREL_TEST_URL=http://127.0.0.1:3001 npm run test:lawyer` | ✅ pass | 10 checks | 264 s |
| 15 | `QUARREL_TEST_URL=http://127.0.0.1:3001 npm run test:stage6a` | ✅ pass | 5 checks | 2 s |
| 16 | `npm run supabase:stop` | ✅ pass | n/a | 5 s |

The 7 skipped unit tests are the opt-in live Gemini suites (`judge-live`, `lawyer-live`,
`stage-six-live`). They only run when `RUN_LIVE_*_TESTS=true` is set. The app log had no errors
during the integration run.

### Unit test coverage

From run 6d (`src/components`, `src/lib`, `src/server`, `src/themes`). Thresholds come from
`vitest.config.mts`.

| Metric | Covered | % | Threshold |
|---|---|---|---|
| Lines | 1652 / 1675 | **98.62%** | 90% |
| Statements | 2251 / 2327 | **96.73%** | 90% |
| Functions | 598 / 623 | **95.98%** | 90% |
| Branches | 2847 / 3042 | **93.58%** | 85% |

All four metrics are above their thresholds. In the normal `npm run check`, Vitest writes no
coverage report when any test fails, which is why the diagnostic run 6d was needed.

## Failure details

### 3. `npm run supabase:env`: failed on Windows

```
Error: spawnSync node_modules/.bin/supabase ENOENT
    at file:///C:/projects/quarrel-v2/scripts/local-env.mjs:7:29
  code: 'ENOENT', syscall: 'spawnSync node_modules/.bin/supabase'
```

- **Cause:** `scripts/local-env.mjs` calls `execFileSync('node_modules/.bin/supabase', …)` with
  no shell. On Linux that path is an executable script. On Windows npm installs `supabase.cmd`
  (a `.cmd` shim), and Node can only start a `.cmd` file through a shell, so the call fails with
  "file not found".
- **Workaround used:** `.env.local` was written by hand with the same two values the script
  writes (`SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`, read from
  `npx supabase status -o json`). No code was changed.

### 6a. `npm run check` from a lower-case drive path: 0 tests ran

```
Error: Vitest failed to find the runner. One of the following is possible:
- "vitest" is imported directly without running "vitest" command
...
 ❯ tests/setup.ts:29:1
     29| beforeEach(() => {
 Test Files  31 failed (31)
      Tests  no tests
```

- **Cause:** environment, not v1 code. The VS Code terminal starts in `c:\projects\quarrel-v2`
  (lower-case `c:`), while Vitest resolves its own files under `C:/`. Node treats the two
  spellings as different modules, so `tests/setup.ts` gets a second copy of `vitest` that is not
  connected to the running test runner.
- **Evidence:** the same command run from `C:\projects\quarrel-v2` loads and runs all 31 files
  (run 6b).

### 6b. `npm run check` from `C:\`: 3 failures in `tests/judge-config.test.ts`

```
FAIL tests/judge-config.test.ts > server capability setup > preserves configuration, generates 256 random bits, emits only its hash, and safely reuses it
AssertionError: expected 438 to be 384 // Object.is equality

FAIL tests/judge-config.test.ts > server capability setup > works without an existing env file and writes private hash SQL for CI
AssertionError: expected 438 to be 384 // Object.is equality

FAIL tests/judge-config.test.ts > server capability setup > rejects unsafe output arguments and refuses overwriting SQL or following env symlinks
Error: EPERM: operation not permitted, symlink '…\Temp\quarrel-judge-config-…\.env.local' -> '…\Temp\quarrel-judge-config-…\.env.local'
```

- **Cause:** Windows file system behaviour, not a logic bug. `438` is `0o666` and `384` is
  `0o600`: Windows ignores Unix permission bits, so `chmod 0600` cannot make the file
  owner-only. Creating a symlink on Windows needs administrator rights or Developer Mode.
- **Effect:** `check` runs `test:coverage && build`, so the build step never runs locally on
  Windows. The build passes when run on its own (6c).

## Known issues to fix in Stage 0 refactor

1. ✅ **Fixed: `npm run supabase:env` failed on Windows** (`spawnSync node_modules/.bin/supabase ENOENT`).
   `scripts/local-env.mjs` now runs the CLI's JS entry (`node_modules/supabase/dist/supabase.js`)
   with `process.execPath`, which needs no shell on any OS. Verified on Windows: it writes the
   same two lines (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`) as before.
2. ✅ **Fixed: `tests/judge-config.test.ts` had 3 tests that could not pass on Windows.** Only
   the two `0600` permission assertions and the symlink case are now skipped on `win32`; the
   rest of those tests still runs on Windows, and everything still runs on Linux/CI.
   Still open (security note): on Windows, `judge:setup`'s `chmod 0600` on `.env.local` is a
   no-op, so the file is not owner-only.
3. ⚠️ **Open (documented, not fixed): Vitest fails completely when the terminal's drive letter is
   lower-case** (`c:\`). See "Windows: lower-case drive letter" below for how to avoid it.
4. **Open: `npm run check` hides the build result** when any test fails (`&&` chaining). It's
   worth knowing when comparing local and CI runs.
5. ✅ **Mitigated: integration suites default to different app ports** (`test:api` 3001,
   `test:lawyer` 3000, `test:stage6a` 3003). `npm run test:integration` now sets
   `QUARREL_TEST_URL=http://127.0.0.1:3001` for every suite. The per-suite defaults are unchanged.

Not issues, but worth knowing:
- The first `supabase:start` takes about 11 minutes because it downloads images. Later starts are fast.
- Integration suites leave synthetic rooms in the local database (they expire for access after
  24 hours but are not deleted). This only affects the local stack.
- `test:lawyer` takes about 4.5 minutes of the integration run because it waits for real clock
  deadlines.
