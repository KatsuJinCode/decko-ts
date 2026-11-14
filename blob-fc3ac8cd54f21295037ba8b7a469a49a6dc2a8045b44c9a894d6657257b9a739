// event-seam-set-content.test.ts - the set_content body is carried by the
// port's PRE-WRITE content preparation (the takeover contract's shape),
// and the body IS the mechanism there.
//
// WHY THE PRE-WRITE SITE. Ruby's :store stage runs before the row is
// written, so `self.content = prepare_db_content` lands in the stored
// row. The port's :store stage walk runs AFTER the write, so it cannot
// carry the work; the port's own place for it is the preparation the
// write path does before the row write.

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

/** An engine whose registry carries the CALLER's set_content body and
 *  nothing else — the takeover's proof: the registered body, not the
 *  built-in preparation, owns the stored content. */
function contentEngine(
  storage: ActionsTestStorage,
  body: (card: ModEventCard, host: unknown, ctx: ModEventContext) => Promise<void>,
): CardActionEngine {
  const manifest: DeckoModManifest = {
    name: "test-set-content",
    setModules: [
      {
        setPath: "all/content",
        events: [
          {
            event: "set_content",
            at: "store",
            on: ["save"],
            fn: body as ModEventFn,
          },
        ],
      },
    ],
  };
  const loader = new ModLoader([{ manifest }]);
  loader.resolveOrder({ gemMods: ["test-set-content"] });
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

describe("the stored content is carried by the REGISTERED body", () => {
  it("a create reaches the registered body, and the body owns the stored content", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const calls: string[] = [];
    const engine = contentEngine(storage, async (cardIn, _host, ctx) => {
      calls.push("body");
      // the body prepares the content the card stores
      const prepared = await ctx.prepareDbContent?.(cardIn.dbContent ?? "");
      ctx.setContent?.(`<p>body wrote ${prepared}</p>`);
      ctx.clearDrafts?.();
    });

    await engine.createCard({ name: "Decko", typeId: RICH_TEXT_ID, content: "<p>posted</p>" });

    // the pre-write preparation called the registered body exactly once.
    expect(calls).toEqual(["body"]);
    // and the body IS the mechanism: the row stores what the body wrote.
    const row = await storage.selectOne<{ db_content: string }>(
      "SELECT db_content FROM cards WHERE name = 'Decko'",
    );
    expect(row?.db_content).toBe("<p>body wrote <p>posted</p></p>");
    storage.close();
  });

  it("an update reaches the registered body, and the body owns the stored content", async () => {
    const storage = await createActionsTestStorage();
    const fixture = await seedStandardDeck(storage);
    const calls: string[] = [];
    const engine = contentEngine(storage, async (cardIn, _host, ctx) => {
      calls.push("body");
      const prepared = await ctx.prepareDbContent?.(cardIn.dbContent ?? "");
      ctx.setContent?.(`<p>body wrote ${prepared}</p>`);
      ctx.clearDrafts?.();
    });

    await engine.updateCard({ cardId: fixture.joeCard.id, content: "<p>posted</p>" });

    expect(calls).toEqual(["body"]);
    const row = await storage.selectOne<{ db_content: string }>(
      "SELECT db_content FROM cards WHERE id = ?",
      [fixture.joeCard.id],
    );
    expect(row?.db_content).toBe("<p>body wrote <p>posted</p></p>");
    storage.close();
  });
});
