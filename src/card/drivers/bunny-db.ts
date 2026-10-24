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

import type { SQLDatabaseDriver, SQLQueryResult, SQLStatement, SQLTransactionGuarantee, PrefetchOutcome } from "../../server/driver.js";
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
  //   - NARROWED, AND THE ONLY EXCEPTION: a write whose WHERE and a read's
  //     WHERE pin the same column of the same table to DIFFERENT values, with
  //     the write assigning none of the read's columns, touch no common row.
  //     No uniqueness is claimed (the serving deck's `cards` has no PRIMARY
  //     KEY at all -- PRAGMA table_info(cards) reports pk=0 for every column);
  //     disjointness is a property of the two predicates, not of the data. See
  //     disjointFrom. Everything the rule cannot prove keeps the table-scoped
  //     behaviour above, including every trigger-widened table, since a
  //     trigger body picks its own rows.
  private readMemo: Map<string, ReadMemoEntry> | undefined;
  /**
   * Every value this transaction's statements have PRODUCED so far: the
   * integer cells of the rows they returned, the short text cells (the
   * engine binds a row's key or codename back into a later statement just
   * as it does an id), and the rowid an insert took.
   *
   * WHY IT EXISTS. The admission rule asks whether a statement binds a
   * value produced INSIDE the open run. "Inside the run" is the whole
   * meaning of the rule, and a value the transaction produced BEFORE the
   * run is not inside it — the caller already held that value, so binding
   * it is not a dependency at all. Without this set the rule cannot tell
   * the two apart, and it reads every coincidence as a dependency: the
   * save's block prefetches a card row and then binds that card's TYPE id,
   * which the same block's earlier row also carried as a cell — the type
   * id was known long before the block started, and the rule must not
   * throw the block away over it.
   *
   * The set is the transaction's, and it dies with the transaction: it is
   * created with the memo and dropped on every terminal path.
   */
  private producedValues: Set<string> = new Set();
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
      this.recordProduced(fresh);
      memo.set(key, { dependsOn: facts.dependsOn, pinned: pinRead(facts, stmt.args), result: fresh });
      return execResultToQueryResult<T>(fresh);
    }
    this.counter.recordQuery(sql);
    if (this.stream !== undefined) {
      const onStream = await this.sendOnStream([{ type: "execute", stmt }]);
      this.recordProduced(onStream[0] as BunnyDbExecResult);
      // Invalidate AFTER the write has been sent, not before. The memo is only
      // consulted by reads and no read can be issued between these two awaits,
      // so the ordering makes no difference to what a later read may see — and
      // it keeps the statements on the wire exactly as the caller wrote them,
      // with no bookkeeping statement pushed in front of the caller's own.
      const written = onStream[0] as BunnyDbExecResult;
      if (memo !== undefined) await this.invalidateReadMemo(sql, stmt.args, written.lastInsertRowId);
      return execResultToQueryResult<T>(onStream[0] as BunnyDbExecResult);
    }
    const results = await this.pipeline([
      { type: "execute", stmt },
      { type: "close" },
    ]);
    const first = results[0] as BunnyDbExecResult;
    this.recordProduced(first);
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
    const plan: Array<{
      hit: ReadMemoEntry | null;
      store: { key: string; dependsOn: Set<string> | null; pinned: PinnedRead | null } | null;
    }> = [];
    for (const s of statements) {
      const stmt = toHranaStmt(s.sql, s.params);
      const batchFacts = memo !== undefined ? cachedSqlFacts(s.sql) : undefined;
      if (memo !== undefined && batchFacts !== undefined && batchFacts.isRead) {
        const key = readMemoKey(s.sql, stmt.args);
        const hit = memo.get(key);
        if (hit !== undefined) {
          plan.push({ hit, store: null });
          continue;
        }
        this.counter.recordQuery(s.sql);
        requests.push({ type: "execute", stmt });
        plan.push({
          hit: null,
          store: { key, dependsOn: batchFacts.dependsOn, pinned: pinRead(batchFacts, stmt.args) },
        });
        continue;
      }
      if (memo !== undefined) await this.invalidateReadMemo(s.sql, stmt.args);
      this.counter.recordQuery(s.sql);
      requests.push({ type: "execute", stmt });
      plan.push({ hit: null, store: null });
    }

    /** Raw decoded results for the statements actually sent, in order. */
    let raw: BunnyDbExecResult[];
    if (requests.length === 0) {
      // EVERY statement in this batch was answered from the memo. A memo hit
      // performs NO database operation (the rule query() already follows, and
      // the counter below only counts what reaches the wire), so the batch
      // performs none either: an empty pipeline would be a POST that carries
      // no statement, which is a round trip spent on nothing.
      raw = [];
    } else if (this.stream !== undefined) {
      raw = (await this.sendOnStream(requests)) as BunnyDbExecResult[];
    } else {
      raw = (await this.pipeline([...requests, { type: "close" }])).slice(0, requests.length) as BunnyDbExecResult[];
    }

    for (const result of raw) this.recordProduced(result);
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
        memo.set(p.store.key, { dependsOn: p.store.dependsOn, pinned: p.store.pinned, result });
      }
    }
    return answers;
  }

  // -----------------------------------------------------------------------
  // The transport packing: the admission rule and the speculative prefetch
  // (docs/reports/live-save-transport-design-2026-10-18.md, sections 3 and 5)
  // -----------------------------------------------------------------------

  /**
   * Speculatively fetch a card block's constant-id reads, and remember the
   * answers so the block's own reads of them cost no round trip.
   *
   * WHY THIS EXISTS. The save's ladder is 439 pipeline POSTs for 666
   * statements, and 384 of those POSTs carry exactly ONE statement
   * (measured: tools/diagnose-owner-save-statement-ladder.mjs on the
   * save-path family's tip). The engine awaits every answer before it
   * issues the next statement, so no two statements are ever in flight
   * together and a coalescing endpoint would carry exactly zero of them
   * (the design's own measurement: 526 POSTs on 526 distinct event-loop
   * ticks, max 1 POST per tick). The only way to put a card block's reads
   * on one round trip is to fetch them BEFORE the engine asks for them —
   * to speculate — and to answer the engine from what the speculation
   * brought back.
   *
   * THE ADMISSION RULE (the design's core, and this method's whole
   * contract). A statement joins the open run iff
   *
   *   1. it binds no value produced inside that run, and
   *   2. the run is within the cap (statements and bytes).
   *
   * Clause 1 is the load-bearing one, and it is not a guess: the probe
   * (tools/probe-hrana-writeback-batch-20261022.mjs, arm 3) shows that a
   * statement whose bound value is produced inside the same run reads the
   * PRE-write state — the bound value is fixed when the request is sent, so
   * the value can never cross the wire inside a batch. The run's own
   * answers are therefore checked against the run's own value flow, and any
   * statement the check cannot vouch for is NOT remembered: the engine's
   * own read of it then falls back to the blocking path, at the engine's
   * own sequence point, which is exactly where the unbatched execution
   * would have put it.
   *
   * ONLY READS ARE SPECULATED. A write's effect cannot be taken back, so a
   * speculative write is never admitted; a prefetched set that carries one
   * is refused for that statement alone, and the rest of the set still
   * goes.
   *
   * WHERE THE ANSWERS LIVE. A speculation is only useful if something
   * remembers it, and the transaction's read memo is that something: the
   * prefetch's answers go into the memo under the same key the engine's
   * own read of the same statement would use, so the engine's read is a
   * memo hit and reaches no wire at all. The memo's invalidation rules
   * still apply, so a write that lands after the speculation drops the
   * prefetched answer and the engine's read goes to the wire — the
   * blocking path — rather than serving a stale row.
   *
   * WHY IT ONLY WORKS INSIDE A TRANSACTION. Outside one there is no memo
   * to hold the answers, so a speculative fetch would be a round trip whose
   * answers are thrown away. Outside a transaction this method does
   * nothing, and the engine's reads take the ordinary path.
   *
   * @param statements the reads the block will need, in the order it will
   *   need them.
   * @returns one entry per input statement, in order. `result` is the
   *   statement's answer when the run vouched for it; `unverified` is true
   *   when the statement bound a value produced inside its own run, so the
   *   answer is not the one the engine asked for and the engine must take
   *   the blocking path for it.
   */
  async prefetchReads(statements: SQLStatement[]): Promise<PrefetchOutcome[]> {
    const outcomes: PrefetchOutcome[] = statements.map(() => ({ result: undefined, unverified: true }));
    if (statements.length === 0) return outcomes;
    // No transaction, no memo, no use: the answers would have nowhere to live.
    const memo = this.stream !== undefined ? this.readMemo : undefined;
    if (memo === undefined) return outcomes;

    // The run the engine declared, split by the admission rule. A write is
    // never speculated, and a statement the memo already holds needs no
    // speculation at all.
    const wanted: Array<{ statement: SQLStatement; index: number }> = [];
    for (let index = 0; index < statements.length; index += 1) {
      const statement = statements[index] as SQLStatement;
      const facts = cachedSqlFacts(statement.sql);
      if (!facts.isRead) continue;
      const key = readMemoKey(statement.sql, toHranaStmt(statement.sql, statement.params).args);
      const hit = memo.get(key);
      if (hit !== undefined) {
        outcomes[index] = { result: execResultToQueryResult<unknown>(hit.result), unverified: false };
        continue;
      }
      wanted.push({ statement, index });
    }
    if (wanted.length === 0) return outcomes;

    for (const run of admittedRuns(wanted)) {
      await this.speculateRun(run, memo, outcomes);
    }
    return outcomes;
  }

  /** Record the values one statement PRODUCED, so the admission rule can
   *  tell a value the transaction already held from one this transaction's
   *  own statements produced. */
  private recordProduced(result: BunnyDbExecResult | undefined): void {
    if (result === undefined) return;
    for (const value of producedValueKeys(result)) this.producedValues.add(value);
    // The set lives with the driver (one request), so it is bounded rather
    // than exact over all time: past the cap it is cleared, and the rule
    // then reads a cleared value as "not produced before", which is the
    // safe direction (the run is trusted less, never more).
    if (this.producedValues.size > PRODUCED_VALUE_SET_CAP) this.producedValues = new Set();
  }

  /** One admitted run, sent as ONE pipeline POST, checked against its own
   *  value flow, and remembered only where the check vouches for it. */
  private async speculateRun(
    run: Array<{ statement: SQLStatement; index: number }>,
    memo: Map<string, ReadMemoEntry>,
    outcomes: PrefetchOutcome[],
  ): Promise<void> {
    const requests: HranaPipelineRequest[] = run.map(({ statement }) => ({
      type: "execute",
      stmt: toHranaStmt(statement.sql, statement.params),
    }));
    for (const { statement } of run) this.counter.recordQuery(statement.sql);
    let raw: BunnyDbExecResult[];
    try {
      raw = (await this.sendOnStream(requests)) as BunnyDbExecResult[];
    } catch {
      // A speculation that cannot be sent is not an error: the engine's own
      // read of every statement in the run takes the blocking path, which is
      // what the engine would have done without a prefetch.
      return;
    }
    // THE ADMISSION RULE, CHECKED. The flow of values inside this run: what
    // each statement produced, and what each statement bound. A statement
    // that bound a value an EARLIER statement in this same run produced
    // cannot have been answered correctly — the bound value was fixed when
    // the request was sent, so the row it named did not exist yet.
    //
    // "PRODUCED INSIDE THIS RUN" IS THE WHOLE MEANING, and it is narrower
    // than "the value appears in a row this run returned". A value the
    // transaction produced BEFORE the run was already in the caller's hands
    // when the run was built, so binding it is not a dependency: the save's
    // block prefetch reads a card row and then binds that card's TYPE id,
    // and the type id is a cell of the row the block read a moment earlier
    // — but the type id was known long before the block started, and the
    // rule must not throw the block away over it. Only the values the run
    // ITSELF produced count.
    const producedBefore = new Set(this.producedValues);
    const produced: Array<Set<string>> = [];
    const bound: Array<Set<string>> = [];
    for (let i = 0; i < raw.length; i += 1) {
      const fresh = producedValueKeys(raw[i] as BunnyDbExecResult);
      for (const value of [...fresh]) if (producedBefore.has(value)) fresh.delete(value);
      produced.push(fresh);
      const request = requests[i] as HranaPipelineRequest;
      bound.push(request.type === "execute" ? boundValueKeys(request.stmt.args) : new Set<string>());
    }
    let trusted = raw.length;
    for (let i = 0; i < raw.length; i += 1) {
      const binds = bound[i] as Set<string>;
      if (binds.size === 0) continue;
      for (let j = 0; j < i; j += 1) {
        const earlier = produced[j] as Set<string>;
        if (earlier.size === 0) continue;
        let shared = false;
        for (const value of binds) {
          if (earlier.has(value)) { shared = true; break; }
        }
        if (!shared) continue;
        // The statement at i bound a value this run produced: its answer is
        // not the answer the engine asked for. Everything from i on is
        // untrusted — a later statement may have read the earlier wrong
        // state — so the run is trusted only up to i.
        trusted = i;
        break;
      }
    }
    for (const result of raw) this.recordProduced(result);
    for (let i = 0; i < run.length; i += 1) {
      const entry = run[i] as { statement: SQLStatement; index: number };
      const result = raw[i] as BunnyDbExecResult;
      if (i >= trusted) {
        // Not vouched for: the engine's read of this statement takes the
        // blocking path.
        outcomes[entry.index] = { result: undefined, unverified: true };
        continue;
      }
      const facts = cachedSqlFacts(entry.statement.sql);
      memo.set(
        readMemoKey(entry.statement.sql, toHranaStmt(entry.statement.sql, entry.statement.params).args),
        { dependsOn: facts.dependsOn, pinned: pinRead(facts, toHranaStmt(entry.statement.sql, entry.statement.params).args), result },
      );
      outcomes[entry.index] = { result: execResultToQueryResult<unknown>(result), unverified: false };
    }
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
  private async invalidateReadMemo(
    sql: string,
    args: HranaWireValue[],
    insertedRowId?: number | bigint,
  ): Promise<void> {
    const memo = this.readMemo;
    if (memo === undefined) return;
    const facts = cachedSqlFacts(sql);
    const target = facts.writeTarget;
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
    const writePin = facts.isRead ? null : pinWrite(facts, args, insertedRowId);
    // THE TRIGGERS, FOR THE ANSWER-SCOPE RULE. The trigger graph is at the
    // TABLE level: it names the tables a trigger body writes, not the
    // columns. A trigger of the write's own target that reaches that same
    // table could change a column the read's answer is made of, and this
    // driver cannot tell which columns it writes, so the answer-scope rule
    // is switched off for that write.
    const viaTriggers = this.triggerGraphMap?.get(target);
    const triggerTouchesTarget = viaTriggers !== null && viaTriggers !== undefined && viaTriggers.has(target);
    for (const [key, entry] of memo) {
      if (entry.dependsOn === null) { memo.delete(key); continue; }
      let affects = false;
      for (const t of effect) {
        if (entry.dependsOn.has(t)) { affects = true; break; }
      }
      if (!affects) continue;
      // ROW-GRANULAR NARROWING. A read pinned to one row and a write pinned to
      // a different value of the same column cannot share a row, so the write
      // changes no row the read's predicate admits and the read's answer is
      // unchanged. This needs no claim that the column is unique: disjointness
      // is a property of the two predicates, not of the data.
      //
      // TRIGGERS, and why no extra check is needed here. `effect` may name
      // tables this write reaches only through a trigger body, whose rows that
      // body picks and this statement's WHERE cannot constrain. But a pinned
      // read is pinned to exactly ONE table -- predicateOf returns null for a
      // read naming two -- and disjointFrom requires that table to equal the
      // write's target. A trigger-widened table is by definition not the
      // target, so it can never be in a pinned read's dependsOn. The guard this
      // would need was written, mutation-tested, found unreachable, and
      // removed rather than left looking load-bearing.
      if (writePin !== null && entry.pinned !== null) {
        const effect = writeEffectOnRead(entry.pinned, writePin, entry.result, triggerTouchesTarget);
        if (effect === "disjoint") continue;
      }
      memo.delete(key);
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
  /** What this read's WHERE pins down, when it pins down enough for the
   *  disjointness rule below; null when it does not, which keeps the
   *  table-scoped rule. */
  pinned: PinnedRead | null;
  result: BunnyDbExecResult;
}

/** A read that names exactly one row, in the only sense a row identity can be
 *  proved from SQL text: every column its WHERE compares is pinned, and one of
 *  those comparisons is a bound `col = ?`. */
interface PinnedRead {
  /** The read's single table. A read naming two tables has an ambiguous column
   *  name, so it is never pinned. */
  table: string;
  /** Every column the WHERE names, pinned or not. A write that ASSIGNS one of
   *  them can move a row into or out of this read's predicate. */
  columns: Set<string>;
  /** column -> the encoded value this read pins it to. */
  values: Map<string, string>;
  /** EVERY conjunct of the read's WHERE, with its value: the bound ones and
   *  the literal ones. This is the predicate the read's answer depends on,
   *  and it is what an INSERT's new row has to match for the insert to change
   *  the read's answer. */
  conjuncts: Array<{ column: string; value: string }>;
  /** The columns the read's ANSWER is made of: the ones its SELECT list
   *  names. null when the SELECT list is not a plain list of bare columns,
   *  which means the answer may depend on columns this driver cannot name. */
  projected: Set<string> | null;
}

/** The same shape for a write: the rows it can touch, when its WHERE says so. */
interface PinnedWrite {
  table: string;
  /** Columns the write's SET clause assigns. */
  assigned: Set<string>;
  values: Map<string, string>;
  /** The write ADDS a row (an insert). A write that adds a row can put a row
   *  into a read's predicate that was empty before, so the row-identity rule
   *  below does not apply to it; the insert's OWN row values do. */
  addsRow: boolean;
  /** For an insert: the new row's values, for the columns the INSERT's VALUES
   *  clause names as bound arguments or literals. A column whose value is a
   *  SQL expression is absent, and its value is then unknown. */
  rowValues: Map<string, string>;
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
  /** The statement is an INSERT. */
  isInsert: boolean;
  /** The INSERT adds exactly ONE row (its VALUES clause has one tuple). An
   *  insert of several rows takes the LAST rowid, so only a single-row
   *  insert can be pinned by the row it took. */
  singleRowInsert: boolean;
  /** The table a write targets; null when it cannot be determined. */
  writeTarget: string | null;
  /** Tables a read's answer depends on; null when none could be named. */
  dependsOn: Set<string> | null;
  /** The WHERE's pinned columns, or null when the statement does not pin
   *  enough to compare rows (see predicateOf). */
  predicate: WherePin | null;
  /** The columns an UPDATE's SET clause assigns; null when they could not all
   *  be named. */
  assigned: Set<string> | null;
  /** For a single-row INSERT: the columns its VALUES clause names and the
   *  value each one gets. null when the statement is not a plain
   *  column-list-plus-tuple insert. */
  insertShape: InsertShape | null;
  /** The columns a read's ANSWER is made of: the ones its SELECT list names.
   *  null when the SELECT list is not a plain list of bare columns, which
   *  means the answer may depend on columns this driver cannot name. */
  projected: Set<string> | null;
}

/** The row an INSERT adds, as far as the statement's own text describes it:
 *  the column list, and each column's value (a bound argument's index, a
 *  literal, or null for a SQL expression, whose value this driver cannot
 *  know). */
interface InsertShape {
  columns: string[];
  values: Array<{ argIndex: number } | { literal: string } | null>;
}

/** One `col = ?` conjunct, with the placeholder's index in the statement's
 *  argument list (a write's SET list occupies the lower indices). */
interface WherePin {
  table: string;
  columns: Set<string>;
  equalities: Array<{ column: string; argIndex: number }>;
  /** The conjuncts whose value is a LITERAL in the statement's text (a number
   *  or NULL). A string literal does not reach here: stripSqlNoise blanks
   *  quoted runs, so a `col = 'x'` conjunct is not a conjunct this driver
   *  can read, and the whole predicate is declined. */
  literals: Array<{ column: string; literal: string }>;
}

/** Double-quoted, bracketed and backticked identifiers as the bare name, run
 *  BEFORE stripSqlNoise so the engine's `"id"` survives as `id`. stripSqlNoise
 *  blanks any quoted run to a single space, which would hide every quoted key
 *  column from the predicate rule below. */
function normalizeIdentifierQuotes(sql: string): string {
  return sql
    .replace(/"([A-Za-z_][A-Za-z0-9_]*)"/g, "$1")
    .replace(/\[([A-Za-z_][A-Za-z0-9_]*)\]/g, "$1")
    .replace(/`([A-Za-z_][A-Za-z0-9_]*)`/g, "$1");
}

/** One conjunct of a conjunction of plain comparisons. Deliberately the
 *  smallest form that can be read without evaluating anything: no OR, no IN,
 *  no LIKE, no IS NULL, no function call, no parentheses. Anything else makes
 *  the split below a guess, and a guess here is a stale row.
 *
 *  THE UNARY PLUS. A conjunct may carry SQLite's no-op unary plus before the
 *  column (`+trash = 0`), and the deck's own rule walk writes it that way
 *  (src/card/permissions/read-rules.ts, the junction read `WHERE left_id = ?
 *  AND right_id = ? AND +trash = 0`). The plus names the SAME column, so the
 *  conjunct is read as the column it names. Before this, the read was not
 *  read as a conjunction at all, so it was not pinned to a row, so every
 *  write to cards dropped its memoized answer: the measured cost was 66
 *  drops of that one shape in the graded save.
 *
 *  WHY READING IT AS THE COLUMN IS SAFE. The narrowing rules use a conjunct
 *  in two ways, and both are about the COLUMN the conjunct names:
 *
 *    - the column set: a write that ASSIGNS a column the read's WHERE names
 *      may move a row into or out of the read's predicate, so the read's
 *      memoized answer is dropped. The unary plus names `trash`, so a write
 *      that assigns `trash` still drops the read.
 *    - the equalities: only a `?` value contributes an equality, and the
 *      unary plus never carries one.
 *
 *  And where the two forms could differ at all (SQLite coerces a TEXT value
 *  to a number under `+`), the difference is in the READ's own answer, which
 *  this driver never computes: the driver only decides whether a write could
 *  have changed that answer, and a write that touches `trash` drops the read
 *  either way. */
const CONJUNCT = /^\s*\+?([A-Za-z_][A-Za-z0-9_]*)\s*(=|<>|!=|<=|>=|<|>)\s*(\?|[0-9]+(?:\.[0-9]+)?|NULL)\s*$/i;

/** What a statement's WHERE pins down, when it pins down enough. `argOffset`
 *  is how many of the statement's placeholders sit before the WHERE clause. */
function predicateOf(stripped: string, table: string | null, argOffset: number): WherePin | null {
  if (table === null) return null;
  const where = /\bWHERE\b([\s\S]*?)(?=\b(?:ORDER\s+BY|GROUP\s+BY|HAVING|LIMIT)\b|$)/i.exec(stripped)?.[1];
  if (where === undefined) return null;
  // A parenthesis can hide a subquery, a function, or a bracketed OR group;
  // splitting on AND across one of those reads the wrong shape entirely.
  if (/[()]/.test(where)) return null;
  const columns = new Set<string>();
  const equalities: Array<{ column: string; argIndex: number }> = [];
  const literals: Array<{ column: string; literal: string }> = [];
  let argIndex = argOffset;
  for (const conjunct of where.split(/\s+AND\s+/i)) {
    const m = CONJUNCT.exec(conjunct);
    // Only `=` pins a row, and only `?` is a value this driver can compare
    // without evaluating SQL. A literal is recorded in `columns` (a write must
    // still not assign it) but contributes no equality.
    if (m === null || m[2] !== "=") return null;
    columns.add(m[1].toLowerCase());
    if (m[3] === "?") {
      equalities.push({ column: m[1].toLowerCase(), argIndex });
      argIndex += 1;
    } else {
      literals.push({ column: m[1].toLowerCase(), literal: m[3] });
    }
  }
  return equalities.length === 0 ? null : { table, columns, equalities, literals };
}

/** The columns an UPDATE's SET list assigns, or null when any part of it is
 *  not the plain `col = ?` form. A SET list that assigns something unrecognised
 *  means the write may move a row in ways this rule cannot see. */
function assignedColumnsOf(setList: string | undefined): Set<string> | null {
  if (setList === undefined) return new Set(); // DELETE, or INSERT: assigns nothing
  const out = new Set<string>();
  for (const part of setList.split(",")) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\?\s*$/.exec(part);
    if (m === null) return null;
    out.add(m[1].toLowerCase());
  }
  return out;
}

/** Does this INSERT add exactly ONE row? The rowid an execute result
 *  reports is the LAST row an insert took, so a multi-row insert cannot be
 *  pinned by it. The test counts the VALUES clause's top-level tuples: one
 *  tuple means one row. A parenthesis can hide a subquery (the deck's new-card
 *  id is a SQL expression), so the scan tracks depth and skips string
 *  literals. */
function insertHasOneTuple(stripped: string): boolean {
  const values = /\bVALUES\b/i.exec(stripped);
  if (values === null) return false;
  const tail = stripped.slice(values.index + values[0].length);
  let depth = 0;
  let tuples = 0;
  let started = false;
  for (let i = 0; i < tail.length; i += 1) {
    const ch = tail[i];
    if (ch === "'" || ch === String.fromCharCode(34)) {
      // Skip a string literal: a comma inside it is not a tuple separator.
      i += 1;
      while (i < tail.length && tail[i] !== ch) {
        if (tail[i] === ch && tail[i + 1] === ch) i += 1;
        i += 1;
      }
      continue;
    }
    if (ch === "(") { if (depth === 0) { tuples += 1; if (tuples > 1) return false; } depth += 1; started = true; continue; }
    if (ch === ")") { depth -= 1; continue; }
    if (ch === "," && depth === 0) return false;
  }
  return started && tuples === 1;
}

/**
 * The columns a read's ANSWER is made of: the ones its SELECT list names.
 *
 * A read's answer is a projection of the rows its WHERE admits. A write that
 * changes neither the columns the WHERE names nor the columns the SELECT
 * list names cannot change that projection: the rows it touches keep their
 * predicate values, and the values they project are the same values. This
 * is what lets the memo keep an answer the write provably does not touch.
 *
 * THE PARSER IS DELIBERATELY NARROW. It returns null -- "the answer may
 * depend on columns this driver cannot name" -- for every SELECT list that
 * is not a plain comma-separated list of bare column names:
 *
 *   - `*` (the answer is every column, so any write to the row changes it);
 *   - an aggregate or a function call (`COUNT(*)`, `MAX(x)`), whose answer
 *     is computed from rows rather than projected from them;
 *   - an expression or an alias (`AS n`, `a + b`), whose value this driver
 *     cannot trace back to a column;
 *   - a subquery in the list;
 *   - a DISTINCT list (the answer is a set of rows, and this driver does
 *     not model which rows collapse).
 *
 * A null is the SAFE direction: the rule below simply does not apply, and
 * the memo drops the answer as it always did.
 */
function projectedColumnsOf(stripped: string): Set<string> | null {
  if (!/^SELECT\b/i.test(stripped)) return null;
  if (/^WITH\b/i.test(stripped)) return null;
  // A read that names more than one table occurrence also depends on the
  // other table's rows and on the join's columns, so its answer is not made
  // of its own table's columns alone. (See tableOccurrences.)
  if (tableOccurrences(stripped) !== 1) return null;
  const list = /^SELECT\s+([\s\S]*?)\s+FROM\s/i.exec(stripped)?.[1];
  if (list === undefined) return null;
  if (/\*/.test(list)) return null;
  if (/[()[\]]/.test(list)) return null;
  if (/\bAS\b/i.test(list)) return null;
  if (/\bDISTINCT\b/i.test(list)) return null;
  const columns = new Set<string>();
  for (const part of list.split(",")) {
    const item = part.trim();
    const m = /^(?:[A-Za-z_][A-Za-z0-9_]*\.)?([A-Za-z_][A-Za-z0-9_]*)$/.exec(item);
    if (m === null) return null;
    columns.add((m[1] as string).toLowerCase());
  }
  return columns.size === 0 ? null : columns;
}

/**
 * How many table OCCURRENCES a read's FROM and JOIN clauses name.
 *
 * The answer-scope rule (writeEffectOnRead) reasons about the columns the
 * read's own table carries. A read that JOINS another table also depends on
 * that table's rows and on the join's own columns: `FROM cards c JOIN cards
 * t ON t.id = c.type_id` answers the type card's codename, and a write that
 * changes `type_id` changes which row the join picks even though it
 * touches neither the projected column nor the WHERE's columns. So the
 * answer-scope rule applies only to a read that names ONE table occurrence.
 *
 * OCCURRENCES, NOT NAMES. `cards c JOIN cards t` names the table "cards"
 * twice, and the set of NAMES has one member. The rule needs the count. A
 * JOIN of a subquery (`JOIN (SELECT ...)`) counts too: the subquery is
 * another source of rows the read's answer depends on.
 */
function tableOccurrences(stripped: string): number {
  const re = /\b(?:FROM|JOIN)\s+(\(|[A-Za-z_][A-Za-z0-9_]*)/gi;
  let count = 0;
  while (re.exec(stripped) !== null) count += 1;
  return count;
}

function sqlFactsOf(sql: string): SqlFacts {
  const stripped = stripSqlNoise(normalizeIdentifierQuotes(sql)).trimStart();
  const isRead = /^SELECT\b/i.test(stripped)
    ? true
    : /^WITH\b/i.test(stripped)
      ? !/\b(?:INSERT|UPDATE|DELETE|REPLACE)\b/i.test(stripped)
      : false;
  if (isRead) {
    const tables = new Set<string>();
    const re = /\b(?:FROM|JOIN)\s+([A-Za-z_][A-Za-z0-9_]*)/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(stripped)) !== null) tables.add(m[1].toLowerCase());
    return {
      isRead: true,
      isInsert: false,
      singleRowInsert: false,
      writeTarget: null,
      dependsOn: tables.size === 0 ? null : tables,
      // Only a single-table read has an unambiguous column name.
      predicate: predicateOf(stripped, tables.size === 1 ? [...tables][0] : null, 0),
      assigned: null,
      insertShape: null,
      // The columns the read's ANSWER is made of (see projectedColumnsOf).
      projected: projectedColumnsOf(stripped),
    };
  }
  const m = /^(?:INSERT(?:\s+OR\s+\w+)?\s+INTO|UPDATE|DELETE\s+FROM)\s+([A-Za-z_][A-Za-z0-9_]*)/i.exec(stripped);
  const target = m === null ? null : m[1].toLowerCase();
  const setList = /^UPDATE\s/i.test(stripped)
    ? /^UPDATE\s+\S+\s+SET\s+([\s\S]*?)(?=\bWHERE\b|$)/i.exec(stripped)?.[1]
    : undefined;
  // The SET list's placeholders occupy the lower argument indices, so the
  // WHERE's own `?` count has to start after them.
  const argOffset = setList === undefined ? 0 : (setList.match(/\?/g) ?? []).length;
  const isInsert = /^INSERT\b/i.test(stripped);
  const singleRowInsert = isInsert && insertHasOneTuple(stripped);
  return {
    isRead: false,
    isInsert,
    singleRowInsert,
    writeTarget: target,
    dependsOn: null,
    predicate: predicateOf(stripped, target, argOffset),
    assigned: assignedColumnsOf(setList),
    insertShape: singleRowInsert ? insertShapeOf(stripped) : null,
    projected: null,
  };
}

