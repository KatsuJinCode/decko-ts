// The unknown pointer/list item's read verdict must be computed on the
// phantom's REAL type — the HOST's item_type_name — not the *all+*default
// template walk's type.
//
// Ruby truth (card-mod-collection-0.20.0 set/all/item.rb):
//   * nest_item -> item_view_options folds `options[:type] =
//     card.item_type_name` into the item nest BEFORE the fetch
//     (item.rb:149-158 determine_item_view_options_type).
//   * The fetch miss builds the phantom from that folded arg:
//     `Card.fetch name, new: new_unknown_item_args(args)` where
//     `itype = args[:type] || item_type_name` (item.rb:242-248). The
//     *all+*default template walk only fires when the host resolves NO
//     item type (Card.new's ensure_type_id).
//   * The read verdict then runs on THAT typed card
//     (view/permission.rb altered_view -> denial -> ok?(:read) ->
//     permission_rule_id walk, whose type-scoped candidate follows the
//     card's own type).
//
// The engine computed the verdict from newCardDefaultType alone, typing
// every host-typed phantom BasicCs — and this deck's BasicCs+*type+*read
// grants "Anyone Signed In", denying Anonymous, so the two-span denied
// body rendered where Ruby renders the FULL bar body
// (bar-body/card-title/bar-menu) for a host whose item type carries no
// denying read rule. The verdict and the rendered identity were computed
// from DIFFERENT types — the slot carried the host item type
// (phantomIdentity, hostItemType wins) while the verdict typed BasicCs.
// This test pins them to the same precedence, both directions.

import { describe, it, expect, afterAll } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "./render-test-storage.js";

let storage: RenderTestStorage | undefined;
afterAll(() => {
  storage?.close();
});

/** Cardtype + setting cards (ids mirror the entity-cluster test's seeds). */
async function seedBaseDeck(s: RenderTestStorage): Promise<void> {
  await seedCard(s, { id: 2, name: "Basic", codename: "basic", typeId: 2 });
  await seedCard(s, { id: 5, name: "Cardtype", codename: "cardtype", typeId: 5 });
  await seedCard(s, { id: 30, name: "Search", codename: "search_type", typeId: 5 });
  await seedCard(s, { id: 47, name: "List", codename: "list", typeId: 5 });
  await seedCard(s, { id: 259, name: "Set", codename: "set", typeId: 5 });
  await seedCard(s, { id: 34843, name: "Pointer", codename: "pointer", typeId: 5 });
  // The two type cards the verdict walks distinguish: consideration (the
  // host item type) and BasicCs (the *all+*default
  // template type).
  await seedCard(s, { id: 2979, name: "consideration", typeId: 5 });
  await seedCard(s, { id: 22281, name: "BasicCs", codename: "basic_c", typeId: 5 });
  // Settings.
  await seedCard(s, { id: 701, name: "*content options", typeId: 2 });
  await seedCard(s, { id: 704, name: "*read", codename: "read", typeId: 2 });
  await seedCard(s, { id: 708, name: "*self", typeId: 2 });
  await seedCard(s, { id: 274, name: "*all", codename: "all", typeId: 259 });
  // Permission parties (the read permission batch's codename lookup):
  // anyone + anonymous are the Anonymous viewer's parties;
  // anyone_signed_in is the party BasicCs+*type+*read grants.
  await seedCard(s, { id: 10, name: "Anyone", codename: "anyone", typeId: 2 });
  await seedCard(s, { id: 11, name: "Anyone Signed In", codename: "anyone_signed_in", typeId: 2 });
  await seedCard(s, { id: 12, name: "Anonymous", codename: "anonymous", typeId: 2 });
  // The deck's two read rules:
  //   *all+*read = "Anyone"  (readable by the Anonymous viewer)
  //   BasicCs+*type+*read = "Anyone Signed In" (denies Anonymous)
  await seedCard(s, {
    id: 800,
    name: "*all+*read",
    leftId: 274,
    rightId: 704,
    typeId: 2,
    dbContent: "Anyone",
  });
  await seedReference(s, 800, 10, "anyone", "L");
  await seedCard(s, {
    id: 802,
    name: "BasicCs+*type",
    leftId: 22281,
    rightId: 259,
    typeId: 259,
  });
  await seedCard(s, {
    id: 801,
    name: "BasicCs+*type+*read",
    leftId: 802,
    rightId: 704,
    typeId: 2,
    dbContent: "Anyone Signed In",
  });
  await seedReference(s, 801, 11, "anyone_signed_in", "L");
}

/** A List host whose *content_options rule resolves the given item type
 *  (the cql JSON spec shape) and one
 *  item that does not exist in the deck. */
async function seedTypedListHost(
  s: RenderTestStorage,
  suffix: string,
  itemTypeName: string,
): Promise<void> {
  const hostId = 99100 + suffix.length;
  await seedCard(s, {
    id: hostId,
    name: `typed host ${suffix}`,
    typeId: 47,
    dbContent: "phantom item",
  });
  await seedCard(s, {
    id: hostId + 1,
    name: `typed host ${suffix}+*self`,
    leftId: hostId,
    rightId: 708,
    typeId: 259,
  });
  await seedCard(s, {
    id: hostId + 2,
    name: `typed host ${suffix}+*self+*content options`,
    leftId: hostId + 1,
    rightId: 701,
    typeId: 30,
    dbContent: `{"type":"${itemTypeName}"}`,
  });
}

describe("unknown pointer/list item read verdict follows the HOST item type (item.rb:245-248)", () => {
  it("consideration-typed phantom renders the FULL bar body (readable via *all+*read Anyone)", async () => {
    storage = await createRenderTestStorage();
    await seedBaseDeck(storage);
    await seedTypedListHost(storage, "one", "consideration");

    const html = await storage.engine.render("typed host one", "content");

    // The FULL bar.haml body for the
    // consideration-typed unknown items: bar-body row + card-title + bar-right.
    expect(html).toContain("bar-body row g-0");
    expect(html).toMatch(/class="card-title" title="phantom item"/);
    // NO denied spans: the verdict must not deny via the BasicCs type rule.
    expect(html).not.toContain('class="denied"');
    // The slot + bar carry the host item type's identity.
    expect(html).toMatch(/class="card-slot mini_bar-view [^"]*TYPE-consideration[^"]*"/);
    expect(html).toMatch(/<div class='bar [^']*TYPE-consideration[^']*with-bar-menu/);
  });

  it("BasicCs-typed phantom keeps the two-span denied body (the host type IS the denying type)", async () => {
    storage = await createRenderTestStorage();
    await seedBaseDeck(storage);
    await seedTypedListHost(storage, "two", "BasicCs");

    const html = await storage.engine.render("typed host two", "content");

    // The host item type is BasicCs itself, so the verdict walk hits
    // BasicCs+*type+*read = "Anyone Signed In" — Anonymous denied, the
    // two-span denied body.
    expect(html).toContain('class="denied"');
    expect(html).not.toContain("bar-body row g-0");
    expect(html).toMatch(/<div class='bar [^']*TYPE-basic_c[^']*with-bar-menu/);
  });
});
