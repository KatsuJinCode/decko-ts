import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ModLoader, modEngineHost } from "../../../src/card/mod-loader.js";
import cardModFormat from "../../../src/card/mod-loader/mods/card-mod-format.js";
import { bindModLoaderToEngine, createRenderTestStorage, seedCard, type RenderTestStorage } from "../render/render-test-storage.js";

const oracle = readFileSync(new URL("../../../reference-harness/fixtures/synthetic-v2-mod-probes/expected/render.jsonl", import.meta.url), "utf8")
  .trim().split("\n").map(line => JSON.parse(line)) as Array<{ id: string; result: { html: string } }>;
const captured = (view: string) => oracle.find(row => row.id.endsWith(`:${view}@set/all/rss.rb`))!.result.html;

describe("RSS non-XML views (stock Ruby card-mod-format set/all/rss.rb)", () => {
  let storage: RenderTestStorage;
  let loader: ModLoader;
  beforeAll(async () => {
    storage = await createRenderTestStorage();
    await seedCard(storage, { id: 200, name: "Decko Bot", dbContent: captured("content") });
    await seedCard(storage, { id: 201, name: "*title", codename: "title", dbContent: "My Deck" });
    await seedCard(storage, { id: 202, name: "*Probe", codename: "probe", dbContent: "authored content" });
    loader = new ModLoader([
      { manifest: cardModFormat },
      { manifest: { name: "rss-probe", setModules: [{
        setPath: "self/probe", formats: { rss: { views: [{ view: "core", viewFn: () => "custom core" }] } },
      }] } },
    ]);
    loader.load();
    bindModLoaderToEngine(storage, loader);
    await loader.installInto(modEngineHost(storage.engine, storage.fetcher));
  });
  afterAll(async () => { loader?.reset(); await storage?.close(); });

  for (const view of ["closed", "comment_box", "content", "feed_description", "feed_item_description", "feed_title", "menu", "open_content", "open"]) {
    it(`${view} matches the stock Ruby capture`, async () => {
      expect(await storage.engine.render("Decko Bot", view, { format: "rss" })).toBe(captured(view));
    });
  }
  it("aliases retain the captured base block but titled open dispatches the overridden core", async () => {
    expect(await storage.engine.render("*Probe", "core", { format: "rss" })).toBe("custom core");
    expect(await storage.engine.render("*Probe", "content", { format: "rss" })).toBe("authored content");
    expect(await storage.engine.render("*Probe", "open_content", { format: "rss" })).toBe("authored content");
    expect(await storage.engine.render("*Probe", "feed_item_description", { format: "rss" })).toBe("authored content");
    expect(await storage.engine.render("*Probe", "open", { format: "rss" })).toBe("*Probe\n\ncustom core");
    expect(await storage.engine.render("*Probe", "feed_title", { format: "rss" })).toBe("My Deck : Probe");
  });
});
