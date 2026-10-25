# C2: create a Basic and a Date card through /new/<Type>

The roster row `C2` (group create, the [Family] capability family) reads
"Create a Basic and a Date card through /new/<Type>", sourced from
`journeys create-phrase-admin` and `cypress presetting`. It was `partial`,
with the recorded finding "Basic/Date form opening does not demonstrate
creating either card". This receipt is the family's own adjudication of that
row: the pinned Ruby's own bytes for the contract, the port's own bytes
beside them, and the named instrument that grades the row.

## What the row is

Opening a create form proves nothing about creating a card. The row is the
check that each typed route is driven to a card that EXISTS, of the type the
route asked for, and that the browser lands on that card.

## The oracle

THE TWO TYPES AND THE ROUTE ARE RUBY'S OWN, AND THE REPOSITORY CARRIES ITS
CAPTURED BYTES. The capture reads the pinned gemset and writes nothing but
its own fixture:

    GEM_PATH="C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0;C:/Ruby34-x64/lib/ruby/gems/3.4.0" \
      ruby tests/card/mod-loader/oracle-capture-new-card-types.rb

    wrote C:/localProjects/decko-ts-capability-round7-20261024/fixtures/captured/new-card-types.json

Five pinned files own the contract:

1. card-mod-format-0.20.0 set/type/basic.rb owns THE BASIC TYPE. The whole
   file is `def pod_type; nil; end`: the Basic card has no pod, and every
   one of its renders comes from the All::* sets.

2. card-mod-date-0.20.0 set/type/date.rb owns THE DATE TYPE. `input_type`
   is `:calendar`, and the `:core` view renders
   `::Date.parse(card.content).strftime "%B %-d, %Y"`.

3. card-mod-format-0.20.0 lib/card/path.rb owns THE ROUTE'S SHAPE:
   `new_cardtype` renders `"#{action}/#{mark}#{query}"`, so the typed
   new-card route is the same route for every type.

4. card-mod-edit-0.20.0 set/all/new.rb owns THE CREATE FORM. The `:new`
   view is gated on `perms: :create`, and `new_success` is
   `{ mark: card.rule(:thanks) || "_self" }` - the card itself when no
   thanks rule answers.

5. card-1.110.0 lib/card/env/success/target.rb owns THE TARGET. A name
   target is `Card.fetch @name.to_name.absolute(name_context), new:
   @new_args`.

The capture keeps the owners' bytes, their line ranges and their files'
SHA-256 digests in fixtures/captured/new-card-types.json. It carries no
timestamp, so a re-run is byte-stable.

## The port

The port carries the same contract in its own bytes:

- the format mod registers the Basic type as the file Ruby has
  (`setPath: "type/basic"`, and the module names set/type/basic.rb:1-3);
- the date mod registers the Date type (`setPath: "type/date"`), and the
  engine renders Ruby's own core view (`formatDateCore`, whose result is
  the strftime's month, day and year);
- the action engine resolves a type NAME to its own id
  (src/card/actions/type-resolution.ts).

tests/card/mod-loader/card-mod-new-card-types.test.ts (15 checks) pins all
of it: the captured Ruby's facts, the port's own bytes, and the row's credit
rule.

## The instrument

THE ROW'S OWN GAP IS LANDED, AND THE INSTRUMENT IS NAMED. The harness's own
create loop (tools/edge-signed-in-exercise.mjs, the "create a card every way
the site offers" group) now drives BOTH typed routes to a STORED card and
grades the LANDING with the same predicate the RichText create uses
(tools/edge-signed-in-exercise/lib/new-card-landing.mjs):

- the browser's path must be the card's own path (`/<name>`), OR
- the MAIN SLOT's own card id must be the created card's id in the deck.

The stored card's own TYPE is graded too. The route's mark names the type
the create must produce, and the deck's own mark resolution answers the
NAME first and the codename second: the card NAMED "basic" is the type the
/new/Basic route presets on this deck, while the codename "basic" names the
card this deck calls "RichText". The recorded full run's own evidence agrees
(docs/runs/edge-signed-in-exercise-full-run-2026-10-21-tranche5-signed-in-leg.md:
the /new/Basic create stored type 39120 and the /new/Date create stored
type 17, which are exactly the name-first answers). So "a Basic card" is
graded against the type the /new/Basic route itself prescribed, and a create
that stored the wrong type cannot pass.

The row declares its four checks, and the repo's own grader
(tools/edge-signed-in-exercise/lib/local-policy.mjs `verifiedCapabilities`)
credits the row only when ALL FOUR of them pass. The pin asserts that a
partial list is not credited and that a red leg is not credited.

## One named divergence, not this row's contract

Ruby's Date type owns `def input_type; :calendar; end`, and the port has no
input-type registry, so the Date card's EDIT form does not offer the
calendar widget. The port's own date module names that skip, the pin
asserts the name is still there, and the Date card's own `:core` view IS
carried. The create form of a Date card is not the Date card's edit form,
and this row does not claim the calendar input.

## What this receipt does NOT claim

- The Date card's edit form and its calendar input are not claimed here.
- The create's CONTENT is not graded by this row beyond the form's own
  shape.
- The harness's write mode can refuse a create, in which case the leg is
  recorded as a skip and never as a pass.
- The whole-family exercise at this round's tip is run once, and its
  committed record (docs/runs/edge-signed-in-exercise-round7-measured-2026-10-24.json)
  names this row among the rows it closes. This receipt does not restate
  that run's numbers; the round's own receipt does.
