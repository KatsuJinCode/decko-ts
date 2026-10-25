# Full candidate v23: the sixteen lane roll, the budget held

The assignment: roll this batch's pushed family lane tips into the next
integration candidate, verify every tip on origin before the merge, merge them
one merge commit each, resolve any conflict by region with the reason named,
rebuild the engine bundle and record SHA-256 and bytes before and after - the
bundle guard's verdict being this roll's headline, because the corpus as
boot-time data (the v22 roll's landing) must keep the compiled engine under
the boot-safe budget through this batch's own byte growth - then gate
(typecheck plus the correctness battery) with the merged tree's failure set
equal to the base tree's file for file, and push. Then the chained fold.
Nothing deploys.

## 0. The lane's exclusive checkout

Made through the sanctioned lane-copy path, not by a clone and not by a raw
worktree add:

    node C:/localProjects/juc-relay/fleet/lane-copy.mjs \
      --repo C:/localProjects/decko-ts-release-lead \
      --path C:/localProjects/decko-ts-candidate-roll-20261102 \
      --branch deploy/full-candidate-20261102 \
      --base deploy/full-candidate-20261101 \
      --shared-modules C:/localProjects/decko-ts-workbatch-a-20261025/node_modules \
      --budget-mb 340 \
      --owner roll-v11-and-fold --purpose "integration roll v11: the family lane tips merged into deploy/full-candidate-20261102, the bundle guard held at the boot-safe budget"
    outcome: created, lease f883d8bd0043, trackedBytes 286997882,
    addedBytes 286997973, budgetBytes 356515840,
    nodeModules: junction -> C:\localProjects\decko-ts-workbatch-a-20261025\node_modules

The v10 roll's standing shared install
(`decko-ts-capability-round9-20261024/node_modules`) no longer exists on the
machine; the lane-copy tool named the installs whose lockfile matches the
branch and this lane took the workbatch-a lane's. The match is byte-verified:
`sha256sum` on the shared install's `package-lock.json` and on
`git show c17906db:package-lock.json` both read
`96a3efb62e81fdb24516d8106316e92e44cdde583d63399ca0b6e1e54731ae69`, and no
merged tip touches `package.json` or `package-lock.json` (git diff over the
sixteen tips, zero dependency paths), so the lane runs the dependencies its
own lockfile names.

The base is `deploy/full-candidate-20261101` at tip `c17906db`, the v22
candidate, read back from origin with `git ls-remote` before the lane was
created. `git ls-remote origin refs/heads/deploy/full-candidate-20261102`
read nothing before this roll, so the branch is new on origin. The roll
brief's parenthetical names the v21 tip (7cde06a8) as the current roll; the
remote is ahead of that line by the v22 roll itself, and this roll's merges
are decided against the remote's actual tip per the brief's own rule (trust
ls-remote).

A second lane copy at the same base carries the BASE tree's own gate runs for
the file-for-file comparison:
`C:/localProjects/decko-ts-roll11-base-gates-20261025`
(`check/roll11-base-gates-20261025`, lease abf0da7f3420, same shared
install). During the lane setup the system drive transiently reached zero
bytes free (9.25 GB free fell to zero inside two minutes, then rebounded to
75 GB; another process's spike, not this lane's writes - the failed first
lane-copy attempt left no worktree and no branch, verified before the retry).

## 1. The merge set, verified on origin before the merge

The whole remote was read with one `git ls-remote origin 'refs/heads/*'`
(648 heads, kept in the lane's scratch as
`tmp/roll-v11-20261102/lsremote-all.txt`), every head was fetched
forward-only into the lane checkout
(`git fetch --no-tags origin '+refs/heads/*:refs/remotes/origin/*'`,
exit 0), and every tip's ancestry against the roll base `c17906db` was
decided with `git merge-base --is-ancestor`. 297 heads are not ancestors of
the roll base; the delta against the v22 roll's own five merged tips is this
batch's sixteen family lane tips below, all dated 20261025 (the current
family wave). The seven pushed port branches from the 20261020-22 waves that
are still not ancestors of any roll
(`dsl-convert-r2`, `dsl-tranche2`, `mods-convert-r2`, `register-dsl-convert`,
`register-mods-convert`, `register-starcards-convert`,
`remaining-convert-r2`) are not family lane tips: ten rolls have never merged
them, and this roll keeps that line.

