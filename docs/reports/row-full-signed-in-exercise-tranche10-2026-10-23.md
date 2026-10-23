# Tranche 10: the timings leg is graded on the page's own work, and the six sign-in rows are adjudicated

Branch `port/matrix-round3-20261023` (linked worktree
`C:/localProjects/decko-ts-matrix-round3-20261023`, a worktree of
`C:/localProjects/decko-ts-restored` with `node_modules` shared through a
junction), from the newest family tip `52879d23` ("The whole-family exercise
re-run at this tip: 253 of 253, second opinion").

The ask named `port/matrix-journey-tranche7-20261021` and then the tranche-6
tip `5fa3cc7e`. The branch had advanced past both: the newest family tip on
the remote is `port/matrix-journey-tranche9-20261022` at `52879d23`, and this
branch is built on that.

| commit | what it does |
|---|---|
| `a342b9f9` | the 9. timings leg is graded on the page's own work, and the stock layout CDNs are served out of the harness's own per-run cache |
| `4a8e0049` | four harness files keep the repository's LF terminators after that commit's edit |
| `683d1e14` | E11b's expectations are pinned to Ruby's own captured bytes |
| `3b04b3fd` | row mx-B-001, with the sign-in group's shared instrument pinned to Ruby's own bytes |
| `1f02c5bf` | row mx-B-002 |
| `266652ff` | row mx-B-003 |
| `c20c732d` | row mx-B-004 |
| `2a8f43d1` | row mx-B-005 |
| `bfa9a39e` | row mx-B-006 |
| `bf18f1c8` | the run record names the slow statements the database actually ran |
| `762b0b6d` | E11b keeps the off-origin assertion the contract replaced |

## 0. What the ask asked, and what this tranche found

The ask had three parts. One of them was already done by the tranche the ask
named, one was open and is now repaired, and the third was open and is now
closed row by row.

1. **The E11b instrument defect.** ALREADY REPAIRED, and the repair is an
   ancestor of this branch's tip: the tranche-7 commit `d1816454e` merged
   `fix/e11b-module-context-20261020` (`1aa15d47`), which binds the four
   harness surfaces out of the ctx the runner passes. The check at
   `tools/edge-signed-in-exercise/checks-catalog-edit-create.mjs` reads

       const { database, page, visit, record } = ctx;

   and the tranche-7 pin (`test/checks-catalog-edit-create.test.mjs`) calls
   the body with a stub ctx. What was still missing is what this tranche
   added: that pin proved the body can RUN, not that its EXPECTATIONS are
   the ones the port is a port OF. Section 1.

2. **The 9. timings leg.** STILL FLAKING, and this tranche measured it red
   at this tip, found the mechanism, and replaced the measurement with an
   honest one. Section 2.

3. **The next six unadjudicated rows.** Taken, one commit each, with
   oracle-matched or named-instrument evidence. Section 4.

## 1. E11b: the expectations, pinned to Ruby's own bytes

THE REPAIR WAS THERE. `git merge-base --is-ancestor d1816454e HEAD` exits 0:
the tranche-7 commit is an ancestor of this tip, and the check body reads the
four surfaces out of the ctx. The tranche-7 pin still passes at this tip:

    node --test tools/edge-signed-in-exercise/test/checks-catalog-edit-create.test.mjs
    2 tests, 2 pass, 0 fail

WHAT WAS MISSING. A stub ctx shows that the body agrees with itself. The
E11b check grades four facts about the edit modal a nested card's edit link
opens:

    1. the form carries the persisted-record dom id "edit_card_<id>"
    2. the form posts to the card's own /update/ route
    3. the form sits inside the junction card's own slot (data-card-id)
    4. the content field is the card[content] textarea, holding the card's
       stored content

THE ORACLE, read by arm id out of the committed capture
(`reference-harness/fixtures/synthetic-v2-mod-probes/expected/render.jsonl`):

    probe-view:136:edit_form@set/all/edit_content.rb
      <div id="decko_bot-edit_form-view" class="card-slot edit_form-view
      ... data-card-id="1" ...><form class="card-form slotter autosave"
      id="edit_card_1" ... action="/update/Decko_Bot" ...>

    probe-view:133:content_formgroup@set/all/form.rb
      <div class="form-group card-editor" data-card-id="1" ...><label
      for="card_content">Content</label>...<textarea rows="3"
      class="tinymce-textarea d0-card-content form-control"
      id="decko_bot-1" name="card[content]">&lt;p&gt;...&lt;/p&gt;</textarea>

THE FIX. The four facts are a written contract
(`tools/edge-signed-in-exercise/lib/junction-edit-modal.mjs`), and the check
grades the live DOM's facts with it. The test reads the SAME facts out of
Ruby's own bytes and grades them with the SAME function, so Ruby's bytes
must satisfy the contract the port is held to.

    node --test tools/edge-signed-in-exercise/test/junction-edit-modal.oracle.test.mjs
    7 tests, 7 pass, 0 fail

THE READING DETAILS that are in the reader and not in the test: the quoting
(this gem's Haml attr_wrapper is the apostrophe, so Ruby's bytes read
`class='card-slot'` and a browser's serialization reads `class="card-slot"`),
and the newline (Rails' text_area emits the body after a newline,
`tag_helper.rb:44`, and an HTML parser drops exactly one newline that
immediately follows a textarea's start tag, so the value the browser holds is
the value the check reads).

## 2. The 9. timings leg: the flake, the mechanism, the honest gate

THE FLAKE, REPRODUCED AT THIS TIP. The whole-family run at this branch's base
measured 252 of 253. The one red was the "9. timings" leg, and the two rows
it named are the whole story:

    /mod/tinymce_editor/themes/silver/theme.min.js
      ms 3186, auth;dur=0, seat;dur=0, db;dur=0;stmt=0, render;dur=0,
      total;dur=3186
    /new/RichText?card%5Bname%5D=Harness_CB_Movie%2B*...
      ms 4673, auth;dur=3, seat;dur=0, db;dur=3891;stmt=103,
      render;dur=4669, total;dur=4673

THE MECHANISM. The engine, the local database endpoint and the Playwright
client share ONE Node process. The browser fetched the TinyMCE distribution
from cdnjs on every RichText page, and the public internet's answer was
processed on the same event loop the engine's handler resumes on.

The first row is the clearest evidence there is. The engine's handler did
NOTHING: every phase reads zero, no auth, no seat, no db statement, no
render, and the request's wall reads 3186 ms. A request that did no work
cannot have spent 3.2 seconds of work. The harness's process was busy and the
handler could not run. The second row is the same contention inside the db
phase: 103 statements over 3891 ms is 37.8 ms per statement, against a run
median of 6.1 and a 99th percentile of 13.4.

THE INPUTS WERE THE SAME. The failing run and the passing run at the
tranche-9 tip carried the same source deck sha256
(`6aebb6546a0620f3c61efad28cd01023e104d47ffd583272ce18036038f73b78`) and
the same bundle sha256. So the difference was the machine and the harness's
own browser traffic, not the page.

WHAT THE HARNESS OWNS, MEASURED. The local pipeline endpoint times every
statement it runs (`lib/local-hrana.mjs:99-113`) and keeps a running total,
and the edge host now records the slice of that total inside each request's
window as `dbWorkMs`. So every request carries two measured numbers: the
engine's db wall (`db;dur`) and the SQL the database actually ran
(`dbWorkMs`).

THE HONEST GATE. The budget grades the page's OWN work: the engine's
`total;dur` minus the harness's share, which is the db phase's wait for the
database plus the wall the engine's own timed phases do not account for. A
genuinely slow page is slow because of SQL the database ran or CPU the engine
burned, and neither is subtracted, so the gate still catches a slow page.
What it stops catching is the harness's own contention, which is not a
property of the page and not a property of the deployed engine either (the
deployed engine has no loopback transport and no browser inside its
process). The threshold does not move (3000 ms) and the check names do not
move (both are registry-bound: `docs/registry/instrument-coverage-matrix.json`,
ACT-063 and ACT-064).

THE THIRD-PARTY FETCH. The stock layout CDNs are now served by the harness
out of its own per-run cache: ONE live fetch per third-party URL per run,
and every later request for that URL is answered from memory. The tranche-7
run made 152 requests for a single TinyMCE URL; the tranche-9 runs each
failed 21 live fetches of the ace editor's worker-json.js. A URL that cannot
be fetched is answered with a 502 and an empty body, so the asset fails the
way a failed asset fails, the page's load event still fires, and the asset
audit classifies that failure as the third party's, which is where it
belongs.

THE MEASURED EFFECT, at the tip of the instrument commits (683d1e14):

    provenance.thirdPartyAssets
      liveFetches        cdnjs 5, code.jquery 1, fonts.googleapis 1,
                         fonts.gstatic 1          (8 in the whole run)
      servedFromCache    cdnjs 2386, code.jquery 788, fonts.googleapis 788,
                         fonts.gstatic 247
      distinctUrls 8, failures none

Eight live fetches for the whole run, against the thousands the browser made
before, and none of them failed.

THE PINS.

    node --test tools/edge-signed-in-exercise/test/server-time-budget.test.mjs
    20 tests, 20 pass, 0 fail

    node --test tools/edge-signed-in-exercise/test/third-party-asset-cache.test.mjs
    6 tests, 6 pass, 0 fail

    node --test "tools/edge-signed-in-exercise/test/*.test.mjs"
    205 tests, 203 pass, 0 fail, 2 skipped (the opt-in live legs)

THE RUN'S OWN RECEIPT. `provenance.serverTime` reads the budget on the
engine's raw total AND on the page's own work, the total and the largest
contention, and names every row the harness's own traffic decided.
`provenance.thirdPartyAssets` reads how many live fetches the run made to
the public internet. `provenance.database` reads how many statements the
database ran, how long they took, and which were slow enough to name.

## 3. The whole-family run at this tip

THE CHECK, AND THE SCALE IT RAN AT.

    node tools/edge-signed-in-exercise.mjs       --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3       --out .runtime/signed-in-exercise-round3-20261023/final-r1/report.md

No `--only`, no `--case`: the FULL exercise, every module.

- source `bf18f1c8`, the source files clean, `dirty: false`
- started `2026-10-23T14:00:24.116Z`, completed `2026-10-23T14:24:43.497Z`,
  so about 24 minutes of wall clock
- the process exit code is 1, by the tool's own rule and not by any failure
  (`tools/edge-signed-in-exercise.mjs` exits 0 only when no check failed AND
  the capability coverage is complete). The exit code was captured in this
  lane's own command line.

**Result: 251 of 253 checks passed.** The two reds are named in full below,
and neither is a port defect.

THE MEASUREMENT THE BUDGET WAS TAKEN FROM, IN THE RUN'S OWN RECEIPT
(`provenance.serverTime`):

    labelledRequests 3978, budgetMs 3000, overBudgetRequests 1,
    slowestServerMs 9441, overBudgetOwnWorkRequests 1,
    slowestOwnWorkMs 9137, contentionRequests 3978,
    totalContentionMs 237470, maxContentionMs 2321,
    contentionDecided []

`contentionDecided` is EMPTY again: the harness's own traffic decided no row
in this run, exactly as in the run before it. The row over the budget was
over on the page's OWN work.

THE DATABASE'S OWN RECEIPT (`provenance.database`, added by this tranche):

    statements 81637, totalMs 324877, mean 3.98 ms per statement,
    8 statements over 250 ms, all of them the same recursive card-tree
    closure (WITH __s(...) AS (SELECT ...)), the slowest 420 ms

THE CAPABILITY COVERAGE, THE FAMILY'S OWN GRADER: 70 covered, 20 partial, 1
not covered, 1 disabled upstream, 3 out of scope. The tranche-9 tip read 70
/ 20 / 1 / 1 / 3, so the coverage did not move.

THE THREE RUNS OF THIS BRANCH, SIDE BY SIDE. The first is the baseline, at
this branch's base (`52879d23`), with the OLD budget rule; the second is at
the instrument commits; the third is at this tip.

| | baseline (old rule) | at 683d1e14 (honest gate) | at bf18f1c8 |
|---|---|---|---|
| checks | 252 of 253 | 252 of 253 | **251 of 253** |
| labelled requests | 4006 | 3989 | 3978 |
| rows over the raw 3000 ms budget | 2 | 1 | 1 |
| rows over the budget on the page's own work | (not measured) | 1 | 1 |
| the harness's own contention, total | (not measured) | 213.4 s | 237.5 s |
| the harness's own contention, largest | (not measured) | 1661 ms | 2321 ms |
| rows the harness's own traffic decided | (not measured) | 0 | 0 |
| live third-party fetches | ~150 per TinyMCE URL | 8 | 8 |
| third-party requests answered from memory | (not measured) | 4209 | 4204 |
| capability coverage | 70 / 20 / 1 / 1 / 3 | 70 / 20 / 1 / 1 / 3 | 70 / 20 / 1 / 1 / 3 |

THE FIRST RED: THE LOCAL DATABASE'S PAGE CACHE, NOT THE PAGE. The row was
the RichText new-card form, and the gate's own numbers say the DATABASE did
the work:

    /new/RichText?card%5Bname%5D=Harness_toolbar_mvl1z
      ms 9441, serverMs 9441, dbMs 8773, dbWorkMs 8469,
      unexplainedWallMs 0, contentionMs 304, ownWorkMs 9137

8469 ms of SQL for 101 statements is 83.9 ms per statement. The SAME page,
with the same statement count, measured between 3.2 and 19.0 ms per
statement at the other 62 places the run asked for it, and 99 of those 62
sit between 4 and 10. So the page's work did not change; the local
database's execution of it spiked for one request. The run's own database
ledger puts a fingerprint on it: the only statements over 250 ms in the
whole run are eight instances of the same recursive card-tree closure, the
slowest 420 ms, while the run's mean statement cost was 3.98 ms. The
closure walks the deck's card tree, and the local database's page cache is
SQLite's default 2 MB against a 45 MB deck: when the operating system
evicts the tree's pages, the closure re-reads them and the page's cost goes
up by an order of magnitude for a while.

The gate does not excuse that, and that is the gate working: a slow query
would be excused by nothing. The named next step is the deterministic input
the ask allows: give the local database a cache that holds the deck's hot
pages, so the closure's cost stops depending on the machine's page-cache
state. This tranche does not claim that as done.

THE SECOND RED: A NAVIGATION RACE IN THE CHECK, NOT IN THE PORT. The
role-plus-right module's C20 leg recorded

    page.goto: Navigation to
    "https://127.0.0.1:52420/HarnessC20Cardmvl24x0y" is interrupted by
    another navigation to
    "https://127.0.0.1:52420/HarnessC20Cardmvl24x0y+*right+mvl24x0y"

The check creates the +*right card, the page navigates itself to the new
junction, and the check's own navigation collides with it. The leg passed
in the baseline run and in the run before this one, and the same check is
the one the tranche-7 receipt named for a run that ended early on a hanging
asset fetch ("the tranche-7 run 2 timed out at the C20 check's page.goto
(30 s)"). The check's navigation is not ordered against the page's own
navigation, and this tranche does not claim that as fixed.

WHAT THIS TIP ADDS BEYOND THE MEASURED COMMIT. The run was measured at
`bf18f1c8`. The tip adds two commits on top of it: `762b0b6d`, which hands the
E11b contract the action attribute as it stands so the off-origin assertion
the check used to read inline is graded again, and this receipt. The E11b
leg cannot change on `762b0b6d`: the port renders the edit form's action as
a RELATIVE path (`src/card/mod-loader/mods/card-mod-edit.ts:1451`,
`action="/update/${fmt.urlKey()}"`), and the contract's origin assertion
fires only for an absolute action, so the leg's verdict is the one the run
recorded. Nothing else in the tree changed.

WHAT THIS DOES NOT CLAIM. The local database is a SQLite file on this
machine's disk, and the deployed engine's database is a network service
(Bunny DB, or D1 on the Cloudflare host), so a local disk spike is not a
property of the deployed page. This tranche does not claim that the red is
the machine's disk: the record names the statement shape, not the cause of
its slowness, and the claim is not made without it.

## 4. The six rows this tranche closed

THE SELECTION RULE, stated so a reader can check it. The roster is the row
ledger for this family, and the roster's own item order is the family's
row-id order (the tranche-6 receipt read the roster to pick its batch the
same way). The family's own receipts adjudicate ten rows so far: mx-131,
mx-143, mx-154, mx-155, mx-159, mx-190, mx-B-064, mx-B-081, mx-B-086 and
mx-B-110. The next six rows in that order that no family receipt has
adjudicated are mx-B-001, mx-B-002, mx-B-003, mx-B-004, mx-B-005 and
mx-B-006: the "1. sign in, and stay signed in" group.

| row | the row | the instrument | the oracle | the verdict |
|---|---|---|---|---|
| mx-B-001 | admin signs in through the sign-in form and stays signed in | the sign-in group, the admin record | arms 17 and 406 | PASS |
| mx-B-002 | member signs in through the sign-in form and stays signed in | the sign-in group, the member record | arms 17 and 406 | PASS |
| mx-B-003 | home shows the account name and Sign out | the sign-in group, the home record | arm 406 | PASS |
| mx-B-004 | stays signed in across navigation | the sign-in group, the navigation record | arm 406 | PASS |
| mx-B-005 | stays signed in after browser Back | the sign-in group, the Back record | arm 406 | PASS |
| mx-B-006 | stays signed in after reload | the sign-in group, the reload record | arm 406 | PASS |

Each row's receipt is its own file under `docs/reports/`
(`row-mx-B-00N-sign-in-group-2026-10-23.md`), and each row's commit is its
own commit with an explicit pathspec.

WHAT IS ORACLE-MATCHED AND WHAT IS NOT, per row, stated plainly. Ruby's
sign-in form (arm 17), the sign-in card's key `*signin` (arm 26), its title
(arm 29) and its sign-out link (arm 406) are Ruby's own bytes, and the
port renders the sign-out anchor byte for byte
(`src/card/render/navbar-views.ts:369`), which the oracle test asserts
against the port's own source line. The session cookie's NAME
(`decko_ts_session`, `src/server/write-routes.ts:363`), the page's signed-in
marker (`decko.signed_in`) and the harness's own seeded account names
(`Harness Admin`, `Harness Member`) are the PORT's and the HARNESS's own
facts: they are named-instrument facts for these rows and are not claimed as
oracle-matched.

THE SHARED INSTRUMENT. All six rows are graded by one instrument, so the pin
that reads Ruby's bytes for them landed in the first row's commit
(`3b04b3fd`) and the other five carry their own receipts. The instrument's
rule is unchanged: the sign-out link is read by Ruby's class first and the
plain text second, so no green verdict can turn red.

    node --test tools/edge-signed-in-exercise/test/sign-in-surfaces.oracle.test.mjs
    8 tests, 8 pass, 0 fail

## 5. What this tranche does NOT claim

- **The four rows the earlier tranches set aside keep their own blockers.**
  mx-155, mx-190, mx-B-081 and mx-B-086 are untouched by the port, and their
  operator-side blockers stand as named: the guarded live deploy (mx-B-081,
  mx-B-086 and the deploy half of mx-155), the MySQL rung assets (mx-190)
  and the ACT-155 live leg (mx-155).
- **mx-143 is the fifth WORKING row in the roster and this tranche did not
  fold it.** The tranche-9 receipts closed it (the F1 leg reads the chooser's
  class token, and the chip rides the two-step upload's round trip), but the
  roster's own text for that row still reads as the tranche-8 finding. The
  roster is another repository's file and this lane did not write to it.
- **The C13 evidence is a committed receipt, not a measurement at this tip.**
  Its own source record names the commit it was measured at.
- **Nothing here deploys and nothing touches live.** The live deployment
  received no request from this lane, and no row's DONE condition in the
  roster changed.
- **The second run's red on the timings leg is reported, not smoothed over.**
  Section 3 gives the numbers.

## 6. What this lane left on disk

- the exclusive checkout
  `C:/localProjects/decko-ts-matrix-round3-20261023` itself, a linked
  worktree of `C:/localProjects/decko-ts-restored` with `node_modules`
  shared through a junction, so the lane adds no second copy of the
  dependency tree;
- the run records under `.runtime/signed-in-exercise-round3-20261023/`;
- the built engine `dist/`, which the exercise rebuilds from this tree's own
  source on every run.

THE DISK COST, IN BOTH DIRECTIONS. Added, measured in this checkout with
`du -sh --exclude=node_modules .`: 402 MB, made of the tracked tree (the
lane copy's own receipt measured 251,683,001 bytes = 240 MB of tracked
bytes), the run records under `.runtime/` (19 MB), the two run directories
the tool left under `tmp/` (49 MB and 53 MB) and the built engine dist.
`node_modules` is a junction to the machine's existing dependency tree, so
the lane adds no second copy of it. Removed: nothing. Nothing was deleted by
this lane, and the residue left on disk is named here rather than swept
quietly: the run directories, the dist tree, and the built bundle under
`deploy/dist/`.
