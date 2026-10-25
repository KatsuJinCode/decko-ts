# smell-check-chain-join-plan

- The row's own label: `smell/probe script check-chain-join-plan.mjs`
- The instrument: `tools/perf/check-chain-join-plan.mjs`
- Roster verdict at the time of this lane: NOT-RUNNABLE, bucket WORKING ON IT,
  blocker WORKING ON IT (re-measured 2026-10-23, round two).
- This lane's disposition: CLOSED. The round-four receipt named the close: a
  pass condition that compares the result SET rather than the result bytes.
  This lane landed that pass condition, ran the instrument to completion on
  the round-four inputs, and pinned the completed measurement.

## What this lane changed, and why it is the named close

The instrument's pass condition was `JSON.stringify(rows)` byte equality
between the captured form and the CROSS JOIN rewrite, throwing "query row
bytes changed" on any difference. The round-four receipt measured why that can
never hold on a capture that returns cards: the statement is a SELECT DISTINCT
junction-chain query with no ORDER BY, so the row order is the query plan's
own choice and fixing the join order legitimately permutes it; both forms
returned the same 30 cards in a different order (same byte length, different
bytes). The committed differential of 2026-10-15 had passed the byte check
only because its capture returned zero cards.

The landed pass condition (`tools/perf/check-chain-join-plan.mjs`) compares
the answer SET: the multiset of per-card digests, taken from the answer's
`__decko_compact` payload, sorted. The payload level is the one that carries
the answer: this statement returns ONE aggregate row whose compact payload
embeds the cards in the plan's own order, so a row-level digest would refuse
for the same reason the byte check did. This lane's first draft did exactly
that and refused; the landed condition digests the parsed payload's cards.
The raw-byte digest and the byte comparison stay in the report, so an order
change stays visible in it; only the SET difference is fatal ("query row sets
differ").

## The run, this lane, this tree

Inputs rebuilt with the round-four builders from the same sources that round
used (both present on this machine, paths unchanged since that receipt):

- `node tools/smell-row-r4/prepare-chain-join-deck.mjs
  C:/localProjects/brandonDojoTech/tmp/smell-dep-restore-20261020/deck-rebuild/deck-better-sqlite3.sqlite3
  .runtime/workbatch-g-chain-join/deck.sqlite3`
  (exit 0; 21676 rows, 21670 distinct ids, 6 null-id rows dropped, copy sha256
  `f67f6edf7564...`)
- `node tools/smell-row-r4/build-chain-join-capture.mjs
  .runtime/workbatch-g-chain-join/deck.sqlite3
  C:/localProjects/brandonDojoTech/tmp/cold-first-keystroke-evidence/stmt-c3.sql
  .runtime/workbatch-g-chain-join/capture.sql`
  (exit 0; 30 tuples, 90 bound keys, from the deck's own widenable junctions)
- `node tools/perf/check-chain-join-plan.mjs
  .runtime/workbatch-g-chain-join/deck.sqlite3
  .runtime/workbatch-g-chain-join/capture.sql
  .runtime/workbatch-g-chain-join/report.json db/schema.sqlite.sql`
  (exit 0; `complete: true`)

The report, at sqlite 3.53.4 with the serving schema's 16 cards indexes on the
owned copy and statistics dropped, then one ANALYZE leg:

| planner state | form | time | cards | set equal | bytes equal |
|---|---|---|---|---|---|
| no statistics | captured | 234,689.5 ms | 30 | yes | (reference) |
| no statistics | CROSS JOIN | 51.7 ms | 30 | yes | no |
| analyzed | captured | 44.7 ms | 30 | yes | no |
| analyzed | CROSS JOIN | 42.9 ms | 30 | yes | no |

One card-set digest across all four measurements. The repair the tool exists
to measure is confirmed: the captured form takes about 234 seconds without
planner statistics and the rewritten form takes 52 milliseconds, the same
answer set in both. Planner statistics alone also avoid the pathological plan
(44.7 ms captured, analyzed). And the byte columns carry one more fact the
r4 refusal implied but had not measured: the captured form's own analyzed run
has different bytes than its own no-statistics run, so byte identity fails
against the same SQL across planner states and was never a stable pass
condition for an answer that returns cards.

This run is a measurement of the round-four rebuilt capture, not a
reproduction of the committed 2026-10-15 differential: that differential's
own capture and its parameter values are not on this machine, a fact the
round-four receipt records and this lane does not change.

## What holds the close

- The capture: `fixtures/captured/working-rows-g-2026-10-25/check-chain-join-plan.json`,
  distilled by `tools/working-rows-g-2026-10-25/distill-chain-join-plan.mjs`
  from the tool's own report, the deck preparation and the capture file.
- The reader: `tests/server/working-rows-g-2026-10-25-captures.ts`, this
  batch's own module, named for this batch's capture directory.
- The pin: `tests/server/smell-check-chain-join-plan-parity.test.ts`, which
  holds both halves: the r4 refusal (read through the r4 round's own reader,
  which this lane never edits) and the completed run.

Checks run at this tree, this session:

- `npx vitest run tests/server/smell-check-chain-join-plan-parity.test.ts`:
  10 tests passed.
- `npx tsc --noEmit`: no errors.

Branch: `port/workbatch-g-20261025` in KatsuJinCode/decko-ts, base
`deploy/full-candidate-20261101` tip `c17906db`.
