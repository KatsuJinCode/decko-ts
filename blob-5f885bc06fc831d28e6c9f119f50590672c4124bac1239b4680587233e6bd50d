# mx-B-035: the delete removes the card (trashed, content gone, new-card page shown)

The roster row `mx-B-035-6-delete-a-card` (family [Family]) reads "the delete
removes the card (trashed, content gone, new-card page shown)", verdict PASS,
bucket DONE, with the evidence basis "verified - every instrument entry for
B-035 is pass (live-acceptance-lane+whole-harness)". This receipt is the
family's own adjudication of that row: the instrument the registry's own
ledger records for it, the Ruby oracle that pins the surfaces the instrument
touches, and a fresh measurement at this tip.

## What the row is

Deleting a card in DecKo is a soft delete: the row stays, marked as trashed,
and the card's content is gone from the pages that read it. A viewer who asks
for the deleted card's name afterwards gets the create page for a card of
that name, not the card.

## The instrument

The harness's "6. delete a card" group
(tools/edge-signed-in-exercise/lib/basic-lifecycle-journeys.mjs:57), which the
exercise drives at tools/edge-signed-in-exercise.mjs:1017. The journey clicks
the delete anchor it found for the run's own card (:85-89, honouring the
anchor's `data-confirm` through `window.confirm` at :87), reads the request
ledger for the write that followed (:91-92), revisits the deleted card's
name (:93), reads the card row's `trash` column (:94) and asks whether the
card's content is still on the page (:95). The record (:96) grades
`write !== undefined && trashed && !stillHasContent`.

The registry's own ledger for this row
(docs/registry/instrument-coverage-matrix.json, action "the delete removes
the card (trashed, content gone, new-card page shown)", id ACT-035,
check_ids ["B-035"]) records these instrument entries:

    - live-acceptance-lane, live-bundle, live-deployment: pass
    - whole-harness, headless-dom, native-local-bundle: pass

## The oracle

THE DELETE IS RUBY'S OWN. Ruby's own controller deletes by trashing:
decko-0.20.0/lib/card_controller/rest.rb:18-20, `def delete; handle { card.
delete! }; end`, and its own trash module carries the semantics
(card-1.110.0/mod/core/set/all/trash.rb):

    - :17-21 `delete!` -> `add_to_trash args do |delete_args| update! delete_args end`;
    - :70-72 `add_to_trash` yields `args.merge(trash: true)`, so the row's
      own `trash` column is what the delete writes;
    - :11-15 `delete` is the same without the bang;
    - :46-57 `event :delete_children, after: :validate_delete, on: :delete`
      cascades the delete to the card's children;
    - :59-68 `pull_from_trash!` is the counterpart that a create runs (see the
      next row's receipt).

The port runs the same machinery: src/card/actions/card-action-engine.ts
:4088-4094 (`deleteCard`), :4096-4180 (`deleteCardInner`: the already-trashed
no-op at :4116, the delete permission at :4118, the validate stage carrying
`trash: true` at :4161-4174) and :4355-4393 (`trashInWriter`, the write that
sets the row's trash flag, the finalize events and the reference cleanup).

THE NEW-CARD PAGE FOR A DELETED CARD IS RUBY'S OWN RULE, ported. Ruby's own
format module answers an unknown MAIN card with the create form when the
viewer may create it (card-mod-format-0.20.0/set/all/html/error.rb:81-87,
`def page_view_for_unknown; ok?(:create) ? :new : super; end`), and the port
renders the same create page for an unknown card to a signed-in viewer
(deploy/bunny-worker-src/bunny-edge-engine-request.ts:976-1002).

WHAT IS ORACLE-MATCHED AND WHAT IS NOT, stated plainly. The delete's own
mechanism (the controller's `card.delete!`, the trash flag on the row, the
children cascade) and the unknown-card rule are Ruby's own, and the port
runs each of them. The live answer (the write's status, the row's trash
flag, the content's absence from the page, the page that answered) is what
this run measured.

## The measurement at this tip

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/signed-in-exercise-round8-20261024/rows-r2/report.md

    source 5421b7eb, started 2026-10-24T08:45:24.224Z, the source files clean
    verdict: PASS
    evidence: {"deleteStatus":200,"afterStatus":200,"trashed":true,"stillHasContent":false}

The delete answered a write, the card's row carries the trash flag, and the
card's content is no longer on the page the deleted card's name now answers
(the page is the create page for a card of that name, whose title is the new
card's own). The run as a whole graded 253 of 253 checks passed, 0 failed.

## What this receipt does NOT claim

- The byte-identity of the page that answered the deleted card's name. The
  check grades the write's presence, the row's trash flag and the content's
  absence; the new-card page itself is pinned here from Ruby's own
  unknown-card rule and the port's own rendering, not from the check's
  grade.
- The row's port side is what the instrument grades, and it is green. This
  receipt does not claim anything about the live deployment: no live request
  was made by the lane, and nothing deploys.
- The row's DONE condition in the roster is not changed by this receipt;
  this receipt adds the family's own evidence for the row.
