import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import { sumHours, type CatalogStats, type MovieDetail, type SeasonDetail, type ShowDetail, type Title, type TitleKind } from "../../domain/catalog.ts";
import type { CatalogRepository } from "../../application/ports.ts";

type Row = Record<string, unknown>;
const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const num = (v: unknown) => Number(v);
const numOrNull = (v: unknown) => (v == null ? null : Number(v));
const yearOf = (ms: unknown) => (ms == null ? null : new Date(num(ms)).getUTCFullYear());
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * R11: hours of a movie/season = sum over SEMI_ANNUALLY rows only (WEEKLY would double count).
 * No SEMI_ANNUALLY row means NULL ("no data"), never 0.
 */
const OWNER_HOURS = (col: "movie_id" | "season_id") =>
  `SELECT ${col} AS owner, sum(hours_viewed) AS hours FROM view_summary WHERE duration = 'SEMI_ANNUALLY' AND ${col} IS NOT NULL GROUP BY ${col}`;

/** R5 merged list. R9 show year = earliest season release date; R12 show hours = sum of season hours. */
const TITLES_CTE = `
  WITH movie_hours AS (${OWNER_HOURS("movie_id")}),
       season_hours AS (${OWNER_HOURS("season_id")}),
       show_facts AS (
         SELECT s.tv_show_id AS show_id, min(s.release_date) AS release_date, sum(h.hours) AS hours
         FROM season s LEFT JOIN season_hours h ON h.owner = s.id
         GROUP BY s.tv_show_id
       ),
       titles AS (
         SELECT m.id, 'movie' AS kind, m.title, m.release_date AS rd, h.hours AS hours
         FROM movie m LEFT JOIN movie_hours h ON h.owner = m.id
         UNION ALL
         SELECT t.id, 'show', t.title, f.release_date, f.hours
         FROM tv_show t LEFT JOIN show_facts f ON f.show_id = t.id
       )`;

export function sqliteCatalogRepository(db: DatabaseSync): CatalogRepository {
  return {
    stats(): CatalogStats {
      const c = db
        .prepare(
          `SELECT (SELECT count(*) FROM movie) AS movies,
                  (SELECT count(*) FROM tv_show) AS shows,
                  (SELECT count(*) FROM season) AS seasons`,
        )
        .get() as Row;
      const p = db.prepare("SELECT min(start_date) AS f, max(end_date) AS t FROM view_summary").get() as Row;
      return {
        movies: num(c.movies),
        shows: num(c.shows),
        seasons: num(c.seasons),
        period: p.f == null || p.t == null ? null : { from: isoDate(num(p.f)), to: isoDate(num(p.t)) },
      };
    },

    listTitles(query, offset, limit) {
      const where: string[] = [];
      const params: SQLInputValue[] = [];
      if (query.kind) {
        where.push("kind = ?");
        params.push(query.kind);
      }
      if (query.text) {
        where.push("title LIKE ? ESCAPE '\\'"); // LIKE folds ASCII case only (R8 known limit)
        params.push(`%${escapeLike(query.text)}%`);
      }
      if (query.year !== undefined) {
        where.push("rd IS NOT NULL AND CAST(strftime('%Y', rd / 1000, 'unixepoch') AS INTEGER) = ?");
        params.push(query.year);
      }
      const filter = where.length ? `WHERE ${where.join(" AND ")}` : "";
      // R6 order; R10: by hours desc with "no data" last, then the R6 order.
      const byTitle = "title COLLATE NOCASE, kind, id";
      const order = query.sort === "hours" ? `hours IS NULL, hours DESC, ${byTitle}` : byTitle;
      const rows = db
        .prepare(`${TITLES_CTE} SELECT id, kind, title, rd, hours FROM titles ${filter} ORDER BY ${order} LIMIT ? OFFSET ?`)
        .all(...params, limit, offset) as Row[];
      const total = num((db.prepare(`${TITLES_CTE} SELECT count(*) AS n FROM titles ${filter}`).get(...params) as Row).n);
      const items: Title[] = rows.map((r) => ({
        id: num(r.id),
        kind: r.kind as TitleKind,
        title: String(r.title),
        releaseYear: yearOf(r.rd),
        hoursViewed: numOrNull(r.hours),
      }));
      return { items, total };
    },

    movie(id): MovieDetail | null {
      const m = db.prepare("SELECT id, title, release_date, runtime, locale FROM movie WHERE id = ?").get(id) as Row | undefined;
      if (!m) return null;
      const h = db.prepare("SELECT sum(hours_viewed) AS hours FROM view_summary WHERE movie_id = ? AND duration = 'SEMI_ANNUALLY'").get(id) as Row;
      // R14: max of Netflix's running count, not the number of weekly rows.
      const w = db
        .prepare("SELECT max(cumulative_weeks_in_top10) AS weeks FROM view_summary WHERE movie_id = ? AND duration = 'WEEKLY'")
        .get(id) as Row;
      return {
        id: num(m.id),
        title: String(m.title),
        releaseYear: yearOf(m.release_date),
        runtimeMinutes: numOrNull(m.runtime),
        locale: m.locale == null ? null : String(m.locale),
        hoursViewed: numOrNull(h.hours),
        weeksInTop10: w.weeks == null ? 0 : num(w.weeks),
      };
    },

    show(id): ShowDetail | null {
      const t = db.prepare("SELECT id, title FROM tv_show WHERE id = ?").get(id) as Row | undefined;
      if (!t) return null;
      const rows = db
        .prepare(
          `WITH season_hours AS (${OWNER_HOURS("season_id")})
           SELECT s.id, s.season_number, s.title, s.release_date, h.hours
           FROM season s LEFT JOIN season_hours h ON h.owner = s.id
           WHERE s.tv_show_id = ?
           ORDER BY s.season_number IS NULL, s.season_number, s.id`, // R16
        )
        .all(id) as Row[];
      const seasons: SeasonDetail[] = rows.map((r) => ({
        id: num(r.id),
        seasonNumber: numOrNull(r.season_number),
        title: String(r.title),
        hoursViewed: numOrNull(r.hours),
      }));
      const dates = rows.map((r) => r.release_date).filter((d) => d != null).map(num);
      return {
        id: num(t.id),
        title: String(t.title),
        releaseYear: dates.length ? yearOf(Math.min(...dates)) : null,
        hoursViewed: sumHours(seasons.map((s) => s.hoursViewed)),
        seasons,
      };
    },
  };
}
