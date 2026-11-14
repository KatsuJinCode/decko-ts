# The Bunny edge bundle stays one script; its bytes are vendored data, not a split point

## Context

`deploy/dist/bunny-edge-engine.bundle.js` is 7,121,348 bytes against a
7,600,000-byte boot-safe budget (`tools/vendor/edge-bundle-budget.mjs`) — 93.7%
of the ceiling, with 478,652 bytes of headroom. Bunny documents a **500 ms
startup limit** (`deploy/bunny-edge-deployment-runbook.md`, limits row). That
makes the bundle a boot-path asset, and it invites one question: which modules
should lazy-load on first use rather than boot?

This record answers that with measurements, and lands the one change the
measurements support: an instrumentation flag that makes the byte attribution
reproducible. The lazy split itself is **not** landed, and the reasons are
below.

Every figure here was measured on 2026-10-20 with
`tools/perf/measure-bunny-edge-engine-boot-cost.mjs` (boot cost) and
`node tools/bundle-bunny-edge-engine.mjs --metafile <dir>` (byte attribution),
both added by this change. Byte totals come from `assertBunnyScriptBudget`, not
from the metafile.

## The source map is not the story

The bundle carries no source map. `minify: true` with no `sourcemap` option, and
the only `sourceMappingURL` in the output is a **44-byte** comment referencing
an external `bootstrap.bundle.js.map` — a legal comment preserved from a nested
module, not an inline map. The three other `sourceMappingURL` hits in the file
are string literals *inside* the bundled CoffeeScript compiler, which has to
contain the keyword it parses.

7,121,348 bytes of module code, 44 bytes of source-map reference. Whatever
dominates this bundle, it is not debug metadata. (The 7,257,856-byte
`bunny-edge-engine.code.json` is the `{"Code": …}` upload envelope, not a map.)

## What does dominate: eight modules, 75.9%

Per-module bytes-in-output from the esbuild metafile, whole bundle 7,121,348
bytes, 329 modules, 99.98% of bytes attributed:

| bytes | share | module |
|---:|---:|---|
| 1,463,777 | 20.55% | `vendor/fontawesome-free-6.7.2/assets.js` |
| 1,105,415 | 15.52% | `vendor/edge-script-source-snapshot.js` |
| 832,334 | 11.69% | `@cf-wasm/photon/dist/lib/photon_rs_bg.wasm.inline.js` |
| 577,577 | 8.11% | `vendor/libsass-wasm/libsass-3.6.4-wasm-base64.js` |
| 442,265 | 6.21% | `vendor/edge-style-source-snapshot.js` |
| 381,141 | 5.35% | `vendor/decko-bootstrap-fonts/assets.js` |
| 345,258 | 4.85% | `src/card/assets/uglify-harmony-static.generated.ts` |
| 256,386 | 3.60% | `vendor/edge-bootstrap-scss-snapshot.js` |

Those eight are **5,404,153 bytes, 75.9%**. Grouped by what they are: vendored
asset registries and source snapshots **3,737,472 bytes (52.5%)**, the two
gzip-inlined WebAssembly blobs **1,409,911 (19.8%)**, the runtime Uglify
compiler 345,258 (4.85%).

Note the two WASM blobs are *already* compressed by the existing
`gzipInlineWasmBlobsPlugin` — that change cut ~2.9 MB and is verified on staging
script 96895. The gzip lever has been pulled once already.

## What a perfect lazy split would be worth

The candidates are the registries and snapshots: 3,737,325 bytes (52.5%) that
serve either a static subresource route or the `node:fs` fallback path, not
page render. To price the prize without trusting the intuition, the six modules
were stubbed with same-shaped empty exports and the engine rebuilt:

| bundle | bytes | parse_ms | eval_ms |
|---|---:|---:|---:|
| as shipped | 7,121,348 | 66.4 | 245.0 |
| six candidates stubbed out | 3,384,023 | 39.6 | 214.8 |

Interleaved samples, one fresh process each, median of 9 (the same bundle
measures 200–330 ms across repeated harness runs on this shared machine, so A/B
samples are interleaved round-robin to cancel drift).

**A perfect lazy split of every candidate saves 30.3 ms of evaluation — 12.3%,
about 6% of the 500 ms startup budget** — for 52.5% of the bytes.

## Why the split is not landed

