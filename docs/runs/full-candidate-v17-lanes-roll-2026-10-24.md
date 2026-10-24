# Full candidate v17: the two lane roll, Saturday 2026-10-24

The assignment: roll this batch's lane tips into the full integration
candidate, verify every tip, merge them one merge commit each, resolve the
conflicts by region, rebuild the engine bundle and record SHA-256 and bytes
before and after, gate (typecheck plus the correctness battery), and push.
Nothing deploys.

The lane's exclusive checkout is
`C:/localProjects/decko-ts-candidate-roll-20261027`, made through the
sanctioned lane-copy path, not by a clone and not by a raw worktree add:

    node C:/localProjects/juc-relay/fleet/lane-copy.mjs \
      --repo C:/localProjects/decko-ts-release-lead \
      --path C:/localProjects/decko-ts-candidate-roll-20261027 \
      --branch deploy/full-candidate-20261027 \
      --base deploy/full-candidate-20261026 \
      --shared-modules C:/localProjects/decko-ts-candidate-roll-20261026/node_modules \
      --owner worker-3 --purpose "integration roll v5: lane tips merged into deploy/full-candidate-20261027"
    outcome: created, lease ab0ac7a275c9, trackedBytes 265841571,
    addedBytes 265841662, budgetBytes 314572800, estimateBytes 292425729,
    nodeModules: junction -> C:\localProjects\decko-ts-candidate-roll-20261026\node_modules

The base is `963f0610ef48f280e2c067afadd52af3d365d3b8`, verified on origin
with `git ls-remote origin refs/heads/deploy/full-candidate-20261026` (the
same hash the assignment names) and locally with `git rev-parse
deploy/full-candidate-20261026` in the new checkout, which read the same
hash. The remote is `https://github.com/KatsuJinCode/decko-ts`, private
(`gh repo view KatsuJinCode/decko-ts --json isPrivate` reads `true`). The
branch `deploy/full-candidate-20261027` did not exist on origin before this
roll (`git ls-remote origin refs/heads/deploy/full-candidate-20261027` read
nothing).

The system drive read 19.00 GB free before the lane copy was made and
14.31 GB free when the roll's work was finished. The lane's own footprint
is the checkout's 265841662 added bytes plus the gitignored build output and
scratch; the rest of the change in the free number belongs to the other
lanes working on this machine at the same time.

## 1. The wait-check

The assignment named the branches this batch pushes (register-events round
seven and matrix round ten) and asked for the same bounded wait-check as the
roll-v3 and roll-v4 rolls. The wait-check ran as the lane's own bounded
poll, `C:/localProjects/brandonDojoTech/tmp/fold-roll5-20261024/wait-for-lanes.mjs`,
which reads the branch tips on origin and the fleet queue's task states
every thirty seconds. It ran in two bounded windows: the first of thirty
minutes from 11:59:01Z, which closed at 12:28:55Z, and a second of twelve
minutes from 12:30:00Z, which closed early at 12:31:40Z because every batch
branch was pushed by then. The poll's own capture is
`C:/localProjects/brandonDojoTech/tmp/fold-roll5-20261024/wait-log.txt`.

| time (Z) | register-events r7 | matrix r10 | register-events r6 | routes r9 | matrix r9 |
|---|---|---|---|---|---|
| 11:59 | absent, claimed | absent, claimed | 1765e705, PUSHED | 836b9b67, PUSHED | 83ca98cd, PUSHED |
| 12:16 | 97ceae40, claimed, PUSHED | absent, claimed | 1765e705, PUSHED | 836b9b67, PUSHED | 83ca98cd, PUSHED |
| 12:28 (window closed) | 9c9eaf8b, claimed, PUSHED | absent, claimed | 1765e705, PUSHED | 836b9b67, PUSHED | 83ca98cd, PUSHED |
| 12:31 (window closed early) | 9b4b9b58, claimed, PUSHED | 12085322c, claimed, PUSHED | 1765e705, PUSHED | 836b9b67, PUSHED | 83ca98cd, PUSHED |

