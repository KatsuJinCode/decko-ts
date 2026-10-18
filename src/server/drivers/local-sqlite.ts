// Reference SQLDatabaseDriver over better-sqlite3 — the dev/test workhorse
// for decko-ts.
//
// better-sqlite3 is synchronous under the hood; the async signatures of
// SQLDatabaseDriver are satisfied with resolved promises. Everything runs on
// the calling thread, so this driver is only appropriate for local
// development, tests and CLI tooling — never for an edge deployment.

// The ambient module declaration lives in tests/schema/better-sqlite3.d.ts
// (see BetterSqlite3Statement below for why the shared shim is not grown).
// Under the engine typecheck's strict mode the untyped import would be a
// TS7016, and the declaration only joins the program through this reference
// — the config's explicit `types: ["node"]` excludes typeRoot auto-inclusion.
// It sits here because a triple-slash directive is honored only before any
// statement; below the imports it is an ordinary comment.
/// <reference path="../../../tests/schema/better-sqlite3.d.ts" />
import type { SQLDatabaseDriver, SQLQueryResult, SQLStatement, SQLTransactionGuarantee } from "../driver.js";
import { rowIdOrOmit, TransactionGate } from "../driver.js";
import { inTransactionStatementScope, runInTransactionStatementScope } from "../transaction-statement-scope.js";
import Database from "better-sqlite3";

/**
 * The better-sqlite3 v13 statement members this driver relies on, verified
 * at RUNTIME (better-sqlite3 13.0.3, Windows, node 24):
 * `reader` (false for writes), `columns()` (throws on non-reading
 * statements), `raw().all()` (array rows), and `run()` returning
 * `{changes, lastInsertRowId}` as number|bigint.
 *
 * Why a local interface instead of growing the shared ambient shim: the
 * module declaration for better-sqlite3 lives in tests/schema/
 * better-sqlite3.d.ts (an `export =` style declaration), and TypeScript
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
 *  added for the REGEXP UDF that CQL match queries need: registering it
 *  requires the underlying handle, which the driver deliberately does not
 *  expose. Runtime-verified on
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
  /** True while a transaction is open on the connection. */
  readonly inTransaction: boolean;
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
   *  window. Without it, statement parsing and planning for the multi-KB
   *  recursive walk is the dominant per-render fixed cost. */
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
    // A statement issued OUTSIDE any transaction's call tree while another
    // request's transaction is open on this driver's one connection is not
    // part of that transaction, and cannot escape it either (one connection,
    // an open BEGIN): queue behind it on the gate, then run free. Riding the
    // transaction coupled the statement's fate to it — a save's ROLLBACK
    // silently undid an unrelated request's already-acknowledged write, and
    // its reads saw the transaction's uncommitted rows. Where attribution is
    // impossible (no AsyncLocalStorage on the runtime), the historical
    // shared-object coupling applies, per ../driver.ts.
    if (this.db.inTransaction && inTransactionStatementScope() === false) {
      return this.gate.run(() => this.query<T>(sql, params));
    }
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
    // Standalone routing for a batch, same rule as query() above: outside
    // any transaction's call tree, queue behind an open transaction on the
    // gate instead of executing inside its BEGIN..COMMIT.
    if (this.db.inTransaction && inTransactionStatementScope() === false) {
      return this.gate.run(() => this.batch(statements));
    }
    // A single synchronous SQLite transaction: every statement in the batch
    // commits together or, on any error, rolls back and the error is
    // rethrown. Statement results are collected in order. Inside
    // transaction() better-sqlite3 nests this as a SAVEPOINT, so the batch
    // stays part of the enclosing unit of work.
    const runBatch = this.db.transaction(() => statements.map((s) => this.executeOne(s)));
    return runBatch();
  }

  /** SQLite's own transaction on this driver's one connection. BEGIN
   *  IMMEDIATE takes the database write lock up front, so another
   *  connection (another process, or another driver over the same file)
   *  waits or gets SQLITE_BUSY instead of interleaving. */
  readonly transactionGuarantee: SQLTransactionGuarantee = {
    mechanism: "native",
    atomicOnFailure: true,
    crashRecovery: "database",
    readersIsolated: true,
    serializedWriters: "database",
    atomicBatch: true,
    idsReusedAfterRollback: true,
  };

  private readonly gate = new TransactionGate();

  async transaction<R>(work: () => Promise<R>): Promise<R> {
    return this.gate.run(async () =>
      // Mark work's call tree as transaction work (transaction-statement-scope.ts):
      // statements issued inside it attribute to this transaction and run on
      // the connection as they must; statements issued outside any
      // transaction's tree while this BEGIN is open queue behind it instead
      // of silently joining it (query/batch above).
      runInTransactionStatementScope(async () => {
        this.prepareCached("BEGIN IMMEDIATE").run();
        let result: R;
        try {
          result = await work();
        } catch (error) {
          this.rollbackQuietly();
          throw error;
        }
        try {
          this.prepareCached("COMMIT").run();
        } catch (error) {
          this.rollbackQuietly();
          throw error;
        }
        return result;
      }),
    );
  }

  /** ROLLBACK unless SQLite already ended the transaction itself (some
   *  errors, such as SQLITE_FULL, roll back automatically). */
  private rollbackQuietly(): void {
    if (this.db.inTransaction) this.prepareCached("ROLLBACK").run();
  }

  /** Register a scalar SQL function on the underlying handle — the narrow,
   *  additive extension CQL's REGEXP UDF needs (registerSqliteRegexpFunction
   *  in src/cql/sqlite-regexp.ts). Nothing about existing behavior changes;
   *  callers that never register a function are unaffected. Must be called
   *  before the first statement referencing the function is prepared. */
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

