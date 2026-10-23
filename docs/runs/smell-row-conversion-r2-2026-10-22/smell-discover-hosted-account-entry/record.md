# Row smell-discover-hosted-account-entry

Smell-test row conversion, round two, 2026-10-22. Disposition: WORKING ON IT.

- Roster row: `smell-discover-hosted-account-entry` (roster file:
  `C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`)
- Instrument: `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/discover-hosted-account-entry.mjs`
- What this lane did: read the instrument and established what it would do on the live
  hosted edge, and which of its dependencies are now in place.
- Command: not run; the instrument drives a headless browser over the live hosted edge.
- Observed, first hand: the two modules the instrument imports resolve, because
  `C:/localProjects/decko-edge-verification-b00a4503/tools/edge-signed-in-exercise/lib/harness-browser.mjs`
  and `C:/localProjects/decko-edge-verification-b00a4503/reference-harness/browser/lib/live-walk-profile.mjs`
  are present in the restored pinned checkout, which now sits at the pinned commit
  `b00a450329af801915ae9dbc4668cf9a08ef628c`. The instrument targets the origin
  `https://culturesmith-edge.bunny.run` and visits the routes `/new/Sign_up` and
  `/*signin/edit?slot[hide][]=board_link`, recording the page status, the main text, the
  forms and the links of each page, plus the browser console errors and the blocked assets.
- Gap, in one mechanism sentence: the row's verification is a multi-page browser walk of the
  live hosted edge, and the live-host rule for this lane allows one batched confirmation
  fetch per URL at the end of the lane, never a page walk, so the walk this instrument
  performs is outside what this lane may run.

## The second, independent blocker

The instrument creates its output directory with the non-recursive create flag, so the
directory `hosted-account-entry-discovery-20261019-r1/` must not already exist. It does
already exist in the evidence tree, together with the receipt of the original run, so a
fresh run would need a fresh output directory as well as the walk itself.

## What this lane did not do

This lane made no request to the live hosted edge, opened no browser session against it, and
wrote nothing under the instrument's own output names.
