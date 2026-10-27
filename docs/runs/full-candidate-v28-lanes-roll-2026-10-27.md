# Full candidate v28: the implicit-mark lane folded, the family green, the two stale pins re-pointed

The assignment: fold the implicit-mark branch (`port/implicit-mark-20261027`,
tip `44e337c97`) into the integration candidate `deploy/full-candidate-20261104`
(base tip `6f621e446`, the v27 roll), one merge commit, the house plumbing, and
every gate the v27 receipt names, re-measured at the rolled tip. The branch
carries the closable half of the register-routes-B10 port: the implicit mark's
setup arming (`mark.rb:28-63`, first arm), with the census split env-gated
unchanged. This roll folds that branch, re-points two stale fixture pins the
gate battery measured red at the base tip as well, and re-measures everything
at the rolled tip. Nothing deploys; the candidate branch is not a deploy.

## 0. The lane's exclusive checkout

Made through the sanctioned lane-copy path, not by a clone and not by a raw
worktree add:

    node C:/localProjects/juc-relay/fleet/lane-copy.mjs \
      --repo C:/localProjects/decko-ts-release-lead \
      --path C:/localProjects/decko-ts-roll-implicit-mark-20261027 \
      --branch deploy/full-candidate-20261104-roll-implicit-mark \
      --base 6f621e446 \
      --shared-modules C:/localProjects/decko-ts-journeys-candidate-20261027/node_modules \
      --budget-mb 340 \
      --purpose "integration roll: the implicit-mark lane tip 44e337c97 merged into deploy/full-candidate-20261104 at its origin tip, all gates at the rolled tip, receipt, forward-only push"
    outcome: created, lease 4525a90103d5, trackedBytes 303862237,
    addedBytes 303862555, budgetBytes 356515840, custody attributed natively
    (`zcode-sess_dwf-dwfrun-be7f8323-...-actor_1_1`, basis zcode-process-owner,
    no alias), nodeModules: junction -> the journeys-candidate install.

One deviation from the v26 and v27 rolls' checkout, recorded plainly: the roll
did not attach the branch name `deploy/full-candidate-20261104` itself. That
name is checked out in the roll16 lane copy
(`C:/localProjects/decko-ts-roll16-20261027`), a lane still in flight, whose
local branch position (`edeb69ef0`, its own fold of
`port/oracle-vm-parity-51-20261027`) is pushed nowhere; lane-copy refuses a
branch held by another worktree, and attaching "never moves its tip". This
roll therefore attached its own roll branch at `--base 6f621e446`, the origin
tip read with `git ls-remote` before the checkout and re-read at fold time,
and pushes its commits by SHA to the candidate branch (section 5). The roll16
lane's fold was not included and is not this roll's: its own run1 family
exercise in its own checkout reads with failures (the w4-follow-views journey
timeout, one CSS 5xx, one asset-audit failure in its
`tmp/roll16-verify-20261104/family-exercise-run1.log`), so its tip fails the
same gate rule this roll runs, and a roll does not build on another lane's
unpushed, unverified merge.

The shared-modules junction points at
`C:/localProjects/decko-ts-journeys-candidate-20261027/node_modules`, not at
the workbatch-a install the v27 receipt used: that install is pruned to 24
top-level packages with no `.bin` directory (system issue 261027-115155, the
same gap the roll16 draft records). The journeys-candidate install carries 105
packages with `tsc` and `vitest` bins, byte-verified against the branch's own
lockfile: sha256 of the shared install's `package-lock.json` and of
`git show 6f621e446:package-lock.json` both read
`96a3efb62e81fdb24516d8106316e92e44cdde583d63399ca0b6e1e54731ae69`, and the
fold touches neither `package.json` nor `package-lock.json` (`git diff
--name-only 6f621e446..44e337c97 -- package.json package-lock.json` is empty),
so the lane runs the dependencies its own lockfile names.

The LibSass program the battery needs was taken from the shared native cache
and verified, not rebuilt:
`LIBSASS_CACHE_ONLY=1 node tools/libsass/build-native.mjs tools/libsass/libsass
tools/libsass/build` printed "verified cache hit ... (LibSass 3.6.4;
0164c523468e197df63f0b0e29bbc675dfe9aeea26371bcec46c727469331002; 2240 ms)",
the same program hash the v26, v27 and roll16 receipts record.

