#!/bin/sh
# Launch an adapter so that a crash BLOCKS. Claude/Codex treat only exit 2 as a block;
# a node crash (exit 1), missing file or syntax error would otherwise let the command run.
# usage: sh harness/fail-closed.sh claude|codex
d=$(dirname "$0")
node "$d/$1.ts"; c=$?
if [ "$c" -ne 0 ] && [ "$c" -ne 2 ]; then
  echo "Blocked: the guard hook failed (adapter '$1' exited $c). Tell the human." >&2
  exit 2
fi
exit "$c"
