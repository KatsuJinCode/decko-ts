#!/usr/bin/env node
// apply-chunks-to-d1-local.mjs — apply every chunk in a directory directly
// to the wrangler local D1 SQLite file (bypassing the wrangler CLI startup
// overhead). Used by the chunk-size discovery recipe to land the chunked
// seed into local D1 in a reasonable wall time.
//
// This is NOT a deployment tool — it writes directly to the local D1 file
// at deploy/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/<id>.sqlite.
// The schema there is the same as the D1 remote schema.
//
// Usage:
//   node tools/migrate/apply-chunks-to-d1-local.mjs <chunks-dir> [--d1-path <path>]

import Database from "better-sqlite3";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, basename } from "node:path";

const args = process.argv.slice(2);
const chunksDir = args[0];
if (!chunksDir) {
  console.error("usage: node apply-chunks-to-d1-local.mjs <chunks-dir> [--d1-path <path>]");
  process.exit(1);
}
let d1Path = args.includes("--d1-path")
  ? args[args.indexOf("--d1-path") + 1]
  : "C:/localProjects/decko-ts/deploy/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/a1a303fd200c27b83bab36405a71ada7966fab9c97029264ac552a5732c81cd3.sqlite";

const files = readdirSync(chunksDir).filter((f) => f.endsWith(".sql")).sort();
console.log(`apply-chunks-to-d1-local: ${files.length} chunks from ${chunksDir}`);
console.log(`  target: ${d1Path}`);

const db = new Database(d1Path);
db.pragma("journal_mode = WAL");
db.pragma("synchronous = OFF");

const t0 = Date.now();
let appliedRows = 0;
let chunkIdx = 0;
for (const f of files) {
  const sql = readFileSync(join(chunksDir, f), "utf8");
  db.exec(sql);
  chunkIdx++;
  if (chunkIdx % 50 === 0) console.log(`  ${chunkIdx}/${files.length} chunks applied`);
}

// count rows
const cardCount = db.prepare("SELECT COUNT(*) AS n FROM cards").get();
const refsCount = db.prepare("SELECT COUNT(*) AS n FROM card_references").get();
const elapsed = Date.now() - t0;
console.log(`  applied ${files.length} chunks in ${(elapsed / 1000).toFixed(1)}s`);
console.log(`  cards: ${cardCount.n}`);
console.log(`  card_references: ${refsCount.n}`);
// Also dump the per-table count for every DDL table so the operator
// sees the full landing shape.
for (const t of ["card_acts","card_actions","card_changes","card_revisions","card_virtuals","delayed_jobs","sessions","schema_migrations","ar_internal_metadata","transform_migrations"]) {
  try {
    const c = db.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get();
    console.log(`  ${t}: ${c.n}`);
  } catch { /* missing table */ }
}
db.close();
