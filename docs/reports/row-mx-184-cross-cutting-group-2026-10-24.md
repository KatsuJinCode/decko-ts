# mx-184: case-insensitivity guarantees across search, names, and slugs

The roster row `mx-184-cross-cutting-case-insensitivi` (family [Family])
reads "case-insensitivity guarantees across search, names, and slugs",
verdict PASS, bucket DONE, with the evidence basis "verified - every
instrument entry for this action is pass (whole-harness+registry-test)".
This receipt is the family's own adjudication of that row: the instruments
the registry's own ledger records for it, the Ruby oracle that pins the
name-keying algebra the instruments ride on, and fresh measurements at
this tip.

## What the row is

A person types card names in whatever case their hands produce. The row is
the guarantee that letter case never changes which card answers: the same
card at a lowercase address, the same card at its percent-encoded slug,
and the same card found by a search typed in any case.

## The instruments

Two committed browser probes grade this action's legs against the port's
own local engine on the fixture deck
(reference-harness/fixtures/synthetic-v1, the engine staging a private
copy so every write dies with the run).

The ranks91-100 window probe
(reference-harness/browser/probe-pageonly-ranks91-100.mjs) drives three
legs (its ACT-184 section, lines 546-584): a created card's page at the
all-lowercase slug answers 200 with the card's own token and shows no
create-name prompt (leg 1, graded at :565); the percent-encoded spaced
address round-trips to the same card (:569); the navbox keyword search
returns the card for both the lowercased and the uppercased query
(:576).

The batch5 cross-cutting probe
(reference-harness/browser/probe-pageonly-batch5-ordering-case-paging-roles-empty-error.mjs)
drives the same three legs independently (:297, :301, :308).

The registry's own ledger for this row
(docs/registry/instrument-coverage-matrix.json, action
"case-insensitivity guarantees across search, names, and slugs", id
ACT-184, check_ids []) records these instrument entries:

    - whole-harness, headless-dom, native-local-bundle: pass
    - registry-test, http-verb, code-suite: pass
    - whole-harness, headless-dom, ts-engine-local-bundle: pass (two
      entries, the pageonly-batch5 and the ranks91-100 re-grades)

## The oracle

THE KEY ALGEBRA IS RUBY'S OWN, AND THE PORT CARRIES THE SAME CHAIN,
FILE FOR FILE. Ruby's own name key folds a name with ActiveSupport's
underscore (activesupport 7.2.4 lib/active_support/inflector/methods.rb:99-107)
inside cardname's simple_key (cardname-0.20.0 lib/cardname.rb:107-118:
underscore, the not-ok-for-key fold, the split on underscores, stable_key
per piece, the join). The port's simpleKeyUncached
(src/card/name.ts:128-135) is the same chain in the same order, and its
underscore (src/card/name/inflect.ts:271-281) carries ActiveSupport's own
early-return guard and boundary rule, named in its own header comment as
the ActiveSupport method. The lookup the address rides on is the by-key
retrieval (src/card/fetch/retrieve.ts:293, `SELECT * FROM cards WHERE key
= ?`), the same column Ruby's own fetch queries. Case-insensitive
resolution is therefore not a special case the port added; it is Ruby's
own key identity, which folds case away before the row is ever matched.

The search legs ride the same identity: the keyword search answers from
the deck's own key-folded content, and the measured lower and upper
queries returned the same single card.

WHAT IS ORACLE-MATCHED AND WHAT IS NOT, stated plainly. The key chain and
the by-key lookup are Ruby's own, matched file for file and line for
line, and the digit-C boundary behavior that proves the two
implementations agree is measured in the mx-185 receipt's own oracle run.
The three legs' own predicates (status 200, the card's token on the page,
no create-name prompt, the same rows for either case) are the probes' own
named instruments. No Ruby-captured byte comparison is claimed for this
row: the registry's ledger entries for it are behavioral, and this
receipt matches them with behavioral measurements.

## The measurement at this tip

Two fresh runs, both exiting 0 with every leg green.

    node reference-harness/browser/probe-pageonly-ranks91-100.mjs \
      --out .runtime/exhaustive/round12-backslice/probe-ranks91-100-final

    source 9a2ed6e3 (the lane's own tip at run time), the source files
    clean, the engine pure-tip (sourceDiffSha256 e3b0c442..., distSha256
    07ff7a50...)
    ACT-184 a card's name resolves case-insensitively (lowercase URL shows
      the same card): GREEN {"name":"Harness Case R91 mvmztuap330",
      "controlStatus":200,"lowerStatus":200,"tokenFound":true,
      "visibleCreateNamePrompts":0}
    ACT-184 the slug round-trips (percent-encoded spaces resolve to the
      same card): GREEN {"spacedStatus":200,"tokenFound":true}
    ACT-184 keyword search matches regardless of the query's letter case:
      GREEN {"foundLower":true,"foundUpper":true}
    legs 22, failures 0

    node reference-harness/browser/probe-pageonly-batch5-ordering-case-\
      paging-roles-empty-error.mjs \
      --out .runtime/exhaustive/round12-backslice/probe-batch5

    source 71d4f686 (the family tip this lane starts from), the source
    files clean, distSha256 708a5f3d...
    ACT-184 a card's name resolves case-insensitively: GREEN
    ACT-184 the slug round-trips: GREEN
    ACT-184 keyword search matches regardless of the query's letter case:
      GREEN
    legs 11, failures 0

The same card answered at the lowercase and the percent-encoded
addresses, and the search returned it for either case of the query, on
both instruments, at both sources.

## What this receipt does NOT claim

- The row's port side is what the instruments grade, and it is green. This
  receipt does not claim anything about a live deployment: no live request
  was made by the lane, and nothing deploys.
- The row's DONE condition in the roster is not changed by this receipt;
  this receipt adds the family's own evidence for the row.
- The shouted (all-caps) spelling of a name whose final token ends in
  digit+C is NOT claimed to resolve to the same card, here or anywhere:
  Ruby's own key algebra separates those spellings too, and that
  behavior's own receipt is mx-185's.
