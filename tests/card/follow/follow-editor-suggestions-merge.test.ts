// The follow-editor suggestions merge (the follow port's named remainder):
// card-mod-follow-0.20.0 set/type_plus_right/user/follow/
// follow_editor_helper.rb:83-90 suggested_following_rule_options_hash reads
// card.suggestions (user/follow.rb:21-23: Card[:follow_suggestions]&.
// item_names || [] - the "follow suggestions" codename card's items,
// data/real.yml:37-41) and folds each suggestion into the editor's current
// rule/options hash through merge_option_hashes (:63-70): a suggestion
// whose rule key is already held appends its option (uniq, existing order
// first); the remaining suggestions become NEW editor rows appended after
// the held rules. The merge runs only when card.current_user?
// (user/follow.rb:25-27: Auth.signed_in? && Auth.current_id == left.id -
// the rendered User+*follow card's LEFT is the session actor).
//
// Per-suggestion parsing: a_set_and_option_suggestion (:95-99) splits the
// item into set (name left) + option (name right) and requires
// valid_set_card (:117-120: the fetched card's type_code is :set);
// suggested_follow_option (:101-106) resolves the option by NAME then by
// CODENAME and falls back to *always unless the card is a follow option
// (set/all/follow.rb:14-16: its codename is in FollowOption.codenames).
//
// RED state: followEditorRows renders the empty suggestions arm only - the
// opts parameter and the merge walk do not exist.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import { followEditorRows } from "../../../src/card/follow/follow-render-seam.js";

let storage: RenderTestStorage | undefined;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;

  // codename/set-pattern anchors
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: 13 });
  await seedCard(s, { id: 11, name: "*self", codename: "self", typeId: 13 });
  await seedCard(s, { id: 12, name: "*type", codename: "type", typeId: 13 });
  await seedCard(s, { id: 13, name: "*set", codename: "set", typeId: 13 });
  await seedCard(s, { id: 14, name: "*setting", codename: "setting", typeId: 14 });
  await seedCard(s, { id: 110, name: "*follow", codename: "follow", typeId: 14 });
  await seedCard(s, { id: 111, name: "*always", codename: "always", typeId: 14 });
  await seedCard(s, { id: 112, name: "*never", codename: "never", typeId: 14 });
  await seedCard(s, { id: 113, name: "*created", codename: "created", typeId: 14 });
  await seedCard(s, { id: 114, name: "*edited", codename: "edited", typeId: 14 });
  // the follow suggestions codename card (data/real.yml:37-41: name is
  // "follow suggestions" - no star; type List)
  await seedCard(s, {
    id: 120,
    name: "follow suggestions",
    codename: "follow_suggestions",
    typeId: 14,
    dbContent: [
      "Make Contact+*self+always", // name -> codename fallback arm; uniq no-op on the held rule
      "Deck+*type+*created", // a not-held rule -> appended row
      "Soda+*self+bogus", // no such option card -> *always fallback row
      "Not A Set+*always", // left is not Set-typed -> skipped (valid_set_card)
    ].join("\n"),
  });

  // users
  await seedCard(s, { id: 3, name: "User", codename: "user", typeId: 13 });
  await seedCard(s, { id: 300, name: "Riley", typeId: 3 });

  // set cards
  await seedCard(s, { id: 200, name: "Make Contact", dbContent: "contact body" });
  await seedCard(s, {
    id: 210, name: "Make Contact+*self", leftId: 200, rightId: 11, typeId: 13,
  });
  await seedCard(s, { id: 500, name: "Deck", typeId: 2 });
  await seedCard(s, {
    id: 510, name: "Deck+*type", leftId: 500, rightId: 12, typeId: 13,
  });
  await seedCard(s, { id: 520, name: "Soda", typeId: 2 });
  await seedCard(s, {
    id: 530, name: "Soda+*self", leftId: 520, rightId: 11, typeId: 13,
  });
  // the NOT-a-set suggestion target
  await seedCard(s, { id: 540, name: "Not A Set", typeId: 2 });

  // Riley's held follow rule: [[*always]] on Make Contact+*self
  await seedCard(s, {
    id: 215, name: "Make Contact+*self+Riley", leftId: 210, rightId: 300, typeId: 14,
  });
  await seedCard(s, {
    id: 220,
    name: "Make Contact+*self+Riley+*follow",
    leftId: 215, rightId: 110, typeId: 14,
    dbContent: "*always",
  });
}, 60_000);

