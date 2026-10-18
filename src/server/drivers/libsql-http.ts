// LibSqlHttpAdapter — SQLDatabaseDriver speaking Hrana v2 (JSON encoding)
// over HTTP, the wire protocol libSQL/Turso servers expose.
//
// Wire contract, verified against the reference implementation shipped in
// this repo's dependency tree (@libsql/hrana-client lib-esm/shared/
// json_encode.js and json_decode.js, plus http/client.js where the
// "v2/pipeline" endpoint is defined):
//
//   POST <url>/v2/pipeline
//   Authorization: Bearer <token>        (when a token is configured)
//   {"requests": [
//     {"type": "execute", "stmt": {"sql": "...", "args": [...], "want_rows": true}},
//     ...,
//     {"type": "close"}
//   ]}
//
// Each request gets one entry in the response's "results" array, in order:
//
//   {"type": "ok", "response": {"type": "execute", "result": {
//      "cols": [{"name": "...", "decltype": null}],
//      "rows": [[{"type": "integer", "value": "42"}, ...], ...],
//      "affected_row_count": 1,
//      "last_insert_rowid": "7"          (optional; 64-bit int as a string)
//   }}}
//   {"type": "error", "error": {"message": "...", "code": "..."}}
//
// Hrana values are tagged objects: {"type": "null"}, {"type": "integer",
// "value": "<digits-as-string>"}, {"type": "float", "value": <number>},
// {"type": "text", "value": "..."}, {"type": "blob", "base64": "..."}.
//
// batch() is a real multi-execute pipeline: every statement goes into the
// SAME POST body (one HTTP round trip), followed by one "close". Unlike
// LocalSqliteDriver.batch and D1 batch, a Hrana pipeline is NOT
// transactional — each execute commits on the server as it runs — so
// `transactionGuarantee.atomicBatch` is false. Inside transaction() a batch
// is part of the transaction.
//
// transaction() is a real libSQL transaction on one Hrana STREAM. A
// pipeline that ends without "close" keeps its stream (one server-side
// connection) open, and the response carries a `baton` (and optionally a
// `base_url`) that the next pipeline must send to continue on that stream
// (Hrana spec, "HTTP" section; the reference client @libsql/hrana-client
// http/stream.js does exactly this, and @libsql/client starts its "write"
// transactions with BEGIN IMMEDIATE). So transaction() sends BEGIN IMMEDIATE
// without close, runs every statement issued meanwhile on the stream with
// the latest baton, and ends with COMMIT (or ROLLBACK) plus close. A stream
// the server drops (idle expiry, restart) takes its uncommitted transaction
// with it, which is a rollback.

import type { SQLDatabaseDriver, SQLQueryResult, SQLStatement, SQLTransactionGuarantee } from "../driver.js";
import { retryWhileBusy, TransactionGate } from "../driver.js";
import { inTransactionStatementScope, runInTransactionStatementScope } from "../transaction-statement-scope.js";

export interface LibSqlHttpOptions {
  /** Base URL of the libSQL server, e.g. "https://db.example.turso.io" or
   *  "http://127.0.0.1:8080". A trailing slash is tolerated. */
  url: string;
  /** Sent as `Authorization: Bearer <token>` when present. */
  authToken?: string;
  /** Whole-request timeout in milliseconds (per pipeline POST). */
  timeoutMs?: number;
  /** Override for global fetch; the mock-server tests use real fetch
   *  against a node:http server, so this stays optional. */
  fetchImpl?: typeof fetch;
}

export class LibSqlHttpError extends Error {
  /** HTTP status when the failure was transport-level, else undefined. */
  readonly status?: number;
  /** Hrana error code string when the server reported one. */
  readonly code?: string;
  /** Zero-based pipeline index of the failing statement, when known. */
  readonly statementIndex?: number;

  constructor(message: string, opts: { status?: number; code?: string; statementIndex?: number } = {}) {
    super(message);
    this.name = "LibSqlHttpError";
    this.status = opts.status;
    this.code = opts.code;
    this.statementIndex = opts.statementIndex;
  }
}

/** Decoded Hrana execute result, before row-object mapping. */
export interface HranaExecResult {
  cols: { name: string; decltype?: string | null }[];
  rows: HranaValue[][];
  affectedRowCount: number;
  lastInsertRowId?: number | bigint;
}

export type HranaValue = null | number | bigint | string | Uint8Array;

