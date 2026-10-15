// The one seam every storage provider plugs into. The adapter contract
// follows the provider-adapter requirement in docs/README.md:
// declare transaction/isolation, rollback, search, collation, generated-ID,
// time and resource-limit behavior, and reject unsupported operations
// explicitly rather than silently weakening semantics.
//
// Rules: the engine never imports vendor SDKs. Adapters implement this
// interface per provider (D1, libSQL-over-HTTP, ...). Every adapter passes
// the same conformance suite.

export interface SQLQueryResult<T = unknown> {
  rows: T[];
  rowsAffected: number;
  lastInsertRowId?: number | bigint;
  /** Provider-reported rows read by the engine (D1 meta.rows_read). UNDEFINED
   *  means the runtime did not surface it (local-sqlite has no equivalent;
   *  D1 in production reports a number, workerd's local D1 emulation may
   *  also be undefined). The deploy/worker-metrics wrapper never silently
   *  invents a value — see worker-metrics.ts for the ESTIMATE fallback. */
  rowsRead?: number;
  /** Provider-reported rows written by the engine (D1 meta.rows_written).
   *  Same undefined semantics as rowsRead. */
  rowsWritten?: number;
}

export interface SQLStatement {
  sql: string;
  params: unknown[];
}

export interface SQLDatabaseDriver {
  query<T = unknown>(sql: string, params: unknown[]): Promise<SQLQueryResult<T>>;
  /** Runs the statements in order and returns their results in order.
   *  Whether a batch is atomic on its own (outside transaction()) is the
   *  adapter's `transactionGuarantee.atomicBatch`. */
  batch(statements: SQLStatement[]): Promise<SQLQueryResult[]>;
  /**
   * Runs `work` as one atomic unit: if `work` throws (or the commit
   * fails), every write `work` made through this driver object is undone
   * and the error is rethrown; otherwise all of them persist together.
   *
   * Every statement issued through THIS driver object while `work` runs
   * belongs to the transaction — including statements from unrelated
   * callers that share the object (see `readersIsolated`). Transactions on
   * one driver object never overlap: a second call waits until the first
   * has committed or rolled back. Do not call transaction() from inside
   * `work`; the nested call waits for the outer one and fails with
   * TransactionLockTimeoutError.
   *
   * Absent on drivers that cannot make a unit of work atomic (read-only
   * drivers). The write path refuses to save through such a driver rather
   * than save non-atomically.
   */
  transaction?<R>(work: () => Promise<R>): Promise<R>;
  /** What transaction() actually guarantees on this adapter. Present
   *  exactly when transaction() is. */
  readonly transactionGuarantee?: SQLTransactionGuarantee;
}

/**
 * The guarantee an adapter's transaction() gives, stated per property so a
 * host can see what differs between backends instead of assuming the
 * strongest one. Every adapter with transaction() is atomic on failure;
 * the other properties vary.
 */
export interface SQLTransactionGuarantee {
  /** "native": the database's own BEGIN/COMMIT on one connection or
   *  stream. "compensating": each statement commits as it runs and a
   *  failure is undone by restoring the row images a journal recorded
   *  before each write (used where the database offers no interactive
   *  transaction, such as Cloudflare D1). */
  readonly mechanism: "native" | "compensating";
  /** A failure inside the unit of work leaves the database's rows as they
   *  were before it started. True for every adapter. */
  readonly atomicOnFailure: true;
  /** Where an interrupted transaction (process killed mid-way) is undone:
   *  "database" — by the database itself; "next-transaction" — the journal
   *  survives and the next transaction to start restores it;
   *  "next-transaction-or-read" — as "next-transaction", and the serving
   *  read path restores it too the moment the lease is known expired, so
   *  interrupted rows are never served. */
  readonly crashRecovery: "database" | "next-transaction" | "next-transaction-or-read";
  /** Whether a reader that does NOT share this driver object sees the
   *  transaction's uncommitted writes: false for compensating adapters,
   *  where each statement commits as it runs. Readers that share the
   *  driver object share its connection or stream, and see them on every
   *  adapter. */
  readonly readersIsolated: boolean;
  /** Which writers are serialized against each other: "driver-object" —
   *  transactions through the same driver object; "database" — every
   *  transaction against the same database, through any driver object or
   *  process. */
  readonly serializedWriters: "driver-object" | "database";
  /** Whether batch() is atomic on its own, outside transaction(). Inside
   *  transaction() a batch is part of the transaction on every adapter. */
  readonly atomicBatch: boolean;
  /** Whether a rolled-back transaction gives back the AUTOINCREMENT ids it
   *  consumed. false means ids skip after a rollback, as PostgreSQL
   *  sequences do. */
  readonly idsReusedAfterRollback: boolean;
}

