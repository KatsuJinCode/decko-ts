// positive-family lane (2026-10-02): the bootswatch-skin virtual field
// cards (+*colors / +*variables) must carry the SCSS type card's IDENTITY
// (id 17436, name "SCSS") regardless of render order.
//
// The defect this pins (commit 4145c6e): scssTypeIdentity fetched the SCSS
// card from the render-card map and returned the card's OWN type
// (typeCard.typeId = 5 Cardtype, typeCard.typeName = "Cardtype") instead of
// the card's id/name. While "scss" was map-absent the hardcoded fallback
// {17436, "SCSS"} answered (correct); after ANY earlier render enriched the
// SCSS row the map hit answered {5, "Cardtype"} and every subsequent skin
// page rendered `TYPE-cardtype … data-card-type-id="5"
// data-card-type-name="Cardtype"` on both accordion slots — +32 bytes per
// page, 20 canvas page failures (14 on shard 000017, 6 on shard 000028),
// every one exactly +32, first divergence at the Xcolor/Xvariable
// accordion_bar slot attributes.
//
// The pin renders the skin core twice: once with a cold render-card map
// (the fallback arm) and once AFTER a render that seats the SCSS card (the
// hit arm). Both must carry the oracle slot identity the corpus pins
// (shard-000017 cerulean skin page, offset 9070: TYPE-scss /
// data-card-type-id="17436" / data-card-type-name="SCSS").

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "./render-test-storage.js";

let storage: RenderTestStorage | undefined;

async function seedDeck(): Promise<void> {
  const s = storage!;
  await seedCard(s, { id: 1, name: "Set", codename: "set" });
  await seedCard(s, { id: 2, name: "Setting", codename: "setting" });
  await seedCard(s, { id: 5, name: "Cardtype", codename: "cardtype" });
  await seedCard(s, { id: 6, name: "Anyone", codename: "anyone" });
  // The SCSS type card — a REAL row, Cardtype-typed (every type card is),
  // exactly the record whose map presence used to flip the virtual field
  // identity to Cardtype/5.
  await seedCard(s, { id: 17436, name: "SCSS", codename: "scss", typeId: 5 });
  // The Bootswatch skin cardtype and one skin instance (corpus: cerulean
  // skin id 22774 type 33929).
  await seedCard(s, { id: 33929, name: "Bootswatch skin", codename: "bootswatch_skin", typeId: 5 });
  await seedCard(s, { id: 22774, name: "cerulean skin", typeId: 33929, dbContent: "" });
  // The *all+*read grant (deck-readable) so the anonymous render passes the
  // read gate.
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: 1, dbContent: "{}" });
  await seedCard(s, { id: 20, name: "*read", codename: "read", typeId: 2 });
  await seedCard(s, { id: 50, leftId: 10, rightId: 20, dbContent: "[[Anyone]]" });
  await seedReference(s, 50, 6, "anyone");
}

/** The colors accordion slot's opening div: the identity the oracle pins. */
function colorsSlot(html: string): string {
  const at = html.indexOf(`<div id="cerulean_skin-Xcolor-accordion_bar-view"`);
  expect(at).toBeGreaterThan(-1);
  return html.slice(at, html.indexOf(">", at) + 1);
}

function expectScssIdentity(slot: string): void {
  expect(slot).toContain("TYPE-scss");
  expect(slot).toContain('data-card-type-id="17436"');
  expect(slot).toContain('data-card-type-name="SCSS"');
  // The guard that FAILS pre-fix once the map is warm:
  expect(slot).not.toContain("TYPE-cardtype");
  expect(slot).not.toContain('data-card-type-id="5"');
  expect(slot).not.toContain('data-card-type-name="Cardtype"');
}

beforeAll(async () => {
  storage = await createRenderTestStorage();
  await seedDeck();
}, 60_000);

afterAll(() => {
  storage?.close();
});

describe("bootswatch skin virtual field cards: SCSS type identity is render-order independent", () => {
  it("types the virtual +*colors card SCSS on a cold render-card map", async () => {
    const html = await storage!.engine.render("cerulean skin", "core");
    expectScssIdentity(colorsSlot(html));
  });

  it("types the virtual +*colors card SCSS after the SCSS type card joined the map", async () => {
    // Seat the SCSS card in the render-card map exactly the way any earlier
    // page render does (the map is the only state the defect read).
    await storage!.engine.render("SCSS", "content");
    const html = await storage!.engine.render("cerulean skin", "core");
    expectScssIdentity(colorsSlot(html));
  });
});
