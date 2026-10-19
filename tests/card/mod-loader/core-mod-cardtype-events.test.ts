// The cardtype set's three events (card-1.110.0 mod/core set/type/cardtype.rb)
// run THROUGH the ModEventFn execution seam with their real bodies:
//
// - check_for_cards_of_type (:14-16, after: :validate_delete): a Cardtype
//   card with existing cards refuses deletion — errors.add :cardtype,
//   en.yml:4 "Sorry, this card must remain a Cardtype so long as there are
//   %{cardname} cards."
// - check_for_cards_of_type_when_type_changed (:18-22, :validate,
//   changing: :type, when: :was_cardtype?): a card whose type WAS Cardtype
//   (type_id_before_act == Card::CardtypeID, cardtype.rb:11) refuses the
//   type change while cards of it exist — en.yml:8 "can't alter this type;
//   %{name} cards still exist" (%{name} = name_before_act). The engine
//   supplies typeIdBeforeAct on the update walk's event card.
// - validate_cardtype_name (:25-29, :validate, on: :save, changed: :name):
//   a Cardtype card's name refuses `<`, `>`, `/` — en.yml:14 "may not
//   contain any of the following characters: <, >, /".

import { describe, expect, it } from "vitest";
import {
  createActionsTestStorage,
  seedStandardDeck,
  seedCard,
  fakeClock,
  CARDTYPE_ID,
  RICH_TEXT_ID,
  type ActionsTestStorage,
} from "../actions/actions-test-storage.js";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";
import { ModLoader } from "../../../src/card/mod-loader.js";
import coreMod, {
  coreModEventPredicates,
} from "../../../src/card/mod-loader/mods/core-mod.js";
import { registerDeckModEventCardStateSources } from "../../../src/card/mod-loader/mod-event-state-sources.js";

registerDeckModEventCardStateSources();

/** The core mod's manifest loaded standalone -> its event registry. */
function coreRegistry() {
  const loader = new ModLoader([{ manifest: coreMod }]);
  loader.resolveOrder({ gemMods: ["core"] });
  loader.load();
  return loader.eventRegistry();
}

/** A deck with one extra Cardtype card ("Widget Type", typeId Cardtype) and
 *  JOE as the writer (the write gates pass for a signed-in user on these
 *  plain cards; the events under test are the subject). */
async function cardtypeDeck(storage: ActionsTestStorage): Promise<{ widgetTypeId: number }> {
  const widgetType = await seedCard(storage, {
    id: 60,
    name: "Widget Type",
    typeId: CARDTYPE_ID,
  });
  return { widgetTypeId: widgetType.id };
}

function engine(storage: ActionsTestStorage): CardActionEngine {
  return new CardActionEngine(storage.engine, {
    actor: { id: 9, name: "Joe User" },
    ipAddress: "192.0.2.7",
    now: fakeClock(),
    modEvents: { registry: coreRegistry(), predicates: coreModEventPredicates },
  });
}

