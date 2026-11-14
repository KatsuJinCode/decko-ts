// Content, history, atomicity and uploads, exercised end to end on committed
// synthetic data only.
//
// Four claims, one suite each, each it() naming the claim it exercises:
//
//  1. "create, edit, rename and delete, with the same rows in `cards`,
//     `card_actions`, `card_changes`, `card_acts` and `card_references`" —
//     driven through the reference harness's own scenario operations
//     (reference-harness/fixtures/synthetic-v1/ops/scenarios.json) on a
//     private copy of the committed synthetic deck, with each step's RAW row
//     delta read straight out of the deck file and compared to the committed
//     Ruby oracle's answer (expected/scenarios.jsonl). This is the boot
//     mechanism the repo already uses for this deck: the TypeScript harness
//     adapter (reference-harness/adapters/ts/adapter.json) over
//     AdapterSession, staged exactly as reference-harness/runner/run.mjs
//     stages it (fresh deck copy and fresh adapter session per scenario) and
//     read back with the runner's own reference-harness/runner/deck-state.mjs.
//
//  2. "history and revert" — the CardActionEngine write path over a seeded
//     synthetic deck (tests/card/actions/actions-test-storage.ts's storage and
//     helpers), reading the history back from card_actions/card_changes and
//     reverting through CardActionEngine.revertActions.
//
//  3. "saves are atomic: an interrupted save leaves nothing behind" — the
//     same write path over local SQLite, with a driver that throws part-way
//     through the save. The injection pattern is the one
//     tests/card/actions/atomic-saves.test.ts uses (a SQLDatabaseDriver
//     wrapper that fails on the nth matching statement); that suite needs
//     miniflare and a mock Hrana server, so this file re-declares the small
//     wrapper locally and runs the local-SQLite backend only.
//
//  4. "file and image uploads, with images resized to Ruby's sizes" — the
//     attachment write path over the deck's files directory, using the
//     gherkin attachment world's helpers (freshAttachmentWorld,
//         whenUploadFile, walkStoredTree, storedFileBytes, storedVariantBytes).
//
// DATA RULE: every card name, body, actor, filename and byte string here is
// invented synthetic text. The only bytes that come from a file are the two
// committed synthetic fixtures named in the file (a generated gradient PNG
// and a generated text fixture); nothing is a capture of anyone's content.
//
// Runs on a clean checkout: no private fixtures, no network, no hosted
// services. The one data gate is the committed synthetic deck (or the deck
// DECKO_SYNTHETIC_DECK names); when it is absent the persistence suite skips
// loudly rather than passing vacuously.

import { cpSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LocalSqliteDriver } from "../../src/server/drivers/local-sqlite.js";
import { CardActionEngine } from "../../src/card/actions/card-action-engine.js";
import { FetchEngine } from "../../src/card/fetch.js";
import { revisionOf, type RevertActionRow } from "../../src/card/actions/revert-actions.js";
import { trackedFieldByIndex } from "../../src/card/history/change.js";
import type { SQLDatabaseDriver, SQLQueryResult, SQLStatement } from "../../src/server/driver.js";
import type { CardsRow } from "../../src/server/schema.js";
import { splitSqlStatements } from "../card/fetch/fetch-test-storage.js";
import {
  JOE,
  actionEngine,
  createActionsTestStorage,
  fakeClock,
  seedStandardDeck,
  type ActionsTestStorage,
} from "../card/actions/actions-test-storage.js";
import {
  closeAttachmentWorld,
  freshAttachmentWorld,
  storedFileBytes,
  storedVariantBytes,
  walkStoredTree,
  whenUploadFile,
} from "../card/gherkin/gherkin-attachment-steps.js";
import { describeOrSkipLoud } from "../support/describe-with-corpus.js";
// @ts-expect-error plain ESM module without type declarations
import { AdapterSession, loadAdapterManifest } from "../../reference-harness/runner/adapter-process.mjs";
// @ts-expect-error plain ESM module without type declarations
import { rawDelta, snapshot, splitDelta } from "../../reference-harness/runner/deck-state.mjs";
// scratch-dir.mjs ships its own declarations (tests/support/scratch-dir.d.mts).
import { cleanupScratch, removeScratchDir, scratchDir } from "../support/scratch-dir.mjs";