The three lanes the roll-v4 receipt named as left out were already pushed
when the poll started, so they were ready at the first poll; they are in the
table so the receipt's own table is complete. The two batch lanes were
still working (their queue tasks read "claimed" throughout), and the roll
merged the tips that existed and were pushed at the merge moment, not the
tips those lanes reach afterwards. Section 8 names what was left out.

## 2. The merge set, verified on origin before the merge

| # | branch | tip (origin) | merge commit | conflicts |
|---|---|---|---|---|
| 1 | port/register-events-round7-20261024 | 9b4b9b5894c50551a5c2670d0e19e318143c9182 | f69acfbc8b99826e80b1c9ca7053d35bf27bdd70 | none |
| 2 | port/matrix-round10-20261024 | 12085322c9a0cd0db5cdc644b7427793b56d4d10 | 051e8323a4e36d2c9fc7b3ac2056fad726eff87a | one file, two regions |

Every tip was read from origin with one `git ls-remote` read per check and
then fetched forward-only into the lane checkout
(`git fetch --no-tags origin refs/heads/<branch>:refs/remotes/origin/<branch>`),
and each fetched tip read back at exactly the hash the origin read gave. The
two captures of the merge moment are kept in the lane's scratch:
`tmp/roll-v5-20261027/lsremote-merge-read.txt` (12:32:14Z, the read the
merges were taken from) and `tmp/roll-v5-20261027/lsremote-post-merge.txt`
(12:40:10Z, the read after the merges).

Every merge commit carries the previous roll commit as its first parent and
the lane tip as its second, verified with `git rev-list --merges --parents`
on the roll tip:

    051e8323a4e36d2c9fc7b3ac2056fad726eff87a f69acfbc8b99826e80b1c9ca7053d35bf27bdd70 12085322c9a0cd0db5cdc644b7427793b56d4d10
    f69acfbc8b99826e80b1c9ca7053d35bf27bdd70 963f0610ef48f280e2c067afadd52af3d365d3b8 9b4b9b5894c50551a5c2670d0e19e318143c9182

The roll carries 31 commits and 25 files changed (3013 insertions, 75
deletions) against the base.

Each lane's own contribution, measured as its merge commit's diff against
its first parent:

| lane | files | insertions | deletions |
|---|---|---|---|
| register-events round seven | 11 | 1403 | 69 |
| matrix round ten | 14 | 1610 | 6 |

### How the merges were made, and why

The house dangerous-action gate refuses `git merge` outside `--ff-only` and
names its own remediation in the rule text: "Use --ff-only, or build the
merge commit with git merge-tree and git commit-tree so the working tree is
never touched." The roll took that path. `git merge-tree --write-tree`
computes the real three-way merge, `git commit-tree` writes the merge commit
with the two parents, and `git merge --ff-only` advances the branch to it,
which is a fast-forward because the new commit carries the old HEAD as its
first parent. The working tree and the real index are never modified until
that fast-forward, and the fast-forward is a pointer move over a clean
checkout. The lane's own script for this is
`tmp/roll-v5-20261027/merge-lane.mjs`, and for the one merge that had
conflicts `tmp/roll-v5-20261027/build-resolved-tree.mjs`.

No branch was rebased and no source branch was rewritten.

## 3. The conflicts, resolved by region

One of the two merges had conflict regions, both of them in one file.
Every region was decided by reading both sides of the three-way merge and
by reading the auto-merged tree the merge produced.

