# Row smell-write-navigation-qualification

Family row conversion, 2026-10-22. Disposition: DONE.

- Roster row: `smell-write-navigation-qualification` (roster file: `C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`)
- Instrument: `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/write-navigation-qualification.mjs`
- What this lane did: Ran it with the restored 53c86269 checkout, in a copy of the evidence tree so the receipt of record was not overwritten.
- Command: `node write-navigation-qualification.mjs (run in a copy of the evidence tree)`
- Observed: Exit 0. The manifest it wrote: atomic c65655f9c74461f03aa1ea87a13a342d4257bca6, files 5, owner 43, role 13, full 234/241. Compared against the committed record of record: the two are IDENTICAL field for field, apart from the timestamp.
- Gap, in one mechanism sentence: none: the row's verification ran clean and its output reproduces the record of record byte for byte apart from the timestamp.
- Pin: the fresh manifest is this row's evidence; the record of record is recovery/release/private-probes/private-tool-repairs-20261018/navigation-qualified-c65655f9/manifest.json in the evidence repo.

## Disposition

`DONE`. The row's blocker was the missing pinned clean checkout the script's tree-compare guard demands. That checkout is restored, the guard's two trees compare, the script runs clean, and the manifest it writes reproduces the record of record exactly, so the row's verification is a passing, reproducible measurement.
