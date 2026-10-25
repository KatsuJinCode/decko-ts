# Gap batch six, GAP B: the :modal_nest_rules view at the captured address

The enumeration audit (docs/runs/enumeration-audit-2026-10-25.md, part A1;
the machine artifact docs/runs/enumeration-audit-2026-10-25.gaps.json, the
capture-view gap "the :modal_nest_rules view") named the view a gap: no
roster row named it, and nothing proved the port answers at the address the
original's own surface names.

## The gap, as the audit stated it

> the :modal_nest_rules view
> source: fixtures/captured/rules-views.json
> evidence: the capture records the anchor / *all/modal_nest_rules
> why_no_row: no roster row contains the token modal_nest_rules

## The spec

The capture carries the anchor in the set card's template_link view:

    fixtures/captured/rules-views.json, set_card.views.template_link
    <a rel="nofollow" class="slotter" href="/*all/modal_nest_rules" data-remote="true">modal_nest_rules</a>

The rules-views capture records no modal_nest_rules BODY (it holds the rule
card's views and the set card's list views; the nest-rules modal is
neither). The body spec comes from the oracle's own recorded probe of the
same original surface:

    reference-harness/fixtures/synthetic-v2-mod-probes/expected/render.jsonl
    probe-view:453:modal_nest_rules@set/type/set/html_views/filtered_rule_lists.rb
    (the card "*all")

That file is the stock Ruby Decko oracle's own output (the fixture's
run-meta names the adapter "decko-ruby", decko 0.20.0, card 1.110.0), so
the bytes are the original's, not the port's.

## What was already covered, and what was not

The port's view table carries the view
(src/card/mod-loader/mods/card-mod-rules.ts's
set/type/set/html_views/filtered_rule_lists.rb registration at
card-mod-rules.ts:2678-2694 and its view list at :3013), and the repo's own
card-mod-rules-views suite pins the set card's list views byte for byte.
What nothing proved was the ADDRESS: the port's read grammar answers
GET /<name>/<view> by handing the view segment to the engine
(worker.ts:206-215), and whether the port answers at the captured address
was open.

## The pin

tests/card/mod-loader/card-mod-rules-modal-nest-rules-address.test.ts

The deck is the suite's own (in-process SQLite, no network): the *all set
card the capture names (its own set_card.meta: id 7, Set-typed) and the
setting cards the capture's setting_registry lists.

| check | result |
|---|---|
| the capture's anchor names the address the suite renders | PASS |
| the port answers at / *all/modal_nest_rules with the modal_nest_rules view | PASS |
| the modal's header is the original's own bytes | PASS |

    npx vitest run tests/card/mod-loader/card-mod-rules-modal-nest-rules-address.test.ts
    Test Files  1 passed (1)
    Tests  3 passed (3)

The third check is the strong one: the port's response at the address
STARTS WITH the oracle's recorded bytes, from the modal wrapper through the
filter form's opening tag. That block carries the modal's title ("Rules for
nest"), the modal menu's close and pop-out links (the pop-out href is the
captured address's own mark, / *all), and the filter form's action
(/ *all/quick_edit_setting_list). The block holds no card id and no slot
id, so it is the same for any deck.

## What this does not claim

- It does not claim the whole modal is byte-identical to the oracle's: the
  list body under the filter is the deck's own settings, and the oracle's
  recorded body carries the probe deck's list. The header block is what is
  held; the list body is the card-mod-rules-views suite's own subject.
- It does not claim the per-card form of the address (the original's
  /<card>+*self+*<setting>/modal_nest_rules family): the capture names one
  address for this view, and that address is the one pinned.
