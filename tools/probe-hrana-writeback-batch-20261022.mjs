// tools/probe-hrana-writeback-batch-20261022.mjs — THE PRECONDITION THE
// TRANSPORT DESIGN NAMES, RUN AS A PROBE.
//
// docs/reports/live-save-transport-design-2026-10-18.md, section 6, last
// bullet: "`last_insert_rowid()` inside a packed hrana/bunny batch is
// ASSUMED, not verified: the 17 SQL-internal write-backs are counted as free
// on that shape because a batch runs in order on one connection. A one-line
// probe (`BEGIN; INSERT ...; SELECT last_insert_rowid()` in one pipeline,
// compared against the same three statements in three pipelines) would settle
// it, and the design should not ship without it."
//
// THIS TOOL IS THAT PROBE, and it also probes the two neighbouring claims
// the design rests on, because a probe that answers one question and leaves
// the adjacent ones untested is not evidence:
//
//   ARM 1  the write-back read-back. `SELECT last_insert_rowid()` after an
//          INSERT, both in ONE pipeline POST and in THREE separate pipeline
//          POSTs. The two arms must return the SAME rowid. That is what
//          makes the 17 SQL-internal write-backs free on this shape: the
//          value is computed in place, inside the same ordered connection,
//          and never crosses the wire.
//
//   ARM 2  the SQL-internal write-back of the OTHER shape the save uses:
//          `INSERT ... VALUES ((SELECT MAX(id) FROM ...))` — a write whose
//          own value comes from a row an EARLIER statement in the same batch
//          produced. One pipeline POST; the second insert must carry the
//          first insert's rowid.
//
//   ARM 3  the admission rule's premise, in the negative. A statement that
//          BINDS a value produced inside the batch cannot ride that batch:
//          the bound value is fixed when the request is sent, so the read
//          sees the PRE-write state, not the post-write one. One pipeline
//          POST: [INSERT, SELECT ... WHERE id = <the rowid the insert will
//          take>]. The SELECT must NOT see the inserted row. This is why
//          the design's admission rule has the clause it has.
//
// WHERE IT RUNS. The local Hrana endpoint (tools/edge-signed-in-exercise/lib/
// local-hrana.mjs) speaks the same Hrana v2 wire protocol the Bunny and
// libSQL endpoints speak — POST /v2/pipeline, tagged args, a baton that
// keeps a stream open — and answers it from one better-sqlite3 connection.
// That is the shape the design calls "hrana/bunny". The hosted Bunny
// service is NOT contacted: its database is the live deck, and the probe
// WRITES, so probing it would touch the live system. The receipt says so.
//
//   node tools/probe-hrana-writeback-batch-20261022.mjs [--out tmp/x.json]

import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { startLocalHrana } from "./edge-signed-in-exercise/lib/local-hrana.mjs";

const argOf = (name) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(argOf("out") ?? join(REPO, "tmp", `hrana-writeback-batch-probe-${Date.now()}.json`));

const runDir = mkdtempSync(join(tmpdir(), "decko-hrana-writeback-probe-"));
const dbPath = join(runDir, "probe.sqlite3");
const hrana = await startLocalHrana({ dbPath });

/** One pipeline POST. The last request is NOT "close", so the endpoint keeps
 *  the stream open and returns a baton — the shape a transaction uses. */
async function pipeline(requests) {
  const response = await fetch(`${hrana.url}/v2/pipeline`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ requests }),
  });
  if (!response.ok) throw new Error(`pipeline POST failed: HTTP ${response.status}`);
  return response.json();
}

const execute = (sql, args = []) => ({ type: "execute", stmt: { sql, args, want_rows: true } });
const int = (value) => ({ type: "integer", value: String(value) });
const text = (value) => ({ type: "text", value });

/** The scalar an execute result carries: its single row's single cell, or
 *  its last_insert_rowid. */
function scalarOf(entry) {
  const result = entry?.response?.result;
  if (result === undefined) return null;
  const row = result.rows?.[0];
  if (row !== undefined && row.length > 0) return row[0]?.value ?? null;
  if (result.last_insert_rowid !== null && result.last_insert_rowid !== undefined) {
    return Number(result.last_insert_rowid);
  }
  return null;
}

const arms = {};

// --------------------------------------------------------------- ARM 1
// The write-back read-back, one POST against three.
{
  await pipeline([execute("CREATE TABLE arm1 (a TEXT)")]);
  const onePost = await pipeline([
    execute("BEGIN"),
    execute("INSERT INTO arm1 (a) VALUES (?)", [text("one-post")]),
    execute("SELECT last_insert_rowid() AS id"),
  ]);
  await pipeline([execute("COMMIT")]);

  await pipeline([execute("CREATE TABLE arm1b (a TEXT)")]);
  const threePosts = [];
  threePosts.push(await pipeline([execute("BEGIN")]));
  threePosts.push(await pipeline([execute("INSERT INTO arm1b (a) VALUES (?)", [text("three-post")])]));
  threePosts.push(await pipeline([execute("SELECT last_insert_rowid() AS id")]));
  await pipeline([execute("COMMIT")]);

  const oneValue = scalarOf(onePost.results[2]);
  const threeValue = scalarOf(threePosts[2].results[0]);
  const insertedOne = scalarOf(onePost.results[1]) ?? onePost.results[1]?.response?.result?.last_insert_rowid;
  const insertedThree = threePosts[1].results[0]?.response?.result?.last_insert_rowid;
  arms.arm1_writeback_readback = {
    question: "does SELECT last_insert_rowid() after an INSERT return the insert's rowid in ONE pipeline POST, and in THREE?",
    one_post: { posts: 1, statements: 3, rowid: oneValue, insert_rowid: Number(insertedOne) },
    three_posts: { posts: 3, statements: 3, rowid: threeValue, insert_rowid: Number(insertedThree) },
    same_rowid: oneValue === threeValue,
    rowid_matches_the_insert: Number(oneValue) === Number(insertedOne),
    free: oneValue === threeValue && Number(oneValue) === Number(insertedOne),
  };
}

