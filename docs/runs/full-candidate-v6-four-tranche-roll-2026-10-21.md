# Full candidate v6: the four-tranche roll, 2026-10-21

The wave's assignment: roll `port/routes-tranche-20261020` (frozen tip
d6b45030), `port/capability-inventory-tranche4-20261020` (b9e380aa),
`port/matrix-journey-tranche-20261020` (48d1e0dc) and
`port/mods-tranche7-20261020` (4a205874) into
`deploy/full-candidate-20261020`, gate, rebuild the bundle, push. Nothing
deploys.

## Layout

Worked in the existing shared checkout
`C:/localProjects/decko-ts-full-candidate-20261020` (branch
`deploy/full-candidate-20261020`), which is a registered git worktree of
`C:/localProjects/decko-ts-restored` (`git worktree add` is gate-blocked on
this machine, per the assignment's note). This checkout is SHARED: the
routes tranche's own lane committed to `port/routes-tranche-20261020` from
this same worktree while the roll ran (its reflog: rows B6 06:06, B8 06:54,
B9 07:19, B13 08:07, C4+C5 08:31), and at 08:10:09 it ran `git reset`
inside this worktree while this lane's merge was staged (see "Incidents").

## The frozen set, containment, and what merged

| branch | frozen tip | contained at wave start | merged as |
| --- | --- | --- | --- |
| port/mods-tranche7-20261020 | 4a205874 | no (3 commits over the merged tranche-6 tip f90b190b) | e7bcd69a, clean |
| port/capability-inventory-tranche4-20261020 | b9e380aa | no (6 commits over tranche-3 tip 0700c92e) | 46408c3d, 1 conflict file |
| port/matrix-journey-tranche-20261020 | 48d1e0dc | no (7 commits over the merged base) | 55cb6183, 1 conflict file |
| port/routes-tranche-20261020 | d6b45030 | no (12 commits over the routes-cont base) | 70e13758, 9 conflict files |

`git merge-base --is-ancestor <tip> HEAD` verifies all four tips contained
after the roll (run at 09:2x: d6b45030, b9e380aa, 48d1e0dc, 4a205874 all
contained). The routes lane's commits after the freeze
(d6b45030..5f292601, rows B6 through C4+C5) are that lane's in-flight work
on the same branch label; they are NOT part of the frozen set and are NOT
merged. The v7 branches named by the assignment (routes-tranche-2,
capability-tranche5, matrix-tranche-3) had no refs on origin at roll time.

## Conflict resolutions, region by region

### capabilities.json (capability-tranche4 merge, 46408c3d)

Rows N6, N9 and H1 conflicted: both sides added checks to the same rows.
Each region is rebuilt to declare the check names the MERGED harness
actually records, verified against the merged tree's drivers (not against
the branch that proposed them): N6 carries the legs battery's name plus the
three `SEARCH_EMPTY_ANSWER_CHECKS` names checks-navbox.mjs imports; N9 the
legs battery's name plus the four `USER_LAYOUT_CHECKS` names
checks-content-flows.mjs imports; H1 the legs battery's name plus the four
`CARD_HISTORY_CHECKS` names checks-cover-b.mjs imports. Each row's finding
states both bodies of work. All three rows keep status partial.

`tmp/conflict-resolve/merge-capability-rows.mjs` performed the rebuild. Its
wholesale-file write DROPPED the tranche's non-conflicting changes to three
further rows (N5, W2, W4); found by re-diffing every row against the merge
base 0700c92e after the merge, and restored in 8a291642 (see "Repairs").

### card-mod-list.ts :input view (matrix-journey merge, 55cb6183)

The doc comment and the off-family arm conflicted, and the two sides were
right about different cards. HEAD delegated the off-family arm to the base
editor (Ruby's chain reaches card-mod-edit's :input for a card outside
Abstract::List); the tranche walked Ruby's super() chain (the list view is
`_render_hidden_content_field + super()`). The rebuilt arm tells the two
apart by the CHAIN, which is Ruby's own question: `superViewStep` (new, in
mod-view-helpers.ts; superView is now its thin wrapper, so every other
caller keeps its behavior) reports whether the calling module is in the
card's chain at all. Measured on the port: a User card's "+follow" part
carries the list module (set keys `ALL ALL_PLUS RIGHT-follow
TYPE_PLUS_RIGHT-user-follow`, chain `[Abstract::List::HtmlViews,
All::Editor]`) and renders the hidden field plus the editor; a plain card
(set keys `ALL TYPE-rich_text SELF-oracle_probe_child`, chain
`[All::Editor]`) does not carry it and renders the editor alone. Both
sides' own tests pass against the rebuilt region.

