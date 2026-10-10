// benchmarks/speed-ship/render-page.ts
// One page render in one fresh process, the way the edge handler boots and
// serves it (bunny-edge-engine-handler.ts bootDeck + the page arm of
// bunny-edge-engine-request.ts), against the LOCAL trial-deck mirror, with
// every driver call counted as one round trip (a query() is one round trip,
// a batch() is one round trip). Ported from the proof-of-concept harness
// (decko-poc-live-batch benchmarks/poc-live-batch/render-page.ts).
//
//   node benchmarks/speed-ship/bundle.mjs
//   node benchmarks/speed-ship/render-page.mjs --page About --mode baseline
//
// --mode baseline    the engine's normal uncached render (fresh process,
//                    fresh engine, every read goes to storage)
// --latency <ms>     injected per-round-trip delay (a spin: Windows timers
//                    round short sleeps up to ~15.6 ms steps)
// --db <path>        sqlite file (default: the trial-deck mirror copy)
// --out <file>       write the page HTML here
// --mode live        the edge request handler's own page path
//                    (handleEngineRequest, anonymous GET /<page>): the
//                    request-local live render. The deck boot runs first and
//                    is not counted; trips and wall are the request's.
// --fresh-check "<card>"  (live) a second request in the SAME process after
//                    appending a marker to <card> through a separate
//                    writable connection; reports both trip counts and
//                    whether each page carries the marker (the db must be a
//                    writable scratch copy; the content is restored)
// --name-scan        run the deck-wide name scan at boot (off by default,
//                    as on the edge; DECKO_EDGE_NAME_SCAN=1 there)

import { writeFileSync } from "node:fs";
import { NodeSqliteDriver } from "./node-sqlite-driver.js";
import type { SQLDatabaseDriver, SQLQueryResult, SQLStatement } from "../../src/server/driver.js";
import { bootEdgeServingEngines, refreshEdgeServingEngines } from "../../deploy/bunny-worker-src/bunny-edge-deck-boot.js";
import { applyServedEnvironmentDeltas } from "../../deploy/bunny-worker-src/bunny-edge-page-shell.js";
import { renderPageBytes } from "../../src/card/render/page.js";
import { handleEngineRequest } from "../../deploy/bunny-worker-src/bunny-edge-engine-request.js";
import { bootCacheIsEmpty } from "../../src/card/render/boot-cache.js";
import { DeckoName } from "../../src/card/name.js";
import { liveRenderPage } from "../../src/card/live/live-render.js";

const argv = process.argv.slice(2);
if (process.env.DECKO_LIVE_TRACE_STACK !== undefined) Error.stackTraceLimit = 60;
const arg = (k: string, d: string) => {
  const i = argv.indexOf(`--${k}`);
  return i === -1 || i === argv.length - 1 ? d : argv[i + 1];
};

const page = arg("page", "About");
const mode = arg("mode", "baseline");
const latency = Number(arg("latency", "0"));
const dbPath = arg("db", "benchmarks/one-trip-render/trial-deck-mirror-readonly-copy.sqlite3");
const out = arg("out", "");

// A precise blocking wait per hop: the render issues its round trips one at
// a time, so blocking the thread is the same wall cost as an awaited wait.
const spin = (ms: number) => {
  const end = performance.now() + ms;
  while (performance.now() < end) {
    /* spin */
  }
};

