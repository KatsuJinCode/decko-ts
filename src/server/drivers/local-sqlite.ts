// Reference SQLDatabaseDriver over better-sqlite3 — the dev/test workhorse
// for decko-ts. Part of the storage-driver foundation (upstream proposal
// decko-commons/decko#1282).
//
// better-sqlite3 is synchronous under the hood; the async signatures of
// SQLDatabaseDriver are satisfied with resolved promises. Everything runs on
// the calling thread, so this driver is only appropriate for local
// development, tests and CLI tooling — never for an edge deployment.

import type { SQLDatabaseDriver, SQLQueryResult, SQLStatement } from "../driver.js";
import Database from "better-sqlite3";

/**
 * The better-sqlite3 v13 statement members this driver relies on, verified
 * at RUNTIME on this machine (better-sqlite3 13.0.3, Windows, node 24):
 * `reader` (false for writes), `columns()` (throws on non-reading
 * statements), `raw().all()` (array rows), and `run()` returning
 * `{changes, lastInsertRowId}` as number|bigint.
 *
 * Why a local interface instead of growing the shared ambient shim: the
 * module declaration for better-sqlite3 lives in tests/schema/
 * better-sqlite3.d.ts (schema stream, `export =` style), and TypeScript
 * does not merge a second `declare module` block into an `export =`
 * declaration — verified with a minimal repro. prepare()'s result is
 * therefore narrowed through this interface at the single boundary below.
 * If @types/better-sqlite3 is ever added, replace this interface with the
 * real definitions.
 */
export interface BetterSqlite3Statement {
  readonly reader: boolean;
  run(...params: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  all(...params: unknown[]): Record<string, unknown>[];
  raw(): { all(...params: unknown[]): unknown[][] };
  columns(): { name: string; type: string | null }[];
}

/** The database members this driver uses; see BetterSqlite3Statement for
 *  why this exists. `transaction(fn)` returns a wrapped function; calling
 *  it runs fn inside BEGIN/COMMIT/ROLLBACK — an exception rolls back and
 *  rethrows (runtime-verified). `function(name[, options], fn)` is
 *  better-sqlite3 Database#function (scalar SQL function registration),
 *  added by the CQL execution stream: the REGEXP UDF for CQL match queries
 *  needs the underlying handle, which the driver deliberately does not
 *  expose (see docs/cql-execution-notes.md). Runtime-verified on
 *  better-sqlite3 13.0.3 / SQLite 3.53.4, Windows, node 24. */
export interface BetterSqlite3Database {
  prepare(sql: string): BetterSqlite3Statement;
  transaction<Args extends unknown[], R>(fn: (...args: Args) => R): (...args: Args) => R;
  function(
    name: string,
    options: { deterministic?: boolean; varargs?: boolean },
    fn: (...args: unknown[]) => unknown,
  ): unknown;
  function(name: string, fn: (...args: unknown[]) => unknown): unknown;
  close(): void;
}
export interface LocalSqliteDriverOptions {
  /** SQLite database path. `":memory:"` (the default) keeps everything in
   *  RAM; any other path is opened or created on disk. */
  path?: string;
  /** Open the database read-only (SQLITE_OPEN_READONLY). */
  readonly?: boolean;
}

/** Normalized row object: column name -> SQLite value. Duplicate column
 *  names collapse (last one wins), mirroring better-sqlite3's own
 *  object-row behavior. */
export type SqliteRow = Record<string, unknown>;

export class LocalSqliteDriver implements SQLDatabaseDriver {
  private readonly db: BetterSqlite3Database;
  /** Prepared-statement cache keyed by SQL text. The engine re-issues the
   *  SAME statement texts every render (the closure walk, the folded
   *  permission/structure statements, the fetch queries — the varying parts
   *  ride as parameters); without this cache better-sqlite3 re-parses and
   *  re-plans the multi-KB recursive walk twice per render. SQLite handles
   *  schema-change invalidation of a live sqlite3_stmt itself, and the
   *  cache's lifetime is this driver's handle, so there is no staleness
   *  window. Measured 2026-09-22: the dominant per-render fixed cost on the
   *  corpus deck. */
  private readonly stmtCache = new Map<string, BetterSqlite3Statement>();

  constructor(options: LocalSqliteDriverOptions = {}) {
    this.db = new Database(options.path ?? ":memory:", {
      readonly: options.readonly ?? false,
    }) as unknown as BetterSqlite3Database;
  }

  private prepareCached(sql: string): BetterSqlite3Statement {
    let stmt = this.stmtCache.get(sql);
    if (stmt === undefined) {
      stmt = this.db.prepare(sql);
      this.stmtCache.set(sql, stmt);
    }
    return stmt;
  }

  async query<T = unknown>(sql: string, params: unknown[]): Promise<SQLQueryResult<T>> {
    const stmt = this.prepareCached(sql);
    if (stmt.reader) {
      // Reading statement: better-sqlite3's .all() gives object rows but no
      // change counters, so rowsAffected is reported as 0 and
      // lastInsertRowId is omitted. SQLite does track a connection-level
      // last_insert_rowid(), but surfacing it here would make read results
      // inconsistent between this driver and the remote adapters.
      const rows = stmt.all(...params) as T[];
      return { rows, rowsAffected: 0 };
    }
    const info = stmt.run(...params);
    return {
      rows: [],
      rowsAffected: Number(info.changes),
      lastInsertRowId: rowIdOrOmit(info.lastInsertRowid),
    };
  }

  async batch(statements: SQLStatement[]): Promise<SQLQueryResult[]> {
    if (statements.length === 0) return [];
    // A single synchronous SQLite transaction: every statement in the batch
    // commits together or, on any error, rolls back and the error is
    // rethrown. Statement results are collected in order.
    const runBatch = this.db.transaction(() => statements.map((s) => this.executeOne(s)));
    return runBatch();
  }

  /** Register a scalar SQL function on the underlying handle — the narrow,
   *  additive extension the CQL execution stream needs for its REGEXP UDF
   *  (registerSqliteRegexpFunction in src/cql/sqlite-regexp.ts; rationale
   *  and edge-driver contrast in docs/cql-execution-notes.md). Nothing
   *  about existing behavior changes; callers that never register a
   *  function are unaffected. Must be called before the first statement
   *  referencing the function is prepared. */
  registerFunction(
    name: string,
    fn: (...args: unknown[]) => unknown,
    options?: { deterministic?: boolean; varargs?: boolean },
  ): void {
    if (options) this.db.function(name, options, fn);
    else this.db.function(name, fn);
  }

  /** Close the underlying database handle. Not part of SQLDatabaseDriver —
   *  local resource cleanup only. */
  close(): void {
    this.db.close();
  }

  private executeOne(statement: SQLStatement): SQLQueryResult<SqliteRow> {
    const stmt = this.prepareCached(statement.sql);
    if (stmt.reader) {
      return { rows: stmt.all(...statement.params), rowsAffected: 0 };
    }
    const info = stmt.run(...statement.params);
    return {
      rows: [],
      rowsAffected: Number(info.changes),
      lastInsertRowId: rowIdOrOmit(info.lastInsertRowid),
    };
  }
}

/** SQLite reports 0 for "no insert happened"; the driver contract treats
 *  lastInsertRowId as optional, so 0 becomes "omitted". */
function rowIdOrOmit(lastInsertRowId: number | bigint): number | bigint | undefined {
  return BigInt(lastInsertRowId) > 0n ? lastInsertRowId : undefined;
}
