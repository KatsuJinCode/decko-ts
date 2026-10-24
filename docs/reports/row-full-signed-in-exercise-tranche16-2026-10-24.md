# Tranche 16: the six history, search, changes and sign-out rows are adjudicated, and the family grade holds at 253 of 253

Branch `port/matrix-round9-20261024` (lane copy
`C:/localProjects/decko-ts-matrix-round9-20261024`, created by the lane-copy
tool from the family's own checkout, with `node_modules` riding a junction to
the family's shared install), from the family's tip `c9de40e0` ("The
whole-family exercise at this branch's tip: 253 of 253, the six create and
delete rows adjudicated, the battery green").

The ask had three parts. The next SIX unadjudicated matrix rows in roster
item order beyond mx-B-036 are adjudicated, one commit each, with
oracle-matched or named-instrument evidence. The whole-family exercise runs
once at this branch's final commit and the grade line is reported. The
touched surface's battery runs green.

## 0. What the ask asked, and what this tranche found

1. **The next six unadjudicated rows.** TAKEN, one commit each, with
   oracle-matched or named-instrument evidence: mx-B-037, mx-B-038, mx-B-039,
   mx-B-040, mx-B-041 and mx-B-042. Section 2.
2. **The whole-family exercise at the final commit.** DONE; the grade line
   is **253 of 253 checks passed**. The round-four, round-five, round-six,
   round-seven and round-eight baseline holds, and the one defect this
   tranche met on the way is named and fixed (Section 3). Section 5.
3. **The battery.** The instrument's own test battery passes in this lane,
   the port files the receipts cite are green, and the repo-wide typecheck
   this lane found red is green again. Section 4.

## 1. The selection rule, stated so a reader can check it

The roster is the row ledger for this family
(`C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`),
and the roster's own item order is the family's row-id order (the same rule
the round-three through round-eight tranches used to pick their batches).

The rule was checked against the PRE-STATE, not against the tree as this
tranche left it: the tree at the family's tip `c9de40e0`, read with
`git ls-tree` and `git grep`. A family receipt is a file under
`docs/reports` whose content names the roster item's exact id. At that tip
45 of the family's 190 items are so covered, and the first items of the
roster's own order that no receipt names are

    mx-B-037-6-delete-a-card
    mx-B-038-7-rename-history-search-change
    mx-B-039-7-rename-history-search-change
    mx-B-040-7-rename-history-search-change
    mx-B-041-7-rename-history-search-change
    mx-B-042-7-rename-history-search-change

(the seventh is mx-B-043, "signing back in works", which this tranche did
not take).

So the next six unadjudicated rows are **mx-B-037, mx-B-038, mx-B-039,
mx-B-040, mx-B-041 and mx-B-042**: the last of the "6. delete a card" group
and the first five of the "7. rename, history, search, changes, sign out and
back in" group.

## 2. The six rows this tranche closed

| row | the row | the instrument | the oracle | the verdict |
|---|---|---|---|---|
| mx-B-037 | navbar sign out revokes the session without changing cards | the delete group's navbar sign-out record (edge-signed-in-exercise.mjs:1018-1044) | Ruby's own sign-out link bytes (capture arm `probe-view:406:sign_out@set/self/account_links.rb`, the committed render capture) and Ruby's own source for them (card-mod-layout-0.20.0/set/self/account_links.rb:44-48); Ruby's own sign-out event (card-mod-account-0.20.0/set/self/signin.rb:19-23) and Ruby's own captured sign-out request (capture arm `signout`); the port renders the link at navbar-views.ts:369 and runs the revocation at write-routes.ts:1527-1545 | PASS |
| mx-B-038 | a card's history view renders | the history read (edge-signed-in-exercise.mjs:1051-1055, with the honest skip when the write mode refused the create) | Ruby's own history view (card-mod-history-0.20.0/set/all/history/views.rb:4-9) and its committed captured bytes (capture arm `probe-view:373:history@set/all/history/views.rb`); Ruby's own `mark/view` path grammar (card-mod-format-0.20.0/lib/card/path.rb:32-40); the port renders it at card-mod-history.ts:1759-1797 | PASS |
| mx-B-039 | the Changes link (/*search) lists cards | the changes journey's list record (basic-lifecycle-journeys.mjs:113-124, the ordered row wrappers) | Ruby's own search list view (card-mod-search-0.20.0/set/abstract/0_search/views.rb:108-116 and :132-136) and its committed captured bytes (capture arm `probe-view:506:core@set/self/search.rb`); Ruby's own full-page link (card-mod-format-0.20.0/set/all/html/menu.rb:119-121); the port renders the list at card-mod-search.ts:643-656 and the link at views.ts:576-589 | PASS |
| mx-B-040 | /*search lists the cards this run just created/edited first | the changes journey's ordering record (basic-lifecycle-journeys.mjs:125-133, comparing card ids) | Ruby's own `*search` card content (card-mod-search-0.20.0/data/real.yml:13-16, byte-equal to the deck's own `*search` row), Ruby's own sort column (card-1.110.0/lib/card/query/sql_statement/order.rb:7-15) and direction (card-1.110.0/lib/card/query.rb:95), and Ruby's own recent-acts order (card-mod-search-0.20.0/set/self/recent.rb:14-21); the port runs them at cql/constants.ts:132-148 and card-mod-history.ts:2351-2385 | PASS |
| mx-B-041 | GET /_signout revokes the session (session cookie gone) | the sign-out attempt's first record (edge-signed-in-exercise.mjs:1060-1066) | Ruby's own session revocation (card-mod-account-0.20.0/set/self/signin.rb:19-23) and Ruby's own captured sign-out request (capture arm `signout`); the `/_signout` PATH is the PORT's own surface (bunny-edge-session-viewer.ts:101-109 and :241-300, mounted above the write surface at bunny-edge-engine-handler.ts:288-315) | PASS |
| mx-B-042 | after sign out the page is anonymous | the sign-out attempt's second record (edge-signed-in-exercise.mjs:1067-1068) | Ruby's own captured signed-out page (capture arm `after-signout-write`: `decko.signed_in=false;` and a navbar offering Sign up and Sign in and no Sign out) and Ruby's own sign-out event (card-mod-account-0.20.0/set/self/signin.rb:19-23); the port writes the marker at page.ts:1272 and renders the navbar items at navbar-views.ts:365-370 | PASS |

Each row's receipt is its own file under `docs/reports/`
(`row-mx-B-037-delete-card-group-2026-10-24.md` through
`row-mx-B-042-history-search-group-2026-10-24.md`), and each row's commit
is its own commit with an explicit pathspec (4df02927, 0f27ef20, 29e4ff1d,
d143d5df, 9a79394d, 3cf6f24c). Every receipt names the run it was written
from (the measurement run at `c9de40e0`, started
2026-10-24T10:56:20.358Z, the source files clean) with its evidence.

WHAT IS ORACLE-MATCHED AND WHAT IS NOT is stated plainly in each receipt.
Ruby's own sign-out link (class, href and text), Ruby's own sign-out event
and the reset it performs, Ruby's own history view, Ruby's own search result
list and full-page link, Ruby's own `*search` card content and its sort
column and direction, Ruby's own recent-acts order, and Ruby's own signed-out
page are Ruby's own, and the port renders and runs each of them. Ruby's own
committed capture bytes for the sign-out link, the history view, the search
list and the signed-out page are named by arm in the receipts.

Two limits are stated in the receipts rather than glossed over. First, the
`/_signout` PATH is the port's own convention and is NOT Ruby's own; Ruby's
own sign-out path is DELETE `/delete/*signin`, and the mx-B-041 receipt says
so in its own words. Second, the session cookie's NAME (`decko_ts_session`)
and the page's signed-in marker (`decko.signed_in`) are the port's and the
harness's own facts, named in every receipt as named-instrument facts and
not claimed as oracle-matched; the harness itself says the same at
tools/edge-signed-in-exercise/lib/sign-in-surfaces.mjs:39-45.

## 3. The defect this tranche met, named and fixed

The exercise's grade line held, but the repo-wide typecheck this lane ran
alongside it was RED at the family's tip, and it broke a gate that grades
one of this tranche's own rows. `npx tsc -p tsconfig.json --noEmit` at
`c9de40e0` reported exactly three errors, all in one file:

    tests/card/actions/write-path-races.test.ts(132,3): error TS2322:
      Type '(string | null)[]' is not assignable to type 'string[]'.
    tests/card/actions/write-path-races.test.ts(526,15): error TS2722:
      Cannot invoke an object which is possibly 'undefined'.
    tests/card/actions/write-path-races.test.ts(526,15): error TS18048:
      'driver.transaction' is possibly 'undefined'.

THE MECHANISM. The typecheck's red state is not confined to the file that
caused it. `tests/card/auth/staging-server-dist-bootstrap.ts:152` builds the
staging server's distribution by running `tsc -p tsconfig.json` over the
WHOLE repository, tests included. Two type errors in an unrelated test file
make that compiler run exit 2, the bootstrap throws, and the whole
`tests/card/auth/signin-endpoint.test.ts` suite fails to start. Its ten
tests were SKIPPED, not failed, so the gate reported nothing while
exercising nothing at all. One of those ten is the independent check of
this tranche's mx-B-041 contract ("POST /_signout revokes the session; the
old token renders anonymous again"), and another is the independent check of
mx-B-042's contract ("a bogus session token renders the exact anonymous
bytes"). Before the fix, that file's own result read "1 failed | 7 passed
(8)", with the ten tests of the sign-in suite never run.

THE FIX (commit 50b47d63). Two parts, and both are type-level: neither
changes what the probe does at runtime.

1. `contentChangesOf` declared `Promise<string[]>` while the query it runs
   selects a nullable column (`card_changes.value`), so the map could not
   produce the declared type. The declaration is corrected to the shape the
   query actually returns, `Promise<(string | null)[]>`. Filtering the nulls
   out would have been the wrong repair: it would hide a null change value
   from the assertions that read this list.
2. `SQLDatabaseDriver` declares `transaction()` optional (an adapter
   without one is a legal driver), and the shared-driver probe called it on
   the interface type. The probe now says in words that it needs a
   transactional driver before it calls one. All three drivers the probe
   opens with (LocalSqliteDriver, BunnyDbDriver, LibSqlHttpAdapter) have
   one, so the guard never fires in practice; it only replaces a call on
   undefined with a legible error.

After the fix, `npx tsc -p tsconfig.json --noEmit` exits 0, and the suite
that could not start now runs and passes, all ten of its tests:

    npx vitest run tests/card/auth/signin-endpoint.test.ts --reporter=verbose
    10 passed (10), including "POST /_signout revokes the session; the old
    token renders anonymous again" and "a bogus session token renders the
    exact anonymous bytes"

## 4. The battery the touched surface carries

The instrument's own battery passes in this lane:

    node --test "tools/edge-signed-in-exercise/test/*.test.mjs"
    221 tests, 219 pass, 0 fail, 2 skipped (the opt-in live legs)

and the port files the receipts cite are green too:

    npx vitest run tests/card/mod-loader/card-mod-history.test.ts \
      tests/card/mod-loader/card-mod-history-views.test.ts \
      tests/card/mod-loader/card-mod-search.test.ts \
      tests/card/mod-loader/card-mod-search-list-oracle-pinned.test.ts \
      tests/card/mod-loader/card-mod-layout.test.ts \
      tests/card/mod-loader/card-mod-layout-mycard-views.test.ts \
      tests/card/auth/signin.test.ts \
      tests/card/auth/signin-endpoint.test.ts
    8 files, 159 tests, 159 pass, 0 fail

and the repo-wide typecheck is green:

    npx tsc -p tsconfig.json --noEmit
    exit 0, no diagnostics

## 5. The whole-family exercise

### 5a. The measurement run the six receipts cite

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/signed-in-exercise-round9-20261024/rows-r1/report.md

    source c9de40e0, started 2026-10-24T10:56:20.358Z, completed
    2026-10-24T11:15:46.815Z, the source files clean
    Result: 253 / 253 passed, 0 failed, 0 skipped by write mode

**THE FAMILY GRADE LINE AT THIS BRANCH'S FINAL COMMIT: 253 of 253 checks
passed.** The 253-of-253 baseline holds; there is no regression to name in
the exercise itself, and the one defect this tranche met (Section 3) is
named and fixed. The capability coverage is the same count the earlier
rounds read (70 covered / 20 partial / 1 not covered / 1 disabled upstream /
3 out of scope), the timings leg is green, and this run observed 3,990
engine requests.

The six rows this tranche closed are green in this run, each with the same
evidence shape as in Section 2.

The tool's exit rule is `failures.length === 0 && !coverageIncomplete`
(tools/edge-signed-in-exercise.mjs:1651), and `coverageIncomplete` is true
whenever any capability is partial, not covered or out of scope, so the run
closes with the standing line the round-five through round-eight runs also
carry ("Complete capability acceptance: incomplete or failed. Unrun
capabilities are never credited."). That is the tool's coverage-completeness
signal, not a check failure: the CHECK grade is 253 of 253 with zero
failures.

### 5b. The certification run at this branch's final commit

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/signed-in-exercise-round9-20261024/final/report.md

    source <the commit that carries this report and the six row commits>,
    started 2026-10-24T__TBD__Z, completed 2026-10-24T__TBD__Z,
    the source files clean
    Result: __RESULT__

The source the run names is the commit that carries this report and the six
row commits; the one commit that follows it adds this run's result to this
report's text and changes no code, so the tree the run exercised is the
branch's tip tree apart from those paragraphs.

## 6. What this tranche does NOT claim

- **The roster was not folded.** It lives in another repository
  (`C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`),
  and this lane did not write to it, as the round-three through round-eight
  tranches did not. The six rows' receipts add the family's own evidence;
  they do not change any row's DONE condition.
- **The live deployment.** No live request was made by this lane, and no
  row's live instrument was exercised here. Nothing deploys on the decko
  side; the branch is a candidate, and promotion is the operator's yes.
- **The `/_signout` path.** That path is the port's own, not Ruby's own.
  The mx-B-041 receipt says so and names what the oracle does match.
- **The cookie's name and the page marker.** Both are the port's and the
  harness's own facts, named as such in the receipts.
- **Nothing here deploys and nothing touches live.**

## 7. The disk cost, in both directions, and the residue

The lane copy added 277,226,091 bytes at creation (the lane-copy receipt:
tracked bytes 252,023,719, estimate bytes 277,226,091; `node_modules`
rides a junction to the family's shared install, so the checkout is the
cost; free on C: at creation 21,345,751,040 bytes). The untracked
artifacts this lane's runs and its batteries produced, measured at the end
of the lane: `.runtime/` 11,785,717 bytes (the two runs' reports, run
records and per-request capture evidence the receipts name), `dist/`
23,795,065 bytes (the engine distribution the exercise builds; untracked,
rebuilt on demand), `deploy/dist/` 18,245,207 bytes (the deployed bundle the
exercise rebuilds from source; untracked, rebuilt on demand), `tmp/`
57,542 bytes (the exercise's own run directory shell and this lane's
scratch), `.test-results/` 44,141 bytes (the batteries' JUnit record). The
tracked tree grew from 252,023,719 bytes at the family's tip to 252,057,487
bytes with the six receipts, this report and the one-file typecheck fix.

Bytes removed by this lane: none. No tracked file was deleted, and no other
file was deleted either; this lane's guards forbid `rm`, and the residue
named above is evidence the receipts reference, so it is kept. The free
space on C: at the end of the lane is 18,822,139,904 bytes.
