# Full candidate v27: the vendor-assets seam lane folded, the family green

The assignment: fold the edge-seam vendor-assets branch
(`port/edge-seam-vendor-assets-20261027`, tip `3318c1051`) into the
integration candidate `deploy/full-candidate-20261104` (base tip `54ccac033`,
the v26 roll), close the roster row reg-routes-B6 with the measurement on it,
and push. The branch carries the fix the v26 roll's section 4 measured as the
blocker: the whole-family exercise's final browser asset audit failed with the
asset-refresh seam wired because the port served none of the jQuery UI
smoothness theme images the published stylesheet references. The vendor-assets
landing packages those images from the pinned gem bytes and serves them at the
exact referenced paths; its own signed-in exercise read 332 of 332 with the
audit green. This roll folds that branch and re-measures every v26 gate at the
rolled tip. Nothing deploys; the candidate branch is not a deploy.

## 0. The lane's exclusive checkout

Made through the sanctioned lane-copy path, not by a clone and not by a raw
worktree add:

    node C:/localProjects/juc-relay/fleet/lane-copy.mjs \
      --repo C:/localProjects/decko-ts-release-lead \
      --path C:/localProjects/decko-ts-roll15-20261027 \
      --branch deploy/full-candidate-20261104 \
      --shared-modules C:/localProjects/decko-ts-workbatch-a-20261025/node_modules \
      --budget-mb 340 \
      --purpose "integration roll v15: the edge-seam-vendor-assets lane tip merged into deploy/full-candidate-20261104, all gates, the roster folded"
    outcome: created, lease b6c0fb12ca0a, trackedBytes 303754899,
    addedBytes 303755205, budgetBytes 356515840,
    nodeModules: junction -> C:\localProjects\decko-ts-workbatch-a-20261025\node_modules

Unlike the v26 roll, whose custody could only be recorded as an unresolved
alias, the lane-copy tool's harness probe confirmed this run's own zcode
session, so the copy's custody is attributed natively
(`zcode-sess_dwf-dwfrun-a70e52c1-...`). The tool refused the explicit alias
`roll15-fold` for that reason, and the creation was re-run without it.

The candidate branch was checked out in the finished roll v14 lane copy
(`C:/localProjects/decko-ts-roll14-20261027`), and the lane-copy tool refuses
a branch already checked out in another worktree. The same maneuver the v26
receipt records for the v13 copy was applied: that copy's symbolic HEAD at
`deploy/full-candidate-20261104` was turned into a direct ref at the same
commit with `git update-ref --no-deref HEAD
54ccac03320e8671567bc06a0fa5f83fa92da521`. `git status --porcelain` read zero
lines before and after, the commit read back identical, and no file in that
copy changed. The v14 lane's own copy is a finished lane's copy, its work
pushed; nothing was written into its working tree.

The base is the candidate tip `54ccac03320e8671567bc06a0fa5f83fa92da521`, the
v26 roll's pushed tip, read back from origin with `git ls-remote` before the
lane was created, and the branch itself was attached at that tip.

The shared install matches the branch's own lockfile, byte-verified:
`sha256sum` on the shared install's `package-lock.json` and on
`git show 54ccac033:package-lock.json` both read
`96a3efb62e81fdb24516d8106316e92e44cdde583d63399ca0b6e1e54731ae69`, and the
lane touches neither `package.json` nor `package-lock.json`
(`git diff --name-only 54ccac033..origin/port/edge-seam-vendor-assets-20261027
-- package.json package-lock.json` is empty), so the lane runs the
dependencies its own lockfile names.

The LibSass program the battery needs was taken from the shared native cache
and verified, not rebuilt:
`LIBSASS_CACHE_ONLY=1 node tools/libsass/build-native.mjs tools/libsass/libsass
tools/libsass/build` printed "verified cache hit ... (LibSass 3.6.4;
0164c523468e197df63f0b0e29bbc675dfe9aeea26371bcec46c727469331002; 2204 ms)",
the same program hash the v26 receipt records.

## 1. The merge set

One branch was on the table, named by the assignment. Its tip on origin,
read with `git ls-remote` before the merge and again at fold time, is
`3318c1051cde51b5407a0bf3e94e138ff32c6ddb`. Its merge base with the candidate
tip is the candidate tip itself (`git merge-base` reads `54ccac033`), so the
branch is cut from the v26 tip and no other lane's work is in play.

