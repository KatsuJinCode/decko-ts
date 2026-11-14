// benchmarks/cold-render/dump-trial-deck-full-to-local-sqlite.ts
// WHAT THIS IS: the FULL-schema mirror of the trial deck into a local sqlite
// file — every table except the edge render-cache tier's own store
// (decko_edge_render_cache, which is the global page cache lane's data, not
// engine data). The pre-existing mirror (dump-trial-deck-to-local-sqlite.ts)
// carried `cards` only, which is why no lane could boot a full cold render
// locally; the db-roundtrip-elimination lane needs local render iteration
// (call-site attribution with parameter values, byte-parity probes) the way
// the wire prices every experiment at ~60 ms per hop.
//
// Run (same bundling as dump-trial-deck-to-local-sqlite.ts):
//   npx esbuild --bundle --format=esm --platform=node --target=node20 \
//     "--external:node:*" --external:better-sqlite3 --external:sass --external:coffeescript \
//     --outfile=benchmarks/cold-render/dump-trial-deck-full-to-local-sqlite.mjs \
//     benchmarks/cold-render/dump-trial-deck-full-to-local-sqlite.ts
//   node benchmarks/cold-render/dump-trial-deck-full-to-local-sqlite.mjs
//
// Output: benchmarks/cold-render/trial-deck-mirror-full.sqlite3 (gitignored)

import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { BunnyDbDriver } from "../../src/card/drivers/bunny-db.js";

function readCreds(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

const creds = readCreds("C:/localProjects/brandonDojoTech/library/data/creds");
const url = creds.BUNNY_TRIAL_DB_URL.replace(/^libsql:\/\//, "https://");
const tok = creds.BUNNY_TRIAL_DB_RO_TOKEN ?? creds.BUNNY_TRIAL_DB_TOKEN;
const driver = new BunnyDbDriver({ url, authToken: tok });

const SKIP_TABLES = new Set([
  "decko_edge_render_cache", // the global page-cache tier's store — not engine data
]);

interface MasterRow {
  name: string;
  type: string;
  sql: string | null;
}

const objects = await driver.query<MasterRow>(
  "SELECT name, type, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'",
  [],
);
const tables = objects.rows.filter(
  (o) => o.type === "table" && !o.name.startsWith("_") && !SKIP_TABLES.has(o.name),
);
console.error(`tables to mirror: ${tables.map((t) => t.name).join(", ")}`);

const OUT = "benchmarks/cold-render/trial-deck-mirror-full.sqlite3";
const db = new Database(OUT);
db.pragma("journal_mode = WAL");

const CHUNK = 2000;
for (const table of tables) {
  const name = table.name;
  db.exec(`DROP TABLE IF EXISTS "${name}"`);
  if (table.sql) db.exec(table.sql);
  // Indexes come across in the same sqlite_master walk (type='index' with a
  // sql body); collect them and create after the rows land.
  let total = 0;
  // Rowid windows must span the table's ACTUAL rowid range: the trial
  // deck's card_references rows carry rowids far above 0, so a walk that
  // breaks at the first empty window loses the whole table (measured:
  // 48,525 wire rows -> 0 mirrored). Read MIN/MAX first.
  const bounds = await driver.query<{ lo: number | null; hi: number | null }>(
    `SELECT MIN(rowid) lo, MAX(rowid) hi FROM "${name}"`,
    [],
  );
  const lo = bounds.rows[0]?.lo;
  const hi = bounds.rows[0]?.hi;
  if (lo === null || lo === undefined || hi === null || hi === undefined) {
    console.error(`${name}: 0 rows`);
    continue;
  }
  let insert: ReturnType<typeof db.prepare> | undefined;
  for (let from = Math.floor(lo / CHUNK) * CHUNK; from <= hi; from += CHUNK) {
    const page = await driver.query<Record<string, unknown>>(
      `SELECT * FROM "${name}" WHERE rowid >= ? AND rowid < ? ORDER BY rowid`,
      [from, from + CHUNK],
    );
    if (page.rows.length === 0) break;
    if (insert === undefined) {
      const first = page.rows[0] as Record<string, unknown>;
      const cols = Object.keys(first);
      const colList = cols.map((c) => `"${c}"`).join(", ");
      const ph = cols.map(() => "?").join(", ");
      insert = db.prepare(`INSERT INTO "${name}" (${colList}) VALUES (${ph})`);
    }
    db.exec("BEGIN");
    for (const row of page.rows as Record<string, unknown>[]) {
      insert.run(...Object.values(row).map((v) => (v ?? null) as never));
    }
    db.exec("COMMIT");
    total += page.rows.length;
  }
  console.error(`${name}: ${total} rows`);
}

// Indexes (sql-bearing ones; implicit PK/unique indexes have sql=null).
for (const idx of objects.rows.filter((o) => o.type === "index" && o.sql)) {
  try {
    db.exec(idx.sql as string);
  } catch (e) {
    console.error(`index ${idx.name}: ${(e as Error).message.slice(0, 100)}`);
  }
}
db.close();
console.error(`wrote ${OUT}`);