/**
 * THE ROW AN INSERT ADDS, AS THE STATEMENT DESCRIBES IT.
 *
 * An insert's VALUES clause is the description of the row it adds: the
 * column list says which column each value belongs to, and the tuple says
 * what the value is. A value that is a bound argument is known; a value that
 * is a number or NULL is known; a value that is a SQL EXPRESSION is not
 * (the save's new card id is one: it is computed by a subquery over the
 * history tables), and that column's value is then simply absent.
 *
 * The shape is what lets the driver answer the question an insert raises for
 * a memoized read: "can the row this insert adds be in that read's answer?"
 * For a read of a KEY, a JUNCTION or a CODENAME, the new row's own value for
 * that column decides it, and the value is right here in the statement.
 */
function insertShapeOf(stripped: string): InsertShape | null {
  const head = /^\s*INSERT(?:\s+OR\s+\w+)?\s+INTO\s+[A-Za-z_][A-Za-z0-9_]*\s*\(/i.exec(stripped);
  if (head === null) return null;
  const columnList = readBalanced(stripped, head.index + head[0].length - 1);
  if (columnList === null) return null;
  const columns = splitTopLevel(columnList.text, columnList.start)
    .map((piece) => piece.text.trim().toLowerCase())
    .filter((name) => name !== "");
  if (columns.length === 0) return null;
  const values = /\bVALUES\b/i.exec(stripped);
  if (values === null) return null;
  const open = stripped.indexOf("(", values.index);
  if (open < 0) return null;
  const tuple = readBalanced(stripped, open);
  if (tuple === null) return null;
  const elements = splitTopLevel(tuple.text, tuple.start);
  if (elements.length !== columns.length) return null;
  const out: Array<{ argIndex: number } | { literal: string } | null> = [];
  for (const element of elements) {
    const text = element.text.trim();
    if (text === "?") {
      out.push({ argIndex: countPlaceholders(stripped.slice(0, element.start)) });
      continue;
    }
    if (canonicalLiteral(text) !== null) {
      out.push({ literal: text });
      continue;
    }
    // A SQL expression: the value is not known, so the column is absent.
    out.push(null);
  }
  return { columns, values: out };
}

/** The text inside the parenthesis that opens at `open`, and where it
 *  starts. null when the parenthesis never closes. */
function readBalanced(stripped: string, open: number): { text: string; start: number } | null {
  let depth = 0;
  for (let i = open; i < stripped.length; i += 1) {
    const ch = stripped[i];
    if (ch === "(") depth += 1;
    else if (ch === ")") {
      depth -= 1;
      if (depth === 0) return { text: stripped.slice(open + 1, i), start: open + 1 };
    }
  }
  return null;
}

/** The comma-separated pieces of a text, at the top level only: a piece
 *  inside parentheses is not split. `offset` is where the text starts in the
 *  statement, so each piece's own start is absolute. */
function splitTopLevel(text: string, offset: number): Array<{ text: string; start: number }> {
  const out: Array<{ text: string; start: number }> = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "(") depth += 1;
    else if (ch === ")") depth -= 1;
    else if (ch === "," && depth === 0) {
      out.push({ text: text.slice(start, i), start: offset + start });
      start = i + 1;
    }
  }
  out.push({ text: text.slice(start), start: offset + start });
  return out;
}

