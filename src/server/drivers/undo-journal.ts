// A compensating transaction for SQLite-dialect databases that offer no
// interactive transaction — Cloudflare D1, where every statement (or every
// batch) commits on its own and BEGIN/COMMIT are refused.
//
// How it works. Triggers on each journaled table record, before every write
// lands, enough to undo it: an INSERT records the new row's rowid; an UPDATE
// or DELETE also copies the old row into a per-table shadow table. The
// triggers fire only while a transaction holds the lock row in
// decko_tx_state, so ordinary writes outside a transaction cost one point
// lookup and journal nothing. Commit deletes the journal; rollback, in one
// atomic batch, deletes every row the transaction touched and re-inserts
// each row's image from the transaction's FIRST journal entry for it (the
// row as it was before the transaction), then deletes the journal. The
// restore is set-based, so it is a fixed handful of statements whatever the
// transaction wrote.
//
// Fencing. The lock can be lost mid-transaction: the lease runs out and
// another transaction takes over (restoring the journal), or the serving
// read path repairs the dead lease (see below). Every statement a
// transaction's callback runs therefore carries an ownership check in its
// own atomic batch (the host adapter batches leaseFenceStatement with it):
// a statement can only execute while its transaction still owns the lock,
// so nothing a transaction attempts after losing the lease lands, and the
// TransactionLeaseLostError its commit then reports — "its writes were
// undone" — matches the database's actual state.
//
// The lock row serializes transactions across every driver object and
// process using the database. It carries a lease: a transaction whose
// holder died is found expired by the next one, which restores its journal
// before starting (crash recovery), in the same batch that takes the lock —
// and, independently of any transaction, by the serving read path the
// moment the lease is known expired (repairExpiredLease), so an
// interrupted save's rows are never served and recovery does not wait for
// the next write.
//
// What it does not give: isolation. Each statement commits as it runs, so a
// reader can see a LIVE transaction's intermediate rows until it commits or
// rolls back; only a lease-expired holder's rows are repaired before a
// serving read answers, and a read that answered moments before the lease
// ran out keeps what it served. Writes to journaled tables made outside
// any transaction while one is open are journaled under it and are undone
// if it rolls back; the write path issues every save inside a transaction,
// so this only concerns writers that bypass it. AUTOINCREMENT counters are
// not restored (ids skip after a rollback, as PostgreSQL sequences do).
// Updates that change a row's rowid are not supported (the write path never
// changes an id).

import type { SQLQueryResult, SQLStatement } from "../driver.js";
import { DEFAULT_TRANSACTION_LOCK_TIMEOUT_MS, TransactionLockTimeoutError } from "../driver.js";

/** The tables a card save writes (cards and its history, references and
 *  virtual-card cache). Derived caches written by renders (one_trip_*) and
 *  sign-in sessions are deliberately left out: they are written outside
 *  saves, concurrently, and must never be undone by a save's rollback. */
export const DEFAULT_JOURNALED_TABLES: readonly string[] = [
  "cards",
  "card_acts",
  "card_actions",
  "card_changes",
  "card_references",
  "card_virtuals",
];

/** Bumped whenever the trigger or shadow-table shape changes, so existing
 *  databases reinstall on their next transaction. */
const JOURNAL_VERSION = "decko-undo-journal-1";

/** How long a holder may keep the lock before another transaction may
 *  treat it as dead and restore its journal. Far above any save's run
 *  time; a holder that is merely slow past this loses its lock and its
 *  commit fails. */
export const DEFAULT_LEASE_MS = 120_000;

export interface JournalExecutor {
  query<T = unknown>(sql: string, params: unknown[]): Promise<SQLQueryResult<T>>;
  /** Must be atomic: all statements commit together or none do. */
  batch(statements: SQLStatement[]): Promise<SQLQueryResult[]>;
}

