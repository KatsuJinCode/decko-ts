// compare-decks.mjs -- whole-deck row comparison after the persistence op list.
//
//   node tools/persistence/compare-decks.mjs <baseDeck> <rubyFinalDeck|rubyDelta.json> <tsFinalDeck> [reportJson] [saveRubyDelta.json]
//
// The Ruby side may be given as a saved delta (the JSON this script writes
// with its fifth argument), so the comparison runs without a Ruby install;
// tests/fixtures/persistence-oracle/ruby-outside-delta.json is that file for
// the committed op list.
//
// The persistence probe (compare-persist.mjs) compares the probe's own rows.
// This compares EVERY table in both final decks against the shared starting
// deck, so writes either engine makes anywhere else (ancestor timestamps,
// other cards' references, sessions, migrations, any other table) are seen.
//
// For each table, each side's delta against the base deck is computed by
// primary key: rows added, removed and changed. Rows owned by the probe (the
// probe's cards and their acts, actions, changes, references and virtuals,
// which compare-persist.mjs already compares step by step) are counted and
// set aside; every other delta row must match between the engines.
//
// Normalisations (the same as compare-persist.mjs, nothing else):
//   1. created_at / updated_at / acted_at become "T" (different clocks).
//   2. A value that is the id of a card created by the op list becomes that
//      card's composed name; ids of pre-existing rows are compared raw (both
//      decks start from the same base).
//   3. Rows added outside the probe are compared as a multiset of normalised
//      rows with their own id column dropped (new ids are assigned
//      independently by each engine).
// Port-only tables (present only in the TS deck by design) are listed and
// excluded: deck_data_version (the render engine's freshness stamp).
//
// Exit 0 when the outside-probe deltas match, 1 otherwise, 2 on missing input.

import { DatabaseSync } from "node:sqlite";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// --deliberate=<deliberate-differences.json>: rows a declared difference
// leaves in the Ruby deck alone (each difference's outsideRows, as
// {table, row} with row the canonical added-row string this script prints)
// are set aside, exactly once each; a declared row Ruby did not write is a
// mismatch, so the declaration cannot go stale.
const flagArgs = process.argv.slice(2).filter((a) => a.startsWith("--"));
const deliberateFile = flagArgs.find((a) => a.startsWith("--deliberate="))?.slice("--deliberate=".length);
const [baseFile, rubyFile, tsFile, reportFile, saveRubyDelta] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
for (const f of [baseFile, rubyFile, tsFile]) {
  if (!f || !existsSync(f)) {
    console.error(`MISSING INPUT: ${f}`);
    process.exit(2);
  }
}
const PREFIX = "PersistProbe";
const PORT_ONLY_TABLES = new Set(["deck_data_version"]);
const TIMESTAMPS = new Set(["created_at", "updated_at", "acted_at"]);

const open = (f) => new DatabaseSync(f, { readOnly: true });
// The base deck is usually a committed fixture (write-battery-v1), whose
// decks are WAL-mode: opening one in place - even read-only - creates
// -shm/-wal sidecars beside it, a read-only connection cannot remove them
// on close, and the fixture's manifest lists no such files, so the next
// manifest check would report the fixture as changed. Read a scratch copy
// instead; the TS deck is already a copy, and the Ruby deck is a private
// oracle deck, not a committed fixture.
const base = (() => {
  const dir = mkdtempSync(join(tmpdir(), "persist-base-deck-"));
  const copy = join(dir, "base.sqlite3");
  copyFileSync(baseFile, copy);
  process.on("exit", () => rmSync(dir, { recursive: true, force: true }));
  return open(copy);
})();
const rubyIsDelta = rubyFile.endsWith(".json");
const ruby = rubyIsDelta ? undefined : open(rubyFile);
const ts = open(tsFile);

const tablesOf = (db) =>
  db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
    .map((r) => r.name);

/** Primary-key columns of a table (rowid when none is declared). */
function pkOf(db, table) {
  const cols = db.prepare(`PRAGMA table_info("${table}")`).all();
  const pk = cols.filter((c) => c.pk > 0).sort((a, b) => a.pk - b.pk).map((c) => c.name);
  return pk.length > 0 ? pk : ["rowid"];
}

function rowsOf(db, table) {
  const pk = pkOf(db, table);
  const select = pk[0] === "rowid" ? `SELECT rowid AS rowid, * FROM "${table}"` : `SELECT * FROM "${table}"`;
  const map = new Map();
  for (const r of db.prepare(select).all()) map.set(pk.map((k) => String(r[k])).join("|"), { ...r });
  return map;
}

