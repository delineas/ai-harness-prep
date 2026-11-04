# Spec 01 — Catalog explorer

## Goal

Let people explore the Netflix catalog (movies, shows, seasons) and its viewership **in a web UI**. The catalog is **read-only**.

## Source data

- **Source:** netflixdb by Luis Rocha, pinned to `v1.0.70`, file `netflixdb.sqlite`.
  - URL: `https://github.com/lerocha/netflixdb/releases/download/v1.0.70/netflixdb.sqlite`
  - SHA-256: `2cc4edee66ba91ce9d76ae388a1cfdfb18e263fc7f8dc01eddc335cc7d9243b0`
- Stored locally as `data/catalog.db`, which is **not versioned**. A script downloads it and verifies the checksum.
- Useful tables: `movie`, `tv_show`, `season`, `view_summary`.
- Unused tables:
  - `episode`, because it is empty;
  - `BATCH_*`, because they are internal metadata of the loading process (Spring Batch) and **must never be read**.
- Dates (`release_date`, `start_date`, `end_date`) are **epoch milliseconds**.
- `view_summary.duration` has two granularities:
  - `WEEKLY`: global weekly top 10, with `view_rank` and `cumulative_weeks_in_top10`;
  - `SEMI_ANNUALLY`: semi-annual engagement report, with `hours_viewed` and `views`.
- Each `view_summary` row points to **either** `movie_id` **or** `season_id`.

## Features

1. **Title list:** movies and shows, 20 per page.
   - Filters: kind (movie or show), title text, release year.
   - Sort: by title or by total hours viewed.
2. **Movie detail:** basic data, total hours viewed, weeks in the top 10.
3. **Show detail:** its seasons with hours viewed per season.
4. **Global stats:** number of movies, shows and seasons, and the period covered by the data.

## Interfaces

- **HTTP JSON API:** `GET /api/titles`, `GET /api/movies/:id`, `GET /api/shows/:id`, `GET /api/stats`.
- **Web UI** (Vite + TypeScript, no framework) served by the same server:
  - a header with the global stats;
  - a search bar (text, kind, year, sort);
  - a paginated grid of titles;
  - a detail panel for the selected title.
- The UI must be **accessible**: labels on every input, visible focus, real buttons, AA contrast, usable at 360 px wide without horizontal scroll.
- Hours are shown in a human format, for example `382.2 M h`.

## Rules

- **The catalog is read-only.** No part of the application may modify it.
- Only one module opens `catalog.db`.
- The web UI talks only to the HTTP API. It never imports backend code.

## Acceptance criteria

- `GET /api/stats` returns 12214 movies, 4862 shows and 8874 seasons, and the header shows those numbers.
- Searching "love" with kind "movie" shows only movies whose title contains "love".
- Writing to the catalog from the app fails.
- No data from `BATCH_*` tables ever reaches the API or the UI.
