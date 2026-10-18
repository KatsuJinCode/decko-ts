// BunnyDbDriver — SQLDatabaseDriver speaking the Bunny Database SQL API.
//
// Bunny Database is Bunny.net's managed libSQL/SQLite-compatible service.
// The wire protocol on its public SQL endpoint is Hrana v2 over HTTP — the
// SAME protocol the libsql-http adapter uses (POST /v2/pipeline, tagged
// {type, value} args, "close" terminator, one round trip per pipeline).
//
// This file is a fresh, self-contained adapter that targets Bunny's URL
// shape rather than reusing libsql-http internals, for two reasons:
//   1. The task scope says libsql-http.ts is maintained separately; an adapter that
//      doesn't import it is insulated from churn in that file.
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
//   - COLD-RENDER RELIABILITY. A cold page
//     render on the edge is a LONG SERIAL CHAIN of pipeline POSTs — measured
//     in the thousands of HTTP round trips, megabytes of database
//     response, to produce a single small page. Wall time
//     is therefore the SUM of that many independent hop latencies, and this
//     driver must put an upper bound on every term of that sum and retry a
//     transient failure:
//       - without a timeout, `signal` is undefined and a single stalled POST
//         can wait indefinitely. The only backstop is the platform killing
//         the script, which answers with an opaque 5xx after a long wait.
//       - a single transport failure anywhere in the chain propagates
//         straight out of pipeline() and becomes a 500 error page for a
//         page that renders fine on the next attempt.
//     Both are handled below and are on BY DEFAULT: DEFAULT_PIPELINE_TIMEOUT_MS
//     bounds every hop, and one bounded retry absorbs a transient hop.

import type { SQLDatabaseDriver, SQLQueryResult, SQLStatement, SQLTransactionGuarantee } from "../../server/driver.js";
import { isDatabaseBusyError, retryWhileBusy, TransactionGate } from "../../server/driver.js";
import { inTransactionStatementScope, runInTransactionStatementScope } from "../../server/transaction-statement-scope.js";

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
  /** Whole-request timeout in milliseconds (per pipeline POST). UNSET now
   *  means DEFAULT_PIPELINE_TIMEOUT_MS, not "no timeout": a cold render is
   *  ~1,000 serial hops, so one unbounded hop is an unbounded request.
   *  Pass 0 to opt out explicitly (the offline test doubles rely on it). */
  timeoutMs?: number;
  /** Extra attempts after a transport failure or a retryable HTTP status
   *  (429 / 5xx). Default DEFAULT_PIPELINE_RETRIES (1); 0 disables. */
  retries?: number;
  /** Override for global fetch; tests pass a mock here. */
  fetchImpl?: typeof fetch;
  /** Pluggable instrumentation hook; the default is a no-op counter. */
  queryCounter?: BunnyDbQueryCounter;
}

/** Per-pipeline-POST abort budget when the caller names none. A healthy hop
 *  on the edge measures in the tens of milliseconds, and the worst single hop
 *  observed on a cold render measured ~700 ms, so 15,000 ms is a large
 *  margin on the worst legitimate hop.
 *
 *  This bound is deliberately generous: an earlier, tighter value was NOT
 *  safely above every legitimate hop. Whole-deck recursive walks (one
 *  measured 1.87 MB / 3.8 s warm from the edge, longer for a visitor at
 *  network distance) blew the per-hop abort, produced
 *  "Pipeline Transport failed ... signal timed out", and made the site
 *  unloadable. Query scoping fixed the underlying cost; the default
 *  stays at 15,000 ms — above the scoped queries' worst case with
 *  headroom, below the 20,000 ms render budget the edge entry enforces over
 *  the whole chain (DEFAULT_EDGE_RENDER_BUDGET_MS) — and the edge entry
 *  resolves it from DECKO_EDGE_PIPELINE_TIMEOUT_MS so it retunes without a
 *  republish (resolveEdgePipelineTimeoutMs, same pattern as the budget). */
export const DEFAULT_PIPELINE_TIMEOUT_MS = 15_000;

/** One retry: a transient reset or a 5xx from the database is a single-hop
 *  event, and a cold chain has hundreds of opportunities to hit one. */
export const DEFAULT_PIPELINE_RETRIES = 1;

/** Backoff before the retry attempt. Long enough not to hammer a struggling
 *  database, short enough that the retry still fits inside the render budget. */
export const PIPELINE_RETRY_BACKOFF_MS = 120;

export class BunnyDbError extends Error {
  /** HTTP status when the failure was transport-level; undefined for
   *  in-band server-reported errors that came back with 200 OK. */
  readonly status?: number;
  /** Server-reported code (Hrana error code string) when available. */
  readonly code?: string;
  /** Zero-based pipeline index of the failing statement when known. */
  readonly statementIndex?: number;
  /**
   * True ONLY when the request never produced an HTTP response — DNS
   * failure, connection reset, abort at the per-pipeline timeout. This is
   * the discriminator the retry predicate needs, and it cannot be inferred
   * from `status`: an in-band Hrana statement error (the SQL is wrong) ALSO
   * arrives with no HTTP status, and retrying that would double the latency
   * of a request that is going to fail no matter how often it is sent.
   */
  readonly transport: boolean;

