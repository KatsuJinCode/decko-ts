// BunnyDbDriver — SQLDatabaseDriver speaking the Bunny Database SQL API.
//
// Bunny Database is Bunny.net's managed libSQL/SQLite-compatible service.
// The wire protocol on its public SQL endpoint is Hrana v2 over HTTP — the
// SAME protocol the libsql-http adapter uses (POST /v2/pipeline, tagged
// {type, value} args, "close" terminator, one round trip per pipeline).
//
// This file is a fresh, self-contained adapter that targets Bunny's URL
// shape rather than reusing libsql-http internals, for two reasons:
//   1. The task scope says other lanes own libsql-http.ts; an adapter that
//      doesn't import it is insulated from churn in that lane.
//   2. Bunny's auth model is "Bearer <db-access-token>" against the URL
//      shape https://<db-id>.lite.bunnydb.net/v2/pipeline — slightly
//      different from a generic libSQL server, and worth being explicit
//      about at the seam.
//
// Reference protocol decode shape, from Bunny docs:
//   Request:  POST https://<db-id>.lite.bunnydb.net/v2/pipeline
//             Authorization: Bearer <access token>
//             Content-Type: application/json
//             {"requests":[{"type":"execute","stmt":{"sql":"...", "args":[...],"want_rows":true}}, ..., {"type":"close"}]}
//   Response: {"results":[{"type":"ok","response":{"type":"execute","result":{"cols":[...], "rows":[...], "affected_row_count":N, "last_insert_rowid":"..."}}}, ...]}
//             Or:        {"results":[{"type":"error","error":{"message":"...", "code":"..."}}]}
//
// Hrana value tags: {"type":"null"}, {"type":"integer","value":"<digits>"},
// {"type":"float","value":<number>}, {"type":"text","value":"..."},
// {"type":"blob","base64":"..."}.
//
// Design choices:
//   - Connection details come from BUNNY_DB_URL + BUNNY_DB_TOKEN env vars
//     by default; the constructor accepts explicit overrides for tests.
//     Credentials are NEVER logged, NEVER included in thrown-error
//     messages, and NEVER printed even on failure paths.
//   - A query-count instrumentation hook is exposed via a pluggable
//     counter. The default is a no-op (zero-cost in production code that
//     does not need it); callers that want per-page DB-operations metrics
//     (e.g. the worker request handler) pass a BunnyDbQueryCounter and
//     read its count after a render.
//   - batch() makes ONE pipeline POST (one round trip), matching the
//     libsql-http adapter. Like libsql-http, a Bunny pipeline is NOT
//     transactional: each execute commits on the server as it runs. If
//     atomic batch behavior is needed, wrap in explicit BEGIN/COMMIT.
//   - Errors carry a typed shape (status / code / statementIndex) so
//     callers can distinguish transport failures from server-reported
//     SQL errors.

import type { SQLDatabaseDriver, SQLQueryResult, SQLStatement } from "../../server/driver.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface BunnyDbOptions {
  /** Bunny Database SQL endpoint, e.g.
   *  "https://<db-id>.lite.bunnydb.net/v2/pipeline" or just
   *  "https://<db-id>.lite.bunnydb.net" (the trailing "/v2/pipeline" is
   *  appended if missing). If omitted, read from BUNNY_DB_URL. */
  url?: string;
  /** Bearer token sent as `Authorization: Bearer <authToken>`. Read from
   *  BUNNY_DB_TOKEN if omitted. */
  authToken?: string;
  /** Whole-request timeout in milliseconds (per pipeline POST). */
  timeoutMs?: number;
  /** Override for global fetch; tests pass a mock here. */
  fetchImpl?: typeof fetch;
  /** Pluggable instrumentation hook; the default is a no-op counter. */
  queryCounter?: BunnyDbQueryCounter;
}

export class BunnyDbError extends Error {
  /** HTTP status when the failure was transport-level; undefined for
   *  in-band server-reported errors that came back with 200 OK. */
  readonly status?: number;
  /** Server-reported code (Hrana error code string) when available. */
  readonly code?: string;
  /** Zero-based pipeline index of the failing statement when known. */
  readonly statementIndex?: number;

  constructor(
    message: string,
    opts: { status?: number; code?: string; statementIndex?: number } = {},
  ) {
    super(message);
    this.name = "BunnyDbError";
    this.status = opts.status;
    this.code = opts.code;
    this.statementIndex = opts.statementIndex;
  }
}

