# Tranche 14: the six create routes are adjudicated, and the family grade holds at 253 of 253

Branch `port/matrix-round7-20261024` (lane copy
`C:/localProjects/decko-ts-matrix-round7-20261024`, created by the
diskSteward worktree tool from `port/matrix-round6-20261024` tip
`e3b7cd0c`, with `node_modules` riding a junction to the family's shared
install), from the family's tip `e3b7cd0c` ("The whole-family exercise at
this branch's tip: 253 of 253, the six rows after the RichText modal
adjudicated, the battery green").

The ask had three parts. The next SIX unadjudicated matrix rows in roster
item order beyond mx-B-024 are adjudicated, one commit each, with
oracle-matched or named-instrument evidence. The whole-family exercise runs
once at this branch's final commit and the grade line is reported. The
touched surface's battery runs green.

## 0. What the ask asked, and what this tranche found

1. **The next six unadjudicated rows.** TAKEN, one commit each, with
   oracle-matched or named-instrument evidence. Section 2.
2. **The whole-family exercise at the final commit.** DONE; the grade line is
   **253 of 253 checks passed** - the round-four, round-five and round-six
   baseline holds, no regression to name. The certification run's source is
   the commit that carries this report and the six row commits. Section 4.
3. **The battery.** The instrument's own test battery and the oracle pins
   the receipts cite all pass in this lane. Section 3.

## 1. The selection rule, stated so a reader can check it

The roster is the row ledger for this family
(`C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`),
and the roster's own item order is the family's row-id order (the same rule
the round-three through round-six tranches used to pick their batches).

The rule was checked against the PRE-STATE, not against the tree as this
tranche left it: the tree at the family's tip `e3b7cd0c`, read with
`git ls-tree` and `git show`. The roster's family for this lane (family
[Family]) holds 190 items; 29 of them already have a family receipt whose
own opening lines name their exact roster id in that tree (mx-155, mx-190,
mx-B-001 through mx-B-024, mx-B-081, mx-B-086 and mx-B-110); the first
UNCOVERED items, in the roster's own item order, are

    mx-B-025-5-create-a-card-every-way-the-
    mx-B-026-5-create-a-card-every-way-the-
    mx-B-027-5-create-a-card-every-way-the-
    mx-B-028-5-create-a-card-every-way-the-
    mx-B-029-5-create-a-card-every-way-the-
    mx-B-030-5-create-a-card-every-way-the-

So the next six unadjudicated rows are **mx-B-025, mx-B-026, mx-B-027,
mx-B-028, mx-B-029 and mx-B-030** - roster items 25 through 30 of the
family, the six rows after the RichText group, all of them in the
"5. create a card every way the site offers" group. (The round-six
tranche's own report named mx-B-025 as the seventh row it did not take;
this tranche takes it.)

## 2. The six rows this tranche closed

| row | the row | the instrument | the oracle | the verdict |
|---|---|---|---|---|
| mx-B-025 | create route shows signed-in chrome and a card form: /new/RichText | the create group, the create-route record (edge-signed-in-exercise.mjs:996, the way list at :985) | Ruby's own /new/:type route (decko-0.20.0/config/engine_routes.rb:22) and Ruby's own fetch of the type (card_class.rb:130); Ruby's own create-form bytes (capture arm 169, graded-identical); the port renders the form shell at mod-form-substrate.ts:280-299 | PASS |
| mx-B-026 | create route shows signed-in chrome and a card form: /new/Basic | the create group, the create-route record (edge-signed-in-exercise.mjs:996, the way list at :986) | the same route, the same create-form bytes (capture arm 169) and the same type selector (capture arm 162); the port renders both at mod-form-substrate.ts:280-299 and card-mod-edit.ts:1985-1988 | PASS |
| mx-B-027 | create route shows signed-in chrome and a card form: /new/Date | the create group, the create-route record (edge-signed-in-exercise.mjs:996, the way list at :987) | the same route, the same create-form bytes (capture arm 169) and the same type selector (capture arm 162); the port renders both at mod-form-substrate.ts:280-299 and card-mod-edit.ts:1985-1988 | PASS |
| mx-B-028 | create route shows signed-in chrome and a card form: unknown card name (/Some_New_Name) | the create group, the create-route record (edge-signed-in-exercise.mjs:996, the way list at :988) | Ruby's own standard GET route (decko-0.20.0/config/engine_routes.rb:19), Ruby's own unknown-card rule (card-mod-format-0.20.0/set/all/html/error.rb:81-87, `ok?(:create) ? :new : super`), Ruby's own mark decoding (card_class.rb:131) and Ruby's own create-form bytes (capture arm 169); the port renders the create form at card-mod-edit.ts:2491 and the unknown-card substitution at format.ts:1676-1682 | PASS |
| mx-B-029 | create route shows signed-in chrome and a card form: unknown card name /new | the create group, the create-route record (edge-signed-in-exercise.mjs:996, the way list at :989) | Ruby's own `:mark/:view` route (decko-0.20.0/config/engine_routes.rb:51), Ruby's own unknown-card rule and create-form bytes; the port renders the create form at card-mod-edit.ts:2491 | PASS |
| mx-B-030 | create route shows signed-in chrome and a card form: unknown card ?view=new | the create group, the create-route record (edge-signed-in-exercise.mjs:996, the way list at :990) | Ruby's own view-from-the-query rule (decko-0.20.0/lib/card_controller/rest.rb:106-109), Ruby's own unknown-card rule and create-form bytes; the port renders the create form at card-mod-edit.ts:2491 | PASS |

