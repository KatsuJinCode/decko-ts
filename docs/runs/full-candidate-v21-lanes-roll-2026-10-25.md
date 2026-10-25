# Full candidate v21: the seven lane roll, the two re-measured pins, and the bundle budget the roll hit

The assignment: roll this batch's pushed family lane tips into the next
integration candidate, verify every tip on origin before the merge, merge them
one merge commit each, resolve any conflict by region with the reason named,
rebuild the engine bundle and record SHA-256 and bytes before and after, gate
(typecheck plus the correctness battery) with the merged tree's failure set
equal to the base tree's file for file, and push. Then the chained fold.
Nothing deploys.

## 0. The lane's exclusive checkout

Made through the sanctioned lane-copy path, not by a clone and not by a raw
worktree add:

    node C:/localProjects/juc-relay/fleet/lane-copy.mjs \
      --repo C:/localProjects/decko-ts-release-lead \
      --path C:/localProjects/decko-ts-candidate-roll-20261031 \
      --branch deploy/full-candidate-20261031 \
      --base deploy/full-candidate-20261030 \
      --shared-modules C:/localProjects/decko-ts-capability-round9-20261024/node_modules \
      --owner roll-v9-and-fold --purpose "integration roll v9: family lane tips merged into deploy/full-candidate-20261031"
    outcome: created, lease ef86c12f2d47, trackedBytes 282431267,
    addedBytes 282431358, budgetBytes 314572800,
    nodeModules: junction -> C:\localProjects\decko-ts-capability-round9-20261024\node_modules

The shared install was chosen because its `package-lock.json` is byte-identical
to the base tree's own lockfile (`sha256sum` on the shared install's file and on
`git show 95654138:package-lock.json` both read
`96a3efb62e81fdb24516d8106316e92e44cdde583d63399ca0b6e1e54731ae69`), so the lane
runs the dependencies its own lockfile names.

The base is `deploy/full-candidate-20261030` at tip `95654138`, read back from
origin with `git ls-remote` before the lane was created.
`git ls-remote origin refs/heads/deploy/full-candidate-20261031` read nothing
before this roll, so the branch is new on origin.

## 1. The merge set, verified on origin before the merge

