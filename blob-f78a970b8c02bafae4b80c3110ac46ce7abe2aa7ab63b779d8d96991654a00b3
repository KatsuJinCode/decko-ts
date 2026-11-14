// Type declarations for serving-indexes.mjs (plain-JS tool module).

export const CANONICAL_DDL: string;

/** Indexes the canonical schema has retired; import paths never create them. */
export const RETIRED_INDEXES: readonly string[];
export function isRetiredIndex(name: string): boolean;

export interface CanonicalIndexStatement {
  name: string;
  table: string;
  /** CREATE [UNIQUE] INDEX IF NOT EXISTS ... (no trailing semicolon). */
  sql: string;
}

/** Every CREATE INDEX in db/schema.sqlite.sql, rewritten with IF NOT EXISTS,
 *  optionally limited to the named tables. */
export function canonicalIndexStatements(opts?: {
  tables?: readonly string[] | null;
  ddlPath?: string;
}): CanonicalIndexStatement[];
