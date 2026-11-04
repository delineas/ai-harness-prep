import type { DatabaseSync } from "node:sqlite";
import type { NewReview, ReviewRepository } from "../../application/ports.ts";
import { ConflictError, type Review, type ReviewStatus, type Role, type User } from "../../domain/reviews.ts";
import type { TitleKind } from "../../domain/catalog.ts";

type Row = Record<string, unknown>;

const toUser = (r: Row): User => ({ id: Number(r.id), displayName: String(r.display_name), role: r.role as Role });
const toReview = (r: Row): Review => ({
  id: Number(r.id),
  userId: Number(r.user_id),
  authorName: String(r.display_name),
  titleKind: r.title_kind as TitleKind,
  titleId: Number(r.title_id),
  rating: Number(r.rating),
  body: String(r.body),
  status: r.status as ReviewStatus,
  createdAt: Number(r.created_at),
});

// The email column is never selected (R26).
const REVIEW = `SELECT r.*, u.display_name FROM reviews r JOIN users u ON u.id = r.user_id`;

export function sqliteReviewRepository(db: DatabaseSync): ReviewRepository {
  const one = (id: number): Review => toReview(db.prepare(`${REVIEW} WHERE r.id = ?`).get(id) as Row);
  return {
    users: () => (db.prepare("SELECT id, display_name, role FROM users ORDER BY id").all() as Row[]).map(toUser),
    user(id) {
      const r = db.prepare("SELECT id, display_name, role FROM users WHERE id = ?").get(id) as Row | undefined;
      return r ? toUser(r) : null;
    },
    reviewsFor: (kind, titleId) =>
      (db.prepare(`${REVIEW} WHERE r.title_kind = ? AND r.title_id = ? ORDER BY r.created_at DESC, r.id DESC`).all(kind, titleId) as Row[]).map(toReview),
    review(id) {
      const r = db.prepare(`${REVIEW} WHERE r.id = ?`).get(id) as Row | undefined;
      return r ? toReview(r) : null;
    },
    insert(n: NewReview) {
      try {
        const res = db
          .prepare("INSERT INTO reviews (user_id, title_kind, title_id, rating, body, created_at) VALUES (?, ?, ?, ?, ?, ?)")
          .run(n.userId, n.titleKind, n.titleId, n.rating, n.body, n.createdAt);
        return one(Number(res.lastInsertRowid));
      } catch (e) {
        if (e instanceof Error && /UNIQUE/.test(e.message)) throw new ConflictError("You already reviewed this title. Edit your review instead.");
        throw e;
      }
    },
    update(id, f) {
      if (f.rating !== undefined) db.prepare("UPDATE reviews SET rating = ? WHERE id = ?").run(f.rating, id);
      if (f.body !== undefined) db.prepare("UPDATE reviews SET body = ? WHERE id = ?").run(f.body, id);
      return one(id);
    },
    setStatus(id, status) {
      db.prepare("UPDATE reviews SET status = ? WHERE id = ?").run(status, id);
      return one(id);
    },
    remove(id) {
      db.prepare("DELETE FROM reviews WHERE id = ?").run(id);
    },
  };
}