export interface UndoJournalOptions {
  tables?: readonly string[];
  leaseMs?: number;
  lockTimeoutMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  newTxId?: () => string;
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function quoteText(text: string): string {
  return `'${text.replace(/'/g, "''")}'`;
}

function shadowTable(table: string): string {
  return `decko_undo_${table}`;
}

const STATE = "decko_tx_state";
const UNDO = "decko_tx_undo";
const ASSERT = "decko_tx_assert";

const BOOTSTRAP: SQLStatement[] = [
  {
    sql: `CREATE TABLE IF NOT EXISTS ${STATE} (id INTEGER PRIMARY KEY CHECK (id = 1), tx TEXT, expires_at INTEGER, signature TEXT)`,
    params: [],
  },
  { sql: `INSERT OR IGNORE INTO ${STATE} (id) VALUES (1)`, params: [] },
  {
    sql: `CREATE TABLE IF NOT EXISTS ${UNDO} (seq INTEGER PRIMARY KEY, tx TEXT NOT NULL, tbl TEXT NOT NULL, op TEXT NOT NULL, row_id INTEGER NOT NULL)`,
    params: [],
  },
  // A failed CHECK aborts the batch it runs in: the batches below begin
  // with an INSERT here whose value is 1 only when the caller still holds
  // (or may take over) the lock, so a lost lock can never commit or
  // restore anything.
  { sql: `CREATE TABLE IF NOT EXISTS ${ASSERT} (ok INTEGER NOT NULL CONSTRAINT decko_tx_lock_held CHECK (ok = 1))`, params: [] },
];

/** Thrown when a transaction's lease ran out and the lock was taken over —
 *  by another transaction, or by the serving read path's repair of the
 *  dead lease. Everything the transaction wrote before the takeover was
 *  restored, and its fenced statements after it were refused, so the
 *  message matches the database's state. */
export class TransactionLeaseLostError extends Error {
  constructor() {
    super("the transaction's lock lease expired and the lock was taken over; its writes were undone");
    this.name = "TransactionLeaseLostError";
  }
}

/** The lock-row read the serving path pairs with its own reads, so a dead
 *  lease can be noticed and repaired in the same atomic batch. */
export function lockStateStatement(): SQLStatement {
  return { sql: `SELECT tx, expires_at FROM ${STATE} WHERE id = 1`, params: [] };
}

/** Removes the assert row a passed lease fence inserted; batched after the
 *  fenced statements so the assert table is empty again when the batch
 *  commits, and untouched when the fence fails (the whole batch aborts). */
export function clearLeaseAssertStatement(): SQLStatement {
  return { sql: `DELETE FROM ${ASSERT}`, params: [] };
}

export class UndoJournal {
  private readonly db: JournalExecutor;
  private readonly tables: readonly string[];
  private readonly leaseMs: number;
  private readonly lockTimeoutMs: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly newTxId: () => string;
  private bootstrapped: Promise<void> | undefined;
  /** The transaction whose callback is running on this journal, for the
   *  host adapter's lease fencing; null outside a callback. */
  private active: string | null = null;
  /** The journaled tables that exist in this database, with their columns,
   *  as of the last install check. */
  private installed: { table: string; columns: string[] }[] = [];

  constructor(db: JournalExecutor, options: UndoJournalOptions = {}) {
    this.db = db;
    this.tables = options.tables ?? DEFAULT_JOURNALED_TABLES;
    this.leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS;
    this.lockTimeoutMs = options.lockTimeoutMs ?? DEFAULT_TRANSACTION_LOCK_TIMEOUT_MS;
    this.now = options.now ?? (() => Date.now());
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.newTxId = options.newTxId ?? defaultTxId;
  }

  /** Runs `work` between begin and commit; on any failure restores the
   *  journal and rethrows the original error. While `work` runs, activeTx
   *  names this transaction, so the host driver can fence every statement
   *  it issues to the lease. */
  async run<R>(work: () => Promise<R>): Promise<R> {
    const tx = await this.begin();
    this.active = tx;
    try {
      let result: R;
      try {
        result = await work();
      } catch (error) {
        await this.rollback(tx);
        throw error;
      }
      try {
        await this.commit(tx);
      } catch (error) {
        // The commit batch is atomic: either the journal is gone (committed)
        // or it is intact. A lost lease means the taker already restored it.
        if (!(error instanceof TransactionLeaseLostError)) await this.rollback(tx);
        throw error;
      }
      return result;
    } finally {
      this.active = null;
    }
  }

