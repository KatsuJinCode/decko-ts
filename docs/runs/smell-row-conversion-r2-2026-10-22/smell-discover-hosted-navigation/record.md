# Row smell-discover-hosted-navigation

Smell-test row conversion, round two, 2026-10-22. Disposition: WORKING ON IT.

- Roster row: `smell-discover-hosted-navigation` (roster file:
  `C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`)
- Instrument: `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/discover-hosted-navigation.mjs`
- What this lane did: read the instrument and established what it would do on the live
  hosted edge, and which of its dependencies are now in place.
- Command: not run; the instrument drives a headless browser over the live hosted edge.
- Observed, first hand: the two modules the instrument imports resolve in the restored pinned
  checkout `C:/localProjects/decko-edge-verification-b00a4503` at the pinned commit
  `b00a450329af801915ae9dbc4668cf9a08ef628c`. The instrument targets the origin
  `https://culturesmith-edge.bunny.run` and visits the routes `/Make_Contact`,
  `/Subscribe_to_my_newsletter`, `/Conflict_Done_Well`, `/Aikido_Oak_Cliff`, `/blog`,
  `/*search`, `/account/signup` and `/*signin`, recording the page status, the main text, the
  forms and the links of each page, plus the browser console errors and the blocked assets.
- Gap, in one mechanism sentence: the row's verification is a multi-page browser walk of the
  live hosted edge, for the same reason as the sibling hosted-discovery row, and the
  live-host rule for this lane allows one batched confirmation fetch per URL at the end of
  the lane, never a page walk.

## The second, independent blocker

The instrument creates its output directory with the non-recursive create flag, so the
directory `hosted-navigation-discovery-20261019-r1/` must not already exist. It does already
exist in the evidence tree, together with the receipt of the original run, so a fresh run
would need a fresh output directory as well as the walk itself.

## What this lane did not do

This lane made no request to the live hosted edge, opened no browser session against it, and
wrote nothing under the instrument's own output names.
