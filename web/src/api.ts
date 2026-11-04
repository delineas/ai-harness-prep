// The web UI talks to the backend only through HTTP. It never imports from ../../src.
export interface TitleDto { id: number; kind: "movie" | "show"; title: string; releaseYear: number | null }
export interface PageDto { items: TitleDto[]; page: number; pageSize: number; total: number }
export interface StatsDto { movies: number; shows: number; seasons: number; period: { from: string; to: string } | null }

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return (await res.json()) as T;
}

export const fetchStats = () => get<StatsDto>("/api/stats");
export const fetchTitles = (page: number) => get<PageDto>(`/api/titles?page=${page}`);
