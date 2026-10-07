// tools/d1-trickle/deck-source.mjs — read a local deck copy (a SQLite file)
// and describe what a D1 import of it must carry: the schema, the small
// whole tables, and card "bundles" (a cards row plus the card_references rows
// it owns as referer).
//
// Read-only. The source is opened with readOnly and readBigInts, so integers
// beyond 2^53 survive exactly into the SQL literals the importer writes.

import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

/** Tables whose ROWS never leave this machine, whatever the source holds:
 *  - sessions / auth_sessions hold sign-in session tokens (secrets);
 *  - decko_edge_render_cache is the Bunny edge's stored pages, and this
 *    deployment must not cache (the speed team's rule 1).
 *  Their schemas are still created, empty, so the engine finds the tables. */
export const ROWS_NEVER_COPIED = new Set(["sessions", "auth_sessions", "decko_edge_render_cache"]);

/** Also never copied: the one-trip stop-gap's tables (one_trip_render_plans,
 *  one_trip_page_closure, ...), stored render plans and page closures that
 *  the Bunny edge recorded. They are a cache, and the anonymous page path
 *  never reads them (the 40 gate pages render byte-identically on a deck
 *  without them). About 242,000 rows on restore-decko on 2026-10-07. */
export function rowsNeverCopied(table) {
  return ROWS_NEVER_COPIED.has(table) || /^one_trip_/.test(table);
}

/** Tables the engine's render never needs at all; skipped entirely. */
export const TABLES_SKIPPED = new Set(["decko_edge_render_cache"]);

/** The two big tables, imported per card bundle instead of whole. */
export const BUNDLED_TABLES = new Set(["cards", "card_references"]);

export function openSource(path) {
  return new DatabaseSync(path, { readOnly: true, readBigInts: true });
}

export function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/** DDL in creation order: tables, then indexes. Each statement is made
 *  idempotent (IF NOT EXISTS) so a resumed run can re-send it. */
export function schemaStatements(db) {
  const rows = db
    .prepare(
      "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND type IN ('table','index') ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END, rowid",
    )
    .all();
  const out = [];
  for (const r of rows) {
    if (TABLES_SKIPPED.has(r.tbl_name)) continue;
    let sql = String(r.sql).trim();
    if (r.type === "table") sql = sql.replace(/^CREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS)/i, "CREATE TABLE IF NOT EXISTS ");
    else sql = sql.replace(/^CREATE\s+(UNIQUE\s+)?INDEX\s+(?!IF\s+NOT\s+EXISTS)/i, (_m, u) => `CREATE ${u ?? ""}INDEX IF NOT EXISTS `);
    out.push({ type: r.type, name: r.name, table: r.tbl_name, sql });
  }
  return out;
}

/** Index count per table: each inserted row costs 1 + this many rows
 *  written on D1 (measured on local D1: 3 rows into a 2-index table = 9). */
export function indexCounts(db) {
  const m = new Map();
  for (const r of db.prepare("SELECT tbl_name t, count(*) n FROM sqlite_master WHERE type='index' AND sql IS NOT NULL GROUP BY tbl_name").all()) {
    m.set(r.t, Number(r.n));
  }
  return m;
}

export function columnNames(db, table) {
  return db.prepare(`SELECT name FROM pragma_table_info('${table.replace(/'/g, "''")}') ORDER BY cid`).all().map((r) => r.name);
}

/** Small tables copied whole in tier 1 (everything except the two bundled
 *  tables, the skipped ones and the never-copied ones). */
export function wholeTables(db) {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
    .map((r) => r.name)
    .filter((t) => !BUNDLED_TABLES.has(t) && !TABLES_SKIPPED.has(t) && !rowsNeverCopied(t));
}

export function sqliteStat1Rows(db) {
  try {
    return db.prepare("SELECT tbl, idx, stat FROM sqlite_stat1").all();
  } catch {
    return [];
  }
}

const num = (v) => (v === null || v === undefined ? null : Number(v));

/** Card graph helper: name parts and types, loaded once. */
export class CardGraph {
  constructor(db) {
    this.parts = new Map();
    for (const r of db.prepare("SELECT id, left_id, right_id, type_id FROM cards").all()) {
      this.parts.set(Number(r.id), [num(r.left_id), num(r.right_id), num(r.type_id)]);
    }
  }
  has(id) {
    return this.parts.has(id);
  }
  allIds() {
    return [...this.parts.keys()].sort((a, b) => a - b);
  }
  /** The ids plus, recursively, every left part, right part and type card
   *  they name: what the engine needs to spell and type each card. */
  closeOverParts(ids, into = new Set()) {
    const stack = [...ids];
    while (stack.length > 0) {
      const id = stack.pop();
      if (into.has(id) || !this.parts.has(id)) continue;
      into.add(id);
      for (const p of this.parts.get(id)) if (p !== null && !into.has(p)) stack.push(p);
    }
    return into;
  }
}

/** Tier 2: what the engine needs to boot and resolve rules and permissions
 *  — every codename card, every Cardtype, User, Role and Setting card, every
 *  rule (a card whose right part is a Setting, i.e. Set+*setting, which
 *  includes *structure and the permission rules), then their name parts and
 *  types. */
export function bootBaseIds(db, graph) {
  const cn = (c) => {
    const r = db.prepare("SELECT id FROM cards WHERE codename = ?").get(c);
    return r ? Number(r.id) : null;
  };
  const kinds = ["cardtype", "user", "role", "setting"].map(cn).filter((x) => x !== null);
  const seed = new Set();
  for (const r of db.prepare("SELECT id FROM cards WHERE codename IS NOT NULL").all()) seed.add(Number(r.id));
  if (kinds.length > 0) {
    for (const r of db.prepare(`SELECT id FROM cards WHERE type_id IN (${kinds.join(",")})`).all()) seed.add(Number(r.id));
  }
  const setting = cn("setting");
  if (setting !== null) {
    for (const r of db.prepare("SELECT c.id FROM cards c JOIN cards s ON s.id = c.right_id WHERE s.type_id = ?").all(setting)) {
      seed.add(Number(r.id));
    }
  }
  return graph.closeOverParts(seed);
}

/** Tier 2's reference rows: those owned by the permission rules (Set+*read,
 *  *create, *update, *delete), which the engine reads on every request to
 *  resolve who may see what. Other reference rows come with the pages whose
 *  closures read them, or in tier 5. */
export const PERMISSION_SETTINGS = ["read", "create", "update", "delete"];
export function bootRefIds(db) {
  const marks = PERMISSION_SETTINGS.map(() => "?").join(",");
  return new Set(
    db
      .prepare(`SELECT r.id FROM cards r JOIN cards s ON s.id = r.right_id WHERE s.codename IN (${marks})`)
      .all(...PERMISSION_SETTINGS)
      .map((x) => Number(x.id)),
  );
}

/** Reference rows owned by each referer card, plus the orphans (referer not
 *  a card in this deck). */
export function referenceIndex(db) {
  const byReferer = new Map();
  const orphans = [];
  const cardIds = new Set(db.prepare("SELECT id FROM cards").all().map((r) => Number(r.id)));
  for (const r of db.prepare("SELECT id, referer_id FROM card_references ORDER BY id").all()) {
    const id = Number(r.id);
    const ref = Number(r.referer_id);
    if (!cardIds.has(ref)) {
      orphans.push(id);
      continue;
    }
    let list = byReferer.get(ref);
    if (!list) byReferer.set(ref, (list = []));
    list.push(id);
  }
  return { byReferer, orphans };
}

/** Read the page pool file: one path per line, # comments ignored. */
export function readPagePool(path) {
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
}
