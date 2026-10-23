// The vendor font assets ([Family] row E11), measured against the PINNED
// deck's own route table (through the PINNED router) and against the PORT's
// own vendored-byte surfaces.
//
// The register's E11 row grades the port's vendor font assets (font-awesome
// and the bootstrap fonts) and calls them a "port-only route (no Ruby
// counterpart)", on the basis that "the register names the host(s) and the
// file:line in the port that serves it, so there is no Ruby behaviour it
// could fail to match". This file MEASURES that basis.
//
// WHAT THE MEASUREMENT SETTLES:
//
//   1. THE PINNED DECK HAS NO VENDOR FONT SURFACE. The port's vendored
//      bytes live under /mod/bootstrap/..., and the pinned deck's route
//      table carries no /mod/ prefix at all, so a request for a vendored
//      font falls to the WILDCARD route ("*mark", engine_routes.rb:54) and
//      is dispatched to card#read with the view "bad_address" - the deck's
//      own 404 view for an unknown address, measured by row C15's committed
//      capture.
//
//   2. THE PORT'S ANSWER IS ITS OWN BYTES, WITH ITS OWN CACHE POSTURE. The
//      port serves the vendored font-awesome stylesheet and the bootstrap
//      icon fonts from its own vendor/ directory, with an immutable
//      one-year cache, an etag and a nosniff header; a non-read verb at
//      the same path is refused with 405 and an Allow header; a key the
//      vendor directory does not carry is a 404.
//
//   3. BOTH HOSTS MOUNT THE SAME TWO FUNCTIONS, so the edge and the staging
//      server answer these paths identically.
//
// The fixture is fixtures/captured/port-only-routes-e6-e13-ruby-oracle.json,
// written by tests/server/oracle-capture-port-only-routes-e6-e13-ruby.rb.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { serveFontAwesomeAsset } from "../../src/server/font-awesome-assets.js";
import { serveBootstrapFontAsset } from "../../src/server/bootstrap-font-assets.js";
import { handleBunnyEngineRequest } from "../../deploy/bunny-worker-src/bunny-edge-engine-handler.js";
import { loadPortOnlyRouteOracle, pinnedAnswer, portServes } from "./port-only-route-oracle.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ORACLE = loadPortOnlyRouteOracle();

/** Row C15's committed capture: the pinned deck's own wildcard answer. */
const BAD_ADDRESS_ORACLE = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/bad-address-wildcard-view-ruby-oracle.json"), "utf8"),
) as { wildcardRoute: { requirements: Record<string, string> } };

const FONT_AWESOME_CSS = "/mod/bootstrap/fontawesome-6.7.2/css/all.min.css";
const BOOTSTRAP_FONT = "/mod/bootstrap/fonts/bootstrap-icons.woff2";

describe("the pinned deck's own answer for a vendored font", () => {
  it("the pinned router sends it to the WILDCARD, as a bad address", () => {
    const answer = pinnedAnswer("E11", FONT_AWESOME_CSS, "get");
    expect(answer?.matched).toBe(true);
    expect(answer?.answer?.path).toBe("/*mark(.:format)");
    expect(answer?.answer?.defaults.action).toBe("read");
    expect(answer?.answer?.defaults.view).toBe("bad_address");
  });

  it("and the bootstrap font path lands on the same wildcard", () => {
    const answer = pinnedAnswer("E11", BOOTSTRAP_FONT, "get");
    expect(answer?.matched).toBe(true);
    expect(answer?.answer?.path).toBe("/*mark(.:format)");
    expect(answer?.answer?.defaults.view).toBe("bad_address");
    expect(BAD_ADDRESS_ORACLE.wildcardRoute.requirements.view).toBe("bad_address");
  });
});

describe("the port's own vendored bytes", () => {
  it("the port serves the vendored font-awesome stylesheet with its own headers", async () => {
    const response = serveFontAwesomeAsset(new Request(`https://edge.test${FONT_AWESOME_CSS}`));
    expect(response).not.toBeUndefined();
    expect(response?.status).toBe(200);
    expect(response?.headers.get("content-type")).toContain("text/css");
    expect(response?.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(response?.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response?.headers.get("etag")).not.toBeNull();
    const bytes = new Uint8Array(await response!.arrayBuffer());
    expect(bytes.length).toBeGreaterThan(0);
  });

  it("the port serves the vendored bootstrap icon font", async () => {
    const response = serveBootstrapFontAsset(new Request(`https://edge.test${BOOTSTRAP_FONT}`));
    expect(response).not.toBeUndefined();
    expect(response?.status).toBe(200);
    expect(response?.headers.get("cache-control")).toBe("public, max-age=86400");
    const bytes = new Uint8Array(await response!.arrayBuffer());
    expect(bytes.length).toBeGreaterThan(0);
  });

  it("the port refuses a non-read verb at the same path, and 404s an unknown key", async () => {
    const posted = serveFontAwesomeAsset(
      new Request(`https://edge.test${FONT_AWESOME_CSS}`, { method: "POST" }),
    );
    expect(posted?.status).toBe(405);
    expect(posted?.headers.get("allow")).toBe("GET, HEAD");

    const unknown = serveFontAwesomeAsset(
      new Request("https://edge.test/mod/bootstrap/fontawesome-6.7.2/css/not-a-file.css"),
    );
    expect(unknown?.status).toBe(404);

    // A path outside the vendor prefix is not the port's at all.
    expect(
      serveFontAwesomeAsset(new Request("https://edge.test/mod/other/css/all.min.css")),
    ).toBeUndefined();
  });

  it("the edge host mounts the same two functions", async () => {
    const response = await handleBunnyEngineRequest(
      new Request(`https://edge.test${FONT_AWESOME_CSS}`),
      {},
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(
      portServes(
        "deploy/bunny-worker-src/bunny-edge-engine-handler.ts",
        "serveFontAwesomeAsset(request) ?? serveBootstrapFontAsset(request)",
      ),
    ).toBe(true);
    expect(
      portServes(
        "vm-staging-server.mjs",
        "serveFontAwesomeAsset(vendorRequest) ?? serveBootstrapFontAsset(vendorRequest)",
      ),
    ).toBe(true);
  });

  it("the capture's port-side quotes name the surfaces this row grades", () => {
    expect(ORACLE.portSurface.E11.map((entry) => entry.host)).toEqual([
      "the staging server's vendor asset arm",
      "the edge engine's vendor asset arm",
      "the port's own font-awesome asset surface",
      "the port's own bootstrap font surface",
    ]);
  });
});
