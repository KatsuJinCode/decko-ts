// Probe 3: eliminate transcription doubt. Loads the EXACT SQL text the
// engine executed (captured by the counting driver into stmt6.txt), seeds
// the same rows, and runs it three ways: bare prepare/all (probe 1 style),
// inside db.transaction like LocalSqliteDriver.batch, and bare again after.
// Whichever path loses the junction row is the culprit context.
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";

const sql = readFileSync("stmt6.txt", "utf8");
const db = new Database(":memory:");
const ddl = readFileSync("db/schema.sqlite.sql", "utf8");
const statements = [];
let cur = "", q = null;
for (let i = 0; i < ddl.length; i++) {
  const ch = ddl[i];
  if (q) { cur += ch; if (ch === q) q = null; continue; }
  if (ch === "'" || ch === '"') { q = ch; cur += ch; continue; }
  if (ch === "-" && ddl[i + 1] === "-") { while (i < ddl.length && ddl[i] !== "\n") i++; cur += " "; continue; }
  if (ch === ";") { statements.push(cur.trim()); cur = ""; continue; }
  cur += ch;
}
if (cur.trim()) statements.push(cur.trim());
for (const s of statements) db.prepare(s).run();

const insert = db.prepare(
  `INSERT INTO cards (id, name, key, codename, left_id, right_id, current_revision_id,
     created_at, updated_at, creator_id, updater_id, read_rule_class, read_rule_id,
     references_expired, trash, type_id, db_content)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
const T = "2026-09-20 00:00:00.000";
const seed = (id, name, key, leftId, rightId, content) =>
  insert.run(id, name, key, null, leftId, rightId, null, T, T, 1, 1, null, null, null,
             0, 2, content ?? null);
seed(2, "RichText", "rich_text", null, null, null);
seed(701, "chain_alpha", "chain_alpha", null, null, null);
seed(702, "chain_beta", "chain_beta", null, null, null);
seed(712, null, null, 701, 702, "junction depth 2 body");
seed(900, "Junction Renderer", "junction_renderer", null, null,
     "<p>pair: {{chain_alpha+chain_beta}}</p>");

const show = (label, rows) =>
  console.log(label, JSON.stringify(rows.map((r) => r.id).sort((a, b) => a - b)));

show("A bare:", db.prepare(sql).all("junction_renderer"));

const runBatch = db.transaction(() => {
  const stmt = db.prepare(sql);
  return stmt.all("junction_renderer");
});
show("B in-transaction:", runBatch());

show("C bare again:", db.prepare(sql).all("junction_renderer"));
db.close();
