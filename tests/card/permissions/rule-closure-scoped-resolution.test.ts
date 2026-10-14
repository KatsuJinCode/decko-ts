// The rule-closure walk (read-rules.ts resolveRuleRowsByRuleKeys): the pin
// that the RENDER path's composed-key resolution is scoped to the rule
// cards' side spines and still answers exactly what the whole-deck walk
// answered for rule-shaped keys.
//
// WHY this needs its own pin: the scoping is invisible in the output. Both
// walks return a `Map<ckey, id>`, a caller that asks for a rule key cannot
// tell which walk served it, and the failure mode of a wrongly-narrowed
// boundary is a MISSING rule card — which the read path resolves fail-closed
// (deny, read-rules.ts canReadByRuleLookupDepth's tail) and the task path
// resolves fail-closed too. So a boundary that quietly drops one rule card
// shows up as pages that deny, never as an exception, and never as a failing
// render. These tests pin the boundary from both sides: what the scoped
// walk must return (every rule-shaped key, identical to the whole-deck
// walk) and what it must NOT return (the deck's non-rule composed keys).
//
// The scope's justification, in one line: every key the render path asks
// this resolver for is a rule candidate name, and a rule candidate name
// always ends in a task setting name — so a composed key is needed only
// when it can end in one. Measured on the serving deck (a deck of production size):
// whole-deck 19,474 rows / 1,074,532 response bytes / 3,789 ms against
// rule-closure 1,489 rows / 84,379 bytes / 384 ms, agreeing on all 1,489
// rule-shaped keys. The measurement is
// probe-rule-closure-statement-shapes.ts (not in the public package); the
// fixture deck here is the same contract at test scale.
//
// The write path deliberately keeps the whole-deck walk — set-read-rule.ts's
// `self` set-pattern member lookup resolves a card's own composed name,
// which is not a rule key. Test 6 below is that consumer's pin: the
// whole-deck walk still answers it, so the residual is enforced, not just
// documented.

import { describe, expect, it } from "vitest";
import {
  expireRuleResolutionCache,
  resolveRuleIdsByKeys,
  resolveRuleIdsByRuleKeys,
  resolveRuleRowsByKeys,
  resolveRuleRowsByRuleKeys,
} from "../../../src/card/permissions/read-rules.js";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../render/render-test-storage.js";

/** A fixture deck that has BOTH kinds of composed key, so the boundary is
 *  observable:
 *   - rule cards (right side a task setting): `*all+*read` (id 30),
 *     `*all+*create` (id 31), and a deep one `set_a+set_b+*read` (id 32)
 *     whose left `set_a+set_b` (id 33) is itself a junction;
 *   - non-rule junctions the whole-deck walk composes and the scoped walk
 *     must not: `set_a+set_b` (id 33) and a plain `left+right` (id 34).
 *  `set_a` (id 40) and `set_b` (id 41) are shared by both, so a boundary
 *  that cut the spine would lose the deep rule card too. */
async function seedRuleClosureDeck(): Promise<RenderTestStorage> {
  const storage = await createRenderTestStorage();
  await seedCard(storage, { id: 1, name: "*all", typeId: 3 });
  await seedCard(storage, { id: 2, name: "*read", typeId: 3 });
  await seedCard(storage, { id: 3, name: "*create", typeId: 3 });
  await seedCard(storage, { id: 40, name: "set_a", typeId: 4 });
  await seedCard(storage, { id: 41, name: "set_b", typeId: 4 });
  await seedCard(storage, { id: 50, name: "left", typeId: 4 });
  await seedCard(storage, { id: 51, name: "right", typeId: 4 });
  // rule cards
  await seedCard(storage, { id: 30, name: "*all+*read", leftId: 1, rightId: 2, typeId: 3, dbContent: "anyone" });
  await seedCard(storage, { id: 31, name: "*all+*create", leftId: 1, rightId: 3, typeId: 3, dbContent: "anyone" });
  // deep rule card: left is a junction, so its composed key needs the
  // spine walked two levels up
  await seedCard(storage, { id: 33, name: "set_a+set_b", leftId: 40, rightId: 41, typeId: 4 });
  await seedCard(storage, { id: 32, name: "set_a+set_b+*read", leftId: 33, rightId: 2, typeId: 3, dbContent: "role only" });
  // a non-rule junction with no setting on either side
  await seedCard(storage, { id: 34, name: "left+right", leftId: 50, rightId: 51, typeId: 4 });
  // a VIRTUAL-LEFT rule card: its composed name is stored in the key column
  // and there is no left_id to compose from. This is the deck's
  // delegating `*all plus+*read` shape, and it is the case a seed of the
  // rule cards' side spines alone loses — the walk then misses the rule
  // entirely and the _left delegation resolves to the catch-all instead,
  // which ALLOWS where the chain denies.
  await seedCard(storage, { id: 35, name: "*all plus+*read", rightId: 2, typeId: 3, dbContent: "_left" });
  return storage;
}

