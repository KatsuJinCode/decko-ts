// The `self` set-pattern member lookup's composed-name resolution: the
// equivalence contract that lets it stop asking for the whole deck's universe.
//
// WHAT IS BEING REPLACED. set-read-rule.ts's `self` branch resolves ONE key —
// the anchor card's own composed name — and the resolver it calls
// (resolveRuleIdsByKeys) answers it by building the WHOLE deck's composed-key
// universe: one recursive CTE over every card, ~19.5k rows on the serving deck.
// The save path drops that memo once per mutation and rebuilds it, so one save
// pays for the walk five times. Measured on this tree at base ff235c5c
// (docs/reports/save-path-round-2-whole-deck-universe-rebuild-2026-10-20.md,
// tools/diagnose-owner-save-statement-ladder.mjs): the graded save runs the
// walk 5 times at statement sequence 213, 242, 293, 339, 366, for 310 ms of
// its 382 ms of statement execution — 81%.
//
// WHY THIS NEEDS A CONTRACT AND NOT A TEST. Rule resolution feeds read/write
// permission decisions, and it is FAIL-OPEN: a key that resolves to nothing
// falls through to the catch-all rule and ALLOWS. A narrower walk that quietly
// drops one key therefore does not throw and does not fail a render — it
// silently grants. So the contract is an EQUALITY against the walk it
// replaces, on a deck that carries every shape the walk distinguishes, and the
// reference is that walk's own SQL rather than a reimplementation of it.
//
// THE WALK'S SEMANTICS, TERM BY TERM. RULE_KEY_UNIVERSE_STATEMENT seeds every
// live keyed card and composes two arms:
//
//   seed : key IS NOT NULL AND +trash = 0                    -> (id, key)
//   arm1 : l from resolved; j.left_id = l.id, +j.trash = 0;
//          r = cards[j.right_id] with r.key IS NOT NULL      (NO trash test)
//   arm2 : r from resolved; j.right_id = r.id, +j.trash = 0;
//          l = cards[j.left_id] with l.key IS NOT NULL      (NO trash test)
//
// The missing trash test on the composed SIDE is load-bearing and is the single
// easiest thing to get wrong when porting this walk: on the serving deck 268
// trashed cards carry a key, and 38 composed names resolve ONLY through one.
// Ruby does not do this — Card::Lexicon#lex_to_id filters trash: false at every
// id() (prototype/lib/card/lexicon.rb:120-128), so those 38 are a Ruby
// divergence the port already carries. It is pinned here as CURRENT BEHAVIOR,
// because changing it changes permission decisions and that is out of this
// lane's scope; the lane report names it for a parity decision of its own.
//
// Two consequences any replacement must respect. A live junction composes
// through a trashed side. And a key can resolve to MORE THAN ONE card (a stored
// compound key and a junction over the same sides), in which case the universe
// Map keeps whichever row came last — an answer a narrower walk cannot
// reproduce without running the same walk, so it falls back.

import { describe, expect, it } from "vitest";
import {
  expireRuleResolutionCache,
  resolveComposedNameIdsByKeys,
  resolveRuleIdsByKeys,
} from "../../../src/card/permissions/read-rules.js";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../render/render-test-storage.js";

/** The shipped whole-deck walk, verbatim from RULE_KEY_UNIVERSE_STATEMENT.
 *  The contract's reference: a replacement walk is compared against THIS, not
 *  against another candidate. */
const WHOLE_DECK_UNIVERSE_SQL = `WITH RECURSIVE resolved(id, ckey) AS (
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
SELECT rs.ckey, rs.id FROM resolved rs`;

/** ckey -> the ids the whole-deck walk yields for it, as a SET. Sets, not one
 *  id: the universe Map collapses a repeated ckey by output order, which a
 *  narrower walk cannot reproduce without running the same walk — so the
 *  contract states the SET and the fallback covers the collapse. */
