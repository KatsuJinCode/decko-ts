import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ModLoader, modEngineHost } from "../../../src/card/mod-loader.js";
import cardModFormat from "../../../src/card/mod-loader/mods/card-mod-format.js";
import { bindModLoaderToEngine, createRenderTestStorage, seedCard, type RenderTestStorage } from "../render/render-test-storage.js";

// Independent stock Ruby captures, retained by the reference harness.
const oracle = readFileSync(new URL("../../../reference-harness/fixtures/synthetic-v2-mod-probes/expected/render.jsonl", import.meta.url), "utf8")
  .trim().split("\n").map(line => JSON.parse(line)) as Array<{ id: string; result: { html: string } }>;
const captured = (view: string) => oracle.find(row => row.id.endsWith(`:${view}@set/all/css.rb`))!.result.html;

describe("CSS view dispatch (Ruby card-mod-format set/all/css.rb)", () => {
  let storage: RenderTestStorage;
  let loader: ModLoader;
  beforeAll(async () => {
    storage = await createRenderTestStorage();
    await seedCard(storage, { id: 200, name: "Decko Bot", dbContent: captured("content") });
    await seedCard(storage, { id: 201, name: "Theme 🚀", dbContent: "body { color: red; }" });
    loader = new ModLoader([{ manifest: cardModFormat }]);
    loader.load();
    bindModLoaderToEngine(storage, loader);
    await loader.installInto(modEngineHost(storage.engine, storage.fetcher));
  });
  afterAll(async () => { loader?.reset(); await storage?.close(); });

  for (const view of ["content", "import", "titled", "unknown", "url"]) {
    it(`${view} matches the committed Ruby capture in CSS and inherited SCSS`, async () => {
      for (const format of ["css", "scss"]) {
        expect(await storage.engine.render("Decko Bot", view, { format })).toBe(captured(view));
      }
    });
  }
  it("comments use card names and Ruby character counts; content delegates to core", async () => {
    expect(await storage.engine.render("Theme 🚀", "unknown", { format: "css" })).toBe(
      "/* ------------------------------- */\n/* - MISSING Style Card: Theme 🚀 - */\n/* ------------------------------- */\n\n",
    );
    expect(await storage.engine.render("Theme 🚀", "import", { format: "css" })).toBe("body { color: red; }");
    expect(await storage.engine.render("Decko Bot", "url", { format: "html" })).not.toBe(captured("url"));
  });
});
