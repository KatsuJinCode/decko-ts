# Deep-nesting scaling comparison: Ruby Decko vs decko-ts (issue #1282)

Generated 2026-10-03T12:39:36.950Z by `benchmarks/build-deep-nesting-r1-comparison.mjs` from four committed artifacts. Raw timings live in those artifacts; this document is regenerable and never hand-edited.

## What was measured

Both engines render identically-named synthetic fixture decks (`BenchDN*` prefix):

- **chains** - a card nesting the next card, 1 to 200 levels deep (`{{next|open}}`);
- **fans** - one root nesting 1 to 200 children;
- **whole trees** - depth x breadth inclusion trees (d4xf4 = 342 cards; d3xf10 = 1112 cards).

Cold render = fresh engine state (Ruby: `Card.cache.reset`; TS: fresh engine instance). Warm = immediate re-render in the same process/instance. Fixture names, nesting syntax, and shape list are shared; body filler text differs (Ruby random a-z, TS deterministic) - the query axes are unaffected.

## The scaling result

1. **Ruby query cost grows linearly with every axis** (the N+1 the #1282 proposal replaces): chains pay depth+3 queries (measured 4 at depth 1 -> 23 at depth 20), fans pay fanout+4 (5 at f1 -> 204 at f200), and a whole tree costs ~1 query per included CARD (1114 queries for the 1112-card d3xf10 tree) - every included card is a render-time lookup.
2. **The TS engine's cost tracks the inclusion TREE SHAPE, not the deck**: chains pay one batched round trip per level (2 round trips at depth 1 -> 21 at depth 20), fans stay CONSTANT at 3 round trips from f1 to f200 (202 live cards), and the 1112-card tree renders in 5 round trips. Warm renders cost 0 queries at every renderable shape (see the warm table's past-cap exception).
3. **Past the render cap both engines refuse identically and boundedly**: Ruby raises `Card::Error::UserError: Man, you're too deep` beyond `Card.config.max_depth = 20` (24 queries to the error in the 2026-09-19 recording's depth-32 rows; the live rerun records 24 at depths 50/100/200); the TS port raises the parity guard (`nest depth exceeded`, `format.ts:859`) and the measured rejection cost is exactly 43 round trips at depth 50, 100, AND 200 (1 root fetch + 1 prelude batch + the prefetch's 25 capped closure rounds + 2 x 8 structure-pass rounds), also depth-independent. Rejection rows in the table are TIME-TO-ERROR for both engines.

## Response-time comparison (cold render, medians)

| shape | cards | Ruby queries | Ruby wall ms | TS round trips | TS statements | TS wall ms | TS cpu ms | response |
|---|---|---|---|---|---|---|---|---|
| chain/open/d1 | 2 | 4 | 28.48 | 2 | 9 | 7.774 | 0 | 3011B HTML |
| chain/open/d2 | 3 | 5 | 43.759 | 3 | 10 | 2.649 | 0 | 5993B HTML |
| chain/open/d4 | 5 | 7 | 70.713 | 5 | 12 | 2.172 | 0 | 11957B HTML |
| chain/open/d8 | 9 | 11 | 131.893 | 9 | 16 | 2.396 | 0 | 23885B HTML |
| chain/open/d10 | 11 | 13 | 154.304 | 11 | 18 | 2.601 | 0 | 29849B HTML |
| chain/open/d16 | 17 | 19 | 237.744 | 17 | 24 | 5.042 | 46 | 47747B HTML |
| chain/open/d20 | 21 | 23 | 334.668 | 21 | 28 | 4.254 | 0 | 59679B HTML |
| chain/open/d50 | 51 | 24 | 282.983 | 43 | 50 | 3.545 | 0 | rejected: Error: nest depth exceeded (BenchDN_chain_open_d50_n22) |
| chain/open/d100 | 101 | 24 | 229.187 | 43 | 50 | 4.904 | 0 | rejected: Error: nest depth exceeded (BenchDN_chain_open_d100_n22) |
| chain/open/d200 | 201 | 24 | 317.892 | 43 | 50 | 2.765 | 0 | rejected: Error: nest depth exceeded (BenchDN_chain_open_d200_n22) |
| fan/open/f1 | 3 | 5 | 30.021 | 3 | 10 | 1.236 | 0 | 5746B HTML |
| fan/open/f4 | 6 | 8 | 74.729 | 3 | 10 | 1.591 | 0 | 14890B HTML |
| fan/open/f16 | 18 | 20 | 257.962 | 3 | 10 | 2.439 | 0 | 51466B HTML |
| fan/open/f50 | 52 | 54 | 771.06 | 3 | 10 | 5.381 | 0 | 155098B HTML |
| fan/open/f100 | 102 | 104 | 1085.097 | 3 | 10 | 10.505 | 0 | 309415B HTML |
| fan/open/f200 | 202 | 204 | 2586.561 | 3 | 10 | 17.617 | 32 | 618015B HTML |
| tree/open/d3xf10 | 1112 | 1114 | 15574.443 | 5 | 12 | 90.463 | 126 | 3595955B HTML |
| tree/open/d4xf4 | 342 | 344 | 4288.802 | 6 | 13 | 30.47 | 46 | 1092781B HTML |

