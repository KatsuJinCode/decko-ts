# Gap batch 7, gap 1: the :overlay_guide view at /*all+*read/overlay_guide

One of the gaps the enumeration audit named in its A1 table (the ten
original page views no roster row names): the `:overlay_guide` view. The
audit's evidence (docs/runs/enumeration-audit-2026-10-25.md, the A1 row
`:overlay_guide`; docs/runs/enumeration-audit-2026-10-25.gaps.json, the
element "the :overlay_guide view") is one captured anchor:

> the capture records the anchor `/ *all+*read/overlay_guide`

The capture is `fixtures/captured/rules-views.json`, and the anchor sits
inside the recorded `overlay_rule` view of the `*all+*read` rule card: the
rule overlay's help link points at the guide overlay of that same rule
card. The audit's finding is that no roster row named the view at all, so
nothing proved the surface answers at the address the anchor names.

## What the port already carried

The view itself: `src/card/mod-loader/mods/card-mod-edit.ts`,
`set/all/overlay_guide.rb:2-8` (`view :overlay_guide, cache: :never,
unknown: true`, the `overlay_guide.haml` body plus the slot wrap
`_overlay d0-card-overlay card nodblclick`), registered at
`card-mod-edit.ts:4707-4713`. The body was pinned for the two captured
targets by `tests/card/mod-loader/card-mod-edit-views.test.ts` (the
`:overlay_guide` arm of "Oracle Basics" and "Home", from
`fixtures/captured/edit-views.json`).

What no proof covered: the ADDRESS. The audit's address is a rule card's
address, `/*all+*read`, not one of the two captured content cards.

## What this lane adds

`tests/card/mod-loader/card-mod-edit-overlay-guide-address.test.ts` (3
checks, 3 passed):

1. the capture's own `overlay_rule` bytes carry the audit's anchor, read
   out of the capture at run time and pinned byte-for-byte - the href
   `/*all+*read/overlay_guide`, the help-link class, the overlay
   `data-slotter-mode`, the `data-slot-selector` (escaped, as the capture
   recorded it) and `data-remote="true"`;
2. the port's own `overlay_rule` render at `/*all+*read` carries that
   anchor (the href, the class, the overlay slotter mode, `data-remote`);
3. the port answers at the address: `render("*all+*read", "overlay_guide")`
   returns the `overlay_guide.haml` shape - the slot wrap with the
   `_overlay d0-card-overlay card nodblclick` classes, the close anchor
   with its exact attribute order (`data-bs-dismiss`, `class`, `href`
   last), and the guide text of the guide rule card the card's own set
   candidates resolve.

The deck is this file's own: the `*all` set, the `*read` and `*guide`
setting cards, the `*all+*read` rule card, the `*all+*guide` guide rule
card (Markdown-typed, so its `:core` nest goes through the markdown type),
the `*anyone` role card, and the actor card carrying the `decko_bot`
codename the auth seam matches.

## What this receipt does not claim

No capture records an `:overlay_guide` RESPONSE, so the response is
pinned as composition (the haml shape and the guide text) rather than as
bytes. The capture pins the anchor, and the anchor's href is the address
the port answers at. The `*all+*read` rule card's own cardtype in the
capture is `List` (`rules-views.json` `rule_card.meta`: `type_code
"list"`, `type_id 4`); this deck seeds the same junction RichText-typed,
which is the standing shape in the port's own rule-board address suite
(`tests/card/mod-loader/card-mod-rules-board-views-addresses.test.ts`) and
does not affect the guide lookup, which walks the card's set candidates.

## State

CLOSED. The audit's address answers: the port's rule overlay at
`/*all+*read` carries the captured help anchor, and the view at
`/*all+*read/overlay_guide` renders the overlay guide surface.
