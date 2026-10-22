// GET /api/status and GET /api/card/<name> ([Family] row E2), the
// port-only API surface, measured against the PINNED deck's own route
// table and the PORT's own edge engine.
//
// The register's E2 row grades the port's edge API surface, and the
// register's own basis is that "the register names the host(s) and the
// file:line in the port that serves it, so there is no Ruby behaviour it
// could fail to match". This file MEASURES that basis.
//
// fixtures/captured/port-only-routes-ruby-oracle.json is what
// tests/server/oracle-capture-port-only-routes-ruby.rb recorded: the
// PINNED deck's own route table, EXECUTED, reduced for this row's probe
// paths, and the PORT's own serving source quoted with line numbers.
//
// WHAT THE MEASUREMENT SETTLES:
//
//   NEITHER PATH IS A PINNED DECK SURFACE, AND THE REDUCTION SAYS EXACTLY
//   HOW EACH ONE IS ANSWERED INSTEAD:
//
//   - /api/status is TWO segments, and the pinned table's first route
//     that admits a GET for it is the two-segment mark/rev arm, whose
//     action is card#read. So the pinned deck answers /api/status with a
//     CARD READ of a card named "api" with a view named "status", never
//     with a status JSON.
//   - /api/card/<name> is THREE segments, and the only pinned route that
//     can match a three-segment path is engine_routes.rb:54's WILDCARD
//     (`get "*mark" => "card#read", view: "bad_address"`). So the pinned
//     deck answers /api/card/<name> with the bad_address 404 view.
//
//   The port's own answer at both paths is an API surface the pinned deck
//   has no counterpart for: a status JSON, and a read-gated record JSON.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { decodeName } from "../../src/server/worker-shared-surface.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const ORACLE = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/port-only-routes-ruby-oracle.json"), "utf8"),
) as {
  rows: Record<string, string>;
  reductions: Record<
    string,
    Array<{
      path: string;
      candidates: Array<{ order: number; verb: string; patterns: string[]; action: string }>;
      firstRouteAdmittingGet: number | null;
      firstRouteAdmittingPost: number | null;
      pinnedRouteCount: number;
    }>
  >;
  portSurface: Record<
    string,
    Array<{ host: string; file: string; lines: Array<{ line: number; text: string }> }>
  >;
};

const statusPath = ORACLE.reductions["E2"][0];
const cardPath = ORACLE.reductions["E2"][1];

describe("the port-only API surface (E2), against the pinned deck's own table", () => {
  it("the pinned deck answers /api/status with a CARD READ", () => {
    expect(statusPath.firstRouteAdmittingGet).toBe(1);
    const first = statusPath.candidates.find((entry) => entry.order === 1);
    expect(first?.action).toBe("card#read");
    // Every candidate is a card surface: there is no API or status action
    // anywhere in the pinned table.
    for (const candidate of statusPath.candidates) {
      expect(candidate.action.startsWith("card#"), candidate.action).toBe(true);
    }
  });

  it("the pinned deck answers /api/card/<name> with the WILDCARD", () => {
    // The only pinned route that can match a three-segment path is
    // engine_routes.rb:54's wildcard, whose view is bad_address.
    const wildcard = cardPath.candidates.find((entry) => entry.order === 28);
    expect(wildcard?.action).toBe("card#read");
    expect(wildcard?.patterns).toEqual(["*mark"]);
    // And no candidate is an API route.
    for (const candidate of cardPath.candidates) {
      expect(candidate.action.startsWith("card#"), candidate.action).toBe(true);
    }
  });
});

describe("the port's own API surface (E2)", () => {
  it("the edge engine's own source carries the two arms, and the read gate", () => {
    const surface = ORACLE.portSurface["E2"];
    expect(surface.length).toBe(1);
    expect(surface[0]?.host).toBe("the edge engine request core");
    expect(surface[0]?.file).toBe("deploy/bunny-worker-src/bunny-edge-engine-request.ts");
    const text = surface[0]?.lines.map((line) => line.text).join("\n") ?? "";
    expect(text).toContain("/api/status");
    expect(text).toContain("/api/card/");
  });

  it("the port's own hardened decode is the shared decodeName the arm calls", () => {
    // The arm's own decode (the shared decodeName rule,
    // worker-shared-surface.ts): a malformed % answers 400
    // {"error":"empty card name"}, never an unhandled URIError.
    expect(decodeName("Alpha")).toBe("Alpha");
    expect(decodeName("%")).toBeUndefined();
    // An empty name decodes to the empty string, and the arm's own check
    // is `name === undefined || name === ""`, so both are the 400 arm.
    expect(decodeName("")).toBe("");
  });
});
