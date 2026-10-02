// view-dispatch-anchored-cross-format-collision-census.test.ts - the
// ANCHORED/nested-prefix cross-format collision census: the chainorder
// port's same-pattern census method
// (view-dispatch-same-pattern-collision-order.test.ts) applied to the two
// dispatch arms that port left format-agnostic - the anchored exact-token
// arm and the nested-prefix expansion (mod-loader.ts viewChain's
// dash-token branch, both probing SetModuleViewTable.viewFor, a
// FORMAT-BLIND map).
//
// Ruby ground truth for an anchored (nonbase) set: its format module is
// filed under its OWN format class (set/format.rb:120-144
// register_standard_set_format -> Set.modules[:nonbase_format][format_
// class][shortname]) and reaches a card's format singleton only when THAT
// format's class is the key: format.rb:62-68 include_set_format_modules
// walks the format's format_ancestry and pattern/base.rb:30-37
// format_module_list looks up the EXACT class. An html-keyed registration
// of Right::TextMessage is therefore INVISIBLE to an EmailTextFormat
// render (email_text_format.rb: EmailTextFormat < TextFormat < Format -
// that ancestry never includes the HtmlFormat-keyed modules), while the
// TS anchored arms would hand it to ANY format through the blind probe.
//
// THE CENSUS (this file): walk every ported mod manifest in the deck's
// oracle bundle order (default-mod-deck.ts, the same registration surface
// mod-loader.ts:302-330 feeds) and enumerate, for the NONBASE set paths,
// every (set module, view) whose registrations span MORE THAN ONE
// manifest format key - within one module (the blind map's last-wins
// would hand one format the other format's bytes) or across two modules
// under the SAME anchored prefix (the nested-prefix expansion would list
// both in one chain). Format classes that descend from html
// (rss/email_html ONLY - RssFormat < HtmlFormat, rss_format.rb:6;
// EmailHtmlFormat < Card::Format::HtmlFormat, email_html_format.rb:6)
// SHARE the html method table in Ruby; css/js do NOT - CssFormat and
// JsFormat subclass Format DIRECTLY (css_format.rb:6, js_format.rb:6 -
// the css-js-format-parents survey, 2026-10-01; the earlier
// "email_html/css/js/rss" list here parroted the port's pre-survey
// HTML_DESCENDED_FORMATS, which the survey corrected and
// view-dispatch-css-js-format-ancestry-census.test.ts pins). The
// collision criterion stays the TEXT-lineage visibility: a key set
// spanning {html-family} x {email_text/text-family} - or any two keys
// whose Ruby method tables differ.
//
// RESULT on this codebase (measured, job-1790893922261 + the re-run):
// 159 anchored registrations across the composed deck - 157 under "html",
// 2 under "json" (carrierwave self/search :image_complete,
// card-mod-carrierwave-0.20.0 set/self/search.rb:1-8; api_key right/
// api_key :token, card-mod-api_key-0.20.0 set/right/api_key.rb:63-67) -
// and ZERO cross-format collision groups: no (anchored module, view) pair
// spans two keys, and no nested-prefix pair registers the same view in
// different keys. Ruby's answer agrees with the port's single-key shape:
// each of those two views lives ONLY in JsonFormat
// (JsonFormat < DataFormat < Format, json_format.rb:6 + data_format.rb:3
// - visible to no other format class), and the port's json dispatch of
// them is faithful. The probes below pin that invariant: a future port
// that lands a SECOND key under an already-keyed anchored (module, view)
// - or a same-prefix module pair spanning keys - FAILS here and names
// the mod/set/view/key: the signal to port the anchorless arm's format
// scoping into the anchored arms.
//
// The residual leak shape (an anchored registration VISIBLE to a format
// whose Ruby method table never included it - html-keyed into email_text,
// or the two json-keyed rows into any non-json dispatch) is a
// single-registration divergence, NOT a same-token collision: no pair of
// registrations disagrees, so no dispatch on this codebase can pick the
// wrong format's bytes BETWEEN two arms. Its reachability is bounded:
// the ONLY non-html chain dispatch in the port is views.ts:1443 (the
// text-message email_text :core re-entry), reachable only through a
// codename-bearing text-message card - no loader-bound suite seeds the
// codename (notify-save-path-wiring.test.ts:80, follower-resolver.ts
// :179 seed *text message without one), and the corpus email sweeps bind
// no loader (card-mod-email.ts:215-217), their flat seam carrying the
// explicit format guard (views.ts:1518). No json/css/csv/rss renderView
// dispatch exists at all (the route-level csv/rss/json shows are the
// format-families layer, renderFormatShow, which bypasses viewChain).
// See the anchored-arm comment in mod-loader.ts for the adjudication.

