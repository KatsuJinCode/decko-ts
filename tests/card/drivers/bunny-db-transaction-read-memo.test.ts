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

  it("keeps the entry when a DIFFERENT row of the same table is written", async () => {
    const { driver, server } = await deckWithTrigger();
    await driver.query("INSERT INTO cards (id, v) VALUES (2, 'other')", []);
    server.requests.length = 0;
    await driver.transaction(async () => {
      await driver.query<{ v: string }>(readCard.sql, [1]);
      await driver.query("UPDATE cards SET v = ? WHERE id = ?", ["touched", 2]);
      // `id = 1` and `id = 2` admit no common row, so a write to row 2 cannot
      // change what row 1 holds and the entry survives.
      const still = await driver.query<{ v: string }>(readCard.sql, [1]);
      expect(still.rows[0].v).toBe("before");
    });
    expect(countOf(server, readCard.sql)).toBe(1);
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

// The row-granular narrowing: a read and a write whose WHERE pin the same
// column to DIFFERENT values touch no common row, so the read's memoized answer
// survives. These cases are the ones that must NOT survive, and they are the
// reason the rule is stated as disjointness and not as "the read found one
// row" -- see disjointFrom in src/card/drivers/bunny-db.ts.
describe("BunnyDbDriver: the read memo's row-granular narrowing", () => {
  /** `items` carries a `flag` the reads can name, so a write can be caught
   *  ASSIGNING a column the read's WHERE depends on. */
  async function items(): Promise<{ driver: BunnyDbDriver; server: MockHranaServer }> {
    const server = await startMockHranaServer();
    servers.push(server);
    const driver = new BunnyDbDriver({ url: server.url, timeoutMs: 0 });
    await driver.query("CREATE TABLE items (id INTEGER PRIMARY KEY, v TEXT, flag INTEGER NOT NULL DEFAULT 0)", []);
    await driver.query("INSERT INTO items (id, v, flag) VALUES (1, 'one', 0)", []);
    await driver.query("INSERT INTO items (id, v, flag) VALUES (2, 'two', 1)", []);
    await driver.query("INSERT INTO items (id, v, flag) VALUES (3, 'three', 0)", []);
    server.requests.length = 0;
    return { driver, server };
  }

  const readItem = "SELECT v FROM items WHERE id = ?";
  const readFlagged = "SELECT v FROM items WHERE id = ? AND flag = 0";

  it("serves the memo across a write pinned to a different value of the same column", async () => {
    const { driver, server } = await items();
    await driver.transaction(async () => {
      expect((await driver.query<{ v: string }>(readItem, [1])).rows[0].v).toBe("one");
      await driver.query("UPDATE items SET v = ? WHERE id = ?", ["TWO", 2]);
      // Row 2 moved; row 1 did not, and no row satisfies both `id = 1` and
      // `id = 2`, so the memoized row-1 answer is still the right answer.
      expect((await driver.query<{ v: string }>(readItem, [1])).rows[0].v).toBe("one");
      // Row 2's own answer did change, and must be re-read.
      expect((await driver.query<{ v: string }>(readItem, [2])).rows[0].v).toBe("TWO");
    });
    expect(countOf(server, readItem)).toBe(2);
  }, 30_000);

  it("still drops the entry when the write touches the row the read names", async () => {
    const { driver, server } = await items();
    await driver.transaction(async () => {
      expect((await driver.query<{ v: string }>(readItem, [1])).rows[0].v).toBe("one");
      await driver.query("UPDATE items SET v = ? WHERE id = ?", ["ONE", 1]);
      expect((await driver.query<{ v: string }>(readItem, [1])).rows[0].v).toBe("ONE");
    });
    expect(countOf(server, readItem)).toBe(2);
  }, 30_000);

  it("still drops the entry when the write ASSIGNS the column the read pins", async () => {
    const { driver, server } = await items();
    const byValue = "SELECT id FROM items WHERE v = ?";
    await driver.transaction(async () => {
      // 'free' belongs to no row yet, so this read's answer is EMPTY and the
      // empty answer is what gets memoized.
      expect((await driver.query<{ id: number }>(byValue, ["free"])).rows).toEqual([]);
      // This is the case the narrowing has to refuse. The WHERE clauses pin
      // the same column to different values -- `v = 'free'` and `v = 'three'`
      // -- so disjointness holds on their face. But the SET list reassigns
      // `v`, which moves a row INTO the read's predicate. Comparing WHERE
      // clauses alone would keep the entry and serve the empty answer forever.
      await driver.query("UPDATE items SET v = ? WHERE v = ?", ["free", "three"]);
      // Exactly one row can carry 'free', so this answer is unambiguous.
      expect((await driver.query<{ id: number }>(byValue, ["free"])).rows[0].id).toBe(3);
    });
    expect(countOf(server, byValue)).toBe(2);
  }, 30_000);

  it("still drops the entry when the write ASSIGNS another column the read's WHERE names", async () => {
    const { driver, server } = await items();
    await driver.transaction(async () => {
      // Row 2 has flag = 1, so this read's answer is EMPTY. Memoize it.
      expect((await driver.query<{ v: string }>(readFlagged, [2])).rows).toEqual([]);
      // An INSERT has no WHERE, so it is pinned to nothing and stays
      // table-scoped: a new row could satisfy this read's predicate.
      await driver.query("INSERT INTO items (id, v, flag) VALUES (4, 'four', 1)", []);
      expect((await driver.query<{ v: string }>(readFlagged, [2])).rows).toEqual([]);
      // Same row, but the write ASSIGNS `flag`, which the read's WHERE names.
      await driver.query("UPDATE items SET flag = ? WHERE id = ?", [0, 2]);
      // Now row 2 satisfies `id = 2 AND flag = 0`, so the EMPTY answer is
      // stale and must not be served.
      expect((await driver.query<{ v: string }>(readFlagged, [2])).rows[0].v).toBe("two");
    });
    // three executes: the empty memo, the empty re-read after the INSERT, and
    // the post-UPDATE read. The first two are both legitimately empty answers.
    expect(countOf(server, readFlagged)).toBe(3);
  }, 30_000);

  it("keeps the narrowing off a read whose WHERE cannot be read as a conjunction", async () => {
    const { driver, server } = await items();
    await driver.transaction(async () => {
      // `v = 'one' OR id = 2` is not a conjunction of comparisons, so the read
      // is never pinned and the write stays table-scoped.
      const either = "SELECT v FROM items WHERE v = ? OR id = ?";
      await driver.query(either, ["one", 999]);
      await driver.query("UPDATE items SET v = ? WHERE id = ?", ["x", 2]);
      await driver.query(either, ["one", 999]);
    });
    expect(countOf(server, "SELECT v FROM items WHERE v = ? OR id = ?")).toBe(2);
  }, 30_000);

  it("sees a double-quoted key column, which the classifier normalizes first", async () => {
    const { driver, server } = await items();
    const quoted = 'SELECT v FROM items WHERE "id" = ?';
    await driver.transaction(async () => {
      expect((await driver.query<{ v: string }>(quoted, [1])).rows[0].v).toBe("one");
      await driver.query('UPDATE items SET v = ? WHERE "id" = ?', ["x", 2]);
      // Same narrowing on quoted SQL: stripSqlNoise blanks quoted runs to a
      // space, so without normalizeIdentifierQuotes this would be invisible to
      // the rule and the entry would die on every write.
      expect((await driver.query<{ v: string }>(quoted, [1])).rows[0].v).toBe("one");
    });
    expect(countOf(server, quoted)).toBe(1);
  }, 30_000);
});