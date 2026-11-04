// Single health check: typecheck, unit tests, build, e2e.
// Fails if any step fails OR if a test suite ran zero tests / skipped any.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = mkdtempSync(join(tmpdir(), "verify-"));
const fail = (msg: string): never => {
  console.error(`\n✘ verify FAILED: ${msg}`);
  process.exit(1);
};

function run(label: string, args: string[], env: Record<string, string> = {}): void {
  console.log(`\n▶ ${label}`);
  const r = spawnSync("npx", args, { stdio: "inherit", env: { ...process.env, ...env } });
  if (r.status !== 0) fail(`${label} exited with ${r.status}`);
}

run("typecheck", ["tsc", "--noEmit"]);

const vitestJson = join(out, "vitest.json");
run("unit tests", ["vitest", "run", "--allowOnly=false", "--reporter=default", "--reporter=json", `--outputFile.json=${vitestJson}`]);
const v = JSON.parse(readFileSync(vitestJson, "utf8"));
if (!(v.numPassedTests > 0)) fail("vitest ran 0 passing tests");
if (v.numPendingTests > 0 || v.numTodoTests > 0) fail(`vitest has ${v.numPendingTests} skipped / ${v.numTodoTests} todo tests`);
console.log(`✔ vitest: ${v.numPassedTests} passed`);

run("build", ["vite", "build"]);

const pwJson = join(out, "playwright.json");
run("e2e", ["playwright", "test", "--forbid-only", "--reporter=list,json"], { PLAYWRIGHT_JSON_OUTPUT_NAME: pwJson });
const p = JSON.parse(readFileSync(pwJson, "utf8")).stats;
if (!(p.expected > 0)) fail("playwright ran 0 passing tests");
if (p.skipped > 0 || p.flaky > 0 || p.unexpected > 0) fail(`playwright skipped=${p.skipped} flaky=${p.flaky} failed=${p.unexpected}`);
console.log(`✔ playwright: ${p.expected} passed`);

console.log("\n✔ verify OK");
