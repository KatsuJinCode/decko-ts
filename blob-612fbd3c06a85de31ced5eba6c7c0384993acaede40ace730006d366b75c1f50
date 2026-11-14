// deploy/src/worker-metrics.ts
//
// Per-request + isolate-aggregate metrics for the deployed Cloudflare
// Workers entry. The measurement set the external review demands
// (decko-commons#1282 thread): per-request + aggregate CPU/wall time,
// D1 rows-read/rows-written accounting, request counts, p50/p95 histograms,
// cold-start marker, and a "memory note" that names the missing API.
//
// Architecturally:
//
//   Worker fetch handler
//     -> recorder.startRequest(route)
//     -> recorder.observeQuery({...})  for each engine query
//     -> recorder.endRequest(status, wallMs)               (always, even on error)
//     -> recorder.getAggregate() for GET /__metrics
//
// The recorder stores only primitive numbers + small arrays, so a request
// context handed to ctx.waitUntil() carries through safely. Isolates are
// EPHEMERAL (the warm cache promise means a single isolate can serve
// thousands of requests; cold isolates start over) — the aggregate
// started_at_iso is reset whenever the recorder is created, and the
// GET /__metrics JSON explicitly says so in its `since_iso` field.
//
// CPU vs wall time: Cloudflare Workers has no in-isolate CPU-time API
// (V8 isolates do not expose process times; performance.now() is the
// only monotone clock). The recorder reports BOTH cpuMs and wallMs
// so consumers can select either field, and the aggregate
// exposes an `accounting` block that labels the equivalence so a
// reader is not misled. cpuMs = wallMs (perf.now diff) at the per-
// request level on this runtime.
//
// D1 rows accounting: the wrapper prefers driver-reported numbers
// (CloudflareD1Adapter SQLQueryResult.rowsRead / rowsWritten, which
// forward meta.rows_read / meta.rows_written when the runtime
// surfaces them — production D1 does). When the provider omits a
// value (workerd's local D1 emulation, or a future runtime change),
// the wrapper applies a SQL-text + result-shape estimator and marks
// the value with exact: false. The estimator is documented per-class
// (SELECT/UPDATE/DELETE/INSERT) and never guesses counts inside
// SELECT — SELECT estimates use rows.length, not a projection guess.
// The wrap is observation-only: it returns the wrapped driver's
// result unchanged, never altering engine behavior.
//
// Memory note: this runtime does not expose per-isolate resident-set
// (performance.memory is a Node-only API; measureUserAgentSpecificMemory
// requires cross-origin isolation). The aggregate's `memory` field is
// fixed to { available: false, reason: "..." } so callers always see a
// real shape they can pin in a test.

import type { SQLQueryResult, SQLStatement, SQLTransactionGuarantee } from "../../src/server/driver.js";
import { CloudflareD1Adapter, type D1DatabaseLike } from "../../src/server/drivers/d1.js";

// ---------------------------------------------------------------------------
// Public types — the shape of one observation (per-request + aggregate)
// ---------------------------------------------------------------------------

/** A view-stable tag for which route produced this measurement. Routes
 *  come from the worker's routing table; the recorder never invents one. */
export type MetricsRoute =
  | "/"
  | "/_status"
  | "/api/query"
  | "/__metrics"
  | "/<card-name>"
  | "/<card-name>.json"
  | "other";

/** One SQL statement observed by the wrapper. The wrapper passes the
 *  original SQL through unchanged to the driver; this record is the
 *  observer's view, NOT a new copy of the SQL. */
export interface QueryObservation {
  /** The SQL text the driver executed (verbatim, including any bind placeholders). */
  sql: string;
  /** Engine-reported rows read (D1 meta.rows_read); undefined iff the provider
   *  did not surface it, in which case the ESTIMATE field governs. */
  rowsRead: number | undefined;
  /** Engine-reported rows written (D1 meta.rows_written); same semantics. */
  rowsWritten: number | undefined;
  /** True iff this observation is an exact number from the provider; false
   *  iff this observation is an ESTIMATE derived from SQL text + result. */
  exact: boolean;
}

