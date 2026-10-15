// PostgresDriver against PostgreSQL itself: PGlite runs the real PostgreSQL
// server compiled to WebAssembly, in-process, so the shared driver and
// transaction conformance suites run against PostgreSQL with nothing to
// install.

import { PGlite } from "@electric-sql/pglite";
import { describe, it, expect } from "vitest";
import { PostgresDriver, translateSqliteToPostgres } from "../../../src/server/drivers/postgres.js";
import { runDriverConformance } from "./conformance.js";
import { runTransactionConformance } from "./transaction-conformance.js";

async function pgliteDriver() {
  const client = await PGlite.create();
  const driver = new PostgresDriver({ client });
  return { driver, dispose: () => driver.close() };
}

runDriverConformance("conformance: PostgresDriver (PGlite)", pgliteDriver);
runTransactionConformance("transactions: PostgresDriver (PGlite, native)", pgliteDriver);

// SQLite's answers, measured with better-sqlite3 on 2026-10-15 (node 24.19.0,
// better-sqlite3 in this checkout's node_modules): the expected values below
// are SQLite's, not the port's.
describe("SQLite truth and comparison semantics on PostgreSQL (PGlite)", () => {
  async function seeded(): Promise<PostgresDriver> {
    const driver = new PostgresDriver({ client: await PGlite.create() });
    await driver.query(`CREATE TABLE t (id INTEGER PRIMARY KEY, draft INTEGER, key TEXT, flag BOOLEAN)`, []);
    const rows: Array<[number, number | null, string | null, boolean | null]> = [
      [1, 0, "0", false], [3, 2, "7.5", null], [4, 0, "abc", false], [5, 0, "", false], [6, null, null, null],
    ];
    for (const [id, draft, key, flag] of rows) {
      await driver.query(`INSERT INTO t (id, draft, key, flag) VALUES (?, ?, ?, ?)`, [id, draft, key, flag]);
    }
    return driver;
  }

  it("IS TRUE / IS FALSE follow SQLite's truth for integer, text and boolean operands", async () => {
    const driver = await seeded();
    const one = async (expr: string) => (await driver.query<{ v: unknown }>(`SELECT ${expr} AS v FROM t WHERE id = 1`, [])).rows[0]!.v;
    expect(await one("draft IS TRUE")).toBe(0);
    expect(await one("draft IS NOT TRUE")).toBe(1);
    expect(await one("draft IS FALSE")).toBe(1);
    expect(await one("key IS FALSE")).toBe(1); // '0' is false
    expect(await one("key IS TRUE")).toBe(0);
    expect(await one("flag IS NOT TRUE")).toBe(1);
    expect(await one("(id + 1) IS TRUE")).toBe(1); // an expression operand
    expect(await one("NOT (id = 1) IS FALSE")).toBe(1);
    expect(await one("lower(key) IS TRUE")).toBe(0);
    const literal = await driver.query<Record<string, unknown>>(
      `SELECT '10' IS TRUE AS t1, '0' IS TRUE AS t0, ' 2 ' IS TRUE AS sp, '-0' IS TRUE AS nz, '0.0' IS TRUE AS zz, '7abc' IS TRUE AS s7, '' IS TRUE AS e, 'abc' IS FALSE AS af`,
      [],
    );
    expect(literal.rows[0]).toEqual({ t1: 1, t0: 0, sp: 1, nz: 0, zz: 0, s7: 1, e: 0, af: 1 });
    const nulls = await driver.query<Record<string, unknown>>(`SELECT draft IS TRUE AS t, draft IS NOT TRUE AS nt, draft IS FALSE AS f FROM t WHERE id = 6`, []);
    expect(nulls.rows[0]).toEqual({ t: 0, nt: 1, f: 0 });
    await driver.close();
  });

  it("an integer column against a text value compares as SQLite's affinity rule does, for all six operators", async () => {
    const driver = await seeded();
    // id 1 vs '0', id 3 vs '7.5', id 4 vs 'abc': the text is a number, or it is not.
    const rows = (
      await driver.query<Record<string, unknown>>(`SELECT id, id = key AS eq, id < key AS lt, id >= key AS ge FROM t WHERE id IN (1, 3, 4) ORDER BY id`, [])
    ).rows;
    expect(rows).toEqual([
      { id: 1, eq: 0, lt: 0, ge: 1 },
      { id: 3, eq: 0, lt: 1, ge: 0 },
      { id: 4, eq: 0, lt: 1, ge: 0 },
    ]);
    // A text expression on the left: the flipped operators.
    const flipped = await driver.query<Record<string, unknown>>(
      `SELECT a.id = b.key AS eq, a.id < b.key AS lt FROM (SELECT 3 AS id) a, (SELECT '7.5'::text AS key) b`,
      [],
    );
    expect(flipped.rows[0]).toEqual({ eq: 0, lt: 1 });
    // NULL on either side is NULL.
    const nulls = await driver.query<Record<string, unknown>>(`SELECT (id = key) AS eq, (id < key) AS lt FROM t WHERE id = 6`, []);
    expect(nulls.rows[0]).toEqual({ eq: null, lt: null });
    await driver.close();
  });
});

describe("translateSqliteToPostgres", () => {
  it("numbers placeholders and leaves string literals alone", () => {
    expect(translateSqliteToPostgres("SELECT '?' AS q, ? AS a, ? AS b").sql).toBe("SELECT '?' AS q, $1 AS a, $2 AS b");
  });
  it("turns INSERT OR IGNORE into ON CONFLICT DO NOTHING", () => {
    const t = translateSqliteToPostgres(`INSERT OR IGNORE INTO "t" ("id", "v") VALUES (1, 0)`);
    expect(t.sql).toBe(`INSERT INTO "t" ("id", "v") VALUES (1, 0) ON CONFLICT DO NOTHING RETURNING *`);
    expect(t.explicitId).toBe(true);
  });
  it("folds a NOCASE comparison to lower() on the column", () => {
    expect(translateSqliteToPostgres(`SELECT id FROM cards c WHERE c."key" COLLATE NOCASE = ?`).sql).toBe(
      `SELECT id FROM cards c WHERE lower(c."key") = lower($1)`,
    );
  });
  it("skips PRAGMA", () => {
    expect(translateSqliteToPostgres("PRAGMA foreign_keys = ON").skip).toBe(true);
  });
});
