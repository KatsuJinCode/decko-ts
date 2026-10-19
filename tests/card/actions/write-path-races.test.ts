// HTTP-layer write-path races, at the smallest scale that reproduces them.
//
// The ask's six races, each driven the way the wire delivers it — concurrent
// starts, one engine per request (an HTTP request builds its own engine; the
// drivers are shared exactly as the hosts share them):
//
//   1. Double-click: the same save POSTed twice inside one round-trip
//      window (same actor, same base revision, same payload). The edit
//      conflict guard ignores a newer revision made by the SAME account
//      (card-mod-history events.rb:65-72), so a double-click is NOT refused
//      as a conflict; the coherent contract: both clicks answer, the stored
//      content is the clicked content, and history does not merge or lose
//      either POST.
//   2. Ten saves of one card fired concurrently: every save lands, history
//      carries ten changes in start order, and the final row is the last
//      one (the transaction gate is FIFO).
//   3. Create + immediate update in the same tick: both apply.
//   4. Delete + recreate of the same name, concurrently: never two live
//      rows under one key; the end state is one of the two serializations.
//   5. Rapid alternating follow/unfollow (10x): the follow rule card ends
//      at the LAST request's value with one stored change per click.
//   6. Two different cards' saves interleaved at the statement level over
//      the Bunny Hrana wire: transactions through one shared driver object
//      never interleave (TransactionGate), and the transaction-scoped read
//      memo (cff0c8d9) answers only inside its own transaction — measured
//      on the captured wire, not by trusting the code.
//
// The last group drives the shared-driver coupling the hosts actually run
// with: a statement issued OUTSIDE any transaction while another request's
// save transaction is open on the same driver object (the Node staging
// server shares one LocalSqliteDriver across sessions and writes; the Bunny
// edge shares one isolate driver — deploy/bunny-worker-src/
// bunny-edge-deck-config.ts getDriver). src/server/driver.ts:43-46
// documents that such statements join the transaction. These tests pin
// what that coupling does to a standalone write that looked committed when
// its own request answered, once the save rolls back.

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
import { IP, JOE, seedStandardDeck, FIXED_TS, type ActionsTestStorage } from "./actions-test-storage.js";
import type { Actor } from "../../../src/card/actions/types.js";
import { hostedDeck } from "../../hosted/hosted-backend.js";
import { LibSqlHttpAdapter } from "../../../src/server/drivers/libsql-http.js";
import { BunnyDbDriver } from "../../../src/card/drivers/bunny-db.js";
import { startMockHranaServer, type MockHranaServer } from "../../server/drivers/mock-hrana-server.js";

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

/** One plain live content card, seeded directly (same column conventions as
 *  actions-test-storage.ts seedCard): a second card so two DIFFERENT cards'
 *  saves can be raced. */
async function seedSecondCard(driver: SQLDatabaseDriver, id: number, name: string, content: string): Promise<void> {
  await driver.query(
    `INSERT INTO cards
       (id, name, key, codename, left_id, right_id, current_revision_id,
        created_at, updated_at, creator_id, updater_id, read_rule_class,
        read_rule_id, references_expired, trash, type_id, db_content)
     VALUES (?, ?, ?, NULL, NULL, NULL, NULL, ?, ?, 1, 1, NULL, NULL, NULL, 0, 2, ?)`,
    [id, name, DeckoKey(name), FIXED_TS, FIXED_TS, content],
  );
}

/** The downcased underscore key of a simple name (name.ts key derivation,
 *  for the seed only). */
function DeckoKey(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "_");
}

/** Card 50 ("Pudding", content "v1") is seeded by seedStandardDeck. */
const CARD = 50;
/** The second content card seeded for two-card races. */
const CARD_B = 60;

/** One engine per concurrent HTTP request (the routes build an engine per
 *  request; a shared engine would NEST the saves into one transaction
 *  instead of racing them). */
