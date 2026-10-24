# Edge signed-in exercise, round eight: the N5 legs at this round's tip

The branch is `port/capability-round8-20261024`, created from
`port/capability-round6-20261024` at `71b9693d`. Both runs below ran at this
round's tip on its own checkout, with a clean source tree.

Two runs, both on the LOCAL stack that the harness boots itself: the loopback
database and object storage, a local copy of the deck on the engine schema,
two throwaway local accounts (one holding the `administrator` role, one
signed in with no role), headless Chromium with a throwaway profile. Nothing
reached the live edge and nothing was written to the live D1: every run's
provenance carries `productionRuntime: false`. The source deck is the same
local snapshot the earlier rounds used, SHA-256
`6aebb6546a0620f3c61efad28cd01023e104d47ffd583272ce18036038f73b78`, and the
executed bundle is the deploy's own artifact, SHA-256
`f00a1ca66b91871e8f0445e3a76abb8806bf5c9d36876bf1ecc6900003e3afe7`.

Both runs report their checks 0 failed; each process exits non-zero by
design, because the whole family's acceptance is incomplete while any row of
the 95 is unrun or partial - that exit is the family's standing state, not a
failure of these legs.

## The Changes-journey legs

```
node tools/edge-signed-in-exercise.mjs --only basic-lifecycle \
  --out .runtime/edge-signed-in/round8-n5-changes/report.md
```

**26 / 26 checks passed**, 0 failed, 0 skipped.

| check | result | the evidence |
|---|---|---|
| the Changes link (/*search) lists cards | PASS | the rendered rows carry act ids and hrefs; the sample rows are this run's own cards |
| /*search lists the cards this run just created/edited first | PASS | the run's created and edited cards occupy the first result rows |

## The newest-first order legs

```
node tools/edge-signed-in-exercise.mjs --only recent-changes-feed-dedup \
  --out .runtime/edge-signed-in/round8-n5-feed/report.md
```

**10 / 10 checks passed**, 0 failed, 0 skipped.

| check | result | the evidence |
|---|---|---|
| the Changes page orders its acts newest first by act id, the way Ruby's recent_acts does | PASS | the act ids the renderer stamps into the collapses ran pairwise strictly descending, equal to the deck's own card_acts order read before the page was opened |
| the Changes page carries at least two acts, so the order is a measured relation | PASS | the graded feed carried more than one act |

The committed run record for these legs is
`docs/runs/edge-signed-in-exercise-round8-n5-2026-10-24.json`, written by
`tools/edge-signed-in-exercise/commit-run-record.mjs` from the harness's own
records. The record's own `rowsClosed` names the row these runs close: **N5**.

## The battery

The row's parity pins ran with `node --test` over the row's touched test
files at this tip: `tools/edge-signed-in-exercise/test/recent-changes-newest-first.test.mjs`
pass, 0 fail (the round's six-row pin battery, 90 tests, is stated on each
row's own receipt and commit).
