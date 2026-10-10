// remove-vimage-rows.mjs -- surgical removal of the rows the image-version
// probe wrote directly into the shared oracle deck (deck copy passed where a
// copy was required). Deletes exactly the rows belonging to the created
// "PersistProbe VImage" card and nothing else, then reports what remains.
import { DatabaseSync } from "node:sqlite";

const dbPath = process.argv[2];
if (!dbPath) {
  console.error("usage: node remove-vimage-rows.mjs <deck.sqlite3>");
  process.exit(2);
}
const db = new DatabaseSync(dbPath);
const card = db.prepare("SELECT id FROM cards WHERE key = 'persist_probe_v_image'").get();
if (!card) {
  console.log("no PersistProbe VImage card found; nothing to remove");
  process.exit(0);
}
const cardId = Number(card.id);
const actions = db.prepare("SELECT id FROM card_actions WHERE card_id = ?").all(cardId).map((r) => Number(r.id));
const placeholders = actions.map(() => "?").join(",");
let removed = 0;
const run = db.exec("BEGIN");
try {
  if (actions.length) {
    removed += db.prepare(`DELETE FROM card_changes WHERE card_action_id IN (${placeholders})`).run(...actions).changes;
    removed += db.prepare(`DELETE FROM card_actions WHERE id IN (${placeholders})`).run(...actions).changes;
  }
  removed += db.prepare("DELETE FROM card_acts WHERE card_id = ?").run(cardId).changes;
  removed += db.prepare("DELETE FROM card_references WHERE referer_id = ?").run(cardId).changes;
  removed += db.prepare("DELETE FROM card_virtuals WHERE left_id = ?").run(cardId).changes;
  removed += db.prepare("DELETE FROM cards WHERE id = ?").run(cardId).changes;
  db.exec("COMMIT");
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
}
console.log(`removed ${removed} rows for card id ${cardId} (actions: ${actions.join(", ") || "none"})`);
const check = db.prepare("SELECT COUNT(*) AS n FROM cards WHERE key = 'persist_probe_v_image'").get();
console.log(`remaining VImage rows: ${check.n}`);
db.close();
