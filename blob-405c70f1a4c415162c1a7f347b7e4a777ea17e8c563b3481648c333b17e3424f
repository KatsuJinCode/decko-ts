// benchmarks/cold-render/dump-trial-deck-to-local-sqlite.ts
// WHAT THIS IS: mirrors the trial deck's `cards` table into a local sqlite
// file so statement-shape experiments run in milliseconds instead of
// seconds-per-shape over the network link.
//
// WHY: scoping the rule-key resolution walk is a PLAN question - which
// boundary condition keeps the recursive arms off the deck's non-rule
// junctions. A network round trip per candidate shape prices at ~2.5-27 s
// (measured: the arms-bounded form cost 25 s against the trial database),
// which is too slow to compare shapes honestly. Locally the same shapes
// rank the same way and cost microseconds to iterate; the WINNER is then
// confirmed against the trial database by
// probe-rule-closure-statement-shapes.ts.
//
// Output: benchmarks/cold-render/trial-deck-mirror.sqlite3
//
// Run:
//   npx esbuild --bundle --format=esm --platform=node --target=node20 \
//     "--external:node:*" --external:better-sqlite3 --external:sass --external:coffeescript \
//     --outfile=benchmarks/cold-render/dump-trial-deck-to-local-sqlite.mjs \
//     benchmarks/cold-render/dump-trial-deck-to-local-sqlite.ts
//   node benchmarks/cold-render/dump-trial-deck-to-local-sqlite.mjs

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

const cols = await driver.query<{ name: string; type: string }>(
  "SELECT name, type FROM pragma_table_info('cards')",
  [],
);
console.error("columns:", cols.rows.map((c) => `${c.name}:${c.type}`).join(" "));

// Chunked by id: a single `SELECT * FROM cards` over the network exceeds
// the driver's RESPONSE_TOO_LARGE ceiling, so the mirror is read in id
// windows. The deck's ids are NOT dense (a short window is followed by
// more rows), so the walk continues until an empty window appears.
const CHUNK = 2000;
const all: Record<string, unknown>[] = [];
let maxId = 0;
for (let from = 1; from < 2_000_000; from += CHUNK) {
  const page = await driver.query<Record<string, unknown>>(
    `SELECT * FROM cards WHERE id >= ? AND id < ? ORDER BY id`,
    [from, from + CHUNK],
  );
  if (page.rows.length === 0) break;
  all.push(...(page.rows as unknown as Record<string, unknown>[]));
  maxId = from + CHUNK;
}
console.error(`rows: ${all.length} (id window walked to ${maxId})`);

const OUT = "benchmarks/cold-render/trial-deck-mirror.sqlite3";
const db = new Database(OUT);
db.pragma("journal_mode = WAL");
db.exec("DROP TABLE IF EXISTS cards");
const defs = cols.rows.map((c) => `"${c.name}" ${c.type}`).join(", ");
db.exec(`CREATE TABLE cards (${defs})`);
const names = cols.rows.map((c) => `"${c.name}"`).join(", ");
const insert = db.prepare(`INSERT INTO cards (${names}) VALUES (${names.split(", ").map(() => "?").join(", ")})`);
const columnNames = cols.rows.map((c) => c.name);
db.exec("BEGIN");
for (const row of all) insert.run(...columnNames.map((n) => (row[n] ?? null) as never));
db.exec("COMMIT");
db.exec("CREATE INDEX IF NOT EXISTS cards_key_index ON cards (\"key\")");
db.exec("CREATE INDEX IF NOT EXISTS cards_left_index ON cards (left_id)");
db.exec("CREATE INDEX IF NOT EXISTS cards_right_index ON cards (right_id)");
db.exec("CREATE INDEX IF NOT EXISTS cards_trash_index ON cards (trash)");
db.close();
console.error(`wrote ${OUT}`);