## 1. The merge set

One branch was on the table, named by the assignment. Its tip on origin, read
with `git ls-remote` before the merge and again at fold time, is
`44e337c9738a4051409588e588e4449bdc93d94b`. Its merge base with the candidate
tip is the candidate tip itself (`git merge-base` reads `6f621e446`), so the
branch is cut from the v27 tip and no other lane's work is in play.

| branch | tip (origin) | merge commit | conflicts |
|---|---|---|---|
| port/implicit-mark-20261027 | 44e337c9738a4051409588e588e4449bdc93d94b | 6ace1b63746abcee98082785a69e77d7238342be | none |

The merge set re-checked against the remote at the rolled tip: 173 `port/*`
heads on origin, thirteen not ancestors of the rolled tip
(`tmp/roll-implicit-mark-verify-20261104/not-ancestors.txt`). Seven are the
stale 20261020-22 waves that twelve rolls have never merged
(`dsl-convert-r2`, `dsl-tranche2`, `mods-convert-r2`,
`register-dsl-convert`, `register-mods-convert`,
`register-starcards-convert`, `remaining-convert-r2`), and this roll keeps
that line. The eighth is `port/residual-verify-20261026` (`f9b7147f`), the
verification copy, not a work branch, unmerged since roll v13. The ninth is
`port/demo-scratch-20261025` (`72ecc4596`), the demo deck builder's own
branch. The tenth is `port/oracle-vm-parity-51-20261027` (`f3ac7b15a`), the
roll16 lane's own branch, in flight in its own checkout, not this roll's
assignment (section 0). The eleventh is `port/mark-empty-20261027`
(`9d5ec75fa`), a live lane's branch named by the roll16 draft. The twelfth and
thirteenth are `port/treewalk-director-gap-20261027` (`7a39392fd`) and
`port/treewalk-e5-row-20261027` (`46812288c`), two live lanes' branches that
appeared after the v27 roll. The merge set is the assignment's one branch, and
it is complete against the assignment.

## 2. How the merge was made, and why

The house git gate refuses `git merge`, so the merge was made object-side the
way the v26, v27 and roll16 receipts record: `git merge-tree --write-tree`
computes the real three-way merge, `git commit-tree` writes the merge commit
with the two parents, and one `git merge --ff-only` advances the roll branch
to the merge commit, which is a fast-forward because the new commit's
first-parent chain runs back through the old head.

`git merge-tree --write-tree 6f621e446 44e337c97` exited 0 and printed one
tree OID (`f9f6d2ba370063fae2c89ed1691359ea39f04e81`, read back identical from
the merge commit) with no conflict lines, so no file conflicted. The merge
commit's first parent is the previous roll commit (`6f621e446`, the v27 tip)
and its second parent is the lane tip:

    6ace1b637 6f621e446 44e337c97   (implicit-mark-20261027)

The working tree was clean before the merge (zero porcelain lines) and carried
the merged content after it (5 files changed, 794 insertions, 38 deletions
against the v27 tip: the new `src/card/auth/implicit-mark.ts`, the setup
arming in `src/card/auth/first-run-setup.ts`, the new
`tests/server/implicit-mark-setup-arming-port.test.ts`, the regenerated
`fixtures/captured/register-routes-remaining-eight-ruby-oracle.json` and its
capture script).

## 3. The fix the roll made at the candidate: two stale fixture pins

The first full pin-suite run at the merge tip read 423 of 425 with two
failures, both the same class and both measured pre-existing, not the fold's:

- `tests/server/edit-draft-consumer-seam-parity.test.ts` (B11): the fixture
  pins `src/card/mod-loader/mods/card-mod-history.ts:1908`, whose quoted
  block sits at 1912.
- `tests/server/jasmine-engine-mount-template-parity.test.ts` (A23): the
  fixture pins `src/server/worker-shared-surface.ts:362`, whose quoted block
  sits at 417.

