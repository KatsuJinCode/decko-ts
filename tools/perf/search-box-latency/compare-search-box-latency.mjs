// compare-search-box-latency.mjs — a PAIRED A/B for the edge search JSON
// (`/*search/search_box_complete.json`), the navbar typeahead's per-keystroke
// request. Two bundles, two PROCESSES, one interleaved session.
//
// WHY THIS EXISTS ALONGSIDE measure-search-box-latency.mjs. Two separate
// before/after runs on this machine do not agree: the same 30 queries measured
// minutes apart, with other lanes' load on the box, moved the p50 by tens of
// milliseconds. A difference that size is indistinguishable from machine load,
// so a two-run before/after cannot carry a claim on its own.
//
// THIS tool removes the load term instead of arguing about it. Each arm runs
// in its own child process (run-one-search-box-latency-arm.mjs — one stack per
// process, because two stacks in one process alias each other: startStack
// writes DECKO_DB_URL into shared process.env, so the second stack's database
// steals the first engine's queries; that was MEASURED on this lane, and the
// numbers an in-process two-arm version produced were discarded). Both children
// are then driven round-robin: each term goes to one child, the reply is read,
// the NEXT term goes to the other. The children are concurrent for the whole
// run, so machine load is shared; alternating which child is served first
// cancels any systematic ordering bias.
//
// WHAT IS REPORTED. Per term: both arms' wall ms, their difference, and each
// arm's own SQL statement count and SQL ms from its OWN database ledger. Then
// both arms' p50/p95 over the same interleaved session, the paired-delta
// percentiles, and a byte-comparison of the two arms' response bodies.
//
// WHAT IT DOES NOT DO. It does not create a fresh isolate per request (that
// cold/warm split is measure-search-box-latency.mjs's job), and it asserts
// nothing about correctness — correctness is the byte comparison here plus the
// repo's own autocomplete parity suites.
//
// Usage:
//   node tools/perf/search-box-latency/compare-search-box-latency.mjs \
//     --before <before.bundle.js> --after <after.bundle.js> \
//     [--n 30] [--actor admin|anonymous] [--label <name>] [--bodies <file>]
//
// Credentials are read inside each arm process from the local creds file and
// never printed.

import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { DatabaseSync } from "node:sqlite";

const REPO = resolve(import.meta.dirname, "../../..");
const ARM = resolve(import.meta.dirname, "run-one-search-box-latency-arm.mjs");
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};

const DECK = resolve(arg("deck", join(REPO, "tmp/search-box-latency/deck.sqlite3")));
const CREDS = resolve(arg("creds", join(REPO, "tmp/search-box-latency/creds.json")));
const BEFORE = resolve(arg("before"));
const AFTER = resolve(arg("after"));
const N = Number(arg("n", "30"));
const ACTOR = arg("actor", "admin");
const LABEL = arg("label", `ab-${ACTOR}-n${N}`);
const OUT = resolve(arg("out", join(REPO, "tmp/search-box-latency", `${LABEL}.json`)));
const BODIES_OUT = arg("bodies", "") === "" ? null : resolve(arg("bodies"));
const COMPARE_BODIES = BODIES_OUT !== null;

function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
}

function summarize(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return {
    n: sorted.length, min: sorted[0], p50: percentile(sorted, 50), p95: percentile(sorted, 95),
    max: sorted[sorted.length - 1],
    mean: Math.round((sorted.reduce((a, b) => a + b, 0) / sorted.length) * 10) / 10,
  };
}

function prefixesFromDeck(deckPath, n) {
  const db = new DatabaseSync(deckPath, { readOnly: true });
  const names = db.prepare("SELECT name FROM cards WHERE name IS NOT NULL AND name <> '' ORDER BY name").all().map((r) => String(r.name));
  db.close();
  const terms = [];
  const seen = new Set();
  const add = (t) => { if (!t || seen.has(t)) return; seen.add(t); terms.push(t); };
  for (const k of ["202", "2026", "202609"]) add(k);
  const stride = Math.max(1, Math.floor(names.length / Math.max(1, n * 3)));
  for (let i = 0; i < names.length && terms.length < n; i += stride) {
    const name = names[i];
    for (const cut of [Math.min(6, name.length), Math.min(4, name.length), Math.min(3, name.length)]) {
      const t = name.slice(0, cut);
      if (t.length >= 2) { add(t); break; }
    }
  }
  while (terms.length < n && terms.length < names.length) add(names[terms.length]);
  return terms.slice(0, n);
}

