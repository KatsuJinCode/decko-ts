// event-seam-codename-cache.test.ts - the reset_codename_cache body is
// carried by the WRITE ORDER (the takeover contract's shape), and the
// codename cache drop is the event's own mechanism.
//
// WHY THE WRITE ORDER. The port's own place for the reset is the
// post-write expiry, where the save's changed-clause gate (the codename
// column changed) selects it (card-action-engine.ts
// runResetCodenameCacheBody). The stage walk skips the name, so the body
// runs exactly once.

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
import type { ModEventRuntime } from "../../../src/card/mod-loader/mod-event-dispatch.js";
import type {
  ModEventCard,
  ModEventFn,
} from "../../../src/card/mod-loader/mod-manifest.js";
import type { ModEventContext } from "../../../src/card/mod-loader/mod-event-dispatch.js";
import type { DeckoModManifest } from "../../../src/card/mod-loader/mod-manifest.js";

/** An engine whose registry carries the CALLER's reset_codename_cache
 *  body and nothing else — the takeover's proof: the registered body, not
 *  the built-in, owns the reset. */
function resetEngine(
  storage: ActionsTestStorage,
  body: (card: ModEventCard, host: unknown, ctx: ModEventContext) => Promise<void>,
): CardActionEngine {
  const manifest: DeckoModManifest = {
    name: "test-reset-codename-cache",
    setModules: [
      {
        setPath: "all/codename",
        events: [
          {
            event: "reset_codename_cache",
            at: "integrate",
            changed: ["codename"],
            fn: body as ModEventFn,
          },
        ],
      },
    ],
  };
  const loader = new ModLoader([{ manifest }]);
  loader.resolveOrder({ gemMods: ["test-reset-codename-cache"] });
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

describe("the codename cache drop is carried by the REGISTERED body", () => {
  it("a create that assigns a codename reaches the registered body", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const calls: string[] = [];
    const engine = resetEngine(storage, async (card, _host, ctx) => {
      calls.push(card.action ?? "");
      // the seam is what the body would call to drop the cache
      expect(ctx.resetCodenameCache).toBeTypeOf("function");
      ctx.resetCodenameCache?.();
    });

    await engine.createCard({ name: "Coded Card", codename: "coded_card" });

    // the write order called the registered body, for the create that
    // assigned a codename.
    expect(calls).toEqual(["create"]);
    storage.close();
  });

  it("a create that assigns NO codename does not reach the body", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const calls: string[] = [];
    const engine = resetEngine(storage, async (card) => {
      calls.push(card.action ?? "");
    });

    await engine.createCard({ name: "Plain Card" });

    // the save's changed-clause gate (the codename column changed) did
    // not fire, so the body never ran.
    expect(calls).toEqual([]);
    storage.close();
  });
});
