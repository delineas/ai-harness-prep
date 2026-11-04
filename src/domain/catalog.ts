export type TitleKind = "movie" | "show";

export interface Title {
  readonly id: number;
  readonly kind: TitleKind;
  readonly title: string;
  readonly releaseYear: number | null;
}

export interface Page<T> {
  readonly items: readonly T[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

/** Dates are ISO calendar dates (YYYY-MM-DD). */
export interface DataPeriod {
  readonly from: string;
  readonly to: string;
}

export interface CatalogStats {
  readonly movies: number;
  readonly shows: number;
  readonly seasons: number;
  readonly period: DataPeriod | null;
}
