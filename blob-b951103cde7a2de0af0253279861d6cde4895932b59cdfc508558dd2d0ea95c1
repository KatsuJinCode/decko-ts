import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ModLoader } from "../../../src/card/mod-loader.js";
import history from "../../../src/card/mod-loader/mods/card-mod-history.js";
import { bindModLoaderToEngine, createRenderTestStorage, seedCard, seedReference, type RenderTestStorage } from "../render/render-test-storage.js";
const oracle = JSON.parse(readFileSync(new URL("fixtures/history-json-export.json", import.meta.url), "utf8"));
describe("history register entry 19: Ruby JSON export views", () => {
  let storage: RenderTestStorage;
  let loader: ModLoader;
  beforeAll(async () => {
    storage = await createRenderTestStorage();
    for (const [id, name] of [[200, "Root"], [201, "Nested"], [202, "Other"]] as const) await seedCard(storage, {id, name, dbContent: ""});
    await seedReference(storage, 200, 201, "nested", "I");
    const d = storage.counting;
    for (const [id, time] of [[10, "2026-10-20 12:00:00"], [11, "2026-10-20 12:01:00"]] as const)
      await d.query("INSERT INTO card_acts (id, actor_id, acted_at, card_id) VALUES (?, 7, ?, 200)", [id, time]);
    for (const [id, card, act, type, draft, comment] of [[20,200,10,1,0,null],[21,200,11,1,1,"draft note"],[22,201,10,0,null,null]] as const)
      await d.query("INSERT INTO card_actions (id, card_id, card_act_id, action_type, draft, comment) VALUES (?, ?, ?, ?, ?, ?)", [id,card,act,type,draft,comment]);
    for (const [id, action, value] of [[30,20,"old"],[31,20,"new"],[32,21,"draft"]] as const)
      await d.query("INSERT INTO card_changes (id, card_action_id, field, value) VALUES (?, ?, 2, ?)", [id,action,value]);
    loader = new ModLoader([{manifest: history}]); loader.load(); bindModLoaderToEngine(storage, loader);
  });
  afterAll(async () => { loader?.reset(); await storage?.close(); });
  for (const view of ["history", "actions"]) {
    it(`${view} matches the executed Ruby view including draft/nestee scope and field overwrite`, async () => {
      expect(await storage.engine.renderRaw("Root", view, {format: "json"})).toEqual(oracle[view]);
    });
  }
  it("exports are unpaged and the card/view seat does not leak across requests", async () => {
    expect(await storage.engine.renderRaw("Root", "history", {format: "json", page: "99"})).toEqual(oracle.history);
    expect(await storage.engine.renderRaw("Other", "actions", {format: "json"})).toEqual([]);
    expect(await storage.engine.renderRaw("Root", "actions", {format: "json"})).toEqual(oracle.actions);
  });
});