/** How many `?` placeholders a text holds. */
function countPlaceholders(text: string): number {
  let count = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "?") count += 1;
  }
  return count;
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

/** One pinned value, encoded the same way on both sides of the comparison. */
function encodedArg(args: HranaWireValue[], index: number): string | null {
  if (index < 0 || index >= args.length) return null;
  return JSON.stringify(args[index]);
}

// ---------------------------------------------------------------------------
// Canonical values: the comparable form of a bound value and of a literal.
//
// THE TYPE IS PART OF THE VALUE. SQLite compares a column with no declared
// affinity by type, so the integer 0 and the text "0" are different values:
// a row whose key column holds the integer 0 is not the row a read of the key
// "0" asks for. A canonical value is therefore "i:<integer>", "f:<float>",
// "t:<text>" or "n:" (NULL), and two canonical values are compared as
// canonical values.
// ---------------------------------------------------------------------------

/** A value in the comparable form: the type is part of the value. */
type CanonicalValue = string;

/** The canonical form of a bound argument, or null when the driver cannot
 *  compare it (a blob). */
function canonicalArg(args: HranaWireValue[], index: number): CanonicalValue | null {
  if (index < 0 || index >= args.length) return null;
  const arg = args[index] as HranaWireValue;
  switch (arg.type) {
    case "null":
      return "n:";
    case "integer":
      return `i:${arg.value}`;
    case "float":
      return `f:${arg.value}`;
    case "text":
      return `t:${arg.value}`;
    default:
      return null;
  }
}

