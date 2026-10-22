# Row smell-verify-candidate-freshness

Family row conversion, 2026-10-22. Disposition: DONE.

- Roster row: `smell-verify-candidate-freshness` (roster file: `C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`)
- Instrument: `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/verify-candidate-freshness.mjs`
- What this lane did: Ran it against the CURRENT candidate, with a fresh receipt label, in a copy of the evidence tree.
- Command: `node verify-candidate-freshness.mjs e8b70ad3aa85c75f9247d2cd1af747e4bf740505 lane-freshness-20261022-r1`
- Observed: Exit 0. The receipt: source e8b70ad3aa85c75f9247d2cd1af747e4bf740505, primary 34c31a71223e93c4599edd24d59b0d10428154bd, commonBase 8268a1459090bac925cf7d82131f585650f72c20, primaryIncluded false, missingCommittedCaptureInputs [], primaryWorkingTreeDirty ["M src/card/drivers/bunny-db.ts"], pass true.
- Gap, in one mechanism sentence: none: the guard's own rule (no committed runtime or capture input is missing from the candidate) is satisfied for the current candidate, and the two caveats it records are in the receipt: the primary is not an ancestor of the candidate, and the primary's working tree carries one modified file, which the receipt records rather than copies.
- Pin: the fresh receipt lane-freshness-20261022-r1.json is this row's evidence; the guard's scope line states it is a launch guard and not test or hosted acceptance.

## Disposition

`DONE`. The row's blocker was that the freshness check was FAIL by design against a candidate that is no longer current. The check ran against the current candidate and passes, with its two caveats recorded rather than hidden, so the row's verification is a passing measurement of the tree that is shipping.
