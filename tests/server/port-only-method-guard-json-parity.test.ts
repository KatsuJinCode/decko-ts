// The method guards: the staging server's 405 JSON and the unarmed edge's
// 403 JSON ([Family] row E13), measured against the PINNED deck's own
// route table (through the PINNED router) and against the PORT's own
// guards.
//
// The register's E13 row grades the port's two method guards and calls them
// a "port-only route (no Ruby counterpart)", on the basis that "the
// register names the host(s) and the file:line in the port that serves it,
// so there is no Ruby behaviour it could fail to match". This file
// MEASURES that basis.
//
// WHAT THE MEASUREMENT SETTLES:
//
//   1. THE PINNED DECK HAS NO 405 AND NO READ-ONLY EDGE. For a request the
//      pinned table does not route, the pinned deck answers the ROUTER'S
//      OWN 404 (ActionController::RoutingError), not a 405 with a JSON
//      body. The pinned router does not match POST /a/b/c at all: no pinned
//      route admits a POST for a three-segment path.
//
//   2. THE PINNED DECK'S READ PATHS ARE NEVER UNARMED. A GET of the same
//      path is routed by the WILDCARD ("*mark", engine_routes.rb:54) and
//      dispatched to card#read with the view "bad_address" - the deck's
//      own 404 view for an unknown address, measured by row C15's committed
//      capture. And a POST to a single-segment path is the mark arm's
//      card#create, so the pinned deck always has its write routes.
//
//   3. THE PORT'S GUARDS ARE ITS OWN. The staging server answers 405 with
//      its own JSON body for a non-read request it does not own, and the
//      unarmed edge answers 403 with its own read-only JSON body for a
//      non-read verb.
//
// The fixture is fixtures/captured/port-only-routes-e6-e13-ruby-oracle.json,
// written by tests/server/oracle-capture-port-only-routes-e6-e13-ruby.rb.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { handleBunnyEngineRequest } from "../../deploy/bunny-worker-src/bunny-edge-engine-handler.js";
import { loadPortOnlyRouteOracle, pinnedAnswer, portServes } from "./port-only-route-oracle.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ORACLE = loadPortOnlyRouteOracle();

/** Row C15's committed capture: the pinned deck's own wildcard answer. */
const BAD_ADDRESS_ORACLE = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/bad-address-wildcard-view-ruby-oracle.json"), "utf8"),
) as { wildcardRoute: { requirements: Record<string, string> } };

describe("the pinned deck's own answer for an unrouted request", () => {
  it("a POST of an unrouted path is the ROUTER'S OWN 404, not a 405", () => {
    const answer = pinnedAnswer("E13", "/a/b/c", "post");
    expect(answer?.matched).toBe(false);
    expect(answer?.matches).toEqual([]);
  });

  it("a GET of the same path is the WILDCARD's bad-address read", () => {
    const answer = pinnedAnswer("E13", "/a/b/c", "get");
    expect(answer?.matched).toBe(true);
    expect(answer?.answer?.path).toBe("/*mark(.:format)");
    expect(answer?.answer?.defaults.action).toBe("read");
    expect(answer?.answer?.defaults.view).toBe("bad_address");
    expect(BAD_ADDRESS_ORACLE.wildcardRoute.requirements.view).toBe("bad_address");
  });

  it("the pinned deck always has its write routes: a POST of one segment creates", () => {
    const answer = pinnedAnswer("E13", "/Alpha", "post");
    expect(answer?.matched).toBe(true);
    expect(answer?.answer?.path).toBe("/:mark(.:format)");
    expect(answer?.answer?.defaults.action).toBe("create");
    expect(answer?.answer?.parameters.mark).toBe("Alpha");
  });
});

describe("the port's own method guards", () => {
  it("the unarmed edge answers a non-read verb with its own read-only 403", async () => {
    const response = await handleBunnyEngineRequest(
      new Request("https://edge.test/Alpha", { method: "POST" }),
      {},
    );
    expect(response.status).toBe(403);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body["error"]).toBe("forbidden: this edge deploy is read-only");
  });

  it("the staging server's own 405 carries its own JSON body", () => {
    expect(
      portServes(
        "vm-staging-server.mjs",
        'jsonResponse(405, { error: "method not allowed" })',
      ),
    ).toBe(true);
    // And the guard that reaches it: a non-read request that is not one of
    // the account-flow paths.
    expect(portServes("vm-staging-server.mjs", 'const ACCOUNT_POST_PATHS = new Set(["/_reset-request", "/_account-password"])')).toBe(
      true,
    );
  });

  it("the edge's own 403 is the port's bytes", () => {
    expect(
      portServes(
        "deploy/bunny-worker-src/bunny-edge-engine-handler.ts",
        'json(403, { error: "forbidden: this edge deploy is read-only" })',
      ),
    ).toBe(true);
  });

  it("the capture's port-side quotes name the surfaces this row grades", () => {
    expect(ORACLE.portSurface.E13.map((entry) => entry.host)).toEqual([
      "the staging server's 405 arm",
      "the edge engine's read-only 403",
    ]);
  });
});