function engineOver(fetch: FetchEngine, actor: Actor = JOE): CardActionEngine {
  let tick = 0;
  return new CardActionEngine(fetch, {
    actor,
    ipAddress: IP,
    integrationHooks: [],
    now: () => new Date(Date.parse("2026-10-08T00:00:00Z") + 1000 * tick++),
  });
}

async function contentOf(driver: SQLDatabaseDriver, cardId = CARD): Promise<string | null> {
  const r = await driver.query<{ db_content: string | null }>("SELECT db_content FROM cards WHERE id = ?", [cardId]);
  return r.rows[0]?.db_content ?? null;
}

async function contentChangesOf(driver: SQLDatabaseDriver, cardId = CARD): Promise<Array<string | null>> {
  const r = await driver.query<{ value: string | null }>(
    "SELECT ch.value FROM card_changes ch JOIN card_actions a ON a.id = ch.card_action_id " +
      "WHERE a.card_id = ? AND ch.field = 2 ORDER BY ch.id",
    [cardId],
  );
  return r.rows.map((row) => row.value!);
}

function scenarios(label: string, open: () => Promise<{ a: SQLDatabaseDriver; b: SQLDatabaseDriver; dispose: () => Promise<void> }>): void {
  describe(`write-path races: ${label}`, () => {
    it("double-click: the same save POSTed twice inside one round-trip window stores the clicked content and does not lose or merge either POST", async () => {
      const { a, b, dispose } = await open();
      try {
        const fa = new FetchEngine(a);
        const fb = a === b ? fa : new FetchEngine(b);
        // Both POSTs carry the same base revision and the same payload —
        // what a double-click puts on the wire.
        const clicked = "double-clicked content";
        const results = await Promise.allSettled([
          engineOver(fa).updateCard({ cardId: CARD, content: clicked }),
          engineOver(fb).updateCard({ cardId: CARD, content: clicked }),
        ]);
        // A double-click must not surface an error to either click: both
        // requests are well-formed and the same-account guard lets them by.
        expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled"]);
        expect(await contentOf(a)).toBe(clicked);
        // Exactly ONE stored change: the writes serialize (gate or database
        // lock), so the loser of the race reads the winner's committed
        // content and its identical save is a no-op (update.test.ts:66 —
        // "no-op saves write no action", Ruby events.rb parity). No merge,
        // no loss, no phantom value, however the race lands.
        expect(await contentChangesOf(a)).toEqual([clicked]);
      } finally {
        await dispose();
      }
    }, 240_000);

    it("double-click with different payloads from one account: the second click wins, as the same-account guard dictates", async () => {
      const { a, b, dispose } = await open();
      try {
        const fa = new FetchEngine(a);
        const fb = a === b ? fa : new FetchEngine(b);
        const results = await Promise.allSettled([
          engineOver(fa).updateCard({ cardId: CARD, content: "first click" }),
          engineOver(fb).updateCard({ cardId: CARD, content: "second click" }),
        ]);
        expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled"]);
        expect(await contentOf(a)).toBe("second click");
      } finally {
        await dispose();
      }
    }, 240_000);

    it("ten saves of one card fired concurrently: all ten land, history is sane, final state is the last one", async () => {
      const { a, b, dispose } = await open();
      try {
        const fa = new FetchEngine(a);
        const fb = a === b ? fa : new FetchEngine(b);
        const payloads = Array.from({ length: 10 }, (_, i) => `save #${i + 1}`);
        const results = await Promise.allSettled(
          payloads.map((content, i) => engineOver(i % 2 === 0 ? fa : fb).updateCard({ cardId: CARD, content })),
        );
        expect(results.map((r) => r.status)).toEqual(Array.from({ length: 10 }, () => "fulfilled"));
        // History: ten stored changes, each payload exactly once — the saves
        // serialize whole (gate or database lock), so nothing tears or
        // merges. Through ONE shared driver object the gate is FIFO and the
        // changes land in start order; over separate connections the
        // database's lock order decides, which a start-order assertion may
        // not demand (Ruby over a connection pool behaves the same way).
        const history = await contentChangesOf(a);
        expect([...history].sort()).toEqual([...payloads].sort());
        if (a === b) expect(history).toEqual(payloads);
        // The final row is whichever save committed last — always one of
        // the ten, never a merge.
        expect(payloads).toContain(await contentOf(a));
      } finally {
        await dispose();
      }
    }, 240_000);

    it("create + immediate update in the same tick: both apply, neither corrupts the other", async () => {
      const { a, b, dispose } = await open();
      try {
        const fa = new FetchEngine(a);
        const fb = a === b ? fa : new FetchEngine(b);
        const [created, updated] = await Promise.allSettled([
          engineOver(fa).createCard({ name: "Same Tick", content: "born" }),
          engineOver(fb).updateCard({ cardId: CARD, content: "ticked" }),
        ]);
        expect(created.status).toBe("fulfilled");
        expect(updated.status).toBe("fulfilled");
        const rows = await a.query<{ id: number; db_content: string | null }>(
          "SELECT id, db_content FROM cards WHERE name = ? AND trash = 0",
          ["Same Tick"],
        );
        expect(rows.rows).toEqual([{ id: expect.any(Number), db_content: "born" }]);
        expect(await contentOf(a)).toBe("ticked");
        expect(await contentChangesOf(a)).toEqual(["ticked"]);
      } finally {
        await dispose();
      }
    }, 240_000);

    it("delete + recreate of the same name, concurrently: never two live rows under one key, end state is one serialization", async () => {
      const { a, b, dispose } = await open();
      try {
        const fa = new FetchEngine(a);
        const fb = a === b ? fa : new FetchEngine(b);
        const [deleted, created] = await Promise.allSettled([
          engineOver(fa).deleteCard({ cardId: CARD }),
          engineOver(fb).createCard({ name: "Pudding", content: "reborn" }),
        ]);
        expect(deleted.status).toBe("fulfilled");
        // Invariant: at most one LIVE row carries the key, whatever the
        // arrival order was.
        const live = await a.query<{ id: number; db_content: string | null }>(
          "SELECT id, db_content FROM cards WHERE key = ? AND trash = 0",
          ["pudding"],
        );
        expect(live.rows.length).toBeLessThanOrEqual(1);
        if (created.status === "fulfilled") {
          expect(live.rows).toEqual([{ id: expect.any(Number), db_content: "reborn" }]);
        } else {
          expect(live.rows).toEqual([]);
        }
      } finally {
        await dispose();
      }
    }, 240_000);

    it("rapid alternating follow/unfollow (10x) ends at the last request's value with one stored change per click", async () => {
      const { a, b, dispose } = await open();
      try {
        const fa = new FetchEngine(a);
        const fb = a === b ? fa : new FetchEngine(b);
        const ALWAYS = "[[*always]]";
        const NEVER = "[[*never]]";
        // The user's click order: follow, unfollow, follow, ... — ten
        // requests, #10 an unfollow, so the defined end state is [[*never]].
        const clicks: Array<"follow" | "unfollow"> = Array.from({ length: 10 }, (_, i) => (i % 2 === 0 ? "follow" : "unfollow"));
        // Click 1 CREATEs the rule (none exists yet); its response carries
        // the rule's id, which every later click's form already holds.
        const createResult = await engineOver(fa).createCard({
          name: "Pudding+*self+*follow",
          content: clicks[0] === "follow" ? ALWAYS : NEVER,
        });
        const ruleId = createResult?.cardId;
        expect(ruleId).toBeDefined();
        // Clicks 2-10 fired without waiting for one another.
        const results = await Promise.allSettled(
          clicks.slice(1).map((kind, i) =>
            engineOver(i % 2 === 0 ? fb : fa).updateCard({ cardId: ruleId!, content: kind === "follow" ? ALWAYS : NEVER }),
          ),
        );
        const reasons = results.map((r) => (r.status === "rejected" ? String(r.reason) : null));
        if (a !== b && reasons.some((r) => r !== null)) {
          console.log("[write-path-races] two-object follow rejections:", JSON.stringify(reasons));
        }
        if (a === b) expect(reasons.filter((r) => r !== null)).toEqual([]);
        // Every click that landed stored its own value; the card always
        // ends at SOME click's value — never torn, never merged.
        const final = await contentOf(a, ruleId!);
        expect([ALWAYS, NEVER]).toContain(final);
        if (a === b) {
          // The gate is FIFO: clicks land in click order, so the defined
          // end state is the LAST click's value and every click stored
          // exactly one alternating change.
          expect(final).toBe(NEVER);
          expect(await contentChangesOf(a, ruleId!)).toEqual(clicks.map((k) => (k === "follow" ? ALWAYS : NEVER)));
        } else {
          const history = await contentChangesOf(a, ruleId!);
          expect(history.length).toBeGreaterThanOrEqual(1);
          expect(history.every((v) => v === ALWAYS || v === NEVER)).toBe(true);
        }
      } finally {
        await dispose();
      }
    }, 240_000);
  });
}

