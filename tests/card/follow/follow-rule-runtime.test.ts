// The follow-rule runtime unit tests: the port of the follow option list
// (card-mod-follow-0.20.0 lib/card/follow_option.rb + set/self/*.rb) and
// the follow-rule READ walk (set/all/follow.rb + set/all/follow/followed_by.rb
// + set/type/set.rb), exercised against the real LocalSqliteDriver with
// seeded preference rows.
//
// RED state: these modules do not exist yet — src/card/follow/*.ts is the
// lane-follow port under test.

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
  await seedCard(s, { id: 300, name: "Brandon", typeId: 3 });
  await seedCard(s, { id: 301, name: "Sara", typeId: 3 });

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

  // Brandon's follow preference on that set: [[*always]]
  // (4-part preference name "Make Contact+*self+Brandon+*follow")
  await seedCard(s, {
    id: 220,
    name: "Make Contact+*self+Brandon+*follow",
    leftId: 215,
    rightId: 110,
    typeId: 14,
    dbContent: "*always",
  });
  // the 3-part left "Make Contact+*self+Brandon"
  await seedCard(s, {
    id: 215,
    name: "Make Contact+*self+Brandon",
    leftId: 210,
    rightId: 300,
    typeId: 14,
  });

  // Sara follows the same set with [[*never]]
  await seedCard(s, {
    id: 216,
    name: "Make Contact+*self+Sara",
    leftId: 210,
    rightId: 301,
    typeId: 14,
  });
  await seedCard(s, {
    id: 221,
    name: "Make Contact+*self+Sara+*follow",
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
    expect(followRuleNameFor("Make Contact+*self", "Brandon")).toBe(
      "Make Contact+*self+Brandon+*follow",
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
    const names = await preferenceNamesForUser(storage!.fetcher, "Brandon");
    expect(names).toContain("Make Contact+*self+Brandon+*follow");
  });

  it("walks the first applicable follow-rule option (followed_by.rb:39-43)", async () => {
    const s = storage!;
    const card = await s.fetcher.fetchByName("Make Contact");
    const alwaysOption = await followRuleOptionFor(s.fetcher, card!, 300);
    expect(alwaysOption).toBe("*always"); // Brandon: *always applies
    const neverOption = await followRuleOptionFor(s.fetcher, card!, 301);
    expect(neverOption).toBeNull(); // Sara: *never test returns false (self/never.rb:5)
  });

  it("answers followedByUser from the preference walk (followed_by.rb:8-10)", async () => {
    const s = storage!;
    const card = await s.fetcher.fetchByName("Make Contact");
    expect(await followedByUser(s.fetcher, card!, 300)).toBe(true);
    expect(await followedByUser(s.fetcher, card!, 301)).toBe(false);
  });
});
