# Edge signed-in exercise, round eight: the whole-family exercise at the round's final tip

The branch is `port/capability-round8-20261024`, created from
`port/capability-round6-20261024` at `71b9693d`. The whole-family exercise
ran once, at this round's final content tip (`d8d46177`, the source tree
clean and committed; the only commits after it are this record and its
receipt, which the source-custody gate requires to run after the fact, the
same shape the round-six receipt records).

One full run - every journey group and every check module, the whole roster
of 95 rows - on the LOCAL stack that the harness boots itself: the loopback
database and object storage, a local copy of the deck on the engine schema
(21676 cards, the same local snapshot the earlier rounds used, SHA-256
`6aebb6546a0620f3c61efad28cd01023e104d47ffd583272ce18036038f73b78`), two
throwaway local accounts (one holding the `administrator` role, one signed in
with no role), headless Chromium with a throwaway profile, and the harness's
own in-process mail capture. Nothing reached the live edge and nothing was
written to the live D1: the run's provenance carries `productionRuntime:
false`. The executed bundle is the deploy's own artifact, SHA-256
`f00a1ca66b91871e8f0445e3a76abb8806bf5c9d36876bf1ecc6900003e3afe7`.

## The grade line

**290 / 293 checks passed**, 3 failed, 0 skipped.

The family's recorded baseline is the tranche5 full run
(`docs/runs/edge-signed-in-exercise-full-run-2026-10-21-tranche5-signed-in-leg.md`,
263 / 292 passing at source `698faa29`). Measured against it, name by name
over the committed tables: **the baseline holds**. Every one of the 252
checks the baseline records PASS (263 rows, 11 recorded twice per actor) is
present in this run's results and passes here: 0 regressed, 0 absent. The 3
failures are all carries from the baseline's own recorded failure list, not
regressions:

| check | this run | the tranche5 baseline recorded |
|---|---|---|
| P5 *type_plus_right Set: a card the TYPE_PLUS_RIGHT token covers renders the *type_plus_right rule for a member of the set and not the *all default | FAIL | FAIL (P5 stays partial; it is not this round's roster) |
| P6 an administrator sets the set's update rule from the Rules tab and the member's write follows it | FAIL | FAIL (P6 stays partial; it is not this round's roster) |
| 9. timings / no signed-in page exceeded 3 s of server time | FAIL | FAIL (the slow path this run is a board act page at 11.2 s) |

The 27 checks the baseline recorded FAIL and now pass include, among others,
F3's change leg, F1's download link, all four CQL operator legs, the N6
keyword echo, N5's newest-first order legs and N9's main-nest leg - the rows
earlier rounds and this round closed.

## What this run records for this round's six rows

Every named check of all six rows this round closes passes in this run's own
results: F3 (2 legs), N2 (8 names), N5 (4 names, including
"/*search lists the cards this run just created/edited first" under the
repaired predicate below), N6 (4 names, including the create-link offer),
N9 (5 legs) and H1 (6 names, the four cover-b predicate legs over the card
this run created and renamed, plus the two journey legs).

## The instrument repair this exercise forced, named

The first family-exercise attempt at this tip failed one of this round's own
row checks: "/*search lists the cards this run just created/edited first"
(N5's second name). The mechanism: the check's code demanded the first listed
row be the RichText card's own id, while the check's own comment states the
contract as "the FIRST listed entry is one of this run's own touched cards -
the newest act at the top, before anything older". The full run's create
group always creates cards AFTER the RichText journey's edit, so the run's
newest created card (the Harness_date card) correctly sat in first place and
the narrow predicate failed - in this run and in every family run before it
(the tranche5 baseline carries the identical failure with the identical
evidence shape). The port's ordering was correct both times; the instrument
was mis-focused. Fixed at `d8d46177`: the predicate now grades the stated
contract (the first row must be a card this run created, above the run's id
baseline), and the verified targeted run plus this family run both grade it
green. The failure was therefore an instrument defect, not a port
regression, and the baseline comparison above is computed after the repair.

## The grader cross-check

```
node tools/edge-signed-in-exercise/grader-cross-check.mjs \
  tools/edge-signed-in-exercise/capabilities.json \
  docs/runs/edge-signed-in-exercise-round8-family-2026-10-24.json
```

Exit 0. Output:

```
grader over the committed record: 78 covered, 14 partial, 1 not_covered,
  1 disabled_upstream, 1 out_of_scope (of 95)
rows this round closed (checked against this record): N6, H1
every row this round closed (2) is computed covered by the grader
rows this record's runs do not exercise: W4
the roster's own declared state: 79 covered, 13 partial, 1 not_covered,
  1 disabled_upstream, 1 out_of_scope (of 95)
```

The declared state is the family's standing count after this round: 73 + 6
covered, 19 - 6 partial, the others unchanged. All six rows this round
closed (F3, N2, N5, N6, N9, H1) are computed covered by the grader over this
record; the cross-check's own criterion (the record's `rowsClosed`, N6 and
H1, the two rows whose findings name this record) holds.

## One pre-existing gap this exercise named, not this round's row

The grader computes M1 partial from this record while the roster declares M1
covered. The missing leg is "the editor's toolbar configuration carries
Ruby's format, list, table and insert tokens"
(`RICH_TEXT_TOOLBAR_CHECKS.config`, tools/edge-signed-in-exercise/lib/
rich-text-toolbar.mjs:267): no harness code records that name -
checks-cover-b.mjs records only `RICH_TEXT_TOOLBAR_CHECKS.rendered` (line
1581) - so the leg exists only in the pin test
(tools/edge-signed-in-exercise/test/rich-text-toolbar.test.mjs) and no
harness record can ever carry it. The leg's substance is green (the pin test
passes at this tip, and this run's rendered leg passes with configSeen true),
but the binding gap means the row's covered declaration cannot be recomputed
from any harness record. M1 is not this round's roster; the gap is named
here for whoever owns that row.

## The battery

The round's six-row pin battery ran with `node --test` at this tip: 90
tests, 0 fail (image-core-view, cql-operator-breadth, cql-expected-set,
recent-changes-newest-first, search-empty-answer, user-card-layout,
card-history-acts).