/** The canonical form of a literal in a statement's text: a number or NULL.
 *  Anything else (a quoted string, which stripSqlNoise has already blanked)
 *  has no canonical form this driver can compare. */
function canonicalLiteral(literal: string): CanonicalValue | null {
  if (literal === "NULL") return "n:";
  if (/^-?\d+$/.test(literal)) return `i:${literal}`;
  if (/^-?\d+\.\d+$/.test(literal)) return `f:${literal}`;
  return null;
}

/** Are two canonical values the same value, provably different, or
 *  incomparable? "unknown" is the answer that keeps a memoized answer alive
 *  only when the driver can prove the two are different. */
function compareCanonical(one: CanonicalValue, other: CanonicalValue): "same" | "different" | "unknown" {
  if (one === other) return "same";
  // NULL is never equal to anything, not even to NULL: `col = NULL` admits no
  // row at all.
  if (one === "n:" || other === "n:") return "different";
  const oneNumeric = one.startsWith("i:") || one.startsWith("f:");
  const otherNumeric = other.startsWith("i:") || other.startsWith("f:");
  if (oneNumeric && otherNumeric) {
    const a = one.slice(2);
    const b = other.slice(2);
    if (a === b) return "same";
    if (/^-?\d+$/.test(a) && /^-?\d+$/.test(b)) return BigInt(a) === BigInt(b) ? "same" : "different";
    return Number(a) === Number(b) ? "same" : "different";
  }
  if (!oneNumeric && !otherNumeric) return "different";
  // A number and a text: whether they are equal depends on the column's
  // affinity, which this driver does not know. Decline.
  return "unknown";
}

