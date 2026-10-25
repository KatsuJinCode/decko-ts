# Gap batch six, GAP A: the :overlay_guide view at the captured address

The enumeration audit (docs/runs/enumeration-audit-2026-10-25.md, part A1;
the machine artifact docs/runs/enumeration-audit-2026-10-25.gaps.json, the
capture-view gap "the :overlay_guide view") named the view a gap: no roster
row named it, and nothing proved the port answers at the address the
original's own surface names.

## The gap, as the audit stated it

> the :overlay_guide view
> source: fixtures/captured/rules-views.json
> evidence: the capture records the anchor / *all+*read/overlay_guide
> why_no_row: no roster row contains the token overlay_guide

## The spec

The audit's evidence is an ADDRESS, not a view body. The capture carries the
anchor in the rule card's own overlay_rule view:

    fixtures/captured/rules-views.json, rule_card.views.overlay_rule
    href="/*all+*read/overlay_guide"

The rules-views capture records no overlay_guide BODY (it holds the rule
card's views and the set card's list views; the guide overlay is neither).
The body spec comes from the second capture of the same original surface,
fixtures/captured/edit-views.json, whose targets carry the overlay_guide view
bytes the original rendered (oracle-capture-edit-views.rb, the same two
targets and three actors the repo's own card-mod-edit-views suite uses):

    targets.basic_note.views.bot.overlay_guide     the administrator's bytes
    targets.basic_note.views.tova.overlay_guide    the member's bytes

The two differ by exactly one thing: the guide rule card's EDIT LINK.
guide.rb:27-32 prepends it only when the guide card passes the update
verdict, so the administrator's answer carries it and the member's does not.

## What was already covered, and what was not

The view's BYTES were already byte-pinned: the repo's
tests/card/mod-loader/card-mod-edit-views.test.ts pins overlay_guide for
both targets and all three actors, byte for byte, against this capture.

What nothing proved was the ADDRESS. The port's own view table carries the
view (src/card/mod-loader/mods/card-mod-edit.ts's set/all/overlay_guide.rb
registration, the haml port at card-mod-edit.ts:3132-3153), and the port's
read grammar answers GET /<name>/<view> by handing the view segment to the
engine (worker.ts:206-215). Whether the port answers at the captured
address was open.

## The pin

tests/card/mod-loader/card-mod-edit-overlay-guide-address.test.ts

The deck is the suite's own (in-process SQLite, no network): the rule card
the anchor names (*all+*read), the guide surface the view reads (*guide, its
*all+*guide rule card with the captured guide content, the "*guide+*right"
set and its *update rule -> [[Administrator]], which reproduces the
original's administrator/member split), and the two actors.

| check | result |
|---|---|
| the capture's anchor names the address the suite renders | PASS |
| the port answers at / *all+*read/overlay_guide with the overlay_guide view | PASS |
| the administrator's answer carries the guide rule card's edit link | PASS |
| the member's answer is the same guide without the edit link | PASS |

    npx vitest run tests/card/mod-loader/card-mod-edit-overlay-guide-address.test.ts
    Test Files  1 passed (1)
    Tests  4 passed (4)

The guide text is held byte for byte against the capture: the assertion is
that the port's response CONTAINS the capture's own `<div class="guide-text">`
block, which carries the original's heading, its two paragraphs and the
known-card link to /*guide. The wrapper and the overlay's close link are
held as the original wrote them.

## What this does not claim

- It does not claim the whole overlay_guide response is byte-identical to
  the capture's: the capture's bytes belong to the capture's own card (the
  card identity in the slot wrapper), and the address under test is the
  rule card's. The guide CONTENT is the deck's guide card and is the same
  bytes on both sides; the card identity is the deck's own.
- It does not claim the anchor family beyond the captured address: the
  capture names one address for this view, and that address is the one
  pinned.
- It does not claim the member's answer is the anonymous one: the member
  leg is the capture's tova bytes, and the anonymous denial of the inline
  edit surface is the edit_inline gap's own capture (see
  edit-inline-address.md).
