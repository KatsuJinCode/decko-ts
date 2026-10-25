# Edge signed-in exercise, round nine: the whole-family exercise at this round's final tip

The branch is `port/capability-round9-20261024`, created from
`port/capability-round8-20261024` at `c265530a` (the newest pushed capability
tip).

This run is the CONFIRMATION at the round's final content tip
(`c46d0f04`, the source tree clean and committed). The eight row commits and
the family record are already landed, so the roster's declared state is the
one this run's own grader reads: the eight rows this round closes are covered
in the roster, and the record's embedded coverage counts them.

```
node tools/edge-signed-in-exercise.mjs --out .runtime/edge-signed-in/round9-final/report.md
```

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

**293 / 293 checks passed**, 0 failed, 0 skipped. The run started at
`2026-10-25T05:27:31.691Z` and completed at `2026-10-25T05:46:19.541Z`.

## The family baseline holds at the final commit

The family's recorded baseline is the tranche5 full run
(`docs/runs/edge-signed-in-exercise-full-run-2026-10-21-tranche5-signed-in-leg.md`,
263 / 292 passing at source `698faa29`). Measured against it, name by name
over the committed tables: every one of the 252 checks the baseline records
PASS (263 rows, 11 recorded twice per actor) is present in this run's
results and passes here: **0 regressed, 0 absent**. Of the baseline's 29
recorded failures, 26 now pass, 3 no longer exist under the names the
baseline recorded (two of them are this round's own subject, now recorded
under the roster's declared names, and the third, E11b, is recorded by
neither this record nor round eight's), and **0 still fail**.

So the family baseline holds at this round's final commit, and it holds
BETTER than the 290 / 293 round eight carried: the three failures round
eight named (P5's *type plus right leg, P6's update leg and the timings
check) are green here. This run's slowest server total is 2809 ms, under the
3 s bound.

## The grader cross-check at this tip

```
node tools/edge-signed-in-exercise/grader-cross-check.mjs \
  tools/edge-signed-in-exercise/capabilities.json \
  docs/runs/edge-signed-in-exercise-round9-final-2026-10-25.json \
  C6 C8 E3 E20 E21 R1 P5 P6
```

Exit 0. Output:

```
grader over the committed record: 86 covered, 6 partial, 1 not_covered,
  1 disabled_upstream, 1 out_of_scope (of 95)
rows this round closed (checked against this record): C6, C8, E3, E20, E21, R1, P5, P6
every row this round closed (8) is computed covered by the grader
rows this record's runs do not exercise: W4
the roster's own declared state: 87 covered, 5 partial, 1 not_covered,
  1 disabled_upstream, 1 out_of_scope (of 95)
```

All eight rows this round closes are computed covered by the grader over this
record, at the tip that declares them covered.

Two notes on this record. Its own `rowsClosed` field is empty, because the
eight rows' findings name the FAMILY record (the run that produced their
evidence, `docs/runs/edge-signed-in-exercise-round9-family-2026-10-25.json`,
whose `rowsClosed` field names all eight), not this confirmation run; the
cross-check above therefore names the eight rows as arguments. And the
difference between the two count lines is M1, the row the family record
already named: the leg "the editor's toolbar configuration carries Ruby's
format, list, table and insert tokens" is recorded by no harness code, so no
run record can carry it and the grader computes that row partial from any
record while the roster declares it covered.

## The battery

The round's pin battery ran with `node --test` over the row's own pin files
at this tip:

```
node --test "tools/edge-signed-in-exercise/test/*.test.mjs"
```

395 tests, 393 pass, 0 fail, 2 skipped (the two live-measurement legs, which
are skipped unless `DECKO_INSTRUMENT_LIVE=1` is set: this round measures
nothing live).
