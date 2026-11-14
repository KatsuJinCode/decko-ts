# Provenance of the demo static assets

This directory holds the pre-built `[assets]` directory the one-click
Cloudflare deploy uploads
(`scripts/deploy/one-click-deck/one-click-deck.mjs`, step 7). The assets
layer serves these files before the Worker runs, so an asset request costs
zero D1 reads and zero writes.

Two of the files here are **compiled concatenations of many sources**, and
neither is first-party code end to end. Each carries third-party components
under permissive licenses whose terms require the notice to travel with the
bytes — which a concatenation destroys. This file is that notice.

| File | What it is | First-party? |
| --- | --- | --- |
| `all-script.js` | Uglifier-compiled concatenation of the deck's script assets (see the inventory below) | Mixed |
| `all-style.css` | SassC-compiled deck stylesheet (Bootstrap 5.1.3 + Bootswatch theme + the Decko mods' own Sass) | Mixed |
| `decko-config.js` | The deck's runtime configuration script | Yes |
| `robots.txt` | Crawler policy for the demo deployment | Yes |

## `all-script.js` — what it is built from

The bundle is the concatenation of `fixtures/vendor/mod-script-assets/`, in
the order the manifest records it, and each section is preceded by a comment
naming its source file. Reading those section markers gives the exact
inventory. Roughly two thirds of the sections are Decko's own `.coffee`
assets (ported from `card-mod-*` gems and covered by this project's
GPL-3.0-or-later terms). The third-party sections are:

| Vendored source (the section marker in `all-script.js`) | Component | License | Full text ships at |
| --- | --- | --- | --- |
| `jquery-ui.min.js` | jQuery UI 1.12.1 | MIT | `fixtures/vendor/mod-script-assets/card-mod-format/assets/script/jquery/LICENSE.txt` |
| `jquery.autosize.js` | Autosize 1.18.13 | MIT | same file as above |
| `jquery.fileupload.js` | jQuery File Upload Plugin | MIT | `fixtures/vendor/mod-script-assets/card-mod-format/vendor/jquery_file_upload/LICENSE.txt` |
| `jquery.iframe-transport.js` | jQuery File Upload (iframe transport) | MIT | same file as above |
| `bootstrap.bundle.js` | Bootstrap 5.1.3 (JS) | MIT | `fixtures/vendor/mod-script-assets/card-mod-bootstrap/vendor/bootstrap/LICENSE.txt` |
| `bootstrap-colorpicker.min.js` | Bootstrap Colorpicker 2.5.2 | Apache-2.0 | `fixtures/vendor/mod-script-assets/card-mod-bootstrap/vendor/bootstrap-colorpicker/LICENSE.txt` |
| `script_tinymce.js` | TinyMCE 5.10.7 | **LGPL-2.1** (or Tiny commercial) | `fixtures/vendor/mod-script-assets/card-mod-tinymce_editor/assets/script/LICENSE.txt` and `License-lgpl-2.1.txt` |

Select2's JavaScript is **not** in this bundle: the deck loads
`select2.full.min.js` from a CDN, and its integrity hash is pinned in the
deployment config (`src/card/render/deployment-follow-live-config.ts`,
`scriptIntegrityBySrc`).

**TinyMCE is the one that constrains redistribution.** It is LGPL-2.1, not
MIT: redistributing `all-script.js` requires the LGPL's terms to be met,
including making the TinyMCE source available (section 6). The surrounding
project is GPL-3.0-or-later, whose section 6 is the same
copy-and-modify mechanism, so the terms are satisfiable. The full LGPL-2.1
text and the exact obligations are recorded in the license file named in the
table above. Every other component listed is MIT or Apache-2.0, both of which
require only that the notice travel with the software.

## `all-style.css` — what it is built from

The compiled output of the deck's Sass, whose sources are
`fixtures/vendor/mod-style-assets/` (each mod's `.scss`) plus
`fixtures/vendor/bootstrap-scss/` (the Bootstrap 5 Sass source) and
`fixtures/vendor/bootswatch/`. The third-party components it contains:

| Vendored source | Component | License | Full text ships at |
| --- | --- | --- | --- |
| `fixtures/vendor/bootstrap-scss/` | Bootstrap 5.1.3 (Sass) | MIT | `fixtures/vendor/bootstrap-scss/LICENSE.txt` |
| `fixtures/vendor/bootswatch/` | Bootswatch themes | MIT | `fixtures/vendor/bootswatch/LICENSE` (already shipped) |
| `fixtures/vendor/mod-style-assets/card-mod-bootstrap/assets/style/bootstrap-icons.css` | Bootstrap Icons | MIT | `fixtures/vendor/mod-style-assets/card-mod-bootstrap/assets/style/LICENSE.txt` |
| `fixtures/vendor/mod-style-assets/card-mod-bootstrap/vendor/select2/dist/css/select2.css` | Select2 4.x (CSS) | MIT | `fixtures/vendor/mod-style-assets/card-mod-bootstrap/vendor/select2/LICENSE.txt` |
| `fixtures/vendor/mod-style-assets/card-mod-bootstrap/vendor/select2-bootstrap-5-theme/src/*.scss` | Select2 Bootstrap 5 Theme | MIT | `fixtures/vendor/mod-style-assets/card-mod-bootstrap/vendor/select2-bootstrap-5-theme/LICENSE.txt` |
| `fixtures/vendor/mod-style-assets/card-mod-bootstrap/vendor/bootstrap-colorpicker/src/sass/_colorpicker.scss` | Bootstrap Colorpicker 2.5.2 | Apache-2.0 | `fixtures/vendor/mod-style-assets/card-mod-bootstrap/vendor/bootstrap-colorpicker/LICENSE.txt` |

Neither bundle contains the Rails/ActionView `en` locale strings. That file
(`fixtures/vendor/actionview-7.2.3.2-locale-en.yml`) is a **test fixture** —
a byte-copy of the gem file the suites load so they run without the gem
installed (`tests/card/mod-loader/card-mod-edit-views.test.ts`) — and its
license is recorded at `fixtures/vendor/LICENSE.txt`, not here.

## How these files were produced

Both bundles are build output: SassC compiles the Sass, Uglifier minifies the
concatenated scripts, and `one-click-deck.mjs` step 7 uploads the result as
the deploy's `[assets]` directory. They are committed because the one-click
deploy must ship
without a Sass toolchain, and because the deploy's write budget does not
allow compiling them at deploy time.

**They are not the source of truth.** The per-file sources under
`fixtures/vendor/` are, and each of those carries its own license file beside
its own bytes. A change to a component's bytes must change its license file
in the same commit, so this file's tables cannot drift from the vendored
trees without that discipline failing.

## Why this file exists

Each vendored component ships its license text next to itself, but a
concatenation has no next-to. The compiled bundles here are exactly the case
where a reader would have no way to discover the terms, so the terms are
restated: MIT and Apache-2.0 notices in the table rows above, the full
LGPL-2.1 text for TinyMCE at the path named above. The canonical inventory of
every third-party component in the repository is `NOTICE` at the repository
root.