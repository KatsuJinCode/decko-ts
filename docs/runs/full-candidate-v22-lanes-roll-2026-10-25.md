# Full candidate v22: the five lane roll, the corpus back under the bundle budget

The assignment: roll this batch's pushed family lane tips into the next
integration candidate, verify every tip on origin before the merge, merge them
one merge commit each, resolve any conflict by region with the reason named,
rebuild the engine bundle and record SHA-256 and bytes before and after - the
bundle guard's verdict being this roll's headline, because the v21 roll's
build was refused at the boot-safe budget and the corpus-out-of-engine-graph
lane queued to fix exactly that - then gate (typecheck plus the correctness
battery) with the merged tree's failure set equal to the base tree's file for
file, and push. Then the chained fold. Nothing deploys.

## 0. The lane's exclusive checkout

Made through the sanctioned lane-copy path, not by a clone and not by a raw
worktree add:

    node C:/localProjects/juc-relay/fleet/lane-copy.mjs \
      --repo C:/localProjects/decko-ts-release-lead \
      --path C:/localProjects/decko-ts-candidate-roll-20261101 \
      --branch deploy/full-candidate-20261101 \
      --base deploy/full-candidate-20261031 \
      --shared-modules C:/localProjects/decko-ts-capability-round9-20261024/node_modules \
      --budget-mb 340 \
      --owner roll-v10-and-fold --purpose "integration roll v10: the five family lane tips merged into deploy/full-candidate-20261101, the corpus back under the bundle budget"
    outcome: created, lease 9d33cefe51f8, trackedBytes 286760050,
    addedBytes 286760141, budgetBytes 356515840,
    nodeModules: junction -> C:\localProjects\decko-ts-capability-round9-20261024\node_modules

The 340 MB admission budget (the tool's default is 300) is stated, not
slipped: the base tree grew by the seed-corpus asset and this batch's files
(trackedBytes 282431267 at the v9 lane to 286760050 here), which pushed the
tool's estimate (tracked + ten per cent, its own formula) 15 MB over the
default. The volume had 28 GB free at creation.

The shared install was chosen because its `package-lock.json` is byte-identical
to the base tree's own lockfile (`sha256sum` on the shared install's file and
on `git show 7cde06a8:package-lock.json` both read
`96a3efb62e81fdb24516d8106316e92e44cdde583d63399ca0b6e1e54731ae69`), so the lane
runs the dependencies its own lockfile names.

The base is `deploy/full-candidate-20261031` at tip `7cde06a8`, read back from
origin with `git ls-remote` before the lane was created.
`git ls-remote origin refs/heads/deploy/full-candidate-20261101` read nothing
before this roll, so the branch is new on origin.

A second lane copy at the same base carries the BASE tree's own gate runs for
the file-for-file comparison:
`C:/localProjects/decko-ts-roll10-base-gates-20261025`
(`check/roll10-base-gates-20261025`, lease 8f7f717c4eeb, same shared install).

## 1. The merge set, verified on origin before the merge

