import { fetchMovie, fetchShow, fetchStats, fetchTitles, type MovieDto, type ShowDto, type StatsDto, type TitleDto, type TitleFilters } from "./api.ts";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const fmt = new Intl.NumberFormat("en-US");

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: { class?: string; text?: string } = {}, ...kids: Node[]) {
  const e = document.createElement(tag);
  if (props.class) e.className = props.class;
  if (props.text !== undefined) e.textContent = props.text;
  e.append(...kids);
  return e;
}

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
      const dd = el("dd", { text: value });
      dd.dataset.stat = label.toLowerCase();
      return el("div", {}, el("dt", { text: label }), dd);
    }),
  );
  root.setAttribute("aria-busy", "false");
}

// ---- Titles ----
const form = $<HTMLFormElement>("search");
let page = 1;
let lastPage = 1;
let seq = 0; // ignore answers that arrive after a newer request
let filters: TitleFilters = readFilters();

function readFilters(): TitleFilters {
  return {
    q: $<HTMLInputElement>("q").value,
    kind: $<HTMLSelectElement>("kind").value,
    year: $<HTMLInputElement>("year").value,
    sort: $<HTMLSelectElement>("sort").value,
  };
}

function card(t: TitleDto) {
  const button = el(
    "button",
    { class: "card-btn" },
    el("span", { class: "name", text: t.title }),
    el("span", { class: "meta", text: `${t.kind === "movie" ? "Movie" : "Show"} · ${t.releaseYear ?? "year unknown"}` }),
    el("span", { class: "hours", text: t.hoursLabel ?? "no data" }),
  );
  button.type = "button";
  button.addEventListener("click", () => void openDetail(t));
  return el("li", { class: "card" }, button);
}

async function loadPage(n: number) {
  const mine = ++seq;
  const status = $("status");
  status.textContent = "Loading…";
  $("year-note").hidden = filters.year.trim() === "";
  try {
    const data = await fetchTitles(n, filters);
    if (mine !== seq) return;
    page = data.page;
    lastPage = Math.max(1, Math.ceil(data.total / data.pageSize));
    $("titles").replaceChildren(...data.items.map(card));
    $("page-info").textContent = data.total === 0 ? "No titles" : `Page ${fmt.format(page)} of ${fmt.format(lastPage)} (${fmt.format(data.total)} titles)`;
    ($("prev") as HTMLButtonElement).disabled = page <= 1;
    ($("next") as HTMLButtonElement).disabled = page >= lastPage;
    status.textContent = data.total === 0 ? "No titles match your search." : "";
  } catch {
    if (mine !== seq) return;
    status.textContent = "Could not load titles.";
  }
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  filters = readFilters();
  void loadPage(1);
});
for (const id of ["kind", "sort"]) {
  $(id).addEventListener("change", () => {
    filters = readFilters();
    void loadPage(1);
  });
}
$("prev").addEventListener("click", () => void loadPage(page - 1));
$("next").addEventListener("click", () => void loadPage(page + 1));

// ---- Detail ----
let detailSeq = 0;

function facts(rows: [string, string][]) {
  return el("dl", { class: "facts" }, ...rows.map(([k, v]) => el("div", {}, el("dt", { text: k }), el("dd", { text: v }))));
}

function renderMovie(m: MovieDto) {
  const rows: [string, string][] = [
    ["Kind", "Movie"],
    ["Release year", m.releaseYear === null ? "year unknown" : String(m.releaseYear)],
  ];
  if (m.runtimeMinutes !== null) rows.push(["Runtime", `${fmt.format(m.runtimeMinutes)} min`]);
  if (m.locale) rows.push(["Locale", m.locale]);
  rows.push(["Hours viewed", m.hoursLabel ?? "no data"]);
  rows.push(["Weeks in the top 10 (as published by Netflix)", String(m.weeksInTop10)]);
  return facts(rows);
}

function renderShow(s: ShowDto) {
  const seasons = s.seasons.map((x) =>
    el("li", {}, el("span", { text: x.seasonNumber === null ? x.title : `Season ${x.seasonNumber}` }), el("span", { class: "hours", text: x.hoursLabel ?? "no data" })),
  );
  return el(
    "div",
    {},
    facts([
      ["Kind", "Show"],
      ["Release year", s.releaseYear === null ? "year unknown" : String(s.releaseYear)],
      ["Total hours viewed", s.hoursLabel ?? "no data"],
    ]),
    el("h3", { text: `Seasons (${s.seasons.length})` }),
    seasons.length ? el("ul", { class: "seasons" }, ...seasons) : el("p", { text: "No seasons." }),
  );
}

async function openDetail(t: TitleDto) {
  const mine = ++detailSeq;
  const panel = $("detail");
  const heading = $("detail-heading");
  panel.hidden = false;
  heading.textContent = t.title;
  $("detail-body").replaceChildren();
  $("detail-status").textContent = "Loading…";
  heading.focus();
  panel.scrollIntoView({ block: "nearest" });
  try {
    const body = t.kind === "movie" ? renderMovie(await fetchMovie(t.id)) : renderShow(await fetchShow(t.id));
    if (mine !== detailSeq) return;
    $("detail-body").replaceChildren(body);
    $("detail-status").textContent = "";
  } catch {
    if (mine !== detailSeq) return;
    $("detail-status").textContent = "Could not load details.";
  }
}

fetchStats().then(renderStats, () => {
  $("stats").textContent = "Could not load statistics.";
  $("stats").setAttribute("aria-busy", "false");
});
void loadPage(1);
