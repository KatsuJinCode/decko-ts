// Engine-owned pin for card-mod-bootstrap set/type/bootswatch_skin/events.rb
// :1-8 — initialize_because_of_type_change (register row bootstrap #3).
//
// Ruby oracle (read this session, card-mod-bootstrap-0.20.0):
//   event :initialize_because_of_type_change, :prepare_to_store,
//         on: :update, changed: :type do
//     self.content = content
//     initialize_theme
//     if (items = old_skin_items)&.present?
//       field :stylesheets, content: items
//     end
//   end
//   ... events.rb:21-26:
//   def old_skin_items
//     skin = Card.new type: :pointer, content: db_content_before_act
//     skin.drop_item "bootstrap default skin"
//     skin.item_names
//   end
// A card whose type CHANGES to bootswatch_skin gains the colors/variables
// fields (initialize_theme) and, when its pre-act content listed pointer
// items (less "bootstrap default skin"), a stylesheets field carrying them.
//
// NAMED DIVERGENCES (same family as the copy_theme pin,
// bootstrap-skin-create-events.test.ts header):
// 1. TAG SPELLING: Ruby's field tags are "+colors"/"+variables"/"+stylesheets"
//    (prepend_joint, no star); the port writes the starred forms
//    (card-action-engine.ts applySkinTypeChange :1633-1674).
// 2. STYLESHEETS CONTENT: Ruby assigns an ARRAY through content=
//    (content/all.rb:10-24 standardize_content -> items_content); a Skin
//    includes List (card-mod-style set/type/skin.rb:3), so the collection
//    mod's items_content (card-mod-collection item_assignment.rb:69-80)
//    applies -> to_pointer_content -> "[[Some Scss]]\n[[Other CSS]]". The
//    port writes the bare names joined with "\n". The item SET matches; the
//    spelling does not.
// The item extraction, the drop of "bootstrap default skin", the same-act
// field creation, the empty-list no-field arm, and the css/scss item-type
// refusal (Ruby's: the new +stylesheets list saves in the act and its
// validate_item_type refuses non-css/scss items) all match. Named, not
// silently graded PORTED.

import { describe, expect, it } from "vitest";
import {
  createActionsTestStorage,
  seedStandardDeck,
  seedCard,
  JOE,
  fakeClock,
  type ActionsTestStorage,
} from "../actions/actions-test-storage.js";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";
import { libsassWasmCompiler } from "../../../src/server/libsass-wasm.js";

async function skinDeck(storage: ActionsTestStorage): Promise<{
  bootswatchSkinTypeId: number;
  scssTypeId: number;
  cssTypeId: number;
}> {
  await seedStandardDeck(storage);
  const bootswatchSkin = await seedCard(storage, {
    id: 470,
    name: "bootswatch skin",
    codename: "bootswatch_skin",
    typeId: 3,
  });
  const scss = await seedCard(storage, { id: 471, name: "SCSS", codename: "scss", typeId: 3 });
  const css = await seedCard(storage, { id: 472, name: "CSS", codename: "css", typeId: 3 });
  return { bootswatchSkinTypeId: bootswatchSkin.id, scssTypeId: scss.id, cssTypeId: css.id };
}

function engine(storage: ActionsTestStorage): CardActionEngine {
  return new CardActionEngine(storage.engine, {
    actor: JOE,
    ipAddress: "192.0.2.7",
    now: fakeClock(),
    scssCompiler: libsassWasmCompiler(),
  });
}

describe("initialize_because_of_type_change (bootswatch_skin events.rb:1-8, engine-owned)", () => {
  it("a type change to bootswatch_skin gains the theme fields and carries the old items into +*stylesheets", async () => {
    const storage = await createActionsTestStorage();
    const ids = await skinDeck(storage);
    await seedCard(storage, {
      id: 480,
      name: "Some Scss",
      typeId: ids.scssTypeId,
      dbContent: "$a: b;",
    });
    await seedCard(storage, { id: 481, name: "Other CSS", typeId: ids.cssTypeId });
    const base = await engine(storage).createCard({
      name: "Rising Skin",
      content: "[[bootstrap default skin]]\n[[Some Scss]]\n[[Other CSS]]",
    });
    await engine(storage).updateCard({
      cardId: base.cardId,
      typeId: ids.bootswatchSkinTypeId,
    });
    const fields = await storage.selectAll<{ tag: string; content: string | null }>(
      "SELECT r.name AS tag, c.db_content AS content FROM cards c JOIN cards r ON r.id = c.right_id WHERE c.left_id = ? ORDER BY tag",
      [base.cardId],
    );
    const byTag = new Map(fields.map((f) => [f.tag, f.content]));
    // initialize_theme created both theme fields (blank) ...
    expect(byTag.get("*colors")).toBe("");
    expect(byTag.get("*variables")).toBe("");
    // ... and the pre-act item list, less "bootstrap default skin",
    // became the stylesheets field's content.
    // NAMED DIVERGENCE 2 (header): Ruby brackets the pointer items
    // ("[[Some Scss]]\n[[Other CSS]]"); the port writes bare names.
    expect(byTag.get("*stylesheets")).toBe("Some Scss\nOther CSS");
  });

  it("a pre-act content with no items creates no stylesheets field", async () => {
    const storage = await createActionsTestStorage();
    const ids = await skinDeck(storage);
    const base = await engine(storage).createCard({ name: "Bare Skin", content: "" });
    await engine(storage).updateCard({ cardId: base.cardId, typeId: ids.bootswatchSkinTypeId });
    const fields = await storage.selectAll<{ tag: string }>(
      "SELECT r.name AS tag FROM cards c JOIN cards r ON r.id = c.right_id WHERE c.left_id = ? ORDER BY tag",
      [base.cardId],
    );
    expect(fields.map((f) => f.tag)).toEqual(["*colors", "*variables"]);
  });

  it("an old item that is neither CSS nor SCSS refuses the save", async () => {
    const storage = await createActionsTestStorage();
    const ids = await skinDeck(storage);
    await seedCard(storage, { id: 482, name: "Some Text", dbContent: "plain" });
    const base = await engine(storage).createCard({ name: "Bad Skin", content: "[[Some Text]]" });
    await expect(
      engine(storage).updateCard({ cardId: base.cardId, typeId: ids.bootswatchSkinTypeId }),
    ).rejects.toThrow(/skin stylesheets rejected/);
    // Ruby's validate_item_type refusal leaves the card un-type-changed.
    const row = await storage.selectOne<{ type_id: number }>(
      "SELECT type_id FROM cards WHERE id = ?",
      [base.cardId],
    );
    expect(row?.type_id).not.toBe(ids.bootswatchSkinTypeId);
  });
});