export async function wholeDeckUniverse(
  storage: RenderTestStorage,
): Promise<Map<string, Set<number>>> {
  const rows = await storage.counting.query<{ ckey: string; id: number }>(
    WHOLE_DECK_UNIVERSE_SQL,
    [],
  );
  const out = new Map<string, Set<number>>();
  for (const row of rows.rows) {
    let ids = out.get(row.ckey);
    if (ids === undefined) out.set(row.ckey, (ids = new Set()));
    ids.add(row.id);
  }
  return out;
}

/** Every contiguous '+'-segment run of key, shortest first. A composition path
 *  that reaches key uses only such runs as intermediates — each recursive step
 *  prepends or appends one stored key to an already-resolved key, so both
 *  operands of a step producing key are runs of key — which is why this is the
 *  whole set a per-key walk has to consider. */
export function segmentRuns(key: string): string[] {
  const parts = key.split("+");
  const out: string[] = [];
  for (let i = 0; i < parts.length; i += 1) {
    for (let j = i + 1; j <= parts.length; j += 1) out.push(parts.slice(i, j).join("+"));
  }
  return out.sort((a, b) => a.split("+").length - b.split("+").length || a.length - b.length);
}

/**
 * A representative rule set, carrying every shape the walk distinguishes. Two
 * fixture decisions make the arms LOAD-BEARING rather than decorative:
 *
 *  - the deck is built WITHOUT the stock read substrate, so the composed-name
 *    universe is exactly what this fixture seeds. A contract that asserted only
 *    a SUBSET could pass on a walk that loses a shape;
 *  - every junction is seeded by its SIDES ALONE (no name), which leaves its
 *    `key` column NULL — the shape the serving deck actually has (13,801 of its
 *    19,494 live cards carry no key and every one is a junction). seedCard
 *    stores a canonical key for any row seeded WITH a name, which would let the
 *    seed arm satisfy every depth-1 composition on its own and leave the two
 *    recursive arms untested.
 *
 *   simple stored keys        alpha (1), beta (2), gamma (3) — the seed arm
 *   arm1, left resolved       alpha+beta (4) over (alpha, beta)
 *   a multi-level spine       alpha+beta+gamma (5) over (alpha+beta, gamma):
 *                              arm1 resolving its LEFT to alpha+beta first
 *   arm2, left side STORED    trashed+beta (8): its left is the trashed card 20,
 *                              which the seed arm drops and arm2 still reaches
 *   rule cards                *all+*read (13) over (*all, *read), and
 *                              set_a+set_b+*read (17) over a two-level spine
 *   a trashed JUNCTION        beta+gamma (6) — must NOT compose
 *   a trashed SIDE            alpha+trashed (7) over (alpha, trashed), and
 *                              alpha+trashed+beta (9) one level above it — MUST
 *                              compose; the arms' missing trash test
 *   an AMBIGUOUS key          alpha+beta resolves to BOTH the keyless junction
 *                              4 and the stored-key card 10 — the fallback's
 *                              trigger. cards.key is UNIQUE, so the ambiguity
 *                              comes from one side composing what another stores.
 */
export async function seedComposedNameDeck(): Promise<RenderTestStorage> {
  const storage = await createRenderTestStorage({ bootstrapReadRules: false });
  await seedCard(storage, { id: 1, name: "Alpha", key: "alpha", typeId: 4 });
  await seedCard(storage, { id: 2, name: "Beta", key: "beta", typeId: 4 });
  await seedCard(storage, { id: 3, name: "Gamma", key: "gamma", typeId: 4 });
  await seedCard(storage, { id: 20, name: "Trashed", key: "trashed", typeId: 4, trash: true });
  await seedCard(storage, { id: 4, leftId: 1, rightId: 2 });
  await seedCard(storage, { id: 5, leftId: 4, rightId: 3 });
  await seedCard(storage, { id: 6, leftId: 2, rightId: 3, trash: true });
  await seedCard(storage, { id: 7, leftId: 1, rightId: 20 });
  await seedCard(storage, { id: 8, leftId: 20, rightId: 2 });
  await seedCard(storage, { id: 9, leftId: 7, rightId: 2 });
  // side-less, STORED compound key: composes nothing, and collides with 4
  await seedCard(storage, { id: 10, name: "Alpha+Beta", key: "alpha+beta", typeId: 4 });
  // the rule cards — the rule-shaped keys the render path and the write path's
  // candidate walk both ask for
  await seedCard(storage, { id: 11, name: "*all", key: "*all", typeId: 3 });
  await seedCard(storage, { id: 12, name: "*read", key: "*read", typeId: 3 });
  await seedCard(storage, { id: 13, leftId: 11, rightId: 12, typeId: 3, dbContent: "anyone" });
  await seedCard(storage, { id: 14, name: "Set_a", key: "set_a", typeId: 4 });
  await seedCard(storage, { id: 15, name: "Set_b", key: "set_b", typeId: 4 });
  await seedCard(storage, { id: 16, leftId: 14, rightId: 15 });
  await seedCard(storage, { id: 17, leftId: 16, rightId: 12, typeId: 3, dbContent: "role only" });
  expireRuleResolutionCache(storage.fetcher.driver);
  return storage;
}

