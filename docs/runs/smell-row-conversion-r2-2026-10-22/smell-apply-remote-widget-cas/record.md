# Row smell-apply-remote-widget-cas

Smell-test row conversion, round two, 2026-10-22. Disposition: WORKING ON IT.

- Roster row: `smell-apply-remote-widget-cas` (roster file:
  `C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`)
- Instrument: `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/apply-remote-widget-cas.mjs`
- What this lane did: ran the row's own instrument in a copy of the evidence tree, far enough to
  establish the first-hand fact of where it stops.
- Command: `node apply-remote-widget-cas.mjs` (run in the copy of the evidence tree at
  `C:/localProjects/decko-ts-smell-convert-r2-20261022/tmp/smell-r2-work/evidence/private-tool-repairs-20261018`)
- Observed: the instrument stops at the credential read with
  `Error: ENOENT: no such file or directory, open 'C:\localProjects\decko-edge-verification-53c86269\.runtime\owned-cs-edge-cleanup-20261018.env'`
  raised at `apply-remote-widget-cas.mjs:6`. That is before the intent write and before any
  database traffic, so this lane made no live request.
- Gap, in one mechanism sentence: the row's verification is a compare-and-swap UPDATE against
  the live production database, and the credential it needs was deliberately retired, so the
  write cannot be re-run and the only way to produce the row's answer would be to mint a new
  live account credential, which is an operator decision.

## The state the record of record already holds

The one-shot outputs of this instrument are present in the evidence tree:
`remote-widget-cas/apply-intent.json`, `remote-widget-cas/apply-receipt.json` and
`remote-widget-cas/after.json`, next to `plan.json` and `before.json`. The production
compare-and-swap already executed and its receipt is the verdict of record for the write
itself. The instrument's own design refuses a second run: `apply-intent.json` is written with
the exclusive-create flag, so a re-run would fail there even with a credential in hand.

## What this lane did not do

This lane did not mint a credential, did not touch the production database, and did not
rewrite any receipt of record.
