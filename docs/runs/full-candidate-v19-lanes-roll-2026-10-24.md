# Full candidate v19: the four lane roll, Saturday 2026-10-24 (run 2026-10-25)

The assignment: roll this batch's lane tips into the next integration candidate,
verify every tip, merge them one merge commit each, resolve the conflicts by
region with the reason named, rebuild the engine bundle and record SHA-256 and
bytes before and after, gate (typecheck plus the correctness battery), and push.
Nothing deploys.

The lane's exclusive checkout is
`C:/localProjects/decko-ts-candidate-roll-20261029`, made through the sanctioned
lane-copy path, not by a clone and not by a raw worktree add:

    node C:/localProjects/juc-relay/fleet/lane-copy.mjs \
      --repo C:/localProjects/decko-ts-release-lead \
      --path C:/localProjects/decko-ts-candidate-roll-20261029 \
      --branch deploy/full-candidate-20261029 \
      --base deploy/full-candidate-20261028 \
      --shared-modules C:/localProjects/decko-ts-capability-round9-20261024/node_modules \
      --owner roll-v7-and-fold --purpose "integration roll v7: lane tips merged into deploy/full-candidate-20261029"
    outcome: created, lease 6c05ccbe400a, trackedBytes 277634756,
    addedBytes 277634847, budgetBytes 314572800,
    nodeModules: junction -> C:\localProjects\decko-ts-capability-round9-20261024\node_modules

The base is `16d0ff2578714af42ced8ceaf348ca9939b677fa`, the tip of
`deploy/full-candidate-20261028` (the v18 candidate, the twelve lane roll),
verified on origin with `git ls-remote origin refs/heads/deploy/full-candidate-20261028`
and locally with `git rev-parse deploy/full-candidate-20261028` in the new
checkout, which read the same hash. The remote is
`https://github.com/KatsuJinCode/decko-ts`, private. The branch
`deploy/full-candidate-20261029` did not exist on origin before this roll
(`git ls-remote origin refs/heads/deploy/full-candidate-20261029` read nothing)
and did not exist locally either.

