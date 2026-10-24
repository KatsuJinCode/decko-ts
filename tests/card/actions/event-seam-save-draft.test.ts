// event-seam-save-draft.test.ts - the save_draft body is carried by the
// WRITE ORDER (the takeover contract's shape), and the draft write plus the
// abort are the event's own mechanism.
//
// WHY THE WRITE ORDER. Ruby's body is `save_content_draft content; abort
// :success` (content.rb:8-9). The abort ends the save with the draft's own
// result and no cards row, so the body never runs in a stage walk that
// follows the row write. The port's update path's draft arm carries it
// (card-action-engine.ts runSaveDraftBody), and the stage walk skips the
// name (the runtime's writeOrderOwned list), so the body runs exactly once.

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
import type { ModEventRuntime } from "../../../src/card/mod-loader/mod-event-dispatch.js";
import type {
  ModEventCard,
  ModEventFn,
} from "../../../src/card/mod-loader/mod-manifest.js";
import type { ModEventContext } from "../../../src/card/mod-loader/mod-event-dispatch.js";
import type { DeckoModManifest } from "../../../src/card/mod-loader/mod-manifest.js";

/** An engine whose registry carries the CALLER's save_draft body and
 *  nothing else — the takeover's proof: the registered body, not the
 *  built-in, owns the draft write and the abort. */
function draftEngine(
  storage: ActionsTestStorage,
  body: (card: ModEventCard, host: unknown, ctx: ModEventContext) => Promise<void>,
): CardActionEngine {
  const manifest: DeckoModManifest = {
    name: "test-save-draft",
    setModules: [
      {
        setPath: "all/content",
        events: [
          {
            event: "save_draft",
            at: "store",
            on: ["update"],
            when: "draft?",
            fn: body as ModEventFn,
          },
        ],
      },
    ],
  };
  const loader = new ModLoader([{ manifest }]);
  loader.resolveOrder({ gemMods: ["test-save-draft"] });
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

describe("the draft write and the abort are carried by the REGISTERED body", () => {
  it("a draft save reaches the registered body, and the body owns the draft write", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const card = await seedCard(storage, { id: 60, name: "Drafty", dbContent: "v1" });

    const made: string[] = [];
    let drafted: string | undefined;
    const engine = draftEngine(storage, async (cardIn, _host, ctx) => {
      made.push("body");
      // the seams are what the body would call: the draft write and the
      // abort (Ruby's save_content_draft content; abort :success).
      expect(ctx.saveContentDraft).toBeTypeOf("function");
      expect(ctx.abortSuccess).toBeTypeOf("function");
      await ctx.saveContentDraft?.(cardIn.dbContent);
      ctx.abortSuccess?.();
      made.push("done");
    });

    const result = await engine.updateCard({
      cardId: card.id,
      content: "draft text",
      draft: true,
    });

    // the write order called the registered body, in Ruby's order: the
    // draft write, then the abort.
    expect(made).toEqual(["body", "done"]);
    expect(drafted).toBeUndefined();

    // the draft write ran: the action row is a draft (draft=true) and the
    // cards row is UNCHANGED (the abort ended the save before the write).
    const drafts = await storage.selectAll<{ draft: number }>(
      "SELECT draft FROM card_actions WHERE card_id = ?",
      [card.id],
    );
    expect(drafts.length).toBeGreaterThan(0);
    expect(drafts.every((d) => d.draft === 1)).toBe(true);
    const row = await storage.selectOne<{ db_content: string | null }>(
      "SELECT db_content FROM cards WHERE id = ?",
      [card.id],
    );
    expect(row?.db_content).toBe("v1");
    expect(result?.verb).toBe("update");
    storage.close();
  });

  it("a save that is NOT a draft does not reach the body", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const card = await seedCard(storage, { id: 61, name: "Plain", dbContent: "v1" });

    const made: string[] = [];
    const engine = draftEngine(storage, async () => {
      made.push("body");
    });

    await engine.updateCard({ cardId: card.id, content: "posted text" });

    // the save's own when: gate (draft?) did not fire, so the body never
    // ran, and the ordinary row write happened.
    expect(made).toEqual([]);
    const row = await storage.selectOne<{ db_content: string | null }>(
      "SELECT db_content FROM cards WHERE id = ?",
      [card.id],
    );
    expect(row?.db_content).toBe("posted text");
    storage.close();
  });
});
