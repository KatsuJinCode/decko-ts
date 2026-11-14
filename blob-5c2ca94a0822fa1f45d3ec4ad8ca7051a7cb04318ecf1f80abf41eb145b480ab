# Better home pages: the first two design variants

Built 2026-10-26 in the demo scratch deck (127.0.0.1:3118), rendered in a hidden
throwaway browser at 1440x900, full page. Both variants are real decko pages:
every element is a card written through the engine's own write path, each variant
seats its own Layout card and per-card layout rule, and the skin (the deck's
compiled stylesheet from the local /files route, the chrome layout rules the
pinned compile predates, the navbar logo bytes, and the variant CSS) rides in the
layout card. The reference is the live Home page as captured on 2026-10-25
(`reference-live-home-signed-in.png`; its 1280x900 signed-out twin is
`gate-real-front-page-1280x900.png` in the faithful-lane folder).

## Variant A: the same site, sharper

`variant-a-1440x900-fullpage.png`, page `Culturesmith+Home Variant A`

Keeps the live page's exact structure and content - navbar, centered hero photo,
intro, italic proposals line with Make Contact, subscribe and Zoom classes line,
centered Meet Brandon Williamscraig with Recommendations and Learn more - and
changes only how it is made: a measured 46rem reading column with real line
height instead of full-width bold paragraphs, one short gold rule opening each
section instead of three full-width grey rules, emphasis carried by a single
strong phrase ("Conflict Done Well") instead of all-bold text, a quieter and
consistent link color with underline offset, and a lifted, rounded hero photo.
Someone who knows the live site sees the same page immediately; everything that
felt heavy there (the wall of bold, the hard rules, the dead spacing) is lighter.
Content source: the live page's own cards in this deck (HomeHTMLheader), so the
words are the site's words.

## Variant B: the decko-native home

`variant-b-1440x900-fullpage.png`, page `Culturesmith+Home Variant B`

The same content recomposed as a card composition the way decko renders: the
hero is a full-width surface card (the Conflict Done Well phrase as display
line over the live photo), the intro is its own card, the three doors -
Practice, Team, Library - are three cards in one grid row, the proposals line
is a call-to-action card with Make Contact as a pill button, and the connect
line and the meet-brandon block close the page as quiet centered cards. Every
element on the page is a real card (eight content cards under the variant
card), styled by the variant's skin through the slot wrappers' data-card-name
attributes. It reads like a modern product home page while every door links to
a real thing in this deck or the working library, the way the front door
build's links do.

## What is shared, and what is local

Both variants load the deck's compiled stylesheet (219,593 bytes,
sha256-pinned, served locally from `/files/~45514/0000000001.css`) plus the
five chrome layout rules the pinned compile predates, copied verbatim from the
faithful build receipt of 2026-10-26; without them the navbar wraps. The
navbar logo and the hero photo are the site's own bytes: the logo verified
against the faithful receipt's pinned hash, the hero (files/27689/135167-large.jpg,
500x334) fetched once from the site's public asset host under the same
precedent, hashes in the build receipt. The variants' CSS hides the one
Opportunities menu item that carries a family surname, following the faithful
build's rule. Nothing was published anywhere: this lane lands local renders
only, and the deck's standing pages (the landing page with the front door, the
class page) are untouched.

## Receipts

- `home-variants-build-receipt.json` - 23 of 23 checks: every card written and
  read back signed in, both pages render signed out with all markers, guards
  (English only, no em-dashes or en-dashes, no operator surname) over every
  written byte.
- `render-facts.json` - computed styles and image facts from the render run.
- `side-by-side.html` / `side-by-side.png` - the two variants beside the
  reference.
