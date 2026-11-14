// D1 refuses statements with more than 100 bound parameters. The adapter
// sends such a statement with its values inlined as exact literals; these
// tests pin the inlining rules from the contract: same rows as binding, no
// placeholder rewritten inside quotes or comments, and no inlining when it
// could not be exact.

import { describe, expect, test } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { inlineBoundParameters, balanceOrChains, CloudflareD1Adapter, D1_MAX_BOUND_PARAMETERS } from "../../../src/server/drivers/d1.js";

describe("inlineBoundParameters", () => {
  test("hand-checked replacements, skipping quotes and comments", () => {
    expect(inlineBoundParameters("SELECT ?, '?', \"a?\", [b?] -- ?\n, ? /* ? */", [1, "it's"])).toBe(
      "SELECT 1, '?', \"a?\", [b?] -- ?\n, 'it''s' /* ? */",
    );
    expect(inlineBoundParameters("SELECT ?", [1.5])).toBe("SELECT 1.5");
    expect(inlineBoundParameters("SELECT ?", [null])).toBe("SELECT NULL");
  });

  test("declines when it cannot be exact or the shape is not plain ?", () => {
    expect(inlineBoundParameters("SELECT ?", ["a\u0000b"])).toBeUndefined();
    expect(inlineBoundParameters("SELECT ?1", [1])).toBeUndefined();
    expect(inlineBoundParameters("SELECT :a", [1])).toBeUndefined();
    expect(inlineBoundParameters("SELECT ?, ?", [1])).toBeUndefined();
    expect(inlineBoundParameters("SELECT ?", [1, 2])).toBeUndefined();
    expect(inlineBoundParameters("SELECT '?", [1])).toBeUndefined();
    expect(inlineBoundParameters("SELECT ?", [true])).toBeUndefined();
  });

  test("property: inlined and bound forms return the same rows", () => {
    const db = new DatabaseSync(":memory:");
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, s TEXT, x REAL)");
    const ins = db.prepare("INSERT INTO t VALUES (?, ?, ?)");
    for (let i = 1; i <= 300; i++) ins.run(i, `v'${i}"?`, i / 7);
    let seed = 42;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let k = 0; k < 100; k++) {
      const ids = Array.from({ length: 1 + Math.floor(rnd() * 250) }, () => 1 + Math.floor(rnd() * 320));
      const strs = ids.slice(0, 5).map((i) => `v'${i}"?`);
      const sql = `SELECT id, s, x FROM t WHERE id IN (${ids.map(() => "?").join(",")}) OR s IN (${strs.map(() => "?").join(",")}) ORDER BY id`;
      const params = [...ids, ...strs];
      const bound = db.prepare(sql).all(...params);
      const inlined = inlineBoundParameters(sql, params);
      expect(inlined).toBeDefined();
      expect(db.prepare(inlined as string).all()).toEqual(bound);
    }
  });
});

describe("balanceOrChains", () => {
  const term = "(j.left_id = ? AND j.right_id = ?)";
  const flat = (n: number) => `SELECT j.* FROM cards j WHERE j.trash = 0 AND (${Array.from({ length: n }, () => term).join(" OR ")}) ORDER BY j.id`;
  /** Deepest parenthesis nesting: a proxy for the OR chain's depth. */
  const depth = (s: string) => {
    let d = 0;
    let m = 0;
    for (const c of s) {
      if (c === "(") m = Math.max(m, ++d);
      else if (c === ")") d--;
    }
    return m;
  };

  test("short chains and statements without chains are untouched", () => {
    expect(balanceOrChains(flat(3))).toBe(flat(3));
    expect(balanceOrChains("SELECT 1")).toBe("SELECT 1");
  });

  test("a long chain keeps its terms in order and becomes shallow", () => {
    const out = balanceOrChains(flat(200));
    expect(out).not.toBe(flat(200));
    expect(out.match(/\(j\.left_id = \? AND j\.right_id = \?\)/g)?.length).toBe(200);
    expect(depth(out)).toBeLessThan(15);
  });

  test("property: the regrouped statement returns the same rows in the same order", () => {
    const db = new DatabaseSync(":memory:");
    db.exec("CREATE TABLE cards (id INTEGER PRIMARY KEY, left_id INTEGER, right_id INTEGER, trash INTEGER)");
    db.exec("CREATE INDEX l ON cards(left_id)");
    db.exec("CREATE INDEX r ON cards(right_id)");
    const ins = db.prepare("INSERT INTO cards VALUES (?, ?, ?, ?)");
    for (let i = 1; i <= 2000; i++) ins.run(i, i % 37, i % 41, i % 13 === 0 ? 1 : 0);
    db.exec("ANALYZE");
    let seed = 9;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let k = 0; k < 50; k++) {
      const n = 16 + Math.floor(rnd() * 150);
      const params = Array.from({ length: n }, () => [Math.floor(rnd() * 37), Math.floor(rnd() * 41)]).flat();
      const sql = `SELECT j.* FROM cards j WHERE j.trash = 0 AND (${Array.from({ length: n }, () => term).join(" OR ")})`;
      expect(db.prepare(balanceOrChains(sql)).all(...params)).toEqual(db.prepare(sql).all(...params));
    }
  });
});

describe("CloudflareD1Adapter over the cap", () => {
  // A small working fake of the D1 binding over node:sqlite that enforces
  // D1's cap, so the adapter's behaviour is checked against the rule itself.
  function fakeD1() {
    const db = new DatabaseSync(":memory:");
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY)");
    for (let i = 1; i <= 200; i++) db.prepare("INSERT INTO t VALUES (?)").run(i);
    const prepare = (sql: string) => {
      let bound: unknown[] = [];
      const stmt = {
        bind(...v: unknown[]) {
          if (v.length > D1_MAX_BOUND_PARAMETERS) throw new Error("D1_ERROR: too many SQL variables");
          bound = v;
          return stmt;
        },
        async all() {
          return { success: true, results: db.prepare(sql).all(...(bound as never[])), meta: { changes: 0 } };
        },
        async run() {
          return stmt.all();
        },
      };
      return stmt;
    };
    return { prepare, async batch(s: any[]) { return Promise.all(s.map((x) => x.all())); } };
  }

  test("a 150-value IN list runs and returns the same rows as on SQLite", async () => {
    const adapter = new CloudflareD1Adapter(fakeD1() as any);
    const ids = Array.from({ length: 150 }, (_, i) => i + 25);
    const sql = `SELECT id FROM t WHERE id IN (${ids.map(() => "?").join(",")}) ORDER BY id`;
    const r = await adapter.query<{ id: number }>(sql, ids);
    expect(r.rows.map((x) => x.id)).toEqual(ids.filter((i) => i <= 200));
    const [b] = await adapter.batch([{ sql, params: ids }]);
    expect(b.rows.length).toBe(150);
  });
});
