// event :reset_cache_to_use_new_structure (card-mod-content-0.20.0
// set/right/structure.rb:38-41, the before: :update_structurees_references
// rider at the :integrate stage) — the body resets Card::Cache's shared +
// temporary layers (card-1.110.0 lib/card/cache/class_methods.rb:43-52,
// 67-77) so the structuree cascade reads post-structure state.
//
// The port: resetCacheToUseNewStructureEvent resets the fetch engine's
// CardCache pair (Card + Lexicon — the port's whole cache_by_class),
// whose reset() is cache.rb#reset (shared + temp). The pin: sentinel
// entries written into both cache instances' temp layers before a
// "*all+*structure" save are GONE after it (the event fired at integrate),
// and the registration's set scoping (right/structure, the Right pattern)
// gates it to +*structure cards.

import { describe, expect, it } from "vitest";
import {
  createActionsTestStorage,
  seedCard,
  seedStandardDeck,
  JOE,
  type ActionsTestStorage,
} from "../actions/actions-test-storage.js";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";
import { ModLoader } from "../../../src/card/mod-loader.js";
import cardModContent, {
  contentModEventPredicates,
  resetCacheToUseNewStructureEvent,
} from "../../../src/card/mod-loader/mods/card-mod-content.js";
import { rightSetMember } from "../../../src/card/mod-loader/mod-event-set-membership.js";
import type { ModEventRuntime, ModEventStageReport } from "../../../src/card/mod-loader/mod-event-dispatch.js";

function contentRuntime(driver: Parameters<typeof rightSetMember>[0]): {
  runtime: ModEventRuntime;
  reports: ModEventStageReport[];
} {
  const loader = new ModLoader([{ manifest: cardModContent }]);
  loader.resolveOrder({ gemMods: ["content"] });
  loader.load();
  const reports: ModEventStageReport[] = [];
  return {
    runtime: {
      registry: loader.eventRegistry(),
      // the mod's own when: predicates (update_structurees_references? —
      // structure.rb:19-21) resolve in the deck composition
      // (defaultDeckEventPredicates); the walk evaluates the still-stub
      // sibling event's gate.
      predicates: contentModEventPredicates,
      setMember: rightSetMember(driver),
      onReport: (r) => reports.push(r),
    },
    reports,
  };
}

async function structureDeck(): Promise<{
  storage: ActionsTestStorage;
  structureId: number;
  engine: CardActionEngine;
  reports: ModEventStageReport[];
}> {
  const storage = await createActionsTestStorage();
  await seedStandardDeck(storage);
  await seedCard(storage, { name: "*structure", codename: "structure" });
  const structure = await seedCard(storage, {
    name: "*all+*structure",
    dbContent: "{}",
  });
  const { runtime, reports } = contentRuntime(storage.engine.driver);
  const engine = new CardActionEngine(storage.engine, {
    actor: JOE,
    ipAddress: "192.0.2.7",
    modEvents: runtime,
  });
  return { storage, structureId: structure.id, engine, reports };
}

describe("reset_cache_to_use_new_structure — the save resets the deck caches", () => {
  it("a *structure save's integrate walk fires the event and clears both cache instances", async () => {
    const { storage, structureId, engine, reports } = await structureDeck();
    // sentinel entries in every temp layer the port's cache_by_class has
    storage.engine.cardCache.write("sentinel:card", { v: 1 });
    storage.engine.lexiconCache.write("sentinel:lexicon", { v: 2 });
    expect(storage.engine.cardCache.read("sentinel:card")).toEqual({ v: 1 });
    expect(storage.engine.lexiconCache.read("sentinel:lexicon")).toEqual({ v: 2 });

    const result = await engine.updateCard({ cardId: structureId, content: "{\"type\":\"Basic\"}" });
    expect(result).not.toBeNull();

    // the integrate walk fired the event (the before: rider's resolved stage)
    const integrate = reports.find((r) => r.stage === "integrate");
    expect(integrate?.fired).toContain("reset_cache_to_use_new_structure");

    // Card::Cache.reset_shared + reset_temp: the sentinels are gone
    expect(storage.engine.cardCache.read("sentinel:card")).toBeUndefined();
    expect(storage.engine.lexiconCache.read("sentinel:lexicon")).toBeUndefined();
  });

  it("the set scoping keeps the reset off cards outside right/structure", async () => {
    const { storage, engine, reports } = await structureDeck();
    storage.engine.cardCache.write("sentinel:card", { v: 1 });
    const plain = await seedCard(storage, { name: "Plain Card", dbContent: "x" });
    await engine.updateCard({ cardId: plain.id, content: "y" });
    const integrate = reports.find((r) => r.stage === "integrate");
    const entry = integrate?.skipped.find((s) => s.event === "reset_cache_to_use_new_structure");
    expect(entry?.reason).toBe("set-not-applicable");
    expect(storage.engine.cardCache.read("sentinel:card")).toEqual({ v: 1 });
  });

  it("the registered body resets the caches when invoked directly (the fn the walk fires)", async () => {
    const { storage } = await structureDeck();
    storage.engine.cardCache.write("sentinel:card", { v: 1 });
    storage.engine.lexiconCache.write("sentinel:lexicon", { v: 2 });
    await resetCacheToUseNewStructureEvent(
      { name: "*all+*structure", action: "update" },
      undefined,
      {
        driver: storage.engine.driver,
        lexicon: undefined as never,
        stage: "integrate",
        skipEvent: () => false,
        fetch: storage.engine,
      },
    );
    expect(storage.engine.cardCache.read("sentinel:card")).toBeUndefined();
    expect(storage.engine.lexiconCache.read("sentinel:lexicon")).toBeUndefined();
  });
});
