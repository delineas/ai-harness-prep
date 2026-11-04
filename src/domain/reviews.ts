import type { TitleKind } from "./catalog.ts";

export type Role = "user" | "moderator";
export type ReviewStatus = "visible" | "hidden";

/** R26: there is deliberately no email here. */
export interface User {
  readonly id: number;
  readonly displayName: string;
  readonly role: Role;
}

export interface Review {
  readonly id: number;
  readonly userId: number;
  readonly authorName: string;
  readonly titleKind: TitleKind;
  readonly titleId: number;
  readonly rating: number;
  readonly body: string;
  readonly status: ReviewStatus;
  readonly createdAt: number;
}

/** Who is asking: a user, or null for anonymous (R20). */
export type Viewer = User | null;

export class ValidationError extends Error {}
export class ForbiddenError extends Error {}
export class ConflictError extends Error {}

export const MAX_BODY = 2000;

/** R24 */
export function validateRating(v: unknown): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > 5) {
    throw new ValidationError("The rating must be a whole number from 1 to 5.");
  }
  return v;
}

/** R24: counted in code points. */
export function validateBody(v: unknown): string {
  if (typeof v !== "string") throw new ValidationError("The review text must be text.");
  if ([...v].length > MAX_BODY) throw new ValidationError(`The review text can have at most ${MAX_BODY} characters.`);
  return v;
}

const isModerator = (v: Viewer) => v?.role === "moderator";

/** R21 */
export function canSee(v: Viewer, r: Review): boolean {
  return r.status === "visible" || isModerator(v) || (v !== null && v.id === r.userId);
}
export const canWrite = (v: Viewer): boolean => v !== null;
export const canEdit = (v: Viewer, r: Review): boolean => v !== null && v.id === r.userId;
/** R21/R22 */
export const canModerate = (v: Viewer): boolean => isModerator(v);
