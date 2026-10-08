// Two saves to the same card at the same time, on local SQLite and on D1.
//
// Expected outcomes (each is asserted below):
//  1. Two updates without an edit-conflict guard: both succeed, one after
//     the other, in the order they started; the card ends with the second
//     one's content; each act records its own content, and neither write
//     is lost or merged.
//  2. Two editors (different accounts) whose updates both name the
//     revision they edited (lastActionIdBeforeEdit, Ruby's detect_conflict):
//     the first succeeds, the second is refused as an edit conflict and
//     stores nothing. Without the transaction's serialization both could
//     pass the check before either wrote.
//  3. Two creates of the same new name: the first succeeds, the second is
//     refused because the name is taken, and exactly one card exists.
//  4. On D1, the same holds for two driver objects (two isolates) over one
//     database: the database lock row serializes them.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { LocalSqliteDriver } from "../../../src/server/drivers/local-sqlite.js";
import { CloudflareD1Adapter, type D1DatabaseLike } from "../../../src/server/drivers/d1.js";
import type { SQLDatabaseDriver } from "../../../src/server/driver.js";
import { FetchEngine } from "../../../src/card/fetch.js";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";
import { splitSqlStatements } from "../fetch/fetch-test-storage.js";
import { IP, JOE, seedStandardDeck, type ActionsTestStorage } from "./actions-test-storage.js";
import type { Actor } from "../../../src/card/actions/types.js";

/** Two other signed-in editors: Ruby's detect_conflict ignores a newer
 *  revision made by the same account (events.rb edit_conflict?). */
const EDITOR_ONE: Actor = { id: 11, name: "Editor One" };
const EDITOR_TWO: Actor = { id: 12, name: "Editor Two" };

const SCHEMA = readFileSync(fileURLToPath(new URL("../../../db/schema.sqlite.sql", import.meta.url)), "utf8");

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

/** Card 50 ("Pudding", content "v1") is seeded by seedStandardDeck. */
const CARD = 50;

function engineOver(fetch: FetchEngine, actor: Actor = JOE): CardActionEngine {
  let tick = 0;
  return new CardActionEngine(fetch, {
    actor,
    ipAddress: IP,
    integrationHooks: [],
    now: () => new Date(Date.parse("2026-10-08T00:00:00Z") + 1000 * tick++),
  });
}

async function contentOf(driver: SQLDatabaseDriver): Promise<string> {
  const r = await driver.query<{ db_content: string }>("SELECT db_content FROM cards WHERE id = ?", [CARD]);
  return r.rows[0].db_content;
}

async function contentChangesOf(driver: SQLDatabaseDriver): Promise<string[]> {
  const r = await driver.query<{ value: string }>(
    "SELECT ch.value FROM card_changes ch JOIN card_actions a ON a.id = ch.card_action_id " +
      "WHERE a.card_id = ? AND ch.field = 2 ORDER BY ch.id",
    [CARD],
  );
  return r.rows.map((row) => row.value);
}

async function lastActionId(driver: SQLDatabaseDriver): Promise<number> {
  const r = await driver.query<{ id: number }>("SELECT MAX(id) AS id FROM card_actions WHERE card_id = ?", [CARD]);
  return Number(r.rows[0].id ?? 0);
}

