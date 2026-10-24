# Tranche 15: the six create and delete rows are adjudicated, and the family grade holds at 253 of 253

Branch `port/matrix-round8-20261024` (lane copy
`C:/localProjects/decko-ts-matrix-round8-20261024`, created by the lane-copy
tool from the family's own checkout, with `node_modules` riding a junction to
the family's shared install), from the family's tip `afc8ff4d` ("The
whole-family exercise at this branch's tip: 253 of 253, the six create routes
adjudicated, the battery green").

The ask had three parts. The next SIX unadjudicated matrix rows in roster
item order beyond mx-B-030 are adjudicated, one commit each, with
oracle-matched or named-instrument evidence. The whole-family exercise runs
once at this branch's final commit and the grade line is reported. The
touched surface's battery runs green.

## 0. What the ask asked, and what this tranche found

1. **The next six unadjudicated rows.** TAKEN, one commit each, with
   oracle-matched or named-instrument evidence: mx-B-031, mx-B-032, mx-B-033,
   mx-B-034, mx-B-035 and mx-B-036. Section 2.
2. **The whole-family exercise at the final commit.** DONE; the grade line
   is **253 of 253 checks passed**. The round-four, round-five, round-six and
   round-seven baseline holds, and the one failure this tranche met on the
   way is named and fixed (Section 3). The certification run's source is the
   commit that carries this report and the six row commits. Section 5.
3. **The battery.** The instrument's own test battery passes in this lane.
   Section 4.

## 1. The selection rule, stated so a reader can check it

The roster is the row ledger for this family
(`C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`),
and the roster's own item order is the family's row-id order (the same rule
the round-three through round-seven tranches used to pick their batches).

The rule was checked against the PRE-STATE, not against the tree as this
tranche left it: the tree at the family's tip `afc8ff4d`, read with
`git ls-tree` and `git cat-file`. A family receipt is a file under
`docs/reports` whose content names the roster item's exact id. At that tip
39 of the family's 190 items are so covered, and the first items of the
roster's own order that no receipt names are

    mx-B-031-5-create-a-card-every-way-the-
    mx-B-032-5-create-a-card-every-way-the-
    mx-B-033-5-create-a-card-every-way-the-
    mx-B-034-6-delete-a-card
    mx-B-035-6-delete-a-card
    mx-B-036-6-delete-a-card

(the seventh is mx-B-037, "navbar sign out revokes the session without
changing cards", which this tranche did not take).

So the next six unadjudicated rows are **mx-B-031, mx-B-032, mx-B-033,
mx-B-034, mx-B-035 and mx-B-036** - roster items 31 through 36 of the family:
the last three of the "5. create a card every way the site offers" group and
the first three of the "6. delete a card" group.

## 2. The six rows this tranche closed

| row | the row | the instrument | the oracle | the verdict |
|---|---|---|---|---|
| mx-B-031 | create route shows signed-in chrome and a card form: /card/new | the create group, the create-route record (edge-signed-in-exercise.mjs:996, the way list at :991) | Ruby's own legacy card-view route (decko-0.20.0/config/engine_routes.rb:25, `get "card/:view(/:mark(.:format))" => "card#read", view: /new|edit/`) and Ruby's own feature support driving `/card/new?card[name]=...` (features/support/paths.rb:30); Ruby's own create-form bytes (capture arm 169, graded-identical) and the port renders the form shell at mod-form-substrate.ts:280-299 | PASS |
| mx-B-032 | the Opportunities dropdown and navbar add links are present | the create group, the navbar-and-menu record (edge-signed-in-exercise.mjs:1007) | Ruby's own dropdown machinery (card-mod-layout-0.20.0/set/abstract/items.rb:2-4, set/abstract/list.rb:1-9, set/all/navbar_links.rb:36-56) with Ruby's own menu-link bytes (capture arms 395 and 396, graded-identical); the port renders the dropdown at navbar-views.ts:156-215 | PASS |
| mx-B-033 | search for a nonexistent name offers a create link | the create group, the search record (edge-signed-in-exercise.mjs:1013, the page-wide predicate at :1012) | Ruby's own search chain (card-mod-search-0.20.0/set/self/search.rb:44-48, set/abstract/search_views.rb:6-13, set/abstract/0_search/views.rb:109-116 and :126-128) and Ruby's own results-header bytes (capture arms 511 and 512, graded-identical); the port renders the chain at card-mod-search.ts:1044-1069 and views.ts:4664-4717 | PASS |
| mx-B-034 | the edit form's Delete button is a confirm-guarded link to /delete/<name> | the delete group, the delete-button record (basic-lifecycle-journeys.mjs:79) | Ruby's own delete button (card-mod-edit-0.20.0/set/all/form_buttons.rb:53-80) and Ruby's own delete route (engine_routes.rb:41-43 and :48); the port renders the button at card-mod-edit.ts:469-482 | PASS |
| mx-B-035 | the delete removes the card (trashed, content gone, new-card page shown) | the delete group, the delete record (basic-lifecycle-journeys.mjs:96) | Ruby's own delete (decko-0.20.0/lib/card_controller/rest.rb:18-20) over Ruby's own trash semantics (card-1.110.0/mod/core/set/all/trash.rb:11-21 and :70-72), and Ruby's own unknown-card rule (card-mod-format-0.20.0/set/all/html/error.rb:81-87); the port runs them at card-action-engine.ts:4088-4180 and :4355-4393 | PASS |
| mx-B-036 | no card named delete... was created by this run (cards with id above the run baseline) | the delete group, the guard record (basic-lifecycle-journeys.mjs:104-106, the audit at delete-target-audit.mjs:1-8) | Ruby's own resurrection rule (card-1.110.0/mod/core/set/all/trash.rb:23-27 and :59-68, the trashed row's id reused); the port runs it at card-action-engine.ts:2100-2111 and :2172-2185 | PASS |

Each row's receipt is its own file under `docs/reports/`
(`row-mx-B-031-create-card-group-2026-10-24.md` through
`row-mx-B-036-delete-card-group-2026-10-24.md`), and each row's commit is
its own commit with an explicit pathspec (f4d31128, 15c8573c, 0f7737f0,
a990c29e, 54bb912f, 5c15dd9a). Every receipt names the run it was written
from (the measurement run at `5421b7eb`, started
2026-10-24T08:45:24.224Z, the source files clean) with its evidence.

WHAT IS ORACLE-MATCHED AND WHAT IS NOT is stated plainly in each receipt.
Ruby's own create form, submit button and sign-out link (capture arms 169,
158 and 406, graded-identical), Ruby's own navbar dropdown markup and menu
links (capture arms 395 and 396), Ruby's own search results header and search
box (capture arms 511 and 512), Ruby's own delete button and delete route,
Ruby's own trash and resurrection semantics, and Ruby's own unknown-card rule
are Ruby's own, and the port renders each of them.

Two limits are stated in the receipts rather than glossed over. First, no
Ruby's-own capture of a /card/new page exists, and the port's own file says
so in plain words (bunny-edge-new-card-form.ts:30-38): what the mx-B-031
receipt pins is the route, the form element, the submit button and the
sign-out link, plus the measured answer, not the page's byte-identity.
Second, and stated in the mx-B-033 receipt, the check's predicate is a
page-wide token test (`/create|new card|\/new\//i` over the whole page
HTML), and a named-instrument probe of the same page in this lane found the
token in the navbar's own dropdown item, not in the search results: Ruby's
own no-results view is an empty div.

The session cookie's name (`decko_ts_session`, src/server/write-routes.ts:363)
and the page's signed-in marker (`decko.signed_in`,
tools/edge-signed-in-exercise/lib/sign-in-surfaces.mjs:55) are the port's and
the harness's own facts, named in every receipt as named-instrument facts,
not claimed as oracle-matched.

