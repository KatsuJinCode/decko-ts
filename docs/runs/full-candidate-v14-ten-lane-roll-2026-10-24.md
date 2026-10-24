# Full candidate v14: the ten-lane roll, Saturday 2026-10-24

The assignment: roll ten frozen lane tips into the full integration
candidate, verify every tip, merge them one merge commit each in the named
order, resolve the conflicts by region, rebuild the engine bundle and record
SHA-256 and bytes before and after, gate (typecheck plus the correctness
battery), and push. Nothing deploys.

The lane's exclusive checkout is
`C:/localProjects/decko-ts-candidate-roll-20261024`, a linked worktree of
`C:/localProjects/decko-ts-restored` with the shared install linked through a
junction. The branch is `deploy/full-candidate-20261024`.

The previous roll is `deploy/full-candidate-20261023` at
`4e0c569cfe2a24a989d024378aa9949ff7a3b3ab`, and its own receipt is
`docs/runs/full-candidate-v13-ten-lane-roll-2026-10-23.md`. Its ten lanes
were rolled on 2026-10-23; the five wave-six/seven round branches it recorded
as landed-but-unabsorbed are the first five of this roll's merge set.

## 1. The lane checkout, and the base

The checkout was made through the sanctioned lane-copy path, not by a clone
and not by a raw worktree add:

    node C:/localProjects/juc-relay/fleet/lane-copy.mjs \
      --repo C:/localProjects/decko-ts-restored \
      --path C:/localProjects/decko-ts-candidate-roll-20261024 \
      --branch deploy/full-candidate-20261024 \
      --base deploy/full-candidate-20261023 \
      --shared-modules C:/localProjects/decko-ts-candidate-roll-20261023/node_modules \
      --owner worker-1 --purpose "integration roll v2: ten port branches merged into deploy/full-candidate-20261024"
    outcome: created, lease faa32d48051e, trackedBytes 264042745,
    addedBytes 264042836, budgetBytes 314572800,
    nodeModules: junction -> C:\localProjects\decko-ts-candidate-roll-20261023\node_modules

The base is `4e0c569cfe2a24a989d024378aa9949ff7a3b3ab`, verified on origin
with `git ls-remote origin refs/heads/deploy/full-candidate-20261023` and
locally with `git rev-parse deploy/full-candidate-20261023` in the new
checkout, which read the same hash.

## 2. The merge set, verified on origin before any merge

Every one of the ten tips was verified against the hash the assignment names,
on origin, in one `git ls-remote` read, before the first merge:

| # | branch | tip (origin) | merge commit | conflicts |
|---|---|---|---|---|
| 1 | port/routes-round5-20261023 | f1a5ed4aab9fbf2032043cd2e86a3231671fbcf7 | 4d0ccaf7 | 1 file, 1 region |
| 2 | port/routes-round6-20261024 | c56635750bb7f3f1c3db8c3944dbeff3697ce2bc | 42173208 | none |
| 3 | port/register-events-round2-20261023 | d477d5eabe9abba03ea1323300b6373d18b1f241 | 088c3b3e | none |
| 4 | port/register-events-round3-20261024 | 208c21d9d1a0992c2bb191e63bb3f5494ece4762 | 0d5426d9 | none |
| 5 | port/capability-round5-20261023 | 18d42a844b4d662df15ff4726346ccd20341f940 | eb8e95b5 | 1 file, 1 region |
| 6 | port/capability-round6-20261024 | 71b9693d644231c7523c82dd5797ab5481031dad | 6ae185c4 | none |
| 7 | port/matrix-round5-20261023 | 75fe7d997e553afd28179a82278bda0aa58fa679 | 76204726 | none |
| 8 | port/matrix-round6-20261024 | e3b7cd0c324e0a80498eb8d0fca3f4df22a09d7c | 91e04bf9 | none |
| 9 | port/savepath-round5-20261023 | b20242a83c6e3c3f463e2ca5af18b6bfd7b7304c | 08f3d51f | none |
| 10 | port/savepath-round6-20261024 | 76c1e531274196fb573e2e7687ffdf22f074d416 | f6499109 | none |