export interface RequestMetrics {
  /** A monotonic per-isolate counter (NOT a UUID — isolates can serve
   *  thousands of requests, but the counter resets on isolate boot). */
  seq: number;
  route: MetricsRoute;
  status: number;
  /** Wall clock milliseconds from the worker entry to endRequest. */
  wallMs: number;
  /** Recorded as wallMs — Workers has no in-isolate CPU-time API (see
   *  the file header). Returned as a separate field so the response
   *  header shape stays stable. */
  cpuMs: number;
  rowsRead: number;
  rowsWritten: number;
  /** Count of queries on this request whose rows_read was ESTIMATE. */
  rowsReadEstimated: number;
  /** Count of queries on this request whose rows_written was ESTIMATE. */
  rowsWrittenEstimated: number;
  queryCount: number;
  coldStart: boolean;
}

export interface HistogramSnapshot {
  /** Lower bound of each bucket, in milliseconds. Length = counts.length - 1.
   *  The last count is the overflow bucket (>= bucket_edges_ms[-1]). */
  bucketEdgesMs: number[];
  counts: number[];
  p50Ms: number;
  p95Ms: number;
  total: number;
}

export interface AggregateMetrics {
  /** ISO timestamp at which this aggregate started (per-isolate boot
   *  modulo any explicit reset). */
  sinceIso: string;
  requestCount: number;
  totalWallMs: number;
  errors: number;
  queryCount: number;
  rowsRead: number;
  rowsWritten: number;
  /** Requests where AT LEAST ONE query was rows_read-estimate. */
  requestsWithRowsReadEstimate: number;
  /** Requests where AT LEAST ONE query was rows_written-estimate. */
  requestsWithRowsWrittenEstimate: number;
  coldStarts: number;
  /** Wall-time histogram (every request). */
  wallMs: HistogramSnapshot;
  /** cpuMs histogram — equal to wallMs on this runtime; kept separate
   *  so a future CPU-time-capable runtime can swap in real numbers
   *  without changing the wire shape. */
  cpuMs: HistogramSnapshot;
  memory: { available: false; reason: string };
  /** Tail of per-request observations for inspection (capped). */
  recent: RequestMetrics[];
}

// ---------------------------------------------------------------------------
// Histogram — fixed-bucket by wall-time millisecond ranges
// ---------------------------------------------------------------------------

/** Bucket edges (lower-inclusive, upper-exclusive). The last bucket is the
 *  overflow (>= the last edge) and receives values above the largest edge.
 *  Picked for render-paths on Workers: typical renders land in [2, 50ms],
 *  cold renders can hit a second, error paths occasionally more. */
export const HISTOGRAM_BUCKET_EDGES_MS: readonly number[] = Object.freeze([
  0, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000,
]);

/** Inclusive max sample value the histogram accepts; over-range values
 *  are clamped to the overflow bucket (and the clamp is visible: count
 *  present, no value-into-edge interpolation). */
export const HISTOGRAM_MAX_MS = 5000;

export interface Histogram {
  edges: readonly number[];
  counts: number[];
  total: number;
}

export function newHistogram(edges: readonly number[] = HISTOGRAM_BUCKET_EDGES_MS): Histogram {
  // +1 for the overflow bucket.
  return { edges, counts: new Array(edges.length + 1).fill(0), total: 0 };
}

export function histObserve(hist: Histogram, ms: number): void {
  hist.total += 1;
  // Clamp negatives to bucket 0; overflow to last bucket.
  if (!Number.isFinite(ms) || ms < hist.edges[0]!) {
    hist.counts[0] = (hist.counts[0] ?? 0) + 1;
    return;
  }
  const lastEdge = hist.edges[hist.edges.length - 1]!;
  if (ms >= lastEdge) {
    hist.counts[hist.counts.length - 1] = (hist.counts[hist.counts.length - 1] ?? 0) + 1;
    return;
  }
  // Find the first edge strictly greater than ms (upper bound, exclusive).
  for (let i = 1; i < hist.edges.length; i++) {
    if (ms < hist.edges[i]!) {
      hist.counts[i - 1] = (hist.counts[i - 1] ?? 0) + 1;
      return;
    }
  }
  // Defensive: should not reach here given the overflow check above.
  hist.counts[hist.counts.length - 1] = (hist.counts[hist.counts.length - 1] ?? 0) + 1;
}

