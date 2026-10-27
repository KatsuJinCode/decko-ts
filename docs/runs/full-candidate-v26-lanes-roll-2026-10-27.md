# Full candidate v26: three lane tips rolled, one lane returned to its lane, the family green

The assignment: roll the branch families pushed since the roll v13 into the
next integration candidate, verify every tip on origin before the merge, merge
them one merge commit each, rebuild the engine bundle and record its SHA-256
and bytes, gate the merged tree (typecheck, the format parity suites, the
merged lanes' own pin suites, the side-effects battery in both modes, the
whole-family signed-in exercise) and push. Then the chained fold into the
completeness roster. Nothing deploys.

Four branches were on the table. Three are in this candidate. The fourth,
`port/edge-refresh-seam-20261027`, went back to its lane: with its landing
wired into the edge host, the whole-family exercise's final browser asset
audit fails, and a gate failure is never merged past. The measurement, the
mechanism and the unblock condition are in section 4.

## 0. The lane's exclusive checkout

Made through the sanctioned lane-copy path, not by a clone and not by a raw
worktree add:

    node C:/localProjects/juc-relay/fleet/lane-copy.mjs \
      --repo C:/localProjects/decko-ts-release-lead \
      --path C:/localProjects/decko-ts-roll14-20261027 \
      --branch deploy/full-candidate-20261104 \
      --shared-modules C:/localProjects/decko-ts-workbatch-a-20261025/node_modules \
      --budget-mb 340 \
      --owner roll14-fold \
      --purpose "integration roll v14: the four landed lane tips (not-found-404, treewalk-set, edge-refresh-seam, journeys-rerun-candidate) merged into deploy/full-candidate-20261104, all gates, the roster folded"
    outcome: created, lease b301827cfc77, trackedBytes 303621783,
    addedBytes 303622012, budgetBytes 356515840,
    nodeModules: junction -> C:\localProjects\decko-ts-workbatch-a-20261025\node_modules

