# Edge signed-in exercise, round nine: the E21 row at this round's tip

The branch is `port/capability-round9-20261024`, created from
`port/capability-round8-20261024` at `c265530a`, the newest pushed
capability tip. The run below ran at this round's tip on its own checkout.

One run, on the LOCAL stack that the harness boots itself: the loopback
database and object storage, a local copy of the deck on the engine schema,
two throwaway local accounts (one holding the `administrator` role, one signed
in with no role), headless Chromium with a throwaway profile. Nothing reached
the live edge and nothing was written to the live D1: the run's provenance
carries `productionRuntime: false`. The source deck is the same local
snapshot the earlier rounds used, SHA-256 `6aebb6546a0620f3c61efad28cd01023e104d47ffd583272ce18036038f73b78`, and the executed
bundle is the deploy's own artifact, SHA-256 `f00a1ca66b91871e8f0445e3a76abb8806bf5c9d36876bf1ecc6900003e3afe7`.

## The grade line

**293 / 293 checks passed**, 0 failed, 0 skipped.
No check failed in this run.

## The E21 row (edit board: history tab lists changes in pills)

```
node tools/edge-signed-in-exercise.mjs --out .runtime/edge-signed-in/round9-family/report.md
```

| check | result | the evidence |
|---|---|---|
| the card board renders with its tabs (guide, engage, history, rules) | PASS | the card board rendered its four tabs |
| E21 the board History tab lists the run's change | PASS | the History tab listed the run's own change, read out of the board_act href |
| the board History tab lists the run's change as a pill | PASS | that change was a pill carrying the actor and the age |

WHAT THIS ROW DOES NOT CLAIM: the card's own history PAGE is the H1
row's contract and is not claimed here; expanding an act and rolling it back is
H2's contract, which is disabled upstream, and is not claimed here; and the
Related tab's own pills are not claimed here.

## The battery

The row's parity pins ran with `node --test` over the row's own pin
files at this tip: `tools/edge-signed-in-exercise/test/search-create-offer.test.mjs`
and `duplicate-name-error.test.mjs` (C6, C8), `tinymce-nest-plugin.test.mjs`
(E3), `engage-tab.test.mjs` (E20), `history-pills.test.mjs` (E21),
`rename-referers.test.mjs` (R1), `rule-set-legs.test.mjs`,
`p5-fixture.test.mjs`, `p5-visited-card-and-own-slot.test.mjs` (P5) and
`rule-permission-set.test.mjs`, `p6-board-path.test.mjs`,
`p6-seed-rule.test.mjs` (P6) pass, 0 fail. The whole round's pin battery is
stated on the family receipt.