  /** The transaction whose lease every statement issued right now must
   *  prove, or null outside a transaction callback. The host adapter
   *  batches leaseFenceStatement(activeTx) with each statement the
   *  callback runs, so a statement executes only inside a batch that has
   *  atomically verified its transaction still owns the lock. */
  get activeTx(): string | null {
    return this.active;
  }

  /** The statement that aborts its whole batch (CHECK decko_tx_lock_held)
   *  unless `tx` still owns the lock. */
  leaseFenceStatement(tx: string): SQLStatement {
    return ownerAssert(tx);
  }

  /** True when a lock row as read names a holder whose lease has run out.
   *  A hint only: repairExpiredLease re-checks the expiry inside its own
   *  atomic batch. */
  leaseIsExpired(state: { tx: unknown; expires_at: unknown }): boolean {
    return (
      state.tx != null && state.expires_at != null && Number.isFinite(Number(state.expires_at)) && Number(state.expires_at) < this.now()
    );
  }

  /** Restores a lease-expired holder's journal and frees the lock, in one
   *  atomic batch guarded by the expiry still holding — the serving read
   *  path runs this so a dead save's rows are undone as soon as the lease
   *  is known expired instead of at the next transaction. Returns false
   *  when the lock has already moved on. */
  async repairExpiredLease(staleTx: string): Promise<boolean> {
    await this.bootstrap();
    if (this.installed.length === 0) await this.loadInstalledTables();
    try {
      await this.db.batch([
        {
          sql: `INSERT INTO ${ASSERT} (ok) SELECT COUNT(*) FROM ${STATE} WHERE id = 1 AND tx = ? AND expires_at < ?`,
          params: [staleTx, this.now()],
        },
        { sql: `UPDATE ${STATE} SET tx = NULL, expires_at = NULL WHERE id = 1`, params: [] },
        ...this.restoreStatements(staleTx),
        { sql: `DELETE FROM ${ASSERT}`, params: [] },
      ]);
      return true;
    } catch (error) {
      if (isLeaseAssertFailure(error)) return false;
      throw error;
    }
  }

  private async bootstrap(): Promise<void> {
    this.bootstrapped ??= this.db.batch(BOOTSTRAP).then(
      () => undefined,
      (error: unknown) => {
        this.bootstrapped = undefined;
        throw error;
      },
    );
    return this.bootstrapped;
  }

  private signatureSql(): string {
    const names = this.tables.map(quoteText).join(", ");
    return (
      `SELECT group_concat(name || char(31) || sql, char(30)) AS sig FROM ` +
      `(SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name IN (${names}) ORDER BY name)`
    );
  }

  /** Takes the lock (restoring a dead holder's journal on the way) and
   *  makes sure the triggers match the current schema. */
  private async begin(): Promise<string> {
    await this.bootstrap();
    const tx = this.newTxId();
    const started = this.now();
    let delay = 10;
    for (;;) {
      const now = this.now();
      const [taken, state, schema] = await this.db.batch([
        {
          sql: `UPDATE ${STATE} SET tx = ?, expires_at = ? WHERE id = 1 AND tx IS NULL`,
          params: [tx, now + this.leaseMs],
        },
        { sql: `SELECT tx, expires_at, signature FROM ${STATE} WHERE id = 1`, params: [] },
        { sql: this.signatureSql(), params: [] },
      ]);
      const row = state.rows[0] as { tx: string | null; expires_at: number | null; signature: string | null };
      const signature = `${JOURNAL_VERSION}\u001d${(schema.rows[0] as { sig: string | null } | undefined)?.sig ?? ""}`;
      if (taken.rowsAffected === 1) {
        await this.ensureInstalled(tx, signature, row.signature);
        return tx;
      }
      if (row.tx !== null && row.expires_at !== null && Number(row.expires_at) < now) {
        if (await this.takeOverExpired(row.tx, tx, now)) {
          await this.ensureInstalled(tx, signature, row.signature);
          return tx;
        }
        continue; // someone else took it over first; try again at once
      }
      if (now - started >= this.lockTimeoutMs) throw new TransactionLockTimeoutError(this.lockTimeoutMs);
      await this.sleep(delay);
      delay = Math.min(delay * 2, 250);
    }
  }

