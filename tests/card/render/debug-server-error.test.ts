// card-mod-format set/all/html/error.rb view :debug_server_error: registered
// on All::Html::Error, and raising what stock Ruby raises. The view body
// names BetterErrors, which a stock deck's bundle never loads, so Ruby
// raises NameError on every card (tools/oracle/debug-server-error-probe.rb:
// the oracle app logs "uninitialized constant
// Card::Set::All::Html::Error::BetterErrors" and renders the quiet span for
// a nest, with or without a current server error).

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defaultDeckLoader } from "../../../src/card/mod-loader/default-mod-deck.js";
import { debugServerErrorView } from "../../../src/card/render/debug-server-error.js";
import { RenderFormat, type ViewContext } from "../../../src/card/render/format.js";
import { bindModLoaderToEngine, createRenderTestStorage, seedCard, type RenderTestStorage } from "./render-test-storage.js";

it("debug_server_error is All::Html::Error's, on every card", () => {
  const chain = defaultDeckLoader().viewChain("ALL TYPE-rich_text SELF-pancake", "debug_server_error");
  expect(chain[0]?.setModule).toBe("All::Html::Error");
});

describe("debug_server_error raises Ruby's NameError", () => {
  it("names the missing BetterErrors constant under the view's set module", () => {
    let raised: unknown;
    try {
      debugServerErrorView({} as ViewContext);
    } catch (e) {
      raised = e;
    }
    expect(raised).toBeInstanceOf(Error);
    expect((raised as Error).constructor.name).toBe("NameError");
    expect((raised as Error).message).toBe("uninitialized constant Card::Set::All::Html::Error::BetterErrors");
  });

  describe("through the render engine", () => {
    let storage: RenderTestStorage;
    beforeAll(async () => {
      storage = await createRenderTestStorage();
      await seedCard(storage, { id: 2, name: "RichText", codename: "basic", typeId: 2 });
      await seedCard(storage, { id: 600, name: "Home", typeId: 2, dbContent: "home text" });
      await seedCard(storage, { id: 601, name: "host", typeId: 2, dbContent: "{{Home|debug_server_error}}" });
      storage.fetcher.installNameEnvironment();
      bindModLoaderToEngine(storage, defaultDeckLoader());
    });
    afterAll(() => storage.close());

    it("a nest renders the quiet error span under production rescue, as the oracle app does", async () => {
      // The page lane's root format: nested raises take the quiet branch
      // (format/error.rb rescue_view), the focal render stays loud.
      await storage.engine.prepareItemForRender("Home");
      const card = await storage.engine.prepareItemForRender("host");
      const html = new RenderFormat(card!, storage.engine, { main: true, nestQuietErrors: true }).renderView("core");
      expect(html).toContain(
        '<span class="render-error alert alert-danger">Error rendering: Home (debug_server_error view)</span>',
      );
    });
  });
});