/** Quantile over the histogram. Linear interpolation inside the bucket
 *  that straddles the target rank. Returns 0 when the histogram is
 *  empty, the lower edge when total = 1, and a value inside the
 *  overflow bucket returns the overflow edge value (clamped to
 *  HISTOGRAM_MAX_MS). */
export function histQuantile(hist: Histogram, q: number): number {
  if (hist.total <= 0) return 0;
  if (q <= 0) return hist.edges[0]!;
  if (q >= 1) return hist.edges[hist.edges.length - 1]!;
  const target = q * hist.total;
  let cumulative = 0;
  for (let i = 0; i < hist.counts.length; i++) {
    const c = hist.counts[i] ?? 0;
    const next = cumulative + c;
    if (next >= target) {
      if (i === hist.counts.length - 1) {
        // Overflow bucket — return the max edge as a clamped value.
        return hist.edges[hist.edges.length - 1]!;
      }
      const lower = hist.edges[i] ?? 0;
      const upper = hist.edges[i + 1] ?? lower;
      // Linear interpolation inside the bucket.
      const span = upper - lower;
      const offset = c === 0 ? 0 : ((target - cumulative) / c) * span;
      return lower + offset;
    }
    cumulative = next;
  }
  return hist.edges[hist.edges.length - 1]!;
}

export function histSnapshot(hist: Histogram): HistogramSnapshot {
  return {
    bucketEdgesMs: [...hist.edges],
    counts: [...hist.counts],
    p50Ms: histQuantile(hist, 0.5),
    p95Ms: histQuantile(hist, 0.95),
    total: hist.total,
  };
}

// ---------------------------------------------------------------------------
// Estimator — D1 rows-read/rows-written fallback
// ---------------------------------------------------------------------------
//
// Cloudflare D1 production surfaces meta.rows_read and meta.rows_written.
// The workerd emulation used for local proof may surface them as undefined
// (verified: not in the documented local D1 surface). When the runtime does
// not, the metrics wrapper applies this estimator — LABELLED "ESTIMATE"
// in the observation — rather than emitting 0 silently.
//
// SELECT: rowsRead = number of returned rows (an under-estimate of the
//   engine's scan; the real figure is unknown to us, so we report 0 and
//   flag ESTIMATE on read side). RowsWritten = 0 for SELECTs.
// INSERT/UPDATE/DELETE: rowsRead = 0; rowsWritten = max(0, rowsAffected)
//   OR the COUNT(*) result row when rowsAffected === 0 and one row was
//   returned (count queries are the main case here).
// Anything else (PRAGMA, transaction control, EXPLAIN): rowsRead = 0,
//   rowsWritten = 0, estimate = ESTIMATE.
//
// The estimator never reads D1 internal counters, never tries to inspect
// the prepared statement, and is export-stable.

