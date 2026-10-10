# vendor/libsass-wasm — the edge SCSS compiler artifact

What is in this directory
-------------------------

`libsass-3.6.4-wasm-base64.js`
    LibSass 3.6.4 compiled to a standalone WebAssembly reactor module and
    vendored as a base64 ES module (generated; do not edit). This is the
    SCSS compiler the edge write surfaces pass as their `scssCompiler`
    (src/server/libsass-wasm.ts loads it; src/server/cloudflare-write-routes.ts
    passes it), so a `<set>+*style` save on Cloudflare Workers or the Bunny
    edge compiles to the same bytes as on a Node host. The module exports
    `malloc`, `free`, `sassc_compile`, `_initialize` and `memory`; the
    wrapper's C source is tools/libsass/sassc-wasm.c and the build script is
    tools/libsass/build-wasm.mjs (both committed; the emsdk toolchain is not
    vendored).

`LICENSE`
    The LibSass MIT license, taken verbatim from the libsass 3.6.4 tag
    (https://github.com/sass/libsass/blob/3.6.4/LICENSE). The repo's NOTICE
    defers to this directory for third-party terms.

Provenance
----------

Source: the LibSass 3.6.4 tag — the same sources the Ruby oracle's
sassc-2.4.0 gem bundles at ext/libsass (checked: the gem tree's VERSION is
3.6.4), and the same sources the Node host's native program builds
(tools/libsass/build-native.mjs).

Toolchain: Emscripten SDK 6.0.12 (`emsdk install latest` on 2026-10-08),
compiling with `em++ -O2 -fwasm-exceptions -sALLOW_MEMORY_GROWTH=1
-sFILESYSTEM=0 -sSTANDALONE_WASM=1 --no-entry`, objects in parallel, linked
against the sassc-wasm.c wrapper exporting `sassc_compile(source, style,
out_css, out_error)`. `-fwasm-exceptions` is required: LibSass propagates
errors with C++ exceptions, and the module carries no Emscripten JS glue to
emulate them — the runtimes that serve these bundles (workerd/V8, the
Deno-based Bunny edge, Node) implement the WebAssembly exception-handling
proposal.

Why built here: no maintained prebuilt WebAssembly LibSass 3.6.4 exists to
vendor (checked 2026-10-08: sass.js bundles 3.6.2 as asm.js and has not
shipped since 2019; kwonoj/libsass-asm is a 2018 Node-only build; LibSass
itself is end-of-life upstream). The exact version matters — Dart Sass, the
maintained compiler, produces different bytes through the whole bootstrap
build (292 differing regions measured on the 365 KB site stylesheet), and
the acceptance bar is the oracle's bytes.

License
-------

LibSass is MIT (LICENSE, this directory). It is compiled, not linked into a
derivative of this repo's GPL code in any licensing-relevant sense — the
artifact is an independent program the host loads as data, and its MIT terms
let this GPL-3.0-or-later project redistribute it (see NOTICE).

Regenerating
------------

    git clone --depth 1 https://github.com/emscripten-core/emsdk
    emsdk/emsdk install latest && emsdk/emsdk activate latest
    EMCC=<emsdk>/upstream/emscripten/emcc.exe \
      node tools/libsass/build-wasm.mjs <libsass 3.6.4 source dir>

The byte-identity tests (tests/server/edge-compiler-byte-identity.test.ts)
pin the module against the oracle's stylesheets, so a rebuilt module that
disagrees with Ruby fails, loudly.
