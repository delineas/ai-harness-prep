# AGENTS.md

Netflix Explorer: read-only web app over a SQLite catalog. Specs in `specs/`, decisions in `docs/decisions.md`, past failures in `docs/incidents.md`.

## Done means verified
- Run `npm run verify` (typecheck, tests, build, browser e2e). Don't say "done" without it passing.
- A UI change isn't done until the Playwright e2e passes in a real browser. If the browser can't run, say the UI is unverified. Don't imply it was checked.
- A UI change is only done when the e2e passes and you have used the `ui-check` skill. Say what you clicked and what you saw.
- A new test for a rule (layers, read-only, BATCH_*) must be shown to fail: break the rule once on purpose, see it go red, restore it.

## Business definitions
- If a definition isn't in `docs/decisions.md` (hours viewed, weeks in the top 10, search semantics, show hours), don't pick one. Ask, then write it there with the reason before coding.

## Architecture
- Dependencies point inward: `domain` <- `application` <- `infrastructure` and `interfaces`; `main.ts` wires them. `web/` talks to the backend only through `fetch('/api/...')`.
- `tests/architecture.test.ts` enforces this, including which Node built-ins each layer may import. Widen its allowlist only on purpose, never to silence a failure.
- SQL belongs in `infrastructure/sqlite` only. Business rules never go in SQL or HTTP handlers.

## Data
- `data/catalog.db` is read-only and opened only by `openCatalog.ts`. Never read `BATCH_*` tables: the authorizer blocks them, so don't work around it.
- Never run write or mutation experiments against `data/catalog.db`. Use a temp copy. If it gets damaged, `npm run fetch-catalog` restores it and checks the SHA-256.
- Dates in the data are epoch milliseconds.

## Dependencies
- Pin exact versions, no `^` or `~`. Check the latest with `npm view <pkg> version` before adding one.
- Node 24 runs TypeScript natively: erasable syntax only (no enums or parameter properties), `.ts` extensions in imports, no `tsx`.

## Git
- Branch off `main` (never `sin-harness`, the bad attempt). Don't commit, tag or edit the README tag table without being asked.

## Harness
Protected paths. Enforced by `.claude/settings.json`; the list there and this one must match.

Never change (denied):
- `data/catalog.db` (the catalog). Restore it only with `npm run fetch-catalog`, and ask first.
- `tests/architecture.test.ts` and `scripts/verify.ts` (the rules that judge the work).
- `e2e/**`, `playwright.config.ts` and `vitest.config.ts` (end-to-end tests and test config).
- `git commit`, `git tag`, and switching to `sin-harness`, unless asked.
- `.githooks/**` and `scripts/agent-run.sh` (agent-independent guards: branch-name hooks, and the bwrap launcher that masks `data/app.db` and strips `BATCH_*`). Start any agent through `scripts/agent-run.sh <cmd>`.

Ask first (confirmation required):
- The app database: anything else under `data/`, any `.sql` file, `sqlite3`.
- Migrations: `migrations/**`.
- Dependencies: `package.json`, `package-lock.json`, `npm install/add/update/uninstall`.
- This file, `CLAUDE.md` and `.claude/settings*.json`.
