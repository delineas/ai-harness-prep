import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve, dirname } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === "dist" || f === "node_modules" ? [] : files(p);
    return /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(p) ? [p] : [];
  });
}

function imports(src: string): string[] {
  return [...src.matchAll(/(?:\bfrom|\bimport|\brequire)\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1]!);
}

/** Layer of a src/ file, or "web", or null. */
function layerOf(abs: string): string | null {
  const rel = relative(root, abs).replaceAll("\\", "/");
  if (rel.startsWith("web/")) return "web";
  if (rel === "src/main.ts") return "main";
  const m = rel.match(/^src\/(domain|application|infrastructure|interfaces)\//);
  return m ? m[1]! : null;
}

const allowed: Record<string, string[]> = {
  domain: [],
  application: ["domain"],
  infrastructure: ["domain", "application"],
  interfaces: ["domain", "application"],
  main: ["domain", "application", "infrastructure", "interfaces"],
  web: ["web"],
};
const builtinAllowed: Record<string, string[]> = {
  domain: [],
  application: [],
  infrastructure: ["node:sqlite"],
  interfaces: ["node:http", "node:fs/promises", "node:path"],
  main: ["node:url"],
  web: [],
};

interface Source { file: string; src: string }
const load = (list: string[]): Source[] => list.map((file) => ({ file, src: readFileSync(file, "utf8") }));

/** Every source file the rule applies to: all of src/ and web/. */
const sourceFiles = () => [...files(join(root, "src")), ...files(join(root, "web"))];

function violations(list: Source[]): string[] {
  const out: string[] = [];
  for (const { file: f, src } of list) {
    const from = layerOf(f);
    if (!from) {
      out.push(`${relative(root, f)}: file is outside any known layer`);
      continue;
    }
    for (const spec of imports(src)) {
      const label = `${relative(root, f)} imports "${spec}"`;
      if (spec.startsWith(".")) {
        const to = layerOf(resolve(dirname(f), spec));
        if (to === null) out.push(`${label} (outside any layer)`);
        else if (to !== from && !allowed[from]!.includes(to)) out.push(`${label}: ${from} must not depend on ${to}`);
      } else if (!builtinAllowed[from]!.includes(spec)) {
        out.push(`${label}: not allowed in ${from}`);
      }
    }
  }
  return out;
}

describe("architecture", () => {
  it("respects the dependency rule between layers", () => {
    expect(violations(load(sourceFiles()))).toEqual([]);
  });

  it("the checker flags forbidden imports (it can fail)", () => {
    const bad = (file: string, src: string) => violations([{ file: join(root, file), src }]);
    expect(bad("src/domain/x.ts", 'import "../infrastructure/sqlite/openCatalog.ts";')).toHaveLength(1);
    expect(bad("src/application/x.ts", 'import { createServer } from "node:http";')).toHaveLength(1);
    expect(bad("src/application/x.ts", 'import "../interfaces/http/server.ts";')).toHaveLength(1);
    expect(bad("web/src/x.ts", 'import "../../src/domain/catalog.ts";')).toHaveLength(1);
    expect(bad("src/interfaces/http/x.ts", 'import "../../infrastructure/sqlite/openCatalog.ts";')).toHaveLength(1);
    expect(bad("src/application/x.ts", 'import type { Title } from "../domain/catalog.ts";')).toEqual([]);
  });

  it("the checker flags every way the web could reach backend code", () => {
    const bad = (src: string, file = "web/src/x.ts") => violations([{ file: join(root, file), src }]);
    expect(bad('import { a } from "../../src/domain/catalog.ts";')).toHaveLength(1);
    expect(bad('import "../../src/infrastructure/sqlite/openCatalog.ts";')).toHaveLength(1);
    expect(bad('export * from "../../src/application/ports.ts";')).toHaveLength(1);
    expect(bad('const m = await import("../../src/interfaces/http/server.ts");')).toHaveLength(1);
    expect(bad('const m = require("../../src/main.ts");')).toHaveLength(1);
    expect(bad('import { a } from\n  "../../src/domain/catalog.ts";')).toHaveLength(1);
    expect(bad('import "/src/domain/catalog.ts";')).toHaveLength(1);
    expect(bad('import { DatabaseSync } from "node:sqlite";')).toHaveLength(1);
    expect(bad('import "../../tests/catalog.test.ts";')).toHaveLength(1);
    expect(bad('import { fetchStats } from "./api.ts";')).toEqual([]);
    expect(bad('import "../../src/domain/catalog.js";', "web/src/x.js")).toHaveLength(1);
  });

  it("the checker flags files that sit outside every layer", () => {
    const bad = (file: string) => violations([{ file: join(root, file), src: "export {};" }]);
    expect(bad("src/shared/util.ts")).toHaveLength(1);
    expect(bad("src/util.ts")).toHaveLength(1);
    expect(bad("src/domain/x.ts")).toEqual([]);
  });

  it("scans .js files too, so a layer cannot be bypassed by renaming", () => {
    const dir = mkdtempSync(join(tmpdir(), "arch-"));
    writeFileSync(join(dir, "a.js"), "");
    writeFileSync(join(dir, "b.ts"), "");
    writeFileSync(join(dir, "c.css"), "");
    expect(files(dir).map((f) => relative(dir, f)).sort()).toEqual(["a.js", "b.ts"]);
  });

  it("web/index.html only references files inside web/", () => {
    const html = readFileSync(join(root, "web", "index.html"), "utf8");
    const refs = [...html.matchAll(/\b(?:src|href)\s*=\s*["']([^"'#][^"']*)["']/g)].map((m) => m[1]!);
    const local = refs.filter((r) => !/^[a-z][a-z0-9+.-]*:/i.test(r));
    expect(local.length).toBeGreaterThan(0);
    for (const r of local) {
      const target = r.startsWith("/") ? join(root, r) : resolve(join(root, "web"), r);
      expect(relative(join(root, "web"), target).startsWith(".."), `${r} escapes web/`).toBe(false);
      expect(r.startsWith("/src"), `${r} points at the backend`).toBe(false);
    }
  });

  it("only the sqlite adapter opens the database", () => {
    const openers = sourceFiles().filter((f) => /new DatabaseSync/.test(readFileSync(f, "utf8")));
    expect(openers.map((f) => relative(root, f)).sort()).toEqual([
      "src/infrastructure/sqlite/openCatalog.ts",
    ]);
  });
});