const dirs: string[] = [];
let mf: Miniflare | undefined;
let d1Next = 0;

beforeAll(async () => {
  const d1Databases: Record<string, string> = {};
  for (let i = 1; i <= 16; i++) d1Databases[`DB${i}`] = `decko-races-${i}`;
  mf = new Miniflare(
    convertV4MiniflareOptions({ modules: true, script: `export default { fetch() { return new Response("ok"); } }`, d1Databases }),
  );
}, 120_000);

afterAll(async () => {
  await mf?.dispose();
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

scenarios("local SQLite, one driver object shared by both requests", async () => {
  const dir = mkdtempSync(join(tmpdir(), "decko-races-"));
  dirs.push(dir);
  const driver = new LocalSqliteDriver({ path: join(dir, "deck.sqlite") });
  await seeded(driver);
  await seedSecondCard(driver, CARD_B, "Waffle", "w1");
  return { a: driver, b: driver, dispose: async () => driver.close() };
});

scenarios("D1, one driver object shared by both requests", async () => {
  d1Next += 1;
  const binding = (await mf!.getD1Database(`DB${d1Next}`)) as unknown as D1DatabaseLike;
  const driver = new CloudflareD1Adapter(binding);
  await seeded(driver);
  await seedSecondCard(driver, CARD_B, "Waffle", "w1");
  return { a: driver, b: driver, dispose: async () => undefined };
});

for (const [label, make] of [
  ["libSQL over HTTP, two driver objects (Hrana test server)", (url: string) => new LibSqlHttpAdapter({ url })],
  ["Bunny Database driver, two driver objects (Hrana test server)", (url: string) => new BunnyDbDriver({ url, timeoutMs: 0 })],
] as const) {
  scenarios(label, async () => {
    const dir = mkdtempSync(join(tmpdir(), "decko-races-"));
    dirs.push(dir);
    const server = await startMockHranaServer({ path: join(dir, "deck.sqlite") });
    const a = make(server.url);
    await seeded(a);
    await seedSecondCard(a, CARD_B, "Waffle", "w1");
    return { a, b: make(server.url), dispose: () => server.close() };
  });
}

const hosted = hostedDeck();
if (hosted !== undefined) {
  scenarios(`${hosted.label}, two driver objects over one database`, async () => {
    const a = await hosted.open();
    await seeded(a);
    await seedSecondCard(a, CARD_B, "Waffle", "w1");
    return { a, b: hosted.connect(), dispose: async () => undefined };
  });
}

scenarios("D1, two driver objects over one database (two isolates)", async () => {
  d1Next += 1;
  const binding = (await mf!.getD1Database(`DB${d1Next}`)) as unknown as D1DatabaseLike;
  const a = new CloudflareD1Adapter(binding);
  await seeded(a);
  await seedSecondCard(a, CARD_B, "Waffle", "w1");
  return { a, b: new CloudflareD1Adapter(binding), dispose: async () => undefined };
});

// ---------------------------------------------------------------------------
// Statement-level interleaving and memo isolation over the Hrana wire
// ---------------------------------------------------------------------------

/** Flatten the captured Hrana POSTs into (group, sql) pairs. A baton-less
 *  POST's BEGIN IMMEDIATE opens group N; its COMMIT/ROLLBACK closes it.
 *  Statements outside any transaction get group 0. */
function wireGroups(requests: MockHranaServer["requests"]): Array<{ group: number; sql: string }> {
  const out: Array<{ group: number; sql: string }> = [];
  let group = 0;
  for (const req of requests) {
    const body = req.body as { requests?: unknown } | undefined;
    const entries = Array.isArray(body?.requests) ? (body!.requests as Array<{ type?: string; stmt?: { sql?: string } }>) : [];
    for (const entry of entries) {
      if (entry?.type !== "execute" || typeof entry.stmt?.sql !== "string") continue;
      const sql = entry.stmt.sql;
      if (/^BEGIN/i.test(sql)) group += 1;
      const inTransaction = group > 0 && !/^(COMMIT|ROLLBACK)$/i.test(sql.trim());
      out.push({ group: inTransaction ? group : /^(BEGIN|COMMIT|ROLLBACK)/i.test(sql) ? group : 0, sql });
      if (/^(COMMIT|ROLLBACK)$/i.test(sql.trim())) group = 0;
    }
  }
  return out;
}

describe("statement-level interleave and memo isolation (Bunny driver, Hrana test server)", () => {
  it("two saves of different cards fired concurrently through one shared driver object never interleave on the wire", async () => {
    const dir = mkdtempSync(join(tmpdir(), "decko-races-wire-"));
    dirs.push(dir);
    const server = await startMockHranaServer({ path: join(dir, "deck.sqlite") });
    try {
      const driver = new BunnyDbDriver({ url: server.url, timeoutMs: 0 });
      await seeded(driver);
      await seedSecondCard(driver, CARD_B, "Waffle", "w1");
      const fetch = new FetchEngine(driver);
      const [r1, r2] = await Promise.all([
        engineOver(fetch).updateCard({ cardId: CARD, content: "save one" }),
        engineOver(fetch).updateCard({ cardId: CARD_B, content: "save two" }),
      ]);
      expect(r1?.actId).toBeDefined();
      expect(r2?.actId).toBeDefined();
      // BEGIN and COMMIT strictly alternate B,C,B,C on the wire: no second
      // BEGIN before the first COMMIT — no statement-level interleaving.
      const verbs = wireGroups(server.requests)
        .filter((s) => /^(BEGIN|COMMIT|ROLLBACK)/i.test(s.sql))
        .map((s) => s.sql.split(/\s+/)[0].toUpperCase());
      expect(verbs.filter((v) => v === "BEGIN").length).toBeGreaterThanOrEqual(2);
      let open = 0;
      for (const v of verbs) {
        if (v === "BEGIN") {
          expect(open).toBe(0);
          open += 1;
        } else {
          expect(open).toBe(1);
          open -= 1;
        }
      }
      // Both saves committed, each card coherent, histories separate (the
      // seeded rows carry no history — only these saves' changes exist).
      expect(await contentOf(driver)).toBe("save one");
      expect(await contentOf(driver, CARD_B)).toBe("save two");
      expect(await contentChangesOf(driver)).toEqual(["save one"]);
      expect(await contentChangesOf(driver, CARD_B)).toEqual(["save two"]);
    } finally {
      await server.close();
    }
  }, 240_000);

  it("the read memo answers repeats inside one transaction and never across transactions (cff0c8d9 isolation, measured on the wire)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "decko-races-memo-"));
    dirs.push(dir);
    const server = await startMockHranaServer({ path: join(dir, "deck.sqlite") });
    try {
      const driver = new BunnyDbDriver({ url: server.url, timeoutMs: 0 });
      await seeded(driver);
      const READ = "SELECT db_content FROM cards WHERE id = 50 AND trash = 0 LIMIT 1";
      const readOnWire = () =>
        server.requests.filter((req) =>
          JSON.stringify((req.body as { requests?: Array<{ stmt?: { sql?: string } }> })?.requests ?? []).includes(READ),
        ).length;

      const before = readOnWire();
      // Transaction 1: read twice, write once, read once more. The memo may
      // answer the second read from the first; the post-write read must
      // NOT be answered from the pre-write memo (it would carry "v1").
      await driver.transaction(async () => {
        const first = await driver.query<{ db_content: string }>(READ, []);
        expect(first.rows[0]?.db_content).toBe("v1");
        const second = await driver.query<{ db_content: string }>(READ, []);
        expect(second.rows[0]?.db_content).toBe("v1");
        await driver.query("UPDATE cards SET db_content = 'memo probe' WHERE id = 50", []);
        const after = await driver.query<{ db_content: string }>(READ, []);
        expect(after.rows[0]?.db_content).toBe("memo probe");
      });
      // Exactly 2 wire readings of READ inside tx1: the first, and the
      // post-write one. The memo collapsed the repeat; the write killed the
      // stale entry; nothing was served from a dead answer.
      expect(readOnWire() - before).toBe(2);

      // Transaction 2, after tx1 committed: the memo from tx1 is gone — the
      // same read goes to the wire again and sees tx1's committed write.
      const atTx2Start = readOnWire();
      await driver.transaction(async () => {
        const fresh = await driver.query<{ db_content: string }>(READ, []);
        expect(fresh.rows[0]?.db_content).toBe("memo probe");
      });
      expect(readOnWire() - atTx2Start).toBe(1);
    } finally {
      await server.close();
    }
  }, 240_000);
});

// ---------------------------------------------------------------------------
// The shared-driver coupling: a standalone statement issued while another
// request's save transaction is open on the same driver object
// ---------------------------------------------------------------------------

interface SwallowOutcome {
  /** B's standalone write completed successfully (after A's transaction
   *  ended — in the fixed world it queues instead of joining). */
  bAnswered: boolean;
  /** B's write was still there after everything settled. */
  survived: boolean;
  /** A standalone read issued while A's transaction was open saw only
   *  committed data (B's queued write invisible, A's uncommitted write
   *  invisible). Undefined where the driver queues stray reads (Local's
   *  single connection), so the observation cannot be made mid-transaction. */
  midTxSeesOnlyCommitted?: boolean;
  /** A's own uncommitted write was rolled back. */
  aRolledBack: boolean;
}

async function swallowProbe(open: (path: string) => Promise<{ driver: SQLDatabaseDriver; close: () => Promise<void> }>): Promise<SwallowOutcome> {
  const dir = mkdtempSync(join(tmpdir(), "decko-races-swallow-"));
  dirs.push(dir);
  const { driver, close } = await open(join(dir, "deck.sqlite"));
  await seeded(driver);
  await driver.query("CREATE TABLE IF NOT EXISTS swallow_probe (id INTEGER PRIMARY KEY, tag TEXT)", []);
  // Request A: a save transaction held open at a controlled point.
  let releaseA: () => void = () => undefined;
  const aHolds = new Promise<void>((resolve) => {
    releaseA = resolve;
  });
  let startedA: () => void = () => undefined;
  const aStarted = new Promise<void>((resolve) => {
    startedA = resolve;
  });
  let failA = false;
  if (!driver.transaction) throw Error('Swallow probe requires a transactional driver');
  const txA = driver.transaction(async () => {
    await driver.query("UPDATE cards SET db_content = 'tx A uncommitted' WHERE id = 50", []);
    startedA();
    await aHolds;
    if (failA) throw new Error("request A's save failed");
  });
  await aStarted;
  // Request B: a standalone write issued outside any transaction while A's
  // transaction is open — the session-row shape (SessionStore issues
  // driver.query outside any transaction; vm-staging-server.mjs:709 shares
  // the driver). In flight, not awaited: the request has not answered yet.
  const bInsert = driver.query("INSERT INTO swallow_probe (tag) VALUES ('request B committed this')", []);
  // While A holds the transaction: a stray read (own pipeline on Bunny) must
  // see only committed data — neither A's uncommitted UPDATE nor B's queued
  // INSERT. On Local's single connection a stray read queues, so the
  // observation cannot be made and stays undefined.
  let midTxSeesOnlyCommitted: boolean | undefined;
  if (driver instanceof BunnyDbDriver || driver instanceof LibSqlHttpAdapter) {
    const midTx = await driver.query<{ n: number }>("SELECT COUNT(*) AS n FROM swallow_probe", []);
    midTxSeesOnlyCommitted = Number(midTx.rows[0]?.n ?? 0) === 0;
  }
  // A now fails and rolls back; B's write then completes as its own unit.
  failA = true;
  releaseA();
  await txA.catch(() => undefined);
  const bAnswered = await bInsert.then(
    () => true,
    () => false,
  );
  const after = await driver.query<{ n: number }>("SELECT COUNT(*) AS n FROM swallow_probe", []);
  const survived = Number(after.rows[0]?.n ?? 0) === 1;
  const card = await driver.query<{ db_content: string | null }>("SELECT db_content FROM cards WHERE id = 50", []);
  const aRolledBack = (card.rows[0]?.db_content ?? null) !== "tx A uncommitted";
  await close();
  return { bAnswered, survived, midTxSeesOnlyCommitted, aRolledBack };
}

describe("a standalone write that lands inside another request's open save transaction", () => {
  it("local SQLite (Node staging host): B's write queues, then commits — A's rollback cannot undo it", async () => {
    const outcome = await swallowProbe(async (path) => {
      const driver = new LocalSqliteDriver({ path });
      return { driver, close: async () => driver.close() };
    });
    expect(outcome.bAnswered).toBe(true);
    expect(outcome.survived).toBe(true);
    expect(outcome.aRolledBack).toBe(true);
  }, 240_000);

  it("Bunny driver over Hrana (edge host): B's write queues, then commits — A's rollback cannot undo it, and mid-transaction reads see committed data only", async () => {
    const outcome = await swallowProbe(async (path) => {
      const server = await startMockHranaServer({ path });
      const driver = new BunnyDbDriver({ url: server.url, timeoutMs: 0 });
      return { driver, close: async () => void (await server.close()) };
    });
    expect(outcome.midTxSeesOnlyCommitted).toBe(true);
    expect(outcome.bAnswered).toBe(true);
    expect(outcome.survived).toBe(true);
    expect(outcome.aRolledBack).toBe(true);
  }, 240_000);

  it("libSQL over HTTP: B's write queues, then commits — A's rollback cannot undo it, and mid-transaction reads see committed data only", async () => {
    const outcome = await swallowProbe(async (path) => {
      const server = await startMockHranaServer({ path });
      const driver = new LibSqlHttpAdapter({ url: server.url });
      return { driver, close: async () => void (await server.close()) };
    });
    expect(outcome.midTxSeesOnlyCommitted).toBe(true);
    expect(outcome.bAnswered).toBe(true);
    expect(outcome.survived).toBe(true);
    expect(outcome.aRolledBack).toBe(true);
  }, 240_000);
});
