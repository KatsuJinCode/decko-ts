# Edge signed-in exercise, round eight: the N9 leg at this round's tip

The branch is `port/capability-round8-20261024`, created from
`port/capability-round6-20261024` at `71b9693d`. The run below ran at this
round's tip on its own checkout, with a clean source tree.

One run, on the LOCAL stack that the harness boots itself: the loopback
database and object storage, a local copy of the deck on the engine schema,
two throwaway local accounts (one holding the `administrator` role, one
signed in with no role), headless Chromium with a throwaway profile, and the
harness's own in-process mail capture (the content-flows module requires
mail; the capture is local, and no message left the machine). Nothing
reached the live edge and nothing was written to the live D1: the run's
provenance carries `productionRuntime: false`. The source deck is the same
local snapshot the earlier rounds used, SHA-256
`6aebb6546a0620f3c61efad28cd01023e104d47ffd583272ce18036038f73b78`, and the
executed bundle is the deploy's own artifact, SHA-256
`f00a1ca66b91871e8f0445e3a76abb8806bf5c9d36876bf1ecc6900003e3afe7`.

## The N9 row (a User card renders through the user layout)

```
node tools/edge-signed-in-exercise.mjs --only content-flows \
  --out .runtime/edge-signed-in/round8-n9/report.md
```

**24 / 24 checks passed**, 0 failed, 0 skipped.

| check | result | the evidence |
|---|---|---|
| N9 a User card renders through the user layout | PASS | the User card's page rendered through the layout its own rule names, not the default |
| the page resolved the layout the card's own +*self+*layout rule names, not the :default fallback | PASS | the resolution chain graded by which arm produced the layout name |
| the resolved layout fetches to a card layout, not an unknown layout | PASS | the resolved layout card fetched and rendered as a card layout, not the unknown-layout page |
| the layout card's own content renders, every chunk, in content order | PASS | every chunk of the layout card's own content rendered in content order |
| the card's own body renders inside the layout's main nest, between the chunks around it | PASS | the card's body rendered inside the layout's main nest, ordered between the surrounding chunks |

The committed run record for this leg is
`docs/runs/edge-signed-in-exercise-round8-n9-2026-10-24.json`, written by
`tools/edge-signed-in-exercise/commit-run-record.mjs` from the harness's own
record. The record's own `rowsClosed` names the row this run closes: **N9**.

## The battery

The row's parity pins ran with `node --test` over the row's touched test
files at this tip: `tools/edge-signed-in-exercise/test/user-card-layout.test.mjs`
pass, 0 fail (the round's six-row pin battery, 90 tests, is stated on each
row's own receipt and commit).
