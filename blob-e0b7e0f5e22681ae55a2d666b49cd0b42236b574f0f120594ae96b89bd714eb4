// event-seam-validate-uniqueness-of-name.test.ts - the save path's name
// uniqueness check is carried by the REGISTERED body, and the body IS the
// mechanism there.
//
// WHY THE SAVE PATH'S CHECK. Ruby's body (name_events.rb:12-20) is the
// name uniqueness check: the lexicon's fast lookup, the live-row
// re-check, and the refusal naming the card that owns the name. The
// port's own place for that work is the save path's uniqueness check,
// which the create walk and the update walk both reach
// (card-action-engine.ts runValidateUniquenessBody).

import { describe, expect, it } from "vitest";
import {
  createActionsTestStorage,
  seedStandardDeck,
  JOE,
  RICH_TEXT_ID,
  fakeClock,
  type ActionsTestStorage,
} from "./actions-test-storage.js";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";
import { ModLoader } from "../../../src/card/mod-loader.js";
import type { ModEventRuntime } from "../../../src/card/mod-loader/mod-event-dispatch.js";
import type {
  ModEventCard,
  ModEventFn,
} from "../../../src/card/mod-loader/mod-manifest.js";
import type { ModEventContext } from "../../../src/card/mod-loader/mod-event-dispatch.js";
import type { DeckoModManifest } from "../../../src/card/mod-loader/mod-manifest.js";

/** An engine whose registry carries the CALLER's
 *  validate_uniqueness_of_name body and nothing else. */
function uniquenessEngine(
  storage: ActionsTestStorage,
  body: (card: ModEventCard, host: unknown, ctx: ModEventContext) => Promise<void>,
): CardActionEngine {
  const manifest: DeckoModManifest = {
    name: "test-validate-uniqueness-of-name",
    setModules: [
      {
        setPath: "all/name_events",
        events: [
          {
            event: "validate_uniqueness_of_name",
            fn: body as ModEventFn,
          },
        ],
      },
    ],
  };
  const loader = new ModLoader([{ manifest }]);
  loader.resolveOrder({ gemMods: ["test-validate-uniqueness-of-name"] });
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

describe("the name uniqueness check is carried by the REGISTERED body", () => {
  it("a create reaches the registered body, and the body's own refusal is the one the save gets", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const calls: string[] = [];
    const engine = uniquenessEngine(storage, async (cardIn, _host, ctx) => {
      calls.push(`body:${cardIn.action}`);
      const key = ctx.cardKey?.() ?? "";
      const existingId = await ctx.lexiconId?.(key);
      if (existingId === undefined || existingId === ctx.cardId?.()) return;
      const existingName = await ctx.liveCardName?.(existingId);
      if (existingName === undefined) return;
      ctx.refuseNameTaken?.(existingName);
    });

    // "Pudding" is the name the seeded deck already holds.
    await expect(
      engine.createCard({ name: "Pudding", typeId: RICH_TEXT_ID, content: "<p>x</p>" }),
    ).rejects.toMatchObject({
      code: "name-conflict",
      userMessage: "NAME: must be unique; 'Pudding' already exists.",
    });
    expect(calls).toEqual(["body:create"]);
    storage.close();
  });

  it("a create with a free name reaches the body and is saved", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const calls: string[] = [];
    const engine = uniquenessEngine(storage, async (cardIn, _host, ctx) => {
      calls.push(`body:${cardIn.action}`);
      await ctx.lexiconId?.(ctx.cardKey?.() ?? "");
    });

    const created = await engine.createCard({
      name: "Decko",
      typeId: RICH_TEXT_ID,
      content: "<p>x</p>",
    });
    expect(calls).toEqual(["body:create"]);
    expect(created.cardId).toBeGreaterThan(0);
    storage.close();
  });

  it("without a registered body the port's own check still refuses a taken name", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const engine = new CardActionEngine(storage.engine, {
      actor: JOE,
      ipAddress: "192.0.2.7",
      now: fakeClock(),
    });

    await expect(
      engine.createCard({ name: "Pudding", typeId: RICH_TEXT_ID, content: "<p>x</p>" }),
    ).rejects.toMatchObject({
      code: "name-conflict",
      message: "name is already taken: Pudding",
    });
    storage.close();
  });
});
