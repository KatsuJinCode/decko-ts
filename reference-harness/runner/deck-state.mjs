// Reads a deck's persisted state straight from its SQLite file (Decko's own
// schema is the persistence contract) and computes per-step row deltas.
// Uses node:sqlite, so the runner needs nothing beyond Node itself.

import { DatabaseSync } from "node:sqlite";

/** The tables stock Decko writes when cards change. */
export const CARD_TABLES = ["cards", "card_acts", "card_actions", "card_changes", "card_references", "card_virtuals"];

/** Columns holding a row id of another table, by table. */
const FOREIGN = {
  cards: { left_id: "cards", right_id: "cards", type_id: "cards", creator_id: "cards", updater_id: "cards",
    read_rule_id: "cards", current_revision_id: "card_actions" },
  card_acts: { card_id: "cards", actor_id: "cards" },
  card_actions: { card_id: "cards", card_act_id: "card_acts", super_action_id: "card_actions" },
  card_changes: { card_action_id: "card_actions" },
  card_references: { referer_id: "cards", referee_id: "cards" },
  card_virtuals: { left_id: "cards", right_id: "cards" },
};
const TIME_COLUMNS = new Set(["created_at", "updated_at", "acted_at"]);

export function snapshot(dbPath) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const present = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name));
    const state = {};
    for (const table of CARD_TABLES) {
      const rows = present.has(table) ? db.prepare(`SELECT * FROM "${table}"`).all() : [];
      const byId = new Map();
      for (const row of rows) byId.set(Number(row.id), { ...row });
      state[table] = byId;
    }
    return state;
  } finally {
    db.close();
  }
}

/** A card's full name from the snapshot, composed through left/right ids. */
function composedName(cards, id, seen = new Set()) {
  const row = cards.get(id);
  if (!row || seen.has(id)) return undefined;
  seen.add(id);
  if (row.left_id === null || row.left_id === undefined) return row.name ?? undefined;
  const l = composedName(cards, Number(row.left_id), seen);
  const r = composedName(cards, Number(row.right_id), seen);
  return l === undefined || r === undefined ? undefined : `${l}+${r}`;
}

function canonicalTime(value) {
  if (value === null || value === undefined) return value;
  const s = String(value);
  const iso = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/.test(s) ? new Date(s.replace(" ", "T") + (/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? "" : "Z")) : null;
  return iso && !Number.isNaN(iso.getTime()) ? iso.toISOString() : s;
}

/**
 * The normalised row delta between two snapshots. Rows the step created get
 * symbolic ids (a card by its name, other rows by table and creation order),
 * and every column pointing at them is rewritten the same way; ids of rows
 * that existed before stay as they are, since both engines start from the
 * same deck file.
 */
export function delta(before, after) {
  const symbols = {};
  for (const table of CARD_TABLES) {
    const fresh = [...after[table].keys()].filter((id) => !before[table].has(id)).sort((a, b) => a - b);
    const map = new Map();
    fresh.forEach((id, i) => {
      if (table === "cards") {
        const name = composedName(after.cards, id);
        map.set(id, `new card ${name ?? `#${i + 1}`}`);
      } else {
        map.set(id, `new ${table} #${i + 1}`);
      }
    });
    symbols[table] = map;
  }
  const norm = (table, row) => {
    const out = {};
    for (const [col, value] of Object.entries(row)) {
      if (col === "id") {
        out.id = symbols[table].get(Number(value)) ?? value;
        continue;
      }
      const target = FOREIGN[table]?.[col];
      if (target && value !== null && value !== undefined) {
        out[col] = symbols[target].get(Number(value)) ?? value;
      } else if (TIME_COLUMNS.has(col)) {
        out[col] = canonicalTime(value);
      } else {
        out[col] = value;
      }
    }
    return out;
  };
  const result = {};
  for (const table of CARD_TABLES) {
    const inserted = [];
    const deleted = [];
    const updated = [];
    for (const [id, row] of after[table]) {
      const old = before[table].get(id);
      if (!old) {
        inserted.push(norm(table, row));
        continue;
      }
      const changes = {};
      for (const col of Object.keys(row)) {
        if (String(old[col]) !== String(row[col])) changes[col] = [norm(table, old)[col], norm(table, row)[col]];
      }
      if (Object.keys(changes).length > 0) updated.push({ id, changes });
    }
    for (const [id, row] of before[table]) if (!after[table].has(id)) deleted.push(norm(table, row));
    if (inserted.length || deleted.length || updated.length) result[table] = { inserted, updated, deleted };
  }
  return result;
}