## Warm steady state (medians)

| shape | Ruby warm queries | Ruby warm wall ms | TS warm round trips | TS warm wall ms |
|---|---|---|---|---|
| chain/open/d1 | 0 | 5.801 | 0 | 0.433 |
| chain/open/d2 | 0 | 17.47 | 0 | 0.543 |
| chain/open/d4 | 0 | 28.104 | 0 | 0.574 |
| chain/open/d8 | 0 | 73.469 | 0 | 0.89 |
| chain/open/d10 | 0 | 77.365 | 0 | 1.074 |
| chain/open/d16 | 0 | 141.574 | 0 | 1.958 |
| chain/open/d20 | 0 | 197.673 | 0 | 2.531 |
| chain/open/d50 | n/a (cap) | n/a (cap) | 34 | 1.99 |
| chain/open/d100 | n/a (cap) | n/a (cap) | 42 | 2.295 |
| chain/open/d200 | n/a (cap) | n/a (cap) | 42 | 2.748 |
| fan/open/f1 | 0 | 16.759 | 0 | 0.377 |
| fan/open/f4 | 0 | 45.546 | 0 | 0.371 |
| fan/open/f16 | 0 | 158.432 | 0 | 1.166 |
| fan/open/f50 | 0 | 402.284 | 0 | 4.815 |
| fan/open/f100 | 0 | 700.773 | 0 | 8.083 |
| fan/open/f200 | 0 | 1268.71 | 0 | 14.263 |
| tree/open/d3xf10 | 0 | 6622.017 | 0 | 71.34 |
| tree/open/d4xf4 | 0 | 2939.276 | 0 | 25.263 |


Every RENDERABLE shape's second render is served from each engine's caches: 15 of 15 renderable rows measured at Ruby 0 queries / TS 0 round trips. The past-cap chains are the exception on the TS side: the closure never completed, so the warm render re-pays a bounded chase (34/42/42 round trips recorded). Ruby's cache serves its second render at every renderable shape.

## Environment (the no-cross-environment-claims rule)

**Ruby (live rerun):** Jace2, Intel(R) Core(TM) i7-14700F, Ruby 3.3.12, decko 0.20.0 / card 1.110.0, Rails 7.2.4, sqlite3 on disk at db/development.sqlite3 (5271552 bytes), 604 live cards after cleanup.

**TypeScript:** Jace2, Intel(R) Core(TM) i7-14700F, node v24.19.0, better-sqlite3 :memory: over the production-schema DDL, engine 7c5cd26 (lane-deep-nesting-fixtures-2026-10-03).

Both runs on the same host. Ruby renders against an on-disk sqlite file through ActiveRecord; TS against an in-memory sqlite through the engine's own driver. Wall-clock carries that difference; query counts do not. Ruby counts one ActiveRecord event per query (no batch exists); TS counts one round trip per driver call where a batch carries a whole inclusion level - that batching IS the scaling fix, and TS statement counts ride next to its round trips.

## Reproducibility cross-checks

- Live Ruby open-chain cold query counts vs the 2026-09-19 oracle recording: d1: 4 vs 4; d2: 5 vs 5; d4: 7 vs 7; d8: 11 vs 11; d16: 19 vs 19.
- Content-view chains (depth-sweep-ts.json vs the recording's content rows, Ruby = depth+2): d1: Ruby 4q / TS 2RT; d2: Ruby 5q / TS 3RT; d4: Ruby 7q / TS 5RT; d8: Ruby 11q / TS 9RT; d16: Ruby 19q / TS 17RT.

## Raw timings

Every individual render (not just medians) is in the committed artifacts: `benchmarks/results/deep-nesting-fixtures-ruby.json` (Ruby, cold_renders/renders arrays), `benchmarks/results/deep-nesting-fixtures-ts.json` (TS rows), joined in `benchmarks/results/r1-comparison.json`. Methodology: `benchmarks/METHODOLOGY.md`.

