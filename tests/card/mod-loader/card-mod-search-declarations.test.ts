// Register entry 28 (card-mod-search): the gem's declared view surface,
// measured, and the three remaining absences named with their cause.
//
// card-mod-search-0.20.0 is 29 set files with 32 view declarations spread
// across base (`format do`), html, json, csv, data and rss blocks. Two of
// the gem's 17 right/* files are the virtual searches whose CQL is
// data-ported in src/card/fetch/virtual-search-cards.ts (the register's
// 2026-10-19 correction), so they declare no views.
//
// Ground truth: the committed script
// tests/card/mod-loader/oracle-capture-search-declarations.rb reads the
// `format :x do` / `view :name, <options>` lines out of all 29 gem set
// files, handling BOTH declaration spellings (`view :name` and
// `view(:name) { }`, the latter at abstract/0_search.rb:56 and :86) and the
// multi-line option lists. A `view` outside any format block goes to the
// BASE format module (card-1.110.0 lib/card/set/format.rb:106-108), which is
// what self/recent.rb:4's bare `view :title` does. The measured result is
// committed as tests/card/mod-loader/fixtures/search-declarations.json.
//
// This suite pins the REGISTRATION SET against those declarations - which
// Ruby view is registered under which format key - and names, one by one,
// the declarations the port does not register and why. Per-view BODY
// parity is not claimed here; it is where the mod file's oracle pins live.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import cardModSearch from "../../../src/card/mod-loader/mods/card-mod-search.js";

interface DeclarationFile {
  file: string;
  formats: { line: number; name: string }[];
  views: { line: number; name: string; format: string; options: string[] }[];
}

const DECLARED: DeclarationFile[] = JSON.parse(
  readFileSync(new URL("fixtures/search-declarations.json", import.meta.url), "utf8"),
);

/** Every Ruby declaration as "<format> <name>", sorted and de-duplicated
 *  (a name may be declared in more than one file on the same format). */
const gemPairs = (): string[] =>
  [...new Set(DECLARED.flatMap((f) => f.views.map((v) => `${v.format} ${v.name}`)))].sort();

/** Every port registration as "<formatKey> <view>", sorted and
 *  de-duplicated the same way. */
const portPairs = (): string[] => {
  const out = new Set<string>();
  for (const m of cardModSearch.setModules!) {
    for (const [formatKey, block] of Object.entries(m.formats ?? {})) {
      for (const v of block?.views ?? []) out.add(`${formatKey} ${v.view}`);
    }
  }
  return [...out].sort();
};

/** Declarations Ruby's MRO resolves to a view the port registers on another
 *  layer, so the flat comparison overstates the gap. Each entry names the
 *  Ruby file and the resolution. */
const RESOLVED_ELSEWHERE: { pair: string; because: string }[] = [
  {
    // The engine's compiled html table owns these (views.ts#cardListView /
    // #noSearchResultsView, the :core/:bar search dispatch) - the mod file's
    // own header says so, and the register lists them in htmlViewsCovered.
    pair: "html card_list",
    because: "the engine's compiled html table (views.ts#cardListView)",
  },
  {
    pair: "html no_search_results",
    because: "the engine's compiled html table (views.ts#noSearchResultsView)",
  },
  {
    pair: "base card_list",
    because: "html inheritance: the base declaration is reachable through the html table's :card_list",
  },
  {
    pair: "base no_search_results",
    because: "html inheritance: the base declaration is reachable through the html table's :no_search_results",
  },
  {
    pair: "json molecule",
    because:
      "render/format-families.ts#jsonMolecule (json.rb show -> :molecule with items/links/ancestors/html_url/type in Ruby's insertion order) - the register's 2026-10-19 correction; the mod header's NOT-ported list was stale",
  },
  {
    pair: "rss feed_item_description",
    because:
      "card-mod-format.ts rssItemDescriptionView (all/rss block :2250-2268) - the register's 2026-10-19 correction",
  },
  {
    pair: "html search_box",
    because:
      "render/navbar-views.ts:255-268 searchBoxView, registered flat at :293 and byte-pinned by the render tests; the register's 2026-10-19 correction",
  },
  {
    pair: "html bar",
    because:
      "searchBarOverrideView is exported UNREGISTERED on purpose: the body is `voo.hide :one_line_content; super()` over card-mod-bar_and_box's base :bar, and the port's view table is global (one name, one fn), so registering it would replace every card's bar",
  },
  {
    pair: "html title",
    because:
      "self/search.rb:39-42's override - `voo.title ||= t(:search_results_title); super()` over card-mod-format's base :title. The port's view table is global (one name, one fn), and voo.title is an un-ported Voo heir key (format.ts:110), so the port would have to invent Voo API to exist.",
  },
  {
    pair: "base title",
    because:
      "self/recent.rb:4's bare `view :title`, which the set DSL routes to the BASE format module (card-1.110.0 lib/card/set/format.rb:106-108). Same reason as the html override above: it overrides card-mod-format's base :title for every card.",
  },
  {
    pair: "html core",
    because:
      "the engine's compiled html :core plus the search-family dispatch; self/search.rb:44 and self/recent.rb:29 declare the same base view name",
  },
  {
    pair: "base core",
    because: "html inheritance: abstract/search_views.rb:2's base :core reaches through the html table's :core",
  },
  {
    pair: "data card_list",
    because:
      "format-families' data family renders item arrays for the same search_with_params + nest_item walk; Ruby's :data block is the base of json and yaml",
  },
];

