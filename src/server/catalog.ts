// The ONLY module that opens catalog.db. Read-only; never touches BATCH_* tables.
import { DatabaseSync } from "node:sqlite";

export type Kind = "movie" | "show";
export type Sort = "title" | "hours";

export interface TitleQuery {
  kind?: Kind;
  q?: string;
  year?: number;
  sort: Sort;
  page: number;
}

export const PAGE_SIZE = 20;

export function openCatalog(path = process.env.CATALOG_DB ?? "data/catalog.db") {
  const db = new DatabaseSync(path, { readOnly: true });
  db.exec("PRAGMA query_only = ON");

  // Semi-annual reports are the hours source: WEEKLY rows also carry
  // hours_viewed and summing both would double count.
  const titlesCte = `
    WITH hours AS (
      SELECT movie_id, season_id, SUM(hours_viewed) AS h
      FROM view_summary WHERE duration = 'SEMI_ANNUALLY' GROUP BY movie_id, season_id
    ),
    show_hours AS (
      SELECT s.tv_show_id AS id, SUM(hours.h) AS h
      FROM season s JOIN hours ON hours.season_id = s.id GROUP BY s.tv_show_id
    ),
    titles AS (
      SELECT 'movie' AS kind, m.id, m.title, m.release_date, COALESCE(hours.h, 0) AS hours
      FROM movie m LEFT JOIN hours ON hours.movie_id = m.id
      UNION ALL
      SELECT 'show', t.id, t.title, t.release_date, COALESCE(show_hours.h, 0)
      FROM tv_show t LEFT JOIN show_hours ON show_hours.id = t.id
    )`;

  const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

  return {
    listTitles(query: TitleQuery) {
      const where: string[] = [];
      const params: (string | number)[] = [];
      if (query.kind) (where.push("kind = ?"), params.push(query.kind));
      if (query.q) (where.push("title LIKE ? ESCAPE '\\'"), params.push(`%${escapeLike(query.q)}%`));
      if (query.year !== undefined) {
        where.push("strftime('%Y', release_date / 1000, 'unixepoch') = ?");
        params.push(String(query.year));
      }
      const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
      const order = query.sort === "hours" ? "hours DESC, title" : "title COLLATE NOCASE, kind, id";
      const total = (db.prepare(`${titlesCte} SELECT COUNT(*) AS n FROM titles ${w}`).get(...params) as { n: number }).n;
      const items = db
        .prepare(`${titlesCte} SELECT * FROM titles ${w} ORDER BY ${order} LIMIT ? OFFSET ?`)
        .all(...params, PAGE_SIZE, (query.page - 1) * PAGE_SIZE);
      return { page: query.page, pageSize: PAGE_SIZE, total, items };
    },

    getMovie(id: number) {
      const movie = db.prepare("SELECT id, title, original_title, release_date, runtime, locale, available_globally FROM movie WHERE id = ?").get(id);
      if (!movie) return null;
      const totals = db
        .prepare(
          `SELECT COALESCE(SUM(CASE WHEN duration='SEMI_ANNUALLY' THEN hours_viewed END), 0) AS hours,
                  COALESCE(MAX(CASE WHEN duration='WEEKLY' THEN cumulative_weeks_in_top10 END), 0) AS weeksInTop10
           FROM view_summary WHERE movie_id = ?`,
        )
        .get(id);
      return { ...movie, ...totals };
    },

    getShow(id: number) {
      const show = db.prepare("SELECT id, title, original_title, release_date, locale, available_globally FROM tv_show WHERE id = ?").get(id);
      if (!show) return null;
      const seasons = db
        .prepare(
          `SELECT s.id, s.title, s.season_number, s.release_date, s.runtime,
                  COALESCE((SELECT SUM(hours_viewed) FROM view_summary v WHERE v.season_id = s.id AND v.duration='SEMI_ANNUALLY'), 0) AS hours,
                  COALESCE((SELECT MAX(cumulative_weeks_in_top10) FROM view_summary v WHERE v.season_id = s.id AND v.duration='WEEKLY'), 0) AS weeksInTop10
           FROM season s WHERE s.tv_show_id = ? ORDER BY s.season_number, s.id`,
        )
        .all(id) as { hours: number }[];
      return { ...show, hours: seasons.reduce((a, s) => a + s.hours, 0), seasons };
    },

    getStats() {
      return db
        .prepare(
          `SELECT (SELECT COUNT(*) FROM movie) AS movies,
                  (SELECT COUNT(*) FROM tv_show) AS shows,
                  (SELECT COUNT(*) FROM season) AS seasons,
                  (SELECT MIN(start_date) FROM view_summary) AS periodStart,
                  (SELECT MAX(end_date) FROM view_summary) AS periodEnd`,
        )
        .get();
    },
  };
}

export type Catalog = ReturnType<typeof openCatalog>;
