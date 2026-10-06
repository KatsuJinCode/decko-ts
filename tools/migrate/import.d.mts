// Type declarations for import.mjs (plain-JS tool module).

import type { SQLDatabaseDriver, SQLQueryResult, SQLStatement } from "../../src/server/driver.js";

export function splitSqlStatements(ddl: string): string[];

export interface TargetSchema {
  createTables: string[];
  createIndexes: string[];
  /** [ENGINE-FRESHNESS] stamp triggers — applied AFTER the bulk load. */
  createTriggers: string[];
  /** [ENGINE-FRESHNESS] stamp row INSERT — applied with the triggers. */
  postLoadStatements: string[];
  pragmas: string[];
  /** table -> column names in DDL order (positional import mapping). */
  tableColumns: Record<string, string[]>;
}

/** Extract the table/index split and per-table column order from
 *  db/schema.sqlite.sql. Column order comes from the DDL itself, so the
 *  importer can never drift from the schema stream's decisions. */
export function parseTargetSchema(ddlPath: string): TargetSchema;

/** Minimal SQLDatabaseDriver over better-sqlite3 for local CLI use
 *  (structurally compatible with the engine's shared driver interface —
 *  FetchEngine/RenderEngine accept it directly). */
export class LocalSqliteToolDriver implements SQLDatabaseDriver {
  constructor(path: string, opts?: { readonly?: boolean });
  query<T = Record<string, unknown>>(sql: string, params: unknown[]): Promise<SQLQueryResult<T>>;
  batch(statements: SQLStatement[]): Promise<SQLQueryResult[]>;
  /** Streaming full-table read (tool-side extension, not in the shared
   *  contract). */
  iterate(sql: string, params?: unknown[]): Generator<Record<string, unknown>, void, void>;
  close(): void;
}

export interface TableChecksum {
  /** Sum of per-row FNV-1a hashes mod 2^32 (order-independent). */
  sum: number;
  count: number;
  minId?: number;
  maxId?: number;
}

export interface ImportRowError {
  table: string;
  rowId: unknown;
  message: string;
}

export interface ImportStats {
  /** table -> source row count (imported rows only). */
  counts: Record<string, number>;
  /** table -> source-side checksum aggregates. */
  checksums: Record<string, TableChecksum>;
  /** Metadata-only warnings (never row content). */
  warnings: string[];
  /** Non-core table -> skipped row count. */
  skippedTables: Record<string, number>;
  keyRepair: { derived: number; nullSimpleKeys: number };
  errors: ImportRowError[];
  bytesRead: number;
  rowsEmitted: number;
  elapsedMs: number;
}

export interface ImportOptions {
  dumpPath: string;
  driver: LocalSqliteToolDriver;
  /** Path to db/schema.sqlite.sql (target DDL authority). */
  ddlPath: string;
  /** Import only these tables. */
  tables?: readonly string[];
  /** Statements per transaction (default 1000). */
  batchSize?: number;
  /** Simple-card missing-key repair: (name) => key. Omit to only count. */
  deriveKey?: (name: string) => string | undefined;
  /** Called after each read chunk: (bytesRead, rowsImported). */
  onProgress?: (bytesRead: number, rowsImported: number) => void;
  signal?: AbortSignal;
  /** Continue past per-row insert failures, up to this many (default 0 =
   *  abort on first failure). */
  maxErrors?: number;
  /** Allow import into a DB that already has cards rows (default false). */
  append?: boolean;
}

/** Stream the dump into the target DB: CREATE TABLEs, batched INSERTs,
 *  then CREATE INDEXes (bulk-load order). Returns source-side stats. */
export function importDump(opts: ImportOptions): Promise<ImportStats>;

/** Re-compute a table's checksum over the TARGET through any
 *  SQLDatabaseDriver using keyset pagination (portable, bounded memory). */
export function checksumTargetTable(
  driver: SQLDatabaseDriver,
  table: string,
  columns: string[],
  chunkRows?: number,
): Promise<TableChecksum>;

/** Row counts for every table in the target schema. */
export function countAllTables(
  driver: SQLDatabaseDriver,
  tableColumns: Record<string, string[]>,
): Promise<Record<string, number>>;
