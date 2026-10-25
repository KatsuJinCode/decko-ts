# Edge signed-in exercise, round nine: the whole-family exercise at the round's final content tip

The branch is `port/capability-round9-20261024`, created from
`port/capability-round8-20261024` at `c265530a` (the newest pushed capability
tip). The whole-family exercise ran once, at this round's final content tip
(`0c4bd8d5`, the source tree clean and committed; the commits after it are
the eight row commits, this record and this receipt, which carry the roster's
status strings and no behaviour).

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
`f00a1ca66b91871e8f0445e3a76abb8806bf5c9d36876bf1ecc6900003e3afe7` (the same
artifact round eight ran).

```
node tools/edge-signed-in-exercise.mjs --out .runtime/edge-signed-in/round9-family/report.md
```

## The grade line

**293 / 293 checks passed**, 0 failed, 0 skipped. The run started at
`2026-10-25T04:59:16.431Z` and completed at `2026-10-25T05:20:06.762Z`.

This is BETTER than the baseline the family has been carrying, not equal to
it, and the difference is named below.

## The baseline holds

The family's recorded baseline is the tranche5 full run
(`docs/runs/edge-signed-in-exercise-full-run-2026-10-21-tranche5-signed-in-leg.md`,
263 / 292 passing at source `698faa29`). Measured against it, name by name
over the committed tables: every one of the 252 checks the baseline records
PASS (263 rows, 11 recorded twice per actor) is present in this run's
results and passes here: **0 regressed, 0 absent**.

The baseline's 29 recorded failures split three ways against this run:

- **26 now pass.** They include the N6 keyword echo, N5's newest-first order
  legs, N9's main-nest leg, F1's download link, F3's change leg, the four CQL
  operator legs, the account-signup legs, E21's history pill, the R1 referer
  legs and the timings check.
- **3 no longer exist under the names the baseline recorded.** Two of them
  are this round's own subject: the baseline recorded the P5 leg as "P5 *type
  plus right Set" and the P6 leg as "P6 the Rule board: an administrator sets
  an update rule through the Rules tab", and the harness now records both
  under the roster's own declared names ("P5 *type_plus_right Set: a card the
  TYPE_PLUS_RIGHT token covers renders the *type_plus_right rule for a member
  of the set and not the *all default" and "P6 an administrator sets the set's
  update rule from the Rules tab and the member's write follows it"). Both of
  those names PASS here and FAILED in round eight. The third is "E11b the
  +summary junction's own edit modal targets the junction card with its
  stored content": the catalog-edit-create module declares that check and
  records no result for it, in this run and in round eight's record alike. It
  is a pre-existing binding gap, not this round's regression, and it is
  named here for whoever owns that row.
- **0 still fail.** The three failures round eight carried are green here:
  P5's *type plus right leg (the fixture typed the visited cards RichText, so
  the anchor the deck computed for them did not name the rule's own left
  type, and the rule could not answer), P6's update leg (the rule card was
  seeded as a Phrase, so its membership left no reference behind and the
  rule reached nobody; and the member's verdict was read off the card page,
  which answers 200 for a member who can still read the card), and the
  timings check (this run's slowest server total is 2642 ms, under the 3 s
  bound).

## The rows this round closes

Every named check of all eight rows this round closes passes in this run's
own results: C6 (2 names), C8 (2), E3 (3), E20 (2), E21 (3), R1 (4), P5 (4)
and P6 (3). Each row's own receipt carries the evidence of its legs and the
gap its finding named:

| row | the gap the row named | what landed |
|---|---|---|
| C6 | the create offer could be an unrelated navbar word | the offer is graded by term, destination and label |
| C8 | the visible validation error was not asserted | the alert is read byte for byte against Ruby's own answer |
| E3 | the plugin behind the nest button was not asserted | the served plugin and the dialog it opens are graded |
| E20 | only the follow controls were present | all five legs Ruby's spec names are graded |
| E21 | the change pills were not asserted | the history_tab slot's pills are graded |
| R1 | the referer update was not checked | the referer update, the re-pointed references and the referer's own link are graded |
| P5 | the two legs the capability names had no graded legs, and the type plus right leg's fixture typed the visited cards wrong | the three legs grade, and the fixture now types the visited cards by the rule's own left type |
| P6 | the write half of "sets read/write rules" was only offered, never set | the rule card is a List card, the member's verdict is a write through the update route, and the rule must still reach its grantee |

## The grader cross-check

```
node tools/edge-signed-in-exercise/grader-cross-check.mjs \
  tools/edge-signed-in-exercise/capabilities.json \
  docs/runs/edge-signed-in-exercise-round9-family-2026-10-25.json
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

All eight rows this round closed are computed covered by the grader over this
record, and the record's own `rowsClosed` field names them.

## One pre-existing gap this exercise named, not this round's row

The grader computes M1 partial from this record while the roster declares M1
covered, and that is the whole difference between the two lines above. The
missing leg is "the editor's toolbar configuration carries Ruby's format, list,
table and insert tokens" (`RICH_TEXT_TOOLBAR_CHECKS.config`,
tools/edge-signed-in-exercise/lib/rich-text-toolbar.mjs): no harness code
records that name, so the leg exists only in the pin test and no harness
record can ever carry it. The leg's substance is green (the pin test passes at
this tip and this run's rendered leg passes), but the binding gap means the
row's covered declaration cannot be recomputed from any harness record. M1 is
not this round's roster; round eight named the same gap and it is unchanged
here.

## The battery

The round's pin battery ran with `node --test` over the row's own pin files
at this tip:

```
node --test "tools/edge-signed-in-exercise/test/*.test.mjs"
```

395 tests, 393 pass, 0 fail, 2 skipped (the two live-measurement legs, which
are skipped unless `DECKO_INSTRUMENT_LIVE=1` is set: this round measures
nothing live).
