// TYPE_PLUS_RIGHT anchor for a nest-miss child of a virtual set card.
//
// Mechanism: the child "PlainText+*type+by_name" has NO stored row (the
// deck has no PlainText+*type row either), so the nest resolves through
// the virtual-card chain Ruby runs: the child is VIRTUAL
// (card-mod-search set/right/by_name.rb VirtualSearch, type Search), and
// its slot's TYPE_PLUS_RIGHT anchor reads the LEFT side's type - the
// virtual set card "PlainText+*type", whose type comes from the *structure
// template chain (the *type+*right+*structure rule card, type Set):
// card-1.110.0 lib/card/set/pattern/class_methods.rb left_type ->
// 08_type_plus_right.rb#anchor_name "#{left_type(card)}+#{card.name.tag}"
// -> pattern/base.rb:70-73 safe_key. The slot reads
// TYPE_PLUS_RIGHT-set-by_name.
//
// The engine's sync nest builder computed that anchor from the CONTEXT
// card's type while the left was not yet in the warm render map:
// PlainText is a Cardtype, so the slot read
// TYPE_PLUS_RIGHT-cardtype-by_name. The fetch layer resolves the left
// correctly (async virtual hook -> typeId 25/259 Set) but only AFTER the
// bytes were built; the post-render map held the right keys over a page
// that had already emitted the wrong ones.
//
// The fix: the sync left-type resolution walks the engine's loaded
// *structure universe (the same candidate walk the fetch layer's virtual
// hook runs, resolveVirtualCardStructure) before falling back to the
// context type.

import { describe, expect, it } from "vitest";
import { renderPageBytes } from "../../../src/card/render/page.js";
import { DeckoName } from "../../../src/card/name.js";
import { createVirtualCardLookup } from "../../../src/card/fetch/virtual-cards.js";
import {
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "./render-test-storage.js";

/** The PlainText page shape in miniature: a cardtype card whose content
 *  nests the by_name search of its own type set; the *type+*right+*structure
 *  rule (type Set - the template that types every virtual "X+*type" set
 *  card); the by name+*right+*structure rule (type Search - the virtual
 *  search child). Rows mirrored: the *type+*right structure rule (Set-typed)
 *  and the by name+*right structure rule (Search-typed). */
async function seedCardtypeByNameDeck(): Promise<RenderTestStorage> {
  const storage = await createRenderTestStorage();
  await seedCard(storage, { id: 2, name: "Basic", codename: "basic", typeId: 2 });
  await seedCard(storage, { id: 5, name: "Cardtype", codename: "cardtype", typeId: 2 });
  await seedCard(storage, { id: 25, name: "Set", codename: "set", typeId: 2 });
  await seedCard(storage, { id: 30, name: "Search", codename: "search_type", typeId: 2 });
  await seedCard(storage, { id: 266, name: "*type", codename: "type", typeId: 2 });
  await seedCard(storage, { id: 315, name: "*right", codename: "right", typeId: 2 });
  await seedCard(storage, { id: 317, name: "*structure", codename: "structure", typeId: 2 });
  // The *type+*right+*structure rule: types every virtual "X+*type" card
  // as Set.
  await seedCard(storage, { id: 9402, leftId: 266, rightId: 315, typeId: 25 });
  await seedCard(storage, {
    id: 9400,
    leftId: 9402,
    rightId: 317,
    typeId: 25,
    dbContent: '{"type":"_left"}',
  });
  // The by name+*right+*structure rule: the virtual search child
  // ({"found_by": "_left", "sort": "name"}, type Search).
  await seedCard(storage, { id: 9404, name: "by name", codename: "by_name", typeId: 2 });
  await seedCard(storage, { id: 9406, leftId: 9404, rightId: 315, typeId: 25 });
  await seedCard(storage, {
    id: 9405,
    leftId: 9406,
    rightId: 317,
    typeId: 30,
    dbContent: '{"found_by": "_left", "sort": "name"}',
  });
  // The cardtype page: PlainText's content nests the by_name search.
  await seedCard(storage, {
    id: 22,
    name: "PlainText",
    typeId: 5,
    dbContent: "<p>{{+*type+by_name}}</p>",
  });
  // Layout trio + the titled-chrome codenames.
  await seedCard(storage, { id: 900, name: "*all", codename: "all", typeId: 25 });
  await seedCard(storage, { id: 901, name: "*layout", codename: "layout", typeId: 2 });
  await seedCard(storage, { id: 904, name: "*title", codename: "title", typeId: 2 });
  await seedCard(storage, { id: 905, name: "*favicon", codename: "favicon", typeId: 2 });
  await seedCard(storage, { id: 906, name: "*ace", codename: "ace", typeId: 2 });
  await seedCard(storage, { id: 907, name: "*tiny_mce", codename: "tiny_mce", typeId: 2 });
  await seedCard(storage, { id: 910, leftId: 900, rightId: 901, typeId: 2, dbContent: "Probe Layout" });
  await seedCard(storage, { id: 911, name: "Probe Layout", typeId: 2, dbContent: "{{_main|titled}}" });
  // The catch-all read rule every real deck bootstraps (card/auth/setup.rb:44):
  // `*all+*read` -> [[Anyone]]. Seeded LAST, after the `all`/`set` codename
  // takeovers have finished, because seedCard writes the stock substrate's
  // displaced ids into the deck: taking over `*all` repoints the stock rule
  // (10000006) onto THIS deck's *all, takes over `*read` repoints it onto this
  // deck's *read, and takes over `set` repoints the stock *all card's TYPE
  // onto this deck's Set TYPE card. This deck's own *all is typed Set (25),
  // as a set card is (the read-rule cache join filters
  // `sets.type_id = SetID`, read_rule_cache.rb ->
  // src/card/permissions/read-rules.ts), so that repointed row is this deck's
  // own catch-all read rule; only its *read side and its Anyone reference
  // follow.
  await seedCard(storage, { id: 908, name: "*read", codename: "read", typeId: 2 });
  await seedReference(storage, 10000006, 10000004, "anyone");
  await storage.fetcher.codenames.ensureLoaded();
  // A full corpus storage factory wires the virtual-card hook over the
  // loaded structure universe; the bare test
  // storage does not, so the universe rows are mirrored here.
  const key = (s: string) => DeckoName.parse(s).key;
  storage.fetcher.virtualCardLookup = createVirtualCardLookup(storage.fetcher, {
    contents: new Map([
      [key("*type+*right+*structure"), '{"type":"_left"}'],
      [key("by name+*right+*structure"), '{"found_by": "_left", "sort": "name"}'],
    ]),
    ruleTypeIds: new Map([
      [key("*type+*right+*structure"), 25],
      [key("by name+*right+*structure"), 30],
    ]),
  });
  return storage;
}

describe("nest-miss child of a virtual set card anchors TYPE_PLUS_RIGHT on the left's virtual type", () => {
  it("renders TYPE_PLUS_RIGHT-set-by_name for the PlainText+*type+by_name slot", async () => {
    const storage = await seedCardtypeByNameDeck();
    storage.fetcher.installNameEnvironment();
    const page = await renderPageBytes(storage.engine, "PlainText");
    expect(page).toContain("plain_text-Xtype-by_name-content-view");
    expect(page).toContain("TYPE_PLUS_RIGHT-set-by_name");
    expect(page).not.toContain("TYPE_PLUS_RIGHT-cardtype-by_name");
  });
});
