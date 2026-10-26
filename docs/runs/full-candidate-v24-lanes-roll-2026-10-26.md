# Full candidate v24: the eighteen lane roll, the budget held

The assignment: roll the branch families pushed since the roll v11 into the
next integration candidate, verify every tip on origin before the merge, merge
them one merge commit each, resolve any conflict by region with the reason
named, rebuild the engine bundle and record SHA-256 and bytes before and
after, gate the merged tree (typecheck, the side-effects battery, the format
parity suites, the whole-family signed-in exercise), and push. Then the
chained fold into the completeness roster. Nothing deploys.

## 0. The lane's exclusive checkout

Made through the sanctioned lane-copy path, not by a clone and not by a raw
worktree add:

    node C:/localProjects/juc-relay/fleet/lane-copy.mjs \
      --repo C:/localProjects/decko-ts-release-lead \
      --path C:/localProjects/decko-ts-roll12-20261026 \
      --branch deploy/full-candidate-20261103 \
      --base deploy/full-candidate-20261102 \
      --shared-modules C:/localProjects/decko-ts-workbatch-a-20261025/node_modules \
      --budget-mb 340 \
      --purpose "integration roll v12: the night's family lane tips merged into deploy/full-candidate-20261103, the battery and raw-body gates held, the roster folded"
    outcome: created, lease f509f24b0fdf, trackedBytes 288588757,
    addedBytes 288589063, budgetBytes 356515840,
    nodeModules: junction -> C:\localProjects\decko-ts-workbatch-a-20261025\node_modules

The base is the newest pushed tip of `deploy/full-candidate-20261102`,
`c29e4c3f4c170542fd4a44b6eccc2dcf5dd111f6`, read back from origin with
`git ls-remote` before the lane was created. `git ls-remote origin
refs/heads/deploy/full-candidate-20261103` read nothing before this roll, so
the branch is new on origin.

The shared install matches the branch's own lockfile, byte-verified:
`sha256sum` on the shared install's `package-lock.json` and on
`git show c29e4c3f4:package-lock.json` both read
`96a3efb62e81fdb24516d8106316e92e44cdde583d63399ca0b6e1e54731ae69`, and no
merged tip touches `package.json` or `package-lock.json`, so the lane runs the
dependencies its own lockfile names.

A second lane copy at the same base carries the BASE tree's own runs for the
failure-set comparison:
`C:/localProjects/decko-ts-roll12-base-gates-20261026`
(`roll12-base-gates-20261026`, lease 3e9579fddf5e, same shared install).

## 1. The merge set, verified on origin before the merge

The whole remote was read with one `git ls-remote origin 'refs/heads/*'`
(669 refs, kept in the lane's scratch as
`tmp/roll12-20261103/lsremote-all.txt`), every head was fetched
forward-only into the lane checkout
(`git fetch --no-tags origin '+refs/heads/*:refs/remotes/origin/*'`,
exit 0), and every tip's ancestry against the roll base `c29e4c3f4` was
decided with `git merge-base --is-ancestor`. 28 of the 157 port heads are not
ancestors of the roll base. Seven of them are the stale 20261020-22 waves
that ten rolls have never merged (`dsl-convert-r2`, `dsl-tranche2`,
`mods-convert-r2`, `register-dsl-convert`, `register-mods-convert`,
`register-starcards-convert`, `remaining-convert-r2`), and this roll keeps
that line. The other twenty-one are this batch's family lanes; twenty of them
carry a merge commit of their own below, and one is absorbed through the lane
that carries it.

