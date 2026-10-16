# Static Uglifier initialization

Save-time JavaScript validation uses the same vendored Uglifier 4.2.1 harmony
snapshot on Node and edge hosts. Node keeps the original VM loader. Edge hosts
use generated static initialization; no replacement parser, remote compiler,
runtime `eval`, unsafe-eval binding or Node VM/filesystem dependency is added.

## Build and provenance

```sh
node tools/vendor/build-uglify-harmony-static.mjs
node tools/vendor/build-uglify-harmony-static.mjs --check
```

The generator pins all five unchanged vendor source hashes and four license
hashes. It records only trusted compiler initialization, plus an empty-source
prewarm of OutputStream's fixed literal predicate. No user source or corpus
teaches it a factory. The inventory is 201 signatures. Five audited constructor
calls in the derived module use a finite factory table; unknown inputs fail
closed. Every invocation returns a fresh function. Original anonymous and
returned named function names are restored as metadata: the Mozilla converter
uses constructor names, so allowing a bundler to erase those names is incorrect.

The generated module preserves the embedded upstream notices. Its companion
`uglify-harmony-static.provenance.json` records input/license hashes, factory
inventory, audited offsets, output size and digest. Vendor files are unchanged.
Engine-distribution and edge-bundle builds check reproducibility before writing
artifacts. The Bunny bundle builders reject scripts above a conservative decimal
10,000,000 UTF-8 bytes and validate imports before writing the code/payload pair.
This is a script-size guard, not hosted deployment or runtime acceptance.

## Host wiring

| Consumer | Validation provider |
| --- | --- |
| Node production `vm-staging-server.mjs` | Original VM, `uglifyHarmonySyntaxError` |
| SQLite/MySQL harness adapters | Same original Node provider |
| Root `worker.ts` | Static provider through `handleWorkersWriteSurface` |
| Full Bunny edge handler | Same shared surface through `mountBunnyEdgeWriteSurface` |
| Retained `cf-edge-engine-entry.ts` | Same full handler over D1 |
| Older read-only `deploy/worker.ts` | No general card-write surface |

The library option stays explicit and optional. A custom caller that omits a
validator retains a validation gap. Syntax validation is independent of
`compress_assets`; the existing edge compression policy is unchanged. The
original Node and static providers share the exact option projection and stock
Uglifier/Cardio error-context formatter.

## Local evidence and limits

```sh
node tools/uglify-static-workerd-proof.mjs <fresh-absolute-output-directory> --adopted
node tools/uglify-edge-save-proof.mjs <fresh-absolute-output-directory>
node tools/uglify-composed-bundle-proof.mjs <clean-integration-checkout> <fresh-output-directory>
node --test reference-harness/runner/test/edge-bundle-budget.test.mjs
```

The actual minified generated provider matched the original Node compiler on
16 representative raw results, including Unicode errors and the existing
1,063,022-byte fixture script. Both negative controls passed: native dynamic
code generation remained prohibited by workerd, and an unknown factory was
rejected. Unit controls additionally cover exact stock context formatting,
eight-line bounds, original minification bytes and deterministic generation.

Actual root and retained-CF HTTP/D1 probes accept valid ES6, reject malformed
creates/updates with the observed stock diagnostic, and leave card/history/
virtual/reference rows unchanged after refusal. The same content on PlainText
is allowed. Authentication uses an explicit first-class session fixture;
these are validation controls, not sign-in journeys.

Local workerd client-ready/first-dispatch wall times include process creation,
compilation and transport. Its module clock reported zero at that resolution;
this does not measure startup CPU or establish Bunny's startup allowance.
The SDK bundle is measured without deploying it. Bunny's customized runtime,
hosted limits and complete application journeys still require their own
acceptance evidence. Existing unrelated Node imports in host graphs are
inventoried separately; the static provider adds none.