Mechanism and proof of pre-existence, all read off this machine: both suites
import nothing but node builtins and vitest, so their whole input surface is
the fixture rows, the quoted source files, and the test files themselves; the
fold's five files include neither quoted source file and neither test file;
and the fold's fixture diff is exactly the port lane's two B10 re-points (26
line-number lines, hunks at fixture lines 1266-1327, both rows outside them;
`git diff 6f621e446 6ace1b637 -- fixtures/captured/...` shows no other
change). The same two suites are therefore functions of identical inputs at
the base tip, and the base tip reads them the same red. The quoted texts
themselves sit byte-identical at `1912` and `417` in both `6f621e446` and the
merge tip (`git show 6f621e446:<file> | grep -n` and the working tree agree),
so the pins were stale on the candidate line and the behaviour is present.

The fix is the same mechanical fix the port lane made for its B10 rows,
applied at the candidate as roll 15's rule allows: the nineteen line numbers
of the two rows re-pointed in place, no text changed (commit `d93e2ef9e`, one
file, 19 insertions, 19 deletions). After the fix the two suites read 18 of
18 (`pin-failures-after-fix.log`), and the suites' own text assertions are
the proof that the blocks match byte for byte at the new lines. The full
pin-suite battery was then re-run at the fixed tip, and every gate below is
measured at that final tip, `d93e2ef9e`.

## 4. The gates

Every gate below was run in this roll, at the final tip
`d93e2ef9e2dd1ef2ca8559939005694e94c49e0c`, on this machine. The artifact
paths are this roll's own files under
`tmp/roll-implicit-mark-verify-20261104/` (in the roll checkout).

Typecheck, `npx tsc --noEmit`: exit 0, zero output lines at the final tip
(`tsc-final.log` holds nothing else).

Format parity, the six suites the v27 receipt names:

    npx vitest run tests/server/html-format-parity.test.ts \
      tests/server/json-format-parity.test.ts \
      tests/server/rss-format-parity.test.ts \
      tests/card/mod-loader/card-mod-format-remaining-views.test.ts \
      tests/card/mod-loader/card-mod-bootstrap.test.ts \
      tests/card/mod-loader/card-mod-bar-box-format-oracle-pinned.test.ts

Result: 6 files, 147 tests, all passing (`format-parity-final.log`),
unchanged from the v27 numbers.

The pin suites, at the final tip: twenty-one test files, 425 tests, all
passing (`pin-suites-final.log`). The first eleven files are the v27 roll's
standing list; the last ten are this fold's surfaces: the port lane's new
arming pin and the arming parity suite beside it, the first-run-setup suites
whose module the fold modifies, the gherkin setup feature that imports it
directly, and the five further suites that read the oracle fixture the port
lane regenerated (the roll re-runs what the lane left unrun - the lane's own
battery covered first-run-setup and the arming pair only):

| suite | lane | tests |
|---|---|---|
| tests/server/treewalk-row-disposition-parity.test.ts | treewalk-set (v26) | 204 |
| tests/deploy/bunny-edge-error-page.test.ts | not-found-404 (v26) | 15 |
| tests/server/bad-address-wildcard-view-parity.test.ts | not-found-404 (v26) | 15 |
| tests/server/wildcard-bad-address-parity.test.ts | not-found-404 (v26) | 10 |
| tests/server/not-found-404-view-parity.test.ts | not-found-404 (v26) | 15 |
| tests/server/not-found-404-entry-points.test.ts | not-found-404 (v26) | 7 |
| tests/deploy/staging-bad-address-wildcard-endpoint.test.ts | not-found-404 (v26) | 3 |
| tests/server/setup-before-action-parity.test.ts | edge seam (v27) | 13 |
| tests/server/workbatch-a-register-rows-inventory.test.ts | edge seam (v27) | 10 |
| tests/deploy/bunny-edge-handler-asset-refresh-seam.test.ts | edge seam (v27) | 2 |
| tests/server/mod-style-assets.test.ts | vendor assets (v27) | 5 |
| tests/server/implicit-mark-setup-arming-port.test.ts | implicit-mark (this fold) | 13 |
| tests/server/implicit-mark-setup-arming-parity.test.ts | implicit-mark (this fold) | 10 |
| tests/card/auth/first-run-setup.test.ts | implicit-mark (this fold) | 44 |
| tests/card/auth/first-run-setup-endpoint.test.ts | implicit-mark (this fold) | 8 |
| tests/card/gherkin/setup.feature.test.ts | implicit-mark (this fold) | 1 |
| tests/server/api-key-read-arm-seam-parity.test.ts | fixture consumer (this fold) | 14 |
| tests/server/edit-draft-consumer-seam-parity.test.ts | fixture consumer (this fold) | 9 |
| tests/server/format-negotiation-arm-seam-parity.test.ts | fixture consumer (this fold) | 9 |
| tests/server/jasmine-engine-mount-template-parity.test.ts | fixture consumer (this fold) | 9 |
| tests/server/unregistered-suffix-file-sender-seam-parity.test.ts | fixture consumer (this fold) | 9 |

