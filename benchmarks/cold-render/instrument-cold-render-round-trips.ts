// benchmarks/cold-render/instrument-cold-render-round-trips.ts
// WHAT THIS IS: the local mechanism instrument for the cold-render
// reliability lane. It boots the SAME object graph the deployed edge entry
// boots (deploy/bunny-worker-src/bunny-edge-engine-entry.ts:175-183:
// BunnyDbDriver -> FetchEngine -> RenderEngine) against the TRIAL database,
// wraps fetch so every pipeline POST is counted and timed, and reports the
// cost of a cold render in ROUND TRIPS rather than in milliseconds.
//
// WHY THIS SHAPE: the edge serves a cold page in 3-4 s wall time while
// Bunny's own counter reports ~314 ms average CPU per execution, and Bunny's
// pricing page states CPU time excludes I/O wait. So a cold render is almost
// entirely a long SERIAL chain of database round trips, and its wall time is
// their sum. Counting them is what turns "the page was slow" into "the page
// was N hops long, each hop M ms, and a slow hop at position k is added to
// every hop after it" — which is the shape a watchdog has to bound and a
// retry has to survive.
//
// READ-ONLY: the trial READ-ONLY token only; the instrument issues SELECTs
// through the same engine a page render uses. No credential is printed; the
// report contains card names, counts, and millisecond timings.
//
// USAGE (bundled to ESM by tools/instrument-cold-render-round-trips.mjs, or
// run through vitest):
//   node benchmarks/cold-render/measure-cold-render-round-trips.mjs \
//     --names Laundry,Home --repeat 1 --out report.json

import { readFileSync } from "node:fs";
import { BunnyDbDriver, BunnyDbQueryCounter } from "../../src/card/drivers/bunny-db.js";
import { FetchEngine } from "../../src/card/fetch.js";
import { RenderEngine } from "../../src/card/render.js";

export interface HopStats {
  posts: number;
  ms: number[];
  slowest: { ms: number; bytes: number }[];
}

export function makeCountingFetch(stats: HopStats): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const t0 = process.hrtime.bigint();
    stats.posts += 1;
    try {
      const res = await fetch(input, init);
      const clone = res.clone();
      const buf = await clone.arrayBuffer().catch(() => new ArrayBuffer(0));
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      stats.ms.push(ms);
      stats.slowest.push({ ms: Math.round(ms * 10) / 10, bytes: buf.byteLength });
      stats.slowest.sort((a, b) => b.ms - a.ms);
      stats.slowest.length = Math.min(stats.slowest.length, 6);
      return res;
    } catch (err) {
      stats.ms.push(Number(process.hrtime.bigint() - t0) / 1e6);
      throw err;
    }
  }) as typeof fetch;
}

export function pct(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Math.round(sorted[i] * 10) / 10;
}

export interface ColdRenderReport {
  name: string;
  view: string;
  outcome: string;
  html_bytes: number;
  wall_ms: number;
  http_posts: number;
  db_ops: number;
  posts_per_db_op: number;
  ms_per_post: number;
  hop_ms_p50: number | null;
  hop_ms_p90: number | null;
  hop_ms_p99: number | null;
  hop_ms_max: number | null;
  slowest_hops: { ms: number; bytes: number }[];
}

/** Render ONE card through a fresh driver (cold) or a shared deck (warm) and
 *  report the round-trip cost. */
export async function measureColdRender(
  url: string,
  token: string,
  name: string,
  view = "open",
): Promise<ColdRenderReport> {
  const stats: HopStats = { posts: 0, ms: [], slowest: [] };
  const counter = new BunnyDbQueryCounter();
  const driver = new BunnyDbDriver({
    url,
    authToken: token,
    queryCounter: counter,
    fetchImpl: makeCountingFetch(stats),
  });
  const fetcher = new FetchEngine(driver);
  const render = new RenderEngine(fetcher);
  const t0 = process.hrtime.bigint();
  let outcome = "ok";
  let htmlBytes = 0;
  try {
    htmlBytes = (await render.render(name, view, {})).length;
  } catch (err) {
    outcome = `${err instanceof Error ? err.name : "Error"}: ${String(
      (err as Error)?.message ?? err,
    ).slice(0, 160)}`;
  }
  const wallMs = Number(process.hrtime.bigint() - t0) / 1e6;
  const sorted = [...stats.ms].sort((a, b) => a - b);
  const dbOps = counter.count();
  return {
    name,
    view,
    outcome,
    html_bytes: htmlBytes,
    wall_ms: Math.round(wallMs * 10) / 10,
    http_posts: stats.posts,
    db_ops: dbOps,
    posts_per_db_op: Math.round((stats.posts / Math.max(1, dbOps)) * 1000) / 1000,
    ms_per_post: stats.posts === 0 ? 0 : Math.round((wallMs / stats.posts) * 10) / 10,
    hop_ms_p50: pct(sorted, 50),
    hop_ms_p90: pct(sorted, 90),
    hop_ms_p99: pct(sorted, 99),
    hop_ms_max: pct(sorted, 100),
    slowest_hops: stats.slowest,
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function readCreds(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

const isMain = process.argv[1] !== undefined && /measure-cold-render-round-trips/.test(process.argv[1]);
if (isMain) {
  const argv = process.argv.slice(2);
  const arg = (k: string, d: string) => {
    const i = argv.indexOf(`--${k}`);
    return i === -1 || i === argv.length - 1 ? d : argv[i + 1];
  };
  const creds = readCreds(arg("creds", "C:/localProjects/brandonDojoTech/library/data/creds"));
  const raw = creds.BUNNY_TRIAL_DB_URL;
  const tok = creds.BUNNY_TRIAL_DB_RO_TOKEN ?? creds.BUNNY_TRIAL_DB_TOKEN;
  if (!raw || !tok) {
    console.error("FATAL: trial DB url / read-only token missing from creds file");
    process.exit(2);
  }
  const url = raw.replace(/^libsql:\/\//, "https://");
  const names = String(arg("names", "Laundry"))
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const repeat = Number(arg("repeat", "1"));
  const reports: ColdRenderReport[] = [];
  for (let r = 0; r < repeat; r += 1) {
    for (const name of names) {
      const report = await measureColdRender(url, tok, name);
      reports.push({ ...report, repeat: r + 1 } as ColdRenderReport);
      console.error(
        `[r${r + 1}] ${name}: ${report.wall_ms}ms  posts=${report.http_posts} ` +
          `db_ops=${report.db_ops} hop_p50=${report.hop_ms_p50}ms hop_max=${report.hop_ms_max}ms ` +
          `(${report.outcome})`,
      );
    }
  }
  const out = arg("out", "");
  if (out) {
    // eslint-disable-next-line
    const { writeFileSync } = await import("node:fs");
    writeFileSync(out, JSON.stringify({ reports }, null, 2));
    console.error(`wrote ${out}`);
  }
  console.log(JSON.stringify({ reports }, null, 2));
}