// ---------------------------------------------------------------------------
// Claim 1 — persistence parity on the committed synthetic deck
// ---------------------------------------------------------------------------

// Repo-absolute, from this file's own URL and not from process.cwd(): the
// suite has to find the same fixtures whether vitest is launched from this
// repo or from another project's checkout with --root pointing here.
const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const HARNESS = fileURLToPath(new URL("../../reference-harness", import.meta.url));
const FIXTURE = join(HARNESS, "fixtures", "synthetic-v1");
const DECK =
  process.env.DECKO_SYNTHETIC_DECK ?? join(FIXTURE, "deck", "deck.sqlite3");
const HAVE_DECK = existsSync(DECK);

/** The five tables the claim names. `card_virtuals` is graded too (the
 *  harness's own contract), so the compared delta is the harness's; this is
 *  the subset the claim is about. */
const NAMED_TABLES = ["cards", "card_actions", "card_changes", "card_acts", "card_references"] as const;

interface HarnessStep {
  op: string;
  actor?: string;
  action?: string;
  card?: string;
  fields?: Record<string, unknown>;
}
interface HarnessScenario {
  id: string;
  steps: HarnessStep[];
}
interface ExpectedStep {
  result?: unknown;
  error?: unknown;
  rows?: Record<string, { inserted: unknown[]; updated: unknown[]; deleted: unknown[] }>;
  other_tables?: Record<string, unknown>;
}

/** The ops a create, an edit, a rename and a delete ride on. Each is a
 *  scenario of its own in the fixture, so each gets its own deck copy and its
 *  own adapter session, as run.mjs gives them. */
const CRUD_SCENARIOS = [
  "create-note-as-member",
  "update-content-adds-link",
  "rename-referenced-tag",
  "delete-note",
  "delete-topic-with-fields",
] as const;

function readScenarios(): Map<string, HarnessScenario> {
  const parsed = JSON.parse(readFileSync(join(FIXTURE, "ops", "scenarios.json"), "utf8")) as {
    scenarios: HarnessScenario[];
  };
  return new Map(parsed.scenarios.map((s) => [s.id, s]));
}

function readExpected(): Map<string, ExpectedStep[]> {
  const text = readFileSync(join(FIXTURE, "expected", "scenarios.jsonl"), "utf8");
  const out = new Map<string, ExpectedStep[]>();
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    const row = JSON.parse(line) as { id: string; steps: ExpectedStep[] };
    out.set(row.id, row.steps);
  }
  return out;
}

/** One adapter session over a private copy of the deck, staged exactly as
 *  reference-harness/runner/run.mjs stageDeck does. */
interface StagedHarness {
  session: AdapterSession;
  db: string;
  work: string;
}

async function stageHarness(): Promise<StagedHarness> {
  const work = scratchDir("decko-exercise-content-");
  const db = join(work, "deck.sqlite3");
  cpSync(DECK, db);
  const files = join(FIXTURE, "deck", "files");
  if (existsSync(files)) cpSync(files, join(work, "files"), { recursive: true });
  else mkdirSync(join(work, "files"));
  mkdirSync(join(work, "adapter"));
  const slash = (p: string): string => p.replaceAll("\\", "/");
  const manifest = loadAdapterManifest(join(HARNESS, "adapters", "ts", "adapter.json"));
  const session = new AdapterSession(manifest, {
    HARNESS_DECK: slash(db),
    HARNESS_FILES: slash(join(work, "files")),
    HARNESS_DECK_JSON: slash(join(FIXTURE, "deck.json")),
    HARNESS_WORK: slash(join(work, "adapter")),
  });
  await session.start();
  return { session, db, work };
}

