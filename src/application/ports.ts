import type { CatalogStats, Title } from "../domain/catalog.ts";

export interface CatalogRepository {
  stats(): CatalogStats;
  /** Movies and shows merged in the default order (see docs/decisions.md). */
  listTitles(offset: number, limit: number): { items: Title[]; total: number };
}
