import type { CatalogStats, MovieDetail, ShowDetail, Title, TitleKind, TitleSort, Top10Point } from "../domain/catalog.ts";
import type { Review, ReviewStatus, User } from "../domain/reviews.ts";

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
  /** R28–R31: weekly top 10 ranks in ascending week order; null when the title does not exist. */
  top10History(kind: TitleKind, id: number): Top10Point[] | null;
}

// ---- Spec 02 ----

export interface NewReview {
  readonly userId: number;
  readonly titleKind: TitleKind;
  readonly titleId: number;
  readonly rating: number;
  readonly body: string;
  readonly createdAt: number;
}

export interface ReviewRepository {
  users(): User[];
  user(id: number): User | null;
  /** Every review of the title, hidden ones included; the use case filters (R21). */
  reviewsFor(kind: TitleKind, titleId: number): Review[];
  review(id: number): Review | null;
  /** Throws ConflictError when the user already reviewed the title (R23). */
  insert(r: NewReview): Review;
  update(id: number, fields: { rating?: number; body?: string }): Review;
  setStatus(id: number, status: ReviewStatus): Review;
  remove(id: number): void;
}
