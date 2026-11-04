import type { TitleKind } from "../domain/catalog.ts";
import {
  ForbiddenError,
  ValidationError,
  canEdit,
  canModerate,
  canSee,
  canWrite,
  validateBody,
  validateRating,
  type Review,
  type ReviewStatus,
  type User,
  type Viewer,
} from "../domain/reviews.ts";
import { NotFoundError } from "./getTitleDetail.ts";
import type { CatalogRepository, ReviewRepository } from "./ports.ts";

/** What the API shows of a review (R26: no email, only the display name). */
export interface ReviewView {
  readonly id: number;
  readonly authorId: number;
  readonly authorName: string;
  readonly rating: number;
  readonly body: string;
  readonly status: ReviewStatus;
  readonly createdAt: number;
  readonly can: { readonly edit: boolean; readonly hide: boolean; readonly show: boolean; readonly delete: boolean };
}

export interface UserView {
  readonly id: number;
  readonly displayName: string;
  readonly role: string;
}

export interface ReviewsService {
  listUsers(): UserView[];
  list(header: string | undefined, kind: string, id: string): ReviewView[];
  create(header: string | undefined, kind: string, id: string, input: unknown): ReviewView;
  edit(header: string | undefined, reviewId: string, input: unknown): ReviewView;
  hide(header: string | undefined, reviewId: string): ReviewView;
  show(header: string | undefined, reviewId: string): ReviewView;
  remove(header: string | undefined, reviewId: string): void;
}

const posInt = (s: string, what: string): number => {
  if (!/^\d+$/.test(s) || Number(s) < 1 || !Number.isSafeInteger(Number(s))) throw new ValidationError(`${what} must be a positive whole number.`);
  return Number(s);
};

export function createReviewsService(catalog: CatalogRepository, repo: ReviewRepository, now: () => number = Date.now): ReviewsService {
  /** R20 */
  function viewerOf(header: string | undefined): Viewer {
    if (header === undefined) return null;
    const id = posInt(header.trim(), "X-User-Id");
    const u = repo.user(id);
    if (!u) throw new ForbiddenError("That user does not exist.");
    return u;
  }

  /** R25 */
  function title(kind: string, id: string): { kind: TitleKind; id: number } {
    if (kind !== "movie" && kind !== "show") throw new ValidationError("The kind must be movie or show.");
    const n = posInt(id, "The title id");
    const found = kind === "movie" ? catalog.movie(n) : catalog.show(n);
    if (!found) throw new NotFoundError(`That ${kind} is not in the catalog.`);
    return { kind, id: n };
  }

  const view = (v: Viewer, r: Review): ReviewView => ({
    id: r.id,
    authorId: r.userId,
    authorName: r.authorName,
    rating: r.rating,
    body: r.body,
    status: r.status,
    createdAt: r.createdAt,
    can: {
      edit: canEdit(v, r),
      hide: canModerate(v) && r.status === "visible",
      show: canModerate(v) && r.status === "hidden",
      delete: canModerate(v),
    },
  });

  /** R21: a review the viewer may not see does not exist for them. */
  function find(v: Viewer, reviewId: string): Review {
    const r = repo.review(posInt(reviewId, "The review id"));
    if (!r || !canSee(v, r)) throw new NotFoundError("That review does not exist.");
    return r;
  }

  function fields(input: unknown): Record<string, unknown> {
    if (typeof input !== "object" || input === null || Array.isArray(input)) throw new ValidationError("Send a JSON object.");
    return input as Record<string, unknown>;
  }

  return {
    listUsers: () => repo.users().map((u: User) => ({ id: u.id, displayName: u.displayName, role: u.role })),

    list(header, kind, id) {
      const v = viewerOf(header);
      const t = title(kind, id);
      return repo.reviewsFor(t.kind, t.id).filter((r) => canSee(v, r)).map((r) => view(v, r));
    },

    create(header, kind, id, input) {
      const v = viewerOf(header);
      const t = title(kind, id);
      if (!canWrite(v)) throw new ForbiddenError("Choose a user to write a review.");
      const f = fields(input);
      const rating = validateRating(f.rating);
      const body = validateBody(f.body ?? "");
      return view(v, repo.insert({ userId: v!.id, titleKind: t.kind, titleId: t.id, rating, body, createdAt: now() }));
    },

    edit(header, reviewId, input) {
      const v = viewerOf(header);
      if (!canWrite(v)) throw new ForbiddenError("Choose a user to edit a review.");
      const r = find(v, reviewId);
      if (!canEdit(v, r)) throw new ForbiddenError("You can only edit your own review.");
      const f = fields(input);
      if (!("rating" in f) && !("body" in f)) throw new ValidationError("Send a rating, a text, or both.");
      const change: { rating?: number; body?: string } = {};
      if ("rating" in f) change.rating = validateRating(f.rating);
      if ("body" in f) change.body = validateBody(f.body);
      return view(v, repo.update(r.id, change));
    },

    hide(header, reviewId) {
      const v = viewerOf(header);
      if (!canModerate(v)) throw new ForbiddenError("Only a moderator can hide a review.");
      return view(v, repo.setStatus(find(v, reviewId).id, "hidden"));
    },

    show(header, reviewId) {
      const v = viewerOf(header);
      if (!canModerate(v)) throw new ForbiddenError("Only a moderator can show a hidden review.");
      return view(v, repo.setStatus(find(v, reviewId).id, "visible"));
    },

    remove(header, reviewId) {
      const v = viewerOf(header);
      if (!canModerate(v)) throw new ForbiddenError("Only a moderator can delete a review.");
      repo.remove(find(v, reviewId).id);
    },
  };
}
