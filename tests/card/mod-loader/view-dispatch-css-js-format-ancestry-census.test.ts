// view-dispatch-css-js-format-ancestry-census.test.ts - the css/js format
// PARENT survey pin (css-js-format-parents, 2026-10-01): the gem
// survey that corrected HTML_DESCENDED_FORMATS (mod-loader.ts) plus the
// census that makes the correction byte-neutral on this codebase.
//
// THE SURVEY (every format class in the loaded gems, parent at file:line —
// full-disk grep over C:/Ruby33-x64/lib/ruby/gems/3.3.0/gems/card*, one
// `class XFormat < Y` sweep; card-mod-content-0.20.0 and
// card-mod-follow-0.20.0 define none):
//
//   Card::Format        (base)        card-1.110.0 lib/card/format.rb:16
//   HtmlFormat          < Format      card-mod-format-0.20.0 .../html_format.rb:6   register :html :7
//   CssFormat           < Format      card-mod-format-0.20.0 .../css_format.rb:6    register :css :7
//   ScssFormat          < CssFormat   card-mod-format-0.20.0 .../scss_format.rb:6   register :scss :7
//   JsFormat            < Format      card-mod-format-0.20.0 .../js_format.rb:6     register :js :7
//   RssFormat           < HtmlFormat  card-mod-format-0.20.0 .../rss_format.rb:6    register :rss :7
//   CsvFormat           < Format      card-mod-format-0.20.0 .../csv_format.rb:6    register :csv :7
//   DataFormat          < Format      card-mod-format-0.20.0 .../data_format.rb:3   (abstract, no register)
//   FileFormat          < Format      card-mod-format-0.20.0 .../file_format.rb:5   (abstract, no register)
//   JsonFormat          < DataFormat  card-mod-format-0.20.0 .../json_format.rb:6   register :json :7
//   JsonldFormat        < JsonFormat  card-mod-format-0.20.0 .../jsonld_format.rb:4 register :jsonld :6
//   TextFormat          < Format      card-mod-format-0.20.0 .../text_format.rb:6   register :text/:txt :7-9
//   XmlFormat           < DataFormat  card-mod-format-0.20.0 .../xml_format.rb:6    register :xml :7
//   YamlFormat          < DataFormat  card-mod-format-0.20.0 .../yaml_format.rb:6   register :yaml/:yml :7-9
//   EmailHtmlFormat     < Card::Format::HtmlFormat  card-mod-email-0.20.0 .../email_html_format.rb:6 (alias email :7)
//   EmailTextFormat     < Card::Format::TextFormat  card-mod-email-0.20.0 .../email_text_format.rb:6
//
// The recorded modeling discrepancy: the port's pre-survey constant
// carried css/js as html-descended, but CssFormat/JsFormat subclass
// Format DIRECTLY — the html fallback was broader than Ruby for css/js
// chain misses (format_ancestry, registration.rb:60-65, is [self] +
// superclass chain and STOPS at Card::Format; include_set_format_modules,
// format.rb:57-63, includes exactly those classes' set-format modules).
// The constant now carries the surveyed truth {rss, email_html}.
//
// THE NO-OBSERVABLE CENSUS (why no byte rode the broader fallback):
// 1. No css/js chain REQUEST exists. The only non-html formatName the
//    render layer ever constructs is email_text (render/views.ts:1443
//    withFormatName — the text-message :core re-entry); formatName
//    defaults to "html" (render/format.ts:485) and every other
//    viewChain caller passes html or nothing (render.ts:1509 via
//    resolveView's default, mod-view-helpers.ts:124,
//    card-mod-search.ts:450, render.ts:1485). The css/scss/js ASSET
//    bytes never enter viewChain: they are the compile-engines leaf
//    seam (asset-input-assembly.ts:208-215 deps.renderInputView ->
//    sassc-coffeescript-compile-engines.ts compressCss/compileScss/
//    compileCoffeeScript/scriptCompressedView).
// 2. The composed deck registers ZERO css-keyed and ZERO scss-keyed
//    views (census below). The only js-keyed rows are tinymce_editor's
//    two all-set nest_image views — which Ruby files under JsFormat
//    (nest_image.rb:40-59 `format :js`, register_all_set_format,
//    set/format.rb:133-137) and the port dispatches through the FLAT
//    record on html requests (render.ts:1519 this.views[view] — the
//    flat-table-format-scope port's adjudicated surface, pinned by
//    card-mod-tinymce_editor.test.ts:325), never through this
//    fallback.
// 3. The base tail is shared by both shapes: a base-keyed registration
//    is visible to the html chain (through its own base-tail recursion)
//    AND to a css/js chain post-fix — the follow mod's
//    last_action_verb row pins that equality below.
// The canonical net on the fix commit is byte-identical
// (683 passed / 4 expected fail / 12 skipped / 0 failed), the
// empirical half of the no-observable proof; the probes here are the
// structural half.
//
// THE GUARD: a future css/js-keyed registration or a css/js chain
// request FAILS here and names itself — the re-adjudication signal for
// any surface that would make the constant's breadth observable.

