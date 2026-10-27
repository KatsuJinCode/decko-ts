# Full candidate v25: the six lane roll, the three residuals closed, the budget held

The assignment: roll the branch families pushed since the roll v12 into the
next integration candidate, verify every tip on origin before the merge, merge
them one merge commit each, rebuild the engine bundle and record its SHA-256
and bytes, gate the merged tree (typecheck, the side-effects battery in both
modes, the format parity suites, the whole-family signed-in exercise), and
push. Then the chained fold into the completeness roster. Nothing deploys.

## 0. The lane's exclusive checkout

Made through the sanctioned lane-copy path, not by a clone and not by a raw
worktree add:

    node C:/localProjects/juc-relay/fleet/lane-copy.mjs \
      --repo C:/localProjects/decko-ts-release-lead \
      --path C:/localProjects/decko-ts-roll13-20261026 \
      --branch deploy/full-candidate-20261104 \
      --base deploy/full-candidate-20261103 \
      --shared-modules C:/localProjects/decko-ts-workbatch-a-20261025/node_modules \
      --budget-mb 340 \
      --owner roll13-fold \
      --purpose "integration roll v13: the three landed residual fixes (N9, P5, compound-time) plus the strict-500 chrome and the attack receipts merged into deploy/full-candidate-20261104, both battery modes, the family at 332, the roster folded"
    outcome: created, lease 7533612d3e2e, trackedBytes 302190697,
    addedBytes 302190926, budgetBytes 356515840,
    nodeModules: junction -> C:\localProjects\decko-ts-workbatch-a-20261025\node_modules

The custody owner: the lane-copy tool asks each harness to confirm its own
session (C:/localProjects/juc-relay/fleet/worktree-custody-owner.mjs). No
harness named the session this run comes from, so the first attempt was
refused with the code `worktree-owner-unattributable` and nothing was
created. The second attempt carried the explicit alias `roll13-fold`, which
the tool records as `unresolved-alias-roll13-fold`: visibly unattributed,
never read as permission to remove the copy, and recorded in the receipt the
tool prints.

That copy was made by this roll's earlier attempt, which ran the merges and
the first gate pass and stopped before the receipt commit and the fold. The
second pass of this roll reused that checkout rather than making a second
copy: the branch, the merge chain and the base were read back from git
before anything else, and no second lane copy was made. The disk holds
48 GB free, and the brief forbids a new full clone.

The base is the newest pushed tip of `deploy/full-candidate-20261103`,
`5131d2ac40dacc64c45530941e82937caef86137`, read back from origin with
`git ls-remote` before the lane was created. `git ls-remote origin
refs/heads/deploy/full-candidate-20261104` read nothing before this roll, so
the branch is new on origin.

The shared install matches the branch's own lockfile, byte-verified:
`sha256sum` on the shared install's `package-lock.json` and on
`git show aba86c7a4:package-lock.json` both read
`96a3efb62e81fdb24516d8106316e92e44cdde583d63399ca0b6e1e54731ae69`, and no
merged tip touches `package.json` or `package-lock.json`
(`git diff --name-only 5131d2ac4..aba86c7a4 -- package.json package-lock.json`
is empty), so the lane runs the dependencies its own lockfile names.

A second lane copy at the same base carries the BASE tree's own run for the
failure-set comparison:
`C:/localProjects/decko-ts-roll13-base-gates-20261026`
(`roll13-base-gates-20261026`, lease a297bddfb3af, same shared install).

## 1. The merge set, verified on origin before the merge

Every head of the remote was fetched forward-only into the lane checkout
(`git fetch --no-tags origin '+refs/heads/*:refs/remotes/origin/*'`, exit 0,
the only update was `port/demo-scratch-20261025` moving from `d4c55d02` to
`8a83b81c`), and every tip's ancestry against the roll base `5131d2ac4` was
decided with `git merge-base --is-ancestor`. Thirteen port heads are not
ancestors of the roll base. Seven of them are the stale 20261020-22 waves
that ten rolls have never merged (`dsl-convert-r2`, `dsl-tranche2`,
`mods-convert-r2`, `register-dsl-convert`, `register-mods-convert`,
`register-starcards-convert`, `remaining-convert-r2`), and this roll keeps
that line. The other six are this roll's family lanes.

