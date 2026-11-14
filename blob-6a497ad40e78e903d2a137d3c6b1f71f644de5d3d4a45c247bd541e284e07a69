import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { LocalSqliteDriver } from "../../../src/server/drivers/local-sqlite.js";
import { FetchEngine } from "../../../src/card/fetch.js";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";
import type { Actor } from "../../../src/card/actions/types.js";
import {
   executeCount,
  executeQuery,
  parseOptionsWithLexicon,
} from "../../../src/cql/execute.js";
import {
  compactPendingRuleFlags,
  DEFAULT_COMPACTION_INTERVAL_MS,
  enableLazyRuleWatermarks,
  getCardRuleWatermarkEpoch,
  getCompactionScheduleState,
  getLatestRuleFlagEpoch,
  hasPendingRuleFlags,
  listPendingRuleFlags,
  reconcilePendingRuleFlagsForSearch,
  resolveCardReadRuleWithWatermark,
  runScheduledCompactionIfDue,
} from "../../../src/card/permissions/lazy-rule-watermark.js";
import { splitSqlStatements } from "../fetch/fetch-test-storage.js";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const DDL_PATH = `${REPO_ROOT}db/schema.sqlite.sql`;

const ACTOR: Actor = { id: 1, name: "Test Bot" };

const RICH_TEXT_ID = 2;
const CARDTYPE_ID = 3;
const ALL_ID = 7;
const DEFAULT_ID = 8;
const ANYONE_ID = 10;
const ADMIN_ID = 184;
const SET_TYPE_ID = 12;
const SETTING_TYPE_ID = 13;
const READ_ID = 14;
const SELF_ID = 15;
const ALL_PLUS_ID = 16;
const ALL_READ_RULE_ID = 17;
const LIST_TYPE_ID = 19;
const TYPE_SET_ID = 20;
const RIGHT_SET_ID = 21;
const ALL_PLUS_READ_RULE_ID = 22;

interface TestDeck {
  driver: LocalSqliteDriver;
  fetch: FetchEngine;
  engine: CardActionEngine;
  close(): void;
}

