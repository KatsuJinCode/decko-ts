# Row smell-qualify-lexicon-corpus-equivalence

Smell-test row conversion, round two, 2026-10-22. Disposition: DONE.

- Roster row: `smell-qualify-lexicon-corpus-equivalence`
- Instrument: `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/qualify-lexicon-corpus-equivalence.mjs`
- What this lane did: put the byte-restored input deck at the path the instrument's guard
  demands and ran the instrument in a copy of the evidence tree.
- Command: `node qualify-lexicon-corpus-equivalence.mjs` (run in the copy of the evidence
  tree at `.../tmp/smell-r2-work/evidence/private-tool-repairs-20261018`).
- Observed: the instrument passed every guard and returned `pass: true`,
  `validDistinctNumericIds` 21670, `nullIdRows` 6, `orders` 3, `zeroMismatches: true`. Its
  receipt records the input hash as
  `c19c4d561ebbd4bee3dab3667af52400a6fa32affc151fd17adf1c5007640dfc`, which is the hash the
  authorized application receipt names as the deck's target, and records the source as clean
  and the input as unchanged at execution.
- Evidence in this directory: `fresh-qualified-receipt.json`, the instrument's own output.
  It is identical to the receipt of record,
  `lexicon-whole-corpus-equivalence/qualified-receipt.json`, field for field apart from the
  `at` timestamp.
- Gap, in one mechanism sentence: none; the row's own verification ran and passed, and its
  output reproduces the record of record.

## What changed for this row

Round one recorded the row as blocked because the input deck is a build output git does not
carry, and because the `createRequire` anchor for `better-sqlite3` could not resolve. Both
are now in place: the deck was rebuilt byte-exact from the hash-verified pre-apply baseline
backup and the authorized proposal, using the same better-sqlite3 backup and
compare-and-swap mechanics the original applier used, and it was placed at the path the
instrument hashes, `C:/localProjects/decko-edge-verification-53c86269/.runtime/authorized-widget-content-20261018-r2/deck.sqlite3`.
The `better-sqlite3` anchor resolves through the pinned checkout's own `package.json`, with
version 13.0.3.

## The scope the instrument states, carried forward

The receipt's own scope line reads: a derived denominator correction from a preserved
completed execution, no rerun of the corpus, no source and no data mutation, and the map
result keys are distinct requested ids rather than input rows. This receipt closes the row
on that scope and claims nothing wider.
