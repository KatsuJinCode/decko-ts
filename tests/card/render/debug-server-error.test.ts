// card-mod-format set/all/html/error.rb: the html :server_error view and
// :debug_server_error, both registered on All::Html::Error.
//
// DELIBERATE DIFFERENCE pinned here. Stock Ruby cannot render
// :debug_server_error: its body names BetterErrors, which a deck built from
// its generated Gemfile never loads, so it raises "NameError: uninitialized
// constant Card::Set::All::Html::Error::BetterErrors" on every card
// (tools/oracle/debug-server-error-probe.rb). The port copies neither the
// crash nor the BetterErrors page (source, locals, backtrace, console): it
// renders :server_error, the "Wild Card!" block a production visitor sees.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defaultDeckLoader } from "../../../src/card/mod-loader/default-mod-deck.js";
import { SERVER_ERROR_HTML } from "../../../src/card/render/debug-server-error.js";
import { RenderFormat } from "../../../src/card/render/format.js";
import { bindModLoaderToEngine, createRenderTestStorage, seedCard, type RenderTestStorage } from "./render-test-storage.js";

/** set/all/html/server_error.haml as the live site serves it. */
const WILD_CARD =
  "<div class='border border-danger text-center p-3'>\n" +
  "<h1>Wild Card!</h1>\n" +
  "<h2 class='alert-danger'>500 Server Error</h2>\n" +
  "<h4 class='p-3'>\n" +
  "Yuck, sorry about that.\n" +
  "</h4>\n" +
  "</div>\n";

it("server_error and debug_server_error are All::Html::Error's, on every card", () => {
  const loader = defaultDeckLoader();
  for (const view of ["server_error", "debug_server_error"]) {
    expect(loader.viewChain("ALL TYPE-rich_text SELF-pancake", view)[0]?.setModule).toBe("All::Html::Error");
  }
  expect(SERVER_ERROR_HTML).toBe(WILD_CARD);
});

describe("debug_server_error renders the production server_error view", () => {
  let storage: RenderTestStorage;
  beforeAll(async () => {
    storage = await createRenderTestStorage();
    await seedCard(storage, { id: 2, name: "RichText", codename: "basic", typeId: 2 });
    await seedCard(storage, { id: 600, name: "Home", typeId: 2, dbContent: "home text" });
    await seedCard(storage, { id: 601, name: "host", typeId: 2, dbContent: "[{{Home|debug_server_error}}]" });
    storage.fetcher.installNameEnvironment();
    bindModLoaderToEngine(storage, defaultDeckLoader());
  });
  afterAll(() => storage.close());

  it("the focal render gives the Wild Card block, not a raise", async () => {
    expect(await storage.engine.render("Home", "server_error")).toBe(WILD_CARD);
    expect(await storage.engine.render("Home", "debug_server_error")).toBe(WILD_CARD);
  });

  it("a nest gives the same block, not the render-error span", async () => {
    await storage.engine.prepareItemForRender("Home");
    const card = await storage.engine.prepareItemForRender("host");
    const html = new RenderFormat(card!, storage.engine, { main: true, nestQuietErrors: true }).renderView("core");
    expect(html).toBe(`[${WILD_CARD}]`);
  });

  it("reveals nothing about the card, the error or the code", async () => {
    const html = await storage.engine.render("Home", "debug_server_error");
    for (const internal of ["Home", "BetterErrors", "NameError", "backtrace", "frame", ".ts", "<script", "<pre"]) {
      expect(html).not.toContain(internal);
    }
  });
});