/** The read's pinned row, or null when its WHERE does not pin enough. */
function pinRead(facts: SqlFacts, args: HranaWireValue[]): PinnedRead | null {
  const pin = facts.predicate;
  if (pin === null || facts.isRead === false) return null;
  const values = new Map<string, string>();
  for (const equality of pin.equalities) {
    const encoded = encodedArg(args, equality.argIndex);
    if (encoded === undefined || encoded === null) return null;
    values.set(equality.column, encoded);
  }
  // THE CONJUNCTS: every equality of the read's WHERE, with the value it
  // compares to. The bound ones carry the bound argument; the literal ones
  // carry the literal. This is the predicate an INSERT's new row has to
  // match for the insert to change the read's answer.
  const conjuncts: Array<{ column: string; value: string }> = [];
  for (const equality of pin.equalities) {
    const canonical = canonicalArg(args, equality.argIndex);
    if (canonical === null) return null;
    conjuncts.push({ column: equality.column, value: canonical });
  }
  for (const literal of pin.literals) {
    const canonical = canonicalLiteral(literal.literal);
    if (canonical === null) return null;
    conjuncts.push({ column: literal.column, value: canonical });
  }
  return { table: pin.table, columns: pin.columns, values, conjuncts, projected: facts.projected };
}

/** The write's pinned rows, or null when its WHERE does not pin enough or its
 *  SET list assigns something this rule cannot account for. */
