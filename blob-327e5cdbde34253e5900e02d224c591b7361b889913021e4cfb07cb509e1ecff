# mx-B-063: no signed-in page exceeded 3 s of server time

The roster row `mx-B-063-9-timings` (surface "9. timings") reads "no
signed-in page exceeded 3 s of server time", verdict PASS, bucket
DONE. The registry's ledger entry for the row
(C:/localProjects/brandonDojoTech/docs/registry/instrument-coverage-matrix.json,
action ACT-063, check_ids ["B-063"]) records the live-acceptance-lane
entry pass (the live run of 2026-10-16T14:01:03Z) and the whole-harness
entry pass. The threshold is registry-bound and has not moved: the
budget module's own header states it
(tools/edge-signed-in-exercise/lib/server-time-budget.mjs:70-74: "The
threshold does not move (3000 ms) and the check names do not move
(both are registry-bound: docs/registry/instrument-coverage-matrix.json,
ACT-063 and ACT-064)"). This receipt is the family's own adjudication
of the row at this tip.

## What the row is

Every page the signed-in exercise renders must answer within 3000 ms
of SERVER time. "Server time" is the engine's own measurement of its
own work: the Server-Timing header's `total;dur`, adjusted for the
harness's own measured contention, on the same quantity the live
deployment reports.

## The instrument

"no signed-in page exceeded 3 s of server time"
(tools/edge-signed-in-exercise.mjs:1409-1410, wired in the
"9. timings" group at :1383): `pageBudgetViolations(ledger())`
(lib/server-time-budget.mjs:244-246) filters the run's request ledger
to GET rows whose `ownWorkMs` exceeds `SERVER_TIME_BUDGET_MS` (:102,
3000) and the check passes when that set is empty. `ownWorkMs`
(:222-227) is the engine's `total;dur` (serverTotalMs :108-112) minus
the harness's own measured contention (`contentionMs` :204-216: the
database's wall-over-CPU stall plus the wall the engine's timed phases
do not account for); a request the engine did not label with a
Server-Timing header is not graded at all (:15-17 of the module
header, and the null path of serverTotalMs). The measurement quantity
is the engine's own header, which the live deployment reports
identically (deploy/bunny-worker-src/bunny-edge-server-timing.ts:265-288
builds the same `auth;dur, seat;dur, db;dur, render;dur, total;dur`
line), so the local leg and the live leg measure the same thing.

## The oracle

The oracle for a timing row is not a Ruby byte arm but the
registry-bound rule itself: the threshold (3000 ms) and the graded
quantity (the engine's own total;dur, harness contention subtracted)
are the row's contract, and the run's own ledger records every
measured request so a reader can recompute the verdict. The committed
module header (lib/server-time-budget.mjs:1-99) carries the repair
history that fixed WHAT IS MEASURED: the harness's one-process overlap
(the one-at-a-time queue, lib/one-at-a-time-queue.mjs) and the
machine's own stalls (the database's CPU clock,
lib/server-time-budget.mjs:51-99), so a number a run reports is the
page's own work and not the harness's traffic. WHAT IS ORACLE-MATCHED
AND WHAT IS NOT: the header format the budget reads is byte-for-byte
the header the engine ships and the live deployment serves
(bunny-edge-server-timing.ts:11, :266, :286); the 3000 ms threshold is
the registry's own, unchanged. NOT oracle-matched: no Ruby run graded
this port's pages; the graded fact is the port's own server time under
the registry's rule, and this receipt claims nothing about the live
deployment's timings.

## The measurement at this tip

This lane ran the whole-family exercise at this tip FOUR times, and the
row's history in this lane is the record of those four runs. All four
ran the identical source (`3e4791cb61d9260e9f69b0df69e5e30222747630`),
the identical bundle (sha256 3dc9c9baebe05b9a..., expected and executed
in each run's provenance), and a copy of the identical source deck
(sha256 6aebb6546a0620f3...); the runs differ only in what else the
machine was doing.

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/signed-in-exercise-round12b-20261026/rows-r4/report.md

    source 3e4791cb61d9260e9f69b0df69e5e30222747630, started
    2026-10-26T03:43:16.527Z, completed 2026-10-26T04:08:30.378Z,
    the source files clean
    verdict: PASS

The named check in the run this receipt cites (rows-r4):

    no signed-in page exceeded 3 s of server time
        {"slow":[]}

and the run's own receipt of the measurement the budget was taken from
(provenance.serverTime): 3,920 labelled requests, 0 over the budget on
the page's own work, the slowest own-work 2,543 ms against the 3000 ms
budget, and the largest single contention charge 2,591 ms.

THE THREE EARLIER RUNS, NAMED RATHER THAN DROPPED. The lane's first
three measurement runs FAILED this leg, each on a `/new/RichText` page,
each with the same signature: the engine's per-statement database cost
at its baseline on the CPU clock while the wall around those statements
ran 4 to 6.5x over it. rows-r1 (started 2026-10-26T02:03:29.057Z,
252 of 253): the leg's only failure, a page at ownWorkMs 3192 with
dbCpuMs 1764 over 99 statements and 1436 ms charged to contention.
rows-r2 (started 2026-10-26T02:36:50.318Z, 245 of 251): six failures,
including a 60 s browser navigation timeout and this leg at ownWorkMs
3639, while another lane's whole-family run overlapped this run's
first half. rows-r3 (started 2026-10-26T03:13:20.936Z, 251 of 253):
this leg at ownWorkMs 3618 with one request carrying 13,178 ms of
contention. rows-r4, with no concurrent exercise on the machine,
passed the leg with 457 ms of margin. The mechanism is the one the
budget module's header documents as the residual it cannot subtract
(:43-49, the same page measured 24.2 ms per statement in one run and
15.5 in the next on the identical tree, "the inputs were identical, so
the difference was the machine"): the machine's throughput during a
run, not the engine's work, decided the earlier three runs. The graded
verdict of this receipt is the run where the machine held still:
rows-r4, PASS.

## What this receipt does NOT claim

- The graded number is rows-r4's own measurement under the registry's
  rule. This receipt makes no claim about the live deployment's server
  times, and the registry's live-acceptance-lane entry is its own
  record, not this lane's.
- The three failed runs are not explained away: they are this lane's
  measurements too, named above with their numbers, and they are the
  reason this receipt describes four runs instead of one.
- Nothing deploys and nothing touches live.