  private async ensureInstalled(tx: string, signature: string, stored: string | null): Promise<void> {
    if (stored === signature && this.installed.length > 0) return;
    const present: { table: string; columns: string[] }[] = [];
    for (const table of this.tables) {
      const info = await this.db.query<{ name: string }>(`PRAGMA table_info(${quoteIdent(table)})`, []);
      if (info.rows.length > 0) present.push({ table, columns: info.rows.map((r) => String(r.name)) });
    }
    this.installed = present;
    if (stored === signature) return;
    const ddl: SQLStatement[] = [ownerAssert(tx)];
    for (const { table, columns } of present) ddl.push(...installStatements(table, columns));
    ddl.push({ sql: `UPDATE ${STATE} SET signature = ? WHERE id = 1`, params: [signature] });
    ddl.push({ sql: `DELETE FROM ${ASSERT}`, params: [] });
    await this.db.batch(ddl);
  }

  /** Restores the expired holder's journal and takes the lock, in one
   *  atomic batch guarded by the expiry still holding. Returns false when
   *  another transaction took over first. */
  private async takeOverExpired(staleTx: string, tx: string, now: number): Promise<boolean> {
    if (this.installed.length === 0) await this.loadInstalledTables();
    try {
      await this.db.batch([
        {
          sql: `INSERT INTO ${ASSERT} (ok) SELECT COUNT(*) FROM ${STATE} WHERE id = 1 AND tx = ? AND expires_at < ?`,
          params: [staleTx, now],
        },
        { sql: `UPDATE ${STATE} SET tx = NULL, expires_at = NULL WHERE id = 1`, params: [] },
        ...this.restoreStatements(staleTx),
        { sql: `UPDATE ${STATE} SET tx = ?, expires_at = ? WHERE id = 1 AND tx IS NULL`, params: [tx, now + this.leaseMs] },
        { sql: `DELETE FROM ${ASSERT}`, params: [] },
      ]);
      return true;
    } catch (error) {
      if (isLeaseAssertFailure(error)) return false;
      throw error;
    }
  }

  private async loadInstalledTables(): Promise<void> {
    const present: { table: string; columns: string[] }[] = [];
    for (const table of this.tables) {
      const info = await this.db.query<{ name: string }>(`PRAGMA table_info(${quoteIdent(table)})`, []);
      if (info.rows.length > 0) present.push({ table, columns: info.rows.map((r) => String(r.name)) });
    }
    this.installed = present;
  }

  private restoreStatements(tx: string): SQLStatement[] {
    const out: SQLStatement[] = [];
    for (const { table, columns } of this.installed) {
      const t = quoteIdent(table);
      const shadow = quoteIdent(shadowTable(table));
      const cols = columns.map(quoteIdent).join(", ");
      out.push({
        sql: `DELETE FROM ${t} WHERE rowid IN (SELECT row_id FROM ${UNDO} WHERE tx = ? AND tbl = ?)`,
        params: [tx, table],
      });
      out.push({
        sql:
          `INSERT INTO ${t} (rowid, ${cols}) SELECT undo_rowid, ${cols} FROM ${shadow} ` +
          `WHERE undo_seq IN (SELECT MIN(seq) FROM ${UNDO} WHERE tx = ? AND tbl = ? GROUP BY row_id)`,
        params: [tx, table],
      });
      out.push({ sql: `DELETE FROM ${shadow} WHERE undo_tx = ?`, params: [tx] });
    }
    out.push({ sql: `DELETE FROM ${UNDO} WHERE tx = ?`, params: [tx] });
    return out;
  }

  private async commit(tx: string): Promise<void> {
    const statements: SQLStatement[] = [ownerAssert(tx)];
    for (const { table } of this.installed) {
      statements.push({ sql: `DELETE FROM ${quoteIdent(shadowTable(table))} WHERE undo_tx = ?`, params: [tx] });
    }
    statements.push({ sql: `DELETE FROM ${UNDO} WHERE tx = ?`, params: [tx] });
    statements.push({ sql: `UPDATE ${STATE} SET tx = NULL, expires_at = NULL WHERE id = 1`, params: [] });
    statements.push({ sql: `DELETE FROM ${ASSERT}`, params: [] });
    try {
      await this.db.batch(statements);
    } catch (error) {
      if (isLeaseAssertFailure(error)) throw new TransactionLeaseLostError();
      throw error;
    }
  }

