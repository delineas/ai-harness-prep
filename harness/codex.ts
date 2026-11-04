// Codex PreToolUse hook. ASSUMPTION (from third-party docs, not verified here):
// same stdin JSON shape as Claude (tool_name "Bash", tool_input.command) and exit 2 = block.
import { readFileSync } from "node:fs";
import { stdinAdapter } from "./run.ts";
process.exitCode = stdinAdapter(readFileSync(0, "utf8"), (t) => t === "Bash", (s) => process.stderr.write(s));
