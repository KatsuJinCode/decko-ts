// event-seam-trash-obstacle.test.ts - the rename_in_trash body is carried
// by the WRITE ORDER (the takeover contract's shape), and the trashed-key
// obstacle's rename is the event's own mechanism.
//
// WHY THE WRITE ORDER. Ruby's body hangs off the store stage, after
// expire_old_name (card-1.110.0 mod/core/set/all/name_events.rb:60-65).
// The port's own position for the work is the rename's pre-write place,
// where the obstacle must be out of the way BEFORE the card takes the key
// (card-action-engine.ts runRenameInTrashBody), so the write order carries
// the body and the stage walk skips the name.

import { describe, expect, it } from "vitest";
import {
  createActionsTestStorage,
  seedStandardDeck,
  seedCard,
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

describe("the trash obstacle's rename is carried by the REGISTERED body", () => {
  it("the core's own body renames the trashed obstacle through the write order's seams", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const engine = seamEngine(storage);
    // A trashed card holding the key the rename would take.
    await seedCard(storage, { id: 950, name: "Taken", trash: true });

    const card = await engine.createCard({ name: "Other" });
    await engine.updateCard({ cardId: card.cardId, name: "Taken" });

    // The obstacle was renamed "<name>*trash" in the same act, so the
    // card could take the key (name_events.rb:83-87).
    expect(await idOf(storage, "Taken*trash")).toBe(950);
    storage.close();
  });
});
