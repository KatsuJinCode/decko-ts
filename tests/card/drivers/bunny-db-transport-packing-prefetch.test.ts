// The transport packing's speculative prefetch: the driver's admission rule,
// the one-round-trip block fetch, and the blocking-path fallback.
//
// The mock Hrana server runs REAL better-sqlite3, so "what SQLite means" here
// is not simulated: a wrong answer shows up as a wrong answer, not as a shape
// mismatch. Each case counts the statements the server actually received,
// which is the same thing tools/diagnose-owner-save-statement-ladder.mjs
// counts on the wire.
//
// What is asserted:
//   1. a block's constant-id reads ride ONE pipeline POST, and the caller's
//      own reads of them cost NO further execute (the whole lever: the save's
//      ladder is hundreds of POSTs that carry one statement each, because
//      the engine awaits every answer);
//   2. the ADMISSION RULE: a statement that binds a value the run itself
//      produced is NOT answered from the run — the caller falls back to the
//      blocking path, at the caller's own sequence point, and gets the right
//      answer (the probe in tools/probe-hrana-writeback-batch-20261022.mjs
//      shows why: a bound value is fixed when the request is sent);
//   3. a value the transaction produced BEFORE the run is not a dependency:
//      binding it is not a dependency at all, so the run still answers;
//   4. a write after the prefetch drops the prefetched answer for the row it
//      wrote — the prefetch never serves a stale row;
//   5. a prefetch outside a transaction does nothing (there is no memo to
//      hold the answers, so a speculative round trip would be wasted);
//   6. only reads are speculated: a write is never admitted.

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

/** How many pipeline POSTs the server received. */
function postCount(server: MockHranaServer): number {
  return server.requests.length;
}

const countOf = (server: MockHranaServer, sql: string): number =>
  executedSql(server).filter((s) => s === sql).length;

const CARD_ROW = "SELECT * FROM cards WHERE id = ? LIMIT 1";
const CARD_CODENAME = "SELECT codename FROM cards WHERE id = ?";

async function deck(): Promise<{ driver: BunnyDbDriver; server: MockHranaServer }> {
  const server = await startMockHranaServer();
  servers.push(server);
  const driver = new BunnyDbDriver({ url: server.url, timeoutMs: 0 });
  await driver.query("CREATE TABLE cards (id INTEGER PRIMARY KEY, codename TEXT, type_id INTEGER, v TEXT)", []);
  await driver.query("INSERT INTO cards (id, codename, type_id, v) VALUES (1, 'one', 9, 'only-in-this-row')", []);
  await driver.query("INSERT INTO cards (id, codename, type_id, v) VALUES (2, 'two', 9, 'second')", []);
  await driver.query("INSERT INTO cards (id, codename, type_id, v) VALUES (9, 'nine', 1, 'type')", []);
  server.requests.length = 0; // the schema build above is not under test
  return { driver, server };
}

