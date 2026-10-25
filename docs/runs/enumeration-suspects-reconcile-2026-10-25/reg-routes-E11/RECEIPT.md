# reg-routes-E11

- Roster row: family `register-routes`, label `Vendor font assets
  (font-awesome, bootstrap fonts)`, verdict PORTED, bucket DONE.
- The row's sourceParent: `port-only route (no Ruby counterpart) -> Vendor
  font assets (font-awesome, bootstrap fonts) / edge + staging`.
- The row's blocker: verified, port-only surface: the register names the
  host(s) and the file:line in the port that serves it, so there is no Ruby
  behaviour it could fail to match.
- The register's own evidence for this row:
  `C:/localProjects/brandonDojoTech/docs/reports/decko-completeness-register-2026-10-18.md`,
  section E (port-only routes), the row `Vendor font assets (font-awesome,
  bootstrap fonts) | edge + staging | bunny-edge-engine-handler.ts:277-278;
  vm-staging-server.mjs:3874-3880` (line 779 of that document).

## Verdict: SOURCE EXISTS (outcome a). The citation is added below, with
## one correction to the row's "no Ruby counterpart" framing.

## The citation (at this tree, roll tip c17906db, branch port/suspects-20261025)

- `vm-staging-server.mjs:4394-4402`: the staging server's vendor asset arm.
  It builds a Request off the incoming URL and answers
  `serveFontAwesomeAsset(vendorRequest) ?? serveBootstrapFontAsset(vendorRequest)`
  (lines 4397-4398) before any other arm.
- `deploy/bunny-worker-src/bunny-edge-engine-handler.ts:300-301`: the edge
  engine's vendor asset arm, the same two functions in the same order.
- `src/server/font-awesome-assets.ts:9-30`: the font-awesome surface. The
  prefix is `FONT_AWESOME_ASSET_PREFIX` (`src/card/render/font-awesome.ts:1`,
  `/mod/bootstrap/fontawesome-6.7.2/`); non-read verbs get 405 with
  `allow: GET, HEAD` (line 13), unknown keys 404 (line 17), served bytes
  carry `cache-control: public, max-age=31536000, immutable` (line 20),
  `nosniff` (line 21) and an etag built from the payload's sha256 (line 22),
  honoured with a 304 (lines 26, via `src/server/conditional-asset-request.ts`).
- `src/server/bootstrap-font-assets.ts:15-36`: the bootstrap icon font
  surface, prefix `/mod/bootstrap/fonts/` (line 18), same 405 / 404 / etag
  posture, and the same immutable one-year cache (line 28). It first offers
  the request to the Material Icons surface (`serveMaterialIconsAsset`,
  lines 16-17, `src/server/material-icons-assets.ts`), which serves only
  under explicit deployment configuration.

The register's line numbers (handler 277-278, staging 3874-3880) are from
the 2026-10-18 register build. The same arms sit at 300-301 and 4394-4402
in this tree. The row's subject, the surfaces and the hosts, is unchanged.

## The original side, read and recorded

The row calls the surface port-only with no Ruby counterpart. The path and
the bootstrap font bytes DO exist on the original side; what is port-only
is the dedicated vendor-serving arm and its cache posture.

- The pinned gem `card-mod-bootstrap-0.20.0` carries the icon font bytes at
  `public/fonts/bootstrap-icons.woff2` and `public/fonts/bootstrap-icons.woff`.
- The same gem's own asset CSS,
  `card-mod-bootstrap-0.20.0/assets/style/bootstrap-icons.css:1-5`, declares
  `@font-face { src: url([[/mod/bootstrap/fonts/bootstrap-icons.woff2?24e3eb84d0bcaf83d77f904c78ac1f47]]) ... }`:
  the ORIGINAL site's own stylesheet names the exact `/mod/bootstrap/fonts/`
  path shape the port serves, delivered through the mod public-files surface
  (the gem's `public/` directory), not through a route in the pinned router.
  The gem's `assets/style/manifest.yml` lists `bootstrap-icons.css` in its
  `libraries` group; its `font_awesome.css` entry is commented out and its
  Material Icons entry pulls from the Google Fonts CDN (`remote:`), so the
  original side has no font-awesome bytes of its own to serve (the gem's
  fontawesome files live only under `vendor/bootswatch/docs/`, doc material,
  not a served surface).
- The pinned ROUTER's answer for the two probe paths is recorded in the
  committed oracle capture
  `fixtures/captured/port-only-routes-e6-e13-ruby-oracle.json`
  (`routerAnswers.E11`): both `/mod/bootstrap/fontawesome-6.7.2/css/all.min.css`
  and `/mod/bootstrap/fonts/bootstrap-icons.woff2` match the wildcard
  `/*mark(.:format)` with view `bad_address`. That is the router's answer
  when the static file layer has nothing at the path; the original
  deployment serves mod public files before the router ever sees them.

## The row's own instrument, executed at this tree

The row's measured instrument
(`tests/server/port-only-vendor-font-assets-parity.test.ts`, committed by
the tranche that landed the row, `5a8cd8b9`) is STALE at this tree:

    npx vitest run tests/server/port-only-vendor-font-assets-parity.test.ts
    Test Files  1 failed (1)
         Tests  1 failed | 6 passed (7)

The failing assertion (line 89) expects the bootstrap icon font's
`cache-control` to be `public, max-age=86400`; the source answers
`public, max-age=31536000, immutable`
(`src/server/bootstrap-font-assets.ts:28`). The posture change is the
source's own documented repair (commit `4feec7e5`, "Make the asset ETags
the edge publishes into validators it honors", which also routes the
surface through the conditional-asset seam; the file's header comment
records the measured cost of the old one-day cache, 285,648 bytes
re-downloaded daily for sha256-pinned bytes) and it postdates the
instrument's last edit (`5a8cd8b9`). The instrument, not the source, is
what moved out of date. It is not repaired here: the instrument belongs to
the row's own lane. Recorded so the fold's disposition sees it.

## The prior receipt for this row

`docs/reports/routes-tranche9-2026-10-22.md:68`, the routes tranche 9 row
table, entry `E11 vendor font assets`, commit `5a8cd8b9a`. Its "one-day
cache on the bootstrap icon font" sentence describes the tree at that
commit, not this one.
