import { createServer, type Server, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { getStats } from "../../application/getStats.ts";
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
      if (url.pathname === "/api/titles") {
        const raw = url.searchParams.get("page");
        try {
          return json(res, 200, listTitles(repo, { page: raw === null ? undefined : Number(raw) }));
        } catch (e) {
          if (e instanceof InvalidQueryError) return json(res, 400, { error: e.message });
          throw e;
        }
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
