// The transaction conformance suite and the atomic-save failure-injection
// scenarios, run against HOSTED databases rather than local ones.
//
// Everything else in this suite runs against emulations: miniflare's local D1,
// a mock Hrana server over a SQLite file. Those prove the engine's logic; they
// do not prove the hosted services behave the same way. This file closes that
// gap: CloudflareD1Adapter over a real remote D1 binding, and BunnyDbDriver
// over a real Bunny Database endpoint.
//
// GATED, AND LOUDLY. Hosted databases cost money and are not reproducible from
// a clean clone, so every suite here is gated on an environment variable naming
// a throwaway database the operator created for this purpose. With the
// variable unset the suite prints
//
//     [hosted-gated] NOT RUN: <suite>: <reason>
//
// and skips. A silent skip would be a false claim that the hosted path is
// covered; the same rule docs/TESTING.md states for corpus-gated suites.
//
// The databases this runs against MUST be throwaway: the schema is loaded
// into them and every table is written to. Never point DECKO_HOSTED_D1_ID or
// DECKO_HOSTED_BUNNY_DB_URL at a database holding anything of value. To make
// a second run against the same throwaway database start from empty, set the
// matching DECKO_HOSTED_*_ALLOW_RESET=1; that empties the database, which is
// why it is a separate opt-in from naming it.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { CloudflareD1Adapter, type D1DatabaseLike } from "../../src/server/drivers/d1.js";
import { BunnyDbDriver } from "../../src/card/drivers/bunny-db.js";
import type { SQLDatabaseDriver, SQLQueryResult, SQLStatement, SQLTransactionGuarantee } from "../../src/server/driver.js";
import { FetchEngine } from "../../src/card/fetch.js";
import { CardActionEngine } from "../../src/card/actions/card-action-engine.js";
import type { AttachmentStore, AttachmentStoreInput, StoredAttachment } from "../../src/card/attachments/attachment-store.js";
import type { SavePathIntegrationHook } from "../../src/card/notify/types.js";
import { splitSqlStatements } from "../card/fetch/fetch-test-storage.js";
import { runTransactionConformance } from "../server/drivers/transaction-conformance.js";
import {
  CARDTYPE_ID,
  IP,
  JOE,
  fakeClock,
  seedCard,
  seedStandardDeck,
  type ActionsTestStorage,
} from "../card/actions/actions-test-storage.js";

// ---------------------------------------------------------------------------
// Gating
// ---------------------------------------------------------------------------

/** A suite whose gate is not satisfied, printed so a green run cannot be read
 *  as coverage it does not have. Mirrors the [corpus-gated] convention. */
function hostedNotRun(suite: string, reason: string): void {
  // eslint-disable-next-line no-console
  console.log(`[hosted-gated] NOT RUN: ${suite}: ${reason}`);
}

/** Hosted databases are not local and not fast: a round trip measures in
 *  tens to hundreds of milliseconds, and a scenario's whole-table snapshot
 *  is one query per table. These are deliberately generous. */
const HOSTED_TIMEOUT = 600_000;

const D1_NAME = process.env.DECKO_HOSTED_D1_NAME;
const D1_ID = process.env.DECKO_HOSTED_D1_ID;
const BUNNY_URL = process.env.DECKO_HOSTED_BUNNY_DB_URL;
const BUNNY_TOKEN = process.env.DECKO_HOSTED_BUNNY_DB_TOKEN;

/** The suites load the schema with CREATE TABLE, so the database has to be
 *  empty. Emptying it DROPS EVERY TABLE, which on a mis-set variable would
 *  destroy whatever the named database actually holds, so the drop is behind
 *  its own opt-in rather than riding on the D1 id being set: a configured
 *  database with this unset fails loudly instead of dropping anything. */
const D1_RESET = process.env.DECKO_HOSTED_D1_ALLOW_RESET === "1";
const BUNNY_RESET = process.env.DECKO_HOSTED_BUNNY_ALLOW_RESET === "1";

