// cap-P6 - the administrator's update rule, seeded the way the read rule is
// seeded.
//
//   node --test tools/edge-signed-in-exercise/test/p6-seed-rule.test.mjs
//
// THE PIN. Both permission rules are seeded through the create route with
// card[type] "List" and card[content] "[[Anyone]]". The rule card is a
// LIST-type card: the committed Ruby capture
// (fixtures/captured/rules-views.json rule_card.meta) records it as
// type_name "List", type_code "list", db_content "Anyone" - the set
// MEMBERSHIP, one name per line. The type is load-bearing, because the port
// reads a permission rule's parties from the rule card's REFERENCE rows
// (src/card/permissions/view-task-rules.ts, who_can) and only a List-typed
// card's items create those rows
// (src/card/actions/refresh-references-out.ts).
//
// WHAT THE WRONG TYPE COST. The seed used to say "Phrase", on the reading
// that a rule card is a phrase whose content is a list of references. A
// Phrase-typed rule card stores the same words with no reference behind
// them, so the editor's save left the rule reaching NOBODY (the seed's
// Anyone reference was dropped with it) and the update leg graded the
// member's refusal off the card page instead of the write.
//
// The earlier form is pinned here as well: a Set-typed card whose content is
// the bare word, and the Phrase type, are both gone.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const rules = readFileSync(new URL("../checks-permission-rules.mjs", import.meta.url), "utf8");

test("the update rule is seeded the way the read rule is seeded", () => {
  // The read rule's seed.
  assert.match(rules, /"card\[name\]": readRule, "card\[type\]": "List", "card\[content\]": "\[\[Anyone\]\]"/);
  // The update rule's seed: the same type and the same content form.
  assert.match(rules, /"card\[name\]": updateRule, "card\[type\]": "List", "card\[content\]": "\[\[Anyone\]\]"/);
});

test("neither permission rule is seeded as a card that carries no reference", () => {
  // A Set-typed card whose content is the bare word is not a rule card.
  assert.equal(/"card\[name\]": updateRule, "card\[type\]": "Set"/.test(rules), false);
  assert.equal(/"card\[name\]": updateRule, "card\[type\]": "Phrase", "card\[content\]": "Anyone"/.test(rules), false);
  // The Phrase type is gone from BOTH of this row's seeds: a Phrase-typed
  // rule card keeps its membership in words, and the port reads the
  // membership from the rule card's reference rows. The P7 leg's own seed is
  // a different row's contract and names its party in LINK form
  // ("[[Administrator]]"), which the link walk reads for any card type.
  assert.equal(/"card\[name\]": (readRule|updateRule), "card\[type\]": "Phrase", "card\[content\]": "\[\[Anyone\]\]"/.test(rules), false);
});
