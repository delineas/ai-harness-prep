# Netflix Explorer

A web app to explore the public Netflix catalog ([netflixdb v1.0.70](https://github.com/lerocha/netflixdb)) stored in SQLite.

This repository starts with nothing but the specs in `specs/`. Everything else is built by an AI coding agent, step by step, following the Web Reactiva guide *El harness de un agente de IA*.

## Run

Requires Node >= 24.

```
npm ci
npm run fetch-catalog     # downloads data/catalog.db and verifies its SHA-256
npm run build && npm start   # http://localhost:3000
npm run verify            # typecheck + tests + build + browser e2e
```

Layers (`tests/architecture.test.ts` enforces them): `src/domain` <- `src/application` <- `src/infrastructure`, `src/interfaces`; `src/main.ts` wires them. `web/` only talks to the HTTP API. See `docs/decisions.md`.

## Tags

Each step of the guide ends in a tag, and each tag descends from the previous one:

| Tag | State |
|---|---|
| `paso-00` | Specs only |
| `paso-03-sin-harness` | Spec 01 as an agent built it with no harness, and `docs/incidents.md` (branch `sin-harness`, never merged) |
| `paso-04` | Layered skeleton, `AGENTS.md`, `CLAUDE.md` and `docs/decisions.md` |
| `paso-05` | `npm run verify`, layer rules, browser e2e, the `ui-check` skill and spec 01 finished |
| `paso-06` | Permission rules, the permission case list, spec 02 (reviews) and the sandbox |
| `paso-07` | Git hooks, a `bwrap` launcher, a guard before each command (`harness/`) and the stop hook |
| `paso-08` | `pre-push`, the `start-task` skill, CI workflows and the guard for what judges the agent |
| `paso-09` | Audit fixes, `docs/backlog.md` and a whole task: top 10 history API and chart |

## License

Code: MIT (see `LICENSE`). The catalog data belongs to its authors and is downloaded, not versioned.
