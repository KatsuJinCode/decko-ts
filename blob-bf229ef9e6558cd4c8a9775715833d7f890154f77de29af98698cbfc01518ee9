// The READ PHASE's memo must cut the notification phase's repeated reads
// without ever answering a read from a state the database has since left
// behind.
//
// The mock Hrana server runs REAL better-sqlite3, so "what SQLite means"
// here is not simulated: a stale memo shows up as a wrong answer, not as a
// shape mismatch. Each case counts the SQL the server actually received,
// which is the same thing tools/diagnose-owner-save-statement-ladder.mjs
// counts on the wire.
//
// What is asserted:
//   1. a repeated identical read inside one read phase costs ONE execute
//      (the win the phase exists for);
//   2. a batch whose every statement is a phase memo hit performs NO
//      database operation at all, so no pipeline POST is spent on it;
//   3. NOTHING survives the phase: a read after the phase sees the value
//      written after the phase, and the transaction that comes after the
//      phase starts with an empty memo;
//   4. a write inside the phase drops the entries that depend on the table
//      it writes, exactly as it does inside a transaction;
//   5. the phase's memo starts EMPTY: an answer read before the phase (in
//      the transaction that committed) answers a different question, and the
//      phase must not be served one;
//   6. a write's TRIGGERS count in the phase too;
//   7. the phase ADOPTS the trigger graph the transaction read, so the
//      phase pays no round trip to read the schema again;
//   8. a transaction that opens inside a phase clears the phase's memo,
//      because a transaction's writes may change what the phase's answers
//      say.

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

const TRIGGER_GRAPH_SQL = "SELECT tbl_name, sql FROM sqlite_master WHERE type = 'trigger'";

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

