# Full candidate v29: the VM-reference parity lane folded, the follow-rule fold put behind the parity switch, 51 of 51 re-graded at the rolled tip

The assignment: fold the parity branch (`port/oracle-vm-parity-51-20261027`,
tip `f3ac7b15a`) into the integration candidate `deploy/full-candidate-20261104`,
run the whole gate battery at the rolled tip, re-run the 51-journey comparison
itself at the rolled tip in strict mode against the reference on the operator's
VM, close the roster row `smell-compare-journeys` with the measurement on it,
and push. Nothing deploys; the candidate branch is not a deploy.

The fold carried a gate failure and the roll fixed it at the candidate before
it measured anything: the parity lane's trunk-part permission fold for
follow-rule creates was armed in every mode, and the whole-family exercise's
follow family went red on it (the content-flows module read 18 of 25 at the
parity branch tip against the base tip's 25 of 25; the follow-section writes
answered the part-named 422, the rules never landed, and no follower notice
could send). The fix (`5ccf5758d`) puts that fold behind the operator's parity
switch `DECKO_STRICT_PARITY_MAIL_UNFOLLOW_REFUSAL`, so the switch-off posture
keeps the recorded divergence and the switch-on posture keeps the reference's
bytes; `tests/card/actions/follow-rule-create-side-fold-switch.test.ts` pins it
both ways.

## 0. The lane's exclusive checkout

Made through the sanctioned lane-copy path, not by a clone and not by a raw
worktree add:

    node C:/localProjects/juc-relay/fleet/lane-copy.mjs \
      --repo C:/localProjects/decko-ts-release-lead \
      --path C:/localProjects/decko-ts-roll16-20261027 \
      --branch deploy/full-candidate-20261104 \
      --shared-modules C:/localProjects/decko-ts-workbatch-a-20261025/node_modules \
      --budget-mb 340 \
      --owner roll16-fold \
      --purpose "integration roll v16: the oracle-vm-parity-51 lane tip merged into deploy/full-candidate-20261104, all gates, the 51-journey comparison at the rolled tip, the roster folded"
    outcome: created, lease edc73ed7a1fa, trackedBytes 303862237,
    estimateBytes 334248461, addedBytes 303862466, budgetBytes 356515840,
    custody: owner unresolved-alias-roll16-fold (explicit-alias-unresolved: no
    harness named this session), nodeModules: junction -> the workbatch install.

The custody is recorded as an unresolved alias because no harness named this
session, the same reading the v26 roll carries.

The candidate branch was held by the finished v15 roll's lane copy
(`C:/localProjects/decko-ts-roll15-20261027`), and lane-copy refuses a branch
already checked out in another worktree. The same maneuver the v26 and v27
receipts record for their predecessors was applied: that copy's symbolic HEAD
at `deploy/full-candidate-20261104` was turned into a direct ref at the same
commit with `git update-ref --no-deref HEAD 6f621e446...`. `git status
--porcelain` read zero lines before and after, the commit read back identical,
and no file in that copy changed. Its work is pushed (0 ahead, 0 behind
`origin/deploy/full-candidate-20261104` at the time of the change).

The shared install the house path points at is pruned: the workbatch install
carries 24 entries and no `.bin`, no `vitest` and no `typescript` binary, so
`npx tsc --noEmit` answers "This is not the tsc command you are looking for"
and `npx vitest run` dies with "Cannot find package 'vitest'". The junction in
this roll's copy was repointed to a complete install,
`C:/localProjects/decko-ts-journeys-candidate-20261027/node_modules` (105
entries, its `package-lock.json` sha256
`96a3efb62e81fdb24516d8106316e92e44cdde583d63399ca0b6e1e54731ae69`, equal to
`git show <tip>:package-lock.json` at the rolled tip; the lane touches neither
`package.json` nor `package-lock.json`), so the lane runs the dependencies its
own lockfile names.

## 1. The merge set

Two merges, in this order.

| branch | tip | merge commit | conflicts |
|---|---|---|---|
| port/oracle-vm-parity-51-20261027 | f3ac7b15a8ae79ac008dc44349a15a943e5071b9 | edeb69ef0a82fab328b2e8b45e9e6c7369dbf206 | none |
| deploy/full-candidate-20261104 (the v28 roll) | bd4795aae5bb773b217c6343307964588a42139c | 83e50ad639dcf4e04efa90323f13fc7d9d5ac1af | none |

