import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createReviewsService } from "../src/application/reviews.ts";
import { APP_MIGRATIONS } from "../src/infrastructure/sqlite/appMigrations.ts";
import { openAppDb, openCatalog } from "../src/infrastructure/sqlite/openCatalog.ts";
import { sqliteCatalogRepository } from "../src/infrastructure/sqlite/sqliteCatalogRepository.ts";
import { sqliteReviewRepository } from "../src/infrastructure/sqlite/sqliteReviewRepository.ts";
import { createHttpServer } from "../src/interfaces/http/server.ts";

// Seeded users (R19): 1 Ana, 2 Ben, 3 Carla = user; 4 María = moderator.
const ANA = "1", BEN = "2", MOD = "4";

const tmp = mkdtempSync(join(tmpdir(), "reviews-test-"));
copyFileSync(resolve(import.meta.dirname, "../data/catalog.db"), join(tmp, "catalog.db"));
const catalog = sqliteCatalogRepository(openCatalog(join(tmp, "catalog.db")));
let server: Server;
let base = "";
let appDb: ReturnType<typeof openAppDb>;

beforeAll(async () => {
  appDb = openAppDb(join(tmp, "app.db"), APP_MIGRATIONS);
  server = createHttpServer(catalog, tmp, createReviewsService(catalog, sqliteReviewRepository(appDb)));
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
});
afterAll(() => {
  server.close();
  appDb.close();
  rmSync(tmp, { recursive: true, force: true });
});
beforeEach(() => void appDb.exec("DELETE FROM reviews"));

const movie = catalog.listTitles({ kind: "movie", sort: "title" }, 0, 1).items[0]!;
const MOVIE = `/api/titles/movie/${movie.id}/reviews`;

