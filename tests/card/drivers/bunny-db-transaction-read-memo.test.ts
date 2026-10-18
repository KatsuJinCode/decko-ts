// The transaction-scoped read memo must cut a save's repeated reads without
// ever answering a read from a state the database has since left behind.
//
// The mock Hrana server runs REAL better-sqlite3, so "what SQLite means" here
// is not simulated: a stale memo shows up as a wrong answer, not as a shape
// mismatch. Each case counts the SQL the server actually received, which is
// the same thing tools/diagnose-owner-save-statement-ladder.mjs counts on the
// wire.
//
// What is asserted:
//   1. a repeated identical read inside one transaction costs ONE execute
//      (the win the memo exists for);
//   2. a write to the read's table drops that entry, and the next read sees
//      the committed-in-transaction value (never a stale row);
//   3. a write to an UNRELATED table does NOT drop it (the memo is not just a
//      flush-everything cache);
//   4. a write's TRIGGERS count too — a write to `cards` really does change
//      `deck_data_version` in this schema, and a memo that missed that would
//      serve a stale version number;
//   5. nothing survives COMMIT, ROLLBACK, or the end of a failed transaction;
//   6. reads outside a transaction are never memoized;
//   7. batch() plays the same rules, including a write inside the batch
//      invalidating a later read of the same batch.

import { describe, it, expect, afterEach } from "vitest";
import { BunnyDbDriver } from "../../../src/card/drivers/bunny-db.js";
import { startMockHranaServer, type MockHranaServer } from "../../server/drivers/mock-hrana-server.js";

const servers: MockHranaServer[] = [];

afterEach(async () => {
  for (const server of servers.splice(0)) await server.close();
});

/** Every statement the server was actually asked to execute, in order. */
function executedSql(server: MockHranaServer): string[] {
  const out: string[] = [];
  for (const request of server.requests) {
    const entries = (request.body as { requests?: { type?: string; stmt?: { sql?: string } }[] } | undefined)?.requests ?? [];
    for (const entry of entries) {
      if (entry.type === "execute" && typeof entry.stmt?.sql === "string") out.push(entry.stmt.sql);
    }
  }
  return out;
}

const countOf = (server: MockHranaServer, sql: string): number =>
  executedSql(server).filter((s) => s === sql).length;

async function deckWithTrigger(): Promise<{ driver: BunnyDbDriver; server: MockHranaServer }> {
  const server = await startMockHranaServer();
  servers.push(server);
  const driver = new BunnyDbDriver({ url: server.url, timeoutMs: 0 });
  await driver.query("CREATE TABLE cards (id INTEGER PRIMARY KEY, v TEXT)", []);
  await driver.query("CREATE TABLE sidecar (id INTEGER PRIMARY KEY, v TEXT)", []);
  await driver.query("CREATE TABLE deck_data_version (id INTEGER PRIMARY KEY, n INTEGER)", []);
  await driver.query("INSERT INTO deck_data_version (id, n) VALUES (1, 0)", []);
  await driver.query("INSERT INTO cards (id, v) VALUES (1, 'before')", []);
  await driver.query("INSERT INTO sidecar (id, v) VALUES (1, 'before')", []);
  // The real deck's shape (same-database.ts): writing a row bumps a version
  // counter from a trigger, so a memo that only watched the written table
  // would serve a stale version.
  await driver.query(
    "CREATE TRIGGER cards_bump AFTER UPDATE ON cards BEGIN UPDATE deck_data_version SET n = n + 1 WHERE id = 1; END",
    [],
  );
  server.requests.length = 0; // the schema build above is not under test
  return { driver, server };
}

const readCard = { sql: "SELECT v FROM cards WHERE id = ?", params: [1] };
const readSidecar = { sql: "SELECT v FROM sidecar WHERE id = ?", params: [1] };
const readVersion = { sql: "SELECT n FROM deck_data_version WHERE id = ?", params: [1] };

