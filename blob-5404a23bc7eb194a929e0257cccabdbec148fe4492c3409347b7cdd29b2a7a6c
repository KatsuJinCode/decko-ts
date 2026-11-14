# mx-B-024: typing a card name returns suggestions

The roster row `mx-B-024-4-edit-a-richtext-card-tinymce` (family [Family])
reads "typing a card name returns suggestions
(/*all+by name.json?view=name_match&term=...)", verdict PASS, bucket DONE,
and the registry's ledger records every instrument entry for B-024 as pass
(live-acceptance-lane and whole-harness). This receipt is the family's own
adjudication of that row: the instrument the registry's own ledger records
for it, the Ruby oracle that pins the surfaces the instrument touches, and a
fresh measurement at this tip.

## What the row is

Typing a card name into the nest editor's name field asks the deck for
suggestions: the `/*all+by name` search card's `name_match` view answers a
JSON array of card names that match the typed term. An endpoint that answers
nothing, or an answer that does not carry the term, is the failure this row
names.

## The instrument

The harness's "4. edit a RichText card (TinyMCE, nest dialog, link button)"
group (tools/edge-signed-in-exercise.mjs:781-807), the record "typing a card
name returns suggestions (/*all+by name.json?view=name_match&term=...)"
(:875). The body (:864-874) fills the visible nest dialog's `input._nest-name`
with "Home", flips the prefix toggle when the dialog carries one, then
fetches `/*all+by name.json?view=name_match&term=Home` from inside the
signed-in page, and grades `suggestions.status === 200 &&
suggestions.body.includes("Home")`.

The registry's own ledger for this row
(docs/registry/instrument-coverage-matrix.json, action "typing a card name
returns suggestions (/*all+by name.json?view=name_match&term=...)",
check_ids ["B-024"]) records these instrument entries:

    - live-acceptance-lane, live-bundle, live-deployment: pass
    - whole-harness, headless-dom, native-local-bundle: pass

## The oracle

The field that drives the suggestion request is Ruby's own nest editor
field, capture arm probe-view:551:nest_editor@set/all/reference_editor/
nest_editor.rb (graded-identical,
tools/compat-report/graded-probes.json:7181-7185):

    <input type="text" name="nest_name" id="nest_name" value="" class="form-control _nest-name _autocomplete " data-left-name="Decko Bot" data-left-type="RichText" data-options-card="*all+by name" />

The `data-options-card="*all+by name"` value is Ruby's own: it is
`%i[all by_name].to_name` (card-mod-search set/all/autocomplete.rb:31-34),
the codename-resolved junction the port resolves the same way
(src/card/mod-loader/mods/card-mod-list.ts:912-916,
`autocompleteOptionsCard`: `${all}+${byName}`), and the port renders the
field with it (src/card/mod-loader/mods/card-mod-tinymce_editor.ts:1520-1525).

The suggestion semantics are Ruby's own `complete_or_match_search`: up to
AUTOCOMPLETE_LIMIT (8) names, the ones starting with the term first, then
the ones containing it, each group by name. The port's host answers that
route with exactly that contract and cites it (vm-staging-server.mjs:2940-2961, the handler at :2953-2961
"the edge host's nameMatchResponse/matchingCardNames (deploy/bunny-worker-src/
bunny-edge-engine-handler.ts) ported to the loopback host's engine objects...
Ruby's complete_or_match_search"), and the deployed edge serves the same
bytes from the same contract (deploy/bunny-worker-src/
bunny-edge-engine-handler.ts:557-570 and :467). The name match itself is the
port's own CQL operator (src/cql/parser.ts:552 `name_match`, the
`nameMatchAttribute` body at :833-840, "the name-only half of `match`").

WHAT IS ORACLE-MATCHED AND WHAT IS NOT, stated plainly. The field's own
bytes and the `*all+by name` junction are Ruby's own and capture-matched
above, and the port renders the field and resolves the junction. The
suggestion query's contract (the eight names, prefix first, then contains,
each group by name) is the port's own port of Ruby's
`complete_or_match_search`, cited by the port. What is NOT capture-matched
is the live answer: the JSON array the instrument read back is what the run
measured, on this run's own deck.

The capture arm probe-view:517:name_match@set/abstract/0_search/views.rb is
graded-DIFFERS in the registry's own ledger
(tools/compat-report/graded-probes.json:7011-7015 and the diff line at :162),
and the receipts say so: on the capture deck's probe card BOTH sides answer
an error ("view (name_match) not supported for Decko Bot" from the oracle,
"the port has no view dispatch for format json (view name_match)" from the
port). That arm cannot show the suggestion contract; the field's bytes and
the port's own port of `complete_or_match_search` are what this receipt
pins.

## The measurement at this tip

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/signed-in-exercise-round6-20261024/rows-r1/report.md

    source 75fe7d99, started 2026-10-24T02:15:36.530Z
    verdict: PASS
    evidence: {"status":200,"body":"[\"Home\",\"Home 1\",\"Home Layout 1\",\"Home-Beginning\",\"HomeHTMLheader\",\"Homeless\",\"Homeowners_Insurance\",\"home-buttons\"]"}

The endpoint answered 200 with a JSON array of names that carries the typed
term, at most eight of them, which is the contract Ruby's
`complete_or_match_search` sets.

## What this receipt does NOT claim

- The row's port side is what the instrument grades, and it is green. This
  receipt does not claim anything about the live deployment: no live request
  was made by this lane.
- The card the journey opens is this run's own created RichText card
  (`Harness_richtext_mvlrp0g7`); the suggestions returned are this run's own
  deck's card names. The field's bytes and the query's contract are what the
  oracle pins.
- The row's DONE condition in the roster is not changed by this receipt;
  this receipt adds the family's own evidence for the row.
