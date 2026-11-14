// The bar-menu known/wanted class split for 2-part star-right (rstar)
// rule-row names splits by the LEFT part:
//
//   star-left compounds ("*all+*autoname", "*all+*create", "*star+*default",
//   ...) — a RULE-ROW name "<set-marker>+<setting>": the page-link class
//   follows STORED-ROW presence — an absent row renders wanted-card, a
//   present row renders known-card.
//
//   non-star-left compounds ("Anonymous+*created", "mod X+*script", ...) —
//   known-card EVEN WHEN no stored row exists, because Ruby's Card.known?
//   is fetch(name).present?, and a compound whose right part is a set
//   family card is virtual (card-mod-search virtual_search.rb `virtual?`
//   = new?; card-mod-rules virtual_set.rb). That family is matched by the
//   right card's codename (Right pattern, set/pattern/base.rb anchor
//   codenames), so the deck must hold the stock "*created" card with codename
//   "created" (card-mod-search data/real.yml), as every Ruby deck does.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "./render-test-storage.js";

let storage: RenderTestStorage | undefined;

const SET_TYPE_ID = 1;
const SETTING_TYPE_ID = 2;
const LIST_TYPE_ID = 3;
const RICH_TYPE_ID = 4;

async function seedDeck(): Promise<void> {
  const s = storage!;
  await seedCard(s, { id: 1, name: "Set", codename: "set" });
  await seedCard(s, { id: 2, name: "Setting", codename: "setting" });
  await seedCard(s, { id: 3, name: "List", codename: "list" });
  await seedCard(s, { id: 4, name: "RichText", codename: "rich_text" });
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: SET_TYPE_ID, dbContent: "{}" });
  // The stock *created card (card-mod-search data/real.yml). Its codename is
  // what makes +*created compounds the VirtualSearch family in Ruby.
  await seedCard(s, { id: 25, name: "*created", codename: "created", typeId: SETTING_TYPE_ID });
  const settings: Array<[number, string, string]> = [
    [20, "*read", "read"],
    [21, "*default", "default"],
    [22, "*autoname", "autoname"],
    [24, "*create", "create"],
  ];
  for (const [id, name, codename] of settings) {
    await seedCard(s, { id, name, codename, typeId: SETTING_TYPE_ID });
  }
  // The stored star-left rule row: *all+*create exists -> its bar menu
  // pins known.
  await seedCard(s, { id: 50, leftId: 10, rightId: 24, typeId: LIST_TYPE_ID, dbContent: "{}" });
  // The non-star-left rule-row shape pinned known WITHOUT a stored row
  // (Anonymous+*created): the card-name left is a plain content card.
  await seedCard(s, { id: 60, name: "Anonymous", codename: "anonymous", typeId: RICH_TYPE_ID, dbContent: "anon" });
  // The surface: a host card nests the absent name as a bar (slot classes
  // of the shape `card-slot bar-view ALL ALL_PLUS TYPE-search RSTAR
  // RIGHT-Xcreated ...`). No stored row exists — the known-fiction subset.
  await seedCard(s, { id: 61, name: "Anon Host", typeId: RICH_TYPE_ID, dbContent: "{{Anonymous+*created|bar}}" });
}

beforeAll(async () => {
  storage = await createRenderTestStorage();
  await seedDeck();
}, 60_000);

afterAll(() => {
  storage?.close();
});

describe("2-part rstar bar-menu class splits by left part", () => {
  it("star-left absent rule row -> wanted-card page link, create label", async () => {
    const html = await storage!.engine.render("*all", "content");
    const at = html.indexOf("Xall-Xautoname-bar-view");
    expect(at).toBeGreaterThan(-1);
    const slotStart = html.lastIndexOf("<div", at);
    const slot = html.slice(slotStart, slotStart + 3000);
    expect(slot).toContain(`<a class="full-page-link wanted-card" href="/*all+*autoname">`);
    expect(slot).toContain("create</a>");
    expect(slot).not.toContain(`known-card" href="/*all+*autoname"`);
  });

  it("star-left STORED rule row (*all+*create) -> known-card page link, edit label", async () => {
    const html = await storage!.engine.render("*all", "content");
    const at = html.indexOf("Xall-Xcreate-bar-view");
    expect(at).toBeGreaterThan(-1);
    const slotStart = html.lastIndexOf("<div", at);
    const slot = html.slice(slotStart, slotStart + 3000);
    expect(slot).toContain(`full-page-link known-card`);
    expect(slot).not.toContain(`wanted-card" href="/*all+*create"`);
  });

  it("non-star-left absent rule row (Anonymous+*created) is known-card through the VirtualSearch family (no stored row)", async () => {
    // The host card nests the absent name as a bar. Ruby's Card.known? is
    // true for it: the +*created right is the VirtualSearch family, so the
    // card is virtual (new?) and its menu link is known-card.
    const html = await storage!.engine.render("Anon Host", "content");
    expect(html).toContain(`data-card-name="Anonymous+*created"`);
    expect(html).toContain("full-page-link known-card");
  });
});
