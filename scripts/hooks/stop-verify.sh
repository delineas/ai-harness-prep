#!/usr/bin/env bash
# Stop hook: decide by `git status`, not by which tools were used.
#  - clean tree            -> allow stop
#  - dirty + verify green  -> allow stop
#  - dirty + verify red    -> block once and hand the output back
#  - red again while already following a block (stop_hook_active) -> allow stop with a visible warning
set -u
input=$(cat)
cd "$(git rev-parse --show-toplevel)" || exit 0

[ -z "$(git status --porcelain)" ] && exit 0

active=$(printf '%s' "$input" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).stop_hook_active===true)}catch{console.log(false)}})')

out=$(npm run verify 2>&1) && exit 0

if [ "$active" = "true" ]; then
  node -e 'console.log(JSON.stringify({systemMessage:"⚠ npm run verify SIGUE EN ROJO tras un reintento. Claude se detiene sin haberlo arreglado. Revisa la salida."}))'
  exit 0
fi

printf 'npm run verify está en rojo. Arréglalo o explica el bloqueo. Últimas líneas:\n%s\n' "$(printf '%s' "$out" | tail -n 40)" >&2
exit 2
