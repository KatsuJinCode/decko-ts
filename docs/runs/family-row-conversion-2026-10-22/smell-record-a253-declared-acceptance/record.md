# Row smell-record-a253-declared-acceptance

Family row conversion, 2026-10-22. Disposition: DONE.

- Roster row: `smell-record-a253-declared-acceptance` (roster file: `C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`)
- Instrument: `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/record-a253-declared-acceptance.mjs`
- What this lane did: Ran it, after restoring the pinned checkout the row names as its unblock, in a copy of the evidence tree so the receipt of record was not overwritten.
- Command: `node record-a253-declared-acceptance.mjs (run in a copy of the evidence tree)`
- Observed: Exit 0. The receipt it wrote: source a25329a805202bf4ee5879f084fd028c90058215, sourceClean true, freshness pass 8 of 8 (vitest exit 0), rootValidator pass 3 of 3 (exit 0), and its own scope line naming the two layers. Compared against the committed record of record: the two are IDENTICAL field for field, apart from the timestamp.
- Gap, in one mechanism sentence: none: the row's verification ran clean and its output reproduces the record of record byte for byte apart from the timestamp.
- Pin: the fresh receipt is this row's evidence; the record of record is recovery/release/private-probes/private-tool-repairs-20261018/a253-declared-acceptance.json in the evidence repo.

## Disposition

`DONE`. The row's blocker was the missing pinned clean checkout, and the run was impossible with a gutted tree. That checkout is restored at a25329a8, the script ran clean, and its output reproduces the receipt of record exactly, so the row's verification is now a passing, reproducible measurement rather than a claim.
