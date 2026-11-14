# mx-B-067: the owned local stack is closed

The roster row `mx-B-067-cleanup` (surface "cleanup") reads "owned local
stack closed", verdict PASS, bucket DONE. The registry's ledger entry for
the row (C:/localProjects/brandonDojoTech/docs/registry/instrument-coverage-matrix.json,
action ACT-067, check_ids ["B-067"]) records the live-acceptance-lane
entry pass (the live run of 2026-10-16T14:01:03Z, 87 checks on the live
build) and the whole-harness entry pass (the native whole-harness run at
source 50717cca, bundle 527687e5, 129 of 154 passed). This receipt is the
family's own adjudication of the row at this tip, where the whole
exercise's named check for it exists and is graded.

## What the row is

The exercise's own local stack is the process the lane starts to measure
the port: the deployed bundle served behind a local HTTPS host, the local
HRANA database server, and the mock storage server. The row says that
stack is CLOSED when the run ends, and the check grades the close itself,
not a promise about it: a close that throws is a FAIL carrying the error
text, never a pass. The close is also what makes the run's own cleanup
safe, because the cleanup reads the deck copy after the stack is gone.

## The instrument

"owned local stack closed" (tools/edge-signed-in-exercise.mjs:1490-1491,
the local-stack arm of the cleanup group): after the browser is closed
(:1489) the runner calls `await stack.close()` inside a try, a clean close
records the check PASS with an empty evidence object, and a throw records
FAIL with the error message (:1491). The host-override arm of the same
check is at :1484-1485, where the close is a no-op because nothing was
staged on a target the run does not own.

The close itself is the harness's own machinery and its shape is in the
source: tools/edge-signed-in-exercise/lib/stack.mjs:122-126 closes the
edge host, then the local HRANA server, then the mock storage, and
restores the global fetch and the mail environment, each step in a
`finally` so one failure still releases the rest. The edge host's own
graceful shutdown is tools/edge-signed-in-exercise/lib/edge-host.mjs:238-239
(`server.close(r)`), and the database server's is
tools/edge-signed-in-exercise/lib/local-hrana.mjs:213-215 (the listening
server closes, then the database handle). The run's own gate on a failed
close is at tools/edge-signed-in-exercise.mjs:1499: when the stack did not
close, the cleanup records the journey cards as NOT removed rather than
racing the stack's writes.

## The oracle

THE ROW'S ORACLE IS THE NAMED INSTRUMENT PLUS THE REGISTRY'S OWN PRIOR
MEASUREMENTS, and this receipt says so rather than dressing it as a byte
match. There is no Ruby counterpart for this row: the stack being closed
is the harness's own lifecycle, not a Decko behaviour, so no Ruby run can
produce this verdict. What the registry holds for the row is ACT-067's
two entries, the live-acceptance-lane entry (status pass, the live build
of 2026-10-16T14:01:03Z, 87 checks) and the whole-harness entry (status
pass, the native whole-harness run at source 50717cca, bundle 527687e5,
129 of 154 passed).

THE PORT'S OWN CONTRIBUTION TO THE ROW is that both things the close
releases have a graceful shutdown the close path reaches: the served
bundle's host closes its TLS listener (lib/edge-host.mjs:238-239) and the
local database server closes its listener and its handle
(lib/local-hrana.mjs:213-215). The port's engine is the bundle the host
runs, so the row measures that the process this lane started does not
outlive its run.

## What is oracle-matched and what is not, stated plainly

Oracle-matched: the close SUCCEEDED in the sense the check grades - the
owned host, the database server and the storage server were released and
the run proceeded to the cleanup verdict that reads the deck copy; and the
registry's own two entries for the row are the prior measurements of the
same check.

NOT oracle-matched, and stated rather than glossed over: this row has no
Ruby byte arm, because the stack is the harness's own process rather than
a Decko behaviour; the check grades the absence of an exception from
`stack.close()`, not the absence of a listening socket (the close's own
source is the evidence that the sockets are released); and the identity
of the harness's accounts and cards is fixture state, not a port constant.

## The measurement at this tip

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/signed-in-exercise-round13-20261026/rows-r1/report.md

    source acd0cd4cb24d3627981fa383619f5fea94731066, started
    2026-10-26T06:31:53.510Z, completed 2026-10-26T06:59:33.454Z,
    the source files clean
    bundle 3dc9c9baebe05b9aa04935592cbb636de90cfc712da367c8008176f544678748
    (the expected and the executed sha256), deck
    6aebb6546a0620f3c61efad28cd01023e104d47ffd583272ce18036038f73b78
    verdict: PASS

The named check in this run:

    owned local stack closed
        {}

An empty evidence object is what a clean close records
(edge-signed-in-exercise.mjs:1490); a thrown close would have carried the
error message (:1491). The run's own cleanup then verified the deck copy
after the stack was gone:

    every journey-created card is removed from the local copy
        {"removed":212,"remaining":0,"baseline":53052}

The run as a whole graded 251 of 253 checks passed. The two failures are
E10 "a plain-input card can be edited and saved (the new content shows on
the card)" (the write answered no status inside that attempt's window,
while the card's own page answered 200 and showed the new content) and
the page-time budget row "no signed-in page exceeded 3 s of server time"
(three pages over the 3000 ms budget, each carrying a contention charge
of 2745, 1582 and 912 ms of measured machine contention against 221, 1251
and 967 ms of the engine's own database CPU time). Neither failure is
this row, and the run's own numbers are the machine's throughput during
the run, not a change in the code: the executed bundle is byte-identical
to the one the round-twelve lane ran (the same sha256 above).

## What this receipt does NOT claim

- The row's port side is what the instrument grades, and it is green.
  This receipt does not claim anything about the live deployment: no
  live request was made by the lane, and nothing deploys.
- The row's DONE condition in the roster is not changed by this
  receipt; this receipt adds the family's own evidence for the row.
