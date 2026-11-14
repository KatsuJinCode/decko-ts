// register-events-follow-cache-expired-for-new-preference-oracle-parity.test.ts
// - the card-mod-follow `cache_expired_for_new_preference` event row, tied
// to the EXECUTED Ruby oracle capture.
//
// The family's own audit (commit 804a7c99) closed this row from the SOURCE
// and said so: "no Ruby engine was executed for this row in this session".
// This file is the other half. The capture
// (tests/server/oracle-capture-follow-cache-expired-for-new-preference-ruby.rb)
// ran the PINNED body over recording doubles and recorded what Ruby asked
// for; the cases below pin the port against that record.
//
// WHAT THE CAPTURE RECORDED. The pinned body is one call
// (`Card.follow_caches_expired`), and the pinned method behind it is
// exactly two cache drops and nothing else:
//   Card.clear_follower_ids_cache
//   Card::Rule.clear_preference_cache
// So the event's whole observable effect is DROPPING TWO CACHES. A port
// that holds neither cache cannot answer the next reader differently from
// a Ruby deck whose caches were just dropped.

import { describe, expect, it } from "vitest";
import {
  createActionsTestStorage,
  seedCard,
  seedStandardDeck,
  SET_TYPE_ID,
  type ActionsTestStorage,
} from "../actions/actions-test-storage.js";
import cardModFollow from "../../../src/card/mod-loader/mods/card-mod-follow.js";
import { resolveFollowers } from "../../../src/card/notify/index.js";
import { declaredEvents, readOracle } from "./register-events-oracle-helpers.js";

const ID = {
  setting: 101,
  user: 102,
  follow: 103,
  always: 104,
  never: 105,
  self: 106,
  account: 108,
  email: 109,
  joeUser: 110,
  joeAccount: 401,
  joeEmail: 402,
  watchedCard: 111,
  selfSet: 405,
  prefJoin: 403,
  prefRow: 404,
} as const;

/** The follow deck the freshness arm needs: the *follow setting, the
 *  option cards, Joe as a User with an account email, and a watched card
 *  under its own *self set. */
async function seedFollowDeck(storage: ActionsTestStorage): Promise<void> {
  await seedStandardDeck(storage);
  await seedCard(storage, { id: ID.setting, name: "Setting", codename: "setting", typeId: 3 });
  await seedCard(storage, { id: ID.user, name: "User", codename: "user", typeId: 3 });
  await seedCard(storage, { id: ID.follow, name: "*follow", codename: "follow", typeId: ID.setting });
  await seedCard(storage, { id: ID.always, name: "*always", codename: "always" });
  await seedCard(storage, { id: ID.never, name: "*never", codename: "never" });
  await seedCard(storage, { id: ID.self, name: "*self", codename: "self", typeId: ID.setting });
  await seedCard(storage, { id: ID.account, name: "*account", codename: "account" });
  await seedCard(storage, { id: ID.email, name: "*email", codename: "email" });
  await seedCard(storage, { id: ID.joeUser, name: "Joe User", typeId: ID.user });
  await seedCard(storage, { id: ID.joeAccount, leftId: ID.joeUser, rightId: ID.account });
  await seedCard(storage, {
    id: ID.joeEmail,
    leftId: ID.joeAccount,
    rightId: ID.email,
    dbContent: "joe@example.com",
  });
  await seedCard(storage, { id: ID.watchedCard, name: "Watched Card", dbContent: "v1" });
  await seedCard(storage, {
    id: ID.selfSet,
    leftId: ID.watchedCard,
    rightId: ID.self,
    typeId: SET_TYPE_ID,
  });
}

/** One `Set+User+*follow` preference: the set+user junction row plus the
 *  preference row the resolver reads. */
async function seedFollowRule(
  storage: ActionsTestStorage,
  content: string,
): Promise<void> {
  await seedCard(storage, { id: ID.prefJoin, leftId: ID.selfSet, rightId: ID.joeUser });
  await seedCard(storage, {
    id: ID.prefRow,
    leftId: ID.prefJoin,
    rightId: ID.follow,
    dbContent: content,
  });
}

describe("card-mod-follow cache_expired_for_new_preference against the EXECUTED Ruby oracle", () => {
  it("the pinned body ran and its whole effect was two cache drops", () => {
    const captured = readOracle("follow-cache-expired-for-new-preference");

    expect(captured.executed.raised).toBeNull();
    expect(captured.executed.recorded_calls).toEqual([
      "Card.clear_follower_ids_cache",
      "Card::Rule.clear_preference_cache",
    ]);
    expect(captured.executed.recorded_call_count).toBe(2);

    // the pinned bytes the capture executed
    expect(captured.pinned_declaration).toBe(
      "event :cache_expired_for_new_preference, :integrate, when: :preference? do",
    );
    expect(captured.pinned_body.trim()).toBe("Card.follow_caches_expired");
    expect(captured.pinned_cache_method.body).toContain("Card.clear_follower_ids_cache");
    expect(captured.pinned_cache_method.body).toContain("Card::Rule.clear_preference_cache");
    // and the cache the first drop clears, read by the pinned read path
    expect(captured.pinned_cache_key).toContain("FOLLOWER_IDS");
    expect(captured.pinned_cache_read.body).toContain("Card.cache.read");
  });

  it("the port's declaration carries Ruby's clauses and the honest no-op body", () => {
    const captured = readOracle("follow-cache-expired-for-new-preference");
    expect(captured.pinned_declaration).toContain(":integrate");
    expect(captured.pinned_declaration).toContain("when: :preference?");

    const decl = declaredEvents(cardModFollow).find(
      (d) => d.event === "cache_expired_for_new_preference",
    );
    expect(decl, "cache_expired_for_new_preference not declared").toBeDefined();
    expect(decl!.setPath).toBe("right/follow");
    expect(decl!.at).toBe("integrate");
    expect(decl!.when).toBe("preference?");
    expect(decl!.on).toBeUndefined();
    // Ruby's effect is cache drops; the port holds no cache, so the
    // registered body stays the honest no-op rather than a faked partial.
    expect(typeof decl!.fn).toBe("function");
    expect((decl!.fn as () => unknown)()).toBeUndefined();
  });

  it("EQUIVALENCE: a preference flip is visible to the very next read, which is what the two cache drops guarantee", async () => {
    const storage = await createActionsTestStorage();
    await seedFollowDeck(storage);
    await seedFollowRule(storage, "*always");

    const before = await resolveFollowers(storage.engine, ID.watchedCard);
    expect(before.map((r) => r.followerName)).toEqual(["Joe User"]);

    // the preference flips in place, as a save through this event's gate
    // would write it
    await storage.driver.query(
      "UPDATE cards SET db_content = ? WHERE id = ?",
      ["*never", ID.prefRow],
    );

    const after = await resolveFollowers(storage.engine, ID.watchedCard);
    expect(after).toEqual([]);
  });
});
