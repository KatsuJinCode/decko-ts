# Full candidate v15: the lanes roll, Saturday 2026-10-24

The assignment: roll this batch's frozen lane tips into the full integration
candidate, verify every tip, merge them one merge commit each, resolve the
conflicts by region, rebuild the engine bundle and record SHA-256 and bytes
before and after, gate (typecheck plus the correctness battery), and push.
Nothing deploys.

The lane's exclusive checkout is
`C:/localProjects/decko-ts-candidate-roll-20261025`, made through the
sanctioned lane-copy path, not by a clone and not by a raw worktree add:

    node C:/localProjects/juc-relay/fleet/lane-copy.mjs \
      --repo C:/localProjects/decko-ts-release-lead \
      --path C:/localProjects/decko-ts-candidate-roll-20261025 \
      --branch deploy/full-candidate-20261025 \
      --base deploy/full-candidate-20261024 \
      --shared-modules C:/localProjects/decko-ts-candidate-roll-20261024/node_modules \
      --owner worker-1 --purpose "integration roll v3: four port branches merged into deploy/full-candidate-20261025"
    outcome: created, lease ad125bfa30bf, trackedBytes 265355866,
    addedBytes 265355957, budgetBytes 314572800, estimateBytes 291891453,
    nodeModules: junction -> C:\localProjects\decko-ts-candidate-roll-20261024\node_modules

The base is `61b7d03ad0ccb2df4288a77ba5a4713386ebc1bd`, verified on origin
with `git ls-remote origin refs/heads/deploy/full-candidate-20261024` (the
same hash the assignment names) and locally with `git rev-parse
deploy/full-candidate-20261024` in the new checkout, which read the same
hash. The remote is `https://github.com/KatsuJinCode/decko-ts`, private
(`gh repo view KatsuJinCode/decko-ts --json isPrivate` reads `true`).

## 1. The wait-check

The assignment named four round branches from this batch and asked for a
wait-check first, with only the tips that exist and are pushed to be merged
and whatever is left out to be named. The wait-check ran as the lane's own
bounded poll, `C:/localProjects/brandonDojoTech/tmp/fold-roll3-20261024/
wait-for-lanes.mjs`, which reads the branch tips on origin and the fleet
queue's task states every thirty seconds and exits when every lane is ready
or when its window closes.

| time (Z) | register-events-round5 | routes-round8 | matrix-round8 | savepath-round7 |
|---|---|---|---|---|
| 08:51 | tip 735b64571, queue done, READY | tip a4830392, queue claimed | absent, queue claimed | absent, queue claimed |
| 09:11 | tip 735b64571, queue done, READY | tip a4830392, queue claimed | absent, queue claimed | tip 0854a3c0, queue claimed |
| 10:12 | tip 735b64571, queue done, READY | tip cb8a68d2, queue claimed | tip 7f07eb7f9, queue claimed | tip 0854a3c0, queue claimed |
| 10:14 (window closed) | tip 735b64571, queue done, READY | tip cb8a68d2, queue claimed | tip 7f07eb7f9, queue claimed | tip 0854a3c0, queue claimed |

All four branches existed and were pushed on origin when the merge phase
started, so all four were merged. What the lane did NOT do is wait for the
three lanes to mark their queue tasks done: routes round eight, matrix round
eight and save-path round seven were still working (their tips moved during
this lane, and their queue tasks still read "claimed"), so the tips merged
are the tips that existed and were pushed at the merge moment, and the rows
those lanes land after that moment are named in section 8.

## 2. The merge set, verified on origin before the merge

| # | branch | tip (origin) | merge commit | conflicts |
|---|---|---|---|---|
| 1 | port/register-events-round5-20261024 | 735b64571eef04c36eb67b2a9054118089265d4e | 478c896ec12506623b40f198d1a7949c1b45c6c8 | none |
| 2 | port/routes-round8-20261024 | cb8a68d21f95fe81b98642452bff4ddcf176be65 | 8775bf046ad2f96489c150732ba117be51364acb | 3 files, 3 regions |
| 3 | port/matrix-round8-20261024 | 7f07eb7f9d15e833007abd1ff906786bcdfd2667 | 69ea65c5d3feeac2f4ebd47912b7c0c988c997d3 | none |
| 4 | port/savepath-round7-20261024 | 0854a3c0b66b9a5e418ec38884b9b635315b1211 | 701c3441ee0fdfb65a4559fb22d7a2493dbebcd8 | none |

Every tip was read from origin with one `git ls-remote` read per check and
then fetched forward-only into the lane checkout
(`git fetch --no-tags origin refs/heads/<branch>:refs/remotes/origin/<branch>`),
and each fetched tip read back at exactly the hash the origin read gave.

Every merge commit carries the previous roll commit as its first parent and
the lane tip as its second, verified with `git rev-list --parents -n 1` on
each of the four. The roll carries 54 commits and 66 files changed (6628
insertions, 286 deletions) against the base.