Each row's receipt is its own file under `docs/reports/`
(`row-mx-B-025-create-card-group-2026-10-24.md` through
`row-mx-B-030-create-card-group-2026-10-24.md`), and each row's commit is
its own commit with an explicit pathspec (b418121c, 5384cfd6, 0e8e1875,
8d39ba33, d7aa6909, 68295905). Every receipt names the run it was written
from (the measurement run at `e3b7cd0c`, started 2026-10-24T06:58:51.466Z,
completed 2026-10-24T07:19:11.255Z, the source files clean) with its
evidence.

WHAT IS ORACLE-MATCHED AND WHAT IS NOT, per row, stated plainly in each
receipt. Ruby's own create-form element (the capture arm
probe-view:169:simple_new@set/all/new.rb, graded-identical), the type
selector's own element (probe-view:162, graded-identical), the submit
button's own bytes (probe-view:158, graded-identical), the sign-out link's
own bytes (probe-view:406, graded-identical), the /new/:type route and the
type it carries, the unknown-card rule, the mark's own decoding and the
view-from-the-query rule are Ruby's own, and the port renders each of them.

Two limits are stated in the receipts rather than glossed over. First, no
Ruby's-own capture of a /new/:type page exists at all, and the port's own
file says so in plain words (bunny-edge-new-card-form.ts:31-38): what the
receipts pin for those three rows is the route, the form element, the type
selector, the submit button and the sign-out link, plus the measured
answer, not the page's byte-identity. Second, the type selector's SELECTED
option in the capture is the capture deck's own type (RichText), so for
mx-B-026 and mx-B-027 the selected value is the port's own type resolution
and is named as such.

The session cookie's name (`decko_ts_session`,
src/server/write-routes.ts:363) and the page's signed-in marker
(`decko.signed_in`, tools/edge-signed-in-exercise/lib/sign-in-surfaces.mjs:55)
are the port's and the harness's own facts, named in every receipt as
named-instrument facts, not claimed as oracle-matched.

## 3. The battery the touched surface carries

The touched files are the six receipts; the surface they stand on is the
named instrument and the oracle contracts they cite. The instrument's own
battery, and the pins the receipts cite, all pass in this lane:

    node --test "tools/edge-signed-in-exercise/test/*.test.mjs"
    221 tests, 219 pass, 0 fail, 2 skipped (the opt-in live legs)

    npx vitest run tests/card/mod-loader/card-mod-edit.test.ts \
      tests/card/mod-loader/card-mod-edit-forms.test.ts \
      tests/card/mod-loader/card-mod-edit-views.test.ts \
      tests/card/mod-loader/card-mod-form-substrate.test.ts \
      tests/card/mod-loader/card-mod-form-substrate-2.test.ts
    5 files, 63 tests, 63 pass, 0 fail

## 4. The whole-family exercise

Two whole-family runs are recorded in this lane, on the same deck and with
the same tool.

### 4a. The run the six receipts cite

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/signed-in-exercise-round7-20261024/rows-r1/report.md

    source e3b7cd0c, started 2026-10-24T06:58:51.466Z,
    completed 2026-10-24T07:19:11.255Z, the source files clean
    Result: 253 / 253 passed, 0 failed, 0 skipped by write mode

**THE FAMILY GRADE LINE: 253 of 253 checks passed.** The round-four,
round-five and round-six baseline holds; no regression to name. The
capability coverage the family's own grader reads is 70 covered / 20 partial
/ 1 not covered / 1 disabled upstream / 3 out of scope, the same count the
round-three through round-six runs read.

**THE TIMINGS LEG IS GREEN.**

    9. timings / no signed-in page exceeded 3 s of server time   PASS  {"slow":[]}
    9. timings / no save exceeded 3 s of server time            PASS  {"slow":[]}
    9. timings / no request returned a 5xx                      PASS  {"fiveHundreds":[]}

    engine requests observed in the run record             3968

