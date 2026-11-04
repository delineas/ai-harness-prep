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

## License

Code: MIT (see `LICENSE`). The catalog data belongs to its authors and is downloaded, not versioned.