/** Per-driver query-count hook. The engine measures DB-operations-per-page
 *  as a first-class metric; the counter increments once per call to
 *  query() and once per statement in batch(). A counter instance is
 *  pluggable so the same driver can be used by different request
 *  contexts with their own running totals, or wrapped by a no-op
 *  counter in code paths that don't care. */
export interface BunnyDbQueryCounterLike {
  /** Record one engine query call (regardless of whether it was a single
   *  execute or one statement inside a batch). */
  recordQuery(sql: string): void;
  /** Current accumulated count. */
  count(): number;
  /** Reset accumulated count to zero. */
  reset(): void;
}

/** Default no-op counter: zero allocation cost when the metric is not
 *  needed. The driver falls back to this singleton whenever
 *  options.queryCounter is not supplied; pass a BunnyDbQueryCounter to
 *  measure. */
export class NoopBunnyDbQueryCounter implements BunnyDbQueryCounterLike {
  recordQuery(_sql: string): void {
    /* intentionally empty */
  }
  count(): number {
    return 0;
  }
  reset(): void {
    /* intentionally empty */
  }
}

/** Mutable counter. Use one instance per measurement scope (e.g. one
 *  per request, one per test) and read .count() at the end. */
export class BunnyDbQueryCounter implements BunnyDbQueryCounterLike {
  private n = 0;
  /** Optional bounded ring buffer of the most recent SQL strings observed;
   *  helpful when a single spike needs postmortem detail. Always empty
   *  unless captureSql was requested at construction. */
  private readonly recent: string[] = [];
  private readonly recentLimit: number;

  constructor(opts: { captureSql?: boolean; recentLimit?: number } = {}) {
    this.recentLimit = opts.captureSql ? Math.max(0, opts.recentLimit ?? 32) : 0;
  }

  recordQuery(sql: string): void {
    this.n += 1;
    if (this.recentLimit > 0) {
      if (this.recent.length >= this.recentLimit) this.recent.shift();
      this.recent.push(sql);
    }
  }

  count(): number {
    return this.n;
  }

  reset(): void {
    this.n = 0;
    this.recent.length = 0;
  }

  /** Snapshot of recent SQL strings (most-recent last); empty when
   *  captureSql was not requested. Returned array is a fresh copy. */
  recentSql(): string[] {
    return this.recent.slice();
  }
}

// ---------------------------------------------------------------------------
// Decoded Hrana execute result (intermediate shape, before row mapping)
// ---------------------------------------------------------------------------

interface BunnyDbExecResult {
  cols: { name: string; decltype?: string | null }[];
  rows: BunnyDbCell[][];
  affectedRowCount: number;
  lastInsertRowId?: number | bigint;
}

type BunnyDbCell = null | number | bigint | string | Uint8Array;

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

const DEFAULT_NOOP_COUNTER: BunnyDbQueryCounterLike = new NoopBunnyDbQueryCounter();

export class BunnyDbDriver implements SQLDatabaseDriver {
  private readonly pipelineUrl: string;
  private readonly authToken?: string;
  private readonly timeoutMs?: number;
  private readonly fetchImpl: typeof fetch;
  private readonly counter: BunnyDbQueryCounterLike;

  constructor(options: BunnyDbOptions = {}) {
    const { url, authToken, timeoutMs, fetchImpl, queryCounter } = options;

    const resolvedUrl = url ?? readEnv("BUNNY_DB_URL");
    if (resolvedUrl === undefined || resolvedUrl.trim() === "") {
      throw new BunnyDbError(
        "BunnyDbDriver: no URL configured (set BUNNY_DB_URL or pass options.url)",
      );
    }
    // Normalize: trim, strip trailing slashes, ensure the pipeline suffix
    // is present. Bunny docs show the canonical endpoint at /v2/pipeline,
    // matching the libsql-http adapter; tolerating URLs that omit the
    // suffix keeps the driver friendly to Bunny dashboard copy-pastes
    // that sometimes drop it.
    const base = resolvedUrl.trim().replace(/\/+$/, "");
    this.pipelineUrl = base.endsWith("/v2/pipeline") ? base : `${base}/v2/pipeline`;

    const resolvedToken = authToken ?? readEnv("BUNNY_DB_TOKEN");
    if (resolvedToken !== undefined && resolvedToken !== "") {
      this.authToken = resolvedToken;
    }
    this.timeoutMs = timeoutMs;
    this.fetchImpl = fetchImpl ?? fetch.bind(globalThis);
    this.counter = queryCounter ?? DEFAULT_NOOP_COUNTER;
  }