The tool exits 1 on this run, and the round-five and round-six runs' own
reports carry the identical closing line ("Complete capability acceptance:
incomplete or failed. Unrun capabilities are never credited."), so this is
the tool's standing behaviour and not a check failure: its exit is
`failures.length === 0 && !coverageIncomplete`
(tools/edge-signed-in-exercise.mjs:1651), and `coverageIncomplete` is true
whenever any capability is partial, not covered or out of scope. The CHECK
grade is 253 of 253 with zero failures.

The six rows this tranche closed are green in that run, each with the same
evidence shape:

    create route shows signed-in chrome and a card form: /new/RichText   PASS  {"status":200,"signedIn":true,"hasSignOut":true,"hasForm":true}
    create route shows signed-in chrome and a card form: /new/Basic     PASS  {"status":200,"signedIn":true,"hasSignOut":true,"hasForm":true}
    create route shows signed-in chrome and a card form: /new/Date      PASS  {"status":200,"signedIn":true,"hasSignOut":true,"hasForm":true}
    create route shows signed-in chrome and a card form: unknown card name (/Some_New_Name)  PASS  {"status":200,"signedIn":true,"hasSignOut":true,"hasForm":true}
    create route shows signed-in chrome and a card form: unknown card name /new  PASS  {"status":200,"signedIn":true,"hasSignOut":true,"hasForm":true}
    create route shows signed-in chrome and a card form: unknown card ?view=new  PASS  {"status":200,"signedIn":true,"hasSignOut":true,"hasForm":true}

### 4b. The certification run at this branch's final commit

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/signed-in-exercise-round7-20261024/final/report.md

    source de99de05 (the commit that carries this report and the six row
    commits), started 2026-10-24T07:30:21.120Z,
    completed 2026-10-24T07:47:58.261Z, the source files clean
    Result: 253 / 253 passed, 0 failed, 0 skipped by write mode

**THE FAMILY GRADE LINE AT THIS BRANCH'S FINAL COMMIT: 253 of 253 checks
passed.** The 253-of-253 baseline holds; there is no regression to name and
nothing to fix. The capability coverage is 70 covered / 20 partial / 1 not
covered / 1 disabled upstream / 3 out of scope, the same count the
round-three through round-six runs read. The timings leg is green here as
well (no signed-in page over 3 s of server time, no save over 3 s, no 5xx),
and this run observed 3,976 engine requests.

The six rows this tranche closed are green in this run too, each with the
same evidence shape as in run 4a ({"status":200,"signedIn":true,
"hasSignOut":true,"hasForm":true}).

The run exits 1 for the same standing reason as run 4a, on the tool's
coverage-completeness signal, not on a check failure. The source the run
names is the commit that carries this report and the six row commits
(`de99de05`); the one commit that follows it adds this run's result to this
report's text and corrects the line citations in the six receipts and in
this report, and changes no code, so the tree the run exercised is the
branch's tip tree apart from those paragraphs.

## 5. What this tranche does NOT claim

- **The roster was not folded.** It lives in another repository
  (`C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`),
  and this lane did not write to it, as the round-three through round-six
  tranches did not. The six rows' receipts add the family's own evidence;
  they do not change any row's DONE condition.
- **The live deployment.** No live request was made by this lane, and no
  row's live instrument was exercised here. Nothing deploys on the decko
  side; the branch is a candidate, and promotion is the operator's yes.
- **The byte-identity of a /new/:type page.** No Ruby's-own capture of one
  exists, and the receipts say so and name what they pin instead.
- **Nothing here deploys and nothing touches live.**

## 6. The disk cost, in both directions, and the residue

The lane copy added 277,100,865 bytes at creation (the diskSteward
worktree receipt: free bytes before 18,999,504,896, projected free bytes
after 18,722,404,031, tracked bytes 251,909,877; `node_modules` rides a
junction to the family's shared install, so the checkout is the cost). The
untracked artifacts this lane's two runs and its battery produced,
measured at the end of the lane: `.runtime/` 23,541,383 bytes (both runs'
reports, run records and per-request capture evidence the receipts name,
and the log of this lane's first attempt), `dist/` 14,435,120 bytes (the
engine distribution the exercise builds; untracked, rebuilt on demand),
`deploy/dist/` 18,245,207 bytes (the deployed bundle the exercise rebuilds
from source; untracked, rebuilt on demand), `.test-results/` 18,526 bytes
(the battery's JUnit record), `tmp/` 37,987 bytes (the exercise's own run
directory and this editing script). The tracked tree grew from 251,909,877
bytes to 251,968,007 bytes with the six receipts and this report (the
measurement is at the commit that carries this report). Bytes
removed by this lane: none. No tracked file was deleted, and no other file
was deleted; this lane's own stray log was moved into the run's own
evidence folder rather than removed. The residue named above is evidence
the receipts reference, kept.
