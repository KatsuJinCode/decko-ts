// The card/:view legacy route's edit arm (register-routes A9):
// engine_routes.rb:25 `get "card/:view(/:mark(.:format))" => "card#read",
// view: /new|edit/`. Staging has served both allowed views since the
// register's pass (vm-staging-server.mjs's card/:view arm); the edge
// carried only card/new, so GET /card/edit/<mark> fell to the no-route
// 404. The arm is a plain card route to card#read in the :edit view —
// byte-equal (modulo the per-render slot nonce) to /<mark>?view=edit,
// which is the parity pin used here through the REAL request core.
//
// Also pinned: a 3-segment card/<other-view>/<mark> shape (view outside
// the /new|edit/ constraint) does NOT become a card route — Ruby's
// constraint fails and the path falls through toward the wildcard
// (engine_routes.rb:54); the edge answers its no-route class.

import { describe, expect, it } from "vitest";

import { handleEngineRequest } from "../../deploy/bunny-worker-src/bunny-edge-engine-request.js";
import { parsePath } from "../../deploy/bunny-worker-src/bunny-edge-lineage-worker-surface.js";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../card/render/render-test-storage.js";
import { CONFIGURED_DECK_SERVED_DELTAS } from "./fixtures/configured-deck-served-deltas.js";

function edgeGet(pathname: string): Request {
  return new Request(`https://script-placeholder.bunny.run${pathname}`);
}

function realDeck(storage: RenderTestStorage) {
  return {
    fetcher: storage.fetcher,
    render: storage.engine,
    servedDeltas: CONFIGURED_DECK_SERVED_DELTAS,
  };
}

async function seedShellDeck(storage: RenderTestStorage): Promise<void> {
  await seedCard(storage, { id: 8, name: "kmrtqd", codename: "anyone", typeId: 2 });
  await seedCard(storage, { id: 15, name: "vqhrbnl", codename: "anonymous", typeId: 2 });
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
  await seedCard(storage, { id: 31001, name: "Front", typeId: 2, dbContent: "Front body prose" });
  await storage.fetcher.codenames.ensureLoaded();
}

function withoutSlotNonce(html: string): string {
  return html.replace(/data-slot-id=(["'])[0-9a-f]+\1/g, 'data-slot-id="<nonce>"');
}

describe("the card/edit route arm (A9) — the edge", () => {
  it("parsePath classifies /card/edit/<mark> as a card route in the :edit view", () => {
    const parsed = parsePath("/card/edit/Front");
    expect("kind" in parsed ? parsed.kind : "card").not.toBe("notFound");
    if ("kind" in parsed) throw new Error("expected a card route");
    expect(parsed.name).toBe("Front");
    expect(parsed.view).toBe("edit");
  });

  it("GET /card/edit/<mark> is byte-equal (modulo slot nonce) to GET /<mark>?view=edit", async () => {
    const storage = await createRenderTestStorage();
    await seedShellDeck(storage);
    const viaRoute = await handleEngineRequest(edgeGet("/card/edit/Front"), realDeck(storage));
    const viaQuery = await handleEngineRequest(edgeGet("/Front?view=edit"), realDeck(storage));
    expect(viaRoute.status).toBe(viaQuery.status);
    expect(withoutSlotNonce(await viaRoute.text())).toBe(withoutSlotNonce(await viaQuery.text()));
  });

  it("card/<view-outside-the-constraint>/<mark> stays the no-route class", async () => {
    const storage = await createRenderTestStorage();
    await seedShellDeck(storage);
    const res = await handleEngineRequest(edgeGet("/card/titled/Front"), realDeck(storage));
    // The route constraint (view /new|edit/) fails; Ruby falls through to
    // the wildcard — the edge's no-route 404 (the bad_address wildcard
    // render is register row A22/C15's arm, not this one).
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain("Front body prose");
  });
});
