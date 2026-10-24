# Full candidate v13: the ten-lane roll, 2026-10-23

The wave's assignment: roll ten frozen lane tips into the full integration
candidate, verify every tip, merge them one merge commit each in the named
order, resolve the conflicts by region, rebuild the engine bundle and record
SHA-256 and bytes before and after, gate (typecheck plus the correctness
battery), and push. Nothing deploys.

The lane's exclusive checkout is
`C:/localProjects/decko-ts-candidate-roll-20261023`, a linked worktree of
`C:/localProjects/decko-ts-release-lead` with the shared install linked
through a junction. The branch is `deploy/full-candidate-20261023`.

The previous attempt at this roll is blocked on the disk admission gate and
is recorded at
`C:/localProjects/brandonDojoTech/tmp/candidate-roll-blocked-on-disk-20261023/wave-six-roll-verified-merge-set-and-disk-blocker-2026-10-23.md`.
Its verified merge set, its confirmed candidate tip and its resume procedure
were re-checked here rather than taken on trust.

## 1. The gate that blocked the previous roll is dead

The blocked roll's blocker was the diskSteward's worktree admission refusal:
`agent/create_worktree.py` refused any checkout while C: held less than
40 GiB free. The operator retired that threshold on 2026-10-23. The commit
is in the diskSteward's own history:

    git -C C:/localProjects/diskSteward show 589f631
    Remove the disk red-line admission refusal from worktree creation
    Operator order 2026-10-23: the 40 GiB free-space admission threshold is
    banned permanently. Worktree admission proceeds at any free-space level;
    capacity() remains as reporting only.

`capacity()` now reports the free bytes and takes no verdict. The checkout
was then made through the sanctioned lane-copy path, not by a clone and not by
a raw worktree add:

    node C:/localProjects/juc-relay/fleet/lane-copy.mjs \
      --repo C:/localProjects/decko-ts-release-lead \
      --path C:/localProjects/decko-ts-candidate-roll-20261023 \
      --branch deploy/full-candidate-20261023 --base e8b70ad3 \
      --shared-modules C:/localProjects/decko-ts-full-candidate-20261020/node_modules \
      --owner candidate-roll-20261023 --purpose "..."
    outcome: created, lease 425ca4557f81, trackedBytes 261835031,
    addedBytes 261835122, budgetBytes 314572800,
    nodeModules: junction -> C:\localProjects\decko-ts-full-candidate-20261020\node_modules

The shared install's `package-lock.json` hashes to `96a3efb6...`, the same
hash the candidate tree's own lockfile has at the base commit, so the lane
shares the install the tree names.

