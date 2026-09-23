// CloudflareD1Adapter — SQLDatabaseDriver over a Cloudflare D1 binding.
// Part of the storage-driver foundation (upstream proposal
// decko-commons/decko#1282).
//
// The engine never imports vendor SDKs (see src/server/driver.ts), so this
// file declares the D1 API structurally instead of importing
// @cloudflare/workers-types. The shapes below were verified against the
// miniflare 5 local D1 emulation on this machine (meta.changes,
// meta.last_row_id, batch() semantics, bigint-bind rejection) — see
// docs/driver-notes.md for the verified details.
//
// In Workers the constructor argument is the `D1Database` binding from
// `env`; in tests it is the object returned by miniflare's
// `getD1Database()`. Both satisfy D1DatabaseLike structurally.

import type { SQLDatabaseDriver, SQLQueryResult, SQLStatement } from "../driver.js";

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

export class CloudflareD1Adapter implements SQLDatabaseDriver {
  private readonly db: D1DatabaseLike;

  constructor(db: D1DatabaseLike) {
    this.db = db;
  }

  async query<T = unknown>(sql: string, params: unknown[]): Promise<SQLQueryResult<T>> {
    const result = await this.db.prepare(sql).bind(...(params as D1BindValue[])).all();
    assertSuccess("query", sql, result);
    return this.toQueryResult<T>(result);
  }

  async batch(statements: SQLStatement[]): Promise<SQLQueryResult[]> {
    const prepared = statements.map((s) => {
      const stmt = this.db.prepare(s.sql);
      return stmt.bind(...(s.params as D1BindValue[]));
    });
    const results = await this.db.batch(prepared);
    return results.map((result, i) => {
      assertSuccess("batch", `statement ${i}`, result);
      return this.toQueryResult<unknown>(result);
    });
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

/** D1 reports errors by rejecting; a present-but-false `success` flag is
 *  treated the same way so a malformed response can never look like a
 *  successful no-op. */
function assertSuccess(op: string, target: string, result: D1ResultLike): void {
  if (result.success === false) {
    throw new Error(`D1 ${op} failed for ${target}: reported success=false`);
  }
}

/** D1 reports meta.last_row_id === 0 when the statement inserted nothing.
 *  The driver contract treats lastInsertRowId as optional, so 0 becomes
 *  "omitted". */
function rowIdOrOmit(lastRowId: number | bigint | undefined): number | bigint | undefined {
  if (lastRowId === undefined) return undefined;
  return BigInt(lastRowId) > 0n ? lastRowId : undefined;
}

/** D1 reports rows_read/rows_written as numbers on real D1; the workerd
 *  emulation may surface them as undefined or non-numbers. The driver
 *  contract treats them as optional; non-numbers (incl. NaN, strings,
 *  undefined) are normalized to "omitted" so callers never see a wrong-
 *  typed value — only a present-and-numeric one or undefined. */
function metaNumberOrOmit(n: unknown): number | undefined {
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}