import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { ModLoader } from "../../../src/card/mod-loader.js";
import {
  defaultDeckSources,
  portedBundleOrder,
} from "../../../src/card/mod-loader/default-mod-deck.js";
import { setModuleShortname, setPathPattern } from "../../../src/card/mod-loader/mod-registrar.js";
import type { DeckoModManifest, ModSetModuleFile } from "../../../src/card/mod-loader/mod-manifest.js";

/** The surveyed Ruby format classes: registered format name -> the
 *  name's Ruby ancestry as format KEYS (nearest first, base last — the
 *  include_set_format_modules order, format.rb:57-63). Sourced from the
 *  table in the header; the keys are what a Ruby-faithful view chain
 *  must consult, in this order. */
const RUBY_FORMAT_ANCESTRY: Record<string, string[]> = {
  html: ["html", "base"],
  css: ["css", "base"],
  scss: ["scss", "css", "base"],
  js: ["js", "base"],
  rss: ["rss", "html", "base"],
  csv: ["csv", "base"],
  json: ["json", "data", "base"],
  jsonld: ["jsonld", "json", "data", "base"],
  text: ["text", "base"],
  xml: ["xml", "data", "base"],
  yaml: ["yaml", "data", "base"],
  email_html: ["email_html", "html", "base"],
  email_text: ["email_text", "text", "base"],
};

/** The registered names whose ancestry passes through HtmlFormat — what
 *  HTML_DESCENDED_FORMATS must contain (mod-loader.ts). */
function rubyHtmlDescended(): string[] {
  return Object.entries(RUBY_FORMAT_ANCESTRY)
    .filter(([, chain]) => chain.includes("html") && chain[0] !== "html")
    .map(([name]) => name)
    .sort();
}

interface CensusEntry {
  readonly mod: string;
  readonly setPath: string;
  readonly shortname: string;
  readonly kind: "base" | "abstract" | "nonbase";
  readonly formatKey: string;
  readonly view: string;
}

function kindOfSetPath(setPath: string): "base" | "abstract" | "nonbase" {
  const pattern = setPathPattern(setPath);
  if (pattern === "all") return "base";
  if (pattern === "abstract") return "abstract";
  return "nonbase";
}

/** The full registration surface of the composed deck, walked exactly the
 *  way mod-loader.ts:302-330 walks it (file.formats x formatBlock.views). */
function censusEntries(): CensusEntry[] {
  const out: CensusEntry[] = [];
  for (const source of defaultDeckSources()) {
    const manifest: DeckoModManifest = source.manifest;
    for (const file of manifest.setModules ?? ([] as readonly ModSetModuleFile[])) {
      const shortname = setModuleShortname(file.setPath);
      const kind = kindOfSetPath(file.setPath);
      for (const [formatKey, formatBlock] of Object.entries(file.formats ?? {})) {
        for (const view of formatBlock?.views ?? []) {
          out.push({
            mod: manifest.name,
            setPath: file.setPath,
            shortname,
            kind,
            formatKey,
            view: view.view,
          });
        }
      }
    }
  }
  return out;
}

