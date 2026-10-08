// Build the key-repaired graded deck: a copy of the bench deck whose cards.name
// and cards.key are taken, row by row, from the capture deck (the Decko-schema
// deck the corpus of record was captured on, after its name-and-key repair).
// Every other column is the bench's own. Neither input is modified.
//
// usage: node build-keyed-bench.cjs <bench.sqlite3> <capture-deck.sqlite3> <out.sqlite3>
const fs = require("node:fs");
const path = require("node:path");
const Database = require(path.resolve(__dirname, "node_modules/better-sqlite3"));

const [bench, capture, out] = process.argv.slice(2);
if (!bench || !capture || !out) {
  console.error("usage: build-keyed-bench.cjs <bench> <capture-deck> <out>");
  process.exit(2);
}
if (fs.existsSync(out)) {
  console.error(`refusing to overwrite ${out}`);
  process.exit(2);
}
fs.copyFileSync(bench, out);
const db = new Database(out);
db.pragma("journal_mode = DELETE");
db.prepare("ATTACH DATABASE ? AS cap").run(capture);
const before = db.prepare(`SELECT count(*) n FROM cards WHERE name IS NULL`).get().n;
const missing = db
  .prepare(`SELECT count(*) n FROM main.cards g WHERE NOT EXISTS (SELECT 1 FROM cap.cards c WHERE c.id = g.id)`)
  .get().n;
if (missing !== 0) {
  console.error(`${missing} bench cards have no capture-deck row; not a paired capture deck`);
  process.exit(1);
}
const res = db
  .prepare(
    `UPDATE main.cards SET
       name  = (SELECT c.name  FROM cap.cards c WHERE c.id = main.cards.id),
       "key" = (SELECT c."key" FROM cap.cards c WHERE c.id = main.cards.id)`,
  )
  .run();
const after = db.prepare(`SELECT count(*) n FROM cards WHERE name IS NULL`).get().n;
db.prepare("DETACH DATABASE cap").run();
db.close();
console.log(JSON.stringify({ rowsUpdated: res.changes, nullNamesBefore: before, nullNamesAfter: after }));
