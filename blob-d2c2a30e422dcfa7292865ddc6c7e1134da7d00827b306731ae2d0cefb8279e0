# mx-B-057: keyword search from the navbox returns the run's card

The roster row `mx-B-057-7b-further-signed-in-capabilit` (surface "7b.
further signed-in capabilities") reads "keyword search from the navbox
returns the run's card", verdict PASS, bucket DONE, with the evidence
basis "verified - every instrument entry for B-057 is pass
(live-acceptance-lane+whole-harness)". This receipt is the family's own
adjudication of that row: the named check that drives the navbox for
real, the Ruby oracle that pins the search box and the results surface,
and a fresh measurement at this tip.

## What the row is

A signed-in person types a keyword into the page's visible navbox search
field and presses Enter. The browser lands on the keyword search route
and the results list the run's own card, found by its content.

## The instrument

"navbox Enter submits keyword search" and "navbox case variants find
content-only target" (tools/edge-signed-in-exercise/checks-navbox.mjs,
the module's capabilityChecks at :2, driven by its only check "keyword
search through the visible navbox and Enter", :4-37): the leg signs in as
the administrator, creates a Basic card whose content is a run-unique
needle and nothing else (:9-16), then, twice (lower case and upper
case, :18-36), fills the visible navbox field
(`form.search-box-form input[name="query[keyword]"]:visible`, :22),
presses Enter (:27), requires the browser to GET
`/*search?query[keyword]=<term>` with the submitted term (:24-30), and
records both checks: the submit itself (status 200 and the
`/*search` landing, :34) and the finding of the run's card among the
result names read out of the `.search-result-item` slots (:31), from
a content-only target (:35).

The registry's own ledger for this row
(C:/localProjects/brandonDojoTech/docs/registry/instrument-coverage-matrix.json,
action "keyword search from the navbox returns the run's card", id
ACT-057, check_ids ["B-057"]) records these instrument entries:

    - live-acceptance-lane, live-bundle, live-deployment: pass
    - whole-harness, headless-dom, native-local-bundle: pass

The capability ledger's rows for the navbox surface are N1 ("Quick
(keyword) search from the navbox", status covered, checks: ["navbox Enter
submits keyword search", "navbox case variants find content-only
target"]); this run's coverage binding records N1 covered.

## The oracle

RUBY'S OWN SEARCH BOX IS THE FORM THE INSTRUMENT FILLS. The account of
the box is card-mod-search-0.20.0/set/self/search.rb: view :search_box
at :37 (haml template, cache :never), `search_form` at :56-58
(`form_tag path, method: "get", role: "search", class:
classy("search-box-form")`, the path being the *search card's own) and
`search_box_contents` at :60-66 (`text_field_tag "query[keyword]",
search_keyword, class: "_search-box #{classy 'search-box'} form-control
w-100", autocomplete: :off, data: { completepath: complete_path },
placeholder: ...`), with complete_path at :27-28 (`path mark: :search,
view: :search_box_complete, format: :json`). The template
card-mod-search-0.20.0/set/self/search/search_box.haml is two lines: the
`.d0-search-box` div wrapping `search_form { search_box_contents }`. The
box's live behavior (submit on Enter with no selected suggestion) is the
stock script's (search_box.js.coffee), which the instrument's own comment
names (checks-navbox.mjs:20-21).

RUBY'S OWN RESULTS SURFACE IS THE ONE THE BROWSER LANDS ON. The results
list is card-mod-search-0.20.0/set/abstract/0_search/views.rb: view
:card_list at :10-16 (`search_with_params.map { nest_item }` under
`with_results`), the empty answer at :18-20, and the html item wrap
`card_list_item` at :132-136: `<div class="search-result-item
item-<item_view>">`. The keyword route itself is Ruby's `results_path`
(set/self/search.rb:29-31: `path mark: :search, query: { keyword:
keyword }`).

THE PORT RENDERS THE SAME FORM AND THE SAME LIST. The search box is
src/card/render/navbar-views.ts:255-268: the port's own comment pins it
to card-mod-search set/self/search's :search_box ("search_box.haml
bytes", :255-256), and the bytes are the `form role="search" class=
"search-box-form" action="/*search" method="get"` carrying `<input type=
"text" name="query[keyword]" id="query_keyword" class="_search-box
search-box form-control w-100" autocomplete="off"
data-completepath="/*search/search_box_complete.json"
placeholder="Search">` (:265-267). The results item wrap is
src/card/render/views.ts:4697 (`<div class="search-result-item
item-${itemView}">`) with the link-item variant at
src/card/mod-loader/mods/card-mod-search.ts:653.

## What is oracle-matched and what is not, stated plainly

Oracle-matched: the form's role, class, action and GET method; the
keyword field's name (`query[keyword]`), classes, autocomplete and
data-completepath; the landing route (`/*search` with
`query[keyword]=<term>`); and the result item's
`search-result-item item-<view>` wrap, which is the element the leg reads
the result names from.

NOT oracle-matched, and stated rather than glossed over: the committed
capture set carries no arm of the search box itself (the capture probes
drive card views; the navbox is layout chrome), so this row's oracle for
the box is Ruby's own source, and the run's own page captures (below,
`navbox-search-0` and `navbox-search-1`, recorded by sha256) are the
instrument's record of the bytes the browser actually used. The needle
the leg searches for is content-only by construction (the card's name
carries none of it, `!canonical(name).includes(canonical(needle))` is
part of the verdict at :35), so the positive cannot be a name match; the
deck's own search class machinery behind `search_with_params` is graded
by the search rows of this family's other receipts, not re-derived here.

## The measurement at this tip

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/signed-in-exercise-round12-20261025/rows-r1/report.md

    source 26f4d6a4eccdebcc9994b01ff2924c9b6f6808e2, started
    2026-10-26T00:15:17.870Z, completed 2026-10-26T00:38:01.781Z,
    the source files clean
    verdict: PASS

The two named checks in this run, both case variants:

    navbox Enter submits keyword search
        {"actor":"admin","typedTerm":"navboxneedlemvoiwxtm","submittedTerm":"navboxneedlemvoiwxtm","status":200,
         "raw":{"capture":"246-navbox-search-0","htmlSha256":"fe5d9c261a1e1e10bc66b3ed0273662a44102fc7a281511fe4eba510066d234a"}}
        {"actor":"admin","typedTerm":"NAVBOXNEEDLEMVOIWXTM","submittedTerm":"NAVBOXNEEDLEMVOIWXTM","status":200,
         "raw":{"capture":"247-navbox-search-1","htmlSha256":"45abbcd77405580b74a3cb24d90e284892c7ece2e92d2cf2c8e76eb09174bdc8"}}
    navbox case variants find content-only target
        {"actor":"admin","typedTerm":"navboxneedlemvoiwxtm","target":"Harness_navbox_mvoiwxtm","resultNames":["Harness_navbox_mvoiwxtm"],"contentOnly":true}
        {"actor":"admin","typedTerm":"NAVBOXNEEDLEMVOIWXTM","target":"Harness_navbox_mvoiwxtm","resultNames":["Harness_navbox_mvoiwxtm"],"contentOnly":true}

The run as a whole graded 253 of 253 checks passed, 0 failed, 0 skipped by
write mode.

## What this receipt does NOT claim

- The row's port side is what the instrument grades, and it is green. This
  receipt does not claim anything about the live deployment: no live
  request was made by the lane, and nothing deploys.
- The row's DONE condition in the roster is not changed by this receipt;
  this receipt adds the family's own evidence for the row.
- The autocomplete menu (Ruby's search_box_complete JSON and its item
  views) is not claimed as exercised; the leg drives the field's own
  submit, and the completion endpoint is the CQL-navbox module's subject.
