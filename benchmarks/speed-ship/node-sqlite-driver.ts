// benchmarks/speed-ship/node-sqlite-driver.ts
// A SQLDatabaseDriver over Node's built-in node:sqlite (DatabaseSync), the
// same contract LocalSqliteDriver implements over better-sqlite3. It exists
// because better-sqlite3's native addon does not build on this machine's
// toolchain; node:sqlite ships with Node 24 and needs no build.
//
// Semantics follow LocalSqliteDriver: query() is one statement, batch() runs
// its statements in one transaction and returns one result per statement.
// Rows are copied into plain objects (node:sqlite hands back null-prototype
// objects) so downstream code that calls hasOwnProperty etc. behaves as it
// does on better-sqlite3.

import { DatabaseSync, type StatementSync } from "node:sqlite";
import type { SQLDatabaseDriver, SQLQueryResult, SQLStatement } from "../../src/server/driver.js";
import { rowIdOrOmit } from "../../src/server/driver.js";

function normalizeParam(p: unknown): unknown {
  if (p === undefined) return null;
  if (typeof p === "boolean") return p ? 1 : 0;
  return p;
}

export class NodeSqliteDriver implements SQLDatabaseDriver {
  private readonly db: DatabaseSync;
  private readonly stmts = new Map<string, { stmt: StatementSync; reader: boolean }>();

  constructor(path: string, readonly = true) {
    this.db = new DatabaseSync(path, { readOnly: readonly });
  }

  private prep(sql: string): { stmt: StatementSync; reader: boolean } {
    let e = this.stmts.get(sql);
    if (!e) {
      const stmt = this.db.prepare(sql);
      const reader = stmt.columns().length > 0;
      e = { stmt, reader };
      this.stmts.set(sql, e);
    }
    return e;
  }

  private one(sql: string, params: unknown[]): SQLQueryResult {
    const { stmt, reader } = this.prep(sql);
    const ps = (params ?? []).map(normalizeParam) as never[];
    if (reader) {
      const rows = stmt.all(...ps).map((r) => ({ ...(r as Record<string, unknown>) }));
      return { rows, rowsAffected: 0 };
    }
    const info = stmt.run(...ps);
    return {
      rows: [],
      rowsAffected: Number(info.changes),
      lastInsertRowId: rowIdOrOmit(info.lastInsertRowid as number | bigint),
    };
  }

  async query<T = unknown>(sql: string, params: unknown[]): Promise<SQLQueryResult<T>> {
    return this.one(sql, params) as SQLQueryResult<T>;
  }

  async batch(statements: SQLStatement[]): Promise<SQLQueryResult[]> {
    if (statements.length === 0) return [];
    // Read-only workload: no transaction needed for consistency against a
    // static file, and BEGIN would fail on a read-only handle for writes
    // anyway. Matches the result shape of LocalSqliteDriver.batch.
    return statements.map((s) => this.one(s.sql, s.params));
  }

  /** Write handle helper for the freshness check (edit an included card). */
  exec(sql: string): void {
    this.db.exec(sql);
  }

  close(): void {
    this.db.close();
  }
}
