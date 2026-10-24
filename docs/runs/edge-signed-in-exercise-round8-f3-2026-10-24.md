# Edge signed-in exercise, round eight: the F3 leg at this round's tip

The branch is `port/capability-round8-20261024`, created from
`port/capability-round6-20261024` at `71b9693d`. The run below ran at this
round's tip on its own checkout, with a clean source tree.

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

## The F3 row (upload and change an image)

```
node tools/edge-signed-in-exercise.mjs --only cover-b --case F3 \
  --out .runtime/edge-signed-in/round8-f3/report.md
```

**6 / 6 checks passed**, 0 failed, 0 skipped.

| check | result | the evidence |
|---|---|---|
| F3 an image can be uploaded through the Image create form | PASS | writeStatus 200, the server answered the chooser's own hidden `card[action_id_of_cached_upload]` field inside `<div class='chosen-file'>`, afterStatus 200, stored true |
| F3 an uploaded image can be changed through the Image edit form | PASS | sourceMoved true: the served source moved from `/files/~53054/4-large.png` to `/files/~53054/6-large.png`, so the second upload is the one served; createWriteStatus 200, editWriteStatus 200, uploadedStatus 200, afterStatus 200 |

The committed run record for this leg is
`docs/runs/edge-signed-in-exercise-round8-f3-2026-10-24.json`, written by
`tools/edge-signed-in-exercise/commit-run-record.mjs` from the harness's own
record. It carries the provenance, the results the grader
(`tools/edge-signed-in-exercise/lib/local-policy.mjs` `verifiedCapabilities`)
consumes, the coverage it computed, and the request ledger. The record's own
`rowsClosed` names the row this run closes: **F3**.

## The battery

The row's parity pins ran with `node --test` over the row's touched test
files at this tip: `tools/edge-signed-in-exercise/test/image-core-view.test.mjs`
pass, 0 fail (the round's six-row pin battery, 90 tests, is stated on each
row's own receipt and commit).