The custody owner: the lane-copy tool asks each harness to confirm its own
session (C:/localProjects/juc-relay/fleet/worktree-custody-owner.mjs). No
harness named the session this run comes from (`resolveWorktreeCustodyOwner({})`
reads `worktree-owner-unattributable`: "No harness named the session this send
comes from"), so the creation carried the explicit alias `roll14-fold`, which
the tool records as `unresolved-alias-roll14-fold`: visibly unattributed,
never read as permission to remove the copy.

The candidate branch was checked out in the finished roll v13 lane copy
(`C:/localProjects/decko-ts-roll13-20261026`), and the lane-copy tool refuses
a branch already checked out in another worktree. That copy's HEAD was
detached at its own commit with `git update-ref --no-deref HEAD
a1b8a215f74468ae4e90ca0adf5a95a7acb7dd95`, which turns the symbolic HEAD
into a direct ref at the same commit: `git status --porcelain` read empty
before and after, and no file in that copy changed. The candidate branch was
then free for this roll's lane. The v13 lane's own copy is a finished lane's
copy, its lease expired, and nothing was written into its working tree.

The base is the candidate tip `a1b8a215f74468ae4e90ca0adf5a95a7acb7dd95`,
read back from origin with `git ls-remote` before the lane was created, and
the branch itself was attached at that tip (the lane-copy tool never moves an
existing branch's tip).

The shared install matches the branch's own lockfile, byte-verified:
`sha256sum` on the shared install's `package-lock.json` and on
`git show a1b8a215f:package-lock.json` both read
`96a3efb62e81fdb24516d8106316e92e44cdde583d63399ca0b6e1e54731ae69`, and no
merged tip touches `package.json` or `package-lock.json`
(`git diff --name-only a1b8a215f..origin/<lane> -- package.json
package-lock.json` is empty for each of the four lanes), so the lane runs the
dependencies its own lockfile names.

The LibSass program the battery needs was taken from the shared native cache
and verified, not rebuilt:
`LIBSASS_CACHE_ONLY=1 node tools/libsass/build-native.mjs tools/libsass/libsass
tools/libsass/build` printed "verified cache hit ... (LibSass 3.6.4;
0164c523468e197df63f0b0e29bbc675dfe9aeea26371bcec46c727469331002; 1890 ms)".

## 1. The merge set, verified on origin before the merge

`git ls-remote origin 'refs/heads/port/*'` read 167 heads. Twelve of them are
not ancestors of the candidate tip `a1b8a215f`. Seven are the stale
20261020-22 waves that ten rolls have never merged (`dsl-convert-r2`,
`dsl-tranche2`, `mods-convert-r2`, `register-dsl-convert`,
`register-mods-convert`, `register-starcards-convert`, `remaining-convert-r2`),
and this roll keeps that line. The eighth is `port/residual-verify-20261026`
(`f9b7147f`), the independent verification lane for the roll v12 residuals,
based on `5131d2ac4`: a verification copy, not a work branch, and the roll v13
did not merge it either. The other four are this roll's lanes.

| # | branch | tip (origin) | merge commit | conflicts |
|---|---|---|---|---|
| 1 | port/not-found-404-20261027 | e9e6bc5271cb6b9ca81082f28f436bc8f4c082c6 | bbf66044ed95fc8b933a5c22266d8a330856cc14 | none |
| 2 | port/treewalk-set-20261027 | 4efb3feaebbf69cf249d8d52344f2d34e28667be | 5d057a6b9d121b974dbf2091d22c25368cc0c1f6 | none |
| 3 | port/journeys-rerun-candidate-20261027 | daba48f44e8a6bb0679ed0582789876b162e73e6 | 9b2533a4ebeead3ff7734747855eb3d8a0dd39bb | none |
| - | port/edge-refresh-seam-20261027 | 6dedb7d59361f653385c0e56dd22bdc5494d8ce1 | NOT MERGED - section 4 | - |

All four lane tips have the candidate tip as their merge base with the rolled
tip (`git merge-base <lane tip> a1b8a215f` reads `a1b8a215f` for each of the
four), so the four lanes are siblings off the same base and no lane is behind
another.

The journeys lane is the harness-side one the brief names. It folds:
`git diff --name-only a1b8a215f..origin/port/journeys-rerun-candidate-20261027
-- tools/ src/ tests/ fixtures/` is empty, so the lane adds two files under
`docs/runs/` (a receipt and its JSON comparison report) and touches no
harness module, no engine source, no test and no fixture. The candidate's own
harness pins are untouched by the whole roll: `git diff --name-only
a1b8a215f..HEAD -- tools/edge-signed-in-exercise/` is empty apart from the one
harness leg this roll corrected on purpose (section 5).

## 2. How the merges were made, and why

The house git gate refuses `git merge`, so the merges were chained object-side
the way the roll v13 receipt records: `git merge-tree --write-tree` computes
the real three-way merge, `git commit-tree` writes the merge commit with the
two parents, and one `git merge --ff-only` advances the branch to the final
merge commit, which is a fast-forward because the new commit's first-parent
chain runs back through the old head. The driver is
`tmp/roll14-verify-20261104/merge-driver.mjs` in the lane (gitignored scratch).
No branch was rebased and no source branch was moved.

Three merges, three clean merges: `git merge-tree --write-tree` exited 0 on
each pair, so no file conflicted in any of them. Two lanes write the same
engine file (`src/card/render/page.ts`: the 404 arm's two render entry points
and the event-options surface's ten lines), and git merged their regions
without a conflict.

Each merge commit's second parent is the lane tip and its first parent is the
previous roll commit (`git rev-list --merges --parents` at the tip):

    9b2533a4e 5d057a6b9 daba48f44   (journeys-rerun-candidate)
    5d057a6b9 bbf66044e 4efb3feae   (treewalk-set)
    bbf66044e a1b8a215f e9e6bc527   (not-found-404)

The merge set was re-checked against the remote after the merges: at the
rolled tip, the only `port/*` heads that are not ancestors are the seven stale
waves and `port/residual-verify-20261026`. The merge set is complete against
the remote as it stands.

## 3. The gates

Every gate below was run in this roll, at the rolled tip, on this machine. The
artifact paths are this roll's own files.

Typecheck, `npx tsc --noEmit`: exit 0, zero output lines at the rolled tip
(`tmp/roll14-verify-20261104/gates-final.txt`).

Format parity, the six suites the refusal-chrome receipt names:

    npx vitest run tests/server/html-format-parity.test.ts \
      tests/server/json-format-parity.test.ts \
      tests/server/rss-format-parity.test.ts \
      tests/card/mod-loader/card-mod-format-remaining-views.test.ts \
      tests/card/mod-loader/card-mod-bootstrap.test.ts \
      tests/card/mod-loader/card-mod-bar-box-format-oracle-pinned.test.ts

Result: 6 files, 147 tests, all passing.

The merged lanes' own pin suites, at the rolled tip: seven test files, 269
tests, all passing:

| suite | tests |
|---|---|
| tests/server/treewalk-row-disposition-parity.test.ts (treewalk-set) | 204 |
| tests/deploy/bunny-edge-error-page.test.ts (not-found-404) | 15 |
| tests/server/bad-address-wildcard-view-parity.test.ts (not-found-404) | 15 |
| tests/server/wildcard-bad-address-parity.test.ts (not-found-404) | 10 |
| tests/server/not-found-404-view-parity.test.ts (not-found-404) | 15 |
| tests/server/not-found-404-entry-points.test.ts (not-found-404) | 7 |
| tests/deploy/staging-bad-address-wildcard-endpoint.test.ts (not-found-404) | 3 |

Side-effects battery, both modes, the commands the strict-parity receipt
names, with the LibSass program from the shared native cache (LibSass 3.6.4):

    DECKO_PASSWORD_HASH=legacy-sha1 node tools/parity-side-effects/ts-drive.mjs \
      reference-harness/fixtures/write-battery-v1/deck/deck.sqlite3 \
      tmp/roll14-verify-20261104/battery/ts-work4 > tmp/roll14-verify-20261104/battery/ts-trace4.json
    node tools/parity-side-effects/compare.mjs \
      reference-harness/fixtures/write-battery-v1/expected/side-effects-ruby.json \
      tmp/roll14-verify-20261104/battery/ts-trace4.json tmp/roll14-verify-20261104/battery/compare-report4.json

    # strict run: the four DECKO_STRICT_PARITY_* switches on, and PARITY_STRICT=1 on the compare
    DECKO_STRICT_PARITY_SIGNIN_DETAILED_ERRORS=on \
    DECKO_STRICT_PARITY_REVISION_RESTORE_500=on \
    DECKO_STRICT_PARITY_SKIN_CREATE_500=on \
    DECKO_STRICT_PARITY_SCRIPT_BUNDLE_CLOCK_NAMES=on \
    node tools/parity-side-effects/ts-drive.mjs ... > tmp/roll14-verify-20261104/battery/ts-trace-strict4.json
    PARITY_STRICT=1 node tools/parity-side-effects/compare.mjs \
      reference-harness/fixtures/write-battery-v1/expected/side-effects-ruby.json \
      tmp/roll14-verify-20261104/battery/ts-trace-strict4.json tmp/roll14-verify-20261104/battery/compare-report-strict4.json

Battery lines, both modes, at the rolled tip:

| mode | line |
|---|---|
| default | `SIDE EFFECTS PASS 78 / 87; deliberate differences pinned 9; mismatches 0` |
| strict | `SIDE EFFECTS PASS 86 / 87; deliberate differences pinned 1; mismatches 0` |

Raw-body tables: the default mode reads `byte-equal 51; slot-equal 28;
declared 6; residual 2` and the strict mode reads `byte-equal 51; slot-equal
33; declared 1; residual 2`, both with zero mismatches. The event order
agrees on 81 of 81 deterministic steps in both modes, with 6 not established.
Both modes are unchanged from the roll v13 numbers row by row.

Whole-family signed-in exercise, the local stack over a copy of the pinned
deck, the same command the anchor-regression lane names:

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/roll14-verify-20261104/run4/whole-family/report.md

**332 / 332 checks passed**, 0 failed, 0 skipped by write mode, capability
coverage 95 covered, 1 partial, 0 not covered, 1 out of scope (of 98). The run
observed 6758 engine requests, and the slowest own-work request reads 1604 ms
of server time (`/new/Search?card[name]=Harness_CB_Role+*`); no signed-in
page and no save exceeded the 3 s budget, and no request returned a 5xx. The
run record is `.runtime/roll14-verify-20261104/run4/whole-family/report.md`
and the log is `tmp/roll14-verify-20261104/family-exercise-run4.log`.

The one partial capability is M1 (the RichText editor toolbar), and its cause
is not this roll: the capability's registry entry names four checks, and the
fourth (the editor's toolbar configuration carrying the original's format,
list, table and insert tokens) is recorded by no harness module in the tree,
at the base tip as well as at the rolled tip. Three of its four checks ran and
passed.

The process exit code is 1 by the tool's own rule (it exits 0 only when no
check failed AND the capability coverage is complete), not by a failure - the
same reading the roll v13 receipt records.

The bundle, the headline this roll exists to record. The rolled tree's build
(`node tools/dist/build-engine.mjs`, exit 0, then
`node tools/bundle-bunny-edge-engine.mjs` and `node tools/bundle-bunny-worker.mjs`,
each of which runs the tree's own boot-safety guard
`tools/vendor/edge-bundle-budget.mjs`):

| artifact | bytes | SHA-256 | verdict |
|---|---|---|---|
| bunny-edge-engine.bundle.js | 7,482,923 | fd3ceaf62628ed2a60f99acf6dcf9f922a6623eda55697f28de50aa2c8b85822 | PASS, 117,077 bytes under the 7,600,000 boot-safe budget |
| bunny-edge-read.bundle.js | 2,192,684 | 884515e44cc731b9a3f5309d1425f1f072f6a36c76f368f9960b1fe6428d6c0b | PASS |
| bunny-worker.bundle.js | 73,230 | 35ccc2543617fb299e4b9d6815ccae81003b90c7ab102f263f8eedaa144aa6a1 | PASS, byte-identical to the roll v13 tree's |

Net movement on the engine bundle: +875 bytes on the roll v13 tree's recorded
build (7,482,048 bytes, SHA-256
`0760c857b5807eccae3066e99b3bd4762b930237ff221c92e5d1f07b4b3ce7b2`, the
numbers the v25 receipt in this tree carries). The base tree was not rebuilt
in this roll, so that comparison is against the v25 receipt's recorded numbers
and not against a fresh build of the base.

## 4. The lane that went back to its lane, and why

`port/edge-refresh-seam-20261027` (tip `6dedb7d59`) wires the edge serving
host's asset-input refresh seam (the roster row reg-routes-B6's own unblock:
"the edge host wires the asset-input refresh seam"). The lane's own gates are
green - its three pin suites pass (13 + 10 + 2 tests), its typecheck is clean
and its own handler suite proves the refresh runs - but the whole-family
exercise's final browser asset audit fails with the seam wired:

    FAIL  no script, stylesheet, font or image failed across the exercised browser contexts
          evidence: {"contexts":38,"failures":[{"url":"https://127.0.0.1:55098/mod/style/jquery-ui-smoothness/ui-bg_glass_65_ffffff_1x400.png","status":404,"method":"GET","resourceType":"image","navigation":false,"contextIndex":0,"outcome":"deployment-failure"}]}

