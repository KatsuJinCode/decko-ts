// The card#asset method, measured against the PINNED DECK's own method.
//
// The completeness register's B5 row grades the port on `card#asset`
// (rest.rb:22-27, the deprecated 404 + symlink message). The row's note
// named the method and the 404; this capture measures the method itself,
// including the statement the row's note left out - the log line that
// carries the symlink hint - and the routes that dispatch to it.
//
// fixtures/captured/card-asset-action-ruby-oracle.json is what
// oracle-capture-card-asset-action-ruby.rb (tests/server/) recorded by
// EXECUTING the PINNED DECK's own card#asset method over a recording
// logger and a recording render:
//
//   the method  decko-0.20.0/lib/card_controller/rest.rb:22-27
//                 # @deprecated
//                 def asset
//                   body = "Decko installation error: missing public directory symlinks"
//                   Rails.logger.info "#{body}.\n  >>> Try `rake card:mod:symlink`"
//                   render body: body, status: 404
//                 end
//   the routes  engine_routes.rb:14-16 (the deprecated prefixes) and
//               engine_routes.rb:41-43 (the (card)/asset action route)
//   the table   decko-0.20.0/lib/card_controller.rb:20-23
//                 before_action :setup, except: [:asset]
//                 before_action :authenticate, except: [:asset]
//                 before_action :load_card, except: [:asset]

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { deprecatedAssetStubResponse } from "../../src/server/worker-shared-surface.js";
import { parsePath } from "../../deploy/bunny-worker-src/bunny-edge-lineage-worker-surface.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const ORACLE = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/card-asset-action-ruby-oracle.json"), "utf8"),
) as {
  routeTableSize: number;
  assetMethod: {
    rendered: { body: string; status: number } | null;
    error: string | null;
    logged: string[];
    source: Array<{ line: number; text: string }>;
  };
  assetRoutes: Array<{ patterns: string[]; action: string; order: number }>;
  assetActionRoute: { patterns: string[]; requirements: Record<string, string>; order: number } | null;
  actionsForAsset: string[];
};

// The PINNED deck's route table, RECOGNIZED by the PINNED actionpack's own
// matcher (fixtures/captured/rails-route-recognition-ruby-oracle.json).
const ROUTE_RECOGNITION = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/rails-route-recognition-ruby-oracle.json"), "utf8"),
) as {
  routeTableSize: number;
  recognitions: Array<{
    verb: string;
    path: string;
    matched: boolean;
    routeOrder: number | null;
    routeSpec: string | null;
    params: Record<string, string> | null;
  }>;
};

function RECOGNITION(pathname: string, verb = "GET") {
  const row = ROUTE_RECOGNITION.recognitions.find(
    (entry) => entry.path === pathname && entry.verb === verb,
  );
  if (row === undefined) throw new Error(`no recognition recorded for ${verb} ${pathname}`);
  return row;
}

