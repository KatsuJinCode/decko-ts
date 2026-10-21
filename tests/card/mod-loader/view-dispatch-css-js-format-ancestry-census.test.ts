// Current surface: stock set/all/css.rb's five CSS views are registered;
// SCSS inherits them through the surveyed format ancestry. The no-observable
// discussion below records the historical pre-CSS-view implementation.
// view-dispatch-css-js-format-ancestry-census.test.ts - the css/js format
// PARENT survey pin (css-js-format-parents, 2026-10-01): the gem
// survey that corrected HTML_DESCENDED_FORMATS (mod-loader.ts) plus the
// census that makes the correction byte-neutral on this codebase.
//
// THE SURVEY (every format class in the loaded gems, parent at file:line —
// a `class XFormat < Y` sweep over the card* gem trees under the local
// interpreter's gem path (GEM_HOME, or its default gem dir); card-mod-content
// -0.20.0 and card-mod-follow-0.20.0 define none):
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

  it("composed-deck census: the format-key universe includes the stock text core", () => {
    // Measured on this tree (job-1790896607499, this suite's census dump):
    // base=5 email_html=2 email_text=3 html=312 js=2 json=3. No css, no
    // scss, no rss, no csv/text/xml/yaml rows exist. A NEW key (or a
    // css/scss row) fails here and names itself. base 5 -> 7 and html
    // 312 -> 324: the style family's ten html-keyed registrations +
    // abstract/style_group row landed at its own commit (8b56256) without
    // this re-bump (html +10, base-keyed 0), and wave-1's follow family
    // added the two base-keyed all/notify/base_views rows (:subedit_notice
    // + :follower) and the two html-keyed set views (:rule_editor,
    // :errors) - html +12, base +2 total.

    const entries = censusEntries();
    const counts = new Map<string, number>();
    for (const e of entries) counts.set(e.formatKey, (counts.get(e.formatKey) ?? 0) + 1);
    expect([...counts.entries()].sort()).toEqual([
      // 9 -> 33, html 361 -> 339 (2026-10-15): card-mod-format s all/base
      // and all/content views filed under their Ruby format block. Ruby s
      // `format do` block (base.rb:85-90 :core/:content, the name/date
      // rows) files its module on Card::Format itself, so every format
      // inherits it (format.rb format_ancestry); the html key they sat under
      // made them unreachable from json/csv/js and mis-served rss. Still no
      // new format key and no css/scss row. Measured on this tree.
      // 33 -> 35, html 339 -> 338 (2026-10-15): all/error's :not_found and
      // :bad_address are `format do` (base) views, and the csv/file/js/yaml
      // keys carry the format-block views each. Measured on this tree.
      // right/salt.rb:13-15 declares :raw outside any format block. The
      // account mod now ports that base declaration (Private data).
      ["base", 36],
      // The five views declared by stock set/all/css.rb.
      // RE-PIN 2026-10-20 (mods tranche 4): css 5 -> 6. The sixth row
      // is `style type/skin :concat` (card-mod-style set/type/skin.rb:5-11,
      // `format :css do view :concat`), registered this tranche - the only
      // css-keyed registration outside card-mod-format s all/css. No other
      // format key moves. Measured on this tree.
      ["css", 6],
      ["csv", 4],
      // json 4 -> 8 and the new data key 10 (2026-10-15): json.rb's status,
      // items, molecule and page views, and data.rb's ten views (json and
      // yaml inherit data, json_format.rb / yaml_format.rb). Measured on this tree.
      ["data", 10],
      // email_html 2 -> 3 (the mods-tranche3 lane, 2026-10-20): email's
      // abstract/test_context registers the gem file's second format
      // block (card-mod-email-0.20.0 set/abstract/test_context.rb:21-25,
      // `format :email_html do view :core do process_content render_raw
      // end`). email_html keeps its html-descended ancestry
      // (RUBY_FORMAT_ANCESTRY.email_html, :168) — the census's subject.
      // Measured on this tree.
      ["email_html", 3],
      ["email_text", 3],
      ["file", 2],
      // fold-10 union measurement: the signin fix pick (4d7b008) landed its
      // registration surface on top of the wave-1 line; the composed-deck
      // census MEASURES 329 on the merged tree (324 wave-1 tip + 5 net-new
      // html-keyed registrations the fix carries).
      // mod-completion-100 re-bump (core reds lane, 2026-10-06): 329 -> 338.
      // Nine more html-keyed registrations landed AFTER the 329 pin, all
      // mod-port surface, no new format key, still zero css/scss rows:
      // 09cc26e3 (account walk) + right/account/views :content_formgroups,
      // + type/sign_up/views :content_formgroups, + type/user :setup;
      // b0a0d5e6 (tinymce chrome) + the six all/reference_editor
      // nest_editor/nest_image chrome views. Measured on both trees with
      // the same dump probe: exactly 329 at 4a2a035f (this pin's own
      // cause-commit), exactly 338 at the current tip — the diff is
      // precisely those nine rows.
      // 338 -> 341 (semantics parity, 2026-10-07): carrierwave registers
      // :source/:core/:inline/:one_line_content on their Ruby type sets
      // instead of one all-set fold module. 341 -> 344: :board/:cardboard
      // move to All::Editing (no count change) and the html :type
      // (All::Html, Type::Cardtype) and :labeled (All::Html::Views) arms
      // are registered on the modules Ruby defines them in.
      // 344 -> 354 (integration of the semantics branch with the speed,
      // persistence and Cloudflare lines, 2026-10-08): measured on the
      // merged tree. The semantics pin above was taken on a base that
      // lacked the registrations the other lines had added meanwhile;
      // still no new format key and no css/scss row.
      // 354 -> 355 (semantics-part3 integration, 2026-10-08): All::Html::
      // Error's production :server_error (4b7b1338's error-page ruling,
      // debug_server_error's renderer twin), measured on the merged tree;
      // still no new format key and no css/scss row.
      // 355 -> 356 (composed-mod view gaps, 2026-10-09): All::Error's html
      // table registers :mini_unknown (html/error.rb:21-23, the icon-only
      // createable link) explicitly alongside :unknown's html arm, so the
      // composed deck serves the same bytes the flat base table serves.
      // 356 -> 358 on the combined tree: THREE single-step registrations
      // landed here — this line's composed-mod-view-gaps :mini_unknown
      // (html/error.rb:21-23), the journeys lane's Right::Password :input
      // (the account form's password editor, probe-password-input.rb), and
      // the mod-view-gaps wave-2 slice's FOLLOW_TABS :core (user/follow.rb:
      // 39-43, card-mod-tabs over the static hash); still no new format key
      // and no css/scss row. Measured on the merged tree.
      // 358 -> 359 (the search cluster, 2026-10-11): the search mod's SELF
      // set registers view :core explicitly (search.rb:45 — the *search
      // page's own renders dispatch the keyword header composed with the
      // card list); still no new format key and no css/scss row. Measured
      // on the merged tree.
      // 359 -> 360 html unchanged, json 3 -> 4 (the typeahead-edge lane,
      // 2026-10-11): the search mod's SELF set registers view
      // :search_box_complete on the JSON arm (search.rb:70-72 — the
      // navbox typeahead's JSON the engine now serves); no new format key
      // and no css/scss row. Measured on this tree.
      // Four stock declarations recovered since the prior census:
      // bootstrap type_plus_right/bootswatch_skin/colors input/core,
      // layout self/head core, and follow type_plus_right/user/follow edit.
      // 342 -> 346 (the mods-first-half lane, 2026-10-19): FOUR html-keyed
      // registrations on nonbase sets, each a real landed view - account
      // self/signin :open (self/signin.rb:127-131, d335734e), assets
      // right/group_remote :core (group_remote.rb:40-42, 7cdb0502), and the
      // manifest-group :core pair on type/local_{script,style}_manifest_group
      // (01_manifest_group.rb:4-6, registered on the abstract's concrete
      // includers, 7cdb0502). No new format key, no css/scss row, and no
      // base/abstract-kind movement (the flat-record census's base/abstract
      // counts did not move for these four - nonbase sets only). Measured
      // on the merged tree.
      // 346 -> 347 (the v8 roll, 2026-10-21): ONE html-keyed registration
      // landed with the matrix-journey tranche-4 merge - follow
      // right/following :core (right/following.rb:13-19, the two-armed
      // view: the signed-in rule_editor, the signed-out nest of the LEFT's
      // "+*followers" junction). No new format key and no css/scss row.
      // Measured on the merged tree (the census run reports 347).
      ["html", 347],

      // js 3 -> 4 (the mods-tranche6 lane, 2026-10-20): the fourth row is
      // `script abstract/00_script :compressed` (card-mod-script
      // set/abstract/00_script.rb:9-12, `format :js do view :compressed`),
      // registered under the manifest's js format key on the abstract
      // module. Measured on this tree.
      ["js", 4],
      // self/search.rb:74-78 adds :complete alongside :search_box_complete
      // in JsonFormat; f0a92be0 ports this declaration without a new key.
      // json 9 -> 10 and the deck's FIRST jsonld key (the mods-first-half
      // lane, 2026-10-19): collection's abstract/paging/paging_views files
      // :paging_urls under its Ruby json (paging_views.rb:86-93) and jsonld
      // (paging_views.rb:107-119) format blocks - the hydra
      // PartialCollectionView pair (50017d73). Measured on the merged tree.
      // json 10 -> 11 (the mods-tranche3 lane, 2026-10-20): list's
      // abstract/01_list/other_views :links (card-mod-list-0.20.0
      // set/abstract/01_list/other_views.rb:59-61, `[]`), the abstract
      // module's first json-keyed view. json keeps its data-lineage
      // ancestry (json_format.rb), which is this census's subject.
      // Measured on this tree.
      ["json", 13],
      ["jsonld", 4],
      // rss.rb's nine non-XML declarations (including captured aliases).
      ["rss", 9],
      // Stock all/text.rb registers one TextFormat core override.
      ["text", 1],
      ["yaml", 1],
    ]);
  });

  it("composed-deck census: all/css's five Ruby CSS views plus style type/skin :concat", () => {
    // RE-PIN 2026-10-20 (mods tranche 4): the row list gains
    // `style type/skin :concat` and the test title follows the count.
    // Ruby's css-keyed declarations in the pinned gemset are exactly these
    // six: all/css.rb:11-29 (:titled :content :unknown :import :url) and
    // type/skin.rb:5-11 (:concat) - the style abstract s :import
    // (abstract/01_css.rb:48-50) is an OVERRIDE of all/css's, and it is a
    // named skip because the port's css chain orders the all-set ahead of
    // the abstract (see
    // tests/card/mod-loader/card-mod-style-css-view-blocker.test.ts), so a
    // seventh row here would be one whose body never renders.
    const entries = censusEntries();
    expect(entries.filter((e) => e.formatKey === "css").map((e) => `${e.mod} ${e.setPath} :${e.view}`)).toEqual([
      "format all/css :titled", "format all/css :content", "format all/css :unknown",
      "format all/css :import", "format all/css :url", "style type/skin :concat",
    ]);
    expect(entries.filter((e) => e.formatKey === "scss").map((e) => `${e.mod} ${e.setPath} :${e.view}`)).toEqual([]);
  });

  it("composed-deck census: the js-keyed rows are exactly tinymce's two nest_image views, format all/js :source, and script abstract/00_script :compressed", () => {
    // Ruby files these under JsFormat ONLY (nest_image.rb:40-59
    // `format :js` on the ALL set -> register_all_set_format,
    // set/format.rb:133-137). The port serves them from the FLAT record
    // on html requests (render.ts:1519; card-mod-tinymce_editor.test.ts
    // :325) — a js-keyed row landing ANYWHERE ELSE (or a fifth row)
    // re-adjudicates the constant's js arm.
    // The script row is NOT served from the flat record: its registration
    // sits on the ABSTRACT module under the js key, so it answers a js
    // chain (card-mod-script-compressed.test.ts drives it with format "js")
    // and is invisible to html.
    const entries = censusEntries();
    expect(
      entries
        .filter((e) => e.formatKey === "js")
        .map((e) => `${e.mod} ${e.setPath} :${e.view}`)
        .sort(),
    ).toEqual([
      "format all/js :source",
      "script abstract/00_script :compressed",
      "tinymce_editor all/reference_editor/nest_image :change_create_to_update",
      "tinymce_editor all/reference_editor/nest_image :open_nest_editor",
    ]);
  });

  it("composed-deck census: the base-kind base-keyed rows are follow's five notify views plus card-mod-format's base-block rows", () => {
    // The email-text-remainders port's tail row, re-measured (the four
    // OTHER base-keyed rows are abstract-kind search rows, a different
    // dispatch arm). Shared by html and css/js chains alike — the
    // both-ways-green rows. Wave-1's follow family added :subedit_notice
    // + :follower to the same base-keyed all/notify/base_views module
    // (all/notify/base_views.rb's bare `format do` block); the miscpins
    // lane's notification-views round adds :list_of_changes + :subedits
    // on the same module. Measured on the merged tree.
    // + card-mod-format's all/base and all/content rows (2026-10-15): the
    // Ruby `format do` blocks (base.rb:85-90 :core/:content + the name/date/
    // url rows; content.rb base-block :label/:closed_content/:smart_label)
    // file on Card::Format, which every format inherits; they had been
    // filed under html. Measured on this tree.
    const entries = censusEntries();
    expect(
      entries
        .filter((e) => e.kind === "base" && e.formatKey === "base")
        .map((e) => `${e.mod} ${e.setPath} :${e.view}`)
        .sort(),
    ).toEqual([
      "follow all/notify/base_views :follower",
      "follow all/notify/base_views :last_action_verb",
      "follow all/notify/base_views :list_of_changes",
      "follow all/notify/base_views :subedit_notice",
      "follow all/notify/base_views :subedits",
      "format all/base :acted_at",
      "format all/base :blank",
      "format all/base :codename",
      "format all/base :content",
      "format all/base :core",
      "format all/base :created_at",
      "format all/base :id",
      "format all/base :id_url",
      "format all/base :key",
      "format all/base :labeled",
      "format all/base :labeled_content",
      "format all/base :link",
      "format all/base :linkname",
      "format all/base :name",
      "format all/base :nav_link",
      "format all/base :raw",
      "format all/base :titled_content",
      "format all/base :type",
      "format all/base :updated_at",
      "format all/base :url",
      "format all/base :url_link",
      "format all/content :closed_content",
      "format all/content :label",
      "format all/content :smart_label",
      "format all/error :bad_address",
      "format all/error :not_found",
    ]);
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
    // render.ts:1519 — the flat-table port's surface); the text
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