  async query<T = unknown>(sql: string, params: unknown[]): Promise<SQLQueryResult<T>> {
    this.counter.recordQuery(sql);
    const results = await this.pipeline([
      { type: "execute", stmt: toHranaStmt(sql, params) },
      { type: "close" },
    ]);
    const first = results[0] as BunnyDbExecResult;
    return execResultToQueryResult<T>(first);
  }

  async batch(statements: SQLStatement[]): Promise<SQLQueryResult[]> {
    if (statements.length === 0) return [];
    // Record every statement as a query for the instrumentation hook.
    // batch() makes ONE pipeline POST, but from the engine's
    // DB-operations-per-page perspective each statement is one DB op.
    for (const s of statements) this.counter.recordQuery(s.sql);
    const requests: HranaPipelineRequest[] = statements.map((s) => ({
      type: "execute",
      stmt: toHranaStmt(s.sql, s.params),
    }));
    requests.push({ type: "close" });
    const results = await this.pipeline(requests);
    // pipeline() results align 1:1 with requests; the trailing "close"
    // entry decodes to null, so slice off exactly the execute entries.
    return results
      .slice(0, statements.length)
      .map((r) => execResultToQueryResult<unknown>(r as BunnyDbExecResult));
  }

  /** Read the current accumulated query count from the instrumentation
   *  hook. Returns 0 when no counter was injected and the no-op default
   *  is in use. */
  queryCount(): number {
    return this.counter.count();
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  /** Send one pipeline POST and decode every response entry. */
  private async pipeline(requests: HranaPipelineRequest[]): Promise<unknown[]> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.authToken !== undefined) {
      headers.authorization = `Bearer ${this.authToken}`;
    }
    let response: Response;
    try {
      response = await this.fetchImpl(this.pipelineUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({ requests }),
        signal:
          this.timeoutMs !== undefined ? AbortSignal.timeout(this.timeoutMs) : undefined,
      });
    } catch (cause) {
      // Transport-level failures (DNS, refused, abort). Never include
      // credentials in the thrown message.
      throw new BunnyDbError(
        `BunnyDb pipeline transport failed: ${describeTransportError(cause)}`,
      );
    }
    if (!response.ok) {
      const bodySnippet = (await response.text().catch(() => "")).slice(0, 500);
      throw new BunnyDbError(
        `BunnyDb pipeline request failed: HTTP ${response.status} ${response.statusText}${
          bodySnippet ? `: ${bodySnippet}` : ""
        }`,
        { status: response.status },
      );
    }
    const body = (await response.json()) as PipelineResponseBody;
    if (body === null || typeof body !== "object" || !Array.isArray(body.results)) {
      throw new BunnyDbError(
        "BunnyDb pipeline response has no results array (protocol violation)",
      );
    }
    if (body.results.length !== requests.length) {
      throw new BunnyDbError(
        `BunnyDb pipeline response count mismatch: sent ${requests.length} requests, got ${body.results.length} results`,
      );
    }
    return body.results.map((entry, i) => decodeStreamResult(entry, i, requests[i]));
  }
}

// ---------------------------------------------------------------------------
// Wire encoding (request side)
// ---------------------------------------------------------------------------

interface HranaStmtBody {
  sql: string;
  args: HranaWireValue[];
  want_rows: true;
}

type HranaPipelineRequest =
  | { type: "execute"; stmt: HranaStmtBody }
  | { type: "close" };

type HranaWireValue =
  | { type: "null" }
  | { type: "integer"; value: string }
  | { type: "float"; value: number }
  | { type: "text"; value: string }
  | { type: "blob"; base64: string };

const MIN_I64 = -(2n ** 63n);
const MAX_I64 = 2n ** 63n - 1n;

function toHranaStmt(sql: string, params: unknown[]): HranaStmtBody {
  return { sql, args: params.map(toHranaWireValue), want_rows: true };
}

