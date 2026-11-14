// The Cloudflare edge entry's binding-boundary telemetry: X-Decko-Db-Trips
// and the ledger must count what the D1
// binding actually received — binding CALLS and the statements those calls
// physically carried — not logical driver operations. The counting fix
// lives at the binding seam (cf-edge-engine-entry.ts ledgeredBinding), so
// the counts include the calls no driver query()/batch() ever surfaces:
// the serving path's lock-state probe batch that FAILS before the
// transaction-state table is installed (the reproduction: "Driver
// queries: 1, Binding batches: 2"), the fallback batch after it, lease
// repairs, and the transaction journal's own begin/commit batches.
//
// The instrument here is a counting D1 binding over local SQLite — the
// same shape as that reproduction — and the spine assertion is exact
// equality between what the binding saw and what the ledger recorded, in
// every scenario, failed batches included.

import { describe, expect, it } from "vitest";

import { LocalSqliteDriver } from "../../src/server/drivers/local-sqlite.js";
import {
  CloudflareD1Adapter,
  type D1BindValue,
  type D1DatabaseLike,
  type D1PreparedStatementLike,
  type D1ResultLike,
} from "../../src/server/drivers/d1.js";
import {
  edgeDbLedgerSnapshot,
  edgeDriverQueryCounter,
  resetEdgeDbLedgerForTests,
  serverTimingHeaderValue,
  startEdgeRequestProfile,
} from "../../deploy/bunny-worker-src/bunny-edge-server-timing.js";
import cfWorker, { LedgerD1Driver, ledgeredBinding } from "../../deploy/cf-worker-src/cf-edge-engine-entry.js";

/** A D1 binding whose every call is counted, backed by a local SQLite
 *  connection: batch() executes the batch's statements one by one and a
 *  failure (a missing table, say) propagates exactly as D1's rejection
 *  does. Counts advance BEFORE the work runs, so a failed call is counted
 *  like a real round trip. */
class CountingBinding implements D1DatabaseLike {
  calls = 0;
  statements = 0;

  private readonly executors = new WeakMap<D1PreparedStatementLike, () => Promise<D1ResultLike>>();

  constructor(private readonly sqlite: LocalSqliteDriver) {}

  prepare(sql: string): D1PreparedStatementLike {
    // Actual D1 bind() returns a new statement. A mutable fake hides a
    // wrapper which discards that returned value and loses all bindings.
    const statement = (params: unknown[]): D1PreparedStatementLike => {
      const exec = async (): Promise<D1ResultLike> => {
        const result = await this.sqlite.query<Record<string, unknown>>(sql, params);
        return { results: result.rows, success: true, meta: { changes: result.rowsAffected } };
      };
      const prepared: D1PreparedStatementLike = {
        bind: (...values: D1BindValue[]) => statement(values),
        run: () => this.count(1, exec),
        all: () => this.count(1, exec),
      };
      this.executors.set(prepared, exec);
      return prepared;
    };
    return statement([]);
  }

  async batch(statements: D1PreparedStatementLike[]): Promise<D1ResultLike[]> {
    return this.count(statements.length, async () => {
      const out: D1ResultLike[] = [];
      for (const statement of statements) {
        const exec = this.executors.get(statement);
        if (exec === undefined) throw new Error("batch received a statement this binding did not prepare");
        out.push(await exec());
      }
      return out;
    });
  }

  private async count<T>(n: number, work: () => Promise<T>): Promise<T> {
    this.calls += 1;
    this.statements += n;
    return await work();
  }
}

function makeDriver(sqlite: LocalSqliteDriver): { driver: LedgerD1Driver; binding: CountingBinding } {
  const binding = new CountingBinding(sqlite);
  return { binding, driver: new LedgerD1Driver(new CloudflareD1Adapter(ledgeredBinding(binding))) };
}