/** The rule-shaped composed keys of the fixture deck, as the whole-deck walk
 *  reports them. Read through the whole-deck walk on purpose: the scoped
 *  walk's correctness claim is "same answers, less work", so the reference
 *  has to be the un-scoped walk. */
async function wholeDeckRuleShapedKeys(storage: RenderTestStorage): Promise<Map<string, number>> {
  const SETTINGS = ["*read", "*create", "*update", "*delete"];
  const everything = await storage.fetcher.driver.query<{ ckey: string; id: number }>(
    `WITH RECURSIVE resolved(id, ckey) AS (
       SELECT id, "key" FROM cards WHERE "key" IS NOT NULL AND +trash = 0
       UNION
       SELECT j.id, l.ckey || '+' || r."key" FROM resolved l
         JOIN cards j ON j.left_id = l.id AND +j.trash = 0
         JOIN cards r ON r.id = j.right_id AND r."key" IS NOT NULL
       UNION
       SELECT j.id, l."key" || '+' || r.ckey FROM resolved r
         JOIN cards j ON j.right_id = r.id AND +j.trash = 0
         JOIN cards l ON l.id = j.left_id AND l."key" IS NOT NULL
     )
     SELECT rs.ckey, rs.id FROM resolved rs`,
    [],
  );
  const out = new Map<string, number>();
  for (const row of everything.rows) {
    if (SETTINGS.some((s) => row.ckey.endsWith("+" + s))) out.set(row.ckey, row.id);
  }
  return out;
}

describe("the rule-closure walk answers exactly the rule-shaped closure", () => {
  it("resolves every rule-shaped composed key, including a two-level spine, to the whole-deck walk's id", async () => {
    const storage = await seedRuleClosureDeck();
    try {
      const reference = await wholeDeckRuleShapedKeys(storage);
      // The fixture must actually exercise the deep spine AND the
      // virtual-left rule row, or this test would pass on a walk that only
      // ever composes depth 1 from real left chains.
      expect([...reference.keys()].sort()).toEqual([
        "*all+*create",
        "*all+*read",
        // the virtual-left rule row, keyed (Decko key form, not the display name)
        "*all_plu+*read",
        "set_a+set_b+*read",
      ]);

      const scoped = await resolveRuleRowsByRuleKeys(
        storage.fetcher.driver,
        [...reference.keys()],
        false,
      );
      expect([...scoped.keys()].sort()).toEqual([...reference.keys()].sort());
      for (const [key, id] of reference) {
        expect(scoped.get(key)?.id, `key ${key}`).toBe(id);
      }
    } finally {
      storage.close();
    }
  });

  it("returns the non-rule composed keys the whole-deck walk composes as MISSES, not as rows", async () => {
    const storage = await seedRuleClosureDeck();
    try {
      const wholeDeck = await resolveRuleIdsByKeys(storage.fetcher.driver, [
        "left+right",
        "set_a+set_b",
      ]);
      // The whole-deck walk composes both: this is the work the scoped walk
      // declines to do.
      expect(wholeDeck.get("left+right")).toBe(34);
      expect(wholeDeck.get("set_a+set_b")).toBe(33);

      const scoped = await resolveRuleIdsByRuleKeys(storage.fetcher.driver, [
        "left+right",
        "set_a+set_b",
      ]);
      expect(scoped.size).toBe(0);
    } finally {
      storage.close();
    }
  });

  it("answers the render path's candidates identically to the whole-deck walk", async () => {
    const storage = await seedRuleClosureDeck();
    try {
      // What canReadByRuleLookupDepth asks for: pattern names joined to
      // *read, in precedence order, plus the catch-all.
      const candidates = ["*all+*read", "set_a+*read", "set_a+set_b+*read", "left+*read"];
      const scoped = await resolveRuleIdsByRuleKeys(storage.fetcher.driver, candidates);
      const whole = await resolveRuleIdsByKeys(storage.fetcher.driver, candidates);
      expect([...scoped.entries()].sort()).toEqual([...whole.entries()].sort());
      expect(scoped.get("*all+*read")).toBe(30);
      expect(scoped.get("set_a+set_b+*read")).toBe(32);
    } finally {
      storage.close();
    }
  });

  it("carries the rule card's content through the scoped walk (the _left delegation reads it)", async () => {
    const storage = await seedRuleClosureDeck();
    try {
      const scoped = await resolveRuleRowsByRuleKeys(storage.fetcher.driver, ["set_a+set_b+*read"], true);
      expect(scoped.get("set_a+set_b+*read")).toEqual({ id: 32, content: "role only" });
    } finally {
      storage.close();
    }
  });
});