const counter = { rts: 0, stmts: 0, rows: 0, dbMs: 0, bytes: 0 };
const sizeOf = (r: SQLQueryResult) => { try { return JSON.stringify(r.rows).length; } catch { return 0; } };
const base = new NodeSqliteDriver(dbPath, true);
// --stmt-hist: count statements by shape (whitespace-normalized, first 140
// chars) with local execution time, and print the top 25 by time at exit.
const hist = argv.includes("--stmt-hist") ? new Map<string, { n: number; ms: number }>() : undefined;
const note = (sql: string, ms: number) => {
  if (hist === undefined) return;
  const k = sql.replace(/\s+/g, " ").replace(/\?(, ?\?)+/g, "?..").slice(0, 140);
  const e = hist.get(k) ?? { n: 0, ms: 0 };
  e.n += 1;
  e.ms += ms;
  hist.set(k, e);
};
process.on("exit", () => {
  if (hist === undefined) return;
  for (const [k, e] of [...hist].sort((a, b) => b[1].ms - a[1].ms).slice(0, 25)) {
    process.stdout.write(`STMT n=${e.n} ms=${e.ms.toFixed(0)} ${k}\n`);
  }
});
const counted: SQLDatabaseDriver = {
  async query<T>(sql: string, params: unknown[]): Promise<SQLQueryResult<T>> {
    counter.rts += 1;
    counter.stmts += 1;
    if (latency > 0) spin(latency);
    const t0 = performance.now();
    const r = await base.query<T>(sql, params);
    counter.dbMs += performance.now() - t0;
    note(sql, performance.now() - t0);
    counter.rows += r.rows.length;
    counter.bytes += sizeOf(r);
    return r;
  },
  async batch(stmts: SQLStatement[]): Promise<SQLQueryResult[]> {
    counter.rts += 1;
    counter.stmts += stmts.length;
    if (latency > 0) spin(latency);
    const t0 = performance.now();
    if (hist !== undefined) {
      for (const s of stmts) {
        const t = performance.now();
        await base.query(s.sql, s.params ?? []);
        note(s.sql, performance.now() - t);
      }
    }
    const r = await base.batch(stmts);
    counter.dbMs += performance.now() - t0;
    for (const x of r) {
      counter.rows += x.rows.length;
      counter.bytes += sizeOf(x);
    }
    return r;
  },
};

