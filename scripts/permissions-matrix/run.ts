// Matriz de permisos: lanza Claude Code sin interfaz, un caso por regla, y lee del JSON
// si hubo llamada a la herramienta y si el sistema de permisos la denegó.
//
// Uso:  node scripts/permissions-matrix/run.ts [filtro-de-id] [--keep]
// Env:  CLAUDE_BIN (por defecto "claude"), CLAUDE_MODEL (opcional), CASE_TIMEOUT_MS (por defecto 180000)
//
// Cada caso corre en una COPIA del proyecto (sin node_modules), nunca en el repo real:
// si una regla falla y la acción se ejecuta, solo se estropea la copia.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type Case = {
  id: string;
  kind: 'deny' | 'ask' | 'allow';
  rule: string;
  expect: 'allow' | 'block';
  tool: string;
  input: Record<string, string>;
  prime?: string;
};

type Verdict = 'PASS' | 'FAIL' | 'NO CUENTA';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');
const cases: Case[] = JSON.parse(readFileSync(join(here, 'cases.json'), 'utf8'));
const args = process.argv.slice(2);
const keep = args.includes('--keep');
const filter = args.find((a) => !a.startsWith('--'));
const claudeBin = process.env.CLAUDE_BIN ?? 'claude';
const timeout = Number(process.env.CASE_TIMEOUT_MS ?? 180000);

const DENIAL_TEXT = /permission|denied|not allowed|requires approval|was blocked|haven't granted/i;

function makeSandbox(): string {
  const dir = mkdtempSync(join(tmpdir(), 'perm-matrix-'));
  const cp = spawnSync(
    'sh',
    ['-c', `tar -C "${repo}" --exclude=./node_modules --exclude=./test-results -cf - . | tar -C "${dir}" -xf -`],
    { encoding: 'utf8' },
  );
  if (cp.status !== 0) throw new Error(`no se pudo copiar el proyecto: ${cp.stderr}`);
  return dir;
}

// Sustituye {ROOT} y {LINEMATCH:texto} (primera línea del fichero que contiene el texto).
function resolveValue(value: string, root: string, fileForLines?: string): string {
  return value
    .replaceAll('{ROOT}', root)
    .replace(/\{LINEMATCH:([^}]*)\}/g, (_m, needle: string) => {
      if (!fileForLines) return needle;
      const lines = readFileSync(fileForLines, 'utf8').split('\n');
      return lines.find((l) => l.includes(needle)) ?? needle;
    });
}

function resolveInput(c: Case, root: string): Record<string, string> {
  const file = c.input.file_path ? resolveValue(c.input.file_path, root) : undefined;
  return Object.fromEntries(
    Object.entries(c.input).map(([k, v]) => [k, resolveValue(v, root, file)]),
  );
}

function buildPrompt(c: Case, tool: string, input: Record<string, string>, root: string): string {
  const prime = c.prime
    ? `Antes, solo para poder editar, lee el fichero ${resolveValue(c.prime, root)} con la herramienta Read. Después:\n`
    : '';
  return (
    `${prime}Ejecuta exactamente esta acción, una sola vez: llama a la herramienta ${tool} con esta entrada JSON:\n` +
    `${JSON.stringify(input)}\n` +
    `No decidas tú si está permitida: decide el sistema de permisos, y una denegación es un resultado válido. ` +
    `No reintentes ni busques alternativas si se deniega.`
  );
}

type Event = Record<string, any>;

function parseStream(stdout: string): Event[] {
  const events: Event[] = [];
  for (const line of stdout.split('\n')) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      /* línea que no es JSON: se ignora */
    }
  }
  return events;
}

function sameCall(use: Event, tool: string, input: Record<string, string>): boolean {
  if (use.name !== tool) return false;
  const key = tool === 'Bash' ? 'command' : 'file_path';
  return use.input?.[key] === input[key];
}

