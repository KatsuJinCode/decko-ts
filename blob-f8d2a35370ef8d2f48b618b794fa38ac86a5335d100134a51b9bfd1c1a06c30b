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
import { BunnyDbDriver, PREFETCH_RUN_STATEMENT_CAP } from "../../../src/card/drivers/bunny-db.js";
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

/** Write `count` rows whose ids start at `first`, then READ them back, so
 *  their ids are values the transaction produced BEFORE the run under test:
 *  a later statement that binds one of them binds a value the caller already
 *  held, which the admission rule reads as no dependency at all. (An INSERT
 *  alone would not do it: the driver reads a statement's produced values off
 *  its RESULT, and an INSERT's result is its rowid, not its columns.) */
async function insertCards(driver: BunnyDbDriver, first: number, count: number): Promise<void> {
  const values = Array.from(
    { length: count },
    (_, i) => `(${first + i}, 'code-${first + i}', 9, 'row-${first + i}')`,
  ).join(", ");
  await driver.query(
    `INSERT INTO cards (id, codename, type_id, v) VALUES ${values}`,
    [],
  );
  await driver.query("SELECT id, codename, type_id, v FROM cards WHERE id >= ?", [first]);
}

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

  it("carries a declared set LARGER than the old cap of 32 on ONE round trip", async () => {
    // THE LEVER. The card-block declaration hands the driver one set of
    // statements the engine already declared independent, and the run cap
    // used to cut that set into runs of 32: the save's own declaration
    // became nine round trips. The raised cap carries the whole set on
    // one, and the caller's own reads of every one of them are answered
    // from the memo, at the right answers.
    const { driver, server } = await deck();
    await driver.transaction(async () => {
      // The rows are written and read back BEFORE the run, so the ids they
      // carry are values the transaction produced before the run: binding
      // one is not a dependency (the admission rule's own rule).
      await insertCards(driver, 1001, 64);
      const before = postCount(server);
      const ids = Array.from({ length: 64 }, (_, i) => 1001 + i);
      // 64 ids x 3 shapes = 192 declared statements: more than 32 (the old
      // cap) and more than 128 (the cap one step below the raised one).
      const declared = ids.flatMap((id) => [
        { sql: CARD_ROW, params: [id] },
        { sql: CARD_CODENAME, params: [id] },
        { sql: "SELECT id, type_id FROM cards WHERE id = ?", params: [id] },
      ]);
      const outcomes = await driver.prefetchReads?.(declared);
      expect(outcomes?.every((o) => !o.unverified)).toBe(true);
      // ONE pipeline POST carried the whole declared set.
      expect(postCount(server) - before).toBe(1);
      // Every caller's own read of every declared statement is a memo hit:
      // no further execute reaches the server, and the answers are right.
      expect(countOf(server, CARD_ROW)).toBe(64);
      expect(countOf(server, CARD_CODENAME)).toBe(64);
      const row = await driver.query<{ v: string }>(CARD_ROW, [1001]);
      expect(row.rows[0]?.v).toBe("row-1001");
      const codename = await driver.query<{ codename: string }>(CARD_CODENAME, [1002]);
      expect(codename.rows[0]?.codename).toBe("code-1002");
      expect(postCount(server) - before).toBe(1);
    });
  });

  it("still cuts a run at the cap: a set larger than the cap splits into runs", async () => {
    // The cap is a bound, not a suggestion: a declared set that exceeds it
    // is split, and every statement of it is still answered (the caller's
    // own read falls back to the blocking path for anything a run could
    // not vouch for, and answers the same).
    const { driver, server } = await deck();
    await driver.transaction(async () => {
      const count = PREFETCH_RUN_STATEMENT_CAP + 8;
      await insertCards(driver, 2001, count);
      const before = postCount(server);
      const declared = Array.from({ length: count }, (_, i) => ({ sql: CARD_ROW, params: [2001 + i] }));
      const outcomes = await driver.prefetchReads?.(declared);
      expect(outcomes?.every((o) => !o.unverified)).toBe(true);
      // One run for the cap's worth, one for the remainder.
      expect(postCount(server) - before).toBe(2);
      // Every statement still reached the server, and the answers hold.
      const row = await driver.query<{ v: string }>(CARD_ROW, [2001]);
      expect(row.rows[0]?.v).toBe("row-2001");
    });
  });
});
