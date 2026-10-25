# smell-compare-journeys

- The row's own label: `smell/probe script compare-journeys.mjs`
- The instrument: `reference-harness/browser/compare-journeys.mjs`
- What this lane did: ran the row's own instrument on this lane's tree, against the
  journey captures the row's prior measurement left on this machine.
- Command: `node reference-harness/browser/compare-journeys.mjs --expected
  <brandonDojoTech>/.runtime/exhaustive/smell-fail-investigation-2026-10-19/journeys-recapture2-ruby
  --actual <brandonDojoTech>/.runtime/exhaustive/smell-fail-investigation-2026-10-19/journeys-recapture2-ts
  --candidate <this branch's HEAD> --report <this lane's report>`
- Evidence in this directory's sibling fixture:
  `fixtures/captured/smell-act082-r3-2026-10-24/compare-journeys-report.json`
  (the instrument's own report and the console line it printed).

## Verdict: BLOCKED

The comparator RAN and it grades: 27 of 46 gradeable journeys pass, with the
failures attributed by cause (14 text differs, 14 fields differs, 6 structure
differs, 12 mail diffs) and 5 journeys ungraded because the REFERENCE side did
not complete them.

The comparator REFUSES the evidence it was handed, and it says why in 168
places, by three distinct reasons:

- 51 `wrong candidate commit` - every capture records the source commit it was
  taken at, and it is not this branch's HEAD.
- 102 `fixtureSha256 mismatch` - every capture records the digest of the fixture
  tree it was taken against, and the fixture tree on this branch is not that one.
- 5 journeys `not completed`, with `step evidence does not match complete
  definition` and `missing, duplicate or unexpected observations`.

So the row's own verification produces a GRADE, and that grade is NOT a
statement about this branch: the evidence is bound to a different source commit
and a different fixture tree, and the comparator's own provenance gate says so
before the grade is trusted. The report carries `evidenceValid: false` and
`productionAcceptance: false` for exactly this reason.

## What would close it

A fresh capture of BOTH legs at this branch's HEAD, against this branch's
fixture tree: the ts leg re-captured here (so its provenance names this commit
and this fixture digest) and the ruby leg re-captured at the same tree, and
then this same comparator run over that pair. The comparator is sound and
needs no change; what is missing is evidence bound to this tree.

## What this lane did NOT conclude

This lane did not conclude that the 19 failing journeys are a port defect at
this branch's HEAD, and it did not conclude they are not. The captures on disk
are from a different tree, so the grade they produce describes that tree. The
rows that DO carry a current measurement are the five ACT-082 rows, whose
receipts are the sibling directories in this run.

Branch: `port/smell-test-round1b-20261024` in KatsuJinCode/decko-ts.
