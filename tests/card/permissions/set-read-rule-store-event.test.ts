// The event :set_read_rule store stage (card-mod-permissions
// set/all/permissions.rb:1-5), ported engine-owned: every create/update
// save derives the acting card's read-rule columns through
// deriveReadRuleRecord (src/card/permissions/set-read-rule.ts, wired at
// the engine's create and update row-write sites).
//
// Ruby truth under test:
//
//   event :set_read_rule, :store, on: :save, changed: %i[type_id name] do
//     read_rule_id, read_rule_class = permission_rule_id_and_class(:read)
//     self.read_rule_id = read_rule_id
//     self.read_rule_class = read_rule_class
//   end
//
// - permission_rule_id(:read) (permissions.rb:55-61): the applicable
//   *read rule card's id over the card's set keys — for a compound card
//   whose resolved rule content is "[[_left]]", the LEFT card's rule.
// - read_rule_class (permissions.rb:63-65, :87-89): the resolved rule
//   card's rule_class_name — when the rule card's trunk is a Set, the
//   rule name's trunk tag ("right" for "color+*right+*read").
//
// The observable contract: a freshly created card's row carries the
// applicable rule card's id and class — the *right-set rule over a
// +color field, the *all fallback over a simple card.

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

let storage: ActionsTestStorage;

beforeAll(async () => {
  storage = await createActionsTestStorage();
  await seedStandardDeck(storage);
  const readSetting = await seedCard(storage, { id: 400, name: "*read", codename: "read" });
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
    leftId: 7, // the seeded *all set card
    rightId: readSetting.id,
    dbContent: "[[Anyone]]",
  });
  await seedReference(storage, allRead.id, 304, "anyone");
});

afterAll(() => {
  storage?.close();
});

describe("event :set_read_rule — every save fills the acting card's read-rule columns", () => {
  it("a compound card under a *right read rule stores that rule's id and class 'right'", async () => {
    const engine = new CardActionEngine(storage.engine, { actor: JOE, ipAddress: "192.0.2.7" });
    await engine.createCard({ name: "Widget", content: "body" });
    await engine.createCard({ name: "Widget+color", content: "blue" });

    // the junction row (side-backed; look it up by sides)
    const row = await storage.selectOne<{ read_rule_id: number | null; read_rule_class: string | null }>(
      `SELECT cards.read_rule_id, cards.read_rule_class FROM cards
         JOIN cards lefts ON cards.left_id = lefts.id
        WHERE lefts.key = 'widget' AND cards.right_id = ?`,
      [COLOR_TAG_ID],
    );
    // permission_rule_id_and_class(:read): the color+*right+*read rule
    // card's id; rule_class_name = the rule card's trunk ("color+*right",
    // a Set) -> the rule name's trunk tag "*right" — the tag is the trunk
    // name's last part verbatim, star included (permissions.rb:87-89).
    expect(row?.read_rule_id).toBe(RIGHT_READ_RULE_ID);
    expect(row?.read_rule_class).toBe("*right");
  });

  it("a simple card under the *all read rule stores that rule's id", async () => {
    const engine = new CardActionEngine(storage.engine, { actor: JOE, ipAddress: "192.0.2.7" });
    await engine.createCard({ name: "Plain", content: "body" });

    const row = await storage.selectOne<{ read_rule_id: number | null; read_rule_class: string | null }>(
      "SELECT read_rule_id, read_rule_class FROM cards WHERE key = 'plain'",
    );
    expect(row?.read_rule_id).toBe(ALL_READ_RULE_ID);
  });
});
