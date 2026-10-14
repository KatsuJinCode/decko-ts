// Every save is all or nothing, on every write backend.
//
// Each scenario runs the real CardActionEngine over a backend, injects a
// failure at one stage of a save (subcard validation, the reference write,
// the history write, a child's trash write, the attachment identifier
// write), and asserts that every table is exactly as it was before the
// save. Backends: local SQLite (native transaction), Cloudflare D1 under
// miniflare (compensating journal), and libSQL over HTTP through both Hrana
// adapters (native transaction on a stream; mock server over SQLite).
//
// What "exactly as it was" excludes, per backend, is stated by the backend's
// guarantee: where a rollback does not give back AUTOINCREMENT ids
// (idsReusedAfterRollback false — D1), sqlite_sequence is left out, and the
// deck_data_version stamp is required to have moved forward instead of
// back (the restore rewrites rows, which is a change readers must see).
// The journal's own bookkeeping tables (decko_tx_*, decko_undo_*) are
// required to be empty.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { LocalSqliteDriver } from "../../../src/server/drivers/local-sqlite.js";
import { CloudflareD1Adapter, type D1DatabaseLike } from "../../../src/server/drivers/d1.js";
import { LibSqlHttpAdapter } from "../../../src/server/drivers/libsql-http.js";
import { BunnyDbDriver } from "../../../src/card/drivers/bunny-db.js";
import { PostgresDriver } from "../../../src/server/drivers/postgres.js";
import { PGlite } from "@electric-sql/pglite";
import type { SQLDatabaseDriver, SQLQueryResult, SQLStatement, SQLTransactionGuarantee } from "../../../src/server/driver.js";
import { FetchEngine } from "../../../src/card/fetch.js";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";
import type { AttachmentStore, AttachmentStoreInput, StoredAttachment } from "../../../src/card/attachments/attachment-store.js";
import type { SavePathIntegrationHook } from "../../../src/card/notify/types.js";
import { splitSqlStatements } from "../fetch/fetch-test-storage.js";
import { startMockHranaServer } from "../../server/drivers/mock-hrana-server.js";
import {
  CARDTYPE_ID,
  IP,
  JOE,
  fakeClock,
  seedCard,
  seedStandardDeck,
  type ActionsTestStorage,
} from "./actions-test-storage.js";

// ---------------------------------------------------------------------------
// Failure injection
// ---------------------------------------------------------------------------

class InjectedFailure extends Error {
  constructor(sql: string) {
    super(`injected failure at: ${sql.replace(/\s+/g, " ").slice(0, 80)}`);
    this.name = "InjectedFailure";
  }
}

/** Passes every statement through, except that once armed it throws on the
 *  `nth` statement matching `pattern` (in query or in batch, before it
 *  reaches the database). transaction() is the wrapped driver's. */
class FailureInjectingDriver implements SQLDatabaseDriver {
  private pattern: RegExp | undefined;
  private remaining = 0;
  readonly transactionGuarantee: SQLTransactionGuarantee | undefined;

  constructor(private readonly inner: SQLDatabaseDriver) {
    this.transactionGuarantee = inner.transactionGuarantee;
  }

  failOn(pattern: RegExp, nth = 1): void {
    this.pattern = pattern;
    this.remaining = nth;
  }

  disarm(): void {
    this.pattern = undefined;
  }

  private check(sql: string): void {
    if (this.pattern === undefined || !this.pattern.test(sql)) return;
    this.remaining -= 1;
    if (this.remaining === 0) {
      this.pattern = undefined;
      throw new InjectedFailure(sql);
    }
  }

  query<T>(sql: string, params: unknown[]): Promise<SQLQueryResult<T>> {
    this.check(sql);
    return this.inner.query<T>(sql, params);
  }

  batch(statements: SQLStatement[]): Promise<SQLQueryResult[]> {
    for (const s of statements) this.check(s.sql);
    return this.inner.batch(statements);
  }

  transaction<R>(work: () => Promise<R>): Promise<R> {
    return this.inner.transaction!(work);
  }
}

// ---------------------------------------------------------------------------
// Backends
// ---------------------------------------------------------------------------

interface Backend {
  driver: SQLDatabaseDriver;
  /** A second connection to the same database (to see what is committed),
   *  where the backend has one. */
  observer?: SQLDatabaseDriver;
  dispose(): Promise<void>;
}

const SCHEMA = readFileSync(fileURLToPath(new URL("../../../db/schema.sqlite.sql", import.meta.url)), "utf8");

