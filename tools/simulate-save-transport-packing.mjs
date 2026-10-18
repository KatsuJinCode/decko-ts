// tools/simulate-save-transport-packing.mjs — HOW MANY ROUND TRIPS DOES THE
// OWNER SAVE REALLY NEED, PER TRANSPORT SHAPE?
//
// It answers one question with measured data instead of arithmetic: the save
// posts one statement at a time (691 POSTs for 758 statements on the capture
// this tool reads), so its cost on a remote host is round trips x round-trip
// cost. This tool replays the CAPTURED statement sequence — real SQL, real
// bound arguments, real per-statement results — and packs it under the
// constraints each transport shape actually has:
//
//   hrana  (libSQL/Turso over HTTP: src/server/drivers/libsql-http.ts)
//     batch() puts every statement in ONE POST body; inside transaction() the
//     batch runs on the save's open stream, so statements execute in order on
//     one connection and a later statement sees an earlier one's write. What a
//     batch cannot do is BRANCH: every request is sent blind and every result
//     comes back at the end, so a statement whose bound arguments come from an
//     earlier statement's result can never share that statement's batch.
//
//   d1  (Cloudflare D1 binding: src/server/drivers/d1.ts)
//     same "results at the end" rule, PLUS the one d1.ts:191-194 states in
//     its own words: "a batch cannot read its own writes and branch". A read
//     that would observe a write inside the same batch therefore cannot ride
//     with it; the only D1-legal packable unit is a run that does not depend
//     on its own writes.
//
// THE DEPENDENCY TEST IS VALUE-BASED, NOT SHAPE-BASED. A statement is a
// barrier only when one of its bound arguments is a value some earlier
// statement PRODUCED (a row cell, or a last_insert_rowid). The capture
// records both sides, so that is a fact about the run, not a guess about SQL
// shape. A write whose effect a later statement reads INSIDE its own SQL
// (INSERT ... VALUES ((SELECT MAX(id) ...)), SELECT last_insert_rowid()) is
// NOT a barrier: that value never crosses the wire, and an ordered batch
// computes it in place.
//
//   node tools/simulate-save-transport-packing.mjs \
//     --capture tmp/save-ladder-value-flow-20261018.json \
//     [--cap 100] [--out tmp/...json]
//
// Read-only on the engine: it consumes a capture and writes a receipt.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argOf = (name) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const CAPTURE = resolve(argOf("capture") ?? join(REPO, "tmp", "save-ladder-value-flow-20261018.json"));
const SEGMENT = argOf("segment") ?? "POST /update/Brandon_WilliamsCraig (the graded save)";
const OUT = resolve(argOf("out") ?? join(REPO, "tmp", `save-transport-packing-simulation-${Date.now()}.json`));
/** Statements per batch. The D1 and hrana docs publish no numeric cap on a
 *  batch's length, so this is a DESIGN parameter; the sweep below reports
 *  what each value costs. */
const CAPS = (argOf("caps") ?? "8,16,32,64,100,128,256,100000").split(",").map(Number);
const HOP_MS = [0.4, 5, 13, 20];

// --------------------------------------------------------------- the capture

const capture = JSON.parse(readFileSync(CAPTURE, "utf8"));
const segment = capture.segments[SEGMENT];
if (segment === undefined) throw new Error(`segment not in capture: ${SEGMENT}`);
if (segment.sequence.length !== segment.stmts) {
  throw new Error(`capture is truncated: ${segment.sequence.length} of ${segment.stmts} statements recorded`);
}

/** Hrana args are tagged values; integers and texts are what a later statement
 *  can bind back, so those two are the value space of the dependency test. */
function argValues(argsJson) {
  let parsed;
  try { parsed = JSON.parse(argsJson); } catch { return []; }
  const values = [];
  for (const arg of Array.isArray(parsed) ? parsed : []) {
    if (arg?.type === "integer") values.push(Number(arg.value));
    else if (arg?.type === "text") values.push(arg.value);
  }
  return values;
}

const isWrite = (sql) => /^\s*(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|REPLACE|PRAGMA|BEGIN|COMMIT|ROLLBACK|SAVEPOINT)\b/i.test(sql);
const isRead = (sql) => !isWrite(sql);
/** The tables a write statement touches — the whole-table name, so a read
 *  that NAMES one of them is a read that would observe that write. */
