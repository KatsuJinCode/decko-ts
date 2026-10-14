// Multi-user saves on Cloudflare D1 (workerd's local D1 under Miniflare):
// several writers and readers, each with its own driver object, as separate
// isolates would have, over one database.
//
// Expected outcomes (each is asserted below):
//  1. A reader that reads while a save is part-way through (its card row
//     already updated) is never answered with the partial save: on D1 it
//     waits until the save ends, on a native transaction it is answered
//     from the committed state; when the save fails, the reader gets the
//     card as it was before the save.
//  2. Under concurrent writers, some of whose saves fail part-way, no
//     reader ever observes a failed save's content, and every observation
//     is a committed state: the card's content equals the newest content
//     change recorded in its history.
//  3. Every successful save is in the final state and history; no failed
//     save left a row behind.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { CloudflareD1Adapter, type D1DatabaseLike } from "../../../src/server/drivers/d1.js";
import type { SQLDatabaseDriver, SQLQueryResult, SQLStatement } from "../../../src/server/driver.js";
import { FetchEngine } from "../../../src/card/fetch.js";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";
import { hostedDeck } from "../../hosted/hosted-backend.js";
import { splitSqlStatements } from "../fetch/fetch-test-storage.js";
import { IP, JOE, seedStandardDeck, type ActionsTestStorage } from "./actions-test-storage.js";

const SCHEMA = readFileSync(fileURLToPath(new URL("../../../db/schema.sqlite.sql", import.meta.url)), "utf8");

/** Card 50 ("Pudding", content "v1") is seeded by seedStandardDeck. */
const CARD = 50;