| file | region | decision | why |
|---|---|---|---|
| tests/card/actions/write-path-races.test.ts | the `contentChangesOf` declaration and the map that builds it (one region) | theirs, the lane's text | Both sides fixed the same type error: the base declared the helper as `Promise<string[]>` while `card_changes.value` is nullable. Ours (the roll's tree, from commit 25970303 "Retire transaction attribution when its async work completes") declares `Promise<Array<string | null>>` and maps with `row.value!`; theirs (the matrix lane's tree) declares `Promise<(string | null)[]>` and maps with `row.value`, with the comment that says why the declaration changed. The two declarations are the same type, and the lane's map is the honest one: the non-null assertion `row.value!` silences the compiler on a value that can be null, while the lane's `row.value` returns the null the query can produce. The region keeps the lane's comment and its map, and the merged file is byte-identical to the lane's blob for this path (`git rev-parse HEAD:tests/card/actions/write-path-races.test.ts` reads `40f8ef4978228265270080682a9848e57f1e0bfa`, the lane's own blob). |
| tests/card/actions/write-path-races.test.ts | the `swallowProbe` guard on `driver.transaction` (one region) | theirs, the lane's text | Both sides added the same guard, because `SQLDatabaseDriver` declares `transaction()` optional and a driver without one is legal. Ours throws `Error('Swallow probe requires a transactional driver')`; theirs throws `new Error("swallowProbe: the driver has no transaction(), and the shared-driver probe needs one")` and carries the comment that says why the guard exists. The lane's message names the probe and the requirement, so the guard says in words what a reader would otherwise have to infer from the call site. Both guards are the same check; nothing of ours is lost, because outside these two regions the two sides' files are identical (the diff between the roll's blob `a0af7d781133792648869c0faf84ddce953912f3` and the lane's blob `40f8ef4978228265270080682a9848e57f1e0bfa` is exactly these two hunks). |

The resolved file was checked for surviving conflict markers before it was
hashed into the merge tree (`tmp/roll-v5-20261027/build-resolved-tree.mjs`
refuses a resolved file that still carries one), and the merge tree was
read into a temporary index so the checkout's own index was never touched.

## 4. The bundle

The engine bundle was rebuilt with `node tools/bundle-bunny-edge-engine.mjs`,
exit 0, on the base tree before the first merge and on the merged tree after
the last one.

| artifact | bytes before | bytes after | delta | SHA-256 before | SHA-256 after |
|---|---|---|---|---|---|
| bunny-edge-engine.bundle.js | 7399163 | 7399163 | 0 | cb6be678e7643861abe7b62ecb9b597ac7b75721473d7020163fc2e4b02547c7 | cb6be678e7643861abe7b62ecb9b597ac7b75721473d7020163fc2e4b02547c7 |
| bunny-edge-engine.code.json | 7539081 | 7539081 | 0 | 4cd35e0816ebba0d7d161cb97b2ebbd71fa75a2b74a40d704efd04adc7645a90 | 4cd35e0816ebba0d7d161cb97b2ebbd71fa75a2b74a40d704efd04adc7645a90 |
| bunny-edge-read.bundle.js | 2125767 | 2125767 | 0 | 5ffa88c91936089c02c3470728413be380631cd836f2e52ab1a74402d2b57397 | 5ffa88c91936089c02c3470728413be380631cd836f2e52ab1a74402d2b57397 |
| bunny-edge-read.code.json | 2207021 | 2207021 | 0 | eacad4e89533c52f82ca17114a65bf03eda71df4965080694b848545db97d880 | eacad4e89533c52f82ca17114a65bf03eda71df4965080694b848545db97d880 |

The bundle is byte-identical before and after, and the reason is measured,
not assumed: every changed line in `src/` in this roll is a comment line
(the diff of `src/` between the base and the merged tree has 0 changed lines
that are not a comment), because both lanes' work in this roll is the
repair of stale mechanisms in the mod files' own notes and comments, and the
one code conflict was resolved in a test file outside the bundle's import
graph. The build strips the comments, so the artifact does not move.

The "before" values are byte-identical to the "after" values the v16 roll
recorded for the same base tree, so the "before" is the real v16 artifact
and not a rebuild that drifted.

The build warns that the bundle is over 80% of the conservative
7600000-byte script limit (7399163 bytes is 97.4%). Nothing deploys, so this
is a fact for the record.

`deploy/dist/` is gitignored, so the bundles are build artifacts and do not
appear in the commit. The hashes above are the record, and the raw values
are in the lane's scratch (`tmp/roll-v5-20261027/bundle-before.json` and
`bundle-after.json`).

## 5. The gates

Typecheck, `npx tsc --noEmit`: exit 0, **zero output lines**
(`tmp/roll-v5-20261027/tsc-base.txt` on the base tree, and
`tmp/roll-v5-20261027/tsc-merged.txt` on the merged tree).

