import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === "dist" || f === "node_modules" ? [] : files(p);
    return /\.ts$/.test(p) ? [p] : [];
  });
}

function imports(src: string): string[] {
  return [...src.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1]!);
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

function violations(list: Source[]): string[] {
  const out: string[] = [];
  for (const { file: f, src } of list) {
    const from = layerOf(f);
    if (!from) continue;
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
    expect(violations(load([...files(join(root, "src")), ...files(join(root, "web"))]))).toEqual([]);
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

  it("only the sqlite adapter opens the database", () => {
    const openers = [...files(join(root, "src")), ...files(join(root, "web"))].filter((f) => /new DatabaseSync/.test(readFileSync(f, "utf8")));
    expect(openers.map((f) => relative(root, f)).sort()).toEqual([
      "src/infrastructure/sqlite/openCatalog.ts",
    ]);
  });
});
