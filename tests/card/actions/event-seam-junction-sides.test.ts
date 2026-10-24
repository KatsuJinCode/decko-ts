// event-seam-junction-sides.test.ts - the prepare_left_and_right body is
// carried by the WRITE ORDER (the takeover contract's shape), and the
// junction side preparation is the event's own mechanism.
//
// WHY THE WRITE ORDER. Ruby's body runs at the :store stage
// (card-1.110.0 mod/core/set/all/name_events.rb:67-73). The port resolves
// the junction sides BEFORE the row write, because the junction row stores
// the side ids (card-action-engine.ts ensureSides), so the preparation
// cannot run at Ruby's stage position: the write order carries the body
// (runPrepareLeftAndRightBody) and the stage walk skips the name, so the
// body runs exactly once.
//
// THE THREE ARMS, each pinned here:
//   - the REGISTERED body owns the preparation: a body that does not reach
//     the seam leaves the sides unprepared (the built-in stands down);
//   - the core's own body reaches the seam, so the sides are prepared;
//   - a SKIPPED event skips the side CREATION: the sides that exist are
//     resolved and a missing one is left alone (Ruby's assign_side_id,
//     name/all.rb:87-90).

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
import type {
  ModEventCard,
  ModEventFn,
} from "../../../src/card/mod-loader/mod-manifest.js";
import type { ModEventContext } from "../../../src/card/mod-loader/mod-event-dispatch.js";
import type { DeckoModManifest } from "../../../src/card/mod-loader/mod-manifest.js";

/** The core mod's manifest loaded standalone -> its event registry. */
function coreRegistry() {
  const loader = new ModLoader([{ manifest: coreMod }]);
  loader.resolveOrder({ gemMods: ["core"] });
  loader.load();
  return loader.eventRegistry();
}

function seamEngine(
  storage: ActionsTestStorage,
  opts: { skip?: string[] } = {},
): CardActionEngine {
  const runtime: ModEventRuntime = {
    registry: coreRegistry(),
    predicates: coreModEventPredicates,
    skip: opts.skip,
  };
  return new CardActionEngine(storage.engine, {
    actor: JOE,
    ipAddress: "192.0.2.7",
    now: fakeClock(),
    modEvents: runtime,
  });
}

/** An engine whose registry carries the CALLER's prepare_left_and_right
 *  body and nothing else — the takeover's proof: the registered body, not
 *  the built-in, owns the side preparation. */
function prepareSidesEngine(
  storage: ActionsTestStorage,
  body: (card: ModEventCard, host: unknown, ctx: ModEventContext) => Promise<void>,
): CardActionEngine {
  const manifest: DeckoModManifest = {
    name: "test-prepare-left-and-right",
    setModules: [
      {
        setPath: "all/name_events",
        events: [
          {
            event: "prepare_left_and_right",
            at: "store",
            changed: ["name"],
            on: ["save"],
            fn: body as ModEventFn,
          },
        ],
      },
    ],
  };
  const loader = new ModLoader([{ manifest }]);
  loader.resolveOrder({ gemMods: ["test-prepare-left-and-right"] });
  loader.load();
  const runtime: ModEventRuntime = {
    registry: loader.eventRegistry(),
    predicates: {},
  };
  return new CardActionEngine(storage.engine, {
    actor: JOE,
    ipAddress: "192.0.2.7",
    now: fakeClock(),
    modEvents: runtime,
  });
}

/** The side ids of a junction row (left_id / right_id). A junction's own
 *  row stores name and key NULL (the post-2020 virtual name), so it is
 *  found by its sides, not by its name. */
async function junctionOf(
  storage: ActionsTestStorage,
  leftId: number,
): Promise<{ left_id: number | null; right_id: number | null } | undefined> {
  return storage.selectOne<{ left_id: number | null; right_id: number | null }>(
    "SELECT left_id, right_id FROM cards WHERE left_id = ?",
    [leftId],
  );
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

describe("the junction side preparation is carried by the REGISTERED body", () => {
  it("a registered body that never reaches the seam leaves the sides unprepared", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const calls: string[] = [];
    // A body that does NOT call the seam: if the engine's built-in side
    // preparation still ran, the side cards would exist. They must not.
    const engine = prepareSidesEngine(storage, async (card) => {
      calls.push(card.name);
    });

    // The junction cannot be written without its sides, so the save
    // REFUSES: the port's loud answer to an unprepared junction (Ruby
    // would write the same unprepared junction).
    await expect(engine.createCard({ name: "Taken+side" })).rejects.toThrow();

    // the write order called the registered body ...
    expect(calls).toEqual(["Taken+side"]);
    // ... and the BUILT-IN preparation stood down: no side card was made.
    expect(await idOf(storage, "Taken")).toBeUndefined();
    expect(await idOf(storage, "side")).toBeUndefined();
    storage.close();
  });

  it("the core's own body runs the preparation through the write order's seam", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const engine = seamEngine(storage);

    await engine.createCard({ name: "Kept+side" });

    // The core body (name_events.rb:67-73) reached the seam, so the sides
    // were prepared: each missing side became a subcard create in the same
    // act, and the junction row stores their ids.
    const left = await idOf(storage, "Kept");
    const right = await idOf(storage, "side");
    expect(left).toBeDefined();
    expect(right).toBeDefined();
    const junction = await junctionOf(storage, left!);
    expect(junction?.left_id).toBe(left);
    expect(junction?.right_id).toBe(right);
    storage.close();
  });

  it("a SKIPPED event skips the side CREATION: the sides that exist resolve", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    // The left side exists already; the right one does not.
    await seedCard(storage, { id: 900, name: "Half" });
    const engine = seamEngine(storage, { skip: ["prepare_left_and_right"] });

    await engine.createCard({ name: "Half+missing" });

    // the EXISTING side resolved (Ruby's assign_side_id), and the missing
    // one was NOT created: the skipped event owns the creation.
    const junction = await junctionOf(storage, 900);
    expect(junction?.left_id).toBe(900);
    expect(junction?.right_id).toBeNull();
    expect(await idOf(storage, "missing")).toBeUndefined();
    storage.close();
  });
});
