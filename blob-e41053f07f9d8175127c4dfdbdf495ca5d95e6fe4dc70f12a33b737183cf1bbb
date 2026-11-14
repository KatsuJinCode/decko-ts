// benchmarks/cold-render/instrument-cold-render-point-query-callers.ts
// WHAT THIS IS: the call-site census for the point-query residue. The
// fetch-shape instrument answers "which STATEMENT shape" and "how many
// times"; this one answers "who ASKED", because the fix for a point query
// depends entirely on whether the asker is a loop that could be batched
// (fix: one multi-fetch seam) or a boot-time walk that could be
// precomputed once (fix: a cross-request cache, Ruby's Rule::Cache shape).
// Those are different changes in different files, and the census is what
// decides between them.
//
// HOW: the cold render, with the SQL DRIVER wrapped in a proxy. The proxy
// is driver-agnostic (it sees `query` and `batch`, which is the whole
// SQLDatabaseDriver surface), so the same instrument runs against the
// wire (BunnyDbDriver) and against a local mirror (LocalSqliteDriver) —
// and the local run is what makes the attribution affordable to iterate on.
//
// WHY A DRIVER PROXY AND NOT A SHADOWED `fetch`: the first version of this
// census shadowed globalThis.fetch and filtered stack frames on
// `/src/card/`, which attributed EVERY hop to "(no src/card frame)" —
// esbuild inlines the sources into the bundle, so no frame carries a source
// path. A driver proxy also removes the need to re-parse the Hrana request
// envelope: the SQL text arrives as a parameter.
//
// ATTRIBUTION: reported as the first stack frame (by esbuild-preserved
// function NAME, since paths are gone) that is not the statement's own
// issuing function and not driver plumbing. The reported name is the
// CONSUMER, i.e. the function whose batching or precompute seam is the
// lever. `all_frames` is kept in the report so an attribution that looks
// wrong can be checked rather than believed.
//
//   node tools/bundle-cold-render-point-query-callers.mjs
//   node benchmarks/cold-render/measure-point-query-callers.mjs --names Laundry --driver local
//   node benchmarks/cold-render/measure-point-query-callers.mjs --names Laundry,Home   # wire

import { readFileSync } from "node:fs";
import { BunnyDbDriver } from "../../src/card/drivers/bunny-db.js";
import { LocalSqliteDriver } from "../../src/server/drivers/local-sqlite.js";
import type { SQLDatabaseDriver, SQLQueryResult, SQLStatement } from "../../src/server/driver.js";
import { FetchEngine } from "../../src/card/fetch.js";
import { RenderEngine } from "../../src/card/render.js";

/** Only the statement shapes that carry a per-mark question — a single
 *  bound key, a single bound id, or a single (left,right) pair. These are
 *  the ones a batch or a cache can collapse. A statement with an IN-list
 *  is already batched, and a recursive CTE is a precompute, not a point
 *  query. */