/** A driver whose transaction() is available. */
export type TransactionalSQLDatabaseDriver = SQLDatabaseDriver &
  Required<Pick<SQLDatabaseDriver, "transaction" | "transactionGuarantee">>;

export function supportsTransactions(driver: SQLDatabaseDriver): driver is TransactionalSQLDatabaseDriver {
  return typeof driver.transaction === "function" && driver.transactionGuarantee !== undefined;
}

/** Thrown when a transaction waited longer than its lock timeout for an
 *  earlier transaction on the same driver object (or, on adapters that
 *  serialize database-wide, the same database) to finish. */
export class TransactionLockTimeoutError extends Error {
  constructor(waitedMs: number) {
    super(`timed out after ${waitedMs} ms waiting for an earlier transaction to finish`);
    this.name = "TransactionLockTimeoutError";
  }
}

/** True when a database reported its write lock held by another connection
 *  (SQLite's SQLITE_BUSY, "database is locked"). */
export function isDatabaseBusyError(error: unknown): boolean {
  const message = error instanceof Error ? `${error.message} ${String((error as { cause?: unknown }).cause ?? "")}` : String(error);
  return /database is locked|SQLITE_BUSY/i.test(message);
}

/**
 * Runs `open` until it does not fail with a busy error: a native adapter's
 * BEGIN IMMEDIATE fails at once when another connection holds the write
 * lock, and the transaction must wait for it, as transactions through one
 * driver object wait for each other (TransactionGate). Waits with backoff
 * up to `timeoutMs`, then fails with TransactionLockTimeoutError. Any other
 * error is rethrown at once. An adapter whose database reports a held lock
 * some other way passes its own `isBusy`.
 */
export async function retryWhileBusy<R>(
  open: () => Promise<R>,
  timeoutMs: number = DEFAULT_TRANSACTION_LOCK_TIMEOUT_MS,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  isBusy: (error: unknown) => boolean = isDatabaseBusyError,
): Promise<R> {
  const started = Date.now();
  let delay = 5;
  for (;;) {
    try {
      return await open();
    } catch (error) {
      if (!isBusy(error)) throw error;
      if (Date.now() - started >= timeoutMs) throw new TransactionLockTimeoutError(timeoutMs);
    }
    await sleep(delay);
    delay = Math.min(delay * 2, 250);
  }
}

/** Default wait for a transaction lock. A save holds it for well under a
 *  second; a wait this long means a stuck or nested transaction. */
export const DEFAULT_TRANSACTION_LOCK_TIMEOUT_MS = 30_000;

/**
 * A first-in-first-out async lock: one holder at a time per instance.
 * Adapters use one per driver object to keep transactions from
 * interleaving on a shared connection or stream.
 */
export class TransactionGate {
  private tail: Promise<void> = Promise.resolve();
  private readonly timeoutMs: number;

  constructor(timeoutMs: number = DEFAULT_TRANSACTION_LOCK_TIMEOUT_MS) {
    this.timeoutMs = timeoutMs;
  }

  /** Waits for every earlier holder, runs `work`, then lets the next
   *  holder in, whether `work` succeeded or threw. */
  async run<R>(work: () => Promise<R>): Promise<R> {
    const previous = this.tail;
    let release!: () => void;
    const mine = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.tail = previous.then(() => mine);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        previous,
        new Promise<void>((_, reject) => {
          timer = setTimeout(() => reject(new TransactionLockTimeoutError(this.timeoutMs)), this.timeoutMs);
        }),
      ]);
    } catch (error) {
      // Give up our place without blocking the holders queued behind us:
      // they wait for `previous` through our link in the chain.
      void previous.then(release);
      throw error;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
    try {
      return await work();
    } finally {
      release();
    }
  }
}

/** SQL providers report the last inserted row id as 0 when the statement
 *  inserted nothing. The driver contract treats lastInsertRowId as
 *  optional, so 0 becomes "omitted" (undefined). Shared by the driver
 *  adapters. */
export function rowIdOrOmit(lastRowId: number | bigint | undefined): number | bigint | undefined {
  if (lastRowId === undefined) return undefined;
  return BigInt(lastRowId) > 0n ? lastRowId : undefined;
}

// Blob storage (files and images) has its own seam: src/blob/driver.ts.
