// The resolveRuleRowsByKeys universe-per-generation cache (the
// anon-cold-remainder fix): the first resolution builds the deck's WHOLE
// composed-key universe with ONE statement, and every further call — repeat,
// reordered, or a wholly different key set — answers from that Map with zero
// new SQL (content reads are the only per-call statements, memoized per
// rule-card id). These tests pin that contract so the cache cannot drift:
//
// 1. UNIVERSE ONCE — many DISTINCT key sets across calls issue exactly ONE
//    statement total (the universe build); a missing key is a plain miss.
// 2. CONTENT READS ARE PER-ID — a withContent call reads only the rule-card
//    ids it resolved, and a shared rule card is read once even when reached
//    through different key sets.
// 3. EXACT ROWS — ids and content match the seeded rows; without content the
//    content field is null.
// (Staleness/invalidation, driver scoping, and empty-keys contracts are
// pinned by rule-resolution-memo.test.ts — same WeakMap, same
// expireRuleResolutionCache seam.)

import { describe, expect, it } from "vitest";
import {
  resolveRuleRowsByKeys,
} from "../../../src/card/permissions/read-rules.js";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../render/render-test-storage.js";

async function seedUniverseDeck(): Promise<RenderTestStorage> {
  const storage = await createRenderTestStorage();
  await seedCard(storage, { id: 1, name: "*all", typeId: 3 });
  await seedCard(storage, { id: 2, name: "*read", typeId: 3 });
  await seedCard(storage, { id: 3, name: "*update", typeId: 3 });
  await seedCard(storage, { id: 5, name: "Adv", typeId: 4, dbContent: "advice" });
  await seedCard(storage, { id: 30, name: "*all+*read", leftId: 1, rightId: 2, typeId: 3, dbContent: "anyone" });
  await seedCard(storage, { id: 31, name: "*all+*update", leftId: 1, rightId: 3, typeId: 3, dbContent: "administrator" });
  return storage;
}

describe("resolveRuleRowsByKeys universe-per-generation cache", () => {
  it("builds the universe once; distinct key sets answer with zero new statements", async () => {
    const storage = await seedUniverseDeck();
    try {
      const driver = storage.fetcher.driver;
      storage.counting.reset(); // the seed INSERTs ride the counting driver too
      const first = await resolveRuleRowsByKeys(driver, ["*all+*read", "adv"], false);
      expect(first.get("*all+*read")?.id).toBe(30);
      expect(first.get("adv")?.id).toBe(5);
      expect(storage.counting.snapshot().statements).toBe(1); // the universe build

      // A WHOLLY DIFFERENT key set — the per-key-set memo would have paid a
      // statement here; the universe answers from the Map.
      const second = await resolveRuleRowsByKeys(driver, ["*all+*update"], false);
      expect(second.get("*all+*update")?.id).toBe(31);
      expect(storage.counting.snapshot().statements).toBe(1);

      // A key that exists nowhere is a plain miss, still zero statements.
      const miss = await resolveRuleRowsByKeys(driver, ["*missing+*read"], false);
      expect(miss.size).toBe(0);
      expect(storage.counting.snapshot().statements).toBe(1);
    } finally {
      storage.close();
    }
  });

  it("reads content lazily per rule-card id and never re-reads a memoized id", async () => {
    const storage = await seedUniverseDeck();
    try {
      const driver = storage.fetcher.driver;
      storage.counting.reset(); // the seed INSERTs ride the counting driver too
      const bare = await resolveRuleRowsByKeys(driver, ["*all+*read"], false);
      expect(bare.get("*all+*read")).toEqual({ id: 30, content: null });
      expect(storage.counting.snapshot().statements).toBe(1);

      const withContent = await resolveRuleRowsByKeys(driver, ["*all+*read"], true);
      expect(withContent.get("*all+*read")).toEqual({ id: 30, content: "anyone" });
      expect(storage.counting.snapshot().statements).toBe(2); // +1 content read (id 30)

      // A different key set sharing NO rule card reads only its own id.
      const other = await resolveRuleRowsByKeys(driver, ["*all+*update"], true);
      expect(other.get("*all+*update")).toEqual({ id: 31, content: "administrator" });
      expect(storage.counting.snapshot().statements).toBe(3); // +1 content read (id 31)

      // A key set reaching BOTH cards reads nothing new: id 30 and 31 are
      // both memoized already.
      const both = await resolveRuleRowsByKeys(driver, ["*all+*read", "*all+*update"], true);
      expect(both.get("*all+*read")?.content).toBe("anyone");
      expect(both.get("*all+*update")?.content).toBe("administrator");
      expect(storage.counting.snapshot().statements).toBe(3);
    } finally {
      storage.close();
    }
  });
});