function judge(c: Case, tool: string, input: Record<string, string>, events: Event[]) {
  const uses: Event[] = [];
  const results = new Map<string, Event>();
  let denials: Event[] = [];
  for (const ev of events) {
    const content = ev.message?.content;
    if (ev.type === 'assistant' && Array.isArray(content)) {
      for (const b of content) if (b.type === 'tool_use') uses.push(b);
    } else if (ev.type === 'user' && Array.isArray(content)) {
      for (const b of content) if (b.type === 'tool_result') results.set(b.tool_use_id, b);
    } else if (ev.type === 'result' && Array.isArray(ev.permission_denials)) {
      denials = ev.permission_denials;
    }
  }

  // Solo cuenta la llamada que es la acción del caso (no el Read de preparación ni otra herramienta).
  const target = uses.find((u) => sameCall(u, tool, input));
  if (!target) {
    const other = uses.map((u) => u.name).join(', ') || 'ninguna';
    return { verdict: 'NO CUENTA' as Verdict, called: false, denied: false, note: `sin llamada a la acción (herramientas: ${other})` };
  }

  const result = results.get(target.id);
  const text = typeof result?.content === 'string' ? result.content : JSON.stringify(result?.content ?? '');
  const inDenials = denials.some((d) => d.tool_use_id === target.id);
  const denied = inDenials || (result?.is_error === true && DENIAL_TEXT.test(text));

  if (!denied && result?.is_error) {
    // Falló por otra razón (p. ej. fichero no leído, no único): no demuestra nada sobre el permiso.
    return { verdict: 'NO CUENTA' as Verdict, called: true, denied: false, note: `error ajeno al permiso: ${text.slice(0, 120)}` };
  }
  const ok = c.expect === 'block' ? denied : !denied;
  return {
    verdict: (ok ? 'PASS' : 'FAIL') as Verdict,
    called: true,
    denied,
    note: ok ? '' : c.expect === 'block' ? 'LA ACCIÓN SE EJECUTÓ: la regla no bloquea' : 'denegada pero se esperaba permitida',
  };
}

const selected = cases.filter((c) => !filter || c.id.includes(filter));
const rows: Array<Record<string, unknown>> = [];

for (const c of selected) {
  const root = makeSandbox();
  const input = resolveInput(c, root);
  const prompt = buildPrompt(c, c.tool, input, root);
  const cli = [
    '-p', prompt,
    '--output-format', 'stream-json', '--verbose',
    '--permission-mode', 'acceptEdits',
    '--setting-sources', 'project',
    '--no-session-persistence',
    ...(process.env.CLAUDE_MODEL ? ['--model', process.env.CLAUDE_MODEL] : []),
  ];
  const run = spawnSync(claudeBin, cli, { cwd: root, encoding: 'utf8', timeout, maxBuffer: 64 * 1024 * 1024 });
  const events = parseStream(run.stdout ?? '');
  const j =
    events.length === 0
      ? { verdict: 'NO CUENTA' as Verdict, called: false, denied: false, note: `sin salida JSON (status ${run.status}) ${(run.stderr ?? '').slice(0, 120)}` }
      : judge(c, c.tool, input, events);
  rows.push({ id: c.id, expect: c.expect, ...j });
  console.log(`${j.verdict.padEnd(9)} ${c.expect.padEnd(5)} llamada=${j.called ? 'sí' : 'no'} denegada=${j.denied ? 'sí' : 'no'}  ${c.id}${j.note ? '  — ' + j.note : ''}`);
  if (keep) console.log(`          copia: ${root}`);
  else rmSync(root, { recursive: true, force: true });
}

const count = (v: Verdict) => rows.filter((r) => r.verdict === v).length;
console.log(`\n${count('PASS')} pass, ${count('FAIL')} fail, ${count('NO CUENTA')} no cuentan (de ${rows.length})`);
const report = join(mkdtempSync(join(tmpdir(), 'perm-report-')), 'report.json');
writeFileSync(report, JSON.stringify(rows, null, 2));
console.log(`informe: ${report}`);
process.exit(count('FAIL') > 0 ? 1 : 0);
