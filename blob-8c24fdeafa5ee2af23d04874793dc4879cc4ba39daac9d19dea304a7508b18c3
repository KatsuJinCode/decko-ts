// deploy/bunny-worker-src/bunny-edge-isolate-probe.ts — per-isolate fixed
// costs, for measurement on a staging script only.
//
// Armed only when DECKO_EDGE_ISOLATE_PROBE=1. Unarmed, it adds no header,
// answers no route and changes no byte; the counters below are diagnostic
// numbers that never reach a render.
//
// Armed, every response carries
//
//   x-decko-isolate: id=<random>;n=<request number in this isolate>;
//     perf_at_eval=<performance.now() when this module evaluated>;
//     eval_ms=<module graph evaluation>;age_ms=<isolate age at request>;
//     boot_ms=<deck boot, on the request that ran it>;
//     post1_ms=<this isolate's first database POST>;posts=<count>
//
// and two routes answer:
//   GET /_probe/cpu?n=<k>   a fixed pure-JS workload, wall ms around it
//                           (the runtime's single-thread speed, no I/O)
//   GET /_probe/db?n=<k>    k sequential `SELECT 1` pipeline POSTs, each
//                           timed (first POST in a fresh isolate versus
//                           later ones = connection set-up versus reuse)
//
// This module must be the entry's FIRST import so its top level evaluates
// before the rest of the graph; `performance.now()` there measures from the
// runtime's time origin (isolate or worker start), which covers bundle parse
// and compile when the origin is the isolate's.

// The bundler's banner stamps the bundle's first statement; without it
// (tests, other builds) this module's own evaluation is the stamp.
const BANNER = (globalThis as { __deckoEval0?: [number, number] }).__deckoEval0;
const EVAL_PERF = BANNER?.[0] ?? (typeof performance !== "undefined" ? performance.now() : -1);
const EVAL_WALL = BANNER?.[1] ?? Date.now();
const ISOLATE_ID = Math.random().toString(36).slice(2, 10);
let readyWall = -1;
let requests = 0;
let bootMs = -1;
let bootReported = false;
let firstPostMs = -1;
let posts = 0;

export function probeArmed(env: Record<string, string | undefined>): boolean {
  return env.DECKO_EDGE_ISOLATE_PROBE === "1";
}

/** Unarmed, the recorders below change nothing. */
function armedNow(): boolean {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env !== undefined && probeArmed(env);
}

/** Called by the entry after its imports: the graph has evaluated. */
export function probeModuleReady(): void {
  if (readyWall < 0) readyWall = Date.now();
}

let recentPosts: number[] = [];
export function probeRecordPost(ms: number): void {
  if (!armedNow()) return;
  posts += 1;
  if (firstPostMs < 0) firstPostMs = ms;
  if (recentPosts.length < 60) recentPosts.push(ms);
}

export function probeRecordBoot(ms: number): void {
  if (!armedNow()) return;
  bootMs = ms;
}

export function probeHeaderValue(): string {
  requests += 1;
  const parts = [
    `id=${ISOLATE_ID}`,
    `n=${requests}`,
    `perf_at_eval=${EVAL_PERF.toFixed(1)}`,
    `eval_ms=${readyWall < 0 ? -1 : readyWall - EVAL_WALL}`,
    `age_ms=${Date.now() - EVAL_WALL}`,
  ];
  if (bootMs >= 0 && !bootReported) {
    parts.push(`boot_ms=${bootMs}`);
    bootReported = true;
  }
  parts.push(`post1_ms=${firstPostMs}`, `posts=${posts}`, `post_ms=${recentPosts.join("/")}`);
  recentPosts = [];
  return parts.join(";");
}

/** A fixed pure-JS workload: string building, a Map, sorting, a regex —
 *  the kinds of work the renderer does. Returns a checksum so it is not
 *  optimized away. */
function cpuWork(rounds: number): number {
  let sum = 0;
  for (let r = 0; r < rounds; r += 1) {
    const m = new Map<string, number>();
    const parts: string[] = [];
    for (let i = 0; i < 2000; i += 1) {
      const k = `card+${i % 97}+${(i * 31) % 211}`;
      m.set(k, (m.get(k) ?? 0) + i);
      parts.push(`<div class="card-slot ${k}">${i}</div>`);
    }
    const html = parts.join("");
    sum += html.replace(/card-slot (\S+)/g, "x").length;
    sum += [...m.values()].sort((a, b) => a - b)[0] ?? 0;
  }
  return sum;
}

export async function probeRoute(
  url: URL,
  dbQuery: () => Promise<(sql: string) => Promise<unknown>>,
): Promise<Response | null> {
  const path = url.pathname.replace(/\/+$/, "");
  if (path === "/_probe/cpu") {
    const n = Math.min(Math.max(Number(url.searchParams.get("n") ?? "50") | 0, 1), 2000);
    const reps = Math.min(Math.max(Number(url.searchParams.get("reps") ?? "1") | 0, 1), 20);
    const t0 = Date.now();
    const runs: number[] = [];
    let sum = 0;
    for (let k = 0; k < reps; k += 1) {
      const p0 = performance.now();
      sum += cpuWork(n);
      runs.push(+(performance.now() - p0).toFixed(2));
    }
    const body = { rounds: n, reps, wall_ms: Date.now() - t0, perf_ms: runs[0], runs_ms: runs, sum };
    return Response.json(body, { headers: { "cache-control": "no-store" } });
  }
  if (path === "/_probe/db") {
    const n = Math.min(Math.max(Number(url.searchParams.get("n") ?? "5") | 0, 1), 20);
    const q = await dbQuery();
    const ms: number[] = [];
    for (let i = 0; i < n; i += 1) {
      const t0 = performance.now();
      await q("SELECT 1");
      ms.push(+(performance.now() - t0).toFixed(1));
    }
    return Response.json({ n, post_ms: ms }, { headers: { "cache-control": "no-store" } });
  }
  return null;
}