/** One arm: a child process holding exactly one stack. `ask` writes a term and
 *  resolves with that arm's JSON reply line.
 *
 *  The child is respawned if it dies. This lane saw the before-arm process
 *  fail with Windows 0xC0000409 (STATUS_STACK_BUFFER_OVERRUN — a native
 *  fast-fail, not a JS exception, almost certainly better-sqlite3 or the
 *  WebAssembly heap under two concurrent local stacks) partway through a
 *  30-term run. A crashed arm must not silently become a missing sample: it is
 *  respawned, the term is re-asked, and the run records how many respawns it
 *  needed so a reader can see the session was disturbed. */
function startArm(name, bundle) {
  const arm = { name, bundle, child: undefined, waiting: [], respawns: 0, dead: false };

  const boot = () => {
    arm.child = spawn(process.execPath, [
      ARM, "--deck", DECK, "--creds", CREDS, "--bundle", bundle, "--actor", ACTOR,
    ], { cwd: REPO, stdio: ["pipe", "pipe", "inherit"] });
    const replies = createInterface({ input: arm.child.stdout });
    arm.readyPromise = new Promise((r) => { arm.readyResolve = r; });
    replies.on("line", (line) => {
      if (!line.trim()) return;
      const parsed = JSON.parse(line);
      if (parsed.ready === true) { arm.readyResolve(); return; }
      const next = arm.waiting.shift();
      if (next === undefined) return;
      next(parsed);
    });
    arm.child.on("exit", () => {
      arm.dead = true;
      const pending = arm.waiting.shift();
      if (pending !== undefined) pending({ __exit: true });
    });
    return arm.readyPromise;
  };

  arm.boot = boot;
  /** Ask one term, respawning and retrying once if the child died. A second
   *  death is reported rather than retried forever. */
  arm.ask = async (term) => {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (arm.dead) { arm.respawns += 1; arm.dead = false; await boot(); }
      const reply = await new Promise((r) => {
        arm.waiting.push(r);
        arm.child.stdin.write(`${COMPARE_BODIES ? "body:" : ""}${term}\n`);
      });
      if (reply.__exit !== undefined) {
        arm.respawns += 1;
        arm.dead = false;
        await boot();
        continue;
      }
      return reply;
    }
    throw new Error(`${name} arm died twice on term ${JSON.stringify(term)}`);
  };
  arm.stop = () => {
    try { arm.child.stdin.write("__quit__\n"); arm.child.stdin.end(); } catch { /* already gone */ }
  };
  return arm;
}

const terms = prefixesFromDeck(DECK, N);
console.log(`label=${LABEL} actor=${ACTOR} n=${terms.length} deck=${DECK}`);
console.log(`before bundle=${BEFORE} bytes=${readFileSync(BEFORE).length}`);
console.log(`after  bundle=${AFTER} bytes=${readFileSync(AFTER).length}`);
console.log(`terms=${JSON.stringify(terms)}`);

const before = startArm("before", BEFORE);
const after = startArm("after", AFTER);
await Promise.all([before.boot(), after.boot()]);
console.log(`both arms booted in separate processes: before pid=${before.child.pid} after pid=${after.child.pid}`);

