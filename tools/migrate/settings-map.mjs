// settings-map.mjs — inventory + map the settings carried by a source
// Ruby decko database.
//
// Modern decko stores settings as CARDS (the 2014 transform migration:
// user/account/setting data became cards). The decko-ts DDL does NOT
// declare a settings table; settings round-trip as card rows, not as a
// separate side-table. A source database that still carries a `meta` /
// `settings` / `setting` / `card_settings` table is therefore either:
//
//   (a) corpus-build metadata (e.g. benchmarks/corpus-v2 `meta(key,
//       value)`: build seed, atom vocabulary size, sanitization shifts)
//       - NOT application state, never imported as data;
//   (b) a pre-2014 deck that still carries settings rows - rare, would
//       be migrated as card-like rows by the importer (handled below).
//
// This module INVENTORIES settings tables and reports them in the
// migration report (`settingsInventory`), so a human reader of the report
// can see what was present and what was decided. It does NOT import
// anything: the decko-ts world has no place to land the rows.
//
// The implementation is read-only: no writes to the source, no writes to
// the target. The summary it returns is content-free (only key names,
// not values, to honor the DATA RULE - see migration-tool-notes.md).

import { SETTINGS_TABLE_VARIANTS } from "./schema-map.mjs";

/** Decide which of the inventory's tables are settings-shaped (by
 *  variant name, then by column shape: a (key, value) or (name, value)
 *  pair). */
export function isSettingsTable(name, columnTypes) {
  if (SETTINGS_TABLE_VARIANTS.includes(name)) return true;
  const cols = Object.keys(columnTypes).map((c) => c.toLowerCase());
  const hasKey = cols.includes("key") || cols.includes("name") || cols.includes("setting");
  const hasValue = cols.includes("value") || cols.includes("val");
  return hasKey && hasValue;
}

/** Build a settings inventory for every settings-shaped table in
 *  `inventory`. The returned object is content-free: only key names,
 *  NOT values. The DATA RULE (the migration tool never copies content)
 *  applies to settings metadata too - settings NAMES are engine
 *  vocabulary (engine-internal), settings VALUES may carry deck-private
 *  data (account email templates, OAuth tokens, etc.).
 *
 *  Shape:
 *    {
 *      tables: [
 *        { source, count, columns, keyColumn, valueColumn, sampleKeys }
 *      ],
 *      totalCount: number,
 *      warning: string  (when settings rows exist and would otherwise
 *                        land somewhere unintended)
 *    }
 */
export function inventorySettings(db, inventory) {
  const tables = [];
  let totalCount = 0;
  for (const [name, info] of Object.entries(inventory)) {
    if (!isSettingsTable(name, info.columnTypes)) continue;
    const cols = Object.keys(info.columnTypes);
    // pick the key column (in priority order) and the value column
    const lower = cols.map((c) => c.toLowerCase());
    const keyIdx =
      lower.indexOf("key") >= 0 ? lower.indexOf("key") :
      lower.indexOf("name") >= 0 ? lower.indexOf("name") :
      lower.indexOf("setting") >= 0 ? lower.indexOf("setting") : 0;
    const valueIdx =
      lower.indexOf("value") >= 0 ? lower.indexOf("value") :
      lower.indexOf("val") >= 0 ? lower.indexOf("val") : 1;
    const keyColumn = cols[keyIdx];
    const valueColumn = cols[valueIdx];
    // sample up to 20 keys; NEVER values
    const sample = db.prepare(
      `SELECT "${keyColumn}" AS k FROM "${name}" ORDER BY rowid LIMIT 20`,
    ).all().map((r) => r.k);
    tables.push({
      source: name,
      count: info.rowCount,
      columns: cols,
      keyColumn,
      valueColumn,
      sampleKeys: sample,
    });
    totalCount += info.rowCount;
  }
  const warning =
    tables.length > 0
      ? `settings tables present in source (${tables.map((t) => t.source).join(", ")}); decko-ts stores settings as cards, no rows imported - see settingsInventory in the report`
      : undefined;
  return { tables, totalCount, warning };
}