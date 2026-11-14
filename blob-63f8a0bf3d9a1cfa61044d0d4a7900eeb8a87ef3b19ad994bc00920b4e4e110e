// The follow-rule runtime unit tests: the follow option list
// (lib/card/follow_option.rb + set/self/*.rb) and
// the follow-rule READ walk (set/all/follow.rb + set/all/follow/followed_by.rb
// + set/type/set.rb), exercised against the real LocalSqliteDriver with
// seeded preference rows.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import {
  FOLLOW_OPTION_ALL,
  FOLLOW_OPTION_MAIN,
  FOLLOW_OPTION_RESTRICTIVE,
  followOptionDescription,
} from "../../../src/card/follow/follow-options.js";
import {
  followRuleNameFor,
  followSetCardName,
  followedByUser,
  followRuleOptionFor,
  preferenceNamesForUser,
} from "../../../src/card/follow/follow-rule-walk.js";

let storage: RenderTestStorage | undefined;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;

  // codename/set-pattern anchor cards
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: 13 });
  await seedCard(s, { id: 11, name: "*self", codename: "self", typeId: 13 });
  await seedCard(s, { id: 12, name: "*type", codename: "type", typeId: 13 });
  await seedCard(s, { id: 13, name: "*set", codename: "set", typeId: 13 });
  await seedCard(s, { id: 14, name: "*setting", codename: "setting", typeId: 14 });
  // the follow settings/options (codename cards)
  await seedCard(s, { id: 110, name: "*follow", codename: "follow", typeId: 14 });
  await seedCard(s, { id: 111, name: "*follow fields", codename: "follow_fields", typeId: 14 });
  await seedCard(s, { id: 112, name: "*always", codename: "always", typeId: 14 });
  await seedCard(s, { id: 113, name: "*never", codename: "never", typeId: 14 });
  await seedCard(s, { id: 114, name: "*created", codename: "created", typeId: 14 });
  await seedCard(s, { id: 115, name: "*edited", codename: "edited", typeId: 14 });

  // the User cardtype card (codename "user" — the preference SQL's
  // users.type_id join key, rule/preference_cache.rb) + users
  await seedCard(s, { id: 3, name: "User", codename: "user", typeId: 13 });
  await seedCard(s, { id: 300, name: "Fixture Actor", typeId: 3 });
  await seedCard(s, { id: 301, name: "Second Actor", typeId: 3 });

  // a followed card + its set
  await seedCard(s, { id: 200, name: "Make Contact", dbContent: "contact body" });
  // "Make Contact+*self" set card (Set-typed)
  await seedCard(s, {
    id: 210,
    name: "Make Contact+*self",
    leftId: 200,
    rightId: 11,
    typeId: 13,
  });

  // The first actor's follow preference on that set: [[*always]]
  // (4-part preference name "Make Contact+*self+Fixture Actor+*follow")
  await seedCard(s, {
    id: 220,
    name: "Make Contact+*self+Fixture Actor+*follow",
    leftId: 215,
    rightId: 110,
    typeId: 14,
    dbContent: "*always",
  });
  // the 3-part left "Make Contact+*self+Fixture Actor"
  await seedCard(s, {
    id: 215,
    name: "Make Contact+*self+Fixture Actor",
    leftId: 210,
    rightId: 300,
    typeId: 14,
  });

  // The second actor follows the same set with [[*never]]
  await seedCard(s, {
    id: 216,
    name: "Make Contact+*self+Second Actor",
    leftId: 210,
    rightId: 301,
    typeId: 14,
  });
  await seedCard(s, {
    id: 221,
    name: "Make Contact+*self+Second Actor+*follow",
    leftId: 216,
    rightId: 110,
    typeId: 14,
    dbContent: "*never",
  });
}, 60_000);

afterAll(() => {
  storage?.close();
});

