import { createServer, type Server, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { getStats } from "../../application/getStats.ts";
import { NotFoundError, getMovie, getShow } from "../../application/getTitleDetail.ts";
import { InvalidQueryError, listTitles } from "../../application/listTitles.ts";
import type { CatalogRepository } from "../../application/ports.ts";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
};

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

export function createHttpServer(repo: CatalogRepository, staticDir: string): Server {
  return createServer(async (req, res) => {
    try {
      if (req.method !== "GET" && req.method !== "HEAD") return json(res, 405, { error: "method not allowed" });
      const url = new URL(req.url ?? "/", "http://localhost");

      if (url.pathname === "/api/stats") return json(res, 200, getStats(repo));
      try {
        if (url.pathname === "/api/titles") {
          const q = url.searchParams;
          const opt = (k: string) => q.get(k) ?? undefined;
          const optNum = (k: string) => (q.has(k) ? Number(q.get(k)) : undefined);
          return json(res, 200, listTitles(repo, { page: optNum("page"), kind: opt("kind"), text: opt("q"), year: optNum("year"), sort: opt("sort") }));
        }
        const detail = url.pathname.match(/^\/api\/(movies|shows)\/([^/]+)$/);
        if (detail) {
          if (!/^\d+$/.test(detail[2]!)) return json(res, 400, { error: "id must be a positive integer" });
          const id = Number(detail[2]);
          return json(res, 200, detail[1] === "movies" ? getMovie(repo, id) : getShow(repo, id));
        }
      } catch (e) {
        if (e instanceof InvalidQueryError) return json(res, 400, { error: e.message });
        if (e instanceof NotFoundError) return json(res, 404, { error: e.message });
        throw e;
      }
      if (url.pathname.startsWith("/api/")) return json(res, 404, { error: "not found" });

      const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "");
      if (rel.split(/[/\\]/).includes("..")) return json(res, 400, { error: "bad path" });
      const file = join(staticDir, rel === "" ? "index.html" : rel);
      try {
        const data = await readFile(file);
        res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
        res.end(data);
      } catch {
        json(res, 404, { error: "not found" });
      }
    } catch {
      if (!res.headersSent) json(res, 400, { error: "bad request" });
      else res.end();
    }
  });
}
