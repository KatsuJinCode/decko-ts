// semantics-extend-instances.mjs -- append view/event questions over one
// instance card of every cardtype the deck uses.
//
// The first wave's set list names the type CARDS (Date, Image, ...), whose own
// type is Cardtype, so type-specific mods (date, list, carrierwave, markdown,
// style, script, ...) were never reached. This adds the lowest-id live card of
// each cardtype with at least one live, simply named instance.
//
// usage: node semantics-extend-instances.mjs <questions.json> <deck.sqlite3>
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Database = require("../../node_modules/better-sqlite3");
const [path, deckPath] = process.argv.slice(2);
const doc = JSON.parse(readFileSync(path, "utf8"));
const questions = doc.questions.filter((q) => q.wave !== 3);

const db = new Database(deckPath, { readonly: true });
const cardtype = db.prepare("SELECT id FROM cards WHERE codename = 'cardtype'").get().id;
const types = db.prepare("SELECT id, name FROM cards WHERE type_id = ? AND trash = 0 ORDER BY id").all(cardtype);
const instances = [];
for (const t of types) {
  const row = db
    .prepare(
      "SELECT name FROM cards WHERE type_id = ? AND trash = 0 AND left_id IS NULL AND name IS NOT NULL " +
        "AND name NOT LIKE '%+%' ORDER BY id LIMIT 1",
    )
    .get(t.id);
  if (row) instances.push(row.name);
}
db.close();

let next = Math.max(...questions.map((q) => q.id)) + 1;
questions.push({ id: next++, wave: 3, category: "dsl", kind: "view_defs_full", payload: { sets: instances } });
questions.push({ id: next++, wave: 3, category: "dsl", kind: "event_defs_full", payload: { sets: instances } });
writeFileSync(path, JSON.stringify({ ...doc, questions }));
process.stdout.write(`types ${types.length}, instances ${instances.length}; questions ${questions.length}\n`);