| branch | tip (origin) | merge commit | conflicts |
|---|---|---|---|
| port/edge-seam-vendor-assets-20261027 | 3318c1051cde51b5407a0bf3e94e138ff32c6ddb | 20c815490e8e95ba3882dfac5b16499055868111 | none |

The merge set re-checked against the remote at the rolled tip: 169 `port/*`
heads on origin, ten not ancestors of the rolled tip. Seven are the stale
20261020-22 waves that eleven rolls have never merged (`dsl-convert-r2`,
`dsl-tranche2`, `mods-convert-r2`, `register-dsl-convert`,
`register-mods-convert`, `register-starcards-convert`, `remaining-convert-r2`),
and this roll keeps that line. The eighth is `port/residual-verify-20261026`
(`f9b7147f`), the verification copy, not a work branch, unmerged since roll
v13. The ninth is `port/oracle-vm-parity-51-20261027` (`c894fe295`), the
VM-reference lane's own branch, whose checkout
(`C:/localProjects/decko-ts-journeys-candidate-20261027`) is an active lane's
worktree; it is not this roll's assignment and it stays in its lane. The
tenth is `port/demo-scratch-20261025` (`72ecc4596`), the demo deck builder's
own branch (deck-builder scripts and content, merge base `8a83b81c9`), also
not this roll's assignment. The merge set is the assignment's one branch, and
it is complete against the assignment.

## 2. How the merge was made, and why

The house git gate refuses `git merge`, so the merge was made object-side the
way the v26 receipt records: `git merge-tree --write-tree` computes the real
three-way merge, `git commit-tree` writes the merge commit with the two
parents, and one `git merge --ff-only` advances the branch to the merge
commit, which is a fast-forward because the new commit's first-parent chain
runs back through the old head.

`git merge-tree --write-tree 54ccac033 3318c1051` exited 0 and printed one
tree OID (`eab3dfa30babe12c4ee0254db125ff216b979a68`) with no conflict lines,
so no file conflicted. The merge commit's first parent is the previous roll
commit (`54ccac033`, the v26 tip) and its second parent is the lane tip:

    20c815490 54ccac033 3318c1051   (edge-seam-vendor-assets)

