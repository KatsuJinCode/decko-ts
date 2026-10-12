// Regression: a junction's :create verdict judged the LEFT card's :update
// rule against the create task's party map and denied.
//
// The deck grants junction creates to "*all plus+*create" = "_left"
// (permissions.rb:55-71): the verdict recurses to the left card, and because
// the left exists, its :create is judged as :update (permissions.rb:69) —
// the applicable rule is the LEFT's *all+*update rule. Ruby asks that rule
// card for its item ids regardless of which task the verdict came from; the
// port looked the inherited rule id up in the CREATE party map, found
// nothing, and denied (who_can -> [] -> among? -> false). A member the
// update rule allows ("Anyone Signed In") could not create a junction.
//
// Found as a real denial through the public host before the fix: the
// deck's rule shape — *all plus+*create = "_left", *all+*update = "Anyone
// Signed In" — denied a signed-in member's junction create, and this test
// reproduced it.
import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, expect, it } from "vitest";
import { describeOrSkipLoud } from "../support/describe-with-corpus.js";
import { LocalSqliteDriver } from "../../src/server/drivers/local-sqlite.js";
import { FetchEngine } from "../../src/card/fetch.js";
import { CardActionEngine } from "../../src/card/actions/card-action-engine.js";
import { DeckoName } from "../../src/card/name.js";
import {
  structureRuleUniverseStatement,
  structureUniverseFromResults,
  structureRuleTypesFromResults,
} from "../../src/card/rules/structure.js";
import { createVirtualCardLookup } from "../../src/card/fetch/virtual-cards.js";
import { servingModEventRuntime } from "../../src/server/write-routes.js";
import { LocalAttachmentStore } from "../../src/card/attachments/attachment-store.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = process.env.EDITING_DECK ?? path.join(REPO, "tmp/editing-oracle/oracle-deck.sqlite3");
const DIR = path.join(REPO, "tmp/persist");
const DECK = path.join(DIR, "junction-left-inheritance.sqlite3");
const FILES = path.join(DIR, "junction-left-inheritance-files");
const NOW = () => new Date("2026-10-08T15:00:00.000Z");
const keyOf = (name: string): string => name.toLowerCase().replace(/\s+/g, "_");

const HAVE_DECK = existsSync(SRC);

async function boot(dbPath: string, actor: { id: number; name: string }) {
  const driver = new LocalSqliteDriver({ path: dbPath, readonly: false });
  const fetcher = new FetchEngine(driver);
  const { rows } = await driver.query("SELECT id, name, left_id, right_id FROM cards", []);
  const byId = new Map<number, Record<string, unknown>>();
  for (const row of rows as Record<string, unknown>[]) byId.set(Number(row.id), row);
  const memo = new Map<number, string | undefined>();
  const composed = (id: number): string | undefined => {
    const known = memo.get(id);
    if (known !== undefined || memo.has(id)) return known;
    const row = byId.get(id);
    if (row === undefined) return undefined;
    let name: string | undefined;
    if (row.left_id === null && typeof row.name === "string" && row.name !== "") {
      name = row.name;
    } else if (row.left_id !== null) {
      const left = composed(Number(row.left_id));
      const right = composed(Number(row.right_id));
      name = left === undefined || right === undefined ? undefined : `${left}+${right}`;
    }
    memo.set(id, name);
    return name;
  };
  fetcher.installNameEnvironment();
  for (const [id, row] of byId) {
    const name = composed(id);
    if (name === undefined) continue;
    fetcher.lexicon.write(
      id,
      DeckoName.parse(name),
      row.left_id === null ? String(row.name) : [Number(row.left_id), Number(row.right_id)],
    );
  }
  const [universe] = await driver.batch([structureRuleUniverseStatement()]);
  fetcher.virtualCardLookup = createVirtualCardLookup(fetcher, {
    contents: structureUniverseFromResults(universe),
    ruleTypeIds: structureRuleTypesFromResults(universe),
  });
  const engine = new CardActionEngine(fetcher, {
    actor,
    ipAddress: null,
    now: NOW,
    modEvents: await servingModEventRuntime(),
    attachmentStore: new LocalAttachmentStore(FILES),
  });
  return { driver, engine };
}