**The runtime capability is unverified, and verifying it means deploying.**
Bunny's documented position is that an Edge Script deploys as a single built
bundle. Dynamic `import()` of a remotely hosted chunk appears only in
third-party guidance, and the search gateway flagged that guidance explicitly
as needing a deployed test before it is made an architectural dependency. This
lane may not deploy, so a split would rest on an unverified assumption about
the production boot path.

**There is no second deployment surface.** A remote chunk needs a CDN origin.
The repo has one artifact and one upload; adding an origin is new infrastructure
whose availability the render path would then depend on.

**The trade is 30 ms of local boot for a network round trip.** For
`serveFontAwesomeAsset` the win is real but the route is already
`cache-control: public, max-age=31536000, immutable` — cold-cache browser
fetches only. For the source snapshots it is worse: those are the *fallback* for
when `node:fs` is unavailable (`src/card/assets/script-sources.ts:16-19`). A
fallback that can fail to fetch is not a fallback.

**Each lazy chunk spends the 50-subrequest budget** the limits table grants.

So: **the bundle stays monolithic**, and the 478,652 bytes of headroom is the
real margin to manage, not a 3.7 MB split.

## Compression was tried and rejected on measurement

The obvious in-artifact lever — store the registries gzipped and inflate with
the existing `DecompressionStream` path — was built and measured, because
`vendor/edge-script-source-snapshot.js` alone gzips 1,136,034 → 319,412.

It produced byte-identical registries (sha256 over each export matched the
plain build for all five) and it is a **boot regression**:

| build | bytes | eval_ms (interleaved, n=9) |
|---|---:|---:|
| as shipped | 7,121,348 | 229.6 |
| registries gzip-inlined | 5,986,936 | 336.7 |

**−1,134,412 bytes bought +107.1 ms of evaluation (+46.6%).** Against a 500 ms
startup budget that is a fifth of the budget spent to save bytes already
comfortably inside the ceiling.

The mechanism: the snapshots store **plain text** (`edgeAssetSources` values are
raw CoffeeScript, CSS and SCSS source — not base64), so V8 materializes them as
an object literal cheaply. Replacing that with base64 → gunzip → `JSON.parse`
adds more work at module evaluation than the literal it removes. Compression
pays when the bytes must cross a network; here the literal was already cheap to
build and the 500 ms clock is about building, not transferring.

**Do not enable this without re-measuring.** If the bundle ever approaches the
9.25 MB ceiling where scripts stop booting, compression becomes the right lever
for a different reason — but that is a size emergency, not a speed one.

One structural limit found on the way, worth keeping: storing a registry
compressed requires top-level `await` in its module, and **a TLA module on an
import cycle never settles** — the graph stops resolving and the script never
reaches `serve()`. `edge-style-source-snapshot.js`,
`edge-bootstrap-scss-snapshot.js` and `decko-coded-attachments/assets.js` are
all inside the stylesheet/attachment import cycles and each was measured to hang
the module graph for 25 s. Only the two cycle-free leaves (FontAwesome, the
script snapshot) are eligible at all.

## What is landed

`--metafile <dir>` on `tools/bundle-bunny-edge-engine.mjs`, and
`tools/perf/measure-bunny-edge-engine-boot-cost.mjs`.

Both bundles are **sha256-identical** before and after:

```
bunny-edge-engine.bundle.js  c75e149eceaf074a4fb1cc58b274b42470cfe0df869eb87210e50f7ed35bc378
bunny-edge-read.bundle.js    480649848c81cde79bf16501b1ec436d79ed946973e04ea5c5e7fe839c87b0a1
```

The instrument reports `parse_ms` (V8 parse+compile of the script text, nothing
executed — the cost a second chunk could defer), `eval_ms` (top-level execution
in a real Node realm with the SDK stubbed) and `boot_ms`. **These are Node V8
numbers, not Bunny's V8 and not the Bunny isolate** — they rank options against
each other and do not predict the 500 ms figure. The absolute number comes only
from `x-decko-isolate`'s `perf_at_eval` on a staging probe
(`deploy/bunny-worker-src/bunny-edge-isolate-probe.ts`), which this lane may not
run.

## Consequences

- Nothing about the deployed artifact changes; both bundles are byte-identical.
- "What dominates the bytes" is now answerable from the real build in one
  command instead of by line-counting a minified file.
- The next person asked to "split the bundle" gets the number first: the ceiling
  is 30 ms, and the prerequisite is a deployed test of remote dynamic import.