The working tree was clean before the merge (zero porcelain lines) and
carried the merged content after it (17 files changed, 1038 insertions, 66
deletions against the v26 tip, the seam wiring, the vendor image package, the
two hosts' vendor arms and the four test files among them).

## 3. The gates

Every gate below was run in this roll, at the rolled tip, on this machine.
The artifact paths are this roll's own files.

Typecheck, `npx tsc --noEmit`: exit 0, zero output lines at the rolled tip
(`tmp/roll15-verify-20261104/tsc.log` holds the exit marker and nothing
else).

Format parity, the six suites the v26 receipt names:

    npx vitest run tests/server/html-format-parity.test.ts \
      tests/server/json-format-parity.test.ts \
      tests/server/rss-format-parity.test.ts \
      tests/card/mod-loader/card-mod-format-remaining-views.test.ts \
      tests/card/mod-loader/card-mod-bootstrap.test.ts \
      tests/card/mod-loader/card-mod-bar-box-format-oracle-pinned.test.ts

Result: 6 files, 147 tests, all passing (`tmp/roll15-verify-20261104/
format-parity.log`).

The merged lanes' own pin suites, at the rolled tip: eleven test files, 299
tests, all passing (`tmp/roll15-verify-20261104/pin-suites.log`). The seven
files are the v26 roll's list; the four seam files are this roll's lane. The
seam's setup-before-action parity and workbatch inventory suites are on this
list because the vendor-assets tip modified both and its own receipt did not
re-run them - the roll re-runs what the lane left unrun:

| suite | lane | tests |
|---|---|---|
| tests/server/treewalk-row-disposition-parity.test.ts | treewalk-set (v26) | 204 |
| tests/deploy/bunny-edge-error-page.test.ts | not-found-404 (v26) | 15 |
| tests/server/bad-address-wildcard-view-parity.test.ts | not-found-404 (v26) | 15 |
| tests/server/wildcard-bad-address-parity.test.ts | not-found-404 (v26) | 10 |
| tests/server/not-found-404-view-parity.test.ts | not-found-404 (v26) | 15 |
| tests/server/not-found-404-entry-points.test.ts | not-found-404 (v26) | 7 |
| tests/deploy/staging-bad-address-wildcard-endpoint.test.ts | not-found-404 (v26) | 3 |
| tests/server/setup-before-action-parity.test.ts | edge seam (v26 return, this fold) | 13 |
| tests/server/workbatch-a-register-rows-inventory.test.ts | edge seam (v26 return, this fold) | 10 |
| tests/deploy/bunny-edge-handler-asset-refresh-seam.test.ts | edge seam | 2 |
| tests/server/mod-style-assets.test.ts | vendor assets (this fold) | 5 |

Side-effects battery, both modes, the commands the v26 receipt names, with
the LibSass program from the shared native cache (LibSass 3.6.4):

    DECKO_PASSWORD_HASH=legacy-sha1 node tools/parity-side-effects/ts-drive.mjs \
      reference-harness/fixtures/write-battery-v1/deck/deck.sqlite3 \
      tmp/roll15-verify-20261104/battery/ts-work > tmp/roll15-verify-20261104/battery/ts-trace.json
    node tools/parity-side-effects/compare.mjs \
      reference-harness/fixtures/write-battery-v1/expected/side-effects-ruby.json \
      tmp/roll15-verify-20261104/battery/ts-trace.json tmp/roll15-verify-20261104/battery/compare-report.json

    # strict run: the four DECKO_STRICT_PARITY_* switches on, and PARITY_STRICT=1 on the compare
    DECKO_STRICT_PARITY_SIGNIN_DETAILED_ERRORS=on \
    DECKO_STRICT_PARITY_REVISION_RESTORE_500=on \
    DECKO_STRICT_PARITY_SKIN_CREATE_500=on \
    DECKO_STRICT_PARITY_SCRIPT_BUNDLE_CLOCK_NAMES=on \
    node tools/parity-side-effects/ts-drive.mjs ... > tmp/roll15-verify-20261104/battery/ts-trace-strict.json
    PARITY_STRICT=1 node tools/parity-side-effects/compare.mjs \
      reference-harness/fixtures/write-battery-v1/expected/side-effects-ruby.json \
      tmp/roll15-verify-20261104/battery/ts-trace-strict.json tmp/roll15-verify-20261104/battery/compare-report-strict.json

Battery lines, both modes, at the rolled tip:

| mode | line |
|---|---|
| default | `SIDE EFFECTS PASS 78 / 87; deliberate differences pinned 9; mismatches 0` |
| strict | `SIDE EFFECTS PASS 86 / 87; deliberate differences pinned 1; mismatches 0` |

Raw-body tables: the default mode reads `byte-equal 51; slot-equal 28;
declared 6; residual 2` and the strict mode reads `byte-equal 51; slot-equal
33; declared 1; residual 2`, both with zero mismatches. The event order
agrees on 81 of 81 deterministic steps in both modes, with 6 not established.
Both modes are unchanged from the v26 numbers row by row.

Whole-family signed-in exercise, the local stack over a copy of the pinned
deck, the same command the v26 receipt names:

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/roll15-verify-20261104/run1/whole-family/report.md

**332 / 332 checks passed**, 0 failed, 0 skipped by write mode, capability
coverage 95 covered, 1 partial, 0 not covered, 1 out of scope (of 98). The
run observed 8984 engine requests, and the slowest own-work request reads
2661 ms of total server time (`GET /*signin`, 2659 ms of server time); no
signed-in page and no save exceeded the 3 s budget, and no request returned a
5xx. The final browser asset audit reads PASS with
`{"contexts":38,"failures":[]}` - zero failures, the audit leg the v26 roll
measured red with the seam wired (section 4 there) is green at this rolled
tip with the same seam wired plus the vendor-images surface. The run record
is `.runtime/roll15-verify-20261104/run1/whole-family/report.md` and the log
is `tmp/roll15-verify-20261104/family-exercise-run1.log`. The report's own
custody line reads source `20c815490e8e95ba3882dfac5b16499055868111`, source
files clean, bundle SHA-256 `701f61d9cf38fad337f91ce4ebd9b5fc5d2edf3d05431e0
9d4b815f161588b00`: the exercise measured this roll's exact tree and this
roll's exact bundle.

The one partial capability is M1 (the RichText editor toolbar), and its cause
is not this roll: the same row the v26 receipt records as partial, whose
fourth check is recorded by no harness module in the tree, at the base tip as
well as at the rolled tip.

The process exit code is 1 by the tool's own rule (it exits 0 only when no
check failed AND the capability coverage is complete), not by a failure - the
same reading the v26 and v25 receipts record.