async function runScenario(scenario: HarnessScenario): Promise<ExpectedStep[]> {
  const staged = await stageHarness();
  try {
    const out: ExpectedStep[] = [];
    for (const step of scenario.steps) {
      const before = snapshot(staged.db);
      const answer = await staged.session.request(step);
      const { rows, other } = splitDelta(rawDelta(before, snapshot(staged.db)));
      out.push({
        ...(answer.ok ? { result: answer.result } : { error: answer.error }),
        rows: JSON.parse(JSON.stringify(rows)) as Record<string, never>,
        ...(Object.keys(other).length > 0 ? { other_tables: JSON.parse(JSON.stringify(other)) } : {}),
      });
    }
    return out;
  } finally {
    await staged.session.close();
    removeScratchDir(staged.work);
  }
}

describeOrSkipLoud(!HAVE_DECK, "tests/exercise/content-4.test.ts (persistence suite)", "HAVE_DECK")(
  "content: create, edit, rename and delete against the committed synthetic deck",
  () => {
    it('"create, edit, rename and delete, with the same rows in `cards`, `card_actions`, `card_changes`, `card_acts` and `card_references`" — each op\'s raw row delta equals the committed Ruby oracle\'s, and across the ops all five named tables carry row deltas', async () => {
      const scenarios = readScenarios();
      const expected = readExpected();
      const perOp: Record<string, Set<string>> = {};

      for (const id of CRUD_SCENARIOS) {
        const scenario = scenarios.get(id);
        const want = expected.get(id);
        if (scenario === undefined) throw new Error(`the fixture has no scenario ${id}`);
        if (want === undefined) throw new Error(`the fixture records no oracle answer for ${id}`);
        const got = await runScenario(scenario);
        expect(got.length, `${id}: step count`).toBe(want.length);
        for (const [i, step] of got.entries()) {
          // The rows the save left in Decko's card tables, read raw out of
          // the deck file: ids, timestamps and every other column as stored.
          expect(
            step.rows,
            `${id} step ${i} (${JSON.stringify(scenario.steps[i])}) leaves Ruby's rows`,
          ).toEqual(want[i].rows ?? {});
          perOp[id] = new Set(Object.keys(step.rows ?? {}));
        }
      }

      // The claim is about those five tables by name: the edit, the rename
      // and both deletes each move rows in all five (the plain create moves
      // cards, card_actions and card_acts — a brand-new card's own history
      // has no change rows yet, and "From a member." links nothing).
      expect(Object.fromEntries(Object.entries(perOp).map(([id, t]) => [id, [...t].sort()]))).toEqual({
        "create-note-as-member": ["card_actions", "card_acts", "cards"],
        "delete-note": ["card_actions", "card_acts", "card_changes", "card_references", "cards"],
        "delete-topic-with-fields": ["card_actions", "card_acts", "card_changes", "card_references", "cards"],
        "rename-referenced-tag": ["card_actions", "card_acts", "card_changes", "card_references", "cards"],
        "update-content-adds-link": ["card_actions", "card_acts", "card_changes", "card_references", "cards"],
      });
      const touched = new Set(Object.values(perOp).flatMap((t) => [...t]));
      expect([...NAMED_TABLES.filter((t) => touched.has(t))]).toEqual([...NAMED_TABLES]);
    }, 300_000);
  },
);

// ---------------------------------------------------------------------------
// Claim 2 — history and revert
// ---------------------------------------------------------------------------

/** The card's history as the history pane reads it: every card_actions row
 *  of the card, in id order, with the content change each one recorded. */