The lane's worktree held a clean tree at wave start: `git status --porcelain
--untracked-files=all` returned nothing.

## 2. The merge set, verified twice, and the base

The base is `e8b70ad3aa85c75f9247d2cd1af747e4bf740505`, the tip of both
`deploy/full-candidate-20261020` and `deploy/full-candidate-20261021-v11`
on origin. It is the tip the blocked roll recorded as the newest candidate,
re-verified here with `git ls-remote origin` and then locally.

Every one of the ten tips was verified against the hash the assignment
names, on origin and in the local object store, before any merge:

| # | branch | tip | merge commit | conflicts |
|---|---|---|---|---|
| 1 | port/routes-round3-20261023 | 7bb793cc123137f90376c6d537bcb2b20ee9ce73 | 73555526 | none |
| 2 | port/routes-round4-20261023 | 3f719bc736cbc2a30f999aee3b343a558fd9ff48 | b270eeef | none |
| 3 | port/matrix-round3-20261023 | aec27ad4de6c094165d7e8dfa6490daf424807a1 | f918e279 | 2 files, 3 regions |
| 4 | port/matrix-round4-20261023 | 95bc1700bc87cba5acee6b9006e960fbacfbb95b | 4dfbf011 | none |
| 5 | port/capability-round3-20261023 | e852386fb52a1c3538071e4164c463635c27b916 | 02f4be19 | 5 files, 17 regions |
| 6 | port/savepath-round3-20261023 | ea711f2b8c680ed030895df489f9c7304e9961a1 | 5284a87c | 3 files, 3 regions |
| 7 | journeys/regrade-20261023 | e1992b80ece3109965749778fc37b3c0fc92c29f | 8e554857 | none |
| 8 | port/capability-round4-20261023 | 0aecb56b9c44fa1868259eba82c6c35a240eb984 | 794070ef | none |
| 9 | port/savepath-round4-20261023 | c98822033fa92d39c9a6d7cf16f8790bceb4ec6c | cbb058de | none |
| 10 | port/register-events-round1-20261023 | 49371cf6da095e07e36091c2bc1fa0dde37348cf | 8da7efa1 | none |

The last three are the tips that landed after the blocked roll's receipt was
written. All three were present on origin at the hashes the assignment
names, so they were merged.

No tip was contained in the base: `git merge-base --is-ancestor <tip>
e8b70ad3` is false for all ten. After the roll all ten verify as ancestors
of the roll HEAD, and the base does too.

Every merge commit carries the branch tip as its second parent, verified
with `git rev-list --parents -n 1 <commit>`. The total is 397 files
changed, 53192 insertions, 969 deletions, 252 commits.

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

Every conflict region was decided by reading both sides, and the decision is
named per region below. No branch was rebased and no source branch was
rewritten.

## 4. The conflicts, resolved by region

### Merge 3, matrix round three: 2 files, 3 regions, all unions

| file | region | decision | why |
|---|---|---|---|
| tools/edge-signed-in-exercise.mjs | imports | union | ours adds `browserAssetCancellations` to the harness-browser import, theirs adds `contentionDecidedRows`, `contentionMs`, `ownWorkMs`, `serverTotalMs`, `serverDbMs` to the server-time-budget import and the whole sign-in-surfaces import. The merged tree's own modules export every one of those names, and the merged body uses them. |
| tools/edge-signed-in-exercise.mjs | the asset-audit record | union | ours adds `navigationCancellations: browserAssetCancellations(allBrowsers)` to the record's evidence, theirs adds `provenance.thirdPartyAssets = browser.thirdPartyAssets?.stats() ?? null` after it. `browser` is a module-level binding in the merged file and `launchHarnessBrowser` returns `thirdPartyAssets`, so both facts hold at once. |
| tools/edge-signed-in-exercise/checks-cover-b.mjs | imports | union | the merged body calls `chosenFileChip` (theirs' import), `imageCoreShows` and the rich-text-toolbar contract (ours'), so both import lists are needed. |

### Merge 5, capability round three: 5 files, 17 regions

This merge carried the conflict that needed the most reading.

**The whole-file conflict was a line-ending difference, not a content
difference.** The capability branch's `checks-cover-b.mjs` carries CRLF line
endings while the candidate line and the repository carry LF. Git compared
the two files as wholly different, so one conflict region spanned the whole
file (1861 lines on their side against 1710 on ours). The same branch's
`checks-catalog-edit-create.mjs`, `lib/file-download-view.mjs` and
`test/file-download-view.test.mjs` carry CRLF too, but those are either
new files or files whose conflict regions are content, so only the cover-B
file was affected this way.

The cover-B file was therefore merged with their side normalised to LF first,
which turned the whole-file conflict into two ordinary regions, and the two
were resolved as unions: the evidence object carries both the chip document
names, the record's condition is theirs' (their leg drives the upload round
trip through the server, so it does not require the browser's own round
trip), and the record's evidence carries both sides' facts.

| file | region | decision | why |
|---|---|---|---|
| src/card/render/page.ts | imports | union | ours imports the material-icons helper, theirs imports the two rendering-error helpers. The merged tree's `format.ts` exports both and the merged body calls all of them. |
| checks-catalog-edit-create.mjs | the ctx handles | theirs | both sides bind the same four handles out of `ctx`. Theirs' order (`page, database, record, visit`) is the order every other leg in that file uses, and their comment carries the newer measurement. |
| checks-cover-b.mjs | the F1 evidence key | union | the two lanes named the round trip's chip document independently (`previewHtml` and `chipHtml`), and the merged body uses both names. |
| checks-cover-b.mjs | the F1 record | union | theirs' condition (their leg performs the round trip itself) plus both sides' evidence fields. |
| lib/file-download-view.mjs | `chosenFileChip` | ours | ours' matcher reads the class attribute as a token list and both quote styles, which is the more capable of the two and reads both sides' fixtures. |
| lib/file-download-view.mjs | the chooser's carriers | theirs | theirs factors the carrier read into the exported `attachmentCardNameField` helper, which the merged tree already carries, and adds the `attachmentCardNameHasNoValue` distinction. |
| lib/file-download-view.mjs | the chooser's return | theirs | it is the other half of the same decision. |
| lib/file-download-view.mjs | the evidence contract | union | both names are documented and both are read, so either evidence object grades the same way. |
| lib/file-download-view.mjs | the chip read | union | `evidence.chipHtml ?? evidence.previewHtml`, so the chip is graded out of whichever name the caller supplied. |
| test/file-download-view.test.mjs | 9 regions | ours for the fixture, theirs for the eight evidence objects | theirs' block was written for a different slot and could not be lifted verbatim; ours' fixture is the one the merged body calls with no argument. Theirs' `rubyChipBytes` helper was added beside it so both lanes' fixtures are exercised. |

### Merge 6, save path round three: 3 files, 3 regions

| file | region | decision | why |
|---|---|---|---|
| src/card/actions/refresh-references-out.ts | the query walk | union | ours' `scanQueryReferenceChunks` and theirs' sticky-regex scan are the same walk, and theirs' `declareReferenceNames` call is the row's own contribution (the names are declared at the seam). The resolution uses ours' scanner and theirs' declaration. |
| src/card/fetch/lexicon.ts | the id read | union | ours' prefetched-rows short-circuit plus theirs' named SQL constant, which is byte-identical to the inline statement ours' side carried. |
| src/server/write-routes.ts | the set membership | ours' logic, theirs' named SQL | theirs' commit touched this file in exactly two places: it added the `CARD_CODENAME_BY_KEY_SQL` import and swapped the inline statement for the named constant. Its ten-line set-membership block is the base's, and ours' fifty-one-line block is the routes family's later port of the set patterns. Ours' logic with theirs' constant keeps both. |

### The one auto-merge defect, and what it was

The auto-merge produced an inconsistency no implementation can satisfy. The
matrix lane's commit 6ad66b6d made `followLinkShape` return the DOM's
unescaped href in `href` and the page's serialized form in `hrefRaw`. The
capability lane's commit fb61f1db made the same function keep the
serialized form in `href`. The auto-merged test file carried both sides'
assertions: ours' says `shape.href` carries no HTML entity, theirs' says
`shape.href` carries `&amp;`. One field cannot be both.

The merged tree keeps ours' contract, because it is a superset: it exposes
both forms, and the merged caller reads the DOM's href through
`page.evaluate` rather than out of the shape, which both sides' tests
assert. Theirs' assertion was changed by one token, from `shape.href` to
`shape.hrefRaw`, which is the field that carries the serialized form, so the
assertion's intent is preserved exactly. Measured before the change, the
harness suite carried one new failure; measured after, the failure set is
the pre-merge one.

## 5. The two defects the gates found, and their fixes

### The capability branch's three new test files carried seven type errors

The capability round-three branch added three test files the base did not
have, and they did not typecheck. Two of them read a vendored script with
no encoding and handed the Buffer to a helper typed for a string. The third
imported two untyped `.mjs` modules from a TypeScript test, so the roster it
read was an implicit `any` and the grader's callback parameters were
implicit `any` too.

The fix follows the repo's own conventions. The two script reads take the
`"utf8"` encoding the sibling pin already takes; both files are clean UTF-8
with no BOM, verified by a byte round-trip comparison. The two modules gain
the sibling `.d.mts` declaration files the repo already uses for `.mjs`
modules imported from TypeScript (`tests/support/scratch-dir.d.mts` is the
model), and the roster parse is typed with the grader's own `CapabilityRow`.

Commit `e724616e`. Measured: `npx tsc --noEmit` exits 0 with zero output
lines, the base's baseline, against 7 error lines before. The three files
pass, 3 files and 35 tests.

### The capability round-four pin named a superseded source line

The capability round-four branch added a pin that the port's write route
carries the typed shortcut, and it pinned the exact source line as the
capability family's trunk carried it: the typed segment run through
`markToName`. The candidate line has measured that form and superseded it.
Row A13 (commit 41586bb3) found that `markToName`'s `.json` strip belongs to
the `:mark(.:format)` routes, so a POST `/type/Foo.json` named a type `Foo`
where the pinned deck names a type `Foo.json`, and the branch now carries the
decoded segment verbatim. The merged tree carries the candidate's form, and
the pin was changed to read it.

The pin's point, which is that the typed branch exists and carries the typed
segment, is unchanged. Commit `b62c0c8b`. Measured: the file passes, 11
tests.

## 6. The bundle

The engine bundle was rebuilt with `node tools/bundle-bunny-edge-engine.mjs`,
exit 0, on the base tree before the first merge and on the merged tree after
the last one.

| artifact | bytes before | bytes after | delta |
|---|---|---|---|
| bunny-edge-engine.bundle.js | 7365497 | 7375650 | +10153 |
| bunny-edge-engine.code.json | 7504685 | 7515076 | +10391 |
| bunny-edge-read.bundle.js | 2110088 | 2117385 | +7297 |
| bunny-edge-read.code.json | 2190944 | 2198459 | +7515 |

| artifact | SHA-256 before | SHA-256 after |
|---|---|---|
| bunny-edge-engine.bundle.js | 536ba2ef1793c41b8d607ffb57d588772bc7ee001b4d6857bbf5a330c17d81e9 | f7319fc57561e1e1cbe43222b0f0a975a8cc88bd32652c285ecf8204c838388c |
| bunny-edge-engine.code.json | 1deecae0f1b3c2077a668d00a4dd444aad4b4fc75a5358bd3c8a697d6bd79fd3 | 409a53010b77fa228dff4e51e47b0edba455e8f51a6d1fa7d8e8985dfd4a430c |
| bunny-edge-read.bundle.js | 36210d6b060a935d30a4fc54c73aa7868c4f574f84e83cf33c5edb91b4ce30db | e3fae30b6f86905d403a978390d8ef8fa9912fbf309adb6f93bd6f1b9538045e |
| bunny-edge-read.code.json | f5ddc99d434b2efff75411edeb310c02d72320987bc09773d502bad1d6b3110a | 581e2cce513e8e2aa4996f69c350ea8868ecf26be7e2970aacb730dfa5c69c5e |

The before values are byte-identical to the values the v12 roll recorded for
the same base tree, so the "before" is the real v12 artifact and not a
rebuild that drifted. The build was repeated on the final tree, after the
two fix commits, and came out identical to the after values above, which
makes the build reproducible rather than merely recorded.

The build warns that the bundle is over 80% of the conservative
7600000-byte script limit (7375650 bytes is 97.0%). Nothing deploys, so
this is a fact for the record.

`deploy/dist/` is gitignored, so the bundles are build artifacts and do not
appear in the commit. The hashes above are the record.

## 7. The gates

Typecheck, `npx tsc --noEmit`: exit 0, **zero output lines**
(`tmp/tsc-after-fix2.txt`). The base's baseline is zero lines, so this
matches. Seven error lines before the type fix, zero after.

Correctness, `node tools/test-gates.mjs run correctness`: see section 8.

## 8. The failure set, and what it is compared against

Correctness, `node tools/test-gates.mjs run correctness`, on the tree that
was pushed, after both fix commits (`tmp/correctness-roll-20261023-final.log`):

| | measured |
|---|---|
| gate exit | 1 |
| test files | 2 failed, 651 passed, 54 skipped (707) |
| tests | 2 failed, 6878 passed, 227 skipped (7107) |
| node:test | 3 files, 15 passed, 0 failed |
| duration | 380.93s |

The failure set is two files:

| file | what it asserts | why it is red |
|---|---|---|
| tests/hygiene/machine-lane-worktree-disk-hygiene.test.ts | every lane worktree on disk is tracked in IN-FLIGHT.json or in tests/hygiene/keep-worktrees.json, none is under the 1 GB floor, and there are at most 15 | it names `decko-ts-lane-archives` as untracked. That is machine state on the disk, not a property of this tree, and the worktree is not this lane's. |
| tests/tools/feedback-duration-probe-scan-root-survives-in-the-port-tree.test.ts | the dead machine pin the scan root used to point at is gone from the disk | it asserts `existsSync(deadPinnedCheckout)` is false and it is true: the pinned checkout is still on the machine. Machine state again. |

**Both are pre-existing, and that was measured rather than argued.** The
same two files were run against the base tree itself, materialised from
`e8b70ad3` into `tmp/base-verify`, and both fail there with the same
messages: 2 files failed, 2 tests failed, 2 passed. The merge therefore
introduced no failure into the gate, and the failure set equals the base
tree's failure set.

**The two failures the receipts name do not belong to this gate.** The
assignment's named pre-existing set is the MySQL 8.4 group of
`tests/card/actions/atomic-saves.test.ts` and
`tests/deploy/worker-edge-cache-runtime.test.ts`. Both are matched by the
deploy bucket's rule, `/(^|\/)deploy\//` and `atomic-saves`
(`tools/test-gates.mjs`, the deploy bucket's `match`), so the correctness
gate does not run either file. Neither appeared in this run for that reason
and not because they passed. The named set is therefore empty for this gate,
and the measured set is the base tree's.

**The first run carried one failure more, and it was the merge's.** Run 1 on
the tree before the pin fix (`tmp/correctness-roll-20261023.log`) exited 1
with 3 files failed and 650 passed, 54 skipped (707), and 3 tests failed and
6877 passed, 227 skipped (7107), duration 493.07s. The third was
`tests/card/mod-loader/card-mod-edit-type-for-new-card.test.ts`, the
capability round-four pin described in section 5. It was fixed, and the run
above is the deciding one on the tree that was pushed.

The skip count is unchanged at 227 and the node:test arm is unchanged at 15
passed and 0 failed.

## 9. The disk cost

Added to the machine: the lane's checkout, 324 MB, which the lane-copy
admission measured as 261835122 bytes of tracked working tree plus the
shared install linked through a junction rather than copied.

Added and then removed by this lane: four working trees materialised from
git trees to verify the merges against the real suites, 9.7 GB in total
(`tmp/m5/tree` 262814884 bytes, `tmp/m5/basetree` 3149578547 bytes,
`tmp/m6/tree` 3160151229 bytes, `tmp/m6/tree2` 3160188490 bytes), plus
`tmp/m5/verify` at 22704311 bytes. All five were staged for deletion with
the diskSteward's own tool, which moved them to
`C:\diskSteward-staging\20261024\`. They are not yet off C: because the
reaper is parked behind the operator's DELETE-KILL-SWITCH, and the lane did
not touch that switch.

Kept: the lane's gitignored scratch, 6 MB, holding the resolution records
(the per-region decisions, the resolved files, the gate logs) and the bundle
hash records. The lane's checkout is the residue this roll leaves behind.

## 10. What this lane did not do

- Nothing deployed. No URL was fetched, so no URL is reported working; the
  verification rule requires this lane's own signed-out fetch of the exact
  URL in this session, and this session made none. The metered-host law was
  not engaged because nothing was verified against the live host.
- Nothing was written to the live D1.
- The other candidate branches on origin were not moved. The roll pushed one
  branch: `deploy/full-candidate-20261023`.
- No source branch was rebased, and no tip was moved.
- No wave-five or wave-six surface was touched: the routes round five and
  matrix round five clones and the Ethan report were left alone, and the
  merge set was read from the object store, not from their checkouts.
- The DELETE-KILL-SWITCH was not touched, and no space was freed by hand.