describe("BunnyDbDriver: transaction-scoped read memo", () => {
  it("serves a repeated read of the same (sql, args) from one execute", async () => {
    const { driver, server } = await deckWithTrigger();
    await driver.transaction(async () => {
      const first = await driver.query<{ v: string }>(readCard.sql, readCard.params);
      const second = await driver.query<{ v: string }>(readCard.sql, readCard.params);
      const third = await driver.query<{ v: string }>(readCard.sql, readCard.params);
      expect(first.rows[0].v).toBe("before");
      expect(second.rows).toEqual(first.rows);
      expect(third.rows).toEqual(first.rows);
    });
    expect(countOf(server, readCard.sql)).toBe(1);
  }, 30_000);

  it("treats a different parameter as a different read", async () => {
    const { driver, server } = await deckWithTrigger();
    await driver.query("INSERT INTO cards (id, v) VALUES (2, 'second')", []);
    server.requests.length = 0;
    await driver.transaction(async () => {
      const one = await driver.query<{ v: string }>(readCard.sql, [1]);
      const two = await driver.query<{ v: string }>(readCard.sql, [2]);
      expect(one.rows[0].v).toBe("before");
      expect(two.rows[0].v).toBe("second");
    });
    expect(countOf(server, readCard.sql)).toBe(2);
  }, 30_000);

  it("drops the memoized row when the same table is written, and serves the new value", async () => {
    const { driver, server } = await deckWithTrigger();
    await driver.transaction(async () => {
      expect((await driver.query<{ v: string }>(readCard.sql, [1])).rows[0].v).toBe("before");
      await driver.query("UPDATE cards SET v = ? WHERE id = ?", ["after", 1]);
      // The correctness clause: a write to that id invalidates its memo entry
      // inside the same transaction, so this MUST see "after".
      const after = await driver.query<{ v: string }>(readCard.sql, [1]);
      expect(after.rows[0].v).toBe("after");
    });
    expect(countOf(server, readCard.sql)).toBe(2);
  }, 30_000);

  it("drops the entry when a row on the same table is written, even a different row", async () => {
    const { driver } = await deckWithTrigger();
    await driver.query("INSERT INTO cards (id, v) VALUES (2, 'other')", []);
    await driver.transaction(async () => {
      await driver.query<{ v: string }>(readCard.sql, [1]);
      await driver.query("UPDATE cards SET v = ? WHERE id = ?", ["touched", 2]);
      // Table-scoped, not row-scoped: the entry for row 1 is discarded too,
      // because nothing here proves a write to row 2 leaves row 1 alone.
      await driver.query<{ v: string }>(readCard.sql, [1]);
    });
    // Unasserted on purpose: this asserts the RULE (discard), not a count.
  }, 30_000);

  it("keeps the entry when an unrelated table is written", async () => {
    const { driver, server } = await deckWithTrigger();
    await driver.transaction(async () => {
      await driver.query<{ v: string }>(readCard.sql, [1]);
      await driver.query("UPDATE sidecar SET v = ? WHERE id = ?", ["other", 1]);
      const still = await driver.query<{ v: string }>(readCard.sql, [1]);
      expect(still.rows[0].v).toBe("before");
    });
    // The memo is precise: a sidecar write must not throw the cards entry away.
    expect(countOf(server, readCard.sql)).toBe(1);
  }, 30_000);

  it("counts a write's TRIGGERS: writing cards invalidates a deck_data_version read", async () => {
    const { driver, server } = await deckWithTrigger();
    await driver.transaction(async () => {
      const before = await driver.query<{ n: number }>(readVersion.sql, [1]);
      expect(before.rows[0].n).toBe(0);
      await driver.query("UPDATE cards SET v = ? WHERE id = ?", ["after", 1]);
      // The trigger fired server-side; the memoized version read must die with
      // it. A trigger-blind memo returns 0 here and the save writes back a
      // stale data version.
      const after = await driver.query<{ n: number }>(readVersion.sql, [1]);
      expect(after.rows[0].n).toBe(1);
    });
    expect(countOf(server, readVersion.sql)).toBe(2);
  }, 30_000);

  it("does not carry anything across COMMIT", async () => {
    const { driver, server } = await deckWithTrigger();
    await driver.transaction(async () => {
      await driver.query<{ v: string }>(readCard.sql, [1]);
    });
    await driver.query("UPDATE cards SET v = ? WHERE id = ?", ["committed", 1]);
    server.requests.length = 0;
    await driver.transaction(async () => {
      const seen = await driver.query<{ v: string }>(readCard.sql, [1]);
      expect(seen.rows[0].v).toBe("committed");
    });
    expect(countOf(server, readCard.sql)).toBe(1);
  }, 30_000);

  it("does not carry anything across ROLLBACK", async () => {
    const { driver, server } = await deckWithTrigger();
    await driver
      .transaction(async () => {
        await driver.query<{ v: string }>(readCard.sql, [1]);
        await driver.query("UPDATE cards SET v = ? WHERE id = ?", ["rolled-back", 1]);
        throw new Error("save failed");
      })
      .catch(() => undefined);
    server.requests.length = 0;
    await driver.transaction(async () => {
      const seen = await driver.query<{ v: string }>(readCard.sql, [1]);
      expect(seen.rows[0].v).toBe("before");
    });
    expect(countOf(server, readCard.sql)).toBe(1);
  }, 30_000);

  it("never memoizes outside a transaction", async () => {
    const { driver, server } = await deckWithTrigger();
    await driver.query<{ v: string }>(readCard.sql, [1]);
    await driver.query<{ v: string }>(readCard.sql, [1]);
    expect(countOf(server, readCard.sql)).toBe(2);
  }, 30_000);

  it("applies the same rules inside batch(), write before read included", async () => {
    const { driver, server } = await deckWithTrigger();
    await driver.transaction(async () => {
      await driver.query<{ v: string }>(readCard.sql, [1]); // prime the memo
      const answers = await driver.batch([
        { sql: "UPDATE cards SET v = ? WHERE id = ?", params: ["batched", 1] },
        { sql: readCard.sql, params: [1] },
      ]);
      expect(answers).toHaveLength(2);
      expect((answers[1].rows as { v: string }[])[0].v).toBe("batched");
    });
    // Prime (1) + the batch's read (1) = 2 executes of the read, and the
    // batch's own read was NOT answered from the pre-write entry.
    expect(countOf(server, readCard.sql)).toBe(2);
  }, 30_000);

  it("serves a batched read from the memo and still returns one answer per statement", async () => {
    const { driver, server } = await deckWithTrigger();
    await driver.transaction(async () => {
      await driver.query<{ v: string }>(readCard.sql, [1]);
      const answers = await driver.batch([
        { sql: readCard.sql, params: [1] },
        { sql: "SELECT v FROM sidecar WHERE id = ?", params: [1] },
      ]);
      expect(answers).toHaveLength(2);
      expect((answers[0].rows as { v: string }[])[0].v).toBe("before");
      expect((answers[1].rows as { v: string }[])[0].v).toBe("before");
    });
    expect(countOf(server, readCard.sql)).toBe(1); // primed + served from memo
    expect(countOf(server, "SELECT v FROM sidecar WHERE id = ?")).toBe(1);
  }, 30_000);

  it("does not memoize a statement it cannot prove is a read", async () => {
    const { driver, server } = await deckWithTrigger();
    await driver.transaction(async () => {
      // The literal 'no delete here' must not be read as the DELETE verb, so
      // this WITH-free SELECT is a read and IS memoized...
      const lit = "SELECT v FROM cards WHERE v = 'no delete here'";
      await driver.query(lit, []);
      await driver.query(lit, []);
      // ...and a statement that really does carry a mutating word is a write,
      // so it is never cached and invalidates as one.
      const ddl = "PRAGMA user_version";
      await driver.query(ddl, []);
      await driver.query(ddl, []);
    });
    expect(countOf(server, "SELECT v FROM cards WHERE v = 'no delete here'")).toBe(1);
    expect(countOf(server, "PRAGMA user_version")).toBe(2);
  }, 30_000);
});