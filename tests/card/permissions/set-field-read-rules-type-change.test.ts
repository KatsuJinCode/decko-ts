// The event :set_field_read_rules store tail (card-mod-permissions
// set/all/permissions.rb:7-9), ported engine-owned:
// CardActionEngine's update path runs cascadeAllFieldReadRules when the
// save changed the card's type (card-action-engine.ts, "STORE tail"
// beside the row write).
//
// Ruby truth under test:
//
//   event :set_field_read_rules, after: :set_read_rule, on: :update,
//         changed: :type_id do
//     each_field_as_bot(&:update_read_rule)
//   end
//
// A type-changing update re-derives EVERY field card's stored read-rule
// columns as Auth.as_bot (permissions.rb:174-181), through update_read_rule
// (permissions.rb:11-20): reset_patterns, re-run the read derivation,
// `Card.where(id: id).update_all read_rule_id: ..., read_rule_class: ...`
// WITHOUT touching the timestamps (without_timestamps,
// permissions.rb:190-195).
//
// The observable contract, with a deliberately stale stored column: a
// field's read_rule_id corrupted out-of-band (the value a pre-type-change
// derivation left behind) is REPAIRED to the currently applicable rule
// card's id when (and only when) the parent's type changes, and the
// repair does not bump updated_at.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createActionsTestStorage,
  seedCard,
  seedStandardDeck,
  seedReference,
  JOE,
  type ActionsTestStorage,
} from "../actions/actions-test-storage.js";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";

const SET_TYPE_ID = 2;
const CARDTYPE_ID = 5;
const READ_RULE_ID = 440; // color+*right+*read -> [[Anyone]]
const COLOR_TAG_ID = 420; // the shared "color" tag card
const CORRUPTED = 987654;

let storage: ActionsTestStorage;
let alphaTypeId = 0;
let betaTypeId = 0;

/** A junction field row: engine-created side-backed junctions keep the
 *  name/key columns NULL (names are virtual post-2020), so the lookup is
 *  by sides. */
async function fieldRow(
  leftKey: string,
): Promise<{ id: number; read_rule_id: number | null; updated_at: string | null } | undefined> {
  return storage.selectOne<{
    id: number;
    read_rule_id: number | null;
    updated_at: string | null;
  }>(
    `SELECT cards.id, cards.read_rule_id, cards.updated_at FROM cards
       JOIN cards lefts ON cards.left_id = lefts.id
      WHERE lefts.key = ? AND cards.right_id = ?`,
    [leftKey, COLOR_TAG_ID],
  );
}

beforeAll(async () => {
  storage = await createActionsTestStorage();
  await seedStandardDeck(storage);
  // the read-rule substrate: the *read setting card (codename read), the
  // *right setting card, the tag card, the set, and the rule itself.
  const readSetting = await seedCard(storage, { id: 400, name: "*read", codename: "read" });
  await seedCard(storage, { id: 410, name: "*right", codename: "right" });
  await seedCard(storage, { id: COLOR_TAG_ID, name: "color" });
  const rightSet = await seedCard(storage, {
    id: 430, name: "color+*right", leftId: COLOR_TAG_ID, rightId: 410, typeId: SET_TYPE_ID,
  });
  const rule = await seedCard(storage, {
    id: READ_RULE_ID,
    name: "color+*right+*read",
    leftId: rightSet.id,
    rightId: readSetting.id,
    dbContent: "[[Anyone]]",
  });
  await seedReference(storage, rule.id, 304, "anyone");
  // the two cardtypes the type change switches between
  const alpha = await seedCard(storage, { id: 60, name: "AlphaType", typeId: CARDTYPE_ID });
  const beta = await seedCard(storage, { id: 61, name: "BetaType", typeId: CARDTYPE_ID });
  alphaTypeId = alpha.id;
  betaTypeId = beta.id;
});

afterAll(() => {
  storage?.close();
});

describe("event :set_field_read_rules — a type-changing update re-derives its fields", () => {
  it("repairs the field's stale read_rule_id to the applicable rule card, without touching updated_at", async () => {
    const engine = new CardActionEngine(storage.engine, { actor: JOE, ipAddress: "192.0.2.7" });
    const thing = await engine.createCard({ name: "Thing", typeId: alphaTypeId });
    await engine.createCard({ name: "Thing+color", content: "blue" });

    // the field's stored column, corrupted out-of-band (SQL, the way a
    // fixture or a pre-migration deck would hold staleness)
    await storage.driver.query("UPDATE cards SET read_rule_id = ? WHERE id = ?", [
      CORRUPTED,
      (await fieldRow("thing"))?.id,
    ]);
    const before = await fieldRow("thing");
    expect(before?.read_rule_id).toBe(CORRUPTED);
    const updatedAtBefore = before?.updated_at;

    // THE SAVE: a type-changing update of the PARENT — the event's
    // changed: :type_id gate.
    const result = await engine.updateCard({ cardId: thing.cardId, typeId: betaTypeId });
    expect(result?.verb).toBe("update");

    // each_field_as_bot(&:update_read_rule): the field's column was
    // re-derived to the applicable rule card's id (the color+*right+*read
    // rule — the *right set beats *all).
    const after = await fieldRow("thing");
    expect(after?.read_rule_id).toBe(READ_RULE_ID);
    // without_timestamps (permissions.rb:190-195): the re-derivation's
    // update_all leaves updated_at exactly as it was.
    expect(after?.updated_at).toBe(updatedAtBefore);
  });

  it("a save that does NOT change the type leaves the field's stored column alone (changed: :type_id)", async () => {
    const engine = new CardActionEngine(storage.engine, { actor: JOE, ipAddress: "192.0.2.7" });
    const other = await engine.createCard({ name: "Other", typeId: alphaTypeId });
    await engine.createCard({ name: "Other+color", content: "red" });
    await storage.driver.query("UPDATE cards SET read_rule_id = ? WHERE id = ?", [
      CORRUPTED,
      (await fieldRow("other"))?.id,
    ]);

    // a content-only update of the parent: no type change -> the event
    // body does not run (Ruby's changed: :type_id gate).
    await engine.updateCard({ cardId: other.cardId, content: "red edited" });

    const row = await fieldRow("other");
    expect(row?.read_rule_id).toBe(CORRUPTED);
  });
});
