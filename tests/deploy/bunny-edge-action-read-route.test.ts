// The GET action-route alternatives' read and asset halves (register-routes
// A17): engine_routes.rb:41-43
// `%w[create read update delete asset].each { get "(card)/#{action}(/:mark)"
// => "card", action: action }` — Ruby's table puts them ABOVE :mark/:view,
// so /read/<mark> is card#read OF <mark> (show(nil): no view default, the
// ?view= query applies), the markless /read and /card/read resolve the
// implicit mark (the home-mark page), and every /asset spelling is
// card#asset's fixed installation-error 404.
//
// The CREATE and DELETE halves are NOT admitted: in Ruby they are
// state-changing GETs (a plain link click saves or deletes a card). The
// port's recorded hardening (the C16 posture — same-origin-XHR-only GET
// mutations, the write-routes.ts:62-76 receipt) keeps them off the
// plain-link surface. Pinned here as a NAMED DIVERGENCE: GET /create/<new>
// must not create, GET /delete/<mark> must not trash.

import { describe, expect, it } from "vitest";

import { handleEngineRequest } from "../../deploy/bunny-worker-src/bunny-edge-engine-request.js";
import { parsePath } from "../../deploy/bunny-worker-src/bunny-edge-lineage-worker-surface.js";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../card/render/render-test-storage.js";
import { CONFIGURED_DECK_SERVED_DELTAS } from "./fixtures/configured-deck-served-deltas.js";

const ASSET_STUB_BODY = "Decko installation error: missing public directory symlinks";

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

async function seedActionDeck(storage: RenderTestStorage): Promise<void> {
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
  await seedCard(storage, { id: 31002, name: "*home", codename: "home", typeId: 52, dbContent: "Front" });
  await storage.fetcher.codenames.ensureLoaded();
}

