// The notification phase's follow reads: the deck's PREFERENCE ROWS and the
// USER TYPE's card ids are read ONCE per resolver, not once per card the
// walk visits and not once per event.
//
// WHY IT MATTERS. The notification phase runs AFTER the commit, so the
// transaction's read memo is gone and every read in it is a round trip of
// its own. The resolver walks the direct followers of the card AND of every
// left ancestor of the card, and it is created once per save and answers
// once per event. Before this rule the same statement -- the deck's
// preference rows, and the user type's card ids -- was read once per
// ancestor and once per event.
//
// MEASURED. In the graded save the user type's ids were read 7 times and the
// preference rows 7 times; after the rule, once each. The graded save's
// pipeline POSTs: 257 -> 245.
//
// THE ANSWERS ARE UNCHANGED. The shared read is the same statement with the
// same arguments, so the ids and the rows are the same rows the per-ancestor
// reads returned.

import { describe, expect, it } from "vitest";
import {
  createActionsTestStorage,
  seedCard,
  seedStandardDeck,
  SET_TYPE_ID,
  type ActionsTestStorage,
} from "../actions/actions-test-storage.js";
import type { FetchEngine } from "../../../src/card/fetch.js";
import {
  defaultFollowerResolver,
  followerResolutionScope,
  type SavePathEvent,
} from "../../../src/card/notify/index.js";
import { CARD_IDS_BY_TYPE_SQL } from "../../../src/card/fetch/card-read-shapes.js";

const ID = {
  set: SET_TYPE_ID,
  setting: 101,
  user: 102,
  follow: 103,
  always: 104,
  joeUser: 11,
  joeAccount: 209,
  joeEmail: 309,
  account: 108,
  email: 109,
  watchedCard: 60,
  watchedSelfSet: 460,
} as const;

const PREFERENCE_ROWS_SQL = "SELECT preferences.id AS rule_id,";

/** Count the driver's round trips by statement. A round trip is one `query`
 *  call or one `batch` call. */
function countRoundTrips(driver: ActionsTestStorage["driver"]): (sql: string) => number {
  const roundTrips = new Map<string, number>();
  const loose = driver as unknown as {
    query: (sql: string, params?: unknown[]) => Promise<unknown>;
    batch: (batchStatements: { sql: string; params?: unknown[] }[]) => Promise<unknown>;
  };
  const originalQuery = loose.query.bind(loose);
  const originalBatch = loose.batch.bind(loose);
  loose.query = async (sql: string, params?: unknown[]) => {
    const key = sql.startsWith(PREFERENCE_ROWS_SQL) ? PREFERENCE_ROWS_SQL : sql;
    roundTrips.set(key, (roundTrips.get(key) ?? 0) + 1);
    return originalQuery(sql, params);
  };
  loose.batch = async (batchStatements: { sql: string; params?: unknown[] }[]) => {
    for (const statement of batchStatements) {
      const key = statement.sql.startsWith(PREFERENCE_ROWS_SQL)
        ? PREFERENCE_ROWS_SQL
        : statement.sql;
      roundTrips.set(key, (roundTrips.get(key) ?? 0) + 1);
    }
    return originalBatch(batchStatements);
  };
  return (sql: string) => roundTrips.get(sql) ?? 0;
}

async function freshDeck(): Promise<{
  storage: ActionsTestStorage;
  engine: FetchEngine;
}> {
  const storage = await createActionsTestStorage();
  const f = await seedStandardDeck(storage);
  await seedCard(storage, { id: ID.setting, name: "Setting", codename: "setting", typeId: 3 });
  await seedCard(storage, { id: ID.user, name: "User", codename: "user", typeId: 3 });
  await seedCard(storage, { id: ID.follow, name: "*follow", codename: "follow", typeId: ID.setting });
  await seedCard(storage, { id: ID.always, name: "*always", codename: "always" });
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
  await seedCard(storage, { id: ID.watchedCard, name: "Watched Card" });
  await seedCard(storage, { id: ID.watchedSelfSet, leftId: ID.watchedCard, rightId: ID.set });
  return { storage, engine: f.engine };
}

function makeEvent(actorId: number): SavePathEvent {
  return { actor: { id: actorId } } as unknown as SavePathEvent;
}

describe("follower resolution: the deck's follow reads are paid once per resolver", () => {
  it("reads the user type's card ids once for the whole scope", async () => {
    const { storage, engine } = await freshDeck();
    const roundTrips = countRoundTrips(storage.driver);
    const scope = followerResolutionScope(engine);
    const first = await scope.userTypeIds();
    const second = await scope.userTypeIds();
    // The same ids both times: the shared read answers the same question.
    expect(second).toEqual(first);
    // ONE round trip for two answers.
    expect(roundTrips(CARD_IDS_BY_TYPE_SQL)).toBe(1);
    storage.close();
  });

  it("reads the deck's preference rows once for the whole scope", async () => {
    const { storage, engine } = await freshDeck();
    const roundTrips = countRoundTrips(storage.driver);
    const scope = followerResolutionScope(engine);
    const first = await scope.preferenceIndex();
    const second = await scope.preferenceIndex();
    expect(second).toEqual(first);
    expect(roundTrips(PREFERENCE_ROWS_SQL)).toBe(1);
    storage.close();
  });

  it("reads the deck's follow reads once for the resolver's lifetime, across events", async () => {
    const { storage, engine } = await freshDeck();
    const roundTrips = countRoundTrips(storage.driver);
    const resolver = defaultFollowerResolver(engine);
    await resolver(ID.watchedCard, makeEvent(2));
    await resolver(ID.watchedCard, makeEvent(2));
    // TWO events, ONE read of the deck's preference rows.
    expect(roundTrips(PREFERENCE_ROWS_SQL)).toBe(1);
    storage.close();
  });
});
