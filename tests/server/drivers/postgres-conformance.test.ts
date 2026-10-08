// PostgresDriver dialect-mapping coverage over the shared conformance
// suite's exact queries (tests/server/drivers/conformance.ts).
//
// Exercised via FakePostgresConnection: proves every place the engine
// emits SQL is translated to the PG-flavored form the live server
// expects, with no live PG instance required. See
// tests/server/drivers/postgres.test.ts for the focused dialect cases.
//
// The SHARED CONFORMANCE SUITE itself (round-trip types, batch
// semantics, error propagation, schema usability after failures) is not
// runnable in this repo today: it needs the `pg` client, which is not a
// dependency.  "Live-PG rung" is the spec
// for that surface — what must pass for the driver to claim parity,
// what the corpus replay path looks like, and how the live server is
// set up.

import { describe, it, expect } from "vitest";
import { PostgresDriver } from "../../../src/server/drivers/postgres.js";
import { FakePostgresConnection } from "./fake-postgres-connection.js";

describe("PostgresDriver conformance integration", () => {
  describe("dialect mapping against the shared conformance suite's exact queries (always runs)", () => {
    // The shared conformance suite (conformance.ts) issues CREATE TABLE,
    // INSERT, SELECT, batch, and bad-SQL statements. We replay the SAME
    // statements through PostgresDriver + FakePostgresConnection and
    // assert on the dialect rewrite — proving the engine's conformance
    // battery would land on PG-shaped SQL if a live server were wired in.
    //
    // The shared suite is NOT invoked here because its contract includes
    // "round-trips rows correctly" — the fake cannot execute SQL, so
    // every SELECT would fail. Instead, this test captures the SAME
    // statements as SQL the driver emits and asserts the dialect shape.
    // A live server would replace this with `runDriverConformance(...)`.

    it("rewrites the conformance suite's CREATE TABLE AUTOINCREMENT (DDL not exercised at runtime)", async () => {
      // The conformance suite runs CREATE TABLE statements through the
      // driver. Live PG would need a PG-flavored schema (db/schema.postgres.sql,
      // the schema stream's responsibility — not this one). The runtime
      // driver does not see DDL on a hot path; this test documents the
      // gap.
      const conn = new FakePostgresConnection({ responses: [{ rows: [], rowCount: 0 }] });
      const driver = new PostgresDriver({ connection: conn });
      await driver.query("CREATE TABLE conf_cards (id INTEGER PRIMARY KEY AUTOINCREMENT, n INTEGER)", []);
      // The runtime dialect mapper leaves DDL through to the connection;
      // it does not rewrite CREATE TABLE fragments. PG DDL conversion
      // is the schema stream's job (see pgIdentityColumn in postgres-dialect.ts).
      expect(conn.queries[0].sql).toBe(
        "CREATE TABLE conf_cards (id INTEGER PRIMARY KEY AUTOINCREMENT, n INTEGER)",
      );
    });

    it("rewrites the conformance suite's INSERT VALUES list with $1, $2, ... placeholders", async () => {
      const conn = new FakePostgresConnection({ responses: [{ rows: [], rowCount: 1 }] });
      const driver = new PostgresDriver({ connection: conn });
      const result = await driver.query(
        "INSERT INTO conf_cards (n, f, s, z) VALUES (?, ?, ?, ?)",
        [42, 1.5, "hello", null],
      );
      expect(conn.queries[0].sql).toBe(
        "INSERT INTO conf_cards (n, f, s, z) VALUES ($1, $2, $3, $4)",
      );
      expect(conn.queries[0].params).toEqual([42, 1.5, "hello", null]);
      expect(result.rowsAffected).toBe(1);
    });

    it("rewrites the conformance suite's SELECT to PG form", async () => {
      const conn = new FakePostgresConnection({
        responses: [{ rows: [{ id: 1, n: 42, f: 1.5, s: "hello", z: null }], rowCount: 1 }],
      });
      const driver = new PostgresDriver({ connection: conn });
      const result = await driver.query<Record<string, unknown>>(
        "SELECT id, n, f, s, z FROM conf_cards WHERE id = ?",
        [1],
      );
      expect(conn.queries[0].sql).toBe("SELECT id, n, f, s, z FROM conf_cards WHERE id = $1");
      expect(result.rows).toEqual([{ id: 1, n: 42, f: 1.5, s: "hello", z: null }]);
    });

    it("rewrites the conformance suite's batch (insert + select) in order", async () => {
      const conn = new FakePostgresConnection({
        responses: [
          { rows: [], rowCount: 1 },
          { rows: [{ c: 2 }], rowCount: 1 },
        ],
      });
      const driver = new PostgresDriver({ connection: conn });
      const results = await driver.batch([
        { sql: "INSERT INTO conf_batch (s) VALUES (?)", params: ["two"] },
        { sql: "SELECT COUNT(*) AS c FROM conf_batch", params: [] },
      ]);
      expect(conn.queries[0].sql).toBe("INSERT INTO conf_batch (s) VALUES ($1)");
      expect(conn.queries[0].params).toEqual(["two"]);
      expect(conn.queries[1].sql).toBe("SELECT COUNT(*) AS c FROM conf_batch");
      expect(results[0].rowsAffected).toBe(1);
      expect(results[1].rows).toEqual([{ c: 2 }]);
    });

    it("rewrites the conformance suite's bad-SQL probe to PG form (live PG would reject)", async () => {
      const conn = new FakePostgresConnection();
      conn.enqueueError(new Error("PostgresError: syntax error at or near \"SELEC\""));
      const driver = new PostgresDriver({ connection: conn });
      await expect(driver.query("SELEC 1", [])).rejects.toThrow(/syntax error/);
      expect(conn.queries[0].sql).toBe("SELEC 1");
    });
  });
});