The v22 roll's five tips (regfix-row22, w4-editor, seed-corpus, gapbatch-3,
gapbatch-4) are ancestors of the base already, so they are out of the merge
set by the assignment's own rule. workbatch-h's tip moved during the roll's
setup (14dd790d to 9c875384): the added commit is that lane's own final
battery receipt ("the round's battery line at the final commit"), so the
pinned tip is the lane's completed, graded state.

| # | branch | tip (origin) | merge commit | conflicts |
|---|---|---|---|---|
| 1 | port/frontdoor-20261025 | 1f17445c8fa513dacdfc4aa5398c2eb9a8ec4850 | eb6452ab6474138972ce15b2ec52bed49a5ca636 | none |
| 2 | port/gapbatch-5-20261025 | 36e28f1ecec997ff7a0513259677b61165c5644f | 486e75122846f193728498caa3ddf9c54118612d | none |
| 3 | port/unfollow-recheck-20261025 | a3b53f3c5fc8df9568626c11cbefe5a4667301d5 | b9b64cef94f205c7ba69f2f2f3a5b49433a83bf6 | none |
| 4 | port/gapbatch-7-20261025 | 04c52a645b2e40a998f3aa7b78ecd43ccbbc09fb | 262dabd84f1ff4e067c9efe1d5697f82f72fd4bc | 1 file, see section 2 |
| 5 | port/gapbatch-6-20261025 | 3122c79a8068dfcf911716b727fcf4e2dedcacb7 | 764182a29103cb6639bb99993423130f75cc1944 | 2 files, see section 2 |
| 6 | port/suspects-20261025 | 1895ba9a796b60bb198f291a6699631de1616858 | 2c061a84f4ece6b8da14da6bebb1c4954f3c57c3 | none |
| 7 | port/workbatch-b-20261025 | 811fb4883ef20ed0f90edbd0a29d7bb74f342b9a | 9bf6664e7c0d0bd67cf6732d79480d17323a0fe7 | none |
| 8 | port/workbatch-a-20261025 | ba58afc5f595a67c53fd9deacaafd95a5a9fac83 | 28818deff0cdc015a3aa960ac7fc8bb289a7e9d3 | none |
| 9 | port/workbatch-f-20261025 | d09c4e42dbdd8b187bcbcf6e615fa5b92f4f32f9 | 06e7e09b8f5e1d050517472643e336eaaab4fe26 | none |
| 10 | port/workbatch-c-20261025 | 584b64ba41778ecb415d7d3300c6850f2270eac5 | f3f47a009524942a360c038ac6ffe7ea5a5796d2 | none |
| 11 | port/followfix-20261025 | 58aab6f8d84d965105edc0daa51ab7ef210cfe16 | 3c09740f235d4bafe01b11e8db4754ee4353a43d | none |
| 12 | port/workbatch-d-20261025 | 88db41afb4514e7a7289ca91c7f32da43fce5856 | c27b0d10ff6f5aa9ba20760f94782fd6a5b78a68 | 2 files, see section 2 |
| 13 | port/demo-scratch-20261025 | e18353965b234653a968f40503cd757a7f34c6aa | 2c7ac0900de9d9aa40356ec732ec7c1c72464e6e | none |
| 14 | port/workbatch-g-20261025 | d52d3ae4608629379ad1007ebf152c41b3679e12 | dc000830867163e1e94c28e251e29f9e7f4c82f0 | none |
| 15 | port/workbatch-e-20261025 | bd4c74bccf00cbbd26aea7035e33ab2f75974595 | 84909202780ba75828a00a9be2a2aa8eaf8673e6 | 1 file, see section 2 |
| 16 | port/workbatch-h-20261025 | 9c8753844fb9fbe52a3e27e8651de43b072f82aa | e10abf4ab517dfa1183accdc3c08f0051317c04d | none |

