// view-dispatch-flat-record-format-scope-census.test.ts - the FLAT-RECORD
// format-scope census: the anchored-scope port's census method
// (view-dispatch-anchored-cross-format-collision-census.test.ts) applied to
// the LAST format-blind dispatch surface that port recorded outside its
// scope - the flat last-wins record (mod-loader.ts registration seam, the
// `views.register` the engine's HTML_VIEWS object receives) - plus the
// empty-setKeys (abstract pseudo-pattern) chain arm's measured spans.
//
// Ruby ground truth: a bare `format do` block resolves format_class_name
// (:base) -> Card::Format (format/registration.rb:27-30) and an all-set
// module's block is filed under THAT resolved class
// (register_all_set_format, set/format.rb:137-139 ->
// Set.modules[:base_format][format_class]); process_base_format_modules
// (registrar.rb:79-84) mixes each class's list into the class ITSELF, so
// an html-keyed all-set module lands on HtmlFormat and a base-keyed one on
// Card::Format, the root every format inherits (format_ancestry,
// registration.rb:35-39). A foreign-keyed all-set module
// (email_text/email_html/json/js/...) lands on ITS class ONLY - an html
// render never sees it (HtmlFormat's ancestry holds no
// EmailTextFormat/JsonFormat/JsFormat) and subclass modules never
// back-propagate (EmailHtmlFormat < HtmlFormat, card-mod-email lib/card/
// format/email_html_format.rb:6). The port's flat record is the engine's
// HTML-VISIBLE table (render.ts `this.views = HTML_VIEWS` - the same
// object the ModLoader constructor receives), so admitting a foreign key
// there served that format's bytes to html renders that chain-missed -
// measured live on four green pins before the format filter landed:
// card-mod-email.test.ts's A/B :last_action ("edited" through the
// email_text arm), card-mod-search.test.ts's :select2_option (json bytes),
// card-mod-tinymce_editor.test.ts's :change_create_to_update and
// :open_nest_editor (js bytes). Ruby raises unsupported-view for every one
// (render.rb#view_method - the html class lacks the method); those pins
// now hold both directions (html rejects, own format renders the same
// bytes through its own class).
//
// THE CENSUS (this file): walk every ported mod manifest in the deck's
// oracle bundle order (default-mod-deck.ts, the same registration surface
// mod-loader.ts's phase-2 walk feeds) and enumerate, for the NON-nonbase
// set paths the flat seam admits (kindOfSetPath: "all" -> base,
// "abstract" -> abstract), every (set module, view, format key) row.
// RESULT on this codebase (measured): 168 flat-feeding rows - 143 base +
// 25 abstract - over keys {html, base, json, email_html, email_text, js};
// exactly 8 foreign rows (4 views' worth), 5 views whose flat feeders
// span more than one key, and 5 views whose empty-setKeys fallback set
// spans more than one key (18 further views span KINDS - the abstract
// pseudo-pattern arm's second dimension, reachable only from the
// viewChain("") test probes, never from src: safeSetKeys always carries
// the ALL token, registry.ts `applies: () => true`).
//
// The probes below pin that measured shape: a future mod that lands a new
// foreign-keyed all-set view (or widens any span) FAILS here and names
// the mod/set/view/key - the re-adjudication signal for both surfaces.

import { describe, expect, it } from "vitest";
import { defaultDeckSources, defaultDeckLoader } from "../../../src/card/mod-loader/default-mod-deck.js";
import { setModuleShortname, setPathPattern } from "../../../src/card/mod-loader/mod-registrar.js";
import type { DeckoModManifest, ModSetModuleFile } from "../../../src/card/mod-loader/mod-manifest.js";

/** mod-loader.ts kindOfSetPath: "all" -> base, "abstract" -> abstract,
 *  everything else nonbase. The flat seam admits the first two. */
function kindOfSetPath(setPath: string): "base" | "abstract" | "nonbase" {
  const pattern = setPathPattern(setPath);
  if (pattern === "all") return "base";
  if (pattern === "abstract") return "abstract";
  return "nonbase";
}

interface CensusEntry {
  readonly mod: string;
  readonly setPath: string;
  readonly shortname: string;
  readonly kind: "base" | "abstract" | "nonbase";
  readonly formatKey: string;
  readonly view: string;
}

/** The full registration surface of the composed deck, walked exactly the
 *  way mod-loader.ts's phase-2 walk walks it (file.formats x
 *  formatBlock.views, shortname via setModuleShortname). */
