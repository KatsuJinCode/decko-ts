# Gap batch six, GAP C: the :edit_inline view at the captured addresses

The enumeration audit (docs/runs/enumeration-audit-2026-10-25.md, part A1;
the machine artifact docs/runs/enumeration-audit-2026-10-25.gaps.json, the
capture-view gap "the :edit_inline view") named the view a gap: no roster
row named it, and nothing proved the port answers at the addresses the
original's own surface names.

## The gap, as the audit stated it

> the :edit_inline view
> source: fixtures/captured/edit-views.json
> evidence: the capture records / Home/edit_inline and /Oracle_Basics/edit_inline
> why_no_row: no roster row contains the token edit_inline

## The spec

The capture carries both addresses in the edit_row views (the row that
holds the inline edit link):

    fixtures/captured/edit-views.json
    targets.basic_note.views.bot.edit_row   href="/Oracle_Basics/edit_inline"
    targets.deck_level.views.bot.edit_row   href="/Home/edit_inline"

and it carries the BODY the original rendered at those addresses, for the
three fixture actors (bot = the signed-in administrator, tova = the signed-in
member, anonymous):

    targets.basic_note.views.<actor>.edit_inline
    targets.deck_level.views.<actor>.edit_inline

## What was already covered, and what was not

The repo's own tests/card/mod-loader/card-mod-edit-views.test.ts already
pins the edit_inline BODY for both targets and all three actors, byte for
byte, against this capture. It renders them by view name.

The ADDRESS is a separate question: the port's read grammar answers
GET /<name>/<view> by handing the view segment to the engine
(worker.ts:206-215), and whether the port answers at the two captured
addresses was open.

## The pin

tests/card/mod-loader/card-mod-edit-inline-address.test.ts

The deck is the suite's own (in-process SQLite, no network): the two
captured cards (Oracle Basics id 605, Home id 521), the cardtypes they are
typed by (RichText is cardtype 2, HTML is cardtype 39), the nested card
Home's content points at, the deck's own update rule (*all+*update grants
"Anyone Signed In", which is what lets the capture's MEMBER answer with the
form while the anonymous visitor is refused), and the actors.

| check | result |
|---|---|
| the capture's anchors name the addresses the suite renders | PASS |
| /Oracle_Basics/edit_inline answers the captured administrator bytes | PASS |
| /Home/edit_inline answers the captured administrator bytes | PASS |
| the member's answer at the same address is the captured member bytes | PASS |
| the anonymous answer at the same address is the captured denial | PASS |

    npx vitest run tests/card/mod-loader/card-mod-edit-inline-address.test.ts
    Test Files  1 passed (1)
    Tests  5 passed (5)

These are whole-response byte comparisons: the port's response at each
address is held against the capture's bytes for the same target and actor,
with the capture's normalizations applied to BOTH sides (data-slot-id,
data-card-id and the conflict tracker's value are seed state, not product
behaviour). The administrator's, the member's and the anonymous answers are
three different byte strings in the capture, and the port reproduces each
one at the address.

## What this does not claim

- It does not claim the inline edit surface's WRITE path: the suite renders
  the form the original rendered and compares bytes. Saving through it is
  the save-path family's own subject.
- It does not claim the other edit views (edit_in_form, edit_inline_buttons,
  edit_row): the audit's gap names the :edit_inline view, and the capture's
  edit_row is used here as the record of the address.