const writeTables = (sql) => {
  const tables = new Set();
  const insert = /^\s*INSERT\s+INTO\s+"?([A-Za-z_][A-Za-z0-9_]*)"?/i.exec(sql);
  if (insert !== null) tables.add(insert[1]);
  const update = /^\s*UPDATE\s+(?:OR\s+\w+\s+)?"?([A-Za-z_][A-Za-z0-9_]*)"?/i.exec(sql);
  if (update !== null) tables.add(update[1]);
  const del = /^\s*DELETE\s+FROM\s+"?([A-Za-z_][A-Za-z0-9_]*)"?/i.exec(sql);
  if (del !== null) tables.add(del[1]);
  return tables;
};
/** Tables a read names anywhere in its text. Conservative: a false positive
 *  only makes the D1 rule stricter, never laxer. */
const readTables = (sql) => {
  const tables = new Set();
  for (const m of sql.matchAll(/\b(?:FROM|JOIN|INTO|UPDATE)\s+"?([A-Za-z_][A-Za-z0-9_]*)"?/gi)) tables.add(m[1]);
  return tables;
};

const statements = segment.sequence.map((s, at) => {
  const write = isWrite(s.sql);
  // hrana returns last_insert_rowid as the CONNECTION's current rowid after
  // the statement (measured: it comes back on reads and updates too), so only
  // an INSERT actually produces a new value through it. Counting the echo
  // would make every statement look like a producer of the last few rowids
  // and every statement a barrier.
  const produced = (Array.isArray(s.produced) ? s.produced : [])
    .filter((value) => !(value === s.lastInsertRowId && !/^\s*INSERT\b/i.test(s.sql)));
  return {
    at,
    sql: s.sql,
    args: argValues(s.args),
    produced,
    write,
    tables: writeTables(s.sql),
    bytes: Buffer.byteLength(`${s.sql}${s.args}`, "utf8"),
  };
});

// ------------------------------------------------------- the value dependency

/** value -> the statement indices that produced it, ascending. */
const producersOf = new Map();
statements.forEach((s) => {
  for (const value of s.produced) {
    const list = producersOf.get(value);
    if (list === undefined) producersOf.set(value, [s.at]);
    else list.push(s.at);
  }
});

/** The nearest EARLIER statement whose result a statement's own SQL observed
 *  (its read-back subquery, or last_insert_rowid()). Not a wire dependency —
 *  an ordered batch computes it in place — but recorded because it is what a
 *  D1 batch cannot do at all: see the d1 rule below. */