describe("follow option list (lib/card/follow_option.rb + set/self/*.rb)", () => {
  it("registers the four options in self-file load order on the :all list", () => {
    // always (self/always.rb:2), created (self/created.rb:2), edited
    // (self/edited.rb:2), never (self/never.rb:2) — each add_option also
    // appends to codenames(:all) in registration (dir-walk) order.
    expect(FOLLOW_OPTION_ALL).toEqual(["always", "created", "edited", "never"]);
  });

  it("positions the main list as Ruby's insert_option arithmetic leaves it", () => {
    // follow_opts position: 2 -> main[1] = :always (self/always.rb:2);
    // follow_opts position: 3 -> main[2] = :never (self/never.rb:2).
    // [][1]=:always leaves a leading nil (follow_option.rb:36-40 FIXME).
    expect(FOLLOW_OPTION_MAIN).toEqual([null, "always", "never"]);
  });

  it("positions the restrictive list [created, edited]", () => {
    // restrictive_follow_opts position: 1 -> restrictive[0] = :created
    // (self/created.rb:2); position: 2 -> restrictive[1] = :edited
    // (self/edited.rb:2).
    expect(FOLLOW_OPTION_RESTRICTIVE).toEqual(["created", "edited"]);
  });

  it("describes options the way description(set_card) does", () => {
    // default description = set_card.follow_label
    // (set/abstract/follow_option.rb:5-7); created/edited override
    // (self/created.rb:11-13, self/edited.rb:11-13).
    expect(followOptionDescription("always", "cards I worked on")).toBe(
      "cards I worked on",
    );
    expect(followOptionDescription("created", "cards I worked on")).toBe(
      "cards I worked on I created",
    );
    expect(followOptionDescription("edited", "cards I worked on")).toBe(
      "cards I worked on I edited",
    );
  });
});

describe("follow rule name construction (set/all/follow.rb + set/type/set.rb)", () => {
  it("builds [set, user, *follow] names (type/set.rb:19-21)", () => {
    expect(followRuleNameFor("Make Contact+*self", "Fixture Actor")).toBe(
      "Make Contact+*self+Fixture Actor+*follow",
    );
  });

  it("builds the userless rule name (compact drops nil)", () => {
    expect(followRuleNameFor("Make Contact+*self")).toBe(
      "Make Contact+*self+*follow",
    );
  });

  it("resolves follow_set_card (set/all/follow.rb:19-21 -> name+*self)", () => {
    expect(followSetCardName("Make Contact")).toBe("Make Contact+*self");
  });
});

describe("follow rule read walk (followed_by.rb + rule.rb preference_names)", () => {
  it("reads the set names a user holds follow preferences for (rule.rb:39-45)", async () => {
    const names = await preferenceNamesForUser(storage!.fetcher, "Fixture Actor");
    expect(names).toContain("Make Contact+*self+Fixture Actor+*follow");
  });

  it("walks the first applicable follow-rule option (followed_by.rb:39-43)", async () => {
    const s = storage!;
    const card = await s.fetcher.fetchByName("Make Contact");
    const alwaysOption = await followRuleOptionFor(s.fetcher, card!, 300);
    expect(alwaysOption).toBe("*always"); // the first actor: *always applies
    const neverOption = await followRuleOptionFor(s.fetcher, card!, 301);
    expect(neverOption).toBeNull(); // the second: the *never test returns false (self/never.rb:5)
  });

  it("answers followedByUser from the preference walk (followed_by.rb:8-10)", async () => {
    const s = storage!;
    const card = await s.fetcher.fetchByName("Make Contact");
    expect(await followedByUser(s.fetcher, card!, 300)).toBe(true);
    expect(await followedByUser(s.fetcher, card!, 301)).toBe(false);
  });
});

