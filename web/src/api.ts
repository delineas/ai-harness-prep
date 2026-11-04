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
export const fetchShow = (id: number) => get<ShowDto>(`/api/shows/${id}`);