describe("css/js format ancestry census (the survey + its no-observable pin)", () => {
  it("Ruby's html-descended registered formats are exactly rss and email_html", () => {
    // The survey's one-line verdict: CssFormat/JsFormat subclass Format
    // DIRECTLY (css_format.rb:6, js_format.rb:6), so the pre-survey
    // constant's css/js entries had no Ruby counterpart. This assertion
    // is the corrected expectation the constant must track.
    expect(rubyHtmlDescended()).toEqual(["email_html", "rss"]);
  });

  it("css/js/scss never share a method table with html; rss/email_html always do", () => {
    expect(RUBY_FORMAT_ANCESTRY.css).toEqual(["css", "base"]);
    expect(RUBY_FORMAT_ANCESTRY.js).toEqual(["js", "base"]);
    expect(RUBY_FORMAT_ANCESTRY.scss).toEqual(["scss", "css", "base"]);
    expect(RUBY_FORMAT_ANCESTRY.rss).toEqual(["rss", "html", "base"]);
    expect(RUBY_FORMAT_ANCESTRY.email_html).toEqual(["email_html", "html", "base"]);
    // the text lineage stays off the html table too (the email-text-
    // remainders port's tail shape)
    expect(RUBY_FORMAT_ANCESTRY.email_text).toEqual(["email_text", "text", "base"]);
  });

  it("composed-deck census: the format-key universe is exactly the measured six", () => {
    // Measured on this tree (job-1790896607499, this suite's census dump):
    // base=5 email_html=2 email_text=3 html=312 js=2 json=3. No css, no
    // scss, no rss, no csv/text/xml/yaml rows exist. A NEW key (or a
    // css/scss row) fails here and names itself.
    const entries = censusEntries();
    const counts = new Map<string, number>();
    for (const e of entries) counts.set(e.formatKey, (counts.get(e.formatKey) ?? 0) + 1);
    expect([...counts.entries()].sort()).toEqual([
      ["base", 5],
      ["email_html", 2],
      ["email_text", 3],
      ["html", 312],
      ["js", 2],
      ["json", 3],
    ]);
  });

  it("composed-deck census: zero css-keyed and zero scss-keyed registrations", () => {
    // The css/scss render bytes live in the compile-engines leaf seam
    // (asset-input-assembly.ts:208-215 -> sassc-coffeescript-compile-
    // engines.ts), never in the chain — the structural half of why no
    // css/js chain request can observe the constant.
    const entries = censusEntries();
    expect(entries.filter((e) => e.formatKey === "css").map((e) => `${e.mod} ${e.setPath} :${e.view}`)).toEqual([]);
    expect(entries.filter((e) => e.formatKey === "scss").map((e) => `${e.mod} ${e.setPath} :${e.view}`)).toEqual([]);
  });

  it("composed-deck census: the js-keyed rows are exactly tinymce's two nest_image views", () => {
    // Ruby files these under JsFormat ONLY (nest_image.rb:40-59
    // `format :js` on the ALL set -> register_all_set_format,
    // set/format.rb:133-137). The port serves them from the FLAT record
    // on html requests (render.ts:1519; card-mod-tinymce_editor.test.ts
    // :325) — a js-keyed row landing ANYWHERE ELSE (or a third row)
    // re-adjudicates the constant's js arm.
    const entries = censusEntries();
    expect(
      entries
        .filter((e) => e.formatKey === "js")
        .map((e) => `${e.mod} ${e.setPath} :${e.view}`)
        .sort(),
    ).toEqual([
      "tinymce_editor all/reference_editor/nest_image :change_create_to_update",
      "tinymce_editor all/reference_editor/nest_image :open_nest_editor",
    ]);
  });

  it("composed-deck census: the base-kind base-keyed row is exactly follow's last_action_verb", () => {
    // The email-text-remainders port's tail row, re-measured (the four
    // OTHER base-keyed rows are abstract-kind search rows, a different
    // dispatch arm). Shared by html and css/js chains alike — the
    // both-ways-green row.
    const entries = censusEntries();
    expect(
      entries
        .filter((e) => e.kind === "base" && e.formatKey === "base")
        .map((e) => `${e.mod} ${e.setPath} :${e.view}`),
    ).toEqual(["follow all/notify/base_views :last_action_verb"]);
  });
});