function censusEntries(): CensusEntry[] {
  const out: CensusEntry[] = [];
  for (const source of defaultDeckSources()) {
    const manifest: DeckoModManifest = source.manifest;
    for (const file of manifest.setModules ?? [] as readonly ModSetModuleFile[]) {
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

describe("flat-record format-scope census (composed deck)", () => {
  const entries = censusEntries();
  const flatFeeders = entries.filter((e) => e.kind !== "nonbase");

  it("census is non-vacuous: the composed deck registers all-set+abstract views", () => {
    // A broken walk (empty deck, wrong filter) must not read as "zero
    // foreign rows". Measured: 147 base + 29 abstract rows. The abstract
    // count moved 25 -> 28 when the surface-queue fold (1ab8318) landed
    // the list mod's select/multiselect/autocomplete editor registrations
    // (three all-set abstract-kind rows); base moved 143 -> 144 when the
    // mod-porting wave-1 lane (2026-10-03) registered :board_act on the
    // all-set all/history_board module (cache: never); 144/28 -> 145/29
    // at the style family's own commit (8b56256, the abstract/style_group
    // stylesheet_include_tag raising-arm row - the census re-bump that
    // receipt's "net run in flight" never landed); base moved 145 -> 147
    // when wave-1's follow family registered :subedit_notice + :follower
    // on the all-set all/notify/base_views module (base key); abstract
    // moved 29 -> 30 when wave-1's account family registered :account_tab
    // on the abstract-set abstract/account_holder module; base moved
    // 147 -> 153 when the mod-completion-100 lane (2026-10-03) registered
    // the six census chrome views (nest_editor, modal_nest_editor,
    // nest_content, nest_image, modal_nest_image, new_image) on the
    // all-set reference_editor modules (html key - admitted, not foreign).
    // 153 -> 149 (semantics parity, 2026-10-07): the all-set carrierwave fold
    // module and its four views moved to the Type::File/Type::Image sets;
    // 149 -> 151: All::Html's :type and All::Html::Views' :labeled.
    expect(flatFeeders.filter((e) => e.kind === "base")).toHaveLength(151);
    expect(flatFeeders.filter((e) => e.kind === "abstract")).toHaveLength(30);
  });

  it("the foreign-key flat rows are exactly the eight measured rows", () => {
    // The rows the format filter refuses (mod-loader.ts registration
    // seam): kind admitted, key not html/base. Ruby files each under its
    // own format class, invisible to HtmlFormat (header citations). A
    // NINTH foreign row lands here and names itself: the signal to
    // re-adjudicate the flat seam (and, for an all-set module, to check
    // whether the owning mod meant html).
    const foreign = flatFeeders.filter(
      (e) => e.formatKey !== "html" && e.formatKey !== "base",
    );
    expect(foreign).toHaveLength(8);
    expect(
      foreign
        .map(
          (e) => `${e.mod} ${e.setPath} :${e.view} key=${e.formatKey}`,
        )
        .sort(),
    ).toEqual([
      "email all/email_html :compact_missing key=email_html",
      "email all/email_html :unknown key=email_html",
      "email all/email_text :compact_missing key=email_text",
      "email all/email_text :last_action key=email_text",
      "email all/email_text :unknown key=email_text",
      "search all/autocomplete :select2_option key=json",
      "tinymce_editor all/reference_editor/nest_image :change_create_to_update key=js",
      "tinymce_editor all/reference_editor/nest_image :open_nest_editor key=js",
    ]);
  });

  it("flat feeders span more than one key for exactly five views", () => {
    // Where the flat record's last-wins ORDER picks between formats at
    // all. The winners after the filter are Ruby's html/base arms (the
    // loader-level probe below pins them by identity).
    const byView = new Map<string, CensusEntry[]>();
    for (const e of flatFeeders) {
      const list = byView.get(e.view) ?? [];
      list.push(e);
      byView.set(e.view, list);
    }
    const spanning = [...byView.entries()]
      .filter(([, list]) => new Set(list.map((e) => e.formatKey)).size > 1)
      .map(([view, list]) => `${view}: ${list.map((e) => `${e.shortname}:${e.formatKey}`).join(" | ")}`)
      .sort();
    expect(spanning).toEqual([
      "compact_missing: All::Error:html | All::EmailHtml:email_html | All::EmailText:email_text",
      "count: All::Item:html | Abstract::Search:base | Abstract::Search:html",
      "last_action: All::EmailText:email_text | All::History::Views:html",
      "last_action_verb: All::History::Views:html | All::Notify::BaseViews:base",
      "unknown: All::Error:html | All::EmailHtml:email_html | All::EmailText:email_text",
    ]);
  });

  it("the empty-setKeys fallback set spans more than one key for exactly five views", () => {
    // Surface 2 (the abstract pseudo-pattern arm, mod-loader.ts
    // viewChain's tokens.length === 0 branch): the arm returns EVERY
    // module that registered the view - any kind, any format key. Over
    // the composed deck the key-spanning fallback sets are these five
    // (all within kind base; the html+email_html+email_text trio of
    // compact_missing/unknown and the html-vs-email_text last_action are
    // the foreign-key reaches the flat-record filter removed from the
    // flat table but the arm still lists).
    const byView = new Map<string, CensusEntry[]>();
    for (const e of entries) {
      const list = byView.get(e.view) ?? [];
      list.push(e);
      byView.set(e.view, list);
    }
    const spanning = [...byView.entries()]
      .filter(([, list]) => new Set(list.map((e) => e.formatKey)).size > 1)
      .map(([view]) => view)
      .sort();
    expect(spanning).toEqual([
      "compact_missing",
      "count",
      "last_action",
      "last_action_verb",
      "unknown",
    ]);
  });

  it("the empty-setKeys fallback set spans more than one kind for exactly twenty-three views", () => {
    // The arm's SECOND dimension: abstract modules (Ruby: nonbase
    // registration, reachable only via include_set) mix with base and
    // nonbase modules in one chain. Unobservable from src (safeSetKeys
    // always carries ALL - registry.ts `applies: () => true`; the only
    // viewChain("") calls are the abstract-pseudo-pattern probes in
    // card-mod-content/default-mod-deck/view-dispatch-superview tests) -
    // pinned here so a widening registration names itself. Eighteen
    // views at the surface-queue fold; +stylesheet_include_tag at the
    // style family's own commit (8b56256, the abstract/style_group
    // raising-arm row, census re-bump folded here); +errors at wave-1's
    // follow family (the type_plus_right/user/follow :errors registration
    // joining the format mod's all-set :errors row); +new +new_buttons at wave-1's
    // account family (the signup :new / :new_buttons registrations joining
    // the edit mod's all-set rows of the same names); +content_formgroups
    // at the mod-completion-100 lane (the signup :content_formgroups
    // registration joining the edit mod's all-set row - the walk arms the
    // lane ported into the edit mod's contentFormgroupsView).
    const byView = new Map<string, CensusEntry[]>();
    for (const e of entries) {
      const list = byView.get(e.view) ?? [];
      list.push(e);
      byView.set(e.view, list);
    }
    const kindSpanning = [...byView.entries()]
      .filter(([, list]) => new Set(list.map((e) => e.kind)).size > 1)
      .map(([view]) => view)
      .sort();
    expect(kindSpanning).toEqual([
      "bar_middle",
      "content_formgroups",
      "count",
      "customize_button",
      "edit",
      "edit_buttons",
      "edit_inline",
      "errors",
      "help_text",
      "input",
      "javascript_include_tag",
      "new",
      "new_buttons",
      "not_found",
      "one_line_content",
      "overlay_title",
      "raw",
      "raw_one_line_content",
      "stylesheet_include_tag",
      "titled_content",
      "type",
      "url_link",
      "view_list",
    ]);
  });

  it("after a full-deck load the flat table holds only html/base arms and the chains still dispatch the foreign arms", () => {
    // The fix's teeth on the real deck. Before the format filter,
    // viewsTable()["select2_option"] was the json arm and
    // viewsTable()["compact_missing"/"unknown"] were the email_text arms
    // (last-registered wins); every html chain-miss dispatched those
    // bytes. After it the flat table carries Ruby's html/base arms and
    // the foreign arms remain reachable ONLY through their own format's
    // chain walk.
    const loader = defaultDeckLoader();
    const table = loader.viewsTable();
    // foreign keys no longer flat-register at all
    expect(table["select2_option"]).toBeUndefined();
    expect(table["change_create_to_update"]).toBeUndefined();
    expect(table["open_nest_editor"]).toBeUndefined();
    // the measured winners are the Ruby html/base arms
    expect(table["compact_missing"]).toBe(
      loader.viewChainTable().viewFor("All::Error", "compact_missing"),
    );
    expect(table["unknown"]).toBe(
      loader.viewChainTable().viewFor("All::Error", "unknown"),
    );
    expect(table["last_action"]).toBe(
      loader.viewChainTable().viewFor("All::History::Views", "last_action"),
    );
    expect(table["last_action_verb"]).toBe(
      loader.viewChainTable().viewFor("All::Notify::BaseViews", "last_action_verb"),
    );
    expect(table["count"]).toBe(
      loader.viewChainTable().viewFor("Abstract::Search", "count"),
    );
    // the foreign arms still dispatch through their OWN format's chain
    expect(
      loader.viewChain("ALL", "last_action", "email_text")[0]!.setModule,
    ).toBe("All::EmailText");
    expect(
      loader.viewChain("ALL", "select2_option", "json")[0]!.setModule,
    ).toBe("All::Autocomplete");
    expect(
      loader.viewChain(
        "ALL",
        "change_create_to_update",
        "js",
      )[0]!.setModule,
    ).toBe("All::ReferenceEditor::NestImage");
    // the abstract pseudo-pattern arm's measured mixing, on the live
    // loader: one view, three format classes' modules in one chain
    // (kind base all three; keys html+email_html+email_text) - the arm's
    // retained blindness, unreachable from src (safeSetKeys always
    // carries ALL).
    const emptyKeys = loader.viewChain("", "compact_missing").map((e) => e.setModule);
    expect(emptyKeys).toEqual(["All::Error", "All::EmailHtml", "All::EmailText"]);
  });
});
