# Full candidate v19: the fifth lane tip and the registry repair (2026-10-24, run 2026-10-25)

This receipt covers the two additions this lane made to
`deploy/full-candidate-20261029` after the four-lane roll landed on that
branch. The four-lane roll and its own receipt are
`docs/runs/full-candidate-v19-lanes-roll-2026-10-24.md`; this file does not
repeat them.

## 1. The lane's own checkout

The lane's exclusive checkout is
`C:/localProjects/decko-ts-candidate-roll-20261029-lane1`, made through the
sanctioned lane-copy path, not by a clone and not by a raw worktree add:

    node C:/localProjects/juc-relay/fleet/lane-copy.mjs \
      --repo C:/localProjects/decko-ts-release-lead \
      --path C:/localProjects/decko-ts-candidate-roll-20261029-lane1 \
      --branch deploy/full-candidate-20261029-lane1 \
      --base 16d0ff2578714af42ced8ceaf348ca9939b677fa \
      --shared-modules C:/localProjects/decko-ts-capability-round9-20261024/node_modules \
      --owner lane-roll-v7-lane1 --purpose "integration roll v7 lane1: lane tips merged into deploy/full-candidate-20261029"
    outcome: created, lease a49be90e9651, trackedBytes 277634756,
    addedBytes 277634853, budgetBytes 314572800, estimateBytes 305398232,
    nodeModules: junction -> C:\localProjects\decko-ts-capability-round9-20261024\node_modules

The base is `16d0ff2578714af42ced8ceaf348ca9939b677fa`, the tip of
`deploy/full-candidate-20261028` on origin (read with `git ls-remote origin
refs/heads/deploy/full-candidate-20261028`) and the base of the branch
`deploy/full-candidate-20261029`. The remote is
`https://github.com/KatsuJinCode/decko-ts`, private.

The lane's own local branch names are `deploy/full-candidate-20261029-lane1`
and `deploy/full-candidate-20261029-lane1b` and
`deploy/full-candidate-20261029-lane1c`. The chain published on origin is
`deploy/full-candidate-20261029`; the lane branch names are the lane's local
scratch and nothing was pushed under them. The first two are superseded and
unpushed: `lane1b` carried a capability merge whose registry resolution was
wrong (section 3), and `lane1c` is the branch the canonical chain was built
on.

## 2. The merge set, verified on origin before the merge