describe("cf edge telemetry: the ledger counts binding calls, not driver operations", () => {
  it("retains independent immutable bind results for direct calls and batches", async () => {
    const sqlite = new LocalSqliteDriver({ path: ":memory:" });
    try {
      const db = ledgeredBinding(new CountingBinding(sqlite));
      const base = db.prepare("SELECT ? AS v");
      const first = base.bind(11);
      const second = base.bind(22);
      expect(first).not.toBe(base);
      expect(second).not.toBe(first);
      expect((await first.all()).results).toEqual([{ v: 11 }]);
      expect((await second.all()).results).toEqual([{ v: 22 }]);
      expect((await db.batch([first, second])).map(result => result.results)).toEqual([[{ v: 11 }], [{ v: 22 }]]);
    } finally {
      sqlite.close();
    }
  });
  it("one driver query over a database without the transaction-state table is TWO binding calls carrying THREE statements", async () => {
    const sqlite = new LocalSqliteDriver({ path: ":memory:" });
    const { driver, binding } = makeDriver(sqlite);
    resetEdgeDbLedgerForTests();
    const before = edgeDbLedgerSnapshot();
    const profile = startEdgeRequestProfile();

    const result = await driver.query("SELECT 1 AS v", []);

    // The answer is unaffected; only the counting changed.
    expect(result.rows).toEqual([{ v: 1 }]);
    // The probe batch (lock-state SELECT + the read = 2 statements) failed
    // with "no such table", then the fallback batch ran the read alone:
    // two real round trips, three real statements — and the FAILED probe
    // is counted exactly like the successful fallback.
    expect(binding.calls).toBe(2);
    expect(binding.statements).toBe(3);
    const after = edgeDbLedgerSnapshot();
    expect(after.posts - before.posts).toBe(2);
    expect(after.wireStmts - before.wireStmts).toBe(3);
    // The logical view stays under its own labels: one driver operation,
    // one statement the driver was asked to run.
    expect(after.driverOps - before.driverOps).toBe(1);
    expect(after.stmts - before.stmts).toBe(1);
    // And the header carries all of it, honestly labelled.
    expect(serverTimingHeaderValue(profile, after)).toMatch(/db;dur=\d+;stmt=1;(?:trips=2;)?wire=3;ops=1,/);
    sqlite.close();
  });

  it("a serving read against an installed database is ONE binding call — carrying the lock-state probe beside the read", async () => {
    const sqlite = new LocalSqliteDriver({ path: ":memory:" });
    const { driver, binding } = makeDriver(sqlite);
    resetEdgeDbLedgerForTests();
    // A transaction bootstraps the journal tables (its own batches, all
    // counted — pinned by the spine test below); afterwards the serving
    // path's probe succeeds on the first try.
    await driver.transaction(async () => undefined);
    const callsAfterInstall = binding.calls;
    const statementsAfterInstall = binding.statements;

    const before = edgeDbLedgerSnapshot();
    const result = await driver.query("SELECT 2 AS v", []);
    expect(result.rows).toEqual([{ v: 2 }]);
    expect(binding.calls - callsAfterInstall).toBe(1);
    expect(binding.statements - statementsAfterInstall).toBe(2); // lock-state SELECT + the read
    const after = edgeDbLedgerSnapshot();
    expect(after.posts - before.posts).toBe(1);
    expect(after.wireStmts - before.wireStmts).toBe(2);
    expect(after.driverOps - before.driverOps).toBe(1);
    sqlite.close();
  });

  it("the spine: across transactions, journal batches, writes and reads, the ledger equals the binding's own count exactly", async () => {
    const sqlite = new LocalSqliteDriver({ path: ":memory:" });
    const { driver, binding } = makeDriver(sqlite);
    resetEdgeDbLedgerForTests();
    const before = edgeDbLedgerSnapshot();

    await driver.query("CREATE TABLE t (x TEXT)", []);
    await driver.transaction(async () => {
      await driver.query("INSERT INTO t (x) VALUES ('a')", []);
      await driver.query("SELECT x FROM t", []);
    });
    await driver.batch([{ sql: "SELECT COUNT(*) AS n FROM t", params: [] }]);

    const after = edgeDbLedgerSnapshot();
    // Every round trip the binding made, the ledger recorded — begin,
    // commit, the fenced write batch, the probe-and-fallback pairs,
    // whatever failed. No undercount, no invention.
    expect(after.posts - before.posts).toBe(binding.calls);
    expect(after.wireStmts - before.wireStmts).toBe(binding.statements);
    // The old instrument would have reported one trip per driver call —
    // the finding's undercount. The real round trips outnumber the
    // logical operations here (the journal's begin and commit ride no
    // driver query()/batch() call at all).
    expect(binding.calls).toBeGreaterThan(after.driverOps - before.driverOps);
    // Round trips are at least as wide as the logical statement count
    // (the adapter's appended SELECT changes() and the probes add width).
    expect(binding.statements).toBeGreaterThanOrEqual(after.stmts - before.stmts);
    sqlite.close();
  });

  it("seamlessly fails over to the fallback Bunny LibSQL driver when D1 throws a daily quota exhaustion error", async () => {
    const fallbackSqlite = new LocalSqliteDriver({ path: ":memory:" });
    try {
      const brokenPrimary = {
        async query(): Promise<never> {
          throw new Error("D1_ERROR: Exceeded maximum DB_ROWS_READ_PER_DAY");
        },
        async batch(): Promise<never> {
          throw new Error("D1_ERROR: Exceeded maximum DB_ROWS_READ_PER_DAY");
        },
      };
      const driver = new LedgerD1Driver(brokenPrimary as never, () => fallbackSqlite);
      const res = await driver.query("SELECT 42 AS answer", []);
      expect(res.rows).toEqual([{ answer: 42 }]);
    } finally {
      fallbackSqlite.close();
    }
  });

  it("answers /_status in exactly 1 D1 binding call (X-Decko-Db-Trips: 1) without booting Deck", async () => {
    const sqlite = new LocalSqliteDriver({ path: ":memory:" });
    try {
      const { driver, binding } = makeDriver(sqlite);
      await driver.transaction(async () => undefined);
      await sqlite.query(
        "CREATE TABLE deck_data_version (id INTEGER PRIMARY KEY, version INTEGER NOT NULL)",
        [],
      );
      await sqlite.query("INSERT INTO deck_data_version (id, version) VALUES (1, 1)", []);
      await sqlite.query(
        "CREATE TABLE cards (id INTEGER PRIMARY KEY, name TEXT, key TEXT, codename TEXT, left_id INTEGER, right_id INTEGER, type_id INTEGER, trash INTEGER DEFAULT 0, read_rule_id INTEGER, db_content TEXT)",
        [],
      );
      await sqlite.query(
        "INSERT INTO cards (id, name, key, codename, type_id, trash, db_content) VALUES (1, 'Home', 'home', 'home', 1, 0, 'Welcome')",
        [],
      );
      resetEdgeDbLedgerForTests();
      const callsBefore = binding.calls;
      const res = await cfWorker.fetch(
        new Request("https://example.com/_status", { method: "GET" }),
        { DB: binding },
      );
      expect(res.status).toBe(200);
      expect(binding.calls - callsBefore).toBe(1);
      expect(res.headers.get("X-Decko-Db-Trips")).toBe("1");
      const body = (await res.json()) as { ok: boolean; database: { ok: boolean; card_count: number } };
      expect(body.ok).toBe(true);
      expect(body.database.card_count).toBe(1);

      // Warm /_status checks only deck_data_version (1 row read instead of scanning cards) in 1 binding call
      const callsBeforeWarm = binding.calls;
      const stmtsBeforeWarm = binding.statements;
      const warmRes = await cfWorker.fetch(
        new Request("https://example.com/_status", { method: "GET" }),
        { DB: binding },
      );
      expect(warmRes.status).toBe(200);
      expect(binding.calls - callsBeforeWarm).toBe(1);
      expect(binding.statements - stmtsBeforeWarm).toBe(2); // lockStateStatement + SELECT version FROM deck_data_version
      expect(warmRes.headers.get("X-Decko-Db-Trips")).toBe("1");
      const warmBody = (await warmRes.json()) as { ok: boolean; database: { ok: boolean; card_count: number } };
      expect(warmBody.database.card_count).toBe(1);
    } finally {
      sqlite.close();
    }
  });
});