The whole remote was read with one `git ls-remote origin 'refs/heads/*'` (632
heads, kept in the lane's scratch as `tmp/roll-v10-20261101/lsremote-all.txt`),
every head was fetched forward-only into the lane checkout
(`git fetch --no-tags origin '+refs/heads/*:refs/remotes/origin/*'`, exit 0),
and every tip's ancestry against the roll tip `7cde06a8` was decided with `git
merge-base --is-ancestor`. 287 heads are not ancestors of the roll; the list
is kept as `tmp/roll-v10-20261101/nonancestor-all.txt`. The delta against the
v9 roll's own full ls-remote capture
(`C:/localProjects/decko-ts-candidate-roll-20261031/tmp/roll-v9-20261031/lsremote-all.txt`)
is exact: six heads appeared on origin since that capture, and they are this
roll's base (the v9 push itself) plus the five family lane tips below. Nothing
else on the remote moved.

| # | branch | tip (origin) | merge commit | conflicts |
|---|---|---|---|---|
| 1 | port/regfix-row22-20261025 | 0d31ba3d6c212949326e85610856efcc3468121c | 2b7ce9812ce6ae8af6ea57ffedddb059dcf246c8 | 5 files, see section 2 |
| 2 | port/w4-editor-20261025 | b2b377cad5696a12629fe437fc612c207de08000 | 3b93f9080a72b97fe373bb01628a5c1cad65bd1c | none |
| 3 | port/seed-corpus-20261025 | b3a50c3129acf9074be4c845c928ad29a76a6c1e | 39cf250ef0c172ea0fc6d2b1c2b5df7f77fe7ebb | none |
| 4 | port/gapbatch-3-20261025 | e35549bd57739b1c8762953c25145fd0857087c4 | b8efd26adc879bf5420a9007f4dfac9af6dbdc74 | none |
| 5 | port/gapbatch-4-20261025 | 85a967dfb6c726410bc5a5fd28ffc0067476812f | 791253dbb0da282e9829bb4feb4a89ba38297f8c | none |

The row22 lane closes register row 22 (the boot cascade, the item read, the
serving-walk wiring, the receipt), the w4-editor lane closes the W4
dashboard leg (the codename fallback in the loose type_plus_right arm, the
instrument re-graded, 9 of 9 with the family at 315 of 320), the seed-corpus
lane moves the defaults corpus out of the engine graph into a deploy seed
asset, gap batch three closes the audit's restart-persistence gaps and pins
the five navbar entries, and gap batch four seats the :email_page,
:action_expanded, :action_summary and :new_in_modal views at their captured
addresses. Each lane tip was read back at the exact hash the ls-remote read
gave.

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
commit's first-parent chain runs back through the old HEAD. The five merges
were chained object-side, so the working tree and the real index were never
touched until the single fast-forward at the end; the conflicted files were
resolved from the conflicted trees through a scratch index
(`GIT_INDEX_FILE` in the lane's scratch) and `git hash-object -w`, which
touches only the object store. No branch was rebased and no source branch was
moved.

## 2. The conflicts, by region

Merge 1 (row22 into v21) reported five conflicted files:

- `docs/runs/register-rows-roster-batch-2026-10-25/reg-mods-22/RECEIPT.md`,
  both regions: the receipt is the row's own close, and the two lanes carry
  its pre-close and closed states (v21 landed regfix-2's WORKING ON IT
  receipt at 52b0812b; the row22 lane re-landed those six files at 94d05e14
  and closed the row). Resolved to the lane tip's file verbatim: Verdict
  DONE, the close narrative, the recorded run, the instruments.
- `src/card/auth/boot-seed.ts`, one region: the roll side's return carries
  the v21 corpus pin (`defaultsRowsInserted`), the lane side adds boot seed
  layer D before the return. Resolved as the union: layer D runs, and the
  return carries both `modCardCascade` and the corpus pin.
- `src/card/mod-loader/mods/card-mod-list.ts`, four regions: the lane side's
  `cardRowByName`/`cardIdByName` helpers and its Card.fetch-shaped item read
  supersede the v21 key-join read (the cards table stores no key for
  junction rows); regfix-2's errors.add seam work outside those regions
  auto-merged. All four regions resolved to the lane side.
- `src/server/write-routes.ts`, one region: the lane side is the actual
  wiring of the abstract list validate pair into the serving walk; the roll
  side's region content is the comment naming that wiring as pending.
  Resolved to the lane side.
- `tests/card/auth/register-row-12-boot-seed-fresh-deck-card-count.test.ts`:
  MISSED at merge time. The conflict list was read with a truncated display
  and only the first four files were resolved; the fifth file's conflict
  markers rode the merged tree through merges 2 to 5 and the fast-forward.
  The tree's own checks caught it (tsc TS1185, then the gate's parse
  failure): the row22 lane had re-landed the pre-corpus row-12 test (its
  layer-D count receipt, 133 cards on a core-seeded deck) while the roll
  carries the corpus close. Repaired at `07c28a38` to the corpus asset era's
  own file (the seed lane's b3a50c31 version), whose per-table INSERT pins,
  card-for-card match and account legs pass on this tree; the cascade's own
  products stay pinned by `boot-mod-cards.test.ts`. Section 3 records the
  whole repair.

Merges 2 through 5 reported no conflicts.

## 3. The three defects the roll's gates found, and the repair commit

`07c28a38` ("The merge defects this roll's gates found, repaired on the roll
line") is the roll line's one non-merge commit, in the line of the v19
registry repair and the v21 pin repair:

1. The row-12 test's conflict markers (section 2, fifth file).
2. The cascade's own test (`boot-mod-cards.test.ts`) drove
   `bootstrapFreshDeck`, which since the corpus became boot-time data takes
   the defaults arm: db:setup exactly, no ensure layer over the corpus,
   layer D included, because the corpus carries Ruby's own cascade rows (the
   seed lane's early return and its contract that callers pass the loaded
   asset). The test now seeds the index-1 core corpus - the arm the boot
   keeps the ensure layers live on - and drives `ensureInstalledModCards`
   the way the boot's core arm does; `seedCoreFixture` is exported for it,
   and the defaults arm's early return reports the skip as the zero cascade
   the `BootSeedResult` shape (the row22 lane's own addition) requires.
3. The row22 lane closed the row in its receipt (Verdict: DONE) but left the
   inventory spec (`register-rows-roster-batch-inventory.test.ts`) at
   WORKING and the census fixture's verdict at WORKING, and the inventory
   pin refused the half-updated close in the merged tree's first gate run.
   The spec and the fixture now carry DONE with the empty gap the
   inventory's own rule requires of a closed row.

The repair commit's targeted run: the four affected suites, 25 of 25
(`tmp/roll-v10-20261101/repair-targeted-run.log`).

## 4. The bundle: the headline verdict

The base tree's engine build is REFUSED by the tree's own boot-safety guard
(`tools/vendor/edge-bundle-budget.mjs`, decision record
`docs/decisions/0009-bunny-edge-bundle-stays-a-single-script.md`), exactly as
the v21 receipt recorded: 7,626,797 UTF-8 bytes against the 7,600,000-byte
budget (`tmp/roll-v10-20261101/bundle-before.log`; the guard throws before
any write, so the on-disk artifacts stay absent). The base worker bundle
builds clean: 73,230 bytes, SHA-256 `35ccc2543617fb299e4b9d6815ccae81003b90c7ab102f263f8eedaa144aa6a1`.

The merged tree's build - the headline this roll exists to record - PASSES:

| artifact | bytes | SHA-256 | verdict |
|---|---|---|---|
| bunny-edge-engine.bundle.js | 7,449,150 | 38a62110d241e1324e27d2260c7bd10f79d9af28e64505254c8520ede12dd247 | PASS, 150,850 bytes under the 7,600,000 boot-safe budget |
| bunny-edge-engine.code.json | 7,591,513 | ee83e3c00ae264a9d29789b64300d4e817714662fe965503ac5f50c7d2616eb8 | payload written |
| bunny-edge-read.bundle.js | 2,168,073 | 5b7b2c63c80bf7e0371f99b9ba7d62d83a273a4e6b6720b9faf0f75ea8b468f3 | PASS |
| bunny-edge-read.code.json | 2,251,641 | 31dcb01381baf076dd7f2fe594d97ebf9865da32ed99362f227cce1318b29b6c | payload written |
| bunny-worker.bundle.js | 73,230 | 35ccc2543617fb299e4b9d6815ccae81003b90c7ab102f263f8eedaa144aa6a1 | PASS, byte-identical to the base tree's |

The engine build is byte-identical before and after the `07c28a38` repair
(the same hash; the repair's bytes wash out in the compiled output), recorded
in `bundle-after.log` and `bundle-after-repaired.log`.

Where the movement comes from, by file census (not a metafile dissection;
the guard passes and no budget decision is asked): the corpus module
`src/card/auth/defaults-seed-corpus.ts` (19,310 lines, the v21 roll's
+430,975 input bytes) is DELETED; the seed asset `deploy/seed/
defaults-seed-corpus.json` (19,237 lines) and its loader
`defaults-seed-corpus-asset.ts` (133 lines) are boot-time data the engine
never imports; the four other lanes' product sources come in
(`boot-mod-cards.ts` +384 lines, the follow codename fallback, the four
seated views' seating), and the tests the batches carry are test files, not
engine graph. Net: the engine script is 177,647 bytes SMALLER than the v21
refusal, under the budget with 150,850 bytes of headroom, and the guard's
WARN line (over eighty per cent of the limit) is the same standing notice
the v20 build carried.

## 5. The gates

Typecheck, `npx tsc --noEmit`: exit 0, zero output lines on the base tree
(`C:/localProjects/decko-ts-roll10-base-gates-20261025/tmp/tsc-base.txt`) and
on the merged tree at every checkpoint (`tsc-merged.txt` caught the fifth
file's markers, `tsc-merged2.txt` caught the cascade result shape,
`tsc-merged3.txt` clean after the repair).

Correctness, `node tools/test-gates.mjs run correctness`:

| | base tree 7cde06a8 | merged tree 07c28a38 |
|---|---|---|
| gate exit | 1 | 1 |
| test files | 1 failed, 707 passed, 54 skipped (762) | 1 failed, 710 passed, 54 skipped (765) |
| tests | 1 failed, 7332 passed, 227 skipped (7560) | 1 failed, 7348 passed, 227 skipped (7576) |
| node:test | 3 files, 15 passed, 0 failed | 3 files, 15 passed, 0 failed |

Logs: the base tree in the base-gates lane
(`C:/localProjects/decko-ts-roll10-base-gates-20261025/tmp/correctness-base.log`),
the merged tree in the roll lane
(`tmp/roll-v10-20261101/correctness-merged-final.log`; the pre-repair run
`correctness-merged-full.log` is the one that caught the row-22 inventory
refusal, section 3).


The base tree's failure set: `tests/hygiene/machine-lane-worktree-disk-hygiene.test.ts`
(same file, same assertion, the machine's own `decko-ts-lane-archives`
directory, as the v19, v20 and v21 receipts record). The merged tree's
failure set is the same file, file for file, and the three new test files the
lanes carry all pass on the merged tree (765 files to the base's 762).


The file-for-file comparison of the failure sets:



## 6. The disk cost

Added to the machine: two lane checkouts, 286,760,141 and 286,760,144 added
bytes of tracked working tree (each measured by the lane-copy admission, the
shared install linked through a junction rather than copied), the rebuilt
`deploy/dist/` build output in the roll lane (gitignored, the hashes of
section 4), and the two lanes' gitignored scratch (`tmp/roll-v10-20261101/`,
`tmp/`) holding the gate logs, the bundle hash records, the merge and
conflict artifacts, the resolver scripts, the ls-remote capture and the
non-ancestor list.

## 7. What this lane did not do

- Nothing deployed. No URL was fetched, so no URL is reported working.
- Nothing was written to the live D1, and the cs-edge database was not touched.
- The other candidate branches on origin were not moved. The roll pushes one
  branch: `deploy/full-candidate-20261101`.
- No source branch was rebased, and no tip was moved. The merge-defect repair
  `07c28a38` is the only non-merge commit on the roll line.
- The culturesmith host was not touched.

## 8. The frontier, and what the fold that follows reads

The fold promotes register row 22 on its receipt (Verdict: DONE at this tip)
and cap-W4 on the editor leg's records (both run records read rowState
covered, every declared leg true), opens and closes the eleven audit-gap rows
the gap batch three and four receipts close (the five navbar entries, the two
restart-persistence gaps with the unfollow write refusal named in the row and
left open on mx-155-capability-catalog-follow and
smell-evaluate-follow-operations, and the four seated views), and folds the
corpus landing onto reg-mods-12's record: the queued budget fix has landed in
this tree, the corpus is boot-time data, and the guard passes.
