// event-seam-update-lexicon.test.ts - the update_lexicon body is carried
// by the post-write expiry (the takeover contract's shape), and the body IS
// the mechanism there.
//
// WHY THE EXPIRY. Ruby's body schedules the lexicon work in an
// after_store callback, which the pinned comment places "right after the
// storage". The port's own place for that work is the post-write expiry
// (expireAfterWrite), so the expiry carries the body.

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

/** An engine whose registry carries the CALLER's update_lexicon body and
 *  nothing else — the takeover's proof: the registered body, not the
 *  built-in lexicon write, owns the lexicon update. */
function lexiconEngine(
  storage: ActionsTestStorage,
  body: (card: ModEventCard, host: unknown, ctx: ModEventContext) => Promise<void>,
): CardActionEngine {
  const manifest: DeckoModManifest = {
    name: "test-update-lexicon",
    setModules: [
      {
        setPath: "all/name_events",
        events: [
          {
            event: "update_lexicon",
            at: "store",
            changed: ["name"],
            fn: body as ModEventFn,
          },
        ],
      },
    ],
  };
  const loader = new ModLoader([{ manifest }]);
  loader.resolveOrder({ gemMods: ["test-update-lexicon"] });
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

describe("the lexicon update is carried by the REGISTERED body", () => {
  it("a create reaches the registered body, and the body owns the lexicon write", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const calls: string[] = [];
    const engine = lexiconEngine(storage, async (cardIn, _host, ctx) => {
      calls.push(`body:${cardIn.action}`);
      // a create ADDs the card to the lexicon
      ctx.lexiconAdd?.();
    });

    await engine.createCard({ name: "Decko", typeId: RICH_TEXT_ID, content: "<p>x</p>" });

    expect(calls).toEqual(["body:create"]);
    storage.close();
  });

  it("a rename reaches the registered body, and the body owns the lexicon update", async () => {
    const storage = await createActionsTestStorage();
    const fixture = await seedStandardDeck(storage);
    const calls: string[] = [];
    const engine = lexiconEngine(storage, async (cardIn, _host, ctx) => {
      calls.push(`body:${cardIn.action}`);
      // an update REPLACES the card's lexicon entry and expires the old lex
      ctx.lexiconUpdate?.();
    });

    await engine.updateCard({
      cardId: fixture.joeCard.id,
      name: "Pudding Renamed",
    });

    expect(calls).toEqual(["body:update"]);
    storage.close();
  });
});
