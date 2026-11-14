// tmp/measure-row-scope-lever-on-recorded-save.mjs
//
// WHAT-IF, no production code. Sizes the ONE lever the census left open
// (composed-name-path-round-trip-budget-...md §7.1: the transaction read memo
// invalidates per TABLE, and the save writes to `cards`).
//
// WHY THIS SHAPE. The ladder receipt records what the driver SENT, so every
// statement in it is a memo MISS by construction (a hit performs no database
// operation -- bunny-db.ts:552-556). Replaying the memo over that stream would
// apply the cache a second time and is meaningless; the first version of this
// script did exactly that and was discarded for reporting 644 against a
// recorded 689.
//
// The question this script answers instead is exact and needs no replay:
//
//   For every recorded statement that REPEATS an (sql, args) pair seen earlier
//   in the same transaction, would the row-scoped rule have had a live entry at
//   that moment?  If yes, that statement becomes a cache hit and one POST and
//   one statement leave the save. If no, the write really did touch the row the
//   read names and the statement must still be sent.
//
// The engine asks the driver the SAME questions either way -- only the memo's
// survival changes -- so the set of misses under the narrowed rule is a subset
// of today's, and this count is the exact statement reduction, not a sample.

import { readFileSync } from "node:fs";

const RECEIPT = process.argv[2];
const r = JSON.parse(readFileSync(RECEIPT, "utf8"));
const NAME = "POST /update/Brandon_WilliamsCraig (the graded save)";
const seq = r.segments[NAME].sequence;

const strip = (sql) =>
  sql.replace(/'(?:[^']|'')*'/g, "''").replace(/--[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");

const val = (a) => {
  if (a === undefined || a === null) return null;
  if (typeof a !== "object") return String(a);
  if (a.type === "null") return null;
  return `${a.type}:${a.value}`;
};

const isRead = (sql) => {
  const s = strip(sql).trimStart();
  if (/^SELECT\b/i.test(s)) return true;
  if (/^WITH\b/i.test(s)) return !/\b(?:INSERT|UPDATE|DELETE|REPLACE)\b/i.test(s);
  return false;
};

const tablesOf = (sql) => {
  const out = new Set();
  const re = /\b(?:FROM|JOIN)\s+"?([A-Za-z_][A-Za-z0-9_]*)"?/gi;
  let m;
  const s = strip(sql);
  while ((m = re.exec(s)) !== null) out.add(m[1].toLowerCase());
  return out;
};

const writeTarget = (sql) => {
  const m = /^(?:INSERT(?:\s+OR\s+\w+)?\s+INTO|UPDATE|DELETE\s+FROM)\s+"?([A-Za-z_][A-Za-z0-9_]*)"?/i.exec(
    strip(sql).trimStart(),
  );
  return m === null ? null : m[1].toLowerCase();
};

/** The deck's `cards` key column. Verified against the serving deck's own
 *  sqlite_master, not assumed: see the receipt's `cards_pk` line. */
const PK = { cards: "id" };

/** A read that provably names ONE row of ONE table: no join, no OR, no set
 *  operator, no grouping, a single-table FROM, and the only surviving
 *  conjunct is `<pk> = ?`. Anything else returns null = unknown = the current
 *  table-scoped rule. */
function readRowScope(sql, args) {
  if (!/^SELECT\b/i.test(strip(sql).trimStart())) return null;
  const s = strip(sql);
  const froms = [...s.matchAll(/\b(?:FROM|JOIN)\s+"?([A-Za-z_][A-Za-z0-9_]*)"?/gi)];
  if (froms.length !== 1) return null;
  const table = froms[0][1].toLowerCase();
  if (PK[table] === undefined) return null;
  if (/\bOR\b|\b(?:UNION|INTERSECT|EXCEPT)\b|\bGROUP\s+BY\b|\bHAVING\b/i.test(s)) return null;
  const where = /\bWHERE\b([\s\S]*?)(?=\bORDER\s+BY\b|\bLIMIT\b|$)/i.exec(s)?.[1];
  if (where === undefined || where.trim() === "") return null;
  for (const conj of where.split(/\s+AND\s+/i)) {
    if (!new RegExp(`^\\s*"?${PK[table]}"?\\s*=\\s*\\?\\s*$`, "i").test(conj)) return null;
  }
  // The matched `?` must be the statement's FIRST placeholder, so that the key
  // is args[0] and no other placeholder is silently bound ahead of it.
  const m = new RegExp(`"?${PK[table]}"?\\s*=\\s*\\?`, "i").exec(s);
  if (m === null) return null;
  if (m.index + m[0].length - 1 !== s.indexOf("?")) return null;
  if (args.length !== 1 && (s.match(/\?/g) ?? []).length !== 1) return null;
  return { table, key: val(args[0]) };
}

