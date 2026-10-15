# Explicit production icon assets

The stock bootstrap gem manifest hardcodes the third-party
`kit.fontawesome.com/1366963381.js`. The canonical Ruby33 browser capture
records HTTP403 for that script. It remains a real failed asset in the frozen
reference evidence; the browser policy does not ignore or whitelist it.

Production deployments can set `DECKO_FONT_AWESOME=local`. Node and the Bunny
handler then render a stylesheet pointing to the same-origin versioned
`/mod/bootstrap/fontawesome-6.7.2/` route. Actor engines retain this deployment
setting. Both real hosts serve the exact checked-in CSS and every referenced
WOFF2/TTF file, with correct MIME, immutable versioned caching and nosniff.
Only allowlisted paths are served; missing files remain 404 and writes 405.
The route is public vendor content and performs no database reads.

Unset or `stock` retains the gem's original Kit tag and stock parity bytes.
The explicit production Node and local Bunny browser profiles select `local`
and record the effective mode/version in their runtime metadata. This is a
deployment configuration change, not a claim that the historical Ruby output
already used these files. Other production hosts must wire this configuration
and route before selecting local mode; no live provider setting is changed
by this source repair.

The compatible local assets previously available were Font Awesome4.7 docs
files. They lack current icon names such as table-columns, circle-plus and
magnifying-glass, so they were not substituted. Version6.7.2 comes from the
official free npm package; the reproducible extractor verifies its published
SHA-512 before allowlisted extraction. Package and per-file hashes, full
license/attribution and exact bytes are retained under
`vendor/fontawesome-free-6.7.2`. The complete extracted payload is about1.1MB.

`tests/server/font-awesome-assets.test.ts` checks official-byte hashes through
the actual Bunny handler with no database credentials, all CSS-referenced
fonts, HEAD, MIME, unknown files and rejected aliases/writes. Existing stock
head and session tests retain the reference defaults.

The first-class `reference-harness/browser/probe-fontawesome.mjs` requires a
clean source commit and matching build receipt, starts an isolated actual
configured host, visits the real icons view, exports computed glyph/font
state and verifies CSS/font network bytes. It fails if any Kit request occurs
or the icon font fails to load. Its receipt is separate from full-journey or
hosted production acceptance.
