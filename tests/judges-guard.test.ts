import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { approvedBy, isJudge, judgeChanges, packageJudgeChange, parseNameStatus, signalsFor } from "../scripts/ci/judges-guard.ts";

const root = resolve(import.meta.dirname, "..");

describe("which paths judge the work", () => {
  it.each([
    "tests/architecture.test.ts", "scripts/verify.ts", "e2e/catalog.spec.ts", "e2e/deep/x.spec.ts",
    "playwright.config.ts", "vitest.config.ts", ".githooks/pre-push", "scripts/agent-run.sh",
    "harness/rules.ts", ".claude/settings.json", "AGENTS.md", "CLAUDE.md",
    ".github/workflows/verify.yml", "scripts/ci/judges-guard.ts", "tests/judges-guard.test.ts", "data/catalog.db",
  ])("%s is a judge", (p) => expect(isJudge(p)).toBe(true));

  it.each(["src/domain/title.ts", "web/app.ts", "docs/decisions.md", "tests/explorer.test.ts", "README.md", "src/e2e-helpers.ts"])(
    "%s is not", (p) => expect(isJudge(p)).toBe(false));

  it("a file deleted or renamed out of a judge path still counts", () => {
    const c = parseNameStatus("D\0e2e/a.spec.ts\0A\0src/x.ts\0");
    expect(judgeChanges(c)).toEqual([{ status: "D", path: "e2e/a.spec.ts" }]);
  });

  it("every Edit/Write path denied in .claude/settings.json is a judge here too", () => {
    const deny: string[] = JSON.parse(readFileSync(resolve(root, ".claude/settings.json"), "utf8")).permissions.deny;
    const paths = deny.flatMap((d) => d.match(/^(?:Edit|Write)\((.+)\)$/)?.[1] ?? []);
    expect(paths.length).toBeGreaterThan(5);
    // probe with a concrete file for globs, the path itself otherwise
    const missing = paths.filter((p) => !isJudge(p.replace(/\*\*$/, "x").replace(/\*$/, "")));
    expect(missing).toEqual([]);
  });
});

describe("package.json only counts where it defines verify", () => {
  const pkg = (o: object) => JSON.stringify({ name: "x", scripts: { verify: "a" }, engines: { node: ">=24" }, ...o });
  it("adding a dependency is not a judge change", () =>
    expect(packageJudgeChange(pkg({}), pkg({ devDependencies: { a: "1.0.0" } }))).toBe(false));
  it("changing a script is", () =>
    expect(packageJudgeChange(pkg({}), pkg({ scripts: { verify: "true" } }))).toBe(true));
  it("changing engines is", () =>
    expect(packageJudgeChange(pkg({}), pkg({ engines: { node: ">=18" } }))).toBe(true));
  it("deleting package.json is", () => expect(packageJudgeChange(pkg({}), null)).toBe(true));
});

describe("signals explain the alarm", () => {
  it("flags a skipped test", () => expect(signalsFor("e2e/a.spec.ts", ["test.skip('x', () => {})"], [])[0]).toMatch(/skips a test/));
  it("flags a bypass of git hooks", () => expect(signalsFor(".githooks/x", ["git commit --no-verify"], [])[0]).toMatch(/bypasses git hooks/));
  it("flags a soft failure", () => expect(signalsFor(".github/workflows/v.yml", ["  run: npm run verify || true"], [])[0]).toMatch(/lets a failure pass/));
  it("flags a widened import allowlist only in the architecture test", () => {
    expect(signalsFor("tests/architecture.test.ts", ['  infrastructure: ["node:sqlite", "node:fs"],'], []).join()).toMatch(/widens/);
    expect(signalsFor("e2e/a.spec.ts", ['import "node:fs"'], []).join()).not.toMatch(/widens/);
  });
  it("flags fewer assertions", () =>
    expect(signalsFor("e2e/a.spec.ts", [], ["expect(a).toBe(1)", "expect(b).toBe(2)"]).join()).toMatch(/fewer assertions: 2 removed, 0 added/));
  it("is quiet on a harmless edit", () => expect(signalsFor("AGENTS.md", ["a comment"], ["old comment"])).toEqual([]));
});

describe("approval", () => {
  const ev = (event: string, login: string, name = "judges-approved") => ({ event, label: { name }, actor: { login } });
  it("approved when the approver applied the label last", () => expect(approvedBy([ev("labeled", "Alice")], "alice")).toBe(true));
  it("not approved when someone else applied it", () => expect(approvedBy([ev("labeled", "bot-or-agent")], "alice")).toBe(false));
  it("not approved after the label was removed", () =>
    expect(approvedBy([ev("labeled", "alice"), ev("unlabeled", "github-actions[bot]")], "alice")).toBe(false));
  it("a re-apply after removal counts", () =>
    expect(approvedBy([ev("labeled", "alice"), ev("unlabeled", "x"), ev("labeled", "alice")], "alice")).toBe(true));
  it("ignores other labels", () => expect(approvedBy([ev("labeled", "alice", "bug")], "alice")).toBe(false));
  it("fails closed with no approver configured", () => expect(approvedBy([ev("labeled", "alice")], "")).toBe(false));
});