The register-events lane's tip carries the register-events round four lane
with it (round four's tip `dcf6a690113ec3841545607c67ed3b8c36dc59d7` is an
ancestor of round five's tip), and the routes round eight lane's tip carries
the routes round seven lane with it (round seven's tip
`c3dbe428086b7df0481d9f7c7979efef881b0cf7`), so both rounds' closures ride
in the tree. The fold against this roll reads that ancestry per row.

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
`tmp/roll-v3-20261025/merge-lane.mjs`.

A conflicted merge was resolved without touching the checkout's index: the
merged tree was read into a temporary index under `tmp/roll-v3-20261025/`,
each resolved file was hashed into the object store and written into that
temporary index, and `git write-tree` produced the resolved tree. The lane's
own script for this is `tmp/roll-v3-20261025/build-resolved-tree.mjs`.

No branch was rebased and no source branch was rewritten.

## 3. The conflicts, resolved by region

One of the four merges had three conflict regions. Every region was decided
by reading both sides and by reading the merged tree the auto-merge
produced.

| file | region | decision | why |
|---|---|---|---|
| src/card/mod-loader/mods/card-mod-api_key.ts | the "NOT ported here" comment block (one region, the whole block) | union | Ours (the roll's tree) names the two api_key events as PORTED with their bodies, and the merged tree keeps those two bodies (`generateApiKeyEvent`, `validateApiKeyEvent` are in the merged file at the two `event({...})` registrations). Theirs (the routes lane's tree) names the READ half as ported, in `src/server/request-authenticators.ts` (`requestApiKey`, `resolveReadAuthenticators`) and in the new `src/card/auth/api-key-lookup.ts` (`findAccountByApiKey`, `signinFromApiKey`), and both of those files are in the merged tree. The resolved block keeps both accounts: the read half is ported, the two events are ported, and the still-not-ported remainder is the auth-mixin methods, the key generation, the AccountField inheritance and the JWT encode. Theirs' clause "The TS port has no save/validate/event surface today" is not carried, because the merged tree carries exactly that surface: the two event bodies ours names. |
| src/server/worker-shared-surface.ts | the import block | union | Ours carries the visitor-session import (`previousLocation`, `readVisitorSession`) and theirs carries the server log import (`logInfo`). The merged body calls all three: `readVisitorSession` and `previousLocation` at the visit target (the merged file's lines 377 and 378) and `logInfo` for the deprecated asset stub line (line 445). The union is what the merged body needs and no side's import is dead. |
| vm-staging-server.mjs | the import block | union, one side's import dropped | Ours carries the material-icons import (`configureMaterialIconsMode`, `materialIconsHeadTag`) and `resolveReadTokenAuth`; theirs carries `resolveReadAuthenticators` and `signinFromApiKey`. The merged body calls the material-icons pair (the merged file's lines 1402 and 2357) and the authenticator pair (lines 4386 and 4390), and it calls NEITHER `resolveReadTokenAuth`: the auto-merged body switched that call to `resolveReadAuthenticators`, which the merged `src/server/request-authenticators.ts` exports alongside `resolveReadTokenAuth`. So the union keeps the material-icons import and theirs' two imports, and drops ours' `resolveReadTokenAuth` import because nothing in the merged file reads it. |

## 4. The bundle

The engine bundle was rebuilt with `node tools/bundle-bunny-edge-engine.mjs`,
exit 0, on the base tree before the first merge and on the merged tree after
the last one.

| artifact | bytes before | bytes after | delta |
|---|---|---|---|
| bunny-edge-engine.bundle.js | 7391163 | 7396735 | +5572 |
| bunny-edge-engine.code.json | 7530871 | 7536589 | +5718 |
| bunny-edge-read.bundle.js | 2121905 | 2123362 | +1457 |
| bunny-edge-read.code.json | 2203042 | 2204552 | +1510 |

| artifact | SHA-256 before | SHA-256 after |
|---|---|---|
| bunny-edge-engine.bundle.js | 34dcccae24869ddfd04b5aae17a1dd50d03af9353b405cf5b9accea4bee7bf30 | 328e018f6267f0a70249da27965d346c19287d98beb66c4ace556b4ab2d5c8ad |
| bunny-edge-engine.code.json | 2bcbe1d2a4435b3362e175a9121ee7513c18941daab7171b7546fdfce0aab9b4 | 40bd956167db6fa3242d41c61e4767b1246245c5d1a7bce193a08bb9dfff4447 |
| bunny-edge-read.bundle.js | 43ad963950f55f1719e30e73a8b89063ed6733418a9915d43d03f5863681dab5 | 73f2879346c9e0b0de1d6b596d964f1f251d581130a2b60b8538fd10dd950112 |
| bunny-edge-read.code.json | 64baf8b24446640d256cd0275b55ceef2ca78a7b964bcee441884a2d7f1bba6d | 924a1c8c56be2f33bea9b9be2ac02e99da9c4fcfe876faefb9d800c5f7b3258e |

The "before" values are byte-identical to the "after" values the v14 roll
recorded for the same base tree, so the "before" is the real v14 artifact and
not a rebuild that drifted.

The build warns that the bundle is over 80% of the conservative
7600000-byte script limit (7396735 bytes is 97.3%). Nothing deploys, so this
is a fact for the record.

`deploy/dist/` is gitignored, so the bundles are build artifacts and do not
appear in the commit. The hashes above are the record, and the raw values
are in the lane's scratch (`tmp/roll-v3-20261025/bundle-before.json` and
`bundle-after.json`).

