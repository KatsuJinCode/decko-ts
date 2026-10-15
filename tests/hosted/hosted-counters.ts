// Counts what a hosted suite does to its database, measured at the engine's
// driver seam (src/server/driver.ts, SQLDatabaseDriver). tests/hosted/
// hosted-backend.ts hands every driver a suite gets through countDriver(), so
// the engine's own calls are counted, whatever the adapter underneath.
//
// Counted per hosted case (one vitest test while a hosted deck is active):
//  - writers: the most writers in flight at once. A writer is a transaction()
//    call, or an INSERT/UPDATE/DELETE/REPLACE issued outside one.
//  - writes: write statements that committed. A statement inside transaction()
//    commits when its transaction does; an autocommit statement commits when
//    it succeeds. Statements a suite issues while seeding its deck are counted
//    too (the runner's own database reset is not, see hosted-backend.ts).
//  - lost writes: write statements that succeeded but whose transaction did not
//    commit (the unit of work threw, or the commit failed). Also counted: rows
//    that still hold the image a rolled-back INSERT wrote (read back by the
//    rowid the insert reported), which should be zero.
//
// The counts are written as JSON to DECKO_HOSTED_COUNTERS_FILE by the
// hosted-conformance runner when a suite's file finishes.

import { writeFileSync } from "node:fs";
import type { SQLDatabaseDriver, SQLQueryResult, SQLStatement, SQLTransactionGuarantee } from "../../src/server/driver.js";

const WRITE = /^\s*(?:INSERT|UPDATE|DELETE|REPLACE)\b/i;
const INSERT_TARGET = /^\s*(?:INSERT\s+(?:OR\s+\w+\s+)?INTO|REPLACE\s+INTO)\s+"?([A-Za-z_][A-Za-z0-9_]*)"?/i;

export interface HostedCounters {
  /** Test cases that ran while a hosted deck was active. */
  cases: number;
  /** Most writers in flight at once, in any one case. */
  writers: number;
  /** Write statements that committed. */
  writes: number;
  /** Rows changed by the committed write statements (rowsAffected). */
  writeRows: number;
  /** Write statements that succeeded but whose transaction did not commit. */
  lostWrites: number;
  committedTransactions: number;
  rolledBackTransactions: number;
  /** Write statements whose row image was snapshotted while their
   *  transaction ran and compared with the row after its rollback. */
  rollbackReadBacks: number;
  /** Of those, rows that still hold the written image after the rollback. */
  leftoverRows: number;
  /** Rollback read-backs the database could not answer. */
  readBackErrors: number;
  /** A batch failed outside a transaction on an adapter whose batch is not
   *  atomic, so the statements it applied before failing are not known. */
  batchPartialFailures: number;
}

function zero(): HostedCounters {
  return {
    cases: 0,
    writers: 0,
    writes: 0,
    writeRows: 0,
    lostWrites: 0,
    committedTransactions: 0,
    rolledBackTransactions: 0,
    rollbackReadBacks: 0,
    leftoverRows: 0,
    readBackErrors: 0,
    batchPartialFailures: 0,
  };
}

const totals = zero();
let inFlight = 0;
let caseMax = 0;

function enter(): void {
  inFlight += 1;
  if (inFlight > caseMax) caseMax = inFlight;
}

function leave(): void {
  inFlight -= 1;
}

/** Called before each test case of a file that has a hosted deck. */
export function beginCase(): void {
  totals.cases += 1;
  inFlight = 0;
  caseMax = 0;
}

/** Called after each test case: folds the case's concurrency into the file's. */
export function endCase(): void {
  if (caseMax > totals.writers) totals.writers = caseMax;
  inFlight = 0;
  caseMax = 0;
}

/** The file's counts so far. */
export function currentCounters(): HostedCounters {
  return { ...totals };
}

/** Writes the file's counts where the runner asked for them. */
export function writeCounters(path: string): void {
  writeFileSync(path, JSON.stringify(currentCounters(), null, 2) + "\n");
}

interface PendingWrite {
  table?: string;
  rowid?: number;
  /** The inserted row as it reads inside its transaction. */
  image?: string;
  rows: number;
}

/** A row's values as one comparable string (bigint-safe). */
function imageOf(rows: unknown[]): string {
  return JSON.stringify(rows, (_k, v) => (typeof v === "bigint" ? `${v}n` : v));
}

/** Records a successful write. For an INSERT the row is read back at once,
 *  through the same connection, so the rollback check has the image the
 *  rolled-back insert produced. */