function withoutSlotNonce(html: string): string {
  return html.replace(/data-slot-id=(["'])[0-9a-f]+\1/g, 'data-slot-id="<nonce>"');
}

describe("the GET action routes' read and asset halves (A17) — the edge", () => {
  it("parsePath classifies the read/asset action shapes", () => {
    expect("kind" in parsePath("/read/Front") ? (parsePath("/read/Front") as { kind: string }).kind : "").toBe("actionRead");
    const cardRead = parsePath("/card/read/Front");
    expect("kind" in cardRead && cardRead.kind).toBe("actionRead");
    const cardMarkless = parsePath("/card/read");
    expect("kind" in cardMarkless && cardMarkless.kind).toBe("actionRead");
    expect("kind" in parsePath("/asset/Front") ? (parsePath("/asset/Front") as { kind: string }).kind : "").toBe("assetStub");
    expect("kind" in parsePath("/card/asset") ? (parsePath("/card/asset") as { kind: string }).kind : "").toBe("assetStub");
    expect("kind" in parsePath("/card/asset/x") ? (parsePath("/card/asset/x") as { kind: string }).kind : "").toBe("assetStub");
  });

  it("the MARKLESS one-segment spellings are the card, not the action", () => {
    // The action arm sits at table order 20, but the :mark(.:format) arm
    // sits at order 6 and comes FIRST, so "/read" and "/asset" are the
    // cards named "read" and "asset". The executed PINNED matcher says so
    // (fixtures/captured/rails-route-recognition-ruby-oracle.json: "GET
    // /read" answers the card "read" on route 6, and only "GET /read/Front"
    // reaches the action arm).
    expect(parsePath("/read")).toEqual({ name: "read", view: "open" });
    expect(parsePath("/asset")).toEqual({ name: "asset", view: "open" });
  });

  it("GET /read/<mark> is byte-equal (modulo slot nonce) to GET /<mark>", async () => {
    const storage = await createRenderTestStorage();
    await seedActionDeck(storage);
    const viaAction = await handleEngineRequest(edgeGet("/read/Front"), realDeck(storage));
    const viaBare = await handleEngineRequest(edgeGet("/Front"), realDeck(storage));
    expect(viaAction.status).toBe(200);
    expect(withoutSlotNonce(await viaAction.text())).toBe(withoutSlotNonce(await viaBare.text()));
  });

  it("GET /card/read/<mark> renders THAT card, not the home card", async () => {
    // The (card) group is OPTIONAL in the pinned route (engine_routes.rb:42
    // `get "(card)/#{action}(/:mark(.:format))"`), so /card/read/<mark>
    // carries the mark in the THIRD segment. Reading the second would
    // answer the card "read" instead of <mark> - and, on this deck, the
    // home card, which is a different card.
    const storage = await createRenderTestStorage();
    await seedActionDeck(storage);
    await seedCard(storage, { id: 31003, name: "Back", typeId: 2, dbContent: "Back body prose" });
    const viaAction = await handleEngineRequest(edgeGet("/card/read/Back"), realDeck(storage));
    const viaBare = await handleEngineRequest(edgeGet("/Back"), realDeck(storage));
    expect(viaAction.status).toBe(200);
    const actionBody = await viaAction.text();
    expect(actionBody).toContain("Back body prose");
    expect(actionBody).not.toContain("Front body prose");
    expect(withoutSlotNonce(actionBody)).toBe(withoutSlotNonce(await viaBare.text()));
  });

  it("GET /read (markless) is the card named read, so a deck without one answers NotFound", async () => {
    // The pinned deck reads the card named "read" here (route 6, the
    // :mark(.:format) arm, which comes before the action arm), so the
    // answer is that card's page - and a deck with no card named "read"
    // answers NotFound, not the home card's page.
    const storage = await createRenderTestStorage();
    await seedActionDeck(storage);
    const res = await handleEngineRequest(edgeGet("/read"), realDeck(storage));
    expect(res.status).toBe(404);
    expect((await res.text())).not.toContain("Front body prose");
  });

  it("GET /card/read (markless) renders the *home rule's card; the query view applies", async () => {
    // The markless "/card/read" DOES reach the action arm in the pinned
    // deck (the (card) group carries the literal), so its mark is the
    // implicit one: the home card's page.
    const storage = await createRenderTestStorage();
    await seedActionDeck(storage);
    const res = await handleEngineRequest(edgeGet("/card/read"), realDeck(storage));
    expect(res.status).toBe(200);
    expect((await res.text())).toContain("Front body prose");

    const contentView = await handleEngineRequest(edgeGet("/read/Front?view=content"), realDeck(storage));
    expect(contentView.status).toBe(200);
    const body = await contentView.text();
    expect(body).toContain("Front body prose");
    expect(body).not.toContain("card-title");
  });

  it("every /asset ACTION spelling answers card#asset's fixed installation-error 404", async () => {
    const storage = await createRenderTestStorage();
    await seedActionDeck(storage);
    for (const path of ["/asset/Front", "/card/asset", "/card/asset/Front"]) {
      const res = await handleEngineRequest(edgeGet(path), realDeck(storage));
      expect(res.status, path).toBe(404);
      expect(await res.text(), path).toBe(ASSET_STUB_BODY);
    }
    // The one-segment "/asset" is the card named "asset", not the action.
    const bare = await handleEngineRequest(edgeGet("/asset"), realDeck(storage));
    expect(bare.status).toBe(404);
    expect(await bare.text()).not.toBe(ASSET_STUB_BODY);
  });

  it("the create/delete halves stay unadmitted: GET /create mints nothing, GET /delete trashes nothing", async () => {
    const storage = await createRenderTestStorage();
    await seedActionDeck(storage);
    const createRes = await handleEngineRequest(edgeGet("/create/Minted17"), realDeck(storage));
    expect(createRes.status).not.toBe(303);
    const minted = await storage.fetcher.fetchByName("Minted17");
    expect(minted).toBeUndefined();

    const deleteRes = await handleEngineRequest(edgeGet("/delete/Front"), realDeck(storage));
    expect(deleteRes.status).not.toBe(303);
    const front = await storage.fetcher.fetchByName("Front");
    expect(front).toBeDefined();
  });
});