/** The rows a write touches, or null when not provable. */
function writeRowScope(sql, args) {
  const s = strip(sql).trimStart();
  const table = writeTarget(s);
  if (table === null || PK[table] === undefined) return null;
  const where = /\bWHERE\b([\s\S]*)$/i.exec(s)?.[1];
  if (where === undefined) return null;
  const inList = new RegExp(`^\\s*"?${PK[table]}"?\\s+IN\\s*\\(([^)]*)\\)\\s*$`, "i").exec(where);
  if (inList !== null) {
    const n = (inList[1].match(/\?/g) ?? []).length;
    return { table, keys: args.slice(args.length - n).map(val) };
  }
  if (!new RegExp(`^\\s*"?${PK[table]}"?\\s*=\\s*\\?\\s*$`, "i").test(where)) return null;
  // Which `?` is the key's? Count the `?`s in the SET list that precede WHERE.
  const before = s.slice(0, s.search(/\bWHERE\b/i));
  const setMarks = (before.match(/\?/g) ?? []).length;
  return { table, keys: [val(args[setMarks])] };
}

/** The deck's real trigger targets for `cards`, from the serving deck. */
const TRIGGERS = { cards: ["deck_data_version"] };

// The engine asks the driver the same questions either way, and every
// occurrence of a key in the receipt is a statement the engine actually sent.
// So a key's occurrences collapse into runs: occurrence n+1 becomes a CACHE
// HIT under the narrowed rule exactly when no row-invalidating write sits
// between occurrence n and occurrence n+1. Counting those pairs is the exact
// statement reduction -- no memo replay, so no double application.
// The save segment is NOT all one transaction. BEGIN IMMEDIATE and COMMIT
// bracket the memo's lifetime (bunny-db.ts:320-323: the memo is created when
// BEGIN succeeds and dropped on every terminal path), and a statement outside
// that bracket is never memoized at all -- no change to the memo's RULES can
// ever absorb it. Statements after COMMIT are counted and reported separately
// so the lever is sized against statements the memo can actually hold.
const beginAt = seq.findIndex((q) => /^\s*BEGIN\b/i.test(q.sql));
const commitAt = seq.findIndex((q) => /^\s*COMMIT\b/i.test(q.sql));
const inTransaction = (i) => beginAt !== -1 && commitAt !== -1 && i > beginAt && i < commitAt;
const postCommit = (i) => commitAt !== -1 && i > commitAt;

const occurrence = new Map(); // key -> [index, ...]
const writes = [];            // { index, target, scope } for every write
const stmtInfo = [];
let inTx = 0;
let afterCommit = 0;

for (let i = 0; i < seq.length; i += 1) {
  const q = seq[i];
  let args = [];
  let argsReadable = true;
  try { args = JSON.parse(q.args === "" ? "[]" : q.args); } catch { args = []; argsReadable = false; }
  const sql = q.sql;
  if (inTransaction(i)) inTx += 1; else if (postCommit(i)) afterCommit += 1;
  if (isRead(sql)) {
    const scope = argsReadable ? readRowScope(sql, args) : null;
    const tables = tablesOf(sql);
    const key = `${sql}\u0000${JSON.stringify(args)}`;
    if (!occurrence.has(key)) occurrence.set(key, []);
    occurrence.get(key).push({ i, sql, scope, tables, memoizable: inTransaction(i) });
    stmtInfo.push({ i, kind: "read", sql, scope, tables, argsReadable });
    continue;
  }
  const t = writeTarget(sql);
  const scope = argsReadable ? writeRowScope(sql, args) : null;
  writes.push({ index: i, target: t, scope, sql: sql.slice(0, 90), argsReadable });
  stmtInfo.push({ i, kind: "write", sql, target: t, scope, argsReadable });
}

