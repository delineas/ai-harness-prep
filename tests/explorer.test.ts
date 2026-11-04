import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { formatHours, sumHours, type Title } from "../src/domain/catalog.ts";
import { InvalidQueryError, listTitles } from "../src/application/listTitles.ts";
import { getMovie, getShow, NotFoundError } from "../src/application/getTitleDetail.ts";
import { openCatalog } from "../src/infrastructure/sqlite/openCatalog.ts";
import { sqliteCatalogRepository } from "../src/infrastructure/sqlite/sqliteCatalogRepository.ts";
import { createHttpServer } from "../src/interfaces/http/server.ts";

const tmp = mkdtempSync(join(tmpdir(), "explorer-test-"));
const dbPath = join(tmp, "catalog.db");
copyFileSync(resolve(import.meta.dirname, "../data/catalog.db"), dbPath);
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const repo = sqliteCatalogRepository(openCatalog(dbPath));
const everything = (kind?: "movie" | "show", sort: "title" | "hours" = "title"): Title[] =>
  repo.listTitles({ kind, sort }, 0, 100_000).items;

describe("R13 hours format", () => {
  it("one decimal, M / k / plain", () => {
    expect(formatHours(382_200_000)).toBe("382.2 M h");
    expect(formatHours(1_000_000)).toBe("1.0 M h");
    expect(formatHours(12_300)).toBe("12.3 k h");
    expect(formatHours(1_000)).toBe("1.0 k h");
    expect(formatHours(950)).toBe("950 h");
    expect(formatHours(999_990)).toBe("1.0 M h");
  });
  it("R12 sum: no known part means no data, not 0", () => {
    expect(sumHours([null, null])).toBeNull();
    expect(sumHours([])).toBeNull();
    expect(sumHours([null, 5, 7])).toBe(12);
  });
});

describe("R7 kind filter", () => {
  it("movie / show / both", () => {
    expect(listTitles(repo, { kind: "movie" }).total).toBe(12214);
    expect(listTitles(repo, { kind: "show" }).total).toBe(4862);
    expect(listTitles(repo, {}).total).toBe(17076);
    expect(() => listTitles(repo, { kind: "series" })).toThrow(InvalidQueryError);
  });
});

describe("R8 text search: case-insensitive literal substring", () => {
  it('"love" in movies matches 302 (substring, not whole word), all of them contain it', () => {
    const r = listTitles(repo, { kind: "movie", text: "love" });
    expect(r.total).toBe(302);
    const all = everything("movie").filter((t) => t.title.toLowerCase().includes("love"));
    expect(all).toHaveLength(302);
    expect(listTitles(repo, { kind: "movie", text: "love" }).items.every((t) => t.kind === "movie" && /love/i.test(t.title))).toBe(true);
    expect(everything("movie").some((t) => t.title === "10 Cloverfield Lane")).toBe(true);
    expect(listTitles(repo, { kind: "movie", text: "10 cloverfield" }).items.map((t) => t.title)).toContain("10 Cloverfield Lane");
  });
  it("trims and is case-insensitive", () => {
    expect(listTitles(repo, { text: "  LoVe  " }).total).toBe(listTitles(repo, { text: "love" }).total);
    expect(listTitles(repo, { text: "   " }).total).toBe(17076);
  });
  it("% and _ are literal, not wildcards", () => {
    for (const text of ["%", "_", "100%"]) {
      const expected = everything().filter((t) => t.title.toLowerCase().includes(text)).length;
      expect(listTitles(repo, { text }).total, text).toBe(expected);
    }
    expect(listTitles(repo, { text: "%" }).total).toBeLessThan(100); // a wildcard would match everything
  });
});

describe("R9 release year", () => {
  it("movie year filter matches exactly the movies with that year", () => {
    const expected = everything("movie").filter((t) => t.releaseYear === 2022).length;
    expect(expected).toBeGreaterThan(0);
    const r = listTitles(repo, { kind: "movie", year: 2022 });
    expect(r.total).toBe(expected);
  });
  it("a show's year is its earliest season's: Bridgerton is 2020, and the year filter finds it", () => {
    expect(getShow(repo, 2).releaseYear).toBe(2020);
    const titles = listTitles(repo, { kind: "show", year: 2020, text: "bridgerton" });
    expect(titles.items.map((t) => t.id)).toContain(2);
  });
  it("shows with a known year: 2,265; titles of unknown year disappear when a year is set", () => {
    expect(everything("show").filter((t) => t.releaseYear !== null)).toHaveLength(2265);
    expect(everything("movie").filter((t) => t.releaseYear !== null)).toHaveLength(1774);
    let withYear = 0;
    for (let y = 2000; y <= 2030; y++) withYear += listTitles(repo, { year: y }).total;
    expect(withYear).toBe(2265 + 1774);
  });
  it("rejects a non-year", () => {
    expect(() => listTitles(repo, { year: 20.5 })).toThrow(InvalidQueryError);
    expect(() => listTitles(repo, { year: NaN })).toThrow(InvalidQueryError);
  });
});

