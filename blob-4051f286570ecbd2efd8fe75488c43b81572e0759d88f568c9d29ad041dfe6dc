# mx-189: empty-vs-error rendering, empty result sets must not render as errors and vice versa

The roster row `mx-189-cross-cutting-empty-vs-error-r` (family [Family])
reads "empty-vs-error rendering: empty result sets must not render as
errors and vice versa", verdict PASS, bucket DONE, with the evidence
basis "verified - every instrument entry for this action is pass
(whole-harness)". This receipt is the family's own adjudication of that
row: the instruments the registry's own ledger records for it, the Ruby
oracle that pins the error side's own bytes, and fresh measurements at
this tip.

## What the row is

An empty result and a missing card are different answers. A search with
no matches must render the search surface with zero rows (status 200, no
error shape); a missing card must render the error answer (the not-found
view, the 404, the json error object); and neither shape may leak into
the other.

## The instruments

The ranks91-100 window probe
(reference-harness/browser/probe-pageonly-ranks91-100.mjs) drives three
legs (its ACT-189 section, lines 807-860): a no-match keyword search
answers 200 with the search box present and zero rows, no not-found view
and no json error on the page (:799); a missing card's page and .json
answers are errors, not empty successes (status 404, the json error
object naming the card, no create-form markup) (:808); and the two
renders stay distinct in both directions (the empty answer carries no
not-found shape, the missing answer is not a 200) (:811).

The batch5 cross-cutting probe drives the same three legs independently
(its ACT-189 section, lines 369-396).

The registry's own ledger for this row
(docs/registry/instrument-coverage-matrix.json, action "empty-vs-error
rendering: empty result sets must not render as errors and vice versa",
id ACT-189, check_ids []) records these instrument entries:

    - whole-harness, headless-dom, native-local-bundle: pass
    - whole-harness, headless-dom, ts-engine-local-bundle: pass (two
      entries, the pageonly-batch5 and the ranks91-100 re-grades)

## The oracle

THE ERROR SIDE IS RUBY'S OWN, AND THE REPOSITORY CARRIES ITS CAPTURED
BYTES. The committed capture of a real Ruby deck's rendered views
(reference-harness/fixtures/synthetic-v2-mod-probes/expected/render.jsonl)
holds the arm `probe-view:231:not_found@set/all/error.rb`: a
`card-slot not_found-view` whose header's title is "Not Found" and whose
body reads "Could not find <em>Decko Bot</em>", with the requested view
kept in the slot's data. The port renders the same view from the same set
source: src/card/render/format.ts:1558-1600 (notFoundFrameHtml, whose own
header comment cites set/all/html/error.rb:67-73, the voo title "Not
Found", the not_found.haml naming of the card, the h1 against h2 heading
level pinned by the captured oracle bytes it names, and the
sign-in-or-sign-up line gated on the session being signed out, exactly as
Ruby's sign_in_or_up_links is). The status side rides the same captured
split: src/card/render/page.ts:309-351 (page_view_for_unknown: an unknown
card whose actor may create renders the :new page at status 200; without
create permission the card-not-found raise stands, the 404), which the
probe's signed-out 404 leg and the mx-188 row's signed-in witnesses
bracket from both sides. The empty side renders the search card list's
own no-results view: src/card/mod-loader/mods/card-mod-search.ts:637-650
and :1014 (items.length === 0 answers the :no_search_results view, the
html views the module's own header names as covered, Ruby's
set/abstract/0_search/views.rb no_search_results).

WHAT IS ORACLE-MATCHED AND WHAT IS NOT, stated plainly. The not-found
view's structure and words, its heading level, and the create-permission
split behind the 404 are Ruby's own, captured byte-wise or cited file and
line from the captured set sources. The empty-results view's own bytes
are pinned by the port's committed search views (whose headers carry the
Ruby set citations) rather than by a capture arm of a no-match search;
the capture's no_search_results arm (:493/:509) was taken against a card
whose set does not support the view, so it pins the view-support refusal,
not the empty render, and this receipt does not claim it as an
empty-render oracle. The three legs' own predicates are the probes' own
named instruments.

## The measurement at this tip

    node reference-harness/browser/probe-pageonly-ranks91-100.mjs \
      --out .runtime/exhaustive/round12-backslice/probe-ranks91-100-final

    source 9a2ed6e3 (the lane's own tip at run time), the source files
    clean, the engine pure-tip (distSha256 07ff7a50...)
    ACT-189 an empty result set renders as the search surface with zero
      rows, not an error: GREEN {"status":200,"resultListRendered":false,
      "rows":0,"hasSearchBox":true,"notFoundViews":0,
      "jsonErrorInPage":false}
    ACT-189 a missing card renders an error answer, not an empty success:
      GREEN {"status":404,"error":"card not found"}
    ACT-189 the empty and error renders stay distinct (no shape leaks
      either way): GREEN {"emptyStatus":200,"emptyRows":0,
      "emptyJsonError":false,"emptyNotFoundViews":0,"missingStatus":404}
    legs 22, failures 0

    node reference-harness/browser/probe-pageonly-batch5-ordering-case-\
      paging-roles-empty-error.mjs \
      --out .runtime/exhaustive/round12-backslice/probe-batch5

    source 71d4f686 (the family tip this lane starts from), the source
    files clean, distSha256 708a5f3d...
    ACT-189 an empty result set renders as the search surface with zero
      rows, not an error: GREEN {"status":200,"rows":0,
      "hasSearchBox":true,"heading":["Search Results"],
      "jsonErrorInPage":false}
    ACT-189 a missing card renders an error answer: GREEN
      {"status":404,"error":"card not found"}
    ACT-189 the empty and error renders stay distinct: GREEN
    legs 11, failures 0

The empty answer was a 200 with zero rows and no error shape, the missing
card was a 404 with the error object, and neither leaked into the other,
on both instruments, at both sources.

## What this receipt does NOT claim

- The row's port side is what the instruments grade, and it is green. This
  receipt does not claim anything about a live deployment: no live request
  was made by the lane, and nothing deploys.
- The row's DONE condition in the roster is not changed by this receipt;
  this receipt adds the family's own evidence for the row.
- The empty-search render is not claimed as capture-matched; the capture
  arm that exists pins the view-support refusal, and the receipt says so.
