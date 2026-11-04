import { fetchStats, fetchTitles, type StatsDto } from "./api.ts";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const fmt = new Intl.NumberFormat("en-US");

function renderStats(s: StatsDto) {
  const items: [string, string][] = [
    ["Movies", fmt.format(s.movies)],
    ["Shows", fmt.format(s.shows)],
    ["Seasons", fmt.format(s.seasons)],
    ["Period", s.period ? `${s.period.from} – ${s.period.to}` : "n/a"],
  ];
  const root = $("stats");
  root.replaceChildren(
    ...items.map(([label, value]) => {
      const div = document.createElement("div");
      const dt = document.createElement("dt");
      dt.textContent = label;
      const dd = document.createElement("dd");
      dd.textContent = value;
      dd.dataset.stat = label.toLowerCase();
      div.append(dt, dd);
      return div;
    }),
  );
  root.setAttribute("aria-busy", "false");
}

let page = 1;
let lastPage = 1;

async function loadPage(n: number) {
  const status = $("status");
  status.textContent = "Loading…";
  try {
    const data = await fetchTitles(n);
    page = data.page;
    lastPage = Math.max(1, Math.ceil(data.total / data.pageSize));
    $("titles").replaceChildren(
      ...data.items.map((t) => {
        const li = document.createElement("li");
        li.className = "card";
        const name = document.createElement("span");
        name.className = "name";
        name.textContent = t.title;
        const meta = document.createElement("span");
        meta.className = "meta";
        meta.textContent = `${t.kind === "movie" ? "Movie" : "Show"} · ${t.releaseYear ?? "year unknown"}`;
        li.append(name, meta);
        return li;
      }),
    );
    $("page-info").textContent = `Page ${fmt.format(page)} of ${fmt.format(lastPage)} (${fmt.format(data.total)} titles)`;
    ($("prev") as HTMLButtonElement).disabled = page <= 1;
    ($("next") as HTMLButtonElement).disabled = page >= lastPage;
    status.textContent = "";
  } catch {
    status.textContent = "Could not load titles.";
  }
}

$("prev").addEventListener("click", () => void loadPage(page - 1));
$("next").addEventListener("click", () => void loadPage(page + 1));

fetchStats().then(renderStats, () => {
  $("stats").textContent = "Could not load statistics.";
  $("stats").setAttribute("aria-busy", "false");
});
void loadPage(1);
