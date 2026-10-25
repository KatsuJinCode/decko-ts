# Edge signed-in exercise, round nine: the P5 row at this round's tip

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

## The P5 row (rules: *right Set, *type_plus_right Set, Self Set)

```
node tools/edge-signed-in-exercise.mjs --out .runtime/edge-signed-in/round9-family/report.md
```

| check | result | the evidence |
|---|---|---|
| P5 *self+*structure rule on a card renders its structure in the main slot | PASS | the *right leg graded against the visited card's own RIGHT token |
| P5 *right Set: a card the RIGHT token covers renders the *right rule and not the *all default | PASS | the *type plus right leg graded against the visited card's own TYPE_PLUS_RIGHT token, and the rule's content rendered while the *all default it replaced was gone |
| P5 *type_plus_right Set: a card the TYPE_PLUS_RIGHT token covers renders the *type_plus_right rule for a member of the set and not the *all default | PASS | the Self leg graded against the visited card's own SELF token |
| P5 Self Set: a card the SELF token names renders its own *self rule and not the *all default | PASS |  |

WHAT THIS ROW DOES NOT CLAIM: the fixture types its visited cards by a
cardtype IT creates rather than by the deck's own accounted cardtype, because a
card of the accounted type is an account and the port's account machinery would
own it; the mechanism under test (the anchor, the rule's set, the negative
control) is the one Ruby's spec drives; and the *right and *type plus right
rules' effect on a card's TYPE is not claimed here, only their effect on what
the main slot renders.

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
