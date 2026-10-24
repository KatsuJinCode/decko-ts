// event-seam-validate-name.test.ts - the save path's name validation is
// carried by the REGISTERED body, and the body IS the mechanism there.
//
// WHY THE SAVE PATH'S VALIDATION. Ruby's body (name_events.rb:3-10) is the
// name validation: the legality chain, and then the uniqueness check. The
// port's own place for that work is the save path's name validation, which
// the create walk and the update walk both reach (card-action-engine.ts
// runValidateNameBody). The stage walk skips this name (the runtime's
// writeOrderOwned list), so the body runs exactly once.

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

/** An engine whose registry carries the CALLER's validate_name body and
 *  nothing else. */
function validateNameEngine(
  storage: ActionsTestStorage,
  body: (card: ModEventCard, host: unknown, ctx: ModEventContext) => Promise<void>,
): CardActionEngine {
  const manifest: DeckoModManifest = {
    name: "test-validate-name",
    setModules: [
      {
        setPath: "all/name_events",
        events: [
          {
            event: "validate_name",
            fn: body as ModEventFn,
          },
        ],
      },
    ],
  };
  const loader = new ModLoader([{ manifest }]);
  loader.resolveOrder({ gemMods: ["test-validate-name"] });
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

describe("the name validation is carried by the REGISTERED body", () => {
  it("a create reaches the registered body, and the body's own stages run in Ruby's order", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const calls: string[] = [];
    const engine = validateNameEngine(storage, async (cardIn, _host, ctx) => {
      calls.push(`body:${cardIn.action}`);
      await ctx.validateLegality?.();
      if (ctx.errorsAny?.() === true) return;
      await ctx.validateUniqueness?.();
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

  it("the body's own uniqueness refusal is the one the save gets", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const engine = validateNameEngine(storage, async (_cardIn, _host, ctx) => {
      await ctx.validateLegality?.();
      await ctx.validateUniqueness?.();
    });

    // the name the deck already holds (the seeded card): the port's own
    // uniqueness check refuses the create with the port's name-conflict
    // error.
    await expect(
      engine.createCard({ name: "Pudding", typeId: RICH_TEXT_ID, content: "<p>x</p>" }),
    ).rejects.toMatchObject({ code: "name-conflict" });
    storage.close();
  });

  it("an update that renames reaches the registered body too", async () => {
    const storage = await createActionsTestStorage();
    const fixture = await seedStandardDeck(storage);
    const calls: string[] = [];
    const engine = validateNameEngine(storage, async (cardIn, _host, ctx) => {
      calls.push(`body:${cardIn.action}`);
      await ctx.validateLegality?.();
      await ctx.validateUniqueness?.();
    });

    await engine.updateCard({ cardId: fixture.joeCard.id, name: "Joe Renamed" });
    expect(calls).toEqual(["body:update"]);
    storage.close();
  });

  it("without a registered body the port's own checks still refuse a too-long name", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const engine = new CardActionEngine(storage.engine, {
      actor: JOE,
      ipAddress: "192.0.2.7",
      now: fakeClock(),
    });

    await expect(
      engine.createCard({ name: "a".repeat(300), typeId: RICH_TEXT_ID, content: "<p>x</p>" }),
    ).rejects.toMatchObject({
      code: "name-illegal",
      message: "name is too long (300 characters)",
      userMessage: "NAME: is too long (255 character maximum; length is 300)",
    });
    storage.close();
  });
});