async function loadSchema(driver: SQLDatabaseDriver): Promise<void> {
  for (const statement of splitSqlStatements(SCHEMA)) {
    // D1 manages foreign-key enforcement itself; the schema declares none.
    if (/^\s*PRAGMA\b/i.test(statement)) {
      await driver.query(statement, []).catch(() => undefined);
      continue;
    }
    await driver.query(statement, []);
  }
}

let mf: Miniflare | undefined;
let d1Counter = 0;
const D1_DATABASES = 16;
const scratchDirs: string[] = [];

function scratchDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "decko-atomic-"));
  scratchDirs.push(dir);
  return dir;
}

const BACKENDS: Record<string, () => Promise<Backend>> = {
  "PostgreSQL (PGlite, native)": async () => {
    const driver = new PostgresDriver({ client: await PGlite.create() });
    return { driver, dispose: () => driver.close() };
  },
  "local SQLite (native)": async () => {
    const path = join(scratchDir(), "deck.sqlite");
    const driver = new LocalSqliteDriver({ path });
    const observer = new LocalSqliteDriver({ path });
    return {
      driver,
      observer,
      dispose: async () => {
        driver.close();
        observer.close();
      },
    };
  },
  "Cloudflare D1 (miniflare, compensating)": async () => {
    d1Counter += 1;
    if (d1Counter > D1_DATABASES) throw new Error("raise D1_DATABASES: more D1 scenarios than bindings");
    const binding = (await mf!.getD1Database(`DB${d1Counter}`)) as unknown as D1DatabaseLike;
    return { driver: new CloudflareD1Adapter(binding), observer: new CloudflareD1Adapter(binding), dispose: async () => undefined };
  },
  "libSQL over HTTP (Hrana stream, mock server)": async () => {
    const server = await startMockHranaServer({ path: join(scratchDir(), "deck.sqlite") });
    return {
      driver: new LibSqlHttpAdapter({ url: server.url }),
      observer: new LibSqlHttpAdapter({ url: server.url }),
      dispose: () => server.close(),
    };
  },
  "Bunny Database driver (Hrana stream, mock server)": async () => {
    const server = await startMockHranaServer({ path: join(scratchDir(), "deck.sqlite") });
    return {
      driver: new BunnyDbDriver({ url: server.url, timeoutMs: 0 }),
      observer: new BunnyDbDriver({ url: server.url, timeoutMs: 0 }),
      dispose: () => server.close(),
    };
  },
};

beforeAll(async () => {
  const d1Databases: Record<string, string> = {};
  for (let i = 1; i <= D1_DATABASES; i++) d1Databases[`DB${i}`] = `decko-atomic-${i}`;
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: `export default { fetch() { return new Response("ok"); } }`,
      d1Databases,
    }),
  );
}, 120_000);

