# Edge signed-in exercise, round eight: the N2 legs at this round's tip

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

## The legacy-route leg

```
node tools/edge-signed-in-exercise.mjs --only cql-search \
  --out .runtime/edge-signed-in/round8-n2-legacy/report.md
```

**5 / 5 checks passed**, 0 failed, 0 skipped.

| check | result | the evidence |
|---|---|---|
| legacy search route renders the search card without an error page | PASS | the rendered surface answered with the *search card root under #main and no server_error/not_found/denial/errors view |

## The navbox CQL legs

```
node tools/edge-signed-in-exercise.mjs --only cql-navbox \
  --out .runtime/edge-signed-in/round8-n2-navbox/report.md
```

**12 / 12 checks passed**, 0 failed, 0 skipped.

| check | result | the evidence |
|---|---|---|
| JSON CQL is submitted through the visible navbox and Enter | PASS, twice | both submissions went through the visible navbox field and the real Enter key, each answered 200 on /*search with the submitted query in the address bar |
| JSON CQL returns only the expected owned member | PASS | the type+name query over the owned member returned exactly that member |
| JSON CQL missing-name control returns no result cards | PASS | the same query with a missing name returned no result cards |
| JSON CQL right operator returns the expected members and excludes what it names | PASS | the expected set came from the deck's own rows; the excluded card (the administrator) is absent |
| JSON CQL not + name + type operator returns the expected members and excludes what it names | PASS | the nested not-name filter held; the excluded card (the identity itself) is absent |
| JSON CQL and + type + name operator returns the expected members and excludes what it names | PASS | the conjunction of both filter keys held |
| JSON CQL created_by operator returns the expected members and excludes what it names | PASS | the created_by set held; the excluded card is absent |

The committed run record for these legs is
`docs/runs/edge-signed-in-exercise-round8-n2-2026-10-24.json`, written by
`tools/edge-signed-in-exercise/commit-run-record.mjs` from the harness's own
records. The record's own `rowsClosed` names the row these runs close: **N2**.

## The battery

The row's parity pins ran with `node --test` over the row's touched test
files at this tip: `tools/edge-signed-in-exercise/test/cql-operator-breadth.test.mjs`
and `tools/edge-signed-in-exercise/test/cql-expected-set.test.mjs` pass,
0 fail (the round's six-row pin battery, 90 tests, is stated on each row's
own receipt and commit).
