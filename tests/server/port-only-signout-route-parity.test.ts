// GET|POST /_signout, the ungated and origin-checked sign-out surface
// ([Family] row E4), measured against the PINNED deck's own route table
// and the PORT's own origin-check policy.
//
// The register's E4 row grades the port's edge sign-out surface, and the
// register's own basis is that "the register names the host(s) and the
// file:line in the port that serves it, so there is no Ruby behaviour it
// could fail to match". This file MEASURES that basis.
//
// fixtures/captured/port-only-routes-ruby-oracle.json is what
// tests/server/oracle-capture-port-only-routes-ruby.rb recorded: the
// PINNED deck's own route table, EXECUTED, reduced for this row's probe
// path, and the PORT's own serving source quoted with line numbers.
//
// WHAT THE MEASUREMENT SETTLES, and it is the sharpest thing in the
// port-only rows:
//
//   A POST /_signout IS A CARD CREATE IN THE PINNED DECK. The executed
//   table's first route that admits a POST for /_signout is the bare
//   ":mark(.:format)" arm, whose action is card#create. So the pinned
//   deck's answer to a POST at that path is a CREATE of a card named
//   "signout", not a sign-out. The port's edge host mounts its sign-out
//   arm ABOVE the write surface precisely because of that, and the
//   capture's port-side quote is the mount.
//
//   A GET /_signout is a CARD READ in the pinned deck (the mark arm), so
//   the port's sign-out surface is a port-only SEMANTIC at a path the
//   pinned table does route.
//
//   THE PORT'S OWN ANSWER IS UNGATED BUT ORIGIN-CHECKED: the sign-out is
//   not behind the write gate (a session the edge's own sign-in minted
//   must be revocable on the same terms), and it IS behind the same
//   origin policy the write routes and sign-in run, so a cross-site
//   request is refused before the session row is touched.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkRequestOrigin, originPolicyFromEnv } from "../../src/server/request-origin.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const ORACLE = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/port-only-routes-ruby-oracle.json"), "utf8"),
) as {
  reductions: Record<
    string,
    Array<{
      path: string;
      candidates: Array<{ order: number; verb: string; patterns: string[]; action: string }>;
      firstRouteAdmittingGet: number | null;
      firstRouteAdmittingPost: number | null;
    }>
  >;
  portSurface: Record<
    string,
    Array<{ host: string; file: string; lines: Array<{ line: number; text: string }> }>
  >;
};

const signout = ORACLE.reductions["E4"][0];

describe("the port-only sign-out surface (E4), against the pinned deck's own table", () => {
  it("a POST /_signout is a CARD CREATE in the pinned deck", () => {
    // The first route that admits a POST for /_signout is the bare
    // ":mark(.:format)" arm, whose action is card#create: the pinned
    // deck's answer to a POST at that path is a CREATE of a card named
    // "signout", never a sign-out.
    expect(signout.firstRouteAdmittingPost).toBe(16);
    const create = signout.candidates.find((entry) => entry.order === 16);
    expect(create?.action).toBe("card#create");
    expect(create?.verb).toBe("match");
  });

  it("a GET /_signout is a CARD READ in the pinned deck", () => {
    expect(signout.firstRouteAdmittingGet).toBe(2);
    const read = signout.candidates.find((entry) => entry.order === 2);
    expect(read?.action).toBe("card#read");
  });
});

describe("the port's own sign-out surface (E4)", () => {
  it("the port's own edge arm is mounted, and the mount is above the write surface", () => {
    const surface = ORACLE.portSurface["E4"];
    expect(surface.length).toBe(1);
    expect(surface[0]?.host).toBe("the edge engine");
    expect(surface[0]?.file).toBe("deploy/bunny-worker-src/bunny-edge-engine-handler.ts");
    const text = surface[0]?.lines.map((line) => line.text).join("\n") ?? "";
    expect(text).toContain("/_signout");
  });

  it("the port's own origin policy REFUSES a cross-site sign-out", () => {
    const policy = originPolicyFromEnv({ DECKO_ORIGIN_CHECK: "on" });
    // A browser that reports a cross-site request is refused, and the
    // refusal carries a reason.
    const crossSite = checkRequestOrigin(
      {
        headers: { "sec-fetch-site": "cross-site", origin: "https://attacker.test" },
        host: "decko.test",
      },
      policy,
    );
    expect(crossSite.ok).toBe(false);
    // A foreign Origin header is refused too.
    const foreign = checkRequestOrigin(
      { headers: { origin: "https://attacker.test" }, host: "decko.test" },
      policy,
    );
    expect(foreign.ok).toBe(false);
  });

  it("the port's own origin policy PASSES a same-origin sign-out and a non-browser one", () => {
    const policy = originPolicyFromEnv({ DECKO_ORIGIN_CHECK: "on" });
    const sameOrigin = checkRequestOrigin(
      { headers: { origin: "https://decko.test" }, host: "decko.test" },
      policy,
    );
    expect(sameOrigin.ok).toBe(true);
    // A request with none of the three headers did not come from a browser
    // page, so it passes: API clients and scripts keep working.
    const apiClient = checkRequestOrigin({ headers: {}, host: "decko.test" }, policy);
    expect(apiClient.ok).toBe(true);
  });
});