/** Card id -> composed name for every card in the deck, trashed included. */
function cardNames(db) {
  const byId = new Map();
  for (const r of db.prepare("SELECT id, name, left_id, right_id FROM cards ORDER BY id").all()) {
    byId.set(Number(r.id), r);
  }
  const memo = new Map();
  const composed = (id, depth = 0) => {
    if (memo.has(id)) return memo.get(id);
    const r = byId.get(id);
    if (r === undefined || depth > 50) return `#${id}`;
    const name =
      r.left_id === null ? (r.name ?? `#${id}`) : `${composed(Number(r.left_id), depth + 1)}+${composed(Number(r.right_id), depth + 1)}`;
    memo.set(id, name);
    return name;
  };
  const out = new Map();
  const seen = new Map();
  for (const id of byId.keys()) {
    const n = composed(id);
    const k = (seen.get(n) ?? 0) + 1;
    seen.set(n, k);
    out.set(id, k === 1 ? n : `${n}~${k}`);
  }
  return out;
}

/** The probe's own rows: compare-persist.mjs's PROBE_SQL set and the rows
 *  hanging off it. */
function probeKeys(db) {
  // COMPARE_ALL=1: no row is set aside as the probe's; every delta row is
  // compared (used for the pod round trips, whose writes are all under test).
  if (process.env.COMPARE_ALL === "1") return {};
  const ids = db
    .prepare(
      `WITH RECURSIVE probe(id) AS (
         SELECT id FROM cards WHERE name LIKE '${PREFIX}%'
         UNION SELECT c.id FROM cards c JOIN probe p ON c.left_id = p.id OR c.right_id = p.id
       ) SELECT id FROM probe`,
    )
    .all()
    .map((r) => Number(r.id));
  const set = new Set(ids);
  const list = ids.length > 0 ? ids.join(",") : "-1";
  const actions = db.prepare(`SELECT id FROM card_actions WHERE card_id IN (${list})`).all().map((r) => Number(r.id));
  return {
    cards: set,
    card_acts: new Set(db.prepare(`SELECT id FROM card_acts WHERE card_id IN (${list})`).all().map((r) => Number(r.id))),
    card_actions: new Set(actions),
    card_changes: new Set(
      actions.length === 0
        ? []
        : db.prepare(`SELECT id FROM card_changes WHERE card_action_id IN (${actions.join(",")})`).all().map((r) => Number(r.id)),
    ),
    card_references: new Set(
      db
        .prepare(
          `SELECT id FROM card_references WHERE referer_id IN (${list}) OR referee_key LIKE '${PREFIX.toLowerCase()}%'`,
        )
        .all()
        .map((r) => Number(r.id)),
    ),
    card_virtuals: new Set(db.prepare(`SELECT id FROM card_virtuals WHERE left_id IN (${list})`).all().map((r) => Number(r.id))),
  };
}

const CARD_ID_COLUMNS = new Set([
  "card_id", "left_id", "right_id", "type_id", "creator_id", "updater_id", "referer_id", "referee_id",
  "actor_id", "read_rule_id",
]);

function normaliser(db, baseMaxCardId) {
  const names = cardNames(db);
  return (row, dropId) => {
    const out = {};
    for (const [k, v] of Object.entries(row)) {
      if (dropId && (k === "id" || k === "rowid")) continue;
      if (TIMESTAMPS.has(k)) out[k] = v === null ? null : "T";
      else if (CARD_ID_COLUMNS.has(k) && typeof v === "number" && v > baseMaxCardId) out[k] = names.get(v) ?? `#${v}`;
      else out[k] = typeof v === "bigint" ? Number(v) : v;
    }
    return out;
  };
}

const canon = (o) => JSON.stringify(Object.keys(o).sort().reduce((a, k) => ((a[k] = o[k]), a), {}));
const baseMaxCardId = Number(base.prepare("SELECT MAX(id) AS m FROM cards").get().m);
const baseTables = tablesOf(base);

/** One deck's delta against the base deck, table by table: probe rows
 *  counted, every other row normalised (changed rows keyed by primary key,
 *  added rows as a sorted list, removed rows by key). */
function deckDelta(db) {
  const probe = probeKeys(db);
  const norm = normaliser(db, baseMaxCardId);
  const out = { tables: {} };
  for (const table of tablesOf(db)) {
    if (PORT_ONLY_TABLES.has(table)) {
      out.tables[table] = { portOnly: true };
      continue;
    }
    const b = baseTables.includes(table) ? rowsOf(base, table) : new Map();
    const rows = rowsOf(db, table);
    const own = probe[table];
    const isProbe = (r) => own !== undefined && r.id !== undefined && own.has(Number(r.id));
    const entry = { probeRows: 0, changed: {}, added: [], removed: [] };
    for (const [k, r] of rows) {
      const old = b.get(k);
      if (old === undefined) {
        if (isProbe(r)) entry.probeRows += 1;
        else entry.added.push(canon(norm(r, true)));
      } else if (canon(old) !== canon(r)) {
        if (isProbe(r)) entry.probeRows += 1;
        else entry.changed[k] = canon(norm(r, false));
      }
    }
    for (const [k, r] of b) {
      if (!rows.has(k)) {
        if (isProbe(r)) entry.probeRows += 1;
        else entry.removed.push(k);
      }
    }
    entry.added.sort();
    entry.removed.sort();
    out.tables[table] = entry;
  }
  return out;
}

