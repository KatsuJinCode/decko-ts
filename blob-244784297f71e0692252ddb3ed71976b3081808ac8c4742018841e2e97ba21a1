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

import { existsSync, readFileSync } from "node:fs";
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

/** The same capture, re-run on the gemset this machine carries today. The
 *  gemset was rebuilt smaller (68 gems against the committed capture's
 *  151), so the whole capture cannot reproduce byte for byte; the deck's
 *  OWN hits are the row's claim and they do. */
const REBUILT = JSON.parse(
  readFileSync(
    path.join(REPO, "fixtures/captured/forgery-posture-rebuilt-gemset-ruby-oracle.json"),
    "utf8",
  ),
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
      headers: { "sec-fetch-site": "cross-site", origin: "https://elsewhere.test" },
      host: "deck.test",
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false ? verdict.reason : "").toContain("cross-site");
  });

  it("a same-origin request PASSES", () => {
    const verdict = checkRequestOrigin({
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

// ---------------------------------------------------------------------------
// ROUND SEVEN: the row's own claim re-measured on the machine that runs
// today, and the operator's ruling pinned so it cannot lapse silently.
// ---------------------------------------------------------------------------

describe("the row's claim, re-measured on the machine that runs today (C16)", () => {
  it("THE DECK'S OWN FOUR REFERENCES RE-RUN IDENTICAL on the rebuilt gemset", () => {
    // The committed capture was taken against a 151-gem gemset. The gemset
    // this machine carries now was rebuilt smaller (68 gems), so the whole
    // capture cannot reproduce byte for byte: the FRAMEWORK hits differ
    // because the framework gems are not all here. The deck's OWN hits are
    // the row's claim, and they are identical.
    expect(REBUILT.gemCount).toBe(68);
    expect(REBUILT.deckGemHits).toEqual(ORACLE.deckGemHits);
    expect(REBUILT.patterns).toEqual(ORACLE.patterns);
    // Four references in two files, every one DISABLING protection.
    expect(REBUILT.deckGemHits.length).toBe(4);
    const files = new Set(REBUILT.deckGemHits.map((hit) => hit.file));
    expect(files.size).toBe(2);
    for (const hit of REBUILT.deckGemHits) {
      expect(hit.text, hit.file).toContain("allow_forgery_protection = false");
    }
  });

  it("the difference between the two captures is the GEMSET'S SIZE, not the deck's posture", () => {
    // Named, so a reader does not read the two numbers as a posture change:
    // the committed capture counted 151 gems and 67 framework hits; the
    // rebuilt gemset holds 68 gems and 54 framework hits, and the thirteen
    // framework hits that are missing here are the ones the difference is
    // made of. The deck's own half did not move.
    expect(ORACLE.gemCount).toBe(151);
    expect(REBUILT.gemCount).toBe(68);
    expect(ORACLE.hitCount - ORACLE.deckGemHits.length).toBe(67);
    expect(REBUILT.hitCount - REBUILT.deckGemHits.length).toBe(54);
    expect(ORACLE.frameworkHitCount - REBUILT.frameworkHitCount).toBe(13);
    expect(ORACLE.gemCount - REBUILT.gemCount).toBe(83);
  });
});

describe("the operator's ruling is on the record, and the pin keeps it complete (C16)", () => {
  it("the accepted-divergence row carries every cell the ruling needs", () => {
    // The row's unblock condition was: the operator rules either way, by
    // dropping the origin check to match Ruby, or by pinning the hardening
    // as an accepted divergence. The second branch is on the record in
    // docs/SECURITY.md's approved-divergences table (row 2, added
    // 2026-10-08), and this leg pins every cell that row needs so the
    // acceptance cannot lapse into a bare claim.
    const security = readFileSync(path.join(REPO, "docs/SECURITY.md"), "utf8");
    const start = security.indexOf("### 2. Cross-site requests");
    const end = security.indexOf("### 3. Secrets are compared in constant time");
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const row = security.slice(start, end);
    for (const cell of ["**Ruby**", "**Port**", "**Why**", "**Compatibility**", "**Configuration**", "**Tests**"]) {
      expect(row, cell).toContain(cell);
    }
    // The switch that restores Ruby's behaviour, and the trusted-origins
    // setting the compatibility cell names.
    expect(row).toContain("DECKO_ORIGIN_CHECK=off");
    expect(row).toContain("DECKO_TRUSTED_ORIGINS");
    // The tests the row names, so the ruling points at pins that exist.
    expect(row).toContain("tests/server/write-routes-origin.test.ts");
    expect(row).toContain("tests/card/auth/first-run-setup.test.ts");
    expect(row).toContain("tests/deploy/bunny-edge-signin-session-roundtrip.test.ts");
    for (const named of [
      "tests/server/write-routes-origin.test.ts",
      "tests/card/auth/first-run-setup.test.ts",
      "tests/deploy/bunny-edge-signin-session-roundtrip.test.ts",
    ]) {
      expect(existsSync(path.join(REPO, named)), named).toBe(true);
    }
  });

  it("the port's own behaviour is the row's Port cell: a cross-site request is refused and a same-origin one passes", () => {
    // The ruling's Port cell is a claim about behaviour, so it is measured
    // here, not read.
    const refused = checkRequestOrigin({
      headers: { "sec-fetch-site": "cross-site", origin: "https://elsewhere.test" },
      host: "deck.test",
    });
    expect(refused.ok).toBe(false);
    const allowed = checkRequestOrigin({
      headers: { "sec-fetch-site": "same-origin", origin: "https://deck.test" },
      host: "deck.test",
    });
    expect(allowed.ok).toBe(true);
  });
});
