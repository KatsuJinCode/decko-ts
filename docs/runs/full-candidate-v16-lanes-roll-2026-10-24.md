# Full candidate v16: the six lane roll, Saturday 2026-10-24

The assignment: roll this batch's frozen lane tips into the full integration
candidate, verify every tip, merge them one merge commit each, resolve the
conflicts by region, rebuild the engine bundle and record SHA-256 and bytes
before and after, gate (typecheck plus the correctness battery), and push.
Nothing deploys.

The lane's exclusive checkout is
`C:/localProjects/decko-ts-candidate-roll-20261026`, made through the
sanctioned lane-copy path, not by a clone and not by a raw worktree add:

    node C:/localProjects/juc-relay/fleet/lane-copy.mjs \
      --repo C:/localProjects/decko-ts-release-lead \
      --path C:/localProjects/decko-ts-candidate-roll-20261026 \
      --branch deploy/full-candidate-20261026 \
      --base deploy/full-candidate-20261025 \
      --shared-modules C:/localProjects/decko-ts-candidate-roll-20261025/node_modules \
      --owner worker-4 --purpose "integration roll v4: lane tips merged into deploy/full-candidate-20261026"
    outcome: created, lease fc4aeb525ffd, trackedBytes 265692674,
    addedBytes 265692765, budgetBytes 314572800, estimateBytes 292261942,
    nodeModules: junction -> C:\localProjects\decko-ts-candidate-roll-20261025\node_modules

The base is `b299b6f3d5fa768955c8a086fdd3af80a681b4e5`, verified on origin
with `git ls-remote origin refs/heads/deploy/full-candidate-20261025` (the
same hash the assignment names) and locally with `git rev-parse
deploy/full-candidate-20261025` in the new checkout, which read the same
hash. The remote is `https://github.com/KatsuJinCode/decko-ts`, private
(`gh repo view KatsuJinCode/decko-ts --json isPrivate` reads `true`). The
branch `deploy/full-candidate-20261026` did not exist on origin before this
roll (`git ls-remote origin refs/heads/deploy/full-candidate-20261026` read
nothing).

The system drive read 19.87 GB free before the lane copy was made and
17.85 GB free after the roll's work was finished. The lane's own footprint
is the checkout's 265692765 added bytes plus the gitignored build output
and scratch; the rest of the change in the free number belongs to the other
lanes working on this machine at the same time.

## 1. The wait-check

The assignment named the lane branches the roll-v3 receipt left out (the
post-merge commits of routes round eight, matrix round eight and save-path
round seven) and the branches this batch pushes (register-events round six,
routes round nine, matrix round nine), and asked for the same bounded
wait-check as roll v3. The wait-check ran as the lane's own bounded poll,
`C:/localProjects/brandonDojoTech/tmp/fold-roll4-20261026/wait-for-lanes.mjs`,
which reads the branch tips on origin and the fleet queue's task states
every thirty seconds. It ran in two bounded windows: the first of thirty
minutes from 10:52:14Z, and a second of twelve minutes from 11:22:20Z,
which closed early at 11:23:21Z because every batch branch was pushed by
then. The poll's own capture is
`C:/localProjects/brandonDojoTech/tmp/fold-roll4-20261026/wait-log.txt`.

| time (Z) | register-events r6 | routes r9 | matrix r9 | routes r8 | matrix r8 | savepath r7 |
|---|---|---|---|---|---|---|
| 10:52 | absent, claimed | absent, claimed | absent, claimed | a56a1c19, PUSHED | c9de40e0, PUSHED | 9873480f, PUSHED |
| 11:20 | 64e21735, claimed, PUSHED | absent, claimed | 4df02927, claimed, PUSHED | a56a1c19, PUSHED | c9de40e0, PUSHED | 9873480f, PUSHED |
| 11:23 (window closed early) | 64e21735, claimed, PUSHED | c75e22e9, claimed, PUSHED | 4df02927, claimed, PUSHED | a56a1c19, PUSHED | c9de40e0, PUSHED | 9873480f, PUSHED |

The three round-eight-and-earlier lanes were already pushed when the poll
started, so they were ready at the first poll. The three batch lanes were
still working (their queue tasks read "claimed" throughout), and the roll
merged the tips that existed and were pushed at the merge moment, not the
tips those lanes reach afterwards. Section 8 names what was left out.

