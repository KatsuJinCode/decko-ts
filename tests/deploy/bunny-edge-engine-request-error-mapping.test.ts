// The Bunny edge engine request core's render-error mapping
// (deploy/bunny-worker-src/bunny-edge-engine-request.ts,
// handleEngineRequest's catch): a missing card is a 404 "Card not found"
// page, an unsupported view stays a 422 "Unsupported view" page, anything
// else stays a 500 "Render error" page.
//
// The 404 is the 2026-10-02 lane fix: the entry's catch previously mapped
// only "view ("-prefixed errors to 422 and fell through to 500 for
// everything else, so a GET of a missing card answered 500 — while Ruby
// answers 404 for a missing card and the CF worker's render path maps the
// same message to 404 (deploy/worker.ts:462-466).
//
// Driven through the REAL handler: the 404 case runs the production
// RenderEngine + FetchEngine over an in-memory sqlite deck, so the pin
// covers the real throw site (src/card/render.ts:706-708) through the catch
// to the response, not just the status arithmetic. The 422/500 cases stub
// only the engine's throw (message shapes: UnsupportedViewError's, cited at
// src/card/render.ts:18, and a plain error) because the mapping input is
// the message and the real triggers are engine-internal.
//
// NOT pinned here: the entry shell's serve callback (env + getDeck feeding
// this handler) — it needs the Bunny Hrana socket; the split keeps it
// type-checked via tsc and the live deploy.

import { describe, expect, it } from "vitest";

import { handleEngineRequest } from "../../deploy/bunny-worker-src/bunny-edge-engine-request.js";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../card/render/render-test-storage.js";
import type { RenderEngine } from "../../src/card/render.js";

function edgeGet(pathname: string): Request {
  return new Request(`https://script-placeholder.bunny.run${pathname}`);
}

/** The entry's deck shape, real engines over the in-memory sqlite deck. */
function realDeck(storage: RenderTestStorage) {
  return { fetcher: storage.fetcher, render: storage.engine };
}

/** A deck whose page entry throws the given error; used only where the
 *  thing under test is the mapping of a MESSAGE, not the engine. Since the
 *  edge-site-shell lane (2026-10-02) the 200-path's render entry is
 *  renderPageBytes, whose first statement wraps the page assembly in
 *  engine.runWithPageConfig — so the stub throws there and the error
 *  surfaces through the same catch unchanged. */
function deckWhoseRenderThrows(storage: RenderTestStorage, error: unknown) {
  return {
    fetcher: storage.fetcher,
    render: {
      runWithPageConfig: async () => {
        throw error;
      },
    } as unknown as RenderEngine,
  };
}

/** The full page-shell seed set: the read-rule parties, the codename cards
 *  the page head reads (*title, *favicon, :ace, :tiny_mce), and the card
 *  layout the page resolves (*all+*layout -> Default Layout with its
 *  :header/:footer nests) — the same minimal shell boot
 *  tests/deploy/bunny-edge-page-shell.test.ts pins. Both storages in this
 *  file seed THESE ids so the process-global name environment (first
 *  FetchEngine wins, fetch.ts:155-175) and every later deck agree. */
async function seedShellHeadDeck(storage: RenderTestStorage): Promise<void> {
  await seedCard(storage, { id: 8, name: "csvqdo", codename: "anyone", typeId: 2 });
  await seedCard(storage, { id: 15, name: "tkmbewlur", codename: "anonymous", typeId: 2 });
  await seedCard(storage, { id: 55, name: "*title", codename: "title", typeId: 52, dbContent: "Test Site" });
  await seedCard(storage, { id: 103, name: "*favicon", codename: "favicon", typeId: 19, dbContent: "(my_bucket)/103/3649.jpg" });
  await seedCard(storage, { id: 400, name: "*ace", codename: "ace", typeId: 52, dbContent: "{}" });
  await seedCard(storage, { id: 401, name: "*tiny_mce", codename: "tiny_mce", typeId: 52, dbContent: "{}" });
  await seedCard(storage, { id: 50, name: "Html", codename: "html", typeId: 5 });
  await seedCard(storage, { id: 2, name: "Basic", codename: "basic", typeId: 5 });
  await seedCard(storage, { id: 600, name: "*all", codename: "all", typeId: 52 });
  await seedCard(storage, { id: 601, name: "*layout", codename: "layout", typeId: 52 });
  await seedCard(storage, { id: 22746, name: "*all+*layout", leftId: 600, rightId: 601, typeId: 52, dbContent: "Default Layout" });
  await seedCard(storage, { id: 22747, name: "Default Layout", typeId: 50, dbContent: `<body class="d-flex flex-column h-100">\n  <header>{{:header|core}}</header>\n  <article class="container flex-shrink-0" role="main">{{_main|titled}}</article>\n  <footer class="footer mt-auto py-3">{{:footer|content}}</footer>\n</body>` });
  await seedCard(storage, { id: 22748, name: "*header", codename: "header", typeId: 50, dbContent: `<nav class="navbar navbar-expand-lg"><a class="navbar-brand" href="/">Site</a></nav>` });
  await seedCard(storage, { id: 22749, name: "*footer", codename: "footer", typeId: 50, dbContent: `<footer class="footer mt-auto py-3"><a href="/:latest">Decko v</a></footer>` });
}

