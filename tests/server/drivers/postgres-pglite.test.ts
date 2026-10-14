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
      `SELECT id FROM cards c WHERE lower(c."key") = $1`,
    );
  });
  it("skips PRAGMA", () => {
    expect(translateSqliteToPostgres("PRAGMA foreign_keys = ON").skip).toBe(true);
  });
});