const pairs = [];
try {
  for (let i = 0; i < terms.length; i++) {
    // Round-robin: even terms are answered by the before arm first, odd terms
    // by the after arm first.
    const order = i % 2 === 0 ? [before, after] : [after, before];
    const got = {};
    for (const arm of order) got[arm.name] = await arm.ask(terms[i]);
    const identical = got.before.body === got.after.body;
    pairs.push({
      index: i + 1, term: terms[i], identical,
      beforeMs: got.before.wallMs, afterMs: got.after.wallMs,
      deltaMs: got.after.wallMs - got.before.wallMs,
      beforeStmts: got.before.sqlStmts, afterStmts: got.after.sqlStmts,
      beforeSqlMs: got.before.sqlMs, afterSqlMs: got.after.sqlMs,
      beforeItems: got.before.items, afterItems: got.after.items,
      firstArm: order[0].name,
      ...(COMPARE_BODIES ? { beforeBody: got.before.body, afterBody: got.after.body } : {}),
    });
    console.log(
      `${String(got.before.wallMs).padStart(5)} -> ${String(got.after.wallMs).padStart(5)} ms  ` +
      `delta ${String(got.after.wallMs - got.before.wallMs).padStart(5)}  ` +
      `stmts ${String(got.before.sqlStmts).padStart(3)}->${String(got.after.sqlStmts).padStart(3)}  ` +
      `items ${String(got.before.items).padStart(3)}/${String(got.after.items).padStart(3)}  ` +
      `${identical ? "same" : "DIFFER"}  ${JSON.stringify(terms[i])}  ${order[0].name}-first`,
    );
  }
} finally {
  for (const arm of [before, after]) {
    arm.child.stdin.write("__quit__\n");
    arm.child.stdin.end();
  }
}

const armValues = (key) => pairs.map((p) => p[key]);
const differing = pairs.filter((p) => !p.identical);
const report = {
  label: LABEL, actor: ACTOR, n: terms.length, deck: DECK,
  beforeBundle: BEFORE, afterBundle: AFTER,
  method: "two child processes, one stack each, round-robin interleaved, alternating first arm",
  respawns: { before: before.respawns, after: after.respawns },
  terms,
  pairs: pairs.map(({ beforeBody, afterBody, ...rest }) => rest),
  parity: { compared: pairs.length, identical: pairs.length - differing.length, differing: differing.length, differingTerms: differing.map((p) => p.term) },
  summary: {
    before: { wallMs: summarize(armValues("beforeMs")), sqlStmts: summarize(armValues("beforeStmts")), sqlMs: summarize(armValues("beforeSqlMs")) },
    after: { wallMs: summarize(armValues("afterMs")), sqlStmts: summarize(armValues("afterStmts")), sqlMs: summarize(armValues("afterSqlMs")) },
    deltaMs: summarize(armValues("deltaMs")),
    afterFasterCount: pairs.filter((p) => p.deltaMs < 0).length,
    afterSlowerCount: pairs.filter((p) => p.deltaMs > 0).length,
    equalCount: pairs.filter((p) => p.deltaMs === 0).length,
  },
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(report, null, 2));
if (COMPARE_BODIES) {
  mkdirSync(dirname(BODIES_OUT), { recursive: true });
  writeFileSync(
    BODIES_OUT,
    ["before", "after"].map((name) =>
      pairs.map((p) => `### ${name} term=${JSON.stringify(p.term)} status=200\n${p[`${name}Body`]}`).join("\n"),
    ).join("\n"),
  );
  console.log(`bodies: ${BODIES_OUT}`);
}
const b = report.summary.before.wallMs;
const a = report.summary.after.wallMs;
console.log("");
console.log(`PAIRED (${LABEL}) — two processes, round-robin, n=${pairs.length}`);
console.log(`  wall ms   before p50=${b.p50} p95=${b.p95} max=${b.max}   after p50=${a.p50} p95=${a.p95} max=${a.max}`);
console.log(`            p50 ${(100 * (a.p50 - b.p50) / b.p50).toFixed(1)}%   p95 ${(100 * (a.p95 - b.p95) / b.p95).toFixed(1)}%`);
console.log(`  sql stmts before p50=${report.summary.before.sqlStmts.p50} p95=${report.summary.before.sqlStmts.p95}   after p50=${report.summary.after.sqlStmts.p50} p95=${report.summary.after.sqlStmts.p95}`);
console.log(`  sql ms    before p50=${report.summary.before.sqlMs.p50}   after p50=${report.summary.after.sqlMs.p50}`);
console.log(`  paired delta ms p50=${report.summary.deltaMs.p50} p95=${report.summary.deltaMs.p95} mean=${report.summary.deltaMs.mean}`);
console.log(`  after faster on ${report.summary.afterFasterCount}/${pairs.length}, slower on ${report.summary.afterSlowerCount}/${pairs.length}`);
console.log(`  response bodies identical on ${report.parity.identical}/${report.parity.compared} terms`);
console.log(`  arm process respawns during the run: before=${before.respawns} after=${after.respawns}`);
console.log(`report: ${OUT}`);