let outcome = "ok";
let html = "";
const extra: Record<string, unknown> = {};
// Warm the local SQLite file the same way for every mode, uncounted and
// untimed: a fresh process's first statement otherwise pays a cold-file cost
// a server-side database does not.
await base.query("SELECT id, codename, name, left_id, right_id FROM cards WHERE codename IS NOT NULL", []);
await base.query("SELECT COUNT(*) AS c FROM cards WHERE trash = 0", []);
let t0 = performance.now();
let cpu0 = process.cpuUsage();
try {
  if (mode === "baseline") {
    // --temp-cap N: the Temporary-cache key cap (default: Ruby's 10,000).
    // A tiny cap fires the within_key_counts reset on nearly every write.
    const cap = arg("temp-cap", "");
    // The edge handler's own serving boot (bootDeck): the deck-wide name
    // scan only with --name-scan (DECKO_EDGE_NAME_SCAN=1 on the edge).
    const { render } = await bootEdgeServingEngines(counted, {
      ...(cap === "" ? {} : { maxTemporaryCacheKeys: Number(cap) }),
      nameScan: argv.includes("--name-scan"),
    });
    html = applyServedEnvironmentDeltas(await renderPageBytes(render, page, undefined, {}));
  } else if (mode === "live-direct") {
    // Diagnostics: liveRenderPage itself (the handler's live arm without the
    // response wrapping), reporting each pass.
    const deck = await bootEdgeServingEngines(counted);
    counter.rts = 0;
    counter.stmts = 0;
    counter.rows = 0;
    counter.dbMs = 0;
    counter.bytes = 0;
    t0 = performance.now();
    cpu0 = process.cpuUsage();
    const r = await liveRenderPage(deck.fetcher.driver, page, (d) => bootEdgeServingEngines(d), {
      refreshDiscoveryEngine: refreshEdgeServingEngines,
    });
    const cpu1 = process.cpuUsage(cpu0);
    extra.process_cpu_ms = Math.round((cpu1.user + cpu1.system) / 1000);
    extra.pass_cpu_ms = r.passes.reduce((a, p) => a + p.cpu_ms, 0);
    extra.final_pass_ms = r.passes[r.passes.length - 1]?.cpu_ms;
    html = applyServedEnvironmentDeltas(r.html);
    extra.choice = r.choice;
    extra.passes = r.passes.map((p) => `${p.kind}:${p.cpu_ms}ms:${p.recorded}`).join(" ");
    extra.stats = r.stats;
  } else if (mode === "live") {
    const deck = await bootEdgeServingEngines(counted);
    const bootTrips = counter.rts;
    const request = async () => {
      const url = `https://edge.test/${encodeURIComponent(page.replace(/ /g, "_")).replace(/%2B/g, "+")}`;
      const response = await handleEngineRequest(new Request(url), deck, { anonymous: true });
      // 403 is a page's own status (a read-denied main card); the body is the page.
      if (response.status !== 200 && response.status !== 403) throw new Error(`status ${response.status}`);
      return await response.text();
    };
    counter.rts = 0;
    counter.stmts = 0;
    counter.rows = 0;
    counter.dbMs = 0;
    counter.bytes = 0;
    t0 = performance.now();
    cpu0 = process.cpuUsage();
    html = await request();
    const c1 = process.cpuUsage(cpu0);
    extra.first_cpu_ms = Math.round((c1.user + c1.system) / 1000);
    extra.first_db_bytes = counter.bytes;
    extra.boot_trips = bootTrips;
    extra.state_after = { boot_bundle_empty: bootCacheIsEmpty(), name_scope_closed: DeckoName.requestScopeIsClosed() };
    const freshCard = arg("fresh-check", "");
    if (freshCard) {
      const marker = `SHIP-FRESHNESS-MARKER-${Date.now()}`;
      const w = new NodeSqliteDriver(dbPath, false);
      const before = (await w.query<{ db_content: string }>("SELECT db_content FROM cards WHERE name = ? AND trash = 0", [freshCard])).rows[0]?.db_content;
      if (before === undefined) throw new Error(`fresh-check: no card named ${freshCard}`);
      const firstTrips = counter.rts;
      await w.query("UPDATE cards SET db_content = ? WHERE name = ? AND trash = 0", [`${before}${marker}`, freshCard]);
      let second = "";
      try {
        second = await request();
      } finally {
        await w.query("UPDATE cards SET db_content = ? WHERE name = ? AND trash = 0", [before, freshCard]);
        w.close();
      }
      extra.fresh_check = {
        card: freshCard,
        first_request_round_trips: firstTrips,
        second_request_round_trips: counter.rts - firstTrips,
        first_request_had_marker: html.includes(marker),
        second_request_has_marker: second.includes(marker),
        second_request_identical_otherwise: second.replace(marker, "").replace(/data-slot-id=(["'])[0-9a-f]+\1/g, "") === html.replace(/data-slot-id=(["'])[0-9a-f]+\1/g, ""),
      };
    }
  } else {
    throw new Error(`unknown mode ${mode}`);
  }
} catch (err) {
  outcome = `${(err as Error)?.name}: ${String((err as Error)?.message ?? err).slice(0, 300)}`;
}
const wallMs = performance.now() - t0;
const cpuUsed = process.cpuUsage(cpu0);
if (out) writeFileSync(out, html);
const report = {
  page,
  mode,
  outcome,
  html_bytes: html.length,
  round_trips_total: counter.rts,
  statements: counter.stmts,
  rows_returned: counter.rows,
  local_wall_ms: Math.round(wallMs),
  local_db_ms: Math.round(counter.dbMs),
  cpu_ms: Math.round((cpuUsed.user + cpuUsed.system) / 1000),
  db_bytes: counter.bytes,
  injected_latency_ms: latency,
  ...(Object.keys(extra).length > 0 ? { extra } : {}),
};
process.stdout.write(`SHIP-REPORT ${JSON.stringify(report)}\n`);
