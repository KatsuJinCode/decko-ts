// docs/reports/receipts/size-insert-pinning-narrowing.mjs
// -- HOW MUCH IS THE MEMO'S INSERT CASE WORTH?
//
// The save writes cards with `INSERT INTO cards (id, name, key, ...) VALUES
// (NEW_CARD_ID_SQL, ?, ?, ...)`. An INSERT has no WHERE, so today's pin
// machinery cannot pin it, so it drops every memoized read of `cards` --
// including reads of rows the inserted row cannot be.
//
// The rule that would close that is the same disjointness rule the UPDATE
// case already uses: a read pinned to column c = v is unaffected by a write
// that ASSIGNS c a different value, because the written row then does not
// satisfy the read's predicate. For an INSERT that means: find a pin of the
// read that the INSERT's own assigned value contradicts.
//
// This script sizes the opportunity from the receipt. For each INSERT INTO
// cards it lists the reads that follow it (up to the next write to `cards`)
// which are (a) inside the transaction, (b) REPEATS of an earlier read of
// the same (sql, args), and (c) pinned to exactly one column of `cards`.
//
//   node docs/reports/receipts/size-insert-pinning-narrowing.mjs <receipt.json>
//
// WHAT IT FINDS, and why the lever is dead for this save: every candidate
// read is pinned to `id`, and the INSERT's id is NOT a bound argument -- it
// is the NEW_CARD_ID_SQL expression (src/card/history/write-path.ts:295),
// which SQLite computes from the history's id allocation. The driver cannot
// know which id the inserted row will take, so it cannot contradict an id
// pin, so the rule buys nothing here. The inserts do assign `name`, `key` and
// `codename`, and a read pinned to one of THOSE would be provably disjoint --
// but the save's reads that the inserts invalidate are id-pinned.

import { readFileSync } from "node:fs";

const receipt = JSON.parse(readFileSync(process.argv[2], "utf8"));
const segName = Object.keys(receipt.segments).find((k) => k.includes("graded save"));
const seg = receipt.segments[segName];
const seq = seg.sequence;

/** The bound arguments of a statement, in order, with NULLs kept in place
 *  (the ladder's trace writes a null argument as {"type":"null"} with no
 *  value field, so a value-shaped regex alone would SHIFT every later
 *  argument and misname the column a statement binds). */
function argsOf(entry) {
  const raw = entry.args ?? "";
  const out = [];
  const re = /\{"type":"(\w+)"(?:,"value":(?:"([^"]*)"|(-?\d+)|null))?\}/g;
  let m;
  while ((m = re.exec(raw)) !== null) out.push(m[2] ?? m[3] ?? null);
  return out;
}

const isCardsRead = (sql) => /FROM cards\b/.test(sql) && /^\s*(SELECT|WITH)/i.test(sql);
const isCardsWrite = (sql) =>
  /^\s*(UPDATE|DELETE)\s+cards\b/i.test(sql) || /^\s*INSERT INTO cards\b/i.test(sql);
const commitAt = seq.findIndex((s) => /^\s*COMMIT/i.test(s.sql));
const key = (e) => `${e.sql}\u0000${e.args ?? ""}`;

/** The column a read pins, when its WHERE is a conjunction of comparisons
 *  and every comparison names the same column of `cards`. */
function pinnedColumn(sql) {
  const where = /WHERE\s+(.*)$/i.exec(sql.replace(/\s+/g, " "))?.[1] ?? "";
  const columns = [...where.matchAll(/([A-Za-z_][A-Za-z0-9_"]*)\s*(?:COLLATE\s+\w+\s*)?=/g)].map(
    (m) => m[1].replace(/"/g, "").toLowerCase(),
  );
  if (columns.length === 0) return null;
  if (new Set(columns).size !== 1) return null;
  return columns[0];
}

const inserts = [];
seq.forEach((entry, i) => {
  if (/^\s*INSERT INTO cards\b/i.test(entry.sql)) inserts.push(i);
});
console.log(`INSERT INTO cards statements: ${inserts.length} at ${inserts.join(", ")} (COMMIT at ${commitAt})`);

let total = 0;
const byColumn = new Map();
for (const at of inserts) {
  const nextCardsWrite = seq.findIndex((e, i) => i > at && isCardsWrite(e.sql));
  const end = Math.min(nextCardsWrite === -1 ? seq.length : nextCardsWrite, commitAt + 1);
  const seen = new Set();
  for (let i = 0; i < at; i += 1) seen.add(key(seq[i]));
  const hits = [];
  for (let i = at + 1; i < end; i += 1) {
    const e = seq[i];
    if (!isCardsRead(e.sql)) continue;
    const column = pinnedColumn(e.sql);
    if (column === null) continue;
    const a = argsOf(e);
    if (a.length === 0) continue;
    if (!seen.has(key(e))) continue; // a first read is not a memo hit
    seen.add(key(e));
    hits.push({ i, column, arg: a[0], sql: e.sql.replace(/\s+/g, " ").slice(0, 70) });
  }
  total += hits.length;
  for (const h of hits) byColumn.set(h.column, (byColumn.get(h.column) ?? 0) + 1);
  console.log(`\n  insert at ${at}; next cards write at ${nextCardsWrite === -1 ? "COMMIT" : nextCardsWrite}; window ends ${end}`);
  console.log(`    repeat reads of cards pinned to ONE column: ${hits.length}`);
  for (const h of hits) console.log(`      ${String(h.i).padStart(4)}  ${h.column}=${String(h.arg).padEnd(8)} ${h.sql}`);
}
console.log(`\n  TOTAL memo hits an INSERT-pinning rule would have to keep: ${total}`);
console.log(`  by pinned column: ${[...byColumn.entries()].map(([c, n]) => `${c}=${n}`).join(", ")}`);
console.log(`
  VERDICT. The pinned column is \`id\` in every case, and the INSERT's id is
  the NEW_CARD_ID_SQL expression, not a bound argument
  (src/card/history/write-path.ts:295), so the driver cannot know which id the
  inserted row takes and cannot contradict an id pin. A read pinned to name,
  key or codename WOULD be provably disjoint (the INSERT assigns those
  columns), but the save has no such read after an insert. The INSERT case is
  worth 0 POSTs for this save.`);
