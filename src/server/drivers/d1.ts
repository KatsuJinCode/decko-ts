// CloudflareD1Adapter — SQLDatabaseDriver over a Cloudflare D1 binding.
//
// The engine never imports vendor SDKs (see src/server/driver.ts), so this
// file declares the D1 API structurally instead of importing
// @cloudflare/workers-types. The shapes below were verified against the
// miniflare 5 local D1 emulation (workerd on Windows; meta.changes,
// meta.last_row_id, batch() semantics, bigint-bind rejection) — see
// docs/decisions/0003-edge-native-driver-interfaces.md for the verified details.
//
// In Workers the constructor argument is the `D1Database` binding from
// `env`; in tests it is the object returned by miniflare's
// `getD1Database()`. Both satisfy D1DatabaseLike structurally.

import type { SQLDatabaseDriver, SQLQueryResult, SQLStatement, SQLTransactionGuarantee } from "../driver.js";
import { rowIdOrOmit, TransactionGate } from "../driver.js";
import {
  clearLeaseAssertStatement,
  isLeaseAssertFailure,
  lockStateStatement,
  TransactionLeaseLostError,
  UndoJournal,
  type UndoJournalOptions,
} from "./undo-journal.js";

/** Bind values D1 accepts. Note: JS numbers bind with REAL storage class
 *  (D1 has no integer binding for JS numbers), ArrayBuffer/Uint8Array bind
 *  as BLOB. bigint and boolean are NOT supported and D1 rejects them
 *  (verified locally: "D1_TYPE_ERROR: Type 'bigint' not supported"). */
export type D1BindValue = null | number | string | ArrayBuffer | Uint8Array;

export interface D1ExecMeta {
  changes: number;
  last_row_id?: number | bigint;
  duration?: number;
  rows_read?: number;
  rows_written?: number;
  [key: string]: unknown;
}

export interface D1ResultLike {
  results?: Record<string, unknown>[];
  success?: boolean;
  meta?: D1ExecMeta;
}

export interface D1PreparedStatementLike {
  bind(...values: D1BindValue[]): D1PreparedStatementLike;
  run(): Promise<D1ResultLike>;
  all(): Promise<D1ResultLike>;
}

export interface D1DatabaseLike {
  prepare(sql: string): D1PreparedStatementLike;
  /** Executes all statements sequentially inside one implicit transaction;
   *  any failure rolls the whole batch back. */
  batch(statements: D1PreparedStatementLike[]): Promise<D1ResultLike[]>;
}

/** D1 refuses a statement with more than 100 bound parameters ("too many SQL
 *  variables"). Cloudflare docs, D1 Limits: "Maximum bound parameters per
 *  query: 100". */
export const D1_MAX_BOUND_PARAMETERS = 100;

/** A bound value as the SQL literal that compares and returns the same value
 *  on SQLite; undefined when no literal is exact (a string holding NUL, a
 *  non-finite number, or a type D1 would not bind). */
function exactLiteral(v: unknown): string | undefined {
  if (v === null) return "NULL";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return undefined;
    if (Number.isInteger(v)) return String(v);
    const s = String(v);
    return /[.eE]/.test(s) ? s : `${s}.0`;
  }
  if (typeof v === "string") return v.includes("\u0000") ? undefined : `'${v.replace(/'/g, "''")}'`;
  if (v instanceof Uint8Array) return `X'${Array.from(v, (b) => b.toString(16).padStart(2, "0")).join("")}'`;
  return undefined;
}

/**
 * The statement with every `?` replaced by its value as an exact literal, for
 * statements over D1's bound-parameter cap (the engine's search statements
 * bind one value per listed id, and a long list passes 100). Placeholders are
 * found outside quoted strings, quoted identifiers and comments. Returns
 * undefined, leaving the statement as it was, when it uses numbered or named
 * parameters, the counts disagree, or a value has no exact literal.
 */
