# Workflow

## How tasks arrive
- The owner (Chaitanya) plans each sub-stage in a separate planning chat, then pastes a prompt.
  **Do exactly that prompt.** No extra features, refactors or "while I'm here" changes.
- If the prompt conflicts with the code, the rules or these docs, do the safest reasonable thing
  and list the conflict in the report. Don't guess game rules: check `docs/rules.md` and v1.
- Work is split into stages and sub-stages (see [status.md](status.md)). One sub-stage per prompt.

## Hard rules
- **Never** run `git commit`, `git push`, or anything that rewrites history (rebase, reset,
  amend, force-push). Never stage files. The owner makes every commit.
- `../quarrel-v1` is the original repo and is **read-only**: read and port from it; never edit,
  build, install or run anything that changes it.
- Never print, log or commit secrets or `.env*` files (only `.env.example` is tracked).
- Ask before adding dependencies or deleting files.
- `JUDGE_AI_MODE=demo` by default. Real (paid) AI only when told to.

## Owner-written practice pieces
The owner writes one core piece per sub-stage himself, to learn the code. When a prompt says a
piece is his (e.g. `join.lua` in 1C), leave the stub and the tests; **do not implement it**,
even if tests fail because of it. [status.md](status.md) lists the current one.

## End of every task
1. Run the checks the prompt asks for; at least `npm run typecheck` and the relevant tests.
   Don't call a step done while they fail.
2. Stop everything you started: dev servers, compose, Supabase. Leave `quarrel-redis` stopped.
3. Show `git status` (new / modified / deleted). Nothing staged, nothing committed.
4. Report back with:
   - check results (with test counts per project);
   - files created or changed;
   - differences from the prompt, and why;
   - every place you interpreted the spec;
   - short plain-language explanations of any idea used for the first time
     (the owner is learning this stack).

## Keeping these docs current
- When a change alters a convention, the API, a Redis key, config/env vars, ports or commands,
  update the matching agent doc **in the same change** (and `docs/api.md` for API changes).
- Update [status.md](status.md) only when the prompt says the sub-stage is finished.
- Add newly found follow-ups to [todo.md](todo.md); remove items when done.
