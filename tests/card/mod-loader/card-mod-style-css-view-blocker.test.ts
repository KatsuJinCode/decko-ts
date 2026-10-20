// card-mod-style's three css/scss-format views: ONE ported, TWO skipped by
// name against a measured blocker (register entry 30)
//
// The gem declares three views that are not html:
//
//   set/type/skin.rb:5-11        format :css  view :concat
//   set/abstract/01_css.rb:48-50 format :css  view :import
//   set/abstract/02_scss.rb:23-25 format :scss view :labeled
//   (plus :compiled/:compressed, 01_css.rb:52-58 and 02_scss.rb:3-6,
//    which are SassC::Engine work at the asset-leaf seam)
//
// WHAT THIS FILE SETTLES
//
// 1. :concat is PORTED, and it is reachable BECAUSE Type::Skin is a
//    concrete type module. Its registration rides the per-card chain
//    (most-specific-first, mod-registrar.ts's chain walker), so it
//    dispatches for a `*skin` card and for nothing else. Measured here in
//    all three directions - the card that answers, the format that
//    answers, and the card that does NOT answer - because a set-scoped
//    registration that leaks is the exact failure the kind guard exists
//    to prevent.
//
// 2. :import and :labeled are SKIPPED BY NAME, and the reason card-mod-
//    style.ts used to give for them was wrong twice over (both
//    corrections are in that file's header and both are load-bearing
//    here):
//    - "no css-format render surface exists in the engine" - FALSE. One
//      exists and is oracle-pinned: css-format-views.test.ts matches the
//      committed Ruby captures for content/import/titled/unknown/url under
//      both css and scss. It works because All::Css is BASE-kind: its
//      format module is mixed into the base format class every card
//      inherits (mod-loader.ts:377-393).
//    - "a second :labeled would shadow card-mod-format's html :labeled
//      globally" - FALSE. The flat record is FORMAT-scoped
//      (mod-loader.ts:395-415): a foreign-keyed module lands on its own
//      format class only, and subclass modules never back-propagate.
//      view-dispatch-flat-record-format-scope-census.test.ts pins that.
//
//    THE REAL BLOCKER (assertion 3): Ruby resolves a css card's :import
//    to Abstract::Css - the type's `include_set Abstract::Css`
//    (set/type/css.rb:1) puts the abstract ahead of the base-format
//    module, so it is an OVERRIDE of All::Css's `_render_core`
//    (all/css.rb:23-25). The port's css chain orders them the other way,
//    and computeResolvedView renders `chain[0]` (render.ts:2888-2894), so
//    a registration on abstract/01_css lands TRAILING and never runs.
//    Assertion 3 measures that with a scratch manifest and asserts the
//    byte is unchanged, so the skip rests on the render and not on a
//    comment. Assertion 3c is the contrast that makes the distinction
//    legible: :concat's concrete module LEADS the chain, and that - not
//    reachability - is why it ports.
//
//    The two drafts of assertion 3 that came before it were both wrong,
//    one in each direction, and both are recorded in the assertion's own
//    comment: first "an abstract css view cannot reach a card at all",
//    then "so it is a real port". Only the run settled it.
//
// 3. THE ORACLE ALREADY ANSWERED THE REACHABILITY QUESTION, from the
//    other side. The committed captures in
//    reference-harness/fixtures/synthetic-v2-mod-probes/expected/
//    render.jsonl include probes targeted at these exact set files:
//
//      probe-view:527 import@set/abstract/01_css.rb
//      probe-view:540 labeled@set/abstract/02_scss.rb
//      probe-view:525 concat@set/type/skin.rb
//
//    and their recorded html is the PLAIN CARD's answer, not the css
//    bytes: the probes render the deck's RichText account card in the
//    HTML format. `import@set/abstract/01_css.rb` is byte-identical to
//    `import@set/all/css.rb`, and `labeled@set/abstract/02_scss.rb`
//    begins with "Decko Bot: " - the html all-set `:labeled` prefix
//    (base.rb:26-28), not the scss abstract's "//Decko Bot\n". Stock Ruby
//    does not reach these abstracts for a plain card either. That is why
//    the assertions below pin the PORT's reachability and the view
//    structure, and NOT a byte match: there is no committed oracle answer
//    for a real `*skin` card's `:concat`, so claiming one would be
//    inventing it. Assertion 5 says so out loud.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { ModLoader, modEngineHost } from "../../../src/card/mod-loader.js";
import type { DeckoModManifest } from "../../../src/card/mod-loader.js";
import cardModFormat from "../../../src/card/mod-loader/mods/card-mod-format.js";
import cardModStyle from "../../../src/card/mod-loader/mods/card-mod-style.js";
import {
  bindModLoaderToEngine,
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../render/render-test-storage.js";

// the committed Ruby captures the header cites
const oracleRows = readFileSync(
  new URL(
    "../../../reference-harness/fixtures/synthetic-v2-mod-probes/expected/render.jsonl",
    import.meta.url,
  ),
  "utf8",
)
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line) as { id: string; result?: { html?: string }; error?: unknown });
const oracleHtml = (id: string): string => {
  const row = oracleRows.find((r) => r.id === id);
  if (row === undefined) throw new Error(`no committed oracle row: ${id}`);
  return row.result?.html ?? "";
};

