import type { DatabaseSync } from "node:sqlite";
import type { CatalogStats, Title, TitleKind } from "../../domain/catalog.ts";
import type { CatalogRepository } from "../../application/ports.ts";

const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const num = (v: unknown) => Number(v);

export function sqliteCatalogRepository(db: DatabaseSync): CatalogRepository {
  return {
    stats(): CatalogStats {
      const c = db
        .prepare(
          `SELECT (SELECT count(*) FROM movie) AS movies,
                  (SELECT count(*) FROM tv_show) AS shows,
                  (SELECT count(*) FROM season) AS seasons`,
        )
        .get() as Record<string, unknown>;
      const p = db.prepare("SELECT min(start_date) AS f, max(end_date) AS t FROM view_summary").get() as Record<string, unknown>;
      return {
        movies: num(c.movies),
        shows: num(c.shows),
        seasons: num(c.seasons),
        period: p.f == null || p.t == null ? null : { from: isoDate(num(p.f)), to: isoDate(num(p.t)) },
      };
    },

    listTitles(offset, limit) {
      const rows = db
        .prepare(
          `SELECT id, kind, title, release_date FROM (
             SELECT id, 'movie' AS kind, title, release_date FROM movie
             UNION ALL
             SELECT id, 'show' AS kind, title, release_date FROM tv_show
           ) ORDER BY title COLLATE NOCASE, kind, id LIMIT ? OFFSET ?`,
        )
        .all(limit, offset) as Record<string, unknown>[];
      const total = num((db.prepare("SELECT (SELECT count(*) FROM movie) + (SELECT count(*) FROM tv_show) AS n").get() as Record<string, unknown>).n);
      const items: Title[] = rows.map((r) => ({
        id: num(r.id),
        kind: r.kind as TitleKind,
        title: String(r.title),
        releaseYear: r.release_date == null ? null : new Date(num(r.release_date)).getUTCFullYear(),
      }));
      return { items, total };
    },
  };
}
