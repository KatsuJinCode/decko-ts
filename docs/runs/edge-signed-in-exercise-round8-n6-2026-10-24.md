# Edge signed-in exercise, round eight: the N6 legs at this round's tip

The branch is `port/capability-round8-20261024`, created from
`port/capability-round6-20261024` at `71b9693d`. The run below ran at this
round's tip on its own checkout.

One run, on the LOCAL stack that the harness boots itself: the loopback
database and object storage, a local copy of the deck on the engine schema,
two throwaway local accounts (one holding the `administrator` role, one
signed in with no role), headless Chromium with a throwaway profile. Nothing
reached the live edge and nothing was written to the live D1: the run's
provenance carries `productionRuntime: false`. The source deck is the same
local snapshot the earlier rounds used, SHA-256
`6aebb6546a0620f3c61efad28cd01023e104d47ffd583272ce18036038f73b78`, and the
executed bundle is the deploy's own artifact, SHA-256
`f00a1ca66b91871e8f0445e3a76abb8806bf5c9d36876bf1ecc6900003e3afe7`.

The run reports its checks 0 failed; the process exits non-zero by design,
because the whole family's acceptance is incomplete while any row of the 95
is unrun or partial - that exit is the family's standing state, not a failure
of these legs.

## The N6 row (search for a nonexistent name offers a create link)

```
node tools/edge-signed-in-exercise.mjs --only navbox \
  --out .runtime/edge-signed-in/round8-n6/report.md
```

**11 / 11 checks passed**, 0 failed, 0 skipped. Three of the row's four named
checks are this row's:

| check | result | the evidence |
|---|---|---|
| the search page echoes the term it searched, escaped the way Ruby's results_for_keyword.haml escapes it | PASS | the echoed term matched Haml's escaped form, and the marker and rows graded apart |
| a search that matched nothing renders Ruby's search-no-results marker and no result rows | PASS | the empty-results marker rendered instead of the rows, never beside them |
| the navbox offers to create the missing name, as its own add item rather than a navbar word | PASS | the offer was the typeahead's own add item, not a word matched anywhere on the page |

The row's fourth named check, "search for a nonexistent name offers a create
link", is recorded by this round's whole-family exercise run; its committed
record is `docs/runs/edge-signed-in-exercise-round8-family-2026-10-24.json`
(the driver records that name in its create-routes group, which a targeted
`--only navbox` selection does not run).

The committed run record for the targeted legs is
`docs/runs/edge-signed-in-exercise-round8-n6-2026-10-24.json`, written by
`tools/edge-signed-in-exercise/commit-run-record.mjs` from the harness's own
record.

## The battery

The row's parity pins ran with `node --test` over the row's touched test
files at this tip: `tools/edge-signed-in-exercise/test/search-empty-answer.test.mjs`
pass, 0 fail (the round's six-row pin battery, 90 tests, is stated on each
row's own receipt and commit).