async function createSeededDeck(opts: { lazyWatermarks?: boolean; path?: string } = {}): Promise<TestDeck> {
  const driver = new LocalSqliteDriver({ path: opts.path ?? ":memory:" });
  const ddl = readFileSync(DDL_PATH, "utf8");
  for (const statement of splitSqlStatements(ddl)) {
    if (statement.length === 0) continue;
    await driver.query(statement, []);
  }
  const now = "2026-09-21 00:00:00.000";
  const cards: Array<{
    id: number;
    name: string;
    key: string;
    codename: string | null;
    type_id: number;
    content?: string;
  }> = [
    { id: 1, name: "Decko Bot", key: "decko_bot", codename: "decko_bot", type_id: CARDTYPE_ID },
    { id: RICH_TEXT_ID, name: "RichText", key: "rich_text", codename: "basic", type_id: CARDTYPE_ID },
    { id: CARDTYPE_ID, name: "Cardtype", key: "cardtype", codename: "cardtype", type_id: CARDTYPE_ID },
    { id: ALL_ID, name: "*all", key: "*all", codename: "all", type_id: SET_TYPE_ID },
    { id: DEFAULT_ID, name: "*default", key: "*default", codename: "default", type_id: CARDTYPE_ID },
    { id: ANYONE_ID, name: "Anyone", key: "anyone", codename: "anyone", type_id: CARDTYPE_ID },
    { id: ADMIN_ID, name: "Administrator", key: "administrator", codename: "administrator", type_id: CARDTYPE_ID },
    { id: SET_TYPE_ID, name: "Set", key: "set", codename: "set", type_id: CARDTYPE_ID },
    { id: SETTING_TYPE_ID, name: "Setting", key: "setting", codename: "setting", type_id: CARDTYPE_ID },
    { id: READ_ID, name: "*read", key: "*read", codename: "read", type_id: SETTING_TYPE_ID },
    { id: SELF_ID, name: "*self", key: "*self", codename: "self", type_id: CARDTYPE_ID },
    { id: ALL_PLUS_ID, name: "*all plus", key: "*all_plu", codename: "all_plus", type_id: SET_TYPE_ID },
    { id: LIST_TYPE_ID, name: "List", key: "list", codename: "list", type_id: CARDTYPE_ID },
    { id: TYPE_SET_ID, name: "*type", key: "*type", codename: "type", type_id: CARDTYPE_ID },
    { id: RIGHT_SET_ID, name: "*right", key: "*right", codename: "right", type_id: CARDTYPE_ID },
  ];
  for (const c of cards) {
    await driver.query(
      `INSERT INTO cards (
         id, name, "key", codename, left_id, right_id, current_revision_id,
         created_at, updated_at, creator_id, updater_id,
         read_rule_class, read_rule_id, references_expired, trash, type_id, db_content
       ) VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?, ?, 1, 1, '*all', ?, NULL, 0, ?, ?)`,
      [c.id, c.name, c.key, c.codename, now, now, ALL_READ_RULE_ID, c.type_id, c.content ?? ""],
    );
  }
  await driver.query(
    `INSERT INTO cards (
       id, name, "key", codename, left_id, right_id, current_revision_id,
       created_at, updated_at, creator_id, updater_id,
       read_rule_class, read_rule_id, references_expired, trash, type_id, db_content
     ) VALUES (?, NULL, NULL, NULL, ?, ?, NULL, ?, ?, 1, 1, '*all', ?, NULL, 0, ?, '[[Anyone]]')`,
    [ALL_READ_RULE_ID, ALL_ID, READ_ID, now, now, ALL_READ_RULE_ID, LIST_TYPE_ID],
  );
  await driver.query(
    `INSERT INTO cards (
       id, name, "key", codename, left_id, right_id, current_revision_id,
       created_at, updated_at, creator_id, updater_id,
       read_rule_class, read_rule_id, references_expired, trash, type_id, db_content
     ) VALUES (?, NULL, NULL, NULL, ?, ?, NULL, ?, ?, 1, 1, '*all', ?, NULL, 0, ?, '[[_left]]')`,
    [ALL_PLUS_READ_RULE_ID, ALL_PLUS_ID, READ_ID, now, now, ALL_READ_RULE_ID, LIST_TYPE_ID],
  );
  await driver.query("INSERT INTO sqlite_sequence (name, seq) VALUES ('cards', 200)", []);

  const fetch = new FetchEngine(driver);
  const engine = new CardActionEngine(fetch, { actor: ACTOR, canWrite: () => true });
  if (opts.lazyWatermarks === true) {
    await enableLazyRuleWatermarks(driver, { eagerMemberLimit: 0 });
  }
  return {
    driver,
    fetch,
    engine,
    close: () => driver.close(),
  };
}

