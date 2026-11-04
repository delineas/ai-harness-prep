// The web UI talks to the backend only through HTTP. It never imports from ../../src.
export interface TitleDto {
  id: number;
  kind: "movie" | "show";
  title: string;
  releaseYear: number | null;
  hoursViewed: number | null;
  hoursLabel: string | null;
}
export interface PageDto { items: TitleDto[]; page: number; pageSize: number; total: number }
export interface StatsDto { movies: number; shows: number; seasons: number; period: { from: string; to: string } | null }
export interface MovieDto {
  id: number;
  title: string;
  releaseYear: number | null;
  runtimeMinutes: number | null;
  locale: string | null;
  hoursLabel: string | null;
  weeksInTop10: number;
}
export interface SeasonDto { id: number; seasonNumber: number | null; title: string; hoursLabel: string | null }
export interface ShowDto { id: number; title: string; releaseYear: number | null; hoursLabel: string | null; seasons: SeasonDto[] }

export interface TitleFilters { q: string; kind: string; year: string; sort: string }

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return (await res.json()) as T;
}

export const fetchStats = () => get<StatsDto>("/api/stats");

export function fetchTitles(page: number, f: TitleFilters) {
  const p = new URLSearchParams({ page: String(page), sort: f.sort || "title" });
  if (f.q.trim()) p.set("q", f.q.trim());
  if (f.kind) p.set("kind", f.kind);
  if (f.year.trim()) p.set("year", f.year.trim());
  return get<PageDto>(`/api/titles?${p}`);
}

export const fetchMovie = (id: number) => get<MovieDto>(`/api/movies/${id}`);
export interface Top10PointDto { weekStart: string; weekEnd: string; rank: number }
export const fetchTop10History = (kind: "movie" | "show", id: number) => get<{ points: Top10PointDto[] }>(`/api/titles/${kind}/${id}/top10-history`);
export const fetchShow = (id: number) => get<ShowDto>(`/api/shows/${id}`);

// ---- Reviews (spec 02) ----
export interface UserDto { id: number; displayName: string; role: "user" | "moderator" }
export interface ReviewDto {
  id: number;
  authorId: number;
  authorName: string;
  rating: number;
  body: string;
  status: "visible" | "hidden";
  createdAt: number;
  can: { edit: boolean; hide: boolean; show: boolean; delete: boolean };
}

/** An API error with the plain-language message the server sent. */
export class ApiError extends Error {}

async function send<T>(method: string, path: string, userId: number | null, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (userId !== null) headers["x-user-id"] = String(userId);
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!res.ok) {
    let message = `Something went wrong (error ${res.status}).`;
    try {
      const data = (await res.json()) as { error?: string };
      if (typeof data.error === "string") message = data.error;
    } catch {
      /* keep the generic message */
    }
    throw new ApiError(message);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export const fetchUsers = () => send<UserDto[]>("GET", "/api/users", null);
export const fetchReviews = (kind: "movie" | "show", id: number, user: number | null) => send<ReviewDto[]>("GET", `/api/titles/${kind}/${id}/reviews`, user);
export const createReview = (kind: "movie" | "show", id: number, user: number | null, rating: number, body: string) =>
  send<ReviewDto>("POST", `/api/titles/${kind}/${id}/reviews`, user, { rating, body });
export const editReview = (id: number, user: number | null, rating: number, body: string) => send<ReviewDto>("PATCH", `/api/reviews/${id}`, user, { rating, body });
export const hideReview = (id: number, user: number | null) => send<ReviewDto>("POST", `/api/reviews/${id}/hide`, user);
export const showReview = (id: number, user: number | null) => send<ReviewDto>("POST", `/api/reviews/${id}/show`, user);
export const deleteReview = (id: number, user: number | null) => send<void>("DELETE", `/api/reviews/${id}`, user);
