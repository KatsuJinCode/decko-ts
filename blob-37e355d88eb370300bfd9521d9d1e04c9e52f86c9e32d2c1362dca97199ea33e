# Stock logo/favicon coded storage

Actual production Node and Bunny glyph probes at872d0e69 exposed logo/favicon
404s separately from their successful Font Awesome checks. The raw receipts
and logs remain unchanged. Source coded SVG reads depended on files under
`src/card/mod-loader/...`, omitted by the compiled distribution; edge runtimes
also had no filesystem reader. Both fell back to image URLs. The shared
attachment route then rejected the nonnumeric `carrierwave` revision, and had
no stock coded PNG provider.

The repair bundles exact carrierwave0.20.0 logo SVG and favicon PNG variants,
with source hashes and GPL attribution. Stock SVG core rendering now reads
those bytes on Node and edge. Existing custom Node coded-file registrations
retain their filesystem provider. This follows `set/type/image/html_views.rb`
SVG inlining and `set/abstract/attachment/coded.rb:47-57` coded directory and
codename ownership.

The shared file route recognizes only allowlisted current coded identifiers
after the read gate. The row with that codename must be the requested card,
and the requested module filename/extension must match. Unknown modules,
variants, formats, foreign aliases and replaced content remain404. SVG
responses retain sandbox/nosniff and PNG receives its actual MIME/variant
bytes. Node's previously unhandled files requests now use this same gated
route before its404; no generic missing-file image substitution was added.
Stock coded reads do not require cloud-storage credentials. Bunny resolves
the actual session viewer for file reads; both hosts run the existing
freshness check before fetching or checking permission. A real Hrana test
initially exposed a stale200 after read-rule revocation; the freshness gate
now makes that request404 while the newly authorized anonymous viewer gets200.

Tests pin official SVG and small-PNG SHA-256, HEAD, MIME/security headers,
read revocation, foreign-identifier binding and negative module/variant/
extension/current-content controls. This source repair needs an exact-source
actual host/browser rerun; it does not convert older failed assets into passes.