describe("the whole-deck composed-key universe this contract pins", () => {
  it("composes exactly these composed names on the representative deck", async () => {
    const storage = await seedComposedNameDeck();
    try {
      const universe = await wholeDeckUniverse(storage);
      const named: Record<string, number[]> = {};
      for (const [ckey, ids] of [...universe.entries()].sort()) named[ckey] = [...ids].sort((a, b) => a - b);
      expect(named).toEqual({
        "*all": [11],
        "*all+*read": [13],
        "*read": [12],
        alpha: [1],
        // the ambiguous key: the keyless junction composes it AND card 10 stores it
        "alpha+beta": [4, 10],
        "alpha+beta+gamma": [5],
        "alpha+trashed": [7],
        // a trashed side feeding a FURTHER level
        "alpha+trashed+beta": [9],
        beta: [2],
        gamma: [3],
        set_a: [14],
        "set_a+set_b": [16],
        "set_a+set_b+*read": [17],
        set_b: [15],
        "trashed+beta": [8],
        // beta+gamma is ABSENT: the junction that would compose it is trashed.
        // "trashed" is ABSENT as a key: the trashed simple card is not a seed,
        // and a side only ever contributes to a COMPOUND key.
      });
    } finally {
      storage.close();
    }
  });

  it("collapses the ambiguous key to ONE id, the way the shipped Map does", async () => {
    const storage = await seedComposedNameDeck();
    try {
      const resolved = await resolveRuleIdsByKeys(storage.fetcher.driver, ["alpha+beta"]);
      expect(resolved.size).toBe(1);
      expect([4, 10]).toContain(resolved.get("alpha+beta"));
    } finally {
      storage.close();
    }
  });

  it("names a key the deck does not have as a plain miss", async () => {
    const storage = await seedComposedNameDeck();
    try {
      const universe = await wholeDeckUniverse(storage);
      for (const key of ["no_such_card", "no_such_card+nope", "alpha+no_such_card"]) {
        expect(universe.has(key), key).toBe(false);
      }
      const resolved = await resolveRuleIdsByKeys(storage.fetcher.driver, ["no_such_card+nope"]);
      expect(resolved.size).toBe(0);
    } finally {
      storage.close();
    }
  });
});