afterAll(async () => {
  await mf?.dispose();
  for (const dir of scratchDirs) rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// The deck under test and the whole-database snapshot
// ---------------------------------------------------------------------------

const FILE_TYPE_ID = 400;

interface Deck {
  backend: Backend;
  injector: FailureInjectingDriver;
  fetch: FetchEngine;
  engine(opts?: { hooks?: SavePathIntegrationHook[]; store?: AttachmentStore }): CardActionEngine;
  snapshot(): Promise<Snapshot>;
}

interface Snapshot {
  tables: Record<string, unknown[]>;
  version: number;
  bookkeepingRows: number;
}

async function openDeck(make: () => Promise<Backend>): Promise<Deck> {
  const backend = await make();
  const injector = new FailureInjectingDriver(backend.driver);
  const fetch = new FetchEngine(injector);
  // The seed helpers pass undefined for absent columns, which only
  // better-sqlite3 accepts (as NULL); the remote adapters reject it.
  const nulls = (params: unknown[]) => params.map((p) => (p === undefined ? null : p));
  const raw = backend.driver;
  const driver: SQLDatabaseDriver = {
    query: (sql, params) => raw.query(sql, nulls(params)),
    batch: (statements) => raw.batch(statements.map((s) => ({ sql: s.sql, params: nulls(s.params) }))),
  };
  const storage: ActionsTestStorage = {
    driver,
    engine: fetch,
    close: () => undefined,
    selectAll: async <T>(sql: string, params: unknown[] = []) => (await driver.query<T>(sql, params)).rows,
    selectOne: async <T>(sql: string, params: unknown[] = []) => (await driver.query<T>(sql, params)).rows[0],
    count: async (table) => Number((await driver.query<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`, [])).rows[0].n),
  };
  try {
    await loadSchema(driver);
    await seedStandardDeck(storage);
    await seedCard(storage, { id: FILE_TYPE_ID, name: "File", codename: "file", typeId: CARDTYPE_ID });
    await seedCard(storage, { id: 60, name: "Parent Card", dbContent: "parent" });
    await seedCard(storage, { id: 62, name: "kid", dbContent: "" });
    await seedCard(storage, { id: 61, leftId: 60, rightId: 62, dbContent: "kid" });
  } catch (error) {
    await backend.dispose();
    throw error;
  }
  const clock = fakeClock();
  const reusesIds = backend.driver.transactionGuarantee?.idsReusedAfterRollback === true;
  return {
    backend,
    injector,
    fetch,
    engine: (opts = {}) =>
      new CardActionEngine(fetch, {
        actor: JOE,
        now: clock,
        ipAddress: IP,
        integrationHooks: opts.hooks ?? [],
        ...(opts.store !== undefined ? { attachmentStore: opts.store } : {}),
      }),
    snapshot: async () => {
      const names = (
        await backend.driver.query<{ name: string }>(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\' ORDER BY name",
          [],
        )
      ).rows.map((r) => String(r.name));
      const tables: Record<string, unknown[]> = {};
      let bookkeepingRows = 0;
      for (const name of names) {
        const rows = (await backend.driver.query(`SELECT * FROM "${name}" ORDER BY rowid`, [])).rows;
        if (name.startsWith("decko_tx_") || name.startsWith("decko_undo_")) {
          if (name !== "decko_tx_state") bookkeepingRows += rows.length;
          continue;
        }
        if (name === "deck_data_version") continue;
        if (name === "sqlite_sequence" && !reusesIds) continue;
        tables[name] = rows;
      }
      const v = await backend.driver.query<{ version: number }>("SELECT version FROM deck_data_version WHERE id = 1", []);
      return { tables, version: Number(v.rows[0]?.version ?? 0), bookkeepingRows };
    },
  };
}

function expectUnchanged(deck: Deck, before: Snapshot, after: Snapshot): void {
  expect(after.tables).toEqual(before.tables);
  expect(after.bookkeepingRows).toBe(0);
  if (deck.backend.driver.transactionGuarantee?.idsReusedAfterRollback === true) {
    expect(after.version).toBe(before.version);
  } else {
    expect(after.version).toBeGreaterThanOrEqual(before.version);
  }
}

/** A store that remembers what it holds, for the file-cleanup check. */
class MemoryAttachmentStore implements AttachmentStore {
  readonly files = new Map<string, Uint8Array>();
  readonly discarded: AttachmentStoreInput[] = [];
  private keys(input: AttachmentStoreInput): string[] {
    return (input.renditionNames ?? [`${input.actionId}${input.ext}`]).map((n) => `${input.cardId}/${n}`);
  }
  async store(input: AttachmentStoreInput): Promise<StoredAttachment> {
    for (const key of this.keys(input)) this.files.set(key, input.bytes);
    return { identifier: `~${input.cardId}/${input.actionId}${input.ext}`, size: input.bytes.length };
  }
  async read(): Promise<Uint8Array | undefined> {
    return undefined;
  }
  async discard(input: AttachmentStoreInput): Promise<void> {
    this.discarded.push(input);
    for (const key of this.keys(input)) this.files.delete(key);
  }
}

// ---------------------------------------------------------------------------
// Scenarios, on every backend
// ---------------------------------------------------------------------------

const SCENARIO_TIMEOUT = 180_000;

for (const [label, make] of Object.entries(BACKENDS)) {
  describe(`atomic saves: ${label}`, () => {
    let deck: Deck;

    beforeAll(async () => {
      deck = await openDeck(make);
    }, SCENARIO_TIMEOUT);

    afterAll(async () => {
      await deck?.backend.dispose();
    });

    it("a child of an unknown type rolls its parent back", async () => {
      const before = await deck.snapshot();
      let error = "";
      try {
        await deck.engine().createCard({
          name: "Review Parent",
          content: "parent",
          subcards: { "+Child": { typeCode: "no_such_type", content: "child" } },
        });
      } catch (e) {
        error = String(e);
      }
      expect(error).toContain("no_such_type is not a known type");
      const rows = await deck.backend.driver.query("SELECT id FROM cards WHERE name = ?", ["Review Parent"]);
      expect(rows.rows).toEqual([]);
      expectUnchanged(deck, before, await deck.snapshot());
    }, SCENARIO_TIMEOUT);

    it("subcard validation: the second subcard fails after the parent and the first subcard are stored", async () => {
      const before = await deck.snapshot();
      await expect(
        deck.engine().createCard({
          name: "Two Kids",
          content: "parent",
          subcards: { "+first": { content: "fine" }, "+second": { typeCode: "no_such_type", content: "bad" } },
        }),
      ).rejects.toThrow("no_such_type");
      expectUnchanged(deck, before, await deck.snapshot());
    }, SCENARIO_TIMEOUT);

    it("reference write: a failure writing the new card's references undoes the card and its history", async () => {
      const before = await deck.snapshot();
      deck.injector.failOn(/INSERT INTO card_references/i);
      await expect(
        deck.engine().createCard({ name: "Linker", content: "see [[Pudding]] and [[Nowhere Yet]]" }),
      ).rejects.toBeInstanceOf(InjectedFailure);
      deck.injector.disarm();
      expectUnchanged(deck, before, await deck.snapshot());
    }, SCENARIO_TIMEOUT);

    it("history write: a failure writing a subcard's change rows undoes the main card's update", async () => {
      const before = await deck.snapshot();
      // The main card's row, action and changes are written first (one
      // batch); the subcard's change rows are the second such write.
      deck.injector.failOn(/INSERT INTO card_changes/i, 2);
      await expect(
        deck.engine().updateCard({
          cardId: 60,
          content: "parent v2 that must not stay",
          subcards: { "+kid": { content: "kid v2 that must not stay" } },
        }),
      ).rejects.toBeInstanceOf(InjectedFailure);
      deck.injector.disarm();
      expectUnchanged(deck, before, await deck.snapshot());
    }, SCENARIO_TIMEOUT);

    it("history write: a failure writing the act row undoes a create", async () => {
      const before = await deck.snapshot();
      deck.injector.failOn(/INSERT INTO card_actions/i, 2);
      await expect(
        deck.engine().createCard({ name: "Compound Parent+fresh side", content: "x" }),
      ).rejects.toBeInstanceOf(InjectedFailure);
      deck.injector.disarm();
      expectUnchanged(deck, before, await deck.snapshot());
    }, SCENARIO_TIMEOUT);

    it("delete: a failure trashing a child undoes the parent's trash", async () => {
      const before = await deck.snapshot();
      deck.injector.failOn(/^\s*UPDATE cards/i, 2);
      await expect(deck.engine().deleteCard({ cardId: 60 })).rejects.toBeInstanceOf(InjectedFailure);
      deck.injector.disarm();
      expectUnchanged(deck, before, await deck.snapshot());
    }, SCENARIO_TIMEOUT);

    it("files and mail: a failed upload save deletes its stored file and sends nothing", async () => {
      const store = new MemoryAttachmentStore();
      const fired: string[] = [];
      const hook: SavePathIntegrationHook = {
        stage: "integrate",
        notable: () => true,
        fire: async (event) => {
          fired.push(event.verb);
        },
      };
      const before = await deck.snapshot();
      // The identifier rewrite runs after the bytes are stored.
      deck.injector.failOn(/^UPDATE cards SET db_content = \? WHERE id = \?$/);
      await expect(
        deck.engine({ hooks: [hook], store }).createCard({
          name: "Upload",
          typeId: FILE_TYPE_ID,
          attachment: { bytes: new TextEncoder().encode("hello"), originalFilename: "hello.txt" },
        }),
      ).rejects.toBeInstanceOf(InjectedFailure);
      deck.injector.disarm();
      expect(store.discarded).toHaveLength(1);
      expect(store.files.size).toBe(0);
      expect(fired).toEqual([]);
      expectUnchanged(deck, before, await deck.snapshot());
    }, SCENARIO_TIMEOUT);

    it("a save that succeeds commits before its integration phase runs (mail sees committed rows)", async () => {
      const seenAtHook: number[] = [];
      const hook: SavePathIntegrationHook = {
        stage: "integrate",
        notable: () => true,
        fire: async () => {
          const r = await deck.backend.observer!.query<{ c: number }>(
            "SELECT COUNT(*) AS c FROM cards WHERE name = ?",
            ["Committed First"],
          );
          seenAtHook.push(Number(r.rows[0].c));
        },
      };
      await deck.engine({ hooks: [hook] }).createCard({ name: "Committed First", content: "ok" });
      expect(seenAtHook.length).toBeGreaterThan(0);
      expect(seenAtHook.every((c) => c === 1)).toBe(true);
    }, SCENARIO_TIMEOUT);

    it("after a rolled-back save, the same engine saves normally (caches and lock released)", async () => {
      deck.injector.failOn(/INSERT INTO card_changes/i);
      await expect(deck.engine().updateCard({ cardId: 50, content: "lost" })).rejects.toBeInstanceOf(InjectedFailure);
      deck.injector.disarm();
      const fetched = await deck.fetch.fetchByName("Pudding");
      expect(fetched?.dbContent).not.toBe("lost");
      await deck.engine().updateCard({ cardId: 50, content: "kept" });
      const row = await deck.backend.driver.query<{ db_content: string }>("SELECT db_content FROM cards WHERE id = 50", []);
      expect(row.rows[0].db_content).toBe("kept");
    }, SCENARIO_TIMEOUT);

    // Orphan history: card_acts / card_actions / card_changes rows that name
    // a card id no card row has, at the id the next create would take (a
    // deck whose card rows were deleted, or copied without the id counter).
    // These two run last: the orphan rows stay in the deck.

    it("orphan history at the next id: a create that fails writes nothing and leaves the orphan rows as they were", async () => {
      const orphanId = await seedOrphanHistory(deck);
      const before = await deck.snapshot();
      // The cards row is written first; the act row write fails after it.
      deck.injector.failOn(/INSERT INTO card_acts/i);
      await expect(deck.engine().createCard({ name: "Beside Orphan", content: "x" })).rejects.toBeInstanceOf(
        InjectedFailure,
      );
      deck.injector.disarm();
      expectUnchanged(deck, before, await deck.snapshot());
      const orphan = await deck.backend.driver.query("SELECT id FROM card_actions WHERE card_id = ?", [orphanId]);
      expect(orphan.rows).toHaveLength(1);
    }, SCENARIO_TIMEOUT);

    it("orphan history at the next id: a create takes the first id past it and starts a history of its own", async () => {
      const raw = deck.backend.driver;
      const orphanMax = await seedOrphanHistory(deck);
      expect(await nextAutoincrementId(deck)).toBe(orphanMax);
      const orphanRows = async () =>
        (await raw.query("SELECT * FROM card_actions WHERE card_id = ? ORDER BY id", [orphanMax])).rows;
      const orphanBefore = await orphanRows();
      const { cardId } = await deck.engine().createCard({ name: "Past Orphan", content: "fresh" });
      expect(cardId).toBe(orphanMax + 1);
      // Its own history only: one create action, its act, no change rows
      // (the first-create lazy backfill), nothing borrowed from the orphan.
      const actions = await raw.query<{ id: number; action_type: number }>(
        "SELECT id, action_type FROM card_actions WHERE card_id = ? ORDER BY id",
        [cardId],
      );
      expect(actions.rows.map((r) => Number(r.action_type))).toEqual([0]);
      const changes = await raw.query("SELECT id FROM card_changes WHERE card_action_id = ?", [actions.rows[0].id]);
      expect(changes.rows).toEqual([]);
      const acts = await raw.query("SELECT id FROM card_acts WHERE card_id = ?", [cardId]);
      expect(acts.rows).toHaveLength(1);
      expect(await orphanRows()).toEqual(orphanBefore);
      // The next create continues past the new card.
      const next = await deck.engine().createCard({ name: "After Orphan", content: "next" });
      expect(next.cardId).toBe(cardId + 1);
    }, SCENARIO_TIMEOUT);
  });
}

/** The id the cards table's AUTOINCREMENT would give the next row. */
async function nextAutoincrementId(deck: Deck): Promise<number> {
  const r = await deck.backend.driver.query<{ m: number | null; s: number | null }>(
    "SELECT (SELECT MAX(id) FROM cards) AS m, (SELECT seq FROM sqlite_sequence WHERE name = 'cards') AS s",
    [],
  );
  return Math.max(Number(r.rows[0].m ?? 0), Number(r.rows[0].s ?? 0)) + 1;
}

/** An act, a create action and a change row for the id the next create
 *  would take, with no card row. Returns that id. */
async function seedOrphanHistory(deck: Deck): Promise<number> {
  const raw = deck.backend.driver;
  const orphanId = await nextAutoincrementId(deck);
  const act = await raw.query(
    "INSERT INTO card_acts (card_id, actor_id, acted_at, ip_address) VALUES (?, ?, ?, ?)",
    [orphanId, JOE.id, "2020-01-01 00:00:00", IP],
  );
  const actId = Number(act.lastInsertRowId ?? (await raw.query<{ id: number }>("SELECT MAX(id) AS id FROM card_acts", [])).rows[0].id);
  const action = await raw.query(
    "INSERT INTO card_actions (card_id, card_act_id, action_type, draft) VALUES (?, ?, 0, 0)",
    [orphanId, actId],
  );
  const actionId = Number(
    action.lastInsertRowId ?? (await raw.query<{ id: number }>("SELECT MAX(id) AS id FROM card_actions", [])).rows[0].id,
  );
  await raw.query("INSERT INTO card_changes (card_action_id, field, value) VALUES (?, 0, ?)", [actionId, "Deleted Card"]);
  return orphanId;
}
