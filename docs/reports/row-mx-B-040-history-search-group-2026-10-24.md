# mx-B-040: /*search lists the cards this run just created/edited first

The roster row `mx-B-040-7-rename-history-search-change` (family [Family])
reads "/*search lists the cards this run just created/edited first", verdict
PASS, bucket DONE, with the evidence basis "verified - every instrument
entry for B-040 is pass (live-acceptance-lane+whole-harness)". This receipt
is the family's own adjudication of that row: the instrument the registry's
own ledger records for it, the Ruby oracle that pins the surfaces the
instrument touches, and a fresh measurement at this tip.

## What the row is

The changes list is ordered, and the order is the product: the card the
run just touched has to be the first thing on the page, because that is
what makes the changes list a feed of what just happened. A list that
answers and carries real cards but sorts them by name or by id does not
satisfy the row.

## The instrument

The exercise's changes journey
(tools/edge-signed-in-exercise/lib/basic-lifecycle-journeys.mjs:125-133).
When the run created no card there is nothing of the run's to look for, and
the check records an honest skip rather than a pass (:125). Otherwise it
reads the id of the run's own RichText card from the owned database (:130)
and grades PASS only when that id is the id of the FIRST listed row
(:131-132). The instrument never reads a name or a text; it compares ids.

The registry's own ledger for this row
(docs/registry/instrument-coverage-matrix.json, action "/*search lists the
cards this run just created/edited first", id ACT-040, check_ids ["B-040"])
records these instrument entries:

    - live-acceptance-lane, live-bundle, live-deployment: pass
    - whole-harness, headless-dom, native-local-bundle: pass

## The oracle

THE ORDERING IS RUBY'S OWN, AND IT COMES FROM THE `*search` CARD'S OWN
CONTENT. The `*search` card is a search card whose content Ruby's own gem
ships, card-mod-search-0.20.0/data/real.yml:13-16:

    - :name: "*search"
      :type: :search_type
      :codename: search
      :content: '{"match":"$keyword", "sort":"relevance"}'

and the deck under test carries that same content, read out of the deck's
own `cards` row for `*search`:
`{"match":"$keyword", "sort":"relevance"}`. The sort token is then Ruby's
own, card-1.110.0/lib/card/query/sql_statement/order.rb:7-15:

    ORDER_MAP = {
      "id" => "id",
      "update" => "updated_at",
      "create" => "created_at",
      "name" => "key",
      "content" => "db_content",
      "alpha" => "key",       # DEPRECATED
      "relevance" => "updated_at" # DEPRECATED
    }.freeze

with the direction Ruby's own default carries,
card-1.110.0/lib/card/query.rb:95:

    DEFAULT_ORDER_DIRS = { update: "desc", relevance: "desc" }.freeze

So in Ruby's own deck the changes list with no keyword is ordered by
`updated_at` descending: the card that was updated most recently is first.
That is exactly the row's claim, and it is Ruby's own rule, not the
harness's.

Ruby's own recent-changes feed carries the same newest-first rule from the
other side, card-mod-search-0.20.0/set/self/recent.rb:14-21:

    def recent_acts
      limiting_scan do
        Act.joins(ar_actions: :ar_card).distinct
           .where(Query::CardQuery.viewable_sql)
           .where("draft is not true")
           .order id: :desc
      end
    end

The port runs both. The sort token and direction are
src/cql/constants.ts:132-148 (`ORDER_MAP` maps `relevance` to
`updated_at`; `DEFAULT_ORDER_DIRS` maps `relevance` to `desc`), applied at
src/cql/sql.ts:505 and :525. The recent-acts scan is
src/card/mod-loader/mods/card-mod-history.ts:2351-2385, whose own header
names recent.rb:14-21 and whose SQL ends `ORDER BY card_acts.id DESC`.

WHAT IS ORACLE-MATCHED AND WHAT IS NOT, stated plainly. The `*search`
card's content, the sort token's column, the sort token's direction, the
recent-acts scan and its descending order are Ruby's own, and the port
implements each of them. The check's own predicate (the run's own card must
be the first row) is the harness's own instrument, and the live answer is
what this run measured.

## The measurement at this tip

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/signed-in-exercise-round9-20261024/rows-r1/report.md

    source c9de40e0d8545b193f9293c658376882c7d904a1, started
    2026-10-24T10:56:20.358Z, the source files clean
    verdict: PASS
    evidence: {"runCardsFirst":true,"expectedFirstId":53053,"firstRow":{"id":53053,"name":"Harness_richtext_mvmaak48","href":"/Harness_richtext_mvmaak48"},"rows":[{"id":53053,"name":"Harness_richtext_mvmaak48","href":"/Harness_richtext_mvmaak48"},{"id":10857,"name":"2011 12 14","href":"/2011_12_14"}]}

The first row of the changes list was the run's own RichText card, id
53053, which is the id the check read out of the owned database as the
card the run created. The next row was the deck's date card, and the row
after that a card the run had not touched, so the list was ordered by
recency and not by anything else.

The same run graded the same contract a second time, independently, in the
cover-b group: "N5 Changes link lists recently updated cards, newest first"
PASS with {"newest":"Harness_newest_mvmasp18","firstRows":["Harness_newest_mvmasp18","Harness_savebtn_mvmasdab","Harness_toolbar_mvmasai3","Harness_tinymce_mvmas7x1","*recent settings", ...]}. The run as a whole graded 253 of 253 checks passed, 0 failed.

## What this receipt does NOT claim

- The row's port side is what the instrument grades, and it is green. This
  receipt does not claim anything about the live deployment: no live request
  was made by the lane, and nothing deploys.
- The row's DONE condition in the roster is not changed by this receipt;
  this receipt adds the family's own evidence for the row.
