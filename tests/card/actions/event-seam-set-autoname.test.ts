// event-seam-set-autoname.test.ts - the set_autoname body is carried by
// the create path's naming site (the takeover contract's shape), and the
// body IS the mechanism there.
//
// WHY THE NAMING SITE. The port names a blank-named card before its
// validation walk (Ruby names it at :prepare_to_store, after validation),
// so the create path's naming site is the port's own place for the work.
// The body runs exactly once there, and the stage walk's copy stays
// skipped (the predicate table's `autoname?` answers false).

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

/** An engine whose registry carries the CALLER's set_autoname body and
 *  nothing else — the takeover's proof: the registered body, not the
 *  built-in ladder, owns the naming. */
function autonameEngine(
  storage: ActionsTestStorage,
  body: (card: ModEventCard, host: unknown, ctx: ModEventContext) => Promise<void>,
): CardActionEngine {
  const manifest: DeckoModManifest = {
    name: "test-set-autoname",
    setModules: [
      {
        setPath: "all/autoname",
        events: [
          {
            event: "set_autoname",
            at: "prepare_to_store",
            on: ["create"],
            when: "autoname?",
            fn: body as ModEventFn,
          },
        ],
      },
    ],
  };
  const loader = new ModLoader([{ manifest }]);
  loader.resolveOrder({ gemMods: ["test-set-autoname"] });
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

/** The autoname rule fixture: the *autoname setting, its type, the rule
 *  set and the rule card whose content is the seed (create.test.ts's
 *  autonameFixture). */
async function autonameFixture(seed = "auto001"): Promise<ActionsTestStorage> {
  const storage = await createActionsTestStorage();
  await seedStandardDeck(storage);
  await seedCard(storage, { id: 340, name: "*autoname", codename: "autoname" });
  await seedCard(storage, { id: 341, name: "*type", codename: "type" });
  await seedCard(storage, { id: 342, leftId: RICH_TEXT_ID, rightId: 341, typeId: 300 });
  await seedCard(storage, { id: 343, leftId: 342, rightId: 340, dbContent: seed });
  return storage;
}

describe("the autoname naming is carried by the REGISTERED body", () => {
  it("a blank-named create reaches the registered body, and the body owns the name", async () => {
    const storage = await autonameFixture();
    const calls: string[] = [];
    const engine = autonameEngine(storage, async (_card, _host, ctx) => {
      calls.push("body");
      const rule = await ctx.autonameRule?.();
      expect(rule?.id).toBe(343);
      const named = await ctx.autonameName?.(rule?.content ?? "");
      expect(named).toBe("auto001");
      ctx.setCardName?.(named ?? "");
      await ctx.updateAutonameRuleContent?.(named ?? "");
      ctx.expireAutonameRule?.();
    });

    const result = await engine.createCard({ name: "", typeId: RICH_TEXT_ID, content: "first" });

    // the naming site called the registered body exactly once.
    expect(calls).toEqual(["body"]);
    // and the body IS the mechanism: the card took the name the body chose.
    expect(result.name?.s).toBe("auto001");
    storage.close();
  });

  it("the rule card's content follows the name the body assigned", async () => {
    const storage = await autonameFixture();
    const engine = autonameEngine(storage, async (_card, _host, ctx) => {
      const rule = await ctx.autonameRule?.();
      const named = await ctx.autonameName?.(rule?.content ?? "");
      ctx.setCardName?.(named ?? "");
      await ctx.updateAutonameRuleContent?.(named ?? "");
      ctx.expireAutonameRule?.();
    });

    await engine.createCard({ name: "", typeId: RICH_TEXT_ID, content: "first" });

    // the rule card's content is the name the card took (autoname.rb:4),
    // so the next create continues from there.
    const rule = await storage.selectOne<{ db_content: string }>(
      "SELECT db_content FROM cards WHERE id = 343",
    );
    expect(rule?.db_content).toBe("auto001");
    storage.close();
  });

  it("a named create does not reach the body", async () => {
    const storage = await autonameFixture();
    const calls: string[] = [];
    const engine = autonameEngine(storage, async () => {
      calls.push("body");
    });

    await engine.createCard({ name: "Named card", typeId: RICH_TEXT_ID });

    // the naming site only runs for a BLANK name (Ruby's autoname? first
    // clause, autoname.rb:15).
    expect(calls).toEqual([]);
    storage.close();
  });
});