async function pendingOf(inner: SQLDatabaseDriver, sql: string, result: SQLQueryResult): Promise<PendingWrite> {
  const target = INSERT_TARGET.exec(sql);
  const id = result.lastInsertRowId;
  const pending: PendingWrite = { rows: Number(result.rowsAffected ?? 0) };
  if (target === null || id === undefined || id === null) return pending;
  pending.table = target[1];
  pending.rowid = Number(id);
  try {
    const r = await inner.query(`SELECT * FROM "${target[1]}" WHERE rowid = ?`, [pending.rowid]);
    pending.image = imageOf(r.rows);
  } catch {
    pending.image = undefined;
  }
  return pending;
}

function commitWrites(writes: PendingWrite[]): void {
  for (const w of writes) {
    totals.writes += 1;
    totals.writeRows += w.rows;
  }
}

class CountingDriver implements SQLDatabaseDriver {
  readonly transactionGuarantee?: SQLTransactionGuarantee;
  transaction?: <R>(work: () => Promise<R>) => Promise<R>;
  /** The transaction open on this driver object, if any. */
  private open: PendingWrite[] | undefined;

  constructor(private readonly inner: SQLDatabaseDriver) {
    this.transactionGuarantee = inner.transactionGuarantee;
    if (inner.transaction !== undefined) {
      this.transaction = <R>(work: () => Promise<R>) => this.runTransaction(work);
    }
  }

  async query<T = unknown>(sql: string, params: unknown[]): Promise<SQLQueryResult<T>> {
    if (!WRITE.test(sql)) return this.inner.query<T>(sql, params);
    if (this.open !== undefined) {
      const pending = this.open;
      const result = await this.inner.query<T>(sql, params);
      pending.push(await pendingOf(this.inner, sql, result));
      return result;
    }
    enter();
    try {
      const result = await this.inner.query<T>(sql, params);
      commitWrites([await pendingOf(this.inner, sql, result)]);
      return result;
    } finally {
      leave();
    }
  }

  async batch(statements: SQLStatement[]): Promise<SQLQueryResult[]> {
    if (!statements.some((s) => WRITE.test(s.sql))) return this.inner.batch(statements);
    if (this.open !== undefined) {
      const pending = this.open;
      const results = await this.inner.batch(statements);
      for (let i = 0; i < statements.length; i++) {
        if (WRITE.test(statements[i].sql)) pending.push(await pendingOf(this.inner, statements[i].sql, results[i]));
      }
      return results;
    }
    enter();
    try {
      const results = await this.inner.batch(statements);
      const writes: PendingWrite[] = [];
      for (let i = 0; i < statements.length; i++) {
        if (WRITE.test(statements[i].sql)) writes.push(await pendingOf(this.inner, statements[i].sql, results[i]));
      }
      commitWrites(writes);
      return results;
    } catch (error) {
      if (this.transactionGuarantee?.atomicBatch !== true) totals.batchPartialFailures += 1;
      throw error;
    } finally {
      leave();
    }
  }

  private async runTransaction<R>(work: () => Promise<R>): Promise<R> {
    if (this.open !== undefined) return this.inner.transaction!(work);
    const pending: PendingWrite[] = [];
    let started = false;
    enter();
    this.open = pending;
    try {
      const result = await this.inner.transaction!(async () => {
        started = true;
        return work();
      });
      totals.committedTransactions += 1;
      commitWrites(pending);
      return result;
    } catch (error) {
      if (started) {
        totals.rolledBackTransactions += 1;
        totals.lostWrites += pending.length;
        await this.readBackRollbacks(pending);
      }
      throw error;
    } finally {
      this.open = undefined;
      leave();
    }
  }

  /** After a rollback, each inserted row is read again: a row that still
   *  holds the image the rolled-back insert wrote is a write that was not
   *  undone. A row that is gone, or holds what it held before the
   *  transaction, was undone. */
  private async readBackRollbacks(pending: PendingWrite[]): Promise<void> {
    for (const w of pending) {
      if (w.table === undefined || w.rowid === undefined || w.image === undefined) continue;
      totals.rollbackReadBacks += 1;
      try {
        const r = await this.inner.query(`SELECT * FROM "${w.table}" WHERE rowid = ?`, [w.rowid]);
        if (imageOf(r.rows) === w.image) totals.leftoverRows += 1;
      } catch {
        totals.readBackErrors += 1;
      }
    }
  }
}

/** Wraps a driver object so the engine's calls through it are counted. */
export function countDriver(inner: SQLDatabaseDriver): SQLDatabaseDriver {
  return new CountingDriver(inner);
}
