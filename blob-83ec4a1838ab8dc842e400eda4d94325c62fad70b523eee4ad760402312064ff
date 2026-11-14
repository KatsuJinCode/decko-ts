# Two more front doors, the second pair

Two front-door directions built as real cards in the demo deck
(127.0.0.1:3118, the registered dev instance), through the engine's own write
path. Both are skins in decko's own mechanism: a Layout card holds the page
shell and the skin's stylesheet, and the per-card rule
`<door>+*self+*layout` seats the door on it, so each address below renders
the full page, the site's real navbar and footer included. Brief:
`tmp/fleet-standing-queue/briefs/frontdoor-directions-b.md` in
brandonDojoTech. Chosen for maximum credible contrast with the directions the
sibling lanes are building: the library-first cinematic wall, the editorial
cover page, and the storefront's rich sections with the ambient video hero.
Neither of these two carries imagery at all, one by design and one for lack
of assets, noted per direction.

## Direction 1: Product grid

Live in the deck at /Culturesmith%2BProduct%20Grid%20Door. Render:
product-grid.png (1440x900 viewport, full page, headless Chromium with a
throwaway profile). Forced-dark check: forced-dark-product-grid.png.

One honest paragraph. A one-screen catalog of the four product lines: the
Library, Conflict Done Well training, Certification, Guardians of Peace, each
a self-contained tile with its own accent color, the engine's own icon mark,
a one-line pitch and exactly one door, under the deck's own framing line
about conflict. It sells to the visitor who already wants something and only
needs to pick a world: the returning student, the organization shopping for
training, the certification seeker, all served in the five seconds the brief
asks for. The cost is content, not machinery: four pitches and four doors
that must stay true as the products move, read perhaps once a quarter, and
the tile that lies (a stale pitch or a dead door) is the one a visitor
remembers. The build cost is the lowest of any direction here: two cards per
tile of plain HTML in the deck, no media pipeline, no video, no new assets.

Placeholders, noted: the tile marks are the engine's Material Icons glyphs,
not photography, because the deck holds no product imagery yet; the
Guardians of Peace card exists in the deck and is empty, so its door opens a
page held ready for the proposal text rather than a finished page.

## Direction 2: Three doors, almost nothing

Live in the deck at /Culturesmith%2BThree%20Doors. Render: three-doors.png
(1440x900 viewport, full page, same throwaway headless browser).
Forced-dark check: forced-dark-three-doors.png.

One honest paragraph. The radical minimum: the live page's own three ways to
be here, Guest, Member and Student, as three huge calm cards, practice,
team and library, one sentence each, on an otherwise empty warm-white page
under the site's real chrome. Serif display type, no imagery, no sections,
nothing to maintain but three sentences; it sells to the uncertain
first-time visitor by refusing to sell, and the confidence of the emptiness
is the pitch. The cost runs the other way from direction 1: content is
nearly free (three stable sentences; the roles rarely change), and the
maintenance is the lowest of any direction in the set, but it sells nothing
directly. No product, no proof, no pitch appears on the page, so the
persuasion happens one click deeper, on pages this door only points at, and
a search engine sees almost no text to rank.

Placeholders, noted: none. The direction needs no assets, and all three
doors point at real places: the deck's Make Contact card, the deck's
Conflict Done Well card, and the working library.

## What is real here, and what was not done

- Both pages are the engine's own render: the door cards, their tile and
  door child cards, the two Layout cards and the two seating rules were all
  written with the same POST and PUT calls the signed-in editor uses, and
  read back and verified (build-receipt.json, 17 of 17 checks passed).
- The site's real chrome and names are untouched: both skins keep the deck's
  own navbar and footer nests. The deck-wide CSS card was never edited; each
  skin's selectors are scoped to its own classes.
- The landing card Home was not touched: other front-door lanes build in
  this same deck and Home is shared. Seating a picked direction on Home is
  one PUT of Home's content, deliberately left for the decision.
- The renders are local only. Nothing was published; culturesmith.com was
  never contacted.
- The render harness maps the deck's production CDN asset name to the
  staging server's own /files/~<card> route, which serves the same deck
  assets on this machine; the deck's historical image attachments are not in
  the local copy, so the navbar logo shows its alt text in the renders. That
  is the local deck's own state, not a defect of either direction.
- Receipts: build-receipt.json (card writes and read-backs),
  render-receipt.json (the browser, viewport and page status per shot).
  Rebuild with scripts/frontdoor-directions-b/build-directions-b.mjs, then
  scripts/frontdoor-directions-b/render-directions-b.mjs.