### The routes merge (70e13758)

Nine files conflicted. The committed resolution, region by region, is in
the merge commit message. The material points: the tranche's
`/card/read/<mark>` third-segment mark arm replaces HEAD's second-segment
read (the (card) group is optional in engine_routes.rb:42's pinned route);
both imports stay in write-routes.ts; HEAD's *previous read-path mark arm
and the pathname adapter stay in worker-shared-surface.ts, and the 404 stub
keeps HEAD's header set (Content-Type plus Cache-Control: no-store), which
no test pins on either side; the tranche's
bunny-edge-action-read-route and bunny-edge-previous-mark-redirect replace
HEAD's (theirs add the /card/read/<mark> case and the deck-root leg), and
the staging action-read test keeps HEAD's *previous-mark leg the tranche
dropped; write-path-races keeps HEAD's transactional-driver guard.

PROVENANCE: this merge was resolved twice in the shared worktree. This
session resolved all nine conflicts and staged them; the routes lane's
session ran `git reset` at 08:10:09 (this worktree's HEAD reflog) while the
state was staged, restarted the merge at 08:10:34, and resolved it again.
The commit carries the second session's resolution; the two agree
everywhere except the 404 stub's cache header, where the second session's
choice (no Cache-Control) was intended, being the closer match to Ruby's own
response. The committed file does NOT carry that choice: the stub in
src/server/worker-shared-surface.ts keeps HEAD's header set, Content-Type
plus Cache-Control: no-store. The merge commit message (70e13758) says
otherwise, and this paragraph corrected it on 2026-10-21. The oracle row
(reg-routes-A4, fixtures/captured/deprecated-asset-routes-ruby-oracle.json)
records the body and the status only, so it pins neither header set, and no
test reads the header: the difference is unpinned, and the candidate's
long-standing shape is what shipped. The merge pins the frozen tip d6b45030
via MERGE_HEAD.

## Repairs

- 8a291642: restored the capability-tranche4 rows (N5, W2, W4) the 46408c3d
  resolution dropped. All three rows are identical between the merge base
  and HEAD, so the restoration is byte-for-byte what git's auto-merge had
  produced. The declared names were verified against the merged drivers
  (`RECENT_CHANGES_CHECKS` in checks-recent-changes-feed-dedup.mjs;
  `UNFOLLOW_CHECKS` in checks-cover-b.mjs). Found by re-diffing every
  capabilities.json row against the merge base after the merge, not by a
  test failure; no committed test reads these rows.

## Gates

Typecheck (`npx tsc --noEmit`), final run on the committed tree at 09:3x:
exit 0, ZERO output lines. The assignment expected the pre-existing
write-path-races tsc lines; the tree is cleaner than that expectation
(those lines were repaired on the branch before this wave), which satisfies
"only the pre-existing lines" a fortiori. Baseline before the roll (HEAD
22051831): also 0 lines.

Correctness (`node tools/test-gates.mjs run correctness`), final run v6c on
the committed tree, started 08:34:04, exit 0:

```
Test Files  626 passed | 54 skipped (680)
     Tests  6617 passed | 227 skipped (6844)
```

ZERO failures: the failure set equals the empty baseline. The baseline's
"623 files / 6611 tests" was the v5 figure; the gate now collects 680 files
because the four tranches and the lanes that landed between v5 and the wave
start added test files (the v5 logs on disk, Oct 19 21:46, predate several
of them). The 54 skipped suites are the committed not-run ledger (corpus
shards and env-gated probes absent from a clean checkout), unchanged in
character from the baseline logs.

Harness batteries over the repaired capabilities.json: `node --test
tools/edge-signed-in-exercise/test/check-modules.test.mjs
tools/edge-signed-in-exercise/test/check-bindings.test.mjs` - 12/12 pass;
the five tranche harness suites (card-history-acts, user-card-layout,
search-empty-answer, recent-changes-newest-first, unfollow-from-board) -
74/74 pass. The mod-loader suite at the matrix merge:
`npx vitest run tests/card/mod-loader/` - 163 files, 2204 passed, 14
skipped, 0 failed.

### The deploy gate is red, and the red is pre-existing

`node tools/test-gates.mjs run deploy` on the merged tree: 95 files, 4 red
(90 passed, 1 skipped). The four:

- `tests/deploy/staging-rss-format-d3.test.ts` (3 assertions: the staging
  host answers /Welcome.rss with text/html, not application/rss+xml)
- `tests/deploy/worker-edge-cache-runtime.test.ts` (1)
- `tests/server/bunny-edge-files.test.ts` (1)
- `tests/card/actions/atomic-saves.test.ts` (5, the MySQL 8.4 native lane,
  which KNOWN_FAILURES.md lists as a suite that can fail under load)

MEASURED against the PRE-MERGE tree, not inferred: the pre-merge commit
55cb6183 was extracted with `git archive` into a local directory
(`C:/localProjects/decko-ts-premerge-baseline-20261021`, node_modules linked
by junction, `tsc -p tsconfig.json` for its own dist) and the same suites
were run there. staging-rss-format-d3, worker-edge-cache-runtime and
bunny-edge-files fail there with the SAME five assertions, and
atomic-saves fails there with the same five (5 failed, 61 passed of 66), so
the roll brought none of the four. The merge's source diff against the
pre-merge HEAD is two files (the Bunny edge route grammar's /card/read/<mark>
arm and the staging server's import block); neither is on these paths.

### Incidents (two invalidated gate runs, both environmental)

1. v6 run (08:07): 1 failure, tests/tools/
   remote-widget-cas-freshness-stamp-admission-is-intact.test.ts "carries no
   database credential". The test asserts the untracked `.runtime` directory
   is absent from the checkout. Running the repo's own check-bindings
   battery creates `.runtime` (tools/edge-signed-in-exercise/
   check-bindings.mjs:23 mkdirSync) - this lane ran that battery at ~06:13
   during merge verification, which armed the failure. The credential the
   test actually guards (`.runtime/owned-cs-edge-cleanup-20261018.env`) has
   never existed in this checkout. The test passes in isolation with
   `.runtime` absent (verified), and the full gate passes with it absent
   (v6c). The test was already in HEAD before the wave (a0fce214, smell-test
   tranche 2); the v5 baseline logs predate it, so the baseline never gated
   it.
2. v6b run (08:15): failures in tests/card/auth/reset-flow-endpoint.test.ts
   ("staging server did not become ready: vm-staging-server.mjs:134
   `<<<<<<< HEAD`"). The routes lane's `git reset` at 08:10:09 plus its
   restart of the merge at 08:10:34 re-marker-ized the working files while
   this lane's resolution was staged; the gate read the mid-flight tree.
   Both failures are the shared-worktree collision, not merge content. The
   committed tree (70e13758, 8a291642) gates clean (v6c), and the five
   resolved files' sha1 snapshots taken before v6c verify unchanged after
   it.

## The bundle

Rebuilt from the committed tree with `node tools/bundle-bunny-edge-engine.mjs`
(both bundles validated under the 7,600,000-byte budget by the tool's own
assertion):

| artifact | bytes | sha256 |
| --- | --- | --- |
| deploy/dist/bunny-edge-engine.bundle.js | 7,356,978 | 70ea8672da657e3ad375d63a74676e2122a9defa262b7dfd10d25d58f0e5b2d1 |
| deploy/dist/bunny-edge-read.bundle.js | 2,102,388 | 2306eeb4b3e98fddee73d0b3b95faa0ad8dc13917ee1f9028818b92680e22af0 |
| deploy/dist/bunny-edge-engine.code.json | 7,356,976 chars | e1bdbbe8dcb99eb572a3242694624f0f3f8e1bdf04b5dd4264c7509937c15794 |
| deploy/dist/bunny-edge-read.code.json | 2,102,386 chars | c2191d99f904293327324dff399ac85429ae85f4bb070281321727424ede17a2 |

deploy/dist is gitignored: the artifacts stay local. NOTHING DEPLOYS.

## Push

`git push origin deploy/full-candidate-20261020` (forward-only; the remote
tip 22051831 is an ancestor of the pushed head). The branch carries five
new commits: e7bcd69a, 46408c3d, 55cb6183, 70e13758, 8a291642.