describe("check_for_cards_of_type — the delete guard (cardtype.rb:14-16)", () => {
  it("deleting a Cardtype card with existing cards refuses with the en.yml cardtype error", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const { widgetTypeId } = await cardtypeDeck(storage);
    const engine0 = engine(storage);
    // a card OF the type exists
    await engine0.createCard({ name: "Gadget", typeId: widgetTypeId, content: "spec" });

    await expect(engine0.deleteCard({ cardId: widgetTypeId })).rejects.toMatchObject({
      code: "validation-failed",
      errorsByAttribute: {
        cardtype:
          "Sorry, this card must remain a Cardtype so long as there are Widget Type cards.",
      },
      userMessage:
        "CARDTYPE: Sorry, this card must remain a Cardtype so long as there are Widget Type cards.",
    });
    storage.close();
  });

  it("deleting a Cardtype card with NO cards of the type proceeds", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const { widgetTypeId } = await cardtypeDeck(storage);
    const engine0 = engine(storage);

    const result = await engine0.deleteCard({ cardId: widgetTypeId });
    expect(result).not.toBeNull();
    const row = await storage.selectOne<{ trash: number }>(
      "SELECT trash FROM cards WHERE id = ?",
      [widgetTypeId],
    );
    expect(row?.trash).toBe(1);
    storage.close();
  });

  it("deleting a NON-cardtype card never reaches the guard (set scoping)", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const engine0 = engine(storage);
    // RichText cards with the same name pattern stay deletable
    const plain = await engine0.createCard({ name: "Plain Note", content: "x" });
    const result = await engine0.deleteCard({ cardId: plain.cardId });
    expect(result).not.toBeNull();
    storage.close();
  });

  it("skip_event! :check_for_cards_of_type drops the guard", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const { widgetTypeId } = await cardtypeDeck(storage);
    const engine0 = new CardActionEngine(storage.engine, {
      actor: { id: 9, name: "Joe User" },
      ipAddress: "192.0.2.7",
      now: fakeClock(),
      modEvents: {
        registry: coreRegistry(),
        predicates: coreModEventPredicates,
        forceSkip: ["check_for_cards_of_type"],
      },
    });
    await engine0.createCard({ name: "Gadget", typeId: widgetTypeId, content: "spec" });
    const result = await engine0.deleteCard({ cardId: widgetTypeId });
    expect(result).not.toBeNull();
    storage.close();
  });
});

describe("check_for_cards_of_type_when_type_changed — the type-change guard (cardtype.rb:18-22)", () => {
  it("altering a former Cardtype with existing cards refuses with the name_before_act wording", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const { widgetTypeId } = await cardtypeDeck(storage);
    const engine0 = engine(storage);
    await engine0.createCard({ name: "Gadget", typeId: widgetTypeId, content: "spec" });

    await expect(
      engine0.updateCard({ cardId: widgetTypeId, typeId: RICH_TEXT_ID }),
    ).rejects.toMatchObject({
      code: "validation-failed",
      errorsByAttribute: {
        cardtype: "can't alter this type; Widget Type cards still exist",
      },
    });
    storage.close();
  });

  it("altering a former Cardtype with NO cards of the type proceeds", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const { widgetTypeId } = await cardtypeDeck(storage);
    const engine0 = engine(storage);

    const result = await engine0.updateCard({ cardId: widgetTypeId, typeId: RICH_TEXT_ID });
    expect(result).not.toBeNull();
    const row = await storage.selectOne<{ type_id: number }>(
      "SELECT type_id FROM cards WHERE id = ?",
      [widgetTypeId],
    );
    expect(row?.type_id).toBe(RICH_TEXT_ID);
    storage.close();
  });
});

describe("validate_cardtype_name — the name character guard (cardtype.rb:25-29)", () => {
  it("creating a Cardtype whose name carries `/` refuses with the en.yml name error", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const engine0 = engine(storage);

    await expect(
      engine0.createCard({ name: "Bad/Type", typeId: CARDTYPE_ID, content: "" }),
    ).rejects.toMatchObject({
      code: "validation-failed",
      errorsByAttribute: {
        name: "may not contain any of the following characters: <, >, /",
      },
      userMessage: "NAME: may not contain any of the following characters: <, >, /",
    });
    storage.close();
  });

  it("renaming a Cardtype to a `<` name refuses; a clean name saves", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const { widgetTypeId } = await cardtypeDeck(storage);
    const engine0 = engine(storage);

    await expect(
      engine0.updateCard({ cardId: widgetTypeId, name: "Widget<Type" }),
    ).rejects.toMatchObject({
      code: "validation-failed",
      errorsByAttribute: {
        name: "may not contain any of the following characters: <, >, /",
      },
    });

    const result = await engine0.updateCard({ cardId: widgetTypeId, name: "Gadget Type" });
    expect(result).not.toBeNull();
    storage.close();
  });

  it("a non-cardtype card may carry those characters (set scoping + on/changed gates)", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const engine0 = engine(storage);
    const result = await engine0.createCard({ name: "A/B <Test>", content: "x" });
    expect(result).not.toBeNull();
    storage.close();
  });
});