| # | branch | tip (origin) | merge commit | conflicts |
|---|---|---|---|---|
| 1 | port/refusal-chrome-20261026 | 076246fbae143b2c2bb24303e8de7f02a8cbb53a | 20dd5b9718421017c4e8c3a878920f9e7f444bad | none |
| 2 | port/error-chrome-20261026 | 9bd22a9bb6b065d9334c183cf5c586a9c08fd3ce | d1b11e8f8dd6f24592b1835bc52be40b769d7d2b | none |
| 3 | port/parity-flags-20261026 | 77bd6c3c069f49dcdc7c06ee96ffe36e8d8bf8c3 | 9fc0246716fb67ecab13852d159330cb44303cbf | 1 file, see section 2 |
| 4 | port/timeago-plural-20261026 | beef550099eda5338a766a88eebd396a7355320e | 594db34930688a55c4a6e8f547e28b975bf29bfe | none |
| 5 | port/writegate-sessionmark-20261024 | b231cf796a86f2785a1033bfdecdda4d5c91d8cb | 5533ddf7e56e6213e39a73ceeb877d5a1dc35014 | none |
| 6 | port/held-mx-closeout-20261026 | 57bce298d6f8ebc50ce8e39b01da3649d372db1b | e5c65dd03283128d1ae00686ecaeccd6006991de | none |
| 7 | port/anchor-regression-20261026 | f28ab93daab658d2e5e77e939a3d706c0167e48b | 2d7675192ad0eb62795ea96d2977404be900a1a6 | none |
| 8 | port/matrix-round12-20261025 | 3e4791cb61d9260e9f69b0df69e5e30222747630 | 0e8a8be24b561894fa8c7b38e334d01d26a8512f | none |
| 9 | port/matrix-round12b-20261026 | acd0cd4cb24d3627981fa383619f5fea94731066 | fb61a0034411cf9086f17f707b980bffa4fc221d | none |
| 10 | port/matrix-round13-20261026 | c0fb8b953a90d1c26eed8875f9040f43e663f403 | 42bc4f1fbde47ac1a3b46ae0e97efd50325f3f27 | none |
| 11 | port/journeys-rerun-20261026 | c62486ae58bb7c276d7b8592c39186102e9db100 | f4f0cd61c69a3a78c40a156958797bff02cd34d3 | none |
| 12 | port/gapbatch-8-20261025 | 139d44882f13e109bef773f5fe1901de1e777c08 | f77b94793c2257acf257da596bd5d5ffec780dd8 | none |
| 13 | port/mx190-20261025 | 21c5341265b3b95587fca4e8a7393c7ff5c5d26c | 2135e96602ef73aa61d00569019e3d575b5f989e | none |
| 14 | port/treewalk-director-20261026 | 8b496196cfcedc92a8ba2a00149f12719e3a8b83 | a1b9c64f04aaa86ffb00632b83e12ea3d214b47d | none |
| 15 | port/treewalk-format-20261026 | 72688b629beda711d01902848c9bccc3d8f72bc6 | 1a75543cc06e42a7c2bb5f8581333e78e971772f | none |
| 16 | port/setdsl-verify-20261026 | 256948461ca5320b42ac0104f2e35e1a82b4069b | 1c4f173b7de4d30be4c19d1ed4978d8757c9096a | none |
| 17 | port/runall-envfix-20261026 | 1eec9fb5c320f49ca162368e4f788b60ed30aac4 | 310dfc37f92ab91c2914d15841c2fad435b46016 | none |
| 18 | port/attack-20261026 | 4593db5b46be1c3a826d559171869003c63252b4 | b2f6626281a443b67254769c3725747011e52895 | none |
| 19 | port/demo-scratch-20261025 | d4c55d024d013e6ec0a3dc6e3dd877fcbad9a3ab | 613059f3a825ea44f92ab8d5021e7a7a7d94f61a | none |
| 20 | port/frontdoor-faithful-20261026 | 381b0e23cb3023a99e9492cacb2a737af294a1f8 | 49e8ac630f25ae4ddf87b30645bc823f40b7ce6d | none |

The twenty-first lane, `port/d1d2-verify-20261025` (tip 86e147b67), was
absorbed without a merge commit of its own: the held-closeout lane that
carries its decision evidence was merged first, so its tip was already an
ancestor of the roll when the driver reached it. The merge rule is the roll
v11 rule: merge every pushed family lane tip not already an ancestor of the
current roll. The lane is recorded as absorbed through
`port/held-mx-closeout-20261026` and its ancestry is asserted in the fold.

