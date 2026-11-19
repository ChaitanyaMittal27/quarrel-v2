# Stage 5C encoding repairs (2026-11-19)

The before column uses Unicode escapes so the encoding regression test can scan this file
without treating the historical examples as fresh corruption. All files are UTF-8 without BOM.

| File / context | Before (escaped corrupt characters) | After |
| --- | --- | --- |
| ui/src/game/RoomScreen.tsx, opponent heading | `{name}\u00e2\u20ac\u2122s position` | `{name}'s position` |
| RoomScreen, opponent placeholder | `Still making their case\u00e2\u20ac\u00a6` | `Still making their case…` |
| RoomScreen, ready/connected statuses | `{ready} \u00c2\u00b7 {connected}` | `{ready} · {connected}` |
| RoomScreen, plan preparation | `Preparing the debate\u00e2\u20ac\u00a6` | `Preparing the debate…` |
| RoomScreen, subtopic allocation | `{seconds} seconds each \u00c2\u00b7 {name} opens` | `{seconds} seconds each · {name} opens` |
| RoomScreen, ended eyebrow | `THAT\u00e2\u20ac\u2122S A WRAP` | `THAT'S A WRAP` |
| RoomScreen, started status separator | `Debate started \u00c2\u00b7 {turn}` | `Debate started · {turn}` |
| RoomScreen, opponent turn | `{name}\u00e2\u20ac\u2122s turn` | `{name}'s turn` |
| RoomScreen, own-turn placeholder | `Make your case\u00e2\u20ac\u00a6` | `Make your case…` |
| RoomScreen, other-turn placeholder | `Listen to the other side\u00e2\u20ac\u00a6` | `Listen to the other side…` |
| RoomScreen, argument counts | `{count}/600 characters \u00c2\u00b7 {count}/12 arguments this subtopic` | `{count}/600 characters · {count}/12 arguments this subtopic` |
| ui/tests/game.test.ts, status assertion | `Ready \u00c2\u00b7 Connected` | `Ready · Connected` |
| ui/tests/game.test.ts, preparing assertion | `Preparing the debate\u00e2\u20ac\u00a6` | `Preparing the debate…` |
| agent-docs/environment.md, three command separators | `\u00c3\u201a\u00c2\u00b7` | `·` |
| agent-docs/todo.md, inventory section reference | `\u00c3\u201a\u00c2\u00a79` | `§9` |
| ui/src/game/HomeScreen.tsx, gallery link (caught during the fix) | `\u00e2\u2020\u2014` | `↗` |

No replacement characters, invalid UTF-8 files or BOMs were found in the scanned repository
text. Correct curly quotation marks/apostrophes in the four shared theme dialogue configs and
server/worker/ai/lawyer-policy.ts were also normalized to ASCII as requested; their wording
and behavior are unchanged. Ellipses, middle dots, section signs and the gallery arrow remain
intentional Unicode characters.

ui/tests/encoding.test.ts checks tracked and new nonignored text, excluding dependency/build/
coverage directories, lockfiles, secrets and binary assets. It runs in npm test and CI's
test:coverage through the normal UI Vitest project.
