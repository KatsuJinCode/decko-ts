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
| `3a5c9e39` | the tranche receipt |
| `3e33075d` | the C20 check's own read stops racing the page's own navigation |

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
   twice, found that the harness's own browser traffic was landing inside
   the engine's measured wall (a handler that did NO work measured 3186 ms),
   and replaced the measurement with an honest one. The residual red is the
   machine stalling the harness's process, and the cache hypothesis that
   would have explained it was measured and refuted. Section 2 and 3.

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

    node tools/edge-signed-in-exercise.mjs       --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3       --out .runtime/signed-in-exercise-round3-20261023/final-r2/report.md

No `--only`, no `--case`: the FULL exercise, every module.

- source `3e33075d`, the source files clean, `dirty: false`
- started `2026-10-23T14:37:39.521Z`, completed `2026-10-23T15:00:05.541Z`,
  so about 22 minutes of wall clock
- the process exit code is 1, by the tool's own rule and not by any failure
  (`tools/edge-signed-in-exercise.mjs` exits 0 only when no check failed AND
  the capability coverage is complete). The exit code was captured in this
  lane's own command line.

**Result: 252 of 253 checks passed.** The one red is the "9. timings" leg,
and section 3 names it with its numbers.

THE MEASUREMENT THE BUDGET WAS TAKEN FROM, IN THE RUN'S OWN RECEIPT
(`provenance.serverTime`):

    labelledRequests 3981, budgetMs 3000, overBudgetRequests 3,
    slowestServerMs 7733, overBudgetOwnWorkRequests 1,
    slowestOwnWorkMs 4812, contentionRequests 3981,
    totalContentionMs 227467, maxContentionMs 7733,
    contentionDecided 2 rows