export function inlineBoundParameters(sql: string, params: readonly unknown[]): string | undefined {
  let out = "";
  let next = 0;
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    if (ch === "'" || ch === '"' || ch === "`" || ch === "[") {
      const close = ch === "[" ? "]" : ch;
      let j = i + 1;
      for (;;) {
        if (j >= sql.length) return undefined;
        if (sql[j] === close) {
          if (close !== "]" && sql[j + 1] === close) {
            j += 2;
            continue;
          }
          break;
        }
        j += 1;
      }
      out += sql.slice(i, j + 1);
      i = j + 1;
    } else if (ch === "-" && sql[i + 1] === "-") {
      const j = sql.indexOf("\n", i);
      const end = j === -1 ? sql.length : j;
      out += sql.slice(i, end);
      i = end;
    } else if (ch === "/" && sql[i + 1] === "*") {
      const j = sql.indexOf("*/", i + 2);
      if (j === -1) return undefined;
      out += sql.slice(i, j + 2);
      i = j + 2;
    } else if (ch === "?") {
      if (/[0-9]/.test(sql[i + 1] ?? "")) return undefined;
      if (next >= params.length) return undefined;
      const lit = exactLiteral(params[next]);
      if (lit === undefined) return undefined;
      out += lit;
      next += 1;
      i += 1;
    } else if ((ch === ":" || ch === "@" || ch === "$") && /[A-Za-z_]/.test(sql[i + 1] ?? "")) {
      return undefined;
    } else {
      out += ch;
      i += 1;
    }
  }
  return next === params.length ? out : undefined;
}

/** D1 refuses an expression nested more than 100 deep ("Expression tree is
 *  too large (maximum depth 100)"; measured in workerd's local D1). SQLite
 *  parses `a OR b OR c ...` left-deep, one level per term, so the engine's
 *  junction lookups — `(j.left_id = ? AND j.right_id = ?) OR ...` over a
 *  page's pairs — pass the limit on large pages. */
export const D1_MAX_EXPR_DEPTH = 100;

/** Chains with at least this many OR terms are regrouped. */
const OR_CHAIN_MIN_TERMS = 16;

/** One parenthesised term, nesting at most two levels inside. */
const PAREN_TERM = String.raw`\((?:[^()']|'[^']*'|\((?:[^()']|'[^']*'|\([^()']*\))*\))*\)`;
const OR_CHAIN = new RegExp(`${PAREN_TERM}(?:\\s+OR\\s+${PAREN_TERM}){${OR_CHAIN_MIN_TERMS - 1},}`, "g");
const PAREN_TERM_ONE = new RegExp(PAREN_TERM, "g");

/**
 * The statement with every long flat chain `(t1) OR (t2) OR ... (tn)`
 * regrouped as a balanced tree, `((t1) OR (t2)) OR ((t3) OR (t4)) ...`, so
 * its depth is about log2(n) instead of n. The terms, their order and the
 * placeholders' order are unchanged, and OR is associative, so the
 * statement means the same; SQLite's planner splits a WHERE clause's ORs
 * into the same term list however they are parenthesised. Returns the
 * statement unchanged when it holds no such chain.
 */
export function balanceOrChains(sql: string): string {
  if (sql.split(" OR ").length <= OR_CHAIN_MIN_TERMS) return sql;
  return sql.replace(OR_CHAIN, (chain) => {
    const terms = chain.match(PAREN_TERM_ONE) ?? [];
    const rebuilt = terms.join(" OR ");
    // Only regroup when the match is exactly the terms joined by OR.
    if (rebuilt.replace(/\s+/g, " ") !== chain.replace(/\s+/g, " ")) return chain;
    const tree = (list: string[]): string => (list.length === 1 ? list[0] : `(${tree(list.slice(0, list.length >> 1))} OR ${tree(list.slice(list.length >> 1))})`);
    return tree(terms);
  });
}

export interface CloudflareD1AdapterOptions {
  /** Options for the compensating transaction (src/server/drivers/
   *  undo-journal.ts): which tables it journals, the lock lease and wait. */
  journal?: UndoJournalOptions;
}

export class CloudflareD1Adapter implements SQLDatabaseDriver {
  private readonly db: D1DatabaseLike;
  private readonly gate = new TransactionGate();
  private readonly journal: UndoJournal;
  /** True once a read here has seen the lock-state table, so the serving
   *  path can stop tolerating the not-installed-yet case. The table is
   *  never dropped once created; before the first transaction ever ran,
   *  there is no lease and nothing to repair. */
  private lockStateSeen = false;

  /** D1 has no interactive transaction (BEGIN is refused; only a batch is
   *  atomic, and a batch cannot read its own writes and branch). A save
   *  reads between writes, so transaction() is compensating: the undo
   *  journal records each write's prior row and a failure restores them in
   *  one atomic batch. A database lock row serializes transactions across
   *  isolates; every statement a transaction runs is fenced to its lease
   *  (batched with an ownership assert), and a serving read repairs a
   *  lease-expired holder's rows before answering, so recovery does not
   *  wait for the next transaction. What is still true: a reader sees a
   *  live, unexpired transaction's intermediate rows. */
  readonly transactionGuarantee: SQLTransactionGuarantee = {
    mechanism: "compensating",
    atomicOnFailure: true,
    crashRecovery: "next-transaction-or-read",
    readersIsolated: false,
    serializedWriters: "database",
    atomicBatch: true,
    idsReusedAfterRollback: false,
  };

