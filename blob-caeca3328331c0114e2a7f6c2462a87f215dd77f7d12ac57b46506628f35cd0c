// The C13 binding: the probe's committed receipt becomes a result the repo's
// OWN grader credits, under the check name row cap-C13 registered.
//
//   node --test tools/edge-signed-in-exercise/test/capture-feed.test.mjs
//
// The grader under test is tools/edge-signed-in-exercise/lib/local-policy.mjs
// verifiedCapabilities (lines 44-56) - the same function the registry's
// instrument uses (the roster's caps-grind receipt names it: "instrument:
// tools/edge-signed-in-exercise/lib/local-policy.mjs verifiedCapabilities
// (lines 44-57)"). The registry under test is this repo's own
// tools/edge-signed-in-exercise/capabilities.json.
//
// The receipt is a committed, self-describing measurement:
// reference-harness/browser/probe-receipts/probe-c13-run3-result.json, the
// probe's run3 output at commit d8050251 (dist sha256 c8d6e53c..., fixture
// sha256 e5798f2c...), copied in from the caps-grind lane's receipts
// directory.
//
// The row's own blocker named the unblock: "the registry keeps the row
// uncounted because the full-harness report never carries this check name
// (the probe feeds nothing into it) ... closing the row needs the probe
// results bound into a capture feed or an explicit registry decision, not
// more capability work."

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { verifiedCapabilities } from "../lib/local-policy.mjs";
import {
  RUBY_SCENARIO,
  gradedLegs,
  missingRubyFacts,
  recordedFacts,
  resultsFromProbeReceipt,
} from "../lib/capture-feed.mjs";

const REGISTRY = JSON.parse(
  readFileSync(new URL("../capabilities.json", import.meta.url), "utf8"),
);
const RECEIPT = JSON.parse(
  readFileSync(
    new URL("../../../reference-harness/browser/probe-receipts/probe-c13-run3-result.json", import.meta.url),
    "utf8",
  ),
);

const rowOf = (id) => REGISTRY.capabilities.find((capability) => capability.id === id);

test("the feed's check name IS the name row cap-C13 registered", () => {
  // The binding, asserted against the registry file itself: a feed can only
  // credit a row whose registered name it carries, byte for byte.
  const row = rowOf("C13");
  assert.ok(row !== undefined, "the registry carries a C13 row");
  assert.deepEqual(row.checks, [RECEIPT.checkName]);
  const [result] = resultsFromProbeReceipt(RECEIPT);
  assert.equal(result.check, row.checks[0]);
  assert.equal(result.pass, true);
});

test("the receipt is green on every graded leg, and says so", () => {
  const legs = gradedLegs(RECEIPT);
  assert.equal(legs.length, 8);
  assert.deepEqual(legs.filter((leg) => leg.ok !== true), []);
  assert.equal(RECEIPT.failures, 0);
  assert.equal(RECEIPT.c13.allLegsGreen, true);
  // The receipt is self-describing: the commit and both digests are in it.
  assert.match(RECEIPT.source.commit, /^[0-9a-f]{40}$/);
  assert.match(RECEIPT.source.distSha256, /^[0-9a-f]{64}$/);
  assert.match(RECEIPT.source.fixtureSha256, /^[0-9a-f]{64}$/);
  assert.equal(RECEIPT.source.dirty, false);
});

test("every fact the Ruby scenario names is recorded", () => {
  const facts = recordedFacts(RECEIPT);
  assert.deepEqual(missingRubyFacts(RECEIPT), []);
  for (const key of Object.keys(RUBY_SCENARIO)) {
    assert.equal(facts[key], true, key);
  }
  // The scenario lines the facts answer, so the mapping is not a claim.
  assert.match(RUBY_SCENARIO.cardCreatedFromTemplate, /structure\.feature:21-26/);
  assert.match(RUBY_SCENARIO.saveAndCloseApplied, /structure\.feature:27-32/);
});

test("the repo's own grader credits the row from this feed", () => {
  // The grader derives each row's status from the RESULTS it is fed, so the
  // honest comparison is the same grader with and without the feed.
  const without = verifiedCapabilities(REGISTRY.capabilities, []);
  const with_ = verifiedCapabilities(REGISTRY.capabilities, resultsFromProbeReceipt(RECEIPT));
  const c13Without = without.find((capability) => capability.id === "C13");
  const c13With = with_.find((capability) => capability.id === "C13");
  assert.equal(c13Without.status, "not_covered");
  assert.deepEqual(c13Without.verifiedChecks, []);
  assert.equal(c13With.status, "covered");
  assert.deepEqual(c13With.verifiedChecks, [RECEIPT.checkName]);
  // No other row moved: the feed carries ONE check name, and no other row
  // registered it, so every other row grades exactly as it did without.
  for (const before of without) {
    if (before.id === "C13") continue; // this row is the one the feed credits
    const after = with_.find((capability) => capability.id === before.id);
    assert.equal(after.status, before.status, before.id);
    // A disabled_upstream / out_of_scope row is returned by the grader
    // untouched (local-policy.mjs:46), so it carries no verifiedChecks at all.
    assert.deepEqual(after.verifiedChecks ?? [], before.verifiedChecks ?? [], before.id);
  }
});

test("a red leg does not credit the row", () => {
  const red = JSON.parse(JSON.stringify(RECEIPT));
  red.legs.find((leg) => leg.leg === "C13-LEG-2").ok = false;
  const [result] = resultsFromProbeReceipt(red);
  assert.equal(result.pass, false);
  assert.deepEqual(result.evidence.redLegs, ["C13-LEG-2"]);
  const graded = verifiedCapabilities(REGISTRY.capabilities, [result]);
  const c13 = graded.find((capability) => capability.id === "C13");
  assert.equal(c13.status, "not_covered");
  assert.deepEqual(c13.verifiedChecks, []);
});

test("a receipt with a failure count, a missing fact, or another name does not credit the row", () => {
  const counted = JSON.parse(JSON.stringify(RECEIPT));
  counted.failures = 1;
  assert.equal(resultsFromProbeReceipt(counted)[0].pass, false);

  const missingFact = JSON.parse(JSON.stringify(RECEIPT));
  missingFact.c13.controls.sessionSurvived = false;
  const [missingResult] = resultsFromProbeReceipt(missingFact);
  assert.equal(missingResult.pass, false);
  assert.deepEqual(missingResult.evidence.missingRubyFacts, ["sessionSurvived"]);

  // A receipt under another name is still a green measurement - of ANOTHER
  // check - so what must not happen is C13 being credited by it.
  const otherName = JSON.parse(JSON.stringify(RECEIPT));
  otherName.checkName = "some other check name";
  const [otherResult] = resultsFromProbeReceipt(otherName);
  assert.equal(otherResult.check, "some other check name");
  const graded = verifiedCapabilities(REGISTRY.capabilities, [otherResult]);
  assert.equal(graded.find((capability) => capability.id === "C13").status, "not_covered");
  assert.deepEqual(graded.find((capability) => capability.id === "C13").verifiedChecks, []);
});

test("an observed (ungraded) leg is not a result", () => {
  // The receipt records one leg with graded: false - an observation, not an
  // assertion. It must not count towards the graded set, and a receipt whose
  // ONLY legs are observations must not produce a passing result.
  const observed = JSON.parse(JSON.stringify(RECEIPT));
  for (const leg of observed.legs) leg.graded = false;
  assert.equal(gradedLegs(observed).length, 0);
  assert.equal(resultsFromProbeReceipt(observed)[0].pass, false);
});
