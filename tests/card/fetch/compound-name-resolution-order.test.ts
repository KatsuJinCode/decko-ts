// Fetch by id and by name for compound rows the lexicon cannot reach by
// name, pinned to Ruby Decko's observed behaviour (card-1.110.0, measured
// against the capture deck on a cold cache in both orders).
//
// Ruby resolves a compound NAME only through its side ids
// (lexicon.rb#name_to_lex -> [left_id, right_id] -> lex_to_id, trash: false).
// Two kinds of live row are therefore unreachable by name:
//   - a legacy row whose compound name is stored in the name column with no
//     left_id/right_id (no row matches the side-id pair);
//   - a row with a trashed side (the side's lex_to_id answers nil).
// Fetch by ID reads the row directly (retrieve.rb#retrieve_from_db) and
// finds both. But a by-name miss caches a new-card placeholder under the
// name's key (store.rb#new_for_cache), and fetch by id checks the cache by
// that key first (cache/card_class.rb#retrieve_from_cache_by_id), so after a
// by-name miss Card[id] answers nil as well. The answer for these rows
// depends on which lookup ran first. This is a Ruby defect; the port
// reproduces it deliberately so both engines answer the same questions the
// same way, cache state for cache state.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFetchTestStorage, seedCard, type FetchTestStorage } from "./fetch-test-storage.js";

let storage: FetchTestStorage;

beforeEach(async () => {
  storage = await createFetchTestStorage();
  await seedCard(storage, { id: 2, name: "RichText", codename: "basic", typeId: 2 });
  await seedCard(storage, { id: 10, name: "Journal" });
  await seedCard(storage, { id: 11, name: "Associations" });
  await seedCard(storage, { id: 12, name: "Illustration", trash: true });
  await seedCard(storage, { id: 13, name: "Journal+Illustration", leftId: 10, rightId: 12 });
  await seedCard(storage, { id: 14, name: "Journal+Associations", leftId: 10, rightId: 11 });
  // The legacy shape: compound name in the name column, no side ids.
  await storage.driver.query("UPDATE cards SET name = ?, key = ?, left_id = NULL, right_id = NULL WHERE id = 14", [
    "Journal+Associations",
    "journal+association",
  ]);
});

afterEach(() => storage.close());

describe("compound rows the lexicon cannot reach by name", () => {
  it("a cold fetch by id returns the legacy row and the trashed-side row", async () => {
    expect((await storage.engine.bracket(14))?.id).toBe(14);
    expect((await storage.engine.bracket(13))?.id).toBe(13);
  });

  it("a cold fetch by name finds neither", async () => {
    expect(await storage.engine.lexicon.id("Journal+Associations")).toBeUndefined();
    expect(await storage.engine.lexicon.id("Journal+Illustration")).toBeUndefined();
    expect(await storage.engine.bracket("Journal+Associations")).toBeUndefined();
    expect(await storage.engine.bracket("Journal+Illustration")).toBeUndefined();
  });

  it("after a by-name miss, fetch by id answers nil too (the cached placeholder wins)", async () => {
    expect(await storage.engine.bracket("Journal+Associations")).toBeUndefined();
    expect(await storage.engine.bracket(14)).toBeUndefined();
    expect(await storage.engine.bracket("Journal+Illustration")).toBeUndefined();
    expect(await storage.engine.bracket(13)).toBeUndefined();
  });

  it("after a by-id hit, fetch by name is a cache hit", async () => {
    expect((await storage.engine.bracket(14))?.id).toBe(14);
    expect((await storage.engine.bracket("Journal+Associations"))?.id).toBe(14);
  });

  it("an ordinary compound row resolves both ways in either order", async () => {
    await seedCard(storage, { id: 15, name: "Journal+RichText", leftId: 10, rightId: 2 });
    expect((await storage.engine.bracket("Journal+RichText"))?.id).toBe(15);
    expect((await storage.engine.bracket(15))?.id).toBe(15);
  });
});