function isPointQuery(sql: string): boolean {
  const s = sql.replace(/\s+/g, " ").trim();
  if (/^\s*(?:WITH|SELECT\s+\*\s+FROM\s+\(WITH)/i.test(s) && s.includes("RECURSIVE")) return false;
  if (/\bIN\s*\(\s*\?/i.test(s)) return false;
  const marks = (s.match(/\?/g) ?? []).length;
  return marks >= 1 && marks <= 2;
}

function shape(sql: string): string {
  return sql.replace(/\s+/g, " ").trim().slice(0, 160);
}

/** The statement's own issuing function, and driver/transport plumbing.
 *  A fix is made in one of these or in the CONSUMER above it, so they are
 *  skipped when picking the reported name. */
const PLUMBING_FN = new Set([
  "lexToId",
  "idToLex",
  "retrieveFromDb",
  "query",
  "batch",
  "fetchImpl",
  "recordOne",
  "postBatch",
  "lexToName",
  "nameToLex",
  "peekId",
  "peekLex",
  "id",
  "name",
  "composeName",
  "nextTick",
  "processTicksAndRejections",
  "async",
  "newPromise",
  "Object",
  "Module",
  "Function",
]);

function framesOf(stack: string | undefined, limit: number): string[] {
  if (!stack) return [];
  const out: string[] = [];
  for (const line of stack.split("\n").slice(1)) {
    const l = line.trim();
    if (!l.startsWith("at ")) continue;
    const m = l.match(/^at (?:new )?(?:async )?([A-Za-z_$][\w$]*)?\s*(?:\[as \w+\]\s*)?\(/);
    const name = m?.[1];
    if (!name) continue;
    out.push(name);
    if (out.length >= limit) break;
  }
  return out;
}

function readCreds(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

const argv = process.argv.slice(2);
const arg = (k: string, d: string) => {
  const i = argv.indexOf(`--${k}`);
  return i === -1 || i === argv.length - 1 ? d : argv[i + 1];
};

const useLocal = arg("driver", "wire") === "local";
const creds = readCreds(arg("creds", "C:/localProjects/brandonDojoTech/library/data/creds"));
const raw = creds.BUNNY_TRIAL_DB_URL;
const tok = creds.BUNNY_TRIAL_DB_RO_TOKEN ?? creds.BUNNY_TRIAL_DB_TOKEN;
if (!useLocal && (!raw || !tok)) {
  console.error("FATAL: trial DB url / read-only token missing from creds file");
  process.exit(2);
}
const url = (raw ?? "").replace(/^libsql:\/\//, "https://");

interface Cell {
  calls: number;
  ms: number;
  rows: number;
}
interface ShapeRow {
  shape: string;
  calls: number;
  distinct_params: number;
  ms_total: number;
  rows_total: number;
  /** Sampled distinct parameter tuples (up to 25) — the actual keys/ids/pairs
   *  asked, so the consumer seam behind a shape is identifiable without a
   *  second run. */
  param_samples?: string[];
  callers: { caller: string; calls: number; ms_total: number; mean_ms: number; example_frames: string[] }[];
}

const report: unknown[] = [];
const names = arg("names", "Laundry").split(",").map((s) => s.trim()).filter(Boolean);

for (const name of names) {
  const census = new Map<string, Map<string, Cell>>();
  const exampleFrames = new Map<string, string[]>();
  const distinctParams = new Map<string, Set<string>>();
  let statements = 0;
  let pointStatements = 0;
  let pointRows = 0;
  // db-roundtrip-elimination lane: the LAW counts ROUND TRIPS (pipeline
  // POSTs), not statements — one batch POST carrying 20 statements is one
  // database hit. query() is 1 POST; batch() is 1 POST.
  let roundTrips = 0;
  let queryCalls = 0;
  let batchCalls = 0;
  let roundTripMs = 0;

  const record = (sql: string, params: unknown[], rows: number, ms: number, stack: string | undefined) => {
    statements += 1;
    if (!isPointQuery(sql)) return;
    pointStatements += 1;
    pointRows += rows;
    const sh = shape(sql);
    let set = distinctParams.get(sh);
    if (!set) distinctParams.set(sh, (set = new Set()));
    set.add(JSON.stringify(params));
    const frames = framesOf(stack, 6);
    const who = frames.find((f) => !PLUMBING_FN.has(f)) ?? frames[0] ?? "(no named frame)";
    if (!exampleFrames.has(who)) exampleFrames.set(who, frames);
    let byCaller = census.get(sh);
    if (!byCaller) census.set(sh, (byCaller = new Map()));
    const cell = byCaller.get(who) ?? { calls: 0, ms: 0, rows: 0 };
    cell.calls += 1;
    cell.ms += ms;
    cell.rows += rows;
    byCaller.set(who, cell);
  };

  // The stack is captured at the DRIVER call, synchronously, before any
  // await — by the time a response lands the frames below are gone.
  const proxy: SQLDatabaseDriver = {
    async query<T>(sql: string, params: unknown[]): Promise<SQLQueryResult<T>> {
      const stack = new Error("point-query-caller").stack;
      roundTrips += 1;
      queryCalls += 1;
      const t0 = process.hrtime.bigint();
      const res = await base.query<T>(sql, params);
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      roundTripMs += ms;
      record(sql, params, res.rows.length, ms, stack);
      return res;
    },
    async batch(stmts: SQLStatement[]): Promise<SQLQueryResult[]> {
      const stack = new Error("point-query-caller").stack;
      roundTrips += 1;
      batchCalls += 1;
      const t0 = process.hrtime.bigint();
      const res = await base.batch(stmts);
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      roundTripMs += ms;
      for (let i = 0; i < stmts.length; i += 1) {
        const s = stmts[i] as { sql: string; params?: unknown[] };
        record(s.sql, s.params ?? [], res[i]?.rows.length ?? 0, ms, stack);
      }
      return res;
    },
  };

  const base: SQLDatabaseDriver = useLocal
    ? new LocalSqliteDriver({
        path: arg("db", "benchmarks/cold-render/trial-deck-mirror.sqlite3"),
        readonly: true,
      })
    : new BunnyDbDriver({ url, authToken: tok as string });

  const fetcher = new FetchEngine(proxy);
  const render = new RenderEngine(fetcher);
  const t0 = process.hrtime.bigint();
  let outcome = "ok";
  let htmlBytes = 0;
  try {
    htmlBytes = (await render.render(name, "open", {})).length;
  } catch (err) {
    outcome = `${(err as Error)?.name ?? "Error"}: ${String((err as Error)?.message ?? err).slice(0, 200)}`;
  }
  const wallMs = Number(process.hrtime.bigint() - t0) / 1e6;

  const shapes: ShapeRow[] = [...census.entries()]
    .map(([sh, byCaller]) => ({
      shape: sh,
      calls: [...byCaller.values()].reduce((a, c) => a + c.calls, 0),
      distinct_params: distinctParams.get(sh)?.size ?? 0,
      param_samples: [...(distinctParams.get(sh) ?? [])].slice(0, 25),
      ms_total: Math.round([...byCaller.values()].reduce((a, c) => a + c.ms, 0) * 10) / 10,
      rows_total: [...byCaller.values()].reduce((a, c) => a + c.rows, 0),
      callers: [...byCaller.entries()]
        .map(([who, c]) => ({
          caller: who,
          calls: c.calls,
          ms_total: Math.round(c.ms * 10) / 10,
          mean_ms: Math.round((c.ms / c.calls) * 10) / 10,
          example_frames: exampleFrames.get(who) ?? [],
        }))
        .sort((a, b) => b.ms_total - a.ms_total),
    }))
    .sort((a, b) => b.ms_total - a.ms_total);

  report.push({
    driver: useLocal ? "local-sqlite-mirror" : "bunny-wire",
    name,
    outcome,
    html_bytes: htmlBytes,
    wall_ms: Math.round(wallMs * 10) / 10,
    round_trips: roundTrips,
    query_calls: queryCalls,
    batch_calls: batchCalls,
    round_trip_ms_total: Math.round(roundTripMs * 10) / 10,
    statements_total: statements,
    point_query_statements: pointStatements,
    point_query_rows: pointRows,
    point_query_ms_total: Math.round(shapes.reduce((a, s) => a + s.ms_total, 0) * 10) / 10,
    point_query_shapes: shapes,
  });
}

const out = arg("out", "");
if (out) {
  const { writeFileSync } = await import("node:fs");
  writeFileSync(out, JSON.stringify({ reports: report }, null, 2));
  console.error(`wrote ${out}`);
}
console.log(JSON.stringify({ reports: report }, null, 2));
