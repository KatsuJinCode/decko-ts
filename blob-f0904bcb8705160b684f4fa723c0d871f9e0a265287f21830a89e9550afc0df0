// nested-card-slots.test.mjs — "did this page render a slot for THIS card?",
// answered the way the ENGINE answers it.
//
// THE DEFECT THIS PINS. A card's KEY is not its name. Ruby's
// `Cardname#simple_key` (cardname-1.110.0 lib/cardname.rb:106-118) maps
// every underscore-separated word of the name through
// `Variants#stable_key` (lib/cardname/variants.rb:56-62), which applies the
// deck's uninflect method - `:singularize` by default (lib/cardname.rb:34) -
// once, keeping the original word when the result is not idempotent.
// ActiveSupport's default singular rules include
// `inflect.singular(/s$/i, "")` (active_support/inflections.rb:35), so
//
//     "Harness_CF_Chain_A_mviramas"  ->  key "harness_cf_chain_a_mvirama"
//
// A rendered nest slot carries that KEY in its SELF- class token and the
// card's NAME beside it in data-card-name.
//
// THE RED THIS PINS. The 2026-10-21 whole-family run (branch
// port/matrix-journey-tranche7-20261021) failed the N10 check on a page the
// engine had rendered correctly: the run's base-36 timestamp ended in "s",
// the slots' tokens carried the singularized keys, and the check graded the
// token against the name. The run's own captured page proves the engine was
// right - the served page carried every nested card's data-card-name and the
// same bytes the tranche-6 run served (33101 vs 33148, the difference being
// the class tokens' length).
//
// The observations below are the run's own: the recorded slot rows, the
// recorded stamp, and the recorded names.
//
// Usage:
//   node --test tools/edge-signed-in-exercise/test/nested-card-slots.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { slotCardNames, rendersNestedCard, nestedCardsRendered } from "../lib/nested-card-slots.mjs";

// The slots the 2026-10-21 run's page carried, verbatim: the SELF- token is
// the card's KEY (singularized), the data-card-name is the card's NAME.
const recordedSlots = [
  { name: "Harness_CF_Page_mviramas", token: "SELF-harness_cf_page_mvirama" },
  { name: "Harness_CF_File_mviramas", token: "SELF-harness_cf_file_mvirama" },
  { name: "Harness_CF_Chain_A_mviramas", token: "SELF-harness_cf_chain_a_mvirama" },
  { name: "Harness_CF_Chain_B_mviramas", token: "SELF-harness_cf_chain_b_mvirama" },
  { name: "Harness_CF_Chain_C_mviramas", token: "SELF-harness_cf_chain_c_mvirama" },
  { name: "Harness_CF_Loop_A_mviramas", token: "SELF-harness_cf_loop_a_mvirama" },
  { name: "Harness_CF_Loop_B_mviramas", token: "SELF-harness_cf_loop_b_mvirama" },
];

test("the names the engine states are the cards the page rendered", () => {
  assert.deepEqual(slotCardNames(recordedSlots), [
    "Harness_CF_Page_mviramas",
    "Harness_CF_File_mviramas",
    "Harness_CF_Chain_A_mviramas",
    "Harness_CF_Chain_B_mviramas",
    "Harness_CF_Chain_C_mviramas",
    "Harness_CF_Loop_A_mviramas",
    "Harness_CF_Loop_B_mviramas",
  ]);
  assert.deepEqual(slotCardNames([]), []);
  assert.deepEqual(slotCardNames(undefined), []);
  assert.deepEqual(slotCardNames([{ name: null }, { name: "" }]), []);
});

test("a card whose key is not its name is still recognised as rendered", () => {
  // This is the red: the key "harness_cf_chain_a_mvirama" is not the name
  // "Harness_CF_Chain_A_mviramas", and the old check compared them.
  assert.equal(rendersNestedCard(recordedSlots, "Harness_CF_Chain_A_mviramas"), true);
  assert.equal(rendersNestedCard(recordedSlots, "Harness_CF_File_mviramas"), true);
  assert.equal(rendersNestedCard(recordedSlots, "Harness_CF_Loop_B_mviramas"), true);
});

test("a card the page did not render is not claimed", () => {
  assert.equal(rendersNestedCard(recordedSlots, "Harness_CF_Chain_D_mviramas"), false);
  assert.equal(rendersNestedCard(recordedSlots, "harness_cf_chain_a_mvirama"), false, "the KEY is not the card");
  assert.equal(rendersNestedCard(recordedSlots, ""), false);
  assert.equal(rendersNestedCard([], "Harness_CF_Chain_A_mviramas"), false);
});

test("the chain reads as three rendered levels, in order", () => {
  assert.deepEqual(
    nestedCardsRendered(recordedSlots, ["Harness_CF_Chain_A_mviramas", "Harness_CF_Chain_B_mviramas", "Harness_CF_Chain_C_mviramas"]),
    [true, true, true],
  );
  assert.deepEqual(
    nestedCardsRendered(recordedSlots, ["Harness_CF_Chain_A_mviramas", "Harness_CF_Chain_D_mviramas"]),
    [true, false],
  );
  assert.deepEqual(nestedCardsRendered(recordedSlots, undefined), []);
});

test("the name match is case-insensitive, the way a card's name is", () => {
  assert.equal(rendersNestedCard(recordedSlots, "harness_cf_chain_a_mviramas"), true);
  assert.equal(rendersNestedCard(recordedSlots, "HARNESS_CF_CHAIN_A_MVIRAMAS"), true);
});

test("the token alone never decides: a slot with the wrong token and the right name counts", () => {
  const slots = [{ name: "Harness_CF_Chain_A_mviramas", token: "SELF-something-else" }];
  assert.equal(rendersNestedCard(slots, "Harness_CF_Chain_A_mviramas"), true);
});
