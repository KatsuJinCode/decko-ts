// The templated-card pin (registry row cap-C13, "Create and edit a templated
// card").
//
// ORACLE-PINNED: fixtures/captured/templated-card.json, captured from the
// pinned gemset (card-mod-content-0.20.0, card-mod-edit-0.20.0) by
// tests/card/mod-loader/oracle-capture-templated-card.rb. The capture
// photographs the pinned gemset's OWN bytes for the owners of the contract
// and writes nothing.
//
// What the contract is, in the pinned bytes:
//
//   1. card-mod-content-0.20.0 set/abstract/templated_nests.rb - the core
//      view renders in :template nest mode.
//   2. card-mod-content-0.20.0 set/right/default.rb and set/right/structure.rb
//      - both include that abstract, so a *default rule's body and a
//      *structure rule's body render as templates.
//   3. card-mod-edit-0.20.0 set/all/template_nest.rb - the template nest
//      view: a field-only nest renders the SET card's own template link, and
//      any other nest renders its syntax for the template renderer.
//
// The row's capability is proved by a DIFFERENT instrument: the
// reference-harness probe that drives the templated card end to end and
// commits its receipt. This pin proves the three things the row's own
// blocker named: the receipt's check name is the row's registered name, the
// feed turns that receipt into a result the repo's OWN grader credits, and
// the harness merges the feed into the results its report carries, so the
// report names the row.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { verifiedCapabilities, type CapabilityRow } from "../../../tools/edge-signed-in-exercise/lib/local-policy.mjs";
import {
  RECEIPT_RELATIVE_PATH,
  captureFeedResults,
  resultsFromProbeReceipt,
} from "../../../tools/edge-signed-in-exercise/lib/capture-feed.mjs";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const capture = JSON.parse(
  readFileSync(new URL("./../../../fixtures/captured/templated-card.json", import.meta.url), "utf8"),
);
const roster = JSON.parse(
  readFileSync(
    new URL("./../../../tools/edge-signed-in-exercise/capabilities.json", import.meta.url),
    "utf8",
  ),
) as { capabilities: CapabilityRow[] };
const receipt = JSON.parse(
  readFileSync(new URL("./../../../" + RECEIPT_RELATIVE_PATH, import.meta.url), "utf8"),
);
const portSource = readFileSync(
  new URL("./../../../src/card/mod-loader/mods/card-mod-edit.ts", import.meta.url),
  "utf8",
);
const harnessSource = readFileSync(
  new URL("./../../../tools/edge-signed-in-exercise.mjs", import.meta.url),
  "utf8",
);

describe("the pinned Ruby's own bytes for the templated card", () => {
  it("the core view renders in template nest mode", () => {
    expect(capture.facts.template_mode).toBe("with_nest_mode :template");
    expect(capture.oracle.templated_nests.source).toContain("view :core do");
  });

  it("both the *default rule and the *structure rule render as templates", () => {
    expect(capture.facts.default_rule_include).toBe("include_set Abstract::TemplatedNests");
    expect(capture.facts.structure_rule_include).toBe("include_set Abstract::TemplatedNests");
  });

  it("the template nest view keeps both of its arms", () => {
    expect(capture.facts.field_only_arm).toBe("with_nest_mode :normal");
    expect(capture.facts.syntax_arm).toBe("{{#{voo.nest_syntax}}}");
  });

  it("the capture names the gemset it photographed", () => {
    expect(capture.oracle.templated_nests.gem).toBe("card-mod-content-0.20.0");
    expect(capture.oracle.templated_nests.file_sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("the port carries the same template contract", () => {
  it("every *default/*structure rule body's nests land in the template nest view", () => {
    expect(portSource).toContain("set/right/default.rb:1");
    expect(portSource).toContain("set/right/structure.rb:1");
    expect(portSource).toContain("abstract/templated_nests.rb:1-7");
    expect(portSource).toContain("export const templateNestView");
  });
});

describe("the feed credits the row through the repo's own grader", () => {
  const row = roster.capabilities.find((capability) => capability.id === "C13");

  it("the receipt's check name is the row's registered name", () => {
    expect(receipt.checkName).toBe(
      "C13 a templated card is created from its pre-filled template and its nested subcard is edited in place (Save and Close)",
    );
    expect(row?.checks).toContain(receipt.checkName);
  });

  it("the feed's result passes on the committed receipt", () => {
    const fed = resultsFromProbeReceipt(receipt);
    expect(fed).toHaveLength(1);
    expect(fed[0].check).toBe(receipt.checkName);
    expect(fed[0].pass).toBe(true);
    expect(fed[0].evidence.failures).toBe(0);
    expect(fed[0].evidence.redLegs).toEqual([]);
    expect(fed[0].evidence.missingRubyFacts).toEqual([]);
  });

  it("the grader computes covered for the row when the feed is in the results", () => {
    const fed = captureFeedResults(repoRoot);
    expect(fed).toHaveLength(1);
    const coverage = verifiedCapabilities(roster.capabilities, fed);
    const graded = coverage.find((capability) => capability.id === "C13");
    expect(graded?.status).toBe("covered");
    expect(graded?.verifiedChecks).toEqual([receipt.checkName]);
  });

  it("a red receipt leaves the row where it was", () => {
    const red = resultsFromProbeReceipt({ ...receipt, failures: 1 });
    expect(red[0].pass).toBe(false);
    const coverage = verifiedCapabilities(roster.capabilities, red);
    expect(coverage.find((capability) => capability.id === "C13")?.status).not.toBe("covered");
  });

  it("an absent receipt yields no result at all", () => {
    expect(captureFeedResults(repoRoot + "/does-not-exist")).toEqual([]);
  });
});

describe("the harness carries the feed into its report", () => {
  it("merges the feed's results before the grader reads them", () => {
    expect(harnessSource).toContain(
      "import { captureFeedResults } from './edge-signed-in-exercise/lib/capture-feed.mjs';",
    );
    expect(harnessSource).toContain("const feedResults = captureFeedResults(REPO);");
    expect(harnessSource).toContain("for (const fed of feedResults) record(fed.check, fed.pass, fed.evidence);");
    expect(harnessSource.indexOf("const feedResults = captureFeedResults(REPO);")).toBeLessThan(
      harnessSource.indexOf("const failures = results.filter"),
    );
  });
});
