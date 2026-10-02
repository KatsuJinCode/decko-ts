# Compile engines: Dart Sass standing in for SassC/libsass — divergence notes

Companion to `src/card/mod-loader/libsass-byte-parity-adapter.ts` (which
carries the full normalization catalogue in its header) and to
`tests/card/mod-loader/compile-engines-pin.test.ts` (which pins the oracle
bytes from `fixtures/captured/compile-engines.json`).

## The two facts a maintainer needs

- The oracle bytes come from `fixtures/captured/compile-engines.json`,
  captured inside the live decko-0.20.0 oracle app by
  `tests/card/mod-loader/oracle-capture-compile-engines.rb`.
- `sass` (Dart Sass) and `coffeescript` are pinned EXACT in `package.json`
  (`sass@1.105.0`, `coffeescript@1.12.2`) — the pins are the parity
  contract; bumping them re-opens every normalized divergence below.

## Why Dart Sass

The deck's Ruby runs SassC (libsass 3.6.x). No maintained npm binding
ships libsass for current Node; the repo compiles with Dart Sass and
normalizes dart's output back to libsass byte conventions in two layers:

1. input normalization at the test/engine boundary (BOM strip + trailing
   newline), and
2. the post-compile byte-parity adapter
   (`src/card/mod-loader/libsass-byte-parity-adapter.ts`).

## Divergence classes the adapter covers

- number canonicalization (leading/trailing zeros, exponents, both signs)
- color keyword/hex/case forms, `rgba()` alpha canonicalization
- `calc()` inner-text padding
- attribute-selector quote forms
- string escape decoding
- compound-selector category reorder
- compressed BOM / expanded `@charset` emission on non-ASCII output
- expanded blank-line separation of hoisted top-level rules

## Residuals not recoverable from output bytes

Documented in the adapter header: dart's calc elision of single-value
calcs, variable-carried arithmetic, and error MESSAGE bytes. None is
reachable from the captured corpus.
