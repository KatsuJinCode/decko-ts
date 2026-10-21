# Full candidate v10: the two-tranche roll, 2026-10-21

The wave's assignment: roll `port/routes-tranche6-20261021` (frozen tip
e87290a51) and `port/matrix-journey-tranche6-20261021` (frozen tip 5fa3cc7e)
into `deploy/full-candidate-20261020` (worktree
`C:/localProjects/decko-ts-full-candidate-20261020`, wave start 3ee3b376,
the v9 roll receipt commit), verify containment, merge, rebuild conflicts by
regions, gate (typecheck plus `node tools/test-gates.mjs run correctness`,
failure set must equal the empty baseline), rebuild the bundle, record
SHA-256 and bytes, push. Nothing deploys.

Two of the assignment's stated premises did not survive measurement, and both
are recorded below with the evidence rather than smoothed over: the bundle did
NOT move, and the typecheck baseline is not "the pre-existing write-path-races
lines" but zero output lines. Neither is a defect; both are stated because the
assignment predicted them and the operator should know the predictions were
wrong.

## The frozen set and the containment verdicts

Both tips verified after `git fetch --all --prune`, by `git rev-parse` against
the frozen values:

| branch | frozen tip | tip verified | contained at wave start (3ee3b376) | merge commit |
| --- | --- | --- | --- | --- |
| port/routes-tranche6-20261021 | e87290a51 | e87290a512fc42638537ba588c0d55f27487dd5b | NO | d253af83 |
| port/matrix-journey-tranche6-20261021 | 5fa3cc7e | 5fa3cc7e4b7266010d9394665118435ccb9587fc | NO | ffb5218e |

Neither branch was contained. Each merge-base was already an ancestor of the
candidate, so both merges were short forwards rather than long rebases:
routes-tranche6's base is 3ffcd4b5 (the routes-tranche5 tip the v9 roll
merged), matrix-journey-tranche6's base is f583811d (the matrix-journey-tranche5
tip the v9 roll merged).

Post-merge containment re-verified on the committed tree: both e87290a51 and
5fa3cc7e pass `merge-base --is-ancestor` against HEAD. No merge-set branch
moved past its frozen tip during the roll: `origin/port/routes-tranche6-20261021`
is still exactly e87290a51 and `origin/port/matrix-journey-tranche6-20261021`
is still exactly 5fa3cc7e.

## Scope check before merging

routes-tranche6 touches 25 files and matrix-journey-tranche6 touches 10. The
overlap between what each side changed since its own merge-base is EMPTY, and
the overlap between each side and what the candidate changed since that same
merge-base is one file:

- routes-tranche6 against the candidate: nothing.
- matrix-journey-tranche6 against the candidate:
  `reference-harness/browser/probe-never-measured-batch1.mjs` only.