describe("bunny edge engine request — render error mapping", () => {
  it("GET a missing card is a 404 Decko not_found page in the full chrome, not a 500", async () => {
    const storage = await createRenderTestStorage();
    try {
      // The FULL shell seed set, not just the rule parties: the DeckoName
      // name environment is PROCESS-GLOBAL and installed by the FIRST
      // FetchEngine constructed in the file (src/card/fetch.ts:155-175,
      // "First engine wins"), its codename adapter peeking THAT engine's
      // codehash memo — so the first storage in the file must carry every
      // codename the page path parses, or a later storage's page render
      // 500s on the global map's gaps. The same rows seed the 200 test
      // below (identical ids), keeping the two decks consistent.
      await seedShellHeadDeck(storage);
      // Load THIS engine's codehash memo explicitly: the missing-card 404
      // throws before the render's codehash fold would run, and the
      // process-global name environment peeks exactly this memo — without
      // the load, the later storage's codename-mark parses see an empty map.
      await storage.fetcher.codenames.ensureLoaded();
      const res = await handleEngineRequest(edgeGet("/NoSuchCard"), realDeck(storage));
      expect(res.status).toBe(404);
      const body = await res.text();
      // p2-error-shell lane (2026-10-03): the 404 body is the staging
      // host's full-chrome not_found page (bunny-edge-error-page.ts) —
      // the bare-shell assertions this pin carried before (<h1>Card not
      // found</h1> + the raw "card not found:" message) are superseded by
      // the not_found slot bytes; the escape invariant moved to
      // tests/deploy/bunny-edge-error-page.test.ts's crafted-name case.
      expect(body).toContain("<title>NoSuchCard - Test Site</title>");
      expect(body).toContain("<meta content='noindex' name='robots'>");
      expect(body).toContain(`<span class="card-title" title="Not Found">Not Found</span>`);
      expect(body).toContain("Could not find\n<em>\nNoSuchCard\n</em>");
    } finally {
      storage.close();
    }
  });

  it("an unsupported view stays a 422 Unsupported-view page", async () => {
    const storage = await createRenderTestStorage();
    try {
      const deck = deckWhoseRenderThrows(
        storage,
        new Error("view (nosuch) not supported for Home"),
      );
      const res = await handleEngineRequest(edgeGet("/Home"), deck);
      expect(res.status).toBe(422);
      expect(await res.text()).toContain("<h1>Unsupported view</h1>");
    } finally {
      storage.close();
    }
  });

  it("any other render failure stays a 500 Render-error page", async () => {
    const storage = await createRenderTestStorage();
    try {
      const deck = deckWhoseRenderThrows(storage, new Error("engine exploded"));
      const res = await handleEngineRequest(edgeGet("/Home"), deck);
      expect(res.status).toBe(500);
      expect(await res.text()).toContain("<h1>Render error</h1>");
    } finally {
      storage.close();
    }
  });

  it("a present card still renders 200 through the same handler", async () => {
    const storage = await createRenderTestStorage();
    try {
      // The page path is the engine's show_with_page_layout assembly
      // (edge-site-shell lane, 2026-10-02); its head reads are codename-mark
      // fetches, so the deck carries the full shell seed set — the SAME ids
      // the 404 test's (first) storage seeded, keeping the process-global
      // name environment consistent across the file.
      await seedShellHeadDeck(storage);
      await seedCard(storage, { id: 100, name: "Home", typeId: 2, dbContent: "hello" });
      const res = await handleEngineRequest(edgeGet("/Home"), realDeck(storage));
      expect(res.status).toBe(200);
      expect(await res.text()).toContain("hello");
    } finally {
      storage.close();
    }
  });
});