The assignment asks for every pushed family lane tip that is not already an
ancestor of the roll. The whole remote was read with one `git ls-remote` per
check, every `refs/heads/port/*` tip was fetched forward-only into the lane
checkout, and each tip's ancestry against the base was decided with `git
merge-base --is-ancestor`. Twelve port tips are not ancestors of the base.
Five of them are this batch's family lanes and are merged in the branch; the
other seven are named in section 7 with the reason.

| # | branch | tip (origin) | merge commit | conflicts |
|---|---|---|---|---|
| 1 | port/savepath-round9-20261024 | f99e3ef8979eeb13eb7708d39a58c9ce36f8bf29 | 76de8e7c | none |
| 2 | port/capability-round9-20261024 | a081004348e6e7e72d0576b45f2a9699864ebdaa | 5197b54d | two files, one with eight regions |
| 3 | port/smell-test-round3-20261024 | 2389d8e76992867d046d85499c144ca30522269b | 36461f35 | none |
| 4 | port/smell-test-round3-b1-20261024 | d7a7c652834b39e82ba04a96a69f8766fb274d9d | d3445366 | none |
| 5 | port/roster-repair-20261024 | 941cab6c3ada550471cc5a727709b567be804f7d | 703bbee3 | none |

Merges one to four are the ones the four-lane roll landed on this branch
before this lane's commits; merge five is this lane's own. Every merge commit
carries the previous roll commit as its first parent and the lane tip as its
second, verified with `git rev-list --merges --parents` on the branch tip.

How the merges were made: the house dangerous-action gate refuses `git merge`
outside `--ff-only` and names its own remediation in the rule text: "Use
--ff-only, or build the merge commit with git merge-tree and git commit-tree
so the working tree is never touched." The roll took that path. `git
merge-tree --write-tree` computes the real three-way merge, `git commit-tree`
writes the merge commit with the two parents, and `git merge --ff-only`
advances the branch to it, which is a fast-forward because the new commit
carries the old HEAD as its first parent. The lane's own script is
`tmp/roll-v7-lane1-20261029/merge-lane.mjs`.

No branch was rebased and no source branch was rewritten.

## 3. The capability registry's conflict, and the repair that followed it

The capability round nine merge had two files with conflict regions, and the
registry file is the one that matters.

`tools/edge-signed-in-exercise/capabilities.json`: eight regions, one per row
the round closed (C6, C8, E3, E20, E21, R1, P5, P6). The regions are the
rows' `finding` lines, because both sides changed those lines. The lane's
own diff against the tip both sides branched from (`c265530a`) names exactly
those eight rows and no other, and the lane's text is the adjudication of
exactly those rows at this round's tip.

The first resolution took the lane's side of each region, which is right for
six of the eight rows and wrong for two. R1 and P5 carry check lists that
differ between the roll's file and the lane's file, so taking the finding
line alone left the roll's longer check list next to the lane's closure. The
tree's own grader says so, and it was run here over the round's own
committed record, against the file the branch carried:

    node tools/edge-signed-in-exercise/grader-cross-check.mjs \
      tools/edge-signed-in-exercise/capabilities.json \
      docs/runs/edge-signed-in-exercise-round9-family-2026-10-25.json
    grader over the committed record: 88 covered, 4 partial, 1 not_covered,
      1 disabled_upstream, 1 out_of_scope (of 95)
    MISMATCH: closed by this round but NOT computed covered by the grader over
      the committed record: R1, P5

The lane's own receipt recorded the line the round was expected to produce:
86 covered, 6 partial over the record, and the declared state 87 covered,
5 partial.

The repair is the rule the previous roll used for the same file: the roll's
file with each capability lane's adjudicated rows taken from that lane's own
file, whole. So the two rows are taken from the lane's own file, whole, and
the same cross-check then reads:

    every row this round closed (8) is computed covered by the grader
    the roster's own declared state: 92 covered, 0 partial, 1 not_covered,
      1 disabled_upstream, 1 out_of_scope (of 95)

The repair is commit `5350f227`, and it changes two check lists and nothing
else: R1's extra "rename through the board's name row updates the card's
referers" and P5's three extra structure legs, which the round's own record
does not grade and which therefore could not be computed covered.

`tools/edge-signed-in-exercise/checks-cover-b.mjs`: one region covering the
whole file, because the roll's tree carries the file with LF line endings
(the previous roll's repair took the capability round seven lane's whole
file) and the lane carries it with CRLF, so git sees every line as changed.
The three-way merge of the three sides with the line endings normalized is
clean, and that is the resolution: it keeps the roll's side's changes (the
`chosenFileChip` import, the `document.body?.innerText` guards, the F1 and
F3 comments) and the lane's side's P5 leg (the left type card is a Cardtype
and the visited cards are typed by it, with the lane's own comment naming
Ruby's anchor). The resolved file keeps the roll's tree's LF endings.

## 4. The bundle

The engine bundle was rebuilt with `node tools/bundle-bunny-edge-engine.mjs`,
exit 0, on the base tree before the first merge and on the branch tip after
the last merge.

| artifact | bytes before | bytes after | delta | SHA-256 before | SHA-256 after |
|---|---|---|---|---|---|
| bunny-edge-engine.bundle.js | 7400742 | 7401528 | 786 | d5e4f60bccc99d29af43511fb4395532531dc16dff0e5e9a41c6f0657b92cc25 | 57ca0c1e827f207fe10da2b0e2b6ab8d0a24dd8ec0ecd3cfa1494e464495d4c4 |
| bunny-edge-engine.code.json | 7540686 | 7541477 | 791 | f0b4d5394611e5120c3cccf1c3c62ee33f6d1a041627160194a7e17a72000585 | 5c18ba3cd0593e316a22bdf498e4feec043df980ad26b2b9c65af194e14a5339 |
| bunny-edge-read.bundle.js | 2126327 | 2126327 | 0 | bce209788b9b88475550577e742da44ccd19c6fb13053a83d8f6307631441700 | bce209788b9b88475550577e742da44ccd19c6fb13053a83d8f6307631441700 |
| bunny-edge-read.code.json | 2207583 | 2207583 | 0 | e1a62028a81e44ca83194d3cbd259d2c177155ac406066812c7269e7c489cb91 | e1a62028a81e44ca83194d3cbd259d2c177155ac406066812c7269e7c489cb91 |

The bundle moved because this roll carries real code in `src/`: the save-path
lane's ancestor walk and the style asset events' content-before batch. The
read bundle did not move, because the lanes that landed after the read
bundle's own build changed the engine's write path only.

The build warns that the bundle is over 80% of the conservative 7600000-byte
script limit (7401528 bytes is 97.4%). Nothing deploys, so this is a fact for
the record. `deploy/dist/` is gitignored, so the bundles are build artifacts
and do not appear in the commit; the hashes above are the record and the raw
values are in the lane's scratch (`tmp/roll-v7-lane1-20261029/bundle-before.json`
and `bundle-after.json`).

## 5. The gates

Typecheck, `npx tsc --noEmit`: exit 0, **zero output lines**, on the base tree
and on the branch tip.

Correctness, `node tools/test-gates.mjs run correctness`: see section 6.

The two files the assignment names as the pre-existing set
(`tests/card/actions/atomic-saves.test.ts`, the MySQL 8.4 native group, and
`tests/deploy/worker-edge-cache-runtime.test.ts`) are matched by the deploy
bucket's rule in `tools/test-gates.mjs`, so the correctness gate does not run
either file. Both were run on the base tree and on the branch tip in this
lane, apart from the gate, and their results are in section 6.

The smell-test lanes' own pins are named `*-parity.test.ts`, so the parity
bucket's rule in `tools/test-gates.mjs` owns them and the correctness gate
does not run them either. The lanes ran their own batteries, and their
receipts carry the lines: 19 files, 86 tests, 86 passed for the upper tail
and 18 files, 81 tests, 81 passed for the lower tail.

## 6. The failure set, and what it is compared against

The base tree's own failure set was measured first, on the same checkout, at
the base commit, before the first merge:

| | base tree 16d0ff25 |
|---|---|
| gate exit | 1 |
| test files | 1 failed, 692 passed, 54 skipped (747) |
| tests | 1 failed, 7219 passed, 227 skipped (7447) |
| node:test | 3 files, 15 passed, 0 failed |

The one base failure is machine state, not tree state: the file
`tests/hygiene/machine-lane-worktree-disk-hygiene.test.ts` names a lane
worktree on disk that is neither tracked in IN-FLIGHT.json nor in
`tests/hygiene/keep-worktrees.json` (`decko-ts-lane-archives`, depth-2 size
floor 4.2 MB), and the file's own remediation says so.

The deciding run on the branch tip:

| | branch tip |
|---|---|
| gate exit | 1 |
| test files | 1 failed, 695 passed, 54 skipped (750) |
| tests | 1 failed, 7231 passed, 227 skipped (7459) |
| node:test | 3 files, 15 passed, 0 failed |

**No failure is new.** The failing set is the base tree's failing set,
file for file: the same one file, the same assertion, and no other. The
three new test files the branch runs against the base tree's 747 are the
save-path lane's two pinned cases and one more, and all three pass.

**The two failures the assignment names do not belong to this gate.** The
named pre-existing set is the MySQL 8.4 group of
`tests/card/actions/atomic-saves.test.ts` and
`tests/deploy/worker-edge-cache-runtime.test.ts`, and the deploy bucket's
rule matches both, so the correctness gate does not run them. They were run
apart from the gate, on the base tree and on the branch tip:

| file | base tree 16d0ff25 | branch tip |
|---|---|---|
| tests/card/actions/atomic-saves.test.ts | 66 tests: 5 failed (the "atomic saves: MySQL 8.4 (native)" group), 61 passed | 66 tests: 5 failed (the same five names), 61 passed |
| tests/deploy/worker-edge-cache-runtime.test.ts | 1 failed, 3 passed | 1 failed (the same test), 3 passed |
| both files together | 6 failed, 64 passed (70) | 6 failed, 64 passed (70) |

The six failing test names are identical between the two runs, so the named
set is the same set before and after the roll: the six environmental
failures, unchanged.

## 7. What was left out, and why

Seven pushed port tips are not ancestors of the branch tip and were not
merged. They are the 2026-10-19 to 2026-10-23 conversion batch's lanes, not
this batch's family lanes, and no roll in this line (v13 through v19) merged
them either.

| lane | tip | what it carries |
|---|---|---|
| port/dsl-tranche2-20261020 | c8eb84a01 | the dsl C7 format-suffix dispatch boundary |
| port/register-dsl-convert-20261022 | 2039b470c | the register dsl conversion rows |
| port/dsl-convert-r2-20261022 | 3300c995c | the round-two dsl conversion rows, carrying the register dsl lane as an ancestor |
| port/register-mods-convert-20261022 | 45755e7dd | the register mods conversion rows |
| port/mods-convert-r2-20261022 | 2d55d6dad | the round-two mods conversion rows, carrying the register mods lane as an ancestor |
| port/register-starcards-convert-20261022 | 54bef7049 | the templated card row's own probe receipt |
| port/remaining-convert-r2-20261022 | ae5219fd7 | the redteam A2 Cardio application layer row |

Their rows stay open in the completeness roster, and no row of theirs was
promoted by the fold that follows this roll.

## 8. The disk cost

Added to the machine: the lane's checkout, 277634853 added bytes of tracked
working tree (the lane-copy admission measured 277634756 tracked bytes plus
the shared install linked through a junction rather than copied), the rebuilt
`deploy/dist/` build output (gitignored), and the lane's gitignored scratch
(`tmp/roll-v7-lane1-20261029/`), holding the gate logs, the bundle hash
records, the merge records and the resolved conflict files.

Kept: the lane's checkout, because it holds those records and the fold's own
git reads point at it. Nothing was deleted by hand: no space was freed, no
file was removed, and the delete gate was not routed around.

## 9. What this lane did not do

- Nothing deployed. No URL was fetched, so no URL is reported working.
- Nothing was written to the live D1.
- No candidate branch other than `deploy/full-candidate-20261029` was moved
  on origin.
- No source branch was rebased, and no tip was moved.
- No file was checked out from a hash onto the working tree, and no reset,
  stash, clean or rm was run: the branch this lane's first chain carried was
  left in place, superseded and unpushed, rather than rewritten.
