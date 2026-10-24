# Round twelve (back slice): the six cross-cutting rows are adjudicated, and the family grade holds

Branch `port/matrix-round12-20261024` (lane checkout
`C:/localProjects/decko-ts-matrix-round12-20261024`, an owned worktree of
the family's shared git directory created by the worktree tool, with
`node_modules` riding a symlink to the family's shared install), from the
newest pushed matrix tip `71d4f686` ("The whole-family exercise at this
branch's tip: 253 of 253, the six sign-in and account rows adjudicated").
Round eleven runs in parallel from the same era and takes the front slice
(mx-B-049 through mx-B-054); this lane takes the back slice, so the two
lanes cannot touch the same row.

The ask had three parts. The six highest-numbered unadjudicated matrix
rows in the family's roster order are adjudicated, one commit each, with
oracle-matched or named-instrument evidence. The whole-family exercise
runs once at this branch's final commit and the grade line is reported.
The 253-of-253 baseline holds or the regression is named and fixed.

## 0. What the ask asked, and what this round found

1. **The back slice.** TAKEN, one commit each, with oracle-matched or
   named-instrument evidence: mx-184, mx-185, mx-186, mx-187, mx-188 and
   mx-189, the six cross-cutting rows that end the family's roster.
   Section 2.
2. **The whole-family exercise at the final commit.** Section 5.
3. **The baseline.** The grade line is in Section 5. One instrument
   defect was met and repaired on the way (Section 3); the engine itself
   needed no change, and no regression is named because none was met.

## 1. The selection rule, stated so a reader can check it

The roster is the row ledger for this family
(`C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`),
and the roster's own item order is the family's row-id order: the
mx-B-001 through mx-B-125 rows first, then the mx-125 through mx-190
rows, ending with the six cross-cutting rows and mx-190.

The rule was checked against the PRE-STATE, the tree at the family's tip
`71d4f686`, read with `git ls-tree` and `git show` over every file under
`docs/reports` (138 files). A family receipt is a file under
`docs/reports` whose content names the roster item's id. At that tip the
family rows whose ids appear in any receipt are the mx-B rows 1 through
49, plus mx-B-064, mx-B-081, mx-B-086 and mx-B-110, plus the non-B rows
mx-131, mx-143, mx-154, mx-155, mx-159 and mx-190. A `git grep` over the
tip tree and over the newest pushed candidate branches
(`deploy/full-candidate-20261027`, `control/full-candidate-20261025-family`)
found no file naming mx-184 through mx-189 at all.

So the six highest-numbered rows no receipt names are **mx-184
(case-insensitivity guarantees), mx-185 (plurality/slug pinning), mx-186
(pagination math), mx-187 (feed dedup), mx-188 (affordance visibility per
role) and mx-189 (empty-vs-error rendering)**: roster positions 184
through 189, the last six unadjudicated items of the family's order,
disjoint from round eleven's front slice by 66 rows.

## 2. The six rows this round closed

| row | the row | the instrument | the oracle | the verdict |
|---|---|---|---|---|
| mx-184 | case-insensitivity guarantees across search, names, and slugs | the lowercase-slug, percent-encoded-slug and both-cases-search legs, driven twice (probe-pageonly-ranks91-100.mjs:546-584, probe-pageonly-batch5-...-empty-error.mjs:278-312) | Ruby's own key chain (activesupport 7.2.4 methods.rb:99-107 inside cardname-0.20.0 cardname.rb:107-118) matched file for file by the port (src/card/name.ts:128-135, src/card/name/inflect.ts:271-281, src/card/fetch/retrieve.ts:293) | PASS |
| mx-185 | plurality/slug pinning: name variants resolving to one card | the four-variant one-card leg, the id-mark leg and the digit-C boundary leg (ranks91-100.mjs:586-707), the first twice (batch5 :581-680) | Ruby's own key algebra re-run for this receipt on the installed gems' own code: the two spellings take different keys, so the create form at the shouted address is Ruby's own answer; the port's computed table equals Ruby's on all nine words | PASS |
| mx-186 | pagination math: offsets, limits, and page counts beyond page-2-differs | the six-page disjoint walk through the page's own Next control and the offset-100000 leg (ranks91-100.mjs:709-762, batch5 :313-367) | the port's paging builder pinned to Ruby's own paging sources by file and line (src/card/render/search-paging.ts header; card-mod-collection-0.20.0 paging_views.rb read at this tip and agreeing) | PASS |
| mx-187 | feed dedup: the same act must not repeat in a feed | the exercise's own N14 module under `--only recent-changes-feed-dedup` (8/8) and the probe's three act-identity legs (ranks91-100.mjs:763-806) | Ruby's own *recent core captured byte-wise (render.jsonl arms 497/505/521) and rendered by the port's set/self/recent seat (src/card/render/views.ts:1084-1099, card-mod-history.ts:1567-1585) | PASS |
| mx-188 | affordance visibility per role: which controls render for which actor | the two-role type-control leg, administrator against member (ranks91-100.mjs:806-860, batch5 :398-452) | Ruby's own new_type_formgroup captured byte-wise (render.jsonl arm 162), matched by the port (card-mod-edit.ts:2015-2041, :2615-2618); the role gate is new.rb:150-152 new_type_permitted?, carried at card-mod-edit.ts:2336-2350 | PASS |
| mx-189 | empty-vs-error rendering: empty result sets must not render as errors and vice versa | the empty-search, missing-card and shape-leak legs (ranks91-100.mjs:807-860, batch5 :369-396) | Ruby's own not-found view captured byte-wise (render.jsonl arm 231) and matched by the port (src/card/render/format.ts:1558-1600), with the create-permission split at src/card/render/page.ts:309-351 and the empty side at card-mod-search.ts:637-650 | PASS |

Each row's receipt is its own file under `docs/reports/`
(`row-mx-184-cross-cutting-group-2026-10-24.md` through
`row-mx-189-cross-cutting-group-2026-10-24.md`), and each row's commit is
its own commit with an explicit pathspec (a97264a6, d54282f3, 835a8215,
f72a607a, af9ff8f6, 4c4815cc). Two instrument-repair commits precede the
row commits (7cad8f20, 9a2ed6e3, Section 3).

## 3. The defect this round met: a stale expectation in a committed probe

The ranks91-100 probe's ACT-185 digit-C leg graded the reading that the
all-caps address of a name ending digit+C SHOULD resolve to the same
card, and REDed because the engine answers the unknown-card create form
at status 200. The reading is retracted by the row's own evidence basis
in the roster, and this round re-derived the retraction from the gems'
own code rather than quoting it: run under Ruby, with activesupport
7.2.4 and cardname-0.20.0 on the load path, the two spellings take
different keys (`harness_plurality_digit_9c_mvmyi0i` against
`harness_plurality_digit_9_c_mvmyi0_i`), so Ruby's own by-key retrieval
misses the same way and Ruby's own page lane answers the create form.
The port's computed key table equals Ruby's on all nine probe words.
The repair teaches the leg the oracle-faithful expectation (commit
7cad8f20) and reads the create form the way the not-found leg does, since
the :new page hides the name formgroup (commit 9a2ed6e3). The engine
needed no change; the first post-repair run REDed only on the leg's own
wrong discriminator, and the run at 9a2ed6e3 grades 22 legs, 0 failures.

No regression was met in the exercise itself; Section 5 carries the
grade.

## 4. The batteries the touched surface carries

The touched files this round are six receipt files, this report, and one
committed probe (`reference-harness/browser/probe-pageonly-ranks91-100.mjs`,
commits 7cad8f20 and 9a2ed6e3). The probe file is exercised end to end by
its own run at this tip (22 legs, 0 failures, Section 3), and it parses
clean (`node --check`). The exercise battery and the repo-wide typecheck
run alongside:

    node --test "tools/edge-signed-in-exercise/test/*.test.mjs"

    221 tests, 219 pass, 0 fail, 2 skipped (the opt-in live legs)

    npx tsc -p tsconfig.json --noEmit

    exit 0, no diagnostics

## 5. The whole-family exercise at this branch's final commit

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/signed-in-exercise-round12-20261024/final/report.md

    source 723f0b42c47a52ef4bfcc1458dadb372b0dd6a27, started
    2026-10-24T23:11:36.669Z, completed 2026-10-24T23:36:04.385Z,
    the source files clean
    Result: 253 / 253 passed, 0 failed, 0 skipped by write mode

**THE FAMILY GRADE LINE AT THIS BRANCH'S FINAL COMMIT: 253 of 253 checks
passed.** The run record's own per-check results are 253 entries and every
one of them is pass
(.runtime/signed-in-exercise-round12-20261024/final/report.md.json). The
capability coverage is the same count the round-five through round-ten
runs read (70 covered / 20 partial / 1 not covered / 1 disabled upstream /
3 out of scope of 95), the timings leg is green, and this run observed
3,952 engine requests. The 253-of-253 baseline holds; no regression is
named because none was met.

The tool's exit rule is `failures.length === 0 && !coverageIncomplete`,
and `coverageIncomplete` is true whenever any capability is partial, not
covered or out of scope, so the run closes with the standing coverage line
the earlier rounds also carry. That is the tool's coverage-completeness
signal, not a check failure: the CHECK grade is 253 of 253 with zero
failures.

The source the run names is the commit that carries this report and the
six row commits (`723f0b42`); the one commit that follows it adds this
run's result to this report's text and changes no code, so the tree the
run exercised is the branch's tip tree apart from those paragraphs.

## 6. What this round does NOT claim

- **The roster was not folded.** It lives in another repository
  (`C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`),
  and this lane did not write to it, as the earlier rounds did not. The
  six rows' receipts add the family's own evidence; they do not change
  any row's DONE condition.
- **The live deployment.** No live request was made by the lane, and
  nothing deploys. The branch is a candidate; promotion is the operator's
  yes.
- **The Ruby HTTP surface.** No Ruby server was booted by this lane. The
  Ruby side of the mx-185 boundary is carried by the gems' own code run
  directly and by the registry's earlier oracle-app measurement that the
  row's evidence basis records.
- **Round eleven's slice.** The front slice (mx-B-049 through mx-B-054)
  is round eleven's work and is not touched or claimed here.
