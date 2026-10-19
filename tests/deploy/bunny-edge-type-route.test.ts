// The type/:type route (register-routes A7): engine_routes.rb:23
// `get "type/:type" => "card#read"` — no view, no mark. Ruby's render target
// surprised the register's own suggested fix: load_mark's implicit_mark
// (mark.rb:28-40) finds no card hash and no view that skips the name, so it
// lands on home_mark (mark.rb:42-44, the *home rule || "Home"); the :type
// segment rides uri_fetch_opts' opts[:type] (card_class.rb:128-133), which
// standard_uri_fetch applies ONLY to the new-card fallback. On any deck
// whose home mark exists, Card.fetch resolves the EXISTING home card and
// GET /type/<anything> renders the HOME CARD's page — identical to GET /.
// (The route's one observable type effect needs a deck whose home mark card
// is MISSING: the fallback card is typed by the segment. That shape is a
// named remainder on both hosts — the port answers its standard
// unknown-card page, not typed by the segment.)
//
// The grammar precedence is pinned too: /type/<x> must NOT parse as the
// card "type" in view <x> (the old 422 shape), and bare /type (one segment)
// stays the standard /:mark card arm (engine_routes.rb:19).

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

/** The page shell's minimal seed set plus the home scenario: *home points
 *  at Front (the home-mark test's deck — see
 *  bunny-edge-home-mark.test.ts seedHomeDeck, same ids). */
async function seedTypeRouteDeck(storage: RenderTestStorage): Promise<void> {
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

describe("the type/:type route (A7) — the edge", () => {
  it("parsePath classifies /type/<x> as the typeHome kind, not card 'type' in view <x>; bare /type stays the card arm", () => {
    const typed = parsePath("/type/Style");
    expect("kind" in typed && typed.kind).toBe("typeHome");
    if (!("kind" in typed) || typed.kind !== "typeHome") throw new Error("unreachable");
    expect(typed.typeName).toBe("Style");

    const bare = parsePath("/type");
    expect("kind" in bare ? bare.kind : "card-arm").not.toBe("typeHome");

    // .json is not a format capture on this route (engine_routes.rb:23 has
    // no (.:format)) — the whole segment is the :type param.
    const suffixed = parsePath("/type/Style.json");
    expect("kind" in suffixed && suffixed.kind).toBe("typeHome");
    if (!("kind" in suffixed) || suffixed.kind !== "typeHome") throw new Error("unreachable");
    expect(suffixed.typeName).toBe("Style.json");
  });

  it("GET /type/<x> renders the HOME MARK's page (the *home rule's card), not a 422", async () => {
    const storage = await createRenderTestStorage();
    await seedTypeRouteDeck(storage);
    const res = await handleEngineRequest(edgeGet("/type/Style"), realDeck(storage));
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("<title>Front - Test Site</title>");
    expect(body).toContain("Front body prose");
  });

  it("the query view rides the rewritten arm (view_from_params on every route)", async () => {
    const storage = await createRenderTestStorage();
    await seedTypeRouteDeck(storage);
    const res = await handleEngineRequest(edgeGet("/type/Style?view=content"), realDeck(storage));
    expect(res.status).toBe(200);
    const body = await res.text();
    // The requested view REPLACES the layout's {{_main|titled}} chunk (the
    // requested view IS the root show view, rest.rb:106-109) while the page
    // chrome stays: :content (data.rb:40-42) is the stored content alone —
    // no titled view's card-title header.
    expect(body).toContain("Front body prose");
    expect(body).toContain("<title>Front - Test Site</title>");
    expect(body).not.toContain("card-title");
  });
});
