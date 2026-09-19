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