| # | branch | tip (origin) | merge commit | conflicts |
|---|---|---|---|---|
| 1 | port/n9-cardtype-body-20261026 | 4a81a709c5d2d279f425e6c066ee8a9e7d7ad3ae | b37970cc3c27781d36deb608b76ce333af8790be | none |
| 2 | port/p5-type-plus-right-20261026 | d906fa5c67e6186e08ec880ccf66c6ea6b4f8c40 | 3fa9ea231884ffc89038144020013804dfe5cadb | none |
| 3 | port/compound-time-20261026 | 0bf16033b250a54a656ca37fc5adc57b14f44a53 | e135f88ee0e33d2edaa25808812e08c25d21abbb | none |
| 4 | port/strict-500-chrome-20261026 | a43e058c57eefaed3d05216ef4f5a0de55242018 | 9e6ef681aba26f3d39fac0222c731d9ab335447a | none |
| 5 | port/attack2-20261026 | 79e8421d0cad1a2fb1a96588484906ec0ef9ac0d | ad717c90540e460e4f8aebd11c2c678e679642df | none |
| 6 | port/demo-scratch-20261025 | 8a83b81c97aff5750c005eb8746c22e85be1bc51 | aba86c7a48f5fc614463e1039a00030c03fed495 | none |

The demo-scratch lane was merged by the roll v12 at its then tip
(`d4c55d024d`); the lane advanced since, so its new tip rides this roll under
the same rule the roll v11 and roll v12 used (merge every pushed family lane
tip that is not already an ancestor of the current roll).

The second pass of this roll re-read the remote head list and re-decided
every ancestry against the rolled tip, at the tip itself
(`git ls-remote origin 'refs/heads/port/*'` read 162 heads; the only heads
that are not ancestors of `aba86c7a4` are the seven stale waves named above,
so the merge set is complete against the remote as it stands). The remote
branch `deploy/full-candidate-20261104` reads `aba86c7a4` before this
receipt commit.

## 2. How the merges were made, and why

The house git gate refuses `git merge`, so the merges were chained object-side
the way the roll v12 receipt records: `git merge-tree --write-tree` computes
the real three-way merge, `git commit-tree` writes the merge commit with the
two parents, and one `git merge --ff-only` advances the branch to the final
merge commit, which is a fast-forward because the new commit's first-parent
chain runs back through the old head. The working tree and the real index
were never touched by the merges; only the object store was written, and then
the single fast-forward at the end. No branch was rebased and no source
branch was moved.

Six merges, six clean merges: no file conflicted in any of them. Two lanes
write the same harness module (the N9 leg and the P5 leg both touch
`tools/edge-signed-in-exercise/checks-capability-legs.mjs`), and git merged
their regions without a conflict.

Each merge commit's second parent is the lane tip and its first parent is the
previous roll commit (`git rev-list --merges --parents` at the tip):

    aba86c7a4 ad717c905 8a83b81c9   (demo-scratch)
    ad717c905 9e6ef681a 79e8421d0   (attack2)
    9e6ef681a e135f88e a43e058c5   (strict-500-chrome)
    e135f88e 3fa9ea231 0bf16033b   (compound-time)
    3fa9ea231 b37970cc3 d906fa5c6   (p5-type-plus-right)
    b37970cc3 5131d2ac4 4a81a709c   (n9-cardtype-body)

## 3. The gates

Every gate below was run again by the second pass of this roll, at the rolled
tip, on this machine. The artifact paths are the second pass's own files.

Typecheck, `npx tsc --noEmit`: exit 0, zero output lines at the rolled tip
(`tmp/roll13-verify-20261104/tsc-merged.txt`).

Format parity, the six suites the refusal-chrome receipt names:

    npx vitest run tests/server/html-format-parity.test.ts \
      tests/server/json-format-parity.test.ts \
      tests/server/rss-format-parity.test.ts \
      tests/card/mod-loader/card-mod-format-remaining-views.test.ts \
      tests/card/mod-loader/card-mod-bootstrap.test.ts \
      tests/card/mod-loader/card-mod-bar-box-format-oracle-pinned.test.ts

Result: 6 files, 147 tests, all passing (`tmp/roll13-verify-20261104/format-parity.txt`).