Side-effects battery, both modes, the commands the v27 receipt names, with
the LibSass program from the shared native cache (LibSass 3.6.4). The strict
run carries the FOUR DECKO_STRICT_PARITY_* switches the v27 receipt names;
the fifth switch the roll16 draft names arrives with the parity branch, which
is not in this tree:

    DECKO_PASSWORD_HASH=legacy-sha1 node tools/parity-side-effects/ts-drive.mjs \
      reference-harness/fixtures/write-battery-v1/deck/deck.sqlite3 \
      tmp/roll-implicit-mark-verify-20261104/battery/ts-work-final > .../ts-trace-default-final.json
    node tools/parity-side-effects/compare.mjs \
      reference-harness/fixtures/write-battery-v1/expected/side-effects-ruby.json \
      .../ts-trace-default-final.json .../compare-report-default-final.json

    # strict run: the four DECKO_STRICT_PARITY_* switches on, and PARITY_STRICT=1 on the compare
    DECKO_STRICT_PARITY_SIGNIN_DETAILED_ERRORS=on \
    DECKO_STRICT_PARITY_REVISION_RESTORE_500=on \
    DECKO_STRICT_PARITY_SKIN_CREATE_500=on \
    DECKO_STRICT_PARITY_SCRIPT_BUNDLE_CLOCK_NAMES=on \
    node tools/parity-side-effects/ts-drive.mjs ... (ts-work-strict, ts-trace-strict.json)
    PARITY_STRICT=1 node tools/parity-side-effects/compare.mjs \
      reference-harness/fixtures/write-battery-v1/expected/side-effects-ruby.json \
      .../ts-trace-strict.json .../compare-report-strict.json

Battery lines, both modes, at the final tip:

| mode | line |
|---|---|
| default | `SIDE EFFECTS PASS 78 / 87; deliberate differences pinned 9; mismatches 0` |
| strict | `SIDE EFFECTS PASS 86 / 87; deliberate differences pinned 1; mismatches 0` |

Raw-body tables: the default mode reads `byte-equal 51; slot-equal 28;
declared 6; residual 2` and the strict mode reads `byte-equal 51; slot-equal
33; declared 1; residual 2`, both with zero mismatches. The event order
agrees on 81 of 81 deterministic steps in both modes, with 6 not established.
Both modes are unchanged from the v27 numbers row by row.

Whole-family signed-in exercise, the local stack over a copy of the pinned
deck, the same command the v27 receipt names:

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/roll-implicit-mark-verify-20261104/run1/whole-family/report.md

**332 / 332 checks passed**, 0 failed, 0 skipped by write mode, capability
coverage 95 covered, 1 partial, 0 not covered, 1 out of scope (of 98). The
run observed 8940 engine requests, and the slowest own-work request reads
2346 ms of server time (`GET /*signin`); no signed-in page and no save
exceeded the 3 s budget, and no request returned a 5xx. The final browser
asset audit reads PASS with zero failures over 38 contexts. The run record is
`.runtime/roll-implicit-mark-verify-20261104/run1/whole-family/report.md` and
the log is `tmp/roll-implicit-mark-verify-20261104/family-exercise-run1.log`.
The report's own custody line reads source
`d93e2ef9e2dd1ef2ca8559939005694e94c49e0c`, source files clean, bundle
SHA-256 `85040c9c015299e05e66a9d6f6462b61ccdc8b7a3ad3fe88119cdc93eeef7e65`:
the exercise measured this roll's exact tree and this roll's exact bundle.

The one partial capability is M1 (the RichText editor toolbar), and its cause
is not this roll: the same row the v27 receipt records as partial, whose
fourth check is recorded by no harness module in the tree, at the base tip as
well as at the final tip.