function toHranaWireValue(value: unknown): HranaWireValue {
  if (value === null) return { type: "null" };
  if (typeof value === "bigint") {
    if (value < MIN_I64 || value > MAX_I64) {
      throw new RangeError(
        `bunny-db: bigint ${value} does not fit in a signed 64-bit integer`,
      );
    }
    return { type: "integer", value: value.toString() };
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new RangeError(`bunny-db: ${value} is not a finite number`);
    }
    // Integral JS numbers bind as Hrana integers so the server stores them
    // with INTEGER storage class; everything else binds as float.
    if (Number.isSafeInteger(value)) {
      return { type: "integer", value: value.toString() };
    }
    return { type: "float", value };
  }
  if (typeof value === "string") return { type: "text", value };
  if (value instanceof Uint8Array) {
    return { type: "blob", base64: bytesToBase64(value) };
  }
  throw new TypeError(
    `bunny-db: unsupported parameter type ${describeType(value)}; supported: null, number, bigint, string, Uint8Array`,
  );
}

function describeType(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString(
    "base64",
  );
}

// ---------------------------------------------------------------------------
// Wire decoding (response side)
// ---------------------------------------------------------------------------

interface PipelineResponseBody {
  baton?: string;
  results?: unknown[];
}

function decodeStreamResult(
  entry: unknown,
  index: number,
  request: HranaPipelineRequest,
): unknown {
  if (entry === null || typeof entry !== "object") {
    throw new BunnyDbError(`BunnyDb pipeline result ${index} is not an object`, {
      statementIndex: index,
    });
  }
  const result = entry as {
    type?: string;
    response?: unknown;
    error?: { message?: string; code?: string };
  };
  // "ok" is the canonical tag per the Hrana reference client; "response"
  // is accepted as an alias because several protocol drafts use it.
  if (result.type === "ok" || result.type === "response") {
    return decodeStreamResponse(result.response, index, request);
  }
  if (result.type === "error") {
    const message = result.error?.message ?? "unknown server error";
    const code = result.error?.code;
    throw new BunnyDbError(
      `BunnyDb pipeline statement ${index} failed: ${message}${
        code ? ` (code ${code})` : ""
      }`,
      { code, statementIndex: index },
    );
  }
  throw new BunnyDbError(
    `BunnyDb pipeline result ${index} has unknown type ${String(result.type)}`,
    { statementIndex: index },
  );
}

function decodeStreamResponse(
  response: unknown,
  index: number,
  request: HranaPipelineRequest,
): unknown {
  if (request.type === "close") {
    return null; // close responses carry no payload
  }
  if (response === null || typeof response !== "object") {
    throw new BunnyDbError(`BunnyDb pipeline response ${index} is not an object`, {
      statementIndex: index,
    });
  }
  const resp = response as { type?: string; result?: unknown };
  if (resp.type !== "execute" && resp.type !== undefined) {
    throw new BunnyDbError(
      `BunnyDb pipeline response ${index} has unexpected response type ${String(
        resp.type,
      )}`,
      { statementIndex: index },
    );
  }
  // resp.type === "execute" wraps the payload in `result`; tolerate a bare
  // payload (no inner tag) as an alias.
  const payload = resp.type === undefined ? resp : resp.result;
  return decodeExecResult(payload, index);
}

function decodeExecResult(payload: unknown, index: number): BunnyDbExecResult {
  if (payload === null || typeof payload !== "object") {
    throw new BunnyDbError(
      `BunnyDb execute result ${index} is not an object`,
      { statementIndex: index },
    );
  }
  const p = payload as {
    cols?: unknown;
    rows?: unknown;
    affected_row_count?: unknown;
    last_insert_rowid?: unknown;
  };
  if (!Array.isArray(p.cols) || !Array.isArray(p.rows)) {
    throw new BunnyDbError(
      `BunnyDb execute result ${index} is missing cols/rows`,
      { statementIndex: index },
    );
  }
  const cols = p.cols.map((c, i) => {
    if (typeof c === "string") return { name: c };
    if (c !== null && typeof c === "object" && typeof (c as { name?: unknown }).name === "string") {
      const col = c as { name: string; decltype?: unknown };
      return {
        name: col.name,
        decltype: typeof col.decltype === "string" ? col.decltype : undefined,
      };
    }
    throw new BunnyDbError(
      `BunnyDb execute result ${index} column ${i} is malformed`,
      { statementIndex: index },
    );
  });
  const rows = p.rows.map((row, r) => {
    if (!Array.isArray(row)) {
      throw new BunnyDbError(
        `BunnyDb execute result ${index} row ${r} is not an array`,
        { statementIndex: index },
      );
    }
    return row.map((cell, c) => decodeHranaCell(cell, index, r, c));
  });
  const affectedRowCount = typeof p.affected_row_count === "number" ? p.affected_row_count : 0;
  const lastInsertRowId =
    p.last_insert_rowid === undefined || p.last_insert_rowid === null
      ? undefined
      : decodeHranaInteger(p.last_insert_rowid, `result ${index} last_insert_rowid`);
  return { cols, rows, affectedRowCount, lastInsertRowId };
}