The assignment named the save-path round-six tip as "find its tip on
origin"; the one `git ls-remote` read found it at
`76c1e531274196fb573e2e7687ffdf22f074d416`.

Three of the ten tips were not in the local object store at the start of this
lane (routes round five, routes round six, register-events round three), and
were fetched with one forward-only fetch that moved remote-tracking refs and
objects only:

    git fetch --no-tags origin \
      refs/heads/port/routes-round5-20261023:refs/remotes/origin/port/routes-round5-20261023 \
      refs/heads/port/routes-round6-20261024:refs/remotes/origin/port/routes-round6-20261024 \
      refs/heads/port/register-events-round3-20261024:refs/remotes/origin/port/register-events-round3-20261024

Each fetched tip then read back at exactly the hash the origin read gave.

Every merge commit carries the lane tip as its second parent and the previous
roll commit as its first, verified with `git rev-list --parents -n 1` on each
of the ten. The roll carries 81 commits and 126 files changed, 23462
insertions, 379 deletions against the base.

**One merge subject names a branch that does not exist.** The fifth merge
commit, `eb8e95b5`, reads "Merge remote-tracking branch
'origin/port/capability-round5-20261024' into deploy/full-candidate-20261024".
There is no such branch on origin: the lane is
`port/capability-round5-20261023`, and its tip `18d42a84` is the commit the
merge actually carried, as its second parent
(`git rev-list --parents -n 1 eb8e95b5` reads
`eb8e95b5 0d5426d9 18d42a84`). The other nine subjects name their lane
correctly. The subject text is not corrected here: the branch was pushed
before the receipt was written, and history in this repository moves
forward-only. The merge table above is the authoritative record of which tip
went into which merge commit.

## 3. How the merges were made, and why

The house dangerous-action gate refuses `git merge` outside `--ff-only` and
names its own remediation in the rule text: "Use --ff-only, or build the
merge commit with git merge-tree and git commit-tree so the working tree is
never touched." The roll took that path. `git merge-tree --write-tree`
computes the real three-way merge, `git commit-tree` writes the merge commit
with the two parents, and `git merge --ff-only` advances the branch to it,
which is a fast-forward because the new commit carries the old HEAD as its
first parent. The working tree and the real index are never modified until
that fast-forward, and the fast-forward is a pointer move over a clean
checkout.

A conflicted merge was resolved without touching the checkout's index: the
merged tree was read into a temporary index under `tmp/`, the resolved file
was hashed into the object store and written into that temporary index, and
`git write-tree` produced the resolved tree.

No branch was rebased and no source branch was rewritten.

## 4. The conflicts, resolved by region

Two of the ten merges had one conflict region each. Every region was decided
by reading both sides.

### Merge 1, routes round five: 1 file, 1 region, a union

| file | region | decision | why |
|---|---|---|---|
| vm-staging-server.mjs | the import block | union | Ours carries the two server-error imports (`serverErrorArm` from server-error-debugger-arm, `debugServerErrorView` from debug-server-error) and theirs carries the card-mod-history import (`lastDraftContent`). The merged body calls all three: the debugger arm at the staging reader (line 2614 of the merged file), the debug error view (2699), and the draft content read (2845). The union is exactly what the merged tree needs, and no side's import is dead. |

### Merge 5, capability round five: 1 file, 1 region, theirs

