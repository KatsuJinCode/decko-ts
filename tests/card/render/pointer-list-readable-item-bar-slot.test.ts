// Pointer/list item slot shape splits on the item's READ permission.
//
// Pins the read-denial gate on the pointer/list item's mini_bar slot
// swap (src/card/render/views.ts#renderPointerListItem):
//
//   * READABLE item -> the `bar-view` slot the standard nestRecord bar
//     dispatch produced: id `${safeKey}-bar-view`, class
//     `card-slot bar-view ...`, data-card-id present, full titled bar
//     body. Two independent oracles pin this shape:
//       - corpus v2 recapture (fixtures/corpus-v2/recapture): 42
//         readable pointer-item slots carry `bar-view` (e.g. shard
//         entry id 45410 "yol" content view -> items
//         `id="awheasxlcszvy-bar-view"` with data-card-id and the
//         bar-left card-title body), while ALL 229 `mini_bar-view`
//         item slots wrap a read-DENIED item.
//       - live wire (tmp/live-wire/Aikido_Oak_Cliff.html): the
//         Aikido Oak Cliff+related list renders its readable items as
//         `<div id="aikido_oak_cliff-gallery-bar-view"
//         class="card-slot bar-view ..." data-card-id="44345" ...>`
//         with the full bar body — never mini_bar.
//   * READ-DENIED item -> the mini_bar slot wrap (id
//     `${safeKey}-mini_bar-view`, class `card-slot mini_bar-view ...`)
//     around the denied-spans body. The corpus's denied swtktey items
//     carry the swtktey+*type+*read rule (id 22283, party
//     anyone_signed_in) which the Anonymous viewer is not a member of;
//     seeding that stored rule reproduces the denial through the
//     engine's real verdict path.
//
// The prior revision swapped bar-view -> mini_bar-view UNCONDITIONALLY
// for every known item, producing mini_bar for readable items and
// failing both oracle families above.

import { describe, it, expect, afterAll } from "vitest";
import {
  createStructureSeededStorageFor,
  readShardLines,
} from "./structure-corpus-seeding.js";
import { createRenderTestStorage, seedCard, type RenderTestStorage } from "./render-test-storage.js";

let plainStorage: RenderTestStorage | undefined;
let corpusStorage: Awaited<ReturnType<typeof createStructureSeededStorageFor>> | undefined;

afterAll(() => {
  plainStorage?.close();
  corpusStorage?.close();
});

describe("pointer/list item slot: readable items keep the bar-view slot, denied items keep mini_bar", () => {
  it(
    "a List card renders its readable item as a bar-view slot with data-card-id and the titled bar body",
    async () => {
      // Rule-less storage: the read-permission state's rule-less
      // allowance keeps every card readable (render.ts readPermission
      // gate), isolating the readable half of the split.
      plainStorage = await createRenderTestStorage();
      // The List cardtype card (codename drives the pointer/list
      // dispatch's typeCode check) + the host list + the item.
      await seedCard(plainStorage, { id: 7, name: "List", codename: "list", typeId: 2 });
      await seedCard(plainStorage, {
        id: 99100,
        name: "deferred lane list",
        typeId: 7,
        dbContent: "readable item",
      });
      await seedCard(plainStorage, {
        id: 99101,
        name: "readable item",
        typeId: 2,
        dbContent: "<p>readable body</p>",
      });
      const html = await plainStorage.engine.render("deferred lane list", "content");

      // Readable item: the bar-view slot nestRecord produced — id,
      // class, and the data-card-id the slot's card carries. The slot
      // must NOT carry the mini_bar swap.
      expect(html).toContain('id="readable_item-bar-view"');
      expect(html).toMatch(/class="card-slot bar-view [^"]*"/);
      expect(html).toContain('data-card-name="readable item"');
      expect(html).toContain('data-card-id="99101"');
      expect(html).not.toContain('id="readable_item-mini_bar-view"');
      // The readable item renders the titled bar body (bar-left with
      // the card-title span — live Aikido +Gallery shape).
      expect(html).toMatch(/bar-left[\s\S]{0,200}card-title/);
    },
  );

  it(
    "a List card renders its read-denied item as the mini_bar slot wrap around the denied body",
    async () => {
      // Corpus-seeded storage (the read-rule universe included): the
      // item stores the corpus's denying swtktey+*type+*read rule
      // (22283, party anyone_signed_in) exactly like the corpus's
      // denied swtktey items (cards.type_id 22281 rows) do.
      const baseIds = new Set(readShardLines().map((l) => l.id));
      baseIds.add(22281); // the swtktey type card (set-key TYPE token)
      baseIds.add(22282); // the swtktey+*type set card
      corpusStorage = await createStructureSeededStorageFor(baseIds);
      await seedCard(corpusStorage, {
        id: 99102,
        name: "deferred lane denied list",
        typeId: 47,
        dbContent: "denied item",
      });
      await seedCard(corpusStorage, {
        id: 99103,
        name: "denied item",
        typeId: 22281,
        readRuleId: 22283,
        readRuleClass: "*type",
      });
      const html = await corpusStorage.engine.render("deferred lane denied list", "content");
      expect(html).toContain('id="denied_item-mini_bar-view"');
      expect(html).toContain('class="card-slot mini_bar-view');
      expect(html).not.toContain('id="denied_item-bar-view"');
    },
  );
});