async function historyOf(
  storage: ActionsTestStorage,
  cardId: number,
): Promise<{ id: number; actionType: number; actId: number; content: string | null }[]> {
  const actions = await storage.selectAll<RevertActionRow>(
    "SELECT id, card_id, card_act_id, action_type, draft FROM card_actions WHERE card_id = ? ORDER BY id",
    [cardId],
  );
  const out: { id: number; actionType: number; actId: number; content: string | null }[] = [];
  for (const action of actions) {
    const changes = await storage.selectAll<{ field: number; value: string | null }>(
      "SELECT field, value FROM card_changes WHERE card_action_id = ? ORDER BY id",
      [action.id],
    );
    const content = changes.find((c) => Number(c.field) === 2)?.value ?? null; // field 2 = db_content
    out.push({
      id: Number(action.id),
      actionType: Number(action.action_type),
      actId: Number(action.card_act_id),
      content,
    });
  }
  return out;
}

describe("content: history and revert", () => {
  let storage: ActionsTestStorage;

  beforeAll(async () => {
    storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
  }, 60_000);

  afterAll(() => storage?.close());

  it('"history and revert" — three edits are readable back as the card\'s history, and reverting to the first edit\'s revision puts the card body and the revert\'s card_changes rows back on that revision', async () => {
    const engine = actionEngine(storage, JOE, { now: fakeClock() });
    // The subject card is created through the action engine, so its history
    // begins with a real create action (the seeded cards in this deck were
    // written as plain rows and carry no history at all).
    const created = await engine.createCard({
      name: "Exercise History Card",
      content: "first revision text",
    });
    const cardId = created!.cardId;

    const edits = ["second revision text", "third revision text", "fourth revision text"];
    for (const content of edits) {
      const result = await engine.updateCard({ cardId, content });
      expect(result, `the update to "${content}" saves`).not.toBeNull();
    }

    // The history: the create the seed made, then one update per edit, each
    // with its own act and its own db_content change row.
    const history = await historyOf(storage, cardId);
    expect(history.map((a) => a.actionType)).toEqual([0, 1, 1, 1]);
    expect(new Set(history.map((a) => a.actId)).size).toBe(4); // one act per save
    // A create leaves NO change rows (first_create? —
    // set/all/history.rb:38-40), and the create action's db_content row is
    // stored lazily by the first later update
    // (store_card_changes_for_create_action, write-path.ts:203). So the
    // history reads back as the create plus one update per edit, and the
    // create's content row carries the text the create wrote.
    expect(history.map((a) => a.content)).toEqual(["first revision text", ...edits]);

    // The first edit's revision — the value of every tracked field as of that
    // action (revisionOf, the port of Card::Revision#revision).
    const firstEdit = history[1];
    const card = await storage.selectOne<CardsRow>("SELECT * FROM cards WHERE id = ?", [cardId]);
    expect(card).toBeDefined();
    const revision = await revisionOf(
      storage.driver,
      card!,
      {
        id: firstEdit.id,
        card_id: cardId,
        card_act_id: firstEdit.actId,
        action_type: firstEdit.actionType,
        draft: 0,
      },
      false,
    );
    expect(revision.db_content).toBe(edits[0]);

    // Revert to it: the history pane's "revert to this" link
    // (card-mod-history set/all/history/actions.rb:81-89).
    const reverted = await engine.revertActions({ cardId, actionIds: [firstEdit.id] });
    expect(reverted, "the revert saves").not.toBeNull();

    // The card body is back on the reverted revision.
    const after = await storage.selectOne<CardsRow>("SELECT * FROM cards WHERE id = ?", [cardId]);
    expect(after!.db_content).toBe(revision.db_content!);

    // And the save that did it wrote the reverted revision's values as its
    // card_changes rows — one row per changed tracked field, each equal to
    // the revision's value for that field.
    const afterHistory = await historyOf(storage, cardId);
    expect(afterHistory.map((a) => a.actionType)).toEqual([0, 1, 1, 1, 1]);
    const revertAction = afterHistory.at(-1)!;
    const changeRows = await storage.selectAll<{ field: number; value: string | null }>(
      "SELECT field, value FROM card_changes WHERE card_action_id = ? ORDER BY id",
      [revertAction.id],
    );
    expect(changeRows.map((r) => trackedFieldByIndex(Number(r.field)))).toEqual(["db_content"]);
    expect(changeRows.map((r) => r.value)).toEqual([revision.db_content!]);

    // The history is still readable after the revert, and it now records the
    // revert itself at the content the first revision held.
    expect(afterHistory.map((a) => a.content)).toEqual(["first revision text", ...edits, edits[0]]);
  }, 120_000);
});