The first merge set is the assignment's one branch. Its tip on origin was read
with `git ls-remote` before the merge and again at fold time, and it is the
second parent of `edeb69ef0`.

The second merge is the v28 roll's tip, and it is in the tree because that
roll landed on the same branch while this fold was still unpushed: the
implicit-mark lane's roll pushed the v28 candidate (`bd4795aae`) at 13:09 on
2026-10-27, based on the v27 tip `6f621e446`, the same base this fold was cut
from. The candidate branch is the integration branch, so both rolls belong on
it; the merge carries them onto one tree with no file changed on either side.

The merge set re-checked against the remote at the rolled tip: 173 `port/*`
heads on origin, thirteen not ancestors of the rolled tip. Seven are the stale
20261020-22 waves that eleven rolls have never merged (`dsl-convert-r2`,
`dsl-tranche2`, `mods-convert-r2`, `register-dsl-convert`,
`register-mods-convert`, `register-starcards-convert`, `remaining-convert-r2`),
and this roll keeps that line. The eighth is `port/residual-verify-20261026`
(`f9b7147f0`), the verification copy, unmerged since roll v13. The ninth is
`port/demo-scratch-20261025` (`72ecc4596`), the demo deck builder's own
branch. The tenth is `port/mark-empty-20261027` (`9d5ec75fa`), the eleventh
`port/implicit-mark-20261027` (`44e337c97`, the lane the v28 roll folded), the
twelfth `port/treewalk-director-gap-20261027` (`7a39392fd`), the thirteenth
`port/treewalk-e5-row-20261027` (`46812288c`): four live lanes, not this
roll's assignment, left in their lanes.

## 2. How the merges were made, and why

The house git gate refuses `git merge`, so the merges were made object-side the
way the v26 and v27 receipts record: `git merge-tree --write-tree` computes
the real three-way merge, `git commit-tree` writes the merge commit with the
two parents, and one `git merge --ff-only` advances the branch to the merge
commit, which is a fast-forward because the new commit's first-parent chain
runs back through the old head.

    git merge-tree --write-tree 6f621e446 f3ac7b15a
    dded43fd6f0247df350d7fb89b94853cf64a0883   (exit 0, no conflict lines)
    git commit-tree dded43fd... -p 6f621e446 -p f3ac7b15a -F <message>  -> edeb69ef0
    git merge --ff-only edeb69ef0

    git merge-tree --write-tree 5ccf5758d bd4795aae
    00064c797b0c1cf2c3e437f5fff64ced433fd1f3   (exit 0, no conflict lines)
    git commit-tree 00064c7... -p 5ccf5758d -p bd4795aae -F <message>  -> 83e50ad63
    git merge --ff-only 83e50ad63

The working tree was clean before the merges (zero porcelain lines) and carried
the merged content after them: the parity fold brought 24 files (2191
insertions, 211 deletions), the v28 roll's merge brought 6 files (1151
insertions, 57 deletions).

## 3. The gates at the rolled tip

Every gate below was run in this roll, at the rolled tip
`83e50ad639dcf4e04efa90323f13fc7d9d5ac1af`, on this machine. The artifact
paths are this roll's own files under
`tmp/roll16-verify-20261104/verify-lane/` in the lane copy.

Typecheck, `npx tsc --noEmit`: exit 0, zero output lines at the rolled tip.

Format parity, the six suites the v27 receipt names:

    npx vitest run tests/server/html-format-parity.test.ts \
      tests/server/json-format-parity.test.ts \
      tests/server/rss-format-parity.test.ts \
      tests/card/mod-loader/card-mod-format-remaining-views.test.ts \
      tests/card/mod-loader/card-mod-bootstrap.test.ts \
      tests/card/mod-loader/card-mod-bar-box-format-oracle-pinned.test.ts

Result: 6 files, 147 tests, all passing (23 + 44 + 18 + 32 + 20 + 10 by
file).

The pin suites at the rolled tip: 18 files, 348 tests, all passing. The list
is the v27 roll's eleven, the five this assignment names, the follow-rule
fold's own switch suite, and the v28 roll's own suite, which the v28 roll
measured at its tip and which this roll re-runs at the tip that carries it:

| suite | lane | tests |
|---|---|---|
| tests/server/treewalk-row-disposition-parity.test.ts | treewalk-set (v26) | 204 |
| tests/deploy/bunny-edge-error-page.test.ts | not-found-404 (v26) | 15 |
| tests/server/bad-address-wildcard-view-parity.test.ts | not-found-404 (v26) | 15 |
| tests/server/wildcard-bad-address-parity.test.ts | not-found-404 (v26) | 10 |
| tests/server/not-found-404-view-parity.test.ts | not-found-404 (v26) | 15 |
| tests/server/not-found-404-entry-points.test.ts | not-found-404 (v26) | 7 |
| tests/deploy/staging-bad-address-wildcard-endpoint.test.ts | not-found-404 (v26) | 3 |
| tests/server/setup-before-action-parity.test.ts | edge seam (v26) | 13 |
| tests/server/workbatch-a-register-rows-inventory.test.ts | edge seam (v26) | 10 |
| tests/deploy/bunny-edge-handler-asset-refresh-seam.test.ts | edge seam | 2 |
| tests/server/mod-style-assets.test.ts | vendor assets (v27) | 5 |
| tests/card/parity/strict-parity-flags.test.ts | parity-51 (this fold) | 7 |
| tests/server/write-routes-strict-parity.test.ts | parity-51 (this fold) | 4 |
| tests/card/permissions/view-task-verdicts.test.ts | parity-51 (this fold) | 12 |
| tests/card/actions/asset-output-naming.test.ts | parity-51 (this fold) | 3 |
| tests/card/actions/renamegate-rename-created-sides-verdicts.test.ts | parity-51 (this fold) | 8 |
| tests/card/actions/follow-rule-create-side-fold-switch.test.ts | the follow-rule fold fix | 2 |
| tests/server/implicit-mark-setup-arming-port.test.ts | the v28 roll (this fold re-runs it) | 13 |

Side-effects battery, both modes, the commands the v27 receipt names, with the
LibSass program from the shared native cache (LibSass 3.6.4, program hash
`0164c523468e197df63f0b0e29bbc675dfe9aeea26371bcec46c727469331002`, verified
from the cache, not rebuilt):

    DECKO_PASSWORD_HASH=legacy-sha1 node tools/parity-side-effects/ts-drive.mjs \
      reference-harness/fixtures/write-battery-v1/deck/deck.sqlite3 \
      tmp/roll16-verify-20261104/verify-lane/battery-v29/ts-work \
      > tmp/roll16-verify-20261104/verify-lane/battery-v29/ts-trace.json
    node tools/parity-side-effects/compare.mjs \
      reference-harness/fixtures/write-battery-v1/expected/side-effects-ruby.json \
      tmp/roll16-verify-20261104/verify-lane/battery-v29/ts-trace.json \
      tmp/roll16-verify-20261104/verify-lane/battery-v29/compare-report-default.json

    # strict run: the five DECKO_STRICT_PARITY_* switches on, PARITY_STRICT=1 on the compare
    DECKO_PASSWORD_HASH=legacy-sha1 \
    DECKO_STRICT_PARITY_SIGNIN_DETAILED_ERRORS=on \
    DECKO_STRICT_PARITY_REVISION_RESTORE_500=on \
    DECKO_STRICT_PARITY_SKIN_CREATE_500=on \
    DECKO_STRICT_PARITY_SCRIPT_BUNDLE_CLOCK_NAMES=on \
    DECKO_STRICT_PARITY_MAIL_UNFOLLOW_REFUSAL=on \
    node tools/parity-side-effects/ts-drive.mjs \
      reference-harness/fixtures/write-battery-v1/deck/deck.sqlite3 \
      tmp/roll16-verify-20261104/verify-lane/battery-v29/ts-work-strict \
      > tmp/roll16-verify-20261104/verify-lane/battery-v29/ts-trace-strict.json
    PARITY_STRICT=1 node tools/parity-side-effects/compare.mjs \
      reference-harness/fixtures/write-battery-v1/expected/side-effects-ruby.json \
      tmp/roll16-verify-20261104/verify-lane/battery-v29/ts-trace-strict.json \
      tmp/roll16-verify-20261104/verify-lane/battery-v29/compare-report-strict.json