The whole remote was read with one `git ls-remote origin 'refs/heads/*'` (626
heads, kept in the lane's scratch as `tmp/roll-v9-20261031/lsremote-all.txt`),
every head was fetched forward-only into the lane checkout
(`git fetch --no-tags origin '+refs/heads/*:refs/remotes/origin/*'`, exit 0),
and every tip's ancestry against the roll tip `95654138` was decided with `git
merge-base --is-ancestor`. 289 heads are not ancestors of the roll; the list is
kept as `tmp/roll-v9-20261031/nonancestor-all.txt`. The delta against the v8
roll's own full ls-remote capture
(`C:/localProjects/decko-ts-candidate-roll-20261030/tmp/roll-v8-20261030/lsremote-all.txt`)
is exact: eight heads appeared on origin since that capture, and they are this
roll branch plus the seven family lane tips below. Nothing else on the remote
moved.

| # | branch | tip (origin) | merge commit | conflicts |
|---|---|---|---|---|
| 1 | port/regfix-1-20261025 | 3152c771c735f894225537458a73b5ff3dabaf4e | 14e37b674f5fc1163a290d95e525fc8efc429412 | none |
| 2 | port/regfix-2-20261025 | 52b0812b58f67cbfd025ef6bbd1fb4ba7de47d3f | 3aa81165003a8fc44eedaeb9aa471e20f333c96f | 1 file, one region |
| 3 | port/regfix-3-20261025 | 6aff27526c4fdb4447ab8ab8800e7d953edf89bd | ea33975f4841abcdbc72618f4115e76daf1b0b41 | 2 files, one region each |
| 4 | port/regfix-4-20261025 | aa240b8716d2c0dcd28da17a4d5760f947f0d654 | 2c2c3b83af738165dd5c67e50c448f5e51943cee | 1 file, one region |
| 5 | port/w4-follow-probe-20261025 | 4c05a53a7daa7d967dce16038ff7345f369eb88e | e50c005516ed641e8da9364b1e5e931d4feb9827 | none |
| 6 | port/gapbatch-1-20261025 | ebd0ed03d4bd6d56664fa9da0ad6c3c35142ab96 | eb287349c3c82c82a64c46e2bdf24433ac1cab17 | none |
| 7 | port/gapbatch-2-20261025 | f596f41662f81e6d44760f361b4de0003170c07b | 1672e0d8c01a404d98a3bb9e147927395595c544 | none |

The four register-fix lanes close seven of the eight register rows (the
receipts name rows 1, 12, 17, 23, 28, 29 and 33 DONE; row 22's receipt stays
WORKING ON IT with its serving-walk dependency and its when-gate residual
named), the two gap-batch lanes close the follow family's three audit gaps and
the anonymous denials, and the w4 probe lane carries the row's honest probe
close. Each lane tip was read back at the exact hash the ls-remote read gave.

Every merge commit carries the previous roll commit as its first parent and the
lane tip as its second, verified with `git rev-list --merges --parents` on the
roll tip, and each tip re-verified an ancestor of the roll tip after the
advances.

### How the merges were made, and why

The house dangerous-action gate refuses `git merge` outside `--ff-only`, and
the sanctioned path is the one the previous rolls used: `git merge-tree
--write-tree` computes the real three-way merge, `git commit-tree` writes the
merge commit with the two parents, and `git merge --ff-only` advances the
branch to the final merge commit, which is a fast-forward because the new
commit's first-parent chain runs back through the old HEAD. The seven merges
were chained object-side, so the working tree and the real index were never
touched until the single fast-forward at the end; the conflicted files were
resolved from the conflicted trees through a scratch index
(`GIT_INDEX_FILE` in the lane's scratch) and `git hash-object -w`, which
touches only the object store. No branch was rebased and no source branch was
moved.

## 2. The conflicts, by region

- Merge 2 (regfix-2), `tests/card/mod-loader/register-rows-roster-batch-inventory.test.ts`,
  the eight-row verdict table: regfix-1 closed rows 1 and 12 in it, regfix-2
  closed row 17, both from the same base. The resolution is the union of the
  two closures, each row carrying the closing lane's own instrument and
  verdict.
- Merge 3 (regfix-3), `tests/card/mod-loader/view-dispatch-css-js-format-ancestry-census.test.ts`,
  the json/jsonld count pins: regfix-2 raised jsonld 4 to 5, regfix-3 raised
  json 13 to 15; the resolution carries both pins with each lane's provenance
  comment. `tests/card/mod-loader/view-dispatch-flat-record-format-scope-census.test.ts`,
  the foreign-row count pin: 55 plus row 17's five plus row 28's two, 62, with
  both provenance comments. Both pins are recomputed live by the census tests,
  so the gate run checks the arithmetic.
- Merge 4 (regfix-4), `tests/card/mod-loader/register-rows-roster-batch-inventory.test.ts`
  again: the head side carries rows 23 and 28 DONE (regfix-3), regfix-4 carries
  rows 29 and 33 DONE; the resolution unions the four closures and row 22
  stays WORKING on both sides, as both lanes' receipts read.

## 3. The two pins the roll repaired, and why a repair is on the roll line

The first merged-tree correctness run failed three files against the base
tree's one. Two were new, and both are the same class: pins written against
the W4 row's pre-probe posture, which the w4 probe lane's own landed changes
superseded. Neither the probe lane nor gap batch one ran the full vitest
battery (their briefs required the whole-family exercise run), so the pins
fired for the first time here, which is what a roll's gate is for.

- `tests/tools/feedback-duration-probe-scan-root-survives-in-the-port-tree.test.ts`
  pins the literal wait-site scan's file list. The probe lane added
  `checks-w4-follow-views.mjs` (nine literal waits, 11400 ms), so the scan
  reads twelve files summing 211800. The repair records the twelfth file and
  the re-measured sum, the same repair the v8 roll made when tranche 5 added
  its module (its comment records that history: 181000 to 198900, now
  198900 to 211800).
- `tests/card/mod-loader/card-mod-followers-list.test.ts` pins the W4 row as an
  undeclared measured skip (`row.checks ?? []).toEqual([])`). The probe lane
  declared the row's four legs and measured them (0 of 4 at its tip), and gap
  batch one landed the absent-card seat, after which the family run grades
  three of four legs with the dashboard leg's mechanism named in the row's
  finding. The repair re-pins the row's declared, measured, still not_covered
  state: four declared legs, status not_covered until the dashboard leg
  passes, which is the pin's own stated close signal.

The repair is commit `754f09c5dce096f5d76269746709511868cabe7b` on this
branch; both files pass after it (13 of 13 run in the lane). It changes no
source file and no pin's subject matter beyond the superseded posture. This
follows the line's own precedent: the v19 roll's registry repair commit
(`c9ab5b33`, receipt
`docs/runs/full-candidate-v19-roster-repair-and-registry-repair-2026-10-24.md`)
is the same shape, a named repair commit on the roll line fixing what the
merged tree's own checks proved broken.

## 4. The bundle: the before-record, the budget the merged tree hits, and the decision

The base tree built clean and its hashes equal the v20 roll's after-hashes,
the expected inheritance from a descendant base:

| artifact | bytes | SHA-256 |
|---|---|---|
| bunny-edge-engine.bundle.js | 7401528 | 57ca0c1e827f207fe10da2b0e2b6ab8d0a24dd8ec0ecd3cfa1494e464495d4c4 |
| bunny-edge-engine.code.json | 7541477 | 5c18ba3cd0593e316a22bdf498e4feec043df980ad26b2b9c65af194e14a5339 |
| bunny-edge-read.bundle.js | 2126327 | bce209788b9b88475550577e742da44ccd19c6fb13053a83d8f6307631441700 |
| bunny-edge-read.code.json | 2207583 | e1a62028a81e44ca83194d3cbd259d2c177155ac406066812c7269e7c489cb91 |

The merged tree's engine build is REFUSED by the tree's own boot-safety guard
(`tools/vendor/edge-bundle-budget.mjs`, decision record
`docs/decisions/0009-bunny-edge-bundle-stays-a-single-script.md`): the script
is 7,626,797 UTF-8 bytes against the 7,600,000-byte budget. Nothing was
written to `deploy/dist/`; the guard runs before the write and the on-disk
artifacts remain the base tree's. The reader bundle builds clean, byte-identical
to its before-hash.

Where the 225,269 added bytes come from (esbuild metafile, the real build,
with the guard's assert bypassed in a scratch driver that reproduces the
merged byte count exactly; the same driver on the base tree reproduces
7,401,528 exactly):

| delta (bytes in output) | module |
|---:|---|
| +430975 | src/card/auth/defaults-seed-corpus.ts (new; the row 12 close seeds Ruby's defaults corpus, card for card) |
| +73969 | src/card/render/kramdown.ts (row 23's nine middle parsers) |
| +32162 | src/card/auth/boot-seed.ts (the layer A rewrite around the corpus) |
| +24525 | src/card/render/code-highlighting/scanners/ruby.ts (row 23's coderay work) |
| +18270, +18158 | the seed-card censuses the corpus close re-pinned |
| +6372 | src/card/mod-loader/mod-event-set-membership.ts (row 22's seam, new) |
| the rest | row 17/28/29/33's port files, each under 13 KB |

The corpus is in the graph because the engine boots decks and the boot-seed
path is the engine's own boot; this is the row 12 close working as its receipt
describes, not an import accident. The growth is real, intended lane work, and
it crosses a budget whose own record (decision 0009) says the margin is "the
real margin to manage".

**The decision, taken by the operator on the roll's escalation:** the roll
pushes as the v21 candidate with the crossing named. The bundle budget is
untouched and is not to be raised: the growth is data compiled into code,
which is the wrong shape, and raising the ceiling would bless it. **The
crossing is a deploy blocker for THIS candidate only**: this candidate must
not be deployed until the fix lands. The fix is queued as its own named
follow-up lane, not done inside the roll: move the defaults seed corpus out
of the engine graph into boot-time data, a JSON asset the boot reads at seed
time instead of a compiled module, which restores the bundle under budget and
keeps row 12's close honest. The follow-up lane's brief is
`C:/localProjects/brandonDojoTech/tmp/fleet-standing-queue/briefs/bundle-budget-corpus-out-of-engine-graph.md`
in the standing queue.

## 5. The gates

Typecheck, `npx tsc --noEmit`: exit 0, zero output lines on the base tree
(`tmp/roll-v9-20261031/tsc-base.txt`), on the merged tree
(`tsc-merged.txt`), and on the repaired tree (`tsc-repaired.txt`).

Correctness, `node tools/test-gates.mjs run correctness`:

| | base tree 95654138 | merged tree 1672e0d8 | repaired tree 754f09c5 |
|---|---|---|---|
| gate exit | 1 | 1 | 1 |
| test files | 1 failed, 704 passed, 54 skipped (759) | 3 failed, 705 passed, 54 skipped (762) | 1 failed, 707 passed, 54 skipped (762) |
| tests | 1 failed, 7273 passed, 227 skipped (7501) | 3 failed, 7330 passed, 227 skipped (7560) | 1 failed, 7332 passed, 227 skipped (7560) |
| node:test | 3 files, 15 passed, 0 failed | 3 files, 15 passed, 0 failed | 3 files, 15 passed, 0 failed |

**The failure sets are equal file for file** between the base tree and the
repaired tree the branch pushes: the failing set is
`tests/hygiene/machine-lane-worktree-disk-hygiene.test.ts` on both, the same
file with the same assertion and the same named worktree
(`decko-ts-lane-archives`, depth-2 size floor 4.2 MB), and no failure is new.
The merged tree's two additional failures were the pins of section 3, and the
repair removed exactly those two.

The merged tree runs 762 test files against the base tree's 759. The roll adds
three test files to the correctness bucket
(`register-row-1-card-mod-account-event-bodies.test.ts`,
`card-mod-rules-board-views-addresses.test.ts`,
`card-mod-rules-rule-edit-addresses.test.ts`), and 759 plus 3 is 762; the
w4 instrument's own test lives under `tools/` and is matched by the harness
bucket's rule in `tools/test-gates.mjs`, so it is absent from the correctness
run for the gate's own bucketing reason.

The two files the earlier receipts established as outside this gate (the MySQL
8.4 group of `tests/card/actions/atomic-saves.test.ts` and
`tests/deploy/worker-edge-cache-runtime.test.ts`) were run apart from the
gate, on the base tree and on the repaired tree: 6 failed, 64 passed (70) on
both, and the six failing test names are identical between the two runs (the
extractions `tmp/roll-v9-20261031/named-baseline-base.log` and
`named-baseline-merged.log` name the same six tests). The named set is
therefore the same set before and after the roll: the six environmental
failures, unchanged.

## 6. The disk cost

Added to the machine: the lane's checkout, 282431358 added bytes of tracked
working tree (the lane-copy admission measured 282431267 tracked bytes plus
the shared install linked through a junction rather than copied), the rebuilt
`deploy/dist/` build output (gitignored, base hashes), and the lane's
gitignored scratch (`tmp/roll-v9-20261031/`), holding the gate logs, the
bundle hash records, the merge and conflict artifacts, the diagnostic driver
and its two metafiles, the ls-remote capture and the non-ancestor list.

## 7. What this lane did not do

- Nothing deployed. No URL was fetched, so no URL is reported working.
- Nothing was written to the live D1, and the cs-edge database was not touched.
- The other candidate branches on origin were not moved. The roll pushes one
  branch: `deploy/full-candidate-20261031`.
- No source branch was rebased, and no tip was moved. The two pin repairs are
  the only non-merge commits on the roll line, named in section 3.
- The culturesmith host was not touched.

## 8. The frontier, and what the fold that follows reads

The canonical tree for the fold that follows is this branch's tip. It carries:

- the seven closed register rows' receipts, fixtures and instruments
  (`docs/runs/register-rows-roster-batch-2026-10-25/`, the roster-batch
  fixtures with their DONE verdicts), with row 22's receipt still WORKING ON
  IT: the validate bodies and the errors.add seam are landed, and the
  serving-walk wiring waits on the boot asset-input cascade, with the
  when-gate's bootswatch residual named in the receipt. A follow-up lane
  (`regfix-row22-boot-cascade`) is already claimed on it;
- the follow family's three closed audit gaps
  (`docs/runs/gapbatch-1-2026-10-25/`), the anonymous-denials capability row
  with its covered grade on its committed run record
  (`docs/runs/edge-signed-in-exercise-gapbatch2-anon-denials-2026-10-25.md`
  and its `.json`), and the W4 probe's record plus the two re-pinned rows of
  section 3;
- the bundle budget crossing of section 4, which is a deploy blocker for this
  candidate only, with the corpus-out-of-graph lane queued as the fix.
