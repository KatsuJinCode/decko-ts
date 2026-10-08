// Stored-state rules the persistence parity probe (tests/tools/
// persist-write-probe.test.ts against the Ruby oracle) found the engine
// missing. Each test pins one rule on the synthetic action fixture, so the
// rule stays guarded where the oracle deck is not available.

import { describe, expect, it } from "vitest";
import {
  actionEngine,
  CARDTYPE_ID,
  createActionsTestStorage,
  seedCard,
  seedStandardDeck,
} from "./actions-test-storage.js";

type Row = Record<string, unknown>;

async function fresh() {
  const storage = await createActionsTestStorage();
  return seedStandardDeck(storage);
}

describe("persistence parity — stored state of a create", () => {
  it("a create without content stores \"\", never NULL (set_content, content.rb:1-5)", async () => {
    const f = await fresh();
    const engine = actionEngine(f.storage);
    const { cardId } = await engine.createCard({ name: "Empty One" });
    const row = await f.storage.selectOne<Row>("SELECT db_content FROM cards WHERE id = ?", [cardId]);
    expect(row).toEqual({ db_content: "" });
  });

  it("a create without content takes the applicable structure's content (set_default_content)", async () => {
    const f = await fresh();
    const engine = actionEngine(f.storage);
    const typeSet = await seedCard(f.storage, { id: 410, name: "*type", codename: "type" });
    const structure = await seedCard(f.storage, { id: 411, name: "*structure", codename: "structure" });
    const cardtypeSet = await seedCard(f.storage, {
      id: 412,
      leftId: f.cardtype.id,
      rightId: typeSet.id,
      typeId: 300,
    });
    const template = "{{+description|content}}";
    await seedCard(f.storage, { id: 413, leftId: cardtypeSet.id, rightId: structure.id, dbContent: template });

    const typed = await engine.createCard({ name: "Gadget", typeId: CARDTYPE_ID });
    const explicit = await engine.createCard({ name: "Widget", typeId: CARDTYPE_ID, content: "" });
    const rows = await f.storage.selectAll<Row>(
      "SELECT id, db_content FROM cards WHERE id IN (?, ?) ORDER BY id",
      [typed.cardId, explicit.cardId],
    );
    // use_default_content? is `!db_content_changed? && default_content.present?`:
    // an explicit "" is an assignment, so it keeps "".
    expect(rows).toEqual([
      { id: typed.cardId, db_content: template },
      { id: explicit.cardId, db_content: "" },
    ]);
  });
});

describe("persistence parity — junction create over a trashed side", () => {
  it("a trashed left side is revived in the junction's act, not reused as a live id", async () => {
    const f = await fresh();
    const engine = actionEngine(f.storage);
    const left = await engine.createCard({ name: "Lefty", content: "was here" });
    await engine.deleteCard({ cardId: left.cardId });

    const junction = await engine.createCard({ name: "Lefty+Righty", content: "j" });
    const leftRow = await f.storage.selectOne<Row>("SELECT trash, db_content FROM cards WHERE id = ?", [
      left.cardId,
    ]);
    // prepare_new_side: Card[side_id] filters trash, so the side is created
    // as a subcard, and its manage_trash pulls the trashed row back: same id,
    // content from the new record ("").
    expect(leftRow).toEqual({ trash: 0, db_content: "" });
    const junctionRow = await f.storage.selectOne<Row>("SELECT left_id FROM cards WHERE id = ?", [
      junction.cardId,
    ]);
    expect(junctionRow).toEqual({ left_id: left.cardId });
    const sideAction = await f.storage.selectOne<Row>(
      "SELECT action_type, super_action_id, card_act_id FROM card_actions WHERE card_id = ? ORDER BY id DESC LIMIT 1",
      [left.cardId],
    );
    expect(sideAction).toMatchObject({ action_type: 0, super_action_id: junction.actionId });
  });
});
