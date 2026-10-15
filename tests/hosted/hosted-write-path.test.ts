// The transaction conformance suite and the atomic-save failure-injection
// scenarios, run against HOSTED databases rather than local ones.
//
// Everything else in this suite runs against emulations: miniflare's local D1,
// a mock Hrana server over a SQLite file. Those prove the engine's logic; they
// do not prove the hosted services behave the same way. This file runs the
// engine's own adapters against the hosted database that
// tests/hosted/hosted-backend.ts selects from DECKO_HOSTED_* environment
// variables: CloudflareD1Adapter over the D1 HTTP API or a wrangler remote
// binding, LibSqlHttpAdapter over Turso/libSQL, BunnyDbDriver over Bunny.
// tools/hosted-conformance/run.mjs creates the scratch database and sets the
// variables (docs/hosted-conformance.md).
//
// GATED, AND LOUDLY. With no target set the suite prints
//
//     [hosted-gated] NOT RUN: <suite>: <reason>
//
// and skips. A silent skip would be a false claim that the hosted path is
// covered; the same rule docs/TESTING.md states for corpus-gated suites.
//
// The database must be throwaway: the schema is loaded into it and every
// table is written to. hosted-backend.ts refuses to empty a non-empty
// database unless DECKO_HOSTED_ALLOW_RESET=1.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { SQLDatabaseDriver, SQLQueryResult, SQLStatement, SQLTransactionGuarantee } from "../../src/server/driver.js";
import { FetchEngine } from "../../src/card/fetch.js";
import { CardActionEngine } from "../../src/card/actions/card-action-engine.js";
import type { AttachmentStore, AttachmentStoreInput, StoredAttachment } from "../../src/card/attachments/attachment-store.js";
import type { SavePathIntegrationHook } from "../../src/card/notify/types.js";
import { splitSqlStatements } from "../card/fetch/fetch-test-storage.js";
import { runTransactionConformance } from "../server/drivers/transaction-conformance.js";
import { hostedDeck } from "./hosted-backend.js";
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
      const updated = await deck.engine().updateCard({ cardId: 50, content: "Pudding, with more custard" });
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
      expect(row.rows[0].db_content).toContain("with more custard");
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
// The hosted target
// ---------------------------------------------------------------------------

const hosted = hostedDeck();

if (hosted === undefined) {
  describe("hosted write path", () => {
    it("is not run", () => {
      hostedNotRun(
        "hosted write path",
        "DECKO_HOSTED_TARGET is not set; run tools/hosted-conformance/run.mjs against a throwaway database (docs/hosted-conformance.md)",
      );
      expect(true).toBe(true);
    });
  });
} else {
  describe(`hosted write path: ${hosted.label}`, () => {
    runTransactionConformance(`hosted transactions: ${hosted.label}`, async () => ({ driver: await hosted.open() }));

    runAtomicSaveScenarios(hosted.label, async () => {
      // A second driver object over the same database is a second isolate's
      // (or connection's) view.
      const driver = await hosted.open();
      return { driver, observer: hosted.connect() };
    });
  });
}
