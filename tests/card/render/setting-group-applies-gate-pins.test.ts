// Pins for the setting-group applies gate (the Message trio's
// editing-group over-enumeration): the "editing" group header must read
// `editing <span class="_count badge bg-secondary
// ms-3">3</span>` with THREE denied nav-items; the pre-fix engine read
// `5</span>` with FIVE.
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
// the pair is visible for NO set card (the editing badge stays at 3:
// help, input_type, guide — the *sidebar+*self case cited in views.ts
// SETTING_NEVER_VISIBLE).
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
// CORRECTION: the applies lambdas are NOT
// evaluated on this path — visible_settings calls applies_to_cardtype with
// ONE argument, so only restricted_to_type decides. Message+Conversation's
// badge 3 comes from the prototype's TYPE: templating.rb new_card_template
// makes the set's Search-typed *structure rule the template, so the
// prototype types Search and the restricted pair is not listed. The fixture
// below carries that structure rule; a List prototype (no structure rule)
// lists the pair (badge 5).

import { describe, it, expect, afterAll } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "./render-test-storage.js";
import { DeckoName } from "../../../src/card/name.js";

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
  // The set's own *default rule card (List-typed): the TPR prototype's
  // type chain reads it
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
  // The set's *structure rule (Search-typed). templating.rb
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
      // *home: a stored POINTER card (the *home+*self prototype: self
      // arm, real-card type — editing badge 5). The pair renders here —
      // a blanket SETTING_NEVER_VISIBLE drop regressed this shape.
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

describe("visible_setting_codenames (card-mod-rules set/type/set.rb:73-75)", () => {
  it("lists every applicable setting for a Set card, and nothing for a non-Set card", async () => {
    const s = await seedDeck();
    await seedCard(s, { id: 10, name: "Pointer", codename: "pointer", typeId: 2 });
    await seedCard(s, { id: 50, name: "*home", codename: "home", typeId: 10 });
    await seedCard(s, { id: 52, name: "*self", codename: "self", typeId: 2 });
    await seedCard(s, { id: 51, leftId: 50, rightId: 52, typeId: 5 });
    const all = [
      "structure", "default", "autoname", "create", "read", "update", "delete", "captcha",
      "head", "layout", "style", "script", "help", "input_type", "guide",
      "content_options", "content_option_view", "on_create", "on_update", "on_delete",
      "thanks", "follow_fields", "follow",
    ];
    await s.fetcher.codenames.ensureLoaded();
    expect(await s.engine.visibleSettingCodenamesFor("Message+Conversation+*type plus right")).toEqual(
      all.filter((c) => c !== "content_options" && c !== "content_option_view"),
    );
    expect(await s.engine.visibleSettingCodenamesFor("*home+*self")).toEqual(all);
    expect(await s.engine.visibleSettingCodenamesFor("Message")).toBeUndefined();
    // the call loads the *default universe itself, so the new-card type
    // walk works afterwards whatever ran first (Search: the set's
    // Search-typed *structure rule is the template)
    expect(s.engine.newCardDefaultType(DeckoName.parse("A Message+Conversation"), "Message")?.typeName).toBe("Search");
  });
});

describe("anchorless set prototypes (06_rule.rb, 04_star.rb prototype_args)", () => {
  it("the *rule set's prototype is the stored *all+*create card, so its List type admits the restricted pair", async () => {
    const s = await seedDeck();
    await seedCard(s, { id: 60, name: "*all", codename: "all", typeId: 5 });
    await seedCard(s, { id: 61, name: "*create", codename: "create", typeId: 2 });
    await seedCard(s, { id: 62, leftId: 60, rightId: 61, typeId: 3 }); // *all+*create, List
    await seedCard(s, { id: 63, name: "*rule", codename: "rule", typeId: 5 });
    await seedCard(s, { id: 64, name: "*star", codename: "star", typeId: 5 });
    await s.fetcher.codenames.ensureLoaded();
    await s.engine.prepareItemForRender("*all+*create");
    const rule = await s.engine.visibleSettingCodenamesFor("*rule");
    expect(rule).toContain("content_options");
    expect(rule).toContain("content_option_view");
    // *star's prototype is a new "*dummy" card: no list type, no pair
    const star = await s.engine.visibleSettingCodenamesFor("*star");
    expect(star).not.toContain("content_options");
  });
});
