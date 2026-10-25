# Row smell-qualify-mail-coverage

Smell-test row conversion, round two, 2026-10-22. Disposition: DONE.

- Roster row: `smell-qualify-mail-coverage`
- Instrument: `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/qualify-mail-coverage.mjs`
- What this lane did: established that the Ruby source tree the instrument reads is on this
  machine under a different path, with the same content, and ran the instrument with that
  one path constant repointed.
- Commands:
  - `node qualify-mail-coverage.mjs` (as committed) failed with
    `Error: ENOENT: no such file or directory, open
    'C:\localProjects\decko-ruby-reference\decko\features\update_includers.feature'`.
  - `node qualify-mail-coverage-ruby-tree-on-this-machine.mjs`, a copy of the instrument with
    the single path constant `C:/localProjects/decko-ruby-reference/decko/features/` changed
    to `C:/localProjects/decko-ruby-perf/decko/features/`, returned the qualification.
- Observed: the run returned `pass: true` with the W5 and W6 rows each showing
  `actualRecordedPass` true, a positive status of `partial`, and both the absent and the
  failed controls at `not_covered`, so the fail-closed partial coverage controls hold. The
  derived counts are `covered` 38, `partial` 16, `not_covered` 39, `out_of_scope` 1,
  `disabled_upstream` 1. The report hash is
  `cc902eb26435f3980550ca08546036b491727f7b142abe43ee319ee9069dc456` and the capability
  hash is `7651f1b06a1ff9c475aa68519263c58ec60772828ea2c3d9f41a719494316c44`, both the
  values the receipt of record carries.
- Evidence in this directory: `fresh-mail-coverage-qualification.json`, the qualification's
  own output. It is identical to the receipt of record, `mail-coverage-qualification.json`,
  field for field apart from the `at` timestamp.
- Gap, in one mechanism sentence: none; the row's own verification ran and passed, and its
  output reproduces the record of record.

## The one deviation, and why it does not weaken the result

The instrument reads two Ruby specification files by absolute path and records their sha256
in its own output. The path it names, `C:/localProjects/decko-ruby-reference`, is not on this
machine. The tree is, under the name `C:/localProjects/decko-ruby-perf`, and it is the same
repository: its `origin` remote is `C:/localProjects/decko-ruby-reference`, which is where
it was fetched from before the folder was renamed. The content check is in the output
itself: the two feature files hash to
`64bcfbc4547959e10aaed8263c512cff4625cc7d041d2ab4c92dc83eb239ee6e`
(`update_includers.feature`) and
`a0a7ce939a954edc1e6ebdfdb4768cc3b356d209a930c69e2e0118e6f6cb7ec4`
(`notifications.feature`), which are exactly the hashes the receipt of record carries for
those two files. So the run read the same bytes the record was produced from, and every
other assertion in the instrument is unchanged.

## The scope the instrument states, carried forward

The qualification's own scope line reads: derived binding and negative controls on a
preserved complete d1 capture, no new mail journey and no external delivery acceptance, and
no alteration of the original report. This receipt closes the row on that scope and claims
nothing wider.
