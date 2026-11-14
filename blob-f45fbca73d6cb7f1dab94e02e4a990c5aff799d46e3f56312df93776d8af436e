# mx-B-064: no save exceeded 3 s of server time

The roster row `mx-B-064-9-timings` (surface "9. timings") reads "no
save exceeded 3 s of server time", verdict PASS, bucket DONE. The
registry's ledger entry for the row
(C:/localProjects/brandonDojoTech/docs/registry/instrument-coverage-matrix.json,
action ACT-064, check_ids ["B-064"]) records the live-acceptance-lane
entry FAIL and the whole-harness entry pass. The live FAIL is kept by
the registry as a true measurement of the deployed bundle at its run
(not an instrument artifact; the triage note points at the engine
save-path latency fix and at the later live re-record: the roster
row's own blocker field records the live timing re-record against live
release 1194026 measuring six signed-in /update saves, worst 475 ms,
the prior FAIL shape not reproduced). This receipt is the family's own
adjudication of the row at this tip on the whole-harness leg, which is
the leg this exercise runs; it makes no live claim.

## What the row is

Every save the signed-in exercise performs must answer within 3000 ms
of SERVER time. Pages and saves are graded separately
(lib/server-time-budget.mjs:19-21 of the module header: "a slow save
never hides behind a fast page, and a slow page never hides behind a
fast save"), so a save's cost is judged on its own.

## The instrument

"no save exceeded 3 s of server time"
(tools/edge-signed-in-exercise.mjs:1411-1412, wired in the
"9. timings" group at :1383): `saveBudgetViolations(ledger())`
(lib/server-time-budget.mjs:249-251) filters the run's request ledger
to NON-GET rows whose `ownWorkMs` exceeds `SERVER_TIME_BUDGET_MS`
(:102, 3000; ownWorkMs :222-227), and the check passes when that set
is empty. The graded quantity, the contention subtraction and the
unlabelled-row rule are the page budget's (receipt mx-B-063 names
them); the threshold and the check name are registry-bound (ACT-064)
and did not move.

## The oracle

As with the page budget, the oracle is the registry-bound rule plus
the run's own per-request ledger, not a Ruby byte arm. The
save-specific evidence the registry itself keeps: the
live-acceptance-lane FAIL entry (a true measurement of the
then-deployed bundle, kept FAIL with the triage pointer
docs/reports/matrix-fails-triage-1-2026-10-19.md) and the
whole-harness pass entry. WHAT IS ORACLE-MATCHED AND WHAT IS NOT: the
graded quantity is the engine's own Server-Timing total;dur with the
harness's measured contention subtracted
(bunny-edge-server-timing.ts:265-288 builds the header the budget
reads), the same quantity a live run grades; the 3000 ms threshold is
the registry's own. NOT oracle-matched: no Ruby run graded this port's
save times, and this receipt claims nothing about the live
deployment's current save times, whose true measured FAIL entry stands
in the registry until a live re-record replaces it.

## The measurement at this tip

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/signed-in-exercise-round12b-20261026/rows-r4/report.md

    source 3e4791cb61d9260e9f69b0df69e5e30222747630, started
    2026-10-26T03:43:16.527Z, completed 2026-10-26T04:08:30.378Z,
    the source files clean
    verdict: PASS

The named check in this run:

    no save exceeded 3 s of server time
        {"slow":[]}

The check is green in each of this lane's four runs at this tip
(rows-r1 through rows-r4; the round report carries the four-run
record), including the three runs where the machine's load pushed PAGE
renders over the budget: no save ever crossed 3000 ms of own work in
any of them. The run as a whole graded 251 of 253 checks passed; the
two failures are the owner-audit search-suggestion latency rows,
neither of them this row.

## What this receipt does NOT claim

- The graded number is rows-r4's own measurement under the registry's
  rule, on the whole-harness leg. The live-acceptance-lane entry's
  FAIL stands in the registry as its own true measurement; this
  receipt neither repairs it nor re-measures it.
- Nothing deploys and nothing touches live.
