// chain-sql-check.mjs — compare the render's chain-ask statement (CROSS JOIN,
// asked card outermost) with the same predicates as a plain JOIN, on the
// local deck: same row set, query plan and wall per variant.
import Database from "better-sqlite3";
const db = new Database(process.argv[2], { readonly: true });
const clause = (depth) => "(" + Array.from({ length: depth }, (_, n) => `p${n}."key" COLLATE NOCASE = ?`).join(" AND ") + ")";
function build(depth, chunk, cross) {
  const J = cross ? "CROSS JOIN" : "JOIN";
  const joins = [];
  for (let n = depth - 1; n >= 2; n--) joins.push(` ${J} cards c${n} ON c${n}.id = c${n + 1}.left_id AND c${n}.trash = 0`);
  joins.push(` ${J} cards p0 ON p0.id = c2.left_id AND p0.trash = 0`);
  for (let n = 1; n < depth; n++) joins.push(` ${J} cards p${n} ON p${n}.id = c${n + 1}.right_id AND p${n}.trash = 0`);
  return `SELECT DISTINCT c${depth}.* FROM cards c${depth}` + joins.join("") + ` WHERE c${depth}.trash = 0 AND (${chunk.map(() => clause(depth)).join(" OR ")})`;
}
// Real part keys: junction cards (left/right names) of depth-d chains, via
// the deck's own card rows, so the sample has matches.
const depth = Number(process.argv[3] ?? 3);
const sampleTuples = db.prepare(`
  SELECT j.id, j.left_id, j.right_id FROM cards j WHERE j.trash = 0 AND j.left_id IS NOT NULL AND j.right_id IS NOT NULL LIMIT 4000`).all();
// Build keys for depth-3 chains: c3.left -> c2, c2.left -> p0, c2.right -> p1, c3.right -> p2.
const keyOf = db.prepare("SELECT key FROM cards WHERE id = ?");
const tuples = [];
for (const c3 of db.prepare("SELECT id, left_id, right_id FROM cards WHERE trash = 0 AND left_id IN (SELECT id FROM cards WHERE left_id IS NOT NULL AND right_id IS NOT NULL) LIMIT 60").all()) {
  const c2 = db.prepare("SELECT left_id, right_id FROM cards WHERE id = ?").get(c3.left_id);
  if (!c2) continue;
  const keys = [c2.left_id, c2.right_id, c3.right_id].map((id) => keyOf.get(id)?.key);
  if (keys.every((k) => k !== undefined)) tuples.push(keys);
}
const chunk = tuples.slice(0, 20);
const params = chunk.flat();
for (const cross of [true, false]) {
  const sql = build(depth, chunk, cross);
  const plan = db.prepare("EXPLAIN QUERY PLAN " + sql).all(...params).map((r) => r.detail).join(" | ");
  const t0 = performance.now();
  let rows = [];
  for (let i = 0; i < 20; i++) rows = db.prepare(sql).all(...params);
  const ms = (performance.now() - t0) / 20;
  console.log(`${cross ? "CROSS JOIN" : "JOIN      "} rows=${rows.length} ids=${rows.map((r) => r.id).sort((a, b) => a - b).slice(0, 5).join(",")} avg=${ms.toFixed(2)}ms`);
  console.log(`  plan: ${plan.slice(0, 400)}`);
}