  constructor(db: D1DatabaseLike, options: CloudflareD1AdapterOptions = {}) {
    this.db = db;
    // The journal's own batches carry their ownership guards already
    // (begin, takeover, commit, rollback); wiring it to the plain methods
    // keeps them out of the serving-read lease check, which is meaningless
    // mid-begin, and out of the fence, which would double-assert.
    this.journal = new UndoJournal(
      { query: (sql, params) => this.plainQuery(sql, params), batch: (statements) => this.plainBatch(statements) },
      options.journal,
    );
  }

  async transaction<R>(work: () => Promise<R>): Promise<R> {
    return this.gate.run(() => this.journal.run(work));
  }

  /** Every statement the transaction callback runs is batched with a fence
   *  that verifies, atomically with the statement's execution, that the
   *  transaction still owns the lock: a batch is D1's atomic unit, so a
   *  statement can no more land after a takeover than after a failed
   *  assert, and the journal's triggers fire only for statements its
   *  owner really executed. */
  async query<T = unknown>(sql: string, params: unknown[]): Promise<SQLQueryResult<T>> {
    if (isWriteStatement(sql)) {
      const [result] = await this.batch([{ sql, params }]);
      return result as SQLQueryResult<T>;
    }
    const fence = this.transactionFence();
    if (fence !== undefined) {
      let results: SQLQueryResult[];
      try {
        results = await this.plainBatch([fence, { sql, params }, clearLeaseAssertStatement()]);
      } catch (error) {
        throw lostLeaseOrOriginal(error);
      }
      return results[1] as SQLQueryResult<T>;
    }
    const [result] = await this.servingReads([{ sql, params }]);
    return result as SQLQueryResult<T>;
  }

  /** The prepared statement, with the values inlined when there are more
   *  than D1 accepts as bound parameters. */
  private prepareBound(rawSql: string, params: unknown[]): D1PreparedStatementLike {
    const sql = balanceOrChains(rawSql);
    if (params.length > D1_MAX_BOUND_PARAMETERS) {
      const inlined = inlineBoundParameters(sql, params);
      if (inlined !== undefined) return this.db.prepare(inlined);
    }
    return this.db.prepare(sql).bind(...(params as D1BindValue[]));
  }

  /** plainBatch: the statements exactly as given, results aligned to them,
   *  with each write followed by `SELECT changes()` so rowsAffected counts
   *  the statement's own rows (D1's meta.changes is
   *  sqlite3_total_changes(), which also counts rows its triggers wrote —
   *  the deck_data_version stamp, the undo journal). */
  private async plainBatch(statements: SQLStatement[]): Promise<SQLQueryResult[]> {
    const prepared: D1PreparedStatementLike[] = [];
    const changesAt: (number | undefined)[] = [];
    for (const s of statements) {
      prepared.push(this.prepareBound(s.sql, (s.params ?? []) as unknown[]));
      if (isWriteStatement(s.sql)) {
        changesAt.push(prepared.length);
        prepared.push(this.db.prepare("SELECT changes() AS decko_changes"));
      } else {
        changesAt.push(undefined);
      }
    }
    const results = await this.db.batch(prepared);
    let at = 0;
    return statements.map((_, i) => {
      const result = results[at];
      assertSuccess("batch", `statement ${i}`, result);
      const mapped = this.toQueryResult<unknown>(result);
      const changesIndex = changesAt[i];
      at += changesIndex === undefined ? 1 : 2;
      if (changesIndex !== undefined) {
        const row = results[changesIndex]?.results?.[0] as { decko_changes?: unknown } | undefined;
        mapped.rowsAffected = Number(row?.decko_changes ?? mapped.rowsAffected);
      }
      return mapped;
    });
  }

  /** Outside a transaction this is the serving path (servingReads); inside
   *  one, the whole batch runs behind a single lease fence — a D1 batch is
   *  atomic, so the ownership check at its front holds for every statement
   *  in it, and a lost lease aborts the batch with nothing executed. */
  async batch(statements: SQLStatement[]): Promise<SQLQueryResult[]> {
    const fence = this.transactionFence();
    if (fence === undefined) return this.servingReads(statements);
    // One fence guards the whole batch: a D1 batch is atomic, so the
    // ownership check at its front holds for every statement in it.
    let results: SQLQueryResult[];
    try {
      results = await this.plainBatch([fence, ...statements, clearLeaseAssertStatement()]);
    } catch (error) {
      throw lostLeaseOrOriginal(error);
    }
    return results.slice(1, 1 + statements.length);
  }

