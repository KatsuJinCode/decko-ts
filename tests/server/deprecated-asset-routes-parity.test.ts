// The DEPRECATED asset routes, measured against the PINNED DECK's own route
// table, its own before_action table, and its own card#asset method.
//
// The completeness register's A4 row grades the port on the deck's three
// deprecated asset prefixes. The row's own note pointed at the route table
// without asking the pinned deck what those routes ANSWER, and the answer
// is what a port has to match: a fixed installation-error 404 that needs NO
// deck state, because the pinned controller's before_action table excludes
// the asset action.
//
// fixtures/captured/deprecated-asset-routes-ruby-oracle.json is what
// oracle-capture-deprecated-asset-routes-ruby.rb (tests/server/) recorded by
// EXECUTING the PINNED DECK's own route table, the PINNED DECK's own
// controller file (its before_action table) and the PINNED DECK's own
// card#asset method:
//
//   the routes  decko-0.20.0/config/engine_routes.rb:12-16
//                 %w[assets javascripts jasmine].each do |prefix|
//                   get "#{prefix}/*mark" => "card#asset"
//                 end
//   the method  decko-0.20.0/lib/card_controller/rest.rb:22-27
//                 body = "Decko installation error: missing public directory symlinks"
//                 render body: body, status: 404
//   the table   decko-0.20.0/lib/card_controller.rb:20-25
//                 before_action :setup, except: [:asset]
//                 before_action :authenticate, except: [:asset]
//                 before_action :load_card, except: [:asset]

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DEPRECATED_ASSET_ROUTE_PREFIXES,
  deprecatedAssetStubResponse,
  isDeprecatedAssetRoute,
} from "../../src/server/worker-shared-surface.js";
import { parsePath } from "../../deploy/bunny-worker-src/bunny-edge-lineage-worker-surface.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const ORACLE = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/deprecated-asset-routes-ruby-oracle.json"), "utf8"),
) as {
  routeTableSize: number;
  assetRoutes: Array<{
    verb: string;
    patterns: string[];
    action: string;
    order: number;
  }>;
  beforeActions: Array<{ name: string; only: string[]; except: string[] }>;
  actionsForAsset: string[];
  actionsForRead: string[];
  assetMethod: { rendered: { body: string; status: number } | null; error: string | null };
};

describe("the deprecated asset routes, against the pinned deck gem", () => {
  it("the pinned deck registers three asset routes, in its own order", () => {
    expect(ORACLE.assetRoutes.map((route) => route.patterns[0])).toEqual([
      "assets/*mark",
      "javascripts/*mark",
      "jasmine/*mark",
    ]);
    for (const route of ORACLE.assetRoutes) {
      expect(route.verb).toBe("get");
      expect(route.action).toBe("card#asset");
    }
    // The three asset routes sit right after the two files routes, and
    // BEFORE the standard /:mark(.:format) read route.
    expect(ORACLE.assetRoutes.map((route) => route.order)).toEqual([3, 4, 5]);
    expect(ORACLE.routeTableSize).toBe(29);
  });

  it("the pinned deck's own card#asset method answers a fixed body at 404", () => {
    expect(ORACLE.assetMethod.error).toBeNull();
    expect(ORACLE.assetMethod.rendered).toEqual({
      body: "Decko installation error: missing public directory symlinks",
      status: 404,
    });
  });

  it("the pinned deck runs NO deck-state before_action for the asset action", () => {
    // setup, authenticate and load_card all carry `except: [:asset]`, so the
    // asset answer needs no card, no session and no cache. The read action
    // runs five before_actions.
    expect(ORACLE.actionsForAsset).toEqual([]);
    expect(ORACLE.actionsForRead).toEqual([
      "setup",
      "authenticate",
      "load_mark",
      "load_card",
      "load_action",
    ]);
    const setup = ORACLE.beforeActions.find((entry) => entry.name === "setup")!;
    expect(setup.except).toEqual(["asset"]);
  });

  it("the port answers the three prefixes with the same fixed body at 404", async () => {
    for (const prefix of DEPRECATED_ASSET_ROUTE_PREFIXES) {
      expect(isDeprecatedAssetRoute([prefix, "logo.css"])).toBe(true);
      const response = deprecatedAssetStubResponse();
      expect(response.status).toBe(404);
      expect(await response.text()).toBe(
        "Decko installation error: missing public directory symlinks",
      );
      expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    }
    expect([...DEPRECATED_ASSET_ROUTE_PREFIXES]).toEqual(
      ORACLE.assetRoutes.map((route) => route.patterns[0]!.replace("/*mark", "")),
    );
  });

  it("the port's grammar routes the prefixes to the asset stub", () => {
    for (const prefix of DEPRECATED_ASSET_ROUTE_PREFIXES) {
      expect(parsePath(`/${prefix}/logo.css`)).toEqual({ kind: "assetStub" });
    }
  });

  it("and the bare prefix stays the standard card arm, as the pinned glob does", () => {
    // The pinned route is "<prefix>/*mark": the glob needs a segment after
    // the prefix. "/assets" alone is the standard /:mark arm - the card
    // named "assets".
    expect(isDeprecatedAssetRoute(["assets"])).toBe(false);
    expect(parsePath("/assets")).toMatchObject({ name: "assets", view: "open" });
  });
});