const rubyDelta = rubyIsDelta ? JSON.parse(readFileSync(rubyFile, "utf8")) : deckDelta(ruby);
if (saveRubyDelta) writeFileSync(saveRubyDelta, JSON.stringify(rubyDelta, null, 2) + "\n");
const tsDelta = deckDelta(ts);

const report = { tables: [], portOnlyTables: [], outsideMismatches: 0, deliberateRows: 0 };
if (deliberateFile) {
  for (const d of JSON.parse(readFileSync(deliberateFile, "utf8")).differences ?? []) {
    for (const { table, row } of d.outsideRows ?? []) {
      const added = rubyDelta.tables[table]?.added ?? [];
      const at = added.indexOf(row);
      if (at < 0) {
        report.tables.push({ table, error: `declared row absent from the Ruby deck (step ${d.step}): ${row}` });
        report.outsideMismatches += 1;
      } else {
        added.splice(at, 1);
        report.deliberateRows += 1;
      }
    }
  }
}
const tables = [...new Set([...Object.keys(rubyDelta.tables), ...Object.keys(tsDelta.tables)])].sort();
for (const table of tables) {
  const r = rubyDelta.tables[table];
  const t = tsDelta.tables[table];
  if (t?.portOnly && r === undefined) {
    report.portOnlyTables.push(table);
    continue;
  }
  // A recorded entry that records NOTHING (no probe rows, nothing changed,
  // added or removed) is an observation, not an obligation: the Ruby deck
  // carried the table and wrote nothing to it, so a final deck without the
  // table matches the recording (the fixture decks dropped their empty
  // private_table_* tables after that recording was made). Only an
  // entry that records nothing is skipped this way; any recorded row makes
  // the table's absence a mismatch.
  if (t === undefined && r !== undefined && !r.portOnly) {
    const empty =
      (r.probeRows ?? 0) === 0 &&
      Object.keys(r.changed ?? {}).length === 0 &&
      (r.added ?? []).length === 0 &&
      (r.removed ?? []).length === 0;
    if (empty) {
      report.tables.push({ table, skipped: "recorded delta is empty and the deck no longer carries the table" });
      continue;
    }
  }
  if (r === undefined || t === undefined || r.portOnly || t.portOnly) {
    report.tables.push({ table, error: `table present in ${r ? "ruby" : ""}${t ? " ts" : ""} only` });
    report.outsideMismatches += 1;
    continue;
  }
  const diffs = [];
  for (const k of new Set([...Object.keys(r.changed), ...Object.keys(t.changed)])) {
    if (r.changed[k] !== t.changed[k]) {
      diffs.push({ kind: "changed", key: k, ruby: r.changed[k] ?? "(unchanged)", ts: t.changed[k] ?? "(unchanged)" });
    }
  }
  const multiset = (list) => list.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map());
  const ra = multiset(r.added);
  const ta = multiset(t.added);
  for (const k of new Set([...ra.keys(), ...ta.keys()])) {
    if ((ra.get(k) ?? 0) !== (ta.get(k) ?? 0)) diffs.push({ kind: "added", row: k, ruby: ra.get(k) ?? 0, ts: ta.get(k) ?? 0 });
  }
  if (canon(r.removed) !== canon(t.removed)) diffs.push({ kind: "removed", ruby: r.removed, ts: t.removed });
  const counts = (d) => `${Object.keys(d.changed).length}c/${d.added.length}a/${d.removed.length}r`;
  report.tables.push({
    table,
    probeRows: { ruby: r.probeRows, ts: t.probeRows },
    outside: { ruby: counts(r), ts: counts(t), mismatches: diffs },
  });
  report.outsideMismatches += diffs.length;
  console.error(
    `${table.padEnd(34)} probe rows ruby=${r.probeRows} ts=${t.probeRows}  outside ruby=${counts(r)} ts=${counts(t)}  ` +
      `${diffs.length === 0 ? "match" : `${diffs.length} MISMATCH`}`,
  );
}
if (report.portOnlyTables.length > 0) console.error(`port-only tables excluded: ${report.portOnlyTables.join(", ")}`);
console.error(`outside-probe mismatches: ${report.outsideMismatches}`);
const text = JSON.stringify(report, null, 2) + "\n";
if (reportFile) writeFileSync(reportFile, text);
else process.stdout.write(text);
process.exit(report.outsideMismatches === 0 ? 0 : 1);
