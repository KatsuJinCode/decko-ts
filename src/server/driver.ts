// The one seam every storage provider plugs into. From
// brandonDojoTech docs/plans/decko-typescript-edge-port-strategy.md (v2, section 2.1).
// Upstream proposal: decko-commons/decko#1282.
//
// Rules: the engine never imports vendor SDKs. Adapters implement this
// interface per provider (D1, libSQL-over-HTTP, ...). Every adapter passes
// the same conformance suite.

export interface SQLQueryResult<T = unknown> {
  rows: T[];
  rowsAffected: number;
  lastInsertRowId?: number | bigint;
  /** Provider-reported rows read by the engine (D1 meta.rows_read). UNDEFINED
   *  means the runtime did not surface it (local-sqlite has no equivalent;
   *  D1 in production reports a number, workerd's local D1 emulation may
   *  also be undefined). The deploy/worker-metrics wrapper never silently
   *  invents a value — see worker-metrics.ts for the ESTIMATE fallback. */
  rowsRead?: number;
  /** Provider-reported rows written by the engine (D1 meta.rows_written).
   *  Same undefined semantics as rowsRead. */
  rowsWritten?: number;
}

export interface SQLStatement {
  sql: string;
  params: unknown[];
}

export interface SQLDatabaseDriver {
  query<T = unknown>(sql: string, params: unknown[]): Promise<SQLQueryResult<T>>;
  batch(statements: SQLStatement[]): Promise<SQLQueryResult[]>;
}

// Blob storage driver (R2 / Bunny Storage / S3-compatible) — wave 2.
