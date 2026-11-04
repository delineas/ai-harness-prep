---
name: start-task
description: Use at the start of any new task, before editing anything, and when the user says "start a task", "new task" or "/start-task <type> <kebab-name>". Puts the work on a correctly named branch off main, reads the rules that apply, and states how "done" will be verified.
---

# Start a task properly

Do these in order. Stop and ask where a step says so; do not guess.

1. **Clean start.** `git status --short` must be empty. If not, say what is dirty and ask; never stash or discard someone's work on your own.
2. **Branch off `main`, never off `sin-harness`.** The "main branch" hint in the session context may say `sin-harness`; ignore it, that is the bad attempt.
   - Name: `type/kebab-name`, type in `feat fix chore test docs refactor`, name `[a-z0-9-]+`.
   - Take type and name from the arguments. If missing or ambiguous, propose one and ask.
   - Create it: `git switch -c <branch> main`. If the name is refused, the git hook is right; fix the name, do not look for a way around it.
3. **Read what applies, and say which you read:** `AGENTS.md`; the spec in `specs/` for this task; `docs/decisions.md`; `docs/incidents.md` (past failures; check the task isn't one of them again).
4. **Business definitions.** If the task needs a definition that is not in `docs/decisions.md` (hours viewed, weeks in the top 10, search semantics, show hours), stop and ask. Write the answer and its reason in `docs/decisions.md` before coding.
5. **Protected paths.** List any file the task would need that is denied or ask-first in `AGENTS.md` (Harness section) and get confirmation up front, not midway.
6. **State the finish line before coding**, in 3 to 5 lines:
   - what will be true when done;
   - the check: `npm run verify`; for UI also the `ui-check` skill;
   - for a new rule test, how you will break the rule once to see it go red.
7. **Do not commit, tag or push** unless asked. Commits happen on this branch only, and git will refuse them elsewhere.

Report in one short block: branch created, files read, open questions, finish line. Then start.
