# smell-discover-hosted-navigation

- The row's own label: `smell/probe script discover-hosted-navigation.mjs`
- Instrument:
  `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/discover-hosted-navigation.mjs`
- Roster verdict at the time of this lane: NOT-RUNNABLE, bucket WORKING ON IT,
  blocker WORKING ON IT (re-measured 2026-10-23, round two).
- This lane's disposition: NAMED, not closed. The row's verification is a
  multi-page browser walk of the live hosted edge, which no lane may run.

## What this lane re-verified first hand, in this session

- The instrument pins the live origin
  `https://culturesmith-edge.bunny.run` at its own line 4 and walks eight
  routes of that origin (`/Make_Contact`, `/Subscribe_to_my_newsletter`,
  `/Conflict_Done_Well`, `/Aikido_Oak_Cliff`, `/blog`, `/*search`,
  `/account/signup`, `/*signin`), driving the harness browser against each.
- The instrument is one-shot by construction: it creates
  `hosted-navigation-discovery-20261019-r1/` with the non-recursive create
  flag, and that directory stands in the evidence tree with the original
  run's captured pages (this session's directory read: `0.html` through the
  captured pages and the receipt).
- The batch's own guard names the same boundary from the other side: the
  culturesmith host is never touched by a lane, and nothing deploys.

## The mechanism that blocks the close

The row's answer can only be produced by pointing a headless browser at the
live hosted edge and walking eight pages of it. The live-host rule for these
lanes allows one batched confirmation fetch per URL at the end of a lane,
never a page walk, and this batch's guard puts the culturesmith host off
limits outright. An eight-route walk is outside both. In addition the
instrument's own output directory is consumed, so even an authorized run
would first need a fresh output name. Producing the row's verification needs
an operator decision to authorize the walk; nothing a lane can rebuild
substitutes for it.

## What this lane did not do

It made no request to the hosted edge, opened no browser session, and wrote
nothing under the instrument's own output names.

Branch: `port/workbatch-g-20261025` in KatsuJinCode/decko-ts, base
`deploy/full-candidate-20261101` tip `c17906db`.
