# Full candidate v20: the three lane roll, Saturday 2026-10-25

The assignment: roll this batch's pushed family lane tips into the next
integration candidate, verify every tip on origin before the merge, merge them
one merge commit each, resolve any conflict by region with the reason named,
rebuild the engine bundle and record SHA-256 and bytes before and after, gate
(typecheck plus the correctness battery) with the merged tree's failure set
equal to the base tree's file for file, and push. Then the chained fold. Nothing
deploys.

The lane's exclusive checkout is
`C:/localProjects/decko-ts-candidate-roll-20261030`, made through the sanctioned
lane-copy path, not by a clone and not by a raw worktree add:

    node C:/localProjects/juc-relay/fleet/lane-copy.mjs \
      --repo C:/localProjects/decko-ts-release-lead \
      --path C:/localProjects/decko-ts-candidate-roll-20261030 \
      --branch deploy/full-candidate-20261030 \
      --base deploy/full-candidate-20261029 \
      --shared-modules C:/localProjects/decko-ts-capability-round9-20261024/node_modules \
      --owner roll-v8-and-fold --purpose "integration roll v8: family lane tips merged into deploy/full-candidate-20261030"
    outcome: created, lease 1196c2c56db3, trackedBytes 282101991,
    addedBytes 282102082, budgetBytes 314572800,
    nodeModules: junction -> C:\localProjects\decko-ts-capability-round9-20261024\node_modules

The shared install was chosen because its `package-lock.json` is byte-identical
to the base tree's own lockfile (`sha256sum` on the shared install's file and on
`git show c9ab5b33:package-lock.json` both read
`96a3efb62e81fdb24516d8106316e92e44cdde583d63399ca0b6e1e54731ae69`), so the lane
runs the dependencies its own lockfile names.

## 0. The base, and why it moved past the hash the assignment named