const selfObserving = statements.map((s) => /last_insert_rowid\s*\(\s*\)|\(\s*SELECT\s+MAX\s*\(/i.test(s.sql));

/** For each statement: the nearest earlier statement that PRODUCED one of its
 *  bound arguments. That statement must be in a strictly earlier batch. */
const wireBarrierOf = statements.map((s) => {
  let barrier = null;
  for (const value of s.args) {
    const list = producersOf.get(value);
    if (list === undefined) continue;
    for (let i = list.length - 1; i >= 0; i -= 1) {
      if (list[i] < s.at) { if (barrier === null || list[i] > barrier) barrier = list[i]; break; }
    }
  }
  return barrier;
});

const barrierStats = statements.map((s, i) => ({
  at: i,
  kind: wireBarrierOf[i] === null ? "free" : statements[wireBarrierOf[i]].write ? "write-result" : "read-result",
  sql: s.sql.slice(0, 110),
  args: JSON.stringify(s.args.slice(0, 4)).slice(0, 80),
  bound: wireBarrierOf[i] === null ? null : s.args.find((v) => (producersOf.get(v) ?? []).some((p) => p === wireBarrierOf[i])) ?? null,
}));

/** What a read-result barrier actually binds. A barrier on a value the engine
 *  could have known without asking (a hot id it re-reads all save long, a key
 *  it already held) is an UPPER bound on the real dependency count: the value
 *  merely also appeared in an earlier row. Counting the values says how much
 *  of the barrier set is hot-id re-reads versus genuinely discovered ids. */
const barrierValueHistogram = new Map();
for (const b of barrierStats) {
  if (b.kind !== "read-result") continue;
  const key = JSON.stringify(b.bound);
  barrierValueHistogram.set(key, (barrierValueHistogram.get(key) ?? 0) + 1);
}
const barrierValues = [...barrierValueHistogram.entries()].sort((a, b) => b[1] - a[1]);
/** The distinct (sql, args) floor: the count the time-budget report called a
 *  "perfect memo", computed here over the same capture. */
const distinctPairs = new Set(statements.filter((s) => !s.write).map((s) => `${s.sql}\u0000${JSON.stringify(s.args)}`)).size;

// ------------------------------------------------------------------- packing

/** Greedy in-order packing. A batch is closed before statement i when
 *   - it already holds `cap` statements or `byteCap` bytes, or
 *   - statement i binds a value produced inside the open batch (wireBarrier),
 *   - (D1 only) statement i is a read that would observe a write already in
 *     the open batch, or statement i reads a table a write in the open batch
 *     touched, or statement i is inside a write's own write-back.
 */
function pack(list, { cap, byteCap, shape, barrierOf }) {
  const batches = [];
  let open = [];
  let openBytes = 0;
  let openWrittenTables = new Set();
  let openHasWrite = false;
  for (const s of list) {
    const wireBar = barrierOf(s);
    let mustBreak = open.length === 0 || open.length >= cap || openBytes + s.bytes > byteCap;
    if (!mustBreak && wireBar !== null && open.some((o) => o.at === wireBar)) mustBreak = true;
    if (!mustBreak && shape === "d1") {
      // "a batch cannot read its own writes and branch" (d1.ts:191-194).
      const readsOwnWrite = openHasWrite && !s.write;
      const touchesTableWrittenHere = [...s.tables].some((t) => openWrittenTables.has(t));
      const writesOwnWrite = s.write && selfObserving[s.at] && openHasWrite;
      if (readsOwnWrite || touchesTableWrittenHere || writesOwnWrite) mustBreak = true;
    }
    if (mustBreak) {
      if (open.length > 0) batches.push({ statements: open, bytes: openBytes, wrote: openHasWrite });
      open = [];
      openBytes = 0;
      openWrittenTables = new Set();
      openHasWrite = false;
    }
    open.push(s);
    openBytes += s.bytes;
    if (s.write) { openHasWrite = true; s.tables.forEach((t) => openWrittenTables.add(t)); }
  }
  if (open.length > 0) batches.push({ statements: open, bytes: openBytes, wrote: openHasWrite });
  return batches;
}
const barrierByAt = (s) => wireBarrierOf[s.at];

// -------------------------------------------------- the read memo (continuity
// with the time-budget report's table): a repeat of an identical (sql,args)
// read whose answer cannot have changed, answered from the transaction's own
// memo instead of the wire.

function memoized(ladder) {
  const dropped = new Set();
  const seen = new Map(); // key -> the first execution of this (sql, args)
  for (const s of ladder) {
    if (s.write) continue;
    const key = `${s.sql}\u0000${JSON.stringify(s.args)}`;
    const first = seen.get(key);
    if (first === undefined) seen.set(key, s.at);
    else if (!readTouchesWriteSince(ladder, first, s.at)) dropped.add(s.at);
  }
  return dropped;
}

/** ROW-scoped invalidation: a repeat answer dies only when an intervening
 *  write names a row this read answered for — a write whose bound integers
 *  intersect the values the read PRODUCED (the row it returned) or the values
 *  it BOUND (the row it looked up). Table-scoped invalidation (memoized())
 *  throws away every repeat after ANY write to a named table, which is what
 *  makes it drop so little in a save that writes constantly; the two rules
 *  are the same rule at two granularities, and the measured difference is the
 *  size of the lever the transport design can pull. */
function memoizedRowScoped(ladder) {
  const dropped = new Set();
  const seen = new Map();
  for (const s of ladder) {
    if (s.write) continue;
    const key = `${s.sql}\u0000${JSON.stringify(s.args)}`;
    const first = seen.get(key);
    if (first === undefined) { seen.set(key, s.at); continue; }
    const answered = new Set([...s.produced, ...s.args]);
    let invalidated = false;
    for (let i = first + 1; i < s.at && !invalidated; i += 1) {
      const w = ladder[i];
      if (!w.write) continue;
      if (w.args.some((a) => answered.has(a))) invalidated = true;
    }
    if (invalidated) seen.set(key, s.at);
    else dropped.add(s.at);
  }
  return dropped;
}
/** No write between `from` and `to` named a table this read names — the only
 *  way a repeat answer could differ. */
function readTouchesWriteSince(ladder, from, to) {
  const named = readTables(ladder[to].sql);
  for (let i = from + 1; i <= to; i += 1) {
    const w = ladder[i];
    if (!w.write) continue;
    for (const t of w.tables) if (named.has(t)) return true;
  }
  return false;
}

/** A ladder with a memo applied: the dropped statements never go on the wire,
 *  and the producer index is rebuilt from the executions that remain (a memo
 *  answers from the first execution's result, so that is the value flow). */
function buildReduced(dropped) {
  const list = statements.filter((s) => !dropped.has(s.at));
  const producedBy = new Map();
  list.forEach((s) => {
    for (const value of s.produced) {
      const seen = producedBy.get(value);
      if (seen === undefined) producedBy.set(value, [s.at]);
      else seen.push(s.at);
    }
  });
  const index = new Map(list.map((s, i) => [s.at, i]));
  const barrierOf = (s) => {
    const i = index.get(s.at);
    if (i === undefined) return null;
    let barrier = null;
    for (const value of s.args) {
      const list2 = producedBy.get(value);
      if (list2 === undefined) continue;
      for (let k = list2.length - 1; k >= 0; k -= 1) {
        if (list2[k] < s.at) { if (barrier === null || list2[k] > barrier) barrier = list2[k]; break; }
      }
    }
    return barrier;
  };
  return { list, barrierOf };
}

const memoDropped = memoized(statements);
const rowScopedDropped = memoizedRowScoped(statements);
const reduced = buildReduced(memoDropped);
const rowScoped = buildReduced(rowScopedDropped);

// ------------------------------------------------------------------- report

const BYTE_CAP = 512 * 1024;
function summarise(batches, ladderSize, execMs) {
  const rounds = batches.length;
  const sizes = batches.map((b) => b.statements.length).sort((a, b) => a - b);
  return {
    statements: ladderSize,
    round_trips: rounds,
    max_batch_statements: sizes[sizes.length - 1] ?? 0,
    median_batch_statements: sizes[Math.floor(sizes.length / 2)] ?? 0,
    max_batch_bytes: batches.reduce((n, b) => Math.max(n, b.bytes), 0),
    projected_wall_ms: Object.fromEntries(HOP_MS.map((hop) => [hop, Math.round(rounds * hop + execMs)])),
  };
}

const execMs = segment.stmtWallMs;
const rows = [];
for (const cap of CAPS) {
  for (const shape of ["hrana", "d1"]) {
    rows.push({
      option: shape === "hrana" ? `hrana batch, cap ${cap}` : `d1 batch, cap ${cap}`,
      shape, cap,
      ...summarise(pack(statements, { cap, byteCap: BYTE_CAP, shape, barrierOf: barrierByAt }), statements.length, execMs),
    });
  }
}

const receipt = {
  capture: {
    file: CAPTURE,
    sha256: createHash("sha256").update(readFileSync(CAPTURE)).digest("hex"),
    source_commit: capture.source,
    bundle_sha256: capture.bundleSha256,
    capture_results: capture.captureResults === true,
    segment: SEGMENT,
    posts_measured: segment.posts,
    statements: segment.stmts,
    stmt_exec_wall_ms: execMs,
    db_wall_ms: segment.dbWallMs,
  },
  model: {
    hop_ms: HOP_MS,
    byte_cap: BYTE_CAP,
    caps: CAPS,
    note: "round_trips counts batches; projected_wall_ms = round_trips x hop_ms + measured statement exec wall",
  },
  baseline: { posts: segment.posts, statements: segment.stmts },
  wire_barriers: {
    total: wireBarrierOf.filter((b) => b !== null).length,
    from_write: barrierStats.filter((b) => b.kind === "write-result").length,
    from_read: barrierStats.filter((b) => b.kind === "read-result").length,
    from_self_observing_sql: selfObserving.filter(Boolean).length,
    bound_values_top: barrierValues.slice(0, 15).map(([value, count]) => ({ value, count })),
    distinct_pairs_floor: distinctPairs,
    detail: barrierStats.filter((b) => b.kind !== "free"),
  },
  memo: {
    table_scoped: {
      dropped: memoDropped.size,
      remaining: reduced.list.length,
      at_cap_32: {
        hrana: summarise(pack(reduced.list, { cap: 32, byteCap: BYTE_CAP, shape: "hrana", barrierOf: reduced.barrierOf }), reduced.list.length, execMs),
        d1: summarise(pack(reduced.list, { cap: 32, byteCap: BYTE_CAP, shape: "d1", barrierOf: reduced.barrierOf }), reduced.list.length, execMs),
      },
    },
    row_scoped: {
      dropped: rowScopedDropped.size,
      remaining: rowScoped.list.length,
      at_cap_32: {
        hrana: summarise(pack(rowScoped.list, { cap: 32, byteCap: BYTE_CAP, shape: "hrana", barrierOf: rowScoped.barrierOf }), rowScoped.list.length, execMs),
        d1: summarise(pack(rowScoped.list, { cap: 32, byteCap: BYTE_CAP, shape: "d1", barrierOf: rowScoped.barrierOf }), rowScoped.list.length, execMs),
      },
    },
    distinct_pairs_floor: distinctPairs,
  },
  options: rows,
  longest_packed_runs: {
    "hrana@100": pack(statements, { cap: 100, byteCap: BYTE_CAP, shape: "hrana", barrierOf: barrierByAt }).map((b) => b.statements.length).sort((a, b) => b - a).slice(0, 5),
    "d1@100": pack(statements, { cap: 100, byteCap: BYTE_CAP, shape: "d1", barrierOf: barrierByAt }).map((b) => b.statements.length).sort((a, b) => b - a).slice(0, 5),
  },
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(receipt, null, 2) + "\n");

// ------------------------------------------------------------------- console

console.log(`capture: ${CAPTURE}`);
console.log(`  source ${capture.source.slice(0, 8)}  bundle ${capture.bundleSha256.slice(0, 16)}  results captured: ${capture.captureResults === true}`);
console.log(`  ${SEGMENT}: ${segment.posts} POSTs, ${segment.stmts} statements, stmt-exec wall ${execMs} ms`);
const captured = statements.filter((s) => s.produced.length > 0).length;
console.log(`  value-flow evidence: ${captured} statements carry a produced value; ${statements.filter((s) => s.produced.length === 0 && !s.write).length} reads returned nothing scalar`);
console.log(`  wire barriers: ${receipt.wire_barriers.total} (${receipt.wire_barriers.from_write} from a write result, ${receipt.wire_barriers.from_read} from a read result)`);
console.log(`  what the read barriers bind: ${barrierValues.slice(0, 8).map(([v, n]) => `${v}:${n}`).join("  ")}`);
console.log(`  distinct (sql,args) read floor: ${distinctPairs}`);
console.log(`  SQL-internal write-backs (no wire dependency): ${receipt.wire_barriers.from_self_observing_sql}`);
console.log(`  transaction-scoped read memo: table-scoped drops ${memoDropped.size} (${reduced.list.length} remain), row-scoped drops ${rowScopedDropped.size} (${rowScoped.list.length} remain)\n`);
console.log("option                 stmts  round trips  max batch  median   wall@0.4ms  wall@5ms  wall@13ms  wall@20ms");
for (const r of rows) {
  console.log(
    `${r.option.padEnd(22)}${String(r.statements).padStart(5)}${String(r.round_trips).padStart(13)}${String(r.max_batch_statements).padStart(11)}${String(r.median_batch_statements).padStart(8)}` +
      `${String(r.projected_wall_ms[0.4]).padStart(12)}${String(r.projected_wall_ms[5]).padStart(10)}${String(r.projected_wall_ms[13]).padStart(11)}${String(r.projected_wall_ms[20]).padStart(11)}`,
  );
}
console.log(`\nbaseline today: ${segment.posts} round trips -> ${HOP_MS.map((h) => `${h}ms:${Math.round(segment.posts * h + execMs)}ms`).join("  ")}`);
console.log(`\nreceipt: ${OUT}`);