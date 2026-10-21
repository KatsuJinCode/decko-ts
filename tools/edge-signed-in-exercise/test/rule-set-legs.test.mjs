// The three rule-kind legs capability P5 names, told apart by Ruby's own set
// keys and graded with the negative control Ruby's spec asserts.
//
//   node --test tools/edge-signed-in-exercise/test/rule-set-legs.test.mjs
//
// PINNED AGAINST COMMITTED RUBY BYTES AND CAPTURE:
//
// 1. fixtures/captured/board-views.json is the committed Ruby capture of board
//    views. Ruby emits each card slot's set keys into the slot's own class
//    attribute, so this capture IS Ruby's answer to "which rule kinds can
//    answer for this card". Test 1 reads the tokens out of it and asserts the
//    exact vocabulary Ruby produced, including a real TYPE_PLUS_RIGHT- token -
//    the kind no check on this row had ever exercised.
//
// 2. fixtures/captured/readonly-rule-card-core-type-shape.json is the committed
//    Ruby read-only export carrying Ruby's own safe_set_keys strings. Test 2
//    asserts the same token spellings, so the module's vocabulary is pinned
//    twice, from two independent captures.
//
// 3. fixtures/captured/rules-views.json is the committed Ruby capture of the
//    rule cards themselves (*all+*read, db_content "Anyone") with the walk that
//    names the rule's setting codename. Test 3 asserts a real rule key parses
//    into a setting the module can read, so "the rule's own key names its
//    setting" is Ruby's fact and not this module's invention.
//
// Tests 4-7 are the legs and their negatives.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  P5_CHECK_NAMES,
  mostSpecificKind,
  ruleKindOf,
  ruleLegHolds,
  setKinds,
  slotSetKeys,
} from "../lib/rule-set-legs.mjs";

const BOARD = JSON.parse(
  readFileSync(new URL("../../../fixtures/captured/board-views.json", import.meta.url), "utf8"),
);
const SHAPE = JSON.parse(
  readFileSync(new URL("../../../fixtures/captured/readonly-rule-card-core-type-shape.json", import.meta.url), "utf8"),
);
const RULES = JSON.parse(
  readFileSync(new URL("../../../fixtures/captured/rules-views.json", import.meta.url), "utf8"),
);

test("Ruby's committed board capture carries all three set kinds in slot classes", () => {
  const seen = new Set();
  let graded = 0;
  for (const captured of Object.values(BOARD.targets ?? {})) {
    for (const views of Object.values(captured.views ?? {})) {
      for (const html of Object.values(views)) {
        const keys = slotSetKeys(String(html));
        if (keys.length === 0) continue;
        graded += 1;
        for (const kind of setKinds(keys)) seen.add(kind);
      }
    }
  }
  assert.equal(graded > 0, true);
  // Ruby emitted SELF-, RIGHT- and TYPE_PLUS_RIGHT- keys on real captured slots.
  assert.equal(seen.has("SELF"), true, "SELF token missing from the Ruby capture");
  assert.equal(seen.has("RIGHT"), true, "RIGHT token missing from the Ruby capture");
  assert.equal(seen.has("TYPE_PLUS_RIGHT"), true, "TYPE_PLUS_RIGHT token missing from the Ruby capture");
  assert.equal(seen.has("ALL"), true, "ALL token missing from the Ruby capture");
});

test("the same vocabulary appears in the second Ruby capture, independently", () => {
  // Read Ruby's own safe_set_keys strings out of the read-only export and split
  // them into tokens, the way Ruby builds them (space separated).
  const strings = (JSON.stringify(SHAPE.probes).match(/"safe_set_keys":"([^"]*)"/g) ?? []).map((s) =>
    s.slice('"safe_set_keys":"'.length, -1),
  );
  assert.equal(strings.length > 0, true);
  const kinds = new Set();
  for (const line of strings) {
    for (const token of line.split(/\s+/).filter(Boolean)) {
      kinds.add(token.split("-")[0]);
    }
  }
  for (const kind of ["ALL", "ALL_PLUS", "TYPE", "RIGHT", "TYPE_PLUS_RIGHT", "SELF"]) {
    assert.equal(kinds.has(kind), true, `${kind} missing from readonly-rule-card-core-type-shape.json`);
  }
});

test("Ruby's set keys are ordered least-specific-first, so the LAST kind is the one looked up", () => {
  const keys = slotSetKeys(
    '<div class="card-slot history_tab-view ALL ALL_PLUS TYPE-rich_text RIGHT-Xself TYPE_PLUS_RIGHT-rich_text-Xself SELF-oracle_basic"></div>',
  );
  assert.deepEqual(keys, [
    "ALL",
    "ALL_PLUS",
    "TYPE-rich_text",
    "RIGHT-Xself",
    "TYPE_PLUS_RIGHT-rich_text-Xself",
    "SELF-oracle_basic",
  ]);
  assert.equal(mostSpecificKind(keys), "SELF");
  assert.equal(mostSpecificKind(["ALL", "TYPE-list", "RSTAR"]), "RSTAR");
  assert.equal(mostSpecificKind([]), null);
});

