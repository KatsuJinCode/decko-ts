// The external-scripting save API: Card::Model::SaveHelper
// (lib/card/model/save_helper.rb) and the conflict resolution it rides on
// (lib/card/model/save_helper/save_arguments.rb#resolve_name_conflict over
// lib/card/name/card_class.rb#uniquify_name).
//
// Each case runs the real CardActionEngine's saveHelper* methods against
// real SQLite storage seeded with the standard deck, and pins the Ruby
// body's branch for that case:
//
//   create_card   (save_helper.rb:19-21)  Card.create! create_args
//   create_card!  (save_helper.rb:24-26)  rename_if_conflict: :old - the
//                 occupying card moves out of the way BEFORE the create
//   update_card   (save_helper.rb:29-33)  Card[name]&.update! - no card,
//                 no update
//   update_card!  (save_helper.rb:35-38)  a name in the args renames, and
//                 rename_if_conflict: :new lands the update on the next
//                 free variant of that name
//   delete_card   (save_helper.rb:40-43)  return unless Card.exist?(name)
//   delete_code_card (save_helper.rb:46-51)  codename cleared first
//   uniquify_name (name/card_class.rb:8-16)  the unused/used/:old/:new
//                 branches, with generate_alternative_name's integer
//                 suffix (card_class.rb:18-20)

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  actionEngine,
  createActionsTestStorage,
  seedCard,
  seedStandardDeck,
  type ActionsTestStorage,
} from "./actions-test-storage.js";
import type { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";

let storage: ActionsTestStorage;
let engine: CardActionEngine;

beforeEach(async () => {
  storage = await createActionsTestStorage();
  await seedStandardDeck(storage);
  engine = actionEngine(storage);
});

afterEach(() => {
  storage.close();
});

describe("saveHelperCreateCard (create_card / create_card!, save_helper.rb:19-26)", () => {
  it("create_card at a fresh name creates the card with the content", async () => {
    const result = await engine.saveHelperCreateCard("Fresh Card", "the content");
    expect(result.cardId).toBeGreaterThan(0);
    const row = await storage.selectOne<{ db_content: string; trash: number }>(
      "SELECT db_content, trash FROM cards WHERE id = ?",
      [result.cardId],
    );
    expect(row?.db_content).toBe("the content");
    expect(row?.trash).toBe(0);
  });

  it("create_card at an occupied name raises (Card.create!'s uniqueness)", async () => {
    await engine.saveHelperCreateCard("Pudding2", "first");
    await expect(engine.saveHelperCreateCard("Pudding2", "second")).rejects.toThrow();
  });

  it("create_card! at an occupied name moves the occupier to '<name> 1' and creates at the original name", async () => {
    const first = await engine.saveHelperCreateCard("Mover", "first");
    const second = await engine.saveHelperCreateCard("Mover", "second", "old");
    expect(second.cardId).not.toBe(first.cardId);
    const moved = await storage.engine.fetchByName("Mover 1");
    expect(moved?.id).toBe(first.cardId);
    const created = await storage.engine.fetchByName("Mover");
    expect(created?.id).toBe(second.cardId);
  });

  it("create_card! keeps generating suffixes while '<name> N' is taken (generate_alternative_name)", async () => {
    const a = await engine.saveHelperCreateCard("Chain", "a");
    const b = await engine.saveHelperCreateCard("Chain 1", "b");
    const c = await engine.saveHelperCreateCard("Chain", "c", "old");
    // Ruby renames the OCCUPYING card at the original name (a) to the next
    // free variant ("Chain 2"), leaves the "Chain 1" card alone, and the
    // new card takes the original name (name/card_class.rb:12-14)
    expect((await storage.engine.fetchByName("Chain 2"))?.id).toBe(a.cardId);
    expect((await storage.engine.fetchByName("Chain 1"))?.id).toBe(b.cardId);
    expect((await storage.engine.fetchByName("Chain"))?.id).toBe(c.cardId);
  });
});

describe("saveHelperUpdateCard (update_card / update_card!, save_helper.rb:29-38)", () => {
  it("update_card at a held name updates the content", async () => {
    const created = await engine.saveHelperCreateCard("Update Me", "v1");
    await engine.saveHelperUpdateCard("Update Me", "v2");
    const row = await storage.selectOne<{ db_content: string }>(
      "SELECT db_content FROM cards WHERE id = ?",
      [created.cardId],
    );
    expect(row?.db_content).toBe("v2");
  });

  it("update_card at an unknown name answers null and writes nothing (Card[name]&.update!)", async () => {
    const result = await engine.saveHelperUpdateCard("Never Was", "v1");
    expect(result).toBeNull();
    const card = await storage.engine.fetchByName("Never Was");
    expect(card).toBeUndefined();
  });

  it("update_card! with a name argument renames, and a conflicting rename lands on the free variant", async () => {
    await engine.saveHelperCreateCard("Target", "the target");
    await engine.saveHelperCreateCard("Taken Name", "the occupier");
    await engine.saveHelperUpdateCard("Target", {
      name: "Taken Name",
      renameIfConflict: "new",
    });
    // the rename went to the next free variant of the requested name
    const renamed = await storage.engine.fetchByName("Taken Name 1");
    expect(renamed).toBeDefined();
    const original = await storage.engine.fetchByName("Taken Name");
    expect(original?.id).not.toBe(renamed?.id);
  });
});

describe("saveHelperDeleteCard (delete_card, save_helper.rb:40-43)", () => {
  it("deletes a held name", async () => {
    const created = await engine.saveHelperCreateCard("Doomed", "bye");
    const result = await engine.saveHelperDeleteCard("Doomed");
    expect(result).not.toBeNull();
    const row = await storage.selectOne<{ trash: number }>(
      "SELECT trash FROM cards WHERE id = ?",
      [created.cardId],
    );
    expect(row?.trash).toBe(1);
  });

  it("answers null for an unknown name and deletes nothing", async () => {
    expect(await engine.saveHelperDeleteCard("Never Was")).toBeNull();
  });
});

describe("saveHelperDeleteCodeCard (delete_code_card, save_helper.rb:46-51)", () => {
  it("clears the codename, then trashes the card", async () => {
    // a codename card of the standard fixture's own shape
    const seeded = await seedCard(storage, {
      id: 900,
      name: "Code Carrier",
      codename: "code_carrier",
    });
    const result = await engine.saveHelperDeleteCodeCard("Code Carrier");
    expect(result).not.toBeNull();
    const row = await storage.selectOne<{ codename: string | null; trash: number }>(
      "SELECT codename, trash FROM cards WHERE id = ?",
      [seeded.id],
    );
    expect(row?.codename === "" || row?.codename === null).toBe(true);
    expect(row?.trash).toBe(1);
  });

  it("answers null for an unknown name", async () => {
    expect(await engine.saveHelperDeleteCodeCard("Never Was")).toBeNull();
  });
});

describe("uniquifyName (name/card_class.rb:8-16)", () => {
  it("an unused name answers itself", async () => {
    expect(await engine.uniquifyName("Wide Open")).toBe("Wide Open");
  });

  it("a used name answers the next free variant (:new)", async () => {
    await engine.saveHelperCreateCard("Held", "x");
    expect(await engine.uniquifyName("Held", "new")).toBe("Held 1");
  });

  it(":old renames the occupying card to the variant and answers the ORIGINAL name", async () => {
    const created = await engine.saveHelperCreateCard("Seat", "x");
    const answer = await engine.uniquifyName("Seat", "old");
    expect(answer).toBe("Seat");
    const moved = await storage.engine.fetchByName("Seat 1");
    expect(moved?.id).toBe(created.cardId);
  });

  it("the suffix increments past 9 (String#next!'s integer successor)", async () => {
    // occupants: "Digits", "Digits 1".."Digits 9" - the next free variant
    // is the two-digit successor
    await engine.saveHelperCreateCard("Digits", "x");
    for (let i = 1; i <= 9; i++) {
      await engine.saveHelperCreateCard(`Digits ${i}`, "x");
    }
    expect(await engine.uniquifyName("Digits", "new")).toBe("Digits 10");
  });
});
