// event :validate_type (card-1.110.0 mod/core set/all/type.rb:24-30) runs
// through the ModEventFn execution seam with its REAL body. This file pins
// the STRUCTURE lock (the arm the port had no implementation of):
//
//   if structure&.assigns_type? && type_id != structure.type_id
//     errors.add :type, t(:core_error_structured, name: name, type_name: structure.type_name)
//   end
//
// - structure = structure_rule_card (card-mod-content set/all/templating.rb
//   :44-48) — the card's *structure rule; a "_self" rule counts as none.
// - assigns_type? (templating.rb:30-34) reads the SET card's tag codename
//   through Card::Set::Pattern — only 07_right.rb:3 and
//   08_type_plus_right.rb:5 declare assigns_type: true (the port's
//   set-patterns/registry.ts carries the same two).
// - en.yml:12 "can't be changed because %{name} is structured as a
//   %{type_name}" — %{name} = the saving card, %{type_name} = the rule
//   card's own type.

import { describe, expect, it } from "vitest";
import {
  createActionsTestStorage,
  seedStandardDeck,
  seedCard,
  fakeClock,
  CARDTYPE_ID,
  type ActionsTestStorage,
} from "../actions/actions-test-storage.js";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";
import { ModLoader } from "../../../src/card/mod-loader.js";
import coreMod, {
  coreModEventPredicates,
} from "../../../src/card/mod-loader/mods/core-mod.js";
import { registerDeckModEventCardStateSources } from "../../../src/card/mod-loader/mod-event-state-sources.js";

registerDeckModEventCardStateSources();

function coreRegistry() {
  const loader = new ModLoader([{ manifest: coreMod }]);
  loader.resolveOrder({ gemMods: ["core"] });
  loader.load();
  return loader.eventRegistry();
}

function engine(storage: ActionsTestStorage): CardActionEngine {
  return new CardActionEngine(storage.engine, {
    actor: { id: 9, name: "Joe User" },
    ipAddress: "192.0.2.7",
    now: fakeClock(),
    modEvents: { registry: coreRegistry(), predicates: coreModEventPredicates },
  });
}

/** The structured-field deck: the *right and *structure setting cards, the
 *  "Widget" tag, a Widget+*right+*structure rule card typed WIDGET_TYPE
 *  (its content is the template — a real template, not "_self"), a second
 *  plain type, and the structured field card "Gadget+Widget" typed basic. */
const WIDGET_TYPE_ID = 80;
const OTHER_TYPE_ID = 81;

async function structuredDeck(storage: ActionsTestStorage): Promise<{ fieldCardId: number }> {
  await seedCard(storage, { id: 70, name: "*right", codename: "right", typeId: 14 });
  await seedCard(storage, { id: 71, name: "*structure", codename: "structure", typeId: 14 });
  const widgetType = await seedCard(storage, {
    id: WIDGET_TYPE_ID,
    name: "WidgetType",
    codename: "widget_type",
    typeId: CARDTYPE_ID,
  });
  await seedCard(storage, { id: OTHER_TYPE_ID, name: "OtherType", codename: "other_type", typeId: CARDTYPE_ID });
  const widget = await seedCard(storage, { id: 72, name: "Widget", typeId: 2 });
  // the SET card "Widget+*right" (the right pattern's anchor) must be a
  // real row for the rule card's three-part name to compose
  const setCard = await seedCard(storage, { id: 76, leftId: widget.id, rightId: 70, typeId: 14 });
  await seedCard(storage, {
    id: 73,
    name: null,
    leftId: setCard.id,
    rightId: 71,
    typeId: WIDGET_TYPE_ID,
    dbContent: "the template body",
  });
  const gadget = await seedCard(storage, { id: 74, name: "Gadget", typeId: 2 });
  const fieldCard = await seedCard(storage, {
    id: 75,
    leftId: gadget.id,
    rightId: widget.id,
    typeId: 2,
    dbContent: "own value",
  });
  void widgetType;
  return { fieldCardId: fieldCard.id };
}

describe("validate_type — the structure lock (type.rb:26-28)", () => {
  it("changing a structured field's type away from the rule card's type refuses", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const { fieldCardId } = await structuredDeck(storage);

    await expect(
      engine(storage).updateCard({ cardId: fieldCardId, typeId: OTHER_TYPE_ID }),
    ).rejects.toMatchObject({
      code: "validation-failed",
      errorsByAttribute: {
        type: "Gadget+Widget can't be changed because Gadget+Widget is structured as a WidgetType",
      },
    });
    storage.close();
  });

  it("changing the structured field's type TO the rule card's type saves", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const { fieldCardId } = await structuredDeck(storage);

    const result = await engine(storage).updateCard({
      cardId: fieldCardId,
      typeId: WIDGET_TYPE_ID,
    });
    expect(result).not.toBeNull();
    const row = await storage.selectOne<{ type_id: number }>(
      "SELECT type_id FROM cards WHERE id = ?",
      [fieldCardId],
    );
    expect(row?.type_id).toBe(WIDGET_TYPE_ID);
    storage.close();
  });
});

describe("validate_type — the no-such-type arm (type.rb:25)", () => {
  it("an assigned type id with no live type card refuses", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const engine0 = engine(storage);
    const plain = await engine0.createCard({ name: "Plain Note", content: "x" });
    // a dangling type id: no card carries it
    await expect(
      engine0.updateCard({ cardId: plain.cardId, typeId: 99000 }),
    ).rejects.toMatchObject({ code: "type-unknown" });
    storage.close();
  });
});