## 2. The merge set, verified on origin before the merge

| # | branch | tip (origin) | merge commit | conflicts |
|---|---|---|---|---|
| 1 | port/routes-round8-20261024 | a56a1c195d321e9c92245cd2e8cdafe1ebe08773 | 5e1fad03072853e35f97ae587a98dd94d28d6794 | none |
| 2 | port/matrix-round8-20261024 | c9de40e0d8545b193f9293c658376882c7d904a1 | d47d972298babdb0986f1f5bc85e20a03027e457 | none |
| 3 | port/savepath-round7-20261024 | 9873480fdc0ecb354f8d70430bc01d2f3d420650 | 92b978b25a88e8bcbc218fe3726fae30885467ba | none |
| 4 | port/register-events-round6-20261024 | 1859cf8c6d3ceb87bab5190a687b8c8db5bf9b22 | ca180251a1d0d45ee25804058ed0da5e48f2f93e | none |
| 5 | port/routes-round9-20261024 | c75e22e9e72223722ec70763b2ad6e5f7b2b4a64 | 0b1cec4c2385be84e975298505b06c5acdcf6791 | none |
| 6 | port/matrix-round9-20261024 | 4df02927c2e1213c2a4fbc4680b78abe3318917f | 5a7ab60d0a96a209d074236382557385bfe1e9fe | none |

Every tip was read from origin with one `git ls-remote` read per check and
then fetched forward-only into the lane checkout
(`git fetch --no-tags origin refs/heads/<branch>:refs/remotes/origin/<branch>`),
and each fetched tip read back at exactly the hash the origin read gave.
The two captures of the merge moment are kept in the lane's scratch:
`tmp/roll-v4-20261026/lsremote-merge-moment.txt` (11:23:21Z, the wait
window's last poll) and `tmp/roll-v4-20261026/lsremote-merge-read.txt`
(11:24:20Z, the read the merges were taken from). The register-events round
six branch moved between those two reads, from 64e21735f to 1859cf8c, and
the later, pushed tip is the one that was merged; both hashes are recorded
here so a reader can see the move.

Every merge commit carries the previous roll commit as its first parent and
the lane tip as its second, verified with `git rev-list --merges --parents`
on the roll tip. The roll carries 18 commits and 26 files changed (2904
insertions, 267 deletions) against the base.

Each lane's own contribution, measured as its merge commit's diff against
its first parent:

| lane | files | insertions | deletions |
|---|---|---|---|
| routes round eight | 1 | 313 | 0 |
| matrix round eight | 2 | 99 | 14 |
| save-path round seven | 1 | 8 | 0 |
| register-events round six | 4 | 182 | 16 |
| routes round nine | 10 | 1111 | 192 |
| matrix round nine | 1 | 131 | 0 |

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
`tmp/roll-v4-20261026/merge-lane.mjs`.

All six merges were clean: `git merge-tree --write-tree` returned a tree and
exit 0 for every lane, so no conflict region had to be decided and no
resolved-tree script (`tmp/roll-v4-20261026/build-resolved-tree.mjs`) was
run.

No branch was rebased and no source branch was rewritten.

## 3. The bundle

The engine bundle was rebuilt with `node tools/bundle-bunny-edge-engine.mjs`,
exit 0, on the base tree before the first merge and on the merged tree after
the last one.

| artifact | bytes before | bytes after | delta |
|---|---|---|---|
| bunny-edge-engine.bundle.js | 7396735 | 7399163 | +2428 |
| bunny-edge-engine.code.json | 7536589 | 7539081 | +2492 |
| bunny-edge-read.bundle.js | 2123362 | 2125767 | +2405 |
| bunny-edge-read.code.json | 2204552 | 2207021 | +2469 |

| artifact | SHA-256 before | SHA-256 after |
|---|---|---|
| bunny-edge-engine.bundle.js | 328e018f6267f0a70249da27965d346c19287d98beb66c4ace556b4ab2d5c8ad | cb6be678e7643861abe7b62ecb9b597ac7b75721473d7020163fc2e4b02547c7 |
| bunny-edge-engine.code.json | 40bd956167db6fa3242d41c61e4767b1246245c5d1a7bce193a08bb9dfff4447 | 4cd35e0816ebba0d7d161cb97b2ebbd71fa75a2b74a40d704efd04adc7645a90 |
| bunny-edge-read.bundle.js | 73f2879346c9e0b0de1d6b596d964f1f251d581130a2b60b8538fd10dd950112 | 5ffa88c91936089c02c3470728413be380631cd836f2e52ab1a74402d2b57397 |
| bunny-edge-read.code.json | 924a1c8c56be2f33bea9b9be2ac02e99da9c4fcfe876faefb9d800c5f7b3258e | eacad4e89533c52f82ca17114a65bf03eda71df4965080694b848545db97d880 |

The "before" values are byte-identical to the "after" values the v15 roll
recorded for the same base tree, so the "before" is the real v15 artifact and
not a rebuild that drifted.

The build warns that the bundle is over 80% of the conservative
7600000-byte script limit (7399163 bytes is 97.4%). Nothing deploys, so this
is a fact for the record.

`deploy/dist/` is gitignored, so the bundles are build artifacts and do not
appear in the commit. The hashes above are the record, and the raw values
are in the lane's scratch (`tmp/roll-v4-20261026/bundle-before.json` and
`bundle-after.json`).