const absorbed = [];
const kept = [];
let outsideTransaction = 0;
for (const [, occs] of occurrence) {
  for (let n = 1; n < occs.length; n += 1) {
    const prev = occs[n - 1];
    const cur = occs[n];
    // Both ends must be inside the transaction for a memo to hold either one.
    if (!cur.memoizable || !prev.memoizable) { outsideTransaction += 1; continue; }
    // Under the narrowed rule, `prev`'s entry survives to `cur` unless a write
    // in between provably touched the row `prev` names -- or touched a table
    // `prev` depends on that the row argument cannot speak for.
    const between = writes.filter((w) => w.index > prev.i && w.index < cur.i && inTransaction(w.index));
    const drop = between.some((w) => {
      if (w.target === null) return true;              // unknown -> unsafe
      // A read whose tables could not be named is stored with dependsOn ===
      // null, and bunny-db.ts:746 drops that entry on EVERY write. An empty
      // table set here is that same case, not "unrelated to every table".
      if (cur.tables.size === 0) return true;
      const touchesTable = cur.tables.has(w.target) || (TRIGGERS[w.target] ?? []).some((x) => cur.tables.has(x));
      if (!touchesTable) return false;                  // unrelated table
      if (prev.scope === null) return true;             // read not provably keyed
      if (w.scope === null) return true;                // write not provably keyed
      if (w.scope.table !== prev.scope.table) return true;
      return w.scope.keys.includes(prev.scope.key);      // same row -> real invalidation
    });
    (drop ? kept : absorbed).push(cur);
  }
}

const repeated = absorbed.length + kept.length;

const pct = (n, d) => `${((100 * n) / d).toFixed(1)}%`;
console.log(`segment: ${NAME}`);
console.log(`  source commit              ${r.source}`);
console.log(`  bundle                     ${r.bundleSha256.slice(0, 12)}`);
console.log(`  recorded statements        ${seq.length}   (every one is a memo MISS by construction)`);
console.log(`  pipeline POSTs             ${r.segments[NAME].posts}`);
console.log(`  BEGIN IMMEDIATE at         ${beginAt}   COMMIT at ${commitAt}`);
console.log(`  statements inside the transaction  ${inTx}   (memoizable)`);
console.log(`  statements AFTER COMMIT           ${afterCommit}   (never memoized; no memo rule can touch them)`);
console.log(`  repeated (sql,args) pairs INSIDE the transaction   ${absorbed.length + kept.length}`);
console.log(`    absorbed by the row-scoped rule  ${absorbed.length}   -> ${pct(absorbed.length, seq.length)} of the segment's statements, ${pct(absorbed.length, r.segments[NAME].posts)} of its POSTs`);
console.log(`    kept (a write really touched those rows)  ${kept.length}`);
console.log(`  repeats discarded as outside the transaction  ${outsideTransaction}`);
const unprovableCards = writes.filter((w) => w.target === "cards" && !inTransaction(w.index));
console.log(`  cards writes outside the transaction (ignored): ${unprovableCards.length}`);
console.log("--- absorbed repeats by shape ---");
const byShape = new Map();
for (const a of absorbed) byShape.set(a.sql, (byShape.get(a.sql) ?? 0) + 1);
[...byShape.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
  .forEach(([k, v]) => console.log(`  ${String(v).padStart(4)}  ${k.slice(0, 92)}`));
if (process.argv[3] !== undefined) {
  const want = process.argv[3];
  console.log(`\n=== DEBUG shape: ${want} ===`);
  for (const [, occs] of occurrence) {
    if (occs[0].sql !== want) continue;
    const byArgs = new Map();
    for (const o of occs) {
      const k = JSON.stringify(o.scope);
      if (!byArgs.has(k)) byArgs.set(k, []);
      byArgs.get(k).push(o);
    }
    for (const [k, group] of byArgs) {
      if (group.length < 2) continue;
      console.log(`  scope=${k} occurrences at ${group.map((o) => o.i).join(",")}`);
      for (let n = 1; n < group.length; n += 1) {
        const between = writes.filter((w) => w.index > group[n - 1].i && w.index < group[n].i);
        console.log(`    ${group[n - 1].i} -> ${group[n].i}: ${between.length} writes between` +
          (between.length === 0 ? "  <-- NO WRITE, so today's memo should have HIT" : `  [${between.map((w) => `${w.index}:${w.target}`).join(" ")}]`));
      }
    }
  }
}

console.log("--- cards writes in this save (the rows a narrowed rule must respect) ---");
for (const w of writes) {
  if (w.table === "cards") console.log(`  ${String(w.index).padStart(3)}  ${w.scope === null ? "UNPROVABLE" : "row " + w.scope.keys.join(",")}  ${w.sql}`);
}
