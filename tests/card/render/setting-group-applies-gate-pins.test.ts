// Pins for the setting-group applies gate — the serializer-followup2 census
// mechanism M2 (the Message trio's editing-group over-enumeration).
//
// Census bytes (tmp/serializer-followup/probe-green5, Message+Conversation+
// *type plus right:page/:open/:content): the live accordion's "editing"
// group header reads `editing <span class="_count badge bg-secondary
// ms-3">3</span>` with THREE denied nav-items; the engine read `5</span>`
// with FIVE.
//
// Ruby mechanism (card-mod-rules set/type/set.rb:76-84 visible_settings):
// every group setting must pass applies_to_cardtype(prototype.type_id)
// (card-1.110.0 lib/card/setting.rb:74-77) = `!restricted_to_type ||
// restricted_to_type.include?(type_id)` AND the setting's `applies` lambda.
// content_options / content_option_view (card-mod-list set/self/
// content_options.rb:2 + content_option_view.rb:2, restricted_to_type
// list/pointer/session) carry `applies:` lambdas whose
// supports_content_options? / supports_content_option_view? predicates are
// constant-false across the loaded mods (card-mod-list set/all/
// supports_content_options.rb:8-15; no overriding set module exists) — so
// the pair is visible for NO set card and the deck-wide oracle pins the
// editing badge at 3 (help, input_type, guide — the *sidebar+*self pin
// cited in views.ts SETTING_NEVER_VISIBLE).
//
// The engine's group seam DIVERGED: visibleGroupSettings (the mod-file
// accordion + bar_setting_list flat seam) drops SETTING_NEVER_VISIBLE,
// while visibleSettingsForGroup (the page-lane renderCategoryAccordion +
// the render.ts virtual-rule verdict preloads) applies only the
// restricted_to_type half of applies_to_cardtype — and the *type plus
// right prototype resolves list-typed (the set's *default rule is a List),
// so the restricted pair passed the gate and the engine rendered 5.
// The fix folds the constant-false applies pair into the one gate every
// consumer shares, Ruby's applies_to_cardtype semantics.
//
// CORRECTION (2026-10-06, engine-parity lane): the applies lambdas are NOT
// evaluated on this path — visible_settings calls applies_to_cardtype with
// ONE argument, so only restricted_to_type decides. Message+Conversation's
// badge 3 comes from the prototype's TYPE: templating.rb new_card_template
// makes the set's Search-typed *structure rule the template, so the
// prototype types Search and the restricted pair is not listed. The fixture
// below carries that structure rule; a List prototype (no structure rule)
// lists the pair (badge 5), as 829/829 captured set boards confirm.

import { describe, it, expect, afterAll } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "./render-test-storage.js";

let storage: RenderTestStorage | undefined;

afterAll(() => {
  storage?.close();
});

/** Seed the Message trio's set shape: Message (RichText) + Conversation
 *  (Basic) + the *type plus right SET card, whose prototype (a new
 *  Message+Conversation card typed through the *default rule = List)
 *  is list-coded — the case where the restricted_to_type half alone
 *  wrongly passes content_options/content_option_view. */
async function seedDeck(): Promise<RenderTestStorage> {
  storage = await createRenderTestStorage();
  await seedCard(storage, { id: 2, name: "Basic", codename: "basic", typeId: 2 });
  await seedCard(storage, { id: 3, name: "List", codename: "list", typeId: 2 });
  await seedCard(storage, { id: 4, name: "RichText", codename: "rich_text", typeId: 2 });
  await seedCard(storage, { id: 5, name: "Set", codename: "set", typeId: 2 });
  await seedCard(storage, {
    id: 22,
    name: "*type plus right",
    codename: "type_plus_right",
    typeId: 2,
  });
  await seedCard(storage, { id: 40, name: "Message", typeId: 4 });
  await seedCard(storage, { id: 41, name: "Conversation", typeId: 2 });
  // The junction + the SET card (Set-typed per the Right::TypePlusRight
  // assign_type registration).
  await seedCard(storage, { id: 42, leftId: 40, rightId: 41, typeId: 2 });
  await seedCard(storage, { id: 43, leftId: 42, rightId: 22, typeId: 5 });
  // The set's own *default rule card (List-typed — the corpus's card
  // 22020): the TPR prototype's type chain reads it
  // (08_type_plus_right.rb prototype_args -> type_id_from_template), so
  // setPrototypeTypeCode resolves "list" and the restricted_to_type half
  // alone wrongly passes content_options/content_option_view.
  await seedCard(storage, {
    id: 23,
    name: "*default",
    codename: "default",
    typeId: 2,
  });
  await seedCard(storage, {
    id: 44,
    leftId: 43,
    rightId: 23,
    typeId: 3,
    dbContent: "",
  });
  // The set's *structure rule (Search-typed — the corpus's Message+
  // Conversation+*type plus right+*structure). templating.rb
  // new_card_template: a structure rule that applies to the *default-typed
  // dup BECOMES the template, so the prototype types Search, not List.
  await seedCard(storage, { id: 6, name: "Search", codename: "search_type", typeId: 2 });
  await seedCard(storage, { id: 24, name: "*structure", codename: "structure", typeId: 2 });
  await seedCard(storage, {
    id: 45,
    leftId: 43,
    rightId: 24,
    typeId: 6,
    dbContent: '{"right_plus":"Conversation"}',
  });
  return storage;
}

describe("setting-group applies gate (census M2, Message editing-group shape)", () => {
  it(
    "the editing group counts 3 (help, input_type, guide) — the Search-typed structure template keeps the pair out",
    async () => {
      const s = await seedDeck();
      const html = await s.engine.render("Message+Conversation+*type plus right", "open");
      expect(html).toContain(
        'editing <span class="_count badge bg-secondary ms-3">3</span>',
      );
      expect(html).not.toContain(
        'editing <span class="_count badge bg-secondary ms-3">5</span>',
      );
    },
  );

  it(
    "the other groups keep their registered sizes (permission 5, webpage 4)",
    async () => {
      const s = await seedDeck();
      const html = await s.engine.render("Message+Conversation+*type plus right", "open");
      expect(html).toContain(
        'permission <span class="_count badge bg-secondary ms-3">5</span>',
      );
      expect(html).toContain(
        'webpage <span class="_count badge bg-secondary ms-3">4</span>',
      );
    },
  );

  it(
    "a STORED-pointer prototype keeps the pair (the *home+*self oracle pins editing badge 5)",
    async () => {
      const s = await seedDeck();
      // *home: a stored POINTER card (the oracle's *home+*self prototype:
      // self arm, real-card type — badge 5 in
      // expected-v2/view-lane/recapture-raw-shard-000005.jsonl). The pair
      // renders here — a blanket SETTING_NEVER_VISIBLE drop regressed this
      // shape (census M2 refit).
      await seedCard(s, { id: 10, name: "Pointer", codename: "pointer", typeId: 2 });
      await seedCard(s, { id: 50, name: "*home", codename: "home", typeId: 10 });
      await seedCard(s, { id: 52, name: "*self", codename: "self", typeId: 2 });
      await seedCard(s, { id: 51, leftId: 50, rightId: 52, typeId: 5 });
      const html = await s.engine.render("*home+*self", "open");
      expect(html).toContain(
        'editing <span class="_count badge bg-secondary ms-3">5</span>',
      );
    },
  );
});