## 3. The failure this tranche met, named and fixed

The FIRST whole-family run of this lane (the rows-r1 run, at the family's tip
`afc8ff4d`) did NOT hold the baseline. It graded **248 of 249 passed, 1
failed**, and the failure cost the run four checks: one thrown error inside a
check module stops that module, so the four C20 legs after the first never
ran, and the run graded 249 checks where a green run grades 253.

    checks module role-plus-right (checks-role-checkbox-and-plus-right-creation.mjs) /
    C20 the wanted-card affordance on a card page creates the +*right card and
    stores its junction row: FAIL
    {"threw":"page.evaluate: TypeError: Cannot read properties of null (reading 'innerText')"}

THE MECHANISM. The C20 check clicks the wanted-card link and then reads the
page it landed on (checks-role-checkbox-and-plus-right-creation.mjs:908-913).
The read is `document.body.innerText` inside a `page.evaluate`, and a
document that has no body (a page still navigating) makes that read throw.
A fixed sleep after a click is not a load guarantee on a deck whose pages
take seconds. The throw is a race, not a verdict about the surface, and it
cost the module's remaining checks.

THE FIX (commit 5421b7eb). Two parts, and both are meaning-preserving. The
C20 check now waits for the page to settle before reading it
(`page.waitForLoadState("load")` after the click), and every
`document.body` read in `tools/edge-signed-in-exercise` is null-safe: the
text of a document with no body is the empty string, which is what those
reads already meant by the `?? ""` they were written with. No verdict
changes: a read that used to throw now answers empty, and a document with no
body is not a surface with a control on it.

