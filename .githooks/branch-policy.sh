# Single source of truth for the branch rule. Sourced by the hooks.
BRANCH_REGEX='^(feat|fix|chore|test|docs|refactor)/[a-z0-9-]+$'
BLOCKED_BRANCHES='main sin-harness'

branch_ok() { printf '%s' "$1" | grep -Eq "$BRANCH_REGEX"; }

branch_reject() {
  echo "branch policy: '$1' is not allowed to receive commits." >&2
  echo "  Use a branch named type/kebab-name, type in: feat fix chore test docs refactor." >&2
  echo "  Create one with: git switch -c feat/my-change" >&2
  exit 1
}