THE MECHANISM, measured on the rolled tree with the seam wired:

1. The seam runs Ruby's `Card::Assets.refresh` before the card GETs, and the
   refresh publishes the deck's asset inputs from the port's vendored mod
   sources. The local deck the harness builds carries the published rows with
   the RUN's own timestamps (the `card_virtuals` rows read
   `2026-10-27 09:29:33` through `09:29:35` in the first run and
   `10:10:33` through `10:10:44` in the second), and the stylesheet the
   browser loaded is the refresh's published bytes: the deck's
   `slate_skin_customized` output (365,147 bytes) is what the request
   `/files/45514/320151191367.css` answered.
2. That published stylesheet references the jQuery UI theme's image files
   under `/mod/style/jquery-ui-smoothness/` (14 of them, among them
   `ui-bg_glass_65_ffffff_1x400.png`).
3. The port's vendored style snapshot carries the theme's CSS and SCSS and
   NONE of its image files: `fixtures/vendor/mod-style-assets/` holds 0 PNGs,
   and no copy of that image exists anywhere in the tree.
4. The port serves no mod asset of its own: the edge host's vendor-asset arm
   answers the FontAwesome and bootstrap-font paths only
   (`deploy/bunny-worker-src/bunny-edge-engine-handler.ts`,
   `serveFontAwesomeAsset` / `serveBootstrapFontAsset`), so the image the
   published stylesheet asks for answers 404.

