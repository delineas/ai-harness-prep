export type TitleKind = "movie" | "show";
export type TitleSort = "title" | "hours";

export interface Title {
  readonly id: number;
  readonly kind: TitleKind;
  readonly title: string;
  /** R9: null = "year unknown". */
  readonly releaseYear: number | null;
  /** R11/R12: null = no data (never 0). */
  readonly hoursViewed: number | null;
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

export interface MovieDetail {
  readonly id: number;
  readonly title: string;
  readonly releaseYear: number | null;
  readonly runtimeMinutes: number | null;
  readonly locale: string | null;
  readonly hoursViewed: number | null;
  /** R14: max cumulative_weeks_in_top10 over WEEKLY rows; 0 if none. */
  readonly weeksInTop10: number;
}

export interface SeasonDetail {
  readonly id: number;
  readonly seasonNumber: number | null;
  readonly title: string;
  readonly hoursViewed: number | null;
}

export interface ShowDetail {
  readonly id: number;
  readonly title: string;
  readonly releaseYear: number | null;
  readonly hoursViewed: number | null;
  readonly seasons: readonly SeasonDetail[];
}

/** R13: one decimal; `382.2 M h`, `12.3 k h`, `950 h`. */
export function formatHours(h: number): string {
  if (h >= 999_950) return `${(h / 1_000_000).toFixed(1)} M h`; // 999.95 k would print as "1000.0 k"
  if (h >= 1_000) return `${(h / 1_000).toFixed(1)} k h`;
  return `${Math.round(h)} h`;
}

/** R12: a show's hours are the sum of its seasons' hours; no season hours means no hours. */
export function sumHours(parts: readonly (number | null)[]): number | null {
  const known = parts.filter((p): p is number => p !== null);
  return known.length === 0 ? null : known.reduce((a, b) => a + b, 0);
}

/** R28–R31: one point per week in the weekly top 10. Dates are ISO calendar dates (UTC). */
export interface Top10Point {
  readonly weekStart: string;
  readonly weekEnd: string;
  /** 1 = best. For a show, the best rank among its seasons that week (R29). */
  readonly rank: number;
}
