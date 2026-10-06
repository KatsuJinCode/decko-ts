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
// --no-name-scan     skip installDeckNameEnvironment (the edge boot's
//                    deck-wide name scan)

import { writeFileSync } from "node:fs";
import { NodeSqliteDriver } from "./node-sqlite-driver.js";
import type { SQLDatabaseDriver, SQLQueryResult, SQLStatement } from "../../src/server/driver.js";
import { bootCorpusDeckEngines } from "../../deploy/bunny-worker-src/bunny-edge-deck-boot.js";
import { installDeckNameEnvironment } from "../../src/server/worker-shared-surface.js";
import { SPACES_ASSET_HOST, applyServedEnvironmentDeltas } from "../../deploy/bunny-worker-src/bunny-edge-page-shell.js";
import { renderPageBytes } from "../../src/card/render/page.js";

const argv = process.argv.slice(2);
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

const counter = { rts: 0, stmts: 0, rows: 0, dbMs: 0 };
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
    for (const x of r) counter.rows += x.rows.length;
    return r;
  },
};

let outcome = "ok";
let html = "";
// Warm the local SQLite file the same way for every mode, uncounted and
// untimed: a fresh process's first statement otherwise pays a cold-file cost
// a server-side database does not.
await base.query("SELECT id, codename, name, left_id, right_id FROM cards WHERE codename IS NOT NULL", []);
await base.query("SELECT COUNT(*) AS c FROM cards WHERE trash = 0", []);
const t0 = performance.now();
try {
  if (mode === "baseline") {
    // --temp-cap N: the Temporary-cache key cap (default: Ruby's 10,000).
    // A tiny cap fires the within_key_counts reset on nearly every write.
    const cap = arg("temp-cap", "");
    const { fetcher, render } = await bootCorpusDeckEngines(counted, cap === "" ? {} : { maxTemporaryCacheKeys: Number(cap) });
    if (!argv.includes("--no-name-scan")) await installDeckNameEnvironment(counted, fetcher);
    render.imageCdnHost = SPACES_ASSET_HOST;
    html = applyServedEnvironmentDeltas(await renderPageBytes(render, page, undefined, {}));
  } else {
    throw new Error(`unknown mode ${mode}`);
  }
} catch (err) {
  outcome = `${(err as Error)?.name}: ${String((err as Error)?.message ?? err).slice(0, 300)}`;
}
const wallMs = performance.now() - t0;
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
  injected_latency_ms: latency,
};
process.stdout.write(`SHIP-REPORT ${JSON.stringify(report)}\n`);
