# mx-B-033: search for a nonexistent name offers a create link

The roster row `mx-B-033-5-create-a-card-every-way-the-` (family [Family])
reads "search for a nonexistent name offers a create link", verdict PASS,
bucket DONE, with the evidence basis "verified - every instrument entry for
B-033 is pass (live-acceptance-lane+whole-harness)". This receipt is the
family's own adjudication of that row: the instrument the registry's own
ledger records for it, the Ruby oracle that pins the surfaces the instrument
touches, and a fresh measurement at this tip.

## What the row is

A signed-in deck answers a search for a name that no card carries
(`GET /*search?query[keyword]=zz_no_such_card_harness`) with a page that
offers a way to create what was searched for.

## The instrument

The harness's "5. create a card every way the site offers" group
(tools/edge-signed-in-exercise.mjs:983), the attempt "search for a
nonexistent name" (:1009), the page it reads (:1010) and the predicate
(:1012), the regex `/create|new card|\/new\//i` over the page HTML. The
record (:1013) grades `hasCreate`, and the evidence carries the page's URL
and the predicate's answer.

The registry's own ledger for this row
(docs/registry/instrument-coverage-matrix.json, action "search for a
nonexistent name offers a create link", id ACT-033, check_ids ["B-033"])
records these instrument entries:

    - live-acceptance-lane, live-bundle, live-deployment: pass
    - whole-harness, headless-dom, native-local-bundle: pass

## The oracle

THE SEARCH PAGE IS RUBY'S OWN. Ruby's own search card renders its results
header and its results list, and the list for a search that matched nothing
is Ruby's own empty view:

    - card-mod-search-0.20.0/set/self/search.rb:44-48, `view :core` is
      `[render_results_for_keyword, super()]` and `view :results_for_keyword`
      is the haml template;
    - card-mod-search-0.20.0/set/self/search/results_for_keyword.haml:1-5,
      the `if search_keyword.present?` guard, the "Results for" label and the
      `span.search-keyword`;
    - card-mod-search-0.20.0/set/abstract/search_views.rb:6-13,
      `search_result_view` choosing the `:card_list` view;
    - card-mod-search-0.20.0/set/abstract/0_search/views.rb:109-116, `view
      :card_list` (the `div.card-list.card-list-<view>.search-result-list`
      wrapper over the item cards), and :126-128, `view :no_search_results`
      (`wrap_with :div, "", class: "search-no-results"`), which is an EMPTY
      div.

Ruby's own captured bytes for the results header are capture arm
probe-view:511:results_for_keyword@set/self/search.rb (graded-identical,
tools/compat-report/graded-probes.json:6981-6985, card `*search`), and the
search box's own bytes are capture arm probe-view:512:search_box@set/self/
search.rb (graded-identical, :6986-6990).

The port renders the same chain: the results header
(src/card/mod-loader/mods/card-mod-search.ts:1044-1069, the haml's own bytes
at :1061-1068 and the empty-string case at :1060), the results list and the
no-results view (src/card/render/views.ts:4664-4715 and :4717, the empty
`div.search-no-results` at :4717), and the search card's own core
(views.ts:1182, the `[render_results_for_keyword, super()]` join).

WHAT THE CHECK ACTUALLY FINDS, and this is the row's honest limit. The
predicate is a page-wide token test: it reads the WHOLE page HTML and asks
whether it contains "create", "new card" or "/new/" anywhere. A named-
instrument probe of the same page, run in this lane against the same deck
copy on a local stack (tmp/probe-search-create.mjs, the stack booted by the
exercise's own helpers, the engine's own sign-in endpoint, the search page
answering 200 with 18,888 bytes), counted five token contexts on that page.
Four of them are one navbar dropdown item: the deck's own Opportunities list
carries a link chunk labelled "New Card", and the navbar renders it as a
dropdown item with an add_box icon, so its slot data, its anchor and its
icon-plus-title all carry the token. The fifth is the page's own inline SVG
comment ("Created with Sketch"). Ruby's own no-results view is an empty div,
so the token is NOT the search results offering anything.

So what the row's PASS says is: the signed-in search page for a nonexistent
name answers 200 and carries a create-ish token. What it does NOT say is that
the search RESULTS offer a create affordance, because Ruby's own view for no
results is an empty div and the token the predicate finds is navbar chrome
that every signed-in page carries.

## The measurement at this tip

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/signed-in-exercise-round8-20261024/rows-r2/report.md

    source 5421b7eb, started 2026-10-24T08:45:24.224Z, the source files clean
    verdict: PASS
    evidence: {"url":"https://127.0.0.1:50552/*search?query[keyword]=zz_no_such_card_harness","hasCreate":true}

The page answered and carried the create-ish token the predicate reads. The
run as a whole graded 253 of 253 checks passed, 0 failed.

## What this receipt does NOT claim

- A create link in the search results. The predicate is page-wide, and the
  token it finds is the navbar's own dropdown item, not the results. Ruby's
  own no-results view is an empty div. The row's DONE condition is not
  changed by this receipt; this receipt adds the family's own evidence for
  the row and names the limit of the check.
- The off-site target of that dropdown item. It is a link chunk in the deck's
  own content whose target is an address on another host; this lane made no
  request to it, and the harness's own browser policy does not follow it.
- The row's port side is what the instrument grades, and it is green. This
  receipt does not claim anything about the live deployment: no live request
  was made by the lane, and nothing deploys.
