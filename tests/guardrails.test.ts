import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const tmp = () => mkdtempSync(join(tmpdir(), "guard-"));
const git = (cwd: string, ...a: string[]) =>
  spawnSync("git", a, { cwd, encoding: "utf8", env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" } });

function repo() {
  const d = tmp();
  git(d, "init", "-q", "-b", "main");
  git(d, "config", "user.email", "t@t"); git(d, "config", "user.name", "t");
  cpSync(join(root, ".githooks"), join(d, ".githooks"), { recursive: true });
  git(d, "config", "core.hooksPath", ".githooks");
  writeFileSync(join(d, "f"), "1");
  git(d, "add", "f");
  git(d, "-c", "core.hooksPath=", "commit", "-qm", "init"); // seed, hooks off
  return d;
}
const commit = (d: string, ...extra: string[]) => {
  writeFileSync(join(d, "f"), String(Math.random()));
  git(d, "add", "f");
  return git(d, "commit", "-qm", "x", ...extra);
};

describe("branch policy (git hooks)", () => {
  it("rejects a commit on main, even with --no-verify", () => {
    const d = repo();
    expect(commit(d).status).not.toBe(0);
    expect(commit(d, "--no-verify").status).not.toBe(0);
  });
  it("rejects a commit on a badly named branch, even with --no-verify", () => {
    const d = repo();
    expect(git(d, "switch", "-c", "WIP_stuff").status).not.toBe(0);   // creation refused
    git(d, "-c", "core.hooksPath=", "switch", "-c", "wip");           // sneak one in
    expect(commit(d).status).not.toBe(0);
    expect(commit(d, "--no-verify").status).not.toBe(0);
  });
  it("accepts a well-named branch", () => {
    const d = repo();
    expect(git(d, "switch", "-c", "feat/ok-name").status).toBe(0);
    expect(commit(d).status).toBe(0);
    expect(commit(d, "--no-verify").status).toBe(0);
  });
  it("does not break fast-forwarding main (pull/merge)", () => {
    const d = repo();
    git(d, "switch", "-q", "-c", "feat/a");
    commit(d);
    git(d, "switch", "-q", "main");
    expect(git(d, "merge", "--ff-only", "feat/a").status).toBe(0);
  });
});
