// The *nests arm of followed_field? (the follow port's named remainder):
// card-mod-follow-0.20.0 set/all/follow/followed_by.rb:16-31 walks the left
// card's *follow_fields rule items and matches each item key against the
// field card's key OR the *nests codename key - the *nests arm asks
// nested_card? (followed_by.rb:29-31): is the field card INCLUDED in the
// left card's content? The inclusion set is nestee_ids
// (card-mod-history-0.20.0 set/all/history.rb:55-57 + nesting_ids
// :98-102): card_references rows with ref_type "I" and referer_id = the
// left card - the same reference graph src/card/actions/refresh-references-
// out.ts maintains on writes.
//
// The rule read itself follows rule_card(:follow_fields) (followed_by.rb:19
// -> lib/card/rule/all.rb rule_card): the left card's set names in pattern
// order - "<left>+*self+*follow fields", then "<type>+*type+*follow
// fields", then the *all fall-back the follow mod seeds with content
// "*nests" (card-mod-follow-0.20.0 data/real.yml:42-46).
//
// RED state: follow-rule-walk.ts reads a literal "<left>+*follow fields"
// name (a name Ruby's rule_card walk never reads) and answers false for
// the *nests arm.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import { followedByUser } from "../../../src/card/follow/follow-rule-walk.js";

