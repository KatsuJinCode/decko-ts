// cap-P6 - the administrator's update rule, seeded the way the read rule is
// seeded.
//
//   node --test tools/edge-signed-in-exercise/test/p6-seed-rule.test.mjs
//
// THE PIN. The read leg seeds its rule through the create route with
// card[type] "Phrase" and card[content] "[[Anyone]]" - a rule card is a
// PHRASE whose content is a list of card references. The update leg seeded
// its rule with card[type] "Set" and the bare word "Anyone", and the create
// was REFUSED: the signed-in run of 2026-10-22 recorded the leg as
// "P6 seed update rule was not stored (HTTP 422)" - the leg never reached
// the Rules tab at all.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("the update rule is seeded the way the read rule is seeded", () => {
  const rules = readFileSync(new URL("../checks-permission-rules.mjs", import.meta.url), "utf8");
  // The read rule's seed.
  assert.match(rules, /"card\[name\]": readRule, "card\[type\]": "Phrase", "card\[content\]": "\[\[Anyone\]\]"/);
  // The update rule's seed: the same type and the same content form.
  assert.match(rules, /"card\[name\]": updateRule, "card\[type\]": "Phrase", "card\[content\]": "\[\[Anyone\]\]"/);
  // And the old form is gone: a Set-typed card whose content is the bare
  // word is not a rule card.
  assert.equal(/"card\[name\]": updateRule, "card\[type\]": "Set"/.test(rules), false);
  assert.equal(/"card\[name\]": updateRule, "card\[type\]": "Phrase", "card\[content\]": "Anyone"/.test(rules), false);
});
