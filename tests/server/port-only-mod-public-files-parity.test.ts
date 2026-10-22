// GET /mod/* and the TinyMCE CDN redirect ([Family] row E10), measured
// against the PINNED deck's own route table (through the PINNED router) and
// against the PORT's own mod-file surfaces.
//
// The register's E10 row grades the port's mod public files and the
// TinyMCE CDN redirect and calls them a "port-only route (no Ruby
// counterpart)", on the basis that "the register names the host(s) and the
// file:line in the port that serves it, so there is no Ruby behaviour it
// could fail to match". This file MEASURES that basis.
//
// WHAT THE MEASUREMENT SETTLES:
//
//   1. THE PINNED DECK HAS NO /mod/ PREFIX AT ALL. Its three asset routes
//      are "assets/*mark", "javascripts/*mark" and "jasmine/*mark"
//      (engine_routes.rb:14-16), and a request for a mod's own public file
//      falls to the WILDCARD route ("*mark", engine_routes.rb:54), which
//      dispatches to card#read with the view "bad_address" - the deck's
//      own 404 view for an unknown address, measured by row C15's committed
//      capture. So the pinned deck's answer for a mod's public file is the
//      bad-address 404, not the file's bytes.
//
//   2. THE PORT'S ANSWER IS THE EDGE'S OWN REDIRECT, AND IT IS A
//      REDIRECT, NOT A FILE. The edge engine answers
//      /mod/tinymce_editor/<rest> with a 302 to the published TinyMCE 5.10.7
//      distribution on cdnjs, and it answers the one path it has no CDN
//      copy of - the nest plugin - with its own bytes (200).
//
//   3. THE STAGING SERVER SERVES THE SAME PREFIX FROM DISK, and only when
//      the operator points it at a mod public directory.
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
) as { wildcardRoute: { patterns: string[]; action: string; requirements: Record<string, string> } };

describe("the pinned deck's own answer for a mod's public file", () => {
  it("the pinned router sends it to the WILDCARD, as a bad address", () => {
    const answer = pinnedAnswer("E10", "/mod/tinymce_editor/plugins/nest/plugin.min.js", "get");
    expect(answer?.matched).toBe(true);
    expect(answer?.answer?.path).toBe("/*mark(.:format)");
    expect(answer?.answer?.defaults.action).toBe("read");
    expect(answer?.answer?.defaults.view).toBe("bad_address");
  });

  it("the pinned deck's three asset routes carry no /mod/ prefix", () => {
    const assetRoutes = ORACLE.pinnedRouterRoutes.filter((route) =>
      route.path.startsWith("/assets/") ||
      route.path.startsWith("/javascripts/") ||
      route.path.startsWith("/jasmine/"),
    );
    expect(assetRoutes.map((route) => route.path)).toEqual([
      "/assets/*mark(.:format)",
      "/javascripts/*mark(.:format)",
      "/jasmine/*mark(.:format)",
    ]);
    for (const route of assetRoutes) expect(route.defaults.action).toBe("asset");
  });

  it("and the wildcard's own answer is the bad_address 404 view", () => {
    expect(BAD_ADDRESS_ORACLE.wildcardRoute.patterns).toEqual(["*mark"]);
    expect(BAD_ADDRESS_ORACLE.wildcardRoute.requirements.view).toBe("bad_address");
  });
});

describe("the port's own mod-file surfaces", () => {
  it("the edge engine REDIRECTS the TinyMCE distribution to the CDN", async () => {
    const response = await handleBunnyEngineRequest(
      new Request("https://edge.test/mod/tinymce_editor/themes/silver/theme.min.js"),
      {},
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://cdnjs.cloudflare.com/ajax/libs/tinymce/5.10.7/themes/silver/theme.min.js",
    );
  });

  it("the edge engine serves the one path it has no CDN copy of", async () => {
    const response = await handleBunnyEngineRequest(
      new Request("https://edge.test/mod/tinymce_editor/plugins/nest/plugin.min.js"),
      {},
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/javascript; charset=utf-8",
    );
    const body = await response.text();
    expect(body.length).toBeGreaterThan(0);
  });

  it("the edge engine's own prefix and CDN base are the port's bytes", () => {
    expect(
      portServes(
        "deploy/bunny-worker-src/bunny-edge-engine-handler.ts",
        'const TINYMCE_MOD_PREFIX = "/mod/tinymce_editor/"',
      ),
    ).toBe(true);
    expect(
      portServes(
        "deploy/bunny-worker-src/bunny-edge-engine-handler.ts",
        'const TINYMCE_DIST_BASE = "https://cdnjs.cloudflare.com/ajax/libs/tinymce/5.10.7/"',
      ),
    ).toBe(true);
  });

  it("the staging server serves the same prefix from disk, when pointed at one", () => {
    expect(
      portServes(
        "vm-staging-server.mjs",
        'pathname.startsWith("/mod/")',
      ),
    ).toBe(true);
    expect(
      portServes("vm-staging-server.mjs", 'const MOD_PUBLIC_DIR = process.env.DECKO_MOD_PUBLIC_DIR'),
    ).toBe(true);
  });

  it("the capture's port-side quotes name the surfaces this row grades", () => {
    expect(ORACLE.portSurface.E10.map((entry) => entry.host)).toEqual([
      "the staging server's mod public files arm",
      "the staging server's mod public dir reader",
      "the edge engine's tinymce redirect",
      "the edge engine's tinymce prefix and CDN base",
    ]);
  });
});
