// event-seam-subcard-collection.test.ts - the reject_empty_subcards body
// carries the save input's subcard collection: the empty NEW subcards
// leave it before the save reads it.
//
// WHY THIS FILE EXISTS. card-1.110.0 mod/core/set/all/subcards.rb:5-12
// drops every subcard that is NEW, UNFILLED and under no trigger from the
// director, before validation. The port's director has no separate staged
// collection: the save input's map IS the staging area, so the drop IS the
// port's drop_subcard plus director.subdirectors.delete. The collection
// rides into the prepare_to_validate walk (Ruby's stage) through the ctx
// seam, and the registered body drops the keys.
//
// THE OBSERVABLE. The collection is the caller's own map, so a dropped key
// is gone from the save that follows: the port's own blank-new-subcard
// skip finds nothing left to skip, and the empty subcard produced no card
// (the multiedit shape's no-change rule, events.rb:34-37).

import { describe, expect, it } from "vitest";
import {
  createActionsTestStorage,
  seedStandardDeck,
  JOE,
  fakeClock,
  type ActionsTestStorage,
} from "./actions-test-storage.js";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";
import { ModLoader } from "../../../src/card/mod-loader.js";
import coreMod, {
  coreModEventPredicates,
} from "../../../src/card/mod-loader/mods/core-mod.js";
import type { ModEventRuntime } from "../../../src/card/mod-loader/mod-event-dispatch.js";
import type { CreateCardInput, UpdateCardInput } from "../../../src/card/actions/types.js";

function seamEngine(storage: ActionsTestStorage): CardActionEngine {
  const loader = new ModLoader([{ manifest: coreMod }]);
  loader.resolveOrder({ gemMods: ["core"] });
  loader.load();
  const runtime: ModEventRuntime = {
    registry: loader.eventRegistry(),
    predicates: coreModEventPredicates,
  };
  return new CardActionEngine(storage.engine, {
    actor: JOE,
    ipAddress: "192.0.2.7",
    now: fakeClock(),
    modEvents: runtime,
  });
}

/** The id of a card with this name, or undefined when there is none. */
async function idOf(
  storage: ActionsTestStorage,
  name: string,
): Promise<number | undefined> {
  const row = await storage.selectOne<{ id: number }>(
    "SELECT id FROM cards WHERE name = ?",
    [name],
  );
  return row?.id;
}

describe("the save input's subcard collection carries the empty new subcards away", () => {
  it("a blank new subcard leaves the collection, and produces no card", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const engine = seamEngine(storage);

    const input: CreateCardInput = {
      name: "Collection Holder",
      subcards: {
        "+blank": {},
        "+filled": { content: "kept" },
      },
    };
    await engine.createCard(input);

    // The body dropped the blank one from the CALLER's collection: the
    // save input's map IS the director's staged collection.
    expect(Object.keys(input.subcards ?? {})).toEqual(["+filled"]);
    // and the filled one was saved as a subcard (the junction row stores
    // its name NULL, so the side card is the named one).
    expect(await idOf(storage, "filled")).toBeDefined();
    // the blank one produced no card at all.
    expect(await idOf(storage, "blank")).toBeUndefined();
    storage.close();
  });

  it("a TRIGGER keeps the empty subcards in the collection", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const engine = seamEngine(storage);

    const holder = await engine.createCard({ name: "Triggered Holder" });
    const input: UpdateCardInput = {
      cardId: holder.cardId,
      subcards: { "+blank": {} },
      trigger: "plus_right",
    };
    await engine.updateCard(input);

    // The act carried a trigger, so the body dropped nothing: the
    // collection still carries the key. (The port's own blank-new-subcard
    // skip still keeps the empty subcard from producing a card.)
    expect(Object.keys(input.subcards ?? {})).toEqual(["+blank"]);
    expect(await idOf(storage, "blank")).toBeUndefined();
    storage.close();
  });
});