export class LibSqlHttpAdapter implements SQLDatabaseDriver {
  private readonly baseUrl: string;
  private readonly authToken?: string;
  private readonly timeoutMs?: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: LibSqlHttpOptions) {
    this.baseUrl = options.url.replace(/\/+$/, "");
    this.authToken = options.authToken;
    this.timeoutMs = options.timeoutMs;
    this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
  }

  readonly transactionGuarantee: SQLTransactionGuarantee = {
    mechanism: "native",
    atomicOnFailure: true,
    crashRecovery: "database",
    readersIsolated: true,
    serializedWriters: "database",
    atomicBatch: false,
    idsReusedAfterRollback: true,
  };

  private readonly gate = new TransactionGate();
  /** The open transaction's stream: the latest baton and the URL to send
   *  it to. Undefined outside transaction(). */
  private stream: { baton: string; url: string } | undefined;

  async query<T = unknown>(sql: string, params: unknown[]): Promise<SQLQueryResult<T>> {
    const results = await this.send([{ type: "execute" as const, stmt: toHranaStmt(sql, params) }]);
    const first = results[0] as HranaExecResult;
    return execResultToQueryResult<T>(first);
  }

  async batch(statements: SQLStatement[]): Promise<SQLQueryResult[]> {
    if (statements.length === 0) return [];
    const requests: HranaPipelineRequest[] = statements.map((s) => ({
      type: "execute" as const,
      stmt: toHranaStmt(s.sql, s.params),
    }));
    // ONE POST carries every statement: the "one round trip" contract.
    const results = await this.send(requests);
    return results
      .slice(0, statements.length)
      .map((r) => execResultToQueryResult(r as HranaExecResult));
  }

  async transaction<R>(work: () => Promise<R>): Promise<R> {
    return this.gate.run(async () =>
      // Mark work's call tree as transaction work (transaction-statement-scope.ts):
      // statements issued inside it attribute to this transaction and ride
      // the stream; statements issued outside any transaction's tree while
      // this stream is open are routed away from it (send above), so an
      // unrelated request's statement can no longer join, extend, or be
      // rolled back with this transaction.
      runInTransactionStatementScope(async () => {
        // Another connection holding the write lock makes BEGIN IMMEDIATE
        // fail at once; wait for it, up to the lock timeout.
        await retryWhileBusy(async () => {
          const begin: HranaPipelineRequest[] = [{ type: "execute", stmt: toHranaStmt("BEGIN IMMEDIATE", []) }];
          const opened = await this.pipeline(begin, { url: this.pipelineUrl(this.baseUrl) });
          if (opened.baton === undefined) {
            throw new LibSqlHttpError("libsql server returned no baton for an open stream (protocol violation)");
          }
          this.stream = { baton: opened.baton, url: opened.url };
          try {
            opened.results.forEach((entry, i) => decodeStreamResult(entry, i, begin[i]));
          } catch (error) {
            // BEGIN failed (the database is busy, for one): close the stream.
            await this.endStream(undefined).catch(() => undefined);
            throw error;
          }
        });
        let result: R;
        try {
          result = await work();
        } catch (error) {
          await this.endStream("ROLLBACK").catch(() => undefined);
          throw error;
        }
        try {
          await this.endStream("COMMIT");
        } catch (error) {
          // A failed COMMIT leaves the transaction open on the stream; end it.
          if (this.stream !== undefined) await this.endStream("ROLLBACK").catch(() => undefined);
          throw error;
        }
        return result;
      }),
    );
  }

  /** Sends COMMIT or ROLLBACK and closes the stream. The stream is
   *  forgotten whatever happens: a server that fails the request has
   *  dropped or will expire it, taking any open transaction with it. */
  private async endStream(verb: "COMMIT" | "ROLLBACK" | undefined): Promise<void> {
    await this.streamTail;
    const stream = this.stream;
    if (stream === undefined) return;
    const requests: HranaPipelineRequest[] =
      verb === undefined ? [{ type: "close" }] : [{ type: "execute", stmt: toHranaStmt(verb, []) }, { type: "close" }];
    try {
      const ended = await this.pipeline(requests, stream);
      ended.results.forEach((entry, i) => decodeStreamResult(entry, i, requests[i]));
    } finally {
      this.stream = undefined;
    }
  }

  /** Runs the requests on the open transaction's stream, or, outside a
   *  transaction, as a stand-alone pipeline closed at the end. A statement
   *  issued OUTSIDE any transaction's call tree while another request's
   *  transaction holds this driver object's stream is routed away from that
   *  stream (see the standalone branch): riding it coupled the statement's
   *  fate to the transaction — a save's ROLLBACK silently undid an
   *  unrelated request's already-acknowledged write — and let its reads see
   *  the transaction's uncommitted rows. */
  private async send(requests: HranaPipelineRequest[]): Promise<unknown[]> {
    if (this.stream !== undefined && inTransactionStatementScope() === false) {
      // Standalone relative to the open transaction: a read-shaped request
      // runs as its own closed pipeline (SQLite WAL — a reader does not wait
      // for the writer); anything else queues behind the open transaction
      // through the gate as its own unit, the wait-then-succeed a second
      // writer gets on every transactional database. Where attribution is
      // impossible (no AsyncLocalStorage on the runtime), the historical
      // shared-stream coupling applies, per ../driver.ts. The read test is
      // deliberately narrow: a statement that does not begin with SELECT is
      // treated as a write and queued, never guessed into the fast path.
      const allReads = requests.every((r) => r.type === "close" || /^\s*SELECT\b/i.test(r.stmt.sql));
      if (allReads) return this.sendNow(requests, true);
      return this.transaction(() => this.send(requests));
    }
    if (this.stream === undefined) return this.sendNow(requests);
    // A stream takes one request at a time (each needs the baton the last
    // one returned), so concurrent callers queue.
    const run = this.streamTail.then(() => this.sendNow(requests));
    this.streamTail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private streamTail: Promise<void> = Promise.resolve();

  private async sendNow(requests: HranaPipelineRequest[], forceStandalone = false): Promise<unknown[]> {
    const stream = forceStandalone ? undefined : this.stream;
    const all: HranaPipelineRequest[] = stream === undefined ? [...requests, { type: "close" }] : requests;
    const response = await this.pipeline(all, stream === undefined ? { url: this.pipelineUrl(this.baseUrl) } : stream);
    if (stream !== undefined) {
      if (response.baton === undefined) {
        this.stream = undefined;
        throw new LibSqlHttpError("libsql server closed the transaction's stream (no baton returned)");
      }
      this.stream = { baton: response.baton, url: response.url };
    }
    // Decoding throws on the first failed statement — after the baton is
    // kept, so the transaction can still be rolled back on its stream.
    return response.results.map((entry, i) => decodeStreamResult(entry, i, all[i]));
  }

  private pipelineUrl(base: string): string {
    return `${base.replace(/\/+$/, "")}/v2/pipeline`;
  }

  /** Send one pipeline POST. Returns the raw result entries (decoded by
   *  the caller), the baton the server issued for a stream left open, and
   *  the URL the next request on that stream goes to. */
  private async pipeline(
    requests: HranaPipelineRequest[],
    target: { url: string; baton?: string },
  ): Promise<{ results: unknown[]; baton?: string; url: string }> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.authToken !== undefined) {
      headers.authorization = `Bearer ${this.authToken}`;
    }
    const response = await this.fetchImpl(target.url, {
      method: "POST",
      headers,
      body: JSON.stringify(target.baton === undefined ? { requests } : { baton: target.baton, requests }),
      signal: this.timeoutMs !== undefined ? AbortSignal.timeout(this.timeoutMs) : undefined,
    });
    if (!response.ok) {
      const bodySnippet = (await response.text().catch(() => "")).slice(0, 500);
      throw new LibSqlHttpError(
        `libsql pipeline request failed: HTTP ${response.status} ${response.statusText}${bodySnippet ? `: ${bodySnippet}` : ""}`,
        { status: response.status },
      );
    }
    const body = (await response.json()) as PipelineResponseBody;
    if (body === null || typeof body !== "object" || !Array.isArray(body.results)) {
      throw new LibSqlHttpError("libsql pipeline response has no results array (protocol violation)");
    }
    if (body.results.length !== requests.length) {
      throw new LibSqlHttpError(
        `libsql pipeline response count mismatch: sent ${requests.length} requests, got ${body.results.length} results`,
      );
    }
    const baton = typeof body.baton === "string" ? body.baton : undefined;
    const url = typeof body.base_url === "string" && body.base_url !== "" ? this.pipelineUrl(body.base_url) : target.url;
    return { results: body.results, baton, url };
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
      throw new RangeError(`libsql-http: bigint ${value} does not fit in a signed 64-bit integer`);
    }
    return { type: "integer", value: value.toString() };
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new RangeError(`libsql-http: ${value} is not a finite number`);
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
    `libsql-http: unsupported parameter type ${describeType(value)}; supported: null, number, bigint, string, Uint8Array`,
  );
}

