# Full candidate v7: the routes-tip roll, 2026-10-21

The wave's assignment: roll `port/routes-tranche-20261020` (frozen tip
38d498d6) and `port/matrix-journey-tranche-20261020` (frozen tip
48d1e0dc) into `deploy/full-candidate-20261020` (worktree
`C:/localProjects/decko-ts-full-candidate-20261020`, wave start 47275031,
two receipt commits past the v6 roll 767f21cf), verify containment,
merge, rebuild conflicts by regions, gate (typecheck plus
`node tools/test-gates.mjs run correctness`, failure set must equal the
empty baseline: v6 gated 680 files / 6617 passed / 0 failed), rebuild the
bundle, record SHA-256 and bytes, push. Nothing deploys.

## The frozen set, containment, and what merged

| branch | frozen tip | containment at wave start | action |
| --- | --- | --- | --- |
| port/routes-tranche-20261020 | 38d498d6 | tip of the branch (verified `git rev-parse` after fetch, exact match); NOT in HEAD (`merge-base --is-ancestor` failed) | merged as 212ff75e |
| port/matrix-journey-tranche-20261020 | 48d1e0dc | already contained in HEAD (`merge-base --is-ancestor` passed; it entered through the v6 merge 55cb6183, second parent of 55cb6183 is 48d1e0dc exactly) | no-op, contained |

Both tips verified contained in the committed tree after the roll
(`merge-base --is-ancestor` for each, both pass). The matrix-journey
branch has advanced past the freeze by 4 commits (d1 48d1e0dc to
c18e3f44, rows mx-155, mx-190, mx-B-081, mx-B-086 dated 2026-10-21):
those commits are NOT in the frozen merge set and are NOT merged, the
same disposition the v6 receipt gave the routes lane's post-freeze
commits. The capability battery lane's work is v8 material per the
assignment and is not merged. The routes tranche-4 lane's clone
(`C:/localProjects/decko-ts-routes-tranche4-20261021`) was not touched.

The routes merge brings 8 commits over d6b45030 (the tip v6 merged):
rows B6 e8d240bd, B8 e4e0dc4d, B9 e216493a, B13 5f8db61b, C4+C5
5f292601, C6 06a56925, C7 0a71e54c, and the tranche receipt 38d498d6.
Footprint: 32 files, 4156 insertions against the merge base; all routes
and mark parity work, its fixtures, its oracle-capture scripts, and the
tranche receipt doc. No capability-inventory paths ride along (verified
by reading the full `git diff --name-only HEAD...38d498d6` file list).

## The merge (212ff75e), conflicts rebuilt region by region

Git auto-merged cleanly: src/server/write-routes.ts,
tests/deploy/staging-home-mark-endpoint.test.ts,
tests/server/oracle-capture-pinned-deck-harness-ruby.rb, and 24 add-only
files. Six files conflicted, 30 regions total. Both sides had ported the
same Ruby rows (HEAD through the v6-merged routes base and the
routes-cont lineage, the tranche through d6b45030..38d498d6), so the
regions are mostly two wordings of the same ports.

- deploy/bunny-worker-src/bunny-edge-engine-request.ts (1 region): the
  *previous doc comment. Took the tranche's text: it is the superset
  (adds the empty-history-bottoms-out-at-deck-root sentence) and the
  claim is verified against the merged code, previousLocation at
  src/card/session/visitor-session.ts:148-150 (`history.at(-1) ?? "/"`).
  The redirect code below the region was identical on both sides.

- src/card/name/environment.ts (3 regions): the recordAsMain doc
  comment, one shared function body. Took HEAD's text: it is the
  superset (adds "warned about by cql/normalize.ts"), and that claim is
  verified in the merged tree (src/cql/normalize.ts:104-108 warns when
  mainName is undefined).

- vm-staging-server.mjs (4 regions): the import block rebuilt as the
  union of both sides (renderFormatShow, recordAsMain, serverErrorArm,
  debugServerErrorView; every symbol verified referenced in the merged
  body before taking the union); the visitor-session import took HEAD's
  ordering (both sides name the identical five symbols); the *previous
  doc comment took HEAD's dash plus the tranche's accurate empty-history
  sentence.

- tests/deploy/bunny-edge-previous-mark-redirect.test.ts (7 regions,
  add/add): took the tranche's file. It is a strict superset of HEAD's
  (same three tests; adds the Cache-Control no-store pin, which the
  merged engine code satisfies at bunny-edge-engine-request.ts:938; its
  doc points at the parity test and the oracle fixture). The resolved
  file is byte-identical to 38d498d6's copy (verified by diff against
  `git show 38d498d6:<path>`).

- tests/deploy/routes-record-as-main-b13.test.ts (10 regions, add/add):
  the two sides' tests are semantically identical (same six legs, same
  assertions, verified over the complete 99-line HEAD-vs-tranche diff);
  the regions were dash-style variants, the tranche's added
  parity-pointer paragraph, and its trailing newline. Took the tranche's
  text. Byte-identical to 38d498d6's copy (verified by diff).

- tests/server/write-routes-cud-reload-slotter.test.ts (5 regions,
  add/add): same shape, semantically identical tests. Took the tranche's
  text. Byte-identical to 38d498d6's copy (verified by diff).

Containment notes from the auto-merge: src/card/fetch.ts needed no
merge decision because HEAD's copy is already identical to 38d498d6's
(the tranche's mainName carry-forward arrived through an earlier lane's
merge; verified `git diff 38d498d6 HEAD` empty for that path before the
merge). No conflict markers remain anywhere in the tree (verified by
grep over the resolved files and a repo-wide `git grep -l '^<<<<<<<'`).

