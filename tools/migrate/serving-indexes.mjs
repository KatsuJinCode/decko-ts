// The canonical index set, read from db/schema.sqlite.sql, as statements that
// are safe to apply to any database that already has the tables: every
// statement carries IF NOT EXISTS, so an index the target already holds under
// the same name is left alone.
//
// Import paths that copy their schema from a source database (rather than
// from the canonical DDL) apply these after the copy. A source built before
// an index joined the canonical schema would otherwise hand its gap to every
// database imported from it.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const CANONICAL_DDL = join(REPO, "db", "schema.sqlite.sql");

/**
 * @param {{ tables?: readonly string[] | null, ddlPath?: string }} [opts]
 * @returns {{ name: string, table: string, sql: string }[]}
 */
export function canonicalIndexStatements(opts = {}) {
  const ddl = readFileSync(opts.ddlPath ?? CANONICAL_DDL, "utf8");
  const out = [];
  // One statement per match; the DDL keeps each CREATE INDEX on one line.
  const re = /^CREATE (UNIQUE )?INDEX "([A-Za-z0-9_]+)"\s+ON "([a-z_]+)"\s*(\(.*?);\s*$/gm;
  for (const m of ddl.matchAll(re)) {
    const [, unique, name, table, rest] = m;
    if (opts.tables && !opts.tables.includes(table)) continue;
    out.push({ name, table, sql: `CREATE ${unique ?? ""}INDEX IF NOT EXISTS "${name}" ON "${table}" ${rest}` });
  }
  return out;
}
