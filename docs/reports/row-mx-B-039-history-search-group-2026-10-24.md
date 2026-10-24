# mx-B-039: the Changes link (/*search) lists cards

The roster row `mx-B-039-7-rename-history-search-change` (family [Family])
reads "the Changes link (/*search) lists cards", verdict PASS, bucket DONE,
with the evidence basis "verified - every instrument entry for B-039 is pass
(live-acceptance-lane+whole-harness)". This receipt is the family's own
adjudication of that row: the instrument the registry's own ledger records
for it, the Ruby oracle that pins the surfaces the instrument touches, and a
fresh measurement at this tip.

## What the row is

The changes list is the deck's search page rendered as a list of cards. The
row asks for two things: that the page answers, and that what it lists are
real cards, each row carrying the card's own id and a link to it. A page
that answers 200 with an empty list, or a list of chrome rows with no card
behind them, does not satisfy the row.

## The instrument

The exercise's changes journey
(tools/edge-signed-in-exercise/lib/basic-lifecycle-journeys.mjs:113-124).
It visits `/*search` (:113) and then reads the ordered rows of the page's
result list (:121-123): each `.search-result-item` under
`#main .search-result-list`, its `data-card-id`, its `data-card-name` and
the href of its `a.full-page-link`. The record (:124) grades PASS only when
the page answered 200 AND at least one row was found AND every row carried
an id greater than zero and an href. The harness's own comment (:115-120)
records why the rows are read that way: a page-wide text test was satisfied
by the signed-in navbar's own account name on ANY changes page, so the
predicate was narrowed to the ordered row wrappers.

The registry's own ledger for this row
(docs/registry/instrument-coverage-matrix.json, action "the Changes link
(/*search) lists cards", id ACT-039, check_ids ["B-039"]) records these
instrument entries:

    - live-acceptance-lane, live-bundle, live-deployment: pass
    - whole-harness, headless-dom, native-local-bundle: pass

## The oracle

THE RESULT LIST IS RUBY'S OWN, AND THE REPOSITORY CARRIES ITS CAPTURED
BYTES. Ruby's own search list view is
card-mod-search-0.20.0/set/abstract/0_search/views.rb:108-116:

    view :card_list, cache: :never do
      klasses = "card-list card-list-#{item_view_options[:view]} search-result-list"
      search_result_list(klasses) do
        search_with_params.map do |item_card|
          card_list_item item_card
        end
      end
    end

with `card_list_item` at :132-136:

    def card_list_item item_card
      nest_item item_card, size: voo.size do |rendered, item_view|
        %(<div class="search-result-item item-#{item_view}">#{rendered}</div>)
      end
    end

and `search_result_list` at :138-140. The repository's committed capture of
a real Ruby deck's rendered views
(reference-harness/fixtures/synthetic-v2-mod-probes/expected/render.jsonl)
holds those bytes in its arm `probe-view:506:core@set/self/search.rb`:

    <div class="card-list card-list-bar search-result-list"><div class="search-result-item item-bar">...

with each row's nested card carrying its own `data-card-id` and
`data-card-name`.

THE ROW LINK IS RUBY'S OWN TOO. The anchor the check reads is Ruby's
full-page link, card-mod-format-0.20.0/set/all/html/menu.rb:119-121:

    def full_page_link text: ""
      link_to_card full_page_card, "#{full_page_icon} #{text}",
                   class: classy("full-page-link")

The port runs the same two things. The list is
src/card/mod-loader/mods/card-mod-search.ts:643-656, whose own header names
0_search/views.rb:108-116 and :132-136; it emits
`<div class="card-list card-list-link search-result-list">` around one
`<div class="search-result-item item-link">` per item. The full-page link
is src/card/render/views.ts:576-589, whose own header names menu.rb:119-122.

WHAT IS ORACLE-MATCHED AND WHAT IS NOT, stated plainly. The result list's
markup, the row wrapper's class, the row's `data-card-id` and
`data-card-name`, and the full-page link's class and href are Ruby's own,
and the port renders each of them. The check's own predicate (at least one
row, every row carrying an id above zero and an href) is the harness's own
instrument, and the live answer is what this run measured.

## The measurement at this tip

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/signed-in-exercise-round9-20261024/rows-r1/report.md

    source c9de40e0d8545b193f9293c658376882c7d904a1, started
    2026-10-24T10:56:20.358Z, the source files clean
    verdict: PASS
    evidence: {"status":200,"sample":[{"id":53053,"name":"Harness_richtext_mvmaak48","href":"/Harness_richtext_mvmaak48"},{"id":10857,"name":"2011 12 14","href":"/2011_12_14"},{"id":53052,"name":"Harness Member+*account+*status","href":"/Harness_Member+*account+*status"}]}

The changes page answered 200 and its first three rows were real cards:
the run's own RichText card, the deck's date card, and a card of the run's
own seed account. Every row the check read carried an id above zero and a
link to its card. The run as a whole graded 253 of 253 checks passed, 0
failed.

## What this receipt does NOT claim

- The row's port side is what the instrument grades, and it is green. This
  receipt does not claim anything about the live deployment: no live request
  was made by the lane, and nothing deploys.
- The row's DONE condition in the roster is not changed by this receipt;
  this receipt adds the family's own evidence for the row.