The process exit code is 1 by the tool's own rule (it exits 0 only when no
check failed AND the capability coverage is complete), not by a failure - the
same reading the v27 and v26 receipts record.

The bundle, and the byte movement this roll records. The rolled tree's build
(`node tools/dist/build-engine.mjs`, exit 0, then
`node tools/bundle-bunny-edge-engine.mjs` and `node tools/bundle-bunny-worker.mjs`,
each of which runs the tree's own boot-safety guard
`tools/vendor/edge-bundle-budget.mjs`):

| artifact | bytes | SHA-256 | verdict |
|---|---|---|---|
| bunny-edge-engine.bundle.js | 7,520,549 | 85040c9c015299e05e66a9d6f6462b61ccdc8b7a3ad3fe88119cdc93eeef7e65 | PASS, 79,451 bytes under the 7,600,000 boot-safe budget |
| bunny-edge-read.bundle.js | 2,192,684 | 884515e44cc731b9a3f5309d1425f1f072f6a36c76f368f9960b1fe6428d6c0b | PASS, byte-identical to the v27 tree's recorded build |
| bunny-worker.bundle.js | 73,230 | 35ccc2543617fb299e4b9d6815ccae81003b90c7ab102f263f8eedaa144aa6a1 | PASS, byte-identical to the v27 tree's recorded build |

Net movement on the engine bundle: +65 bytes on the v27 tree's recorded build
(7,520,484 bytes, SHA-256
`701f61d9cf38fad337f91ce4ebd9b5fc5d2edf3d05431e09d4b815f161588b00`, the
numbers the v27 receipt carries): the implicit-mark module and the setup
arming's cost in the served engine. The read and worker bundles are
byte-identical to the v27 tree's recorded builds, so the fold touches no
surface they carry. The standing over-80-percent WARN line (`bundle 7520549
bytes is over 80% of the conservative 7600000-byte script limit`) is the
build's own posture, unchanged. Build reproducibility held inside this
checkout: a second full build run in place reproduced all three hashes
byte for byte.

## 5. The push

The roll pushes one branch: `deploy/full-candidate-20261104`, by SHA. The
pushed tip is this receipt's own commit, whose first-parent chain runs
`6f621e446` (v27) -> `6ace1b637` (the fold) -> `d93e2ef9e` (the pin fix) ->
the receipt commit, so the push is a fast-forward of exactly three commits on
the v27 tip. `git ls-remote` is read immediately before the push; if the
remote tip has moved past `6f621e446`, the roll does not push and re-folds.

## 6. What this lane did not do

- Nothing deployed. No URL was fetched, so no URL is reported working. The
  only network reads were `git ls-remote` and `git fetch` against the
  project's own private remote.
- Nothing was written to the live database, and the live script was not
  touched. culturesmith.com was not touched.
- No roster row was folded: the assignment names no roster row, and the
  branch's own commit names reg-routes-B10's closable half, whose row stays
  with its lane.
- The roll16 lane's fold (`port/oracle-vm-parity-51-20261027`, local merge
  `edeb69ef0` in `C:/localProjects/decko-ts-roll16-20261027`, unpushed) was
  not included, per section 0. Its checkout was not written to.
- No source branch was rebased, and no tip was moved. The live lanes'
  branches (`port/oracle-vm-parity-51-20261027`, `port/demo-scratch-20261025`,
  `port/mark-empty-20261027`, `port/treewalk-director-gap-20261027`,
  `port/treewalk-e5-row-20261027`) stay unmerged and untouched, with the
  seven stale 20261020-22 waves and `port/residual-verify-20261026` per the
  standing precedent.
- One probe of the exercise tool (`--help`, expecting a usage screen; the
  tool has none) started a real exercise run that was cut off within its
  first minute. No orphaned listener or node process remained (netstat reads
  TIME_WAIT sockets only, no node processes); its bundle rebuild reproduced
  all three artifacts byte for byte; its scratch
  (`.runtime/edge-signed-in/`, `browser-build.json`) stays in this lane
  copy's gitignored runtime folder, inert - the exercise rebuilds its local
  deck on every run - and the deletion gate archives rather than deletes, so
  the scratch is named here instead of removed.
