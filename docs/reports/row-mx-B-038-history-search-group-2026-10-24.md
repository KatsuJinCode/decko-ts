# mx-B-038: a card's history view renders

The roster row `mx-B-038-7-rename-history-search-change` (family [Family])
reads "a card's history view renders", verdict PASS, bucket DONE, with the
evidence basis "verified - every instrument entry for B-038 is pass
(live-acceptance-lane+whole-harness)". This receipt is the family's own
adjudication of that row: the instrument the registry's own ledger records
for it, the Ruby oracle that pins the surfaces the instrument touches, and a
fresh measurement at this tip.

## What the row is

A card's history is the list of acts that touched it, rendered as an
accordion under the card's own frame. The row is the check that the
`/<card>/history` page is a real page for a card the run created, and it
names a page that only exists because the card exists.

## The instrument

The exercise's "7. rename, history, search, changes, sign out and back in"
group (tools/edge-signed-in-exercise.mjs:1047). The history read follows the
card the RichText journey created; when the write mode refused that create,
the read grades nothing and records an honest skip rather than a pass
(:1051-1053). Otherwise the check visits `/${richName}/history` (:1054) and
records PASS only on a 200 (:1055).

The registry's own ledger for this row
(docs/registry/instrument-coverage-matrix.json, action "a card's history
view renders", id ACT-038, check_ids ["B-038"]) records these instrument
entries:

    - live-acceptance-lane, live-bundle, live-deployment: pass
    - whole-harness, headless-dom, native-local-bundle: pass

## The oracle

THE HISTORY VIEW IS RUBY'S OWN, AND THE REPOSITORY CARRIES ITS CAPTURED
BYTES. Ruby's own history view is
card-mod-history-0.20.0/set/all/history/views.rb:4-9:

    view :history, cache: :never do # why no cache?
      frame do
        class_up "d0-card-body",  "history-slot"
        relative_history
      end
    end

The repository's committed capture of a real Ruby deck's rendered views
(reference-harness/fixtures/synthetic-v2-mod-probes/expected/render.jsonl)
holds that view's bytes in its arm
`probe-view:373:history@set/all/history/views.rb`: a
`card-slot history-view` slot, then `<div class="d0-card-frame card">`, the
card header, then `<div class="d0-card-body card-body card-text">`, then the
legend row, then `<div class="row">` around `<div class="accordion">` with
one `accordion-item` per act.

THE PATH IS RUBY'S OWN GRAMMAR. `/<card>/history` is the card's history
view because of card-mod-format-0.20.0/lib/card/path.rb:32-40:

    def base
      if action.in? %i[create update delete]
        action_base
      elsif mark.present? && view.present?
        "#{mark}/#{view}"
      else
        mark
      end
    end

The port runs the same two things. The history view is
src/card/mod-loader/mods/card-mod-history.ts:1759-1797, whose own header
names views.rb:4-9; it builds the same frame
(`d0-card-frame card`), the same body (`d0-card-body card-body
card-text`), the same legend row and the same
`<div class="row">` around `<div class="accordion">` carrying one item per
act.

WHAT IS ORACLE-MATCHED AND WHAT IS NOT, stated plainly. The history view's
shape, the frame and the accordion, and the `mark/view` path grammar are
Ruby's own, and the port renders each of them. The instrument's own
predicate (a 200 on the page of the card the run itself created) is the
harness's own, and the live answer is what this run measured. The card the
read follows is the run's own throwaway card, not a card of the deck
under test, so this receipt says nothing about the content of any
particular card's history.

## The measurement at this tip

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/signed-in-exercise-round9-20261024/rows-r1/report.md

    source c9de40e0d8545b193f9293c658376882c7d904a1, started
    2026-10-24T10:56:20.358Z, the source files clean
    verdict: PASS
    evidence: {"status":200}

The history page of the card the run created answered 200. The same run's
neighbouring check, which grades the page's CONTENT and not only its
status, was green too: "the history page lists the card's acts (not just a
200)" PASS with {"status":200,"actToggles":4,"runEditListed":true}. The run
as a whole graded 253 of 253 checks passed, 0 failed.

## What this receipt does NOT claim

- The row's port side is what the instrument grades, and it is green. This
  receipt does not claim anything about the live deployment: no live request
  was made by the lane, and nothing deploys.
- The row's DONE condition in the roster is not changed by this receipt;
  this receipt adds the family's own evidence for the row.