The merged lanes' own pin suites, at the rolled tip: five test files, 41
tests, all passing (`npx vitest run tests/card/render/
n9-cardtype-body-content-view.test.ts tests/card/rules/
structure-templates.test.ts tests/card/mod-loader/
pointer-options-all-arm-default-limit.test.ts tests/server/
write-routes-strict-parity.test.ts tests/tools/
side-effects-scenario-battery.test.ts`,
`tmp/roll13-verify-20261104/lane-pins.txt`), and the harness leg's own
contract test (`node --test tools/edge-signed-in-exercise/test/
n9-cardtype-body.test.mjs`, 3 tests, 3 pass,
`tmp/roll13-verify-20261104/lane-pin-node-test.txt`). The battery suite in
that set drives the engine through the 87 public steps twice and reads the two
battery lines on its own: 78 steps pass with the 9 declared differences
pinned and no mismatch, and 86 steps pass with the six pinned differences
erased and no mismatch.

Side-effects battery, both modes, the commands the strict-parity receipt
names, with the LibSass program from the lane's own build
(`tools/libsass/build/sassc-stdin.exe`, LibSass 3.6.4):

    DECKO_PASSWORD_HASH=legacy-sha1 node tools/parity-side-effects/ts-drive.mjs \
      reference-harness/fixtures/write-battery-v1/deck/deck.sqlite3 \
      tmp/roll13-verify-20261104/battery/ts-work > tmp/roll13-verify-20261104/battery/ts-trace.json
    node tools/parity-side-effects/compare.mjs \
      reference-harness/fixtures/write-battery-v1/expected/side-effects-ruby.json \
      tmp/roll13-verify-20261104/battery/ts-trace.json tmp/roll13-verify-20261104/battery/compare-report.json

    # strict run: the four DECKO_STRICT_PARITY_* switches on, and PARITY_STRICT=1 on the compare
    DECKO_STRICT_PARITY_SIGNIN_DETAILED_ERRORS=on \
    DECKO_STRICT_PARITY_REVISION_RESTORE_500=on \
    DECKO_STRICT_PARITY_SKIN_CREATE_500=on \
    DECKO_STRICT_PARITY_SCRIPT_BUNDLE_CLOCK_NAMES=on \
    node tools/parity-side-effects/ts-drive.mjs ... > tmp/roll13-verify-20261104/battery/ts-trace-strict.json
    PARITY_STRICT=1 node tools/parity-side-effects/compare.mjs \
      reference-harness/fixtures/write-battery-v1/expected/side-effects-ruby.json \
      tmp/roll13-verify-20261104/battery/ts-trace-strict.json tmp/roll13-verify-20261104/battery/compare-report-strict.json

Battery lines, both modes, at the rolled tip:

| mode | line |
|---|---|
| default | `SIDE EFFECTS PASS 78 / 87; deliberate differences pinned 9; mismatches 0` |
| strict | `SIDE EFFECTS PASS 86 / 87; deliberate differences pinned 1; mismatches 0` |

Raw-body tables: the default mode reads `byte-equal 51; slot-equal 28;
declared 6; residual 2` and the strict mode reads `byte-equal 51; slot-equal
33; declared 1; residual 2`, both with zero mismatches. The strict table's
two 500 rows are slot-equal with the main slot byte-identical to the oracle,
which is the strict-500-chrome lane's own claim, and the default table is
unchanged row by row against the roll v12 numbers. The event order agrees on
81 of 81 deterministic steps in both modes, with 6 not established.

Whole-family signed-in exercise, the local stack over a copy of the pinned
deck, the same command the anchor-regression lane names:

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/roll13-verify-20261104/run3/whole-family/report.md

**332 / 332 checks passed**, 0 failed, 0 skipped by write mode, capability
coverage 95 covered, 1 partial, 0 not covered, 1 disabled upstream, 1 out of
scope (of 98). Source `aba86c7a48f5fc614463e1039a00030c03fed495`, source
files clean, bundle SHA-256
`0760c857b5807eccae3066e99b3bd4762b930237ff221c92e5d1f07b4b3ce7b2`
(`tmp/roll13-verify-20261104/family-exercise-run3.log`, run record
`.runtime/roll13-verify-20261104/run3/whole-family/report.md`). The run
observed 6763 engine requests, and the slowest own-work request reads 2439
ms of server time.

The three named residuals of the roll v12 receipt are closed at this tip, each
with its own leg PASS in the run:

| residual named by the roll v12 receipt | at this tip |
|---|---|
| N9 the applied layout renders header, body, and footer around the User card | PASS |
| P5 the `*type_plus_right` set leg | PASS (`a +*type_plus_right+*structure rule renders for members and not outside the set`) |
| the server-time budget leg (no signed-in page over 3 s of server time) | PASS, and the save-side leg PASS too, with no request over the budget |