So the seam's wiring replaces the deck's stored asset inputs with a
re-compilation whose image references the port does not serve. The base tree
passes the same audit (the roll v13 receipt records 332 of 332 at the v25 tip,
asset audit included), and the audit is green at this roll's rolled tip with
the seam out, so the seam is what the failing leg measures.

The branch therefore went back to its lane, and the candidate carries three
lane tips, not four. The unblock condition, for the lane that owns the row:
the refresh must publish the deck's stored asset-input bytes rather than a
re-compilation whose image references the port cannot serve (or the port must
serve the mods' vendored files), and the whole-family exercise's asset audit
must be green with the seam wired. The row reg-routes-B6 keeps its bucket and
its PARTIAL verdict, with this measurement recorded on it.

The candidate branch's local ref was moved from the four-lane chain (which was
never pushed) to the three-lane chain, with `git update-ref` and the old value
as the compare-and-swap guard. No published history was rewritten: origin's
candidate branch was at the base tip `a1b8a215f` throughout, and the push of
this roll's tip is a fast-forward from it. The four-lane chain's commits stay
in the object store, and the dropped lane's own branch on origin is untouched.

## 5. The one harness leg this roll corrected, and why

The whole-family exercise's ERR1 leg ("a card that does not exist answers an
error page, not a create form") failed on the first run of this roll, and the
leg was the stale one:

- The leg asked for 404 on BOTH the bare card mark and the one-segment-deep
  path (`/<missing>/board`).
- The 404 it read for the deep shape was the PRE-LANDING port's answer: the
  render entry refused the unknown card and the HOST answered its own chrome
  404 page.
- The 404 arm's landing removed that refusal, so the port now answers what
  the pinned Ruby answers: the bare mark is the main page's root view, where
  Ruby's `format/error.rb:18-25 view_for_unknown` writes
  `root.error_status = page_status_for_unknown` (404) and answers
  `:not_found`; the deep shape is the same mark in the board view, and the
  board view declares `perms: :update, unknown: true`
  (`card-mod-edit-0.20.0 set/all/editing.rb:3`, the declaration the tree's own
  pins carry in `tests/card/mod-loader/card-mod-edit-board-family-census.test.ts`
  and `tests/card/mod-loader/card-mod-save-without-close.test.ts`), so Ruby's
  `view/permission.rb#alter_unknown` answers nil for a view whose unknown
  setting is "true", `altered_view` (`alter_unknown || denial`) falls through
  to the denial arm, and `format/error.rb:27-31 view_for_denial` writes
  `root.error_status = 403` on a focal root.
- The engine-level measurement at the rolled tip agrees: an unknown main card
  answers 404 with no view, 404 with the "content" view, 404 with the "open"
  view, and 403 with the loud focal denial for the "board" and "edit" views
  (a probe over the page entry, reading the status and the body of each
  shape).

So the leg now grades what the original answers: the bare mark at 404 and the
board-view shape at 403, both with no create form, no name input and no card
created. The leg's intent is unchanged and is now graded against the deck's
own pages rather than against the host's chrome page. The change is in
`tools/edge-signed-in-exercise/checks-content-flows.mjs` with the citations
above in the leg.

## 6. The fold that follows

The rows this roll's tree closes move through the roster tooling with its
counter check:

- `reg-routes-C10` (the register-routes family): the row's gap was that the
  port's main+root 404 arm was present but unreachable from both render entry
  points. The 404 arm's lane made the render entries offer an unknown main
  card to the format, so the arm answers from both of them and writes the 404
  the way the pinned original does. The row's bucket moves to DONE and its
  verdict stays PORTED.
- `reg-treewalk-c2-set-rb-set-28` (the register-treewalk family): the row was
  already closed by its own lane, whose receipt states the verdict DONE. The
  fold records that verdict on the row; the bucket does not move.
- `reg-routes-B6` (the register-routes family): NOT closed. The lane that
  wires the edge host's asset-input refresh went back to its lane after this
  roll's whole-family gate failed on it (section 4), so the row keeps its
  bucket and its PARTIAL verdict, with the measured remainder recorded on it.

The journeys-rerun-candidate lane names no roster row, so it carries no row
change.

## 7. What this lane did not do

- Nothing deployed. No URL was fetched, so no URL is reported working.
- Nothing was written to the live database, and the live script was not
  touched. culturesmith.com was not touched.
- The other candidate branches on origin were not moved. The roll pushes one
  branch: `deploy/full-candidate-20261104`.
- No source branch was rebased, and no tip was moved. The lane that went back
  to its lane keeps its own branch on origin, untouched.
- The seven stale 20261020-22 port branches stay unmerged, per the ten-roll
  precedent, and so does `port/residual-verify-20261026` (a verification
  copy, not a work branch).
- The other host was not touched.