describe("the per-key walk answers the whole-deck walk", () => {
  it("matches the whole-deck walk on EVERY composed name the deck has", async () => {
    const storage = await seedComposedNameDeck();
    try {
      const universe = await wholeDeckUniverse(storage);
      const driver = storage.fetcher.driver;
      for (const [ckey, ids] of universe) {
        const resolved = await resolveComposedNameIdsByKeys(driver, [ckey]);
        if (ids.size === 1) {
          // The unambiguous case: the per-key walk answers on its own, and the
          // id SET must be identical to the walk it replaces.
          expect([...(resolved.get(ckey) ?? [])], `ckey ${ckey}`).toEqual([...ids]);
        } else {
          // The ambiguous case (alpha+beta): the walk reports a SET of two, and
          // deliberately answers with the ONE id the whole-deck Map decides —
          // see the fallback describe block below.
          expect([...ids].sort((a, b) => a - b), `ckey ${ckey} is ambiguous`).toEqual([4, 10]);
          expect([...(resolved.get(ckey) ?? [])], `ckey ${ckey} decided`).toHaveLength(1);
        }
      }
    } finally {
      storage.close();
    }
  });

  it("matches the whole-deck walk on the whole key set in ONE call", async () => {
    const storage = await seedComposedNameDeck();
    try {
      const universe = await wholeDeckUniverse(storage);
      const ckeys = [...universe.keys()];
      const driver = storage.fetcher.driver;
      const narrow = await resolveComposedNameIdsByKeys(driver, ckeys);
      const whole = await resolveRuleIdsByKeys(driver, ckeys);
      for (const ckey of ckeys) {
        const decided = whole.get(ckey);
        expect(decided, `whole-deck id for ${ckey}`).toBeDefined();
        expect(narrow.get(ckey) ?? [], `narrow ids for ${ckey}`).toEqual([decided]);
      }
    } finally {
      storage.close();
    }
  });

  it("composes through a TRASHED side, exactly as the shipped arms do", async () => {
    const storage = await seedComposedNameDeck();
    try {
      // The shape a hand-written walk gets wrong by adding the trash test the
      // arms do NOT have. Either one dropping is a fail-open change: the key
      // stops resolving and the member lookup falls through.
      const resolved = await resolveComposedNameIdsByKeys(storage.fetcher.driver, [
        "alpha+trashed",
        "trashed+beta",
        "alpha+trashed+beta",
      ]);
      expect(resolved.get("alpha+trashed")).toEqual([7]);
      expect(resolved.get("trashed+beta")).toEqual([8]);
      expect(resolved.get("alpha+trashed+beta")).toEqual([9]);
    } finally {
      storage.close();
    }
  });

  it("does NOT compose through a trashed junction, exactly as the shipped arms do not", async () => {
    const storage = await seedComposedNameDeck();
    try {
      const resolved = await resolveComposedNameIdsByKeys(storage.fetcher.driver, ["beta+gamma"]);
      expect(resolved.get("beta+gamma") ?? []).toEqual([]);
    } finally {
      storage.close();
    }
  });

  it("resolves an absent key to nothing, at every segment count", async () => {
    const storage = await seedComposedNameDeck();
    try {
      const resolved = await resolveComposedNameIdsByKeys(storage.fetcher.driver, [
        "no_such_card",
        "no_such_card+nope",
        "alpha+no_such_card",
        "alpha+beta+no_such_card",
        "alpha+beta+gamma+no_such_card",
      ]);
      expect(resolved.size).toBe(0);
    } finally {
      storage.close();
    }
  });

  it("answers the deep rule-shaped key the multi-level spine composes", async () => {
    const storage = await seedComposedNameDeck();
    try {
      const resolved = await resolveComposedNameIdsByKeys(storage.fetcher.driver, [
        "set_a+set_b+*read",
        "*all+*read",
      ]);
      expect(resolved.get("set_a+set_b+*read")).toEqual([17]);
      expect(resolved.get("*all+*read")).toEqual([13]);
    } finally {
      storage.close();
    }
  });

  it("returns entries in SORTED key order, whatever order it was asked in", async () => {
    const storage = await seedComposedNameDeck();
    try {
      const driver = storage.fetcher.driver;
      const asked = ["gamma", "alpha+beta+gamma", "alpha", "set_a+set_b+*read"];
      const one = await resolveComposedNameIdsByKeys(driver, asked);
      expireRuleResolutionCache(driver);
      const reordered = await resolveComposedNameIdsByKeys(driver, [...asked].reverse());
      expect([...one.keys()]).toEqual([...asked].sort());
      expect([...reordered.entries()]).toEqual([...one.entries()]);
    } finally {
      storage.close();
    }
  });
});

