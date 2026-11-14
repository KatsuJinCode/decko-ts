// The event :update_read_rule (card-mod-permissions set/all/
// permissions.rb:11-20) — no stage, no opts: Ruby hangs it on the
// cascade machinery (cascade_read_rule's update_read_ruled_cards,
// set/right/read.rb:39-47, and update_field_read_rules). Ported
// engine-owned as updateReadRule (src/card/permissions/set-read-rule.ts),
// called per member by cascadeReadRuleAfterRuleSave — which the engine's
// save seam runs when a saved RULE card's name or trash is changing
// (read.rb:11 `name_is_changing? || trash_is_changing?`).
//
// Ruby truth under test (the trash arm):
//
//   event :cascade_read_rule, :finalize, after: :update_rule_cache,
//         when: :rule? do
//     return unless name_is_changing? || trash_is_changing?
//     update_read_ruled_cards   # read.rb:28-37 -> per member:
//                               # update_read_rule (permissions.rb:11-20)
//   end
//
// update_read_rule re-runs the read derivation for each member and writes
// the pair with `Card.where(id: id).update_all ...` inside
// without_timestamps (permissions.rb:15-16, :190-195), then expires the
// member's shared cache and recurses into its fields (:17-18).
//
// The observable contract: a member's stale stored read_rule_id is
// REPAIRED when the rule card governing it is trashed — the re-derivation
// resolves the NEXT applicable rule (*all under the trashed *right rule) —
// and the repair does not touch updated_at.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createActionsTestStorage,
  seedCard,
  seedStandardDeck,
  seedReference,
  JOE,
  SET_TYPE_ID,
  CARDTYPE_ID,
  type ActionsTestStorage,
} from "../actions/actions-test-storage.js";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";

const COLOR_TAG_ID = 420;
const RIGHT_READ_RULE_ID = 440; // color+*right+*read -> [[Anyone]]
const ALL_READ_RULE_ID = 450; // *all+*read -> [[Anyone]]
const CORRUPTED = 987654;

let storage: ActionsTestStorage;

async function junctionRow(
  leftKey: string,
): Promise<{ id: number; read_rule_id: number | null; read_rule_class: string | null; updated_at: string | null } | undefined> {
  return storage.selectOne<{
    id: number;
    read_rule_id: number | null;
    read_rule_class: string | null;
    updated_at: string | null;
  }>(
    `SELECT cards.id, cards.read_rule_id, cards.read_rule_class, cards.updated_at FROM cards
       JOIN cards lefts ON cards.left_id = lefts.id
      WHERE lefts.key = ? AND cards.right_id = ?`,
    [leftKey, COLOR_TAG_ID],
  );
}

beforeAll(async () => {
  storage = await createActionsTestStorage();
  await seedStandardDeck(storage);
  // isStandardRuleCardRow (rule/all.rb:37-40) checks the rule row's left
  // is Set-typed and its right SETTING-typed: the Setting cardtype card
  // and the *read setting card's type ride it.
  const settingType = await seedCard(storage, { id: 315, name: "Setting", codename: "setting", typeId: CARDTYPE_ID });
  const readSetting = await seedCard(storage, { id: 400, name: "*read", codename: "read", typeId: settingType.id });
  await seedCard(storage, { id: 410, name: "*right", codename: "right" });
  await seedCard(storage, { id: COLOR_TAG_ID, name: "color" });
  const rightSet = await seedCard(storage, {
    id: 430, name: "color+*right", leftId: COLOR_TAG_ID, rightId: 410, typeId: SET_TYPE_ID,
  });
  const rightRule = await seedCard(storage, {
    id: RIGHT_READ_RULE_ID,
    name: "color+*right+*read",
    leftId: rightSet.id,
    rightId: readSetting.id,
    dbContent: "[[Anyone]]",
  });
  await seedReference(storage, rightRule.id, 304, "anyone");
  const allRead = await seedCard(storage, {
    id: ALL_READ_RULE_ID,
    name: "*all+*read",
    leftId: 7,
    rightId: readSetting.id,
    dbContent: "[[Anyone]]",
  });
  await seedReference(storage, allRead.id, 304, "anyone");
});

afterAll(() => {
  storage?.close();
});

describe("event :update_read_rule — the rule-save cascade re-derives the governed members", () => {
  it("trashing the governing rule card re-derives its members to the next applicable rule, timestamps untouched", async () => {
    const engine = new CardActionEngine(storage.engine, { actor: JOE, ipAddress: "192.0.2.7" });
    await engine.createCard({ name: "Widget", content: "body" });
    await engine.createCard({ name: "Widget+color", content: "blue" });
    // stale stored column, the shape a pre-save deck holds
    await storage.driver.query("UPDATE cards SET read_rule_id = ? WHERE id = ?", [
      CORRUPTED,
      (await junctionRow("widget"))?.id,
    ]);
    const before = await junctionRow("widget");
    expect(before?.read_rule_id).toBe(CORRUPTED);

    // THE SAVE whose cascade calls update_read_rule per member: the rule
    // card's trash flag is changing (read.rb:11's trash_is_changing? arm).
    // The engine routes trashing through deleteCard ("an update cannot
    // trash a card"), the same finalize cascade Ruby's delete act runs.
    const result = await engine.deleteCard({ cardId: RIGHT_READ_RULE_ID });
    expect(result?.verb).toBe("delete");

    const after = await junctionRow("widget");
    // update_read_rule (permissions.rb:11-20): the re-derivation resolves
    // the next applicable *read rule — *all+*read now that the *right
    // rule is trashed — and update_all's it onto the member's row.
    expect(after?.read_rule_id).toBe(ALL_READ_RULE_ID);
    // without_timestamps (permissions.rb:190-195).
    expect(after?.updated_at).toBe(before?.updated_at);
  });
});