function scenarios(label: string, open: () => Promise<{ a: SQLDatabaseDriver; b: SQLDatabaseDriver; dispose: () => Promise<void> }>): void {
  describe(`concurrent saves: ${label}`, () => {
    it("two unguarded updates both apply, in the order they started; neither is lost", async () => {
      const { a, b, dispose } = await open();
      try {
        const fa = new FetchEngine(a);
        const fb = a === b ? fa : new FetchEngine(b);
        const [r1, r2] = await Promise.all([
          engineOver(fa).updateCard({ cardId: CARD, content: "from first" }),
          engineOver(fb).updateCard({ cardId: CARD, content: "from second" }),
        ]);
        expect(r1?.actId).toBeDefined();
        expect(r2?.actId).toBeDefined();
        expect(r1?.actId).not.toBe(r2?.actId);
        expect(await contentOf(a)).toBe("from second");
        // History: each save's own content change, in commit order.
        expect(await contentChangesOf(a)).toEqual(["from first", "from second"]);
      } finally {
        await dispose();
      }
    }, 120_000);

    it("two updates of the same revision: the first wins, the second is refused as an edit conflict", async () => {
      const { a, b, dispose } = await open();
      try {
        const fa = new FetchEngine(a);
        const fb = a === b ? fa : new FetchEngine(b);
        await engineOver(fa).updateCard({ cardId: CARD, content: "base revision" });
        const edited = await lastActionId(a);
        const results = await Promise.allSettled([
          engineOver(fa, EDITOR_ONE).updateCard({ cardId: CARD, content: "editor one", lastActionIdBeforeEdit: edited }),
          engineOver(fb, EDITOR_TWO).updateCard({ cardId: CARD, content: "editor two", lastActionIdBeforeEdit: edited }),
        ]);
        expect(results[0].status).toBe("fulfilled");
        expect(results[1].status).toBe("rejected");
        expect(String((results[1] as PromiseRejectedResult).reason)).toMatch(/not based on latest revision/);
        expect(await contentOf(a)).toBe("editor one");
        expect((await contentChangesOf(a)).filter((v) => v === "editor two")).toEqual([]);
      } finally {
        await dispose();
      }
    }, 120_000);

    it("two creates of one new name: one card, and the second save is refused", async () => {
      const { a, b, dispose } = await open();
      try {
        const fa = new FetchEngine(a);
        const fb = a === b ? fa : new FetchEngine(b);
        const results = await Promise.allSettled([
          engineOver(fa).createCard({ name: "Raced Name", content: "one" }),
          engineOver(fb).createCard({ name: "Raced Name", content: "two" }),
        ]);
        expect(results.map((r) => r.status)).toEqual(["fulfilled", "rejected"]);
        const rows = await a.query<{ db_content: string }>("SELECT db_content FROM cards WHERE key = ?", ["raced_name"]);
        expect(rows.rows).toEqual([{ db_content: "one" }]);
      } finally {
        await dispose();
      }
    }, 120_000);
  });
}

const dirs: string[] = [];
let mf: Miniflare | undefined;
let d1Next = 0;

beforeAll(async () => {
  const d1Databases: Record<string, string> = {};
  for (let i = 1; i <= 6; i++) d1Databases[`DB${i}`] = `decko-concurrent-${i}`;
  mf = new Miniflare(
    convertV4MiniflareOptions({ modules: true, script: `export default { fetch() { return new Response("ok"); } }`, d1Databases }),
  );
}, 120_000);

afterAll(async () => {
  await mf?.dispose();
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

scenarios("local SQLite, one driver object shared by both requests", async () => {
  const dir = mkdtempSync(join(tmpdir(), "decko-concurrent-"));
  dirs.push(dir);
  const driver = new LocalSqliteDriver({ path: join(dir, "deck.sqlite") });
  await seeded(driver);
  return { a: driver, b: driver, dispose: async () => driver.close() };
});

scenarios("D1, one driver object shared by both requests", async () => {
  d1Next += 1;
  const binding = (await mf!.getD1Database(`DB${d1Next}`)) as unknown as D1DatabaseLike;
  const driver = new CloudflareD1Adapter(binding);
  await seeded(driver);
  return { a: driver, b: driver, dispose: async () => undefined };
});

scenarios("D1, two driver objects over one database (two isolates)", async () => {
  d1Next += 1;
  const binding = (await mf!.getD1Database(`DB${d1Next}`)) as unknown as D1DatabaseLike;
  const a = new CloudflareD1Adapter(binding);
  await seeded(a);
  return { a, b: new CloudflareD1Adapter(binding), dispose: async () => undefined };
});