function decodeHranaCell(
  cell: unknown,
  index: number,
  row: number,
  col: number,
): BunnyDbCell {
  if (cell === null || typeof cell !== "object" || typeof (cell as { type?: unknown }).type !== "string") {
    throw new BunnyDbError(
      `BunnyDb execute result ${index} cell [${row}][${col}] is not a tagged Hrana value`,
      { statementIndex: index },
    );
  }
  const v = cell as { type: string; value?: unknown; base64?: unknown };
  switch (v.type) {
    case "null":
      return null;
    case "integer":
      return decodeHranaInteger(v.value, `cell [${row}][${col}]`);
    case "float":
      if (typeof v.value !== "number") {
        throw new BunnyDbError(
          `BunnyDb cell [${row}][${col}] float value is not a number`,
          { statementIndex: index },
        );
      }
      return v.value;
    case "text":
      if (typeof v.value !== "string") {
        throw new BunnyDbError(
          `BunnyDb cell [${row}][${col}] text value is not a string`,
          { statementIndex: index },
        );
      }
      return v.value;
    case "blob":
      if (typeof v.base64 !== "string") {
        throw new BunnyDbError(
          `BunnyDb cell [${row}][${col}] blob base64 is not a string`,
          { statementIndex: index },
        );
      }
      return base64ToBytes(v.base64);
    default:
      throw new BunnyDbError(
        `BunnyDb cell [${row}][${col}] has unknown value type ${v.type}`,
        { statementIndex: index },
      );
  }
}

/** Hrana integers travel as strings (64-bit safety). Decoded to number
 *  when within the JS safe range, bigint otherwise — mirroring
 *  @libsql/client's default "number" IntMode. */
function decodeHranaInteger(value: unknown, what: string): number | bigint {
  if (typeof value === "number") return value; // tolerate numeric form
  if (typeof value !== "string") {
    throw new BunnyDbError(`BunnyDb ${what}: integer value is neither string nor number`);
  }
  const big = BigInt(value); // throws RangeError on malformed strings — correct
  return isSafeIntegerValue(big) ? Number(big) : big;
}

function isSafeIntegerValue(big: bigint): boolean {
  return big >= BigInt(Number.MIN_SAFE_INTEGER) && big <= BigInt(Number.MAX_SAFE_INTEGER);
}

function base64ToBytes(base64: string): Uint8Array {
  const buf = Buffer.from(base64, "base64");
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

// ---------------------------------------------------------------------------
// Result mapping (shared shape with the other adapters)
// ---------------------------------------------------------------------------

function execResultToQueryResult<T>(result: BunnyDbExecResult): SQLQueryResult<T> {
  const names = result.cols.map((c) => c.name);
  const rows = result.rows.map((cells) => {
    // Plain object keyed by column name; duplicate column names collapse
    // (last one wins), matching the other adapters.
    const row: Record<string, unknown> = {};
    names.forEach((name, i) => {
      row[name] = cells[i];
    });
    return row as T;
  });
  return {
    rows,
    rowsAffected: result.affectedRowCount,
    lastInsertRowId: result.lastInsertRowId,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Read an env var without throwing if process.env is unavailable
 *  (test/edge environments sometimes omit it). */
function readEnv(name: string): string | undefined {
  if (typeof process === "undefined" || typeof process.env !== "object") return undefined;
  const v = process.env[name];
  return typeof v === "string" && v !== "" ? v : undefined;
}

/** A short, non-credential-leaking description of a fetch failure. */
function describeTransportError(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  return String(cause);
}
