// event-seam-validate-renaming.test.ts - the update walk's rename guards
// are carried by the REGISTERED body, and the body IS the mechanism there.
//
// WHY THE RENAME SITE. Ruby's body (name_events.rb:46-51) is the rename
// guards: a rename may not change the content, a rename may not change
// the type, and a simple card that is in use as a tag may not become
// compound. The port's own place for that work is the update walk's
// rename site, which answers the same three questions today
// (card-action-engine.ts runValidateRenamingBody). The stage walk skips
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

/** An engine whose registry carries the CALLER's validate_renaming body
 *  and nothing else. */
function validateRenamingEngine(
  storage: ActionsTestStorage,
  body: (card: ModEventCard, host: unknown, ctx: ModEventContext) => Promise<void>,
): CardActionEngine {
  const manifest: DeckoModManifest = {
    name: "test-validate-renaming",
    setModules: [
      {
        setPath: "all/name_events",
        events: [
          {
            event: "validate_renaming",
            fn: body as ModEventFn,
          },
        ],
      },
    ],
  };
  const loader = new ModLoader([{ manifest }]);
  loader.resolveOrder({ gemMods: ["test-validate-renaming"] });
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

describe("the rename guards are carried by the REGISTERED body", () => {
  it("an update that renames reaches the registered body, and the body's own refusal is the one the save gets", async () => {
    const storage = await createActionsTestStorage();
    const fixture = await seedStandardDeck(storage);
    const calls: string[] = [];
    const engine = validateRenamingEngine(storage, async (cardIn, _host, ctx) => {
      calls.push(`body:${cardIn.action}`);
      if (ctx.sameNameAsBefore?.() === true) return;
      if (ctx.contentIsChanging?.() === true) {
        ctx.refuseContentChange?.("cannot change content while changing name");
        return;
      }
      if (ctx.typeIsChanging?.() === true) {
        ctx.refuseTypeChange?.("cannot change type while changing name");
        return;
      }
      await ctx.detectIllegalCompoundNames?.();
    });

    // a rename that changes the content: the body's own refusal, with the
    // port's rename-conflict code and Ruby's text.
    await expect(
      engine.updateCard({ cardId: fixture.joeCard.id, name: "Pudding2", content: "<p>other</p>" }),
    ).rejects.toMatchObject({
      code: "rename-conflict",
      userMessage: "CONTENT: cannot change content while changing name",
    });
    expect(calls).toEqual(["body:update"]);
    storage.close();
  });

  it("a rename that changes nothing else reaches the body and is saved", async () => {
    const storage = await createActionsTestStorage();
    const fixture = await seedStandardDeck(storage);
    const calls: string[] = [];
    const engine = validateRenamingEngine(storage, async (cardIn, _host, ctx) => {
      calls.push(`body:${cardIn.action}`);
      if (ctx.sameNameAsBefore?.() === true) return;
      await ctx.detectIllegalCompoundNames?.();
    });

    await engine.updateCard({ cardId: fixture.joeCard.id, name: "Pudding2" });
    expect(calls).toEqual(["body:update"]);
    storage.close();
  });

  it("without a registered body the port's own guards still refuse a rename that changes the content", async () => {
    const storage = await createActionsTestStorage();
    const fixture = await seedStandardDeck(storage);
    const engine = new CardActionEngine(storage.engine, {
      actor: JOE,
      ipAddress: "192.0.2.7",
      now: fakeClock(),
    });

    await expect(
      engine.updateCard({ cardId: fixture.joeCard.id, name: "Pudding2", content: "<p>other</p>" }),
    ).rejects.toMatchObject({
      code: "rename-conflict",
      message: "content cannot change in the same save as a rename",
    });
    storage.close();
  });

  it("the port's own guards stand down when the body is registered", async () => {
    const storage = await createActionsTestStorage();
    const fixture = await seedStandardDeck(storage);
    // the body refuses nothing, so the save goes through even though the
    // content changed with the rename: the port's built-in guards stood
    // down.
    const engine = validateRenamingEngine(storage, async () => undefined);

    await engine.updateCard({
      cardId: fixture.joeCard.id,
      name: "Pudding2",
      content: "<p>other</p>",
    });
    storage.close();
  });
});