describe("the card#asset method, against the pinned deck gem", () => {
  it("the pinned deck's own method renders the fixed body at 404", () => {
    expect(ORACLE.assetMethod.error).toBeNull();
    expect(ORACLE.assetMethod.rendered).toEqual({
      body: "Decko installation error: missing public directory symlinks",
      status: 404,
    });
  });

  it("and the method logs the symlink hint before it renders", () => {
    // The pinned method's second statement. It is not HTTP-visible, but it
    // is the method's behaviour, and the row's note left it out.
    expect(ORACLE.assetMethod.logged).toEqual([
      "Decko installation error: missing public directory symlinks.\n  >>> Try `rake card:mod:symlink`",
    ]);
    const deprecated = ORACLE.assetMethod.source.find((row) => row.text.includes("@deprecated"));
    expect(deprecated).toBeDefined();
  });

  it("the asset action runs no before_action, so the answer needs no deck state", () => {
    expect(ORACLE.actionsForAsset).toEqual([]);
  });

  it("four routes dispatch to it: the three deprecated prefixes and the asset action", () => {
    expect(ORACLE.assetRoutes.map((route) => route.patterns[0])).toEqual([
      "assets/*mark",
      "javascripts/*mark",
      "jasmine/*mark",
    ]);
    for (const route of ORACLE.assetRoutes) expect(route.action).toBe("card#asset");
    expect(ORACLE.assetActionRoute!.patterns).toEqual(["(card)/asset(/:mark(.:format))"]);
    expect(ORACLE.assetActionRoute!.requirements.action).toBe("asset");
    expect(ORACLE.routeTableSize).toBe(29);
  });

  it("the port answers the same body at the same status", async () => {
    const response = deprecatedAssetStubResponse();
    expect(response.status).toBe(404);
    expect(await response.text()).toBe(
      "Decko installation error: missing public directory symlinks",
    );
    expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
  });

  it("the port's grammar routes every asset spelling to the stub", () => {
    // The card#asset ACTION arm (engine_routes.rb:41-43) sits at table
    // order 23, but the :mark(.:format) arm sits at order 6 and comes
    // FIRST, so the one-segment "/asset" is the card named "asset" and not
    // the action. The executed PINNED matcher says so
    // (fixtures/captured/rails-route-recognition-ruby-oracle.json, the case
    // "GET /asset": the card "asset" on route 6), and the "/asset/<mark>"
    // spelling is the action.
    expect(parsePath("/asset/Front")).toEqual({ kind: "assetStub" });
    expect(parsePath("/card/asset")).toEqual({ kind: "assetStub" });
    expect(parsePath("/assets/logo.css")).toEqual({ kind: "assetStub" });
    expect(parsePath("/javascripts/application.js")).toEqual({ kind: "assetStub" });
    expect(parsePath("/jasmine/spec.js")).toEqual({ kind: "assetStub" });
  });

  it("the EXECUTED PINNED matcher routes every asset spelling to card#asset", () => {
    // The capture above stands the pinned method up over a recording
    // double; the executed PINNED matcher routes the request itself
    // (fixtures/captured/rails-route-recognition-ruby-oracle.json). Each
    // asset spelling lands on a real route of the pinned table, and every
    // one of them answers the asset ACTION.
    const asset = RECOGNITION("/assets/a/b");
    expect(asset.matched).toBe(true);
    expect(asset.routeOrder).toBe(3);
    expect(asset.params).toMatchObject({ action: "asset", mark: "a/b" });
    expect(RECOGNITION("/javascripts/x/y")!.routeOrder).toBe(4);
    expect(RECOGNITION("/jasmine/specs/x_spec")!.routeOrder).toBe(5);
    expect(RECOGNITION("/card/asset")!.routeOrder).toBe(23);
    expect(RECOGNITION("/card/asset")!.params).toMatchObject({ action: "asset" });
    // Round five's instrument cases: the MARKED spellings too. The
    // two-segment and three-segment marked shapes reach the asset action
    // arm (order 23) with the mark in params, and the .:format suffix
    // rides the mark segment - the action reads no format, so the answer
    // is the same fixed body at 404 for the suffixed shape as well.
    expect(RECOGNITION("/asset/Front")!.routeOrder).toBe(23);
    expect(RECOGNITION("/asset/Front")!.params).toMatchObject({ action: "asset", mark: "Front" });
    expect(RECOGNITION("/card/asset/Front")!.routeOrder).toBe(23);
    expect(RECOGNITION("/card/asset/Front")!.params).toMatchObject({ action: "asset", mark: "Front" });
    expect(RECOGNITION("/card/asset/Front.json")!.routeOrder).toBe(23);
    expect(RECOGNITION("/card/asset/Front.json")!.params).toMatchObject({
      action: "asset", mark: "Front", format: "json",
    });
    // The port's grammar answers the same set with the same stub.
    expect(parsePath("/asset/Front")).toEqual({ kind: "assetStub" });
    expect(parsePath("/card/asset/Front")).toEqual({ kind: "assetStub" });
    expect(parsePath("/card/asset/Front.json")).toEqual({ kind: "assetStub" });
  });

  it("NAMED DIVERGENCE: the port's stub does not log the symlink hint", () => {
    // The pinned method logs the body plus the symlink hint before it
    // renders; the port's shared stub answers the same body and status and
    // logs nothing (grep for the hint over src/ and deploy/ finds no such
    // line). The log line is not HTTP-visible, so the row's answer - the
    // body and the status - matches, and the log difference is named here
    // rather than invented into the port.
    expect(ORACLE.assetMethod.logged[0]).toContain("rake card:mod:symlink");
  });
});
