// T1-1 sweepproof pin: a card seated AFTER the last applyStructureContent
// pass of its seat render must still get its *structure substitution before
// any later render reads its content.
//
// Mechanism under test (adversarial-review-tonights-work-lane.md T1-1, HIGH):
// the sweep cut bounded applyStructureContent to the per-render renderSeats
// set (render.ts:2755). The pointer/list item closure
// (enrichPointerListItemsClosure, render.ts:1451/1587) seats a pointer's
// items AFTER that render's last structure pass (render.ts:1211) — so the
// late-seated item never joins structureProcessed on its seat render.
// enrichmentAndStore seats only on map INSERT (render.ts:7457), so no later
// render re-seats it, and closureSurface's BFS (render.ts:7264) walks only
// absolute {{nest}} content references — pointer-item lines are not BFS
// edges — so no later render re-reaches it either. The card renders RAW
// dbContent forever, where Ruby (Card#content -> structured_content,
// content/all.rb:8-10) and the pre-cut port render the substituted template.
//
// Failing shape (this file): render 1 of the pointer host "widget list"
// seats its item "my widget" in the pointer closure (after pass #2). Render 2
// of "page b" nests the host with an item:open option; the item bar dispatch
// reads X's dbContent synchronously off the prepared map — unsubstituted.
// The same engine renders "my widget" as a ROOT afterwards to show the rule
// resolves when the pass covers the card (the differential that proves the
// miss is the seat timing, not the rule universe).

import { describe, expect, it, afterAll } from "vitest";
import { createRenderTestStorage, seedCard, type RenderTestStorage } from "./render-test-storage.js";

const TEMPLATE_BYTES = "TEMPLATE-SUBSTITUTED-BYTES-FOR-MY-WIDGET";
const RAW_BYTES = "RAW-UNSUBSTITUTED-ITEM-BYTES";

async function seedDeck(s: RenderTestStorage): Promise<void> {
  // Cardtype cards the codename registry needs (pointer/list gates match on
  // typeCode — render.ts isPointerLikeHost).
  await seedCard(s, { id: 2, name: "Basic", codename: "basic", typeId: 2 });
  await seedCard(s, { id: 5, name: "Cardtype", codename: "cardtype", typeId: 5 });
  await seedCard(s, { id: 30, name: "Search", codename: "search_type", typeId: 5 });
  await seedCard(s, { id: 47, name: "List", codename: "list", typeId: 5 });
  await seedCard(s, { id: 259, name: "Set", codename: "set", typeId: 5 });
  await seedCard(s, { id: 34843, name: "Pointer", codename: "pointer", typeId: 5 });
  // Settings/sides the rule walks and junction fetches resolve.
  await seedCard(s, { id: 700, name: "*right", typeId: 2 });
  await seedCard(s, { id: 701, name: "*content options", typeId: 2 });
  await seedCard(s, { id: 708, name: "*self", typeId: 2 });
  await seedCard(s, { id: 709, name: "*structure", typeId: 2 });
  await seedCard(s, { id: 710, name: "*type", typeId: 2 });
  await seedCard(s, { id: 274, name: "*all", codename: "all", typeId: 259, dbContent: "" });
  // The Widget cardtype + its TYPE-level *structure rule (the template).
  await seedCard(s, { id: 900, name: "Widget", typeId: 5 });
  await seedCard(s, { id: 901, name: "Widget+*type", leftId: 900, rightId: 710, typeId: 259 });
  await seedCard(s, {
    id: 902,
    name: "Widget+*type+*structure",
    leftId: 901,
    rightId: 709,
    typeId: 30,
    dbContent: `<p>${TEMPLATE_BYTES}</p>`,
  });
  // The structured item (raw db_content that the template must replace).
  await seedCard(s, {
    id: 910,
    name: "my widget",
    typeId: 900,
    dbContent: `<p>${RAW_BYTES}</p>`,
  });
  // The pointer host whose item seat runs in enrichPointerListItemsClosure —
  // AFTER render()'s last applyStructureContent (render.ts:1211 vs :1451).
  await seedCard(s, {
    id: 911,
    name: "widget list",
    typeId: 34843,
    dbContent: "my widget",
  });
  // Page B: nests the host with an item view option — the pointer-item read
  // path (views.ts renderPointerListItem -> nestRecord(item, itemView)).
  // No {{nest}} reference names "my widget" anywhere, so closureSurface has
  // no BFS edge to it on any render.
  await seedCard(s, {
    id: 912,
    name: "page b",
    typeId: 2,
    dbContent: "{{widget list|item:open}}",
  });
}

let storage: RenderTestStorage | undefined;

afterAll(() => {
  storage?.close();
});

describe("T1-1 sweepproof: late-seated pointer item gets its structure substitution", () => {
  it(
    "render 1 seats the pointer item after the last structure pass; render 2 reads its content — bytes must be the template's",
    async () => {
      storage = await createRenderTestStorage();
      await seedDeck(storage);

      // Render 1: the pointer host. Its item joins the map in
      // enrichPointerListItemsClosure (render.ts:1451) — after the render's
      // last applyStructureContent (render.ts:1211) — so this render never
      // substitutes it. (The default item view is :bar — title-only — so the
      // miss is invisible on THIS render's bytes; the divergence is state,
      // not bytes, until a later render reads the item's content.)
      await storage.engine.render("widget list", "content");

      // Render 2: page b nests the host with item:open. The item bar
      // dispatch reads the item's substituted content synchronously off the
      // prepared map. Ruby renders Card#content here (structured_content,
      // content/all.rb:8-10) — the template. The item card is in the map
      // (render 1 seated it), enrichAndStore's existing-key guard never
      // re-seats it, and closureSurface's nest-ref BFS cannot re-reach it
      // (pointer item lines are not nest references) — so under the bound
      // sweep it is never processed: RED renders the raw bytes.
      const pageBytes = await storage.engine.render("page b", "content");
      expect(pageBytes).toContain(TEMPLATE_BYTES);
      expect(pageBytes).not.toContain(RAW_BYTES);

      // Render 3 (permanence): the gap is permanent-per-engine under the
      // bound sweep (no later render can pick the card up). Pin that the
      // fix holds on every subsequent render, not just the first read.
      const pageBytesAgain = await storage.engine.render("page b", "content");
      expect(pageBytesAgain).toContain(TEMPLATE_BYTES);
      expect(pageBytesAgain).not.toContain(RAW_BYTES);

      // Differential: rendering the item as the ROOT processes it at pass #1
      // (closureSurface seats the root unconditionally), so the ROOT render
      // shows the template — proving the rule universe resolves and the miss
      // is the seat timing, not the rule.
      const rootBytes = await storage.engine.render("my widget", "content");
      expect(rootBytes).toContain(TEMPLATE_BYTES);
      expect(rootBytes).not.toContain(RAW_BYTES);
    },
  );
});