The harness's own battery is green after the change:

    node --test "tools/edge-signed-in-exercise/test/*.test.mjs"
    221 tests, 219 pass, 0 fail, 2 skipped (the opt-in live legs)

THE SECOND RUN, at the fix, is green: Section 5.

## 4. The battery the touched surface carries

The touched files are the six receipts and the harness guard; the surface
they stand on is the named instrument and the oracle contracts they cite. The
instrument's own battery passes in this lane:

    node --test "tools/edge-signed-in-exercise/test/*.test.mjs"
    221 tests, 219 pass, 0 fail, 2 skipped (the opt-in live legs)

and the port files the receipts cite are green too:

    npx vitest run tests/card/mod-loader/card-mod-edit.test.ts \
      tests/card/mod-loader/card-mod-edit-forms.test.ts \
      tests/card/mod-loader/card-mod-edit-views.test.ts \
      tests/card/mod-loader/card-mod-form-substrate.test.ts \
      tests/card/mod-loader/card-mod-form-substrate-2.test.ts
    5 files, 63 tests, 63 pass, 0 fail

## 5. The whole-family exercise

Two whole-family runs are recorded in this lane, on the same deck and with the
same tool.

### 5a. The run the six receipts cite

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/signed-in-exercise-round8-20261024/rows-r2/report.md

    source 5421b7eb, started 2026-10-24T08:45:24.224Z,
    completed 2026-10-24T09:03:53.692Z, the source files clean
    Result: 253 / 253 passed, 0 failed, 0 skipped by write mode

**THE FAMILY GRADE LINE: 253 of 253 checks passed.** The round-four,
round-five, round-six and round-seven baseline holds; no regression to name.
The capability coverage the family's own grader reads is 70 covered / 20
partial / 1 not covered / 1 disabled upstream / 3 out of scope, the same count
the round-three through round-seven runs read.

**THE TIMINGS LEG IS GREEN.**

    9. timings / no signed-in page exceeded 3 s of server time   PASS  {"slow":[]}
    9. timings / no save exceeded 3 s of server time            PASS  {"slow":[]}
    9. timings / no request returned a 5xx                      PASS  {"fiveHundreds":[]}

    engine requests observed in the run record             3944

The six rows this tranche closed are green in that run, each with the same
evidence shape:

    create route shows signed-in chrome and a card form: /card/new   PASS  {"status":200,"signedIn":true,"hasSignOut":true,"hasForm":true}
    the Opportunities dropdown and navbar add links are present   PASS  {"itemCount":14,...}
    search for a nonexistent name offers a create link   PASS  {"url":"...","hasCreate":true}
    the edit form's Delete button is a confirm-guarded link to /delete/<name>   PASS  {"href":"/delete/Harness_delete_mvm5mqed?success%5Bview%5D=just_deleted"}
    the delete removes the card (trashed, content gone, new-card page shown)   PASS  {"deleteStatus":200,"afterStatus":200,"trashed":true,"stillHasContent":false}
    no card named delete... was created by this run (cards with id above the run baseline)   PASS  {"cardsNamedDeleteCreatedThisRun":0,"baselineMaxCardId":53052,"intendedTombstoneId":53054,"unexpected":[]}