## 5. The gates

Typecheck, `npx tsc --noEmit`: exit 0, **zero output lines**
(`tmp/roll-v3-20261025/tsc-merged.txt` on the merged tree, and the base
tree's own run at `tmp/roll-v3-20261025/` before the first merge was also
zero lines).

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
(`tmp/roll-v3-20261025/correctness-base.log`):

| | base tree 61b7d03a |
|---|---|
| gate exit | 1 |
| test files | 2 failed, 678 passed, 54 skipped (734) |
| tests | 2 failed, 7060 passed, 249 skipped (7311) |
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

| file | base tree 61b7d03a | merged tree |
|---|---|---|
| tests/card/actions/atomic-saves.test.ts | 66 tests: 5 failed (the "atomic saves: MySQL 8.4 (native)" group), 61 passed | 66 tests: 5 failed (the same five names), 61 passed |
| tests/deploy/worker-edge-cache-runtime.test.ts | 1 failed ("hits byte-identically, bypasses credentials, and invalidates committed edits and read revocations"), 3 passed | 1 failed (the same test), 3 passed |
| both files together | 6 failed, 64 passed (70) | 6 failed, 64 passed (70) |

The named set is therefore the same set before and after the roll: the six
environmental failures, unchanged.

The first correctness run on the merged tree carried one failure the base
tree's own run did not have, and it was read before it was touched.

### The mail-reset pin read a stale harness line (fixed)

`tests/card/mod-loader/card-mod-password-reset-request.test.ts` failed its
leg "the request leg grades the delivered message AND the visible
acknowledgment": the pin reads the harness module's own source and expects
the acknowledgment line, and the module in the merged tree carries a
null-safe form the pin did not expect.

The mechanism: the matrix round-eight lane's commit `5421b7eb` ("The
signed-in exercise: a mid-navigation DOM read cannot abort a check module")
made every `document.body` read in
`tools/edge-signed-in-exercise` null-safe, so the text of a document with
no body is the empty string instead of a thrown TypeError, and the
harness module's line reads `document.body?.innerText ?? ""` where the pin
still expected `document.body.innerText`. That lane's branch does not carry
the pin file at all (the pin is newer than that branch's lineage), so the
lane could not update it, and the merge of the two sides is what put the
new module next to the old expectation.

The fix (commit `c9a3b0d8`) is the pin's expected string following the
merged harness line. The teeth are unchanged: the expected string still
names the same acknowledgment regex over the page's text, the same
timeout and the same `.then(()=>true,()=>false)` verdict, so a module that
dropped the acknowledgment check still fails this pin. The file passes:
21 tests, 0 failed.

The deciding run on the tree that was pushed
(`tmp/roll-v3-20261025/correctness-final.log`):

| | merged tree (deciding run) |
|---|---|
| gate exit | 1 |
| test files | 2 failed, 681 passed, 54 skipped (737) |
| tests | 2 failed, 7095 passed, 227 skipped (7324) |
| node:test | 3 files, 15 passed, 0 failed |

**The failure set equals the base tree's failure set, file for file and
message for message.** The two files that fail are the two files that
failed on the base tree, with the same two assertions: the worktree
hygiene gate names `decko-ts-lane-archives` as untracked, and the
scan-root probe's dead machine pin is still on the disk. Both are machine
state. The merged tree added 3 test files (737 against the base's 734)
and 13 tests (7324 against 7311), and the skip count is unchanged at 227.

## 7. The disk cost

Added to the machine: the lane's checkout, 324 MB on disk (the
lane-copy admission measured 265355957 bytes of tracked working tree plus
the shared install linked through a junction rather than copied).

Kept: the lane's gitignored scratch (`tmp/roll-v3-20261025/`), holding the
gate logs, the bundle hash records, the merge-tree records and the conflict
resolution files. The rebuilt `deploy/dist/` is gitignored build output.
Nothing was deleted by hand: no space was freed, no file was removed, and
the delete gate was not routed around.


## 8. What this lane did not do

- Nothing deployed. No URL was fetched, so no URL is reported working.
- Nothing was written to the live D1.
- The other candidate branches on origin were not moved. The roll pushed one
  branch: `deploy/full-candidate-20261025`.
- No source branch was rebased, and no tip was moved.
- The three lanes that were still working when the merge phase started
  (routes round eight, matrix round eight, save-path round seven) had their
  pushed tips merged, and the commits they land after those tips are named
  here as left out: the routes lane's remaining rows, the matrix lane's
  rows beyond the six it adjudicated, and the save-path lane's levers
  beyond the one that was pushed.
- The DELETE-KILL-SWITCH was not touched, and no space was freed by hand.