afterAll(() => {
  storage?.close();
});

describe("follow-editor suggestions merge (follow_editor_helper.rb:83-90)", () => {
  it("merges suggestions into the follow tab rows when the trunk IS the session actor", async () => {
    const s = storage!;
    const { following } = await followEditorRows(s.fetcher, "Riley", {
      sessionId: 300,
      trunkId: 300,
    });
    // held rule first (SQL order), its option list stays [*always] - the
    // suggested "always" item resolves to *already-present *always and the
    // uniq drops it
    expect(following).toEqual([
      {
        ruleCardName: "Make Contact+*self+Riley+*follow",
        option: "*always",
        ruleSetName: "Make Contact+*self",
      },
      // not-held suggestions appended in item order (current.merge suggested):
      // the Deck+*type rule as the KEY string (cardname.rb generate_key:
      // part_keys.join("+"); Card.fetch key, new: {} - the preference card
      // does not exist; the new card's name is the key), option *created
      // resolved through the *created card
      {
        ruleCardName: "deck+*type+riley+*follow",
        option: "*created",
        ruleSetName: "Deck+*type",
      },
      // the bogus option name falls back to *always (suggested_follow_option
      // :101-106); the Soda+*self rule row, same new-card shape
      {
        ruleCardName: "soda+*self+riley+*follow",
        option: "*always",
        ruleSetName: "Soda+*self",
      },
    ]);
  });

  it("skips suggestions whose set side is not a Set-typed card (valid_set_card :117-120)", async () => {
    const s = storage!;
    const { following } = await followEditorRows(s.fetcher, "Riley", {
      sessionId: 300,
      trunkId: 300,
    });
    expect(
      following.some((row) => row.ruleCardName.includes("not_a_set")),
    ).toBe(false);
  });

  it("merges NOTHING when the trunk is not the session actor (current_user? user/follow.rb:25-27)", async () => {
    const s = storage!;
    const { following } = await followEditorRows(s.fetcher, "Riley", {
      sessionId: 301, // Tova is signed in; the rendered trunk is Riley
      trunkId: 300,
    });
    // the held rules render (any viewer sees the editor rows) but the
    // suggestions arm contributes nothing
    expect(following).toEqual([
      {
        ruleCardName: "Make Contact+*self+Riley+*follow",
        option: "*always",
        ruleSetName: "Make Contact+*self",
      },
    ]);
  });

  it("merges NOTHING without an options bag (the pre-merge call shape stays valid)", async () => {
    const s = storage!;
    const { following } = await followEditorRows(s.fetcher, "Riley");
    expect(following).toEqual([
      {
        ruleCardName: "Make Contact+*self+Riley+*follow",
        option: "*always",
        ruleSetName: "Make Contact+*self",
      },
    ]);
  });

  it("appends a suggested option to a held rule when it is not already offered (merge :64-68)", async () => {
    const s = storage!;
    // extend the suggestions card with a *created offer on the held rule:
    // current options [*always] + suggested [*created] uniq -> [*always, *created]
    await s.counting.query(`UPDATE cards SET db_content = ? WHERE id = 120`, [
      [
        "Make Contact+*self+always",
        "Make Contact+*self+*created",
        "Deck+*type+*created",
        "Soda+*self+bogus",
        "Not A Set+*always",
      ].join("\n"),
    ]);
    const { following } = await followEditorRows(s.fetcher, "Riley", {
      sessionId: 300,
      trunkId: 300,
    });
    const held = following.find(
      (row) => row.ruleCardName === "Make Contact+*self+Riley+*follow",
    );
    expect(held?.option).toBe("*always");
    const heldOptions = following
      .filter(
        (row) => row.ruleCardName === "Make Contact+*self+Riley+*follow",
      )
      .map((row) => row.option);
    expect(heldOptions).toEqual(["*always", "*created"]);
    // restore for the other tests' determinism
    await s.counting.query(`UPDATE cards SET db_content = ? WHERE id = 120`, [
      [
        "Make Contact+*self+always",
        "Deck+*type+*created",
        "Soda+*self+bogus",
        "Not A Set+*always",
      ].join("\n"),
    ]);
  });
});
