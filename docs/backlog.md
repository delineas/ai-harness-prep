# Backlog

From the harness audit (step 09) and what is left of the specs.

1. **UI:** in the detail panel, a line chart with the title's rank in the weekly top 10, week by week, with a text alternative (spec 03, "Top 10 history of a title").
2. **API:** `GET /api/titles/:kind/:id/top10-history` with the rank per week (spec 03).
3. Nothing stops a dependency with `^`, `~` or `tsx` from coming back (incident I6 has no automatic control).
4. `scripts/hooks/edit-feedback.sh` and `stop-verify.sh` have no tests.
5. `no-hook-bypass` blocks reading `core.hooksPath`, not only changing it (false positive).
6. The rest of spec 03: relations, hours by semester chart, analyst mode.