function describeType(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64");
}

// ---------------------------------------------------------------------------
// Wire decoding (response side)
// ---------------------------------------------------------------------------

interface PipelineResponseBody {
  baton?: string | null;
  base_url?: string | null;
  results?: unknown[];
}

function decodeStreamResult(entry: unknown, index: number, request: HranaPipelineRequest): unknown {
  if (entry === null || typeof entry !== "object") {
    throw new LibSqlHttpError(`libsql pipeline result ${index} is not an object`, { statementIndex: index });
  }
  const result = entry as { type?: string; response?: unknown; error?: { message?: string; code?: string } };
  // "ok" is the canonical tag per the reference client; "response" is
  // accepted as an alias because several protocol drafts use it.
  if (result.type === "ok" || result.type === "response") {
    return decodeStreamResponse(result.response, index, request);
  }
  if (result.type === "error") {
    const message = result.error?.message ?? "unknown server error";
    const code = result.error?.code;
    throw new LibSqlHttpError(
      `libsql pipeline statement ${index} failed: ${message}${code ? ` (code ${code})` : ""}`,
      { code, statementIndex: index },
    );
  }
  throw new LibSqlHttpError(`libsql pipeline result ${index} has unknown type ${String(result.type)}`, {
    statementIndex: index,
  });
}