describe("Lazy Rule Flag + Watermark System (Flag-on-Write / Apply-on-Read / Compaction)", () => {
  it("raises an O(1) rule flag on write without cascading to cold member cards, then applies on read with idempotent write-back", async () => {
    const deck = await createSeededDeck({ lazyWatermarks: true });
    try {
      const bookType = await deck.engine.createCard({
        name: "Book",
        typeName: "Cardtype",
      });
      const book1 = await deck.engine.createCard({
        name: "Book One",
        typeId: bookType.cardId,
        content: "First book",
      });
      const book2 = await deck.engine.createCard({
        name: "Book Two",
        typeId: bookType.cardId,
        content: "Second book",
      });
      const note = await deck.engine.createCard({
        name: "Plain Note",
        typeId: RICH_TEXT_ID,
        content: "Unrelated note",
      });

      // Initially all cards inherit *all+*read (17)
      const beforeRow1 = (
        await deck.driver.query<{ read_rule_id: number }>(
          "SELECT read_rule_id FROM cards WHERE id = ?",
          [book1.cardId],
        )
      ).rows[0];
      expect(beforeRow1?.read_rule_id).toBe(ALL_READ_RULE_ID);

      // Now create Book+*type and Book+*type+*read with lazy watermarks enabled
      await deck.engine.createCard({ name: "Book+*type", typeName: "Set" });
      const bookTypeRule = await deck.engine.createCard({
        name: "Book+*type+*read",
        typeName: "List",
        content: "[[Administrator]]",
      });

      // Verify O(1) Flag-on-Write:
      // 1. A flag is recorded in deck_rule_flags
      expect(hasPendingRuleFlags(deck.driver)).toBe(true);
      const flags = await listPendingRuleFlags(deck.driver);
      expect(flags.length).toBe(1);
      expect(flags[0]?.ruleId).toBe(bookTypeRule.cardId);
      expect(flags[0]?.patternCode).toBe("type");
      expect(flags[0]?.anchorId).toBe(bookType.cardId);

      // 2. Cold cards (book1, book2) were NOT touched during the rule save!
      const rawColdBook1 = (
        await deck.driver.query<{ read_rule_id: number; read_rule_class: string }>(
          "SELECT read_rule_id, read_rule_class FROM cards WHERE id = ?",
          [book1.cardId],
        )
      ).rows[0];
      expect(rawColdBook1?.read_rule_id).toBe(ALL_READ_RULE_ID);

      // 3. Apply-on-Read: Fetching Book One applies the pending flag in memory AND writes back idempotently
      const fetchedBook1 = await deck.fetch.fetch("Book One");
      expect(fetchedBook1?.readRuleId).toBe(bookTypeRule.cardId);
      expect(fetchedBook1?.readRuleClass).toBe("*type");

      const afterReadBook1 = (
        await deck.driver.query<{ read_rule_id: number; read_rule_class: string }>(
          "SELECT read_rule_id, read_rule_class FROM cards WHERE id = ?",
          [book1.cardId],
        )
      ).rows[0];
      expect(afterReadBook1?.read_rule_id).toBe(bookTypeRule.cardId);
      expect(afterReadBook1?.read_rule_class).toBe("*type");
      expect(await getCardRuleWatermarkEpoch(deck.driver, book1.cardId)).toBe(
        getLatestRuleFlagEpoch(deck.driver),
      );

      // 4. Book Two was never fetched, so its raw disk row is still untouched until read or compacted
      const rawColdBook2 = (
        await deck.driver.query<{ read_rule_id: number }>(
          "SELECT read_rule_id FROM cards WHERE id = ?",
          [book2.cardId],
        )
      ).rows[0];
      expect(rawColdBook2?.read_rule_id).toBe(ALL_READ_RULE_ID);

      // 5. Concurrent / repeated reads are idempotent and fast-pathed by watermark epoch
      const [concurrentA, concurrentB] = await Promise.all([
        resolveCardReadRuleWithWatermark({ driver: deck.driver, fetch: deck.fetch }, book1.cardId),
        resolveCardReadRuleWithWatermark({ driver: deck.driver, fetch: deck.fetch }, book1.cardId),
      ]);
      expect(concurrentA?.readRuleId).toBe(bookTypeRule.cardId);
      expect(concurrentB?.readRuleId).toBe(bookTypeRule.cardId);

      // 6. Unrelated simple card (Plain Note) advances its watermark without changing its read_rule_id
      const fetchedNote = await deck.fetch.fetch("Plain Note");
      expect(fetchedNote?.readRuleId).toBe(ALL_READ_RULE_ID);
      expect(await getCardRuleWatermarkEpoch(deck.driver, note.cardId)).toBe(
        getLatestRuleFlagEpoch(deck.driver),
      );

      // 7. Background Compaction sweeps remaining cold cards (Book Two) and prunes deck_rule_flags
      const report = await compactPendingRuleFlags({
        driver: deck.driver,
        fetch: deck.fetch,
      });
      expect(report.updatedCards).toBe(1); // Only Book Two needed updating!
      expect(report.remainingFlags).toBe(0);
      expect(hasPendingRuleFlags(deck.driver)).toBe(false);

      const compactedBook2 = (
        await deck.driver.query<{ read_rule_id: number; read_rule_class: string }>(
          "SELECT read_rule_id, read_rule_class FROM cards WHERE id = ?",
          [book2.cardId],
        )
      ).rows[0];
      expect(compactedBook2?.read_rule_id).toBe(bookTypeRule.cardId);
      expect(compactedBook2?.read_rule_class).toBe("*type");
    } finally {
      deck.close();
    }
  });

  it("proves 100% equivalence against an eagerly-cascaded oracle deck across rule creates, compound [[_left]] delegation, CQL searches, batched compaction, and rule deletes", async () => {
    const lazyDeck = await createSeededDeck({ lazyWatermarks: true });
    const eagerOracle = await createSeededDeck({ lazyWatermarks: false });
    try {
      const setupBoth = async (
        fn: (engine: CardActionEngine) => Promise<void>,
      ): Promise<void> => {
        await fn(lazyDeck.engine);
        await fn(eagerOracle.engine);
      };

      // Seed types and cards (simple + compound children that inherit via *all plus+*read = [[_left]])
      await setupBoth(async (engine) => {
        const articleType = await engine.createCard({ name: "Article", typeName: "Cardtype" });
        await engine.createCard({ name: "Summary", typeId: RICH_TEXT_ID });
        for (let i = 1; i <= 6; i++) {
          await engine.createCard({
            name: `Article ${i}`,
            typeId: articleType.cardId,
            content: `Body ${i}`,
          });
          await engine.createCard({
            name: `Article ${i}+Summary`,
            typeId: RICH_TEXT_ID,
            content: `Summary ${i}`,
          });
        }
      });

      // Step 1: Create Article+*type+*read (restricting Articles and their +Summary children via [[_left]])
      await setupBoth(async (engine) => {
        await engine.createCard({ name: "Article+*type", typeName: "Set" });
        await engine.createCard({
          name: "Article+*type+*read",
          typeName: "List",
          content: "[[Administrator]]",
        });
      });

      // Step 2: Create a more specific *self rule on Article 1 making Article 1 (and Article 1+Summary) public again
      await setupBoth(async (engine) => {
        await engine.createCard({ name: "Article 1+*self", typeName: "Set" });
        await engine.createCard({
          name: "Article 1+*self+*read",
          typeName: "List",
          content: "[[Anyone]]",
        });
      });

      // Before any compaction: test Apply-on-Read on a subset of cards (including compound child Article 1+Summary and Article 2+Summary)
      eagerOracle.fetch.cardCache.reset();
      for (const name of ["Article 1", "Article 1+Summary", "Article 2+Summary"]) {
        const lazyCard = await lazyDeck.fetch.fetch(name);
        const eagerCard = await eagerOracle.fetch.fetch(name);
        expect(lazyCard?.readRuleId, `Apply-on-Read readRuleId for ${name}`).toBe(
          eagerCard?.readRuleId,
        );
        expect(lazyCard?.readRuleClass, `Apply-on-Read readRuleClass for ${name}`).toBe(
          eagerCard?.readRuleClass,
        );
      }

      // Test CQL search equivalence while flags are pending (anonymous viewer can only read ALL_READ_RULE_ID and Article 1's *self rule)
      const selfRuleLazy = await lazyDeck.fetch.fetch("Article 1+*self+*read");
      const selfRuleEager = await eagerOracle.fetch.fetch("Article 1+*self+*read");
      expect(selfRuleLazy?.id).toBe(selfRuleEager?.id);

      const readableRuleIds = [ALL_READ_RULE_ID, selfRuleLazy!.id!];
      const lazySearch = await executeQuery(
        lazyDeck.driver,
        { right: "Summary", sort: "name" },
        {
          alwaysOk: false,
          readRuleIds: readableRuleIds,
          parse: parseOptionsWithLexicon(lazyDeck.fetch.lexicon),
        },
      );
      const eagerSearch = await executeQuery(
        eagerOracle.driver,
        { right: "Summary", sort: "name" },
        {
          alwaysOk: false,
          readRuleIds: readableRuleIds,
          parse: parseOptionsWithLexicon(eagerOracle.fetch.lexicon),
        },
      );
      expect(
        "rows" in lazySearch ? lazySearch.rows.map((r) => r.id) : [],
      ).toEqual("rows" in eagerSearch ? eagerSearch.rows.map((r) => r.id) : []);

      const lazyCount = await executeCount(
        lazyDeck.driver,
        { right: "Summary" },
        {
          alwaysOk: false,
          readRuleIds: readableRuleIds,
          parse: parseOptionsWithLexicon(lazyDeck.fetch.lexicon),
        },
      );
      const eagerCount = await executeCount(
        eagerOracle.driver,
        { right: "Summary" },
        {
          alwaysOk: false,
          readRuleIds: readableRuleIds,
          parse: parseOptionsWithLexicon(eagerOracle.fetch.lexicon),
        },
      );
      expect(lazyCount).toBe(eagerCount);
      expect(lazyCount).toBe(1); // Only Article 1+Summary is readable!

      // Step 3: Now delete Article+*type+*read and compact in bounded batches of 3 cards at a time
      await setupBoth(async (engine) => {
        const rule = await engine.fetch.fetch("Article+*type+*read");
        await engine.deleteCard({ cardId: rule!.id! });
      });
      expect(hasPendingRuleFlags(lazyDeck.driver)).toBe(true);

      let safetySteps = 0;
      while (hasPendingRuleFlags(lazyDeck.driver) && safetySteps < 20) {
        safetySteps += 1;
        await compactPendingRuleFlags(
          { driver: lazyDeck.driver, fetch: lazyDeck.fetch },
          { batchSize: 3 },
        );
      }
      expect(hasPendingRuleFlags(lazyDeck.driver)).toBe(false);

      // Prove 100% row-by-row equivalence across every live card in the database!
      const lazyRows = (
        await lazyDeck.driver.query<{
          id: number;
          read_rule_id: number | null;
          read_rule_class: string | null;
        }>("SELECT id, read_rule_id, read_rule_class FROM cards WHERE trash = 0 ORDER BY id", [])
      ).rows;
      const eagerRows = (
        await eagerOracle.driver.query<{
          id: number;
          read_rule_id: number | null;
          read_rule_class: string | null;
        }>("SELECT id, read_rule_id, read_rule_class FROM cards WHERE trash = 0 ORDER BY id", [])
      ).rows;

      expect(lazyRows).toEqual(eagerRows);
    } finally {
      lazyDeck.close();
      eagerOracle.close();
    }
  });

  it("maintains invariant equivalence across *right, *type plus right, and *all rule mutations with interleaved reads", async () => {
    const lazyDeck = await createSeededDeck({ lazyWatermarks: true });
    const eagerOracle = await createSeededDeck({ lazyWatermarks: false });
    try {
      const setupBoth = async (fn: (engine: CardActionEngine) => Promise<void>) => {
        await fn(lazyDeck.engine);
        await fn(eagerOracle.engine);
      };

      await setupBoth(async (engine) => {
        const projectType = await engine.createCard({ name: "Project", typeName: "Cardtype" });
        const companyType = await engine.createCard({ name: "Company", typeName: "Cardtype" });
        await engine.createCard({ name: "Budget", typeId: RICH_TEXT_ID });
        await engine.createCard({ name: "Status", typeId: RICH_TEXT_ID });

        for (let i = 1; i <= 3; i++) {
          await engine.createCard({ name: `Proj ${i}`, typeId: projectType.cardId });
          await engine.createCard({ name: `Proj ${i}+Budget`, typeId: RICH_TEXT_ID });
          await engine.createCard({ name: `Proj ${i}+Status`, typeId: RICH_TEXT_ID });
          await engine.createCard({ name: `Co ${i}`, typeId: companyType.cardId });
          await engine.createCard({ name: `Co ${i}+Budget`, typeId: RICH_TEXT_ID });
        }
      });

      // 1. Add a *right rule on Budget
      await setupBoth(async (engine) => {
        await engine.createCard({ name: "Budget+*right", typeName: "Set" });
        await engine.createCard({
          name: "Budget+*right+*read",
          typeName: "List",
          content: "[[Administrator]]",
        });
      });

      // Interleaved read on Proj 1+Budget and Co 1+Budget before compaction
      eagerOracle.fetch.cardCache.reset();
      for (const name of ["Proj 1+Budget", "Co 1+Budget", "Proj 1+Status"]) {
        const l = await lazyDeck.fetch.fetch(name);
        const e = await eagerOracle.fetch.fetch(name);
        expect(l?.readRuleId, `after *right rule: ${name}`).toBe(e?.readRuleId);
        expect(l?.readRuleClass, `after *right rule class: ${name}`).toBe(e?.readRuleClass);
      }

      // 2. Compact all pending flags and verify 100% full-table match + watermark table cleanup
      await compactPendingRuleFlags({ driver: lazyDeck.driver, fetch: lazyDeck.fetch });
      expect(hasPendingRuleFlags(lazyDeck.driver)).toBe(false);
      const watermarkRowsAfterCompaction = await lazyDeck.driver.query<{ cnt: number }>(
        "SELECT COUNT(*) AS cnt FROM deck_card_rule_watermarks",
        [],
      );
      expect(Number(watermarkRowsAfterCompaction.rows[0]?.cnt ?? 0)).toBe(0);

      const snapshotAfterRight = async (d: LocalSqliteDriver) =>
        (
          await d.query<{ id: number; read_rule_id: number | null; read_rule_class: string | null }>(
            "SELECT id, read_rule_id, read_rule_class FROM cards WHERE trash = 0 ORDER BY id",
            [],
          )
        ).rows;
      expect(await snapshotAfterRight(lazyDeck.driver)).toEqual(
        await snapshotAfterRight(eagerOracle.driver),
      );
    } finally {
      lazyDeck.close();
      eagerOracle.close();
    }
  });

  it("resets the 30-day scheduled flush timer whenever a search or manual flush completes so a flush on day 29 skips day 30", async () => {
    const deck = await createSeededDeck({ lazyWatermarks: true });
    try {
      const dayMs = 24 * 60 * 60 * 1000;
      const t0 = 1_700_000_000_000;
      await enableLazyRuleWatermarks(deck.driver, {
        nowMs: t0,
        compactionIntervalMs: DEFAULT_COMPACTION_INTERVAL_MS,
      });

      const initialSchedule = await getCompactionScheduleState(deck.driver, t0);
      expect(initialSchedule.lastFullCompactionAtMs).toBe(t0);
      expect(initialSchedule.nextScheduledCompactionAtMs).toBe(t0 + 30 * dayMs);
      expect(initialSchedule.isDue).toBe(false);

      // Raise a rule flag via rule save
      const reportType = await deck.engine.createCard({ name: "Report", typeName: "Cardtype" });
      await deck.engine.createCard({ name: "Report 1", typeId: reportType.cardId });
      await deck.engine.createCard({ name: "Report+*type", typeName: "Set" });
      await deck.engine.createCard({
        name: "Report+*type+*read",
        typeName: "List",
        content: "[[Administrator]]",
      });
      expect(hasPendingRuleFlags(deck.driver)).toBe(true);

      // Day 29 (1 day before the 30-day scheduled flush): a permission-filtered search triggers reconciliation
      const day29 = t0 + 29 * dayMs;
      await reconcilePendingRuleFlagsForSearch(deck.driver, deck.fetch, day29);
      expect(hasPendingRuleFlags(deck.driver)).toBe(false);

      // On Day 30 (when the original timer would have fired), the scheduled flush is NOT due
      // because the Day 29 search flush reset the 30-day clock to Day 59!
      const day30 = t0 + 30 * dayMs;
      const day30Attempt = await runScheduledCompactionIfDue(
        { driver: deck.driver, fetch: deck.fetch },
        { nowMs: day30 },
      );
      expect(day30Attempt.ran).toBe(false);
      expect(day30Attempt.schedule.lastFullCompactionAtMs).toBe(day29);
      expect(day30Attempt.schedule.nextScheduledCompactionAtMs).toBe(day29 + 30 * dayMs);

      // On Day 59 (30 days after the Day 29 search flush), the scheduled flush IS due and runs
      const day59 = day29 + 30 * dayMs;
      const day59Attempt = await runScheduledCompactionIfDue(
        { driver: deck.driver, fetch: deck.fetch },
        { nowMs: day59 },
      );
      expect(day59Attempt.ran).toBe(true);
      expect(day59Attempt.schedule.lastFullCompactionAtMs).toBe(day59);
      expect(day59Attempt.schedule.nextScheduledCompactionAtMs).toBe(day59 + 30 * dayMs);
    } finally {
      deck.close();
    }
  });

  it("synchronizes pending rule flags across separate worker drivers on the same SQLite database and compacts in O(1) bulk queries", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "decko-watermark-multiworker-"));
    const dbFile = path.join(tmpDir, "shared.sqlite3");
    const workerA = await createSeededDeck({ lazyWatermarks: false, path: dbFile });
    const driverB = new LocalSqliteDriver({ path: dbFile });
    const fetchB = new FetchEngine(driverB);
    try {
      const docType = await workerA.engine.createCard(
        { name: "SecretDoc", typeName: "Cardtype" },
        ACTOR,
      );
      for (let i = 1; i <= 25; i++) {
        await workerA.engine.createCard(
          { name: `SecretDoc ${i}`, typeId: docType.cardId },
          ACTOR,
        );
      }

      // Worker B fetches SecretDoc 1 BEFORE lazy watermarks are even enabled on Worker A
      const beforeEnableOnB = await fetchB.fetch("SecretDoc 1");
      expect(beforeEnableOnB?.readRuleId).toBe(ALL_READ_RULE_ID);
      expect(hasPendingRuleFlags(driverB)).toBe(false);

      // Now Worker A enables lazy watermarks and creates SecretDoc+*type+*read
      await enableLazyRuleWatermarks(workerA.driver, { eagerMemberLimit: 0 });
      await workerA.engine.createCard({ name: "SecretDoc+*type", typeName: "Set" }, ACTOR);
      const ruleRes = await workerA.engine.createCard(
        {
          name: "SecretDoc+*type+*read",
          typeName: "List",
          content: "[[Administrator]]",
        },
        ACTOR,
      );

      // Worker B immediately detects the pending rule flag written by Worker A!
      expect(hasPendingRuleFlags(driverB)).toBe(true);

      // Worker B's fetch on SecretDoc 2 applies the pending rule flag on read!
      const doc2OnB = await fetchB.fetch("SecretDoc 2");
      expect(doc2OnB?.readRuleId).toBe(ruleRes.cardId);

      // Count SQL queries during Worker B's search reconciliation across all 25 SecretDocs
      let compactionQueries = 0;
      const origQuery = driverB.query.bind(driverB);
      const origBatch = driverB.batch.bind(driverB);
      driverB.query = async <T = unknown>(sql: string, params: unknown[]) => {
        compactionQueries += 1;
        return origQuery<T>(sql, params);
      };
      driverB.batch = async (stmts) => {
        compactionQueries += stmts.length;
        return origBatch(stmts);
      };

      await reconcilePendingRuleFlagsForSearch(driverB, fetchB);
      // Bulk preload + grouped UPDATE executes in <= 12 SQL statements total (not 25 * 4 = 100+ queries)
      expect(compactionQueries).toBeLessThanOrEqual(12);

      // Both Worker B and Worker A now see 0 pending rule flags!
      expect(hasPendingRuleFlags(driverB)).toBe(false);
      expect(hasPendingRuleFlags(workerA.driver)).toBe(false);
    } finally {
      driverB.close();
      workerA.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("coalesces concurrent schema probes and issues zero SQL queries on warm in-memory cache hits for remote/edge drivers (D1 / Bunny)", async () => {
    const sqliteDeck = await createSeededDeck({ lazyWatermarks: false });
    try {
      for (let i = 1; i <= 5; i++) {
        await sqliteDeck.engine.createCard({
          name: `EdgeCard ${i}`,
          typeId: RICH_TEXT_ID,
          content: `Content ${i}`,
        });
      }

      const executedQueries: Array<{ sql: string; params: unknown[] }> = [];
      // Remote/edge driver wrapper that intentionally omits peekPendingRuleFlagsSummary (like CloudflareD1Adapter / BunnyDbDriver)
      const remoteDriver = {
        transactionGuarantee: sqliteDeck.driver.transactionGuarantee,
        async query<T = unknown>(sql: string, params: unknown[]) {
          executedQueries.push({ sql, params });
          return sqliteDeck.driver.query<T>(sql, params);
        },
        async batch(stmts: Array<{ sql: string; params: unknown[] }>) {
          for (const s of stmts) executedQueries.push({ sql: s.sql, params: s.params });
          return sqliteDeck.driver.batch(stmts);
        },
      };

      const edgeFetch = new FetchEngine(remoteDriver);

      // 1. Cold concurrent fetches coalesce the sqlite_master deck_rule_flags probe into exactly 1 query
      await Promise.all([
        edgeFetch.fetch("EdgeCard 1"),
        edgeFetch.fetch("EdgeCard 2"),
        edgeFetch.fetch("EdgeCard 3"),
        edgeFetch.fetch("EdgeCard 4"),
        edgeFetch.fetch("EdgeCard 5"),
      ]);
      const probeCountCold = executedQueries.filter(
        (q) => q.sql.includes("sqlite_master") && q.params.includes("deck_rule_flags"),
      ).length;
      expect(probeCountCold).toBe(1);

      // 2. Warm in-memory cache hits issue 0 SQL queries when deck_rule_flags does not exist
      executedQueries.length = 0;
      for (let i = 1; i <= 5; i++) {
        const card = await edgeFetch.fetch(`EdgeCard ${i}`);
        expect(card?.dbContent).toBe(`Content ${i}`);
      }
      expect(executedQueries).toEqual([]);

      // 3. Even when deck_rule_flags IS initialized, warm in-memory cache hits issue 0 deck_rule_flags queries
      await enableLazyRuleWatermarks(remoteDriver, { eagerMemberLimit: 0 });
      // Prime compaction stamp after schema init, then verify warm reads issue 0 queries
      for (let i = 1; i <= 5; i++) {
        await edgeFetch.fetch(`EdgeCard ${i}`);
      }
      executedQueries.length = 0;
      for (let i = 1; i <= 5; i++) {
        const card = await edgeFetch.fetch(`EdgeCard ${i}`);
        expect(card?.dbContent).toBe(`Content ${i}`);
      }
      expect(executedQueries).toEqual([]);
    } finally {
      sqliteDeck.close();
    }
  });
});