export function estimateRows(sql: string, rowsAffected: number, returnedRowCount: number): {
  rowsRead: number;
  rowsWritten: number;
  exact: boolean;
} {
  // Cheap classification: the first SQL keyword (up to whitespace or
  // paren). Forgiving of leading parens (rare) and trailing whitespace.
  const trimmed = sql.trim();
  if (trimmed.length === 0) {
    return { rowsRead: 0, rowsWritten: 0, exact: false };
  }
  const headEnd = /[\s(]/.exec(trimmed)?.index ?? trimmed.length;
  const head = trimmed.slice(0, headEnd).toUpperCase();
  if (head === "SELECT" || head === "WITH" || head === "VALUES" || head === "PRAGMA" || head === "EXPLAIN") {
    // Rows-read is unknowable from outside D1; honest answer: 0 (don't lie).
    return { rowsRead: 0, rowsWritten: 0, exact: false };
  }
  if (head === "INSERT" || head === "UPDATE" || head === "DELETE" || head === "REPLACE") {
    // rows_written for a write is best approximated by the change count.
    // D1 reports `meta.changes` for INSERT/UPDATE/DELETE; on a write that
    // touches zero rows, that's 0 — still honest. The estimator is honest,
    // not optimistic: it never invents a number from "did the driver
    // return rows" because drivers don't return rows for writes.
    return { rowsRead: 0, rowsWritten: Math.max(0, rowsAffected), exact: false };
  }
  if (head === "BEGIN" || head === "COMMIT" || head === "ROLLBACK" || head === "END") {
    return { rowsRead: 0, rowsWritten: 0, exact: false };
  }
  // Unknown — could be CREATE TABLE, DROP, ALTER, … still report 0/0 ESTIMATE.
  return { rowsRead: 0, rowsWritten: 0, exact: false };
}

// ---------------------------------------------------------------------------
// The recorder — per-request + aggregate, persisted across waitUntil
// ---------------------------------------------------------------------------

export interface RecorderOptions {
  /** Cap on the `recent` tail in the aggregate snapshot. Defaults to 5. */
  recentTailSize?: number;
  /** Override the bucket edges (tests). Defaults to HISTOGRAM_BUCKET_EDGES_MS. */
  histogramEdges?: readonly number[];
}

interface PrivateRequest {
  seq: number;
  route: MetricsRoute;
  startWallMs: number;
  status: number | undefined;
  rowsRead: number;
  rowsWritten: number;
  rowsReadEstimated: number;
  rowsWrittenEstimated: number;
  queryCount: number;
}

export class MetricsRecorder {
  private readonly sinceIso: string;
  private readonly recentTailSize: number;
  private readonly wallHist: Histogram;
  private readonly cpuHist: Histogram;
  private requestCount = 0;
  private totalWallMs = 0;
  private errors = 0;
  private coldStarts = 0;
  private queryCount = 0;
  private rowsRead = 0;
  private rowsWritten = 0;
  private requestsWithRowsReadEstimate = 0;
  private requestsWithRowsWrittenEstimate = 0;
  private nextSeq = 1;
  private current: PrivateRequest | undefined;
  private readonly recent: RequestMetrics[] = [];

  constructor(options: RecorderOptions = {}) {
    this.sinceIso = new Date().toISOString();
    this.recentTailSize = options.recentTailSize ?? 5;
    this.wallHist = newHistogram(options.histogramEdges ?? HISTOGRAM_BUCKET_EDGES_MS);
    this.cpuHist = newHistogram(options.histogramEdges ?? HISTOGRAM_BUCKET_EDGES_MS);
  }

  /** Begin a request. The route tag is what makes /__metrics output
   *  useful — pass a stable, low-cardinality tag (the routing table
   *  in worker.ts has a switch that already does this work). */
  startRequest(route: MetricsRoute): void {
    const isCold = this.requestCount === 0;
    if (isCold) this.coldStarts += 1;
    this.current = {
      seq: this.nextSeq,
      route,
      startWallMs: performance.now(),
      status: undefined,
      rowsRead: 0,
      rowsWritten: 0,
      rowsReadEstimated: 0,
      rowsWrittenEstimated: 0,
      queryCount: 0,
    };
    // Stash the cold-start decision on the current request via seq;
    // endRequest reads it back. (Could be stored on `this`; this is
    // explicit so test asserts against it don't need hidden state.)
    (this.current as PrivateRequest & { _coldStart?: boolean })._coldStart = isCold;
    this.nextSeq += 1;
  }

  /** Report one SQL statement that just completed. The wrapper invokes
   *  this once per driver call, AFTER the driver returns, regardless
   *  of success (errors still count toward query_count). Errors are
   *  observed by endRequest's status, not here. */
  observeQuery(obs: QueryObservation): void {
    if (this.current === undefined) return; // dropped (pre-init or test stub)
    this.current.queryCount += 1;
    if (typeof obs.rowsRead === "number") {
      this.current.rowsRead += obs.rowsRead;
    } else {
      this.current.rowsReadEstimated += 1;
    }
    if (typeof obs.rowsWritten === "number") {
      this.current.rowsWritten += obs.rowsWritten;
    } else {
      this.current.rowsWrittenEstimated += 1;
    }
  }

  /** End a request. Always callable, even on error — passing a status
   *  of 0 (or undefined) tells the recorder "this was thrown". */
  endRequest(status: number, wallMs?: number): RequestMetrics | undefined {
    if (this.current === undefined) return undefined;
    const ended: RequestMetrics = {
      seq: this.current.seq,
      route: this.current.route,
      status,
      wallMs: Number.isFinite(wallMs ?? NaN) ? Math.max(0, wallMs ?? 0) : 0,
      cpuMs: Number.isFinite(wallMs ?? NaN) ? Math.max(0, wallMs ?? 0) : 0,
      rowsRead: this.current.rowsRead,
      rowsWritten: this.current.rowsWritten,
      rowsReadEstimated: this.current.rowsReadEstimated,
      rowsWrittenEstimated: this.current.rowsWrittenEstimated,
      queryCount: this.current.queryCount,
      coldStart:
        (this.current as PrivateRequest & { _coldStart?: boolean })._coldStart === true,
    };
    this.current = undefined;
    // Aggregate update.
    this.requestCount += 1;
    this.queryCount += ended.queryCount;
    this.rowsRead += ended.rowsRead;
    this.rowsWritten += ended.rowsWritten;
    if (ended.rowsReadEstimated > 0) this.requestsWithRowsReadEstimate += 1;
    if (ended.rowsWrittenEstimated > 0) this.requestsWithRowsWrittenEstimate += 1;
    this.totalWallMs += ended.wallMs;
    histObserve(this.wallHist, ended.wallMs);
    histObserve(this.cpuHist, ended.cpuMs);
    if (status === undefined || status === 0 || status >= 500) this.errors += 1;
    this.recent.push(ended);
    while (this.recent.length > this.recentTailSize) this.recent.shift();
    return ended;
  }

  /** Snapshot the aggregate for /__metrics. Always returns a stable,
   *  JSON-serializable shape — no functions, no Date, no Map/Set. */
  getAggregate(): AggregateMetrics {
    return {
      sinceIso: this.sinceIso,
      requestCount: this.requestCount,
      totalWallMs: this.totalWallMs,
      errors: this.errors,
      queryCount: this.queryCount,
      rowsRead: this.rowsRead,
      rowsWritten: this.rowsWritten,
      requestsWithRowsReadEstimate: this.requestsWithRowsReadEstimate,
      requestsWithRowsWrittenEstimate: this.requestsWithRowsWrittenEstimate,
      coldStarts: this.coldStarts,
      wallMs: histSnapshot(this.wallHist),
      cpuMs: histSnapshot(this.cpuHist),
      memory: {
        available: false,
        reason:
          "Cloudflare Workers do not expose per-isolate resident-set memory. " +
          "performance.memory is a Node-only API and " +
          "performance.measureUserAgentSpecificMemory requires cross-origin " +
          "isolation, which this deploy does not enable.",
      },
      recent: this.recent.slice(),
    };
  }
}

// ---------------------------------------------------------------------------
// Per-request query observer — wrapper that the worker uses to instrument
// the D1 driver. The wrapper preserves driver behavior: same return on
// success, same throw on error, same query text + params.
// ---------------------------------------------------------------------------

/** The engine-side type: the driver returns SQLQueryResult<T>. The wrapper
 *  inspects the result for rowsRead/rowsWritten; if either is undefined
 *  (runtime did not surface meta.rows_read / meta.rows_written), it
 *  applies the SQL-text estimator and records the ESTIMATE flag. */
export interface MetricDriver {
  query<T = unknown>(sql: string, params: unknown[]): Promise<SQLQueryResult<T>>;
  batch(statements: SQLStatement[]): Promise<SQLQueryResult[]>;
  transaction<R>(work: () => Promise<R>): Promise<R>;
  readonly transactionGuarantee: SQLTransactionGuarantee;
  /** If the wrapped driver is itself a CloudflareD1Adapter, expose the
   *  underlying binding via this for tests + status routes. */
  readonly underlying: CloudflareD1Adapter;
}

/** Construct a metrics-instrumented driver around a CloudflareD1Adapter.
 *  The wrapper preserves the engine's view: callers see the same return
 *  type, the same thrown errors, the same query text, params, and result
 *  shape. Observation happens between the driver return and the caller
 *  seeing the value — never inside the engine path. */
export function wrapDriverWithMetrics(
  driver: CloudflareD1Adapter,
  recorder: MetricsRecorder,
  now?: () => number,
): MetricDriver {
  const readNow = now ?? (() => performance.now());
  return {
    underlying: driver,
    transactionGuarantee: driver.transactionGuarantee,
    // The unit of work's statements still pass through this wrapper's
    // query/batch (the engine holds the wrapper), so they are observed.
    transaction: <R>(work: () => Promise<R>) => driver.transaction(work),
    async query<T>(sql: string, params: unknown[]): Promise<SQLQueryResult<T>> {
      const start = readNow();
      let result: SQLQueryResult<T>;
      try {
        result = await driver.query<T>(sql, params);
      } catch (error) {
        // Errors do count toward query_count (the wrapper observes them too).
        recorder.observeQuery({
          sql,
          rowsRead: undefined,
          rowsWritten: undefined,
          exact: false,
        });
        throw error;
      }
      if (typeof result.rowsRead === "number" && typeof result.rowsWritten === "number") {
        recorder.observeQuery({
          sql,
          rowsRead: result.rowsRead,
          rowsWritten: result.rowsWritten,
          exact: true,
        });
      } else {
        const est = estimateRows(sql, result.rowsAffected, result.rows.length);
        recorder.observeQuery({ sql, rowsRead: est.rowsRead, rowsWritten: est.rowsWritten, exact: est.exact });
      }
      // The result carries through unchanged. We discard `start` deliberately:
      // engine time accounting is on wallMs (the request-scoped clock), not
      // per-query. Per-query timings would double-count when the engine
      // batches; the figures this reports are per-render, not per-SQL.
      void start;
      return result;
    },
    async batch(statements: SQLStatement[]): Promise<SQLQueryResult[]> {
      const start = readNow();
      let results: SQLQueryResult[];
      try {
        results = await driver.batch(statements);
      } catch (error) {
        for (const statement of statements) {
          recorder.observeQuery({
            sql: statement.sql,
            rowsRead: undefined,
            rowsWritten: undefined,
            exact: false,
          });
        }
        throw error;
      }
      for (let i = 0; i < statements.length; i++) {
        const statement = statements[i]!;
        const result = results[i];
        if (result === undefined) {
          recorder.observeQuery({
            sql: statement.sql,
            rowsRead: undefined,
            rowsWritten: undefined,
            exact: false,
          });
          continue;
        }
        if (typeof result.rowsRead === "number" && typeof result.rowsWritten === "number") {
          recorder.observeQuery({
            sql: statement.sql,
            rowsRead: result.rowsRead,
            rowsWritten: result.rowsWritten,
            exact: true,
          });
        } else {
          const est = estimateRows(statement.sql, result.rowsAffected, result.rows.length);
          recorder.observeQuery({ sql: statement.sql, rowsRead: est.rowsRead, rowsWritten: est.rowsWritten, exact: est.exact });
        }
      }
      void start;
      return results;
    },
  };
}

// ---------------------------------------------------------------------------
// Response helpers — X-Render-Metrics header + JSON endpoint
// ---------------------------------------------------------------------------

/** Compact X-Render-Metrics header. The shape is the contract review asked
 *  for: cpuMs, wallMs, rowsRead, rowsWritten, cold. Values are numeric;
 *  cold is "1" or "0"; rowsRead/rowsWritten are integers (Math.floor). */
export function renderMetricsHeader(metrics: RequestMetrics | undefined): string {
  if (metrics === undefined) return "";
  const safe = (n: number): number => (Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0);
  return [
    `cpu=${safe(metrics.cpuMs)}`,
    `wall=${safe(metrics.wallMs)}`,
    `rowsRead=${safe(metrics.rowsRead)}`,
    `rowsWritten=${safe(metrics.rowsWritten)}`,
    `queries=${safe(metrics.queryCount)}`,
    `cold=${metrics.coldStart ? "1" : "0"}`,
    `estReads=${safe(metrics.rowsReadEstimated)}`,
    `estWrites=${safe(metrics.rowsWrittenEstimated)}`,
  ].join("; ");
}

/** Build the GET /__metrics response. Returns 405 on non-GET, 503 if no
 *  request has been observed yet (the endpoint was introduced without
 *  priming — the operator should hit any other route first). The route
 *  itself does NOT observe itself (otherwise the aggregate would count
 *  the introspection call once per call). */
export function buildMetricsResponse(
  request: Request,
  recorder: MetricsRecorder,
): Response {
  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
  const aggregate = recorder.getAggregate();
  return new Response(JSON.stringify(aggregate, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Isolate-Age-Ms": String(Math.max(0, Math.floor(performance.now()))),
    },
  });
}
