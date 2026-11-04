import type { CatalogStats } from "../domain/catalog.ts";
import type { CatalogRepository } from "./ports.ts";

export function getStats(repo: CatalogRepository): CatalogStats {
  return repo.stats();
}
