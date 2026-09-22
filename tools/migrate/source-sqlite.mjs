// source-sqlite.mjs — read rows from any Ruby decko SQLite source database.
//
// The M4-generalize milestone (decko-commons/decko#1282): the proven
// mysqldump pipeline (parse-dump.mjs + import.mjs + verify.mjs) is general-
// ized so the input can be ANY Ruby decko SQLite database file. This module
// is the SOURCE side of the generalized path: a tiny, portable row reader
// that exposes the same { table, values, columns } shape the importer
// expects, so the rest of the pipeline (column mapping, settings mapping,
// name reconstruction, verify, mod-compat) needs no changes to its input
// contract.
//
// The corpus shape varies across decko versions:
//   * core tables: cards, card_acts, card_actions, card_changes,
//     card_references, card_revisions, card_virtuals, sessions,
//     schema_migrations, ar_internal_metadata, transform_migrations,
//     delayed_jobs (the 12-table truth proven by the mysqldump pipeline).
//   * column drift: source `content` maps to target `db_content`;
//     source lacks `current_revision_id` and `references_expired` so they
//     default to NULL (proven on the bench corpus-v2).
//   * settings: source carries them in a `meta(key, value)` table or
//     `settings(name, value)` table; decko-ts stores settings as cards
//     (the 2014 migration), so the generalized tool reports settings
//     inventory without inventing a target table.
//
// Memory: rows are pulled in batches of `chunkRows` via keyset pagination
// (rowid > last), the same shape the verify pass uses on the target. The
// generator yields one row at a time so the importer's memory bound is
// unchanged.

import Database from "better-sqlite3";

/** Open a Ruby decko SQLite source in read-only mode. */
export function openSourceSqlite(path) {
  return new Database(path, { readonly: true, fileMustExist: true });
}

/**
 * Inventory of every source-side table: name, columns, row count. Read
 * once at the start of the import so the importer can decide what to do
 * with each table (map, skip with a count, route to settings map, etc.).
 */
export function inventorySource(db) {
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all()
    .map((r) => r.name);
  const out = {};
  for (const name of tables) {
    const cols = db.prepare(`PRAGMA table_info("${name}")`).all();
    const cnt = db.prepare(`SELECT COUNT(*) AS n FROM "${name}"`).get();
    out[name] = {
      columns: cols.map((c) => c.name),
      columnTypes: Object.fromEntries(cols.map((c) => [c.name, c.type])),
      rowCount: Number(cnt?.n ?? 0),
    };
  }
  return out;
}

/**
 * Yield every row of one source table as
 *   { table, values, columns }
 * — the same shape MysqldumpInsertParser produces, so the importer's
 * downstream code is reusable. Keyset pagination keeps memory at
 * O(chunkRows) regardless of table size.
 */
export async function* sourceTableRows(db, table, { chunkRows = 10000 } = {}) {
  const cols = db.prepare(`PRAGMA table_info("${table}")`).all().map((c) => c.name);
  const colList = cols.map((c) => `"${c}"`).join(", ");
  let lastRowid = 0;
  for (;;) {
    const batch = db
      .prepare(
        `SELECT rowid AS __rowid, ${colList} FROM "${table}" WHERE rowid > ? ORDER BY rowid LIMIT ?`,
      )
      .all(lastRowid, chunkRows);
    if (batch.length === 0) return;
    for (const rec of batch) {
      lastRowid = Number(rec.__rowid);
      const values = cols.map((c) => rec[c]);
      yield { table, values, columns: cols };
    }
    if (batch.length < chunkRows) return;
  }
}

/**
 * Yield every row of every source table (in name-sorted order so output
 * is deterministic). Tries every table; the importer filters out the ones
 * it can't map.
 */
export async function* sourceAllRows(db, opts = {}) {
  const inv = inventorySource(db);
  for (const name of Object.keys(inv).sort()) {
    yield* sourceTableRows(db, name, opts);
  }
}