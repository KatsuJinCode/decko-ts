// Unit and property tests for the D1 trickle importer's pure rules
// (tools/d1-trickle/trickle-lib.mjs). Written from the importer's contract:
// literals round-trip exactly, statements stay under D1's limits, every row
// is planned exactly once in priority order, the daily allowance is never
// exceeded, and a page is complete only when everything it reads is in.

import { describe, expect, test } from "vitest";
import { DatabaseSync } from "node:sqlite";
// @ts-expect-error plain ESM tool module without types
import * as lib from "../../../tools/d1-trickle/trickle-lib.mjs";

/** Small seeded PRNG (mulberry32) so generated cases are reproducible. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ALPHABET = ["a", "Z", "'", "''", '"', "\\", "\n", "é", "日本", "😀", " ", ";", "--", "?", "\u0000", "%"];
function randomText(r: () => number, max: number) {
  const n = Math.floor(r() * max);
  let s = "";
  for (let i = 0; i < n; i++) s += ALPHABET[Math.floor(r() * ALPHABET.length)];
  return s;
}

describe("sqlLiteral", () => {
  test("hand-checked literals", () => {
    expect(lib.sqlLiteral(null)).toBe("NULL");
    expect(lib.sqlLiteral(42)).toBe("42");
    expect(lib.sqlLiteral(9007199254740993n)).toBe("9007199254740993");
    expect(lib.sqlLiteral(1.5)).toBe("1.5");
    expect(lib.sqlLiteral(1e21)).toBe("1e+21");
    expect(lib.sqlLiteral("it's")).toBe("'it''s'");
    expect(lib.sqlLiteral(new Uint8Array([0, 255]))).toBe("X'00ff'");
    expect(lib.sqlLiteral("a\u0000b")).toBeUndefined();
  });
});

describe("insertStatements", () => {
  const COLS = ["id", "name", "n", "content"];
  const schema = 'CREATE TABLE t ("id" INTEGER PRIMARY KEY, "name" TEXT, "n" INTEGER, "content" TEXT)';

  test("property: rows round-trip exactly through SQLite and no statement exceeds the byte cap", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const r = rng(seed);
      const maxBytes = 300 + Math.floor(r() * 3000);
      const rows = Array.from({ length: 1 + Math.floor(r() * 30) }, (_, i) => ({
        id: i + 1,
        name: r() < 0.1 ? null : randomText(r, 20),
        n: r() < 0.5 ? Math.floor(r() * 1e6) - 5e5 : 2 ** 53 + 1,
        content: r() < 0.1 ? randomText(r, 2000) : randomText(r, 60),
      }));
      const stmts = lib.insertStatements("t", COLS, rows.map((x) => ({ ...x, n: BigInt(x.n === 2 ** 53 + 1 ? "9007199254740993" : x.n) })), { maxBytes });
      const db = new DatabaseSync(":memory:", { readBigInts: true });
      db.exec(schema);
      for (const s of stmts) {
        expect(Buffer.byteLength(s.sql)).toBeLessThanOrEqual(maxBytes);
        expect(s.params.length).toBeLessThanOrEqual(lib.D1_MAX_BOUND_PARAMS);
        db.prepare(s.sql).run(...s.params);
      }
      const back = db.prepare("SELECT id, name, n, content FROM t ORDER BY id").all();
      expect(back.length, `seed ${seed}`).toBe(rows.length);
      back.forEach((b: any, i) => {
        expect(b.name, `seed ${seed} row ${i}`).toBe(rows[i].name);
        expect(b.content, `seed ${seed} row ${i}`).toBe(rows[i].content);
        expect(String(b.n)).toBe(rows[i].n === 2 ** 53 + 1 ? "9007199254740993" : String(rows[i].n));
      });
      expect(stmts.reduce((n: number, s: any) => n + s.rows, 0)).toBe(rows.length);
    }
  });

  test("a row too large for a literal statement goes alone with its long value bound", () => {
    const big = "x".repeat(5000);
    const stmts = lib.insertStatements("t", COLS, [{ id: 1, name: "a", n: 1, content: "s" }, { id: 2, name: "b", n: 2, content: big }], { maxBytes: 1000 });
    expect(stmts).toHaveLength(2);
    expect(stmts[1].params).toEqual([big]);
    expect(stmts[1].sql).toContain("?");
    expect(stmts[0].params).toEqual([]);
  });

  test("re-sending the same statements inserts nothing twice (OR IGNORE)", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(schema);
    const stmts = lib.insertStatements("t", COLS, [{ id: 1, name: "a", n: 1, content: "c" }]);
    for (let k = 0; k < 2; k++) for (const s of stmts) db.prepare(s.sql).run(...s.params);
    expect((db.prepare("SELECT count(*) n FROM t").get() as any).n).toBe(1);
  });
});

describe("chunkByCost", () => {
  test("chunks stay under the cap except a single oversized item, and keep order", () => {
    const r = rng(7);
    for (let k = 0; k < 200; k++) {
      const items = Array.from({ length: Math.floor(r() * 50) }, (_, i) => ({ i, c: 1 + Math.floor(r() * 40) }));
      const cap = 10 + Math.floor(r() * 60);
      const chunks = lib.chunkByCost(items, (x: any) => x.c, cap);
      expect(chunks.flat().map((x: any) => x.i)).toEqual(items.map((x) => x.i));
      for (const ch of chunks) {
        const sum = ch.reduce((n: number, x: any) => n + x.c, 0);
        if (ch.length > 1) expect(sum).toBeLessThanOrEqual(cap);
      }
    }
  });
});

describe("buildPlan", () => {
  // Deck: cards 1..30; 1-5 boot; page A needs 6-10; page B needs 9-12 and
  // the references of card 11; card 7 owns 2 references, 11 owns 3, 20 owns 1.
  const refsByReferer = new Map<number, number[]>([
    [7, [100, 101]],
    [11, [102, 103, 104]],
    [20, [105]],
    [2, [106]],
  ]);
  const input = {
    schema: [{ sql: "CREATE TABLE x (a)" }],
    wholeTables: [{ table: "deck_data_version", rows: 1, cost: 1 }],
    baseIds: new Set([1, 2, 3, 4, 5]),
    baseRefIds: new Set([2]),
    fixedPages: [{ page: "/A", ids: [6, 7, 8, 9, 10], refIds: [], status: "closed" }],
    poolPages: [
      { page: "/B", ids: [9, 10, 11, 12], refIds: [11], status: "closed" },
      { page: "/C", ids: [], refIds: [], status: "needs-full" },
    ],
    allCardIds: Array.from({ length: 30 }, (_, i) => i + 1),
    refsByReferer,
    orphanRefs: [200, 201],
    cardCost: 14,
    refCost: 5,
    unitCost: 30,
  };
  const plan = lib.buildPlan(input);

  test("every card row and every card's references land in exactly one unit", () => {
    const cards = plan.units.flatMap((u: any) => u.ids ?? []).filter((_: any, i: number, a: any) => true);
    const cardUnits = plan.units.filter((u: any) => u.kind === "cards");
    const allCards = cardUnits.flatMap((u: any) => u.ids);
    expect([...allCards].sort((a, b) => a - b)).toEqual(input.allCardIds);
    const allRefs = cardUnits.flatMap((u: any) => u.refs);
    expect([...allRefs].sort((a, b) => a - b)).toEqual([2, 7, 11, 20]);
    expect(plan.units.filter((u: any) => u.kind === "refs").flatMap((u: any) => u.ids)).toEqual([200, 201]);
    expect(cards.length).toBeGreaterThan(0);
  });

  test("units come in tier order and no unit exceeds the cost cap unless it holds one item", () => {
    const tiers = plan.units.map((u: any) => u.tier);
    expect(tiers).toEqual([...tiers].sort((a, b) => a - b));
    for (const u of plan.units.filter((x: any) => x.kind === "cards")) {
      if (u.ids.length + u.refs.length > 1) expect(u.cost).toBeLessThanOrEqual(30);
    }
    expect(plan.totalCost).toBe(30 * 14 + (2 + 3 + 1 + 1) * 5 + 2 * 5 + 1);
  });

  test("boot cards are tier 2, page A's cards tier 3, page B's new cards tier 4", () => {
    const tierOf = (id: number) => plan.units.find((u: any) => u.kind === "cards" && u.ids.includes(id)).tier;
    expect([1, 2, 3, 4, 5].map(tierOf)).toEqual([2, 2, 2, 2, 2]);
    expect([6, 7, 8, 9, 10].map(tierOf)).toEqual([3, 3, 3, 3, 3]);
    expect([11, 12].map(tierOf)).toEqual([4, 4]);
    expect(tierOf(30)).toBe(5);
    const refTier = (id: number) => plan.units.find((u: any) => u.kind === "cards" && u.refs.includes(id)).tier;
    expect(refTier(2)).toBe(2);
    expect(refTier(11)).toBe(4);
    expect(refTier(7)).toBe(5);
  });

  test("manifest: a page is complete exactly when its last needed unit is done; needs-full only at the end", () => {
    const a = plan.pages.find((p: any) => p.page === "/A");
    const b = plan.pages.find((p: any) => p.page === "/B");
    expect(lib.manifest(plan, a.needsUnit).complete_pages).toEqual([]);
    expect(lib.manifest(plan, a.needsUnit + 1).complete_pages).toEqual(["/A"]);
    expect(lib.manifest(plan, b.needsUnit + 1).complete_pages).toEqual(["/A", "/B"]);
    expect(lib.manifest(plan, plan.units.length - 1).complete_pages).not.toContain("/C");
    expect(lib.manifest(plan, plan.units.length).complete_pages).toEqual(["/A", "/B", "/C"]);
    expect(lib.manifest(plan, plan.units.length).deck_complete).toBe(true);
  });
});

describe("daily budget and checkpoint", () => {
  test("allowance is the share of the daily limit minus what is used, never negative", () => {
    expect(lib.remainingToday({ dailyLimit: 100000, share: 0.9, used: 0 })).toBe(90000);
    expect(lib.remainingToday({ dailyLimit: 100000, share: 0.9, used: 89999 })).toBe(1);
    expect(lib.remainingToday({ dailyLimit: 100000, share: 0.9, used: 95000 })).toBe(0);
    expect(lib.unitFits({ cost: 10 }, 10)).toBe(true);
    expect(lib.unitFits({ cost: 11 }, 10)).toBe(false);
  });

  test("the day is the UTC calendar day", () => {
    expect(lib.utcDay(new Date("2026-10-07T23:59:59-05:00"))).toBe("2026-10-08");
  });

  test("a checkpoint from a different plan is refused", () => {
    expect(() => lib.normaliseCheckpoint({ planHash: "a", unitsDone: 3 }, "b")).toThrow(/different plan/);
    expect(lib.normaliseCheckpoint({ planHash: "a", unitsDone: 3, days: {} }, "a").unitsDone).toBe(3);
    expect(lib.normaliseCheckpoint(undefined, "a")).toMatchObject({ unitsDone: 0, inflight: null });
  });
});

describe("closure helpers", () => {
  test("card ids are read from id columns in snake and camel case, not from other integers", () => {
    const ids = lib.idsInRows([{ id: 5, left_id: 6, readRuleId: 7, sid: 8, count: 9, trash: 0, ruleId: 10 }]);
    expect([...ids].sort((a: number, b: number) => a - b)).toEqual([5, 6, 7, 8, 10]);
  });

  test("a search count gets a witness query listing what it counts", () => {
    const sql = "SELECT coalesce(count(distinct c0.id),0) as count FROM cards c0 WHERE c0.trash is false AND c0.type_id = ?";
    expect(lib.witnessSql(sql)).toBe("SELECT DISTINCT c0.id AS id FROM cards c0 WHERE c0.trash is false AND c0.type_id = ?");
    expect(lib.witnessSql("SELECT COUNT(*) AS c FROM cards WHERE cards.right_id = 3")).toBe("SELECT cards.id AS id FROM cards WHERE cards.right_id = 3");
    expect(lib.witnessSql("SELECT type_id, COUNT(*) FROM cards WHERE trash = 0 GROUP BY type_id")).toBeUndefined();
    expect(lib.witnessSql("SELECT DISTINCT coalesce(count(distinct c0.id),0) as count FROM cards c0 JOIN card_references cr1 ON c0.id = cr1.referee_id WHERE cr1.referer_id = ?")).toBe(
      "SELECT DISTINCT c0.id AS id FROM cards c0 JOIN card_references cr1 ON c0.id = cr1.referee_id WHERE cr1.referer_id = ?",
    );
    expect(lib.witnessSql("SELECT type_id FROM cards WHERE name = ? AND trash = 0 LIMIT 1")).toBe("SELECT cards.id AS id FROM cards WHERE name = ? AND trash = 0 LIMIT 1");
    expect(lib.witnessSql("SELECT c.type_id FROM cards c WHERE c.name = ?")).toBe("SELECT c.id AS id FROM cards c WHERE c.name = ?");
    expect(lib.witnessSql("SELECT x FROM cards c JOIN cards d ON d.id = c.left_id WHERE c.name = ?")).toBeUndefined();
  });
});
