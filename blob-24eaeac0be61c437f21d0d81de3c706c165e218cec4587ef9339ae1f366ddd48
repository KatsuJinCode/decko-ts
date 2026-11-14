// Byte-parity tests for the SCSS compile seam: the engine's compiled css must
// match the bytes the deck's SassC render emits (LibSass 3.6.4), not merely
// be semantically equivalent. The seam runs the real LibSass program
// (tools/libsass), so these tests exercise that program directly.
//
// Ground truth, all measured against the REAL engines:
// - the unit expectations below are libsass 3.6.4 renders (sassc-2.4.0 gem,
//   SassC::VERSION 2.4.0);
// - the corpus sweep compares the full oracle fixture
//   fixtures/captured/compile-engines.json (captured in the live decko
//   0.20.0 oracle app) against our pipeline output for EVERY sass pin in
//   BOTH styles.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { ensureLibsassProgram } from "../../../tests/support/libsass-program.js";
import { sasscRender } from "../../../src/card/mod-loader/sassc-coffeescript-compile-engines.js";

beforeAll(() => {
  ensureLibsassProgram();
}, 600_000);

/** [label, source, style, the exact bytes libsass 3.6.4 emits] */
const UNIT_PINS: Array<[string, string, "compressed" | "expanded", string]> = [
  // numbers: libsass preserves the authored token; dart canonicalizes
  ["pos-zero compressed", "a{m:0.6rem}", "compressed", "a{m:0.6rem}\n"],
  ["neg-dot compressed", "a{m:-.25em}", "compressed", "a{m:-.25em}\n"],
  ["neg-zero compressed", "a{m:-0.25em}", "compressed", "a{m:-0.25em}\n"],
  ["pos-dot expanded", "a{m:.6rem}", "expanded", "a {\n  m: .6rem;\n}\n"],
  ["trailing zero compressed", "a{m:0.50px}", "compressed", "a{m:0.50px}\n"],
  ["trailing integer compressed", "a{m:10.0px}", "compressed", "a{m:10.0px}\n"],
  ["exponent form compressed", "a{m:1e3px}", "compressed", "a{m:1e3px}\n"],
  // scss variable values take libsass's canonical path (zero flag forced at
  // the deref): compressed strips the leading zero on BOTH signs
  ["var pos compressed", "$x:0.6rem; a{m:$x}", "compressed", "a{m:.6rem}\n"],
  ["var neg compressed", "$x:-.25em; a{m:$x}", "compressed", "a{m:-.25em}\n"],
  ["var neg expanded", "$x:-.25em; a{m:$x}", "expanded", "a {\n  m: -0.25em;\n}\n"],
  // arithmetic results are canonical on both engines (no adapter action)
  ["arith neg compressed", "a{m:-.25em*2}", "compressed", "a{m:-0.5em}\n"],
  // colors: authored keyword/hex/case preserved
  ["color keyword compressed", "a{b:black}", "compressed", "a{b:black}\n"],
  ["color hex6 compressed", "a{b:#ffffff}", "compressed", "a{b:#ffffff}\n"],
  ["color hex case compressed", "a{b:#AAAAAA}", "compressed", "a{b:#AAAAAA}\n"],
  [
    "same-value color forms restore occurrence-by-occurrence",
    "a{b:#ccc}b{c:#cccccc}",
    "compressed",
    "a{b:#ccc}b{c:#cccccc}\n",
  ],
  ["transparent compressed", "a{b:transparent}", "compressed", "a{b:transparent}\n"],
  // inside color functions libsass canonicalizes (dart strips the zero)
  ["rgba alpha compressed", "a{b:rgba(0,0,0,.5)}", "compressed", "a{b:rgba(0,0,0,0.5)}\n"],
  // calc inner: authored-verbatim minus padding before the closing paren
  ["calc padding compressed", "a{w:calc( 100% - 2.4em )}", "compressed", "a{w:calc( 100% - 2.4em)}\n"],
  ["calc unpadded compressed", "a{w:calc(100% - 2.4em)}", "compressed", "a{w:calc(100% - 2.4em)}\n"],
  // attribute selectors: quotes (and quote character) preserved
  ["attr quoted compressed", '[class^="bi-"]{a:b}', "compressed", '[class^="bi-"]{a:b}\n'],
  ["attr single-quote compressed", "[a='x y']{a:b}", "compressed", "[a='x y']{a:b}\n"],
  ["attr unquoted compressed", "[class^=bi-]{a:b}", "compressed", "[class^=bi-]{a:b}\n"],
  // string escapes: authored text (and case) preserved
  ["escape 4hex compressed", 'a{content:"\\f67f"}', "compressed", 'a{content:"\\f67f"}\n'],
  ["escape case compressed", 'a{content:"\\F67F"}', "compressed", 'a{content:"\\F67F"}\n'],
  ["escape 6hex compressed", 'a{content:"\\1F600"}', "compressed", 'a{content:"\\1F600"}\n'],
  ["escape 4hex expanded", 'a{content:"\\f67f"}', "expanded", 'a {\n  content: "\\f67f";\n}\n'],
  // literal non-ASCII: compressed BOM / expanded @charset "UTF-8";
  ["literal accent compressed", 'a{content:"café"}', "compressed", "﻿a{content:\"café\"}\n"],
  [
    "literal accent expanded charset",
    'a{b:"é"}',
    "expanded",
    '@charset "UTF-8";\na {\n  b: "é";\n}\n',
  ],
  // selectors: libsass re-emits compounds in category order
  [
    "compound reorder compressed",
    "a:link.ui-button{c:d}",
    "compressed",
    "a.ui-button:link{c:d}\n",
  ],
  ["compound reorder expanded", "a:link.ui-button{c:d}", "expanded", "a.ui-button:link {\n  c: d;\n}\n"],
  ["two pseudos after class", "a:focus:hover.b{c:d}", "compressed", "a.b:focus:hover{c:d}\n"],
  ["pseudo-element after class", "a::before.x{c:d}", "compressed", "a.x::before{c:d}\n"],
  ["functional pseudo after class", "a:not(.x).y{c:d}", "compressed", "a.y:not(.x){c:d}\n"],
  ["attr before pseudo", "[x=y]:hover.z{c:d}", "compressed", ".z[x=y]:hover{c:d}\n"],
  ["already ordered compound", "#i.c:hover{c:d}", "compressed", "#i.c:hover{c:d}\n"],
  // expanded separation: blank line between ALL top-level nodes (incl. rules
  // hoisted from nesting and after a media block)
  [
    "hoisted siblings blank-line",
    "a{x{c:d}y{e:f}}",
    "expanded",
    "a x {\n  c: d;\n}\n\na y {\n  e: f;\n}\n",
  ],
  [
    "media block then rule blank-line",
    "@media m{a{b:c}}\ng{h:i}",
    "expanded",
    "@media m {\n  a {\n    b: c;\n  }\n}\n\ng {\n  h: i;\n}\n",
  ],
  [
    "comment-only rule renders multi-line",
    "a{/*c*/x{c:d}y{e:f}}",
    "expanded",
    "a {\n  /*c*/\n}\n\na x {\n  c: d;\n}\n\na y {\n  e: f;\n}\n",
  ],
  // untouched shapes (regression guards)
  ["empty rule dropped", "a{}\nb{c:d}", "compressed", "b{c:d}\n"],
  ["loud comment untouched", "/*! k */a{b:c}", "compressed", "/*! k */a{b:c}\n"],
  [
    "decko nest in url untouched",
    "a{background:url([[http://x/?24e3]])}",
    "compressed",
    "a{background:url([[http://x/?24e3]])}\n",
  ],
];