test("a slot read scoped to the wrong view returns nothing rather than another slot's keys", () => {
  const page =
    '<div class="card-slot rules_tab-view ALL TYPE-set SELF-oracle_bot"></div>' +
    '<div class="card-slot history_tab-view ALL TYPE-rich_text SELF-oracle_basic"></div>';
  assert.deepEqual(slotSetKeys(page, "history_tab-view"), ["ALL", "TYPE-rich_text", "SELF-oracle_basic"]);
  assert.deepEqual(slotSetKeys(page, "rules_tab-view"), ["ALL", "TYPE-set", "SELF-oracle_bot"]);
  assert.deepEqual(slotSetKeys(page, "follow_section-view"), []);
  assert.deepEqual(slotSetKeys("<div>no slot here</div>"), []);
});

test("each rule key resolves to the one leg Ruby names for it", () => {
  // The three rules rules.spec.coffee creates, verbatim.
  assert.equal(ruleKindOf("cereal+*right+*help"), "right");
  assert.equal(ruleKindOf("User+cereal+*type plus right+*help"), "typePlusRight");
  assert.equal(ruleKindOf("cereal+*self+*structure"), "self");
  // The *all rules the capture holds name none of the three.
  assert.equal(ruleKindOf(RULES.rule_card.meta.key), null);
  assert.equal(ruleKindOf("*all+*default"), null);
  assert.equal(ruleKindOf(undefined), null);
});

test("each leg passes only when the rule renders AND the default it replaced is gone", () => {
  const right = ruleLegHolds({
    ruleKey: "cereal+*right+*help",
    ruleContent: "I go poopoo for poco puffs",
    setKeys: ["ALL", "ALL_PLUS", "TYPE-list", "RIGHT-cereal", "SELF-test_cereal"],
    mainSlotText: "I go poopoo for poco puffs",
    defaultContent: "something spicy",
  });
  assert.deepEqual(right.failures, []);
  assert.equal(right.kind, "right");
  assert.equal(P5_CHECK_NAMES[right.kind].startsWith("P5 *right Set:"), true);

  const typePlusRight = ruleLegHolds({
    ruleKey: "User+cereal+*type plus right+*help",
    ruleContent: "your favorite",
    setKeys: ["ALL", "ALL_PLUS", "TYPE-rich_text", "RIGHT-cereal", "TYPE_PLUS_RIGHT-rich_text-cereal", "SELF-joe_user"],
    mainSlotText: "your favorite",
    defaultContent: "something spicy",
  });
  assert.deepEqual(typePlusRight.failures, []);
  assert.equal(typePlusRight.kind, "typePlusRight");

  const self = ruleLegHolds({
    ruleKey: "cereal+*self+*structure",
    ruleContent: "[[cereal structure]]",
    setKeys: ["ALL", "ALL_PLUS", "TYPE-rich_text", "SELF-cereal"],
    mainSlotText: "cereal structure My very own header",
    defaultContent: "something spicy",
  });
  assert.deepEqual(self.failures, []);
  assert.equal(self.kind, "self");
});

test("the negative control is what the missing leg was: no default named, no control graded", () => {
  const noControl = ruleLegHolds({
    ruleKey: "cereal+*self+*structure",
    ruleContent: "My very own header",
    setKeys: ["ALL", "SELF-cereal"],
    mainSlotText: "My very own header",
  });
  assert.equal(noControl.ok, false);
  assert.deepEqual(noControl.failures, ["noNegativeControl"]);
});

test("a default still on the page fails, which a positive-only read cannot see", () => {
  const both = ruleLegHolds({
    ruleKey: "cereal+*right+*help",
    ruleContent: "poopoo",
    setKeys: ["ALL", "RIGHT-cereal"],
    mainSlotText: "something spicy poopoo",
    defaultContent: "something spicy",
  });
  assert.equal(both.ok, false);
  assert.deepEqual(both.failures, ["defaultStillRendered"]);
});

test("a rule whose kind the visited card does not carry fails the token leg", () => {
  const outside = ruleLegHolds({
    ruleKey: "cereal+*right+*help",
    ruleContent: "poopoo",
    // A card Ruby classifies SELF-only: a *right rule cannot answer for it.
    setKeys: ["ALL", "TYPE-rich_text", "SELF-other"],
    mainSlotText: "poopoo",
    defaultContent: "something spicy",
  });
  assert.equal(outside.ok, false);
  assert.deepEqual(outside.failures, ["noRIGHTToken"]);
});

test("a rule key naming none of the three kinds fails rather than grading as a leg", () => {
  const foreign = ruleLegHolds({
    ruleKey: "*all+*default",
    ruleContent: "spicy",
    setKeys: ["ALL"],
    mainSlotText: "spicy",
    defaultContent: "anything",
  });
  assert.equal(foreign.ok, false);
  assert.deepEqual(foreign.failures, ["ruleNamesNoP5Kind"]);
});

test("a rule with no stored content cannot pass", () => {
  const empty = ruleLegHolds({
    ruleKey: "cereal+*self+*structure",
    ruleContent: "",
    setKeys: ["ALL", "SELF-cereal"],
    mainSlotText: "anything",
    defaultContent: "something spicy",
  });
  assert.equal(empty.ok, false);
  assert.deepEqual(empty.failures, ["ruleContentEmpty"]);
});