Order is the tips' own commit order (earliest first). Every merge commit
carries the previous roll commit as its first parent and the lane tip as its
second, verified with `git rev-list --merges --parents` on the roll tip, and
each tip re-verified an ancestor of the roll tip after the advances.

### How the merges were made, and why

The house dangerous-action gate refuses `git merge` outside `--ff-only`, and
the sanctioned path is the one the v22 roll used: `git merge-tree
--write-tree` computes the real three-way merge, `git commit-tree` writes the
merge commit with the two parents, and `git merge --ff-only` advances the
branch to the final merge commit, which is a fast-forward because the new
commit's first-parent chain runs back through the old HEAD. The sixteen
merges were chained object-side, so the working tree and the real index were
never touched until the single fast-forward at the end; the conflicted files
were resolved from the conflicted trees through a scratch index
(`GIT_INDEX_FILE` in the lane's scratch) and `git hash-object -w`, which
touches only the object store. No branch was rebased and no source branch was
moved.

## 2. The conflicts, by region

Six conflicted files across four merges. One situation generated three of
them: gap batches five, six and seven are PARALLEL LANES that each closed
overlapping elements of the enumeration audit's gap list on sibling branches
(batch five: audit gaps 3, 4, 9, 11; batch six: the overlay, modal and
inline views plus the changed_card address, its summary naming batch five as
in flight and claiming the changed_card element in its place; batch seven:
the same four elements as batch five). The audit's own consumption rule is
one roster row per gap element, so the tree keeps ONE pin per address. The
resolution rule this roll applied: the latest committed batch whose receipt
directory rides the merged tree supplies the pin for a shared address;
the duplicates remain on their own branches and, where their file names
differ, in the tree.

- Merge 4 (gapbatch-7 into the chain),
  `tests/card/mod-loader/card-mod-rules-modal-nest-rules-address.test.ts`
  (add/add): resolved to the gapbatch-6 branch's version
  (blob cbd4cd8ae0a0b0b18e10d5179c377610f030cc9b) - batches five, six and
  seven each wrote a full pin for this address, and batch six is the latest
  committed one whose receipt
  (`docs/runs/gapbatch-6-2026-10-25/modal-nest-rules-address.md`) rides the
  tree. Batch seven's receipt for the element stays on its branch and in its
  own receipt directory.
- Merge 5 (gapbatch-6 into the chain),
  `tests/card/mod-loader/card-mod-edit-inline-address.test.ts` and
  `tests/card/mod-loader/card-mod-edit-overlay-guide-address.test.ts`
  (add/add each): resolved to the tip's own versions (blobs a314159184615ca4
  and 9c5f84783dede77a) - the same duplicate-batch situation with batch
  seven, and the tip is batch six itself, whose receipts
  (`edit-inline-address.md`, `overlay-guide-address.md`) ride the tree.
- Merge 12 (workbatch-d into the chain), `src/card/fetch.ts` (content): the
  two lanes added different fetch-engine methods at the same insertion point
  (workbatch-c the card-side refresh of fetch/all.rb and the
  standard_uri_fetch controller build; workbatch-d the Card::Mark#cardish
  translation). Resolved to the union: all three methods stand, each side's
  bytes untouched.
- Merge 12, `docs/runs/treewalk-row-conversion-2026-10-22/README.md`
  (content): the status table rows the two lanes each wrote for their own
  treewalk rows. The lanes changed disjoint RECEIPT.md files, so the table
  resolved row by row to the receipt files the merged tree carries:
  workbatch-c's closes for dirty and fetch (DONE, GAP 0), workbatch-d's rows
  for the other eight. No row's verdict was written from a table alone.
- Merge 15 (workbatch-e into the chain), the same treewalk README (content):
  workbatch-e's eight closes stand DONE at GAP 0 over the chain's rows (its
  RECEIPT.md files are the only ones that name them), and the summary line
  reads 17 of 30 - the four closes the doc carried at the base, plus
  workbatch-d's five and workbatch-e's eight, the counting rule each lane's
  own edit followed.

## 3. The two defects this roll's own runs found, and the repair commits