// THE READ A DECK-WIDE RULE IS ANSWERED BY. Ruby never materializes a
// per-card preference row for a deck-wide rule: preference_card_id
// (card-1.110.0 lib/card/rule/all.rb:25-31,66-73) walks the card's
// rule_lookup_keys and, per set, tries the user's own preference and then
// that set's *all-user default. So a viewer whose follow is configured on
// the *all set holds an option on EVERY card, with no
// `<card>+*self+<viewer>+*follow` row on any of them.
//
// This is the port-side counterpart of the ACT-155 W4 leg's member clause:
// the leg's stored read cannot see this answer, and grading it would grade
// the instrument's storage assumption instead of the engine's behaviour.
describe("follow preference resolution across the card's rule lookup keys", () => {
  beforeAll(async () => {
    const s = storage!;
    // ONE deck-wide preference, shared by both legs: the *all set's rule for
    // the first actor. Its +*follow option is *always. Nothing is
    // materialized for it on any individual card.
    await seedCard(s, { id: 230, name: "*all+Fixture Actor", leftId: 10, rightId: 300, typeId: 14 });
    await seedCard(s, {
      id: 231,
      name: "*all+Fixture Actor+*follow",
      leftId: 230,
      rightId: 110,
      typeId: 14,
      dbContent: "*always",
    });
  });

  it("answers a deck-wide *all preference for a card with nothing materialized on its own set", async () => {
    const s = storage!;
    // "Deck Wide Card+*self+Fixture Actor+*follow" does NOT exist.
    await seedCard(s, { id: 240, name: "Deck Wide Card" });
    await seedCard(s, { id: 241, name: "Deck Wide Card+*self", leftId: 240, rightId: 11, typeId: 13 });

    const card = await s.fetcher.fetchByName("Deck Wide Card");
    // the walk reaches the *all key and answers *always
    expect(await followRuleOptionFor(s.fetcher, card!, 300)).toBe("*always");
    // and the viewer follows the card: all_user_ids_with_rule_for expands
    // the *all-user rule to every user (rule.rb:47-51,55-57)
    expect(await followedByUser(s.fetcher, card!, 300)).toBe(true);
    // a viewer with no preference anywhere answers null
    expect(await followRuleOptionFor(s.fetcher, card!, 301)).toBeNull();
  });

  it("stops at the first set holding a preference row, even when that option does not apply", async () => {
    const s = storage!;
    // a card whose own +*self set holds *never for the same viewer
    await seedCard(s, { id: 250, name: "Overridden Card" });
    await seedCard(s, { id: 251, name: "Overridden Card+*self", leftId: 250, rightId: 11, typeId: 13 });
    await seedCard(s, { id: 252, name: "Overridden Card+*self+Fixture Actor", leftId: 251, rightId: 300, typeId: 14 });
    await seedCard(s, {
      id: 253,
      name: "Overridden Card+*self+Fixture Actor+*follow",
      leftId: 252,
      rightId: 110,
      typeId: 14,
      dbContent: "*never",
    });

    const card = await s.fetcher.fetchByName("Overridden Card");
    // THE ORDER MATTERS AND IT IS NOT "first applicable option anywhere".
    // preference_card_id (rule/all.rb:25-31) resolves the SET first: the
    // card's own +*self set holds a preference row, so it wins over the
    // deck-wide *all key. Only THEN does all_follow_rule_options split that
    // set's content and follow_rule_option (followed_by.rb:39-43) run the
    // applicability test on it. *never's test returns false
    // (set/self/never.rb:5), so the answer is null; Ruby does NOT continue
    // outward to the *all key, which would have answered *always.
    expect(await followRuleOptionFor(s.fetcher, card!, 300)).toBeNull();
    // and the viewer does NOT follow this card, the same resolution seen
    // through followed_by?
    expect(await followedByUser(s.fetcher, card!, 300)).toBe(false);
  });

  it("answers the card's own +*self preference when that option applies", async () => {
    const s = storage!;
    // a card whose own +*self set holds *created, an option whose registered
    // test admits this viewer (set/self/created.rb)
    await seedCard(s, { id: 260, name: "Own Set Card" });
    await seedCard(s, { id: 261, name: "Own Set Card+*self", leftId: 260, rightId: 11, typeId: 13 });
    await seedCard(s, { id: 262, name: "Own Set Card+*self+Fixture Actor", leftId: 261, rightId: 300, typeId: 14 });
    await seedCard(s, {
      id: 263,
      name: "Own Set Card+*self+Fixture Actor+*follow",
      leftId: 262,
      rightId: 110,
      typeId: 14,
      dbContent: "*always",
    });

    const card = await s.fetcher.fetchByName("Own Set Card");
    expect(await followRuleOptionFor(s.fetcher, card!, 300)).toBe("*always");
  });
});
