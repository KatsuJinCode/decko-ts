# Grade reports

A grade report is a receipt: it says a fixture was graded, against what, and
how it came out. Read it as evidence about **the tree that produced it**, not
about the tree you are standing in.

**Every report carries the commit it graded.** `adapter_checkout.commit` is the
revision of the reference harness's adapter that the run loaded, and
`adapter_checkout.dirty` says whether that worktree had uncommitted changes
(`true` means the commit is not the whole story). `graded_at` is the run's
timestamp in UTC. The fixture is named by `fixture` and pinned by
`fixture_digest`, so a report is attributable to a fixture revision as well as
a code revision.

Two limits worth stating, because a report read without them is read wrong:

- **A report does not describe the current tree.** It describes one run at one
  commit. Re-verify against the tree you care about rather than quoting a
  stored report as a standing result.
- **A report is not a parity oracle.** It grades the committed
  `synthetic-v1` expected outputs under the harness's own three normalisation
  rules (SPEC.md §4). What the harness does and does not cover is inventoried
  in [../../docs/coverage-inventory.md](../../docs/coverage-inventory.md); the
  corpus-replay figures are a different instrument and live in
  [../../docs/parity-method.md](../../docs/parity-method.md).

Produce one with `node reference-harness/runner/grade.mjs --fixture
reference-harness/fixtures/synthetic-v1 --actual <resultsDir>`, which prints
the command that produced it and where the report lands.