// The one seam every storage provider plugs into. The adapter contract
// follows the provider-adapter requirement in docs/core/architecture.md:
// declare transaction/isolation, rollback, search, collation, generated-ID,
// time and resource-limit behavior, and reject unsupported operations
// explicitly rather than silently weakening semantics. Upstream proposal:
// decko-commons/decko#1282.
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

/** SQL providers report the last inserted row id as 0 when the statement
 *  inserted nothing. The driver contract treats lastInsertRowId as
 *  optional, so 0 becomes "omitted" (undefined). Shared by the driver
 *  adapters. */
export function rowIdOrOmit(lastRowId: number | bigint | undefined): number | bigint | undefined {
  if (lastRowId === undefined) return undefined;
  return BigInt(lastRowId) > 0n ? lastRowId : undefined;
}

// No blob-storage driver (R2 / Bunny Storage / S3-compatible) exists yet;
// SQLDatabaseDriver is the only driver seam an adapter implements today.