Correctness, `node tools/test-gates.mjs run correctness`: see section 6.

The two files the assignment names as the pre-existing set
(`tests/card/actions/atomic-saves.test.ts`, the MySQL 8.4 native group, and
`tests/deploy/worker-edge-cache-runtime.test.ts`) are matched by the deploy
bucket's rule in `tools/test-gates.mjs`, so the correctness gate does not run
either file. Both were run on the base tree and on the merged tree in this
lane, apart from the gate, and their results are in section 6.

## 6. The failure set, and what it is compared against

The base tree's own failure set was measured first, on the same checkout, at
the base commit, before the first merge
(`tmp/roll-v5-20261027/correctness-base.log`):

| | base tree 963f0610 |
|---|---|
| gate exit | 1 |
| test files | 2 failed, 681 passed, 54 skipped (737) |
| tests | 2 failed, 7074 passed, 249 skipped (7325) |
| node:test | 3 files, 15 passed, 0 failed |

The two base failures are machine state, not tree state:

| file | what it asserts | why it is red |
|---|---|---|
| tests/hygiene/machine-lane-worktree-disk-hygiene.test.ts | every lane worktree on disk is tracked in IN-FLIGHT.json or in tests/hygiene/keep-worktrees.json, none is under the 1 GB floor, and there are at most 15 | it names `decko-ts-lane-archives` as untracked (the gate's own remediation is `git -C C:/localProjects/decko-ts-restored worktree remove "C:/localProjects/decko-ts-lane-archives"`). That is machine state on the disk, not a property of this tree, and the worktree is not this lane's. |
| tests/tools/feedback-duration-probe-scan-root-survives-in-the-port-tree.test.ts | the dead machine pin the scan root used to point at is gone from the disk | it asserts `existsSync(deadPinnedCheckout)` is false and it is true: the pinned checkout is still on the machine. |

**The two failures the assignment names do not belong to this gate.** The
assignment's named pre-existing set is the MySQL 8.4 group of
`tests/card/actions/atomic-saves.test.ts` and
`tests/deploy/worker-edge-cache-runtime.test.ts`. Both are matched by the
deploy bucket's rule (`/(^|\/)deploy\//` and `atomic-saves`, the `match` in
`tools/test-gates.mjs`), so the correctness gate does not run either file.
Neither appeared in this run for that reason and not because they passed.
Both were run apart from the gate, on the base tree and on the merged tree,
and the two runs are identical:

| file | base tree 963f0610 | merged tree |
|---|---|---|
| tests/card/actions/atomic-saves.test.ts | 66 tests: 5 failed (the "atomic saves: MySQL 8.4 (native)" group), 61 passed | 66 tests: 5 failed (the same five names), 61 passed |
| tests/deploy/worker-edge-cache-runtime.test.ts | 1 failed ("hits byte-identically, bypasses credentials, and invalidates committed edits and read revocations"), 3 passed | 1 failed (the same test), 3 passed |
| both files together | 6 failed, 64 passed (70) | 6 failed, 64 passed (70) |

The six failing test names are identical between the two runs
(`tmp/roll-v5-20261027/named-baseline-failures-base.txt` and
`named-baseline-failures-merged.txt` differ by nothing). The named set is
therefore the same set before and after the roll: the six environmental
failures, unchanged.

The deciding run on the merged tree
(`tmp/roll-v5-20261027/correctness-merged.log`):

| | merged tree |
|---|---|
| gate exit | 1 |
| test files | 2 failed, 681 passed, 54 skipped (737) |
| tests | 2 failed, 7096 passed, 227 skipped (7325) |
| node:test | 3 files, 15 passed, 0 failed |

**The failure set equals the base tree's failure set, file for file and
message for message.** The two files that fail are the two files that
failed on the base tree, with the same two assertions: the worktree
hygiene gate names `decko-ts-lane-archives` as untracked, and the
scan-root probe's dead machine pin is still on the disk. Both are machine
state. The two runs ran the same 737 test files, the list of files is
identical between the two logs (`diff` of `files-base.txt` and
`files-merged.txt` is empty), and the per-file test counts are identical as
well (`diff` of `counts-base.txt` and `counts-merged.txt` is empty).