describe("the rule-closure walk's memo is per scope and per driver generation", () => {
  it("issues the scoped walk once, then answers repeats and reordered calls with zero statements", async () => {
    const storage = await seedRuleClosureDeck();
    try {
      storage.counting.reset();
      await resolveRuleRowsByRuleKeys(storage.fetcher.driver, ["*all+*read"], false);
      const afterFirst = storage.counting.snapshot().statements;
      expect(afterFirst).toBe(1);
      // The scoped walk is ONE statement, like the whole-deck one: the
      // scoping must not have become one statement per call.
      expect(storage.counting.statements[0]).toContain("anc(id)");
      expect(storage.counting.statements[0]).toContain("rs.ckey LIKE '%+*read'");

      await resolveRuleRowsByRuleKeys(storage.fetcher.driver, ["*all+*read"], false);
      const reordered = await resolveRuleRowsByRuleKeys(
        storage.fetcher.driver,
        ["*all+*create", "*all+*read"],
        false,
      );
      expect(storage.counting.snapshot().statements).toBe(afterFirst);
      expect([...reordered.entries()].sort()).toEqual([
        ["*all+*create", { id: 31, content: null }],
        ["*all+*read", { id: 30, content: null }],
      ]);
    } finally {
      storage.close();
    }
  });

  it("does not let the two scopes share a memo entry: the write-path walk still runs its own statement", async () => {
    const storage = await seedRuleClosureDeck();
    try {
      storage.counting.reset();
      await resolveRuleRowsByRuleKeys(storage.fetcher.driver, ["*all+*read"], false);
      const afterScoped = storage.counting.snapshot().statements;
      await resolveRuleIdsByKeys(storage.fetcher.driver, ["left+right"]);
      const afterWholeDeck = storage.counting.snapshot().statements;
      // One statement each: scoping the render walk must not have taken the
      // whole-deck walk's memo entry with it (which would silently leave the
      // write path resolving against a rule-only map).
      expect(afterScoped).toBe(1);
      expect(afterWholeDeck).toBe(2);
      expect(storage.counting.statements[1]).not.toContain("anc(id)");
    } finally {
      storage.close();
    }
  });

  it("drops both scopes on expireRuleResolutionCache", async () => {
    const storage = await seedRuleClosureDeck();
    try {
      await resolveRuleRowsByRuleKeys(storage.fetcher.driver, ["*all+*read"], true);
      await storage.fetcher.driver.query("UPDATE cards SET db_content = 'role only' WHERE id = 30", []);
      // Stale until the expiry seam runs — the same staleness contract the
      // whole-deck memo has, so the write path's invalidation covers both.
      const stale = await resolveRuleRowsByRuleKeys(storage.fetcher.driver, ["*all+*read"], true);
      expect(stale.get("*all+*read")?.content).toBe("anyone");

      expireRuleResolutionCache(storage.fetcher.driver);
      const fresh = await resolveRuleRowsByRuleKeys(storage.fetcher.driver, ["*all+*read"], true);
      expect(fresh.get("*all+*read")?.content).toBe("role only");
    } finally {
      storage.close();
    }
  });
});

describe("the write path's whole-deck walk is unchanged", () => {
  it("still answers a card's own composed name — the self set-pattern member lookup's key", async () => {
    const storage = await seedRuleClosureDeck();
    try {
      // set-read-rule.ts's self-branch resolves the anchor card's composed
      // name, which is NOT a rule key. This is the one consumer that still
      // needs the whole deck's universe; the pin is that it keeps working.
      const resolved = await resolveRuleIdsByKeys(storage.fetcher.driver, ["left+right", "set_a+set_b"]);
      expect(resolved.get("left+right")).toBe(34);
      expect(resolved.get("set_a+set_b")).toBe(33);
    } finally {
      storage.close();
    }
  });
});
