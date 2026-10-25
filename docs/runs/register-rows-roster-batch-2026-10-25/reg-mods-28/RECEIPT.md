# reg-mods-28

- The pinned Ruby gem: `card-mod-search-0.20.0` (the pinned gem tree
  `C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems`).
- The row's own label: `card-mod-search (PARTIAL)`.
- The port file: `src/card/mod-loader/mods/card-mod-search.ts`.
- The declaration census at this tree: 29 gem set files, 23 gem view names
  and 0 gem event names. 24 set files and 11 view names have no port
  registration, and each of the 35 is named with its reason.

## Verdict: DONE

The register-row-28 lane (branch `port/regfix-3-20261025`) closed the gap:
the two request-term views are seated the way Ruby seats them. Ruby needs
no prepared seat at all - the REQUEST is the seat (term_param =
params[:term], search_params.rb:28-30, read AT VIEW TIME, ad-hoc CQL in
the view body, for any card the abstract set reaches). The port's
equivalent request carrier is the render's search params
(RenderEngine#renderSearch.term), and the per-card prepare
(RenderEngine#prepareRequestTerm, src/card/render.ts) runs the two
searches the views render, seating them for the one view being rendered:

- complete_search (0_search/views.rb:70-73): the card's own cql hash
  merged UNDER `{limit: 8 (AUTOCOMPLETE_LIMIT, 0_search.rb:4),
  sort_by: "name", return: "name", complete: term_param.to_s}`
  (cql_search.rb:70-74 standardized_query_args), through the same CQL
  engine, read-rule filter and live-verdict re-check every search walk
  rides.
- complete_or_match_search's match remainder for :name_match
  (views.rb:48-57): `{name_match: term_param, name: ["not in"] + names}`
  filling the slots the complete results leave, only for a present term.
- The card cql parses through parse_json_cql's shapes (cql_search.rb:29-38
  - the same BadQuery messages the search box prepare records); the view
  body raises them (Ruby's raise site).

The views are registered port-side (card-mod-search.ts, setPath
abstract/0_search/views, format json - the include graph reaches
Abstract::Search::Views on Type::SearchType, Type::Set and
Type::Cardtype, and a card outside those sets raises Ruby's
unsupported-view error, pinned live). The view bodies serve
format_json_search (views.rb:90-97): the :name item-view arm returns the
name strings, the default arm nests each item's json molecule through the
card's json subformat; Ruby's .to_json string is the answer verbatim.

## How this row was closed

- The row's fixture, now verdict DONE with no gap (the two request-term
  named skips dropped):
  `tests/card/mod-loader/fixtures/roster-batch-20261025/register-row-28-card-mod-search-oracle-surface.json`.
- The pin block, the closed form:
  `tests/card/mod-loader/register-rows-oracle-surface-roster-batch.test.ts`
  (row 28's block).
- The instrument, rewritten from pinning the absence to pinning the seat
  AND the live mechanism:
  `tests/card/mod-loader/register-row-28-card-mod-search-request-term-seat.test.ts`
  - the registrations, the engine seat facts, and four live renders:
    name_complete's prefix matches, name_match's match-literal semantics
    (Ruby's match_value escapes the WHOLE term as one literal regexp
    against cards.name, match_value.rb), the blank-term shape
    (complete: "" matches everything; the match half stays empty), and
    the include-graph reach (a Search-typed card renders; a basic card
    raises the unsupported-view error).
- The declarations census's named-absence table: the two request-term
  rows dropped (both now registered):
  `tests/card/mod-loader/card-mod-search-declarations.test.ts`.

## The battery at this commit

    ./node_modules/.bin/vitest run tests/card/mod-loader/register-row-28-card-mod-search-request-term-seat.test.ts tests/card/mod-loader/register-rows-oracle-surface-roster-batch.test.ts tests/card/mod-loader/register-rows-roster-batch-inventory.test.ts tests/card/mod-loader/card-mod-search-declarations.test.ts
      4 files passed, 57 tests passed.

    npx tsc --noEmit
      clean.

The full correctness gate (`node tools/test-gates.mjs run correctness`)
runs after this commit; see the lane's report for the run.

Branch: `port/regfix-3-20261025` in KatsuJinCode/decko-ts, from the
register-row-23 close on the roster-batch tip lineage.
