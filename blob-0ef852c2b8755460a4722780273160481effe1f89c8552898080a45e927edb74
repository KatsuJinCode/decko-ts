// event-seam-validate-legality-of-name.test.ts - the save path's
// name-legality check is carried by the REGISTERED body, and the body IS
// the mechanism there.
//
// WHY THE SAVE PATH'S CHECK. Ruby's body (name_events.rb:23-35) is the
// name-legality chain, and validate_name calls it in the :validate stage.
// The port's own place for that work is the save path's name-legality
// check, which the create walk and the update walk both reach
// (card-action-engine.ts runValidateLegalityBody). The stage walk skips
// this name (the runtime's writeOrderOwned list), so the body runs
// exactly once.

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

/** An engine whose registry carries the CALLER's validate_legality_of_name
 *  body and nothing else. */
function legalityEngine(
  storage: ActionsTestStorage,
  body: (card: ModEventCard, host: unknown, ctx: ModEventContext) => Promise<void>,
): CardActionEngine {
  const manifest: DeckoModManifest = {
    name: "test-validate-legality-of-name",
    setModules: [
      {
        setPath: "all/name_events",
        events: [
          {
            event: "validate_legality_of_name",
            fn: body as ModEventFn,
          },
        ],
      },
    ],
  };
  const loader = new ModLoader([{ manifest }]);
  loader.resolveOrder({ gemMods: ["test-validate-legality-of-name"] });
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

describe("the name-legality check is carried by the REGISTERED body", () => {
  it("a create reaches the registered body, and the body's refusal is the one the save gets", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const calls: string[] = [];
    const engine = legalityEngine(storage, async (cardIn, _host, ctx) => {
      calls.push(`body:${cardIn.action}`);
      ctx.refuseName?.("is too long (255 character maximum; length is 300)", "too-long");
    });

    // The refusal is the body's own text, not the port's built-in one
    // ("name is too long (500 characters)"), so the body is the mechanism
    // and the built-in stood down.
    await expect(
      engine.createCard({ name: "a".repeat(300), typeId: RICH_TEXT_ID, content: "<p>x</p>" }),
    ).rejects.toMatchObject({
      code: "name-illegal",
      userMessage: "NAME: is too long (255 character maximum; length is 300)",
    });
    expect(calls).toEqual(["body:create"]);
    storage.close();
  });

  it("a legal create reaches the body and is saved", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const calls: string[] = [];
    const engine = legalityEngine(storage, async (cardIn, _host, ctx) => {
      calls.push(`body:${cardIn.action}`);
      // the body asks the chain's questions and refuses nothing
      ctx.cardName?.();
      ctx.nameBlank?.();
      ctx.nameIncomplete?.();
      ctx.nameValid?.();
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

  it("an update reaches the registered body too", async () => {
    const storage = await createActionsTestStorage();
    const fixture = await seedStandardDeck(storage);
    const calls: string[] = [];
    const engine = legalityEngine(storage, async (cardIn, _host, ctx) => {
      calls.push(`body:${cardIn.action}`);
      ctx.refuseName?.("can't be blank", "blank");
    });

    await expect(
      engine.updateCard({ cardId: fixture.joeCard.id, name: "a".repeat(300) }),
    ).rejects.toMatchObject({ code: "name-illegal" });
    expect(calls).toEqual(["body:update"]);
    storage.close();
  });

  it("without a registered body the port's own chain still refuses a too-long name", async () => {
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
