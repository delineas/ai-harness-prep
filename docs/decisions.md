# Decisions

Business rules of spec 01, numbered so code, tests and reviews can cite them (`R7`). Change a rule here first, then in the code.

Every figure below was measured on the pinned catalog (netflixdb v1.0.70) with a read-only connection. "Spec" means the rule comes from `specs/spec-01-catalog.md`; "Decision" means the spec left it open and this document chose.

**Implementation status:** R1–R6 and R17 are implemented. R7–R16 are not yet (hours, top 10, filters, sort, detail). R10 also exposes a bug in the current list: it reads `tv_show.release_date`, which is empty for every show.

## Data

**R1. Source and period (spec).** Dates are epoch milliseconds, read as UTC. `view_summary` covers WEEKLY rows from 2023-06-12 to 2026-10-04 and SEMI_ANNUALLY rows for only two half-years: 2023-07-01..2023-12-31 and 2024-01-01..2024-06-30.

**R2. Global stats (spec).** `movies`, `shows`, `seasons` are the row counts of `movie` (12,214), `tv_show` (4,862) and `season` (8,874). The period shown is `min(start_date)` to `max(end_date)` over all `view_summary` rows: 2023-06-12 to 2026-10-04.

**R3. Allowed tables (spec).** Only `movie`, `tv_show`, `season`, `view_summary`. Never `episode` (empty) or `BATCH_*`.

**R4. One owner per view row (spec, verified).** Each `view_summary` row has exactly one of `movie_id` / `season_id`. 0 rows have both or neither.

## Title list

**R5. One merged list (decision).** Movies and shows form one list of 17,076 titles.

**R6. Paging (spec + decision).** 20 per page, page starts at 1, anything else is a 400. Default order: title case-insensitive, then kind (`movie` before `show`), then id, so paging is deterministic.

**R7. Kind filter (spec).** `movie` or `show`; absent means both.

**R8. Text search (decision).** Case-insensitive **substring** of `title`, after trimming. `original_title` is not searched. The user's text is literal: `%` and `_` are escaped (8 movie titles contain one).
- Why substring: the spec's acceptance criterion says titles that "contain" the text. Matching whole words would be a different feature.
- Cost, measured: "love" matches 302 movies as a substring and 266 as a whole word. The 36 extra include *10 Cloverfield Lane*, *40-Love* and *A Beloved Wife*.
- Known limit: SQLite's `NOCASE` folds ASCII only, and 461 movie titles contain non-ASCII characters, so case folding is not applied to those letters.

**R9. Release year (decision).** The year (UTC) of the title's release date, shown as "year unknown" when there is none.
- A **movie** uses `movie.release_date`. Only 1,774 of 12,214 movies have one (2013-12-12 to 2024-06-28).
- A **show** has no date of its own: `tv_show.release_date` is empty for all 4,862. Its year is the year of its **earliest** `season.release_date`. 2,265 shows have at least one dated season; 3,530 of 8,874 seasons have a date.
- The year filter matches only titles with a known year, so "year unknown" titles disappear when it is set. Most titles are "year unknown", so the UI should say so.

**R10. Sort (spec + decision).** By title (the R6 order) or by total hours viewed (R11/R12) descending. Titles without hours go last, then by the R6 order.

## Viewership

**R11. Hours viewed of a movie (decision).** The sum of `hours_viewed` over its **SEMI_ANNUALLY** rows. It has two rows at most, for non-overlapping half-years, with no duplicates (verified).
- Why SEMI_ANNUALLY only, with data: WEEKLY rows carry `hours_viewed` too (all 6,911). The weekly rows inside the semi-annual window already add up to 32.5 B hours on top of the 178.5 B of the semi-annual ones, so adding both counts the same viewing twice. The spec also assigns hours to the semi-annual report.
- Consequence to accept: 1,099 movies appear in the weekly top 10 and in no semi-annual report, so they have **no hours**. They are shown as "no data", not as 0 h.

**R12. Hours viewed of a show (decision).** The sum of the R11 hours of its seasons. A show with no season hours has no hours (4,325 of 4,862 do). The show detail lists the hours per season.

**R13. Hours format (spec + decision).** One decimal. At 1,000,000 or more: `382.2 M h`. From 1,000: `12.3 k h`. Below that: `950 h`.

**R14. Weeks in the top 10 of a movie (decision): the maximum of `cumulative_weeks_in_top10` over its WEEKLY rows; 0 if it has none.** The alternative is to count its WEEKLY rows.
- The two give the same number for 1,372 of the 1,487 movies that have WEEKLY rows, and the 10,727 that have none are 0 either way. **115 movies change (7.7% of those with weekly data)**.
- Why they differ: the column is Netflix's own running count of weeks in the top 10, and it started before the dataset did. In all 115 cases the first row already has a count above 1 (the movie charted before 2023-06-12), and in 40 of them it also left the list and came back. Counting rows can only understate, never overstate: the maximum is higher in all 115 and lower in none.
- Example: *Through My Window* has 5 weekly rows, but its last one says week 18. Counting rows would report 5, hiding 13 weeks Netflix published. *Troll* is 15 against 4, *Despicable Me 2* 19 against 10.
- Why the maximum: the label means weeks in the top 10, not weeks inside our window, and the column answers that without us having to guess what happened before 2023. The UI says "weeks in the top 10 (as published by Netflix)".
- Cost: the number can include weeks outside the period shown in the header. Counting rows would be consistent with the header but wrong for those 115 movies.
- Shows have no such figure in the spec; it is not computed for them.

## Detail

**R15. Movie detail (spec).** Title, release year (R9), runtime and locale if present, total hours (R11, "no data" if none) and weeks in the top 10 (R14).

**R16. Show detail (spec).** Its seasons ordered by `season_number`, with hours per season (R11 applied to the season) and the total (R12).

## Access

**R17. Read-only (spec).** `catalog.db` is opened only by `src/infrastructure/sqlite/openCatalog.ts`, read-only, with a SQLite authorizer that denies any read of `BATCH_*`. Both are tested against the connection the app uses.
