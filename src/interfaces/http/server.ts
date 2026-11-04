import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { getStats } from "../../application/getStats.ts";
import { NotFoundError, getMovie, getShow } from "../../application/getTitleDetail.ts";
import { InvalidQueryError, listTitles } from "../../application/listTitles.ts";
import type { CatalogRepository } from "../../application/ports.ts";
import type { ReviewsService } from "../../application/reviews.ts";
import { ConflictError, ForbiddenError, ValidationError } from "../../domain/reviews.ts";

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

const MAX_BODY_BYTES = 32 * 1024;

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new ValidationError("The request is too large.");
    chunks.push(c as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ValidationError("The request body is not valid JSON.");
  }
}

/** Spec 02 routes. Returns false when the path is not one of them. */
async function reviewRoutes(reviews: ReviewsService, req: IncomingMessage, res: ServerResponse, path: string): Promise<boolean> {
  const uid = req.headers["x-user-id"];
  const who = Array.isArray(uid) ? uid.join(",") : uid;
  const m = req.method ?? "GET";
  let r: RegExpMatchArray | null;

  if (path === "/api/users") {
    if (m !== "GET") return json(res, 405, { error: "method not allowed" }), true;
    return json(res, 200, reviews.listUsers()), true;
  }
  if ((r = path.match(/^\/api\/titles\/([^/]+)\/([^/]+)\/reviews$/))) {
    if (m === "GET") return json(res, 200, reviews.list(who, r[1]!, r[2]!)), true;
    if (m === "POST") return json(res, 201, reviews.create(who, r[1]!, r[2]!, await readJson(req))), true;
    return json(res, 405, { error: "method not allowed" }), true;
  }
  if ((r = path.match(/^\/api\/reviews\/([^/]+)$/))) {
    if (m === "PATCH") return json(res, 200, reviews.edit(who, r[1]!, await readJson(req))), true;
    if (m === "DELETE") return reviews.remove(who, r[1]!), res.writeHead(204).end(), true;
    return json(res, 405, { error: "method not allowed" }), true;
  }
  if ((r = path.match(/^\/api\/reviews\/([^/]+)\/(hide|show)$/))) {
    if (m !== "POST") return json(res, 405, { error: "method not allowed" }), true;
    return json(res, 200, r[2] === "hide" ? reviews.hide(who, r[1]!) : reviews.show(who, r[1]!)), true;
  }
  return false;
}

export function createHttpServer(repo: CatalogRepository, staticDir: string, reviews?: ReviewsService): Server {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (reviews && url.pathname.startsWith("/api/")) {
        try {
          if (await reviewRoutes(reviews, req, res, url.pathname)) return;
        } catch (e) {
          if (e instanceof ValidationError) return json(res, 400, { error: e.message });
          if (e instanceof ForbiddenError) return json(res, 403, { error: e.message });
          if (e instanceof NotFoundError) return json(res, 404, { error: e.message });
          if (e instanceof ConflictError) return json(res, 409, { error: e.message });
          throw e;
        }
      }
      if (req.method !== "GET" && req.method !== "HEAD") return json(res, 405, { error: "method not allowed" });

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
