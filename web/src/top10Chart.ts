import type { Top10PointDto } from "./api.ts";

const NS = "http://www.w3.org/2000/svg";
const WEEK_MS = 7 * 24 * 3600 * 1000;
const W = 360;
const H = 190;
const M = { l: 26, r: 10, t: 10, b: 26 };

const svg = (tag: string, attrs: Record<string, string | number> = {}, text?: string) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text !== undefined) e.textContent = text;
  return e;
};
const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

/** R30: split into runs of consecutive weeks so the line breaks where the title left the top 10. */
export function runsOf(points: readonly Top10PointDto[]): Top10PointDto[][] {
  const runs: Top10PointDto[][] = [];
  for (const p of points) {
    const run = runs.at(-1);
    if (run && day(p.weekStart) - day(run.at(-1)!.weekStart) === WEEK_MS) run.push(p);
    else runs.push([p]);
  }
  return runs;
}

/** The text alternative: one sentence plus every week (R32). */
export function describe(points: readonly Top10PointDto[]): string {
  if (!points.length) return "This title was never in the weekly top 10 in the period covered.";
  const best = Math.min(...points.map((p) => p.rank));
  return `${points.length} ${points.length === 1 ? "week" : "weeks"} in the weekly top 10, from ${points[0]!.weekStart} to ${points.at(-1)!.weekStart}. Best rank: ${best}.`;
}

/** R32: inline SVG line, rank 1 at the top, rank 10 at the bottom, with a text alternative. */
export function renderTop10Chart(points: readonly Top10PointDto[]): HTMLElement {
  const fig = document.createElement("figure");
  fig.className = "chart";
  const cap = document.createElement("figcaption");
  cap.textContent = "Rank in the weekly top 10, week by week (1 is best)";
  const summary = document.createElement("p");
  summary.className = "chart-summary";
  summary.textContent = describe(points);
  fig.append(cap, summary);
  if (!points.length) return fig;

  const t0 = day(points[0]!.weekStart);
  const t1 = day(points.at(-1)!.weekStart);
  const x = (iso: string) => M.l + (t1 === t0 ? (W - M.l - M.r) / 2 : ((day(iso) - t0) / (t1 - t0)) * (W - M.l - M.r));
  const y = (rank: number) => M.t + ((rank - 1) / 9) * (H - M.t - M.b);

  const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart-svg", role: "img", "aria-label": describe(points) });
  s.append(svg("title", {}, cap.textContent!));
  for (const r of [1, 5, 10]) {
    s.append(svg("line", { x1: M.l, x2: W - M.r, y1: y(r), y2: y(r), class: "chart-grid" }));
    s.append(svg("text", { x: M.l - 6, y: y(r) + 4, "text-anchor": "end", class: "chart-label" }, String(r)));
  }
  s.append(svg("text", { x: M.l, y: H - 8, "text-anchor": "start", class: "chart-label" }, points[0]!.weekStart));
  if (t1 !== t0) s.append(svg("text", { x: W - M.r, y: H - 8, "text-anchor": "end", class: "chart-label" }, points.at(-1)!.weekStart));
  for (const run of runsOf(points)) {
    if (run.length > 1) s.append(svg("polyline", { points: run.map((p) => `${x(p.weekStart)},${y(p.rank)}`).join(" "), class: "chart-line" }));
  }
  for (const p of points) s.append(svg("circle", { cx: x(p.weekStart), cy: y(p.rank), r: 4, class: "chart-dot" }));
  fig.append(s);

  const details = document.createElement("details");
  const sum = document.createElement("summary");
  sum.textContent = "Week by week";
  const list = document.createElement("ol");
  list.className = "chart-weeks";
  for (const p of points) {
    const li = document.createElement("li");
    li.textContent = `Week of ${p.weekStart}: #${p.rank}`;
    list.append(li);
  }
  details.append(sum, list);
  fig.append(details);
  return fig;
}