| file | region | decision | why |
|---|---|---|---|
| tools/edge-signed-in-exercise/capabilities.json | row F1's "finding" value | theirs | Both sides write the same row's finding. Theirs is the later statement of that row, written by the family that owns it in round five ("CLOSED ON PARITY", with the pinned gemset's own bytes behind the contract, the zero-difference measurement against the pinned gem's own upload client, and the round-five board run's 13 of 13 checks). Ours was the earlier statement of the same row, from the round-three text the roll already carried ("COVERED, and the finding this row carried for six tranches was wrong"). Taking theirs replaces the older measurement of the row with the newer one; the file's other rows merged automatically, and the file parses as JSON after the resolution (verified with `JSON.parse`). |

The eight other merges were clean: `git merge-tree --write-tree` exited 0 and
every hunk of the branch landed as the branch wrote it.

## 5. The three gate findings, and what was done with each

The first correctness run on the merged tree carried three failures the base
tree's own run did not have. Each was read before it was touched.

### The staging server booted against a half-emitted dist (not a code defect)

`tests/card/auth/reset-flow-endpoint.test.ts` failed its beforeAll with the
staging server's own error:

    SyntaxError: The requested module './dist/src/card/mod-loader/mods/card-mod-history.js'
    does not provide an export named 'lastDraftContent'

The mechanism: the staging server imports the engine from `./dist/`, and the
suite's bootstrap builds that dist on first use. Under the full suite's
parallel load the emit took longer than the suite's 120-second beforeAll
budget, so the server was booted against a dist that was still being written.
The dist the same run left behind carries the export (the build finished at
23:47:10 local, and the emitted module exports `lastDraftContent`).

This is the currency gap the routes round-five receipt named and left open for
the harness lane that owns it ("the staging dist bootstrap's readiness gate
checks that every dist module the server imports EXISTS and is non-empty, but
not that its content is CURRENT"). The lane's own remedy is that receipt's
recipe: rebuild the dist with the bootstrap's own command.

    npx tsc -p tsconfig.json      (exit 0, 4.7 seconds with no load)

With a current dist the suite passes alone: 14 tests, 0 failed.

### The capability round-five pin read a block comment as code (fixed)

`tests/card/mod-loader/card-mod-followers-list.test.ts` failed its pin "the
port names follower_names only in COMMENTS, never in code". The pin's live
check removed the line comments and then looked for the name in what was
left. The merged tree's follow mod also names the Ruby method inside a
`/** ... */` doc block, so the leftover text read as code and the tripwire
fired on a comment.

Measured on the merged tree: 3 raw occurrences, 2 of them line comments and 1
inside a block comment; after both comment kinds are removed, 0 occurrences
remain in code. The pin's claim holds, so the check now strips block comments
as well. The measured-gap values the pin reads from the committed capture are
untouched. Commit `7ec2592b`. The file passes: 10 tests, 0 failed.

### The corpus guard did not know the capability family's graded capture (fixed)

`tests/exercise/rules-and-sets-5.test.ts` failed the `:follow_status`
coverage guard, which walks the committed capture trees and requires every
mention of the view to sit under a corpus generation whose Ruby oracles
exercise it. The capability round-five branch committed a Ruby oracle capture
that names the view in the pinned bytes
(`fixtures/captured/unfollow-board.json`, captured by
`tests/card/mod-loader/oracle-capture-unfollow-board.rb` and graded by
`tests/card/mod-loader/card-mod-unfollow-board.test.ts`), and the merged tree
carries it.

The guard now names that one graded capture explicitly and matches the path
with normalized separators. The teeth are unchanged: a stray capture anywhere
else, including another file under `fixtures/captured`, still fails here.
Commit `34c580f2`. The file passes: 10 tests, 0 failed. Measured: 8 mentions,
7 under a corpus generation and 1 the named graded capture.

## 6. The bundle

The engine bundle was rebuilt with `node tools/bundle-bunny-edge-engine.mjs`,
exit 0, on the base tree before the first merge and on the merged tree after
the last one.

| artifact | bytes before | bytes after | delta |
|---|---|---|---|
| bunny-edge-engine.bundle.js | 7375650 | 7391163 | +15513 |
| bunny-edge-engine.code.json | 7515076 | 7530871 | +15795 |
| bunny-edge-read.bundle.js | 2117385 | 2121905 | +4520 |
| bunny-edge-read.code.json | 2198459 | 2203042 | +4583 |

| artifact | SHA-256 before | SHA-256 after |
|---|---|---|
| bunny-edge-engine.bundle.js | f7319fc57561e1e1cbe43222b0f0a975a8cc88bd32652c285ecf8204c838388c | 34dcccae24869ddfd04b5aae17a1dd50d03af9353b405cf5b9accea4bee7bf30 |
| bunny-edge-engine.code.json | 409a53010b77fa228dff4e51e47b0edba455e8f51a6d1fa7d8e8985dfd4a430c | 2bcbe1d2a4435b3362e175a9121ee7513c18941daab7171b7546fdfce0aab9b4 |
| bunny-edge-read.bundle.js | e3fae30b6f86905d403a978390d8ef8fa9912fbf309adb6f93bd6f1b9538045e | 43ad963950f55f1719e30e73a8b89063ed6733418a9915d43d03f5863681dab5 |
| bunny-edge-read.code.json | 581e2cce513e8e2aa4996f69c350ea8868ecf26be7e2970aacb730dfa5c69c5e | 64baf8b24446640d256cd0275b55ceef2ca78a7b964bcee441884a2d7f1bba6d |

The "before" values are byte-identical to the "after" values the v13 roll
recorded for the same base tree, so the "before" is the real v12 artifact and
not a rebuild that drifted. The build was repeated on the final tree and came
out identical to the after values above, which makes the build reproducible
rather than merely recorded.

The build warns that the bundle is over 80% of the conservative 7600000-byte
script limit (7391163 bytes is 97.3%). Nothing deploys, so this is a fact for
the record.

`deploy/dist/` is gitignored, so the bundles are build artifacts and do not
appear in the commit. The hashes above are the record.

## 7. The gates

Typecheck, `npx tsc --noEmit`: exit 0, **zero output lines**
(`tmp/roll-v2-20261024/tsc-base.txt` on the base tree,
`tmp/roll-v2-20261024/tsc-fixed.txt` on the fixed tree). The base's baseline
is zero lines, so this matches.

Correctness, `node tools/test-gates.mjs run correctness`: see section 8.

## 8. The failure set, and what it is compared against

The base tree's own failure set was measured first, on the same checkout, at
the base commit, before the first merge
(`tmp/roll-v2-20261024/correctness-base.log`):

| | base tree 4e0c569c |
|---|---|
| gate exit | 1 |
| test files | 2 failed, 651 passed, 54 skipped (707) |
| tests | 2 failed, 6878 passed, 227 skipped (7107) |
| node:test | 3 files, 15 passed, 0 failed |
| duration | 581.98s |

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
Neither appeared in this run for that reason and not because they passed. The
named set is therefore empty for this gate, and the measured set is the base
tree's.

The deciding run on the fixed tree
(`tmp/roll-v2-20261024/correctness-final.log`, on the tree that was pushed):

| | merged tree (deciding run) |
|---|---|
| gate exit | 1 |
| test files | 2 failed, 678 passed, 54 skipped (734) |
| tests | 2 failed, 7082 passed, 227 skipped (7311) |
| node:test | 3 files, 15 passed, 0 failed |
| duration | 586.56s |

**The failure set equals the base tree's failure set, file for file and
message for message.** The two files that fail are the two files that failed
on the base tree, with the same two assertions: the worktree hygiene gate
names `decko-ts-lane-archives` as untracked, and the scan-root probe's dead
machine pin is still on the disk. Both are machine state. The merged tree
added 27 test files (734 against the base's 707) and 204 tests (7311 against
7107), and the skip count is unchanged at 227.

The run before the two fixes carried three further failures, and each of them
is named in section 5 with what was done about it: the staging server's
boot against a half-emitted dist (a load artifact, cleared by the bootstrap's
own rebuild recipe), the followers-list pin reading a block comment as code,
and the corpus guard not knowing the capability family's graded capture. The
two fixes are commits `7ec2592b` and `34c580f2`.

## 9. The disk cost

Added to the machine: the lane's checkout, 322 MB, which the lane-copy
admission measured as 264042836 bytes of tracked working tree plus the shared
install linked through a junction rather than copied.

Kept: the lane's gitignored scratch (`tmp/roll-v2-20261024/`), holding the
gate logs, the bundle hash records, the merge-tree records and the conflict
resolution files. The rebuilt `dist/` is gitignored build output.

## 10. What this lane did not do

- Nothing deployed. No URL was fetched, so no URL is reported working.
- Nothing was written to the live D1.
- The other candidate branches on origin were not moved. The roll pushed one
  branch: `deploy/full-candidate-20261024`.
- No source branch was rebased, and no tip was moved.
- The lanes still in flight against other families (routes round seven,
  register-events round four, matrix round seven) were not touched, and their
  tips were not in this merge set.
- The DELETE-KILL-SWITCH was not touched, and no space was freed by hand.
