// tools/deck-key-drift-report.ts — READ-ONLY report: rows of a deck whose
// STORED cards.key differs from the engine's computed canonical key
// (DeckoName.parse(name).key), plus live case-duplicate name pairs.
//
//   node tools/deck-key-drift-report.ts <deck.sqlite3> [--limit 40]
//
// Run (the source tree's .js-suffixed relative imports do not resolve under
// plain node, so the tool is bundled first — the repo's own esbuild pattern):
//
//   node -e "import('esbuild').then(async(e)=>e.build({entryPoints:['tools/deck-key-drift-report.ts'],bundle:true,platform:'node',format:'esm',outfile:'tmp/deck-key-drift-report.bundle.mjs',external:['better-sqlite3']}))" \
//     && node tmp/deck-key-drift-report.bundle.mjs <deck.sqlite3>
//
// Why this report exists: name uniqueness (validate_uniqueness_of_name,
// mod/core/set/all/name_events.rb:19-26) resolves Lexicon.id over the
// cards.key column. On the MySQL reference that column carries a
// case-insensitive collation, so a stored key differing from the computed
// key by CASE still resolved and the duplicate was refused. On libSQL the
// comparison is binary (the port now folds case explicitly — lexQuery's
// COLLATE NOCASE), but the drifted rows themselves remain unfetchable BY
// KEY from the engine (retrieve.ts `WHERE key = ?`), which is the class
// behind the live case-duplicate pair. The report lists them; it writes
// nothing — the fix decision (normalize the stored keys vs leave them)
// belongs to a reviewed pass, not to this tool.

import Database from "better-sqlite3";
import { DeckoName } from "../src/card/name.js";

const args = process.argv.slice(2);
const dbPath = args.find((a) => !a.startsWith("--"));
const limitIdx = args.indexOf("--limit");
const limit = limitIdx !== -1 ? Number(args[limitIdx + 1] ?? 40) : 40;
if (dbPath === undefined || Number.isNaN(limit)) {
  console.error("usage: node deck-key-drift-report.bundle.mjs <deck.sqlite3> [--limit 40]");
  process.exit(2);
}

const db = new Database(dbPath, { readonly: true });

interface Row {
  id: number;
  name: string;
  key: string;
  type_id: number | null;
  trash: number;
}

const live = db
  .prepare(
    `SELECT id, name, key, type_id, trash FROM cards
     WHERE trash = 0 AND name IS NOT NULL AND key IS NOT NULL`,
  )
  .all() as Row[];

const caseOnly: Array<{ row: Row; computed: string }> = [];
const otherDrift: Array<{ row: Row; computed: string }> = [];
for (const row of live) {
  const computed = DeckoName.parse(row.name).key;
  if (computed === row.key) continue;
  if (row.key.toLowerCase() === computed.toLowerCase()) caseOnly.push({ row, computed });
  else otherDrift.push({ row, computed });
}

const byLower = new Map<string, Row[]>();
for (const row of live) {
  const bucket = byLower.get(row.name.toLowerCase()) ?? [];
  bucket.push(row);
  byLower.set(row.name.toLowerCase(), bucket);
}
const casePairs: Array<[Row, Row]> = [];
for (const bucket of byLower.values()) {
  for (let i = 0; i < bucket.length; i++) {
    for (let j = i + 1; j < bucket.length; j++) {
      if (bucket[i].name !== bucket[j].name) casePairs.push([bucket[i], bucket[j]]);
    }
  }
}

const show = (r: { row: Row; computed: string }): string =>
  `  id=${r.row.id}  name=${JSON.stringify(r.row.name)}  stored=${JSON.stringify(r.row.key)}  computed=${JSON.stringify(r.computed)}  type=${r.row.type_id ?? "?"}`;

console.log(`deck: ${dbPath}`);
console.log(`live rows with name+key: ${live.length}`);
console.log("");
console.log(`CASE-ONLY key drift (stored key differs from computed by case only): ${caseOnly.length}`);
for (const r of caseOnly.slice(0, limit)) console.log(show(r));
if (caseOnly.length > limit) console.log(`  ... ${caseOnly.length - limit} more`);
console.log("");
console.log(`OTHER key drift (stored key != computed for any other reason): ${otherDrift.length}`);
for (const r of otherDrift.slice(0, limit)) console.log(show(r));
if (otherDrift.length > limit) console.log(`  ... ${otherDrift.length - limit} more`);
console.log("");
console.log(`live case-duplicate NAME pairs (same name modulo case, both live): ${casePairs.length}`);
for (const [a, b] of casePairs.slice(0, limit)) {
  console.log(`  id=${a.id} ${JSON.stringify(a.name)}  <->  id=${b.id} ${JSON.stringify(b.name)}  (types ${a.type_id ?? "?"}/${b.type_id ?? "?"})`);
}
if (casePairs.length > limit) console.log(`  ... ${casePairs.length - limit} more`);
db.close();
