// The event :no_deletion_if_used (card-mod-style-0.20.0 set/type/skin.rb:
// 13-17), ported engine-owned: the delete path's validate guard.
//
// Ruby truth under test:
//
//   event :no_deletion_if_used, :validate, on: :delete do
//     if Card[:all, :style].item_keys.include? key
//       errors.add :delete, t(:style_delete_error_skin_used)
//     end
//   end
//
// A Skin-typed card that is an item of the deck's *all+*style pointer
// cannot be deleted; the refusal carries the en.yml message verbatim
// ("Can't delete skin because it's used.") on the :delete attribute — the
// same shape as validate_delete's port beside it. A skin OUTSIDE the
// pointer deletes.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createActionsTestStorage,
  seedCard,
  seedStandardDeck,
  JOE,
  CARDTYPE_ID,
  type ActionsTestStorage,
} from "../actions/actions-test-storage.js";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";
import type { CardActionError } from "../../../src/card/actions/types.js";

const SET_TYPE_ID = 300;
let storage: ActionsTestStorage;
let usedSkinId = 0;
let unusedSkinId = 0;

beforeAll(async () => {
  storage = await createActionsTestStorage();
  await seedStandardDeck(storage);
  const skinType = await seedCard(storage, { id: 72, name: "Skin", codename: "skin", typeId: CARDTYPE_ID });
  const allCard = await storage.selectOne<{ id: number }>("SELECT id FROM cards WHERE key = '*all'");
  const styleSetting = await seedCard(storage, { id: 460, name: "*style", codename: "style" });
  const used = await seedCard(storage, { id: 470, name: "Alpha Skin", typeId: skinType.id });
  const unused = await seedCard(storage, { id: 471, name: "Beta Skin", typeId: skinType.id });
  await seedCard(storage, {
    id: 480,
    name: "*all+*style",
    leftId: allCard?.id,
    rightId: styleSetting.id,
    typeId: SET_TYPE_ID,
    dbContent: "[[Alpha Skin]]",
  });
  void unused;
  usedSkinId = used.id;
  unusedSkinId = 471;
});

afterAll(() => {
  storage?.close();
});

describe("event :no_deletion_if_used — a skin used by *all+*style refuses deletion", () => {
  it("deleting a used skin refuses with the en.yml message on the :delete attribute", async () => {
    const engine = new CardActionEngine(storage.engine, { actor: JOE, ipAddress: "192.0.2.7", scssCompiler: async () => "/* compiled */" });
    const err = (await engine.deleteCard({ cardId: usedSkinId }).then(
      () => undefined,
      (e: CardActionError) => e,
    )) as CardActionError;
    expect(err?.code).toBe("protected-card");
    expect(err?.message).toBe("Can't delete skin because it's used.");
    expect(err?.errorsByAttribute?.delete).toBe("Can't delete skin because it's used.");
  });

  it("deleting a skin outside the pointer succeeds", async () => {
    // Beta Skin was seeded OUTSIDE the *all+*style pointer: not used, so
    // the delete passes.
    const engine = new CardActionEngine(storage.engine, { actor: JOE, ipAddress: "192.0.2.7" });
    const result = await engine.deleteCard({ cardId: unusedSkinId });
    expect(result?.verb).toBe("delete");
  });

  it("a NON-skin card in the pointer deletes freely (the event is on set/type/skin)", async () => {
    // the pointer row is rewritten directly (no asset-validating pointer
    // save): the pointer names a plain Basic card, whose key IS in the
    // items — the guard still stands down because the event's set is
    // type/skin.
    const engine = new CardActionEngine(storage.engine, { actor: JOE, ipAddress: "192.0.2.7" });
    const plain = await engine.createCard({ name: "Pointer Plain", content: "body" });
    await storage.driver.query(
      "UPDATE cards SET db_content = '[[Pointer Plain]]' WHERE left_id = 7 AND right_id = 460",
      [],
    );
    storage.engine.resetCaches();
    const result = await engine.deleteCard({ cardId: plain.cardId });
    expect(result?.verb).toBe("delete");
  });
});