async function call(method: string, path: string, user?: string, body?: unknown) {
  const res = await fetch(base + path, {
    method,
    headers: { ...(user ? { "x-user-id": user } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, text, json: text ? JSON.parse(text) : null };
}
const write = (user: string | undefined, rating = 4, body = "ok", path = MOVIE) => call("POST", path, user, { rating, body });
const ids = async (user?: string) => (await call("GET", MOVIE, user)).json.map((r: { id: number }) => r.id);

describe("permission table — one allowed and one denied case per row", () => {
  it("read visible reviews: anonymous yes", async () => {
    await write(ANA);
    expect((await call("GET", MOVIE)).json).toHaveLength(1);
  });
  it("read visible reviews: user and moderator yes", async () => {
    await write(ANA);
    for (const u of [BEN, MOD]) expect((await call("GET", MOVIE, u)).json).toHaveLength(1);
  });

  it("write: user allowed (201), anonymous denied (403)", async () => {
    expect((await write(ANA)).status).toBe(201);
    expect((await write(undefined)).status).toBe(403);
  });
  it("write: moderator allowed; a second one for the same title is a 409 (one per title)", async () => {
    expect((await write(MOD)).status).toBe(201);
    expect((await write(MOD)).status).toBe(409);
    expect((await write(ANA)).status).toBe(201);
    expect((await write(ANA)).status).toBe(409);
  });

  it("edit own: user and moderator allowed; anonymous denied", async () => {
    const mine = (await write(ANA)).json.id;
    expect((await call("PATCH", `/api/reviews/${mine}`, ANA, { rating: 2, body: "changed" })).json).toMatchObject({ rating: 2, body: "changed" });
    const mod = (await write(MOD)).json.id;
    expect((await call("PATCH", `/api/reviews/${mod}`, MOD, { rating: 1 })).status).toBe(200);
    expect((await call("PATCH", `/api/reviews/${mine}`, undefined, { rating: 1 })).status).toBe(403);
  });
  it("edit someone else's: denied to a user and to a moderator", async () => {
    const id = (await write(ANA)).json.id;
    expect((await call("PATCH", `/api/reviews/${id}`, BEN, { rating: 1 })).status).toBe(403);
    expect((await call("PATCH", `/api/reviews/${id}`, MOD, { rating: 1 })).status).toBe(403);
  });

  it("hide: moderator allowed, user and anonymous denied", async () => {
    const id = (await write(ANA)).json.id;
    expect((await call("POST", `/api/reviews/${id}/hide`, ANA)).status).toBe(403);
    expect((await call("POST", `/api/reviews/${id}/hide`)).status).toBe(403);
    expect((await call("POST", `/api/reviews/${id}/hide`, MOD)).json.status).toBe("hidden");
  });
  it("delete: moderator allowed (204, gone), user (even the author) and anonymous denied", async () => {
    const id = (await write(ANA)).json.id;
    expect((await call("DELETE", `/api/reviews/${id}`, ANA)).status).toBe(403);
    expect((await call("DELETE", `/api/reviews/${id}`)).status).toBe(403);
    expect((await call("DELETE", `/api/reviews/${id}`, MOD)).status).toBe(204);
    expect(await ids(MOD)).toEqual([]);
    expect((await call("DELETE", `/api/reviews/${id}`, MOD)).status).toBe(404);
  });

  it("hidden reviews: anonymous no, other user no, author yes, moderator yes", async () => {
    const id = (await write(ANA)).json.id;
    await call("POST", `/api/reviews/${id}/hide`, MOD);
    expect(await ids()).toEqual([]);
    expect(await ids(BEN)).toEqual([]);
    expect(await ids(ANA)).toEqual([id]);
    expect(await ids(MOD)).toEqual([id]);
    // for those who cannot see it, it does not exist
    expect((await call("PATCH", `/api/reviews/${id}`, BEN, { rating: 1 })).status).toBe(404);
  });
  it("hide is reversible by a moderator only (R22) and the author may edit a hidden review", async () => {
    const id = (await write(ANA)).json.id;
    await call("POST", `/api/reviews/${id}/hide`, MOD);
    expect((await call("PATCH", `/api/reviews/${id}`, ANA, { body: "still mine" })).json).toMatchObject({ status: "hidden", body: "still mine" });
    expect((await call("POST", `/api/reviews/${id}/show`, ANA)).status).toBe(403);
    expect((await call("POST", `/api/reviews/${id}/show`, MOD)).json.status).toBe("visible");
    expect(await ids()).toEqual([id]);
  });
});

describe("domain rules", () => {
  it("rating 0 or 6 (or non-integer) is a 400 with a plain-language message; 1 and 5 are fine", async () => {
    for (const bad of [0, 6, 3.5, -1, "4", null]) {
      const r = await call("POST", MOVIE, ANA, { rating: bad, body: "x" });
      expect(r.status, String(bad)).toBe(400);
      expect(r.json.error).toMatch(/1 to 5/);
    }
    expect((await write(ANA, 1)).status).toBe(201);
    expect((await write(BEN, 5)).status).toBe(201);
    const id = (await write(MOD)).json.id;
    expect((await call("PATCH", `/api/reviews/${id}`, MOD, { rating: 6 })).status).toBe(400);
  });
  it("text of 2000 characters is accepted, 2001 is a 400", async () => {
    expect((await write(ANA, 3, "é".repeat(2000))).status).toBe(201);
    expect((await write(BEN, 3, "x".repeat(2001))).status).toBe(400);
    expect((await write(MOD, 3, "")).status).toBe(201);
  });
  it("a title missing from the catalog cannot be reviewed (404); bad kind or id is a 400", async () => {
    expect((await write(ANA, 4, "x", "/api/titles/movie/99999999/reviews")).status).toBe(404);
    expect((await write(ANA, 4, "x", "/api/titles/show/99999999/reviews")).status).toBe(404);
    expect((await write(ANA, 4, "x", "/api/titles/film/1/reviews")).status).toBe(400);
    expect((await write(ANA, 4, "x", "/api/titles/movie/abc/reviews")).status).toBe(400);
  });
  it("shows can be reviewed too", async () => {
    const show = catalog.listTitles({ kind: "show", sort: "title" }, 0, 1).items[0]!;
    expect((await write(ANA, 4, "x", `/api/titles/show/${show.id}/reviews`)).status).toBe(201);
  });
  it("identity: malformed header 400, unknown user 403 (not anonymous)", async () => {
    expect((await call("GET", MOVIE, "abc")).status).toBe(400);
    expect((await call("GET", MOVIE, "999")).status).toBe(403);
  });
  it("bad JSON is a 400", async () => {
    const res = await fetch(base + MOVIE, { method: "POST", headers: { "x-user-id": ANA }, body: "{nope" });
    expect(res.status).toBe(400);
  });
  it("the backend tells the UI what each viewer can do", async () => {
    const id = (await write(ANA)).json.id;
    const can = async (u?: string) => (await call("GET", MOVIE, u)).json.find((r: { id: number }) => r.id === id).can;
    expect(await can(ANA)).toEqual({ edit: true, hide: false, show: false, delete: false });
    expect(await can(BEN)).toEqual({ edit: false, hide: false, show: false, delete: false });
    expect(await can(MOD)).toEqual({ edit: false, hide: true, show: false, delete: true });
  });
});

describe("privacy and text (R26)", () => {
  it("no response contains an email field or an email address", async () => {
    const id = (await write(ANA)).json.id;
    await call("POST", `/api/reviews/${id}/hide`, MOD);
    const responses = [
      await call("GET", "/api/users"),
      await call("GET", MOVIE, MOD),
      await call("GET", MOVIE, ANA),
      await call("PATCH", `/api/reviews/${id}`, ANA, { rating: 3 }),
      await write(BEN),
    ];
    for (const r of responses) {
      expect(r.text).not.toMatch(/email/i);
      expect(r.text).not.toMatch(/@example\.test/);
    }
    expect((await call("GET", "/api/users")).json[0]).toEqual({ id: 1, displayName: "Ana", role: "user" });
  });
  it("review text is stored and returned literally (the UI renders it as text)", async () => {
    const evil = '<img src=x onerror="alert(1)">';
    expect((await write(ANA, 5, evil)).json.body).toBe(evil);
    expect((await call("GET", MOVIE)).json[0].body).toBe(evil);
  });
});

describe("migrations", () => {
  it("are idempotent: reopening applies nothing twice", () => {
    const p = join(tmp, "again.db");
    openAppDb(p, APP_MIGRATIONS).close();
    const db = openAppDb(p, APP_MIGRATIONS);
    expect(db.prepare("SELECT count(*) AS n FROM users").get()).toEqual({ n: 4 });
    expect(db.prepare("PRAGMA user_version").get()).toEqual({ user_version: APP_MIGRATIONS.length });
    db.close();
  });
});
