// Pure rules: (command text, context) -> verdict. No I/O, no clock, no env.
// These are a tripwire on the TEXT of a command, not a security boundary:
// `x=app; cat data/$x.db` or `echo ... | base64 -d | sh` get past any regex.
// The boundary is scripts/agent-run.sh (bwrap) + .githooks + the server.

export type Verdict = { allow: true } | { allow: false; rule: string; reason: string };

/** `branch` is lazy so commands that don't need it never touch git. May throw (-> fail closed). */
export interface Ctx { branch: () => string | null }

export const BRANCH_REGEX = /^(feat|fix|chore|test|docs|refactor)\/[a-z0-9-]+$/;

interface Rule { id: string; check: (cmd: string, ctx: Ctx) => string | null }

const GIT = String.raw`\bgit\b[^;&|\n]*?`;
const commits = new RegExp(`${GIT}\\b(commit|commit-tree|cherry-pick|revert)\\b`);

export const RULES: Rule[] = [
  {
    id: "no-app-db",
    // not preceded by [\w.-] so data/e2e-app.db and myapp.db are fine
    check: (c) => (/(?<![\w.-])app\.db(?![\w])/.test(c) ? "data/app.db holds personal data; agents must not read it" : null),
  },
  {
    id: "no-batch-tables",
    check: (c) => (/\bBATCH_[A-Z_]+/i.test(c) ? "BATCH_* tables are internal bookkeeping; never query them" : null),
  },
  {
    id: "commit-needs-good-branch",
    check: (c, ctx) => {
      if (!commits.test(c)) return null;
      const b = ctx.branch();
      if (b === null) return "cannot commit on a detached HEAD";
      return BRANCH_REGEX.test(b) ? null : `'${b}' is not a well-named branch (type/kebab-name, type in feat|fix|chore|test|docs|refactor)`;
    },
  },
  {
    id: "no-hook-bypass",
    check: (c) => (/core\.hooksPath|--no-verify\b/.test(c) ? "bypassing git hooks is not allowed" : null),
  },
  {
    id: "no-sin-harness",
    check: (c) => (new RegExp(`${GIT}\\b(checkout|switch)\\b[^;&|\\n]*\\bsin-harness\\b`).test(c) ? "never switch to sin-harness" : null),
  },
];

export function decide(command: unknown, ctx: Ctx): Verdict {
  if (typeof command !== "string" || command.trim() === "")
    return { allow: false, rule: "input", reason: "empty or non-string command" };
  for (const r of RULES) {
    const reason = r.check(command, ctx);
    if (reason) return { allow: false, rule: r.id, reason };
  }
  return { allow: true };
}