async function seeded(driver: SQLDatabaseDriver): Promise<void> {
  const nulls = (params: unknown[]) => params.map((p) => (p === undefined ? null : p));
  const seedDriver: SQLDatabaseDriver = {
    query: (sql, params) => driver.query(sql, nulls(params)),
    batch: (statements) => driver.batch(statements.map((s) => ({ sql: s.sql, params: nulls(s.params) }))),
  };
  for (const statement of splitSqlStatements(SCHEMA)) {
    if (/^\s*PRAGMA\b/i.test(statement)) {
      await driver.query(statement, []).catch(() => undefined);
    } else {
      await driver.query(statement, []);
    }
  }
  const storage: ActionsTestStorage = {
    driver: seedDriver,
    engine: new FetchEngine(seedDriver),
    close: () => undefined,
    selectAll: async <T>(sql: string, params: unknown[] = []) => (await seedDriver.query<T>(sql, params)).rows,
    selectOne: async <T>(sql: string, params: unknown[] = []) => (await seedDriver.query<T>(sql, params)).rows[0],
    count: async (table) => Number((await seedDriver.query<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`, [])).rows[0].n),
  };
  await seedStandardDeck(storage);
}

/** A driver that, when armed, runs `onMatch` before the first statement
 *  matching `pattern` and then fails that statement — a save that dies
 *  part-way, after its earlier writes have landed. */
class MidSaveFailureDriver implements SQLDatabaseDriver {
  private armed: { pattern: RegExp; onMatch: () => Promise<void> } | undefined;
  readonly transactionGuarantee;
  constructor(private readonly inner: SQLDatabaseDriver) {
    this.transactionGuarantee = inner.transactionGuarantee;
  }
  failOn(pattern: RegExp, onMatch: () => Promise<void> = async () => undefined): void {
    this.armed = { pattern, onMatch };
  }
  /** Fails the first statement after the card's content is written. */
  failAfterContentWrite(onMatch: () => Promise<void>): void {
    this.afterContent = onMatch;
  }
  private afterContent: (() => Promise<void>) | undefined;
  private contentWritten = false;
  private async check(sql: string): Promise<void> {
    if (this.afterContent !== undefined) {
      if (this.contentWritten) {
        const onMatch = this.afterContent;
        this.afterContent = undefined;
        this.contentWritten = false;
        await onMatch();
        throw new Error(`injected failure at: ${sql.slice(0, 60)}`);
      }
      if (/^\s*UPDATE cards SET db_content/i.test(sql)) this.contentWritten = true;
    }
    const armed = this.armed;
    if (armed === undefined || !armed.pattern.test(sql)) return;
    this.armed = undefined;
    await armed.onMatch();
    throw new Error(`injected failure at: ${sql.slice(0, 60)}`);
  }
  async query<T = unknown>(sql: string, params: unknown[]): Promise<SQLQueryResult<T>> {
    await this.check(sql);
    return this.inner.query<T>(sql, params);
  }
  /** A batch runs one statement at a time here, so a failure injected
   *  part-way through it lands after the statements before it. */
  async batch(statements: SQLStatement[]): Promise<SQLQueryResult[]> {
    const results: SQLQueryResult[] = [];
    for (const s of statements) {
      await this.check(s.sql);
      results.push(...(await this.inner.batch([s])));
    }
    return results;
  }
  transaction<R>(work: () => Promise<R>): Promise<R> {
    return this.inner.transaction!(work);
  }
}

function engineOver(driver: SQLDatabaseDriver, start: number): CardActionEngine {
  let tick = 0;
  return new CardActionEngine(new FetchEngine(driver), {
    actor: JOE,
    ipAddress: IP,
    integrationHooks: [],
    now: () => new Date(start + 1000 * tick++),
  });
}

/** The card's content and the newest content change in its history, read
 *  in one batch (one atomic read on D1). */
async function observe(reader: SQLDatabaseDriver): Promise<{ content: string; newestChange: string | null }> {
  const [card, change] = await reader.batch([
    { sql: "SELECT db_content FROM cards WHERE id = ?", params: [CARD] },
    {
      sql:
        "SELECT ch.value FROM card_changes ch JOIN card_actions a ON a.id = ch.card_action_id " +
        "WHERE a.card_id = ? AND ch.field = 2 ORDER BY ch.id DESC LIMIT 1",
      params: [CARD],
    },
  ]);
  const row = card.rows[0] as { db_content: string };
  const newest = change.rows[0] as { value: string } | undefined;
  return { content: row.db_content, newestChange: newest?.value ?? null };
}

async function settlesWithin(promise: Promise<unknown>, ms: number): Promise<boolean> {
  let settled = false;
  promise.then(
    () => (settled = true),
    () => (settled = true),
  );
  await new Promise((resolve) => setTimeout(resolve, ms));
  return settled;
}

let mf: Miniflare | undefined;
let nextDb = 0;

async function freshBinding(): Promise<D1DatabaseLike> {
  nextDb += 1;
  return (await mf!.getD1Database(`DB${nextDb}`)) as unknown as D1DatabaseLike;
}

beforeAll(async () => {
  const d1Databases: Record<string, string> = {};
  for (let i = 1; i <= 3; i++) d1Databases[`DB${i}`] = `decko-multi-user-${i}`;
  mf = new Miniflare(
    convertV4MiniflareOptions({ modules: true, script: `export default { fetch() { return new Response("ok"); } }`, d1Databases }),
  );
}, 120_000);

afterAll(async () => {
  await mf?.dispose();
});

function multiUser(label: string, openDeck: () => Promise<() => SQLDatabaseDriver>): void {
describe(`multi-user saves: ${label}: no reader sees a save that fails`, () => {
  it("a read during a save waits for it, and after the save fails it returns the card as it was", async () => {
    const connect = await openDeck();
    const writer = new MidSaveFailureDriver(connect());
    const reader = connect();
    let paused!: () => void;
    const isPaused = new Promise<void>((resolve) => {
      paused = resolve;
    });
    let release!: () => void;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    // The save stops right after its card row's content is written, then
    // fails.
    writer.failAfterContentWrite(async () => {
      paused();
      await released;
    });
    const save = engineOver(writer, Date.parse("2026-10-14T00:00:00Z")).updateCard({ cardId: CARD, content: "partial" });
    await isPaused;
    // The card row really holds the partial content at this moment: the
    // transaction's own statements see it.
    // D1 makes the read wait for the save; a native transaction answers it
    // at once from the committed state. Either way it is never the
    // partial save.
    const read = observe(reader);
    if (await settlesWithin(read, 200)) expect(await read).toEqual({ content: "v1", newestChange: null });
    if (connect().transactionGuarantee?.mechanism === "compensating") expect(await settlesWithin(read, 0)).toBe(false);
    release();
    await expect(save).rejects.toThrow(/injected failure/);
    expect(await read).toEqual({ content: "v1", newestChange: null });
    expect(await observe(reader)).toEqual({ content: "v1", newestChange: null });
  }, 120_000);

  it("concurrent writers with failing saves: every observation is committed, no failed content is ever read", async () => {
    const connect = await openDeck();
    const WRITERS = 4;
    const SAVES_PER_WRITER = 3;
    const committed: string[] = [];
    const failed: string[] = [];
    const writers = Array.from({ length: WRITERS }, (_, w) => async () => {
      const driver = new MidSaveFailureDriver(connect());
      for (let k = 0; k < SAVES_PER_WRITER; k++) {
        const fails = (w + k) % 2 === 1;
        const content = `${fails ? "failed" : "ok"}-w${w}-s${k}`;
        if (fails) {
          // Dies after its card row and act are written, with a pause so
          // readers have time to look.
          driver.failAfterContentWrite(() => new Promise((resolve) => setTimeout(resolve, 30)));
          await expect(engineOver(driver, Date.parse("2026-10-14T00:00:00Z") + w * 1e6 + k * 1e4).updateCard({ cardId: CARD, content })).rejects.toThrow(
            /injected failure/,
          );
          failed.push(content);
        } else {
          await engineOver(driver, Date.parse("2026-10-14T00:00:00Z") + w * 1e6 + k * 1e4).updateCard({ cardId: CARD, content });
          committed.push(content);
        }
      }
    });
    const observations: { content: string; newestChange: string | null }[] = [];
    let writing = true;
    const readers = Array.from({ length: 2 }, () => async () => {
      const reader = connect();
      while (writing) observations.push(await observe(reader));
    });
    const readerRuns = readers.map((r) => r());
    await Promise.all(writers.map((w) => w()));
    writing = false;
    await Promise.all(readerRuns);

    expect(failed.length).toBeGreaterThan(0);
    expect(observations.length).toBeGreaterThan(0);
    for (const seen of observations) {
      expect(seen.content.startsWith("failed-")).toBe(false);
      // Committed state: the content is the newest recorded change, or the
      // seed content before any change committed.
      expect(seen.newestChange === null ? seen.content === "v1" : seen.content === seen.newestChange).toBe(true);
    }
    const reader = connect();
    const history = await reader.query<{ value: string }>(
      "SELECT ch.value FROM card_changes ch JOIN card_actions a ON a.id = ch.card_action_id WHERE a.card_id = ? AND ch.field = 2 ORDER BY ch.id",
      [CARD],
    );
    expect([...history.rows.map((r) => r.value)].sort()).toEqual([...committed].sort());
    const final = await observe(reader);
    expect(committed).toContain(final.content);
    expect(final.content).toBe(final.newestChange);
    const journal = await reader.query<{ c: number }>("SELECT COUNT(*) AS c FROM decko_tx_undo", []);
    expect(Number(journal.rows[0].c)).toBe(0);
  }, 240_000);
});
}

multiUser("D1 (miniflare)", async () => {
  const binding = await freshBinding();
  await seeded(new CloudflareD1Adapter(binding));
  return () => new CloudflareD1Adapter(binding);
});

// The hosted conformance runner (tools/hosted-conformance/) selects this
// case alone, with a test-name filter of "hosted".
const hosted = hostedDeck();
if (hosted !== undefined) {
  multiUser(hosted.label, async () => {
    await seeded(await hosted.open());
    return () => hosted.connect();
  });
}