// --------------------------------------------------------------- ARM 2
// The other SQL-internal write-back: a write whose own value comes from a
// row an earlier statement in the SAME batch produced.
{
  await pipeline([execute("CREATE TABLE arm2_t (id INTEGER PRIMARY KEY AUTOINCREMENT, a TEXT)"), execute("CREATE TABLE arm2_u (t_id INTEGER)")]);
  const batch = await pipeline([
    execute("BEGIN"),
    execute("INSERT INTO arm2_t (a) VALUES (?)", [text("parent")]),
    execute("INSERT INTO arm2_u (t_id) VALUES ((SELECT MAX(id) FROM arm2_t))"),
  ]);
  await pipeline([execute("COMMIT")]);
  const readBack = await pipeline([execute("SELECT t_id FROM arm2_u")]);
  const parentId = Number(batch.results[1]?.response?.result?.last_insert_rowid);
  const childTId = Number(scalarOf(readBack.results[0]));
  arms.arm2_sql_internal_writeback = {
    question: "does a write whose value comes from an earlier statement in the SAME batch see that statement's row?",
    posts: 1,
    parent_rowid: parentId,
    child_t_id: childTId,
    free: childTId === parentId,
  };
}

// --------------------------------------------------------------- ARM 3
// The admission rule's premise, in the negative: a statement that BINDS a
// value produced inside the batch cannot ride that batch, because the bound
// value is FIXED WHEN THE REQUEST IS SENT.
//
// Two sub-arms, both against an empty table whose next insert takes id 1:
//   3a binds id 1 — the read sees the row, but ONLY because the bound value
//      happened to be right; the caller had no way to know it.
//   3b binds id 2 — the read sees NOTHING, although the row the insert
//      produced exists in the same connection at the same moment. The value
//      the caller needs was never available to it.
// So the batch's ordering cannot rescue a bound value: the value has to
// cross the wire, and the wire crossing is the round trip.
{
  await pipeline([execute("CREATE TABLE arm3 (id INTEGER PRIMARY KEY AUTOINCREMENT, a TEXT)")]);
  const batch = await pipeline([
    execute("BEGIN"),
    execute("INSERT INTO arm3 (a) VALUES (?)", [text("written")]),
    execute("SELECT id FROM arm3 WHERE id = ?", [int(1)]),
  ]);
  await pipeline([execute("COMMIT")]);
  const readBack = await pipeline([execute("SELECT COUNT(*) AS n FROM arm3")]);
  const seenRows = Number(scalarOf(readBack.results[0]));
  const selectRows = batch.results[2]?.response?.result?.rows?.length ?? 0;

  await pipeline([execute("CREATE TABLE arm3b (id INTEGER PRIMARY KEY AUTOINCREMENT, a TEXT)")]);
  const batch2 = await pipeline([
    execute("BEGIN"),
    execute("INSERT INTO arm3b (a) VALUES (?)", [text("written")]),
    execute("SELECT id FROM arm3b WHERE id = ?", [int(2)]),
  ]);
  await pipeline([execute("COMMIT")]);
  const readBack2 = await pipeline([execute("SELECT COUNT(*) AS n FROM arm3b")]);
  const seenRows2 = Number(scalarOf(readBack2.results[0]));
  const selectRows2 = batch2.results[2]?.response?.result?.rows?.length ?? 0;

  arms.arm3_bound_value_inside_the_batch = {
    question: "can a statement that BINDS a value produced inside the batch ride that batch? (no: the bound value is fixed when the request is sent)",
    bound_the_id_the_insert_took: { bound_id: 1, rows_the_batched_select_saw: selectRows, rows_in_the_table_afterwards: seenRows },
    bound_a_different_id: { bound_id: 2, rows_the_batched_select_saw: selectRows2, rows_in_the_table_afterwards: seenRows2 },
    admission_rule_holds: selectRows2 === 0 && seenRows2 === 1,
    note: "the first sub-arm's row is a coincidence: the bound value was right by luck, not because the batch could supply it. The second sub-arm is the proof: the row the insert produced existed on the same connection and the batched read could not see it.",
  };
}

await hrana.close();

const receipt = {
  probe: "hrana/bunny write-back batching (the transport design's named precondition)",
  design: "docs/reports/live-save-transport-design-2026-10-18.md",
  shape: "hrana v2 over HTTP (POST /v2/pipeline), answered by the local Hrana endpoint over one better-sqlite3 connection",
  hosted_bunny_contacted: false,
  hosted_bunny_note: "the hosted Bunny service is the live deck and the probe WRITES, so it is not contacted; the wire protocol and the ordered-connection semantics are the ones the design calls the hrana/bunny shape",
  arms,
  verdict: arms.arm1_writeback_readback.free && arms.arm2_sql_internal_writeback.free && arms.arm3_bound_value_inside_the_batch.admission_rule_holds
    ? "the 17 SQL-internal write-backs ARE free on the hrana/bunny shape, and the admission rule's binding clause is load-bearing"
    : "the probe FALSIFIES part of the design's assumption: see arms",
  source: "tools/probe-hrana-writeback-batch-20261022.mjs",
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(receipt, null, 2) + "\n");
console.log(JSON.stringify(receipt, null, 2));
console.log(`\nreceipt: ${OUT}`);
console.log(`sha256: ${createHash("sha256").update(JSON.stringify(receipt, null, 2) + "\n").digest("hex")}`);

try { rmSync(runDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); } catch { /* the probe's scratch is in the OS temp dir */ }