describe("SCSS compile seam (LibSass) - oracle-measured unit pins", () => {
  for (const [label, source, style, expected] of UNIT_PINS) {
    it(`${label} [${style}]`, () => {
      expect(sasscRender(source, style)).toBe(expected);
    });
  }
});

describe("SCSS compile seam (LibSass) - full oracle corpus sweep", () => {
  const FIXTURE = JSON.parse(
    readFileSync(
      fileURLToPath(new URL("../../../fixtures/captured/compile-engines.json", import.meta.url)),
      "utf8",
    ),
  ) as {
    compile_pins: Array<{
      relative_path: string;
      kind: string;
      source: string;
      sassc_compressed?: string;
      sassc_expanded?: string;
    }>;
  };

  it("every sass pin compiles byte-identically to the recorded libsass bytes in BOTH styles", () => {
    let checked = 0;
    for (const pin of FIXTURE.compile_pins) {
      if (!["css", "scss"].includes(pin.kind)) continue;
      for (const [style, oracle] of [
        ["compressed", pin.sassc_compressed],
        ["expanded", pin.sassc_expanded],
      ] as const) {
        if (typeof oracle !== "string") continue;
        if (oracle.startsWith("CAPTURE_ERROR")) {
          // libsass rejects the source; the port must reject it too
          expect(() => sasscRender(pin.source, style), pin.relative_path).toThrow();
          checked++;
          continue;
        }
        expect(sasscRender(pin.source, style), `${pin.relative_path} [${style}]`).toBe(oracle);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(10);
  });
});
