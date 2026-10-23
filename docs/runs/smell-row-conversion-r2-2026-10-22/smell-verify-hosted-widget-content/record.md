# Row smell-verify-hosted-widget-content

Smell-test row conversion, round two, 2026-10-22. Disposition: WORKING ON IT.

- Roster row: `smell-verify-hosted-widget-content`
- Instrument: `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/verify-hosted-widget-content.mjs`
- What this lane did: spent the lane's one batched confirmation fetch against the live
  hosted edge, one fetch per URL, in a single round at the end of the lane, and ran the
  instrument in a fresh output directory so that the receipt of record was not overwritten.
- Command: `node verify-hosted-widget-content.mjs` (run in a fresh output directory, with
  the instrument's own output path empty).
- Observed: the round issued exactly one fetch per URL, twelve URLs, all against
  `https://culturesmith-edge.bunny.run`, and every one of them answered 404. The
  instrument's own verdict is `pass: false`, because the pass condition requires all twelve
  responses to be 200 with the exact authorized content and without the legacy loader. The
  receipt of record, `remote-widget-cas/hosted-readback.json`, records the same twelve 404
  responses and the same `pass: false`.
- Evidence in this directory: `fresh-hosted-readback.json`, the instrument's own output.
- Gap, in one mechanism sentence: the live hosted edge answers 404 for every one of the
  twelve card JSON addresses the authorized content migration targets, so the migrated
  content is not observable on the live host and the row's acceptance cannot be met from
  here.

## What this lane did to the live host

One batched confirmation fetch per URL, twelve URLs, one round, at the end of the lane, and
nothing else: no loop, no repeat, no page walk, no write. The target is the Bunny-hosted
edge and not the `.com` domain, and the read is twelve card reads against an allowance of
100000 row-reads a day that Brandon's real readers share. The instrument's own scope line
reads: anonymous read-only exact twelve numeric JSON card responses after the authorized
content migration, with no `.com` and no browser or desktop control.

## Why the row stays open

The verification ran and produced a definite answer, and the answer is negative. The
family's convention is that a row whose own verification returns a failing verdict stays
open with the gap named, so this row stays `WORKING ON IT` with the 404 on all twelve
addresses as its gap.