function pinWrite(
  facts: SqlFacts,
  args: HranaWireValue[],
  insertedRowId?: number | bigint,
): PinnedWrite | null {
  // AN INSERT IS PINNED BY THE ROW IT TOOK, AND BY THE ROW'S OWN VALUES.
  //
  // The rowid pin (the first branch) says the insert touched the row whose
  // id is the rowid the execute result reports. It is what stopped the save's
  // card creations from dropping every memoized card row (measured: one
  // INSERT INTO cards dropped 271 memo entries).
  //
  // THE ROW'S OWN VALUES (the second branch) are what a read of a KEY, a
  // JUNCTION or a CODENAME needs. An insert adds one row, and the row's
  // values are in the statement's own VALUES clause: the key, the two sides,
  // the codename and the trash flag are all bound arguments there. A read
  // whose predicate the new row provably does NOT satisfy is unaffected by
  // the insert, whatever the rowid pin says. (Before this, every card
  // creation dropped every memoized by-key, by-junction and by-codename read
  // in the transaction: measured, 35 of the graded save's reads.)
  if (facts.isInsert && facts.singleRowInsert && facts.writeTarget !== null) {
    const rowValues = new Map<string, CanonicalValue>();
    const shape = facts.insertShape;
    if (shape !== null) {
      for (let i = 0; i < shape.columns.length; i += 1) {
        const column = shape.columns[i] as string;
        const value = shape.values[i];
        if (value === undefined || value === null) continue;
        const canonical = "argIndex" in value ? canonicalArg(args, value.argIndex) : canonicalLiteral(value.literal);
        if (canonical !== null) rowValues.set(column, canonical);
      }
    }
    const rowidPin =
      insertedRowId !== undefined
        ? new Map<string, string>([["id", JSON.stringify({ type: "integer", value: String(insertedRowId) })]])
        : new Map<string, string>();
    return {
      table: facts.writeTarget,
      assigned: new Set<string>(),
      values: rowidPin,
      addsRow: true,
      rowValues,
    };
  }
  const pin = facts.predicate;
  if (pin === null || facts.isRead || facts.assigned === null) return null;
  const values = new Map<string, string>();
  for (const equality of pin.equalities) {
    const encoded = encodedArg(args, equality.argIndex);
    if (encoded === undefined || encoded === null) return null;
    values.set(equality.column, encoded);
  }
  // A value the write compares against that is NOT a bound argument (a literal,
  // or NULL) still pins the row, but this driver cannot compare it to the
  // read's encoded argument without evaluating SQL, so decline.
  if (pin.equalities.length === 0) return null;
  return { table: pin.table, assigned: facts.assigned, values, addsRow: false, rowValues: new Map() };
}

/** Can `write` touch any row `read` admits?
 *
 *  True = provably not, so the read's memoized answer survives. The proof has
 *  three parts, and any of them failing is `false` (fall back to the
 *  table-scoped rule):
 *
 *   1. Same table. Otherwise the two predicates are about different rows of
 *      different relations and nothing follows.
 *   2. The write does not ASSIGN any column the read's WHERE names. An
 *      assignment can move a row INTO the read's predicate even when the row
 *      started outside it -- this is what stops a write of `trash`, `left_id`
 *      or `codename` from being called disjoint.
 *   3. They pin the same column to different values. `col = 1` and `col = 2`
 *      admit no common row whatever else the predicates say.
 *
 *  No uniqueness is claimed anywhere: the two predicates simply have no joint
 *  solution. The serving deck's `cards` table has no PRIMARY KEY at all
 *  (`PRAGMA table_info(cards)` reports pk=0 for every column), which is
 *  precisely why the rule is stated as disjointness rather than as "the read
 *  found one row".
 */
function disjointFrom(read: PinnedRead, write: PinnedWrite): boolean {
  if (read.table !== write.table) return false;
  for (const column of read.columns) {
    if (write.assigned.has(column)) return false;
  }
  if (read.values.size === 0) return false;
  for (const [column, value] of read.values) {
    const other = write.values.get(column);
    if (other === undefined || other === value) return false;
  }
  return true;
}

/**
 * THE PIN SEPARATION: one contradictory conjunct is enough.
 *
 * `disjointFrom` above demands that EVERY column the read pins is pinned by
 * the write to a different value, because it also demands that the write
 * assign none of the read's WHERE columns -- and a write that assigns `trash`
 * disqualifies a read whose WHERE names `trash`, however completely the two
 * predicates separate each other on the columns they share.
 *
 * THAT DEMAND IS TOO STRONG, AND THE COST IS MEASURED. The save's card write
 * assigns `trash`, `left_id` and `right_id` (among others) and pins its row by
 * `id`. A read of a card by its id -- `SELECT * FROM cards WHERE id = ? AND
 * trash = 0 LIMIT 1` -- names `trash` in its WHERE, so the old rule gave up on
 * it, dropped its memoized answer, and the reader paid a round trip to read
 * the same row again. The measured cost in the graded save: 14 such round
 * trips for the card write, and more for the content and touch writes.
 *
 * THE PROOF. A write touches exactly the rows its WHERE admits. If the write
 * pins a column `c` to a value the read does NOT pin `c` to, then no row the
 * write touches is a row the read admits -- whatever the other conjuncts say,
 * because a row has one value for `c` and cannot have both. And the write must
 * not ASSIGN `c`, so the separation holds after the write as well as before
 * it: the rows it touches keep the value its WHERE pinned them to. The read's
 * SET is therefore unchanged -- no row enters it and no row leaves it -- so the
 * read's ANSWER is unchanged, including under a LIMIT, because the same set
 * yields the same row.
 *
 * NO UNIQUENESS IS CLAIMED. The proof is a statement about predicates, not
 * about how many rows each admits: the write's rows and the read's rows have
 * different values for a column both predicates pin, so they cannot be the
 * same row. That is the same ground `disjointFrom` stands on.
 */
