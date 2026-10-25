# Gap batch six, GAP D: the *changed_card setting address

The enumeration audit (docs/runs/enumeration-audit-2026-10-25.md, part A2;
the machine artifact docs/runs/enumeration-audit-2026-10-25.gaps.json, the
capture-setting gap "the *changed_card setting address") named the address
a gap: no roster row named it, and nothing proved the port serves it.

## The gap, as the audit stated it

> the *changed_card setting address
> source: fixtures/captured/email-templates-raw-oracle.json
> evidence: the capture records / *changed_card and / *changed_card?view=history
> why_no_row: no roster row contains the token changed_card

## The spec

The capture is a MAIL capture. It holds the deck's own card row for the
changed card and the follower-notification mail's rendered content, and the
mail links to that card at TWO addresses:

    fixtures/captured/email-templates-raw-oracle.json
    the card row:  id 33822, name "*changed card", codename "changed_card"
    the mail bytes:
      <a class="known-card" href="/*changed_card"><span class="card-title" title="*changed card">*changed card</span></a>
      <a href="/*changed_card?view=history">

The capture holds no PAGE for those addresses (it is a mail capture). The
claim this suite makes is therefore the ADDRESS CONTRACT itself, and the
port's own read grammar is the spec for it: the url_key's underscores fold
back into spaces in the path segment (src/server/worker-shared-surface.ts's
decodeName, :110-117), and the read grammar answers GET /<name> with the
:open view and GET /<name>?view=<view> with that view (worker.ts:206-215,
and view_from_params at worker-shared-surface.ts:133-141).

So the two addresses mean:

    / *changed_card                the changed card's own page
    / *changed_card?view=history   the changed card's history view

## What was already covered, and what was not

The port's card-mod-email family already renders the capture's mail bytes
(the tools/compat-report grade lists the follower-notification email's
:content and :core views as identical against the oracle, and the port's
own source names the two addresses at src/card/render/views.ts:6667-6670).
So the mail, and the links it carries, were already graded.

What no row and no check covered was the ADDRESS itself: that the port
serves the card the mail links to, at both of the two addresses the mail
names.

## The pin

tests/card/mod-loader/card-mod-email-changed-card-address.test.ts

The deck is the suite's own (in-process SQLite, no network): the card the
capture names (name "*changed card", codename changed_card), the cardtype
it is typed by, and the actor.

| check | result |
|---|---|
| the capture records the card and the two addresses that name it | PASS |
| the port answers at / *changed_card with the card's own page | PASS |
| the port answers at / *changed_card?view=history with the history view | PASS |

    npx vitest run tests/card/mod-loader/card-mod-email-changed-card-address.test.ts
    Test Files  1 passed (1)
    Tests  3 passed (3)

The two address checks go through the port's own decoders, not through a
hand-written name: the suite takes the captured URL, decodes its path
segment with decodeName and its query with queryViewFromUrl, and then
renders what those decoders produced. The assertions hold that the answer
is the card's own page (the open view's slot wrapper, the card's name and
its link name) and the card's history view (the history view's slot
wrapper).

## What this does not claim

- It does not claim the mail's rendering: the mail is the compat grade's
  subject and is not re-pinned here. This suite pins the addresses that
  mail names.
- It does not claim the changed card's history CONTENT: the deck carries no
  actions for the card, so the history view's own body is empty here. The
  claim is that the address answers with the history view.
- It does not claim the card's own read permission behaviour for other
  viewers: the capture's anonymous mail bytes carry the denial at the
  history link (the port's own source names that denial at
  src/card/render/views.ts:6655-6660), and that rendering is the email
  family's own grade, not this suite's.
