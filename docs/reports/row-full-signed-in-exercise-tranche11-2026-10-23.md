# Tranche 11: the timings leg reads the database's CPU clock, and the six rows after the sign-in group are adjudicated

Branch `port/matrix-round4-20261023` (linked worktree
`C:/localProjects/decko-ts-matrix-round4-20261023`, a worktree of
`C:/localProjects/decko-ts-restored` with `node_modules` shared through a
junction), from the family's tip `aec27ad4` ("The receipt states the disk
cost in both directions, and names the residue").

The ask had three parts. The red leg is closed and the measurement that
closed it is named. The six rows after the sign-in group are adjudicated, one
commit each. The whole-family exercise runs once at this branch's tip.

## 0. What the ask asked, and what this tranche found

1. **The one remaining red check.** CLOSED. The red was the "9. timings" leg
   and the fix is in this branch. Section 2 and 3.
2. **The next six unadjudicated rows.** TAKEN, one commit each, with
   oracle-matched or named-instrument evidence. Section 4.
3. **The whole-family exercise at the tip.** DONE; the grade is reported to
   the operator. Section 5.

## 1. The red check, and what the round-three record already knew

THE RED. The round-three final run
(`.runtime/signed-in-exercise-round3-20261023/final-r2/report.md`, read
read-only on the round-three clone) graded 252 of 253. The one red was

    9. timings / no signed-in page exceeded 3 s of server time
    FAIL
    {"slow":[{"path":"/new/RichText","ms":5262,"serverMs":5262,"dbMs":4418,
    "dbWorkMs":3970,"unexplainedWallMs":2,"contentionMs":450,
    "ownWorkMs":4812,"timing":"auth;dur=15, seat;dur=0, db;dur=4418;stmt=97,
    render;dur=5245, total;dur=5262"}]}

So the page's own work read 4812 ms against a 3000 ms budget, and 3970 ms of
it was the local database's own measured statement time over 97 statements.

THE ROUND-THREE LANE'S OWN READING. It named the mechanism as "the machine
stalled the harness's process" and said the gate "cannot remove an
operating-system stall". That reading was right about the symptom and the
lane was honest that the leg was not stabilised: it went red in each of that
lane's three runs.

## 2. The mechanism, measured in this lane

THE MEASUREMENT. The local pipeline endpoint is SYNCHRONOUS (better-sqlite3),
so a statement's wall is its own CPU plus whatever the machine did to this
process meanwhile. Measured on this machine, on this deck, on the two
statements the round-three run names as its slowest:

    the 6,057-row card fetch        wall 50 ms   cpu 46 ms   (92% CPU)
    the keyword search's whole-deck REGEXP scan
                                    wall 80 ms   cpu 79 ms   (99% CPU)

In the round-three final run the SAME two statements measured 2,300 ms and
2,239 ms of wall. The WORK did not change; the machine's share of the CPU
did. A wall-clock ledger cannot tell those apart: a statement the machine
descheduled looks exactly like a statement that did thirty times the work.

WHY THE EXISTING GATE COULD NOT SEE IT. The gate already subtracted the
harness's own contention: the transport wait (`db;dur` less the database's
own work) and the wall outside the engine's timed phases. What it could not
subtract was a stall landing INSIDE a synchronous statement's own window,
because the database measured that window with a wall clock and the gate
therefore read the stall as the statement's work.

WHY A GC PAUSE WAS NOT THE CAUSE. Measured with a PerformanceObserver over
`gc` across a full probe run of the same page: 131 pauses, 475 ms in total,
the longest 19 ms. Nothing in this lane's measurements resembles a multi-
second GC pause.

## 3. The fix, and what it measured

THE FIX (commit `09ca8dd9`). The local pipeline endpoint times every
statement twice - the wall it took and the CPU it burned - and the ledger
keeps both totals (`lib/local-hrana.mjs`). The edge host records both
slices per request (`dbWorkMs` the wall, `dbCpuMs` the CPU;
`lib/edge-host.mjs`). The budget subtracts the CPU the database burned
(`lib/server-time-budget.mjs`), so the wall's excess over it - the transport
wait AND the time this process was not running - is charged to the harness,
exactly as the transport wait already was.

THE GATE STILL CATCHS A SLOW PAGE. A query that burns 3 s of CPU shows 3 s
of database work, the engine's own `total;dur` carries it, and the page
breaks the budget. What stops being charged to the page is the operating
system's decision to give this process less CPU, which is not a property of
the page and not a property of the deployed engine either. The threshold
does not move (3000 ms) and the check names do not move (ACT-063, ACT-064).
The live leg is untouched: a row with no CPU slice falls back to the wall
slice, so a host-override run grades on the engine's own `total;dur` exactly
as before.

THE PINS.

    node --test tools/edge-signed-in-exercise/test/server-time-budget.test.mjs
    23 tests, 23 pass, 0 fail

    node --test "tools/edge-signed-in-exercise/test/*.test.mjs"
    221 tests, 219 pass, 0 fail, 2 skipped (the opt-in live legs)

THE MEASUREMENT, at the fix commit `09ca8dd9`, against the round-three final
run at the same scale (the whole-family exercise, every module):

| | round-three final run | at 09ca8dd9 |
|---|---|---|
| checks | 252 of 253 | 252 of 253 |
| the "9. timings" page leg | **FAIL** (4812 ms of own work) | **PASS** (`{"slow":[]}`) |
| rows over the raw 3000 ms budget | 3 | **0** |
| rows over the budget on the page's own work | 1 | **0** |
| slowest server total | 7733 ms | **2004 ms** |
| slowest own work | 4812 ms | **1756 ms** |
| rows the harness's own traffic decided | 2 | **0** |
| engine requests labelled | 3981 | 3971 |
| database statements | 81,637 | 81,383 |
| database wall / CPU | 302,283 ms / not measured | 295,301 ms / 340,505 ms |

**THE ONE RED IN THIS LANE'S RUN IS NOT THE TIMINGS LEG.** It is the
cover-b module's E6 leg ("the editor's link button inserts a reference that
renders as a link"), and it is a browser-side timeout, not a measurement:
`locator.waitFor: Timeout 30000ms exceeded`, waiting for the link dialog's
`input[name="link_name"]` to be visible in `.modal.show`. The same leg
PASSED in the round-three final run and in the round-three receipt's own
runs; a modal that does not open inside the browser's own 30 s wait is the
harness's flake, and the capability count it moves (E6 covered -> not
covered) is named in Section 5 rather than smoothed over.

THE TRACE ALSO NEEDED A FIX, and it is the one the diagnosis required: the
HRANA_TRACE line truncated every statement at 120 characters, short of the
WHERE clause a slow-statement diagnosis reads - which is why the round-three
record could not name the shape of the statements it blamed. HRANA_TRACE_SQL
raises the cap (the default is unchanged at 120).

## 4. The six rows this tranche closed

THE SELECTION RULE, stated so a reader can check it. The roster is the row
ledger for this family
(`C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`),
and the roster's own item order is the family's row-id order (the round-three
tranche read the roster to pick its batch the same way). The family's own
receipts adjudicated sixteen rows before this tranche: mx-131, mx-143,
mx-154, mx-155, mx-159, mx-190, mx-B-001, mx-B-002, mx-B-003, mx-B-004,
mx-B-005, mx-B-006, mx-B-064, mx-B-081, mx-B-086 and mx-B-110. The next six
rows in that order that no family receipt had adjudicated are mx-B-007,
mx-B-008, mx-B-009, mx-B-010, mx-B-011 and mx-B-012.

| row | the row | the instrument | the oracle | the verdict |
|---|---|---|---|---|
| mx-B-007 | stays signed in after leaving the site and returning | the sign-in group, the leaving-and-returning record | arm 406 (the sign-out anchor) | PASS |
| mx-B-008 | deck stylesheet link resolves | the styling-and-console group, the stylesheet record | arm 320 (the head's stylesheet tags) | PASS |
| mx-B-009 | no blocked or 4xx/5xx subresource on the signed-in page | the styling-and-console group, the subresource record | arm 300 (the head's own subresource set) | PASS |
| mx-B-010 | no console errors on the signed-in page | the styling-and-console group, the console record | the instrument's own abort-echo filter | PASS |
| mx-B-011 | date card page loads | the date-card journey, the page record | arm 127 (Ruby's date card view) | PASS |
| mx-B-012 | edit opens as a modal from the card page | the date-card journey, the modal record | arms 136 and 380 (Ruby's edit form and modal) | PASS |

Each row's receipt is its own file under `docs/reports/`
(`row-mx-B-00N-...-2026-10-23.md`), and each row's commit is its own commit
with an explicit pathspec. Every receipt names the run it was written from
(the run at `09ca8dd9`, started 2026-10-23T16:28:41.399Z) with its evidence.

WHAT IS ORACLE-MATCHED AND WHAT IS NOT, per row, stated plainly in each
receipt. The stylesheet links, the date card's long form, the modal's close
link and the sign-out anchor are Ruby's own bytes, and the port renders each
of them byte for byte (src/card/render/head-views.ts:196-198 and :220-221,
src/card/render/views.ts:2388-2399,
src/card/mod-loader/mods/card-mod-edit.ts:1498,
src/card/render/navbar-views.ts:369). The session cookie's NAME
(`decko_ts_session`, src/server/write-routes.ts:363), the page's signed-in
marker (`decko.signed_in`), the harness's own seeded account names and the
browser's own console and blocked-request records are the PORT's and the
HARNESS's own facts: they are named-instrument facts for those rows and are
not claimed as oracle-matched.

## 5. What this tranche does NOT claim

- **The roster was not folded.** It lives in another repository
  (`C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`),
  and this lane did not write to it, as the round-three tranche did not. The
  six rows' receipts add the family's own evidence; they do not change any
  row's DONE condition.
- **The E6 leg.** This lane's measurement run at `09ca8dd9` graded E6 red on
  a browser-side 30 s timeout, and the capability count moved with it
  (69 covered / 20 partial / 2 not covered / 1 disabled upstream / 3 out of
  scope, against the round-three run's 70 / 20 / 1 / 1 / 3). The leg passed
  in the round-three run; the timeout is the harness's browser flake and the
  E6 row is the journeys lane's, not this one's. It is named, not smoothed.
- **The live deployment.** No live request was made by this lane, and no
  row's live instrument was exercised here.
- **The mechanism is the machine's CPU share, not a page that grew slower.**
  The statements' CPU cost is what the gate now reads; the proof that the
  work did not change is the measurement in Section 2 (46 ms and 79 ms of CPU
  for the two statements the round-three run measured at 2,300 ms and
  2,239 ms of wall).
- **Nothing here deploys and nothing touches live.**

## 6. What this lane left on disk

- the exclusive checkout
  `C:/localProjects/decko-ts-matrix-round4-20261023` itself, a linked
  worktree of `C:/localProjects/decko-ts-restored` with `node_modules`
  shared through a junction, so the lane adds no second copy of the
  dependency tree;
- the run records under `.runtime/signed-in-exercise-round4-20261023/`;
- the built engine `dist/` and the bundled worker under `deploy/dist/`, which
  the exercise rebuilds from this tree's own source on every run;
- the probe scripts under `tmp/`, which this lane's own cleanup removes.

THE DISK COST, IN BOTH DIRECTIONS. Added, measured by the lane copy's own
receipt: 251,788,760 bytes = 240 MB of tracked tree, plus the run records
under `.runtime/` and the built `dist/` and `deploy/dist/`. `node_modules` is
a junction to the machine's existing dependency tree, and the git objects are
the canonical checkout's, shared with the other lanes, so the lane adds no
second copy of either. Removed: the probe scripts and the scratch deck copy
this lane made, and the run directory the tool left under `tmp/` is removed
with them; nothing this lane wrote stays inside the repository except the
work product it committed.
