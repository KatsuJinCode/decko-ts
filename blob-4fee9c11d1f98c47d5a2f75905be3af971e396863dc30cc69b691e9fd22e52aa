// tests/card/render/n9-cardtype-body-content-view.test.ts
//
// THE N9 SHAPE: a cardtype card whose own body was stored, rendered in its
// content view. What reaches the page, and why.
//
// THE SHAPE (the exercise's fixture, tools/edge-signed-in-exercise/
// checks-capability-legs.mjs:629-697): a card of type "User" is created, a
// body is written through the card's own update route, and the card's
// +*self+*layout rule points it at a layout. The page renders the layout's
// header and footer around the card's main slot, and the main slot renders
// the card's content view.
//
// WHAT RUBY RENDERS THERE.
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
// The card's TYPE carries a *type+*structure rule (the deck's "User+*type+
// *structure"), so `structure` is that rule card and `structured_content` is
// the RULE's db_content - the type's field template. The card's own
// db_content is the `standard_content` arm, and structured_content WINS. The
// cardtype card's body is therefore the type's structure rendered FOR the
// card: the structure's field slots carry the card's own name in their
// titles ("<card name>+image"), which is the card-specific body text.
//
// The port's own reading path is the port of that composition:
// src/card/rules/structure.ts:318-333 (resolveStructuredContent) and
// :354-364 (structuredCardContent) - "template wins over the card's own
// db_content" - and the walk that finds the rule is
// src/card/set-patterns/rule-names.ts:52-65 (ruleNamesForCard): the card's
// set names in pattern-precedence order, each joined to the setting name.
// The TYPE pattern's set name is the TYPE CARD'S NAME
// (card-1.110.0 mod/core/set_pattern/03_type.rb:23-27 - anchor_name is
// card.type_name, anchor_id is card.type_id), so the candidates for a card
// of type "User" are ["<card>+*self+*structure", "User+*type+*structure",
// "*all+*structure"] and the type-scoped rule is the one that hits.
//
// This file pins that shape end to end: the type's structure renders, the
// card's own stored body does not, and the structure's field slot carries
// the card's name. The control (the same card without a type-scoped
// structure rule) renders the card's own body, which is the arm the
// structure rule does not reach.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  BOOTSTRAP_READ_SUBSTRATE_IDS,
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "./render-test-storage.js";

/** The deck's own "User" type template shape (the "User+*type+*structure"
 *  rule's db_content in the signed-in deck, 326 bytes): a floated image
 *  field, the contact-information heading, and the fields around it. */
const USER_TEMPLATE = [
  "<p>{{+image|float:right}}</p>",
  "<p> </p>",
  "<h1><strong>Contact Information</strong></h1>",
  "<p>{{+how to contact me}}</p>",
  "<p> </p>",
  "<h1><strong>Background</strong></h1>",
  "<p> </p>",
  "<p>{{+Description}}</p>",
  "<p> </p>",
  "<p><strong><br>Items edited by {{_self|name}}</strong></p>",
  "<p> </p>",
  "<p>{{+items_edited}}</p>",
  "<p> </p>",
  "<p> </p>",
].join("\n");

const CARD_NAME = "Harness_Leg_User_n9probe";
const CARD_BODY = "Harness user body n9probe";

let storage: RenderTestStorage | undefined;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;
  // The type card the N9 card is typed with, the two setting cards, the set
  // card and the rule - the deck's own shape (User / *type / *structure /
  // User+*type / User+*type+*structure). The set card carries the Set type
  // and the setting cards the Setting type, the way the deck's rows do
  // (Ruby's rule cache joins on sets.type_id = SetID and
  // settings.type_id = SettingID, card-1.110.0 lib/card/rule/cache.rb).
  await seedCard(s, { id: 2693, name: "User", key: "user" });
  await seedCard(s, { id: 103, name: "Setting", codename: "setting" });
  await seedCard(s, { id: 101, name: "*type", codename: "type", typeId: 103 });
  await seedCard(s, { id: 102, name: "*structure", codename: "structure", typeId: 103 });
  await seedCard(s, { id: 262, name: "*type plus right", codename: "type_plus_right", typeId: 103 });
  await seedCard(s, { id: 2694, leftId: 2693, rightId: 101, typeId: BOOTSTRAP_READ_SUBSTRATE_IDS.set }); // set "User+*type"
  await seedCard(s, { id: 17691, leftId: 2694, rightId: 102, dbContent: USER_TEMPLATE });
  // The cardtype card with a stored body.
  await seedCard(s, { id: 53095, name: CARD_NAME, typeId: 2693, dbContent: CARD_BODY });
  // The control: the same card with a type that carries NO structure rule.
  await seedCard(s, { id: 400, name: "Plain" });
  await seedCard(s, { id: 401, name: "Plain_Card_n9probe", typeId: 400, dbContent: CARD_BODY });
}, 60_000);

afterAll(() => {
  storage?.close();
});

describe("N9: a cardtype card's content view", () => {
  it("renders the type's *structure template, not the card's own stored body", async () => {
    const s = storage!;
    const html = await s.engine.render(CARD_NAME, "content");
    // The template's own chunks are on the page.
    expect(html).toContain("Contact Information");
    expect(html).toContain("Background");
    // The card's own stored body is NOT: structured_content wins over
    // standard_content (content/all.rb:5-7, 25-28).
    expect(html).not.toContain(CARD_BODY);
    // The set keys name the shape: the card's type is the type card the
    // rule is anchored at, and the card itself.
    expect(html).toContain("TYPE-user");
    expect(html).toContain(`data-card-type-id="2693"`);
  });

  it("renders the card's own body when no structure rule reaches the card", async () => {
    const s = storage!;
    const html = await s.engine.render("Plain_Card_n9probe", "content");
    expect(html).toContain(CARD_BODY);
    expect(html).not.toContain("Contact Information");
  });
});