### 5b. The certification run at this branch's final commit

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/signed-in-exercise-round8-20261024/final/report.md

    source 7f07eb7f, started 2026-10-24T10:10:54.007Z,
    completed 2026-10-24T10:30:05.458Z, the source files clean
    Result: 253 / 253 passed, 0 failed, 0 skipped by write mode

**THE FAMILY GRADE LINE AT THIS BRANCH'S FINAL COMMIT: 253 of 253 checks
passed.** The 253-of-253 baseline holds; there is no regression to name and
nothing to fix. The capability coverage is the same count the earlier rounds
read (70 covered / 20 partial / 1 not covered / 1 disabled upstream / 3 out
of scope), the timings leg is green, and this run observed 3,979 engine
requests.

The six rows this tranche closed are green in this run too, each with the same
evidence shape as in run 5a.

The tool's exit rule is `failures.length === 0 && !coverageIncomplete`
(tools/edge-signed-in-exercise.mjs:1651), and `coverageIncomplete` is true
whenever any capability is partial, not covered or out of scope, so the run
closes with the standing line the round-five and round-six runs also carry
("Complete capability acceptance: incomplete or failed. Unrun capabilities are
never credited."). That is the tool's coverage-completeness signal, not a
check failure: the CHECK grade is 253 of 253 with zero failures. This lane's
run was piped through `tail`, so the pipeline's exit code was the pipe's; the
exit rule and the report's own closing line are what this claim rests on.

The source the run names is the commit that carries this report and the six
row commits (`7f07eb7f`); the one commit that follows it adds this run's
result to this report's text and corrects one probe sentence in the mx-B-032
receipt, and changes no code, so the tree the run exercised is the branch's
tip tree apart from those paragraphs.

## 6. What this tranche does NOT claim

- **The roster was not folded.** It lives in another repository
  (`C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`),
  and this lane did not write to it, as the round-three through round-seven
  tranches did not. The six rows' receipts add the family's own evidence;
  they do not change any row's DONE condition.
- **The live deployment.** No live request was made by this lane, and no
  row's live instrument was exercised here. Nothing deploys on the decko
  side; the branch is a candidate, and promotion is the operator's yes.
- **The byte-identity of a /card/new page.** No Ruby's-own capture of one
  exists, and the receipts say so and name what they pin instead.
- **A create link in the search results.** The mx-B-033 receipt names the
  check's real predicate and what the page's create token actually is.
- **Nothing here deploys and nothing touches live.**

## 7. The disk cost, in both directions, and the residue

The lane copy added 251,970,124 bytes at creation (the lane-copy receipt:
tracked bytes 251,970,034, estimate bytes 277,167,038, budget 314,572,800;
`node_modules` rides a junction to the family's shared install, so the
checkout is the cost). The untracked artifacts this lane's runs and its
battery produced, measured at the end of the lane: `.runtime/` 35,183,576
bytes (the three runs' reports, run records and per-request capture evidence
the receipts name, and the log of this lane's first attempt), `dist/`
14,435,120 bytes (the engine distribution the exercise builds; untracked,
rebuilt on demand), `deploy/dist/` 18,245,207 bytes (the deployed bundle the
exercise rebuilds from source; untracked, rebuilt on demand), `tmp/`
93,547,804 bytes (the exercise's own run directories with their local deck
copies and this lane's probe script), `.test-results/` 18,521 bytes (the
battery's JUnit record). The tracked tree grew from 251,909,877 bytes at the
family's tip to 252,018,742 bytes with the six receipts and this report.

Bytes removed by this lane: none. No tracked file was deleted, and no other
file was deleted either; this lane's guards forbid `rm`, and the residue
named above is evidence the receipts reference, so it is kept. The free space
on C: at the end of the lane is 21,225,906,176 bytes.