## The one auto-merge defect and its repair (952fc649)

`tsc --noEmit` on the merge commit reported 2 errors: TS2300 duplicate
identifier 'slotterMode' at src/server/write-routes.ts:482 and :500.
Both pre-merge parents carry exactly one declaration of
ParsedBody.slotterMode (parent1 47275031 at :482 between isMain and
comment; parent2 38d498d6 at :494 between recaptchaToken and
lookInTrash); the three-way merge kept both insertions because the
surrounding lines differ. The repair 952fc649 removes the second block
(recaptchaToken-adjacent), keeping parent1's field ordering and the
tranche's field; the two blocks' text was byte-identical, so no
information moved.

## Gates

Typecheck (`npx tsc --noEmit`) on the repaired committed tree: exit 0,
ZERO output lines (log on disk: C:/localProjects/decko-ts-v7-tsc2.log).
Before the repair it reported exactly the 2 duplicate-identifier lines
and nothing else.

Correctness (`node tools/test-gates.mjs run correctness`) on the
repaired committed tree, exit 0:

```
Test Files  626 passed | 54 skipped (680)
     Tests  6617 passed | 227 skipped (6844)
```

ZERO failures: the failure set equals the empty baseline, and the file
and test totals equal v6's exactly (680 / 6617 / 0). The totals do not
grow with this merge because the tranche's new suites are classified
into other gates by tools/test-gates.mjs:66-77: the seven new
*-parity.test.ts files match the parity gate's `parity` pattern and the
new tests/deploy/ files match the deploy gate, so the correctness set is
unchanged by design. Verified the new files are absent from the
correctness log and present in the tree.

Merge-seam batteries (extra to the named gates, over the merge's own
files): `npx vitest run` over the seven new parity suites plus the three
resolved/advanced test files: 10 files, 61 tests, 60 passed, 1 failed.
The failure and its disposition:

- tests/server/setup-before-action-parity.test.ts > "the named gap: the
  edge host does not run the asset refresh" > "no serving-host source
  reaches the asset-read refresh seam" (line 209): the test scans every
  .ts/.mjs/.js file under deploy/ recursively for
  /createReadAssetRefresh|asset-read-refresh|beforeRead/. The port's
  edge SOURCE has zero hits (verified by grep over
  deploy/bunny-worker-src/). The hit is the build artifact
  deploy/dist/bunny-edge-engine.bundle.js (gitignored, present because
  this roll rebuilds it, carrying the identifiers from bundled
  dependencies; the fresh bundle has the same 3 hits). Proven
  environmental, not merge content: with deploy/dist moved OUTSIDE the
  repo the same test passes 9/9 (exit 0), and the artifacts were moved
  back and sha-verified unchanged afterward. The tranche lane's own
  battery passed on its worktree, which held no bundle under deploy/.
  The test's implicit assumption (no built artifacts anywhere under
  deploy/) cannot hold in any checkout that builds the bundle this
  roll is required to build; naming it here for the parity-gate lanes
  to fold. The other 9 files: all green (home-mark 5, implicit-mark 10,
  markless-update 5, previous-mark 6, record-as-main 6,
  cud-reload-slotter-parity 7, bunny-edge-previous-mark-redirect 3,
  routes-record-as-main-b13 4, write-routes-cud-reload-slotter 6).

Not run: `node tools/test-gates.mjs run deploy` (the ask names
typecheck plus correctness; v6 measured the deploy gate against its
pre-merge tree and this roll's source delta to the edge surface is
comment-only, see the bundle section).

## The bundle

Rebuilt from the committed tree with
`node tools/bundle-bunny-edge-engine.mjs` (both bundles validated under
the 7,600,000-byte budget by the tool's own assertion):

| artifact | bytes | sha256 |
| --- | --- | --- |
| deploy/dist/bunny-edge-engine.bundle.js | 7,356,978 | 70ea8672da657e3ad375d63a74676e2122a9defa262b7dfd10d25d58f0e5b2d1 |
| deploy/dist/bunny-edge-read.bundle.js | 2,102,388 | 2306eeb4b3e98fddee73d0b3b95faa0ad8dc13917ee1f9028818b92680e22af0 |
| deploy/dist/bunny-edge-engine.code.json | 7,496,026 | e1bdbbe8dcb99eb572a3242694624f0f3f8e1bdf04b5dd4264c7509937c15794 |
| deploy/dist/bunny-edge-read.code.json | 2,183,116 | c2191d99f904293327324dff399ac85429ae85f4bb070281321727424ede17a2 |

(The code.json byte counts are the files on disk; the tool's "chars"
figures, 7,356,976 and 2,102,386, are the payload strings before the
JSON wrapper escapes their newlines.)

All four shas are byte-identical to the v6 receipt's table: this merge
carries zero functional delta into the edge bundle's import closure.
That is the expected shape, and now it is measured: the tranche's only
edge-surface source delta is doc comments in bunny-edge-engine-request.ts
and test files, which minification strips; its functional rows landed in
HEAD through earlier merges (fetch.ts byte-identical, write-routes
slotter/cud rows already present).

deploy/dist is gitignored: the artifacts stay local. NOTHING DEPLOYS.

## Push

`git push origin deploy/full-candidate-20261020`, forward-only: the
remote tip 47275031 is an ancestor of the pushed head 952fc649. The
branch carries two new commits: 212ff75e (the merge) and 952fc649 (the
duplicate-field repair).

## Disk cost

Added: this receipt (about 12 KB). Removed: nothing. Local scratch
outside the repo: three gate logs and one merge message file at
C:/localProjects/ (about 400 KB combined), left in place because the
receipt cites them; the moved-aside dist copies were restored and no
copy remains.
