# Gap batch 7, gap 2: the :modal_nest_rules view at /*all/modal_nest_rules

One of the gaps the enumeration audit named in its A1 table (the ten
original page views no roster row names): the `:modal_nest_rules` view. The
audit's evidence (docs/runs/enumeration-audit-2026-10-25.md, the A1 row
`:modal_nest_rules`; docs/runs/enumeration-audit-2026-10-25.gaps.json, the
element "the :modal_nest_rules view") is one captured link:

> the capture records the anchor `/ *all/modal_nest_rules`

The capture is `fixtures/captured/rules-views.json`, and the link sits
inside the recorded `template_link` view of the `*all` set card: the set
card's own template link opens the rules-for-nest modal. The audit's
finding is that no roster row named the view at all, so nothing tied the
surface to the link that names it.

## What the port already carried

The view itself: `src/card/mod-loader/mods/card-mod-rules.ts`,
`set/type/set/html_views/filtered_rule_lists.rb:7-11` (`view
:modal_nest_rules, cache: :never, unknown: true`, the modal wrap titled
"Rules for nest" around the field-related filter form and the full
`quick_edit_setting_list` render), registered at `card-mod-rules.ts:3013`.
Its response bytes at `*all` were pinned byte-for-byte against the later
nest-views capture by
`tests/card/mod-loader/card-mod-rules-nest-oracle-pinned.test.ts`.

What no proof covered: the ADDRESS. Nothing proved the set card's own
`template_link` view carries the captured link, so the surface the link
names was never tied to the link.

## What this lane adds

`tests/card/mod-loader/card-mod-rules-modal-nest-rules-address.test.ts` (3
checks, 3 passed):

1. the capture's own `template_link` bytes carry the audit's link, read
   out of the capture at run time and pinned byte-for-byte - the whole
   anchor including its link text:
   `<a rel="nofollow" class="slotter" href="/*all/modal_nest_rules" data-remote="true">modal_nest_rules</a>`,
   and the capture's own card record (`set_card.meta.name` is `*all`);
2. the port's own `template_link` render at `*all` carries that link, byte
   for byte;
3. the port answers at the address: `render("*all", "modal_nest_rules")`
   equals the captured modal response byte-for-byte against
   `fixtures/captured/rules-nest-views.json` (`set_card.views
   .modal_nest_rules`), under the capture's own normalizations, with the
   capture's no-write proof asserted and the modal's own title ("Rules for
   nest") present so a comparison that passed on an empty response could
   not pass.

The deck is the one the nest-oracle byte pins pass under: the `*all` set
card, the 23 setting cards, the `*recent settings` card, the role cards,
and the `*all+*content_option_view` junction.

## What this receipt does not claim

The two captures are different runs of the same deck (the rules-views
capture on 2026-10-25, the nest-views capture on 2026-09-29); the
cross-capture consistency of the deck state is what the nest-oracle
suite's own cross-capture check holds (the `quick_edit_setting_list`
bytes agree between the two captures). This file compares the response
against the nest-views capture and the anchor against the rules-views
capture; it does not re-run the oracle.

## State

CLOSED. The audit's address answers: the set card's template link at
`*all` carries the captured link, and the view at
`/*all/modal_nest_rules` renders the captured modal response.
