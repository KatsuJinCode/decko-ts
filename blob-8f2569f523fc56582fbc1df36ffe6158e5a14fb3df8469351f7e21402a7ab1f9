# What this instrument measures

The edge's static asset delivery: how `css`, `js` and image bytes are served,
how big they are, what a client actually downloads, and what it downloads
twice. Two instruments, both run against the REAL route modules rather than
reimplementations, so the headers and bytes reported are the ones the edge
emits.

## Run them

```
node tools/perf/asset-bytes/measure-vendored-asset-bytes.mjs [--json out.json]

node --experimental-strip-types \
     --import ./tools/perf/asset-bytes/register-ts-resolver.mjs \
     tools/perf/asset-bytes/measure-asset-http-delivery.mjs [--json out.json]
```

`ts-source-resolver.mjs` maps the repo's `.js` import specifiers onto the
`.ts` sources they name, so the instruments import engine modules directly
with no build step and no `npm install`.

## The surfaces under measurement

| Surface | Route module | URL shape |
| --- | --- | --- |
| Font Awesome CSS + webfonts | `src/server/font-awesome-assets.ts` | `/mod/bootstrap/fontawesome-6.7.2/<key>` |
| card-mod-bootstrap icon font | `src/server/bootstrap-font-assets.ts` | `/mod/bootstrap/fonts/<name>` |
| deck files (compiled stylesheet, images, uploads) | `src/server/file-routes.ts` | `/files/<mark>/<rev>[-<size>].<ext>` |

Wired into the Bunny engine at
`deploy/bunny-worker-src/bunny-edge-engine-handler.ts:277`
(`serveFontAwesomeAsset(request) ?? serveBootstrapFontAsset(request)`), and
`/files` via `worker.ts:409`.

## The baseline, and what the fix moved

14 assets — the set one deck page pulls. Measured over real HTTP against the
real routes. `results/before-http-delivery.json` and
`results/after-http-delivery.json` are the two runs.

| Measurement | Before | After |
| --- | --- | --- |
| cold transfer total | 1,797,973 B (1755.8 KiB) | 1,797,973 B (unchanged, by design) |
| gzip-9 total | 987,162 B — 45.1% smaller | unchanged |
| brotli-11 total | 920,382 B — 48.8% smaller | unchanged |
| responses setting `Content-Encoding` | 0 of 14 | 0 of 14 (**not addressed, see below**) |
| responses carrying an ETag | 11 of 14 | 11 of 14 |
| revalidations answered **304** | **0 of 11** | **11 of 11** |
| **bytes re-sent on revalidation** | **1,382,514 B (1350.1 KiB)** | **0 B** |
| bootstrap icon font `cache-control` | `public, max-age=86400` | `public, max-age=31536000, immutable` |
| `/files` `cache-control` | **absent** (`Expires` only) | `public, max-age=86400` |

Cold bytes are unchanged on purpose: none of the three fixes removes a byte
from a first load. They remove bytes from every load AFTER the first.

## The three defects the measurement named, and why each is plain waste

1. **The ETag was never read.** All three asset routes publish an ETag (the
   vendored payload's sha256) and nothing consulted `If-None-Match`, so a
   revalidation got a full 200 and the whole body. 11 of 11 revalidations
   re-downloaded 1,382,514 bytes. An ETag that cannot produce a 304 is not a
   validator. Fixed in `src/server/conditional-asset-request.ts` (one
   implementation, RFC 9110 §13.1.2 weak comparison), consulted by the two
   vendor routes BEFORE the base64 decode so a 304 costs no `atob()`.

2. **The icon font was re-downloaded daily for bytes that cannot change.**
   `bootstrap-font-assets.ts` declared `max-age=86400` while its FontAwesome
   sibling declared `max-age=31536000, immutable`. The icon fonts are pinned
   by sha256 in `vendor/decko-bootstrap-fonts/provenance.json` and addressed
   by a fixed name with no variant fallback, so a URL's content can never
   change. Cost: 285,648 bytes per browser per day, forever.

3. **`/files` stated no policy a shared cache is obliged to honor.** It sent
   the HTTP/1.0-era `Expires` and no `Cache-Control`. `Expires` is the form a
   browser honors and a CDN is not required to.

## What this instrument does NOT establish, and why

- **No claim that compression is missing in production.** The routes set no
  `Content-Encoding`, and measured locally the CSS is worth 45.1% under gzip
  and 48.8% under brotli. Whether Bunny's or Cloudflare's CDN already
  compresses these responses was **not measured** — that needs a deployed
  origin, and this lane does not deploy. The 0-of-14 column is a statement
  about the ROUTES, not about the wire in production. Adding gzip inside the
  route would spend edge CPU per request to fix a gap that may not exist, so
  it is not done on the strength of an unmeasured assumption.

- **No claim that any vendored font is unused.** Measured: 0 files are
  unreferenced by the CSS the edge serves. The 5 files a woff2-capable
  browser never fetches (859.5 KiB decoded, 1146.0 KiB as base64 in the
  Bunny script — 15% of the 7,600,000-byte budget in
  `tools/vendor/edge-bundle-budget.mjs`) are the ttf/woff FALLBACKS behind
  each `@font-face`. Deleting them would break woff1-only browsers. That is a
  product decision about supported clients, not waste, so it is reported and
  left alone.

- **One duplicate payload, left alone.** `:logo/carrierwave.svg` and
  `:decko_logo/carrierwave.svg` are byte-identical (sha256 `312389d4…`,
  4,206 bytes, twice). Two vendored gem files that happen to ship the same
  SVG. Deduping saves 4,206 bytes — 0.07% of the script budget — at the cost
  of churning a pinned provenance record. Not worth it.

## The named follow-up

**`/files` still sets no validator**, so its revalidation cannot be made
cheap the way the vendor routes' now is. A `/files` URL does not uniquely
determine the bytes it serves: `attachmentStore.read` tries
`<action id>-<variant><ext>` and FALLS BACK to the bare `<action id><ext>`
when no rendition exists (`src/card/attachments/attachment-store.ts:198-211`),
so `/files/~103/3649-small.png` can start serving different bytes once that
rendition is written. A validator derived from the request would then be a
false match, and a client would hold a stale image indefinitely.

The fix is to have `read` report which candidate resolved, so the validator
can be derived from the exact resolved object rather than the URL. That
touches a method with several other callers, so it is named here rather than
folded into this change. It is also why the `/files` policy is `max-age=86400`
and deliberately **not** `immutable` — a test
(`tests/server/files-route-cache-policy.test.ts`) holds that negative.

## Re-running against the current tree

The two `results/*.json` files are receipts, not fixtures; nothing reads them
back. Re-run the instruments and compare.