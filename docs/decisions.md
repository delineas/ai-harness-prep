# Decisions

Business definitions the code relies on. Change them here first, then in the code.

## Global stats (`GET /api/stats`)
- `movies`, `shows`, `seasons`: row counts of `movie`, `tv_show`, `season`.
- **Period covered**: `min(view_summary.start_date)` to `max(view_summary.end_date)` over *all* `view_summary` rows (both `WEEKLY` and `SEMI_ANNUALLY`), converted from epoch milliseconds to UTC calendar dates. With the pinned data: `2023-06-12` to `2026-10-04`.

## Title list (`GET /api/titles?page=N`)
- Movies and shows are **merged into one list** of 17,076 titles (12,214 + 4,862).
- **Default order**: title, case-insensitive (`COLLATE NOCASE`), then kind (`movie` before `show`), then id. This makes paging deterministic.
- **Page size**: 20, fixed. `page` starts at 1; anything else is a 400.
- `releaseYear` is the UTC year of `release_date`; `null` when the date is missing.

## Not decided yet (do not guess; decide when the feature needs it)
Hours viewed, weeks in the top 10, show hours, text-search semantics.

## Data access
- `catalog.db` is opened only by `src/infrastructure/sqlite/openCatalog.ts`, read-only, with a SQLite authorizer that denies any read of `BATCH_*` tables. Both are tested against the connection the app uses.
