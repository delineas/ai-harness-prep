import type { AddressInfo } from "node:net";
import { DatabaseSync } from "node:sqlite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { openCatalog } from "./catalog.ts";

const server = createApp(openCatalog(), "dist");
let base = "";
beforeAll(() => new Promise<void>((r) => server.listen(0, () => { base = `http://localhost:${(server.address() as AddressInfo).port}`; r(); })));
afterAll(() => { server.close(); });
const get = (p: string) => fetch(base + p).then((r) => r.json() as Promise<any>);

describe("catalog API", () => {
  it("stats", async () => {
    const s = await get("/api/stats");
    expect([s.movies, s.shows, s.seasons]).toEqual([12214, 4862, 8874]);
  });
  it("search 'love' in movies returns only matching movies", async () => {
    const d = await get("/api/titles?q=love&kind=movie");
    expect(d.items.length).toBe(20);
    for (const t of d.items) { expect(t.kind).toBe("movie"); expect(t.title.toLowerCase()).toContain("love"); }
  });
  it("sorts by hours desc", async () => {
    const d = await get("/api/titles?sort=hours");
    expect(d.items[0].hours).toBeGreaterThanOrEqual(d.items[1].hours);
  });
  it("show detail lists seasons", async () => {
    const t = await get("/api/titles?kind=show&sort=hours");
    const s = await get(`/api/shows/${t.items[0].id}`);
    expect(s.seasons.length).toBeGreaterThan(0);
  });
  it("rejects bad input and writes", async () => {
    expect((await fetch(`${base}/api/titles?kind=x`)).status).toBe(400);
    expect((await fetch(`${base}/api/stats`, { method: "POST" })).status).toBe(405);
    expect((await fetch(`${base}/api/movies/999999`)).status).toBe(404);
  });
  it("never exposes BATCH_* data", async () => {
    const txt = JSON.stringify([await get("/api/stats"), await get("/api/titles")]);
    expect(txt).not.toMatch(/BATCH_/i);
  });
  it("catalog connection is read-only", () => {
    expect(() => new DatabaseSync("data/catalog.db", { readOnly: true }).exec("DELETE FROM movie")).toThrow();
  });
});