describe("R10/R11/R12 hours and sort", () => {
  it("sort by hours is descending with 'no data' last, then title order", () => {
    const all = everything(undefined, "hours");
    const known = all.filter((t) => t.hoursViewed !== null);
    const rest = all.slice(known.length);
    expect(rest.every((t) => t.hoursViewed === null)).toBe(true);
    for (let i = 1; i < known.length; i++) expect(known[i - 1]!.hoursViewed!).toBeGreaterThanOrEqual(known[i]!.hoursViewed!);
    const names = rest.map((t) => t.title.toLowerCase());
    expect([...names].sort()).toEqual(names);
  });
  it("R12: 4,325 of 4,862 shows have hours, 537 do not", () => {
    expect(everything("show").filter((t) => t.hoursViewed === null)).toHaveLength(537);
    expect(everything("show").filter((t) => t.hoursViewed !== null)).toHaveLength(4325);
  });
  it("R11: hours come from SEMI_ANNUALLY rows only (Through My Window = 41.7 M h)", () => {
    const m = getMovie(repo, 177);
    expect(m.hoursViewed).toBe(41_700_000);
    expect(m.hoursLabel).toBe("41.7 M h");
  });
  it("R11: a movie only in the weekly top 10 has no hours, not 0", () => {
    const noHours = everything("movie").filter((t) => t.hoursViewed === null);
    expect(noHours.length).toBeGreaterThan(1000);
    expect(getMovie(repo, noHours[0]!.id).hoursViewed).toBeNull();
    expect(getMovie(repo, noHours[0]!.id).hoursLabel).toBeNull();
  });
  it("R12: a show's hours are the sum of its seasons' (Bridgerton)", () => {
    const s = getShow(repo, 2);
    expect(s.hoursViewed).toBe(s.seasons.reduce((a, x) => a + (x.hoursViewed ?? 0), 0));
    expect(s.hoursViewed).toBe(1_456_800_000);
    expect(everything("show").find((t) => t.id === 2)!.hoursViewed).toBe(s.hoursViewed);
  });
  it("list and detail agree on every movie's hours", () => {
    for (const t of everything("movie", "hours").slice(0, 25)) expect(getMovie(repo, t.id).hoursViewed).toBe(t.hoursViewed);
  });
});

describe("R14 weeks in the top 10 = max cumulative_weeks_in_top10", () => {
  it("is Netflix's own count, not the number of weekly rows", () => {
    expect(getMovie(repo, 177).weeksInTop10).toBe(18); // 5 weekly rows
    // Ids, because several movies are titled "Troll".
    expect(getMovie(repo, 11481).weeksInTop10).toBe(15); // Troll: 4 weekly rows
    expect(getMovie(repo, 11625).weeksInTop10).toBe(19); // Despicable Me 2: 10 weekly rows
  });
  it("is 0 for a movie that was never in the weekly top 10", () => {
    const t = everything("movie").find((x) => getMovie(repo, x.id).weeksInTop10 === 0);
    expect(t).toBeDefined();
  });
});

describe("R15/R16 detail", () => {
  it("movie detail fields", () => {
    expect(getMovie(repo, 177)).toMatchObject({ id: 177, title: "Through My Window", releaseYear: 2022, runtimeMinutes: 114, locale: null });
  });
  it("show detail: seasons ordered by season_number, hours per season", () => {
    const s = getShow(repo, 2);
    expect(s.seasons.slice(0, 3).map((x) => [x.seasonNumber, x.hoursViewed])).toEqual([
      [1, 374_300_000],
      [2, 348_700_000],
      [3, 733_800_000],
    ]);
    expect(s.seasons[0]!.hoursLabel).toBe("374.3 M h");
    const numbers = s.seasons.map((x) => x.seasonNumber);
    const firstNull = numbers.indexOf(null);
    expect(numbers.slice(firstNull).every((n) => n === null)).toBe(true); // unnumbered seasons last
  });
  it("unknown ids", () => {
    expect(() => getMovie(repo, 99_999_999)).toThrow(NotFoundError);
    expect(() => getShow(repo, 99_999_999)).toThrow(NotFoundError);
  });
});

describe("HTTP API", () => {
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

  it("the spec's acceptance criteria", async () => {
    const stats = await get("/api/stats");
    expect([stats.body.movies, stats.body.shows, stats.body.seasons]).toEqual([12214, 4862, 8874]);
    const love = await get("/api/titles?q=love&kind=movie");
    expect(love.status).toBe(200);
    expect(love.body.items.length).toBeGreaterThan(0);
    expect(love.body.items.every((t: any) => t.kind === "movie" && /love/i.test(t.title))).toBe(true);
  });
  it("list items carry a hours label, 'null' when no data", async () => {
    const r = await get("/api/titles?sort=hours");
    expect(r.body.items[0]).toMatchObject({ title: "Suits (2011)", hoursLabel: "1827.4 M h" });
    const last = await get("/api/titles?kind=show&sort=hours&page=" + Math.ceil(4862 / 20));
    expect(last.body.items.at(-1).hoursLabel).toBeNull();
  });
  it("bad input is a 400, unknown ids a 404, and the server keeps working", async () => {
    for (const p of ["page=0", "page=x", "kind=tv", "sort=random", "year=abc", "year=1.5"]) {
      expect((await get("/api/titles?" + p)).status, p).toBe(400);
    }
    expect((await get("/api/movies/abc")).status).toBe(400);
    expect((await get("/api/movies/-1")).status).toBe(400);
    expect((await get("/api/movies/99999999")).status).toBe(404);
    expect((await get("/api/shows/99999999")).status).toBe(404);
    expect((await get("/api/movies/177")).body).toMatchObject({ weeksInTop10: 18, hoursLabel: "41.7 M h" });
    expect((await get("/api/shows/2")).body.seasons.length).toBeGreaterThan(2);
  });
  it("a SQL-looking search is just text", async () => {
    const r = await get("/api/titles?q=" + encodeURIComponent("'; DROP TABLE movie; --"));
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(0);
    expect((await get("/api/stats")).body.movies).toBe(12214);
  });
  it("no BATCH_* data reaches any response", async () => {
    const bodies = JSON.stringify([await get("/api/stats"), await get("/api/titles"), await get("/api/movies/177"), await get("/api/shows/2")]);
    expect(bodies).not.toMatch(/batch/i);
  });
});
