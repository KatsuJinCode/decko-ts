// event :admin_tasks (card-1.110.0 mod/core set/self/admin.rb:24-34) runs
// THROUGH the ModEventFn execution seam: the registration carries the full
// body — the Env.params[:task] read, the basket lookup, the Auth.always_ok?
// gate, run_task_from_task_basket, and abort :success.
//
// Sources every expectation derives from (upstream source, card-1.110.0):
// - self/admin.rb:24-34, verbatim:
//     event :admin_tasks, :initialize, on: :update do
//       return unless (task = Env.params[:task]&.to_sym) &&
//         (task_config = basket[:tasks][task])
//       raise Card::Error::PermissionDenied, self unless Auth.always_ok?
//       run_task_from_task_basket task, task_config
//       abort :success
//     end
// - Auth.always_ok? (lib/card/auth/permissions.rb:7-14): deckbot true
//   ("cannot disable"), nil false, else admin?. The port derives exactly
//   that from the memoized permission state (permissions/read-rules.ts
//   :373-377); the engine's engineEventCardState supplies it on the event
//   card (card-action-engine.ts).
// - abort :success (lib/card/set/all/result.rb:41-58): the Abort signal the
//   save's abortable wrapper turns into a SUCCESSFUL save that writes
//   nothing (result.rb:82-88, :94-101). The port's shape is the
//   ModEventAbortSuccess throw, caught by the update entry, which answers
//   its no-write success result (null — the same shape the route renders as
//   cardId 0 + success, write-routes.ts).
// - Self set membership: set/self/admin.rb defines Self::Admin, whose set
//   card "*admin+*self" applies to the ONE card keyed "*admin"
//   (lib/card/set/self.rb); keys keep the star, so a plain "admin" card is
//   not a member. The dispatcher's built-in fallback (and the serving
//   runtime's resolver) resolves "self/<codename>" that way.
// - skip semantics (set/event/skip_and_trigger.rb:68-70): an act carrying
//   skip_event! :admin_tasks drops the event — the task does not run and
//   the save completes as an ordinary update. This is the reachability the
//   register's events section names as the core-event gap.

import { describe, expect, it } from "vitest";
import {
  createActionsTestStorage,
  seedStandardDeck,
  seedCard,
  fakeClock,
  type ActionsTestStorage,
} from "../actions/actions-test-storage.js";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";
import { ModLoader, ModEventRegistry } from "../../../src/card/mod-loader.js";
import coreMod, {
  coreModEventPredicates,
} from "../../../src/card/mod-loader/mods/core-mod.js";
import { registerDeckModEventCardStateSources } from "../../../src/card/mod-loader/mod-event-state-sources.js";
import { runModEventStage } from "../../../src/card/mod-loader/mod-event-dispatch.js";
import type { ModEventCard } from "../../../src/card/mod-loader/mod-manifest.js";
import type { ModEventRuntime } from "../../../src/card/mod-loader/mod-event-dispatch.js";
import { ModEventAbortSuccess } from "../../../src/card/actions/types.js";

/** The core mod's manifest loaded standalone -> its event registry (the
 *  same registration the SetLoader phase performs engine-wide). */
function coreRegistry(): ModEventRegistry {
  const loader = new ModLoader([{ manifest: coreMod }]);
  loader.resolveOrder({ gemMods: ["core"] });
  loader.load();
  return loader.eventRegistry();
}

function runtime(): ModEventRuntime {
  return { registry: coreRegistry() };
}

/** The *admin event card at the initialize stage of an update. */
function adminCard(overrides: Partial<ModEventCard> = {}): ModEventCard {
  return {
    name: "*admin",
    key: "*admin",
    action: "update",
    changedFields: [],
    ...overrides,
  };
}