describe("BunnyDbDriver: the transport packing's speculative prefetch", () => {
  it("puts a block's constant-id reads on ONE round trip and answers the caller's own reads from it", async () => {
    const { driver, server } = await deck();
    await driver.transaction(async () => {
      const before = postCount(server);
      const outcomes = await driver.prefetchReads?.([
        { sql: CARD_ROW, params: [1] },
        { sql: CARD_ROW, params: [2] },
        { sql: CARD_CODENAME, params: [1] },
      ]);
      expect(outcomes?.every((o) => !o.unverified)).toBe(true);
      // ONE pipeline POST carried the three statements.
      expect(postCount(server) - before).toBe(1);
      expect(countOf(server, CARD_ROW)).toBe(2);
      // The caller's own reads of the same statements cost NO execute.
      const row = await driver.query<{ v: string }>(CARD_ROW, [1]);
      expect(row.rows[0]?.v).toBe("only-in-this-row");
      const codename = await driver.query<{ codename: string }>(CARD_CODENAME, [1]);
      expect(codename.rows[0]?.codename).toBe("one");
      expect(countOf(server, CARD_ROW)).toBe(2);
      expect(countOf(server, CARD_CODENAME)).toBe(1);
      expect(postCount(server) - before).toBe(1);
    });
  });

  it("does not answer a statement that binds a value the run itself produced (the admission rule)", async () => {
    const { driver, server } = await deck();
    await driver.transaction(async () => {
      // The second statement binds 9 — a value the FIRST statement's row
      // produces (the card's type_id). A run cannot answer it: the bound
      // value is fixed when the request is sent, and the probe shows the
      // batched read then sees the PRE-write state.
      const outcomes = await driver.prefetchReads?.([
        { sql: CARD_ROW, params: [1] },
        { sql: "SELECT * FROM cards WHERE v = ?", params: ["only-in-this-row"] },
      ]);
      expect(outcomes?.[0]?.unverified).toBe(false);
      expect(outcomes?.[1]?.unverified).toBe(true);
      // The caller's own read of the unvouched-for statement takes the
      // blocking path and answers correctly.
      const row = await driver.query<{ v: string }>("SELECT * FROM cards WHERE v = ?", ["only-in-this-row"]);
      expect(row.rows[0]?.v).toBe("only-in-this-row");
    });
  });

  it("answers a statement that binds a value the transaction produced BEFORE the run", async () => {
    const { driver, server } = await deck();
    await driver.transaction(async () => {
      // 9 was produced by the schema build's INSERT, before this run: the
      // caller already held it, so binding it is not a dependency.
      const outcomes = await driver.prefetchReads?.([
        { sql: CARD_ROW, params: [1] },
        { sql: CARD_ROW, params: [9] },
      ]);
      expect(outcomes?.every((o) => !o.unverified)).toBe(true);
    });
  });

  it("drops a prefetched answer for the row a later write changed", async () => {
    const { driver, server } = await deck();
    await driver.transaction(async () => {
      await driver.prefetchReads?.([{ sql: CARD_ROW, params: [1] }]);
      await driver.query("UPDATE cards SET v = ? WHERE id = ?", ["changed", 1]);
      const row = await driver.query<{ v: string }>(CARD_ROW, [1]);
      expect(row.rows[0]?.v).toBe("changed");
    });
  });


  it("keeps a prefetched row when the block CREATES another card (the insert's own row)", async () => {
    const { driver, server } = await deck();
    await driver.transaction(async () => {
      await driver.prefetchReads?.([{ sql: CARD_ROW, params: [1] }]);
      // A card creation: the insert takes a rowid the driver learns from the
      // result, so the memo can tell WHICH row it touched, and the row's own
      // values are in the statement's VALUES clause, so the memo can also
      // tell whether the new row is in the prefetched read's answer. It is
      // not: the new row's id is 3, and the prefetched read asked for id 1.
      await driver.query("INSERT INTO cards (id, codename, type_id, v) VALUES (3, 'three', 1, 'x')", []);
      const row = await driver.query<{ v: string }>(CARD_ROW, [1]);
      expect(row.rows[0]?.v).toBe("only-in-this-row");
      // The created card's own row was never prefetched, so nothing to check
      // there; the point is that the OTHER card's prefetched answer survived
      // AND was served from the memo: one execute of CARD_ROW, the prefetch.
      expect(countOf(server, CARD_ROW)).toBe(1);
    });
  });

  it("does nothing outside a transaction, and never speculates a write", async () => {
    const { driver, server } = await deck();
    const outcomes = await driver.prefetchReads?.([{ sql: CARD_ROW, params: [1] }]);
    expect(outcomes?.every((o) => o.unverified)).toBe(true);
    expect(postCount(server)).toBe(0);

    await driver.transaction(async () => {
      const writeOutcomes = await driver.prefetchReads?.([
        { sql: "INSERT INTO cards (id, codename, type_id, v) VALUES (3, 'three', 1, 'x')", params: [] },
      ]);
      expect(writeOutcomes?.every((o) => o.unverified)).toBe(true);
      expect(countOf(server, "INSERT INTO cards (id, codename, type_id, v) VALUES (3, 'three', 1, 'x')")).toBe(0);
    });
  });
});
