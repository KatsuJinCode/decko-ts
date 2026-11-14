# Selected upload preview render cost

The actual fcdc capability ledger's slow `POST /card/create` was the
preliminary upload, returning a small chosen-file preview; final creation
completed in 1.041s. A separate bounded probe on the owned approved
21,676-card mirror and fcdc-integrated source c862d0ee measured:

| Phase | Wall | Statements | Actual SQLite execution |
|---|---:|---:|---:|
| Whole preliminary upload | 21.501s | 1529 | 1461ms |
| Existing preview renderer | 21.137s | 1509 | 1278ms |

The database's network-backed wall timing was 20.975s. The existing raw
`RenderEngine` callback therefore accounts for 98% of the request, mostly
as sequential round trips. The actual write and upload are not the long
critical path. In-memory esbuild instrumentation adds timestamps only at
the existing callback boundaries; its separate diagnostic manifest pins
source and bundle hashes. Tracked source/normal bundle remain unchanged
for that measurement. No outer transaction changes callbacks.

The shared host now accepts an optional preview renderer while retaining
its existing default for other hosts. Bunny supplies its established
request-local batched renderer, freshly booted for each pass with the
actual authenticated session, serving configuration and image-CDN setting.
The actual selected action, cached identifier, original filename, size and
upload field travel unchanged through `viewOpts`. Preview state remains
request-local. It keeps the existing authenticated-session requirement,
abort signal and request-context/isolate-lock boundary.

All ten actual HTTP controls passed in 66.11s, including File/Image selected
previews, real temporary original/medium bytes, final save/download,
consumed-draft cleanup, Date/rich slots, actor-specific permission refusal,
real follow mail, and complete account reset. TypeScript validation passed.
An attempted small-fixture 80-trip bound did not distinguish the original
fallback, so it was not retained or claimed as a load-bearing performance
regression. That unsuccessful diagnostic remains preserved; the actual
protected-deck before/after measurements are the performance evidence.

The separately reported URL-preset failure was also checked before this
repair. Both actual HTTP routes (`/new/RichText` and legacy `/card/new`)
returned exact preset textarea values, and posting those real controls
stored exact bytes. With the authorized allowlisted render configuration,
actual TinyMCE initialized the matching textarea with that preset, submitted
it unchanged, and the stored row and reloaded page retained it. No product
content correction was justified. A two-route real HTTP regression now
guards that behavior (4.359s). Failed diagnostic attempts remain explicit:
the first lacked the deck's main JS configuration; a later response-body
read raced navigation; the completed browser probe recorded one aborted
redundant navigation after successful save. Those are not presented as
pristine full-suite browser acceptance.

The protected original database SHA-256 remains
`edcc11bc32a8e0b1ec3529aeb9240c6201cc7c39191e0c2ebe618795838815bc`.
Subsequent production-bundle measurements have separate source/artifact
receipts. No hosted runtime or median/p95 is claimed.
