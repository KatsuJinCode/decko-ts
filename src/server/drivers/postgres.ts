// PostgresDriver — SQLDatabaseDriver implementation over a PostgreSQL
// connection. Part of the storage-driver foundation (upstream proposal
// decko-commons/decko#1282).
//
// Architecture (rationale, also in docs/postgres-dialect-notes.md):
//
//   engine emits SQLite-flavored SQL + ? placeholders
//      ↓
//   PostgresDriver.query / .batch
//      ↓
//   toPostgresSql() (postgres-dialect.ts) rewrites the SQL:
//     * `?` → `$1`, `$2`, ...  (in order, outside string literals and comments)
//     * SQLite functions → PG equivalents (INSTR → STRPOS, SUBSTR → SUBSTRING, etc.)
//     * REGEXP → ~*, COLLATE NOCASE → LOWER(), PRAGMA → -- pragma ...
//      ↓
//   toPostgresValue() maps JS params to PG bind values
//      ↓
//   connection.query(sql, params) (injected PostgresConnection)
//
// The connection is INJECTED (not constructed) so the test fake (and any
// real node-postgres client) plugs into the same seam. The engine never
// imports vendor SDKs (src/server/driver.ts); this file declares the
// minimum PG surface structurally.
//
// HONEST BAR (this driver is NOT yet proven parity without a live
// PostgreSQL server — see docs/postgres-dialect-notes.md "Live-PG rung"):
//   * the dialect mapping is unit-tested with pure inputs (vitest cases
//     in tests/server/drivers/postgres-dialect.test.ts);
//   * the driver contract is exercised against a fake connection (vitest
//     cases in tests/server/drivers/postgres.test.ts);
//   * byte-parity vs Ruby (MySQL/oracle) is NOT proven — there is no
//     decko-MySQL oracle rung at the moment (docs/oracle-harness.md
//     "Known oracle-on-SQLite limitation"), and PostgreSQL is a different
//     SQL dialect from MySQL on top of that. Running this driver against
//     a live PostgreSQL server and replaying the corpus is the live-PG
//     rung; the spec for that rung lives in the doc named above.

import type { SQLDatabaseDriver, SQLQueryResult, SQLStatement } from "../driver.js";
import { toPostgresSql, toPostgresValue } from "./postgres-dialect.js";

/** The shape of one PG result, narrowed to the members this driver uses.
 *  Declared structurally (no vendor import) so any client satisfying the
 *  shape plugs in: node-postgres v8 returns this exact shape from
 *  `client.query(...)`; the test fake returns it directly. */
export interface PostgresResult {
  /** Row objects keyed by column name; PG column-name lookup is
   *  case-sensitive unless quoted in the SELECT — matches what the
   *  engine's SQL emits (lowercase column names, no quoting). */
  rows: Record<string, unknown>[];
  /** Number of rows affected by INSERT/UPDATE/DELETE. PG sets this to 0
   *  for statements that produce no count (CREATE TABLE, etc.) and to
   *  the row count otherwise. */
  rowCount: number | null;
  /** Last inserted OID (PG-specific; rarely needed today but kept on the
   *  result shape so node-postgres clients pass it through). */
  oid?: number;
}

/** The narrow surface this driver relies on. Any client exposing
 *  `query(sql, params): Promise<PostgresResult>` and `release()` plugs in.
 *  node-postgres `Client` and `PoolClient` both satisfy this; the test
 *  fake does too. */
export interface PostgresConnection {
  query(sql: string, params: unknown[]): Promise<PostgresResult>;
  /** Release the connection back to its pool. For non-pooled clients this
   *  is typically a no-op (`pg.Client#release` is a no-op; `PoolClient#release`
   *  hands the connection back). The driver calls this once when its
   *  `close()` runs. */
  release(): void;
}

/** Options for PostgresDriver construction. */
export interface PostgresDriverOptions {
  /** A connected PostgresConnection (typically from a pool's
   *  `connect()`). Required. */
  connection: PostgresConnection;
}

export class PostgresDriver implements SQLDatabaseDriver {
  private readonly connection: PostgresConnection;
  private released = false;

  constructor(options: PostgresDriverOptions) {
    this.connection = options.connection;
  }

  async query<T = unknown>(sql: string, params: unknown[]): Promise<SQLQueryResult<T>> {
    const rewritten = toPostgresSql(sql);
    if (rewritten.paramCount !== params.length) {
      throw new Error(
        `PostgresDriver: parameter count mismatch — SQL has ${rewritten.paramCount} placeholders, ` +
          `params array has ${params.length} entries`,
      );
    }
    const pgParams = params.map(toPostgresValue);
    const result = await this.connection.query(rewritten.sql, pgParams);
    return pgResultToQueryResult<T>(result);
  }

  async batch(statements: SQLStatement[]): Promise<SQLQueryResult[]> {
    if (statements.length === 0) return [];
    const rewritten = statements.map((s) => {
      const mapped = toPostgresSql(s.sql);
      if (mapped.paramCount !== s.params.length) {
        throw new Error(
          `PostgresDriver: batch parameter count mismatch — statement ` +
            `"${s.sql.slice(0, 80)}..." has ${mapped.paramCount} placeholders, ` +
            `params has ${s.params.length} entries`,
        );
      }
      return { sql: mapped.sql, params: s.params.map(toPostgresValue) };
    });
    // PG's protocol runs a multi-statement query as one pipeline, but
    // there is no native "transactional batch" guarantee the way D1 and
    // better-sqlite3 provide it. The driver fires the statements in
    // order; if atomicity is required, callers wrap the batch in an
    // explicit BEGIN / COMMIT at the engine layer (the same caveat the
    // libsql-http adapter documents). For now, the simplest correct
    // behavior is one round trip per statement. The conformance suite's
    // batch test will document the gap when no live server exists.
    const results: SQLQueryResult[] = [];
    for (const stmt of rewritten) {
      const r = await this.connection.query(stmt.sql, stmt.params);
      results.push(pgResultToQueryResult(r));
    }
    return results;
  }

  /** Release the underlying connection. Not part of SQLDatabaseDriver —
   *  local resource cleanup only. */
  close(): void {
    if (this.released) return;
    this.released = true;
    this.connection.release();
  }
}

/** Map a PG result to the engine's SQLQueryResult shape. Reading
 *  statements report rowsAffected=0 (the engine treats that as "no
 *  change", matching the other adapters). Writing statements report the
 *  PG rowCount. lastInsertRowId is omitted (PG does not have SQLite's
 *  connection-scoped last_insert_rowid — the engine reads it explicitly
 *  via `last_insert_rowid()`/`LASTVAL()` when needed, see write-path.ts). */
function pgResultToQueryResult<T>(result: PostgresResult): SQLQueryResult<T> {
  return {
    rows: (result.rows ?? []) as T[],
    rowsAffected: result.rowCount ?? 0,
    // lastInsertRowId intentionally omitted — PG has no per-connection
    // last-insert id the way SQLite does. The engine's last-insert reads
    // route through `SELECT LASTVAL()` in the dialect layer, which the
    // fake connection can assert against.
  };
}