describe("card-mod-style entry 30 — the css/scss-format view surface", () => {
  let storage: RenderTestStorage;
  let loader: ModLoader;

  beforeAll(async () => {
    storage = await createRenderTestStorage();
    // the cardtypes the mod's set modules key on
    await seedCard(storage, { id: 500, name: "Skin", codename: "skin" });
    await seedCard(storage, { id: 501, name: "CSS", codename: "css", dbContent: "p{color:red}" });
    await seedCard(storage, { id: 502, name: "SCSS", codename: "scss" });
    // two NON-inputter item cards (plain RichText) and one inputter
    // (a *css card, whose asset_input is `format(:css).render :compressed`)
    await seedCard(storage, { id: 503, name: "Plain One", dbContent: "p { color: #111; }" });
    await seedCard(storage, { id: 504, name: "Plain Two", dbContent: "p { color: #222; }" });
    // the skin card itself: its items are the two plain cards
    await seedCard(storage, {
      id: 505,
      name: "*skin",
      typeId: 500,
      dbContent: "Plain One\nPlain Two",
    });
    loader = new ModLoader([{ manifest: cardModFormat }, { manifest: cardModStyle }]);
    loader.load();
    bindModLoaderToEngine(storage, loader);
    await loader.installInto(modEngineHost(storage.engine, storage.fetcher));
  });

  afterAll(async () => {
    loader?.reset();
    await storage?.close();
  });

  // The chains below are asked with the cards' OWN set keys, read off the
  // engine's records, rather than a hand-written token string: the chain
  // walker's ordering depends on which tokens are present, and a guessed
  // string is how the first two drafts of assertion 3 went wrong. A card
  // the engine has not enriched yields the empty key, which routes the
  // walk through the abstract-pseudo-pattern fallback - a real answer, and
  // the one these assertions pin, but named as what it is.
  const cssCardSetKeys = () => storage.engine.fetchRenderCard?.("CSS")?.setKeys ?? "";
  const skinCardSetKeys = () => storage.engine.fetchRenderCard?.("*skin")?.setKeys ?? "";

  it("1. the load report registers :concat once, on Type::Skin", () => {
    expect(loader!.load().registeredViews).toContain("concat");
    const skin = cardModStyle.setModules?.find((m) => m.setPath === "type/skin");
    const cssViews = (skin!.formats?.css?.views ?? []).map((v) => v.view);
    expect(cssViews).toEqual(["concat"]);
    // and NOT under html - Ruby's file wraps it in `format :css do`
    expect(skin!.formats?.html?.views ?? []).toHaveLength(0);
  });

  it("2. REACH: a *skin card answers :concat under the css format, joined with newlines over its items", async () => {
    const owners = loader!.viewChain("ALL TYPE-skin", "concat", "css").map((e) => e.setModule);
    expect(owners).toEqual(["Type::Skin"]);
    const bytes = await storage.engine.render("*skin", "concat", { format: "css" });
    // Ruby's body: `card.item_cards.map { … }.join("\n")` - one part per
    // item, newline-joined, in item order. Both items here are plain
    // RichText cards (no AssetInputter token), so each takes the
    // `nest(item, view: :core)` arm.
    expect(bytes.split("\n").length).toBeGreaterThan(1);
    expect(bytes).toContain("color: #111");
    expect(bytes).toContain("color: #222");
    // the first item's bytes come before the second's - order is the
    // card's own item order, not sorted or deduped
    expect(bytes.indexOf("color: #111")).toBeLessThan(bytes.indexOf("color: #222"));
  });

  it("2b. SCOPE: the same view does NOT answer a non-skin card, nor the same card under html", async () => {
    // format scoping: Ruby's `format :css do` puts the view on CssFormat
    // only, so the html render still raises
    await expect(storage.engine.render("*skin", "concat", { format: "html" })).rejects.toThrow(
      /concat/,
    );
    // set scoping: a plain card carries no TYPE-skin token
    await expect(storage.engine.render("Plain One", "concat", { format: "css" })).rejects.toThrow(
      /concat/,
    );
  });

  it("3. BLOCKER, MEASURED: a registration on abstract/01_css would be INERT - the chain puts All::Css FIRST", async () => {
    // What the three drafts of this assertion got wrong, in order, because
    // the first two were reasoned and the third was run:
    //
    //   draft 1: "an abstract-module css view cannot reach a card at all,
    //   because SetIncludes is html|base keyed" - WRONG. The chain does
    //   list Abstract::Css once it is registered.
    //   draft 2: "so :import is a real port" - ALSO WRONG, and worse: the
    //   registration was written, and the render came back with All::Css's
    //   body. The chain ORDER is inverted against Ruby's MRO.
    //   draft 3 (this one): the real blocker, measured both with the
    //   shipped manifest and with the registration present.
    //
    // Ruby's MRO for a css card: Type::Css's `include_set Abstract::Css`
    // (set/type/css.rb:1) puts the abstract AHEAD of the base-format
    // module, so Abstract::Css's :import (`%{\n@import url("...");\n}`)
    // is the override and All::Css's :import (`_render_core`,
    // card-mod-format set/all/css.rb:23-25) is the base it replaces.
    //
    // The port's css chain orders them the other way round. computeRe-
    // solvedView returns `chain[0].viewFn` (render.ts:2888-2894), so
    // All::Css's body is the one that renders, and registering the
    // override changes no rendered byte while making the load report
    // claim a view the render never uses. Hence SKIPPED BY NAME.

    // (a) the shipped manifest: only the all-set has this view at all
    const shipped = loader!.viewChain(cssCardSetKeys(), "import", "css").map((e) => e.setModule);
    expect(shipped).toEqual(["All::Css"]);

    // (b) the counterfactual - scratch-register the abstract's :import
    const probing: DeckoModManifest = {
      ...cardModStyle,
      setModules: cardModStyle.setModules?.map((m) =>
        m.setPath === "abstract/01_css"
          ? {
              ...m,
              formats: {
                css: { views: [{ view: "import", viewFn: () => "\n@import url(\"/CSS.css\");\n" }] },
              },
            }
          : m,
      ),
    };
    const probe = new ModLoader([{ manifest: cardModFormat }, { manifest: probing }]);
    probe.load();
    probe.installInto(modEngineHost(storage.engine, storage.fetcher));
    const owners = probe.viewChain(cssCardSetKeys(), "import", "css").map((e) => e.setModule);
    // present, but TRAILING - the opposite of Ruby's order
    expect(owners).toEqual(["All::Css", "Abstract::Css"]);
    expect(owners[0]).toBe("All::Css");
    // and the byte is unchanged: the probe's own body never runs
    expect(await storage.engine.render("CSS", "import", { format: "css" })).toBe("p{color:red}");
    probe.reset();
    await loader!.installInto(modEngineHost(storage.engine, storage.fetcher));
  });

  it("3b. the same card's :url IS the string :import would have interpolated", async () => {
    // Named, not guessed: the skipped view's bytes are fully determined
    // (the leading newline, the `@import url("` opener and the `");\n`
    // closer around this answer), and the answer itself is pinned by the
    // committed oracle for the all-set half
    // (`probe-view:257 url@set/all/css.rb` = "/Decko_Bot.css").
    expect(await storage.engine.render("CSS", "url", { format: "css" })).toBe("/CSS.css");
  });

  it("3c. CONTRAST: :concat's concrete module LEADS the chain, which is why it ports", () => {
    const owners = loader!.viewChain(skinCardSetKeys(), "concat", "css").map((e) => e.setModule);
    expect(owners).toEqual(["Type::Skin"]);
    expect(owners[0]).toBe("Type::Skin");
    // the distinction is CHAIN POSITION, not reachability: both modules are
    // "in the chain", only the concrete one is first.
    expect(owners).not.toContain("All::Css");
  });

  it("4. THE ORACLE AGREES: the committed captures show stock Ruby not reaching these abstracts either", () => {
    // probe-view:527 vs :254 - the abstract's :import and the all-set's
    // :import render the SAME bytes for the deck's plain probe card
    expect(oracleHtml("probe-view:527:import@set/abstract/01_css.rb")).toBe(
      oracleHtml("probe-view:254:import@set/all/css.rb"),
    );
    // and neither is the css `@import url(...)` line - both are the plain
    // card's html core
    expect(oracleHtml("probe-view:527:import@set/abstract/01_css.rb")).not.toContain("@import url(");
    // probe-view:540 - the scss abstract's :labeled comes back with the
    // html all-set's "NAME: " prefix, not the abstract's "//NAME\n"
    const labeled = oracleHtml("probe-view:540:labeled@set/abstract/02_scss.rb");
    expect(labeled.startsWith("Decko Bot: ")).toBe(true);
    expect(labeled.startsWith("//Decko Bot")).toBe(false);
    // probe-view:525 - the concat probe is a MISSING-style-card comment,
    // i.e. All::Css's :unknown, because the probe card is not a skin
    expect(oracleHtml("probe-view:525:concat@set/type/skin.rb")).toContain("MISSING Style Card");
    // the all-set's own :url IS the css path the abstract's :import would
    // interpolate - pinned here so the skipped :import's bytes are named
    // rather than guessed
    expect(oracleHtml("probe-view:257:url@set/all/css.rb")).toBe("/Decko_Bot.css");
  });

  it("5. NO ORACLE ANSWER EXISTS for a real skin card's :concat - the byte claim is scoped accordingly", () => {
    // Stated as an assertion so it cannot rot into an implied guarantee:
    // every committed concat probe is a non-skin card, so nothing in the
    // fixtures pins the positive bytes. What is pinned above is the
    // view's STRUCTURE (set scope, format scope, per-item arms, the
    // newline join, item order) against Ruby's source, and the reach
    // facts against the loader. The SassC :compressed leaf that a real
    // skin's css items would render remains the asset-seam remainder.
    const concatProbes = oracleRows.filter((r) => r.id.includes("concat@set/type/skin.rb"));
    expect(concatProbes.length).toBeGreaterThan(0);
    for (const probe of concatProbes) {
      expect(probe.result?.html ?? "").toContain("MISSING Style Card");
    }
  });
});
