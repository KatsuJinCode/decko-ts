// transaction() on every adapter that offers it: the shared conformance
// suite, plus the compensating journal's own properties (serialization
// across driver objects, crash recovery through the lease, lease loss).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { LocalSqliteDriver } from "../../../src/server/drivers/local-sqlite.js";
import { CloudflareD1Adapter, type D1DatabaseLike } from "../../../src/server/drivers/d1.js";
import { UndoJournal, TransactionLeaseLostError } from "../../../src/server/drivers/undo-journal.js";
import type { SQLDatabaseDriver, SQLQueryResult, SQLStatement, SQLTransactionGuarantee } from "../../../src/server/driver.js";
import { TransactionGate } from "../../../src/server/driver.js";
import { runTransactionConformance } from "./transaction-conformance.js";
import { LibSqlHttpAdapter } from "../../../src/server/drivers/libsql-http.js";
import { BunnyDbDriver } from "../../../src/card/drivers/bunny-db.js";
import { startMockHranaServer, type MockHranaServer } from "./mock-hrana-server.js";

/** The undo journal over a plain local connection: the compensating
 *  mechanism D1 uses, exercised without workerd. */
class JournaledLocalDriver implements SQLDatabaseDriver {
  private readonly gate = new TransactionGate();
  private readonly journal: UndoJournal;
  readonly transactionGuarantee: SQLTransactionGuarantee = {
    mechanism: "compensating",
    atomicOnFailure: true,
    crashRecovery: "next-transaction",
    readersIsolated: false,
    serializedWriters: "database",
    atomicBatch: true,
    idsReusedAfterRollback: false,
  };
  constructor(readonly inner: LocalSqliteDriver, tables: string[]) {
    this.journal = new UndoJournal(inner, { tables });
  }
  query<T>(sql: string, params: unknown[]): Promise<SQLQueryResult<T>> {
    return this.inner.query<T>(sql, params);
  }
  batch(statements: SQLStatement[]): Promise<SQLQueryResult[]> {
    return this.inner.batch(statements);
  }
  transaction<R>(work: () => Promise<R>): Promise<R> {
    return this.gate.run(() => this.journal.run(work));
  }
}

runTransactionConformance("transactions: LocalSqliteDriver (native)", () => {
  const driver = new LocalSqliteDriver();
  return { driver, dispose: () => driver.close() };
});

runTransactionConformance("transactions: undo journal over a local connection (compensating)", () => {
  const inner = new LocalSqliteDriver();
  return { driver: new JournaledLocalDriver(inner, ["conf_tx"]), dispose: () => inner.close() };
});

