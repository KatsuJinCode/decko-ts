# Gap batch 7, gap 3: the :edit_inline view at /Home/edit_inline and /Oracle_Basics/edit_inline

One of the gaps the enumeration audit named in its A1 table (the ten
original page views no roster row names): the `:edit_inline` view. The
audit's evidence (docs/runs/enumeration-audit-2026-10-25.md, the A1 row
`:edit_inline`; docs/runs/enumeration-audit-2026-10-25.gaps.json, the
element "the :edit_inline view") is two captured addresses:

> the capture records `/Home/edit_inline` and `/Oracle_Basics/edit_inline`

The capture is `fixtures/captured/edit-views.json` (the recorded oracle
run of `oracle-capture-edit-views.rb`), and it records the `edit_inline`
view for both targets - "Oracle Basics" (id 605) and "Home" (id 521) -
for each of the three actors the run walked (bot, tova, anonymous).

## What the port already carried

The view: `src/card/mod-loader/mods/card-mod-edit.ts`,
`set/all/edit_inline.rb:2-14` (`view :edit_inline, perms: :update,
unknown: true`, the inline editor surface with the name and type
formgroups hidden). Its bytes at the two captured marks were pinned
byte-for-byte by `tests/card/mod-loader/card-mod-edit-views.test.ts`.

What no proof covered: the ADDRESS. That proof renders ("Home",
"edit_inline") and ("Oracle Basics", "edit_inline") - the mark and the
view - and nothing tied the two paths the capture records to that pair.
The path is the address the original site answers; the port's own read
grammar (`worker.ts`'s `parsePath`, the function the deployed Worker
runs) is what turns one into the other.

## What this lane adds

`tests/card/mod-loader/card-mod-edit-inline-address.test.ts` (4 checks, 4
passed):

1. the capture records the audit's two addresses - each target's own id
   and name, and the `edit_inline` arm for each of the three actors the
   capture walked, and the address's own mark is the capture's card name;
2. the port's read grammar maps each address to the capture's mark and
   the `edit_inline` view: `parsePath("/Home/edit_inline")` and
   `parsePath("/Oracle_Basics/edit_inline")` both answer
   `{ name, view: "edit_inline" }`;
3. the port renders the capture's bytes at each address: the engine's
   answer at the pair the ADDRESS names equals the capture's recorded
   `edit_inline` bytes for the bot actor, byte for byte, under the
   capture's own normalizations;
4. the anonymous arm at each address is the captured denial
   (`<span class="denied"><!-- Sorry, you don't have permission (update) --></span>`),
   byte for byte - the view's `perms: :update` gate.

The deck is this file's own and small: the always-ok actor (the
`decko_bot` codename the auth seam matches), the `Cardtype` and
`RichText` cardtypes, and the two captured cards with the ids, the
contents and the current-revision ids the capture records.

## What this receipt does not claim

The `tova` (plain member) arm of the capture is not compared here: the
member's verdict on these two cards depends on the deck's own update
rules, which this file's small deck does not seed. The port's member arm
at both marks is pinned by the existing suite
(`tests/card/mod-loader/card-mod-edit-views.test.ts`, the plain-member
stand-in arm), which compares it against the same capture.

## State

CLOSED. The audit's two addresses answer: the port's grammar maps each
one to the capture's mark and the `edit_inline` view, and the engine's
answer at that pair is the capture's recorded bytes.
