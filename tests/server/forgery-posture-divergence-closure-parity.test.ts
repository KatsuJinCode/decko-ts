// The forgery posture (row C16), measured against the PINNED gemset and
// pinned as the ACCEPTED DIVERGENCE it is.
//
// The register's C16 row grades the port DIVERGENT: "live decko arms NO
// forgery protection" against a port that origin-checks every
// state-changing request. Its fix: "either drop the origin check or pin
// the hardening as an accepted, operator-ruled divergence".
//
// THE PIN IS DONE: docs/SECURITY.md's approved-divergences table carries
// the forgery row with the Ruby cell, the Port cell, the Why, the
// Compatibility, the Configuration (DECKO_ORIGIN_CHECK=off restores
// Ruby's behaviour) and the Tests. What this file adds is the MEASUREMENT
// behind the Ruby cell and the RUNTIME behaviour of the switch, so the
// row's remaining half (the operator's ruling) rests on evidence rather
// than on a reading.
//
// THE MEASUREMENT, over the WHOLE pinned gemset: the deck's own gems (the
// deck, the card library, the card mods) carry FOUR forgery references in
// TWO files, and every one of them DISABLES protection. No
// protect_from_forgery call and no verify_authenticity_token callback
// appears in the deck's own gems at all. The framework gems carry the
// machinery (67 further references), which is where it lives.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  checkRequestOrigin,
  originPolicyFromEnv,
} from "../../src/server/request-origin.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

interface ForgeryOracle {
  gemset: string;
  gemCount: number;
  patterns: string[];
  hitCount: number;
  deckGemHits: Array<{ file: string; line: number; text: string }>;
  frameworkHitCount: number;
}

const ORACLE = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/forgery-posture-ruby-oracle.json"), "utf8"),
) as ForgeryOracle;

describe("the PINNED gemset's forgery posture (C16)", () => {
  it("the scan covered the whole pinned gemset", () => {
    expect(ORACLE.gemCount).toBe(151);
    expect(ORACLE.hitCount).toBe(71);
  });

  it("the deck's own gems carry FOUR forgery references in TWO files", () => {
    expect(ORACLE.deckGemHits.length).toBe(4);
    const files = new Set(ORACLE.deckGemHits.map((hit) => hit.file));
    expect(files.size).toBe(2);
  });

  it("every one of the deck's own references DISABLES protection", () => {
    for (const hit of ORACLE.deckGemHits) {
      expect(hit.text, hit.file).toContain("allow_forgery_protection = false");
    }
  });

  it("no protect_from_forgery and no verify_authenticity_token in the deck's own gems", () => {
    for (const hit of ORACLE.deckGemHits) {
      expect(hit.text).not.toContain("protect_from_forgery");
      expect(hit.text).not.toContain("verify_authenticity_token");
    }
  });

  it("the machinery itself is in the framework gems, where Rails keeps it", () => {
    expect(ORACLE.frameworkHitCount).toBe(67);
    expect(ORACLE.frameworkHitCount + ORACLE.deckGemHits.length).toBe(ORACLE.hitCount);
  });
});

describe("the port's own hardening, and the switch that restores Ruby's behaviour (C16)", () => {
  it("a cross-site request is REFUSED, with a reason", () => {
    const verdict = checkRequestOrigin({
      method: "POST",
      headers: { "sec-fetch-site": "cross-site", origin: "https://elsewhere.test" },
      host: "deck.test",
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false ? verdict.reason : "").toContain("cross-site");
  });

  it("a same-origin request PASSES", () => {
    const verdict = checkRequestOrigin({
      method: "POST",
      headers: { "sec-fetch-site": "same-origin", origin: "https://deck.test" },
      host: "deck.test",
    });
    expect(verdict.ok).toBe(true);
  });

  it("DECKO_ORIGIN_CHECK=off restores Ruby's behaviour: nothing is refused", () => {
    const policy = originPolicyFromEnv({ DECKO_ORIGIN_CHECK: "off" });
    expect(policy.enabled).toBe(false);
    const verdict = checkRequestOrigin(
      {
        method: "POST",
        headers: { "sec-fetch-site": "cross-site", origin: "https://elsewhere.test" },
        host: "deck.test",
      },
      policy,
    );
    expect(verdict.ok).toBe(true);
  });

  it("the approved-divergences table carries the forgery row and the switch", () => {
    const security = readFileSync(path.join(REPO, "docs/SECURITY.md"), "utf8");
    expect(security).toContain("protect_from_forgery");
    expect(security).toContain("DECKO_ORIGIN_CHECK=off");
  });
});
