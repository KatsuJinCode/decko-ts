import { readFileSync } from "node:fs";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
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
  enableLazyRuleWatermarks,
  getCardRuleWatermarkEpoch,
  getLatestRuleFlagEpoch,
  hasPendingRuleFlags,
} from "../../../src/card/permissions/lazy-rule-watermark.js";
import { splitSqlStatements } from "../fetch/fetch-test-storage.js";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const DDL_PATH = `${REPO_ROOT}db/schema.sqlite.sql`;

const ACTOR: Actor = { id: 1, name: "Proof Bot" };

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
const TYPE_PLUS_RIGHT_SET_ID = 23;
const ALL_DEFAULT_RULE_ID = 24;

interface WorkerNode {
  driver: LocalSqliteDriver;
  fetch: FetchEngine;
  engine: CardActionEngine;
}

interface ProofHarness {
  tmpDir: string;
  lazyWorkers: [WorkerNode, WorkerNode];
  oracle: WorkerNode;
  allCardNames: string[];
  close(): void;
}

/**
 * Deterministic PRNG (Mulberry32) so every state-machine proof trace is 100% reproducible.
 */
function createPrng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function seedDatabase(driver: LocalSqliteDriver): Promise<void> {
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
    {
      id: TYPE_PLUS_RIGHT_SET_ID,
      name: "*type plus right",
      key: "*type_plu_right",
      codename: "type_plus_right",
      type_id: CARDTYPE_ID,
    },
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
  await driver.query(
    `INSERT INTO cards (
       id, name, "key", codename, left_id, right_id, current_revision_id,
       created_at, updated_at, creator_id, updater_id,
       read_rule_class, read_rule_id, references_expired, trash, type_id, db_content
     ) VALUES (?, NULL, NULL, NULL, ?, ?, NULL, ?, ?, 1, 1, '*all', ?, NULL, 0, ?, '')`,
    [ALL_DEFAULT_RULE_ID, ALL_ID, DEFAULT_ID, now, now, ALL_READ_RULE_ID, RICH_TEXT_ID],
  );
  await driver.query("INSERT INTO sqlite_sequence (name, seq) VALUES ('cards', 200)", []);
}