function pinSeparated(read: PinnedRead, write: PinnedWrite): boolean {
  if (read.table !== write.table) return false;
  if (read.values.size === 0) return false;
  for (const [column, value] of read.values) {
    // The write CHANGES this column, so the value its WHERE pinned is not
    // the value the written rows carry afterwards: the separation below
    // would not hold after the write.
    if (write.assigned.has(column)) continue;
    const other = write.values.get(column);
    if (other === undefined || other === value) continue;
    return true;
  }
  return false;
}

/** Does the write assign any of the columns the read's WHERE names? A write
 *  that does can move a row into or out of the read's predicate, so the
 *  row-identity rule below does not apply to it. */
function assignsAnyOf(write: PinnedWrite, columns: Set<string>): boolean {
  for (const column of columns) {
    if (write.assigned.has(column)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// THE WIDER INVALIDATION RULES: what a write does to a memoized read
// ---------------------------------------------------------------------------

/** What a write does to a memoized read's answer. */
type WriteEffect = "affects" | "disjoint" | "unknown";

/**
 * THE EFFECT OF A WRITE ON A MEMOIZED READ.
 *
 * "disjoint" is the only answer that keeps the memoized answer alive, and it
 * has to be PROVEN. Three proofs are available, and the first one that
 * applies is the answer:
 *
 *   1. THE INSERT'S OWN ROW. An insert adds exactly one row, and the row's
 *      values are in the statement's own VALUES clause. A read whose
 *      predicate the new row provably does not satisfy is unaffected: the
 *      new row is not in the read's answer, and the insert changes no other
 *      row. A read whose predicate the new row MIGHT satisfy is affected,
 *      and falls to the rules below.
 *   2. THE PREDICATE-DISJOINTNESS RULE (disjointFrom, unchanged): the two
 *      predicates admit no common row.
 *   3. THE ROW-IDENTITY RULE. A write that names the row it touches (its
 *      WHERE pins a column to a value) touches only the rows matching that
 *      pin. A read's ANSWER is a set of rows the driver already holds, so
 *      the driver can check whether any of them is one of the written rows.
 *      When the write assigns none of the read's WHERE columns, no row can
 *      move into or out of the read's predicate, so the read's answer
 *      changes only if one of its own rows is written.
 *
 * WHY THE THIRD RULE IS NEW. The save's store phase writes a subcard's
 * content and then reads other cards back. Those other cards are not the
 * written card, so the write cannot have changed their answers, but the
 * conservative rule dropped their memoized answers anyway and the save paid
 * a round trip per read.
 *
 * NOTHING HERE CLAIMS UNIQUENESS. The third rule compares the written
 * row's PINNED value against the read's result rows; the written rows are
 * the rows matching the pin, and the read's result rows are the rows the
 * read found. A row that matches the pin MIGHT have been written, so a
 * match is "affects" (the safe answer), and only a proven absence of
 * matches is "disjoint".
 */
function writeEffectOnRead(
  read: PinnedRead,
  write: PinnedWrite,
  readResult: BunnyDbExecResult | undefined,
  triggerTouchesTarget: boolean,
): WriteEffect {
  if (read.table !== write.table) return "unknown";

  // 1. THE INSERT'S OWN ROW.
  if (write.addsRow) {
    const byRow = insertEffectOnRead(read, write);
    if (byRow === "disjoint") return "disjoint";
    // The insert's own row could not be ruled out; the rowid pin (the rule
    // that was already here) still decides the by-id case.
    if (disjointFrom(read, write)) return "disjoint";
    return byRow === "affects" ? "affects" : "unknown";
  }

  // 2. THE PIN SEPARATION.
  //
  // One contradictory conjunct is enough to prove the two predicates admit no
  // common row, even when the write assigns a column the read's WHERE names.
  // The read's SET is then unchanged -- no row enters it, no row leaves it --
  // and so is the read's ANSWER.
  //
  // IT IS NOT ASKED OF AN INSERT. An insert's own row is the row it adds, and
  // the insert's VALUES clause is where that row's values are; the pin
  // separation below is about the rows a write TOUCHES, and an insert's
  // rowid pin does not name the values of the row it adds.
  if (!write.addsRow && pinSeparated(read, write)) return "disjoint";

  // 2b. THE PREDICATE-DISJOINTNESS RULE.
  if (disjointFrom(read, write)) return "disjoint";

  // 3. THE ROW-IDENTITY RULE.
  if (assignsAnyOf(write, read.columns)) return "unknown";
  // 3a. THE ANSWER-SCOPE RULE.
  //
  // A read's answer is a projection of the rows its WHERE admits. A write
  // that assigns NEITHER a column the WHERE names NOR a column the SELECT
  // list names cannot change that projection: the row it touches keeps its
  // predicate values, and the values it projects are the values it had.
  //
  // WHY IT IS NEEDED. The row-identity rule below decides by comparing the
  // write's pinned values against the READ'S RESULT ROWS. A read that
  // answers one column (`SELECT codename FROM cards WHERE key = ?`) does
  // not carry the row's id, so the comparison has nothing to compare and
  // the rule gives up: the answer is dropped, and the reader pays a round
  // trip to read it again. The answer-scope rule answers the question the
  // row-identity rule could not: the write touches no column the answer is
  // made of.
  //
  // THE TRIGGERS. A trigger on the read's own table could change a column
  // the read answers, and this driver reads a trigger graph at the TABLE
  // level, so it cannot tell which columns a trigger body writes. The rule
  // therefore applies only when no trigger of the write's target table
  // reaches that same table: the caller passes that as
  // `triggerTouchesTarget`, and a trigger that does reach it turns the
  // answer-scope rule off for that write.
  if (!triggerTouchesTarget && read.projected !== null && write.assigned.size > 0) {
    let touchesAnswer = false;
    for (const column of read.projected) {
      if (write.assigned.has(column)) {
        touchesAnswer = true;
        break;
      }
    }
    if (!touchesAnswer) return "disjoint";
  }
  if (readResult === undefined) return "unknown";
  if (readResult.rows.length === 0) return "disjoint";
  const membership = rowsAgainstPin(readResult, write.values);
  if (membership === "no") return "disjoint";
  if (membership === "some") return "affects";
  return "unknown";
}

/** Does the row an insert adds satisfy the read's predicate? */
function insertEffectOnRead(read: PinnedRead, write: PinnedWrite): WriteEffect {
  for (const conjunct of read.conjuncts) {
    const newValue = write.rowValues.get(conjunct.column);
    // The new row's value for this column is not known (the column is not in
    // the INSERT's column list, so the column's DEFAULT applies, or the value
    // is a SQL expression): the insert might satisfy the read's predicate.
    if (newValue === undefined) return "unknown";
    const comparison = compareCanonical(newValue, conjunct.value);
    if (comparison === "unknown") return "unknown";
    // The new row does not satisfy this conjunct, so it is not in the read's
    // answer, and the insert changes no other row.
    if (comparison === "different") return "disjoint";
  }
  return "affects";
}

/** Do any of a read's result rows match the rows a write is pinned to? */
function rowsAgainstPin(
  result: BunnyDbExecResult,
  pin: Map<string, string>,
): "some" | "no" | "unknown" {
  if (pin.size === 0) return "unknown";
  const columns: Array<{ index: number; value: CanonicalValue }> = [];
  for (const [column, value] of pin) {
    const index = result.cols.findIndex((col) => col.name.toLowerCase() === column);
    if (index < 0) return "unknown";
    const canonical = canonicalFromJson(value);
    if (canonical === null) return "unknown";
    columns.push({ index, value: canonical });
  }
  for (const row of result.rows) {
    let matches = true;
    for (const column of columns) {
      const canonical = canonicalCell(row[column.index]);
      if (canonical === null) return "unknown";
      const comparison = compareCanonical(canonical, column.value);
      if (comparison === "unknown") return "unknown";
      if (comparison === "different") {
        matches = false;
        break;
      }
    }
    if (matches) return "some";
  }
  return "no";
}

/** The canonical form of an encoded argument (the JSON form the pins hold). */
function canonicalFromJson(encoded: string): CanonicalValue | null {
  try {
    const parsed = JSON.parse(encoded) as { type?: string; value?: unknown };
    if (parsed.type === "null") return "n:";
    if (parsed.type === "integer" && typeof parsed.value === "string") return `i:${parsed.value}`;
    if (parsed.type === "text" && typeof parsed.value === "string") return `t:${parsed.value}`;
    if (parsed.type === "float" && typeof parsed.value === "number") return `f:${parsed.value}`;
    return null;
  } catch {
    return null;
  }
}

/** The canonical form of a cell in a result row. */
function canonicalCell(cell: BunnyDbCell | undefined): CanonicalValue | null {
  if (cell === undefined || cell === null) return "n:";
  if (typeof cell === "number") return Number.isInteger(cell) ? `i:${cell}` : `f:${cell}`;
  if (typeof cell === "bigint") return `i:${cell.toString()}`;
  if (typeof cell === "string") return `t:${cell}`;
  return null;
}

// ---------------------------------------------------------------------------
// Result mapping (shared shape with the other adapters)
// ---------------------------------------------------------------------------

function execResultToQueryResult<T>(result: BunnyDbExecResult): SQLQueryResult<T> {  const names = result.cols.map((c) => c.name);
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
// The transport packing's admission rule (see BunnyDbDriver.prefetchReads)
// ---------------------------------------------------------------------------

/** The cap on one admitted run: statements, and bytes on the wire.
 *
 *  WHY 256 AND NOT 32. The design's cap sweep
 *  (docs/reports/live-save-transport-design-2026-10-18.md section 2.3)
 *  swept 8,16,32,64,100,128,256,100000 against the GREEDY PACK and found
 *  that "the cap stops mattering above 32" (175 round trips at every cap
 *  from 32 up). That sweep measured a different algorithm. Here the cap IS
 *  the packing: a prefetched run is a set of statements the engine already
 *  declared independent (the card-block declaration's by-id and by-pair
 *  shapes, the Lexicon's level reads), and the run is cut where the cap
 *  falls. A cap of 32 therefore cut the save's own declaration into nine
 *  runs and nine round trips, for a set of statements the engine had
 *  already declared independent and the admission rule had already checked.
 *
 *  MEASURED on the graded save (tools/run-save-statement-ladder-to-completion
 *  --attribution, the family's own ladder; the statement count is 772 at
 *  every cap, so the cap moves ROUND TRIPS and nothing else):
 *
 *      cap   32    64   128   256  1024
 *      POSTs 212   207   206   205   205
 *
 *  The curve is flat from 256 up: at 256 the whole declaration rides ONE
 *  round trip, and a larger cap buys nothing.
 *
 *  WHAT THE RAISED CAP DOES NOT CHANGE. The byte cap (512 KiB) still
 *  bounds the run. The run's own value flow is still verified AFTER it
 *  runs, so a statement that binds a value the run produced keeps only
 *  what the rule can vouch for, and the caller's own read of it takes the
 *  blocking path. A run that cannot be sent is still not an error: every
 *  statement in it falls back to the blocking path, which is what the
 *  engine would have done without the prefetch. */
export const PREFETCH_RUN_STATEMENT_CAP = 256;
/** The cap on the produced-value set: one request's worth of values, and
 *  then it is cleared (the safe direction: a cleared value reads as "not
 *  produced before", so the admission rule trusts less, never more). */
const PRODUCED_VALUE_SET_CAP = 50_000;
export const PREFETCH_RUN_BYTE_CAP = 512 * 1024;

/** A comparable key for a value a statement can bind back: an integer or a
 *  text. NULL and blobs are not bindable values a later statement can name
 *  (the design's value-flow test counts integers and texts), so they carry
 *  no key. */
function valueKey(value: unknown): string | undefined {
  if (typeof value === "bigint") return `i:${value.toString()}`;
  if (typeof value === "number") return Number.isInteger(value) ? `i:${String(value)}` : `f:${String(value)}`;
  // Long text is card CONTENT, which no statement binds back as an argument
  // (the ladder's capture rule, applied here so the produced-value set does
  // not fill with card bodies). A short text IS bindable: the engine binds a
  // row's key or codename back into a later statement just as it does an id.
  if (typeof value === "string") {
    return value.length <= 64 && !value.includes("\n") ? `t:${value}` : undefined;
  }
  return undefined;
}

/** The values a statement PRODUCED: the integer and text cells of every row
 *  it returned, plus the rowid an insert took. These are the values a later
 *  statement can bind back — the design's value-flow space. */
function producedValueKeys(result: BunnyDbExecResult): Set<string> {
  const values = new Set<string>();
  const rowid = valueKey(result.lastInsertRowId);
  if (rowid !== undefined) values.add(rowid);
  for (const row of result.rows) {
    for (const cell of row) {
      const key = valueKey(cell);
      if (key !== undefined) values.add(key);
    }
  }
  return values;
}

/** The values a statement BOUND. */
function boundValueKeys(args: HranaWireValue[]): Set<string> {
  const values = new Set<string>();
  for (const arg of args) {
    if (arg.type === "integer") values.add(`i:${arg.value}`);
    else if (arg.type === "text") values.add(`t:${arg.value}`);
  }
  return values;
}

/** Do two value sets share a value? */
function sharesValue(one: Set<string>, other: Set<string>): boolean {
  for (const value of one) if (other.has(value)) return true;
  return false;
}

/**
 * Split the engine's declared reads into the runs the admission rule allows.
 *
 * A statement joins the open run iff
 *   1. it binds no value produced inside that run, and
 *   2. the run is within the cap (statements and bytes).
 *
 * Clause 1 is decided HERE from the flow the driver already knows: the
 * memo holds the answer of every read this transaction has already run, so
 * for a statement the driver has run before, the values it produced are
 * known and the rule is exact. For a statement the driver has NOT run yet,
 * its productions are unknown, so the rule cannot vouch for it HERE; the
 * run's own answers are checked after the fact instead (speculateRun), and
 * anything the check cannot vouch for is not remembered. A run therefore
 * never carries a wrong answer into the engine — it carries a MISS, which
 * the engine's own read answers on the blocking path.
 */
function admittedRuns(
  wanted: Array<{ statement: SQLStatement; index: number }>,
): Array<Array<{ statement: SQLStatement; index: number }>> {
  const runs: Array<Array<{ statement: SQLStatement; index: number }>> = [];
  let run: Array<{ statement: SQLStatement; index: number }> = [];
  let runBytes = 0;
  for (const entry of wanted) {
    const { statement } = entry;
    const args = toHranaStmt(statement.sql, statement.params).args;
    const bytes = Buffer.byteLength(statement.sql, "utf8") + JSON.stringify(args).length;
    const withinCap = run.length < PREFETCH_RUN_STATEMENT_CAP && runBytes + bytes <= PREFETCH_RUN_BYTE_CAP;
    if (run.length > 0 && !withinCap) {
      runs.push(run);
      run = [];
      runBytes = 0;
    }
    run.push(entry);
    runBytes += bytes;
  }
  if (run.length > 0) runs.push(run);
  return runs;
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
