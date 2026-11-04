// The UI talks only to the HTTP API.
import { formatDate, formatHours } from "./format.ts";

interface TitleItem { kind: "movie" | "show"; id: number; title: string; release_date: number | null; hours: number }
interface TitlePage { page: number; pageSize: number; total: number; items: TitleItem[] }
interface Stats { movies: number; shows: number; seasons: number; periodStart: number; periodEnd: number }

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const form = $<HTMLFormElement>("search");
const grid = $("grid"), status = $("status"), detail = $("detail");
const prev = $<HTMLButtonElement>("prev"), next = $<HTMLButtonElement>("next"), pageInfo = $("page-info");

let page = 1;
let selected = "";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
async function api<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json() as Promise<T>;
}

async function loadStats() {
  try {
    const s = await api<Stats>("/api/stats");
    $("stats").textContent = `${s.movies.toLocaleString("en")} movies · ${s.shows.toLocaleString("en")} shows · ${s.seasons.toLocaleString("en")} seasons · data from ${formatDate(s.periodStart)} to ${formatDate(s.periodEnd)}`;
  } catch { $("stats").textContent = "Stats unavailable."; }
}

async function loadTitles() {
  const params = new URLSearchParams(new FormData(form) as unknown as Record<string, string>);
  for (const [k, v] of [...params]) if (!v) params.delete(k);
  params.set("page", String(page));
  status.textContent = "Loading…";
  try {
    const d = await api<TitlePage>(`/api/titles?${params}`);
    const pages = Math.max(1, Math.ceil(d.total / d.pageSize));
    grid.innerHTML = d.items.map((t) => `<li><button type="button" data-kind="${t.kind}" data-id="${t.id}" aria-pressed="${selected === `${t.kind}:${t.id}`}">
      <strong>${esc(t.title)}</strong>
      <span class="meta">${t.kind === "movie" ? "Movie" : "Show"} · ${t.release_date ? new Date(t.release_date).getUTCFullYear() : "n/a"} · ${formatHours(t.hours)}</span></button></li>`).join("");
    status.textContent = `${d.total.toLocaleString("en")} results`;
    pageInfo.textContent = `Page ${d.page} of ${pages}`;
    prev.disabled = d.page <= 1;
    next.disabled = d.page >= pages;
  } catch { status.textContent = "Could not load titles."; }
}

async function showDetail(kind: string, id: string) {
  selected = `${kind}:${id}`;
  grid.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.kind === kind && b.dataset.id === id)));
  try {
    if (kind === "movie") {
      const m = await api<any>(`/api/movies/${id}`);
      detail.innerHTML = `<h2>${esc(m.title)}</h2><dl>
        <dt>Released</dt><dd>${formatDate(m.release_date)}</dd>
        <dt>Runtime</dt><dd>${m.runtime ? `${esc(m.runtime)} min` : "—"}</dd>
        <dt>Hours viewed</dt><dd>${formatHours(m.hours)}</dd>
        <dt>Weeks in top 10</dt><dd>${esc(m.weeksInTop10)}</dd></dl>`;
    } else {
      const s = await api<any>(`/api/shows/${id}`);
      detail.innerHTML = `<h2>${esc(s.title)}</h2><dl>
        <dt>Released</dt><dd>${formatDate(s.release_date)}</dd>
        <dt>Hours viewed</dt><dd>${formatHours(s.hours)}</dd></dl>
        <table><caption class="meta">Seasons</caption><thead><tr><th scope="col">Season</th><th scope="col">Hours viewed</th></tr></thead><tbody>${
          s.seasons.map((x: any) => `<tr><td>${esc(x.title)}</td><td>${formatHours(x.hours)}</td></tr>`).join("")}</tbody></table>`;
    }
    detail.focus();
  } catch { detail.textContent = "Could not load detail."; }
}

form.addEventListener("submit", (e) => { e.preventDefault(); page = 1; void loadTitles(); });
prev.addEventListener("click", () => { page--; void loadTitles(); });
next.addEventListener("click", () => { page++; void loadTitles(); });
grid.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-id]");
  if (b) void showDetail(b.dataset.kind!, b.dataset.id!);
});

void loadStats();
void loadTitles();
