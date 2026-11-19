# Slice 1 rules coverage

Slice 1's setup-free ready behavior below is historical: Slice 2 now requires a saved position
and the positions phase. The current v2 setup rules and their proof follow in the next section.

## Slice 2 (v2 flow)

The Slice 2 prompt defines v2 behavior. v1 rules 2.1-2.14 in rules.md are reference only;
there is no confirmation/accept step, revision number, editable setup or debate Start yet.
All API tests below are in [server/tests/setup.test.ts](../server/tests/setup.test.ts),
contract tests in [shared/tests/setup.test.ts](../shared/tests/setup.test.ts), except where noted.

| Rule | Proving tests (all prefixed `rule S2.x:`) | Difference from v1 2.1-2.14 |
| --- | --- | --- |
| S2.1 Fixed setup at create | `creation stores trimmed topic and defaults; setup remains fixed on retries and other writes`; theme/duration matrix; bad-topic and bad-theme/duration cases; `topic length uses code points, allowing one or 240 emoji`; shared request/default/control tests | Replaces 2.1-2.5: one game flow; courtroom default retained, but theme/topic/duration chosen at create and never edited. No revision increments, setup resets or plan invalidation. |
| S2.2 Join enters positions | `join takes B and moves waiting to positions exactly once` | Explicit waiting -> positions transition replaces v1's undifferentiated setup. Repeat joins retain the current phase, including planning. |
| S2.3 Own position, positions phase | `position is own-seat only, trimmed and multiline, with tab/newline allowed`; bad-position cases; code-point boundary/request-shape test; auth/membership/stale/expiry test; waiting and planning rejection tests | Retains own-seat and size limits from 2.6; replaces topic-first setup checks with phase enforcement. Only tab/LF controls allowed; CR and other Cc rejected. |
| S2.4 Public positions | `both players see the same public positions with their own viewer slot`; [sockets.test.ts](../server/tests/sockets.test.ts): `opponent's position is pushed to both players with their own viewer slot`; shared strict setup test | Replaces 2.9: visibility is immediate on save, with no confirmation requirement. |
| S2.5 Reset author's ready | `saving clears only the author's ready, including an identical saved position`; `a changed save increments version/emits once, but an unchanged unready save does neither` | Replaces 2.7-2.8: only the author is unreadied; no confirmation, revision, or plan discard. An identical save still clears a true ready flag. |
| S2.6 Ready preconditions | `ready:true/false and positions are rejected while waiting` (two cases); `ready:true requires own position; ready:false is allowed in positions` | Replaces 2.10: own position required for true; both true and false require positions phase. Waiting no longer permits lobby ready. |
| S2.7 Atomic planning lock | `simultaneous ready requests cause exactly one planning transition, independent of presence` | Replaces the setup boundary in 2.11-2.13. Both non-left ready flags lock positions before planning; presence still affects bothReady but not the phase trigger. The test monitors Redis's actual phase write and uses a command/event barrier, no sleeps. Frozen ready/position calls fail without a version/event change. Host-only Start and countdown belong to Slice 3. |
| S2.8 Leave any phase | `leaving during waiting/positions/planning closes the room and preserves setup` (three cases) | Preserves Slice 1 leave behavior at each new phase. Redis Lua preserves 2.14's atomic mutation guarantee. |

[integration/lobby.test.ts](../server/tests/integration/lobby.test.ts) now creates with a topic,
saves both positions, readies both and asserts planning plus both public positions. Its existing
disconnect/reconnect/leave, expiry recovery and two-tab assertions still run on the new flow.

The snapshot stays strict. Its setup contains only phase/theme/topic/durationSec/positions;
the existing version orders pushes, and presence changes still allow equal-version updates.

## Slice 1 proofs

These are executable proofs of rules 1.1-1.17 from [rules.md](rules.md), against the v2
[contract](../shared/contract/). Parameterized test names below list their concrete cases.
All server room/socket/integration tests use Redis on 6380. The integration suite uses real
fetch requests, a random-port Fastify + Socket.IO server, and separate cookie jars per player.

| Rule | Test files and proving test names | v2 differences / notes |
| --- | --- | --- |
| 1.1 Identity | [rooms.test.ts](../server/tests/rooms.test.ts): `rule 1.1: create and join establish sessions; leave/ready require one`; [sockets.test.ts](../server/tests/sockets.test.ts): handshake suite; [lobby.test.ts](../server/tests/integration/lobby.test.ts): `rule 1.1: socket survives token expiry; HTTP and reconnect recover only after refresh` | Own JWT/rotating-refresh cookies replace Supabase anonymous auth. Socket auth is connect-only. |
| 1.2 Code | [rooms.test.ts](../server/tests/rooms.test.ts): `rule 1.2: generated IDs and codes use the required formats and alphabet`, `rule 1.2: code collision retries without overwriting the existing room`, `rule 1.2: five code collisions fail cleanly, without a seat`; [shared rooms tests](../shared/tests/rooms.test.ts): `has an alphabet of 32 unique symbols, all of which are valid` | Six independent crypto.randomInt draws; five collision attempts, then 503. |
| 1.3 Expiry | [rooms.test.ts](../server/tests/rooms.test.ts): `rules 1.2-1.3: hashes and code pointers are retained until expiry plus 24h; player has no TTL`, `rule 1.3: Redis time, not Node time, determines creation and snapshot time`, `rule 1.3: configurable lifetime also rejects create's expired response snapshot`, `rule 1.3: expired room rejects read/join/leave/ready without mutation` (four cases) | Fixed 24h, Redis TIME; expired hashes and code pointers retained for another day for 410 responses. Tests inject -1ms lifetime, never wait 24h. |
| 1.4 One seat/create retry | [rooms.test.ts](../server/tests/rooms.test.ts): `rule 1.4: create retry returns the same seat, name, version and room`, `race rules 1.4, 1.6: parallel creates by one identity yield one room` | Same behavior; player pointer enforces membership. |
| 1.5 Expired seat release | [rooms.test.ts](../server/tests/rooms.test.ts): `rule 1.5: expired seat is released on create/join, historical room retained` (two cases) | Deletes the player pointer, retaining expired room fields unchanged; v1 also cleared historical auth/ready/presence fields. Expired rooms remain unreadable in either design. |
| 1.6 Serialization | [rooms.test.ts](../server/tests/rooms.test.ts): `race rules 1.4, 1.6: parallel creates by one identity yield one room`, `race rule 1.6: create and join by the same identity result in one seat`, `race rule 1.6: leave and create serialize without detaching a newer seat` | Redis Lua plus pointer re-check/retry replaces Postgres locks. |
| 1.7 Seats A/B, max two | [rooms.test.ts](../server/tests/rooms.test.ts): `rule 1.7: A creates, B joins, a third identity is refused`; [shared rooms tests](../shared/tests/rooms.test.ts): `rejects 0 or 3 players`, `rejects B before A, and B alone` | Same behavior, explicit ordered strict snapshots. |
| 1.8 Join precedence | [rooms.test.ts](../server/tests/rooms.test.ts), `join precedence (rule 1.8)` suite: `malformed code precedes name and room checks`, `nonexistent room precedes current membership`, `expiry precedes membership and closure`, `already my room precedes closed/full and keeps original name`, `target errors do not release an expired current seat`, `expired current seat is released before closure is checked`, `live current membership precedes closed/full`, `closed precedes full` (all prefixed `rule 1.8:`) | No v1 room-header guard on join. Presence is refreshed by sockets, not repeated join. |
| 1.9 Join race | [rooms.test.ts](../server/tests/rooms.test.ts): `race rules 1.7, 1.9: 20 parallel joins yield one success and 19 ROOM_FULL` | Stronger concurrency test than v1's two joiners. |
| 1.10 Names | [rooms.test.ts](../server/tests/rooms.test.ts): invalid-name cases through both APIs and `rule 1.10: trims names and counts Unicode code points on both APIs`; [shared rooms tests](../shared/tests/rooms.test.ts): `uses JavaScript Unicode trim rather than SQL's ASCII-space btrim`, `checks control characters before trimming (as v1 does)` | JS trim removes surrounding Unicode whitespace; SQL btrim defaults to ASCII space. The v1 HTTP route already used JS trim; this differs from direct SQL RPC behavior. Raw Cc controls are rejected before trimming. |
| 1.11 Presence | [sockets.test.ts](../server/tests/sockets.test.ts): `B connecting/disconnecting changes A's equal-version snapshot and clears the key`, `closing one of two tabs keeps presence; closing the last clears it`, `refreshes a 35s key every 10s while open, and stops refreshing after disconnect`; [lobby.test.ts](../server/tests/integration/lobby.test.ts): full lobby flow | Socket connection/10s refresh/35s TTL replaces heartbeat and last_seen. Final-tab disconnect is immediate. Crash-expiry push is deferred to the multi-server sweeper. Presence does not bump version; equal-version snapshots are accepted. |
| 1.12 bothReady | [rooms.test.ts](../server/tests/rooms.test.ts): `rules 1.12-1.13: bothReady requires both seats, readiness and presence`; [lobby.test.ts](../server/tests/integration/lobby.test.ts): `rules 1.1, 1.11-1.15: full lobby, disconnect, reconnect, leave and closed-room rejection` | Same conjunction; socket pushes replace polling. |
| 1.13 Own readiness | [rooms.test.ts](../server/tests/rooms.test.ts): `rule 1.13: readiness changes only your own seat; repeated value is a no-op`, invalid/missing readiness cases; [lobby.test.ts](../server/tests/integration/lobby.test.ts): `rules 1.13, 1.17: two tabs receive identical updates for the same player` | Readiness does not refresh presence; unchanged ready value is a version/event no-op. |
| 1.14 Leave | [rooms.test.ts](../server/tests/rooms.test.ts): `rules 1.14-1.15: A/B leaves, name stays, remaining player reads closed room` (two cases), `rules 1.14, 1.16: stale/delayed leave and readiness cannot detach or mutate a newer room`; [sockets.test.ts](../server/tests/sockets.test.ts): leaver's tabs receive null test | Expected roomId is in the URL, not body/header. A departed identity's sockets receive `{ room: null }`. |
| 1.15 Closed room | Same A/B leave tests plus [lobby.test.ts](../server/tests/integration/lobby.test.ts) full lobby/closed-room rejection | Same behavior: retained name/seat; no replacement joiner; remaining player can read. |
| 1.16 Stale tabs | [rooms.test.ts](../server/tests/rooms.test.ts): `rules 1.14, 1.16: stale/delayed leave and readiness cannot detach or mutate a newer room`, `rules 1.16-1.17: outsider learns nothing; no-room leave is a no-op` | URL roomId is checked against the player pointer under Lua, replacing x-quarrel-room-id. A caller with no seat gets 404 for ready; leave is idempotent success. |
| 1.17 Privacy | [rooms.test.ts](../server/tests/rooms.test.ts): outsider test and raw-JSON assertions in every snapshot helper; [sockets.test.ts](../server/tests/sockets.test.ts): `all tabs receive their player's view, without room-wide channel membership` and afterEach assertions on every pushed payload; [shared rooms tests](../shared/tests/rooms.test.ts): extra-key rejection tests | Explicit per-player mapper and strict schemas replace RLS. Raw JSON checks reject complete internal IDs (a random room ID can contain the incidental substring p_). |

## Coverage enforcement

`npm run test:coverage` enforces each workspace separately: statements/lines/functions >=90%,
branches >=85%, for all server and shared TypeScript source. Ported AI and executable entry
points remain included. Type-only modules and declarations have no executable statements.
`server.deps.inline` keeps the shared workspace in Vitest's measured module graph. UI helper
tests run in their own Node project; UI source is outside the requested server/shared coverage.

## Audit at Slice 1E

`npm audit --json` on 2026-11-18 reported 0 vulnerabilities, including 0 high-severity
advisories. The earlier 1D install warning is no longer reproduced by the current lockfile.
No audit fixes or direct-major upgrades were needed; only the approved UI socket.io-client
dependency was added in this sub-stage.

| High advisory/package | Dependency path | Fix available | Action |
| --- | --- | --- | --- |
| None reported | N/A | N/A | No fixes required; no force command used |
