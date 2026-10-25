# smell-export-hosted-read-only

- The row's own label: `smell/probe script export-hosted-read-only.mjs`
- Instrument:
  `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/export-hosted-read-only.mjs`
- Roster verdict at the time of this lane: NOT-RUNNABLE, bucket WORKING ON IT,
  blocker WORKING ON IT (re-measured 2026-10-23, round two).
- This lane's disposition: NAMED, not closed. The row's verification is a
  browser walk of the live hosted edge, which no lane may run.

## What this lane re-verified first hand, in this session

- The instrument takes a fresh label and one of exactly two authorized edge
  origins (`https://culturesmith-edge.bunny.run`,
  `https://culturesmith-b-edge.bunny.run`) and refuses any other origin (its
  own line 5), then drives the harness browser over that origin and writes
  page content and screenshots under `hosted-edge-current/<label>/`.
- The walk it performs is the same multi-page live-host walk as the sibling
  discovery row, and this batch's guard puts the culturesmith host off limits
  outright; the live-host rule for these lanes allows one batched
  confirmation fetch per URL at the end of a lane, never a page walk.
- Unlike the sibling, the instrument's one-shot output directory is NOT the
  blocker here: it takes a fresh label, so its output shape admits a run.
  The blocker is the walk itself.

## The mechanism that blocks the close

The row's answer exists only as the output of a page walk against the live
hosted edge, and no lane may walk the hosted edge: the walk needs an operator
decision to authorize. A single batched confirmation fetch cannot substitute,
because the instrument's answer is the per-page observations of a walk, not a
one-URL confirmation.

## What this lane did not do

It made no request to either authorized edge origin, opened no browser
session, and consumed no label.

Branch: `port/workbatch-g-20261025` in KatsuJinCode/decko-ts, base
`deploy/full-candidate-20261101` tip `c17906db`.
