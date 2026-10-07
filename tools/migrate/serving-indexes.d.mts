// Type declarations for serving-indexes.mjs (plain-JS tool module).

export const CANONICAL_DDL: string;

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
