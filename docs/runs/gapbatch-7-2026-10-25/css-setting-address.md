# Gap batch 7, gap 4: the *css setting address

One of the gaps the enumeration audit named in its A2 table (the two
original setting addresses no roster row names): the `*css` setting
address. The audit's evidence
(docs/runs/enumeration-audit-2026-10-25.md, the A2 row `*css`;
docs/runs/enumeration-audit-2026-10-25.gaps.json, the element "the *css
setting address") is:

> the capture records the board's advanced tab linking to `/ *css/board`,
> and the `*css` address itself

The capture is
`fixtures/captured/sass-style-pages/oracle-main-slot-regions.json` (the
recorded main-slot region of the "customized classic skin" page), and it
carries the `*css` card's bar: the card row (id 198, name `*css`, type
`CSS` 17435) and the bar menu with its four links - the page link
(`/*css`), the modal link (`/*css?layout=modal`), the edit link
(`/*css/edit`) and the advanced link (`/*css/board`).

The audit's finding is that no roster row named the address at all: the
roster's only css rows are a URL format suffix, a format dispatch rule
and the `validate_css` event.

## What the port already carried

The bar view and its machinery
(`src/card/render/views.ts`, the `:bar` view fn and the bar_and_box set's
bar body and bar menu), and the CSS cardtype in the fresh deck's defaults
corpus (`src/card/auth/defaults-seed-corpus.ts`: the row named "CSS",
codename `css`).

What no proof covered: the ADDRESS. Nothing proved that the `*css` card
answers at `/*css`, and that the bar menu's advanced tab links to
`/*css/board`.

## What this lane adds

`tests/card/mod-loader/card-mod-css-setting-address.test.ts` (5 checks, 5
passed):

1. the capture's bar carries the four menu links, byte-for-byte, read out
   of the capture at run time - among them the advanced link to
   `/*css/board`, which is the audit's evidence, and the page link to
   `/*css`, the address itself;
2. the port renders the capture's bar body byte-for-byte at the `*css`
   card: the captured bar body (the bar div, its body row, its title and
   its menu) equals the port's own, under the capture's normalization
   (the slot id and the card id are RANDOMIZED in the capture);
3. the port's slot wrapper carries the capture's card identity and class
   - `Xcss-bar-view`, `card-slot bar-view ALL TYPE-css STAR SELF-Xcss`,
   the card id 198, the card name `*css`, the type id 17435, the type
   name `CSS`, the link name `*css` - and the slot JSON the two agree on
   (`view bar`, `show [bar]`, `hide [bar_middle]`);
4. the port's own read grammar answers the audit's addresses:
   `parsePath("/*css")` answers `{ name: "*css" }`,
   `parsePath("/*css/board")` answers `{ name: "*css", view: "board" }`,
   and `parsePath("/*css/edit")` answers `{ name: "*css", view: "edit" }`;
5. the port answers at the address: the `*css` card's page renders (the
   card's own title and its `open` slot), and the advanced tab's target
   (the `board` view at the same card) renders rather than raising.

The deck is this file's own and small: the always-ok actor (the
`decko_bot` codename the auth seam matches), the `Cardtype` and
`RichText` cardtypes, the CSS cardtype at the capture's own id 17435,
and the `*css` card at the capture's own id 198.

## What this receipt does not claim

The capture's slot JSON carries two keys the port's own root render does
not (`nest_name` and `home_view`: the capture rendered the bar as a list
item, a nest, and this file renders it as the view's root), and the
port's nest render adds a third (`nest_syntax`). The slot JSON's
view/show/hide keys - the ones that say what the slot renders - are
pinned; the nest-context keys are not, and the difference is recorded
here rather than papered over.

The `*css` card is not part of the port's fresh deck: the defaults
corpus seeds the CSS cardtype (the row named "CSS") but no `*css` card,
while the captured deck carries one (the card row
`fixtures/captured/email-templates-raw-oracle.json` records: id 198,
name `*css`, type_id 17435, with the CSS body text). This file seeds that
card with the capture's own ids, which is what the capture's bytes
require.

## State

CLOSED. The audit's address answers: the port renders the captured
`*css` bar byte-for-byte, the bar menu's advanced tab links to
`/*css/board`, and the port's grammar and engine answer at both
addresses.
