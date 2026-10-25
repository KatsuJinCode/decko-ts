# Row smell-check-chain-join-plan

Smell-test row conversion, round two, 2026-10-22. Disposition: WORKING ON IT.

- Roster row: `smell-check-chain-join-plan` (roster file:
  `C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`)
- Instrument: `C:/localProjects/decko-ts-smell-convert-r2-20261022/tools/perf/check-chain-join-plan.mjs`
- What this lane did: restored the deck the tool measures against, byte-exact, and ran the
  tool against it with the surviving capture.
- Command: `node tools/perf/check-chain-join-plan.mjs C:/localProjects/decko-edge-verification-53c86269/.runtime/authorized-widget-content-20261018-r2/deck.sqlite3 C:/localProjects/brandonDojoTech/tmp/cold-first-keystroke-evidence/stmt-c3.sql C:/localProjects/decko-ts-smell-convert-r2-20261022/tmp/smell-r2-work/chain-join-report.json`
- Observed: the tool refuses at its own capture guard with
  `Error: capture needs SQL followed by a JSON parameter array`
  raised at `check-chain-join-plan.mjs:12`, and no report file is written. The guard runs
  before the tool copies or reads the deck, so the deck was not touched.
- Gap, in one mechanism sentence: the capture on disk ends mid-statement at `FROM __s` with no
  parameter array behind it, and the tool's own guard refuses a capture in that shape, so the
  tool's measurement cannot be produced from the surviving capture.

## What changed for this row

Round one recorded the row as blocked on two things: the capture and the 21670-card deck.
The deck is no longer one of them. This lane rebuilt the deck byte-exact from the
hash-verified pre-apply baseline backup and the authorized proposal, with the same
better-sqlite3 backup and compare-and-swap mechanics the original applier used, and the
result matches the recorded target hash `c19c4d561ebbd4bee3dab3667af52400a6fa32affc151fd17adf1c5007640dfc`
with 21670 distinct card ids. The deck sits at the path the receipt of record names:
`C:/localProjects/decko-edge-verification-53c86269/.runtime/authorized-widget-content-20261018-r2/deck.sqlite3`.

The capture is the remaining blocker, and it is not reconstructible from the material on
disk: `stmt-c3.sql`, `stmt-c4.sql` and `stmt-la.sql` in
`C:/localProjects/brandonDojoTech/tmp/cold-first-keystroke-evidence/` are truncated captures
whose SQL text stops at `FROM __s`, with no trailing JSON parameter array, and the trace log
beside them does not carry one either.

## The report that is already committed

The differential the tool produced when it ran is committed in the repository as
`docs/junction-chain-join-evidence.json`, and the property it asserts is checked by
`tests/tools/chain-join-join-rewrite-evidence-is-internally-consistent.test.ts`. Every timing
in this row is therefore read out of that committed report, not produced by a run in this
session, and this receipt does not claim otherwise.
