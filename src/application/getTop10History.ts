import type { Top10Point } from "../domain/catalog.ts";
import { NotFoundError } from "./getTitleDetail.ts";
import { InvalidQueryError } from "./listTitles.ts";
import type { CatalogRepository } from "./ports.ts";

/** R31: kind is movie|show, id a positive integer, a missing title is a 404. */
export function getTop10History(repo: CatalogRepository, kind: string, rawId: string): { points: Top10Point[] } {
  if (kind !== "movie" && kind !== "show") throw new InvalidQueryError("kind must be movie or show");
  if (!/^\d+$/.test(rawId) || Number(rawId) < 1) throw new InvalidQueryError("id must be a positive integer");
  const points = repo.top10History(kind, Number(rawId));
  if (!points) throw new NotFoundError(`${kind} not found`);
  return { points };
}