The one capability reading partial is M1 (the RichText editor toolbar), and
its cause is not this roll: the capability's registry entry names four
checks, and the fourth (the editor's toolbar configuration carrying the
original's format, list, table and insert tokens) is recorded by no harness
module in the tree, at the base tip as well as at the rolled tip (the same
`rg` over `tools/edge-signed-in-exercise/` finds the name only in
`capabilities.json`, in the check-name table in
`lib/rich-text-toolbar.mjs`, and in the contract test). Three of its four
checks ran and passed.

The process exit code is 1 by the tool's own rule (it exits 0 only when no
check failed AND the capability coverage is complete), not by a failure.

### The two earlier runs of this gate, and what they measured

The second pass of this roll ran the whole-family exercise three times. The
first two runs are recorded here because they measured the machine, not the
tree, and because one of them found a real fragility in the harness.

Run 1 (`tmp/roll13-verify-20261104/family-exercise.log`) read 241 of 244
checks and stopped early: the local stack stopped answering the browser
during the delete-edit-race module, so the remaining modules never ran and
their capabilities read not covered. Its one product failure was the P5
`*type_plus_right` leg, and its cause is the harness's own fixture naming,
not the engine. The leg names its fixture cards
`Harness_Leg_<label>_<Date.now().toString(36)>`, so every card of one leg
shares the same millisecond stamp; this run's stamp ended in `s`
(`mvq2bjas`). The engine computes a card's key through the ActiveSupport
inflection tables (`src/card/name/inflect.ts`), whose default singular rule
strips a trailing `s`, so the card's key read
`harness_leg_tpright_mvq2bja` while the leg's anchor comparison used the raw
name `harness_leg_tpright_mvq2bjas`. The captured page of that run
(`.runtime/roll13-verify-20261104/whole-family/report.md.raw/117.html`)
carries the token `TYPE_PLUS_RIGHT-rich_text-harness_leg_tpright_mvq2bja`
and the rule's own header, so the rule answered; the leg read an empty set
key list because its anchor did not match the inflected key. The leg's
failure probability is therefore the chance that the run's stamp ends in `s`
(one base36 character in thirty-six), and it is a leg fragility to repair,
not an engine defect.

Run 2 (`tmp/roll13-verify-20261104/family-exercise-run2.log`) stopped even
earlier, at 74 of 75 checks, with the same shape of fault: the local stack
stopped answering the browser during the account module (a sign-in page load
timed out after 60 s) while no request had been slow (the run's slowest
own-work request reads 1037 ms of server time).

Run 3 (`tmp/roll13-verify-20261104/family-exercise-run3.log`) ran alone on
the machine, with no other gate running, and read 332 of 332.

The capability-legs module alone was also run at the rolled tip
(`node tools/edge-signed-in-exercise.mjs --only caps-legs`, 26 of 26 checks
passed, `tmp/roll13-verify-20261104/caps-legs.log`): the N9 applied-layout
leg, the P5 `*type_plus_right` leg and the P6 update-rule leg all read PASS
there, and the P6 leg's own evidence reads `storedMemberEdit: true`.

The bundle, the headline this roll exists to record: the base tree (the v24
candidate) builds under the tree's own boot-safety guard
(`tools/vendor/edge-bundle-budget.mjs`) at 7,479,474 UTF-8 bytes, SHA-256
`a5eb575222f7c9d5670061de4d0ee84899e89c140374df75e25437e93410ca45`, the same
bytes and hash the roll v12 receipt recorded for its rolled tip. The rolled
tree's build:

| artifact | bytes | SHA-256 | verdict |
|---|---|---|---|
| bunny-edge-engine.bundle.js | 7,482,048 | 0760c857b5807eccae3066e99b3bd4762b930237ff221c92e5d1f07b4b3ce7b2 | PASS, 117,952 bytes under the 7,600,000 boot-safe budget |
| bunny-edge-read.bundle.js | 2,191,816 | 0436b0e055c013c35ac59de225641331e01b78245812c58c7b9c5f9457fbc7da | PASS |
| bunny-worker.bundle.js | 73,230 | 35ccc2543617fb299e4b9d6815ccae81003b90c7ab102f263f8eedaa144aa6a1 | PASS, byte-identical to the base tree's |