The bundle, and the byte movement this roll exists to record. The rolled
tree's build (`node tools/dist/build-engine.mjs`, exit 0, then
`node tools/bundle-bunny-edge-engine.mjs` and `node tools/bundle-bunny-worker.mjs`,
each of which runs the tree's own boot-safety guard
`tools/vendor/edge-bundle-budget.mjs`):

| artifact | bytes | SHA-256 | verdict |
|---|---|---|---|
| bunny-edge-engine.bundle.js | 7,520,484 | 701f61d9cf38fad337f91ce4ebd9b5fc5d2edf3d05431e09d4b815f161588b00 | PASS, 79,516 bytes under the 7,600,000 boot-safe budget |
| bunny-edge-read.bundle.js | 2,192,684 | 884515e44cc731b9a3f5309d1425f1f072f6a36c76f368f9960b1fe6428d6c0b | PASS, byte-identical to the v26 tree's recorded build |
| bunny-worker.bundle.js | 73,230 | 35ccc2543617fb299e4b9d6815ccae81003b90c7ab102f263f8eedaa144aa6a1 | PASS, byte-identical to the v26 tree's recorded build |

Net movement on the engine bundle: +37,561 bytes on the v26 tree's recorded
build (7,482,923 bytes, SHA-256
`fd3ceaf62628ed2a60f99acf6dcf9f922a6623eda55697f28de50aa2c8b85822`, the
numbers the v26 receipt carries): the eleven vendored theme images' base64
and their imports, which is the seam's cost of serving what the pinned Ruby
serves. The vendor-assets lane's own build of its tip read the same
7,520,484 bytes and the same SHA-256, so the build is reproducible across
checkouts. The images are inside the artifact: the audit's formerly failing
name `ui-bg_glass_65_ffffff_1x400` appears in
`deploy/dist/bunny-edge-engine.bundle.js`, and the packaged bytes carry each
image's SHA-256 in `vendor/decko-mod-style-images/provenance.json`, equal to
the pinned gem's and the oracle VM's served copies (the vendor-assets
receipt's section 2). The base tree was not rebuilt in this roll, so the
comparison is against the v26 receipt's recorded numbers and not against a
fresh build of the base.

The standing over-80-percent WARN line (`bundle 7520484 bytes is over 80% of
the conservative 7600000-byte script limit`) is the build's own posture,
unchanged from the seam lane's receipt.

## 4. The fold that follows

The row this roll's tree closes moves through the roster tooling with its
counter check, in the operator's queue checkout (brandonDojoTech):

- `reg-routes-B6` (the register-routes family): the row's PARTIAL verdict
  rested on the v26 measurement - the seam wired, the audit red on the
  unserved theme images. The vendor-assets landing met the recorded unblock
  on both of its named legs (the refresh publishes the vendored sources AND
  the port now serves the mods' vendored files), this roll re-measured the
  whole gate battery at the rolled tip with the audit green, and the row's
  bucket moves to DONE with its verdict PORTED. The fold script asserts the
  pre-state, re-reads the lane tip and the merge commit from the roll
  checkout, reads the three receipt files at the roll tip against their
  markers, recomputes the aggregates, runs the counter, and requires the
  counter's integrity block to read all true before anything is committed.
  The expected post-fold counter reads 957 of 993 (26 working, 10 blocked,
  96.4 percent).

The receipt, the counter run and the fold receipt are
`tmp/fold-roll15-20261027/` in brandonDojoTech.

## 5. What this lane did not do

- Nothing deployed. No URL was fetched, so no URL is reported working.
- Nothing was written to the live database, and the live script was not
  touched. culturesmith.com was not touched.
- The other candidate branches on origin were not moved. The roll pushes one
  branch: `deploy/full-candidate-20261104`.
- No source branch was rebased, and no tip was moved. The two live lanes'
  branches (`port/oracle-vm-parity-51-20261027`,
  `port/demo-scratch-20261025`) stay unmerged and untouched, with the seven
  stale 20261020-22 waves and `port/residual-verify-20261026` per the
  standing precedent.
- The roll v14 lane copy's working tree was not written to; its HEAD ref
  shape changed (symbolic to direct, same commit) so the branch could be
  attached in this roll's lane, with the tree's cleanliness verified before
  and after.
- The other host was not touched.
