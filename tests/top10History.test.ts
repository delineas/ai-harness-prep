import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getTop10History } from "../src/application/getTop10History.ts";
import { NotFoundError } from "../src/application/getTitleDetail.ts";
import { InvalidQueryError } from "../src/application/listTitles.ts";
import { openCatalog } from "../src/infrastructure/sqlite/openCatalog.ts";
import { sqliteCatalogRepository } from "../src/infrastructure/sqlite/sqliteCatalogRepository.ts";
import { createHttpServer } from "../src/interfaces/http/server.ts";

const tmp = mkdtempSync(join(tmpdir(), "top10-test-"));
const dbPath = join(tmp, "catalog.db");
copyFileSync(resolve(import.meta.dirname, "../data/catalog.db"), dbPath);
afterAll(() => rmSync(tmp, { recursive: true, force: true }));
const repo = sqliteCatalogRepository(openCatalog(dbPath));

describe("R28–R31 top 10 history", () => {
  it("a movie: one point per weekly row, ascending, ranks 1..10 (movie 11123 has 67 weeks)", () => {
    const { points } = getTop10History(repo, "movie", "11123");
    expect(points).toHaveLength(67);
    expect(points.every((p) => p.rank >= 1 && p.rank <= 10)).toBe(true);
    expect(Math.min(...points.map((p) => p.rank))).toBe(1);
    const starts = points.map((p) => p.weekStart);
    expect([...starts].sort()).toEqual(starts);
    expect(new Set(starts).size).toBe(starts.length);
    expect(points[0]).toMatchObject({ weekStart: expect.stringMatching(/^\d{4}-\d\d-\d\d$/), weekEnd: expect.stringMatching(/^\d{4}-\d\d-\d\d$/) });
  });
  it("R29: a show takes the best rank among its seasons, one point per week (show 2, week of 2024-05-13: seasons ranked 4, 8 and 1)", () => {
    const { points } = getTop10History(repo, "show", "2");
    const week = points.filter((p) => p.weekStart === "2024-05-13");
    expect(week).toEqual([expect.objectContaining({ rank: 1 })]);
    const w2 = points.filter((p) => p.weekStart === "2024-05-06");
    expect(w2).toEqual([expect.objectContaining({ rank: 8 })]);
    expect(new Set(points.map((p) => p.weekStart)).size).toBe(points.length);
  });
  it("R30: a title with no weeks in the top 10 gives an empty list, not an error (movie 7056)", () => {
    expect(getTop10History(repo, "movie", "7056")).toEqual({ points: [] });
  });
  it("R31: bad kind or id is invalid, a missing title is not found", () => {
    expect(() => getTop10History(repo, "series", "1")).toThrow(InvalidQueryError);
    for (const id of ["abc", "-1", "0", "1.5"]) expect(() => getTop10History(repo, "movie", id), id).toThrow(InvalidQueryError);
    expect(() => getTop10History(repo, "movie", "99999999")).toThrow(NotFoundError);
    expect(() => getTop10History(repo, "show", "99999999")).toThrow(NotFoundError);
  });
});

describe("GET /api/titles/:kind/:id/top10-history", () => {
  const server = createHttpServer(repo, tmp);
  let base = "";
  beforeAll(async () => {
    await new Promise<void>((ok) => server.listen(0, ok));
    base = `http://localhost:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => void server.close());
  const get = async (path: string) => {
    const r = await fetch(base + path);
    return { status: r.status, body: (await r.json()) as any };
  };
  it("200 with points, 400 on bad input, 404 on a missing title", async () => {
    const ok = await get("/api/titles/movie/11123/top10-history");
    expect(ok.status).toBe(200);
    expect(ok.body.points).toHaveLength(67);
    expect(Object.keys(ok.body.points[0]).sort()).toEqual(["rank", "weekEnd", "weekStart"]);
    expect((await get("/api/titles/movie/7056/top10-history")).body).toEqual({ points: [] });
    expect((await get("/api/titles/series/1/top10-history")).status).toBe(400);
    expect((await get("/api/titles/movie/abc/top10-history")).status).toBe(400);
    expect((await get("/api/titles/movie/99999999/top10-history")).status).toBe(404);
  });
});
