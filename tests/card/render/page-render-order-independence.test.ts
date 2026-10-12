// Page renders are order-independent: a page's bytes must equal the bytes a
// CLEAN engine produces for the same page alone, no matter which renders
// preceded it on the same engine (Ruby resolves every request fresh — the
// parity contract; first-render-wins engine state breaks it).
//
// The mechanism this pins: the page path's layout warm-up
// (prefetchWarmupClosure) walks a worklist whose collect step skips names
// already prepared in the engine's render-card map ("prepared: next drain
// scans it"). A bare view rendered earlier can prepare those names as
// one-level template references (applyStructureContent enriches template-ref
// targets without scanning them), so EVERY pending name is warm, the
// warm-up builds zero statements — and its no-fetch branch breaks the loop
// before the promised next drain ever runs. The break eats the reference
// BFS: cards reachable only through a warm-but-unscanned card's content
// (the navbar menu's items, in the repro) stay unprepared, and the
// synchronous nest renders the unknown-card substitution for them — the
// vanished-navbar signature.
//
// This deck reproduces that shape minimally: "Structured Card" (governed by
// a *structure rule) template-references "Header Card" and "Menu Card";
// bare-rendering it prepares both WITHOUT scanning them. The layout nests
// Header, Header nests Menu, Menu nests Deep — Deep is reachable only by
// scanning Menu, so the pre-fix page render loses Deep's body to the
// unknown-card slot while a clean engine renders it.

import { describe, expect, it } from "vitest";
import { renderPageBytes } from "../../../src/card/render/page.js";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "./render-test-storage.js";
import { normalizeSlotIds } from "../../../src/testing/diff.js";
import { RenderEngine } from "../../../src/card/render.js";
import { FetchEngine } from "../../../src/card/fetch.js";

async function seedWarmupDeck(): Promise<RenderTestStorage> {
  const storage = await createRenderTestStorage();
  // Codename anchors (the set-pattern walk + codename marks resolve on
  // them) and the head-path setting cards (globalSettingContent parses
  // ":<codename>" marks - unknown codenames throw at parse).
  await seedCard(storage, { id: 2, name: "Basic", codename: "basic", typeId: 2 });
  await seedCard(storage, { id: 900, name: "*all", codename: "all", typeId: 2 });
  await seedCard(storage, { id: 901, name: "*layout", codename: "layout", typeId: 2 });
  await seedCard(storage, { id: 902, name: "*title", codename: "title", typeId: 2 });
  await seedCard(storage, { id: 903, name: "*favicon", codename: "favicon", typeId: 2 });
  await seedCard(storage, { id: 904, name: "*ace", codename: "ace", typeId: 2 });
  await seedCard(storage, { id: 905, name: "*tiny_mce", codename: "tiny_mce", typeId: 2 });
  await seedCard(storage, { id: 906, name: "*self", codename: "self", typeId: 2 });
  await seedCard(storage, { id: 907, name: "*structure", codename: "structure", typeId: 2 });
  // The *layout rule on *all: names the layout card (first raw item line).
  await seedCard(storage, {
    id: 910,
    leftId: 900,
    rightId: 901,
    typeId: 2,
    dbContent: "Probe Layout",
  });
  // The layout card: main slot + the header nest.
  await seedCard(storage, {
    id: 911,
    name: "Probe Layout",
    typeId: 2,
    dbContent: "{{_main|titled}}\n{{Header Card|content}}",
  });
  // The warm-up spine: Header -> Menu -> Deep. Header nests Menu (a plain
  // nest); Menu renders its content as the navbar chunk family, whose
  // [[Deep Card|Deep]] chunk the nav_item view NESTS - Deep's bytes are
  // needed. A SCAN is what queues each hop; enrichment alone never chases
  // them (the prefetch chases nest refs only during a bare render, the
  // template-ref pass only {{...}} spans - never [[...]] chunks).
  await seedCard(storage, {
    id: 912,
    name: "Header Card",
    typeId: 2,
    dbContent: "{{Menu Card|navbar_links}}",
  });
  await seedCard(storage, {
    id: 913,
    name: "Menu Card",
    typeId: 2,
    dbContent: "[[Deep Card|Deep]]",
  });
  await seedCard(storage, {
    id: 914,
    name: "Deep Card",
    typeId: 2,
    dbContent: "<p>deep body</p>",
  });
  // The structured card: set card (Structured Card+*self) + the *structure
  // rule, whose template content references Header - the one-level
  // template-ref enrichment that leaves Header (and, transitively through
  // the template-ref fixpoint, Menu) warm-but-unscanned, while Deep stays
  // cold: nothing chases a [[...]] chunk except a scan.
  await seedCard(storage, {
    id: 915,
    name: "Structured Card",
    typeId: 2,
    dbContent: "<p>raw body</p>",
  });
  await seedCard(storage, {
    id: 916,
    leftId: 915,
    rightId: 906,
    typeId: 2, // Structured Card+*self set card (composed, no name)
  });
  await seedCard(storage, {
    id: 917,
    leftId: 916,
    rightId: 907,
    typeId: 2,
    dbContent: "{{Header Card|content}}",
  });
  // The page card.
  await seedCard(storage, {
    id: 918,
    name: "Probe Page",
    typeId: 2,
    dbContent: "<p>the body</p>",
  });
  await storage.fetcher.codenames.ensureLoaded();
  storage.fetcher.installNameEnvironment();
  return storage;
}

/** A second engine over the SAME seeded data: fresh maps, clean history. */
function cleanEngineOver(storage: RenderTestStorage): RenderEngine {
  const fetcher = new FetchEngine(storage.counting);
  const engine = new RenderEngine(fetcher);
  fetcher.codenames.ensureLoaded();
  fetcher.installNameEnvironment();
  return engine;
}

describe("page render order independence (first-render-wins state leak)", () => {
  it("renders the page identically whether or not a bare view rendered first", async () => {
    const storage = await seedWarmupDeck();
    // Engine A: a bare view first - a view render preceding the page render
    // is the poisoning order.
    await storage.engine.render("Structured Card", "titled");
    const pageAfterBareRender = await renderPageBytes(storage.engine, "Probe Page");

    // Engine B: the same page on a clean engine - the bytes the page must
    // equal regardless of render history.
    const clean = cleanEngineOver(storage);
    const cleanPage = await renderPageBytes(clean, "Probe Page");

    // Both engines must render the navbar item for Deep Card - reachable
    // only through scanning Menu Card, so a warm-up that stops early loses
    // it to the unknown-card slot (the vanished-navbar signature).
    expect(cleanPage).toContain(">Deep</span>");
    expect(pageAfterBareRender).toContain(">Deep</span>");
    // The contract: byte equality with the clean engine's page.
    expect(normalizeSlotIds(pageAfterBareRender)).toBe(normalizeSlotIds(cleanPage));
  });

  it("renders the page identically when the page render runs first", async () => {
    // Control: a page-first engine matches the clean engine (a page render
    // first does not poison anything). Must hold both before and after the
    // fix.
    const storage = await seedWarmupDeck();
    const first = await renderPageBytes(storage.engine, "Probe Page");
    const clean = cleanEngineOver(storage);
    const second = await renderPageBytes(clean, "Probe Page");
    expect(normalizeSlotIds(first)).toBe(normalizeSlotIds(second));
    expect(first).toContain(">Deep</span>");
  });
});
