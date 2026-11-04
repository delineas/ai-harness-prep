// Claude Code PreToolUse hook. Exit 2 = block (stderr goes to the model).
import { readFileSync } from "node:fs";
import { stdinAdapter } from "./run.ts";
process.exitCode = stdinAdapter(readFileSync(0, "utf8"), (t) => t === "Bash", (s) => process.stderr.write(s));
