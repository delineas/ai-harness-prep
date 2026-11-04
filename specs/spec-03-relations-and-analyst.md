# Spec 03 — Relations, charts and analyst mode

## Goal

Show how content relates, chart its audience, and let an AI agent answer questions about the data **without going beyond what is allowed**.

## Derived relations

The catalog has no cast or genres, so relations are computed:

1. **Show and seasons:** through `season.tv_show_id`.
2. **Top 10 co-occurrence:** two titles are related if they were in the weekly top 10 (`view_summary` with `duration = 'WEEKLY'`) in the same week at least N times. N is configurable and defaults to 2. The weight of the relation is the number of shared weeks.
3. **Same release:** titles with the same `release_date`.

Relation computation is **domain logic**, tested with small sample data, never against the real database.

## Charts (UI)

- **Top 10 history of a title:** a line with its rank per week, in the detail panel.
- **Related titles:** the neighbours of a title in the top 10, with the weight of each relation, as a clickable list.
- **Top hours per semester:** a bar chart on a "Stats" page.

API: `GET /api/titles/:kind/:id/relations`, `GET /api/titles/:kind/:id/top10-history` and `GET /api/charts/hours-by-semester`.

Charts are drawn with inline SVG, without chart libraries, and each one has a text alternative.

## Analyst mode (AI agent)

An AI agent can answer questions such as *"which shows spent the most weeks in the top 10 in 2024?"* by querying the data.

**Data gate.** The agent reaches the data **only** through a project CLI (`npm run ask-db -- "<SQL>"`) with these guarantees:

- It opens the databases **read-only**.
- It only allows `SELECT`.
- Inside the engine (SQLite authorizer), it only allows reading:
  - from the catalog: `movie`, `tv_show`, `season` and `view_summary`;
  - from `app.db`: `reviews`, plus the `id`, `display_name` and `role` columns of `users`.
- It denies any `BATCH_*` table and the `users.email` column, **including inside subqueries, views or joins**.
- It caps the result at 200 rows.
- It logs every query (date, SQL, result or rejection reason) to `logs/ask-db.jsonl`.

## Acceptance criteria

- `ask-db` answers a query on `movie` and rejects:
  - `SELECT * FROM BATCH_JOB_INSTANCE`;
  - `SELECT email FROM users`;
  - a subquery that tries to read `email`;
  - any `INSERT`, `UPDATE`, `DELETE` or `DROP`.
- Every rejection is logged with its reason.
- Relation computation has tests with sample data and an edge case: a title with no weeks in the top 10.
- Every chart has a text alternative that the accessibility check accepts.
