// Flat-table views Ruby defines only on some sets: the resolver serves them
// only to cards in those sets; any other card gets the unsupported-view
// error, as render.rb#view_method raises in Ruby.

import { afterAll, describe, expect, it } from "vitest";
import { createRenderTestStorage, seedCard, type RenderTestStorage } from "./render-test-storage.js";
import { flatViewDefinedFor } from "../../../src/card/render/views.js";

let storage: RenderTestStorage | undefined;
afterAll(() => storage?.close());

async function seedDeck(): Promise<RenderTestStorage> {
  storage = await createRenderTestStorage();
  await seedCard(storage, { id: 2, name: "RichText", codename: "basic", typeId: 3 });
  await seedCard(storage, { id: 3, name: "Cardtype", codename: "cardtype", typeId: 3 });
  await seedCard(storage, { id: 10, name: "Recipe", typeId: 3 });
  await seedCard(storage, { id: 11, name: "Pancakes", typeId: 2 });
  await storage.fetcher.codenames.ensureLoaded();
  return storage;
}

describe("flat views scoped to their Ruby sets", () => {
  it("add_url renders for a Cardtype card and is unsupported for a plain card", async () => {
    const s = await seedDeck();
    expect(await s.engine.render("Recipe", "add_url")).toContain("/recipe/new");
    await expect(s.engine.render("Pancakes", "add_url")).rejects.toThrow(/not supported/);
  });

  it("the scope table answers by set keys, abstract includes counted", () => {
    expect(flatViewDefinedFor("add_button", "ALL TYPE-cardtype SELF-recipe")).toBe(true);
    expect(flatViewDefinedFor("add_button", "ALL TYPE-rich_text SELF-pancake")).toBe(false);
    expect(flatViewDefinedFor("verify_url", "ALL ALL_PLUS RIGHT-Xaccount SELF-jane-Xaccount")).toBe(true);
    // Type::SearchType includes Abstract::Search::Views (include_set)
    expect(flatViewDefinedFor("card_list", "ALL TYPE-search_type SELF-recent")).toBe(true);
    expect(flatViewDefinedFor("card_list", "ALL TYPE-rich_text SELF-pancake")).toBe(false);
    // an unscoped view applies everywhere
    expect(flatViewDefinedFor("core", "ALL TYPE-rich_text SELF-pancake")).toBe(true);
  });

  it("a type token names Ruby's module by the type's codename (Search -> Type::SearchType)", async () => {
    const s = await seedDeck();
    await seedCard(s, { id: 30, name: "Search", codename: "search_type", typeId: 3 });
    s.fetcher.resetCaches();
    s.fetcher.installNameEnvironment();
    await s.fetcher.warmLexicon([2, 3, 10, 11, 30]);
    expect(flatViewDefinedFor("card_list", "ALL TYPE-search SELF-recent")).toBe(true);
    expect(flatViewDefinedFor("card_list", "ALL TYPE-recipe SELF-pancake")).toBe(false);
  });
});
