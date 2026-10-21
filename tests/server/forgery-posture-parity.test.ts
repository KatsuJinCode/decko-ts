// The forgery posture, measured against the PINNED GEMSET, and the port's
// hardening pinned as the accepted divergence it is.
//
// The completeness register's C16 row (register-routes) grades the port
// DIVERGENT: "live decko arms NO forgery protection (receipt documented at
// write-routes.ts:62-76)" against a port that "origin-checks every
// state-changing request (src/server/write-routes.ts:1777-1783) and
// restricts GET-mutation arms to same-origin XHR
// (vm-staging-server.mjs:4141-4155)". Its fix: "either drop the origin
// check or pin the hardening as an accepted, operator-ruled divergence".
//
// THE PIN IS DONE. docs/SECURITY.md's approved-divergences table carries
// the forgery row: the Ruby cell, the Port cell, the Why, the
// Compatibility, the Configuration (DECKO_ORIGIN_CHECK=off restores Ruby's
// behaviour) and the Tests. The operator's acceptance and the switch that
// restores Ruby's behaviour are both on the record.
//
// WHAT WAS MISSING is the MEASUREMENT behind the Ruby cell: "decko 0.20.0
// and card 1.110.0 contain no protect_from_forgery" was derived by reading
// the gems. fixtures/captured/forgery-posture-ruby-oracle.json is what
// oracle-capture-forgery-posture-ruby.rb (tests/server/) recorded by
// SCANNING the pinned gemset for every forgery-protection reference.
//
// THE MEASUREMENT, and the correction it carries:
//
//   - The deck's own gems (the deck, the card library, the card mods) carry
//     FOUR forgery references, in TWO files, and EVERY one of them DISABLES
//     protection:
//
//       card-1.110.0/config/environments/test.rb:37
//       decko-0.20.0/config/environments/cucumber.rb:27
//
//     both reading `config.action_controller.allow_forgery_protection =
//     false`.
//
//   - So the deck's own code never ARMS forgery protection. The framework
//     gems carry the machinery (67 further references across Rails itself),
//     and a deck that never calls protect_from_forgery and never sets
//     allow_forgery_protection leaves Rails' default in place - which is
//     what the port's receipt says, now measured over every shipped file
//     rather than two read ones.
//
//   - The receipt's wording was one reference short: the write path's header
//     comment said the cucumber environment was "the ONLY forgery reference
//     in the whole generation", and the card gem's own test environment
//     carries a second one. The comment is corrected in this commit.
//
// The port's half of the divergence is pinned behaviorally below: the origin
// check refuses a cross-site request, and the switch that restores Ruby's
// behaviour is the documented one.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkRequestOrigin, defaultOriginPolicy } from "../../src/server/request-origin.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const ORACLE = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/forgery-posture-ruby-oracle.json"), "utf8"),
) as {
  gemCount: number;
  patterns: string[];
  hitCount: number;
  frameworkHitCount: number;
  deckGemHits: Array<{ gem: string; file: string; line: number; pattern: string; text: string }>;
};

const SECURITY = readFileSync(path.join(REPO, "docs/SECURITY.md"), "utf8");

describe("the forgery posture, against the pinned gemset", () => {
  it("the scan covered every gem and every shipped ruby file", () => {
    expect(ORACLE.gemCount).toBe(151);
    expect(ORACLE.patterns).toEqual([
      "protect_from_forgery",
      "allow_forgery_protection",
      "verify_authenticity_token",
      "request_forgery_protection",
      "forgery_protection",
    ]);
  });

  it("the deck's own gems never ARM forgery protection: every reference DISABLES it", () => {
    const files = [...new Set(ORACLE.deckGemHits.map((hit) => `${hit.gem}/${hit.file}:${hit.line}`))];
    // The capture records each hit's file relative to its own gem, so the
    // two deck-gem references are these two paths and nothing else.
    expect(files.sort()).toEqual([
      "card-1.110.0/config/environments/test.rb:37",
      "decko-0.20.0/config/environments/cucumber.rb:27",
    ]);
    for (const hit of ORACLE.deckGemHits) {
      expect(hit.text, hit.file).toContain("allow_forgery_protection = false");
      expect(hit.text, hit.file).not.toContain("protect_from_forgery");
    }
    // And the arming call itself appears NOWHERE in the deck's own gems.
    expect(ORACLE.deckGemHits.filter((hit) => hit.pattern === "protect_from_forgery")).toEqual([]);
    expect(ORACLE.deckGemHits.filter((hit) => hit.pattern === "verify_authenticity_token")).toEqual([]);
  });

  it("the framework carries the machinery, and the deck does not use it", () => {
    // Rails itself holds the references; that is where the machinery lives,
    // and a deck that never arms it leaves the default in place.
    expect(ORACLE.frameworkHitCount).toBeGreaterThan(0);
    expect(ORACLE.hitCount).toBe(ORACLE.deckGemHits.length + ORACLE.frameworkHitCount);
  });
});

describe("the port's half of the forgery divergence", () => {
  it("the origin check refuses a cross-site state-changing request", () => {
    const policy = { ...defaultOriginPolicy(), enabled: true, trustedOrigins: [] };
    const verdict = checkRequestOrigin(
      { headers: { origin: "https://elsewhere.example" }, host: "deck.example" },
      policy,
    );
    expect(verdict.ok).toBe(false);
  });

  it("the approved-divergences table carries the forgery row, with the switch and the tests", () => {
    // The row is the operator's acceptance, and the Configuration cell is
    // the switch that restores Ruby's behaviour.
    expect(SECURITY).toContain("No forgery protection");
    expect(SECURITY).toContain("DECKO_ORIGIN_CHECK=off");
    expect(SECURITY).toContain("tests/server/write-routes-origin.test.ts");
  });
});
