// Standalone probe: replicate junction-depth-closure.test.ts's depth-3 seed
// in a real better-sqlite3 DB, run the exact walkStatement SQL from
// src/card/render/prefetch.ts, and print what each stage yields — so the
// depth-3 "nest target not found" mechanism is pinned empirically, not
// guessed. Coordinator diagnostic; not a test, not committed as a gate.
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";

const db = new Database(":memory:");
const ddl = readFileSync("db/schema.sqlite.sql", "utf8");
// split statements (quote-aware, same contract as test storage)
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

// seed: exactly the depth-3 chain of the failing test
const insert = db.prepare(
  `INSERT INTO cards (id, name, key, codename, left_id, right_id, current_revision_id,
     created_at, updated_at, creator_id, updater_id, read_rule_class, read_rule_id,
     references_expired, trash, type_id, db_content)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
const T = "2026-09-20 00:00:00.000";
const seed = (id, name, key, leftId, rightId, content) =>
  insert.run(id, name, key, null, leftId, rightId, null, T, T, 1, 1, null, null, null,
             leftId ? 0 : 0, 2, content ?? null);
seed(701, "chain_alpha", "chain_alpha", null, null, null);
seed(702, "chain_beta", "chain_beta", null, null, null);
seed(712, null, null, 701, 702, "junction depth 2 body");
seed(703, "chain_part_3", "chain_part_3", null, null, null);
seed(803, null, null, 712, 703, "junction depth 3 body");
seed(900, "Junction Renderer", "junction_renderer", null, null,
     "<p>deep: {{chain_alpha+chain_beta+chain_part_3}}</p>");

// the walk SQL, mirrored exactly from walkStatement()
const CAP = 10000;
const at = `instr(f.rest, '{{')`;
const restAfter = `substr(f.rest, ${at} + 2)`;
const closeAt = `instr(substr(f.rest, ${at} + 2), '}}')`;
const span = `substr(f.rest, ${at} + 2, ${closeAt} - 1)`;
const cutOptions =
  `CASE WHEN instr(${span}, '|') = 0 THEN ${span} ` +
  `ELSE substr(${span}, 1, instr(${span}, '|') - 1) END`;
const keyExpr = `lower(replace(trim(${cutOptions}), ' ', '_'))`;
const sql =
  `WITH RECURSIVE\n` +
  `resolved(id, ckey) AS (\n` +
  `  SELECT id, "key" FROM cards WHERE "key" IS NOT NULL AND trash = 0\n` +
  `  UNION\n` +
  `  SELECT j.id, l.ckey || '+' || r."key" FROM resolved l\n` +
  `    JOIN cards j ON j.left_id = l.id AND j.trash = 0\n` +
  `    JOIN cards r ON r.id = j.right_id AND r."key" IS NOT NULL\n` +
  `  UNION\n` +
  `  SELECT j.id, l."key" || '+' || r.ckey FROM resolved r\n` +
  `    JOIN cards j ON j.right_id = r.id AND j.trash = 0\n` +
  `    JOIN cards l ON l.id = j.left_id AND l."key" IS NOT NULL\n` +
  `),\n` +
  `frontier(t, rest) AS (\n` +
  `  SELECT ?, NULL\n` +
  `  UNION\n` +
  `  SELECT f.t, substr(c.db_content, 1, ${CAP})\n` +
  `  FROM frontier f\n` +
  `  JOIN resolved rs ON rs.ckey = f.t\n` +
  `  JOIN cards c ON c.id = rs.id AND c.trash = 0\n` +
  `  WHERE f.rest IS NULL AND c.db_content LIKE '%{{%'\n` +
  `  UNION\n` +
  `  SELECT f.t, ${restAfter} FROM frontier f\n` +
  `   WHERE f.rest IS NOT NULL AND ${at} > 0\n` +
  `  UNION\n` +
  `  SELECT DISTINCT ${keyExpr}, NULL FROM frontier f\n` +
  `   WHERE f.rest IS NOT NULL AND ${at} > 0 AND ${closeAt} > 1\n` +
  `  UNION\n` +
  `  SELECT f.t, NULL FROM frontier f\n` +
  `   WHERE f.rest IS NOT NULL AND ${at} = 0\n` +
  `)\n` +
  `SELECT DISTINCT c.* FROM resolved rs\n` +
  `JOIN frontier f ON f.t = rs.ckey\n` +
  `JOIN cards c ON c.id = rs.id`;

try {
  const rows = db.prepare(sql).all("junction_renderer");
  console.log("WALK OK; walked ids:", rows.map((r) => r.id).sort((a, b) => a - b));
  console.log("names:", rows.map((r) => r.name ?? `(${r.left_id}+${r.right_id})`));
} catch (e) {
  console.log("WALK THREW:", e.message);
}

// also: what does `resolved` itself contain?
try {
  const res = db
    .prepare(
      `WITH RECURSIVE\n` +
      `resolved(id, ckey) AS (\n` +
      `  SELECT id, "key" FROM cards WHERE "key" IS NOT NULL AND trash = 0\n` +
      `  UNION\n` +
      `  SELECT j.id, l.ckey || '+' || r."key" FROM resolved l\n` +
      `    JOIN cards j ON j.left_id = l.id AND j.trash = 0\n` +
      `    JOIN cards r ON r.id = j.right_id AND r."key" IS NOT NULL\n` +
      `  UNION\n` +
      `  SELECT j.id, l."key" || '+' || r.ckey FROM resolved r\n` +
      `    JOIN cards j ON j.right_id = r.id AND j.trash = 0\n` +
      `    JOIN cards l ON l.id = j.left_id AND l."key" IS NOT NULL\n` +
      `)\n` +
      `SELECT * FROM resolved ORDER BY id`
    )
    .all();
  console.log("RESOLVED rows:", JSON.stringify(res));
} catch (e) {
  console.log("RESOLVED THREW:", e.message);
}
db.close();
