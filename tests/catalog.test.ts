import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { listTitles, InvalidQueryError } from "../src/application/listTitles.ts";
import { openCatalog } from "../src/infrastructure/sqlite/openCatalog.ts";
import { sqliteCatalogRepository } from "../src/infrastructure/sqlite/sqliteCatalogRepository.ts";

// Tests run on a throwaway copy: if the read-only rule ever breaks, the real data is not destroyed.
const tmp = mkdtempSync(join(tmpdir(), "catalog-test-"));
const dbPath = join(tmp, "catalog.db");
copyFileSync(resolve(import.meta.dirname, "../data/catalog.db"), dbPath);
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe("catalog connection used by the app", () => {
  const db = openCatalog(dbPath);

  it("is read-only: writes fail", () => {
    expect(() => db.exec("CREATE TABLE x (a)")).toThrow();
    expect(() => db.exec("INSERT INTO movie (id, title, created_date, modified_date) VALUES (-1, 'x', 0, 0)")).toThrow();
    expect(() => db.exec("DELETE FROM movie")).toThrow();
  });

  it("never reads BATCH_* tables", () => {
    expect(() => db.prepare("SELECT * FROM BATCH_JOB_INSTANCE").all()).toThrow(/prohibited/);
    expect(() => db.prepare("select * from batch_job_execution").all()).toThrow(/prohibited/);
    expect(() => db.prepare("SELECT count(*) FROM BATCH_JOB_INSTANCE").get()).toThrow(/prohibited|not authorized/);
  });

  it("still reads catalog tables", () => {
    expect(db.prepare("SELECT count(*) AS n FROM movie").get()).toEqual({ n: 12214 });
  });
});

describe("sqlite repository", () => {
  const repo = sqliteCatalogRepository(openCatalog(dbPath));

  it("stats match the spec", () => {
    const s = repo.stats();
    expect([s.movies, s.shows, s.seasons]).toEqual([12214, 4862, 8874]);
    expect(s.period).toEqual({ from: "2023-06-12", to: "2026-10-04" });
  });

  it("pages titles, 20 per page, merged and in a stable order", () => {
    const p1 = listTitles(repo, { page: 1 });
    const p2 = listTitles(repo, { page: 2 });
    expect(p1.items).toHaveLength(20);
    expect(p1.total).toBe(12214 + 4862);
    expect(p1.items.map((t) => t.id + t.kind)).not.toEqual(p2.items.map((t) => t.id + t.kind));
    const names = p1.items.map((t) => t.title.toLowerCase());
    expect([...names].sort()).toEqual(names);
  });

  it("last page is partial and rejects bad pages", () => {
    const last = listTitles(repo, { page: Math.ceil((12214 + 4862) / 20) });
    expect(last.items).toHaveLength((12214 + 4862) % 20 || 20);
    expect(() => listTitles(repo, { page: 0 })).toThrow(InvalidQueryError);
    expect(() => listTitles(repo, { page: NaN })).toThrow(InvalidQueryError);
  });
});