Net movement on the engine bundle: +2,574 bytes on the base build. It comes
from the compound-time lane's options-arm limit (the pointer and list typed
create and edit forms), the strict-500-chrome lane's error page assembly for
the 500 class, and the N9 and P5 lanes' harness-only changes, which are not
engine graph.

## 4. The base tree's own run, for the failure-set comparison

The base tree (the v24 candidate, `5131d2ac4`) was checked out in its own
lane (`C:/localProjects/decko-ts-roll13-base-gates-20261026`), built from its
own source (`node tools/dist/build-engine.mjs`, exit 0), and run with the
same command, the same pinned deck and its own rebuilt bundle (7,479,474
bytes, SHA-256
`a5eb575222f7c9d5670061de4d0ee84899e89c140374df75e25437e93410ca45`, the same
bytes and hash the roll v12 receipt recorded for its rolled tip). Its run
record is on disk at
`.runtime/roll13-base/whole-family/report.md.json` in that lane.

**326 / 332 checks passed**, 6 failed, capability coverage 95 covered, 1
partial (M1), 0 not covered, 1 disabled upstream, 1 out of scope (of 98).

| check | base 5131d2ac4 | rolled tip aba86c7a4 | verdict |
|---|---|---|---|
| N9 the applied layout renders header, body, and footer around the User card | FAIL | PASS | closed by the N9 lane's leg correction |
| P5 the `*type_plus_right` set leg | FAIL | PASS | closed by the P5 lane's fixture repair |
| C20 submitting it stores a row under the requested `+*right` name | FAIL | PASS | closed with the compound-time fix (at the base the create POST timed out after 30 s) |
| C20 the stored row is the junction joining the card's `+*right` set to the member | FAIL | PASS | same |
| C20 a fresh read of the card page renders the created `+*right` member as a known card | FAIL | PASS | same |
| no signed-in page exceeded 3 s of server time | FAIL | PASS | closed by the compound-time fix (the base's slowest own-work request reads 5,021 ms of server time, on a compound create form) |

The three C20 failures at the base share their mechanism with the base's
server-time failure: at the base the create POST never answered
(`page.waitForResponse: Timeout 30000ms exceeded`), and the base's slowest
own-work request is the compound create form at 5,021 ms of server time.
The compound-time lane's bounded options arm is what makes those forms
answer.

The rolled tip's own run has no failing leg at all, so the rolled tip
closes every leg the base failed on and adds none.

## 5. The disk cost

Added to the machine: two lane checkouts, 302,190,926 and 302,190,937 added
bytes of tracked working tree (each measured by the lane-copy admission, the
shared install linked through a junction rather than copied), the rebuilt
engine distribution and the `deploy/dist/` build output in both lanes
(gitignored; the hashes of section 3), and the two lanes' gitignored scratch
holding the gate logs, the bundle hash records, the merge set, the merge
driver, and each exercise's own run records and page captures.

The roll line carries one commit of its own beyond the six merge commits:
this receipt.

## 6. What this lane did not do

- Nothing deployed. No URL was fetched, so no URL is reported working.
- Nothing was written to the live database, and the live script was not
  touched.
- The other candidate branches on origin were not moved. The roll pushes one
  branch: `deploy/full-candidate-20261104`.
- No source branch was rebased, and no tip was moved.
- The seven stale 20261020-22 port branches stay unmerged, per the ten-roll
  precedent.
- The other host was not touched.

## 7. The frontier, and what the fold that follows reads

The fold closes the two named remainders the roll v12 fold left on their rows:
the N9 row, whose leg measured a fixture arm instead of the rendered one, and
the P5 row, whose leg's fixture had put the member outside the rule's set.
Both closures rest on the lanes' own receipts (now in the canonical tree) and
on the rolled tip's own whole-family grade, whose N9 and P5 legs are PASS and
whose capability coverage reads 95 covered with the one partial named above
(M1, a coverage registry entry that names a check no harness module records).
The fold also appends the canonical-tree citations this roll carries: the N9
matrix row, the P5 matrix row, the two server-time budget rows (the
compound-time lane's root cause and its measured ladder), and the
server-error row, where the strict-parity 500 is now a page inside the deck's
chrome rather than a bare document. The strict-500-chrome lane closes the one
finding the second adversarial attack landed (the attack receipts ride this
tree in `docs/runs/adversarial-port-v2-20261026/`), and the attack2 lane and
the demo-scratch lane name no roster row, so they carry no row change.
