// The resolveRuleRowsByKeys per-driver memo (cold-signedin-504 fix): the
// cold page render re-resolves identical candidate key sets 164-168x, and
// these tests pin the memo's whole contract so the dedupe cannot drift
// into wrongness:
//
// 1. SET-SCOPED HITS — the same key set resolves once per driver; a hit
//    returns the identical mapping with ZERO new statements.
// 2. ORDER NORMALIZATION — key lists that differ in order but not content
//    hit the same entry (the statement is order-insensitive: fragments in
//    a Set, keys in an IN clause, result keyed by ckey).
// 3. withContent PARTITIONS the memo — the content projection changes the
//    returned shape, so it is part of the cache key.
// 4. STALENESS IS THE CONTRACT — after an out-of-band DB mutation the memo
//    still answers cached rows until expireRuleResolutionCache drops it;
//    the write path performs that drop on every committed save.
// 5. THE WIRING PROOF — a REAL CardActionEngine updateCard invalidates the
//    memo through CardActionEngine.expireAfterWrite with no manual call:
//    resolve -> save -> resolve must observe the new content.
// 6. DRIVER SCOPING — two drivers never share entries (per-render-context
//    lifetime, not a process-global forever-cache); the resolver itself is
//    actor-pure (no actor input; actors apply verdicts in the callers), so
//    per-driver scoping needs no actor dimension.

import { describe, expect, it } from "vitest";
import {
  expireRuleResolutionCache,
  resolveRuleRowsByKeys,
} from "../../../src/card/permissions/read-rules.js";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import {
  actionEngine,
  createActionsTestStorage,
  JOE,
  seedCard as seedActionCard,
  type ActionsTestStorage,
} from "../actions/actions-test-storage.js";

async function seedMemoDeck(): Promise<RenderTestStorage> {
  const storage = await createRenderTestStorage();
  await seedCard(storage, { id: 1, name: "*all", typeId: 3 });
  await seedCard(storage, { id: 2, name: "*read", typeId: 3 });
  await seedCard(storage, { id: 5, name: "Adv", typeId: 4, dbContent: "advice" });
  await seedCard(storage, { id: 30, name: "*all+*read", leftId: 1, rightId: 2, typeId: 3, dbContent: "anyone" });
  return storage;
}

describe("resolveRuleRowsByKeys per-driver memo", () => {
  it("resolves one key set once; repeat and reordered calls hit the memo", async () => {
    const storage = await seedMemoDeck();
    try {
      const keys = ["*all+*read", "adv"];
      const first = await resolveRuleRowsByKeys(storage.fetcher.driver, keys, false);
      expect(first.get("*all+*read")?.id).toBe(30);
      expect(first.get("adv")?.id).toBe(5);
      const afterFirst = storage.counting.snapshot().statements;

      const second = await resolveRuleRowsByKeys(storage.fetcher.driver, keys, false);
      expect(storage.counting.snapshot().statements).toBe(afterFirst); // zero new statements
      expect([...second.entries()]).toEqual([...first.entries()]);

      // Order normalization: same set, different list order -> same entry.
      const reordered = await resolveRuleRowsByKeys(storage.fetcher.driver, ["adv", "*all+*read"], false);
      expect(storage.counting.snapshot().statements).toBe(afterFirst);
      expect([...reordered.entries()]).toEqual([...first.entries()]);
    } finally {
      storage.close();
    }
  });

  it("partitions entries by withContent", async () => {
    const storage = await seedMemoDeck();
    try {
      const keys = ["*all+*read"];
      const bare = await resolveRuleRowsByKeys(storage.fetcher.driver, keys, false);
      const afterBare = storage.counting.snapshot().statements;
      const withContent = await resolveRuleRowsByKeys(storage.fetcher.driver, keys, true);
      expect(storage.counting.snapshot().statements).toBe(afterBare + 1); // separate entry
      expect(withContent.get("*all+*read")).toEqual({ id: 30, content: "anyone" });
      expect(bare.get("*all+*read")).toEqual({ id: 30, content: null });
      // ...and the two partitions are each memoized.
      await resolveRuleRowsByKeys(storage.fetcher.driver, keys, true);
      await resolveRuleRowsByKeys(storage.fetcher.driver, keys, false);
      expect(storage.counting.snapshot().statements).toBe(afterBare + 1);
    } finally {
      storage.close();
    }
  });

  it("answers stale after an out-of-band mutation until expireRuleResolutionCache drops the driver's memo", async () => {
    const storage = await seedMemoDeck();
    try {
      const keys = ["*all+*read"];
      const before = await resolveRuleRowsByKeys(storage.fetcher.driver, keys, true);
      expect(before.get("*all+*read")?.content).toBe("anyone");

      // Raw statement write, bypassing the write engine's expiry seam.
      await storage.fetcher.driver.query(
        "UPDATE cards SET db_content = 'role only' WHERE id = 30",
        [],
      );
      const cached = await resolveRuleRowsByKeys(storage.fetcher.driver, keys, true);
      expect(cached.get("*all+*read")?.content).toBe("anyone"); // memo still live

      expireRuleResolutionCache(storage.fetcher.driver);
      const fresh = await resolveRuleRowsByKeys(storage.fetcher.driver, keys, true);
      expect(fresh.get("*all+*read")?.content).toBe("role only");
    } finally {
      storage.close();
    }
  });

  it("never shares entries across drivers", async () => {
    const a = await seedMemoDeck();
    const b = await seedMemoDeck();
    try {
      const keys = ["*all+*read"];
      const afterA = a.counting.snapshot().statements;
      const beforeB = b.counting.snapshot().statements;
      await resolveRuleRowsByKeys(b.fetcher.driver, keys, false);
      expect(b.counting.snapshot().statements).toBe(beforeB + 1); // b resolved on its own
      await resolveRuleRowsByKeys(a.fetcher.driver, keys, false);
      expect(a.counting.snapshot().statements).toBe(afterA + 1); // a unaffected by b
    } finally {
      a.close();
      b.close();
    }
  });

  it("returns an empty map for empty keys without touching the driver", async () => {
    const storage = await seedMemoDeck();
    try {
      storage.counting.reset(); // seed INSERTs ride the counting driver too
      const out = await resolveRuleRowsByKeys(storage.fetcher.driver, [], false);
      expect(out.size).toBe(0);
      expect(storage.counting.snapshot().statements).toBe(0);
    } finally {
      storage.close();
    }
  });
});

