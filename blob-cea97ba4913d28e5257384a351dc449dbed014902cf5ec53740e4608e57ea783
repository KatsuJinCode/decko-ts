# Visual gate verdict: the faithful front door snapshot passes

Date: 2026-10-26. Gate per the ship order: the rebuilt snapshot next to the
site's real front page, both rendered in a hidden throwaway browser at
1280x900, judged side by side for "looks like the same site".

## The pictures

- `gate-side-by-side.png` - both pages in one image, this is the verdict surface
- `gate-snapshot-1280x900.png` - the new snapshot alone (local build of index.html)
- `gate-real-front-page-1280x900.png` - the real front page alone (https://culturesmith-edge.bunny.run/, the site's fixed edge copy of /, answered HTTP 200 this run)
- `gate-facts.json` - the measured facts quoted below
- `gate-round1/` - the first shoot, kept as the record of what the gate caught
- `gate-side-by-side.html` - the composite's own source

## The judgment: PASS, it looks like the same site

Side by side, the two pages carry the same site chrome and the same visual
system:

- Nav present and identical in structure: logo image, the Culturesmith brand,
  the Opportunities dropdown, Changes, the white search box, Sign up, Sign in,
  all on one dark row of the same height.
- Container width: 1140px on both (nav container and article).
- Typography: h2 32px / weight 500 / rgb(170, 170, 170) on both; body 16px on
  the same system-ui stack; the same grey body text and white links.
- Spacing: the navbar's paddings and item spacing read identically; the
  article column edges line up at the same x.
- Colors: background rgb(39, 43, 48) on both, navbar rgb(39, 43, 48) on both,
  body text rgb(170, 170, 170) on both, links rgb(255, 255, 255) on both.

The central content differs by design: the left page is the front door's demo
content, the right page is the production home page. That difference is the
point of the demo, not a fidelity gap.

## What the gate caught on the way to this pass

- Shoot 1 (kept in gate-round1/): the snapshot's navbar wrapped onto two rows
  (header 128px vs the site's 74px). Mechanism: the pinned compiled skin
  (vm-skin-compiled.css, the engine's own compile) predates the
  `.d0-nav-container` flex rule that the site's current compiled skin
  (files/45514/1790384218.css) carries. Fixed by appending that one rule.
- Shoot 2: the search box rendered at a third of the site's width. Same
  mechanism: the `.d0-search-box` / `.search-box-nav` / `.search-box-form`
  width rules are also newer than the pinned compile. A class-by-class scan
  of the page DOM against both skins found every remaining missing rule; the
  five chrome layout rules now appended are the complete set with a visible
  effect, and the scan's other findings are recorded as skipped in the build
  receipt (overlay-scoped, hover-only, form-scoped, or dependent on the
  stripped JavaScript).
- The site's current compiled skin was NOT embedded whole: it carries 16
  absolute references into culturesmith.com (jquery-ui images, icon fonts),
  which the ship guards forbid. The pinned engine bytes plus the five named
  rules render the chrome as the site does, with zero network fetches.

## Remaining differences, named

- The Opportunities menu closes identically on both pages, but the real
  page's menu holds two more items when opened (The Library, and the
  family-name card the ship guards require the snapshot to omit).
- The snapshot runs no JavaScript, so the dropdown and the search do not
  open on it. The judged surface is the still render at 1280x900.