One count moved, and it is explained, and it is not a failure:

- The test count is the same (7325 in both runs), the passed count is 22
  higher and the skipped count 22 lower (7074 to 7096 passed, 249 to 227
  skipped). The 22 tests are the compiled skin stylesheet cases in
  `tests/card/assets/skin-stylesheet.test.ts`, which the base run skipped
  and the merged run ran and passed (52 tests, 22 skipped in the base run,
  52 tests and none skipped in the merged run). Their gate is the presence
  of the LibSass native program at `tools/libsass/build/sassc-stdin.exe` and
  its publication receipt, and that receipt
  (`tools/libsass/build/sassc-stdin.exe.manifest.json`) carries the time
  05:42 local, inside the merged run and after the base run. Both the
  program and the receipt are gitignored build output
  (`tools/libsass/.gitignore` ignores `build/`), so this is machine state,
  not tree state, and the tree change is nothing.

## 7. The disk cost

Added to the machine: the lane's checkout, 265841662 bytes of tracked
working tree (the lane-copy admission measured 265841571 tracked bytes
plus the shared install linked through a junction rather than copied), the
rebuilt `deploy/dist/` build output (gitignored), and the lane's gitignored
scratch (`tmp/roll-v5-20261027/`), holding the gate logs, the bundle hash
records, the merge-tree records, the resolved conflict file and the
ls-remote captures.

Kept: the lane's checkout, because it holds those records and the fold's
own git reads point at it. Nothing was deleted by hand: no space was freed,
no file was removed, and the delete gate was not routed around.

## 8. What this lane did not do

- Nothing deployed. No URL was fetched, so no URL is reported working.
- Nothing was written to the live D1.
- The other candidate branches on origin were not moved. The roll pushed one
  branch: `deploy/full-candidate-20261027`.
- No source branch was rebased, and no tip was moved.

## 9. What was left out

The two batch lanes were still working when the merge phase started, so the
roll merged the tips that were pushed at that moment and the commits those
lanes land afterwards are named here as left out. The lane tips read on
origin at 12:40:10Z, after the merges, against the tips that were merged:

| lane | tip merged | tip afterwards | what the later commits carry |
|---|---|---|---|
| port/register-events-round7-20261024 | 9b4b9b58 | 5e9aceb5 | the row reg-evt-mod-permissions-update-rule-cache, the tenth row of that lane's brief |
| port/matrix-round10-20261024 | 12085322 | 2ef74d00 | the tranche-17 receipt: the whole-family exercise at the branch's tip, 253 of 253, adjudicating the six sign-in and account rows |

The routes round nine lane's tip moved after the roll-v4 roll merged it, and
this roll did not merge it, because the assignment named this batch's two
branches as the merge set. It is named here as left out: the tip on origin
is `836b9b67b62e7224272297b1a4041e4583914370` and it carries the rows
`reg-routes-D3` (commit da377023) and `reg-routes-D4` (commit 44fdc855) and
the round's landing and cleanup receipt (836b9b67). Those two rows stay
named in the completeness roster.

The register-events round six lane's tip moved after the roll-v4 roll merged
it, and this roll does carry it: the register-events round seven branch
starts from the round six tip `1765e705af68236c3aca7bdda8c8914354a79c6f`
(the round seven brief names that tip as its base), so the round six lane's
four remaining rows (reg-evt-mod-comment-add-comment,
reg-evt-mod-follow-update-follow-rules, reg-evt-mod-layout-clear-roles-cache
and reg-evt-mod-layout-update-layout-registry) ride in the merged tree as
ancestors of the round seven tip. The fold against this roll reads that
ancestry per row.

The matrix round nine lane's tip moved after the roll-v4 roll merged it, and
this roll carries it for the same reason: the matrix round ten branch starts
from the round nine tip `83ca98cddc093c550bcbc5bf7b7f640e117c54b3`, so the
round nine lane's five remaining rows (mx-B-038 through mx-B-042) and the
family's whole-family exercise ride in the merged tree as ancestors of the
matrix round ten tip.