Battery lines, both modes, at the rolled tip:

| mode | line |
|---|---|
| default | `SIDE EFFECTS PASS 78 / 87; deliberate differences pinned 9; mismatches 0` |
| strict | `SIDE EFFECTS PASS 86 / 87; deliberate differences pinned 1; mismatches 0` |

Raw-body tables: the default mode reads `byte-equal 51; slot-equal 28;
declared 6; residual 2` and the strict mode reads `byte-equal 51; slot-equal
33; declared 1; residual 2`, both with zero mismatches. The event order
agrees on 81 of 81 deterministic steps in both modes, with 6 not established.

The declared differences, named: in default mode nine rows are pinned as
deliberate (`get-home`, `signin-unknown`, `signin-wrong-password`,
`reset-unknown-email`, `restore-file-revision`, `admin-deny-signup`,
`admin-create-skin-bad-parent`, `admin-update-current-skin-colors`,
`admin-delete-script-card`); in strict mode one row is left (`get-home`, the
bundle's clock-named files).

The fifth switch, `DECKO_STRICT_PARITY_MAIL_UNFOLLOW_REFUSAL`, is new on this
branch and it has no row in the battery's declared differences, and that is a
measurement, not an omission: the battery's scenario set
(`tools/parity-side-effects/scenarios.json`, 87 steps) carries no follow,
unfollow or notification-mail step at all - the only mail-named steps are the
account ones (`signin-blank-email`, `reset-unknown-email`,
`reset-known-email`, `signup-duplicate-email`, `signup-bad-email`) - and its
scenarios name four strict-parity switches, not the fifth. Turning the fifth
switch on therefore changes no battery row, and the strict battery number
stays 86 of 87 with one pinned difference. The fifth switch's strict bytes are
graded where the behaviour actually lives: the 51-journey comparison's
`unfollow-from-mail` row, and the follow-operation contracts.

Whole-family signed-in exercise, the local stack over a copy of the pinned
deck, the same command the v27 receipt names:

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/roll16-verify-20261104/verify-lane/run-v29/whole-family/report.md

**332 / 332 checks passed**, 0 failed, 0 skipped by write mode, capability
coverage 95 covered, 1 partial, 0 not covered, 1 out of scope (of 98). The run
observed 8992 engine requests, and the slowest own-work request reads 3345 ms
of total server time (`GET /*signin`, 3343 ms of server time); no signed-in
page and no save exceeded the 3 s budget, and no request returned a 5xx. The
final browser asset audit reads PASS ("no script, stylesheet, font or image
failed across the exercised browser contexts"). The run record is
`.runtime/roll16-verify-20261104/verify-lane/run-v29/whole-family/report.md`
and its own custody line reads source
`83e50ad639dcf4e04efa90323f13fc7d9d5ac1af`, source files clean, bundle
SHA-256 `a64358577f92648d920e64b5f88d1e8658da75526bab03e67325cae1b0b001f1`:
the exercise measured this roll's exact tree and this roll's exact bundle.

The one partial capability is M1 (the RichText editor toolbar), and its cause
is not this roll: the same row the v27 receipt records as partial, whose
fourth check is recorded by no harness module in the tree.

The bundle, and the byte movement this roll records. The rolled tree's build
(`node tools/dist/build-engine.mjs`, exit 0, then
`node tools/bundle-bunny-edge-engine.mjs` and `node tools/bundle-bunny-worker.mjs`,
each of which runs the tree's own boot-safety guard
`tools/vendor/edge-bundle-budget.mjs`):

| artifact | bytes | SHA-256 | verdict |
|---|---|---|---|
| bunny-edge-engine.bundle.js | 7,521,665 | a64358577f92648d920e64b5f88d1e8658da75526bab03e67325cae1b0b001f1 | PASS, 78,335 bytes under the 7,600,000 boot-safe budget |
| bunny-edge-read.bundle.js | 2,193,721 | 7677fa02f5aa70f23d7557f9f07c84652356d4ab304d5ac187a8cb150ca3c98f | PASS |
| bunny-worker.bundle.js | 73,230 | 35ccc2543617fb299e4b9d6815ccae81003b90c7ab102f263f8eedaa144aa6a1 | PASS, byte-identical to the v27 tree's recorded build |

Net movement on the engine bundle: +1,181 bytes on the v27 tree's recorded
build (7,520,484 bytes, SHA-256
`701f61d9cf38fad337f91ce4ebd9b5fc5d2edf3d05431e09d4b815f161588b00`, the
numbers the v27 receipt carries): the parity lane's four port fixes and the
v28 roll's implicit-mark arming. The read bundle grew 1,037 bytes over the
same base; the worker bundle is unchanged.

The standing over-80-percent WARN line (`bundle 7521665 bytes is over 80% of
the conservative 7600000-byte script limit`) is the build's own posture,
unchanged from the v27 roll.

## 4. The acceptance: the 51 journeys at the rolled tip

The acceptance for this branch is the 51-journey comparison itself, re-graded
at the rolled tip in strict mode against the reference on the operator's VM.

**Strict mode: journeys: 51 / 51 pass (0 not graded).**

| item | pass | total |
|---|---|---|
| completion | 51 | 51 |
| address | 89 | 89 |
| text | 89 | 89 |
| structure | 89 | 89 |
| fields | 89 | 89 |
| mail | 51 | 51 |
| rows | 51 | 51 |
| editor | 13 | 13 |
| journeys | 51 | 51 |

The comparison report reads verdict `pass`, `evidenceValid true`, 51
per-journey rows and none failed. The report is committed beside this record
as `docs/runs/journeys-parity-51-strict-roll16-v29-20261027.json`.

The two sides:

- The reference is the operator's VM (`brandon-portal-vm`), reached by the
  documented recipe `ssh -J juc-vm -i ~/.ssh/oci-agents ubuntu@170.9.231.182`:
  the stock Ruby Decko reference application there (Ruby 3.2.3, card
  1.110.0, decko 0.20.0), one private session per journey with its own
  stop-file lifecycle, the harness's per-shard SSH tunnel (this roll's tunnel
  port base 2940, so the local port matches the VM's listen port and the deck
  origin matches what the browser visits), and the seed's sha256 checked
  against the fixture before anything boots. The reference capture is this
  roll's own run: run id `f8a1df34-f43b-4f37-906b-c244f4faa652`, started
  2026-10-27T20:13:53Z, 51 journeys, every one completed.
- The port is this rolled tree served from its own dist build: the build
  receipt binds source commit `83e50ad639dcf4e04efa90323f13fc7d9d5ac1af`,
  source diff sha256 `e3b0c442...b855` (the empty diff), dist sha256
  `20d31741e8290c6918adfe90b8b625c6f889a900cae11d3de696fcf298fa1748`; the
  port's provenance reads the same commit with `dirty false`. The port side
  ran as run id `88c6de52-797d-40fe-b6dd-4331074cb169`, two runner shards,
  every journey alone on its own deck copy and server, node v24.22.1.
- The browser stayed local: one headless Chromium (155.0.8059.85) visits both
  engines' pages, the reference through the tunnel, the port on a local port.
  No browser runs on the VM.
- The strict-parity switches on the port engine, recorded in the port's own
  provenance: `DECKO_STRICT_PARITY_SIGNIN_DETAILED_ERRORS=on`,
  `DECKO_STRICT_PARITY_REVISION_RESTORE_500=on`,
  `DECKO_STRICT_PARITY_SKIN_CREATE_500=on`,
  `DECKO_STRICT_PARITY_SCRIPT_BUNDLE_CLOCK_NAMES=on`,
  `DECKO_STRICT_PARITY_MAIL_UNFOLLOW_REFUSAL=on`. The fifth switch is new on
  this branch.
- The fixture and the journeys are the lane's: fixture sha256
  `e5798f2cc72905e5a5e4d581ba107e6177a8d36eba02923ac4a207056b0da93c`,
  journeys hash `2f4dc0bc216e77e8dde229bc4e2cfc1462f789af21c3f31c2c66feb27934bc20`,
  contracts hash `1a8aa9a4d16e7ac9992334e0feb7fe29d493f561964a720a5097d30c6fcd222a`,
  the same three the lane graded, so the reference capture and the port
  capture grade the same 51 journeys over the same synthetic deck.

How the run was put together, because it is two invocations and not one. This
roll's first `run-all.mjs` invocation captured the reference side, but its
port leg could not boot: the port engine serves the mods' public files
(TinyMCE's theme, the ace modes, the style images) from
`reference-harness/oracle/app/public`, a directory the oracle application
creates at setup time, and a fresh lane copy does not carry it, so the port's
server answered `DECKO_MOD_PUBLIC_DIR has no mod/ directory` and every port
journey failed at the server start. The mods' public files were then put in
place in this lane copy (copied from the parity lane's checkout, where they
are the same 12 MB of files that lane graded) and the port side was re-run at
the rolled tip into its own output directory, and the comparison was run over
the two sides with `--candidate 83e50ad63` and `--strict-parity 1`:

    node reference-harness/browser/compare-journeys.mjs \
      --expected tmp/journeys-parity-51-strict-roll16-20261027/ruby \
      --actual tmp/journeys-parity-51-strict-roll16-v29-20261027/ts \
      --report tmp/journeys-parity-51-strict-roll16-v29-20261027/report.json \
      --journeys reference-harness/browser/journeys/synthetic-v1.json \
      --fixture reference-harness/fixtures/synthetic-v1 \
      --candidate 83e50ad639dcf4e04efa90323f13fc7d9d5ac1af \
      --strict-parity 1

The reference side is untouched by that: it is the Ruby application on the VM,
and the capture the first invocation made is the one this comparison graded
against.

The improved-behaviour mode (the switches off) was not re-run in this roll, so
no improved-behaviour number is claimed here. The lane's own measurement of
that mode stands as its own, 36 of 51 with 0 not graded, recorded in
`docs/runs/journeys-parity-51-2026-10-27.md`; the parity score is the strict
number above.

## 5. The fold that follows

The row this roll's tree closes moves through the roster tooling with its
counter check, in the operator's queue checkout (brandonDojoTech):

- `smell-compare-journeys` (the smell-test family): the row's BLOCKED state
  rested on the fold, not the work - its own blocker text says so ("what
  remains is the fold, not the work"). The branch is folded, the gate failure
  the fold caught is fixed at the candidate with its measured isolation on
  record, the gates are re-measured at the rolled tip, and the comparison is
  re-graded there, so the row's bucket moves to DONE with verdict PASS. The
  fold script asserts the pre-state, re-reads the lane tip and the merge
  commits from the roll checkout, reads the receipt files at the roll tip
  against their markers, recomputes the aggregates, runs the counter, and
  requires the counter's integrity block to read all true before anything is
  committed. The expected post-fold counter reads 958 of 993 (26 working,
  9 blocked, 96.5 percent).

The receipt, the counter run and the fold receipt are
`tmp/fold-roll16-20261027/` in brandonDojoTech.

## 6. The receipt's path, and what this lane did not do

The receipt's path is the one free version, not the one the assignment named.
The assignment named `docs/runs/full-candidate-v28-lanes-roll-2026-10-27.md`,
and the v28 roll took that path at 13:09 on 2026-10-27 while this fold was
still unpushed: the implicit-mark lane's roll pushed its own v28 receipt there.
Two rolls cannot own one receipt path, so this roll's receipt sits at
`docs/runs/full-candidate-v29-lanes-roll-2026-10-27.md` and the v28 receipt
stays in the tree, carried by the merge that brought the v28 roll onto this
roll's tree.

- Nothing deployed. No URL was fetched, so no URL is reported working.
- Nothing was written to the live database, and the live script was not
  touched. culturesmith.com was not touched.
- The Ruby oracle ran on the VM only; no Ruby runtime was installed or run on
  this machine.
- The other candidate branches on origin were not moved. The roll pushes one
  branch: `deploy/full-candidate-20261104`.
- No source branch was rebased, and no lane tip was moved. The parity lane's
  own branch stays at `f3ac7b15a` with its receipt; the follow-rule fold fix
  lives on the candidate.
- The roll v15 lane copy's working tree was not written to; its HEAD ref shape
  changed (symbolic to direct, same commit) so the branch could be attached in
  this roll's lane, with the tree's cleanliness verified before and after.
- Two fleet instances ran this brief against one lane copy: this instance made
  the parity fold, ran the gate battery and ran the journeys; the other
  instance's work is in the tree as the follow-rule fold fix (`5ccf5758d`) with
  its own isolation runs. Every number in this receipt is one this instance
  measured at the rolled tip.