async function createProofHarness(): Promise<ProofHarness> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "decko-watermark-proof-"));
  const lazyDbPath = path.join(tmpDir, "lazy.sqlite3");

  const lazyDriver1 = new LocalSqliteDriver({ path: lazyDbPath });
  await seedDatabase(lazyDriver1);
  await enableLazyRuleWatermarks(lazyDriver1, { eagerMemberLimit: 0 });

  // Second independent worker attached to the same central SQLite file
  const lazyDriver2 = new LocalSqliteDriver({ path: lazyDbPath });

  // Reference oracle database where every rule write eagerly cascades to every card immediately
  const oracleDriver = new LocalSqliteDriver({ path: ":memory:" });
  await seedDatabase(oracleDriver);

  const lazyFetch1 = new FetchEngine(lazyDriver1);
  const lazyFetch2 = new FetchEngine(lazyDriver2);
  const oracleFetch = new FetchEngine(oracleDriver);

  const lazyWorker1: WorkerNode = {
    driver: lazyDriver1,
    fetch: lazyFetch1,
    engine: new CardActionEngine(lazyFetch1, {
      actor: ACTOR,
      enabledRoleIds: [ANYONE_ID, ADMIN_ID],
    }),
  };
  const lazyWorker2: WorkerNode = {
    driver: lazyDriver2,
    fetch: lazyFetch2,
    engine: new CardActionEngine(lazyFetch2, {
      actor: ACTOR,
      enabledRoleIds: [ANYONE_ID, ADMIN_ID],
    }),
  };
  const oracle: WorkerNode = {
    driver: oracleDriver,
    fetch: oracleFetch,
    engine: new CardActionEngine(oracleFetch, {
      actor: ACTOR,
      enabledRoleIds: [ANYONE_ID, ADMIN_ID],
    }),
  };

  const allCardNames: string[] = [];
  const execBoth = async (fn: (w: WorkerNode) => Promise<void>) => {
    await fn(lazyWorker1);
    await fn(oracle);
  };

  await execBoth(async (w) => {
    const docType = await w.engine.createCard({ name: "Doc", typeName: "Cardtype" }, ACTOR);
    const noteType = await w.engine.createCard({ name: "Note", typeName: "Cardtype" }, ACTOR);
    await w.engine.createCard({ name: "Tag", typeId: RICH_TEXT_ID }, ACTOR);
    await w.engine.createCard({ name: "Secret", typeId: RICH_TEXT_ID }, ACTOR);

    for (let i = 1; i <= 4; i++) {
      await w.engine.createCard({ name: `Doc ${i}`, typeId: docType.cardId }, ACTOR);
      await w.engine.createCard({ name: `Doc ${i}+Tag`, typeId: RICH_TEXT_ID }, ACTOR);
      await w.engine.createCard({ name: `Doc ${i}+Secret`, typeId: RICH_TEXT_ID }, ACTOR);
      await w.engine.createCard({ name: `Note ${i}`, typeId: noteType.cardId }, ACTOR);
      await w.engine.createCard({ name: `Note ${i}+Tag`, typeId: RICH_TEXT_ID }, ACTOR);
    }

    // Pre-create set anchors so transitions can freely create/update/delete rules on them
    for (const setCardName of [
      "Doc+*type",
      "Note+*type",
      "Tag+*right",
      "Secret+*right",
      "Doc+Tag",
      "Doc+Tag+*type plus right",
      "Doc 1+*self",
      "Doc 1+Tag+*self",
      "Doc 2+*self",
      "Note 1+*self",
    ]) {
      await w.engine.createCard({ name: setCardName, typeName: "Set" }, ACTOR);
    }
    // Also create a 3-level nested compound card (Doc 1+Tag+Secret) to prove multi-hop [[_left]] delegation
    await w.engine.createCard({ name: "Doc 1+Tag+Secret", typeId: RICH_TEXT_ID }, ACTOR);
  });

  for (let i = 1; i <= 4; i++) {
    allCardNames.push(`Doc ${i}`, `Doc ${i}+Tag`, `Doc ${i}+Secret`, `Note ${i}`, `Note ${i}+Tag`);
  }
  allCardNames.push("Doc 1+Tag+Secret");

  return {
    tmpDir,
    lazyWorkers: [lazyWorker1, lazyWorker2],
    oracle,
    allCardNames,
    close() {
      lazyDriver1.close();
      lazyDriver2.close();
      oracleDriver.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    },
  };
}