The shared install was chosen because its `package-lock.json` is byte-identical
to the base tree's own lockfile (`sha256 96a3efb62e81fdb24516d8106316e92e44cdde583d63399ca0b6e1e54731ae69`,
the same hash the roll's tree carries at `git show 16d0ff25:package-lock.json |
sha256sum`), so the lane runs the dependencies its own lockfile names.

## 1. The merge set, verified on origin before the merge

The assignment asks for every pushed family lane tip that is not already an
ancestor of the current roll. The whole remote was read with one `git ls-remote`
per check, every `refs/heads/port/*` tip was fetched forward-only into the lane
checkout, and each tip's ancestry against `16d0ff25` was decided with
`git merge-base --is-ancestor`. Twelve port tips are not ancestors of the roll.
Four of them are this batch's family lanes and are merged here; the other eight
are named in section 9 with the reason.

| # | branch | tip (origin) | merge commit | conflicts |
|---|---|---|---|---|
| 1 | port/savepath-round9-20261024 | f99e3ef8979eeb13eb7708d39a58c9ce36f8bf29 | 76de8e7cbaa1bad2fd9ea2839f94c532938d85d6 | none |
| 2 | port/capability-round9-20261024 | a081004348e6e7e72d0576b45f2a9699864ebdaa | 5197b54d7c156f74050782d5abd88255b8d43edb | two files, nine regions |
| 3 | port/smell-test-round3-20261024 | 2389d8e76992867d046d85499c144ca30522269b | 36461f35c1f011efcc516fb02920ca63cdd5e3ee | none |
| 4 | port/smell-test-round3-b1-20261024 | d7a7c652834b39e82ba04a96a69f8766fb274d9d | d34453668706b2271d9ad9841cad77e43dd482d9 | none |

Every tip was read from origin with one `git ls-remote` read per check and then
fetched forward-only into the lane checkout
(`git fetch --no-tags origin '+refs/heads/port/*:refs/remotes/origin/port/*'`),
and each fetched tip read back at exactly the hash the origin read gave. The
capture of the merge moment is kept in the lane's scratch:
`tmp/roll-v7-20261029/lsremote-port.txt` and `tmp/roll-v7-20261029/nonancestor.txt`.

Every merge commit carries the previous roll commit as its first parent and the
lane tip as its second, verified with `git rev-list --merges --parents` on the
roll tip:

    d34453668706b2271d9ad9841cad77e43dd482d9 36461f35c1f011efcc516fb02920ca63cdd5e3ee d7a7c652834b39e82ba04a96a69f8766fb274d9d
    36461f35c1f011efcc516fb02920ca63cdd5e3ee 5197b54d7c156f74050782d5abd88255b8d43edb 2389d8e76992867d046d85499c144ca30522269b
    5197b54d7c156f74050782d5abd88255b8d43edb 76de8e7cbaa1bad2fd9ea2839f94c532938d85d6 a081004348e6e7e72d0576b45f2a9699864ebdaa
    76de8e7cbaa1bad2fd9ea2839f94c532938d85d6 16d0ff2578714af42ced8ceaf348ca9939b677fa f99e3ef8979eeb13eb7708d39a58c9ce36f8bf29

### How the merges were made, and why

The house dangerous-action gate refuses `git merge` outside `--ff-only` and
names its own remediation in the rule text: "Use --ff-only, or build the merge
commit with git merge-tree and git commit-tree so the working tree is never
touched." The roll took that path. `git merge-tree --write-tree` computes the
real three-way merge, `git commit-tree` writes the merge commit with the two
parents, and `git merge --ff-only` advances the branch to it, which is a
fast-forward because the new commit carries the old HEAD as its first parent.
The working tree and the real index are never modified until that
fast-forward, and the fast-forward is a pointer move over a clean checkout. The
lane's own scripts for this are `tmp/roll-v7-20261029/merge-lanes.sh`,
`tmp/roll-v7-20261029/merge-capability-round9.sh` and
`tmp/roll-v7-20261029/merge-lanes-2.sh`.

No branch was rebased and no source branch was rewritten.

## 2. The conflicts, resolved by region

One of the four merges had conflict regions, in two files. Every region was
decided by reading both sides of the three-way merge and by reading the
auto-merged tree the merge produced. The reason is named in the merge commit
message of the merge that had them, and repeated here.

| merge | file | region | decision | why |
|---|---|---|---|---|
| capability-round9 | tools/edge-signed-in-exercise/capabilities.json | eight regions, one per row's "finding" value, on rows C6, C8, E3, E20, E21, R1, P5 and P6 | theirs, the lane's side | Both sides write the same row. The roll's side carries the 2026-10-20 capability-legs battery's statement of the row: the leg that was missing, the check that now grades it, and the row's status still partial. The lane's side carries the row's own adjudication: the closure on the signed-in deck with the row's own gap landed, the measured run at this round's tip and the named remainder the row does not claim. The lane's text is the later statement of the row and the one the owning family wrote in round nine, so taking theirs replaces the pre-closure measurement with the closure. The "status" lines of those eight rows are not conflict regions: the lane moved them from partial to covered and the merge took that. The "checks" arrays of R1 and P5 keep the roll's longer lists, so no declared leg is lost. The merged registry reads 92 covered, 0 partial, 1 out of scope, 1 disabled upstream and 1 not covered of 95. |
| capability-round9 | tools/edge-signed-in-exercise/checks-cover-b.mjs | the whole file | the content three-way merge, with the line-ending noise removed | The roll's side and the lane's side carry the same file with different line endings, the roll's side LF and the lane's side CRLF, so git read every line as changed and the region is the whole file. The two sides' real changes are disjoint: the roll's side carries the capability-legs battery's repairs (the chosen-file chip import, the document.body null guards and the F1 upload round trip), and the lane's side carries round nine's P5 fixture change, the left card becoming a Cardtype because "User" is a cardtype in Ruby and the type-plus-right anchor is the visited card's left type plus its right tag. The three sides were read with their line endings normalized and merged with `git merge-file`, which resolved every hunk cleanly, and the result carries both sets of changes. The merged file keeps the roll's own line endings. |

The three merges that had no conflict region were clean: `git merge-tree
--write-tree` exited 0 for the save-path round nine lane, the smell-test round
three lane and the smell-test round three lower-tail lane, so every hunk of
each branch landed as the branch wrote it. The two smell-test lanes share no
file path, so they merge without a conflict either way.

## 3. The bundle

The engine bundle was rebuilt with `node tools/bundle-bunny-edge-engine.mjs`,
exit 0, on the base tree before the first merge and on the merged tree after
the last one.

| artifact | bytes before | bytes after | delta | SHA-256 before | SHA-256 after |
|---|---|---|---|---|---|
| bunny-edge-engine.bundle.js | 7400742 | 7401528 | 786 | d5e4f60bccc99d29af43511fb4395532531dc16dff0e5e9a41c6f0657b92cc25 | 57ca0c1e827f207fe10da2b0e2b6ab8d0a24dd8ec0ecd3cfa1494e464495d4c4 |
| bunny-edge-engine.code.json | 7540686 | 7541477 | 791 | f0b4d5394611e5120c3cccf1c3c62ee33f6d1a041627160194a7e17a72000585 | 5c18ba3cd0593e316a22bdf498e4feec043df980ad26b2b9c65af194e14a5339 |
| bunny-edge-read.bundle.js | 2126327 | 2126327 | 0 | bce209788b9b88475550577e742da44ccd19c6fb13053a83d8f6307631441700 | bce209788b9b88475550577e742da44ccd19c6fb13053a83d8f6307631441700 |
| bunny-edge-read.code.json | 2207583 | 2207583 | 0 | e1a62028a81e44ca83194d3cbd259d2c177155ac406066812c7269e7c489cb91 | e1a62028a81e44ca83194d3cbd259d2c177155ac406066812c7269e7c489cb91 |

The bundle moved, and the reason is measured, not assumed: this roll carries
real code in `src/`. The changed source files are the save-path round nine
lane's three levers, the ancestor walk's nester read
(src/card/actions/card-action-engine.ts) and the style asset events'
content-before batch (src/card/actions/style-asset-events.ts), and the two new
pins that come with them
(tests/card/actions/ancestor-walk-liveness-in-the-nester-read.test.ts and
tests/card/actions/recent-settings-action-row-batch.test.ts). The read bundle
did not move, because the read entry does not carry the save path.

The build warns that the bundle is over 80% of the conservative 7600000-byte
script limit (7401528 bytes is 97.4%). Nothing deploys, so this is a fact for
the record.

`deploy/dist/` is gitignored, so the bundles are build artifacts and do not
appear in the commit. The hashes above are the record, and the raw values are
in the lane's scratch (`tmp/roll-v7-20261029/bundle-before.json` and
`bundle-after.json`).

## 4. The gates

Typecheck, `npx tsc --noEmit`: exit 0, **zero output lines** on the base tree
(`tmp/roll-v7-20261029/tsc-base.txt`) and on the merged tree
(`tmp/roll-v7-20261029/tsc-merged.txt`).

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
(`tmp/roll-v7-20261029/correctness-base.log`):

| | base tree 16d0ff25 |
|---|---|
| gate exit | 1 |
| test files | 1 failed, 692 passed, 54 skipped (747) |
| tests | 1 failed, 7219 passed, 227 skipped (7447) |
| node:test | 3 files, 15 passed, 0 failed |

The base failure is machine state, not tree state:

| file | what it asserts | why it is red |
|---|---|---|
| tests/hygiene/machine-lane-worktree-disk-hygiene.test.ts | every lane worktree on disk is tracked in IN-FLIGHT.json or in tests/hygiene/keep-worktrees.json, none is under the 1 GB floor, and there are at most 15 | it names a lane worktree as untracked (`decko-ts-lane-archives`, a depth-2 size floor of 4.2 MB). That is machine state on the disk, not a property of this tree. |

The deciding run on the merged tree
(`tmp/roll-v7-20261029/correctness-merged.log`):

| | merged tree |
|---|---|
| gate exit | 1 |
| test files | 1 failed, 695 passed, 54 skipped (750) |
| tests | 1 failed, 7231 passed, 227 skipped (7459) |
| node:test | 3 files, 15 passed, 0 failed |

**The failure sets are equal file for file.** The merged tree's failing set is
the base tree's failing set, the same file with the same assertion and the
same named worktree, and no failure is new:

| file | base tree | merged tree |
|---|---|---|
| tests/hygiene/machine-lane-worktree-disk-hygiene.test.ts | failed | failed, same file, same assertion |

The merged tree runs 750 test files against the base tree's 747. The three
files the lanes brought in (the save-path round nine lane's two pins and the
smell-test round three lane's rig applicability pin) all pass, and the merged
tree's test count rises by twelve.

**The two failures the assignment names do not belong to this gate.** The
assignment's named pre-existing set is the MySQL 8.4 group of
`tests/card/actions/atomic-saves.test.ts` and
`tests/deploy/worker-edge-cache-runtime.test.ts`. Both are matched by the
deploy bucket's rule (`/(^|\/)deploy\//` and `atomic-saves`, the `match` in
`tools/test-gates.mjs`), so the correctness gate does not run either file.
Neither appeared in this run for that reason and not because they passed. Both
were run apart from the gate, on the base tree and on the merged tree, and the
two runs are identical:

| file | base tree 16d0ff25 | merged tree |
|---|---|---|
| tests/card/actions/atomic-saves.test.ts | 66 tests: 5 failed (the "atomic saves: MySQL 8.4 (native)" group), 61 passed | 66 tests: 5 failed (the same five names), 61 passed |
| tests/deploy/worker-edge-cache-runtime.test.ts | 1 failed, 3 passed | 1 failed (the same test), 3 passed |
| both files together | 6 failed, 64 passed (70) | 6 failed, 64 passed (70) |

The six failing test names are identical between the two runs
(`tmp/roll-v7-20261029/named-baseline-failures-base.txt` and
`named-baseline-failures-merged.txt` differ by nothing). The named set is
therefore the same set before and after the roll: the six environmental
failures, unchanged.

## 6. The disk cost

Added to the machine: the lane's checkout, 277634847 added bytes of tracked
working tree (the lane-copy admission measured 277634756 tracked bytes plus the
shared install linked through a junction rather than copied), the rebuilt
`deploy/dist/` build output (gitignored), and the lane's gitignored scratch
(`tmp/roll-v7-20261029/`), holding the gate logs, the bundle hash records, the
merge-tree records, the resolved conflict files and the ls-remote capture.

Kept: the lane's checkout, because it holds those records and the fold's own
git reads point at it. Nothing was deleted by hand: no space was freed, no
file was removed, and the delete gate was not routed around.

## 7. What this lane did not do

- Nothing deployed. No URL was fetched, so no URL is reported working.
- Nothing was written to the live D1.
- The other candidate branches on origin were not moved. The roll pushed one
  branch: `deploy/full-candidate-20261029`.
- No source branch was rebased, and no tip was moved.
- No live database was touched, and the culturesmith host was not touched.

## 8. What the fold that follows this roll will read

The canonical tree for the fold that follows is this branch's tip. It carries:

- the capability family's registry at 92 covered, 0 partial, 1 out of scope, 1
  disabled upstream and 1 not covered of 95, the eight round-nine closures
  (rows C6, C8, E3, E20, E21, R1, P5 and P6) included;
- the capability round five lane's two closures (rows F1 and W2) and the
  capability inventory tranche five lane's two closures (rows W5 and W6), which
  the tree carried before this roll;
- the save-path family's round-nine receipt, the 175 line met, 191 to 175
  POSTs, with the family's named remainders;
- the smell-test round three lane's six row receipts (one row closed, five
  measured and open) and the round three lower-tail lane's six row receipts
  (no row closed, every row measured).

## 9. What was left out, and why

Eight pushed port tips are not ancestors of the roll and were not merged. Seven
are the 2026-10-19 to 2026-10-23 conversion batch's lanes, not this batch's
family lanes, and no roll in this line (v13 through v18) merged them either.

| lane | tip | what it carries |
|---|---|---|
| port/dsl-tranche2-20261020 | c8eb84a01 | the dsl C7 format-suffix dispatch boundary |
| port/register-dsl-convert-20261022 | 2039b470c | the register dsl conversion rows |
| port/dsl-convert-r2-20261022 | 3300c995c | the round-two dsl conversion rows, carrying the register dsl lane as an ancestor |
| port/register-mods-convert-20261022 | 45755e7dd | the register mods conversion rows |
| port/mods-convert-r2-20261022 | 2d55d6dad | the round-two mods conversion rows, carrying the register mods lane as an ancestor |
| port/register-starcards-convert-20261022 | 54bef7049 | the templated card row's own probe receipt |
| port/remaining-convert-r2-20261022 | ae5219fd7 | the redteam A2 Cardio application layer row |
| port/roster-repair-20261024 | 941cab6c3 | a cross-family repair lane, not a family lane of this batch: the mx-B-125 owner-replay witness, two register-events row receipts and the signed-in harness's own binding repair |

The roster-repair lane is named here for the reason it is not merged: it is a
repair lane that carries rows of the matrix and register-events families, and
no roll in this line merged a repair lane. Its harness repair (the async feed
reader's return type and the two capture feeds' own names) is not needed for
this tree to be healthy: the merged tree's typecheck is clean and its
correctness failure set is the base tree's, so nothing this roll needs waits on
it. Its rows stay open in the completeness roster, and no row of its is
promoted by the fold that follows this roll.
