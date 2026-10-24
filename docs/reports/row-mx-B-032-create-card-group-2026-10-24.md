# mx-B-032: the Opportunities dropdown and navbar add links are present

The roster row `mx-B-032-5-create-a-card-every-way-the-` (family [Family])
reads "the Opportunities dropdown and navbar add links are present", verdict
PASS, bucket DONE, with the evidence basis "verified - every instrument entry
for B-032 is pass (live-acceptance-lane+whole-harness)". This receipt is the
family's own adjudication of that row: the instrument the registry's own
ledger records for it, the Ruby oracle that pins the surfaces the instrument
touches, and a fresh measurement at this tip.

## What the row is

A signed-in deck's home page carries a dropdown menu: a block of links the
navbar opens under one of its items. In this deck the item is the pointer
card the "Opportunities" set holds, and its menu lists the deck's own cards
as links. The row's name also speaks of the navbar's add links; the
instrument reads them but does not grade them, and this receipt says so
below.

## The instrument

The harness's "5. create a card every way the site offers" group
(tools/edge-signed-in-exercise.mjs:983), the attempt "navbar and menu add
links" (:1000), the visit of the home page (:1002) and the menu read (:1003-
1006) collect every anchor inside a `.dropdown-menu` block. The record (:1007)
grades `items.length > 0`, and the evidence carries the item count and the
first five items.

The registry's own ledger for this row
(docs/registry/instrument-coverage-matrix.json, action "the Opportunities
dropdown and navbar add links are present", id ACT-032, check_ids ["B-032"])
records these instrument entries:

    - live-acceptance-lane, live-bundle, live-deployment: pass
    - whole-harness, headless-dom, native-local-bundle: pass

## The oracle

THE DROPDOWN IS RUBY'S OWN. Ruby's own navbar renders a pointer or list card
as a dropdown, and the dropdown's own markup is Ruby's:

    - card-mod-layout-0.20.0/set/abstract/items.rb:2-4, `view :nav_item do
      wrap_with_nav_item nav_dropdown end`;
    - card-mod-layout-0.20.0/set/abstract/list.rb:1-9, `include_set
      Abstract::Items` and `navbar_items view: :nav_item` nesting each item
      card with that view;
    - card-mod-layout-0.20.0/set/all/navbar_links.rb:36-43 `nav_dropdown`
      (the `li.nav-item.dropdown` wrapper with the toggle link and the menu),
      :45-48 `dropdown_toggle_link` (the `a.nav-link.dropdown-toggle` with
      `href="#"`), :50-52 `dropdown_menu` (`wrap_with :div,
      dropdown_menu_items, class: "dropdown-menu"`), :54-56
      `dropdown_menu_items` (`navbar_items view: :nav_link_in_dropdown`), and
      :32-34 `view :nav_link_in_dropdown` (`link_to_card card, render_title,
      class: "dropdown-item"`).

Ruby's own captured bytes for the menu's link are capture arm
probe-view:396:nav_link_in_dropdown@set/all/navbar_links.rb
(graded-identical, tools/compat-report/graded-probes.json:6402-6406):

    <a class="dropdown-item known-card" href="/Decko_Bot"><span class="card-title" title="Decko Bot">Decko Bot</span></a>

and for the nav item that carries it, capture arm
probe-view:395:nav_item@set/all/navbar_links.rb (graded-identical, :6393-6397):

    <li class="nav-item"><a class="nav-link known-card" href="/Decko_Bot"><span class="card-title" title="Decko Bot">Decko Bot</span></a></li>

The port renders both shapes: src/card/render/navbar-views.ts:172-180 (the
`:nav_link_in_dropdown` view, the `dropdown-item` class at :179), :182-189
(`nav_dropdown`, the `div.dropdown-menu` at :187) and :156-169 (the
`:nav_item` view, the `li.nav-item` wrapper at :44-45). The menu's own items
come from the pointer's own list (:206-215, `dropdownMenuItems`).

THE DECK'S OWN ITEM LIST IS THE DECK'S, not the port's. The card the menu
lists is the deck's own set card whose content names the cards in the menu;
the port reads that list and nests each name with the dropdown view
(navbar-views.ts:206-215, the list read at :217-223 and the nest at
:225-230). The deck's own content is the deck's own fact, and this receipt
does not claim it as oracle-matched.

WHAT IS ORACLE-MATCHED AND WHAT IS NOT, stated plainly. The dropdown's own
markup (the `li.nav-item.dropdown` wrapper, the toggle link with `href="#"`,
the `div.dropdown-menu` block and the `a.dropdown-item` menu links) is
Ruby's own, and the capture arms above are Ruby's own rendered bytes for the
same views. What is NOT capture-matched is the whole home page: there is no
recorded Ruby's-own capture of this deck's Opportunities menu, and the menu's
item list is the deck's own content. The live answer (the menu's presence and
its item count on the signed-in home page) is what this run measured.

## The measurement at this tip

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/signed-in-exercise-round8-20261024/rows-r2/report.md

    source 5421b7eb, started 2026-10-24T08:45:24.224Z, the source files clean
    verdict: PASS
    evidence: {"itemCount":14,"sample":[{"href":"/Make_Contact","text":"Make Contact"},{"href":"/Aikido_2","text":"Aikido 2"},{"href":"/Aikido_Oak_Cliff","text":"Aikido Oak Cliff"},{"href":"/Archetypal_Psychology","text":"Archetypal Psychology"}, ...]}

The signed-in home page served a dropdown menu with fourteen items, so the
check's own predicate (at least one menu item) held. The run as a whole
graded 253 of 253 checks passed, 0 failed.

A named-instrument probe of the same page, run in this lane against the same
deck copy on a local stack (tmp/probe-search-create.mjs, the stack booted by
the exercise's own helpers, the engine's own sign-in endpoint, 200 with 26,904
bytes on the home page), counted the menu's own anchors the same way and read
the same eleven first items, each an `a.dropdown-item` with a card title, so
the menu the check grades is the port's own navbar markup and not a stray
match elsewhere on the page.

## What this receipt does NOT claim

- The navbar's add links. The attempt reads the anchors whose href carries
  `/new/`, `/card/new` or `#` (:1001) and the home page's visit (:1002), but
  the record's predicate is the menu's item count alone (:1007). This receipt
  therefore claims the dropdown's presence and its item count, and does not
  claim that a navbar add link was graded.
- The row's port side is what the instrument grades, and it is green. This
  receipt does not claim anything about the live deployment: no live request
  was made by the lane, and nothing deploys.
- The page's byte-identity with a Ruby's-own home page. No capture of this
  deck's menu exists; what this receipt pins is the dropdown's own markup
  and Ruby's own menu-link bytes, plus the measured answer.
- The row's DONE condition in the roster is not changed by this receipt;
  this receipt adds the family's own evidence for the row.