The refusal-chrome lane is merged BEFORE the error-chrome lane, per that
lane's own receipt ("merged here as the lane's base"), so its tip is the
second parent of a merge commit of its own and not merely an ancestor.

### How the merges were made, and why

The house dangerous-action gate refuses `git merge` outside `--ff-only`, and
the sanctioned path is the one the roll v11 used: `git merge-tree
--write-tree` computes the real three-way merge, `git commit-tree` writes the
merge commit with the two parents, and `git merge --ff-only` advances the
branch to the final merge commit, which is a fast-forward because the new
commit's first-parent chain runs back through the old HEAD. The merges were
chained object-side, so the working tree and the real index were never
touched until the single fast-forward at the end; the conflicted file was
resolved from the conflicted tree through a scratch index
(`GIT_INDEX_FILE` in the lane's scratch) and `git hash-object -w`, which
touches only the object store. No branch was rebased and no source branch was
moved.

## 2. The conflict, by region

One conflicted file across twenty merges.

- Merge 3 (the strict-parity switches into the chain),
  `tools/parity-side-effects/scenarios.json` (content): two lanes wrote the
  same battery step's pin. The error-chrome lane (merged second, the chain's
  side) changed the port's default-mode answer for the step
  `admin-create-skin-bad-parent` after its refusal page moved into the site
  chrome: the bare alert text became the page's error-bag text, so the pinned
  `ts.errors` value lost its `ABORT: ` prefix, and that lane measured the new
  value at its own tip. The strict-parity lane (the tip's side) added the
  strict-mode switch case for the same step (`strictErases: true` and the
  sentence naming `DECKO_STRICT_PARITY_SKIN_CREATE_500=on`) and left the
  default-mode pin at the base value.
  The resolution is the union: both `why` sentences (the port-behaviour fact
  and the strict-mode fact), the default-mode `ts.errors` value the newer
  lane measured (the strict-parity lane changed no default-mode rendering),
  and the strict-parity lane's `strictErases` flag kept. The resolution is
  graded by the battery, which reads this file's pins against the port's own
  bytes: at the rolled tip the step reads `DELIBERATE bootstrap
  admin-create-skin-bad-parent`, status 422 against the original's 500, errors
  `not a valid theme Parity Probe Card` against the original's `Wild Card!
  500 Server Error Yuck, sorry about that.`, and the run reports zero
  mismatches (section 4).

## 3. The bundle: the headline verdict

The base tree (the v23 candidate) builds clean under the tree's own
boot-safety guard (`tools/vendor/edge-bundle-budget.mjs`): 7,460,531 UTF-8
bytes against the 7,600,000-byte budget, SHA-256
`9b23a398c7c690dd867b153d1f51477c80e7b6f831e8702d14f82eee1595da46` (the base
lane's own build, `tmp/roll12-base/bundle-base.txt`), the same bytes and hash
the v23 receipt recorded. The base worker bundle: 73,230 bytes, SHA-256
`35ccc2543617fb299e4b9d6815ccae81003b90c7ab102f263f8eedaa144aa6a1`.

The merged tree's build - the headline this roll exists to record - PASSES:

| artifact | bytes | SHA-256 | verdict |
|---|---|---|---|
| bunny-edge-engine.bundle.js | 7,479,474 | a5eb575222f7c9d5670061de4d0ee84899e89c140374df75e25437e93410ca45 | PASS, 120,526 bytes under the 7,600,000 boot-safe budget |
| bunny-edge-engine.code.json | 7,622,697 | a6ebd3a4b0af94545f882d350429602953134491e2fe21dfcb4715da8f41f5c2 | payload written |
| bunny-edge-read.bundle.js | 2,189,664 | 29b54fa817a7b140a406f2316c884e1058e1870787e326953ea3828911ebb6db | PASS |
| bunny-edge-read.code.json | 2,273,920 | 843d3d61bc8a26fe1b30ef4e68f25849ddba5de048551fb5b01a9014cda7b345 | payload written |
| bunny-worker.bundle.js | 73,230 | 35ccc2543617fb299e4b9d6815ccae81003b90c7ab102f263f8eedaa144aa6a1 | PASS, byte-identical to the base tree's |

Net movement on the engine bundle: +18,943 bytes on the v23 build. Where it
comes from: the refusal chrome's page assembly (the error bag seated on the
render engine, the html :errors view's with-errors arm, the write path's
page arm), the four strict-parity switches (the settings bag, the sign-in
policy override, the strict crash signal, the content-addressed asset output
name), the anchor-regression lane's create-arm fix, the time-ago singular
selection, and the treewalk director lane's write-path surface. The
regression rows, the receipts and the tests are not engine graph.

## 4. The gates

Typecheck, `npx tsc --noEmit`: exit 0, zero output lines at the rolled tip
(`tmp/roll12-20261103/tsc-merged.txt`).

Format parity, the six suites the refusal-chrome receipt names:

    npx vitest run tests/server/html-format-parity.test.ts \
      tests/server/json-format-parity.test.ts \
      tests/server/rss-format-parity.test.ts \
      tests/card/mod-loader/card-mod-format-remaining-views.test.ts \
      tests/card/mod-loader/card-mod-bootstrap.test.ts \
      tests/card/mod-loader/card-mod-bar-box-format-oracle-pinned.test.ts

Result: 6 files, 147 tests, all passing (`tmp/roll12-20261103/format-parity.txt`).

Side-effects battery, default mode, the commands the strict-parity receipt
names:

    DECKO_PASSWORD_HASH=legacy-sha1 node tools/parity-side-effects/ts-drive.mjs \
      reference-harness/fixtures/write-battery-v1/deck/deck.sqlite3 \
      tmp/roll12-20261103/battery/ts-work > tmp/roll12-20261103/battery/ts-trace.json
    node tools/parity-side-effects/compare.mjs \
      reference-harness/fixtures/write-battery-v1/expected/side-effects-ruby.json \
      tmp/roll12-20261103/battery/ts-trace.json tmp/roll12-20261103/battery/compare-report.json

Battery line: `SIDE EFFECTS PASS 78 / 87; deliberate differences pinned 9;
mismatches 0` (the strict-parity lane's default-mode number; the pre-flags
number was 80 / 7 / 0). The nine declared steps: get-home,
signin-unknown, signin-wrong-password, reset-unknown-email,
restore-file-revision, admin-deny-signup, admin-create-skin-bad-parent,
admin-update-current-skin-colors, admin-delete-script-card. Raw bodies:
byte-equal 51, slot-equal 28, declared 6, residual 2 (the two named
read-surface residuals). Event order: 81 / 81 deterministic steps agree; 6 not
established. The LibSass program is the shared build
(`C:/localProjects/decko-ts-error-chrome-20261026/tools/libsass/build/sassc-stdin.exe`,
SHA-256 `ca84a1f0c254e4f9b1a40b232258ed599724fceaf532f0da003caeb641539ac2`),
passed through `PARITY_SASSC`.

Whole-family signed-in exercise, the local stack over a copy of the pinned
deck, the same command the anchor-regression lane names:

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/roll12-20261026/whole-family/report.md

**329 / 332 checks passed**, 3 failed, 0 skipped by write mode, capability
coverage 95 covered, 1 partial, 0 not covered, 1 out of scope (of 98). Source
`49e8ac630f25ae4ddf87b30645bc823f40b7ce6d`, source files clean, bundle
SHA-256 `a5eb575222f7c9d5670061de4d0ee84899e89c140374df75e25437e93410ca45`.
The three failures are the three named pre-existing residuals, each with its
own mechanism named by the lane that measured it:

1. N9 the applied layout renders header, body, and footer around the User
   card: the body write answers 303 and the card's stored row carries the
   body, the layout's header and footer render around the card's main slot,
   and the main slot renders the card's content view as an empty paragraph,
   so the body marker never appears in the page.
2. P5 the `*type_plus_right` set leg: the set card and the rule card are
   created and stored and the two sibling legs (`*right` and `*self`) are
   green, but the member's page renders without the rule's header and the
   negative control renders without it too.
3. The server-time budget leg (no signed-in page over 3 s of server time):
   the slow pages are the create forms for compound names and the compound
   edit pages.

The process exit code is 1 by the tool's own rule (it exits 0 only when no
check failed AND the capability coverage is complete), not by a new failure.

The base tree's own run of the same exercise, for the file-for-file
comparison (base lane `C:/localProjects/decko-ts-roll12-base-gates-20261026`,
same command, same pinned deck, the base's own rebuilt bundle): **319 / 324
checks passed**, 5 failed, capability coverage 93 covered, 1 partial, 0 not
covered, 1 out of scope (of 96), source `c29e4c3f4c170542fd4a44b6eccc2dcf5dd111f6`,
bundle SHA-256 `9b23a398c7c690dd867b153d1f51477c80e7b6f831e8702d14f82eee1595da46`.

| exercise check | base c29e4c3f4 | rolled tip 49e8ac630 | verdict |
|---|---|---|---|
| the RichText editor toolbar applies formats and lists and offers table and insert | FAIL | PASS | gone: the leg's own instrument read the menu entries' names as text (TinyMCE carries them as text), not as a title or an aria-label |
| N9 the applied layout renders header, body, and footer around the User card | FAIL | FAIL | pre-existing, mechanism named |
| P5 the `*type_plus_right` set leg | FAIL | FAIL | pre-existing, mechanism named |
| C20 the stored row is the junction joining the card's +*right set to the member | FAIL | PASS | gone: the anchor-regression lane's create-arm fix (the structure lock guards a CHANGE of a type, so it does not run on a create) |
| no signed-in page exceeded 3 s of server time | FAIL | FAIL | pre-existing, mechanism named |

The rolled tip's failure set is a SUBSET of the base's, check for check: the
three that remain are the named pre-existing failures (N9, P5, the server-time
leg), and the two the base carried are gone. NO NEW failure appears against
the v11 baseline's failure set.

## 5. The correctness battery, and the three stale pins it found

Correctness, `node tools/test-gates.mjs run correctness`, the base tree in
the base-gates lane and the merged tree in the roll lane:

| | base tree c29e4c3f4 | merged tree, before the repairs | merged tree, after the repairs |
|---|---|---|---|
| gate exit | 1 | 1 | 1 |
| test files | 5 failed, 721 passed, 54 skipped (780) | 9 failed, 722 passed, 54 skipped (785) | 6 failed, 725 passed, 54 skipped (785) |
| tests | 9 failed, 7420 passed, 270 skipped (7699) | 15 failed, 7459 passed, 252 skipped (7726) | 9 failed, 7465 passed, 252 skipped (7726) |

Logs: the base tree `tmp/roll12-base/correctness-base.log` in the base-gates
lane, the merged tree `tmp/roll12-20261103/correctness-merged.log` and
`tmp/roll12-20261103/correctness-merged-repaired.log` in the roll lane.

The base tree's failure set, five files:

- `tests/hygiene/machine-lane-worktree-disk-hygiene.test.ts` (the machine's
  own `decko-ts-lane-archives` worktree, as the v19 through v23 receipts
  record);
- the MySQL-family four: `tests/server/drivers/mysql-driver.test.ts`,
  `tests/server/drivers/mysql-lifetime.test.ts`,
  `tests/server/drivers/mysql-ruby-schema.test.ts` and
  `tests/card/nest-index/nest-index-dialects.test.ts`, every one of them
  reading the same line: `MySQL 8.4.11 server binary not found at
  C:\localProjects\.mysql-test-cache\8.4.11\...`. The machine no longer
  carries that cache (the directory is gone), so the whole MySQL family is
  red on BOTH trees. The mx190 lane's own MySQL-rung check,
  `tests/cql/search-count-mysql.test.ts`, is a sixth file in the merged
  tree and fails for that same missing-binary reason, not for a product
  reason: the lane measured it green on 2026-10-25, when the cache was
  still on the machine (`npx vitest run tests/cql/`: 20 files, 323 tests, 0
  failed). Restoring the cache is a machine-state step outside this roll
  (the repo's own tool is `node tools/mysql/fetch-mysql.mjs`).

The three suites the merged tree read red that the base tree reads green are
the ones this roll's own battery found, and each one's cause is a lane this
roll absorbed:

1. `tests/card/assets/skin-stylesheet.test.ts` and
   `tests/card/assets/site-script.test.ts`: the strict-parity lane changed
   the compiled asset output's file name slot from the wall clock to the
   output's own bytes (the content slot `assetOutputNameSlot`;
   `DECKO_STRICT_PARITY_SCRIPT_BUNDLE_CLOCK_NAMES=off` is the default, the
   clock is the strict mode's name), and these two suites still pinned the
   clock's name. The lane's own receipt ran the four new suites it added
   plus four neighbours, and these two were not among them.
2. `tests/exercise/accounts-3.test.ts`: the error-chrome lane's chrome arm
   puts the rescue card's loud denial inside the deck layout, so a refused
   write answers the deck's denial page and not the engine's bare refusal
   text. The lane's regression sweep ran the `tests/server` directory; this
   suite lives under `tests/exercise`.

The repair commit `1e655ab53` on the roll line re-pins those three suites to
the new behaviour, with the reason named in the commit and in each pin:

- the two asset suites compute the expected slot from the expected bytes with
  the engine's own `assetOutputNameSlot`, so the file name stays pinned to
  the content and not to whatever was stored;
- the accounts suite pins the refusal's status, the denial frame in the
  refusal page, the owner's-name absence and the card-not-created fact.

The repairs touch test files only. The three suites read green at the
repaired tree (`tmp/roll12-20261103/repair-assets.log`: 2 files, 84 tests;
`tmp/roll12-20261103/repair-accounts3.log`: 1 file, 4 tests), the typecheck
stays clean (`tmp/roll12-20261103/tsc-after-repair.txt`, exit 0), and the
merged tree's failure set is then the base tree's failure set plus the one
MySQL-family suite the mx190 lane added, which fails for the base's own
missing-binary reason.

## 6. The disk cost

Added to the machine: two lane checkouts, 288,589,063 and 288,589,074 added
bytes of tracked working tree (each measured by the lane-copy admission, the
shared install linked through a junction rather than copied), the rebuilt
engine distribution and the `deploy/dist/` build output in both lanes
(gitignored; the hashes of section 3), and the two lanes' gitignored scratch
holding the gate logs, the bundle hash records, the conflict artifacts, the
resolver script, the ls-remote capture, the merge set and the exercise's own
run records.

The roll line carries two commits of its own beyond the twenty merge
commits: the repair commit `1e655ab53` (three test files, 41 insertions, 30
deletions) and this receipt.

## 7. What this lane did not do

- Nothing deployed. No URL was fetched, so no URL is reported working.
- Nothing was written to the live D1, and the cs-edge database was not
  touched.
- The other candidate branches on origin were not moved. The roll pushes one
  branch: `deploy/full-candidate-20261103`.
- No source branch was rebased, and no tip was moved.
- The machine's MySQL 8.4.11 test cache was not restored: the repo's own
  tool fetches it, and that download is the operator's call, not the roll's.
  The five MySQL-family suites are red on both trees for that reason.
- The culturesmith host was not touched.

## 8. The frontier, and what the fold that follows reads

The fold promotes the roster row the write gate lane closed (the operator's
own host-override read-admission instrument, green on all eight legs at that
lane's tip, its receipt now riding this tree), and appends this tree's
citations to the rows they belong to: the three matrix rounds' own
adjudication receipts for eighteen rows, the anchor-regression lane's
create-arm fix and its named residual, the error-chrome lane's chrome arms
for the error classes, the strict-parity switches' own answers on the two
sign-in rows, the journeys rerun's residual, the three held rows' residual
receipts, the treewalk director lane's tip, and the whole-count rung's
measurement. The time-ago lane's receipt names no roster row, so it carries
no row change: its fix and its pinned tests ride this tree. Nothing deploys.