/** Drops every table in the database, so a second run starts as empty as the
 *  first. Scoped to the throwaway database the gate names.
 *
 *  Runs on its own throwaway adapter, never the one under test: reading
 *  sqlite_master through a CloudflareD1Adapter marks that adapter as having
 *  seen the lock-state table, and it then refuses every serving read for the
 *  rest of its life ("no such table: decko_tx_state") once the reset has
 *  dropped it. The adapter under test must stay one that has never seen it. */
async function emptyDatabase(binding: D1DatabaseLike): Promise<void> {
  const resetter = new CloudflareD1Adapter(binding);
  const tables = (
    await resetter.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\'",
      [],
    )
  ).rows.map((r) => String(r.name));
  for (const name of tables) {
    await resetter.query(`DROP TABLE IF EXISTS "${name}"`, []).catch(() => undefined);
  }
}

/** The same reset over any driver, for backends that are not D1. Runs on a
 *  driver of its own so the one under test is untouched. */
async function emptyDatabaseOver(make: () => SQLDatabaseDriver): Promise<void> {
  const tables = (
    await make().query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\'",
      [],
    )
  ).rows.map((r) => String(r.name));
  for (const name of tables) {
    await make().query(`DROP TABLE IF EXISTS "${name}"`, []).catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------
// Failure injection (the same mechanism as tests/card/actions/atomic-saves)
// ---------------------------------------------------------------------------

class InjectedFailure extends Error {
  constructor(sql: string) {
    super(`injected failure at: ${sql.replace(/\s+/g, " ").slice(0, 80)}`);
    this.name = "InjectedFailure";
  }
}

/** Passes every statement through, except that once armed it throws on the
 *  `nth` statement matching `pattern`, before it reaches the database.
 *  transaction() is the wrapped driver's. */
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
// Shared deck harness
// ---------------------------------------------------------------------------

const SCHEMA = readFileSync(fileURLToPath(new URL("../../db/schema.sqlite.sql", import.meta.url)), "utf8");

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

interface Deck {
  driver: SQLDatabaseDriver;
  observer: SQLDatabaseDriver;
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

/** Builds the engine over an already-created database. `reset` empties it
 *  first, so the suite is re-runnable against one throwaway database; it is
 *  gated by its own opt-in (see the ALLOW_RESET variables) because it drops
 *  tables. */
async function openDeck(driver: SQLDatabaseDriver, observer: SQLDatabaseDriver, reset?: () => Promise<void>): Promise<Deck> {
  const injector = new FailureInjectingDriver(driver);
  const fetch = new FetchEngine(injector);
  // The seed helpers pass undefined for absent columns, which only
  // better-sqlite3 accepts (as NULL); the remote adapters reject it.
  const nulls = (params: unknown[]) => params.map((p) => (p === undefined ? null : p));
  const raw = driver;
  const wrapped: SQLDatabaseDriver = {
    query: (sql, params) => raw.query(sql, nulls(params)),
    batch: (statements) => raw.batch(statements.map((s) => ({ sql: s.sql, params: nulls(s.params) }))),
  };
  const storage: ActionsTestStorage = {
    driver: wrapped,
    engine: fetch,
    close: () => undefined,
    selectAll: async <T>(sql: string, params: unknown[] = []) => (await wrapped.query<T>(sql, params)).rows,
    selectOne: async <T>(sql: string, params: unknown[] = []) => (await wrapped.query<T>(sql, params)).rows[0],
    count: async (table) => Number((await wrapped.query<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`, [])).rows[0].n),
  };
  if (reset) await reset();
  await loadSchema(wrapped);
  await seedStandardDeck(storage);
  const FILE_TYPE_ID = 400;
  await seedCard(storage, { id: FILE_TYPE_ID, name: "File", codename: "file", typeId: CARDTYPE_ID });
  await seedCard(storage, { id: 60, name: "Parent Card", dbContent: "parent" });
  await seedCard(storage, { id: 62, name: "kid", dbContent: "" });
  await seedCard(storage, { id: 61, leftId: 60, rightId: 62, dbContent: "kid" });

  const clock = fakeClock();
  const reusesIds = driver.transactionGuarantee?.idsReusedAfterRollback === true;
  return {
    driver,
    observer,
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
        await driver.query<{ name: string }>(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\' ORDER BY name",
          [],
        )
      ).rows.map((r) => String(r.name));
      const tables: Record<string, unknown[]> = {};
      let bookkeepingRows = 0;
      for (const name of names) {
        const rows = (await driver.query(`SELECT * FROM "${name}" ORDER BY rowid`, [])).rows;
        if (name.startsWith("decko_tx_") || name.startsWith("decko_undo_")) {
          if (name !== "decko_tx_state") bookkeepingRows += rows.length;
          continue;
        }
        if (name === "deck_data_version") continue;
        if (name === "sqlite_sequence" && !reusesIds) continue;
        tables[name] = rows;
      }
      const v = await driver.query<{ version: number }>("SELECT version FROM deck_data_version WHERE id = 1", []);
      return { tables, version: Number(v.rows[0]?.version ?? 0), bookkeepingRows };
    },
  };
}

function expectUnchanged(deck: Deck, before: Snapshot, after: Snapshot): void {
  expect(after.tables).toEqual(before.tables);
  expect(after.bookkeepingRows).toBe(0);
  if (deck.driver.transactionGuarantee?.idsReusedAfterRollback === true) {
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

/** The atomic-save scenarios, run against whichever hosted backend produced
 *  the driver. A representative subset of the full list in
 *  tests/card/actions/atomic-saves.test.ts: one scenario per write stage the
 *  engine can fail at (subcard validation, the reference write, the history
 *  write, a child's trash write, the attachment identifier write), plus the
 *  two that check the engine recovers afterwards. The full list runs against
 *  the emulated backends; this is the hosted confirmation. */
function runAtomicSaveScenarios(
  label: string,
  make: () => Promise<{ driver: SQLDatabaseDriver; observer: SQLDatabaseDriver; reset?: () => Promise<void> }>,
): void {
  describe(`atomic saves: ${label}`, () => {
    let deck: Deck;

    beforeAll(async () => {
      const { driver, observer, reset } = await make();
      deck = await openDeck(driver, observer, reset);
    }, HOSTED_TIMEOUT);

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
      const rows = await deck.driver.query("SELECT id FROM cards WHERE name = ?", ["Review Parent"]);
      expect(rows.rows).toEqual([]);
      expectUnchanged(deck, before, await deck.snapshot());
    }, HOSTED_TIMEOUT);

    it("reference write: a failure writing the new card's references undoes the card and its history", async () => {
      const before = await deck.snapshot();
      deck.injector.failOn(/INSERT INTO card_references/i);
      await expect(
        deck.engine().createCard({ name: "Linker", content: "see [[Pudding]] and [[Nowhere Yet]]" }),
      ).rejects.toBeInstanceOf(InjectedFailure);
      deck.injector.disarm();
      expectUnchanged(deck, before, await deck.snapshot());
    }, HOSTED_TIMEOUT);

    it("history write: a failure writing a subcard's change rows undoes the main card's update", async () => {
      const before = await deck.snapshot();
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
    }, HOSTED_TIMEOUT);

    it("delete: a failure trashing a child undoes the parent's trash", async () => {
      const before = await deck.snapshot();
      deck.injector.failOn(/^\s*UPDATE cards/i, 2);
      await expect(deck.engine().deleteCard({ cardId: 60 })).rejects.toBeInstanceOf(InjectedFailure);
      deck.injector.disarm();
      expectUnchanged(deck, before, await deck.snapshot());
    }, HOSTED_TIMEOUT);

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
      deck.injector.failOn(/^UPDATE cards SET db_content = \? WHERE id = \?$/);
      await expect(
        deck.engine({ hooks: [hook], store }).createCard({
          name: "Upload",
          typeId: 400,
          attachment: { bytes: new TextEncoder().encode("hello"), originalFilename: "hello.txt" },
        }),
      ).rejects.toBeInstanceOf(InjectedFailure);
      deck.injector.disarm();
      expect(store.discarded).toHaveLength(1);
      expect(store.files.size).toBe(0);
      expect(fired).toEqual([]);
      expectUnchanged(deck, before, await deck.snapshot());
    }, HOSTED_TIMEOUT);

    it("an update that succeeds writes its history rows", async () => {
      const updated = await deck.engine().updateCard({ cardId: 50, content: "Pudding, with more sauce" });
      if (updated === null) throw new Error("the update did not save");
      const { cardId } = updated;
      const actions = await deck.driver.query<{ action_type: number }>(
        "SELECT action_type FROM card_actions WHERE card_id = ? ORDER BY id",
        [cardId],
      );
      expect(actions.rows.length).toBeGreaterThan(0);
      const changes = await deck.driver.query<{ field: number; value: string }>(
        "SELECT c.field, c.value FROM card_changes c JOIN card_actions a ON a.id = c.card_action_id WHERE a.card_id = ?",
        [cardId],
      );
      expect(changes.rows.length).toBeGreaterThan(0);
      const row = await deck.driver.query<{ db_content: string }>("SELECT db_content FROM cards WHERE id = ?", [cardId]);
      expect(row.rows[0].db_content).toContain("with more sauce");
    }, HOSTED_TIMEOUT);

    it("revert undoes a committed update and records the revert in the history", async () => {
      const before = (await deck.driver.query<{ db_content: string }>("SELECT db_content FROM cards WHERE id = 50", []))
        .rows[0].db_content;
      const saved = await deck.engine().updateCard({ cardId: 50, content: `${before} a change that will be reverted` });
      expect(saved, "the update saves").not.toBeNull();
      if (saved === null) throw new Error("the update did not save");
      // revertToPrevious: the revision BEFORE this action, not the one at it.
      // Without it, actionsToRevert names this act and revisionOf answers with
      // the state the card is already in, so the save is a no-op.
      await deck.engine().revertActions({ cardId: 50, actionIds: [saved.actionId], revertToPrevious: true });
      const after = (await deck.driver.query<{ db_content: string }>("SELECT db_content FROM cards WHERE id = 50", [])).rows[0]
        .db_content;
      expect(after).toBe(before);
      expect(after).not.toContain("will be reverted");
      const actions = await deck.driver.query<{ action_type: number }>(
        "SELECT action_type FROM card_actions WHERE card_id = 50 ORDER BY id",
        [],
      );
      // create, the update, and the revert's own update.
      expect(actions.rows.map((r) => Number(r.action_type)).slice(-3)).toEqual([1, 1, 1]);
    }, HOSTED_TIMEOUT);

    it("a save the permission seam refuses writes nothing, and the id-keyed anonymous actor saves as its own account", async () => {
      // Auth in Decko is keyed on the actor's ID, not its name: an actor
      // named "*anonymous" whose id is not the Anonymous card's is an ordinary
      // account and its create succeeds under its own id (create.test.ts,
      // "an actor NAMED *anonymous is id-keyed"). What a refusal looks like
      // here is the host permission seam, so both halves are checked.
      const before = await deck.snapshot();
      const denying = new CardActionEngine(deck.fetch, {
        actor: JOE,
        now: fakeClock(),
        ipAddress: IP,
        integrationHooks: [],
        canWrite: () => false,
      });
      await expect(denying.createCard({ name: "Refused Save", content: "nope" })).rejects.toMatchObject({
        code: "permission-denied",
      });
      expect((await deck.driver.query("SELECT id FROM cards WHERE name = ?", ["Refused Save"])).rows).toEqual([]);
      expectUnchanged(deck, before, await deck.snapshot());

      const anonymous = new CardActionEngine(deck.fetch, {
        actor: { id: 2, name: "*anonymous" },
        now: fakeClock(),
        ipAddress: IP,
        integrationHooks: [],
      });
      const made = await anonymous.createCard({ name: "Id Keyed Anonymous", content: "ok" });
      expect(made, "the id-keyed anonymous actor's create saves").not.toBeNull();
      if (made === null) throw new Error("the id-keyed anonymous actor's create did not save");
      const row = await deck.driver.query<{ creator_id: number }>("SELECT creator_id FROM cards WHERE id = ?", [
        made.cardId,
      ]);
      expect(Number(row.rows[0].creator_id)).toBe(2);
    }, HOSTED_TIMEOUT);

    it("after a rolled-back save, the same engine saves normally (caches and lock released)", async () => {
      deck.injector.failOn(/INSERT INTO card_changes/i);
      await expect(deck.engine().updateCard({ cardId: 50, content: "lost" })).rejects.toBeInstanceOf(InjectedFailure);
      deck.injector.disarm();
      await deck.engine().updateCard({ cardId: 50, content: "kept" });
      const row = await deck.driver.query<{ db_content: string }>("SELECT db_content FROM cards WHERE id = 50", []);
      expect(row.rows[0].db_content).toBe("kept");
    }, HOSTED_TIMEOUT);

    it("a save that succeeds commits before its integration phase runs (mail sees committed rows)", async () => {
      const seenAtHook: number[] = [];
      const hook: SavePathIntegrationHook = {
        stage: "integrate",
        notable: () => true,
        fire: async () => {
          const r = await deck.observer.query<{ c: number }>("SELECT COUNT(*) AS c FROM cards WHERE name = ?", [
            "Committed First",
          ]);
          seenAtHook.push(Number(r.rows[0].c));
        },
      };
      await deck.engine({ hooks: [hook] }).createCard({ name: "Committed First", content: "ok" });
      expect(seenAtHook.length).toBeGreaterThan(0);
      expect(seenAtHook.every((c) => c === 1)).toBe(true);
    }, HOSTED_TIMEOUT);
  });
}

// ---------------------------------------------------------------------------
// Hosted Cloudflare D1
// ---------------------------------------------------------------------------

/** The scratch directory the remote-binding config lives in. Removed in
 *  afterAll: a throwaway directory holding a database id is exactly what the
 *  Zero Unmanaged Scratch policy forbids leaving behind. */
let d1ScratchDir: string | undefined;
let disposePlatformProxy: (() => Promise<void>) | undefined;

/** The slice of wrangler's getPlatformProxy this file uses. Declared
 *  structurally, in the same spirit as the engine's D1DatabaseLike: the
 *  engine never imports a vendor SDK, and neither does its test gate. */
interface WranglerPlatformProxy {
  env: { DB: D1DatabaseLike };
  dispose: () => Promise<void>;
}
type WranglerGetPlatformProxy = (opts: { configPath: string }) => Promise<WranglerPlatformProxy>;

/** A real remote D1 binding from wrangler's getPlatformProxy. The database
 *  id and name arrive as environment variables and are written to a
 *  throwaway wrangler config; neither ever appears in a committed file.
 *
 *  wrangler is not a dependency of this package: it is an operator tool, and
 *  pulling it into the lockfile to serve a gated suite would put a large
 *  dependency tree behind every install. DECKO_HOSTED_WRANGLER_MODULE names
 *  the module to load (an install path, or "wrangler" when it is resolvable
 *  from here). */
async function openHostedD1Binding(): Promise<D1DatabaseLike> {
  const specifier = process.env.DECKO_HOSTED_WRANGLER_MODULE ?? "wrangler";
  const { getPlatformProxy } = (await import(specifier)) as { getPlatformProxy: WranglerGetPlatformProxy };
  d1ScratchDir = mkdtempSync(join(tmpdir(), "decko-hosted-d1-"));
  const configPath = join(d1ScratchDir, "wrangler.json");
  writeFileSync(
    configPath,
    JSON.stringify(
      {
        name: "decko-hosted-write-path",
        main: "worker.js",
        compatibility_date: "2025-01-01",
        d1_databases: [{ binding: "DB", database_name: D1_NAME, database_id: D1_ID, remote: true }],
      },
      null,
      2,
    ),
  );
  const proxy = await getPlatformProxy({ configPath });
  disposePlatformProxy = proxy.dispose;
  return (proxy.env as { DB: D1DatabaseLike }).DB;
}

const d1GateReason =
  D1_ID === undefined || D1_NAME === undefined
    ? "DECKO_HOSTED_D1_ID / DECKO_HOSTED_D1_NAME are not set; point them at a throwaway D1 database created for this run"
    : undefined;

if (d1GateReason !== undefined) {
  describe("hosted: Cloudflare D1 (remote binding)", () => {
    it("is not run", () => {
      hostedNotRun("hosted D1", d1GateReason);
      expect(true).toBe(true);
    });
  });
} else {
  describe("hosted: Cloudflare D1 (remote binding)", () => {
    afterAll(async () => {
      await disposePlatformProxy?.();
      if (d1ScratchDir !== undefined) rmSync(d1ScratchDir, { recursive: true, force: true });
    }, HOSTED_TIMEOUT);

    runTransactionConformance("hosted transactions: Cloudflare D1 (remote binding, compensating)", async () => {
      const binding = await openHostedD1Binding();
      if (D1_RESET) await emptyDatabase(binding);
      const driver = new CloudflareD1Adapter(binding, { journal: { tables: ["conf_tx"] } });
      return {
        driver,
        dispose: async () => {
          // The suite's own table, so a re-run starts without it.
          await driver.query("DROP TABLE IF EXISTS conf_tx", []).catch(() => undefined);
        },
      };
    });

    runAtomicSaveScenarios("hosted Cloudflare D1 (remote binding, compensating)", async () => {
      const binding = await openHostedD1Binding();
      // A second adapter over the same binding is a second isolate's view.
      return {
        driver: new CloudflareD1Adapter(binding),
        observer: new CloudflareD1Adapter(binding),
        reset: D1_RESET ? () => emptyDatabase(binding) : undefined,
      };
    });
  });
}

// ---------------------------------------------------------------------------
// Hosted Bunny Database
// ---------------------------------------------------------------------------

const bunnyGateReason =
  BUNNY_URL === undefined || BUNNY_TOKEN === undefined
    ? "DECKO_HOSTED_BUNNY_DB_URL / DECKO_HOSTED_BUNNY_DB_TOKEN are not set; point them at a throwaway Bunny database created for this run"
    : undefined;

if (bunnyGateReason !== undefined) {
  describe("hosted: Bunny Database", () => {
    it("is not run", () => {
      hostedNotRun("hosted Bunny", bunnyGateReason);
      expect(true).toBe(true);
    });
  });
} else {
  describe("hosted: Bunny Database", () => {
    runTransactionConformance("hosted transactions: BunnyDbDriver (Hrana stream, hosted)", async () => {
      if (BUNNY_RESET) await emptyDatabaseOver(() => new BunnyDbDriver({ url: BUNNY_URL, authToken: BUNNY_TOKEN }));
      const driver = new BunnyDbDriver({ url: BUNNY_URL, authToken: BUNNY_TOKEN });
      return {
        driver,
        dispose: async () => {
          await driver.query("DROP TABLE IF EXISTS conf_tx", []).catch(() => undefined);
        },
      };
    });

    runAtomicSaveScenarios("hosted Bunny Database (Hrana stream)", async () => {
      const driver = new BunnyDbDriver({ url: BUNNY_URL, authToken: BUNNY_TOKEN });
      return {
        driver,
        observer: new BunnyDbDriver({ url: BUNNY_URL, authToken: BUNNY_TOKEN }),
        reset: BUNNY_RESET ? () => emptyDatabaseOver(() => new BunnyDbDriver({ url: BUNNY_URL, authToken: BUNNY_TOKEN })) : undefined,
      };
    });
  });
}