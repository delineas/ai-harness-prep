// The only impure piece shared by the adapters: ask git for the branch, and fail closed.
import { execFileSync } from "node:child_process";
import { decide } from "./rules.ts";

export const failMessage = (why: unknown) =>
  `Blocked: the guard hook failed (${why instanceof Error ? why.message : String(why)}). Tell the human.`;

const branchOf = (cwd: string) => () => {
  try { return execFileSync("git", ["symbolic-ref", "--short", "-q", "HEAD"], { cwd, encoding: "utf8" }).trim() || null; }
  catch (e) { if ((e as { status?: number }).status === 1) return null; throw e; } // 1 = detached; else cannot decide
};

/** null = allow, string = the message to show. Never throws. */
export function guardCommand(command: unknown, cwd: string): string | null {
  try {
    const v = decide(command, { branch: branchOf(cwd) });
    return v.allow ? null : `Blocked: ${v.reason} [${v.rule}]. Tell the human.`;
  } catch (e) {
    return failMessage(e);
  }
}

/** Shared by the stdin/exit-code agents (Claude Code, Codex). Returns the process exit code. */
export function stdinAdapter(raw: string, isShell: (tool: unknown) => boolean, write: (s: string) => void): number {
  try {
    const e = JSON.parse(raw) as { tool_name?: unknown; tool_input?: { command?: unknown }; cwd?: unknown };
    if (typeof e.tool_name !== "string") throw new Error("event has no tool_name");
    if (!isShell(e.tool_name)) return 0;
    const msg = guardCommand(e.tool_input?.command, typeof e.cwd === "string" ? e.cwd : process.cwd());
    if (msg) { write(msg + "\n"); return 2; }
    return 0;
  } catch (err) {
    write(failMessage(err) + "\n");
    return 2;
  }
}