/** A mock Hrana server over a fresh database file in its own directory. */
async function hranaServer(): Promise<{ server: MockHranaServer; dispose: () => Promise<void> }> {
  const dir = mkdtempSync(join(tmpdir(), "decko-hrana-"));
  const server = await startMockHranaServer({ path: join(dir, "db.sqlite") });
  return {
    server,
    dispose: async () => {
      await server.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

runTransactionConformance("transactions: LibSqlHttpAdapter (Hrana streams, mock server over SQLite)", async () => {
  const { server, dispose } = await hranaServer();
  return { driver: new LibSqlHttpAdapter({ url: server.url }), dispose };
});

runTransactionConformance("transactions: BunnyDbDriver (Hrana streams, mock server over SQLite)", async () => {
  const { server, dispose } = await hranaServer();
  return { driver: new BunnyDbDriver({ url: server.url, authToken: "test-token", timeoutMs: 0 }), dispose };
});

describe("transactions: Hrana stream wire shape", () => {
  it("opens with BEGIN IMMEDIATE and no close, carries the baton, and ends with COMMIT plus close", async () => {
    const { server, dispose } = await hranaServer();
    try {
      const driver = new LibSqlHttpAdapter({ url: server.url });
      await driver.query("CREATE TABLE w (id INTEGER PRIMARY KEY, s TEXT)", []);
      const before = server.requests.length;
      await driver.transaction(async () => {
        await driver.query("INSERT INTO w (s) VALUES ('a')", []);
      });
      const bodies = server.requests.slice(before).map((r) => r.body as { baton?: string; requests: { type: string; stmt?: { sql: string } }[] });
      expect(bodies.map((b) => b.requests.map((q) => q.stmt?.sql ?? q.type))).toEqual([
        ["BEGIN IMMEDIATE"],
        ["INSERT INTO w (s) VALUES ('a')"],
        ["COMMIT", "close"],
      ]);
      expect(bodies[0].baton).toBeUndefined();
      expect(typeof bodies[1].baton).toBe("string");
      expect(typeof bodies[2].baton).toBe("string");
      expect(bodies[2].baton).not.toBe(bodies[1].baton);
      expect(server.violations).toEqual([]);
    } finally {
      await dispose();
    }
  });

  it("refuses the unit of work when the server closes the stream instead of returning a baton", async () => {
    const { server, dispose } = await hranaServer();
    try {
      const driver = new BunnyDbDriver({ url: server.url, timeoutMs: 0 });
      // A database without interactive sessions answers BEGIN and closes.
      server.enqueueRawResponse(
        JSON.stringify({ baton: null, results: [{ type: "ok", response: { type: "execute", result: { cols: [], rows: [], affected_row_count: 0 } } }] }),
      );
      let ran = false;
      await expect(
        driver.transaction(async () => {
          ran = true;
        }),
      ).rejects.toThrow(/no baton returned/);
      expect(ran).toBe(false);
    } finally {
      await dispose();
    }
  });

  it("keeps a second writer out while a stream holds the write lock", async () => {
    const { server, dispose } = await hranaServer();
    try {
      const a = new LibSqlHttpAdapter({ url: server.url });
      const b = new LibSqlHttpAdapter({ url: server.url });
      await a.query("CREATE TABLE lock_t (id INTEGER PRIMARY KEY, s TEXT)", []);
      await a.transaction(async () => {
        await a.query("INSERT INTO lock_t (s) VALUES ('in a')", []);
        // A writer on another stream is refused (SQLITE_BUSY) instead of
        // interleaving; a reader does not see the uncommitted row.
        await expect(b.transaction(async () => undefined)).rejects.toThrow(/locked|busy/i);
        const seen = await b.query<{ c: number }>("SELECT COUNT(*) AS c FROM lock_t", []);
        expect(Number(seen.rows[0].c)).toBe(0);
      });
      const after = await b.query<{ c: number }>("SELECT COUNT(*) AS c FROM lock_t", []);
      expect(Number(after.rows[0].c)).toBe(1);
    } finally {
      await dispose();
    }
  });
});

describe("transactions: LocalSqliteDriver across two connections to one file", () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "decko-tx-"));
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("hides one connection's uncommitted writes from the other", async () => {
    const path = join(dir, "isolation.sqlite");
    const a = new LocalSqliteDriver({ path });
    const b = new LocalSqliteDriver({ path });
    try {
      await a.query("CREATE TABLE t (id INTEGER PRIMARY KEY, s TEXT)", []);
      await a.query("INSERT INTO t VALUES (1, 'before')", []);
      await a.transaction(async () => {
        await a.query("UPDATE t SET s = 'uncommitted' WHERE id = 1", []);
        const seen = await b.query<{ s: string }>("SELECT s FROM t WHERE id = 1", []);
        expect(seen.rows[0].s).toBe("before");
      });
      const after = await b.query<{ s: string }>("SELECT s FROM t WHERE id = 1", []);
      expect(after.rows[0].s).toBe("uncommitted");
    } finally {
      a.close();
      b.close();
    }
  });
});

