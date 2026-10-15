import { afterEach, beforeEach, expect, it } from "vitest";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";
import { ModEventRegistry } from "../../../src/card/mod-loader/mod-event-registry.js";
import { createActionsTestStorage, seedStandardDeck, JOE, fakeClock, type ActionsTestStorage } from "./actions-test-storage.js";

let storage: ActionsTestStorage;
beforeEach(async () => { storage = await createActionsTestStorage(); await seedStandardDeck(storage); });
afterEach(() => storage.close());

function engine(order: string[], rejectChild = false) {
  const registry = new ModEventRegistry();
  for (const stage of ["validate", "store"] as const) registry.register({
    event: `observe_${stage}`, at: stage, setPath: "all/lifecycle_control", modName: "lifecycle_control",
    fn: async card => {
      order.push(`${stage}:${card.name}`);
      if (stage === "validate" && card.name === "Phase Parent+child") {
        expect(await storage.selectOne("SELECT id FROM cards WHERE name = ?", ["Phase Parent"])).toBeUndefined();
        if (rejectChild) throw new Error("child validation refused");
      }
    },
  });
  return new CardActionEngine(storage.engine, { actor: JOE, now: fakeClock(), modEvents: { registry } });
}

it("validates submitted new descendants before storing their parent, exactly once", async () => {
  const order: string[] = [];
  await engine(order).createCard({ name: "Phase Parent", content: "parent", subcards: {
    "+child": { content: "child", subcards: { "+leaf": { content: "leaf" } } },
  } });
  const firstStore = order.findIndex(entry => entry.startsWith("store:"));
  expect(order.slice(0, firstStore)).toEqual(["validate:Phase Parent", "validate:Phase Parent+child", "validate:Phase Parent+child+leaf"]);
  expect(order.filter(entry => entry === "validate:Phase Parent+child")).toHaveLength(1);
  expect(await storage.count("card_acts")).toBe(1);
});

it("a refused new child prevents the parent store body from executing", async () => {
  const order: string[] = [];
  const cardsBefore = await storage.count("cards");
  await expect(engine(order, true).createCard({ name: "Phase Parent", content: "parent", subcards: {
    "+child": { content: "invalid" },
  } })).rejects.toThrow("child validation refused");
  expect(order.some(entry => entry.startsWith("store:"))).toBe(false);
  expect(await storage.count("cards")).toBe(cardsBefore);
  expect(await storage.count("card_acts")).toBe(0);
  expect(await storage.count("card_actions")).toBe(0);
});
