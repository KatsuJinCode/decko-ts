// event-seam-validate-key.test.ts - the save path's key check is carried
// by the REGISTERED body, and the body IS the mechanism there.
//
// WHY THE SAVE PATH'S CHECK. Ruby's body (name_events.rb:38-43) runs in
// the :validate stage, after validate_name: the card's key must not be
// empty, and it must be the key the card's name computes. The port's own
// place for that work is the save path's key check, which the create walk
// and the update walk both reach (card-action-engine.ts
// runValidateKeyBody). The stage walk skips this name (the runtime's
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

/** An engine whose registry carries the CALLER's validate_key body and
 *  nothing else. */
function keyEngine(
  storage: ActionsTestStorage,
  body: (card: ModEventCard, host: unknown, ctx: ModEventContext) => Promise<void>,
): CardActionEngine {
  const manifest: DeckoModManifest = {
    name: "test-validate-key",
    setModules: [
      {
        setPath: "all/name_events",
        events: [
          {
            // the callback target validate_key names (after: validate_name)
            event: "validate_name",
            at: "validate",
            on: ["save"],
            changed: ["name"],
            fn: (async () => undefined) as ModEventFn,
          },
          {
            event: "validate_key",
            after: "validate_name",
            on: ["save"],
            when: "no_autoname?",
            fn: body as ModEventFn,
          },
        ],
      },
    ],
  };
  const loader = new ModLoader([{ manifest }]);
  loader.resolveOrder({ gemMods: ["test-validate-key"] });
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

describe("the key check is carried by the REGISTERED body", () => {
  it("a create reaches the registered body, and the body's refusal is the one the save gets", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const calls: string[] = [];
    const engine = keyEngine(storage, async (cardIn, _host, ctx) => {
      calls.push(`body:${cardIn.action}`);
      ctx.refuseKey?.("wrong key 'other' for name Decko");
    });

    // The refusal is the body's own text, not the port's built-in one
    // ("Validation failed: Key cannot be blank"), so the body is the
    // mechanism and the built-in stood down.
    await expect(
      engine.createCard({ name: "Decko", typeId: RICH_TEXT_ID, content: "<p>x</p>" }),
    ).rejects.toMatchObject({
      code: "validation-failed",
      message: "Validation failed: Key wrong key 'other' for name Decko",
      userMessage: "KEY: wrong key 'other' for name Decko",
    });
    expect(calls).toEqual(["body:create"]);
    storage.close();
  });

  it("the port's built-in check stands down: a body that refuses nothing lets the empty key through", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const calls: string[] = [];
    const engine = keyEngine(storage, async (cardIn, _host, ctx) => {
      calls.push(`body:${cardIn.action}`);
      // the body reads the card's key and the key the name computes, and
      // refuses nothing
      ctx.cardKey?.();
      ctx.nameKey?.();
    });

    // "!!!" is legal (the port bans no characters) and computes the empty
    // key. Without a registered body the built-in check refuses that save
    // (the next test); with the body registered, the body is the
    // mechanism and the save goes through.
    const created = await engine.createCard({
      name: "!!!",
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
    const engine = keyEngine(storage, async (cardIn, _host, ctx) => {
      calls.push(`body:${cardIn.action}`);
      ctx.refuseKey?.("wrong key 'other' for name Decko");
    });

    await expect(
      engine.updateCard({ cardId: fixture.joeCard.id, content: "<p>y</p>" }),
    ).rejects.toMatchObject({ code: "validation-failed" });
    expect(calls).toEqual(["body:update"]);
    storage.close();
  });

  it("without a registered body the port's own check still refuses an empty key", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const engine = new CardActionEngine(storage.engine, {
      actor: JOE,
      ipAddress: "192.0.2.7",
      now: fakeClock(),
    });

    await expect(
      engine.createCard({ name: "!!!", typeId: RICH_TEXT_ID, content: "<p>x</p>" }),
    ).rejects.toMatchObject({
      code: "validation-failed",
      message: "Validation failed: Key cannot be blank",
      userMessage: "KEY: cannot be blank",
    });
    storage.close();
  });
});
