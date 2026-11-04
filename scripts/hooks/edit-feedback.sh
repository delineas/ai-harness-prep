#!/usr/bin/env bash
# PostToolUse hook for Edit|Write|MultiEdit: quick feedback after each edit.
# Runs only the typecheck (fast), never verify/e2e. On errors it hands them back to Claude (exit 2).
set -u
cat >/dev/null
cd "$(git rev-parse --show-toplevel)" || exit 0

changed=$(git status --porcelain | wc -l | tr -d ' ')

if out=$(timeout 60 npm run --silent typecheck 2>&1); then
  node -e 'console.log(JSON.stringify({systemMessage:`✓ typecheck ok · ${process.argv[1]} fichero(s) con cambios`}))' "$changed"
  exit 0
fi

printf 'typecheck falla tras la edición:\n%s\n' "$(printf '%s' "$out" | tail -n 25)" >&2
exit 2
