// Known-card wikilink href carries the RESOLVED card's name, not the
// authored link text's casing: the href is built from the resolved
// card's stored name while the label/title keep the authored form.
//
// Mechanism: chunk/link.rb render_name_link renders view :link on the
// TARGET CARD (card-mod-format set/all/base.rb:35-46: `view :link` ->
// link_view -> `link_to_card card.name, _render_title, opts`) - the href
// is built from the RESOLVED card's name (the real stored name), while
// the label/title keep the authored link text (_render_title via the
// :title option). Every case-differing known-card anchor follows the
// real-name href in BOTH directions - [[narrative]] hrefs /Narrative and
// [[Fieldwork]] hrefs /fieldwork when the card is stored lowercase.
//
// The engine's wikilink name branches (renderLinkChunk + expandWikiLinks)
// built the href from the AUTHORED target's url_key, emitting /narrative.

import { describe, expect, it } from "vitest";
import { renderPageBytes } from "../../../src/card/render/page.js";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "./render-test-storage.js";

async function seedKnownLinkDeck(): Promise<RenderTestStorage> {
  const storage = await createRenderTestStorage();
  await seedCard(storage, { id: 2, name: "Basic", codename: "basic", typeId: 2 });
  // The resolved card: capital-N "Narrative".
  await seedCard(storage, { id: 500, name: "Narrative", typeId: 2, dbContent: "narrative-body" });
  // A lowercase-stored card for the reverse direction ([[Fieldwork]] -> /fieldwork).
  await seedCard(storage, { id: 501, name: "fieldwork", typeId: 2, dbContent: "fieldwork-body" });
  await seedCard(storage, { id: 900, name: "*all", codename: "all", typeId: 2 });
  await seedCard(storage, { id: 901, name: "*layout", codename: "layout", typeId: 2 });
  await seedCard(storage, { id: 904, name: "*title", codename: "title", typeId: 2 });
  await seedCard(storage, { id: 905, name: "*favicon", codename: "favicon", typeId: 2 });
  await seedCard(storage, { id: 906, name: "*ace", codename: "ace", typeId: 2 });
  await seedCard(storage, { id: 907, name: "*tiny_mce", codename: "tiny_mce", typeId: 2 });
  await seedCard(storage, { id: 910, leftId: 900, rightId: 901, typeId: 2, dbContent: "Probe Layout" });
  await seedCard(storage, { id: 911, name: "Probe Layout", typeId: 2, dbContent: "{{_main|titled}}" });
  // The pinned shape: prose linking the card with authored lowercase
  // text, plus the reverse-capitalization link.
  await seedCard(storage, {
    id: 685,
    name: "Href Probe Page",
    typeId: 2,
    dbContent: "the consequences of [[narrative]] and [[Fieldwork]] here",
  });
  await storage.fetcher.codenames.ensureLoaded();
  return storage;
}

describe("known-card wikilink hrefs the resolved card's name, label keeps the authored form", () => {
  it("renders href=/Narrative for [[narrative]] and href=/fieldwork for [[Fieldwork]]", async () => {
    const storage = await seedKnownLinkDeck();
    storage.fetcher.installNameEnvironment();
    const page = await renderPageBytes(storage.engine, "Href Probe Page");
    expect(page).toContain(
      '<a class="known-card" href="/Narrative"><span class="card-title" title="narrative">narrative</span></a>',
    );
    expect(page).toContain(
      '<a class="known-card" href="/fieldwork"><span class="card-title" title="Fieldwork">Fieldwork</span></a>',
    );
  });
});