  /** Answers read-only statements when no transaction is active on this
   *  adapter. Pairs them with the lock row in one atomic batch: when the
   *  row names a holder whose lease has expired, that holder's journal is
   *  restored first (repairExpiredLease) and the reads are answered after,
   *  so an interrupted save's rows are never served and its recovery does
   *  not wait for the next transaction. A batch that writes is not
   *  checked: it cannot be safely re-run after a repair, and the engine
   *  writes journaled tables only inside transactions. */
  private async servingReads(statements: SQLStatement[]): Promise<SQLQueryResult[]> {
    if (statements.some((s) => isWriteStatement(s.sql))) return this.plainBatch(statements);
    let results: SQLQueryResult[];
    try {
      results = await this.plainBatch([lockStateStatement(), ...statements]);
    } catch (error) {
      if (!this.lockStateSeen && isMissingLockStateTable(error)) return this.plainBatch(statements);
      throw error;
    }
    this.lockStateSeen = true;
    const state = results[0].rows[0] as { tx: unknown; expires_at: unknown } | undefined;
    if (state !== undefined && this.journal.leaseIsExpired(state)) {
      await this.journal.repairExpiredLease(String(state.tx));
      return this.plainBatch(statements); // answer only after the dead rows are restored away
    }
    return results.slice(1);
  }

  /** The lease fence for a statement issued right now, or null outside a
   *  transaction callback (the serving path's lease check applies there
   *  instead). */
  private transactionFence(): SQLStatement | undefined {
    const tx = this.journal.activeTx;
    return tx === null ? undefined : this.journal.leaseFenceStatement(tx);
  }

  /** Statement execution with no lease bookkeeping: the journal's own
   *  batches (they carry their ownership guards) and the serving path's
   *  re-reads after a repair. */
  private async plainQuery<T = unknown>(sql: string, params: unknown[]): Promise<SQLQueryResult<T>> {
    if (isWriteStatement(sql)) {
      const [result] = await this.plainBatch([{ sql, params }]);
      return result as SQLQueryResult<T>;
    }
    const result = await this.prepareBound(sql, params).all();
    assertSuccess("query", sql, result);
    return this.toQueryResult<T>(result);
  }

  private toQueryResult<T>(result: D1ResultLike): SQLQueryResult<T> {
    return {
      rows: (result.results ?? []) as T[],
      rowsAffected: result.meta?.changes ?? 0,
      lastInsertRowId: rowIdOrOmit(result.meta?.last_row_id),
      rowsRead: metaNumberOrOmit(result.meta?.rows_read),
      rowsWritten: metaNumberOrOmit(result.meta?.rows_written),
    };
  }
}

/** A statement that starts with INSERT, UPDATE, DELETE or REPLACE (the
 *  engine writes no other way). */
function isWriteStatement(sql: string): boolean {
  return /^\s*(?:INSERT|UPDATE|DELETE|REPLACE)\b/i.test(sql);
}

/** A fenced statement's batch was aborted by the lease fence's CHECK: this
 *  transaction no longer owns the lock. Reported as the lost lease, so the
 *  caller's error names what actually happened to its writes. */
function lostLeaseOrOriginal(error: unknown): unknown {
  return isLeaseAssertFailure(error) ? new TransactionLeaseLostError() : error;
}

/** Before the first transaction has ever run against the database, the
 *  lock-state table does not exist and a serving read's lease check cannot
 *  either; the plain read is answered instead. */
function isMissingLockStateTable(error: unknown): boolean {
  const message = error instanceof Error ? `${error.message} ${String((error as { cause?: unknown }).cause ?? "")}` : String(error);
  return /no such table/i.test(message) && message.includes("decko_tx_state");
}

/** D1 reports errors by rejecting; a present-but-false `success` flag is
 *  treated the same way so a malformed response can never look like a
 *  successful no-op. */
function assertSuccess(op: string, target: string, result: D1ResultLike): void {
  if (result.success === false) {
    throw new Error(`D1 ${op} failed for ${target}: reported success=false`);
  }
}

/** D1 reports rows_read/rows_written as numbers on real D1; the workerd
 *  emulation may surface them as undefined or non-numbers. The driver
 *  contract treats them as optional; non-numbers (incl. NaN, strings,
 *  undefined) are normalized to "omitted" so callers never see a wrong-
 *  typed value — only a present-and-numeric one or undefined. */
function metaNumberOrOmit(n: unknown): number | undefined {
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}
