# Cold start of the Bunny edge worker: what is measured here, and what the numbers were

Three instruments and the artifacts they wrote on 2026-10-19. Run them from
the repository root; each writes a JSON artifact under `results/`.

## The question

A cold Bunny isolate serves its first request slower than a warm one. How
much of that premium is work the worker could have deferred until it knew it
needed it?

## 1. `measure-staging-edge-cold-vs-warm-ttfb.mjs` — the Bunny-side split

Times GETs against a deployed edge script from outside with `node:https`, so
the numbers carry no instrumentation beyond the `Server-Timing` header the
worker already ships. Records TTFB (the `response` event), TLS completion, and
the header verbatim per request.

It cannot see which isolate served a request — Bunny exposes no isolate id
unless `DECKO_EDGE_ISOLATE_PROBE=1` is armed, and it is not armed on staging.
Cold is therefore inferred from the worker's own statement count: a request
whose `stmt=N` exceeds that path's minimum ran the deck boot inside its own
wall. A run where no path shows a statement increase observed no cold isolate,
and says so in `cold_isolates_observed` rather than implying one.

**Shell note that cost real time:** a Git Bash (MSYS) shell rewrites any value
whose string starts with `/` into `C:/Program Files/Git/...`, silently
corrupting both `--paths` and a bare `https://` argv. Run with
`MSYS_NO_PATHCONV=1`, or pass `DECKO_PROBE_HOST` / `DECKO_PROBE_PATHS`.

### Result: staging script 96895, 120 requests to `/_status`, concurrency 8

`/_status` is the clean instrument for this: its warm cost is one statement
and ~9 ms, so almost the whole TTFB is isolate start and boot.

| | COLD (`stmt>=4`, deck booted in-request), n=77 | WARM (`stmt=1`), n=38 |
|---|---:|---:|
| TTFB p50 | 1144 ms | 466 ms |
| TTFB mean | 1346 ms | 775 ms |
| TLS p50 | 279 ms | 288 ms |
| handler (`Server-Timing total`) p50 | 75 ms | 9 ms |
| pre-handler (TTFB − TLS − handler) p50 | 790 ms | 171 ms |

**The cold premium is ~678 ms p50, and ~91% of it (619 ms) is spent before the
handler runs.** Only ~66 ms p50 is in-handler deck boot. Connection setup is
unchanged between the two, which is what a boot-path premium should look like.

## 2. `measure-static-vs-dynamic-import-of-gzip-inlined-wasm.mjs` — the deferral

Drives the real bundler plugin
(`tools/vendor/gzip-inline-wasm-blobs-esbuild-plugin.mjs`) over the real
vendored LibSass module, builds two outer bundles — one importing it
statically, one dynamically — and times `import()` of each in a fresh child
process per repetition.

The plugin emits a top-level `await` that inflates the gzip and re-encodes it
to base64. Whether that is on the isolate's critical path depends entirely on
how the importer reaches it, which is the whole finding.

**Node 24 / win32 — a Node number, not a Bunny one.** The Deno-based edge
runtime will differ in absolute terms; the ratio is the evidence, the
magnitude is an order of size.

| | module evaluation |
|---|---:|
| static import | p50 110.83 ms (mean 108.82) |
| dynamic import | p50 3.89 ms (mean 4.23) |

**~107 ms p50 moves off the boot path.** The cost is moved, not deleted: the
first compile on an isolate still pays p50 103.75 ms at that point. Both
shapes produce a byte-identical 2,229,360-character base64 string.

## What landed

`src/server/libsass-wasm.ts` now reaches the vendored blob through a dynamic
import, so on the edge bundle the inflate waits for the first compile. On a
read-only edge that never compiles a stylesheet, it is no longer paid at all.

`measure-gzip-wasm-blob-inflate-at-module-eval.mjs` is the earlier,
plugin-free version of instrument 2 (it builds the two module bodies by hand).
It is kept because it isolates the inflate itself from esbuild's wrapping:
eager p50 101.48 ms versus lazy p50 3.90 ms, with
`bytes_identical_after_deferral: true`.

## Artifacts

| File | What it holds |
|---|---|
| `results/baseline-96895.json` | 24 page requests, `/`, `/About`, `/2011_12_14` |
| `results/burst-concurrency-8.json` | 160 requests, `/_status` + `/` — the run that first showed cold isolates |
| `results/status-only-concurrency-8.json` | 120 requests, `/_status` only — the cold/warm table above |
| `results/static-vs-dynamic.json` | the plugin-driven before/after |

`baseline-96895.json` is worth keeping as a negative result: every page's
statement count was identical across all 8 rounds, so it observed **no cold
isolate at all**. A single client from a single region pins its PoP's warm
isolate; concurrency is what forces isolate turnover.