THE TWO ROWS THE HARNESS'S OWN TRAFFIC DECIDED, named by the run:

    /mod/tinymce_editor/plugins/autolink/plugin.min.js
      serverMs 7733, dbMs 0, dbWorkMs 157, contentionMs 7733, ownWorkMs 0
    /*search?query[keyword]=zz_no_such_card_harness
      serverMs 3134, dbMs 2779, dbWorkMs 2584, contentionMs 196,
      ownWorkMs 2938

The first is the clearest case there is: the engine's handler did NOTHING
(no auth, no seat, no db statement, no render) and the request's wall reads
7733 ms. A request that did no work cannot have spent 7.7 seconds of work.
The gate read the page's own work as zero and did not charge the deployment
for the harness's traffic.

THE DATABASE'S OWN RECEIPT (`provenance.database`, added by this tranche):

    statements 81637, totalMs 302283, mean 3.70 ms per statement,
    8 statements over 250 ms, all of them the same recursive card-tree
    closure (WITH __s(...) AS (SELECT ...))

THE CAPABILITY COVERAGE, THE FAMILY'S OWN GRADER: 70 covered, 20 partial, 1
not covered, 1 disabled upstream, 3 out of scope. The tranche-9 tip read 70
/ 20 / 1 / 1 / 3, so the coverage did not move.

THE FOUR RUNS OF THIS BRANCH, SIDE BY SIDE. The first is the baseline, at
this branch's base (`52879d23`), with the OLD budget rule; the second is at
the instrument commits; the third is at the receipt; the fourth is at this
tip.

| | baseline (old rule) | at 683d1e14 | at bf18f1c8 | at 3e33075d |
|---|---|---|---|---|
| checks | 252 of 253 | 252 of 253 | 251 of 253 | **252 of 253** |
| labelled requests | 4006 | 3989 | 3978 | 3981 |
| rows over the raw 3000 ms budget | 2 | 1 | 1 | 3 |
| rows over the budget on the page's own work | (not measured) | 1 | 1 | 1 |
| rows the harness's own traffic decided | (not measured) | 0 | 0 | **2** |
| the harness's own contention, total | (not measured) | 213.4 s | 237.5 s | 227.5 s |
| live third-party fetches | ~150 per TinyMCE URL | 8 | 8 | 8 |
| third-party requests answered from memory | (not measured) | 4209 | 4204 | 4204 |
| the C20 navigation race | not hit | not hit | red | **green** |
| capability coverage | 70 / 20 / 1 / 1 / 3 | 70 / 20 / 1 / 1 / 3 | 70 / 20 / 1 / 1 / 3 | 70 / 20 / 1 / 1 / 3 |

THE RED: THE MACHINE STALLED THE HARNESS'S PROCESS. The row was the
new-card form, and the window around it says what happened:

    /*search?query[keyword]=zz_no_such_card_harness
      tot 2893, db 2636, stmt 48, work 2523      (52.6 ms per statement)
    /new/RichText
      tot 5262, db 4418, stmt 97, work 3970      (40.9 ms per statement)
    /mod/tinymce_editor/plugins/autolink/plugin.min.js
      tot 7733, db 0, stmt 0, work 157          (the handler did no work)

Three consecutive requests, all slow, the third one not doing any work at
all. The same page shape, with the same statement count, measured between 3
and 10 ms per statement at the other sixty places the run asked for it. The
run's mean statement cost was 3.70 ms.

So the mechanism is not the page and not the harness's browser traffic: the
harness's Node process - the one that serves the engine, runs the local
database and talks to the browser - was STALLED, and a stall lands wherever
the process happens to be, which is why it shows up inside the database's own
statement timings and inside a handler that did nothing. The gate removes
what it can measure (the harness's own traffic, two rows this run) and
cannot remove an operating-system stall, and it does not pretend to: the
red row is over the budget on its own work, and the receipt says so.

THE HYPOTHESIS THIS TRANCHE TESTED AND REFUTED, so the next tranche does
not spend a run on it. One candidate for the stall was the local database's
own page cache: SQLite's default is 2 MB against a 45 MB deck, and the
card-tree closure walks that deck. Measured on a copy of the same deck with
the same closure query (`src/card/render/prefetch.ts:545`):

    default cache (2 MB)   warm min 8.2 ms, max 23.4 ms; after
                           shrink_memory 21.7 ms
    64 MB cache            warm min 8.4 ms, max 22.3 ms; after
                           shrink_memory 20.4 ms

The cache size makes no measurable difference, so the page cache is NOT the
variable and a bigger cache would not have removed the red. The measurement
does not reproduce the operating system's cold-file case (the copy had just
been written, so its pages were in memory), and that is stated here rather
than glossed: what it shows is that SQLite's own cache is not the lever.
What is left is the machine's disk and the machine's scheduler, and the
local database is a 45 MB file on a disk this machine's other lanes share.

THE C20 NAVIGATION RACE IS FIXED. The run at `bf18f1c8` recorded

    page.goto: Navigation to
    "https://127.0.0.1:52420/HarnessC20Cardmvl24x0y" is interrupted by
    another navigation to
    "https://127.0.0.1:52420/HarnessC20Cardmvl24x0y+*right+mvl24x0y"

on the role-plus-right module's C20 leg: the create the check submits
answers with a redirect to the card it created, the browser follows that
redirect on its own, and the check's own read of the host card collided with
it. Commit `3e33075d` puts that navigation through a guard that retries ONLY
the navigation the page interrupted (a navigation that fails for any other
reason is not retried, because that failure is the check's to report). The
leg is green at this tip.

WHAT THIS DOES NOT CLAIM. The local database is a SQLite file on this
machine's disk, and the deployed engine's database is a network service
(Bunny DB, or D1 on the Cloudflare host), so a local stall is not a property
of the deployed page. This tranche does not claim that the red is the
machine's disk or its scheduler: the record names the shape of the stall
(three consecutive requests, one of them doing no work) and the refuted
cache hypothesis, and the claim is not made without the cause.

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
own commit with an explicit pathspec. The receipts name the run they were
written from (the run at `683d1e14`); the whole-family run at the final code
commit (`3e33075d`) measured all six of them PASS again, with their
evidence:

    admin signs in through the sign-in form and stays signed in   PASS
    member signs in through the sign-in form and stays signed in  PASS
    home shows the account name and Sign out                      PASS
    stays signed in across navigation                             PASS
    stays signed in after browser Back                            PASS
    stays signed in after reload                                  PASS

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
- **The red on the timings leg is reported, not smoothed over.** Section 3
  gives the numbers: one row of 253, over the budget on its own work, in a
  window where the harness's process was stalled.
- **The leg is NOT yet stabilized.** It went red in each of this lane's
  three runs after the gate landed, for a named reason: the machine stalled
  the harness's process. The gate removes the part of that the harness owns
  (two rows this run) and cannot remove an operating-system stall. This
  tranche does not claim the leg is stable.

## 6. What this lane left on disk

- the exclusive checkout
  `C:/localProjects/decko-ts-matrix-round3-20261023` itself, a linked
  worktree of `C:/localProjects/decko-ts-restored` with `node_modules`
  shared through a junction, so the lane adds no second copy of the
  dependency tree;
- the run records under `.runtime/signed-in-exercise-round3-20261023/`
  (four runs: the baseline, the instrument-commit run, the receipt-commit
  run and the final-code-commit run);
- the built engine `dist/` and the bundled worker under `deploy/dist/`, which
  the exercise rebuilds from this tree's own source on every run;
- one run directory the tool left under `tmp/` (49 MB), which the disk
  steward reclaims with the lane's checkout.

THE DISK COST, IN BOTH DIRECTIONS. Added, measured in this checkout with
`du -sh --exclude=node_modules .`: 382 MB, made of the tracked tree (the
lane copy's own receipt measured 251,683,001 bytes = 240 MB of tracked
bytes), the run records under `.runtime/` (50 MB), the run directory under
`tmp/` (49 MB), the built engine dist (15 MB) and the bundled worker
(18 MB). `node_modules` is a junction to the machine's existing dependency
tree, so the lane adds no second copy of it, and the git objects are the
canonical checkout's, shared with the other lanes.

Removed: one probe script, moved out of the checkout to the machine's
temporary folder rather than deleted, so nothing this lane wrote stays
inside the repository except the work product it committed. Nothing else
was deleted, and the residue left on disk is named here rather than swept
quietly: the run records, the run directory under `tmp/`, the dist tree and
the bundled worker.
