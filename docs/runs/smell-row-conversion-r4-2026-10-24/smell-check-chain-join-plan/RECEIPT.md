# smell-check-chain-join-plan

- The row's own label: `smell/probe script check-chain-join-plan.mjs`
- The instrument: `tools/perf/check-chain-join-plan.mjs`
- What this lane did: rebuilt the two inputs the instrument refuses (the capture and the
  deck), ran the instrument, and read the report it wrote.
- Commands:
  - `node tools/smell-row-r4/prepare-chain-join-deck.mjs C:/localProjects/brandonDojoTech/tmp/smell-dep-restore-20261020/deck-rebuild/deck-better-sqlite3.sqlite3 .runtime/r4-chain-join/deck.sqlite3`
    (exit 0; the copy carries the row count the instrument guards on)
  - `node tools/smell-row-r4/build-chain-join-capture.mjs .runtime/r4-chain-join/deck.sqlite3 C:/localProjects/brandonDojoTech/tmp/cold-first-keystroke-evidence/stmt-c3.sql .runtime/r4-chain-join/capture.sql`
    (exit 0; the capture carries the SQL and its parameter array)
  - `node tools/perf/check-chain-join-plan.mjs .runtime/r4-chain-join/deck.sqlite3 .runtime/r4-chain-join/capture.sql .runtime/r4-chain-join/report.json db/schema.sqlite.sql`
    (exit 1; the tool measured and then refused its own measurement, see below)
  - `node .runtime/r4-chain-join/compare-results.mjs .runtime/r4-chain-join/deck.sqlite3 .runtime/r4-chain-join/capture.sql`
    (this lane's own reading of the two forms' result sets)
  - `node tools/smell-row-r4/distill-chain-join-plan.mjs .runtime/r4-chain-join/report.json .runtime/r4-chain-join/deck-preparation.json .runtime/r4-chain-join/capture.sql .runtime/r4-chain-join/set-comparison.json fixtures/captured/smell-row-r4-2026-10-24/check-chain-join-plan.json`
    (exit 0; wrote the capture)
- Evidence in this directory's sibling fixtures:
  `fixtures/captured/smell-row-r4-2026-10-24/check-chain-join-plan.json`.

## Verdict: the tool's measurement is producible again, and the tool's own pass condition is not met

The row's blocker was that the instrument could not be fed: the surviving capture carries no
parameter array, and the deck it measures against is gone. This lane rebuilt both and the
instrument ran:

| | |
|---|---|
| cards in the deck copy | 21670 (the row count the instrument guards on) |
| bound keys in the capture | 90 (30 three-part tuples) |
| schema indexes applied on the owned copy | 16 (`db/schema.sqlite.sql`, digest 7859ccb1...) |
| captured form, no statistics | 181,484.6 ms, 30 cards |
| CROSS JOIN form, no statistics | 39.9 ms, 30 cards |
| the instrument's verdict | fail: `query row bytes changed` |

So the repair the tool measures is confirmed on a capture that returns cards: the captured
statement takes three minutes without planner statistics and the rewritten one takes forty
milliseconds.

## Why the instrument refused its own measurement

The instrument compares the two forms' answers byte for byte. This lane read both result
sets directly: they are the SAME 30 cards as a set, in a different order (`same set: true`,
`same order: false`, and the two responses have the same byte length with different
digests). The plain-join form lets SQLite choose the join order, the CROSS JOIN form fixes
it, and the aggregate that collects the cards keeps the order the plan produced.

The committed differential (`docs/junction-chain-join-evidence.json`, 2026-10-15) passed that
check because ITS capture returned zero cards, as its own doc records ("the compact result
contains zero cards"). A capture that returns cards cannot pass a byte comparison that
includes the row order.

## What was rebuilt, and what that means for the measurement

- **The deck.** The deck the committed evidence was produced against (digest
  `623f5fcbfdbdde6e38d6a5b179e33a23c04cd1f4ec35c85779f2ee5ee6c66afd`, 21670 rows) is not on
  this machine any more. The deck this lane measured on is the approved lineage's deck
  (`c19c4d561ebbd4bee3dab3667af52400a6fa32affc151fd17adf1c5007640dfc`, the one the round-two
  lane rebuilt), and it carries 21676 rows: 21670 distinct card ids plus six rows whose id
  is NULL, a local test account a local test added to a working deck. The instrument counts
  ROWS, so it refused that deck with `expected the approved 21670-card deck, found 21676`.
  This lane's copy drops those six rows, which no join on id can reach, and nothing else.
- **The capture.** The surviving capture's SQL text, with its CROSS JOINs turned back into the
  plain JOINs the instrument rewrites (its own rewrite, run backwards), plus a parameter
  array taken from the deck's own widenable junctions, so the statement selects real cards.
  Its digest is recorded in the capture and it is not the capture the committed evidence was
  produced from (that one's digest is `ad03277f...` and its parameter values are not on this
  machine).

So the measurement here is a NEW measurement on rebuilt inputs. It is not a reproduction of
the committed differential, and this receipt does not claim it is.

## Gap, in one mechanism sentence

The instrument's pass condition is a byte comparison of the two forms' answers, and the
CROSS JOIN rewrite legitimately changes the row order of a statement that returns cards, so
the instrument refuses every capture that returns rows even though both forms return the
same set.

## What would close it

A pass condition that compares the result SET rather than the result bytes, or a capture
that returns no cards, and then a measurement of the committed differential's own capture on
the deck it was produced against. Until then the row's own measurement is producible but its
verdict is a fail, and the roster owns that state.

Branch: `port/smell-test-round2-20261024` in KatsuJinCode/decko-ts.