describe("admin_tasks — the seam-level body (self/admin.rb:24-34)", () => {
  it("a task-named, always-ok update aborts :success after running the basket task", async () => {
    // always_ok through the deckbot arm (permissions.rb:8 "cannot disable").
    // The body reaches run_task_from_task_basket (the runner the registry
    // suite pins directly) and ends with the abort; without always_ok the
    // permission raise preempts it (the test below).
    await expect(
      runModEventStage(
        runtime(),
        "initialize",
        adminCard({ params: { task: "clear_cache" }, alwaysOk: true }),
        { driver: undefined as never, lexicon: undefined as never },
      ),
    ).rejects.toBeInstanceOf(ModEventAbortSuccess);
  });

  it("an unknown or absent task returns and the save proceeds (fired, no abort)", async () => {
    const report = await runModEventStage(
      runtime(),
      "initialize",
      adminCard({ params: {} }),
      { driver: undefined as never, lexicon: undefined as never },
    );
    // Ruby's body ran and returned early — the event FIRED (the walk
    // awaited the body; its `return unless` is inside the body).
    expect(report.fired).toEqual(["admin_tasks"]);

    const unknown = await runModEventStage(
      runtime(),
      "initialize",
      adminCard({ params: { task: "no_such_task" } }),
      { driver: undefined as never, lexicon: undefined as never },
    );
    expect(unknown.fired).toEqual(["admin_tasks"]);
  });

  it("a non-always-ok actor raises Ruby's PermissionDenied (403 class)", async () => {
    await expect(
      runModEventStage(
        runtime(),
        "initialize",
        adminCard({ params: { task: "clear_cache" }, alwaysOk: false }),
        { driver: undefined as never, lexicon: undefined as never },
      ),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("a non-*admin card is set-not-applicable (Self::Admin membership)", async () => {
    const report = await runModEventStage(
      runtime(),
      "initialize",
      adminCard({
        name: "Plain Card",
        key: "plain_card",
        params: { task: "clear_cache" },
        alwaysOk: true,
      }),
      { driver: undefined as never, lexicon: undefined as never },
    );
    expect(report.fired).toEqual([]);
    expect(report.skipped).toContainEqual({
      event: "admin_tasks",
      reason: "set-not-applicable",
    });
  });

  it("a plain `admin` card (no star) is NOT Self::Admin — keys keep the star", async () => {
    const report = await runModEventStage(
      runtime(),
      "initialize",
      adminCard({
        name: "admin",
        key: "admin",
        params: { task: "clear_cache" },
        alwaysOk: true,
      }),
      { driver: undefined as never, lexicon: undefined as never },
    );
    expect(report.fired).toEqual([]);
  });

  it("a delete or create act never reaches it (on: :update)", async () => {
    for (const action of ["delete", "create"] as const) {
      const report = await runModEventStage(
        runtime(),
        "initialize",
        adminCard({ action, act: { action }, params: { task: "clear_cache" }, alwaysOk: true }),
        { driver: undefined as never, lexicon: undefined as never },
      );
      expect(report.fired).toEqual([]);
      expect(report.skipped).toContainEqual({ event: "admin_tasks", reason: "on-action" });
    }
  });

  it("skip_event! :admin_tasks drops it (the force list; plain skip= only drops skip:-allowed events)", async () => {
    const report = await runModEventStage(
      { registry: coreRegistry(), forceSkip: ["admin_tasks"] },
      "initialize",
      adminCard({ params: { task: "clear_cache" }, alwaysOk: true }),
      { driver: undefined as never, lexicon: undefined as never },
    );
    expect(report.fired).toEqual([]);
    expect(report.skipped).toContainEqual({ event: "admin_tasks", reason: "force-skip" });
  });
});

// ---------------------------------------------------------------------------
// The engine save path: the abort writes nothing and answers success; the
// skip reaches the event from the save input.
// ---------------------------------------------------------------------------

/** The seeded deck's admin shape: *admin (id 40, the Self::Admin anchor)
 *  plus the *deckbot codename card whose id makes a signed-in actor
 *  always-ok (read-rules.ts:373-377 — Ruby permissions.rb:8). */
async function adminDeck(storage: ActionsTestStorage): Promise<{ adminId: number; deckbotId: number }> {
  const admin = await seedCard(storage, { id: 40, name: "*admin", codename: "admin", typeId: 2 });
  // The deckbot codename is "decko_bot" (read-rules DECKOBOT_CODENAME;
  // Ruby's DeckoBotID card — auth/permissions.rb:8 "cannot disable").
  const deckbot = await seedCard(storage, { id: 41, name: "DeckoBot", codename: "decko_bot", typeId: 2 });
  return { adminId: admin.id, deckbotId: deckbot.id };
}

const DECKBOT = (id: number) => ({ id, name: "DeckoBot" });

// The deck boot registers the event-card state sources (the core source
// copies Env.params onto the card); a standalone-engine test registers the
// same set. Re-registration is harmless: same sources, same fields.
registerDeckModEventCardStateSources();

function taskEngine(
  storage: ActionsTestStorage,
  deckbotId: number,
  opts: { task?: string; skip?: string[] } = {},
): { engine: CardActionEngine } {
  const engine = new CardActionEngine(storage.engine, {
    actor: DECKBOT(deckbotId),
    ipAddress: "192.0.2.7",
    now: fakeClock(),
    // The save's Env.params bag (write-routes.ts requestParamsForEvents
    // builds the same shape from a request; the body reads params.task).
    ...(opts.task !== undefined ? { params: { task: opts.task } } : {}),
    modEvents: {
      registry: coreRegistry(),
      predicates: coreModEventPredicates,
      // skip_event! rides the runtime's force list (skip_and_trigger.rb
      // :86-90); admin_tasks declares no skip: :allowed, so the plain
      // skip= list would not drop it.
      ...(opts.skip !== undefined ? { forceSkip: opts.skip } : {}),
    },
  });
  return { engine };
}

async function adminContent(storage: ActionsTestStorage, adminId: number): Promise<string | null> {
  const row = await storage.selectOne<{ db_content: string | null }>(
    "SELECT db_content FROM cards WHERE id = ?",
    [adminId],
  );
  return row?.db_content ?? null;
}

async function actCount(storage: ActionsTestStorage, cardId: number): Promise<number> {
  const row = await storage.selectOne<{ n: number }>(
    "SELECT COUNT(*) AS n FROM card_acts WHERE card_id = ?",
    [cardId],
  );
  return row?.n ?? 0;
}

describe("admin_tasks — through the engine's update save", () => {
  it("a deckbot update naming a task aborts :success: no write, success result", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const { adminId, deckbotId } = await adminDeck(storage);

    const { engine } = taskEngine(storage, deckbotId, { task: "clear_cache" });
    const result = await engine.updateCard({ cardId: adminId, content: "should never land" });

    // abort :success — result.rb:82-88 answers TRUE (success) with the act
    // rolled back; the port's no-write success result is null.
    expect(result).toBeNull();
    await expect(adminContent(storage, adminId)).resolves.not.toBe("should never land");
    // The act never happened: no act row for the admin card.
    await expect(actCount(storage, adminId)).resolves.toBe(0);
    storage.close();
  });

  it("a deckbot update without a task saves ordinarily", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const { adminId, deckbotId } = await adminDeck(storage);

    const { engine } = taskEngine(storage, deckbotId);
    const result = await engine.updateCard({ cardId: adminId, content: "ordinary content" });

    expect(result).not.toBeNull();
    await expect(adminContent(storage, adminId)).resolves.toBe("ordinary content");
    storage.close();
  });

  it("skip_event! :admin_tasks drops the event: the task-named save completes as an update", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const { adminId, deckbotId } = await adminDeck(storage);

    const { engine } = taskEngine(storage, deckbotId, { task: "clear_cache", skip: ["admin_tasks"] });
    const result = await engine.updateCard({ cardId: adminId, content: "skipped the task" });

    // Ruby: skip_event! :admin_tasks (the force list, skip_and_trigger.rb
    // :80-90) removes the event from the act; the save runs as an ordinary
    // update (the task never runs). Plain skip= would NOT drop it —
    // admin_tasks declares no skip: :allowed.
    expect(result).not.toBeNull();
    await expect(adminContent(storage, adminId)).resolves.toBe("skipped the task");
    storage.close();
  });

  it("a task-named update of a NON-admin card is an ordinary save (Self scoping)", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const { deckbotId } = await adminDeck(storage);

    const { engine } = taskEngine(storage, deckbotId, { task: "clear_cache" });
    const phrase = await engine.createCard({ name: "Phrase Card", content: "before" });
    const result = await engine.updateCard({ cardId: phrase.cardId, content: "after" });

    expect(result).not.toBeNull();
    const row = await storage.selectOne<{ db_content: string | null }>(
      "SELECT db_content FROM cards WHERE id = ?",
      [phrase.cardId],
    );
    expect(row?.db_content).toBe("after");
    storage.close();
  });
});