THE STRUCTURAL FACT THAT DECIDES THIS WHOLE ROLL: neither tranche carries
engine source. routes-tranche6's 25 files are 16 under `tests/`, 8 under
`fixtures/`, 1 under `docs/`; a `git diff --name-only` filtered for
`^(src|deploy|tools)/` returns nothing. matrix-journey-tranche6's own tip
commit records the same fact from its side ("this tranche changed no engine
source", bundle SHA byte-identical to tranches 4 and 5). Confirmed on the
merged tree independently:

    git diff --name-only 3ee3b376..HEAD -- src/ deploy/ tools/ worker.ts

returns zero files. Everything below follows from that.

## The routes-tranche6 merge (d253af83)

Clean, zero conflicts, 25 files: 9 new parity suites under `tests/server/`,
9 ruby oracle-capture scripts, 8 captured fixtures under `fixtures/captured/`,
and the tranche's row receipt.

## The matrix-journey-tranche6 merge (ffb5218e), conflicts rebuilt region by region

Git auto-merged cleanly everything except one file, which conflicted in two
regions: the ACT-155 leg's block in
`reference-harness/browser/probe-never-measured-batch1.mjs`. THE STRUCTURAL
FACT behind both regions: the two sides repaired the same leg, and each repair
is correct about a DIFFERENT READ. This is the same shape the v9 roll found,
one level down.

- Region 1, the affordance miss check. The candidate's side reads
  `a == null ? null : a.getAttribute("href")`; the branch's side reads
  `a ? a.getAttribute("href") : null`. These are the same predicate
  (`Array#find` answers `undefined`, and both spellings test the found anchor
  itself, which is what the block comment above requires). Rebuilt on the
  branch's spelling, so the leg is the state the branch actually measured.

- Region 2, the dashboard read and the grade predicate. The candidate's side
  grades the member's dashboard on `memberSeesFollowSurface`, a heuristic that
  accepts either "everything" or the member card name. The branch's side
  grades both actors on `dashboardNamesSelfSet` / `dashboardNamesAllSet`,
  imported from a NEW module `reference-harness/browser/lib/follow-dashboard-expectations.mjs`
  that cites the Ruby line behind every assertion (rule.rb:39-45 for what a
  dashboard item is; set.rb:9-13 for the label being the set PATTERN's short
  label; 09_self.rb:5-6 for the SELF pattern's short label being the card's own
  name; 01_all.rb:5-7 for the ALL pattern's short label being "everything").
  Rebuilt on the branch's side. The reason is not that it is newer: it is that
  the candidate's predicate accepts a dashboard naming a per-card row, which
  is exactly what Ruby never materializes for a deck-wide follow, so the
  candidate's clause could pass against an engine that is wrong. The branch's
  clause cannot. Its own test pins this, and it was run here:

      node --test reference-harness/browser/test/follow-dashboard-expectations.test.mjs

  -> tests 10, pass 10, fail 0.

### The one deliberate deviation from the branch's file, and why

The branch reads the two dashboards from `#main`. This rebuild reads them from
`document.body`, keeping the branch's URLs and its grade predicates unchanged.
The mechanism is that the admin dashboard is visited at `overviewHref2`, the
affordance's own href, and the branch's own committed receipt records that href
as an OVERLAY layout URL:

    overviewHref2 = "/Ada_Admin+*follow/content?layout=overlay&slot%5Bitems%5D%5Bview%5D=closed"

The candidate's oracle measurement recorded that `#main` is empty under exactly
that layout and that the body carries the tabs and the item list. `document.body`
is a strict superset of `#main` in the DOM, so the body read cannot lose content
the `#main` read had; on the local engine the branch's receipt shows the content
was in `#main` and therefore also in the body. The change is therefore
one-directional and safe against the branch's own measurement, while satisfying
the Ruby-oracle finding, which is the parity target. Recorded rather than
silently taken.

### The unresolved instrument disagreement, left visible on purpose

The two sides disagree about the FOLLOWERS LIST address, and the merge does not
resolve it, because the two measurements were taken against DIFFERENT ENGINES:

- the candidate's side reads the list at `<card>+*followers`, on the finding
  that the un-asterisked `<card>+followers` answers the plain create form on the
  stock Ruby 3.3 oracle and never a followers list;
- the branch's side reads it at the un-asterisked `<card>+followers`, and its
  receipt records that address answering 200 with "Mira Member" against the
  LOCAL TypeScript engine.

Both readings are kept in the block comment, each attributed to the engine it
was measured on. The candidate's asterisked address is the one the code follows,
because Ruby is the parity target and the local-engine reading does not settle
the oracle question. Settling it properly needs one run of the ACT-155 leg
against a Ruby oracle, which needs a live engine and is not this lane's work;
it is named here rather than resolved by assertion. The branch's receipt also
records the leg at 15 of 15 GREEN at its own tip, which this roll neither
re-measured nor contradicted.

Verified after the rebuild: zero residual conflict markers,
`node --check reference-harness/browser/probe-never-measured-batch1.mjs` parses
clean, zero dangling references to the removed `memberSeesFollowSurface`
binding, and the auto-merged `vitest.config.ts` is byte-identical to the
branch's, so the new suite is registered.

## Gates

### Typecheck

`npx tsc --noEmit` on the merged committed tree (ffb5218e): **exit 0 with ZERO
output lines**. Log: `C:/localProjects/decko-ts-v10-tsc.log` (0 bytes, which is
the pass).

A pre-merge baseline was measured rather than assumed, so the "no new type
errors" claim is a real delta and not a comparison against a remembered number:
the same command on the wave-start tree (3ee3b376) also exited 0 with zero
output lines. Log: `C:/localProjects/decko-ts-v10-pre-tsc.log` (0 bytes).

**The assignment's premise here did not hold.** It expected "only the
pre-existing write-path-races tsc lines". There are none. `tsc` emits nothing on
this tree either side of the merge, and `tests/card/actions/write-path-races.test.ts`
is a TEST file that is not listed in `KNOWN_FAILURES.md`. The stated expectation
matches neither the measured pre-merge state nor the measured post-merge state.

### Correctness

`node tools/test-gates.mjs run correctness`, the first run: **exit 1**, and the
failure set was NOT empty. 8 failures across 4 files, every one of them a
MySQL-server suite:

| file | failures |
| --- | --- |
| tests/server/drivers/mysql-driver.test.ts | 5 |
| tests/server/drivers/mysql-lifetime.test.ts | 2 |
| tests/server/drivers/mysql-ruby-schema.test.ts | file-level |
| tests/card/nest-index/nest-index-dialects.test.ts | 1 |

The cause is one missing external asset, stated from the error text rather than
inferred:

    Error: MySQL 8.4.11 server binary not found at
    C:\localProjects\.mysql-test-cache\8.4.11\mysql-8.4.11-winx64\bin\mysqld.exe.
    Run: node tools/mysql/fetch-mysql.mjs

The cache directory `C:\localProjects\.mysql-test-cache\` did not exist at all.
This is machine state, not this merge: the merge changed zero files under
`src/`, `deploy/`, `tools/` or `worker.ts` (the diff quoted above), and a merge
cannot remove a binary at a path outside the repository. It is also a
regression against the v9 baseline rather than a new break: the v9 log records
all four suites RUNNING AND PASSING (`mysql-lifetime` 2 tests, `mysql-driver`
27 tests, `mysql-ruby-schema` 4 tests, `nest-index-dialects` 2 tests), so the
assets were present when v9 gated and are gone now.

Restored with the repair the error itself names, after checking free space
(57 GB free on C:):

    node tools/mysql/fetch-mysql.mjs

-> `verified md5 2e833921898a9a030ea6bfe81bd811bc`, unpacked at
`C:\localProjects\.mysql-test-cache\8.4.11\mysql-8.4.11-winx64`. The assets sit
outside the repository, 1.5 GB, and persist for later runs.

Second run of the same command on the same tree: **exit 0**. Log:
`C:/localProjects/decko-ts-v10-correctness-run2.log`. ZERO failures, so the
failure set equals the empty baseline the ask names.

| measure | v9 (926b7508) | v10 (ffb5218e) | why |
| --- | --- | --- | --- |
| Test Files | 629 passed, 54 skipped (683) | 629 passed, 54 skipped (683) | unchanged |
| Tests | 6634 passed, 227 skipped (6861) | 6634 passed, 227 skipped (6861) | unchanged |
| node:test | 15 passed, 0 failed | 15 passed, 0 failed | unchanged |
| Failures | 0 | 0 | unchanged |

Delta against v9 is zero on every measure, and that is accounted for rather
than asserted. Neither tranche adds a file to the correctness gate:
routes-tranche6's 9 new `tests/server/*-parity.test.ts` suites match the
`parity` gate's `parity` matcher (`tools/test-gates.mjs`), and tranche6's new
`reference-harness/browser/test/follow-dashboard-expectations.test.mjs` matches
the `harness` gate's `reference-harness` matcher. Both files appear zero times
in the correctness log, which is the predicted outcome.

Not run: `node tools/test-gates.mjs run parity` and `run deploy`. The ask names
typecheck plus correctness. This matters and is named rather than buried: the
nine new route parity suites routes-tranche6 brings are exactly the suites the
unrun parity gate would execute. Their own tranche receipts record them passing
at their own tips; this roll neither re-measured them nor contradicted them.

## The bundle

Before, recorded from the artifacts on disk at wave start. All four SHA-256
values match the v9 receipt's "after" table exactly, so the "before" is
confirmed to be the v9 build and not a drifted one.

| artifact | bytes before | sha256 before |
| --- | --- | --- |
| deploy/dist/bunny-edge-engine.bundle.js | 7,359,901 | 158670dba8101df49ae2432ec4bbe40a5dbb9149f3ddbb5fe46e42f0c579e85f |
| deploy/dist/bunny-edge-read.bundle.js | 2,105,211 | b8c884c29cfc366c3dc5ac9b67498b0854eaba4e95010ff102127925d9200154 |
| deploy/dist/bunny-edge-engine.code.json | 7,498,985 | 32ae805f6c47d5def72b117a5104038d7a4e3128ce0ec0684f71a19f70010dc3 |
| deploy/dist/bunny-edge-read.code.json | 2,185,971 | 8845d86b0360ca4ced95aa44449ce6cfab7a9c2a643cc7c21982d63e089469da |

Rebuilt from the merged committed tree with
`node tools/bundle-bunny-edge-engine.mjs`, both bundles validated by the tool's
own assertion under the 7,600,000-byte budget:

| artifact | bytes after | sha256 after | delta |
| --- | --- | --- | --- |
| deploy/dist/bunny-edge-engine.bundle.js | 7,359,901 | 158670dba8101df49ae2432ec4bbe40a5dbb9149f3ddbb5fe46e42f0c579e85f | byte-identical |
| deploy/dist/bunny-edge-read.bundle.js | 2,105,211 | b8c884c29cfc366c3dc5ac9b67498b0854eaba4e95010ff102127925d9200154 | byte-identical |
| deploy/dist/bunny-edge-engine.code.json | 7,498,985 | 32ae805f6c47d5def72b117a5104038d7a4e3128ce0ec0684f71a19f70010dc3 | byte-identical |
| deploy/dist/bunny-edge-read.code.json | 2,185,971 | 8845d86b0360ca4ced95aa44449ce6cfab7a9c2a643cc7c21982d63e089469da | byte-identical |

**The assignment's premise that "the bundle WILL move" was wrong, and the
reason is the scope check above rather than a build that silently no-opped.**
routes-tranche6 carried parity test additions and NO source; the assignment
hedged "and possibly source", and the source is absent. matrix-journey-tranche6
changed no engine source either. With zero files changed under `src/`,
`deploy/` and `tools/`, all four artifacts coming back byte-identical is the
correct result, and it was confirmed by rebuilding rather than inferred from
the diff.

Budget headroom: 240,099 bytes under the 7,600,000 limit. The tool's
80-percent-of-limit warning line is expected and unchanged from v6 through v9.

deploy/dist is gitignored: the artifacts stay local. NOTHING DEPLOYS.

## Push

`git push origin deploy/full-candidate-20261020`, forward-only. The remote tip
was verified as 3ee3b376 before pushing, which is an ancestor of the local
ffb5218e. The branch carries two merge commits on top of the v9 receipt:
d253af83 (routes-tranche6, clean) and ffb5218e (matrix-journey-tranche6, ACT-155
leg rebuilt), plus this receipt commit.

## Disk cost

Added in-repo: this receipt, about 11 KB. Removed from the repo: nothing, and
no residue from this roll. Outside the repo: the MySQL test assets restored
above, 1.5 GB at `C:\localProjects\.mysql-test-cache\`, which is the
tool's own documented cache and is left in place for later runs; and scratch
logs this receipt cites, `C:/localProjects/decko-ts-v10-pre-tsc.log` (0 bytes),
`C:/localProjects/decko-ts-v10-tsc.log` (0 bytes),
`C:/localProjects/decko-ts-v10-pre-bundle-shas.txt` (140 bytes),
`C:/localProjects/decko-ts-v10-correctness.log` (228,412 bytes, the red run
kept as the record of the missing-asset failure) and
`C:/localProjects/decko-ts-v10-correctness-run2.log` (219,224 bytes), about
448 KB combined.