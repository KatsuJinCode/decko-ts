# PROVENANCE-AND-LICENSE.md — what this directory is

The byte-exact JavaScript compression engine for the `*all+*script` asset
compilation: the five vendored source files that
`uglifier-4.2.1` (rubygems) loads into ExecJS when a deck compiles its script
assets with `Uglifier.new(harmony: true).compile` — card-mod-script-0.20.0
`set/abstract/00_script.rb:25-27` (`try_compress`), the compression arm of
every `:compressed` script view.

Files, in uglifier's own load order (`uglifier.rb` `source_with`):

| file | bytes | role |
|---|---|---|
| `es5.js` | 8,938 | ES5 fallback shims uglifier injects for old runtimes |
| `split.js` | 4,755 | cross-browser String.prototype.split fallback |
| `source-map.js` | 100,453 | mozilla/source-map snapshot (MOZ_SourceMap) |
| `uglify-harmony.js` | 356,808 | the UglifyJS2 **harmony-branch** snapshot (mishoo/UglifyJS2, the 2.x-line harmony build uglifier 4.2.1 vendors — NOT npm `uglify-js` 3.x; no byte-compatible npm package exists) |
| `uglifier.js` | 1,212 | the `uglifier(options)` wrapper calling `UglifyJS.minify` |

Provenance: copied verbatim from the Ruby gem install
`C:/Ruby33-x64/lib/ruby/gems/3.3.0/gems/uglifier-4.2.1/lib/` (the gem version
the deck's own Gemfile.lock pins: `uglifier (4.2.1)`), unmodified.

License, per file (each `LICENSE-*.txt` here is copied from the license text
exactly as the gem or the vendored file itself carries it):

| file | license where the file itself carries one | LICENSE file here |
|---|---|---|
| `uglify-harmony.js` | full BSD-2-Clause banner in-file (Mihai Bazon / UglifyJS2) | `uglify-harmony-js-LICENSE-BSD-2-Clause.txt` (the banner, verbatim) |
| `source-map.js` | no single header: the Mozilla Foundation notice (`BSD-3-Clause` per URL) heads the bundle's modules, and its Base 64 VLQ module (from Closure Compiler) carries the full BSD-3-Clause terms in-file | `source-map-js-LICENSE-NOTICES.txt` (both notices, verbatim) |
| `split.js` | in-file header names the MIT License (Steven Levithan) without stating its terms | `split-js-LICENSE-MIT.txt` (the header, verbatim, plus the standard MIT terms text) |
| `uglifier.js` | no license header | `uglifier-gem-LICENSE-MIT.txt` — the uglifier gem's own MIT license (`LICENSE.txt`, © Ville Lautanala; gemspec: `spec.license = "MIT"`), verbatim |
| `es5.js` | no license header | none — the gem ships it with no separate upstream license text; it is distributed here under the gem's MIT license (`uglifier-gem-LICENSE-MIT.txt`) |

The uglifier gem itself is MIT (`uglifier.gemspec` `spec.license = "MIT"`), and
its `LICENSE.txt` is the attribution text for the gem's own code (`uglifier.js`,
`lib/uglifier.rb`) and for the gem's distribution of the unheadered fragments
(`es5.js`). The upstream snapshots (`uglify-harmony.js`, `source-map.js`,
`split.js`) carry their own licenses above, preserved in-file. This file and
the `LICENSE-*.txt` texts are the attribution record.

Byte-exactness evidence (tinymce-assets lane, 2026-09-29): loading these five
files in a Node `vm` and calling the `uglifier(options)` wrapper with
`Uglifier.new(harmony: true).compile`'s exact option shape reproduces the live
production deck's compiled `*all+*script` bundle leaf-for-leaf — 48 of the 49
shared leaves byte-identical, 1 leaf (jquery.iframe-transport.js) identical
code with a 1-byte trailing-newline difference, 4 leaves from a live-only
custom production mod absent from every local source surface. Pins:
`fixtures/captured/script-compile-oracle-leaves.json`,
`fixtures/captured/all-script-assembled-input.js` (the assembled input, sha256
36a3d55df942e04fa205231a0c750d9f453518edda574f5bfb622dcb5dd492c7), and the
compiled-bundle sha in `tests/card/mod-loader/compiled-script-bundle.test.ts`.

Consumers: `src/card/assets/uglify-harmony-compile-engine.ts` (the vm loader)
and `src/card/assets/compiled-script-bundle.ts` (the compile contract). Node
only — the browser/worker bundle never imports these.
