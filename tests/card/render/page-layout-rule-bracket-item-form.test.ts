// tests/card/render/page-layout-rule-bracket-item-form.test.ts
// A *layout rule's stored content is the wiki-link item form
// `[[Probe Layout]]` — the shape decko's own layout-rule editor saves and the
// whole-harness N8 check creates (tools/edge-signed-in-exercise/checks-cover-b.mjs
// `create(rule, `[[${layout}]]`, "Phrase")`, verified stored verbatim:
// `storedRule: "[[Harness_CB_Simple_Layout]]"` in the 2026-10-18 whole-run).
//
// The report's broken-things line 39 (matrix ACT-105 + ACT-065) recorded
// `GET /Harness_CB_Laid_Out 500` on the 2026-10-16 source 50717cca — a card
// with a self layout answering 500 with no layout content. On the current
// tree the page must render THROUGH that layout: the "Simple Header" /
// "Simple Footer" strings around the main body, no UnknownLayoutError.
//
// THE RESOLUTION MECHANISM (why the brackets are harmless): the layout name
// is taken from the rule content verbatim (page.ts firstItemOfRuleContent —
// the plain-text first line, brackets included), and the FETCH is key-based:
// DeckoName's simple key replaces every non-key character with "_" and
// collapses the runs (src/card/name.ts:77 NOT_OK_FOR_KEY, :128-135
// simpleKeyUncached), so "[[Probe Layout]]" keys exactly "probe_layout" —
// the same key the bare layout card is stored under. Ruby resolves the same
// way (cardname simple_key strips non-key characters; the name fetched by
// key), so the item brackets ride into the layout NAME STRING but never
// break the resolution, on either engine. This pin exists so a future
// change to the key computation, the fetch path, or the layout
// classification cannot quietly turn that resolution back into the 500 the
// report carried.

import { describe, expect, it } from "vitest";
import { renderPageBytes } from "../../../src/card/render/page.js";
import { createRenderTestStorage, seedCard, type RenderTestStorage } from "./render-test-storage.js";

async function seedBracketRuleLayoutDeck(): Promise<ReturnType<typeof createRenderTestStorage>> {
  const storage = await createRenderTestStorage();
  // The Basic cardtype card (id 2, codename basic) — the layout card's type
  // check reads it (layout/html/basic -> card layout).
  await seedCard(storage, { id: 2, name: "Basic", codename: "basic", typeId: 2 });
  await seedCard(storage, { id: 900, name: "*all", codename: "all", typeId: 2 });
  await seedCard(storage, { id: 901, name: "*layout", codename: "layout", typeId: 2 });
  // Head-path setting cards: globalSettingContent parses ":<codename>" marks
  // (unknown codenames throw at parse), so the head's settings must exist.
  await seedCard(storage, { id: 904, name: "*title", codename: "title", typeId: 2 });
  await seedCard(storage, { id: 905, name: "*favicon", codename: "favicon", typeId: 2 });
  await seedCard(storage, { id: 906, name: "*ace", codename: "ace", typeId: 2 });
  await seedCard(storage, { id: 907, name: "*tiny_mce", codename: "tiny_mce", typeId: 2 });
  // The *layout rule on *all, stored in the LINK ITEM FORM the editor saves:
  // brackets and all.
  await seedCard(storage, {
    id: 910,
    leftId: 900,
    rightId: 901,
    typeId: 2,
    dbContent: "[[Probe Layout]]",
  });
  // The layout card: the main slot wrapped in literal header/footer text.
  await seedCard(storage, {
    id: 911,
    name: "Probe Layout",
    typeId: 2,
    dbContent: "Simple Header {{_main}} Simple Footer",
  });
  // The page card.
  await seedCard(storage, {
    id: 914,
    name: "Probe Page",
    typeId: 2,
    dbContent: "<p>the body</p>",
  });
  await storage.fetcher.codenames.ensureLoaded();
  storage.fetcher.installNameEnvironment();
  return storage;
}

describe("a bracket-form (*layout rule renders the page through that layout", () => {
  it("resolves [[Probe Layout]] to the layout card and wraps the main body", async () => {
    const storage: RenderTestStorage = await seedBracketRuleLayoutDeck();
    try {
      // The bracket-form rule must resolve to the layout card through the
      // key-based fetch and render the page THROUGH the layout. The
      // report's failure shape was the 500 with no layout content.
      const page = await renderPageBytes(storage.engine, "Probe Page");
      // The main body landed through the layout's {{_main}} slot.
      expect(page).toContain('<div id="main">');
      expect(page).toContain("<p>the body</p>");
      // THE PIN: the layout card's own text wrapped the body.
      expect(page).toContain("Simple Header");
      expect(page).toContain("Simple Footer");
    } finally {
      storage.close();
    }
  });
});
