import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BRANCH_REGEX, decide } from "../harness/rules.ts";

const on = (branch: string | null) => ({ branch: () => branch });
const blocked = (cmd: string, branch: string | null = "feat/x") => {
  const v = decide(cmd, on(branch));
  return v.allow ? null : v.rule;
};

describe("harness rules (pure)", () => {
  it("no-app-db: blocks app.db in any form, allows look-alikes", () => {
    for (const c of ["cat data/app.db", "sqlite3 ./data/app.db .tables", "cp app.db /tmp/x", "node -e \"open('data/app.db')\""])
      expect(blocked(c)).toBe("no-app-db");
    for (const c of ["ls data/e2e-app.db", "cat myapp.db", "echo app.dbx"]) expect(blocked(c)).toBeNull();
  });
  it("no-batch-tables: blocks BATCH_* in any case", () => {
    expect(blocked('sqlite3 data/catalog.db "select * from BATCH_JOB_INSTANCE"')).toBe("no-batch-tables");
    expect(blocked("select * from batch_step_execution")).toBe("no-batch-tables");
    expect(blocked("echo batched")).toBeNull();
  });
  it("commit-needs-good-branch: only well-named branches may commit", () => {
    expect(blocked("git commit -m x", "main")).toBe("commit-needs-good-branch");
    expect(blocked("git commit -m x", "sin-harness")).toBe("commit-needs-good-branch");
    expect(blocked("git -c user.name=a commit -m x", "wip")).toBe("commit-needs-good-branch");
    expect(blocked("git add . && git commit -m x", "Feat/Upper")).toBe("commit-needs-good-branch");
    expect(blocked("git cherry-pick abc", "main")).toBe("commit-needs-good-branch");
    expect(blocked("git commit -m x", null)).toBe("commit-needs-good-branch"); // detached
    expect(blocked("git commit -m x", "feat/ok-name")).toBeNull();
    expect(blocked("git status", "main")).toBeNull();
    expect(blocked('echo "no git commit here"; ls', "feat/x")).toBeNull();
  });
  it("commit-needs-good-branch: asks git only for commit-like commands", () => {
    const boom = { branch: () => { throw new Error("no git"); } };
    expect(decide("ls", boom).allow).toBe(true);
    expect(() => decide("git commit -m x", boom)).toThrow(); // adapter turns this into a block
  });
  it("no-hook-bypass: blocks hooksPath tampering and --no-verify", () => {
    expect(blocked("git -c core.hooksPath=/dev/null commit -m x")).toBe("no-hook-bypass");
    expect(blocked("git config core.hooksPath x")).toBe("no-hook-bypass");
    expect(blocked("git push --no-verify")).toBe("no-hook-bypass");
    expect(blocked("git push")).toBeNull();
  });
  it("no-sin-harness: blocks checkout/switch to sin-harness", () => {
    expect(blocked("git checkout sin-harness")).toBe("no-sin-harness");
    expect(blocked("git switch sin-harness")).toBe("no-sin-harness");
    expect(blocked("git switch main")).toBeNull();
    expect(blocked("git log origin/sin-harness")).toBeNull();
  });
  it("input: empty or non-string commands are blocked, not allowed", () => {
    for (const c of ["", "   ", undefined, 42, null]) expect(decide(c, on("feat/x")).allow).toBe(false);
  });
  it("branch regex matches the one in .githooks/branch-policy.sh", () => {
    const sh = readFileSync(".githooks/branch-policy.sh", "utf8").match(/BRANCH_REGEX='([^']+)'/)![1];
    expect(sh).toBe(BRANCH_REGEX.source.replace(/\\\//g, "/"));
  });
});

describe("adapters fail closed", () => {
  const run = (adapter: string, input: string) =>
    spawnSync("sh", ["harness/fail-closed.sh", adapter], { input, encoding: "utf8" });
  const msg = /^Blocked: the guard hook failed \(.+\)\. Tell the human\.$/m;

  it("garbage stdin -> exit 2 with the standard message (claude and codex)", () => {
    for (const a of ["claude", "codex"]) {
      const r = run(a, "not json");
      expect(r.status).toBe(2);
      expect(r.stderr).toMatch(msg);
    }
  });
  it("event without tool_name or a shell without a command -> blocked", () => {
    expect(run("claude", "{}").status).toBe(2);
    expect(run("claude", JSON.stringify({ tool_name: "Bash", tool_input: {} })).status).toBe(2);
  });
  it("adapter that cannot even start (exit 1/127) -> wrapper turns it into exit 2", () => {
    const r = run("does-not-exist", "{}");
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(msg);
  });
  it("a normal event passes through and a bad one is blocked", () => {
    const ev = (command: string) => JSON.stringify({ tool_name: "Bash", cwd: process.cwd(), tool_input: { command } });
    expect(run("claude", ev("ls")).status).toBe(0);
    expect(run("claude", JSON.stringify({ tool_name: "Read" })).status).toBe(0); // not a shell command
    const r = run("claude", ev("cat data/app.db"));
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("[no-app-db]");
  });
});
