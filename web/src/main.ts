import { ApiError, createReview, deleteReview, editReview, fetchReviews, fetchUsers, hideReview, showReview, type ReviewDto, type UserDto, fetchMovie, fetchShow, fetchStats, fetchTitles, type MovieDto, type ShowDto, type StatsDto, type TitleDto, type TitleFilters } from "./api.ts";

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
  $("reviews").hidden = true;
  $("detail-status").textContent = "Loading…";
  heading.focus();
  panel.scrollIntoView({ block: "nearest" });
  void openReviews(t);
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

// ---- Reviews ----
const MAX_BODY = 2000;
let current: TitleDto | null = null;
let currentUser: number | null = null;
let editing: ReviewDto | null = null;
let reviewSeq = 0;
let users: UserDto[] = [];
const userSelect = $<HTMLSelectElement>("user-select");
const ratingInput = $<HTMLInputElement>("review-rating");
const bodyInput = $<HTMLTextAreaElement>("review-body");

const say = (msg: string) => {
  $("review-status").textContent = msg;
};
const plain = (e: unknown) => (e instanceof ApiError ? e.message : "Could not reach the server. Please try again.");

function stars(n: number) {
  const s = el("span", { class: "stars", text: "★".repeat(n) + "☆".repeat(5 - n) });
  s.setAttribute("role", "img");
  s.setAttribute("aria-label", `${n} out of 5 stars`);
  return s;
}

function reviewItem(r: ReviewDto) {
  const buttons: HTMLButtonElement[] = [];
  const add = (label: string, run: () => void) => {
    const b = el("button", { text: label });
    b.type = "button";
    b.setAttribute("aria-label", `${label} review by ${r.authorName}`);
    b.addEventListener("click", run);
    buttons.push(b);
  };
  if (r.can.edit) add("Edit", () => startEdit(r));
  if (r.can.hide) add("Hide", () => void act(() => hideReview(r.id, currentUser), "Review hidden."));
  if (r.can.show) add("Show", () => void act(() => showReview(r.id, currentUser), "Review is visible again."));
  if (r.can.delete) add("Delete", () => void act(() => deleteReview(r.id, currentUser), "Review deleted."));
  const head = el("div", { class: "review-head" }, el("strong", { class: "author", text: r.authorName }), stars(r.rating));
  if (r.status === "hidden") head.append(el("span", { class: "badge", text: "Hidden" }));
  return el(
    "li",
    { class: "review" },
    head,
    el("p", { class: "review-body", text: r.body }), // text, never HTML
    ...(buttons.length ? [el("div", { class: "actions" }, ...buttons)] : []),
  );
}

async function loadReviews(announce = "") {
  if (!current) return;
  const mine = ++reviewSeq;
  const t = current;
  try {
    const list = await fetchReviews(t.kind, t.id, currentUser);
    if (mine !== reviewSeq) return;
    $("review-list").replaceChildren(...list.map(reviewItem));
    say(announce || (list.length === 0 ? "No reviews yet." : ""));
  } catch (e) {
    if (mine !== reviewSeq) return;
    $("review-list").replaceChildren();
    say(plain(e));
  }
}

async function act(run: () => Promise<unknown>, done: string) {
  try {
    await run();
    if (editing) stopEdit();
    await loadReviews(done);
  } catch (e) {
    say(plain(e));
  }
}

function updateCount() {
  const n = [...bodyInput.value].length;
  const c = $("review-count");
  c.textContent = `${n} / ${MAX_BODY}`;
  c.classList.toggle("over", n > MAX_BODY);
}

function startEdit(r: ReviewDto) {
  editing = r;
  ratingInput.value = String(r.rating);
  bodyInput.value = r.body;
  updateCount();
  $("review-form-heading").textContent = "Edit your review";
  $("review-submit").textContent = "Save changes";
  $("review-cancel").hidden = false;
  ratingInput.focus();
}

function stopEdit() {
  editing = null;
  ratingInput.value = "";
  bodyInput.value = "";
  updateCount();
  $("review-form-heading").textContent = "Write a review";
  $("review-submit").textContent = "Post review";
  $("review-cancel").hidden = true;
}

async function openReviews(t: TitleDto) {
  current = t;
  stopEdit();
  $("review-list").replaceChildren();
  say("");
  $("reviews").hidden = false;
  await loadReviews();
}

userSelect.addEventListener("change", () => {
  currentUser = userSelect.value === "" ? null : Number(userSelect.value);
  stopEdit();
  void loadReviews();
});
bodyInput.addEventListener("input", updateCount);
$("review-cancel").addEventListener("click", () => {
  stopEdit();
  say("");
});
$<HTMLFormElement>("review-form").addEventListener("submit", (e) => {
  e.preventDefault();
  if (!current) return;
  if (currentUser === null) return say("Choose a user in “Acting as” to write a review.");
  const raw = ratingInput.value.trim();
  const rating = raw === "" ? Number.NaN : Number(raw);
  const t = current;
  const run = editing ? () => editReview(editing!.id, currentUser, rating, bodyInput.value) : () => createReview(t.kind, t.id, currentUser, rating, bodyInput.value);
  // The server owns the rules: an out-of-range rating comes back as a 400 with its explanation.
  void act(run, editing ? "Review updated." : "Review posted.");
});

fetchUsers().then(
  (list) => {
    users = list;
    userSelect.replaceChildren(
      Object.assign(document.createElement("option"), { value: "", textContent: "Anonymous" }),
      ...users.map((u) => Object.assign(document.createElement("option"), { value: String(u.id), textContent: u.role === "moderator" ? `${u.displayName} (moderator)` : u.displayName })),
    );
  },
  () => say("Could not load the users."),
);
