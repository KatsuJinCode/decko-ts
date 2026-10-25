# C1: create a RichText card through /new/RichText and land on it

The roster row `C1` (group create, the [Family] capability family) reads
"Create a RichText card through /new/RichText and land on it", sourced from
`journeys create-note-member`. It was `partial`, with the recorded finding
"Create succeeds and later visit exists, but reported landing is not part of
predicate". This receipt is the family's own adjudication of that row: the
pinned Ruby's own bytes for the contract, the port's own bytes beside them,
and the named instrument that grades the row.

## What the row is

Creating a card is two things: the write, and where the browser ends up
afterwards. The row is the check that the typed route opens the create form,
that the create is stored, and that the browser lands on the card that was
just made.

## The oracle

THE ROUTE AND THE LANDING ARE RUBY'S OWN, AND THE REPOSITORY CARRIES ITS
CAPTURED BYTES. The capture reads the pinned gemset and writes nothing but
its own fixture:

    GEM_PATH="C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0;C:/Ruby34-x64/lib/ruby/gems/3.4.0" \
      ruby tests/card/mod-loader/oracle-capture-new-card-landing.rb

    wrote C:/localProjects/decko-ts-capability-round7-20261024/fixtures/captured/new-card-landing.json

Four pinned files own the contract:

1. card-1.110.0 lib/card/fetch/card_class.rb owns THE TYPED ROUTE. The
   `/new/:type` shortcut is `opts[:type] ||= params[:type] if params[:type]`,
   and the card's own name comes from the mark:
   `opts[:name] ||= Name[params[:mark]]&.tr "_", " "`.

2. card-mod-format-0.20.0 lib/card/path.rb owns THE ROUTE'S SHAPE:
   `new_cardtype` renders `"#{action}/#{mark}#{query}"`, guarded by
   `return unless action.in?(%i[new type]) && mark.present?`.

3. card-mod-edit-0.20.0 set/all/new.rb owns THE CREATE FORM. The `:new`
   view is gated on `perms: :create`; `framed_create_form` merges
   `form_opts.reverse_merge! success: new_success` into the form's options;
   `new_form_opts` is the form's own `{ "data-main-success": JSON(redirect:
   true) }`; and `new_success` is `{ mark: card.rule(:thanks) || "_self" }`
   - the card itself when no thanks rule answers.

4. card-1.110.0 lib/card/env/success/target.rb owns THE TARGET. A name
   target is `Card.fetch @name.to_name.absolute(name_context), new:
   @new_args`, while "*previous" and a URL are their own answers.

The capture keeps the owners' bytes, their line ranges and their files'
SHA-256 digests in fixtures/captured/new-card-landing.json. It carries no
timestamp, so a re-run is byte-stable.

## The port

The port carries the same contract in its own bytes:

- src/card/mod-loader/mods/card-mod-edit.ts: the new-card view posts the
  success mark the card itself (`hiddenFieldTag("success[mark]",
  newSuccessMark(ctx))`, and `newSuccessMark`'s fallback is the literal
  `"_self"`), and the create form posts to `/card/create` with the form's
  own `data-main-success`.
- src/server/write-routes.ts: the typed shortcut
  (`{ verb: "create", typeShortcut: markToName(typed[1]) }`).

tests/card/mod-loader/card-mod-new-card-landing.test.ts (15 checks) pins all
of it: the captured Ruby's facts, the port's own bytes, and the row's credit
rule.

## The instrument

THE ROW'S OWN GAP IS LANDED, AND THE INSTRUMENT IS NAMED. The harness's own
RichText journey (tools/edge-signed-in-exercise.mjs) creates the card and
now grades the LANDING with the same predicate the Basic and Date creates
use (tools/edge-signed-in-exercise/lib/new-card-landing.mjs):

- the browser's path must be the card's own path (`/<name>`), OR
- the MAIN SLOT's own card id must be the created card's id in the deck.

The second leg exists because a deck whose Home card is configured also
serves that card at "/", so the path alone cannot answer the landing. The id
it compares against is the created card's own row in the deck, never a
constant. So a create that stayed on the form cannot pass the leg.

The row declares that one check, and the repo's own grader
(tools/edge-signed-in-exercise/lib/local-policy.mjs `verifiedCapabilities`)
credits the row only when it passes. The pin asserts that a red check and a
missing result are not credited.

## What this receipt does NOT claim

- The RichText EDITOR journey (the TinyMCE legs) is the E-series rows'
  contract and is not claimed here.
- The create's CONTENT is not graded by this row beyond the form's own
  shape.
- The harness's write mode can refuse the create, in which case the leg is
  recorded as a skip and never as a pass.
- The whole-family exercise at this round's tip is run once, and its
  committed record (docs/runs/edge-signed-in-exercise-round7-measured-2026-10-24.json)
  names this row among the rows it closes. This receipt does not restate
  that run's numbers; the round's own receipt does.
