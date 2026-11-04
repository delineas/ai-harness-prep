import type { CatalogStats, MovieDetail, ShowDetail, Title, TitleKind, TitleSort } from "../domain/catalog.ts";

export interface TitleQuery {
  readonly kind?: TitleKind;
  /** Already trimmed; matched literally as a case-insensitive substring (R8). */
  readonly text?: string;
  readonly year?: number;
  readonly sort: TitleSort;
}

export interface CatalogRepository {
  stats(): CatalogStats;
  /** Movies and shows merged, filtered and sorted per docs/decisions.md (R5–R10). */
  listTitles(query: TitleQuery, offset: number, limit: number): { items: Title[]; total: number };
  movie(id: number): MovieDetail | null;
  show(id: number): ShowDetail | null;
}
