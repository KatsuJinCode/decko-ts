# Row smell-run-a253-live-walk-suite

Smell-test row conversion, round two, 2026-10-22. Disposition: DONE.

- Roster row: `smell-run-a253-live-walk-suite`
- Instrument: `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/run-a253-live-walk-suite.mjs`
- What this lane did: restored the preload artifact the instrument names, and ran the
  instrument in a fresh output directory so that the receipt of record was neither read nor
  overwritten.
- Commands:
  - the preload `C:/localProjects/decko-edge-verification-53c86269/.runtime/nest-cache-hidden-children-v2.cjs`
    was copied from `C:/localProjects/decko-ts-release-lead/.runtime/nest-cache-hidden-children-v2.cjs`,
    where it is on disk. It is a require hook that makes child processes start with
    `windowsHide` set.
  - `node run-a253-live-walk-suite.mjs` (run in a fresh output directory).
- Observed: the instrument's guards passed (the pinned checkout is at
  `a25329a805202bf4ee5879f084fd028c90058215` and clean), the suite ran, and the receipt
  records `code: 0`, `sourceClean: true`, and the console log ends with `tests 60`,
  `pass 60`, `fail 0`, `cancelled 0`, `skipped 0`. The receipt's `pass`, `failed` and
  `skipped` fields are null in both the fresh receipt and the receipt of record, because
  the summary line the instrument parses is not in the form it expects.
- Evidence in this directory: `fresh-completed.json` (the instrument's receipt) and
  `fresh-console.log` (the suite's output).
- Gap, in one mechanism sentence: none; the row's own verification ran and passed, and its
  outcome matches the receipt of record.

## What changed for this row, and a correction to the recorded gap

Round one recorded this row as blocked because the suite preloads a gitignored artifact of
the pinned checkout that is not on disk, and earlier lanes recorded the suite as a live walk
of the hosted edge. Both facts are wrong as recorded, and this lane checked them:

- The preload artifact is on disk, in another checkout's `.runtime` tree, and it was copied
  into the pinned checkout, where the instrument's `NODE_OPTIONS` require hook finds it.
- The suite is not a live walk. The instrument's own scope line reads "Exact-source
  live-walk harness unit suite only. Comparator/order, normalization, pixels/PNG and trace
  credential-redaction contracts; not a real hosted walk or hosted acceptance." A search of
  the five test files it runs finds no `fetch` and no browser launch, so it makes no
  network request at all.

## The scope the instrument states, carried forward

The receipt's own scope line reads: the exact-source live-walk harness unit suite only,
covering the comparator and order, normalization, pixels and PNG, and the trace
credential-redaction contracts, and not a real hosted walk or hosted acceptance. This
receipt closes the row on that scope and claims nothing wider.
