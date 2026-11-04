import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type Server, type ServerResponse } from "node:http";
import { extname, join, normalize } from "node:path";
import type { Catalog, Kind, Sort } from "./catalog.ts";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
  ".svg": "image/svg+xml", ".json": "application/json",
};

const json = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
};

export function createApp(catalog: Catalog, staticDir = "dist"): Server {
  return createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    try {
      if (req.method !== "GET") return json(res, 405, { error: "read-only" });
      const path = url.pathname;

      if (path === "/api/stats") return json(res, 200, catalog.getStats());

      if (path === "/api/titles") {
        const p = url.searchParams;
        const kind = p.get("kind");
        const sort = p.get("sort") ?? "title";
        const year = p.get("year");
        const page = Number(p.get("page") ?? 1);
        if (kind && kind !== "movie" && kind !== "show") return json(res, 400, { error: "invalid kind" });
        if (sort !== "title" && sort !== "hours") return json(res, 400, { error: "invalid sort" });
        if (year && !/^\d{4}$/.test(year)) return json(res, 400, { error: "invalid year" });
        if (!Number.isInteger(page) || page < 1) return json(res, 400, { error: "invalid page" });
        return json(res, 200, catalog.listTitles({
          kind: (kind as Kind) || undefined,
          q: p.get("q")?.trim() || undefined,
          year: year ? Number(year) : undefined,
          sort: sort as Sort,
          page,
        }));
      }

      const m = path.match(/^\/api\/(movies|shows)\/(\d+)$/);
      if (m) {
        const id = Number(m[2]);
        const item = m[1] === "movies" ? catalog.getMovie(id) : catalog.getShow(id);
        return item ? json(res, 200, item) : json(res, 404, { error: "not found" });
      }
      if (path.startsWith("/api/")) return json(res, 404, { error: "not found" });

      // Static UI
      const rel = normalize(path === "/" ? "/index.html" : path).replace(/^(\.\.[/\\])+/, "");
      const file = join(staticDir, rel);
      if (!file.startsWith(staticDir) || !existsSync(file) || !statSync(file).isFile()) {
        res.writeHead(404).end("Not found");
        return;
      }
      res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
      createReadStream(file).pipe(res);
    } catch (e) {
      console.error(e);
      json(res, 500, { error: "internal error" });
    }
  });
}
