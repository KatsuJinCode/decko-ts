# Row smell-export-hosted-read-only

Smell-test row conversion, round two, 2026-10-22. Disposition: WORKING ON IT.

- Roster row: `smell-export-hosted-read-only`
- Instrument: `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/export-hosted-read-only.mjs`
- What this lane did: read the instrument and established what it would do, and which of its
  dependencies are in place.
- Command: not run; the instrument drives a headless browser over the live hosted edge.
- Observed, first hand: the instrument takes a fresh label and one of the two authorized
  edge origins, `https://culturesmith-edge.bunny.run` or
  `https://culturesmith-b-edge.bunny.run`, and refuses any other origin. It imports the
  harness browser and the live-walk profile from the pinned checkout, and both are present
  now: `C:/localProjects/decko-edge-verification-b00a4503/tools/edge-signed-in-exercise/lib/harness-browser.mjs`
  and `C:/localProjects/decko-edge-verification-b00a4503/reference-harness/browser/lib/live-walk-profile.mjs`,
  in the checkout restored at the pinned commit
  `b00a450329af801915ae9dbc4668cf9a08ef628c`. It creates its output directory with the
  non-recursive create flag under `hosted-edge-current/<label>/`, so a fresh label is
  accepted.
- Gap, in one mechanism sentence: the row's verification is a browser walk of the live
  hosted edge, and the live-host rule for this lane allows one batched confirmation fetch
  per URL at the end of the lane, never a page walk, so the walk this instrument performs
  is outside what this lane may run.

## What this lane did do against the same live host

The one batched confirmation fetch this lane was allowed at the end of the lane was spent on
the sibling hosted row `smell-verify-hosted-widget-content`, and its result is recorded
there. No fetch was spent on this row, so this row's hosted state is not measured here.

## What would close it

An operator decision to allow the page walk of the hosted edge, or an instrument that
confirms the same surfaces with one batched fetch per URL.