  private async rollback(tx: string): Promise<void> {
    try {
      await this.db.batch([
        ownerAssert(tx),
        // Clearing the lock first turns the triggers off for the restore.
        { sql: `UPDATE ${STATE} SET tx = NULL, expires_at = NULL WHERE id = 1`, params: [] },
        ...this.restoreStatements(tx),
        { sql: `DELETE FROM ${ASSERT}`, params: [] },
      ]);
    } catch (error) {
      // A lost lease: the taker restored this journal already.
      if (isLeaseAssertFailure(error)) return;
      throw error;
    }
  }
}

function ownerAssert(tx: string): SQLStatement {
  return {
    sql: `INSERT INTO ${ASSERT} (ok) SELECT COUNT(*) FROM ${STATE} WHERE id = 1 AND tx = ?`,
    params: [tx],
  };
}

/** True when an error is the lease fence's CHECK failing, which aborts the
 *  whole batch it ran in. Exported so the D1 adapter can recognize a fenced
 *  statement's rejection as a lost lease. */
export function isLeaseAssertFailure(error: unknown): boolean {
  const message = error instanceof Error ? `${error.message} ${String((error as { cause?: unknown }).cause ?? "")}` : String(error);
  return /CHECK constraint failed/i.test(message) && message.includes("decko_tx_lock_held");
}

/** The shadow table and the three triggers for one journaled table. */
export function installStatements(table: string, columns: readonly string[]): SQLStatement[] {
  const t = quoteIdent(table);
  const shadow = quoteIdent(shadowTable(table));
  const name = quoteText(table);
  const cols = columns.map(quoteIdent);
  const oldCols = columns.map((c) => `old.${quoteIdent(c)}`).join(", ");
  const when = `WHEN (SELECT tx FROM ${STATE} WHERE id = 1) IS NOT NULL`;
  const trigger = (suffix: string) => quoteIdent(`${shadowTable(table)}_${suffix}`);
  const entry = (op: string, rowRef: string) =>
    `INSERT INTO ${UNDO} (tx, tbl, op, row_id) SELECT tx, ${name}, '${op}', ${rowRef} FROM ${STATE} WHERE id = 1;`;
  const image =
    `INSERT INTO ${shadow} (undo_seq, undo_tx, undo_rowid, ${cols.join(", ")}) ` +
    `SELECT last_insert_rowid(), tx, old.rowid, ${oldCols} FROM ${STATE} WHERE id = 1;`;
  return [
    { sql: `DROP TRIGGER IF EXISTS ${trigger("ins")}`, params: [] },
    { sql: `DROP TRIGGER IF EXISTS ${trigger("upd")}`, params: [] },
    { sql: `DROP TRIGGER IF EXISTS ${trigger("del")}`, params: [] },
    { sql: `DROP TABLE IF EXISTS ${shadow}`, params: [] },
    {
      // Untyped columns keep every stored value exactly (no affinity).
      sql: `CREATE TABLE ${shadow} (undo_seq INTEGER PRIMARY KEY, undo_tx TEXT NOT NULL, undo_rowid INTEGER NOT NULL, ${cols.join(", ")})`,
      params: [],
    },
    { sql: `CREATE TRIGGER ${trigger("ins")} AFTER INSERT ON ${t} ${when} BEGIN ${entry("I", "new.rowid")} END`, params: [] },
    {
      sql: `CREATE TRIGGER ${trigger("upd")} AFTER UPDATE ON ${t} ${when} BEGIN ${entry("U", "new.rowid")} ${image} END`,
      params: [],
    },
    {
      sql: `CREATE TRIGGER ${trigger("del")} AFTER DELETE ON ${t} ${when} BEGIN ${entry("D", "old.rowid")} ${image} END`,
      params: [],
    },
  ];
}

function defaultTxId(): string {
  const bytes = new Uint8Array(12);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