/** Declarations the port DOES register, but under a wider format key than
 *  Ruby files them under. Each names the mechanism, because "base reaches
 *  more formats" is a real observable difference and not a bookkeeping
 *  detail: mod-loader.ts:1112 puts `base` in EVERY format's chain, while an
 *  html-only declaration is reachable only from html and its descendants
 *  (FORMAT_PARENT, mod-loader.ts:97-106). */
const NAMED_DIVERGENCES: { gemPair: string; portPair: string; mechanism: string }[] = [
  {
    gemPair: "html checkbox_list",
    portPair: "base checkbox_list",
    mechanism:
      "views.rb:118-124 declares :checkbox_list under `format :html` only. The port registers it under the base key, so its chain answers for json/csv/data renders too, where Ruby raises view (checkbox_list) not supported. Measured by reading the registration (card-mod-search.ts:1136-1138) and the chain assembly (mod-loader.ts:1112).",
  },
];

/** The declarations neither registered nor resolved elsewhere, each with the
 *  measured reason it cannot match Ruby in the port today. */
const NAMED_ABSENCES: { pair: string; cause: string }[] = [
  {
    pair: "csv body",
    cause:
      "abstract/0_search/views.rb:102-106 declares :body under `format :csv`. The engine has no csv format dispatch: render.ts computeResolvedView returns undefined for any format outside the html lineage (and email_text), so a csv-keyed registration has nothing to answer. Measured, not assumed.",
  },
  {
    pair: "rss feed_body",
    cause:
      "abstract/search_views.rb:16-23 declares :feed_body under `format :rss`. The rss format IS in the html lineage so the key would dispatch, but the body writes an XML feed document and card-mod-format.ts:2255 still names the XML-writing feed family as unported. Named, with its sibling :feed_item_description already registered on the other side.",
  },
  {
    pair: "json name_complete",
    cause:
      "abstract/0_search/views.rb:38-40 runs ad-hoc CQL against params[:term] AT VIEW TIME, for ANY card - not just the *search card the request-term seat serves. The port's prepared seat (RenderEngine#searchBoxCompleteSeat) is *search-scoped, so these two views have no seat; a port would need a per-card request-term prepare for every card in the deck, which is engine work, not a view body.",
  },
  {
    pair: "json name_match",
    cause:
      "abstract/0_search/views.rb:42-44 - the same request-term seat gap as :name_complete, plus a second CQL arm (match_cql's `name_match` plus the `not in` exclusion over the complete results).",
  },
];

describe("search register entry 28: the declared surface matches the gem's files", () => {
  it("the gem declares 32 views across 29 set files and six format keys - measured", () => {
    expect(DECLARED).toHaveLength(29);
    expect(DECLARED.flatMap((f) => f.views)).toHaveLength(32);
    const keys = [...new Set(DECLARED.flatMap((f) => f.views.map((v) => v.format)))].sort();
    expect(keys).toEqual(["base", "csv", "data", "html", "json", "rss"]);
  });

  it("every Ruby declaration is registered, resolved elsewhere, or named - nothing is unaccounted", () => {
    const accounted = new Set([
      ...portPairs(),
      ...RESOLVED_ELSEWHERE.map((r) => r.pair),
      ...NAMED_DIVERGENCES.map((d) => d.gemPair),
      ...NAMED_ABSENCES.map((n) => n.pair),
    ]);
    expect(gemPairs().filter((p) => !accounted.has(p))).toEqual([]);
  });

  it("each named absence names a cause, and none of them is a registered pair", () => {
    for (const { pair, cause } of NAMED_ABSENCES) {
      expect(gemPairs()).toContain(pair);
      expect(portPairs()).not.toContain(pair);
      expect(cause.length).toBeGreaterThan(40);
    }
  });

  it("the one format-key divergence is named and still registered - it is a wider reach, not a gap", () => {
    for (const d of NAMED_DIVERGENCES) {
      expect(gemPairs()).toContain(d.gemPair);
      expect(portPairs()).toContain(d.portPair);
      expect(portPairs()).not.toContain(d.gemPair);
      expect(d.mechanism.length).toBeGreaterThan(40);
    }
  });

  it("the port registers the views it claims, under the format keys Ruby files them under", () => {
    expect(portPairs()).toEqual(
      expect.arrayContaining([
        "base search_count",
        "base search_error",
        "base count",
        "html count",
        "html one_line_content",
        "html results_for_keyword",
        "html goto_autocomplete_item",
        "html add_autocomplete_item",
        "json search_box_complete",
        "json complete",
        "json select2_option",
      ]),
    );
  });

  it("the two :count declarations (base and html) are both registered, matching 0_search.rb:56,86", () => {
    const module = cardModSearch.setModules!.find((m) => m.setPath === "abstract/0_search")!;
    const gemCount = DECLARED.find((f) => f.file === "abstract/0_search.rb")!.views.map(
      (v) => `${v.format} ${v.name}`,
    );
    expect(gemCount).toEqual(["base count", "html count"]);
    expect(module.formats?.base?.views!.map((v) => v.view)).toEqual(["count"]);
    expect(module.formats?.html?.views!.map((v) => v.view)).toEqual(["count"]);
  });

  it("no registration invents a format key the gem never opens", () => {
    const gemKeys = new Set(DECLARED.flatMap((f) => f.formats.map((x) => x.name)));
    for (const m of cardModSearch.setModules!) {
      for (const key of Object.keys(m.formats ?? {})) {
        expect(gemKeys.has(key)).toBe(true);
      }
    }
  });
});