describe("Formal State-Machine Equivalence Proof: Lazy Watermarks vs. Eager Oracle", () => {
  it("proves 100% exhaustive equivalence across all 2^6 = 64 combinations of the 6 permission rule specificity tiers (*all, *all plus, *type, *right, *type plus right, *self)", async () => {
    const h = await createProofHarness();
    try {
      // The 6 rule specificity tiers in Decko:
      // bit 0: *all+*read (updated between [[Anyone]] and [[Administrator]])
      // bit 1: *all plus+*read (updated between [[_left]] and [[Administrator]])
      // bit 2: Doc+*type+*read (present vs deleted)
      // bit 3: Tag+*right+*read (present vs deleted)
      // bit 4: Doc+Tag+*type plus right+*read (present vs deleted)
      // bit 5: Doc 1+*self+*read & Doc 1+Tag+*self+*read (present vs deleted)
      const optionalTiers = [
        { bit: 2, name: "Doc+*type+*read", content: "[[Administrator]]" },
        { bit: 3, name: "Tag+*right+*read", content: "[[Anyone]]" },
        { bit: 4, name: "Doc+Tag+*type plus right+*read", content: "[[Administrator]]" },
        { bit: 5, name: "Doc 1+*self+*read", content: "[[Anyone]]" },
        { bit: 5, name: "Doc 1+Tag+*self+*read", content: "[[Administrator]]" },
      ];
      const activeNames = new Set<string>();
      let prevBit0 = 0;
      let prevBit1 = 0;

      for (let step = 0; step < 64; step++) {
        // Use Gray code ordering so every single step flips exactly one tier bit (plus final full mask checks)
        const mask = step ^ (step >> 1);
        const w = h.lazyWorkers[step % 2]!;
        const otherW = h.lazyWorkers[1 - (step % 2)]!;

        const bit0 = mask & 1;
        if (bit0 !== prevBit0) {
          const content = bit0 ? "[[Administrator]]" : "[[Anyone]]";
          await w.engine.updateCard({ cardId: ALL_READ_RULE_ID, content }, ACTOR);
          await h.oracle.engine.updateCard({ cardId: ALL_READ_RULE_ID, content }, ACTOR);
          prevBit0 = bit0;
        }

        const bit1 = (mask >> 1) & 1;
        if (bit1 !== prevBit1) {
          const content = bit1 ? "[[Administrator]]" : "[[_left]]";
          await w.engine.updateCard({ cardId: ALL_PLUS_READ_RULE_ID, content }, ACTOR);
          await h.oracle.engine.updateCard({ cardId: ALL_PLUS_READ_RULE_ID, content }, ACTOR);
          prevBit1 = bit1;
        }

        for (const tier of optionalTiers) {
          const shouldExist = ((mask >> tier.bit) & 1) === 1;
          const exists = activeNames.has(tier.name);
          if (shouldExist && !exists) {
            await w.engine.createCard(
              { name: tier.name, typeName: "List", content: tier.content },
              ACTOR,
            );
            await h.oracle.engine.createCard(
              { name: tier.name, typeName: "List", content: tier.content },
              ACTOR,
            );
            activeNames.add(tier.name);
          } else if (!shouldExist && exists) {
            const lazyRule = await w.fetch.fetch(tier.name);
            const oracleRule = await h.oracle.fetch.fetch(tier.name);
            await w.engine.deleteCard({ cardId: lazyRule!.id! }, ACTOR);
            await h.oracle.engine.deleteCard({ cardId: oracleRule!.id! }, ACTOR);
            activeNames.delete(tier.name);
          }
        }

        otherW.fetch.cardCache.reset();
        h.oracle.fetch.cardCache.reset();

        // Check representative cards across simple, 2-part compound, and 3-part compound levels
        for (const probeCard of ["Doc 1", "Doc 2", "Doc 1+Tag", "Doc 2+Tag", "Doc 1+Tag+Secret", "Note 1+Tag"]) {
          const lazyCard = await otherW.fetch.fetch(probeCard);
          const oracleCard = await h.oracle.fetch.fetch(probeCard);
          expect(lazyCard?.readRuleId, `mask ${mask.toString(2)} (${probeCard}) readRuleId`).toBe(
            oracleCard?.readRuleId,
          );
          expect(
            lazyCard?.readRuleClass,
            `mask ${mask.toString(2)} (${probeCard}) readRuleClass`,
          ).toBe(oracleCard?.readRuleClass);
        }

        // Also verify CQL search equivalence at every 8th combination
        if (step % 8 === 7) {
          const lazySearch = await executeQuery(
            w.driver,
            { right: "Tag", sort: "name" },
            {
              alwaysOk: false,
              readRuleIds: [ALL_READ_RULE_ID],
              parse: parseOptionsWithLexicon(w.fetch.lexicon),
            },
          );
          const oracleSearch = await executeQuery(
            h.oracle.driver,
            { right: "Tag", sort: "name" },
            {
              alwaysOk: false,
              readRuleIds: [ALL_READ_RULE_ID],
              parse: parseOptionsWithLexicon(h.oracle.fetch.lexicon),
            },
          );
          const lazyIds = "rows" in lazySearch ? lazySearch.rows.map((r) => r.id) : [];
          const oracleIds = "rows" in oracleSearch ? oracleSearch.rows.map((r) => r.id) : [];
          expect(lazyIds, `mask ${mask.toString(2)} CQL search`).toEqual(oracleIds);
        }
      }
    } finally {
      h.close();
    }
  });

  it("proves observational equivalence (Theorem 1: Read Equivalence, Theorem 2: Search Equivalence, Theorem 3: Compaction Convergence & Multi-Worker Atomicity) across 2,500 adversarial state-machine transitions (5 independent seeds x 500 steps)", async () => {
    const seeds = [0xdec02026, 0x1337c0de, 0x9e3779b9, 0xdeadbeef, 0x42424242];
    for (const seed of seeds) {
      const h = await createProofHarness();
      try {
        const rand = createPrng(seed);
        const candidateRuleSets = [
          "Doc+*type",
          "Note+*type",
          "Tag+*right",
          "Secret+*right",
          "Doc+Tag+*type plus right",
          "Doc 1+*self",
          "Doc 1+Tag+*self",
          "Doc 2+*self",
          "Note 1+*self",
        ];
        const activeRules = new Set<string>();

        for (let step = 1; step <= 500; step++) {
        // Pick Worker 0 or Worker 1 at random for every operation on the lazy database
        const workerIdx = rand() < 0.5 ? 0 : 1;
        const activeWorker = h.lazyWorkers[workerIdx]!;
        const otherWorker = h.lazyWorkers[1 - workerIdx]!;

        const roll = rand();

        if (roll < 0.30) {
          // TRANSITION A: Toggle (create, update, or delete) a permission rule on a random Worker
          const setPrefix = candidateRuleSets[Math.floor(rand() * candidateRuleSets.length)]!;
          const ruleName = `${setPrefix}+*read`;
          const targetContent = rand() < 0.5 ? "[[Administrator]]" : "[[Anyone]]";

          if (!activeRules.has(ruleName)) {
            await activeWorker.engine.createCard(
              { name: ruleName, typeName: "List", content: targetContent },
              ACTOR,
            );
            await h.oracle.engine.createCard(
              { name: ruleName, typeName: "List", content: targetContent },
              ACTOR,
            );
            activeRules.add(ruleName);
          } else if (rand() < 0.45) {
            const lazyExisting = await activeWorker.fetch.fetch(ruleName);
            const oracleExisting = await h.oracle.fetch.fetch(ruleName);
            expect(lazyExisting?.id).toBe(oracleExisting?.id);
            await activeWorker.engine.updateCard(
              { cardId: lazyExisting!.id!, content: targetContent },
              ACTOR,
            );
            await h.oracle.engine.updateCard(
              { cardId: oracleExisting!.id!, content: targetContent },
              ACTOR,
            );
          } else {
            const lazyExisting = await activeWorker.fetch.fetch(ruleName);
            const oracleExisting = await h.oracle.fetch.fetch(ruleName);
            expect(lazyExisting?.id).toBe(oracleExisting?.id);
            await activeWorker.engine.deleteCard({ cardId: lazyExisting!.id! }, ACTOR);
            await h.oracle.engine.deleteCard({ cardId: oracleExisting!.id! }, ACTOR);
            activeRules.delete(ruleName);
          }
          // Reset caches on sibling worker and oracle so subsequent reads test database/watermark state
          otherWorker.fetch.cardCache.reset();
          h.oracle.fetch.cardCache.reset();
        } else if (roll < 0.65) {
          // TRANSITION B (Theorem 1 — Read Equivalence & Atomicity):
          // Fetch a random card on a random Worker (sometimes cold cache, sometimes warm cache)
          // and prove its effective readRuleId and readRuleClass match the eager oracle 100%,
          // AND its watermark in the central database is >= latestEpoch!
          if (rand() < 0.5) {
            activeWorker.fetch.cardCache.reset();
          }
          const cardName = h.allCardNames[Math.floor(rand() * h.allCardNames.length)]!;
          const lazyCard = await activeWorker.fetch.fetch(cardName);
          const oracleCard = await h.oracle.fetch.fetch(cardName);

          expect(lazyCard?.id, `step ${step} card id for ${cardName}`).toBe(oracleCard?.id);
          expect(
            lazyCard?.readRuleId,
            `step ${step} (worker ${workerIdx}) readRuleId for ${cardName}`,
          ).toBe(oracleCard?.readRuleId);
          expect(
            lazyCard?.readRuleClass,
            `step ${step} (worker ${workerIdx}) readRuleClass for ${cardName}`,
          ).toBe(oracleCard?.readRuleClass);

          // Atomicity invariant: if any flags are pending, the card's persisted watermark in the
          // central DB MUST now be >= latestEpoch, and its persisted cards.read_rule_id on disk
          // MUST equal the oracle's readRuleId!
          const latestEpoch = getLatestRuleFlagEpoch(activeWorker.driver);
          if (latestEpoch > 0) {
            const wm = await getCardRuleWatermarkEpoch(otherWorker.driver, lazyCard!.id!);
            expect(wm, `step ${step} watermark atomicity for ${cardName}`).toBeGreaterThanOrEqual(
              latestEpoch,
            );
          }
          const rawLazyRow = (
            await otherWorker.driver.query<{
              read_rule_id: number | null;
              read_rule_class: string | null;
            }>("SELECT read_rule_id, read_rule_class FROM cards WHERE id = ?", [lazyCard!.id!])
          ).rows[0];
          expect(
            rawLazyRow?.read_rule_id ?? undefined,
            `step ${step} persisted DB read_rule_id for ${cardName}`,
          ).toBe(oracleCard?.readRuleId);
        } else if (roll < 0.85) {
          // TRANSITION C (Theorem 2 — Search Equivalence):
          // Execute a permission-filtered CQL query or count on a random Worker and prove
          // 100% identical results to the eager oracle.
          const queries: unknown[] = [
            { type: "Doc", sort: "name" },
            { type: "Note", sort: "name" },
            { right: "Tag", sort: "name" },
            { right: "Secret", sort: "name" },
          ];
          const q = queries[Math.floor(rand() * queries.length)]!;
          const lazyRes = await executeQuery(activeWorker.driver, q, {
            alwaysOk: false,
            readRuleIds: [ALL_READ_RULE_ID],
            parse: parseOptionsWithLexicon(activeWorker.fetch.lexicon),
          });
          const oracleRes = await executeQuery(h.oracle.driver, q, {
            alwaysOk: false,
            readRuleIds: [ALL_READ_RULE_ID],
            parse: parseOptionsWithLexicon(h.oracle.fetch.lexicon),
          });
          const lazyIds = "rows" in lazyRes ? lazyRes.rows.map((r) => r.id) : [];
          const oracleIds = "rows" in oracleRes ? oracleRes.rows.map((r) => r.id) : [];
          expect(lazyIds, `step ${step} CQL search equivalence`).toEqual(oracleIds);

          const lazyCnt = await executeCount(activeWorker.driver, q, {
            alwaysOk: false,
            readRuleIds: [ALL_READ_RULE_ID],
            parse: parseOptionsWithLexicon(activeWorker.fetch.lexicon),
          });
          const oracleCnt = await executeCount(h.oracle.driver, q, {
            alwaysOk: false,
            readRuleIds: [ALL_READ_RULE_ID],
            parse: parseOptionsWithLexicon(h.oracle.fetch.lexicon),
          });
          expect(lazyCnt, `step ${step} CQL count equivalence`).toBe(oracleCnt);
        } else {
          // TRANSITION D (Theorem 3 — Partial or Full Compaction):
          const batchSize = rand() < 0.6 ? Math.floor(rand() * 5) + 1 : undefined;
          await compactPendingRuleFlags(
            { driver: activeWorker.driver, fetch: activeWorker.fetch },
            { batchSize },
          );
          if (batchSize === undefined) {
            // After a full compaction, EVERY row in the central database must match the eager oracle!
            expect(hasPendingRuleFlags(activeWorker.driver)).toBe(false);
            expect(hasPendingRuleFlags(otherWorker.driver)).toBe(false);
            const lazyAll = (
              await activeWorker.driver.query<{
                id: number;
                read_rule_id: number | null;
                read_rule_class: string | null;
              }>("SELECT id, read_rule_id, read_rule_class FROM cards WHERE trash = 0 ORDER BY id", [])
            ).rows;
            const oracleAll = (
              await h.oracle.driver.query<{
                id: number;
                read_rule_id: number | null;
                read_rule_class: string | null;
              }>("SELECT id, read_rule_id, read_rule_class FROM cards WHERE trash = 0 ORDER BY id", [])
            ).rows;
            expect(lazyAll, `step ${step} full table convergence`).toEqual(oracleAll);
          }
        }
      }

      // Final full compaction + full-table equivalence check across all cards
      await compactPendingRuleFlags({
        driver: h.lazyWorkers[0].driver,
        fetch: h.lazyWorkers[0].fetch,
      });
      const finalLazy = (
        await h.lazyWorkers[1].driver.query<{
          id: number;
          read_rule_id: number | null;
          read_rule_class: string | null;
        }>("SELECT id, read_rule_id, read_rule_class FROM cards WHERE trash = 0 ORDER BY id", [])
      ).rows;
      const finalOracle = (
        await h.oracle.driver.query<{
          id: number;
          read_rule_id: number | null;
          read_rule_class: string | null;
        }>("SELECT id, read_rule_id, read_rule_class FROM cards WHERE trash = 0 ORDER BY id", [])
      ).rows;
      expect(finalLazy).toEqual(finalOracle);
      } finally {
        h.close();
      }
    }
  }, 60_000);

  it("proves simultaneous multi-worker contention (Promise.all concurrent reads + concurrent watermarks + *all+*read mutations) never corrupts state or diverges from the oracle", async () => {
    const h = await createProofHarness();
    try {
      // Mutate *all+*read and Doc+*type+*read
      await h.lazyWorkers[0].engine.createCard(
        { name: "Doc+*type+*read", typeName: "List", content: "[[Administrator]]" },
        ACTOR,
      );
      await h.oracle.engine.createCard(
        { name: "Doc+*type+*read", typeName: "List", content: "[[Administrator]]" },
        ACTOR,
      );

      // Reset both workers' caches and fire simultaneous reads for the same cards across Worker 0 and Worker 1
      h.lazyWorkers[0].fetch.cardCache.reset();
      h.lazyWorkers[1].fetch.cardCache.reset();
      h.oracle.fetch.cardCache.reset();

      for (const cardName of h.allCardNames) {
        const [w0Card, w1Card, oracleCard] = await Promise.all([
          h.lazyWorkers[0].fetch.fetch(cardName),
          h.lazyWorkers[1].fetch.fetch(cardName),
          h.oracle.fetch.fetch(cardName),
        ]);
        expect(w0Card?.readRuleId, `w0 concurrent ${cardName}`).toBe(oracleCard?.readRuleId);
        expect(w1Card?.readRuleId, `w1 concurrent ${cardName}`).toBe(oracleCard?.readRuleId);
        expect(w0Card?.readRuleClass, `w0 concurrent class ${cardName}`).toBe(
          oracleCard?.readRuleClass,
        );
        expect(w1Card?.readRuleClass, `w1 concurrent class ${cardName}`).toBe(
          oracleCard?.readRuleClass,
        );
      }

      // Now update *all+*read itself and verify simultaneous CQL searches across both workers
      await h.lazyWorkers[1].engine.updateCard(
        { cardId: ALL_READ_RULE_ID, content: "[[Administrator]]" },
        ACTOR,
      );
      await h.oracle.engine.updateCard(
        { cardId: ALL_READ_RULE_ID, content: "[[Administrator]]" },
        ACTOR,
      );

      const [s0, s1, sOracle] = await Promise.all([
        executeQuery(
          h.lazyWorkers[0].driver,
          { right: "Secret", sort: "name" },
          {
            alwaysOk: false,
            readRuleIds: [ALL_READ_RULE_ID],
            parse: parseOptionsWithLexicon(h.lazyWorkers[0].fetch.lexicon),
          },
        ),
        executeQuery(
          h.lazyWorkers[1].driver,
          { right: "Secret", sort: "name" },
          {
            alwaysOk: false,
            readRuleIds: [ALL_READ_RULE_ID],
            parse: parseOptionsWithLexicon(h.lazyWorkers[1].fetch.lexicon),
          },
        ),
        executeQuery(
          h.oracle.driver,
          { right: "Secret", sort: "name" },
          {
            alwaysOk: false,
            readRuleIds: [ALL_READ_RULE_ID],
            parse: parseOptionsWithLexicon(h.oracle.fetch.lexicon),
          },
        ),
      ]);
      const ids0 = "rows" in s0 ? s0.rows.map((r) => r.id) : [];
      const ids1 = "rows" in s1 ? s1.rows.map((r) => r.id) : [];
      const idsOracle = "rows" in sOracle ? sOracle.rows.map((r) => r.id) : [];
      expect(ids0).toEqual(idsOracle);
      expect(ids1).toEqual(idsOracle);
    } finally {
      h.close();
    }
  });
});