describe("the per-key walk's cost shape", () => {
  it("answers a one-segment key with ONE indexed point read and one round trip", async () => {
    const storage = await seedComposedNameDeck();
    try {
      storage.counting.reset();
      const resolved = await resolveComposedNameIdsByKeys(storage.fetcher.driver, ["alpha"]);
      expect(resolved.get("alpha")).toEqual([1]);
      const snap = storage.counting.snapshot();
      expect(snap.statements).toBe(1);
      expect(snap.roundTrips).toBe(1);
      expect(storage.counting.statements[0]).toContain(`"key" IN`);
    } finally {
      storage.close();
    }
  });

  it("never issues the whole-deck universe statement for an UNAMBIGUOUS key", async () => {
    const storage = await seedComposedNameDeck();
    try {
      storage.counting.reset();
      await resolveComposedNameIdsByKeys(storage.fetcher.driver, [
        "alpha+beta+gamma",
        "set_a+set_b+*read",
        "alpha",
      ]);
      for (const sql of storage.counting.statements) {
        expect(sql).not.toContain("WITH RECURSIVE resolved(id, ckey)");
      }
    } finally {
      storage.close();
    }
  });

  it("is memoized per driver generation, and dropped by the same expiry", async () => {
    const storage = await seedComposedNameDeck();
    try {
      const driver = storage.fetcher.driver;
      storage.counting.reset();
      await resolveComposedNameIdsByKeys(driver, ["alpha+beta+gamma"]);
      const afterFirst = storage.counting.snapshot().statements;
      expect(afterFirst).toBeGreaterThan(0);

      // A repeat is a memo hit: zero new statements.
      await resolveComposedNameIdsByKeys(driver, ["alpha+beta+gamma"]);
      expect(storage.counting.snapshot().statements).toBe(afterFirst);
      // A new key walks, and the memoized one still answers from the memo.
      await resolveComposedNameIdsByKeys(driver, ["alpha"]);
      expect(storage.counting.snapshot().statements).toBe(afterFirst + 1);

      // A committed change is visible only after the expiry seam runs. Card 5's
      // sides move to (alpha, gamma) — a pair no other card on the deck holds,
      // since index_cards_on_left_id_and_right_id is UNIQUE — so
      // alpha+beta+gamma stops composing and alpha+gamma starts.
      await storage.counting.query(`UPDATE cards SET left_id = 1, right_id = 3 WHERE id = 5`, []);
      const stale = await resolveComposedNameIdsByKeys(driver, ["alpha+beta+gamma"]);
      expect(stale.get("alpha+beta+gamma")).toEqual([5]); // memo still live

      expireRuleResolutionCache(driver);
      const fresh = await resolveComposedNameIdsByKeys(driver, ["alpha+beta+gamma"]);
      expect(fresh.get("alpha+beta+gamma") ?? []).toEqual([]);
      expect((await resolveComposedNameIdsByKeys(driver, ["alpha+gamma"])).get("alpha+gamma")).toEqual([5]);
    } finally {
      storage.close();
    }
  });
});

describe("the per-key walk falls back exactly where the whole-deck walk is not reproducible", () => {
  it("falls back for an ambiguous key and returns the ONE id the whole-deck Map decides", async () => {
    const storage = await seedComposedNameDeck();
    try {
      const driver = storage.fetcher.driver;
      storage.counting.reset();
      const resolved = await resolveComposedNameIdsByKeys(driver, ["alpha+beta"]);
      expect(resolved.get("alpha+beta")?.length).toBe(1);
      // The fallback IS the whole-deck walk: which of two composing cards the
      // key means is that walk's output order to decide, so it is run, not
      // guessed.
      expect(
        storage.counting.statements.some((sql) => sql.includes("WITH RECURSIVE resolved(id, ckey)")),
      ).toBe(true);
    } finally {
      storage.close();
    }
  });

  it("does NOT fall back for an unambiguous key", async () => {
    const storage = await seedComposedNameDeck();
    try {
      storage.counting.reset();
      await resolveComposedNameIdsByKeys(storage.fetcher.driver, ["alpha+beta+gamma"]);
      expect(
        storage.counting.statements.some((sql) => sql.includes("WITH RECURSIVE resolved(id, ckey)")),
      ).toBe(false);
    } finally {
      storage.close();
    }
  });
});