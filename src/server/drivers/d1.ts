// CloudflareD1Adapter — SQLDatabaseDriver over a Cloudflare D1 binding.
// Part of the storage-driver foundation (upstream proposal
// decko-commons/decko#1282).
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

import type { SQLDatabaseDriver, SQLQueryResult, SQLStatement } from "../driver.js";
import { rowIdOrOmit } from "../driver.js";

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

export class CloudflareD1Adapter implements SQLDatabaseDriver {
  private readonly db: D1DatabaseLike;

  constructor(db: D1DatabaseLike) {
    this.db = db;
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

  async query<T = unknown>(sql: string, params: unknown[]): Promise<SQLQueryResult<T>> {
    const result = await this.prepareBound(sql, params).all();
    assertSuccess("query", sql, result);
    return this.toQueryResult<T>(result);
  }

  async batch(statements: SQLStatement[]): Promise<SQLQueryResult[]> {
    const prepared = statements.map((s) => this.prepareBound(s.sql, (s.params ?? []) as unknown[]));
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

/** D1 reports rows_read/rows_written as numbers on real D1; the workerd
 *  emulation may surface them as undefined or non-numbers. The driver
 *  contract treats them as optional; non-numbers (incl. NaN, strings,
 *  undefined) are normalized to "omitted" so callers never see a wrong-
 *  typed value — only a present-and-numeric one or undefined. */
function metaNumberOrOmit(n: unknown): number | undefined {
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}