  constructor(
    message: string,
    opts: {
      status?: number;
      code?: string;
      statementIndex?: number;
      transport?: boolean;
    } = {},
  ) {
    super(message);
    this.name = "BunnyDbError";
    this.status = opts.status;
    this.code = opts.code;
    this.statementIndex = opts.statementIndex;
    this.transport = opts.transport === true;
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
  private readonly retries: number;
  private readonly fetchImpl: typeof fetch;
  private readonly counter: BunnyDbQueryCounterLike;

  constructor(options: BunnyDbOptions = {}) {
    const { url, authToken, timeoutMs, retries, fetchImpl, queryCounter } = options;

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
    // UNSET is no longer "unbounded". A cold render is a ~1,000-hop serial
    // chain (measured: 1,151 hops for one 76-byte page), so a single
    // unbounded hop makes the whole request unbounded. `0` remains the
    // explicit opt-out for callers that genuinely want a bare fetch (the
    // offline protocol test doubles).
    this.timeoutMs =
      timeoutMs === undefined
        ? DEFAULT_PIPELINE_TIMEOUT_MS
        : timeoutMs > 0
          ? timeoutMs
          : undefined;
    this.retries =
      retries === undefined ? DEFAULT_PIPELINE_RETRIES : Math.max(0, Math.trunc(retries));
    this.fetchImpl = fetchImpl ?? fetch.bind(globalThis);
    this.counter = queryCounter ?? DEFAULT_NOOP_COUNTER;
  }

  /** A real libSQL transaction on one Hrana stream; see transaction(). */
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
  /** The open transaction's stream (latest baton, URL to send it to). */
  private stream: { baton: string; url: string } | undefined;
  private streamTail: Promise<void> = Promise.resolve();
  /** When the open transaction's BEGIN succeeded (Date.now()). */
  private streamOpenedAt = 0;

  // -- transaction-scoped read memo ------------------------------------------
  //
  // A save is one long write transaction that re-reads the same handful of
  // constant rows over and over: the owner card's save issued 259 separate
  // `SELECT * FROM cards WHERE id = ? LIMIT 1` statements, 92
  // `SELECT codename FROM cards WHERE id = ?`, and so on — 699 reads of which
  // 352 were repeats of a (sql, args) pair already answered earlier in the
  // SAME transaction (measured: tools/diagnose-owner-save-statement-ladder.mjs,
  // docs/reports/save-server-time-budget-2026-10-18.md). Each read is its own
  // pipeline POST, and on the live host every POST is a real network round
  // trip, so wall = hops x hop latency.
  //
  // The memo lives exactly as long as the transaction does: it is created when
  // BEGIN succeeds and dropped on every terminal path (COMMIT, ROLLBACK, close,
  // a lost baton). Nothing is cached across transactions, so no request can
  // ever be answered from another request's view of the database.
  //
  // CORRECTNESS. A memoized read must not outlive a write that could change its
  // answer. The rules, in order of how much they can see:
  //   - Only reads are memoized. A statement whose leading keyword is not
  //     SELECT/WITH, or a WITH that contains a mutating word once string
  //     literals and comments are stripped, is never cached.
  //   - A write invalidates every memoized read that depends on the table the
  //     write targets, PLUS every table a trigger ON that table writes (the
  //     deck carries 18 `bump_deck_data_version` triggers; a write to `cards`
  //     really does change `deck_data_version`, and a rule that ignored that
  //     would serve a stale version number). The trigger graph is READ FROM
  //     THE DATABASE at the start of the transaction rather than hardcoded
  //     here, so it tracks whatever schema the deck actually carries.
  //   - A write whose target cannot be determined, and any statement the
  //     classifier does not recognize (BEGIN/COMMIT/PRAGMA/CREATE/VACUUM/...),
  //     drops the WHOLE memo. Unknown is treated as unsafe; a rule that guessed
  //     would be a cache that silently answers with a stale row.
  private readMemo: Map<string, ReadMemoEntry> | undefined;
  /** In flight + resolved form of this transaction's trigger graph. */
  private triggerGraph: Promise<Map<string, Set<string> | null>> | undefined;
  private triggerGraphMap: Map<string, Set<string> | null> | undefined;
  /** False when sqlite_master could not be read, so no invalidation may be
   *  narrowed on the assumption that a table has no triggers. */
  private triggerGraphUsable = true;

  /** Drop the memo and its trigger graph. Called on every path that ends the
   *  transaction's stream, so no entry can survive into the next transaction. */
  private clearReadMemo(): void {
    this.readMemo = undefined;
    this.triggerGraph = undefined;
    this.triggerGraphMap = undefined;
    this.triggerGraphUsable = true;
  }

  /** Decodes the results of requests sent on the open transaction's
   *  stream. Bunny Database ends an interactive transaction that has been
   *  open for 5 seconds and answers the next statement on it with
   *  TRANSACTION_TIMEOUT; that error says how long the transaction had been
   *  open and which statement was refused. */
  private decodeOnStream(results: unknown[], requests: HranaPipelineRequest[]): unknown[] {
    return results.map((entry, i) => {
      try {
        return decodeStreamResult(entry, i, requests[i]);
      } catch (error) {
        if (!(error instanceof BunnyDbError) || error.code !== "TRANSACTION_TIMEOUT") throw error;
        const request = requests[i];
        const sql = request.type === "execute" ? request.stmt.sql.replace(/\s+/g, " ").slice(0, 80) : request.type;
        throw new BunnyDbError(
          `${error.message} after the transaction had been open ${Date.now() - this.streamOpenedAt} ms; refused statement: ${sql}`,
          { code: error.code, statementIndex: error.statementIndex },
        );
      }
    });
  }

  /**
   * Runs `work` inside one libSQL transaction on a Hrana stream: a pipeline
   * that does not end with "close" keeps its server connection open and
   * returns a baton, which the next pipeline sends to continue on it
   * (Hrana's HTTP stream protocol, as @libsql/hrana-client implements it;
   * BEGIN IMMEDIATE is what @libsql/client sends for a write transaction).
   * Every statement issued through this driver while `work` runs goes to
   * the stream, one request at a time. Requests on the stream are never
   * retried: a baton is single-use, and a lost stream has already rolled
   * the transaction back. Stand-alone queries keep their retry.
   */
  async transaction<R>(work: () => Promise<R>): Promise<R> {
    return this.gate.run(async () =>
      // Mark work's call tree as transaction work (transaction-statement-scope.ts):
      // every statement issued inside it — across every await — attributes to
      // this transaction and rides the stream; a statement issued OUTSIDE any
      // transaction's tree while this stream is open is routed away from it
      // (query/batch below), so an unrelated request's statement can no longer
      // join, extend, or be rolled back with this transaction.
      runInTransactionStatementScope(async () => {
        // Another connection holding the write lock makes BEGIN IMMEDIATE
        // fail; wait for it, up to the lock timeout. Only BEGIN is retried:
        // the same answer to a statement inside the transaction means the
        // save failed, and it surfaces from work().
        await retryWhileBusy(
          async () => {
            const begin: HranaPipelineRequest[] = [{ type: "execute", stmt: toHranaStmt("BEGIN IMMEDIATE", []) }];
            const opened = await this.streamPipeline(begin, { url: this.pipelineUrl });
            if (opened.baton !== undefined) this.stream = { baton: opened.baton, url: opened.url };
            try {
              opened.results.forEach((entry, i) => decodeStreamResult(entry, i, begin[i]));
            } catch (error) {
              await this.endStream(undefined).catch(() => undefined);
              throw error;
            }
            if (opened.baton === undefined) {
              // Bunny documents baton sessions but asks customers who need them
              // to ask for them; a database without them closes every stream,
              // and a save cannot be made atomic there. Refuse rather than write
              // statement by statement.
              throw new BunnyDbError(
                "BunnyDb did not keep the stream open (no baton returned): interactive sessions are not available on this database, and an atomic save needs one (docs/decisions/0007-atomic-saves-and-transaction-contract.md)",
              );
            }
          },
          undefined,
          undefined,
          isBunnyBeginBusy,
        );
        this.streamOpenedAt = Date.now();
        this.readMemo = new Map();
        this.triggerGraph = undefined;
        let result: R;
        try {
          result = await work();
        } catch (error) {
          await this.endStream("ROLLBACK").catch(() => undefined);
          throw error;
        }
        try {
          await this.endStream("COMMIT");      } catch (error) {
          if (this.stream !== undefined) await this.endStream("ROLLBACK").catch(() => undefined);
          throw error;
        }
        return result;
      }),
    );
  }

  private async endStream(verb: "COMMIT" | "ROLLBACK" | undefined): Promise<void> {
    await this.streamTail;
    const stream = this.stream;
    if (stream === undefined) return;
    const requests: HranaPipelineRequest[] =
      verb === undefined ? [{ type: "close" }] : [{ type: "execute", stmt: toHranaStmt(verb, []) }, { type: "close" }];
    try {
      const ended = await this.streamPipeline(requests, stream);
      this.decodeOnStream(ended.results, requests);
    } finally {
      this.stream = undefined;
      this.clearReadMemo();
    }
  }

  /** Runs execute requests on the open stream, queued behind any request
   *  already in flight on it. */
  private sendOnStream(requests: HranaPipelineRequest[]): Promise<unknown[]> {
    const run = this.streamTail.then(async () => {
      const stream = this.stream;
      if (stream === undefined) throw new BunnyDbError("BunnyDb transaction stream is closed");
      const response = await this.streamPipeline(requests, stream);
      if (response.baton === undefined) {
        this.stream = undefined;
        this.clearReadMemo();
        throw new BunnyDbError("BunnyDb closed the transaction's stream (no baton returned)");
      }
      this.stream = { baton: response.baton, url: response.url };
      // Decoded after the baton is kept, so a failed statement can still be
      // rolled back on its stream.
      return this.decodeOnStream(response.results, requests);
    });
    this.streamTail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  /** One POST on a stream: no retry, the baton in the body, the base_url
   *  the server names (if any) kept for the next request. */
  private async streamPipeline(
    requests: HranaPipelineRequest[],
    target: { url: string; baton?: string },
  ): Promise<{ results: unknown[]; baton?: string; url: string }> {
    const headers: Record<string, string> = { "content-type": "application/json", "accept-encoding": "gzip, identity" };
    if (this.authToken !== undefined) headers.authorization = `Bearer ${this.authToken}`;
    let response: Response;
    try {
      response = await this.fetchImpl(target.url, {
        method: "POST",
        headers,
        body: JSON.stringify(target.baton === undefined ? { requests } : { baton: target.baton, requests }),
        signal: this.timeoutMs !== undefined ? AbortSignal.timeout(this.timeoutMs) : undefined,
      });
    } catch (cause) {
      throw new BunnyDbError(`BunnyDb pipeline transport failed: ${describeTransportError(cause)}`, { transport: true });
    }
    if (!response.ok) {
      const bodySnippet = (await response.text().catch(() => "")).slice(0, 500);
      throw new BunnyDbError(
        `BunnyDb pipeline request failed: HTTP ${response.status} ${response.statusText}${bodySnippet ? `: ${bodySnippet}` : ""}`,
        { status: response.status },
      );
    }
    const decoded = (await readPipelineJson(response)) as PipelineResponseBody;
    if (decoded === null || typeof decoded !== "object" || !Array.isArray(decoded.results)) {
      throw new BunnyDbError("BunnyDb pipeline response has no results array (protocol violation)");
    }
    if (decoded.results.length !== requests.length) {
      throw new BunnyDbError(
        `BunnyDb pipeline response count mismatch: sent ${requests.length} requests, got ${decoded.results.length} results`,
      );
    }
    const baton = typeof decoded.baton === "string" ? decoded.baton : undefined;
    const url =
      typeof decoded.base_url === "string" && decoded.base_url !== ""
        ? `${decoded.base_url.replace(/\/+$/, "")}/v2/pipeline`
        : target.url;
    return { results: decoded.results, baton, url };
  }

  async query<T = unknown>(sql: string, params: unknown[]): Promise<SQLQueryResult<T>> {
    const stmt = toHranaStmt(sql, params);
    // A statement issued OUTSIDE any transaction's call tree while another
    // request's transaction holds this driver object's stream is not part of
    // that transaction, and must not ride its baton: riding it coupled the
    // statement's fate to the transaction (a save's ROLLBACK silently undid
    // an unrelated request's already-acknowledged write) and let its reads
    // see the transaction's uncommitted rows. A standalone READ runs on its
    // own pipeline — the database is SQLite (WAL), so a reader does not wait
    // for the writer. A standalone WRITE queues behind the open transaction
    // through the gate and runs as its own unit, which is the wait-then-
    // succeed behavior a second writer gets on every transactional database.
    // Where attribution is impossible (no AsyncLocalStorage on the runtime),
    // the historical shared-object coupling applies, per src/server/driver.ts.
    if (this.stream !== undefined && inTransactionStatementScope() === false) {
      if (cachedSqlFacts(sql).isRead) {
        this.counter.recordQuery(sql);
        const results = await this.pipeline([{ type: "execute", stmt }, { type: "close" }]);
        return execResultToQueryResult<T>(results[0] as BunnyDbExecResult);
      }
      return this.transaction(() => this.query<T>(sql, params));
    }
    // Inside a transaction, a repeated read of the same (sql, args) is
    // answered from the memo instead of the wire. A memo hit performs NO
    // database operation, so it does not reach the counter below either: the
    // query-count metric counts DB operations, and a cache hit is not one.
    const memo = this.stream !== undefined ? this.readMemo : undefined;
    const facts = memo !== undefined ? cachedSqlFacts(sql) : undefined;
    if (memo !== undefined && facts !== undefined && facts.isRead) {
      const key = readMemoKey(sql, stmt.args);
      const hit = memo.get(key);
      if (hit !== undefined) return execResultToQueryResult<T>(hit.result);
      this.counter.recordQuery(sql);
      const fresh = (await this.sendOnStream([{ type: "execute", stmt }]))[0] as BunnyDbExecResult;
      memo.set(key, { dependsOn: facts.dependsOn, result: fresh });
      return execResultToQueryResult<T>(fresh);
    }
    this.counter.recordQuery(sql);
    if (this.stream !== undefined) {
      const onStream = await this.sendOnStream([{ type: "execute", stmt }]);
      // Invalidate AFTER the write has been sent, not before. The memo is only
      // consulted by reads and no read can be issued between these two awaits,
      // so the ordering makes no difference to what a later read may see — and
      // it keeps the statements on the wire exactly as the caller wrote them,
      // with no bookkeeping statement pushed in front of the caller's own.
      if (memo !== undefined) await this.invalidateReadMemo(sql);
      return execResultToQueryResult<T>(onStream[0] as BunnyDbExecResult);
    }
    const results = await this.pipeline([
      { type: "execute", stmt },
      { type: "close" },
    ]);
    const first = results[0] as BunnyDbExecResult;
    return execResultToQueryResult<T>(first);
  }

  async batch(statements: SQLStatement[]): Promise<SQLQueryResult[]> {
    if (statements.length === 0) return [];
    // Standalone routing for a batch, same rule as query() above: outside
    // any transaction's call tree, a batch must not ride another request's
    // open transaction. An all-read batch goes on its own pipeline; a batch
    // containing any write queues behind the open transaction through the
    // gate and runs as its own unit.
    if (this.stream !== undefined && inTransactionStatementScope() === false) {
      const allReads = statements.every((s) => cachedSqlFacts(s.sql).isRead);
      if (allReads) {
        const requests: HranaPipelineRequest[] = statements.map((s) => ({ type: "execute", stmt: toHranaStmt(s.sql, s.params) }));
        for (const s of statements) this.counter.recordQuery(s.sql);
        const raw = (await this.pipeline([...requests, { type: "close" }])).slice(0, requests.length) as BunnyDbExecResult[];
        return raw.map((result) => execResultToQueryResult<unknown>(result));
      }
      return this.transaction(() => this.batch(statements));
    }
    const memo = this.stream !== undefined ? this.readMemo : undefined;

    // A batch executes in order on the server, so a write at position k
    // invalidates what position k+1 may read. Walk the batch once against the
    // memo as it stands BEFORE the batch, drop the reads it already holds, and
    // apply each write's invalidation in the order the writes appear. A read
    // repeated WITHIN the batch is not answered from an earlier element of the
    // same batch (that answer does not exist yet) — it executes, as before.
    const requests: HranaPipelineRequest[] = [];
    /** One entry per INPUT statement, in order: where its answer comes from. */
    const plan: Array<{ hit: ReadMemoEntry | null; store: { key: string; dependsOn: Set<string> | null } | null }> = [];
    for (const s of statements) {
      const stmt = toHranaStmt(s.sql, s.params);
      if (memo !== undefined && cachedSqlFacts(s.sql).isRead) {
        const key = readMemoKey(s.sql, stmt.args);
        const hit = memo.get(key);
        if (hit !== undefined) {
          plan.push({ hit, store: null });
          continue;
        }
        this.counter.recordQuery(s.sql);
        requests.push({ type: "execute", stmt });
        plan.push({ hit: null, store: { key, dependsOn: cachedSqlFacts(s.sql).dependsOn } });
        continue;
      }
      if (memo !== undefined) await this.invalidateReadMemo(s.sql);
      this.counter.recordQuery(s.sql);
      requests.push({ type: "execute", stmt });
      plan.push({ hit: null, store: null });
    }

    /** Raw decoded results for the statements actually sent, in order. */
    let raw: BunnyDbExecResult[];
    if (this.stream !== undefined) {
      raw = (await this.sendOnStream(requests)) as BunnyDbExecResult[];
    } else {
      raw = (await this.pipeline([...requests, { type: "close" }])).slice(0, requests.length) as BunnyDbExecResult[];
    }

    const answers: SQLQueryResult[] = [];
    let taken = 0;
    for (const p of plan) {
      if (p.hit !== null) {
        answers.push(execResultToQueryResult<unknown>(p.hit.result));
        continue;
      }
      const result = raw[taken];
      taken += 1;
      answers.push(execResultToQueryResult<unknown>(result));
      if (memo !== undefined && p.store !== null) {
        memo.set(p.store.key, { dependsOn: p.store.dependsOn, result });
      }
    }
    return answers;
  }

  /** Read the current accumulated query count from the instrumentation
   *  hook. Returns 0 when no counter was injected and the no-op default
   *  is in use. */
  queryCount(): number {
    return this.counter.count();
  }

  // -----------------------------------------------------------------------
  // Transaction-scoped read memo (see the field block above for the rules)
  // -----------------------------------------------------------------------

  /**
   * Read this database's trigger graph once per transaction: for each table,
   * the set of tables its triggers write. Read from sqlite_master rather than
   * hardcoded so the invalidation rule tracks whatever schema the deck really
   * carries.
   *
   * This is one extra statement per transaction. It buys correctness (the deck
   * really does carry 18 triggers that write `deck_data_version` from a write
   * to `cards`) at a cost the save ladder cannot see, because a save issues no
   * read of a trigger-written table at all.
   */
  private async loadTriggerGraph(): Promise<void> {
    if (this.triggerGraph !== undefined) { await this.triggerGraph; return; }
    this.triggerGraph = (async () => {
      const graph = new Map<string, Set<string> | null>();
      let rows: BunnyDbExecResult;
      try {
        rows = (await this.sendOnStream([
          {
            type: "execute",
            stmt: toHranaStmt("SELECT tbl_name, sql FROM sqlite_master WHERE type = 'trigger'", []),
          },
        ]))[0] as BunnyDbExecResult;
      } catch {
        // Could not read the graph at all. Mark it unusable rather than
        // pretending there are no triggers: every write must then drop the
        // whole memo.
        this.triggerGraphUsable = false;
        return graph;
      }
      for (const row of rows.rows) {
        const tbl = row[0];
        if (typeof tbl !== "string") continue;
        const name = tbl.toLowerCase();
        if (graph.get(name) === null) continue; // already "may touch anything"
        const targets = triggerWriteTargets(typeof row[1] === "string" ? row[1] : "");
        if (targets === null) {
          graph.set(name, null);
          continue;
        }
        graph.set(name, new Set([...(graph.get(name) ?? []), ...targets]));
      }
      this.triggerGraphMap = graph;
      return graph;
    })();
    await this.triggerGraph;
  }

  /**
   * Every table a write to `target` can change, or null when that cannot be
   * proven. null means "drop the whole memo" — the unknown-is-unsafe
   * direction, the same rule the deletion paths use.
   */
  private writeEffect(target: string): Set<string> | null {
    if (!this.triggerGraphUsable || this.triggerGraphMap === undefined) return null;
    const viaTriggers = this.triggerGraphMap.get(target);
    if (viaTriggers === null) return null;
    return new Set([target, ...(viaTriggers ?? [])]);
  }

  /** Apply one statement's invalidation to the memo. */
  private async invalidateReadMemo(sql: string): Promise<void> {
    const memo = this.readMemo;
    if (memo === undefined) return;
    const target = cachedSqlFacts(sql).writeTarget;
    if (target === null) {
      memo.clear();
      return;
    }
    await this.loadTriggerGraph();
    const effect = this.writeEffect(target);
    if (effect === null) {
      memo.clear();
      return;
    }
    for (const [key, entry] of memo) {
      if (entry.dependsOn === null) { memo.delete(key); continue; }
      for (const t of effect) {
        if (entry.dependsOn.has(t)) { memo.delete(key); break; }
      }
    }
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  /** Send one pipeline POST and decode every response entry.
   *
   *  ONE BOUNDED RETRY (cold-render reliability). A cold render
   *  is hundreds of serial hops, so the chain has that many chances to meet a
   *  single transient event — a TCP reset, a gateway timeout, a 429. Without
   *  this, any one of them propagated straight out and became a 500 error
   *  page for a card that renders fine on the next attempt (the
   *  operator-visible symptom: a 500 on first load, 200 on retry). Retried:
   *  transport
   *  failures and HTTP 429/5xx. NOT retried: a 4xx (the request is wrong;
   *  the same request will be wrong again) and any in-band Hrana statement
   *  error (the SQL is wrong; see decodeStreamResult, which throws outside
   *  this loop) — retrying those would just double the latency of a render
   *  that is going to fail anyway.
   */
  private async pipeline(requests: HranaPipelineRequest[]): Promise<unknown[]> {
    // ACCEPT-ENCODING: left to the runtime, the
    // database gateway answered with brotli, and compressing cost it about
    // 2 s per decoded MB before the first byte (a 1.77 MB answer: 3.7 s with
    // brotli, 0.9 s uncompressed, 0.5 s with gzip). Ask for gzip, or no
    // encoding. readPipelineJson inflates a gzip body itself when the
    // runtime hands it over still compressed.
    const headers: Record<string, string> = { "content-type": "application/json", "accept-encoding": "gzip, identity" };
    if (this.authToken !== undefined) {
      headers.authorization = `Bearer ${this.authToken}`;
    }
    const body = JSON.stringify({ requests });

    let lastError: BunnyDbError | undefined;
    for (let attempt = 0; attempt <= this.retries; attempt += 1) {
      if (attempt > 0) await delay(PIPELINE_RETRY_BACKOFF_MS);
      try {
        return await this.attemptPipeline(headers, body, requests);
      } catch (err) {
        // Only the two retryable classes below are worth another attempt.
        // Everything else is rethrown unchanged so behavior for a genuine
        // SQL error is exactly what it was.
        if (err instanceof BunnyDbError && !isRetryablePipelineError(err)) throw err;
        lastError = err instanceof BunnyDbError ? err : new BunnyDbError(String(err));
        if (attempt === this.retries) break;
      }
    }
    throw (
      lastError ??
      new BunnyDbError("BunnyDb pipeline failed with no recorded error (unreachable)")
    );
  }

  /** One attempt: POST the pipeline and decode every response entry. */
  private async attemptPipeline(
    headers: Record<string, string>,
    body: string,
    requests: HranaPipelineRequest[],
  ): Promise<unknown[]> {
    let response: Response;
    try {
      response = await this.fetchImpl(this.pipelineUrl, {
        method: "POST",
        headers,
        body,
        signal:
          this.timeoutMs !== undefined ? AbortSignal.timeout(this.timeoutMs) : undefined,
      });
    } catch (cause) {
      // Transport-level failures (DNS, refused, reset, abort at the
      // per-pipeline timeout). Never include credentials in the message.
      throw new BunnyDbError(
        `BunnyDb pipeline transport failed: ${describeTransportError(cause)}`,
        { transport: true },
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
    const decoded = (await readPipelineJson(response)) as PipelineResponseBody;
    if (decoded === null || typeof decoded !== "object" || !Array.isArray(decoded.results)) {
      throw new BunnyDbError(
        "BunnyDb pipeline response has no results array (protocol violation)",
      );
    }
    if (decoded.results.length !== requests.length) {
      throw new BunnyDbError(
        `BunnyDb pipeline response count mismatch: sent ${requests.length} requests, got ${decoded.results.length} results`,
      );
    }
    return decoded.results.map((entry, i) => decodeStreamResult(entry, i, requests[i]));
  }
}

/** The pipeline's JSON body. A runtime that leaves a gzip body compressed
 *  (some do once the caller sets Accept-Encoding itself) is detected by the
 *  gzip magic bytes, which no JSON text starts with, and inflated here. */
async function readPipelineJson(response: Response): Promise<unknown> {
  if (typeof response.arrayBuffer !== "function") return await response.json();
  let bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
    if (typeof DecompressionStream !== "function") {
      throw new BunnyDbError("BunnyDb pipeline response is gzip-compressed and this runtime cannot inflate it");
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new BunnyDbError("BunnyDb pipeline response is not JSON (protocol violation)");
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
  // An unset parameter binds as NULL, as the local driver's better-sqlite3
  // binding does (src/server/drivers/local-sqlite.ts), so both drivers store
  // the same row for the same call.
  if (value === null || value === undefined) return { type: "null" };
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
  baton?: string | null;
  base_url?: string | null;
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
// Transaction-scoped read memo — SQL classification helpers
//
// These answer one question about a statement: may its result be reused
// later in this transaction, and if not, which tables' memoized reads must
// die? Every rule here errs toward "do not reuse" and "invalidate more",
// because the failure being prevented is a save that silently stores or
// renders a stale row.
// ---------------------------------------------------------------------------

/** One memoized read and the tables its answer depends on. `dependsOn` is
 *  null when the statement's tables could not be identified — such an entry
 *  is dropped by ANY write, because nothing can rule it out. */
interface ReadMemoEntry {
  dependsOn: Set<string> | null;
  result: BunnyDbExecResult;
}

/**
 * Remove the parts of a statement that must not be read as SQL structure:
 * string/identifier literals and comments. Without this, a card named
 * "Update" would make `SELECT ... WHERE name = 'Update'` look like a write.
 * Blobs are already sent out of band; `x'...'` blobs are consumed here too.
 */
function stripSqlNoise(sql: string): string {
  let out = "";
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    if (ch === "'" || ch === '"' || ch === "`") {
      const quote = ch;
      i += 1;
      while (i < sql.length) {
        if (sql[i] === quote) {
          if (sql[i + 1] === quote) { i += 2; continue; } // doubled = escaped
          i += 1;
          break;
        }
        i += 1;
      }
      out += " ";
      continue;
    }
    if (ch === "-" && sql[i + 1] === "-") {
      while (i < sql.length && sql[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "/" && sql[i + 1] === "*") {
      i += 2;
      while (i < sql.length && !(sql[i] === "*" && sql[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/**
 * Everything about a statement the memo needs, derived from its TEXT ALONE.
 * A save issues the same few hundred SQL texts over and over, and deriving
 * these facts means stripping literals and running several regexes — work
 * that must not be repeated per occurrence, because at ~0.5 ms per hop on the
 * local loopback transport the CPU this wastes is visible in the measurement
 * (measured: the first cut of this memo raised the local save's total;dur
 * while cutting its hops, which is the wrong trade).
 */
interface SqlFacts {
  isRead: boolean;
  /** The table a write targets; null when it cannot be determined. */
  writeTarget: string | null;
  /** Tables a read's answer depends on; null when none could be named. */
  dependsOn: Set<string> | null;
}

function sqlFactsOf(sql: string): SqlFacts {
  const stripped = stripSqlNoise(sql).trimStart();
  const isRead = /^SELECT\b/i.test(stripped)
    ? true
    : /^WITH\b/i.test(stripped)
      ? !/\b(?:INSERT|UPDATE|DELETE|REPLACE)\b/i.test(stripped)
      : false;
  if (isRead) {
    const tables = new Set<string>();
    const re = /\b(?:FROM|JOIN)\s+"?([A-Za-z_][A-Za-z0-9_]*)"?/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(stripped)) !== null) tables.add(m[1].toLowerCase());
    return { isRead: true, writeTarget: null, dependsOn: tables.size === 0 ? null : tables };
  }
  const m = /^(?:INSERT(?:\s+OR\s+\w+)?\s+INTO|UPDATE|DELETE\s+FROM)\s+"?([A-Za-z_][A-Za-z0-9_]*)"?/i.exec(stripped);
  return { isRead: false, writeTarget: m === null ? null : m[1].toLowerCase(), dependsOn: null };
}

/** Bounded, so a workload with unbounded distinct SQL cannot grow it without
 *  limit; a save's working set is a few hundred entries. */
const SQL_FACTS_CACHE_LIMIT = 1024;
const sqlFactsCache = new Map<string, SqlFacts>();

function cachedSqlFacts(sql: string): SqlFacts {
  const hit = sqlFactsCache.get(sql);
  if (hit !== undefined) return hit;
  const facts = sqlFactsOf(sql);
  if (sqlFactsCache.size >= SQL_FACTS_CACHE_LIMIT) sqlFactsCache.clear();
  sqlFactsCache.set(sql, facts);
  return facts;
}

/** The table a write targets, or null when it cannot be determined (null is
 *  the "drop the whole memo" case). Only the LEADING verb's table counts: a
 *  statement's other FROM/JOIN tables are things it READS, not writes, and
 *  treating them as write targets would discard memoized reads for no reason. */
function writeTargetTable(stripped: string): string | null {
  const m = /^(?:INSERT(?:\s+OR\s+\w+)?\s+INTO|UPDATE|DELETE\s+FROM)\s+"?([A-Za-z_][A-Za-z0-9_]*)"?/i.exec(
    stripped.trimStart(),
  );
  return m === null ? null : m[1].toLowerCase();
}

/** The tables a trigger body writes, or null when the body contains something
 *  this cannot account for (an unrecognized statement inside BEGIN...END). */
function triggerWriteTargets(body: string): Set<string> | null {
  const stripped = stripSqlNoise(body);
  // Everything through the first BEGIN is the trigger HEADER
  // (`CREATE TRIGGER ... AFTER UPDATE ON "cards" BEGIN`), not a statement:
  // scanning it for verbs finds the UPDATE inside "AFTER UPDATE ON" and
  // concludes that every trigger is unparseable.
  const header = /^\s*CREATE\s+TRIGGER\b[\s\S]*?\bBEGIN\b/i.exec(stripped);
  const inner = header === null ? stripped : stripped.slice(header[0].length);
  const targets = new Set<string>();
  for (const raw of inner.split(";")) {
    const statement = raw.trim();
    if (statement === "" || /^END$/i.test(statement)) continue;
    const target = writeTargetTable(statement);
    if (target === null) return null;
    targets.add(target);
  }
  return targets;
}

/** The memo key: the statement's text and its already-encoded wire args. Two
 *  reads collide only when they are the same statement with the same
 *  parameters. Uses the Hrana encoding rather than the raw params so the key
 *  is JSON-safe for bigints and blobs too. */
function readMemoKey(sql: string, args: HranaWireValue[]): string {
  return `${sql}\u0000${JSON.stringify(args)}`;
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

/** Is this failure worth one more attempt? Three classes, and only the
 *  first two are transient by nature:
 *   - a TRANSPORT failure (no HTTP response at all: reset, DNS, abort at the
 *     per-pipeline timeout) — one hop, one bad moment;
 *   - HTTP 429 / 5xx — the database or a gateway in front of it is briefly
 *     unable, which a cold render meets ~1,000 chances to find out;
 *   - everything else is deterministic: a 4xx means the REQUEST is wrong, and
 *     an in-band Hrana statement error (a `code`, no HTTP status) means the
 *     SQL is wrong. Retrying those only doubles the latency of a request that
 *     was always going to fail. */
function isRetryablePipelineError(error: BunnyDbError): boolean {
  if (error.transport) return true;
  if (error.code !== undefined) return false;
  if (error.status === undefined) return false;
  return error.status === 429 || (error.status >= 500 && error.status <= 599);
}

/** Whether a failed BEGIN IMMEDIATE means another connection holds the write
 *  lock. Besides SQLite's "database is locked", Bunny Database waits on the
 *  lock and then answers "Transaction timed out" with code
 *  TRANSACTION_TIMEOUT (observed on a real Bunny database with two writers,
 *  docs/hosted-conformance.md). Used for BEGIN only. */
function isBunnyBeginBusy(error: unknown): boolean {
  if (error instanceof BunnyDbError && error.code === "TRANSACTION_TIMEOUT") return true;
  return isDatabaseBusyError(error);
}

/** Promise-returning sleep. Deliberately not a busy wait: the retry exists to
 *  give a struggling database a moment, and the render budget is finite. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