import { describe, expect, it } from "vitest";
import { defaultDeckSources } from "../../../src/card/mod-loader/default-mod-deck.js";
import { setModuleShortname, setPathPattern } from "../../../src/card/mod-loader/mod-registrar.js";
import type { DeckoModManifest, ModSetModuleFile } from "../../../src/card/mod-loader/mod-manifest.js";

/** mod-loader.ts:909-914 kindOfSetPath: "all" -> base, "abstract" ->
 *  abstract, everything else nonbase (an anchored pattern). */
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
 *  way mod-loader.ts:302-330 walks it (file.formats x formatBlock.views,
 *  shortname via setModuleShortname). */
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

/** Segment-boundary prefix relation: "type/set" is a prefix of
 *  "type/set/html_views" (the nested-prefix expansion's
 *  `=== code/anchor || startsWith(code/anchor + "/")` reachability,
 *  mod-loader.ts:686). */
function sharesAnchoredPrefix(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  return long.startsWith(`${short}/`);
}

describe("anchored/nested-prefix cross-format collision census (composed deck)", () => {
  const entries = censusEntries();
  const anchored = entries.filter((e) => e.kind === "nonbase");

  it("census is non-vacuous: the composed deck registers anchored views", () => {
    // A broken walk (empty deck, wrong filter) must not read as "zero
    // collisions".
    expect(anchored.length).toBeGreaterThan(0);
  });

  it("the non-html anchored registrations are exactly the two json census rows", () => {
    // Measured census pin. Ruby files each of these ONLY under
    // JsonFormat (json_format.rb:6), so their json dispatch is faithful
    // and no other format ever dispatched them (no json renderView
    // dispatch exists - the route json show is the format-families
    // layer). A THIRD non-html anchored key (or a new json row) lands
    // here and names itself: the re-adjudication signal for porting the
    // format scoping into the anchored arms.
    const foreign = anchored.filter((e) => e.formatKey !== "html");
    expect(
      foreign.map(
        (e) => `${e.mod} ${e.setPath} :${e.view} key=${e.formatKey}`,
      ),
    ).toEqual([
      "carrierwave self/search :image_complete key=json",
      "api_key right/api_key :token key=json",
    ]);
  });

  it("no (anchored set module, view) spans two format keys (within-module collision)", () => {
    // Ruby files each format module under its own class
    // (set/format.rb:120-144): two keys = two method tables = the blind
    // map's single slot per (module, view) hands one format the other
    // format's bytes.
    const byKey = new Map<string, Set<string>>();
    for (const e of anchored) {
      const k = `${e.shortname}|${e.view}`;
      const set = byKey.get(k) ?? new Set<string>();
      set.add(e.formatKey);
      byKey.set(k, set);
    }
    const collisions = [...byKey.entries()]
      .filter(([, keys]) => keys.size > 1)
      .map(([k, keys]) => `${k} keys=${[...keys].sort().join("+")}`);
    expect(collisions).toEqual([]);
  });

  it("no two modules under one anchored prefix register the same view in different keys (nested-prefix collision)", () => {
    // The nested-prefix expansion (mod-loader.ts:682-693) lists EVERY
    // registered module whose setPath sits under the token's
    // code/anchor prefix, so two prefix-related modules spanning keys
    // for the same view would share one format-blind chain.
    const collisions: string[] = [];
    for (let i = 0; i < anchored.length; i++) {
      for (let j = i + 1; j < anchored.length; j++) {
        const a = anchored[i]!;
        const b = anchored[j]!;
        if (
          a.shortname !== b.shortname &&
          a.view === b.view &&
          a.formatKey !== b.formatKey &&
          setPathPattern(a.setPath) === setPathPattern(b.setPath) &&
          sharesAnchoredPrefix(a.setPath, b.setPath)
        ) {
          collisions.push(
            `${a.mod} ${a.setPath} key=${a.formatKey} vs ${b.mod} ${b.setPath} key=${b.formatKey} :${a.view}`,
          );
        }
      }
    }
    expect(collisions).toEqual([]);
  });

  it("census shape: the anchored format-key set is exactly {html, json}", () => {
    // The measured key universe (157 html + 2 json on this tree; the
    // counts ride every failure diff). A NEW key under an anchored set
    // fails here and names itself - the same re-adjudication signal.
    const keys = new Set(anchored.map((e) => e.formatKey));
    expect([...keys].sort()).toEqual(["html", "json"]);
  });
});