describe("BunnyDbDriver: the read phase's memo", () => {
  it("serves a repeated read of the same (sql, args) from one execute", async () => {
    const { driver, server } = await deckWithTrigger();
    await driver.readPhase(async () => {
      const first = await driver.query<{ v: string }>(readCard.sql, readCard.params);
      const second = await driver.query<{ v: string }>(readCard.sql, readCard.params);
      const third = await driver.query<{ v: string }>(readCard.sql, readCard.params);
      expect(first.rows[0].v).toBe("before");
      expect(second.rows).toEqual(first.rows);
      expect(third.rows).toEqual(first.rows);
    });
    expect(countOf(server, readCard.sql)).toBe(1);
  }, 30_000);

  it("serves a batched read from the phase's memo and still returns one answer per statement", async () => {
    const { driver, server } = await deckWithTrigger();
    await driver.readPhase(async () => {
      await driver.query<{ v: string }>(readCard.sql, readCard.params);
      const answers = await driver.batch([
        { sql: readCard.sql, params: [1] },
        { sql: readSidecar.sql, params: [1] },
      ]);
      expect(answers).toHaveLength(2);
      expect((answers[0].rows as { v: string }[])[0].v).toBe("before");
      expect((answers[1].rows as { v: string }[])[0].v).toBe("before");
    });
    expect(countOf(server, readCard.sql)).toBe(1); // primed + served from the phase
    expect(countOf(server, readSidecar.sql)).toBe(1);
  }, 30_000);

  it("performs NO database operation for a batch whose every statement is a phase memo hit", async () => {
    const { driver, server } = await deckWithTrigger();
    await driver.readPhase(async () => {
      await driver.query<{ v: string }>(readCard.sql, readCard.params);
      const postsBefore = server.requests.length;
      const answers = await driver.batch([{ sql: readCard.sql, params: [1] }]);
      expect(answers).toHaveLength(1);
      expect((answers[0].rows as { v: string }[])[0].v).toBe("before");
      // Every statement was answered from the phase's memo, so the batch
      // performed no database operation at all: not one request reached the
      // server, so no pipeline POST was spent on it.
      expect(server.requests.length).toBe(postsBefore);
    });
  }, 30_000);

  it("does not carry anything past the phase's end", async () => {
    const { driver, server } = await deckWithTrigger();
    await driver.readPhase(async () => {
      expect((await driver.query<{ v: string }>(readCard.sql, [1])).rows[0].v).toBe("before");
    });
    await driver.query("UPDATE cards SET v = ? WHERE id = ?", ["after", 1]);
    server.requests.length = 0;
    // A reader that comes after the phase must see the committed value, never
    // the phase's memoized one.
    const seen = await driver.query<{ v: string }>(readCard.sql, [1]);
    expect(seen.rows[0].v).toBe("after");
    expect(countOf(server, readCard.sql)).toBe(1);
  }, 30_000);

  it("leaves no memo behind when the phase throws", async () => {
    const { driver, server } = await deckWithTrigger();
    await driver
      .readPhase(async () => {
        await driver.query<{ v: string }>(readCard.sql, [1]);
        throw new Error("the phase failed");
      })
      .catch(() => undefined);
    server.requests.length = 0;
    const seen = await driver.query<{ v: string }>(readCard.sql, [1]);
    expect(seen.rows[0].v).toBe("before");
    // The failed phase's answer did not survive it.
    expect(countOf(server, readCard.sql)).toBe(1);
  }, 30_000);

  it("starts empty: a read made BEFORE the phase is not served from the phase's memo", async () => {
    const { driver, server } = await deckWithTrigger();
    // The answer the transaction read, before the commit.
    await driver.transaction(async () => {
      expect((await driver.query<{ v: string }>(readCard.sql, [1])).rows[0].v).toBe("before");
    });
    server.requests.length = 0;
    await driver.readPhase(async () => {
      const seen = await driver.query<{ v: string }>(readCard.sql, [1]);
      expect(seen.rows[0].v).toBe("before");
    });
    // The phase's memo is born empty, so the phase's own first read goes to
    // the wire: a pre-commit answer answers a different question.
    expect(countOf(server, readCard.sql)).toBe(1);
  }, 30_000);

  it("drops the phase's memoized row when the same table is written inside the phase", async () => {
    const { driver, server } = await deckWithTrigger();
    await driver.readPhase(async () => {
      expect((await driver.query<{ v: string }>(readCard.sql, [1])).rows[0].v).toBe("before");
      await driver.query("UPDATE cards SET v = ? WHERE id = ?", ["after", 1]);
      // The correctness clause: the write changed the row the phase's memo
      // described, so this MUST see "after" and not the memoized "before".
      const after = await driver.query<{ v: string }>(readCard.sql, [1]);
      expect(after.rows[0].v).toBe("after");
    });
    expect(countOf(server, readCard.sql)).toBe(2);
  }, 30_000);

  it("keeps the phase's entry when a DIFFERENT row of the same table is written", async () => {
    const { driver, server } = await deckWithTrigger();
    await driver.query("INSERT INTO cards (id, v) VALUES (2, 'other')", []);
    server.requests.length = 0;
    await driver.readPhase(async () => {
      await driver.query<{ v: string }>(readCard.sql, [1]);
      await driver.query("UPDATE cards SET v = ? WHERE id = ?", ["touched", 2]);
      // `id = 1` and `id = 2` admit no common row, so a write to row 2 cannot
      // change what row 1 holds and the entry survives.
      const still = await driver.query<{ v: string }>(readCard.sql, [1]);
      expect(still.rows[0].v).toBe("before");
    });
    expect(countOf(server, readCard.sql)).toBe(1);
  }, 30_000);

  it("keeps the phase's entry when an unrelated table is written", async () => {
    const { driver, server } = await deckWithTrigger();
    await driver.readPhase(async () => {
      await driver.query<{ v: string }>(readCard.sql, [1]);
      await driver.query("UPDATE sidecar SET v = ? WHERE id = ?", ["other", 1]);
      const still = await driver.query<{ v: string }>(readCard.sql, [1]);
      expect(still.rows[0].v).toBe("before");
    });
    expect(countOf(server, readCard.sql)).toBe(1);
  }, 30_000);

  it("counts a write's TRIGGERS inside the phase too", async () => {
    const { driver, server } = await deckWithTrigger();
    await driver.readPhase(async () => {
      const before = await driver.query<{ n: number }>(readVersion.sql, [1]);
      expect(before.rows[0].n).toBe(0);
      await driver.query("UPDATE cards SET v = ? WHERE id = ?", ["after", 1]);
      // The trigger fired server-side; the memoized version read must die with
      // it. A trigger-blind phase memo returns 0 here.
      const after = await driver.query<{ n: number }>(readVersion.sql, [1]);
      expect(after.rows[0].n).toBe(1);
    });
    expect(countOf(server, readVersion.sql)).toBe(2);
  }, 30_000);

  it("adopts the trigger graph the transaction read, so the phase pays no round trip for the schema", async () => {
    const { driver, server } = await deckWithTrigger();
    await driver.transaction(async () => {
      await driver.query("UPDATE cards SET v = ? WHERE id = ?", ["touched", 1]);
    });
    const graphsAfterTransaction = countOf(server, TRIGGER_GRAPH_SQL);
    expect(graphsAfterTransaction).toBe(1);
    server.requests.length = 0;
    await driver.readPhase(async () => {
      await driver.query("UPDATE cards SET v = ? WHERE id = ?", ["touched again", 1]);
    });
    // The graph is the deck's SCHEMA, and the save path issues no DDL, so the
    // phase uses the graph the transaction read instead of reading it again.
    expect(countOf(server, TRIGGER_GRAPH_SQL)).toBe(0);
  }, 30_000);

  it("reads the schema itself when no transaction read it before the phase", async () => {
    const { driver, server } = await deckWithTrigger();
    server.requests.length = 0;
    await driver.readPhase(async () => {
      await driver.query("UPDATE cards SET v = ? WHERE id = ?", ["touched", 1]);
    });
    // No transaction preceded the phase, so there is no graph to adopt and the
    // phase reads the schema itself.
    expect(countOf(server, TRIGGER_GRAPH_SQL)).toBe(1);
  }, 30_000);

  it("clears the phase's memo when a transaction opens inside it", async () => {
    const { driver, server } = await deckWithTrigger();
    await driver.readPhase(async () => {
      await driver.query<{ v: string }>(readCard.sql, [1]);
      await driver.transaction(async () => {
        await driver.query("UPDATE cards SET v = ? WHERE id = ?", ["after", 1]);
      });
      // The transaction's write changed the row the phase's memo described,
      // so the phase's answer is stale and must not be served.
      const seen = await driver.query<{ v: string }>(readCard.sql, [1]);
      expect(seen.rows[0].v).toBe("after");
    });
    expect(countOf(server, readCard.sql)).toBe(2);
  }, 30_000);

  it("joins an open phase instead of starting a second one", async () => {
    const { driver, server } = await deckWithTrigger();
    await driver.readPhase(async () => {
      await driver.query<{ v: string }>(readCard.sql, [1]);
      await driver.readPhase(async () => {
        const seen = await driver.query<{ v: string }>(readCard.sql, [1]);
        expect(seen.rows[0].v).toBe("before");
      });
      // The inner phase joined the outer one, so the outer's memo is intact.
      const still = await driver.query<{ v: string }>(readCard.sql, [1]);
      expect(still.rows[0].v).toBe("before");
    });
    expect(countOf(server, readCard.sql)).toBe(1);
  }, 30_000);

  it("never memoizes outside a phase", async () => {
    const { driver, server } = await deckWithTrigger();
    await driver.query<{ v: string }>(readCard.sql, [1]);
    await driver.query<{ v: string }>(readCard.sql, [1]);
    expect(countOf(server, readCard.sql)).toBe(2);
  }, 30_000);
});
