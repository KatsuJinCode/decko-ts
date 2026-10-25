# Row smell-verify-hosted-widget-views

Smell-test row conversion, round two, 2026-10-22. Disposition: WORKING ON IT.

- Roster row: `smell-verify-hosted-widget-views`
- Instrument: `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/verify-hosted-widget-views.mjs`
- What this lane did: read the instrument, established what it would do, and established
  which of its dependencies are in place.
- Command: not run; the instrument drives a browser over the live hosted edge.
- Observed, first hand: the instrument resolves `playwright-core` through the pinned
  checkout's own `package.json` anchor, so the anchor blocker round one recorded is gone,
  and it looks for a local Chrome or Edge executable. It then opens the twelve card
  addresses of the authorized content migration in that browser, which is a page walk of
  the live hosted edge.
- Gap, in one mechanism sentence: the row's verification is a browser walk of the live
  hosted edge, and the live-host rule for this lane allows one batched confirmation fetch
  per URL at the end of the lane, never a page walk, so the walk this instrument performs
  is outside what this lane may run.

## The receipt of record, and the downstream custody it protects

The receipt of record `remote-widget-cas/hosted-content-view-readback.json` is read by the
sibling row `smell-retire-owned-migration-credential` as part of its custody check, so a
re-run that overwrites it would change the custody state of a live credential decision.
That is a second reason not to run it here, on top of the page-walk allowance.

## What this lane did instead

The one batched confirmation fetch this lane was allowed at the end of the lane was spent on
the sibling row `smell-verify-hosted-widget-content`, whose result is recorded there: the
twelve card JSON addresses answer 404. That measurement is a fetch of the same addresses
this row would walk, so the live host's answer for those addresses is on the record, but
this row's own view-level evidence was not produced.