function decodeStreamResponse(response: unknown, index: number, request: HranaPipelineRequest): unknown {
  if (request.type === "close") {
    return null; // close responses carry no payload
  }
  if (response === null || typeof response !== "object") {
    throw new LibSqlHttpError(`libsql pipeline response ${index} is not an object`, { statementIndex: index });
  }
  const resp = response as { type?: string; result?: unknown };
  if (resp.type !== "execute" && resp.type !== undefined) {
    throw new LibSqlHttpError(
      `libsql pipeline response ${index} has unexpected response type ${String(resp.type)}`,
      { statementIndex: index },
    );
  }
  // resp.type === "execute" wraps the payload in `result`; tolerate a bare
  // payload (no inner tag) as an alias.
  const payload = resp.type === undefined ? resp : resp.result;
  return decodeExecResult(payload, index);
}

function decodeExecResult(payload: unknown, index: number): HranaExecResult {
  if (payload === null || typeof payload !== "object") {
    throw new LibSqlHttpError(`libsql execute result ${index} is not an object`, { statementIndex: index });
  }
  const p = payload as {
    cols?: unknown;
    rows?: unknown;
    affected_row_count?: unknown;
    last_insert_rowid?: unknown;
  };
  if (!Array.isArray(p.cols) || !Array.isArray(p.rows)) {
    throw new LibSqlHttpError(`libsql execute result ${index} is missing cols/rows`, { statementIndex: index });
  }
  const cols = p.cols.map((c, i) => {
    if (typeof c === "string") return { name: c }; // tolerate v1-style string cols
    if (c !== null && typeof c === "object" && typeof (c as { name?: unknown }).name === "string") {
      const col = c as { name: string; decltype?: unknown };
      return {
        name: col.name,
        decltype: typeof col.decltype === "string" ? col.decltype : undefined,
      };
    }
    throw new LibSqlHttpError(`libsql execute result ${index} column ${i} is malformed`, { statementIndex: index });
  });
  const rows = p.rows.map((row, r) => {
    if (!Array.isArray(row)) {
      throw new LibSqlHttpError(`libsql execute result ${index} row ${r} is not an array`, { statementIndex: index });
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

function decodeHranaCell(cell: unknown, index: number, row: number, col: number): HranaValue {
  if (cell === null || typeof cell !== "object" || typeof (cell as { type?: unknown }).type !== "string") {
    throw new LibSqlHttpError(
      `libsql execute result ${index} cell [${row}][${col}] is not a tagged Hrana value`,
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
        throw new LibSqlHttpError(`libsql cell [${row}][${col}] float value is not a number`, {
          statementIndex: index,
        });
      }
      return v.value;
    case "text":
      if (typeof v.value !== "string") {
        throw new LibSqlHttpError(`libsql cell [${row}][${col}] text value is not a string`, {
          statementIndex: index,
        });
      }
      return v.value;
    case "blob":
      if (typeof v.base64 !== "string") {
        throw new LibSqlHttpError(`libsql cell [${row}][${col}] blob base64 is not a string`, {
          statementIndex: index,
        });
      }
      return base64ToBytes(v.base64);
    default:
      throw new LibSqlHttpError(`libsql cell [${row}][${col}] has unknown value type ${v.type}`, {
        statementIndex: index,
      });
  }
}

/** Hrana integers travel as strings (64-bit safety). Decoded to number when
 *  within the JS safe range, bigint otherwise — mirroring
 *  @libsql/client's default "number" IntMode. */
function decodeHranaInteger(value: unknown, what: string): number | bigint {
  if (typeof value === "number") return value; // tolerate numeric form
  if (typeof value !== "string") {
    throw new LibSqlHttpError(`libsql ${what}: integer value is neither string nor number`);
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

function execResultToQueryResult<T>(result: HranaExecResult): SQLQueryResult<T> {
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
