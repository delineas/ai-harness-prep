// Server-side guard for the rules that judge the work (tests, verify, hooks, harness, CI itself).
// Runs from the BASE branch under pull_request_target, so a PR cannot edit it to pass:
// it only READS the PR's diff and never executes PR code.
//
// Rule: if a PR touches a path in JUDGES, the check is red until APPROVER applies the label
// APPROVAL_LABEL. A push to the PR removes the label, so approval always covers the last commit.
// Keep JUDGES in step with AGENTS.md (Harness) and .claude/settings.json (tests/judges-guard.test.ts
// fails if a denied path there is missing here).
import { spawnSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";

export const APPROVAL_LABEL = "judges-approved";
const MARKER = "<!-- judges-guard -->";

export const JUDGES: readonly string[] = [
  "data/catalog.db*",
  "tests/architecture.test.ts",
  "tests/judges-guard.test.ts",
  "scripts/verify.ts",
  "scripts/check-agent-run.ts",
  "scripts/agent-run.sh",
  "scripts/hooks/**",
  "scripts/ci/**",
  "e2e/**",
  "playwright.config.ts",
  "vitest.config.ts",
  "tsconfig.json",
  ".githooks/**",
  "harness/**",
  ".claude/settings*.json",
  ".github/**",
  "AGENTS.md",
  "CLAUDE.md",
];

export function globToRegExp(glob: string): RegExp {
  const body = glob
    .replace(/^\//, "")
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "\0")
    .replace(/\*/g, "[^/]*")
    .replaceAll("\0", ".*");
  return new RegExp(`^${body}$`);
}

const JUDGE_RES = JUDGES.map(globToRegExp);
export const isJudge = (path: string): boolean => JUDGE_RES.some((re) => re.test(path.replace(/^\//, "")));

export interface Change { status: string; path: string }

/** `git diff --name-status -z --no-renames` output -> changes. A rename shows as delete + add. */
export function parseNameStatus(z: string): Change[] {
  const t = z.split("\0").filter(Boolean);
  const out: Change[] = [];
  for (let i = 0; i + 1 < t.length; i += 2) out.push({ status: t[i]!, path: t[i + 1]! });
  return out;
}

export const judgeChanges = (changes: Change[]): Change[] => changes.filter((c) => isJudge(c.path));

/** package.json is a judge only where it decides what "verify" means: scripts, engines, type. */
export function packageJudgeChange(base: string | null, head: string | null): boolean {
  const pick = (s: string | null): string | null => {
    if (s === null) return null;
    try {
      const j = JSON.parse(s);
      return JSON.stringify([j.scripts ?? null, j.engines ?? null, j.type ?? null]);
    } catch {
      return "unparseable";
    }
  };
  return pick(base) !== pick(head);
}

const ASSERT = /\b(expect|assert)\w*\s*\(|\.(toBe|toEqual|toThrow|toHaveLength|toMatch)\w*\(/;

/** Heuristics on the lines of a diff. They explain the alarm; they never decide it. */
export function signalsFor(file: string, added: string[], removed: string[]): string[] {
  const out: string[] = [];
  const hit = (name: string, re: RegExp): void => {
    const l = added.find((x) => re.test(x));
    if (l) out.push(`${name}: \`${l.trim().replaceAll("`", "'").slice(0, 120)}\``);
  };
  hit("skips a test", /\.(skip|only|todo|fixme)\b|\.fail\(|\b(xit|xdescribe|xtest)\b/);
  hit("bypasses git hooks", /--no-verify|core\.hooksPath|HUSKY=0/);
  hit("lets a failure pass", /\|\|\s*true\b|continue-on-error|\bexit\s+0\b/);
  hit("loosens a limit", /\b(retries|timeout|maxFailures|testTimeout|threshold\w*)\b/i);
  hit("opens a permission", /"allow"\s*:/);
  if (file === "tests/architecture.test.ts") hit("widens an import allowlist", /["']node:[a-z:/]+["']/);
  const a = added.filter((l) => ASSERT.test(l)).length;
  const r = removed.filter((l) => ASSERT.test(l)).length;
  if (r > a) out.push(`fewer assertions: ${r} removed, ${a} added`);
  return out;
}

export interface IssueEvent { event: string; label?: { name: string }; actor?: { login: string } }

/** Approved only if the LAST event on the label is "labeled" by the approver. */
export function approvedBy(events: IssueEvent[], approver: string, label = APPROVAL_LABEL): boolean {
  if (!approver) return false;
  const last = events.filter((e) => (e.event === "labeled" || e.event === "unlabeled") && e.label?.name === label).at(-1);
  return last?.event === "labeled" && last.actor?.login.toLowerCase() === approver.toLowerCase();
}

// ---------------------------------------------------------------- I/O (only runs on the server)

const git = (args: string[]): { ok: boolean; out: string } => {
  const r = spawnSync("git", ["--no-pager", ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return { ok: r.status === 0, out: r.stdout ?? "" };
};
const DIFF = ["diff", "--no-ext-diff", "--no-textconv", "--no-renames"];

function diffLines(range: string, file: string): { added: string[]; removed: string[] } {
  const lines = git([...DIFF, "-U0", range, "--", file]).out.split("\n");
  return {
    added: lines.filter((l) => l.startsWith("+") && !l.startsWith("+++")).map((l) => l.slice(1)),
    removed: lines.filter((l) => l.startsWith("-") && !l.startsWith("---")).map((l) => l.slice(1)),
  };
}

async function main(): Promise<void> {
  const env = process.env;
  const need = (k: string): string => env[k] || (() => { throw new Error(`missing env ${k}`); })();
  const ev = JSON.parse(readFileSync(need("GITHUB_EVENT_PATH"), "utf8"));
  const pr = ev.pull_request;
  const n: number = pr.number;
  const approver = (env.APPROVER ?? "").trim();
  const range = `${pr.base.sha}...${pr.head.sha}`;

  const api = async (method: string, path: string, body?: unknown): Promise<any> => {
    const res = await fetch(`https://api.github.com/repos/${need("GITHUB_REPOSITORY")}${path}`, {
      method,
      headers: { authorization: `Bearer ${need("GH_TOKEN")}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 404 || res.status === 204) return null;
    if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
    return res.json();
  };

  const names = git([...DIFF, "--name-status", "-z", range]);
  if (!names.ok) throw new Error(`git diff ${range} failed (is the PR head fetched?)`);
  const touched = judgeChanges(parseNameStatus(names.out));

  const mb = git(["merge-base", pr.base.sha, pr.head.sha]).out.trim();
  const show = (rev: string): string | null => { const r = git(["show", `${rev}:package.json`]); return r.ok ? r.out : null; };
  if (mb && packageJudgeChange(show(mb), show(pr.head.sha)) && !touched.some((c) => c.path === "package.json"))
    touched.push({ status: "M", path: "package.json" });

  // A push invalidates any earlier approval.
  if (ev.action === "synchronize") await api("DELETE", `/issues/${n}/labels/${APPROVAL_LABEL}`);

  const comments: any[] = (await api("GET", `/issues/${n}/comments?per_page=100`)) ?? [];
  const mine = comments.find((c) => c.user?.type === "Bot" && String(c.body).includes(MARKER));
  const upsert = async (body: string): Promise<void> => {
    if (mine) await api("PATCH", `/issues/comments/${mine.id}`, { body });
    else if (!body.includes("cleared")) await api("POST", `/issues/${n}/comments`, { body });
  };
  const summary = (md: string): void => { if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, md + "\n"); };

  if (touched.length === 0) {
    const md = `${MARKER}\n### judges-guard: cleared\nNo file that judges the work is changed in this PR.`;
    await upsert(md);
    summary(md);
    console.log("judges-guard: no judge files touched");
    return;
  }

  const events: IssueEvent[] = [];
  for (let p = 1; ; p++) {
    const page: IssueEvent[] = (await api("GET", `/issues/${n}/events?per_page=100&page=${p}`)) ?? [];
    events.push(...page);
    if (page.length < 100) break;
  }
  const approved = ev.action !== "synchronize" && approvedBy(events, approver);

  const rows = touched.map((c) => {
    const d = diffLines(range, c.path);
    const sig = signalsFor(c.path, d.added, d.removed);
    const plain = c.path.replaceAll("`", "'");
    return `| ${c.status} | \`${plain}\` | +${d.added.length} / -${d.removed.length} | ${sig.length ? sig.join("<br>") : "none detected"} |`;
  });
  const head = approved
    ? `### judges-guard: approved by @${approver}\nThe rules that judge the work were changed, and ${approver} approved the last commit.`
    : `### 🚨 judges-guard: this PR changes the rules that judge the work\nA change here can make the agent's work pass without being right. This check stays **red** until ${approver ? `@${approver}` : "the approver"} reads the diff and applies the label \`${APPROVAL_LABEL}\`. Any new push removes the label.${approver ? "" : "\n\n**JUDGES_APPROVER is not set** (repository variable), so nobody can approve: failing closed."}`;
  const md = [MARKER, head, "", "| | File | Lines | Signals (heuristic, not a verdict) |", "|---|---|---|---|", ...rows].join("\n");
  await upsert(md);
  summary(md);

  if (!approved) {
    console.log(`::error title=Rules that judge the work changed::${touched.length} file(s) need approval by ${approver || "(JUDGES_APPROVER unset)"}. See the PR comment.`);
    process.exit(1);
  }
  console.log(`judges-guard: ${touched.length} judge file(s) changed, approved by ${approver}`);
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(`::error title=judges-guard failed closed::${String(e?.message ?? e).split("\n")[0]}`);
    process.exit(1);
  });
}
