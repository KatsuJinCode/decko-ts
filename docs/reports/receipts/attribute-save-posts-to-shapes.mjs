// docs/reports/receipts/attribute-save-posts-to-shapes.mjs -- PRICE THE SAVE'S POSTs
//
// Reads a save-ladder receipt that carries per-POST attribution (the
// post-attribution ladder, tools/diagnose-owner-save-statement-ladder-post-attribution.mjs)
// and says, in the ladder's own currency (POSTs), where the save's round trips go.
//
//   node docs/reports/receipts/attribute-save-posts-to-shapes.mjs <receipt.json>

import { readFileSync } from "node:fs";

const receipt = JSON.parse(readFileSync(process.argv[2], "utf8"));
const segName = Object.keys(receipt.segments).find((k) => k.includes("graded save"));
const seg = receipt.segments[segName];
const posts = seg.postDetail;

console.log(`SAVE SEGMENT: ${seg.posts} POSTs, ${seg.stmts} statements, db wall ${seg.dbWallMs} ms, stmt-exec ${seg.stmtWallMs} ms`);
console.log(`  POST size distribution:`);
const size = new Map();
for (const p of posts) size.set(p.stmts, (size.get(p.stmts) ?? 0) + 1);
for (const [n, c] of [...size.entries()].sort((a, b) => b[0] - a[0] || b[1] - a[1])) {
  console.log(`    ${String(c).padStart(4)} POSTs carry ${String(n).padStart(3)} statement(s)  (${c * n} statements)`);
}
const single = posts.filter((p) => p.stmts === 1).length;
console.log(`  single-statement POSTs: ${single} (${((single / seg.posts) * 100).toFixed(1)}% of POSTs, ${single} statements)`);

// Which SQL shapes ride a POST ALONE (one statement per POST = one hop each)?
const alone = new Map();
for (const p of posts) {
  if (p.stmts !== 1) continue;
  const sql = p.sqls[0].replace(/\s+/g, " ").slice(0, 110);
  const e = alone.get(sql) ?? { posts: 0 };
  e.posts += 1;
  alone.set(sql, e);
}
console.log(`\n  SOLO POSTs by shape (one statement, one hop):`);
for (const [sql, e] of [...alone.entries()].sort((a, b) => b[1].posts - a[1].posts).slice(0, 20)) {
  console.log(`    ${String(e.posts).padStart(4)} POSTs  ${sql}`);
}
const soloTotal = [...alone.values()].reduce((a, e) => a + e.posts, 0);
console.log(`    total solo POSTs: ${soloTotal}`);

// Batched POSTs: how many statements ride one hop?
const batched = posts.filter((p) => p.stmts > 1);
console.log(`\n  BATCHED POSTs: ${batched.length} hops carrying ${batched.reduce((a, p) => a + p.stmts, 0)} statements`);
const batchShapes = new Map();
for (const p of batched) {
  for (const sql of p.sqls) {
    const key = sql.replace(/\s+/g, " ").slice(0, 110);
    const e = batchShapes.get(key) ?? { stmts: 0 };
    e.stmts += 1;
    batchShapes.set(key, e);
  }
}
for (const [sql, e] of [...batchShapes.entries()].sort((a, b) => b[1].stmts - a[1].stmts).slice(0, 14)) {
  console.log(`    ${String(e.stmts).padStart(4)} stmts  ${sql}`);
}

// Region split: the transaction's statements vs the post-COMMIT ones, by POST.
const seq = seg.sequence;
const commitAt = seq.findIndex((s) => /^\s*COMMIT/i.test(s.sql));
console.log(`\n  COMMIT at statement index ${commitAt} of ${seq.length}`);
let cursor = 0;
let inTxPosts = 0, inTxStmts = 0, outTxPosts = 0, outTxStmts = 0;
for (const p of posts) {
  const inside = cursor + p.stmts <= commitAt + 1;
  if (inside) { inTxPosts += 1; inTxStmts += p.stmts; } else { outTxPosts += 1; outTxStmts += p.stmts; }
  cursor += p.stmts;
}
console.log(`  POSTs whose statements are ALL inside the transaction: ${inTxPosts} (${inTxStmts} statements)`);
console.log(`  POSTs that cross or sit after COMMIT:                 ${outTxPosts} (${outTxStmts} statements)`);
