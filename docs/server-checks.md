# Server checks

What runs where nobody can skip it, and the settings that make "nobody" true. The workflows only *advise* until step 3 is done.

| Check (job name) | File | What it repeats from local |
|---|---|---|
| `verify` | `.github/workflows/verify.yml` | `npm run verify`: typecheck, tests (incl. `tests/architecture.test.ts`), build, browser e2e. Catalog fetched with its SHA-256 check |
| `branch-name` | same | `.githooks/branch-policy.sh`, the file the local hooks use |
| `agent-run` | same | `npm run check:agent-run` (bwrap masks `data/app.db`, strips `BATCH_*`). Exit 2 ("cannot run") is red here |
| `guard` | `.github/workflows/judges-guard.yml` | New on the server: a PR that touches a rule that judges the work stays red until the approver labels it |

## The guard

- List of judged paths: `JUDGES` in `scripts/ci/judges-guard.ts`. `tests/judges-guard.test.ts` fails if a path denied to the agent in `.claude/settings.json` is missing from it. `package.json` counts only when `scripts`, `engines` or `type` change.
- It runs from the **base** branch (`pull_request_target`) and never executes PR code, so a PR cannot edit it to pass.
- Unblock: the user in the repository variable `JUDGES_APPROVER` applies the label `judges-approved` after reading the diff. Any new push removes the label. If the variable is unset, nobody can approve (fails closed).
- The PR comment lists each file, lines added/removed and heuristic signals (skipped tests, `--no-verify`, `|| true`, fewer assertions, wider import allowlist). Signals explain the alarm; the gate is the path.
- Limit: if the agent pushes with the same GitHub account as the approver, its token can apply the label too. Use a separate account or token for the agent, or treat the label as a speed bump.

## One-time setup (needs repo admin)

1. Repository variable: `gh variable set JUDGES_APPROVER --body <github-login>`
2. Label: `gh label create judges-approved --color B60205 --description "Approver read the diff of a rule that judges the work"`
3. Ruleset for `main` (Settings → Rules → Rulesets), no bypass list:
   - Require a pull request before merging
   - Require status checks to pass: `verify`, `branch-name`, `agent-run`, `guard`
   - Block force pushes; restrict deletions
   - If the plan allows "Restrict branch names", add `^(feat|fix|chore|test|docs|refactor)/[a-z0-9-]+$` so a badly named branch cannot even be pushed. Otherwise `branch-name` is the only server check.
4. Settings → Actions → General: "Require approval for all outside collaborators"; workflow token default permissions read-only (the jobs ask for what they need).

## Known limits

- The first PR that adds `judges-guard.yml` is not guarded by it (the base branch has no guard yet). Review it by hand.
- `agent-run` was written without a runner to try it on: expect to adjust the AppArmor line the first time.
- Pushing to a branch *without* a PR runs only `branch-name`; `verify` runs on PRs and on `main`.
