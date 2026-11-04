// OpenCode plugin: copy or symlink to .opencode/plugins/guard.ts.
// Blocks by throwing in tool.execute.before. ASSUMPTION from docs, not verified here.
import { guardCommand, failMessage } from "./run.ts";

export const Guard = async ({ directory }: { directory: string }) => ({
  "tool.execute.before": async (input: { tool: string }, output: { args?: { command?: unknown } }) => {
    if (input.tool !== "bash") return;
    let msg: string | null;
    try { msg = guardCommand(output.args?.command, directory); } catch (e) { msg = failMessage(e); }
    if (msg) throw new Error(msg);
  },
});
