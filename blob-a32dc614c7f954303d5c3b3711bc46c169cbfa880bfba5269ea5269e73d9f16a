# mx-B-036: no card named delete... was created by this run (cards with id above the run baseline)

The roster row `mx-B-036-6-delete-a-card` (family [Family]) reads "no card
named delete... was created by this run (cards with id above the run
baseline)", verdict PASS, bucket DONE, with the evidence basis "verified -
every instrument entry for B-036 is pass (live-acceptance-lane+whole-harness)".
This receipt is the family's own adjudication of that row: the instrument the
registry's own ledger records for it, the Ruby oracle that pins the surfaces
the instrument touches, and a fresh measurement at this tip.

## What the row is

A delete in DecKo is a soft delete, and a create with the name of a trashed
card revives that row instead of inserting a new one. The row is the guard
against the run itself leaving a second delete-shaped card behind, and
against the delete having resurrected the card it was supposed to remove.

## The instrument

The harness's "6. delete a card" group
(tools/edge-signed-in-exercise/lib/basic-lifecycle-journeys.mjs:57), which the
exercise drives at tools/edge-signed-in-exercise.mjs:1017. The journey counts
the rows the run created above the run's baseline that carry a delete-shaped
name (:104), hands them to the audit helper
(tools/edge-signed-in-exercise/lib/delete-target-audit.mjs:1-8: only the
exact intended tombstone is allowed; a resurrection or any other
delete-shaped row fails, including a second record that was itself trashed
afterwards), and the record (:106) grades `unexpected.length === 0`. The
harness's own comment (:98-103) records why the name pattern is what it is:
the run names its delete target `Harness_delete_<stamp>`, which does not
start with "delete", so a pattern of `LIKE 'delete%'` could never have fired
for exactly the case the guard exists for.

The registry's own ledger for this row
(docs/registry/instrument-coverage-matrix.json, action "no card named
delete... was created by this run (cards with id above the run baseline)", id
ACT-036, check_ids ["B-036"]) records these instrument entries:

    - live-acceptance-lane, live-bundle, live-deployment: pass
    - whole-harness, headless-dom, native-local-bundle: pass

## The oracle

THE RESURRECTION RULE IS RUBY'S OWN. card-1.110.0/mod/core/set/all/trash.rb
:23-27 registers the create-side event

    event :manage_trash, :prepare_to_store, on: :create do
      pull_from_trash!
      self.trash = false
      true
    end

and :59-68 is `pull_from_trash!`:

    def pull_from_trash!
      query = Lexicon.lex_query(lex).merge trash: true
      return unless (trashed_card = Card.where(query).take)
      db_attributes["id"] = trashed_card.db_attributes["id"]
      @from_trash = true
      @new_record = false
    end

So in Ruby's own deck a card created with the name of a trashed card reuses
that row's id and clears the trash flag: one row, the same id, never a
second one. The port runs the same rule: src/card/actions/card-action-engine.ts
:2100-2111 (the revival, `findTrashedCardByLex` and the port's own note that
it revives the trashed row rather than inserting a second one) and :2172-
2185 (the revived record is written with the same card id, and the port
records that the revived record counts as new apart from its id).

That is what the row's guard protects on both sides: the run's own delete
must leave exactly the one tombstone it intended, and a card that the run
created with the trashed name must be that same row rather than a second
one.

WHAT IS ORACLE-MATCHED AND WHAT IS NOT, stated plainly. The resurrection
mechanism, the reuse of the trashed row's id and the clearing of the trash
flag are Ruby's own, and the port implements each of them. The row's own
guard (the exact intended tombstone, no second delete-shaped row) is the
harness's own instrument, and the live answer is what this run measured.

## The measurement at this tip

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/signed-in-exercise-round8-20261024/rows-r2/report.md

    source 5421b7eb, started 2026-10-24T08:45:24.224Z, the source files clean
    verdict: PASS
    evidence: {"cardsNamedDeleteCreatedThisRun":0,"baselineMaxCardId":53052,"intendedTombstoneId":53054,"unexpected":[],"scope":"Only the exact intended tombstone is allowed; resurrection and every additional delete-shaped row fail"}

No delete-shaped row above the run's baseline was left behind other than the
one tombstone the run intended (id 53054, trashed), so the guard's own
predicate held. The run as a whole graded 253 of 253 checks passed, 0
failed.

## What this receipt does NOT claim

- The row's port side is what the instrument grades, and it is green. This
  receipt does not claim anything about the live deployment: no live request
  was made by the lane, and nothing deploys.
- The row's DONE condition in the roster is not changed by this receipt;
  this receipt adds the family's own evidence for the row.
