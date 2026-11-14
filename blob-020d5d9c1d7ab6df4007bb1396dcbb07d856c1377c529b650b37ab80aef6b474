// cap-N9 - a cardtype card's own body in its content view.
//
//   node --test tools/edge-signed-in-exercise/test/n9-cardtype-body.test.mjs
//
// THE PIN. The caps-legs leg (checks-capability-legs.mjs, the N9 group) used
// to grade the card's STORED body string on the page. That predicate cannot
// be satisfied by a Ruby-faithful port, and the mechanism is Ruby's own
// content read path:
//
//   card-1.110.0 lib/card/content/all.rb:5-7
//     def content
//       structured_content || standard_content
//     end
//   :25-28
//     def structured_content
//       structure && default_content
//     end
//   :18-20
//     def standard_content
//       db_content || (new_card? ? default_content : "")
//     end
//   card-1.110.0 mod/core/set/all/content.rb:26-28
//     def default_content
//       template&.db_content
//     end
//   card-mod-content-0.20.0 set/all/templating.rb:40-48
//     def structure
//       template&.is_structure? ? template : nil
//     end
//     def structure_rule_card
//       return unless (card = rule_card :structure, skip_modules: true)
//       card.db_content&.strip == "_self" ? nil : card
//     end
//
// The card's TYPE carries a *type+*structure rule (the deck's
// "User+*type+*structure"), so `structure` is that rule card and
// `structured_content` is the RULE's db_content - the type's field template.
// The card's own db_content is the standard_content arm, and
// structured_content WINS. The cardtype card's body is therefore the type's
// structure rendered FOR the card: the structure's own field slots carry the
// card's NAME in their titles ("<card name>+image"), which is the
// card-specific body text.
//
// The port reads that shape the same way (src/card/rules/structure.ts:318-333
// resolveStructuredContent, :354-364 structuredCardContent - "template wins
// over the card's own db_content"; the candidate walk is
// src/card/set-patterns/rule-names.ts:52-65, and the TYPE pattern's set name
// is the type card's NAME - card-1.110.0
// mod/core/set_pattern/03_type.rb:23-27). The engine-level pin for that
// reading is tests/card/render/n9-cardtype-body-content-view.test.ts.
//
// The sibling leg (checks-content-flows.mjs:1087) grades the same shape with
// the same marker - `${userCard}+${field}` - and passes on this deck (the
// recorded run docs/runs/edge-signed-in-exercise-round8-n9-2026-10-24.json:
// the page's main text reads "add_box Harness_CF_User_...+image Contact
// Information ...").
//
// This pin holds the leg to that shape: it grades the cardtype body marker
// the structure renders, it keeps the stored body as a recorded diagnostic,
// and it names the mechanism in the leg's own text so the next reader does
// not have to rediscover it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const capsLegs = readFileSync(new URL("../checks-capability-legs.mjs", import.meta.url), "utf8");
const contentFlows = readFileSync(new URL("../checks-content-flows.mjs", import.meta.url), "utf8");

test("the caps-legs N9 leg grades the cardtype card's body marker, not the stored body", () => {
  // The leg's marker is the card's own name as the structure renders it.
  assert.match(capsLegs, /const cardBodyMarker = `\$\{userCard\}\+`;/);
  // The leg grades THAT marker.
  assert.match(capsLegs, /&& cardBodyRendered,/);
  // The stored body is recorded as a diagnostic, not as the page predicate.
  assert.match(capsLegs, /storedBodyRenders: rendered\.markers\[body\] === true/);
  assert.match(capsLegs, /bodyStored: bodyStored != null && bodyStored\.includes\(body\)/);
  // The old predicate is gone: the stored body string is no longer a page
  // condition.
  assert.equal(/&& rendered\.markers\[body\] === true,/.test(capsLegs), false);
});

test("the leg names the mechanism it grades by", () => {
  // The Ruby content read path the shape turns on.
  assert.match(capsLegs, /structured_content \|\| standard_content/);
  assert.match(capsLegs, /content\/all\.rb:5-7/);
  assert.match(capsLegs, /content\/all\.rb:25-28/);
  assert.match(capsLegs, /mod\/core\/set\/all\/content\.rb:26-28/);
  // The cardtype instance: the structure's field slots carry the card's name.
  assert.match(capsLegs, /CARDTYPE INSTANCE/);
  assert.match(capsLegs, /<card name>\+image/);
});

test("the sibling leg grades the same marker", () => {
  assert.match(contentFlows, /const bodyMarker = userSurface\.namedSlots\.length > 0 \? `\$\{userCard\}\+\$\{userSurface\.namedSlots\[0\]\}` : null;/);
});
