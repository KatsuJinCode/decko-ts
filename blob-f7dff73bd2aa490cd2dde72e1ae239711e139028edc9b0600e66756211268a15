# mx-B-021: the saved RichText content is on the page

The roster row `mx-B-021-4-edit-a-richtext-card-tinymce` (family [Family])
reads "the saved RichText content is on the page", verdict PASS, bucket DONE,
and the registry's ledger records every instrument entry for B-021 as pass
(live-acceptance-lane and whole-harness). This receipt is the family's own
adjudication of that row: the instrument the registry's own ledger records
for it, the Ruby oracle that pins the surfaces the instrument touches, and a
fresh measurement at this tip.

## What the row is

After the RichText card was saved, a fresh GET of the card's own page shows
the content that was saved. A page that still shows the old content, or a
page that does not answer at all, is the failure this row names.

## The instrument

The harness's "4. edit a RichText card (TinyMCE, nest dialog, link button)"
group (tools/edge-signed-in-exercise.mjs:781-807), the record "the saved
RichText content is on the page" (:834). The body (:833) takes a fresh GET
of the card's own page (`/${richName}`) and grades
`afterRich.html.includes("Harness rich text")`, the text this run typed into
the editor before the save (:812). The text is this run's own scratch string,
so the check is a round trip, not a fixed expectation.

The registry's own ledger for this row
(docs/registry/instrument-coverage-matrix.json, action "the saved RichText
content is on the page", check_ids ["B-021"]) records these instrument
entries:

    - live-acceptance-lane, live-bundle, live-deployment: pass
    - whole-harness, headless-dom, native-local-bundle: pass

## The oracle

The page the content is read from is the card's own content view, which is
Ruby's own bytes, capture arm probe-view:213:content@set/all/base.rb
(graded-identical in the registry's own ledger,
tools/compat-report/graded-probes.json:5479-5483, `base:content@set/all/
base.rb`: "graded-identical"), the base content view the RichText cardtype
inherits.

The port renders that view through the same contract:
`contentView` (src/card/render/views.ts:607) is the port's `:content`
view, and the RichText card's core is delegated through it exactly as
Ruby's `render_core` delegation is (the port's own comment at
src/card/render/views.ts:610-625 names Ruby's
format/method_delegation.rb:41-47 and format/render.rb:7-14, :96-100).
The saved card's body is what the instrument read back.

WHAT IS ORACLE-MATCHED AND WHAT IS NOT, stated plainly. The content view's
own bytes (the view that carries a card's stored content) are Ruby's own and
capture-matched above, and the port renders that view. What is NOT
capture-matched is the saved card's rendered body in this run: the stored
text and its presence on the page are the instrument's own named facts, and
the status is the run's own measurement.

## The measurement at this tip

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/signed-in-exercise-round6-20261024/rows-r1/report.md

    source 75fe7d99, started 2026-10-24T02:15:36.530Z
    verdict: PASS
    evidence: {"status":200}

The card's own page answered 200 on the fresh GET, and the text this run
typed into the RichText editor was on it.

## What this receipt does NOT claim

- The row's port side is what the instrument grades, and it is green. This
  receipt does not claim anything about the live deployment: no live request
  was made by this lane.
- The card the journey saves is this run's own created RichText card
  (`Harness_richtext_mvlrp0g7`); Ruby's captured arm shows the content
  view's bytes on its own card. The bytes are what the oracle pins.
- The row's DONE condition in the roster is not changed by this receipt;
  this receipt adds the family's own evidence for the row.