## 4. The gates

Typecheck, `npx tsc --noEmit`: exit 0, **zero output lines**
(`tmp/roll-v4-20261026/tsc-base.txt` on the base tree, and
`tmp/roll-v4-20261026/tsc-merged.txt` on the merged tree).

Correctness, `node tools/test-gates.mjs run correctness`: see section 5.

The two files the assignment names as the pre-existing set
(`tests/card/actions/atomic-saves.test.ts`, the MySQL 8.4 native group, and
`tests/deploy/worker-edge-cache-runtime.test.ts`) are matched by the deploy
bucket's rule in `tools/test-gates.mjs`, so the correctness gate does not run
either file. Both were run on the base tree and on the merged tree in this
lane, apart from the gate, and their results are in section 5.

## 5. The failure set, and what it is compared against

The base tree's own failure set was measured first, on the same checkout, at
the base commit, before the first merge
(`tmp/roll-v4-20261026/correctness-base.log`):

| | base tree b299b6f3 |
|---|---|
| gate exit | 1 |
| test files | 2 failed, 681 passed, 54 skipped (737) |
| tests | 2 failed, 7073 passed, 249 skipped (7324) |
| node:test | 3 files, 15 passed, 0 failed |

The two base failures are machine state, not tree state:

| file | what it asserts | why it is red |
|---|---|---|
| tests/hygiene/machine-lane-worktree-disk-hygiene.test.ts | every lane worktree on disk is tracked in IN-FLIGHT.json or in tests/hygiene/keep-worktrees.json, none is under the 1 GB floor, and there are at most 15 | it names `decko-ts-lane-archives` as untracked. That is machine state on the disk, not a property of this tree, and the worktree is not this lane's. |
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

| file | base tree b299b6f3 | merged tree |
|---|---|---|
| tests/card/actions/atomic-saves.test.ts | 66 tests: 5 failed (the "atomic saves: MySQL 8.4 (native)" group), 61 passed | 66 tests: 5 failed (the same five names), 61 passed |
| tests/deploy/worker-edge-cache-runtime.test.ts | 1 failed ("hits byte-identically, bypasses credentials, and invalidates committed edits and read revocations"), 3 passed | 1 failed (the same test), 3 passed |
| both files together | 6 failed, 64 passed (70) | 6 failed, 64 passed (70) |

The named set is therefore the same set before and after the roll: the six
environmental failures, unchanged.

The deciding run on the merged tree
(`tmp/roll-v4-20261026/correctness-merged.log`):

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
state. The two runs ran the same 737 test files, and the list of files is
identical between the two logs.

Two counts moved, and both are explained, neither is a failure:

- The test count is one higher and the skipped count 22 lower
  (7324 to 7325 tests, 249 to 227 skipped). The 22 tests are the compiled
  skin stylesheet cases in `tests/card/assets/skin-stylesheet.test.ts`,
  which the base run skipped and the merged run ran and passed. Their gate
  is the presence of the LibSass native program at
  `tools/libsass/build/sassc-stdin.exe` and its publication receipt, and
  that program became available on this machine between the two runs (the
  receipt `tools/libsass/build/sassc-stdin.exe.manifest.json` carries the
  time 11:28Z, inside the merged run). Both the program and the receipt are
  gitignored build output (`tools/libsass/.gitignore` ignores `build/`), so
  this is machine state, not tree state, and the tree change is nothing.
