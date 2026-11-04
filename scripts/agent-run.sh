#!/usr/bin/env bash
# Run any agent CLI (claude, codex, opencode, ...) inside a bubblewrap sandbox:
#   data/app.db      -> masked with /dev/null
#   data/catalog.db  -> read-only copy WITHOUT the BATCH_* tables
# Usage: scripts/agent-run.sh codex   |   scripts/agent-run.sh -- opencode
set -euo pipefail
[ "${1:-}" = "--" ] && shift
[ $# -gt 0 ] || { echo "usage: $0 <command...>" >&2; exit 2; }
root=$(cd "$(dirname "$0")/.." && pwd)
data=${AGENT_DATA_DIR:-$root/data}            # overridable for tests
cache=${XDG_CACHE_HOME:-$HOME/.cache}/netflix-explorer
strip=$cache/catalog.nobatch.db
mkdir -p "$cache"
if [ ! -f "$strip" ] || [ "$data/catalog.db" -nt "$strip" ]; then
  rm -f "$strip"
  node --input-type=module -e '
    import { DatabaseSync } from "node:sqlite";
    import { copyFileSync } from "node:fs";
    const [src, dst] = process.argv.slice(1);
    copyFileSync(src, dst);
    const db = new DatabaseSync(dst);
    for (const { name } of db.prepare("select name from sqlite_master where type=\x27table\x27 and name like \x27BATCH\\_%\x27 escape \x27\\\x27").all())
      db.exec(`drop table "${name}"`);
    db.exec("vacuum"); db.close();
  ' "$data/catalog.db" "$strip"
  chmod 444 "$strip"
fi
args=(--bind / / --dev-bind /dev /dev --die-with-parent)
args+=(--ro-bind /dev/null "$data/app.db")
args+=(--ro-bind "$strip" "$data/catalog.db")
# hooks, policy and this launcher are read-only for the agent
[ -d "$root/.githooks" ] && args+=(--ro-bind "$root/.githooks" "$root/.githooks")
args+=(--ro-bind "$root/scripts/agent-run.sh" "$root/scripts/agent-run.sh")
[ -e "$root/.git/config" ] && args+=(--ro-bind "$root/.git/config" "$root/.git/config")
exec bwrap "${args[@]}" -- "$@"
