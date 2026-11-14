# mx-B-058: a CQL search runs and answers without an error page

The roster row `mx-B-058-7b-further-signed-in-capabilit` (surface "7b.
further signed-in capabilities") reads "a CQL search runs and answers
without an error page", verdict PASS, bucket DONE, with the evidence
basis "verified - every instrument entry for B-058 is pass
(live-acceptance-lane+whole-harness)". This receipt is the family's own
adjudication of that row: the named check that drives the legacy search
route with a CQL query, the Ruby oracle that pins the search card's
views, and a fresh measurement at this tip.

## What the row is

A CQL query (a search expression like `type="RichText"`) submitted to the
search route runs against the deck and the answer is a rendered search
page: the *search card's own slot, with no error view anywhere in it. The
row is the check that the query machinery answers a real query by
rendering results, not by rendering a failure.

## The instrument

"legacy search route renders the search card without an error page"
(tools/edge-signed-in-exercise/lib/search-page.mjs, wired into the whole
exercise at tools/edge-signed-in-exercise.mjs:924 and :1298): the journey
requires the disposable loopback fixture (:9), navigates the browser to
`/*search?query[query]=type="RichText"` (:10-11), and reads the rendered
surface (:12-19): `searchRoot` is true only when `#main` carries the
`.card-slot[data-card-name="*search"]` slot, and `errorViews` collects
every `.server_error-view, .not_found-view, .denial-view, .errors-view,
.error-view` element under `#main`. The record (:22) passes the
evidence through `searchPagePasses` (:4-5): status 200, searchRoot true,
and errorViews an empty array. The module's own header states the split
of labor: the separate cql-navbox instrument verifies query semantics
with positive and negative controls; this check verifies the legacy
route's page (:1-3).

The registry's own ledger for this row
(C:/localProjects/brandonDojoTech/docs/registry/instrument-coverage-matrix.json,
action "a CQL search runs and answers without an error page", id ACT-058,
check_ids ["B-058"]) records these instrument entries:

    - live-acceptance-lane, live-bundle, live-deployment: pass
    - whole-harness, http-verb, native-local-bundle: pass, with the
      whole-harness entry naming this very check: "check 'legacy search
      route renders the search card without an error page' PASS"

and its own note that "capability catalog row N2 (partial) is accounted
by this action". The capability ledger's row is N2 ("CQL search", status
partial, checks: ["legacy search route renders the search card without an
error page", "JSON CQL is submitted through the visible navbox and
Enter"]); this run's coverage binding records N2 partial, the same
standing scope the round-five through round-eleven runs read (the ledger
row's remainder is the navbox CQL submission half, which is the
cql-navbox module's subject).

## The oracle

RUBY'S OWN SEARCH VIEWS ARE PINNED BY ITS SOURCES, AND THE COMMITTED
CAPTURE RECORDS THEIR REFUSAL BEHAVIOR. The search card's views are
card-mod-search-0.20.0/set/abstract/0_search/views.rb: view :search_error
at :6-8 renders `#{search_with_params.class} :: #{search_with_params.message}
:: #{card.content}` (the error surface the check requires to be ABSENT),
view :card_list at :10-16 renders the results through `with_results`
(:22-24), the empty answer is view :no_search_results at :18-20 and, in
the html format, a `search-no-results` div (:126-128), and the html item
wrap is `card_list_item` at :132-136. The *search card's own CQL handling
is card-mod-search-0.20.0/set/self/search.rb: `cql_keyword?` at :22-24
(the `^\{.+\}$` CQL shape) and the keyword path at :29-31.

The committed render capture
(reference-harness/fixtures/synthetic-v2-mod-probes/expected/render.jsonl)
carries the search family's view arms, and their bytes are Ruby's own
answers: the card_list and no_search_results arms driven against a
non-search holder record Ruby's own refusal
(`probe-view:490`, `probe-view:493`: `<span class="render-error alert
alert-danger">view (card_list) not supported for Decko Bot</span>`), and
the search_error arm of set/self/search.rb (`probe-view:496`) records
Ruby's own search_error view crashing on a VALID result
(`undefined method 'message' for an instance of Array`): Ruby renders
error bytes only when the query itself failed. That is the behavior the
check encodes: a running search answers with the results surface, and an
error view on the page would mean the query machinery answered with a
failure.

THE PORT OWNS THE SAME SPLIT. src/card/mod-loader/mods/card-mod-search.ts
documents the view family at its header (:11-29, naming :card_list /
:no_search_results in src/card/render/views.ts and the search_error view
of set/abstract/0_search/views.rb:6-8), and its searchErrorView
(:573-603) reproduces Ruby's shape with the same boundary the capture
records: search_error bytes exist only for a failed search (the port's
comment names the same NoMethodError crash the capture arm records for a
warmed Array result, :596-603). The results item wrap is
src/card/render/views.ts:4697.

## What is oracle-matched and what is not, stated plainly

Oracle-matched: the route (`/*search`, the *search card's own path with
`query[query]` carrying the CQL); the answer being the *search card's
rendered slot (`card-slot[data-card-name="*search"]`); the results item
wrap (`search-result-item`, the same element shape the mx-B-057 receipt
cites); and the error boundary (error views render only for a failed
query, in Ruby's sources, in the committed capture and in the port's
view). The check's verdict is the absence of every error view class the
engines render, which is the row's own claim.

NOT oracle-matched, and stated rather than glossed over: the capture set
has no arm of a SUCCESSFUL CQL search page (the capture probes drive
single views against a fixed card, and the deck's probe holder was not a
search card), so the successful page's oracle is Ruby's own view sources
plus the port's disclosed views, and the run's own page capture
(below, `037-cql-search-page`, recorded by sha256) is the instrument's
record of the rendered answer. The query semantics (which cards a CQL
expression matches) are the cql-navbox module's subject and are not
re-derived here.

## The measurement at this tip

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/signed-in-exercise-round12-20261025/rows-r1/report.md

    source 26f4d6a4eccdebcc9994b01ff2924c9b6f6808e2, started
    2026-10-26T00:15:17.870Z, completed 2026-10-26T00:38:01.781Z,
    the source files clean
    verdict: PASS

The named check in this run:

    legacy search route renders the search card without an error page
        {"status":200,"searchRoot":true,"errorViews":[],"query":"type=\"RichText\"",
         "url":"https://127.0.0.1:61453/*search?query%5Bquery%5D=type%3D%22RichText%22",
         "raw":{"capture":"037-cql-search-page","htmlSha256":"b01f6d099d456a0bafb138d82e7cac3b4ab18e653c9df7791988c89d4ca07763"}}

The run as a whole graded 253 of 253 checks passed, 0 failed, 0 skipped by
write mode.

## What this receipt does NOT claim

- The row's port side is what the instrument grades, and it is green. This
  receipt does not claim anything about the live deployment: no live
  request was made by the lane, and nothing deploys.
- The row's DONE condition in the roster is not changed by this receipt;
  this receipt adds the family's own evidence for the row.
- CQL query semantics and the navbox CQL submission path are not claimed
  here; they are the cql-navbox module's own checks in the same run.
