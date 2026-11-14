import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ModLoader } from "../../../src/card/mod-loader.js";
import format from "../../../src/card/mod-loader/mods/card-mod-format.js";
import { bindModLoaderToEngine, createRenderTestStorage, seedCard, type RenderTestStorage } from "../render/render-test-storage.js";
const oracle = JSON.parse(readFileSync(new URL("fixtures/jsonld-static-errors.json", import.meta.url), "utf8"));
describe("format register entry 17: pinned Ruby JSON-LD static errors", () => {
  let storage: RenderTestStorage;
  let loader: ModLoader;
  beforeAll(async () => {
    storage = await createRenderTestStorage();
    await seedCard(storage, {id: 200, name: "Probe", dbContent: ""});
    loader = new ModLoader([{manifest: format}]);
    loader.load();
    bindModLoaderToEngine(storage, loader);
  });
  afterAll(async () => { loader?.reset(); await storage?.close(); });
  for (const view of ["not_found", "denial"]) {
    it(`${view} matches Ruby's serialized Hydra error, through format dispatch`, async () => {
      expect(await storage.engine.render("Probe", view, {format: "jsonld"})).toBe(oracle[view]);
    });
  }
  it("the gem's test view raises its literal error", async () => {
    expect(oracle.test).toEqual({error: "RuntimeError", message: "blah"});
    await expect(storage.engine.render("Probe", "test", {format: "jsonld"})).rejects.toThrow("blah");
  });
});
