// The bad_address wildcard (register-routes A22 + C15): engine_routes.rb:54
// `get *mark => "card#read", view: "bad_address"` — Ruby's glob mark
// carries the whole path (slashes become the junction "+"). The route's
// view applies to a KNOWN card at a wildcard address: the registered
// bad_address VIEW renders with root.error_status = 404 (card-mod-format
// set/all/error.rb:23-26) inside the page chrome. For an UNKNOWN card the
// view gate REPLACES the view — card-1.110.0 lib/card/view/permission.rb
// :33-44 alter_unknown -> lib/card/format/error.rb:17-22 view_for_unknown:
// an unknown MAIN card renders page_view_for_unknown (:new for a viewer
// who may create, :not_found otherwise; the html override at
// card-mod-format error.rb:81-86 adds the 200/404 statuses) — so the
// missing-card case is Ruby's not_found arm, which the port answers with
// its C10-pinned not_found chrome page. (Named remainder: the signed-in
// may-create :new-form arm — Ruby 200 — at wildcard addresses rides the
// single-segment new-card machinery only.) The edge answered the router's
// bare stub ("No route for <path>") for the whole class before this arm.
//
// Ruby truth pinned through the REAL edge request core over the seeded
// deck:
//   - a deep unmatched path answers the not_found chrome page at 404 (the
//     anonymous arm of page_view_for_unknown), not the bare stub;
//   - a KNOWN card at a wildcard address (a junction card seeded as
//     "deep+such+card", requested as /deep/such/card) renders the
//     bad_address view — "404: Bad Address" in the page chrome, status 404;
//   - a path segment failing the hardened decode (a malformed %) keeps the
//     no-route class (a malformed % is a bad request, not a bad address);
//   - an unmatched /api subpath is the same wildcard class in Ruby (no api
//     grammar exists there).

import { describe, expect, it } from "vitest";

import { handleEngineRequest } from "../../deploy/bunny-worker-src/bunny-edge-engine-request.js";
import { parsePath } from "../../deploy/bunny-worker-src/bunny-edge-lineage-worker-surface.js";
import { installDeckNameEnvironment } from "../../src/server/worker-shared-surface.js";
import { ModLoader, modEngineHost } from "../../src/card/mod-loader.js";
import cardModFormat from "../../src/card/mod-loader/mods/card-mod-format.js";
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
  await storage.fetcher.codenames.ensureLoaded();
}

/** The junction a wildcard address names: "deep" + "such" -> "deep+such",
 *  then "deep+such" + "card" -> "deep+such+card". */
async function seedJunctionDeck(storage: RenderTestStorage): Promise<void> {
  await seedCard(storage, { id: 800, name: "deep", typeId: 5 });
  await seedCard(storage, { id: 801, name: "such", typeId: 5 });
  await seedCard(storage, { id: 802, name: "card", typeId: 5 });
  await seedCard(storage, { id: 803, leftId: 800, rightId: 801, typeId: 5 });
  await seedCard(storage, { id: 804, leftId: 803, rightId: 802, typeId: 5 });
}

/** The deck's BOOT step, the one both entries run: the name environment,
 *  with the junction names composed from their sides
 *  (src/server/worker-shared-surface.ts, installDeckNameEnvironment).
 *  Without it a compound name cannot be resolved, and the wildcard
 *  address's KNOWN-card leg cannot be reached at all. */
async function bootDeck(storage: RenderTestStorage): Promise<ModLoader> {
  await installDeckNameEnvironment(storage.counting, storage.fetcher);
  await storage.fetcher.codenames.ensureLoaded();
  const loader = new ModLoader([{ manifest: cardModFormat }]);
  loader.load();
  await loader.installInto(modEngineHost(storage.engine, storage.fetcher));
  return loader;
}

describe("the bad_address wildcard (A22/C15) — the edge", () => {
  it("parsePath classifies the wildcard shapes; decode failures stay the no-route class", () => {
    expect("kind" in parsePath("/no/such/path") ? (parsePath("/no/such/path") as { kind: string }).kind : "").toBe("wildcard");
    expect("kind" in parsePath("/a/b/c/d") ? (parsePath("/a/b/c/d") as { kind: string }).kind : "").toBe("wildcard");
    expect("kind" in parsePath("/card/delete/Front") ? (parsePath("/card/delete/Front") as { kind: string }).kind : "").toBe("wildcard");
    // a malformed % fails the hardened decode -> the no-route class
    expect("kind" in parsePath("/bad%zz") ? (parsePath("/bad%zz") as { kind: string }).kind : "").toBe("notFound");
  });

  it("a deep unmatched path answers the not_found chrome page at 404 (the anonymous arm of page_view_for_unknown)", async () => {
    const storage = await createRenderTestStorage();
    await seedShellDeck(storage);
    const res = await handleEngineRequest(edgeGet("/no/such/path"), realDeck(storage));
    expect(res.status).toBe(404);
    const body = await res.text();
    // the not_found chrome page (the C10 shape), not the router's bare stub
    expect(body).not.toContain("No route for");
    expect(body).toContain("<!DOCTYPE HTML>");
    expect(body).toContain("Could not find");
  });

  // A KNOWN junction card at a wildcard address (/deep/such/card, where
  // "deep+such+card" exists) renders the bad_address view in Ruby AND
  // through this arm: the arm passes the resolved junction name to the
  // render verbatim, and every real boot composes junction names into its
  // lexicon (the staging boot prime; the edge deck boot's name-environment
  // install). The leg was long unpinnable here on the claim that the
  // compound name could not be registered in this harness; that claim was
  // wrong, and the leg below pins it: the harness can run the port's own
  // boot step (installDeckNameEnvironment), and with it the compound name
  // resolves and the arm answers the bad_address view at 404.

  it("a KNOWN junction card at a wildcard address renders the bad_address view at 404", async () => {
    const storage = await createRenderTestStorage();
    await seedShellDeck(storage);
    await seedJunctionDeck(storage);
    const loader = await bootDeck(storage);
    try {
      const res = await handleEngineRequest(edgeGet("/deep/such/card"), realDeck(storage));
      expect(res.status).toBe(404);
      const body = await res.text();
      // The bad_address view, in the page chrome: the pinned locale text
      // ("404: Bad Address", card-mod-format-0.20.0/config/locales/en.yml:3)
      // and NOT the unknown-card arm's not_found page.
      expect(body).toContain("404: Bad Address");
      expect(body).not.toContain("Could not find");
    } finally {
      loader.reset();
      storage.close();
    }
  });

  it("an unmatched /api subpath is the same wildcard class", async () => {
    const storage = await createRenderTestStorage();
    await seedShellDeck(storage);
    const res = await handleEngineRequest(edgeGet("/api/xyz"), realDeck(storage));
    expect(res.status).toBe(404);
    const body = await res.text();
    expect(body).not.toContain("No route for");
    expect(body).toContain("<!DOCTYPE HTML>");
  });

  it("a malformed-% path keeps the router's no-route stub", async () => {
    const storage = await createRenderTestStorage();
    await seedShellDeck(storage);
    const res = await handleEngineRequest(edgeGet("/bad%zz"), realDeck(storage));
    expect(res.status).toBe(404);
    expect(await res.text()).toContain("No route for");
  });
});
