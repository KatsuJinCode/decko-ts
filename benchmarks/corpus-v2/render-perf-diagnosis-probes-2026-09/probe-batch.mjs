// Probe 2: replicate the engine's EXACT prefetch batch (both statements,
// verbatim from prefetch.ts at the time of writing) against the depth-2 and
// depth-3 seeds, and print every row each statement returns — so the gap
// between "SQL covers it" and "fallbackRounds > 0" is pinned empirically.
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";

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
// depth-2 chain
seed(701, "chain_alpha", "chain_alpha", null, null, null);
seed(702, "chain_beta", "chain_beta", null, null, null);
seed(712, null, null, 701, 702, "junction depth 2 body");
seed(900, "Junction Renderer", "junction_renderer", null, null,
     "<p>pair: {{chain_alpha+chain_beta}}</p>");

const CAP = 10000;
const at = `instr(f.rest, '{{')`;
const restAfter = `substr(f.rest, ${at} + 2)`;
const closeAt = `instr(substr(f.rest, ${at} + 2), '}}')`;
const span = `substr(f.rest, ${at} + 2, ${closeAt} - 1)`;
const cutOptions =
  `CASE WHEN instr(${span}, '|') = 0 THEN ${span} ` +
  `ELSE substr(${span}, 1, instr(${span}, '|') - 1) END`;
const keyExpr = `lower(replace(trim(${cutOptions}), ' ', '_'))`;

const RESOLVED =
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
  `)`;
const FRONTIER =
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
  `)`;

const SELECT_WALKED =
  `SELECT DISTINCT c.* FROM resolved rs\n` +
  `JOIN frontier f ON f.t = rs.ckey\n` +
  `JOIN cards c ON c.id = rs.id`;

const SELECT_TYPE_AND_SIDE =
  `SELECT c.* FROM cards c WHERE c.trash = 0 AND c.id IN (\n` +
  `  SELECT j.type_id FROM resolved rs JOIN frontier fj ON fj.t = rs.ckey\n` +
  `        JOIN cards j ON j.id = rs.id AND j.trash = 0 WHERE j.type_id IS NOT NULL\n` +
  `  UNION SELECT s.type_id FROM resolved rs JOIN frontier fj ON fj.t = rs.ckey\n` +
  `        JOIN cards j ON j.id = rs.id AND j.trash = 0\n` +
  `        JOIN cards s ON s.id IN (j.left_id, j.right_id) WHERE s.type_id IS NOT NULL\n` +
  `  UNION SELECT j.left_id FROM resolved rs JOIN frontier fj ON fj.t = rs.ckey\n` +
  `        JOIN cards j ON j.id = rs.id AND j.trash = 0 WHERE j.left_id IS NOT NULL\n` +
  `  UNION SELECT j.right_id FROM resolved rs JOIN frontier fj ON fj.t = rs.ckey\n` +
  `        JOIN cards j ON j.id = rs.id AND j.trash = 0 WHERE j.right_id IS NOT NULL\n` +
  `)`;

const show = (label, rows) =>
  console.log(label, JSON.stringify(rows.map((r) => ({ id: r.id, name: r.name, key: r.key, l: r.left_id, r: r.right_id }))));

const walked = db.prepare(`WITH RECURSIVE\n${RESOLVED},\n${FRONTIER}\n${SELECT_WALKED}`).all("junction_renderer");
show("WALKED:", walked);
const sides = db.prepare(`WITH RECURSIVE\n${RESOLVED},\n${FRONTIER}\n${SELECT_TYPE_AND_SIDE}`).all("junction_renderer");
show("TYPE_AND_SIDE:", sides);
const frontierRows = db.prepare(
  `WITH RECURSIVE\n${RESOLVED},\n${FRONTIER}\nSELECT * FROM frontier`)
  .all("junction_renderer");
console.log("FRONTIER:", JSON.stringify(frontierRows));
db.close();