describeOrSkipLoud(
  !HAVE_DECK,
  "tests/tools/junction-create-left-inheritance.test.ts",
  `the private editing-oracle deck is present at ${SRC} (set EDITING_DECK) — the staging-lane finding this suite pins is reproduced on that oracle deck, which a clean checkout does not carry`,
)(
  "junction create inherits the left card's update rule across tasks (staging lane finding)",
  () => {
    let driver: LocalSqliteDriver;
    let engine: CardActionEngine;
    let ownerId = 0;

    beforeAll(async () => {
      mkdirSync(DIR, { recursive: true });
      rmSync(DECK, { force: true });
      rmSync(DECK + "-shm", { force: true });
      rmSync(DECK + "-wal", { force: true });
      copyFileSync(SRC, DECK);
      driver = new LocalSqliteDriver({ path: DECK, readonly: false });
      const q1 = async (sql: string, params: (string | number)[] = []): Promise<Record<string, unknown>> => {
        const { rows } = await driver.query(sql, params);
        return (rows as Record<string, unknown>[])[0] ?? {};
      };
      const run = async (sql: string, params: (string | number | null)[] = []) => driver.batch([{ sql, params }]);
      const idByKey = async (code: string): Promise<number> =>
        Number((await q1("SELECT id FROM cards WHERE (codename = ? OR key = ?) AND trash = 0 ORDER BY (codename = ?) DESC, id LIMIT 1", [code, code, code])).id);
      const idByName = async (name: string): Promise<number> =>
        Number((await q1("SELECT id FROM cards WHERE key = ? AND trash = 0 LIMIT 1", [keyOf(name)])).id);

      // A test account the way first-run setup builds one, joined to the
      // deck's pre-existing member list (the deck's own roles), so the
      // deck's own rules govern the probe's permissions.
      const userId = await idByKey("person");
      const emailId = await idByKey("email");
      const saltId = await idByKey("salt");
      const statusId = await idByKey("status");
      const passwordId = await idByKey("password");
      const accountId = await idByKey("account");
      const sessionId = await idByKey("session");
      const ins = async (name: string, typeId: number, content: string | null) =>
        run(
          `INSERT INTO cards (name, key, type_id, db_content, trash, creator_id, updater_id, created_at, updated_at) VALUES (?, ?, ?, ?, 0, 1, 1, '2026-10-08 15:00:00', '2026-10-08 15:00:00')`,
          [name, keyOf(name), typeId, content],
        );
      await ins("Editing Probe", userId, null);
      ownerId = await idByName("Editing Probe");
      await ins("Editing Probe+*account", sessionId, null);
      const junctionId = await idByName("Editing Probe+*account");
      await ins("Editing Probe+*account+*email", emailId, "editing.probe@example.com");
      await ins("Editing Probe+*account+*salt", saltId, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
      await ins("Editing Probe+*account+*status", statusId, "active");
      await ins("Editing Probe+*account+*password", passwordId, "pbkdf2_sha256$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=");
      await run(`UPDATE cards SET left_id = ?, right_id = ? WHERE id = ?`, [ownerId, accountId, junctionId]);
      for (const field of ["email", "salt", "status", "password"] as const) {
        const fid = await idByName(`Editing Probe+*account+*${field}`);
        const cid = await idByKey(field);
        await run(`UPDATE cards SET left_id = ?, right_id = ? WHERE id = ?`, [junctionId, cid, fid]);
      }
      const sharkList = await q1("SELECT id FROM cards WHERE left_id = (SELECT id FROM cards WHERE key = 'shark' AND trash = 0) AND right_id = (SELECT id FROM cards WHERE codename = 'members' AND trash = 0) LIMIT 1");
      expect(sharkList.id).toBeDefined();
      await run(`INSERT INTO card_references (referer_id, referee_key, referee_id, ref_type, is_present) VALUES (?, NULL, ?, 'L', NULL)`, [Number(sharkList.id), ownerId]);

      const booted = await boot(DECK, { id: ownerId, name: "Editing Probe" });
      driver = booted.driver;
      engine = booted.engine;
    }, 120_000);

    afterAll(() => {
      rmSync(FILES, { recursive: true, force: true });
    });

    it("creates a simple card", async () => {
      const saved = await engine.createCard({ name: "Editing Probe Card", content: "alpha" });
      expect(saved.cardId).toBeGreaterThan(0);
    });

    it("creates a junction through the left's _left create rule", async () => {
      // *all plus+*create = "_left": the verdict recurses to the left
      // ("Editing Probe Card", which exists), whose :create is judged as
      // :update and resolves to *all+*update = "Anyone Signed In". The
      // member the update rule allows must be able to create the junction.
      const saved = await engine.createCard({
        name: "Editing Probe Card+Subcard",
        content: "beta",
      });
      expect(saved.cardId).toBeGreaterThan(0);
    });
  },
);
