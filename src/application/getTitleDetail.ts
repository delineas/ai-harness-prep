import type { MovieDetail, SeasonDetail, ShowDetail } from "../domain/catalog.ts";
import { withLabel } from "./listTitles.ts";
import type { CatalogRepository } from "./ports.ts";

export class NotFoundError extends Error {}

export function getMovie(repo: CatalogRepository, id: number) {
  const m: MovieDetail | null = repo.movie(id);
  if (!m) throw new NotFoundError("movie not found");
  return withLabel(m);
}

export function getShow(repo: CatalogRepository, id: number) {
  const s: ShowDetail | null = repo.show(id);
  if (!s) throw new NotFoundError("show not found");
  return { ...withLabel(s), seasons: s.seasons.map((x: SeasonDetail) => withLabel(x)) };
}