describe("transactions: CloudflareD1Adapter (miniflare local D1, compensating)", () => {
  let mf: Miniflare | undefined;
  let binding: D1DatabaseLike;

  beforeAll(async () => {
    mf = new Miniflare(
      convertV4MiniflareOptions({
        modules: true,
        script: `export default { fetch() { return new Response("ok"); } }`,
        d1Databases: { DB: "decko-transaction-test" },
      }),
    );
    binding = (await mf.getD1Database("DB")) as unknown as D1DatabaseLike;
  }, 120_000);

  afterAll(async () => {
    await mf?.dispose();
  });

  runTransactionConformance("conformance", () => ({
    driver: new CloudflareD1Adapter(binding, { journal: { tables: ["conf_tx"] } }),
  }));

  it("reports a write's own rows as rowsAffected, not rows its triggers wrote", async () => {
    // D1's meta.changes is sqlite3_total_changes(), which counts trigger
    // writes; the engine's writer requires exactly 1 for a one-row UPDATE.
    const d1 = new CloudflareD1Adapter(binding);
    await d1.query("CREATE TABLE trig_t (id INTEGER PRIMARY KEY, s TEXT)", []);
    await d1.query("CREATE TABLE trig_log (n INTEGER)", []);
    await d1.query("CREATE TRIGGER trig_t_upd AFTER UPDATE ON trig_t BEGIN INSERT INTO trig_log VALUES (1); INSERT INTO trig_log VALUES (2); END", []);
    await d1.query("INSERT INTO trig_t VALUES (1, 'a')", []);
    const viaQuery = await d1.query("UPDATE trig_t SET s = 'b' WHERE id = 1", []);
    expect(viaQuery.rowsAffected).toBe(1);
    const [viaBatch, read] = await d1.batch([
      { sql: "UPDATE trig_t SET s = 'c' WHERE id = 1", params: [] },
      { sql: "SELECT COUNT(*) AS c FROM trig_log", params: [] },
    ]);
    expect(viaBatch.rowsAffected).toBe(1);
    expect(read.rows).toEqual([{ c: 4 }]);
  });

  it("refuses BEGIN, which is why D1's transaction is compensating", async () => {
    const d1 = new CloudflareD1Adapter(binding);
    await expect(d1.query("BEGIN", [])).rejects.toThrow();
  });

  it("serializes transactions across two driver objects over one database (two isolates)", async () => {
    const opts = { journal: { tables: ["iso_counter"] } };
    const a = new CloudflareD1Adapter(binding, opts);
    const b = new CloudflareD1Adapter(binding, opts);
    await a.query("CREATE TABLE iso_counter (id INTEGER PRIMARY KEY, n INTEGER)", []);
    await a.query("INSERT INTO iso_counter VALUES (1, 0)", []);
    const increment = (d: CloudflareD1Adapter) =>
      d.transaction(async () => {
        const r = await d.query<{ n: number }>("SELECT n FROM iso_counter WHERE id = 1", []);
        await new Promise((resolve) => setTimeout(resolve, 30));
        await d.query("UPDATE iso_counter SET n = ? WHERE id = 1", [Number(r.rows[0].n) + 1]);
      });
    await Promise.all([increment(a), increment(b), increment(a), increment(b)]);
    const r = await a.query<{ n: number }>("SELECT n FROM iso_counter WHERE id = 1", []);
    expect(Number(r.rows[0].n)).toBe(4);
  });

  it("restores a dead holder's writes when its lease expires, and the holder's late commit fails", async () => {
    const opts = { journal: { tables: ["crash_t"], leaseMs: 200 } };
    const dying = new CloudflareD1Adapter(binding, opts);
    const next = new CloudflareD1Adapter(binding, opts);
    await next.query("CREATE TABLE crash_t (id INTEGER PRIMARY KEY, s TEXT)", []);
    await next.query("INSERT INTO crash_t VALUES (1, 'committed')", []);
    let resume!: () => void;
    const stalled = new Promise<void>((resolve) => {
      resume = resolve;
    });
    let wrote!: () => void;
    const hasWritten = new Promise<void>((resolve) => {
      wrote = resolve;
    });
    const dyingRun = dying.transaction(async () => {
      await dying.query("UPDATE crash_t SET s = 'half-done' WHERE id = 1", []);
      await dying.query("INSERT INTO crash_t VALUES (2, 'half-done')", []);
      wrote();
      await stalled; // the holder hangs past its lease, as a killed isolate would
    });
    await hasWritten;
    // A reader on another connection sees the intermediate rows (no
    // isolation on a compensating adapter) ...
    const mid = await next.query<{ s: string }>("SELECT s FROM crash_t ORDER BY id", []);
    expect(mid.rows.map((r) => r.s)).toEqual(["half-done", "half-done"]);
    // ... until the next transaction finds the lease expired and restores it.
    await new Promise((resolve) => setTimeout(resolve, 300));
    await next.transaction(async () => {
      const seen = await next.query<{ s: string }>("SELECT s FROM crash_t ORDER BY id", []);
      expect(seen.rows.map((r) => r.s)).toEqual(["committed"]);
    });
    resume();
    await expect(dyingRun).rejects.toBeInstanceOf(TransactionLeaseLostError);
    const final = await next.query<{ s: string }>("SELECT s FROM crash_t ORDER BY id", []);
    expect(final.rows.map((r) => r.s)).toEqual(["committed"]);
  });

  it("leaves no journal rows behind after commits and rollbacks", async () => {
    const d1 = new CloudflareD1Adapter(binding, { journal: { tables: ["conf_tx"] } });
    const undo = await d1.query<{ c: number }>("SELECT COUNT(*) AS c FROM decko_tx_undo", []);
    const shadow = await d1.query<{ c: number }>("SELECT COUNT(*) AS c FROM decko_undo_conf_tx", []);
    const state = await d1.query<{ tx: string | null }>("SELECT tx FROM decko_tx_state WHERE id = 1", []);
    expect(Number(undo.rows[0].c)).toBe(0);
    expect(Number(shadow.rows[0].c)).toBe(0);
    expect(state.rows[0].tx).toBeNull();
  });
});