describe("css/js chain scoping on the composed deck (post-fix behavior)", () => {
  let loader: ModLoader | undefined;

  beforeAll(() => {
    // chain-table queries only: no engine binding, process defaults
    // untouched (the default-mod-deck.test.ts isolation pattern)
    loader = new ModLoader(defaultDeckSources());
    loader.resolveOrder({ gemMods: portedBundleOrder() });
    loader.load();
  }, 120_000);

  afterAll(() => {
    loader?.reset();
  });

  it("a css/js chain miss for :last_action is EMPTY — the html row is invisible to CssFormat/JsFormat", () => {
    // THE corrected-expectation pin. Pre-fix the css/js arms fell back
    // to the html chain and returned All::History::Views' row — the
    // broader-than-Ruby answer (Ruby's CssFormat method table never
    // included it). Post-fix a css/js miss lands on the base tail,
    // which has no :last_action row. This test FAILS on the pre-fix
    // constant by design.
    const css = loader!.viewChain("ALL", "last_action", "css").map((e) => e.setModule);
    const js = loader!.viewChain("ALL", "last_action", "js").map((e) => e.setModule);
    expect(css).toEqual([]);
    expect(js).toEqual([]);
    // the rows the other lineages DO see (the same walk, correct arms):
    expect(loader!.viewChain("ALL", "last_action", "html").map((e) => e.setModule)).toEqual([
      "All::History::Views",
    ]);
    expect(loader!.viewChain("ALL", "last_action", "email_text").map((e) => e.setModule)).toEqual([
      "All::EmailText",
    ]);
  });

  it("the base tail is format-shared: css chain of :last_action_verb carries the base row, never the html-keyed one", () => {
    // The no-byte-moved pin, in its measured shape: the follow mod's
    // base-keyed row reaches the css chain through the base tail, and
    // the html chain carries BOTH it and History's html-keyed arm —
    // the html-keyed row is EXACTLY what Ruby's CssFormat method table
    // never included (and what the pre-fix fallback wrongly handed css;
    // no css chain request exists to observe the difference).
    const css = loader!.viewChain("ALL", "last_action_verb", "css").map((e) => e.setModule);
    const html = loader!.viewChain("ALL", "last_action_verb", "html").map((e) => e.setModule);
    expect(css).toEqual(["All::Notify::BaseViews"]);
    expect(html).toEqual(["All::History::Views", "All::Notify::BaseViews"]);
  });

  it("the js-keyed tinymce rows answer a JS chain and no other format's chain", () => {
    // JsFormat's method table is its own: the js request finds the row
    // in the own-format pass (no fallback involved); the html chain
    // does NOT (the html bytes come from the flat record at
    // render.ts:1519 — the flat-table lane's surface); the text
    // lineage never sees it.
    expect(
      loader!.viewChain("ALL", "open_nest_editor", "js").map((e) => e.setModule),
    ).toEqual(["All::ReferenceEditor::NestImage"]);
    expect(loader!.viewChain("ALL", "open_nest_editor", "html")).toEqual([]);
    expect(loader!.viewChain("ALL", "open_nest_editor", "email_text")).toEqual([]);
    expect(
      loader!.viewChain("ALL", "change_create_to_update", "js").map((e) => e.setModule),
    ).toEqual(["All::ReferenceEditor::NestImage"]);
  });
});
