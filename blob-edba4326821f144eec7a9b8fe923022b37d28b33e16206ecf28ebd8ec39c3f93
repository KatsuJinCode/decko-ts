// docs/reports/receipts/attribute-composed-name-walk-round-trips.mjs
// -- PRICE THE COMPOSED-NAME WALK'S ROUND TRIPS
//
// The walk's two shapes (the seed reads and the arm reads), and the POSTs
// they ride, in the save segment. The seed reads are what the walk's
// batching landed on; the arm reads cannot merge (level n+1's pairs are
// computed from level n's answers).
//
//   node docs/reports/receipts/attribute-composed-name-walk-round-trips.mjs <receipt.json>

import { readFileSync } from "node:fs";

const receipt = JSON.parse(readFileSync(process.argv[2], "utf8"));
const segName = Object.keys(receipt.segments).find((k) => k.includes("graded save"));
const seg = receipt.segments[segName];

const isSeed = (sql) => /WHERE "key" IN \(/.test(sql);
const isArm = (sql) => /left_id = \? AND right_id = \? AND \+trash = 0/.test(sql);

let seedPosts = 0, seedStmts = 0, armPosts = 0, armStmts = 0, armSoloPosts = 0;
const seedPostList = [];
for (const p of seg.postDetail) {
  const seeds = p.sqls.filter(isSeed);
  const arms = p.sqls.filter(isArm);
  if (seeds.length > 0) { seedPosts += 1; seedStmts += seeds.length; seedPostList.push({ stmts: p.stmts, seeds: seeds.length }); }
  if (arms.length > 0) { armPosts += 1; armStmts += arms.length; if (arms.length === p.stmts && p.stmts === 1) armSoloPosts += 1; }
}
console.log(`seed reads ("key" IN (...)): ${seedStmts} statements on ${seedPosts} POSTs`);
console.log(`arm reads (left_id/right_id): ${armStmts} statements on ${armPosts} POSTs (${armSoloPosts} of them solo)`);

// Walk boundaries: the seed reads are issued at the start of a walk. Print the
// statement-index neighbourhood of every seed read so the walk structure is
// visible: which seed reads are adjacent (same sequence point) and what
// separates them.
const seq = seg.sequence;
console.log("\nseed reads in statement order (index | rows | neighbours):");
for (let i = 0; i < seq.length; i += 1) {
  if (!isSeed(seq[i].sql)) continue;
  const keys = /\((\?[^)]*)\)/.exec(seq[i].sql.replace(/\s+/g, " "))?.[1] ?? "";
  const n = (keys.match(/\?/g) ?? []).length;
  const before = seq.slice(Math.max(0, i - 3), i).map((s) => s.sql.replace(/\s+/g, " ").slice(0, 44));
  const after = seq.slice(i + 1, i + 4).map((s) => s.sql.replace(/\s+/g, " ").slice(0, 44));
  console.log(`  ${String(i).padStart(4)}  ${String(n).padStart(2)} keys`);
  console.log(`        before: ${before.join(" | ")}`);
  console.log(`        after : ${after.join(" | ")}`);
}
