# Full candidate v18: the twelve lane roll, Saturday 2026-10-24 (run 2026-10-25)

The assignment: roll this batch's lane tips into the next integration candidate,
verify every tip, merge them one merge commit each, resolve the conflicts by
region with the reason named, rebuild the engine bundle and record SHA-256 and
bytes before and after, gate (typecheck plus the correctness battery), and push.
Nothing deploys.

The lane's exclusive checkout is
`C:/localProjects/decko-ts-candidate-roll-20261028`, made through the sanctioned
lane-copy path, not by a clone and not by a raw worktree add:

    node C:/localProjects/juc-relay/fleet/lane-copy.mjs \
      --repo C:/localProjects/decko-ts-release-lead \
      --path C:/localProjects/decko-ts-candidate-roll-20261028 \
      --branch deploy/full-candidate-20261028 \
      --base deploy/full-candidate-20261027 \
      --shared-modules C:/localProjects/decko-ts-capability-round8-20261024/node_modules \
      --owner roll-v6-and-fold --purpose "integration roll v6: lane tips merged into deploy/full-candidate-20261028"
    outcome: created, lease 596f73d31963, trackedBytes 266009534,
    addedBytes 266009625, budgetBytes 314572800, estimateBytes 292610488,
    nodeModules: junction -> C:\localProjects\decko-ts-capability-round8-20261024\node_modules

The base is `1cea77d7a113c376aa5484e8c4267451588b6e97`, verified on origin with
`git ls-remote origin refs/heads/deploy/full-candidate-20261027` (the same hash
the assignment names) and locally with `git rev-parse
deploy/full-candidate-20261027` in the new checkout, which read the same hash.
The remote is `https://github.com/KatsuJinCode/decko-ts`, private. The branch
`deploy/full-candidate-20261028` did not exist on origin before this roll
(`git ls-remote origin refs/heads/deploy/full-candidate-20261028` read nothing)
and did not exist locally either (`git rev-parse --verify
refs/heads/deploy/full-candidate-20261028` failed).

