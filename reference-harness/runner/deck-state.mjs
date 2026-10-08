// Reads a deck's persisted state straight from its SQLite file (Decko's own
// schema is the persistence contract) and computes row deltas between two
// snapshots. Deltas are raw: ids, timestamps and every other column exactly as
// stored. The grader compares them as they are (reference-harness/SPEC.md,
// "Normalisation"). Uses node:sqlite, so the runner needs nothing beyond Node.

import { DatabaseSync } from "node:sqlite";

/** The tables stock Decko writes when cards change: the persistence contract
 *  a write step is graded on. */
export const CARD_TABLES = ["cards", "card_acts", "card_actions", "card_changes", "card_references", "card_virtuals"];

/**
 * Every table of the deck, row by row. A table with an `id` column is keyed
 * by id; any other table by the row's own JSON (a multiset, so duplicate rows
 * still count). SQLite's internal tables are included: a read that bumps an
 * autoincrement counter has written.
 */
export function snapshot(dbPath) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map((r) => r.name);
    const state = {};
    for (const table of tables) {
      const rows = db.prepare(`SELECT * FROM "${table.replaceAll('"', '""')}"`).all();
      const keyed = new Map();
      const hasId = rows.length > 0 ? Object.hasOwn(rows[0], "id") : columnNames(db, table).includes("id");
      for (const row of rows) {
        // A BLOB is recorded as its hex bytes, so it survives JSON unchanged.
        const copy = Object.fromEntries(
          Object.entries(row).map(([k, v]) => [k, v instanceof Uint8Array ? { $blob: Buffer.from(v).toString("hex") } : v]),
        );
        if (hasId) {
          keyed.set(`id:${copy.id}`, copy);
        } else {
          const json = JSON.stringify(copy);
          let key = `row:${json}`;
          for (let n = 2; keyed.has(key); n++) key = `row:${json}#${n}`;
          keyed.set(key, copy);
        }
      }
      state[table] = keyed;
    }
    // Card tables are always present in the snapshot, empty if the deck lacks one.
    for (const table of CARD_TABLES) state[table] ??= new Map();
    return state;
  } finally {
    db.close();
  }
}

function columnNames(db, table) {
  return db.prepare(`PRAGMA table_info("${table.replaceAll('"', '""')}")`).all().map((c) => c.name);
}

/**
 * The raw row delta between two snapshots, per table:
 * `{ inserted: [row], updated: [{id, changes: {column: [before, after]}}], deleted: [row] }`.
 * Only tables that changed appear. Values are compared as stored (type and
 * text), so a timestamp rewritten in another text form is a change.
 * `tables` limits the delta to those tables (default: every table).
 */
export function delta(before, after, tables) {
  const names = tables ?? [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  const result = {};
  for (const table of names) {
    const b = before[table] ?? new Map();
    const a = after[table] ?? new Map();
    const inserted = [];
    const updated = [];
    const deleted = [];
    for (const [key, row] of a) {
      const old = b.get(key);
      if (!old) {
        inserted.push(row);
        continue;
      }
      const changes = {};
      for (const col of new Set([...Object.keys(old), ...Object.keys(row)])) {
        if (!sameValue(old[col], row[col])) changes[col] = [old[col] ?? null, row[col] ?? null];
      }
      if (Object.keys(changes).length > 0) updated.push({ id: row.id, changes });
    }
    for (const [key, row] of b) if (!a.has(key)) deleted.push(row);
    if (inserted.length || updated.length || deleted.length) result[table] = { inserted, updated, deleted };
  }
  return result;
}

function sameValue(x, y) {
  if (x === y) return true;
  if (x !== null && y !== null && typeof x === "object" && typeof y === "object") return x.$blob === y.$blob;
  return false;
}

/** True when a recorded delta (or a legacy per-table count summary) holds any
 *  inserted, updated or deleted row. */
export function hasWrites(recorded) {
  if (recorded === null || recorded === undefined) return false;
  if (typeof recorded !== "object") return true;
  return Object.values(recorded).some((d) => {
    if (d === null || typeof d !== "object") return Boolean(d);
    return ["inserted", "updated", "deleted"].some((k) => (Array.isArray(d[k]) ? d[k].length > 0 : Number(d[k] ?? 0) > 0));
  });
}

/** Splits a full delta into the card tables (graded as persistence) and the
 *  rest (recorded, reported, not graded for writes). */
export function splitDelta(full) {
  const rows = {};
  const other = {};
  for (const [table, d] of Object.entries(full)) (CARD_TABLES.includes(table) ? rows : other)[table] = d;
  return { rows, other };
}