// ---------------------------------------------------------------------------
// Claim 3 — an interrupted save leaves nothing behind
// ---------------------------------------------------------------------------

class InjectedFailure extends Error {
  constructor(sql: string) {
    super(`injected failure at: ${sql.replace(/\s+/g, " ").slice(0, 90)}`);
    this.name = "InjectedFailure";
  }
}

/** The driver wrapper tests/card/actions/atomic-saves.test.ts uses: every
 *  statement passes through, except that once armed it throws on the nth
 *  statement matching `pattern`, before it reaches the database. It also
 *  records what went through, so a test can show the failure really landed
 *  part-way through the save rather than at its first statement. */
class RecordingFailingDriver implements SQLDatabaseDriver {
  /** Every SQL string this driver passed on, in order. */
  readonly seen: string[] = [];
  private pattern: RegExp | undefined;
  private remaining = 0;
  readonly transactionGuarantee: SQLDatabaseDriver["transactionGuarantee"];

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

  /** True when a write naming `table` has already gone through. */
  wrote(table: string): boolean {
    return writtenTables(this.seen).includes(table);
  }

  private check(sql: string): void {
    this.seen.push(sql);
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

/** Every table a list of statements wrote to, in order, however each one
 *  spells the table (quoted or bare). */
function writtenTables(statements: string[]): string[] {
  const out: string[] = [];
  for (const sql of statements) {
    const m = /^\s*(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+"?([A-Za-z_][A-Za-z0-9_]*)"?/i.exec(sql);
    if (m !== null && !out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

/** The deck under test: schema, the synthetic minimum, the write rules. */
async function openAtomicDeck(): Promise<{
  storage: ActionsTestStorage;
  driver: RecordingFailingDriver;
  engine: CardActionEngine;
  close: () => void;
}> {
  const db = new LocalSqliteDriver({ path: ":memory:" });
  const driver = new RecordingFailingDriver(db);
  const ddl = readFileSync(fileURLToPath(new URL("../../db/schema.sqlite.sql", import.meta.url)), "utf8");
  for (const statement of splitSqlStatements(ddl)) await driver.query(statement, []);
  const storage: ActionsTestStorage = {
    driver,
    engine: new FetchEngine(driver),
    close: () => db.close(),
    selectAll: async <T>(sql: string, params: unknown[] = []) => (await driver.query<T>(sql, params)).rows,
    selectOne: async <T>(sql: string, params: unknown[] = []) => (await driver.query<T>(sql, params)).rows[0],
    count: async (table) => Number((await driver.query<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`, [])).rows[0].n),
  };
  await seedStandardDeck(storage);
  return {
    storage,
    driver,
    engine: new CardActionEngine(storage.engine, { actor: JOE, now: fakeClock() }),
    close: () => db.close(),
  };
}

async function contentTables(storage: ActionsTestStorage): Promise<Record<string, unknown[]>> {
  const out: Record<string, unknown[]> = {};
  for (const table of NAMED_TABLES) {
    out[table] = await storage.selectAll(`SELECT * FROM ${table} ORDER BY rowid`);
  }
  return out;
}

describe("content: an interrupted save leaves nothing behind", () => {
  let deck: Awaited<ReturnType<typeof openAtomicDeck>>;

  beforeAll(async () => {
    deck = await openAtomicDeck();
  }, 60_000);

  afterAll(() => deck?.close());

  it('"saves are atomic: an interrupted save leaves nothing behind" — a driver failure part-way through one multi-table save on local SQLite leaves no partial card, act, change or reference rows', async () => {
    // The deck already holds cards and reference rows before the save (the
    // seeded type cards, the setting cards, and the three *all write-rule
    // references), so "unchanged afterwards" is a real assertion about the
    // save and not an artefact of empty tables.
    const seeded = await contentTables(deck.storage);
    const seededCounts = Object.fromEntries(Object.entries(seeded).map(([t, rows]) => [t, rows.length]));
    expect(seededCounts.card_references).toBe(3);
    expect(seededCounts.cards).toBeGreaterThan(0);

    // The subject card is created (a completed save) before the snapshot, so
    // the save under test is an UPDATE: an update writes its act, its action,
    // its card row, its db_content change row and its reference rows, which
    // is the multi-table save the claim is about. A create would write no
    // change rows at all (first_create? — set/all/history.rb:38-40).
    const created = await deck.engine.createCard({
      name: "Exercise Atomic Subject",
      content: "no links in this body yet",
    });
    const cardId = created!.cardId;
    const before = await contentTables(deck.storage);
    expect(before.cards.length).toBe(seededCounts.cards + 1);
    expect(before.card_acts.length).toBe(1);

    // The driver throws at the reference write — the save's last table, after
    // the card, act, action and change rows have already been written.
    deck.driver.failOn(/INSERT INTO card_references/i);
    let thrown: unknown;
    try {
      await deck.engine.updateCard({ cardId, content: "now the body links [[Pudding]]" });
    } catch (error) {
      thrown = error;
    }
    deck.driver.disarm();

    expect(thrown, "the injected failure reaches the caller").toBeInstanceOf(InjectedFailure);

    // The failure really landed part-way through: the card, act, action,
    // change and reference writes had all been issued when the reference
    // write threw.
    expect(
      [...NAMED_TABLES].filter((t) => deck.driver.wrote(t)),
      `the save wrote ${writtenTables(deck.driver.seen).join(", ")} before it failed`,
    ).toEqual([...NAMED_TABLES]);

    // Nothing survives: every one of the five tables is row-for-row what it
    // was before the save.
    expect(await contentTables(deck.storage)).toEqual(before);
    expect(
      await deck.storage.selectAll("SELECT db_content FROM cards WHERE id = ?", [cardId]),
    ).toEqual([{ db_content: "no links in this body yet" }]);
    expect(
      await deck.storage.count("card_changes"),
      "no change row for the interrupted save",
    ).toBe(before.card_changes.length);

    // And the engine still saves: the failure released the lock and left no
    // cached partial state behind.
    const after = await deck.engine.updateCard({ cardId, content: "kept" });
    expect(after).not.toBeNull();
    expect(await deck.storage.count("cards")).toBe((before.cards as unknown[]).length);
    expect(
      await deck.storage.selectAll("SELECT db_content FROM cards WHERE id = ?", [cardId]),
    ).toEqual([{ db_content: "kept" }]);
  }, 120_000);
});

// ---------------------------------------------------------------------------
// Claim 4 — file and image uploads
// ---------------------------------------------------------------------------

/** A version file's pixel size, read out of the PNG header. */
function pngSize(bytes: Uint8Array): [number, number] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return [view.getUint32(16), view.getUint32(20)];
}

/** The synthetic PDF: a %PDF header and invented filler, sized like a short
 *  report. Nothing here is anyone's document. */
function syntheticPdf(): Uint8Array {
  const body = "%PDF-1.4\nexercise synthetic upload fixture\n";
  const filler = "-".repeat(1024 - body.length);
  return new TextEncoder().encode(`${body}${filler}`);
}

describe("uploads: files and images", () => {
  it('"file and image uploads, with images resized to Ruby\'s sizes" — an image upload stores the original plus the four size versions at ImageCardUploader\'s geometry, and a PDF upload stores its bytes on the configured store', async () => {
    const aw = await freshAttachmentWorld();
    try {
      // The image: the committed synthetic 64x48 gradient
      // (tools/parity-side-effects/fixtures/parity-image.png, generated by
      // tools/parity-side-effects/make-fixtures.mjs).
      const pngBytes = new Uint8Array(
        readFileSync(join(REPO_ROOT, "tools", "parity-side-effects", "fixtures", "parity-image.png")),
      );
      expect(pngSize(pngBytes)).toEqual([64, 48]);

      const identifier = await whenUploadFile(aw, {
        name: "Exercise Upload Banner",
        bytes: pngBytes,
        originalFilename: "banner.png",
        typeCode: "image",
      });
      expect(identifier).toMatch(/^~\d+\/\d+\.png$/);
      const [, imageCardId, imageActionId] = /^~(\d+)\/(\d+)\.png$/.exec(identifier)!;

      // create_versions? (set/type/image.rb:4-7 — every version is not an
      // SVG) stores the original under its -original spelling plus one file
      // per version (image_card_uploader.rb:16-27, :44-57).
      expect((await walkStoredTree(aw.filesDir)).filter((p) => p.startsWith(`${imageCardId}/`)).sort()).toEqual([
        `${imageCardId}/${imageActionId}-icon.png`,
        `${imageCardId}/${imageActionId}-large.png`,
        `${imageCardId}/${imageActionId}-medium.png`,
        `${imageCardId}/${imageActionId}-original.png`,
        `${imageCardId}/${imageActionId}-small.png`,
      ]);

      // The sizes Ruby produces for a 64x48 upload, from the geometry
      // ImageCardUploader declares (image_card_uploader.rb:16-27, the
      // mini_magick processors ported in src/card/attachments/image-resize.ts):
      //   medium  resize_to_limit [200, 200] — 64x48, never enlarged
      //   large   resize_to_limit [500, 500] — 64x48, never enlarged
      //   small   resize_to_fit   [75, 75]  from medium — enlarged to 75x56
      //   icon    resize_and_pad  [16, 16]  — exactly 16x16
      const variants = { icon: [16, 16], small: [75, 56], medium: [64, 48], large: [64, 48] } as const;
      for (const [name, size] of Object.entries(variants)) {
        const bytes = await storedVariantBytes(aw, identifier, name);
        expect(pngSize(bytes), `the ${name} version's dimensions`).toEqual(size);
        expect([bytes[0], bytes[1]], `the ${name} version is still a PNG`).toEqual([0x89, 0x50]);
      }
      // The stored original is the uploaded bytes, not a re-encode.
      const storedOriginal = await storedVariantBytes(aw, identifier, "original");
      expect(Array.from(storedOriginal)).toEqual(Array.from(pngBytes));

      // The PDF: a File card's mount has no versions
      // (file_card_uploader.rb — set/type/file.rb:1), so the blob lands on
      // the configured store under the identifier's own spelling.
      const pdfBytes = syntheticPdf();
      const pdfIdentifier = await whenUploadFile(aw, {
        name: "Exercise Upload Minutes",
        bytes: pdfBytes,
        originalFilename: "minutes.pdf",
        typeCode: "file",
      });
      expect(pdfIdentifier).toMatch(/^~\d+\/\d+\.pdf$/);
      const [, pdfCardId, pdfActionId] = /^~(\d+)\/(\d+)\.pdf$/.exec(pdfIdentifier)!;
      expect((await walkStoredTree(aw.filesDir)).filter((p) => p.startsWith(`${pdfCardId}/`))).toEqual([
        `${pdfCardId}/${pdfActionId}.pdf`,
      ]);
      expect(Array.from(new Uint8Array(await storedFileBytes(aw, pdfIdentifier)))).toEqual(Array.from(pdfBytes));
    } finally {
      await closeAttachmentWorld(aw);
    }
  }, 300_000);
});

afterAll(() => cleanupScratch());