Both defects are roll-line repairs, the v22 receipt's section-3 class:

1. `d439d8844bc8f442a471a1d8971436801214e25e`: the merge-12 fetch.ts union
   gave the region's single shared closing brace to the cardish side only,
   leaving standardUriFetch unclosed - a parse error every suite that imports
   the fetch engine catches on transform. Found by this roll's own targeted
   run of the five resolved gapbatch suites (the pre-repair log is kept,
   `tmp/roll-v11-20261102/resolved-targeted-run.log`), repaired by restoring
   the brace between the two sides' methods; the targeted run then reads 19
   of 19 (`resolved-targeted-run2.log`).
2. `d731e4854de41f56ac0b365614192aa58a4eb624`: the workbatch-a inventory pin
   (the named row's edge-seam restatement) walks `deploy/` and greps every
   .ts/.mjs/.js file for the refresh-seam identifiers. Its walk descended
   into `deploy/dist/`, the gitignored build output this roll's own bundle
   verdict builds, where the minified engine bundle legitimately carries
   engine identifiers the pattern names - a built tree read as a wired seam.
   The base tree never met this pin (the inventory rides this roll's own
   merge), so the roll's gate run was the pin's first meeting with a built
   tree. The repair scopes the walk to the tracked deploy sources: the walk
   skips a directory named `dist/`, the repo's own build-output rule
   (.gitignore line 2). Against the sources the pin judges, `git grep` for
   the same pattern over the tracked deploy tree reads zero files; the pin
   reads 10 of 10 on the repaired tree (`inventory-repair-run.log`).

## 4. The bundle: the headline verdict

The base tree (the v22 candidate) builds clean under the tree's own
boot-safety guard (`tools/vendor/edge-bundle-budget.mjs`): 7,449,150 UTF-8
bytes against the 7,600,000-byte budget (`tmp/roll11-base/bundle-before.log`
in the base-gates lane), the same bytes and hash the v22 receipt recorded -
the build reproduces byte for byte. The base worker bundle: 73,230 bytes,
SHA-256 `35ccc2543617fb299e4b9d6815ccae81003b90c7ab102f263f8eedaa144aa6a1`.

The merged tree's build - the headline this roll exists to record - PASSES:

| artifact | bytes | SHA-256 | verdict |
|---|---|---|---|
| bunny-edge-engine.bundle.js | 7,460,531 | 9b23a398c7c690dd867b153d1f51477c80e7b6f831e8702d14f82eee1595da46 | PASS, 139,469 bytes under the 7,600,000 boot-safe budget |
| bunny-edge-engine.code.json | 7,603,224 | 423dbb0d1fa819f5fb8ea522173723e933fcf3c87e32fc993124b34f4783ded1 | payload written |
| bunny-edge-read.bundle.js | 2,177,260 | eb6a828fac87f82ca57783b508c595c42e95a9203766681219f725ef016728ad | PASS |
| bunny-edge-read.code.json | 2,261,129 | 3890ca86fb7561df48769f38b65436e38fd96539f61a0afed1a8e1e0d0f75d0b | payload written |
| bunny-worker.bundle.js | 73,230 | 35ccc2543617fb299e4b9d6815ccae81003b90c7ab102f263f8eedaa144aa6a1 | PASS, byte-identical to the base tree's |

The engine build is byte-identical before and after the two repair commits
(the same hash; the repairs' bytes - one brace, one test-file walk guard -
wash out of the compiled engine, whose graph carries neither), recorded in
`bundle-after.log` and `bundle-after-repaired.log`. The guard's WARN line
(over eighty per cent of the limit) is the same standing notice the v20
through v22 builds carried. Where the movement comes from: the batch's
engine-graph additions are small (the fetch engine's three new methods, the
follow preference permit's virtual-set arm, the mail unfollow's stock link
shape, the subcard transport gaps, the slot show-list parser arm, the
standard_uri_fetch assignment), net +11,381 engine bytes on the v22 build;
the gapbatch and workbatch receipts and tests are not engine graph.

## 5. The gates

Typecheck, `npx tsc --noEmit`: exit 0, zero output lines on the base tree
(`C:/localProjects/decko-ts-roll11-base-gates-20261025/tmp/roll11-base/tsc-base.txt`)
and on the merged tree at every checkpoint (`tsc-merged.txt` clean before the
repairs; the repairs touch a test file only).

Correctness, `node tools/test-gates.mjs run correctness`:

| | base tree c17906db | merged tree d731e485 (repairs in) |
|---|---|---|
| gate exit | 1 | 1 |
| test files | 1 failed, 710 passed, 54 skipped (765) | 1 failed, 725 passed, 54 skipped (780) |
| tests | 1 failed, 7348 passed, 227 skipped (7576) | 1 failed, 7471 passed, 227 skipped (7699) |
| node:test | 3 files, 15 passed, 0 failed | 3 files, 15 passed, 0 failed |

Logs: the base tree in the base-gates lane
(`tmp/roll11-base/correctness-base.log`), the merged tree in the roll lane
(`tmp/roll-v11-20261102/correctness-merged-final.log`; the pre-repair run
`correctness-merged.log` is the one that caught the inventory pin's built-tree
false positive, section 3.2).

The base tree's failure set: `tests/hygiene/machine-lane-worktree-disk-hygiene.test.ts`
(the machine's own `decko-ts-lane-archives` directory, as the v19 through v22
receipts record). The merged tree's failure set is the same file, file for
file: the comparison script over both logs (conflict-marker-stripped,
failed-suite lines) reads equal, new-in-merged none, gone-from-base none.
The fifteen new test files the batch carries all pass on the merged tree
(780 files to the base's 765).

## 6. The disk cost

Added to the machine: two lane checkouts, 286,997,973 and 286,997,976 added
bytes of tracked working tree (each measured by the lane-copy admission, the
shared install linked through a junction rather than copied), the rebuilt
`deploy/dist/` build output in the roll lane (gitignored, the hashes of
section 4), and the two lanes' gitignored scratch (`tmp/roll-v11-20261102/`,
`tmp/roll11-base/`) holding the gate logs, the bundle hash records, the
conflict artifacts, the resolver scripts, the ls-remote capture and the merge
set.

## 7. What this lane did not do

- Nothing deployed. No URL was fetched, so no URL is reported working.
- Nothing was written to the live D1, and the cs-edge database was not touched.
- The other candidate branches on origin were not moved. The roll pushes one
  branch: `deploy/full-candidate-20261102`.
- No source branch was rebased, and no tip was moved. The two repair commits
  are the only non-merge commits on the roll line.
- The culturesmith host was not touched.

## 8. The frontier, and what the fold that follows reads

The fold promotes forty-four rows on the receipts this tree carries: the
seven register rows workbatch-a closed (routes A17, A22, A23; dsl A10, A22,
B21, B22; B6 stays named on its own receipt), the seven workbatch-b closed
(dsl C7; redteam A2, A12; the three redteam disputes; the auth-setup
treewalk row; C11 stays named), the twenty treewalk rows the c/d/e workbatch
receipts close (cache-all, cache-rb, content-all, content-clean, content-rb,
dirty, fetch; mailer, mark, model-save-helper, reference, rule; setting,
subcards, view, d1, d2, d3, e1, e3), the three act082 smell rows workbatch-f
closed, the chain-join-plan row workbatch-g closed, the five rows workbatch-h
closed (pd-3, pd-4, pd-5, pd-6; the carrierwave row closed with its residual
named), and the follow-operations smell row the followfix leg closes (its own
evaluator reads 3 of 3 at the tip on the stock link shape, the exact demand
the batch-g review named as the product decision now made). It opens and
closes the five audit-gap rows the gap batches close (the :overlay_guide,
:modal_nest_rules and :edit_inline views, the *css and *changed_card setting
addresses), one row per element with the duplicate-batch pins named. The ten
suspects receipts (SOURCE EXISTS, outcome a) are folded onto their rows'
records without touching their buckets, the treewalk remainders (director,
format, name, set, e5) keep their measured gap counts from the merged
README, and the batch-g and batch-h named rows keep their named mechanisms.
Nothing deploys.