describe("the write path invalidates the rule-resolution memo", () => {
  it("a committed CardActionEngine updateCard is visible to the next resolution with no manual expire", async () => {
    const storage: ActionsTestStorage = await createActionsTestStorage();
    try {
      await seedActionCard(storage, { id: 1, name: "*all", typeId: 3 });
      await seedActionCard(storage, { id: 2, name: "*read", typeId: 3 });
      await seedActionCard(storage, {
        id: 30,
        name: "*all+*read",
        leftId: 1,
        rightId: 2,
        typeId: 3,
        dbContent: "anyone",
      });
      // the write-rule machinery the update gate needs (a deck without an
      // applicable *update rule now DENIES — the deny-on-empty fix,
      // permissions.rb:47-49/:100-118): the codename-'set' card the who_can
      // universe filters on, *all typed Set, the *update setting card, and
      // an *all+*update rule granting Joe (card_references -> Joe's id).
      await seedActionCard(storage, { id: 31, name: "Set", codename: "set" });
      await seedActionCard(storage, { id: 32, name: "*update", codename: "update" });
      const allRow = await storage.selectOne<{ id: number }>(
        "SELECT id FROM cards WHERE `key` = '*all'",
      );
      await storage.driver.query("UPDATE cards SET type_id = 31 WHERE id = ?", [allRow!.id]);
      await seedActionCard(storage, {
        id: 33,
        name: "*all+*update",
        leftId: allRow!.id,
        rightId: 32,
        typeId: 31,
        dbContent: "[[Joe User]]",
      });
      await storage.driver.query(
        `INSERT INTO card_references (referer_id, referee_key, referee_id, ref_type, is_present)
         VALUES (33, 'joe_user', ?, 'L', NULL)`,
        [JOE.id],
      );

      const keys = ["*all+*read"];
      const before = await resolveRuleRowsByKeys(storage.driver, keys, true);
      expect(before.get("*all+*read")?.content).toBe("anyone");

      const engine = actionEngine(storage, JOE);
      await engine.updateCard({ cardId: 30, content: "anyone signed in" });

      const after = await resolveRuleRowsByKeys(storage.driver, keys, true);
      expect(after.get("*all+*read")?.content).toBe("anyone signed in");
    } finally {
      storage.close();
    }
  });
});