The shared install was chosen because its `package-lock.json` is byte-identical
to the base tree's own lockfile (`sha256 96a3efb62e81fdb24516d8106316e92e44cdde583d63399ca0b6e1e54731ae69`,
the same hash the roll's tree carries at `git show 1cea77d7:package-lock.json |
sha256sum`), so the lane runs the dependencies its own lockfile names.

## 1. The merge set, verified on origin before the merge

The assignment asks for every pushed family lane tip that is not already an
ancestor of the roll. The whole remote was read with one `git ls-remote` per
check, every `refs/heads/port/*` tip was fetched forward-only into the lane
checkout, and each tip's ancestry against `1cea77d7` was decided with
`git merge-base --is-ancestor`. Twenty-two port tips are not ancestors of the
roll. Twelve of them are this batch's family lanes and are merged here; the
other ten are named in section 9 with the reason.

| # | branch | tip (origin) | merge commit | conflicts |
|---|---|---|---|---|
| 1 | port/routes-round9-20261024 | 836b9b67b62e7224272297b1a4041e4583914370 | 6bd282bab8014a45d6779229dc61b5f6fd9d7b17 | none |
| 2 | port/routes-a12-20261024 | 14f36ab09b273ec1a80c4d9b924160e5523c027e | 709deebacfd7a3756aa1eeafbb5f2f91bffd462f | one file, one region |
| 3 | port/register-events-round7-20261024 | 623dfe019db57c7e5996c4b1f347c2533352c377 | 82f15c18ff6f3731d1ec11c626ae43dbd0b91141 | none |
| 4 | port/matrix-round10-20261024 | 71d4f686007e9f26e75cbfe66db964bd2ccc08cd | 3c45a12b76630bdcc1cd748f48a99f2a6cec7b0e | none |
| 5 | port/matrix-round11-20261024 | 26f4d6a4eccdebcc9994b01ff2924c9b6f6808e2 | c52eef961e1833479860cbb91fcd6eed2c7ddad9 | none |
| 6 | port/matrix-round12-20261024 | 927001b1071e6254d7848eda40bcef87fe558d4b | 57e900ccc04436206623cf3ace3f22d49ab17be9 | one file, four regions |
| 7 | port/capability-round7-20261024 | a09850fa240406a8a73288af7649525860d25b31 | eb7361e5426c47a29caf1677fa2638999ee2149e | four files, seven regions, two files taken whole |
| 8 | port/capability-round8-20261024 | c265530a955b9915a937fa1308532000d8554f27 | 6f5983700242bdd130c8328c35c1b56a3bbc1974 | one file, five regions |
| 9 | port/smell-test-round1b-20261024 | 9658a462ad1dca1ba7b413aba5d917068bd73131 | 3566fed9322947b655ff1eb5573a632551b1b5e5 | one file, five regions |
| 10 | port/smell-test-round2-20261024 | 463e39c2ceefc2f81bfd9c4fed48de95f8faae38 | dc8ac4f56a052bdb3f472e38b663533b4ff72320 | none |
| 11 | port/savepath-round8-20261024 | 0c49dd074498761a2b6ef8917e024305287cdf1b | 43bbfce28d95e84886abf253f40848f7686e6077 | none |
| 12 | port/register-treewalk-round1b-20261024 | 3337b55295dfe500a48d8ac9f4535dd748728831 | c3f192464cdd861d1f290b95cf3efef3329a882f | none |

Every tip was read from origin with one `git ls-remote` read per check and then
fetched forward-only into the lane checkout
(`git fetch --no-tags origin '+refs/heads/port/*:refs/remotes/origin/port/*'`),
and each fetched tip read back at exactly the hash the origin read gave. The
capture of the merge moment is kept in the lane's scratch:
`tmp/roll-v6-20261028/lsremote-merge-read.txt` (01:44:17Z, the read the merges
were taken from).

Every merge commit carries the previous roll commit as its first parent and the
lane tip as its second, verified with `git rev-list --merges --parents` on the
roll tip:

    c3f192464cdd861d1f290b95cf3efef3329a882f 43bbfce28d95e84886abf253f40848f7686e6077 3337b55295dfe500a48d8ac9f4535dd748728831
    43bbfce28d95e84886abf253f40848f7686e6077 dc8ac4f56a052bdb3f472e38b663533b4ff72320 0c49dd074498761a2b6ef8917e024305287cdf1b
    dc8ac4f56a052bdb3f472e38b663533b4ff72320 3566fed9322947b655ff1eb5573a632551b1b5e5 463e39c2ceefc2f81bfd9c4fed48de95f8faae38
    3566fed9322947b655ff1eb5573a632551b1b5e5 6f5983700242bdd130c8328c35c1b56a3bbc1974 9658a462ad1dca1ba7b413aba5d917068bd73131
    6f5983700242bdd130c8328c35c1b56a3bbc1974 eb7361e5426c47a29caf1677fa2638999ee2149e c265530a955b9915a937fa1308532000d8554f27
    eb7361e5426c47a29caf1677fa2638999ee2149e 57e900ccc04436206623cf3ace3f22d49ab17be9 a09850fa240406a8a73288af7649525860d25b31
    57e900ccc04436206623cf3ace3f22d49ab17be9 c52eef961e1833479860cbb91fcd6eed2c7ddad9 927001b1071e6254d7848eda40bcef87fe558d4b
    c52eef961e1833479860cbb91fcd6eed2c7ddad9 3c45a12b76630bdcc1cd748f48a99f2a6cec7b0e 26f4d6a4eccdebcc9994b01ff2924c9b6f6808e2
    3c45a12b76630bdcc1cd748f48a99f2a6cec7b0e 82f15c18ff6f3731d1ec11c626ae43dbd0b91141 71d4f686007e9f26e75cbfe66db964bd2ccc08cd
    82f15c18ff6f3731d1ec11c626ae43dbd0b91141 709deebacfd7a3756aa1eeafbb5f2f91bffd462f 623dfe019db57c7e5996c4b1f347c2533352c377
    709deebacfd7a3756aa1eeafbb5f2f91bffd462f 6bd282bab8014a45d6779229dc61b5f6fd9d7b17 14f36ab09b273ec1a80c4d9b924160e5523c027e
    6bd282bab8014a45d6779229dc61b5f6fd9d7b17 1cea77d7a113c376aa5484e8c4267451588b6e97 836b9b67b62e7224272297b1a4041e4583914370

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
lane's own script for this is `tmp/roll-v6-20261028/merge-lane.mjs`, and for the
merges whose conflicts were decided by hand,
`tmp/roll-v6-20261028/resolve-by-side.mjs` and
`tmp/roll-v6-20261028/resolve-matrix-round12.mjs`.

No branch was rebased and no source branch was rewritten.

## 2. The conflicts, resolved by region

Seven of the twelve merges had conflict regions, in six files. Every region was
decided by reading both sides of the three-way merge and by reading the
auto-merged tree the merge produced. The reason is named in the merge commit
message of every merge that had one, and repeated here.

| merge | file | region | decision | why |
|---|---|---|---|---|
| routes-a12 | src/server/write-routes.ts | the import block above the delayed-job import, one region | ours for the set-membership import, theirs for the home-mark import | The region held two imports on the roll's side and none on the lane's. The set-membership import (rightSetMember, typePlusRightSetMember) is kept because the merged body calls both of them, at the two call sites the round-nine lane's own arm brought through. The home-mark import (homeMarkContent) is dropped because the lane's own change removed every call to it from the body, and the merged body carries that removal cleanly: the A12 fix is exactly that a markless write no longer falls back to the home mark, so the import would be dead. |
| matrix-round12 | reference-harness/browser/probe-pageonly-ranks91-100.mjs | the ACT-185 comment block | ours, plus a paragraph recording the lane's own restatement and the read it added | Ours names the mechanism the kept code implements, the oracle trigger table the file's own key-algebra block indexes, and corrects the earlier wrong attribution to the NOT_OK_FOR_KEY fold. The lane's comment states the same retraction from its own fixture and agrees with it. |
| matrix-round12 | reference-harness/browser/probe-pageonly-ranks91-100.mjs | the ACT-185 measurements | ours, plus the lane's create-form shape read | Ours defines the oracle trigger table, which the non-conflicted key-algebra block between the regions indexes, and reads the deck rows the shouted visit could have written. The lane's read of the new page's slot class and its create form is independent of ours and is kept beside it. |
| matrix-round12 | reference-harness/browser/probe-pageonly-ranks91-100.mjs | the ACT-185 grade | ours, plus the lane's create-form conjunct | The lane's conjunct is strictly stronger than the unknown-name conjunct ours already asserts, because it requires the create form to be really served at the shouted address and not merely an unknown-card page with no card id. The lane's whole-table equality check is NOT taken: it compares the engine's trigger table with a nine-word oracle table, while the merged table is the extended fifteen-word one the roll's own re-grade brought, so that comparison would read false for a reason that is not a defect. Ours' per-word parity assertion over the extended table states the same claim over more words. |
| matrix-round12 | reference-harness/browser/probe-pageonly-ranks91-100.mjs | the ACT-185 payload | ours, plus the lane's shape read and its oracle restatement | The lane's duplicate nine-word oracle table is dropped, because the merged payload already carries the extended table that holds the same values plus six more. |
| capability-round7 | tests/card/actions/write-path-races.test.ts | the swallowProbe guard on driver.transaction | ours | Both sides changed the same lines. Ours is the explicit guard that says in words what the call site would otherwise leave to be inferred, that the shared-driver probe needs a driver with a transaction(), and it narrows the optional method for the compiler without an assertion. The lane's side is the non-null assertion form, which is the older shape the guard replaced. |
| capability-round7 | tools/edge-signed-in-exercise/capabilities.json | the finding text and the declared check list of rows S3, S4, S5, C1 and C2, five regions | the lane's side | The lane's text is the adjudication of those rows (closed on parity, with the pinned Ruby's own bytes captured, the port's own bytes beside them, the row's own gap landed and the measured run at the round's tip), and it supersedes the older finding text the roll still carried. The declared check list of row S3 also keeps the lane's order, which follows Ruby's own refusal order: the blank identifier is refused before the blank password. The grader compares that list as a set, so the order does not change any grade. |
| capability-round7 | tools/edge-signed-in-exercise/lib/capture-feed.d.mts | the whole file | the lane's side | The file was added on both sides of this merge, because the roll carries the first version of it and the lane carries the later fix of the same lineage. The lane's version is the commit that made the type errors that stopped the staging-server dist bootstrap go away, so the merged tree carries the fixed declaration and not the pre-fix one. |
| capability-round7 | tools/edge-signed-in-exercise/lib/local-policy.d.mts | the whole file, three regions | the lane's side | The same lineage and the same reason as the capture-feed declaration. The one TypeScript importer of these two declarations (tests/card/mod-loader/card-mod-templated-card.test.ts) merged without a conflict and keeps the roll's own import of the CapabilityRow type, which both declarations export. |
| capability-round8 | tools/edge-signed-in-exercise/capabilities.json | the finding text of rows F3, N2, N6, N9 and H1, five regions | the lane's side | Both sides start from the same recorded finding. The roll's side carries the sentence that the 2026-10-20 capability-legs battery gave the row its own check, and the lane's side carries the row's own adjudication with the pinned Ruby's own bytes, the port's own bytes beside them and the measured run at this round's tip. The lane's text is the longer one in every one of the five regions and names the check each row now declares, so it is the row's current state. |
| smell-test-round1b | reference-harness/browser/probe-pageonly-ranks91-100.mjs | five regions | ours | The file is the ACT-185 probe, and both sides carry the same re-grade of that leg against the pinned oracle; the roll's side carries it together with the matrix round twelve resolution this roll already merged. The lane's side is the re-grade without that resolution, so in all five regions the lane's side is empty where the roll's side holds the resolution, and the roll's text is kept. Nothing the lane changed in this file is lost: the resolved file differs from the lane's own blob only by the five blocks the matrix round twelve resolution added. |

Two files were not conflict regions, but git merged them into a combination that
does not hold together, and the typecheck said so. Both were taken whole from
the lane, and the reason is named in the merge commit message:

- tests/card/mod-loader/card-mod-editor-link-button.test.ts and
  tests/card/mod-loader/card-mod-editor-nest-image.test.ts. The roll's side
  reads the vendored script as text and digests the text, and the lane's side
  digests the bytes. The merged file kept the roll's read and the lane's
  digest, and the typecheck failed on it (a string where a Uint8Array was
  required). The lane's whole file is taken instead, because the lane's
  version is the later and correct one: the vendored script is compared byte
  for byte with the pinned gem's own file, so its digest has to be taken over
  the bytes themselves.

### One merge commit that was rebuilt before anything was pushed

The capability round seven merge was written twice. The first attempt's tree
was wrong: the lane's own resolver script dropped the text OUTSIDE the conflict
regions, so the resolved files held only the regions and the tree did not
compile (`tsc --noEmit` reported a syntax error in the two files). The commit
was replaced, before any push, by a commit with the same two parents, the same
message and the corrected tree. The resolver was fixed to keep the outside
text and to refuse a resolved file that still carries a conflict marker, and
the corrected tree was re-verified with the typecheck. Nothing was pushed while
the defect was in the tree, and no other merge was affected: the two other
resolvers kept the outside text from the start.

## 3. The two merge defects the gates found, and their repair

The merged tree's correctness battery carried four failures the base tree does
not have. All four were merge defects, and they are repaired in one commit on
this branch (after the twelve merges, before this receipt), whose message
names each one.

**The capability roster file was neither side's file.**
`tools/edge-signed-in-exercise/capabilities.json`: the two capability lanes
branched from the capability round six tip, and the roll's tree carries a LATER
capabilities.json (the 2026-10-20 capability-legs battery added checks to rows
the round six tip predates). Git's three-way merge produced a file that was
neither side's: the roll's extra checks on rows a lane had adjudicated, next
to that lane's own status. Four of the capability round seven lane's own pins
read that file and refused it, because the lane's adjudication declares the
row's check and nothing else. The file is now the roll's file with the rows
each capability lane adjudicated taken from that lane's own file, whole (the
round seven lane's S3, S4, S5, S9, C1 and C2, and the round eight lane's F3,
N2, N5, N6, N9 and H1). The rows each lane changed are read from that lane's
own diff against the tip both lanes branched from, so the list is the lane's
own changes and not a guess.

**Two pins asserted the older text of a change the roll brought in.**
`tests/server/card-format-route.test.ts` asserted that an unknown suffix stays
part of the card name, with a comment that explained that reading of the
pinned Ruby. The routes round nine lane's row D4 landed the general mapping
against the pinned source
(`decko-0.20.0/lib/card_controller/response.rb:102-105`: a requested format
that is NOT in the pinned format registry is the FILE sender), so the pin now
states the landed behaviour and the pinned reason for it.
`tests/card/mod-loader/card-mod-new-card-landing.test.ts` read the typed
shortcut's source line with the decoder the capability round six tip carried
(`markToName`); the roll's tree reads that segment through the port's own safe
decoder (`decodeUriComponentSafe`), which is the newer form and the same
contract, so the pin reads the form the tree carries and says why the two
differ.

Nothing else changed in that repair: no port source, no lane's receipt, no
roster row.

## 4. The bundle

The engine bundle was rebuilt with `node tools/bundle-bunny-edge-engine.mjs`,
exit 0, on the base tree before the first merge and on the merged tree after
the last one.

| artifact | bytes before | bytes after | delta | SHA-256 before | SHA-256 after |
|---|---|---|---|---|---|
| bunny-edge-engine.bundle.js | 7399163 | 7400742 | 1579 | cb6be678e7643861abe7b62ecb9b597ac7b75721473d7020163fc2e4b02547c7 | d5e4f60bccc99d29af43511fb4395532531dc16dff0e5e9a41c6f0657b92cc25 |
| bunny-edge-engine.code.json | 7539081 | 7540686 | 1605 | 4cd35e0816ebba0d7d161cb97b2ebbd71fa75a2b74a40d704efd04adc7645a90 | f0b4d5394611e5120c3cccf1c3c62ee33f6d1a041627160194a7e17a72000585 |
| bunny-edge-read.bundle.js | 2125767 | 2126327 | 560 | 5ffa88c91936089c02c3470728413be380631cd836f2e52ab1a74402d2b57397 | bce209788b9b88475550577e742da44ccd19c6fb13053a83d8f6307631441700 |
| bunny-edge-read.code.json | 2207021 | 2207583 | 562 | eacad4e89533c52f82ca17114a65bf03eda71df4965080694b848545db97d880 | e1a62028a81e44ca83194d3cbd259d2c177155ac406066812c7269e7c489cb91 |

The bundle moved, and the reason is measured, not assumed: this roll carries
real code in `src/`, not only comments. The changed `src/` files are the
save-path lane's read scope (src/card/drivers/bunny-db.ts,
src/server/driver.ts, src/card/one-trip/replay-plan-router.ts), the routes
lane's file mapping and its A12 write arms (src/server/file-routes.ts,
src/server/write-routes.ts), the register-events lane's mod files
(card-mod-script.ts, card-mod-session.ts, card-mod-style.ts) and the
post-save cache expiry, the capability lane's first-run setup
(src/card/auth/first-run-setup.ts) and the fetch cache.

The build warns that the bundle is over 80% of the conservative 7600000-byte
script limit (7400742 bytes is 97.4%). Nothing deploys, so this is a fact for
the record.

`deploy/dist/` is gitignored, so the bundles are build artifacts and do not
appear in the commit. The hashes above are the record, and the raw values are
in the lane's scratch (`tmp/roll-v6-20261028/bundle-before.json` and
`bundle-after.json`).

## 5. The gates

Typecheck, `npx tsc --noEmit`: exit 0, **zero output lines** on the base tree
(`tmp/roll-v6-20261028/tsc-base.txt`) and on the merged tree
(`tmp/roll-v6-20261028/tsc-merged.txt`, taken after the defect repair).

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
(`tmp/roll-v6-20261028/correctness-base.log`):

| | base tree 1cea77d7 |
|---|---|
| gate exit | 1 |
| test files | 2 failed, 681 passed, 54 skipped (737) |
| tests | 2 failed, 7096 passed, 227 skipped (7325) |
| node:test | 3 files, 15 passed, 0 failed |

The two base failures are machine state, not tree state:

| file | what it asserts | why it is red |
|---|---|---|
| tests/hygiene/machine-lane-worktree-disk-hygiene.test.ts | every lane worktree on disk is tracked in IN-FLIGHT.json or in tests/hygiene/keep-worktrees.json, none is under the 1 GB floor, and there are at most 15 | it names a lane worktree as untracked. That is machine state on the disk, not a property of this tree. |
| tests/tools/feedback-duration-probe-scan-root-survives-in-the-port-tree.test.ts | the dead machine pin the scan root used to point at is gone from the disk | it asserts `existsSync(deadPinnedCheckout)` is false and it is true: the pinned checkout is still on the machine. |

The deciding run on the merged tree, after the defect repair
(`tmp/roll-v6-20261028/correctness-merged-final.log`):

| | merged tree |
|---|---|
| gate exit | 1 |
| test files | 1 failed, 692 passed, 54 skipped (747) |
| tests | 1 failed, 7219 passed, 227 skipped (7447) |
| node:test | 3 files, 15 passed, 0 failed |

**No failure is new.** The merged tree's failing set is the base tree's failing
set with one file taken out, and that file is taken out because the tree
changed, not because a failure was hidden:

| file | base tree | merged tree |
|---|---|---|
| tests/hygiene/machine-lane-worktree-disk-hygiene.test.ts | failed | failed, same file, same assertion |
| tests/tools/feedback-duration-probe-scan-root-survives-in-the-port-tree.test.ts | failed | passes |

The second row is the one difference, and it is explained by the tree: the
smell-test round one lane, which this roll merged, replaced that test's
assertion. The old assertion was "the machine pin the scan root names is
absent from the disk", which is machine state and was red because the pinned
checkout had been restored on 2026-10-22. The lane's own assertion is the
property that survives the restore: the measurement reads this tree's own copy
and never the restored checkout. The diff is in the merged tree
(`git diff 1cea77d7 HEAD -- tests/tools/feedback-duration-probe-scan-root-survives-in-the-port-tree.test.ts`).

The merged tree runs 747 test files against the base tree's 737: the ten files
the lanes brought in (the save-path read scope's two pins, the capability round
seven lane's five row pins, and the smell-test lane's three) all pass.

**The two failures the assignment names do not belong to this gate.** The
assignment's named pre-existing set is the MySQL 8.4 group of
`tests/card/actions/atomic-saves.test.ts` and
`tests/deploy/worker-edge-cache-runtime.test.ts`. Both are matched by the
deploy bucket's rule (`/(^|\/)deploy\//` and `atomic-saves`, the `match` in
`tools/test-gates.mjs`), so the correctness gate does not run either file.
Neither appeared in this run for that reason and not because they passed.
Both were run apart from the gate, on the base tree and on the merged tree,
and the two runs are identical:

| file | base tree 1cea77d7 | merged tree |
|---|---|---|
| tests/card/actions/atomic-saves.test.ts | 66 tests: 5 failed (the "atomic saves: MySQL 8.4 (native)" group), 61 passed | 66 tests: 5 failed (the same five names), 61 passed |
| tests/deploy/worker-edge-cache-runtime.test.ts | 1 failed, 3 passed | 1 failed (the same test), 3 passed |
| both files together | 6 failed, 64 passed (70) | 6 failed, 64 passed (70) |

The six failing test names are identical between the two runs
(`tmp/roll-v6-20261028/named-baseline-failures-base.txt` and
`named-baseline-failures-merged.txt` differ by nothing). The named set is
therefore the same set before and after the roll: the six environmental
failures, unchanged.

## 7. The disk cost

Added to the machine: the lane's checkout, 266009625 added bytes of tracked
working tree (the lane-copy admission measured 266009534 tracked bytes plus the
shared install linked through a junction rather than copied), the rebuilt
`deploy/dist/` build output (gitignored), and the lane's gitignored scratch
(`tmp/roll-v6-20261028/`), holding the gate logs, the bundle hash records, the
merge-tree records, the resolved conflict files and the ls-remote capture.

Kept: the lane's checkout, because it holds those records and the fold's own
git reads point at it. Nothing was deleted by hand: no space was freed, no
file was removed, and the delete gate was not routed around.

## 8. What this lane did not do

- Nothing deployed. No URL was fetched, so no URL is reported working.
- Nothing was written to the live D1.
- The other candidate branches on origin were not moved. The roll pushed one
  branch: `deploy/full-candidate-20261028`.
- No source branch was rebased, and no tip was moved.

## 9. What was left out, and why

Ten pushed port tips are not ancestors of the roll and were not merged. They
are the 2026-10-19 to 2026-10-23 conversion batch's lanes, not this batch's
family lanes, and no roll in this line (v13 through v17) merged them either.

| lane | tip | what it carries |
|---|---|---|
| port/dsl-tranche2-20261020 | c8eb84a01 | the dsl C7 format-suffix dispatch boundary |
| port/register-dsl-convert-20261022 | 2039b470c | the register dsl conversion rows |
| port/dsl-convert-r2-20261022 | 3300c995c | the round-two dsl conversion rows, carrying the register dsl lane as an ancestor |
| port/register-mods-convert-20261022 | 45755e7dd | the register mods conversion rows |
| port/mods-convert-r2-20261022 | 2d55d6dad | the round-two mods conversion rows, carrying the register mods lane as an ancestor |
| port/register-starcards-convert-20261022 | 54bef7049 | the templated card row's own probe receipt |
| port/register-treewalk-convert-20261022 | 0fb79aae1 | the register treewalk conversion rows, carried in this tree as an ancestor of the merged register-treewalk round one lane tip |
| port/remaining-convert-r2-20261022 | ae5219fd7 | the redteam A2 Cardio application layer row |
| port/smell-test-convert-20261022 | e0057de58 | the smell-test conversion rows, carried in this tree as an ancestor of the merged smell-test round one lane tip |
| port/smell-convert-r2-20261022 | 4367ea9d8 | the round-two smell-test conversion rows, carried in this tree as an ancestor of the merged smell-test round one lane tip |

Four of the ten are already in the tree, because the round lanes that this roll
merged carry them as ancestors (the register-treewalk lane and the two
smell-test lanes). The six that are not in the tree are named here so the next
reader can see they were considered and not forgotten. Their rows stay open in
the completeness roster, and no row of theirs was promoted by the fold that
follows this roll.