The assignment named the current roll as `deploy/full-candidate-20261029` at tip
`4078b46a`. The branch's tip on origin is newer: `git ls-remote origin
refs/heads/deploy/full-candidate-20261029` reads
`c9ab5b3356e7ee1db1f8444967dd6cc09efc6157`, the roll-v7b advance that carries
the fifth lane tip (`port/roster-repair-20261024`) and the capability registry
repair, and the v7 chain's own fold receipts name that hash the canonical roll.
`git merge-base --is-ancestor 4078b46a c9ab5b33` exits 0, so `4078b46a` is an
ancestor of `c9ab5b33` and nothing the assignment pointed at is lost by building
on the newer tip. The lane-copy tool resolves a branch name through the local
checkout, so it created this branch at `4078b46a`; the branch was then advanced
with `git merge --ff-only c9ab5b3356e7ee1db1f8444967dd6cc09efc6157` (a pointer
move over a clean checkout, forward-only) before any merge. `git ls-remote
origin refs/heads/deploy/full-candidate-20261030` read nothing before this roll,
so the branch is new on origin.

## 1. The merge set, verified on origin before the merge

The whole remote was read with one `git ls-remote origin 'refs/heads/*'` (618
heads, kept in the lane's scratch as `tmp/roll-v8-20261030/lsremote-all.txt`),
every head was fetched forward-only into the lane checkout
(`git fetch --no-tags origin '+refs/heads/*:refs/remotes/origin/*'`, exit 0),
and every tip's ancestry against the roll tip `c9ab5b33` was decided with `git
merge-base --is-ancestor`. 285 heads are not ancestors of the roll; the list is
kept as `tmp/roll-v8-20261030/nonancestor-all.txt`. Family lanes among them,
with each tip read back at the exact hash the ls-remote read gave:

| # | branch | tip (origin) | merge commit | conflicts |
|---|---|---|---|---|
| 1 | port/roster-batch-20261025 | 5efc8162a1be8ac27baf3635f405761d0360d799 | 9f3a8b057d7f369ca7e4cb1ff48b9839d78a7db3 | none |
| 2 | port/smell-test-round4-20261025 | e73951656e843a7f6a31324036f49ff546764f46 | 1620f1f5a6afa54181ed8294d1ecc5860fbcbee0 | none |
| 3 | port/enumeration-audit-20261025 | 2753ee8770ce9d9148595e0d4a6117aa01d9e0cd | 7d491cb5c163499cf66f54662091ed179ad2345f | none |

The register-events rounds the assignment expected are already in: all seven
pushed tips (`port/register-events-round1-20261023` through
`port/register-events-round7-20261024`, tip 623dfe01) plus the events conversion
branch and `port/savepath-round8-20261024` were tested with `git merge-base
--is-ancestor` and each is an ancestor of `c9ab5b33`; earlier rolls in this line
merged them. The register rows lane this roll does merge is
`port/roster-batch-20261025`, the census and measured-state batch the register
fix lanes now in flight read their receipts from.

Every merge commit carries the previous roll commit as its first parent and the
lane tip as its second, verified with `git rev-list --merges --parents` on the
roll tip:

    7d491cb5c163499cf66f54662091ed179ad2345f 1620f1f5a6afa54181ed8294d1ecc5860fbcbee0 2753ee8770ce9d9148595e0d4a6117aa01d9e0cd
    1620f1f5a6afa54181ed8294d1ecc5860fbcbee0 9f3a8b057d7f369ca7e4cb1ff48b9839d78a7db3 e73951656e843a7f6a31324036f49ff546764f46
    9f3a8b057d7f369ca7e4cb1ff48b9839d78a7db3 c9ab5b3356e7ee1db1f8444967dd6cc09efc6157 5efc8162a1be8ac27baf3635f405761d0360d799

### How the merges were made, and why

The house dangerous-action gate refuses `git merge` outside `--ff-only`, and the
sanctioned path is the one the previous rolls used: `git merge-tree
--write-tree` computes the real three-way merge, `git commit-tree` writes the
merge commit with the two parents, and `git merge --ff-only` advances the branch
to it, which is a fast-forward because the new commit carries the old HEAD as
its first parent. The working tree and the real index are never touched until
that fast-forward. The lane's script for this is
`tmp/roll-v8-20261030/merge-lanes.sh`, with the three merge messages beside it.
No branch was rebased and no source branch was moved.

## 2. The conflicts

None. Each of the three merges ran `git merge-tree --write-tree` clean (exit 0,
no conflict file list) against the head it merged onto, so every hunk of each
branch landed as the branch wrote it. The three lanes share no file path with
each other, and each was based on a tip the roll already contains.

## 3. The bundle

The engine bundle was rebuilt with `node tools/bundle-bunny-edge-engine.mjs`,
exit 0 both times, on the base tree before the first merge and on the merged
tree after the last one.

| artifact | bytes before | bytes after | SHA-256 before | SHA-256 after |
|---|---|---|---|---|
| bunny-edge-engine.bundle.js | 7401528 | 7401528 | 57ca0c1e827f207fe10da2b0e2b6ab8d0a24dd8ec0ecd3cfa1494e464495d4c4 | 57ca0c1e827f207fe10da2b0e2b6ab8d0a24dd8ec0ecd3cfa1494e464495d4c4 |
| bunny-edge-engine.code.json | 7541477 | 7541477 | 5c18ba3cd0593e316a22bdf498e4feec043df980ad26b2b9c65af194e14a5339 | 5c18ba3cd0593e316a22bdf498e4feec043df980ad26b2b9c65af194e14a5339 |
| bunny-edge-read.bundle.js | 2126327 | 2126327 | bce209788b9b88475550577e742da44ccd19c6fb13053a83d8f6307631441700 | bce209788b9b88475550577e742da44ccd19c6fb13053a83d8f6307631441700 |
| bunny-edge-read.code.json | 2207583 | 2207583 | e1a62028a81e44ca83194d3cbd259d2c177155ac406066812c7269e7c489cb91 | e1a62028a81e44ca83194d3cbd259d2c177155ac406066812c7269e7c489cb91 |

The bundle did not move, and the reason is measured, not assumed: this roll
carries exactly one change under `src/`, and it is a comment. The
roster-batch lane's change to
`src/card/mod-loader/mods/card-mod-session.ts` (`git diff c9ab5b33 7d491cb5 --
src/`) adds the measured oracle note to the `delete_in_session` stub's comment
block and changes no code line, so the bundled bytes are identical. The hashes
above are the record, and the raw values are in the lane's scratch
(`tmp/roll-v8-20261030/bundle-before.json` and `bundle-after.json`). The base
tree's hashes equal the v19 roll's after-hashes, which is the expected
inheritance from a descendant base.

## 4. The gates

Typecheck, `npx tsc --noEmit`: exit 0, **zero output lines** on the base tree
(`tmp/roll-v8-20261030/tsc-base.txt`) and on the merged tree
(`tmp/roll-v8-20261030/tsc-merged.txt`).

Correctness, `node tools/test-gates.mjs run correctness`: see section 5.

The two files the v19 receipt established as outside this gate (the MySQL 8.4
group of `tests/card/actions/atomic-saves.test.ts` and
`tests/deploy/worker-edge-cache-runtime.test.ts`, both matched by the deploy
bucket's rule in `tools/test-gates.mjs`, so the correctness gate does not run
either) were run apart from the gate, on the base tree and on the merged tree.

## 5. The failure set, and what it is compared against

The base tree's own failure set was measured first, on the same checkout, at
`c9ab5b33`, before the first merge
(`tmp/roll-v8-20261030/correctness-base.log`):

| | base tree c9ab5b33 |
|---|---|
| gate exit | 1 |
| test files | 1 failed, 695 passed, 54 skipped (750) |
| tests | 1 failed, 7231 passed, 227 skipped (7459) |
| node:test | 3 files, 15 passed, 0 failed |

The deciding run on the merged tree
(`tmp/roll-v8-20261030/correctness-merged.log`):

| | merged tree 7d491cb5 |
|---|---|
| gate exit | 1 |
| test files | 1 failed, 704 passed, 54 skipped (759) |
| tests | 1 failed, 7273 passed, 227 skipped (7501) |
| node:test | 3 files, 15 passed, 0 failed |

**The failure sets are equal file for file.** The merged tree's failing set is
the base tree's failing set, the same file with the same assertion and the same
named worktree, and no failure is new:

| file | base tree | merged tree |
|---|---|---|
| tests/hygiene/machine-lane-worktree-disk-hygiene.test.ts | failed | failed, same file, same assertion, same named worktree (`decko-ts-lane-archives`, depth-2 size floor 4.2 MB) |

The merged tree runs 759 test files against the base tree's 750. The roll adds
ten test files, and nine of them run in the correctness gate; the tenth,
`tests/card/mod-loader/register-rows-oracle-surface-roster-batch.test.ts`, is
matched by the parity bucket's rule in `tools/test-gates.mjs` (the rule matches
`oracle`), so it is absent from the correctness run for the gate's own bucketing
reason and not because it failed. 750 plus 9 is 759, and the file count
reconciles exactly.

The two baseline files outside the gate, run apart from it on both trees:

| file | base tree c9ab5b33 | merged tree |
|---|---|---|
| tests/card/actions/atomic-saves.test.ts + tests/deploy/worker-edge-cache-runtime.test.ts | 6 failed, 64 passed (70) | 6 failed, 64 passed (70) |

The six failing test names are identical between the two runs: the extractions
(`tmp/roll-v8-20261030/names-base.txt` and `names-merged.txt`) differ by
nothing. The named set is therefore the same set before and after the roll: the
six environmental failures, unchanged.

## 6. The disk cost

Added to the machine: the lane's checkout, 282102082 added bytes of tracked
working tree (the lane-copy admission measured 282101991 tracked bytes plus the
shared install linked through a junction rather than copied), the rebuilt
`deploy/dist/` build output (gitignored), and the lane's gitignored scratch
(`tmp/roll-v8-20261030/`), holding the gate logs, the bundle hash records, the
merge messages, the ls-remote capture and the non-ancestor list.

Kept: the lane's checkout, because it holds those records and the fold's own
git reads point at it. Nothing was deleted by hand: no space was freed, no file
was removed, and the delete gate was not routed around.

## 7. What this lane did not do

- Nothing deployed. No URL was fetched, so no URL is reported working.
- Nothing was written to the live D1, and the cs-edge database was not touched.
- The other candidate branches on origin were not moved. The roll pushes one
  branch: `deploy/full-candidate-20261030`.
- No source branch was rebased, and no tip was moved.
- The culturesmith host was not touched.

## 8. The frontier: the family lanes still in flight

Four lanes the assignment's expected set describes are claimed and in flight
with nothing pushed, so this roll folds only what is landed:

- the register fix lanes: `reg-mods-fixes-1` through `reg-mods-fixes-4` are
  claimed in the standing queue with no note and no branch on origin (`git
  ls-remote` carries no `port/regfix-*` ref). Their briefs read the
  roster-batch receipts this roll merges.
- the w4 probe lane: `w4-follow-probe` is claimed with no note and no branch on
  origin. The only w4 ref on origin is the old
  `port/act155-w4-follow-views-20261019`, which is already an ancestor of the
  roll.

## 9. What was left out, and why

The pushed tips that are not ancestors of the roll and were not merged:

| tip | what it carries | why it is not merged |
|---|---|---|
| port/demo-scratch-20261025 (394561c4) | the demo scratch copy standup and its measured boot time | a demo-serving scratch lane, not a family lane of this batch; its tree is based on `4078b46a`, before the roster-repair merge, so merging it would revert roster-repair tree changes the canonical line already carries |
| codex/mod-probes-version-reconcile (cc1a6490) | an old codex-era mod probe line, based on a much older tree | not this batch's family lane, and no roll in this line (v13 through v19) merged a codex lane; its diff against the roll deletes on the order of a million lines of tree the roll already carries, so it is a stale-base lane, not a candidate |
| codex/mod-probes-warm-shadow (58a685f9) | the same line's warm-shadow branch | the same reason |
| port/dsl-tranche2-20261020 (c8eb84a0), port/register-dsl-convert-20261022 (2039b470), port/dsl-convert-r2-20261022 (3300c995), port/register-mods-convert-20261022 (45755e7d), port/mods-convert-r2-20261022 (2d55d6da), port/register-starcards-convert-20261022 (54bef704), port/remaining-convert-r2-20261022 (ae5219fd) | the 2026-10-19 to 2026-10-23 conversion batch's lanes | the same seven tips the v19 receipt named and left out: not this batch's family lanes, no roll in this line merged them, and the register rows work now proceeds through the roster-batch receipts and the register fix lanes in flight, one of whose briefs records that a previous conversion closure was withdrawn because the recorded Ruby oracle caught it |
| control/full-candidate-20261025-family (cbed8f2c) | the staging host's write-path boundary and the capture feed naming repair | a control-branch staging repair, not a family lane of the roster work, and no roll in this line merged a control branch |
| the fix/, harness/, perf/, journeys/ and backup/ heads in the non-ancestor list | older lanes and backups | not family lanes of this batch; no roll in this line merged them |

## 10. What the fold that follows this roll reads

The canonical tree for the fold that follows is this branch's tip. It carries:

- the roster-batch lane's register rows census (the declaration reader, the
  declaration-coverage auditor and the oracle-surface fixture builder) and the
  eight reg-mods receipts, every one of whose verdicts is WORKING ON IT with
  the measured gap named, so the fold promotes no register row from it;
- the smell-test round four lane's three closures (smell-write-found-by-
  integration-manifest, smell-write-final-a253-manifest,
  smell-widget-single-statement-cas-test), each with its own receipt, capture,
  instrument and pin, and the nine smell rows that stay open with the reason
  each stays open, named in the round's README;
- the enumeration audit's deliverable, the audit document and its gap list;
- the capability family's registry at 92 covered, 0 partial of 95, and the
  save-path family's round-nine receipt, both carried by earlier rolls in this
  line.
