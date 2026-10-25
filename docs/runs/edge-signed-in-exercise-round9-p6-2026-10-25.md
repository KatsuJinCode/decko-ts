# Edge signed-in exercise, round nine: the P6 row at this round's tip

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

## The P6 row (rule board: administrator sets read/write rules)

```
node tools/edge-signed-in-exercise.mjs --out .runtime/edge-signed-in/round9-family/report.md
```

| check | result | the evidence |
|---|---|---|
| P6 the board Rules tab offers the set's read and update rules to an administrator | PASS | the Rules tab offered the set's read and update rules to the administrator |
| P6 an administrator sets the set's read rule from the Rules tab and the member's read follows it | PASS | the administrator set the read rule and the member's read flipped to 403 with the secret absent, while the administrator still read the card |
| P6 an administrator sets the set's update rule from the Rules tab and the member's write follows it | PASS | the administrator set the update rule and the member's write was refused through the update route, the card kept the content it had, and the administrator's own write still went through |

WHAT THIS ROW DOES NOT CLAIM: the other permission settings (create,
delete) are not claimed here; a rule card whose membership left no reference
behind reaches nobody, which the grantee control now catches; the P1 and P3
rows' own read and update boundaries are separate contracts and are not claimed
here; and the default production posture's uniform-failure wording is a
documented divergence that this row measures nothing about.

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
