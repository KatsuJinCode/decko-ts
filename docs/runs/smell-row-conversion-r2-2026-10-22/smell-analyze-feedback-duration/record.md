# Row smell-analyze-feedback-duration

Smell-test row conversion, round two, 2026-10-22. Disposition: DONE.

- Roster row: `smell-analyze-feedback-duration` (roster file:
  `C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`)
- Instrument: `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/analyze-feedback-duration.mjs`
- What this lane did: ran the row's own instrument in a copy of the evidence tree, with the
  scan root at the pinned commit the record of record was produced from.
- Command: `node analyze-feedback-duration.mjs strengthened-full-complete-a25329a8`
  (run in the copy of the evidence tree at
  `C:/localProjects/decko-ts-smell-convert-r2-20261022/tmp/smell-r2-work/evidence/private-tool-repairs-20261018`)
- Observed: the instrument completed and wrote the analysis. The capture terminal is present
  (`terminal: true`), the run elapsed 1130405 ms, the stage groups are emitted with their
  check and response counts, and the static literal-wait site scan is included.
- Evidence in this directory: `fresh-duration-analysis.json` (the instrument's own output).
- Comparison to the record of record: the fresh output is identical to
  `strengthened-full-complete-a25329a8-duration-analysis.json` in the evidence tree field for
  field, apart from the `at` timestamp.

## The blocker round one measured, and what lifted it

Round one recorded the row as blocked because the capture's memory journal was not on disk at
the path it looked for. The journal is on disk, under the capture name that carries the
`complete` segment: `strengthened-full-complete-a25329a8/report.md.memory.jsonl` in the
evidence tree. The instrument takes the capture name as its argument and matches it against
`/^strengthened-full-[a-z0-9-]+$/`, so that name is a legal input for the instrument as
written. No instrument change was needed.

The first run of this lane used the scan root at `f044d5af`, the state round one left the
pinned checkout in. The capture analysis was identical to the record of record, but the static
literal-wait site scan differed, because that part of the instrument scans the source files of
the scan root checkout. The record of record was produced with the scan root at `b00a4503`.
This lane recreated the pinned checkout at that commit through the sanctioned admission path
(`python -I C:/localProjects/diskSteward/agent/create_worktree.py`, with the disk red line
checked and a custody lease taken), re-ran the instrument, and the whole output then matched
the record of record field for field apart from the timestamp.

## What this receipt does and does not claim

The instrument is a read-only analysis of a preserved capture: it reads the capture's memory
journal and the source of the scan root, and it writes the stage timings and the literal wait
call sites. It measures the preserved capture, it does not compare the port with the Ruby
source. The row is closed because its own verification ran and produced the record it is
recorded as producing, not because a port-to-Ruby comparison was made.