let storage: RenderTestStorage | undefined;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;

  // codename/set-pattern anchors (the follow runtime's seed shape)
  await seedCard(s, { id: 2, name: "Basic", typeId: 13 });
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: 13 });
  await seedCard(s, { id: 11, name: "*self", codename: "self", typeId: 13 });
  await seedCard(s, { id: 12, name: "*type", codename: "type", typeId: 13 });
  await seedCard(s, { id: 13, name: "*set", codename: "set", typeId: 13 });
  await seedCard(s, { id: 14, name: "*setting", codename: "setting", typeId: 14 });
  await seedCard(s, { id: 110, name: "*follow", codename: "follow", typeId: 14 });
  await seedCard(s, { id: 111, name: "*follow fields", codename: "follow_fields", typeId: 14 });
  await seedCard(s, { id: 112, name: "*always", codename: "always", typeId: 14 });
  await seedCard(s, { id: 113, name: "*never", codename: "never", typeId: 14 });
  // the *nests codename card (card-mod-search-0.20.0 data/real.yml:89-90)
  await seedCard(s, { id: 116, name: "*nests", codename: "nests", typeId: 14 });

  // users
  await seedCard(s, { id: 3, name: "User", codename: "user", typeId: 13 });
  await seedCard(s, { id: 300, name: "Casey", typeId: 3 });

  // --- LEFT 1: *nests rule + an inclusion row -> the arm fires -------------
  await seedCard(s, { id: 402, name: "status", typeId: 2 });
  await seedCard(s, { id: 400, name: "Project Book", typeId: 2, dbContent: "book body" });
  await seedCard(s, {
    id: 401, name: "Project Book+status", leftId: 400, rightId: 402, typeId: 2,
  });
  await seedCard(s, {
    id: 410,
    name: "Project Book+*self+*follow fields",
    leftId: 411, rightId: 111, typeId: 14,
    dbContent: "*nests",
  });
  await seedCard(s, {
    id: 411, name: "Project Book+*self", leftId: 400, rightId: 11, typeId: 13,
  });
  await seedCard(s, {
    id: 420,
    name: "Project Book+*self+Casey+*follow",
    leftId: 421, rightId: 110, typeId: 14,
    dbContent: "*always",
  });
  await seedCard(s, {
    id: 421, name: "Project Book+*self+Casey", leftId: 411, rightId: 300, typeId: 14,
  });
  await seedReference(s, 400, 401, "project_book_x_status", "I");

  // --- LEFT 2: *nests rule + only a LINK reference row -> the arm stays
  // false (nestee_ids selects ref_type "I" rows only, history.rb:98-102) ---
  await seedCard(s, { id: 405, name: "status two", typeId: 2 });
  await seedCard(s, { id: 403, name: "Linked Book", typeId: 2, dbContent: "linked body" });
  await seedCard(s, {
    id: 404, name: "Linked Book+status two", leftId: 403, rightId: 405, typeId: 2,
  });
  await seedCard(s, {
    id: 430,
    name: "Linked Book+*self+*follow fields",
    leftId: 431, rightId: 111, typeId: 14,
    dbContent: "*nests",
  });
  await seedCard(s, {
    id: 431, name: "Linked Book+*self", leftId: 403, rightId: 11, typeId: 13,
  });
  await seedCard(s, {
    id: 440,
    name: "Linked Book+*self+Casey+*follow",
    leftId: 441, rightId: 110, typeId: 14,
    dbContent: "*always",
  });
  await seedCard(s, {
    id: 441, name: "Linked Book+*self+Casey", leftId: 431, rightId: 300, typeId: 14,
  });
  await seedReference(s, 403, 404, "linked_book_x_status_two", "L");

  // --- LEFT 3: the by-key arm (rule names the field by its RELATIVE name
  // — item_names(context: self) resolves "+status three" against the left
  // card; no reference row at all) -------------------------------------------
  await seedCard(s, { id: 407, name: "status three", typeId: 2 });
  await seedCard(s, { id: 406, name: "Keyed Book", typeId: 2, dbContent: "keyed body" });
  await seedCard(s, {
    id: 408, name: "Keyed Book+status three", leftId: 406, rightId: 407, typeId: 2,
  });
  await seedCard(s, {
    id: 450,
    name: "Keyed Book+*self+*follow fields",
    leftId: 451, rightId: 111, typeId: 14,
    dbContent: "+status three",
  });
  await seedCard(s, {
    id: 451, name: "Keyed Book+*self", leftId: 406, rightId: 11, typeId: 13,
  });
  await seedCard(s, {
    id: 460,
    name: "Keyed Book+*self+Casey+*follow",
    leftId: 461, rightId: 110, typeId: 14,
    dbContent: "*always",
  });
  await seedCard(s, {
    id: 461, name: "Keyed Book+*self+Casey", leftId: 451, rightId: 300, typeId: 14,
  });

  // --- LEFT 4: NO *self rule - the *all fall-back rule carries *nests
  // (card-mod-follow data/real.yml:42-46) ------------------------------------
  await seedCard(s, { id: 410 + 100, name: "status four", typeId: 2 });
  await seedCard(s, { id: 409, name: "All-Ruled Book", typeId: 2, dbContent: "all body" });
  await seedCard(s, {
    id: 401 + 100, name: "All-Ruled Book+status four", leftId: 409, rightId: 510, typeId: 2,
  });
  await seedCard(s, {
    id: 470,
    name: "*all+*follow fields",
    leftId: 10, rightId: 111, typeId: 14,
    dbContent: "*nests",
  });
  // the set-card junction row (the id-pair chain needs every junction row)
  await seedCard(s, {
    id: 471, name: "All-Ruled Book+*self", leftId: 409, rightId: 11, typeId: 13,
  });
  await seedCard(s, {
    id: 480,
    name: "All-Ruled Book+*self+Casey+*follow",
    leftId: 481, rightId: 110, typeId: 14,
    dbContent: "*always",
  });
  await seedCard(s, {
    id: 481, name: "All-Ruled Book+*self+Casey", leftId: 471, rightId: 300, typeId: 14,
  });
  await seedReference(s, 409, 501, "all_ruled_book_x_status_four", "I");
}, 60_000);

afterAll(() => {
  storage?.close();
});

describe("*nests arm of followed_field? (followed_by.rb:16-31 + nestee_ids)", () => {
  it("follows the field when the left's *follow_fields rule says *nests and the left INCLUDES the field (ref_type I)", async () => {
    const s = storage!;
    const field = await s.fetcher.fetchByName("Project Book+status");
    expect(await followedByUser(s.fetcher, field!, 300)).toBe(true);
  });

  it("does NOT satisfy the *nests arm with a LINK reference (ref_type L, not I)", async () => {
    const s = storage!;
    const field = await s.fetcher.fetchByName("Linked Book+status two");
    expect(await followedByUser(s.fetcher, field!, 300)).toBe(false);
  });

  it("keeps the by-key arm (rule item matches the field key; no reference row)", async () => {
    const s = storage!;
    const field = await s.fetcher.fetchByName("Keyed Book+status three");
    expect(await followedByUser(s.fetcher, field!, 300)).toBe(true);
  });

  it("carries the *nests arm through the *all fall-back rule when no *self rule exists", async () => {
    const s = storage!;
    const field = await s.fetcher.fetchByName("All-Ruled Book+status four");
    expect(await followedByUser(s.fetcher, field!, 300)).toBe(true);
  });
});
