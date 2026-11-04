---
name: ui-check
description: Use before saying any change is done, finished, ready or working when it touches the user interface (web/, index.html, CSS, the DTOs or HTTP responses the UI renders, src/interfaces/http). Makes you run the browser e2e tests AND look at real screenshots before claiming anything about the UI.
---

# UI check: no "done" without looking at the screen

Unit tests cannot see the screen (incident I1: an agent declared the UI done without ever opening it). Follow these steps **in order** for any UI-affecting change. Do not skip one because the change "looks small".

1. **Build and run the real checks:** `npm run verify`. It includes typecheck, unit tests, build and the Playwright e2e in a real browser (`e2e/*.spec.ts`: accessibility with axe in light/dark at 1280 and 360 px, keyboard focus, tap size, loading and error states, no console errors).
2. **Look at it:** `npm run ui:shots`, then open each PNG with the Read tool (`test-results/ui-shots/{light,dark}-{desktop,mobile}.png`). Check by eye what tests cannot judge: layout, overlap, truncated text, empty areas, a visible focus ring, readable dark mode. Say what you saw, per image, in one line.
3. **Test the new behaviour:** if you added or changed what a person can do or see, add an e2e test in `e2e/` that drives it like a person would (roles, labels and visible text, not CSS internals). Then **break the UI on purpose** (rebuild with `npx vite build` first, because the e2e serves `web/dist`), see that test go red, restore the file with `git checkout`, rebuild, and see it green. A test never seen failing is not evidence.
4. **Spec criteria** (`specs/spec-01-catalog.md`): labels on every input, visible focus, real buttons, AA contrast, no horizontal scroll at 360 px, hours in human format. Anything not covered by a test: check it in the screenshots and say so.

## Reporting

- All of 1–4 done: say which command passed (with counts) and what you saw in the screenshots.
- The browser cannot run (missing browser, no display, sandbox): say **"UI unverified"** and why. Do not imply it was checked, and do not substitute unit tests for it.
- Do not write e2e tests for features that do not exist yet (search, filters and detail are not built): a skipped test makes `npm run verify` fail on purpose.
- Never widen an allowlist, delete an assertion or loosen a threshold to turn a UI test green. Fix the UI, or ask.