- `tests/card/notify/follower-resolver.test.ts` carries one test more in
  the merged tree (15 against 14). That is the save-path round seven
  lane's own pin, the one that holds the *nests arm's inclusion count to
  the rule-content batch.

The new test files this roll carries are in the gate's other buckets, so
they did not run in the correctness gate: `tests/deploy/` is the deploy
bucket by rule, and the files whose names carry `parity` or `oracle` are
the parity bucket. That is the gate's own rule (`tools/test-gates.mjs`,
the `deploy` and `parity` entries), not a choice made in this lane.

## 6. The disk cost

Added to the machine: the lane's checkout, 265692765 bytes of tracked
working tree (the lane-copy admission measured 265692674 tracked bytes
plus the shared install linked through a junction rather than copied), the
rebuilt `deploy/dist/` build output (gitignored), and the lane's gitignored
scratch (`tmp/roll-v4-20261026/`), holding the gate logs, the bundle hash
records, the merge-tree records and the ls-remote captures.

Kept: the lane's checkout, because it holds those records and the fold's
own git reads point at it. Nothing was deleted by hand: no space was freed,
no file was removed, and the delete gate was not routed around.

## 7. What this lane did not do

- Nothing deployed. No URL was fetched, so no URL is reported working.
- Nothing was written to the live D1.
- The other candidate branches on origin were not moved. The roll pushed one
  branch: `deploy/full-candidate-20261026`.
- No source branch was rebased, and no tip was moved.

## 8. What was left out

The three batch lanes were still working when the merge phase started, so
the roll merged the tips that were pushed at that moment and the commits
those lanes land afterwards are named here as left out. The lane tips read
on origin at 11:37Z, after the merges, against the tips that were merged:

| lane | tip merged | tip afterwards | what the later commits carry |
|---|---|---|---|
| port/register-events-round6-20261024 | 1859cf8c | 1765e705 | the round's remaining rows |
| port/routes-round9-20261024 | c75e22e9 | 836b9b67 | the rows D3 and D4 |
| port/matrix-round9-20261024 | 4df02927 | 34b31e29 | the rows mx-B-038 through mx-B-042 |

Named by row, the register-events round six lane's own brief takes the next
eight open rows in row-id order, and four of them are in the merged tip:
`reg-evt-1-110-0-validate-codename`,
`reg-evt-mod-carrierwave-update-public-link-on-create`,
`reg-evt-mod-carrierwave-update-storage` and
`reg-evt-mod-carrierwave-validate-coded-storage-type`. The four the lane
takes after the merged tip are `reg-evt-mod-comment-add-comment`,
`reg-evt-mod-follow-update-follow-rules`,
`reg-evt-mod-layout-clear-roles-cache` and
`reg-evt-mod-layout-update-layout-registry`.

The routes round nine lane takes D3, D4 and D5, and only D5 is in the
merged tip, so `reg-routes-D3` and `reg-routes-D4` are left out.

The matrix round nine lane takes six rows, `mx-B-037` through `mx-B-042`,
and only the `mx-B-037` receipt is in the merged tip, so `mx-B-038` through
`mx-B-042` are left out. The `mx-B-037` row the receipt carries is already
DONE in the completeness roster, so its receipt binds evidence onto a row
the roster already counts, and it moves no counter.

The save-path round seven lane's tip carries its two landed levers (the
declaration's declared set rides one round trip, and the *nests arm's
inclusion count rides the rule-content batch, 212 to 198 POSTs) and its
receipt. The two roster rows those levers pay for, `save-ROW-1` and
`save-ROW-2`, are already DONE in the roster, so the lever binds evidence
onto rows the roster already counts and moves no counter. The
operator-blocked lever stays blocked: the after-commit read memo was not
landed in any form, so `save-ROW-3` stays BLOCKED and `save-ROW-4` stays
open.

The routes round eight lane's tip carries two commits past the tip the v15
roll merged: the row B6 closure (the refresh policy behind the setup
method's second call, measured, with the port's marker lifetime named) and
the round's receipt, which counts the family at 72 rows, 65 DONE and 7
open. Four routes rows therefore carry their closures in this tree, and the
fold against this roll reads that ancestry per row.
