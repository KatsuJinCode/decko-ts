// event-seam-set-default-content.test.ts - the set_default_content body is
// carried by the create path's template read (the takeover contract's
// shape), and the body IS the mechanism there.
//
// WHY THE TEMPLATE READ. Ruby's :prepare_to_validate stage runs before the
// row is written, so `self.db_content = default_content` lands in the
// stored row. The port reads the type's template content before its
// validation walk, so that read is the port's own place for the work.

import { describe, expect, it } from "vitest";
import {
  createActionsTestStorage,
  seedCard,
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

/** An engine whose registry carries the CALLER's set_default_content body
 *  and nothing else — the takeover's proof: the registered body, not the
 *  built-in template read, owns the card's content. */
function defaultContentEngine(
  storage: ActionsTestStorage,
  body: (card: ModEventCard, host: unknown, ctx: ModEventContext) => Promise<void>,
): CardActionEngine {
  const manifest: DeckoModManifest = {
    name: "test-set-default-content",
    setModules: [
      {
        setPath: "all/content",
        events: [
          {
            event: "set_default_content",
            at: "prepare_to_validate",
            on: ["create"],
            when: "use_default_content?",
            fn: body as ModEventFn,
          },
        ],
      },
    ],
  };
  const loader = new ModLoader([{ manifest }]);
  loader.resolveOrder({ gemMods: ["test-set-default-content"] });
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

describe("the template content is carried by the REGISTERED body", () => {
  it("a create with no content reaches the registered body, and the body owns the content", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const calls: string[] = [];
    const engine = defaultContentEngine(storage, async (_card, _host, ctx) => {
      calls.push("body");
      const template = await ctx.defaultContent?.();
      ctx.setDbContent?.(`<p>body wrote ${template ?? "none"}</p>`);
    });

    await engine.createCard({ name: "Decko", typeId: RICH_TEXT_ID });

    // the template read called the registered body exactly once.
    expect(calls).toEqual(["body"]);
    // and the body IS the mechanism: the row stores what the body wrote.
    const row = await storage.selectOne<{ db_content: string }>(
      "SELECT db_content FROM cards WHERE name = 'Decko'",
    );
    expect(row?.db_content).toBe("<p>body wrote none</p>");
    storage.close();
  });

  it("a create that assigns its own content does not reach the body", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const calls: string[] = [];
    const engine = defaultContentEngine(storage, async () => {
      calls.push("body");
    });

    await engine.createCard({
      name: "Decko",
      typeId: RICH_TEXT_ID,
      content: "<p>mine</p>",
    });

    // Ruby's use_default_content? is false when content was assigned, so
    // the body does not run and the card keeps its own content.
    expect(calls).toEqual([]);
    const row = await storage.selectOne<{ db_content: string }>(
      "SELECT db_content FROM cards WHERE name = 'Decko'",
    );
    expect(row?.db_content).toBe("<p>mine</p>");
    storage.close();
  });
});
