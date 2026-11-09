import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LocalSqliteDriver } from "../../../src/server/drivers/local-sqlite.js";
import { FetchEngine } from "../../../src/card/fetch.js";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";
import type { Actor } from "../../../src/card/actions/types.js";
import { buildOneTripClosure, readPageClosure } from "../../../src/card/one-trip/closure-builder.js";
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

async function createOneTripTestDeck() {
  const driver = new LocalSqliteDriver({ path: ":memory:" });
  const ddl = readFileSync(DDL_PATH, "utf8");
  for (const statement of splitSqlStatements(ddl)) {
    if (statement.length === 0) continue;
    await driver.query(statement, []);
  }
  const now = "2026-09-21 00:00:00.000";
  const cards = [
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
  ];
  for (const c of cards) {
    await driver.query(
      `INSERT INTO cards (
         id, name, "key", codename, left_id, right_id, current_revision_id,
         created_at, updated_at, creator_id, updater_id,
         read_rule_class, read_rule_id, references_expired, trash, type_id, db_content
       ) VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?, ?, 1, 1, '*all', ?, NULL, 0, ?, '')`,
      [c.id, c.name, c.key, c.codename, now, now, ALL_READ_RULE_ID, c.type_id],
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
  await driver.query("INSERT INTO sqlite_sequence (name, seq) VALUES ('cards', 200)", []);

  const fetch = new FetchEngine(driver);
  const engine = new CardActionEngine(fetch, { actor: ACTOR, canWrite: () => true });
  return { driver, fetch, engine, close: () => driver.close() };
}

describe("Post-Commit One-Trip Graph Invalidation", () => {
  it("incrementally updates one_trip_edges, resolves dangling edges on create, and invalidates only affected page closures and render plans", async () => {
    const deck = await createOneTripTestDeck();
    try {
      const home = await deck.engine.createCard({
        name: "Home",
        typeId: RICH_TEXT_ID,
        content: "Welcome {{Banner|core}} and {{Future Widget|open}}",
      });
      const banner = await deck.engine.createCard({
        name: "Banner",
        typeId: RICH_TEXT_ID,
        content: "Hero banner",
      });
      const about = await deck.engine.createCard({
        name: "About",
        typeId: RICH_TEXT_ID,
        content: "Standalone about page",
      });

      await buildOneTripClosure({
        corpus: deck.driver,
        side: deck.driver,
        pageNames: ["Home", "About"],
      });

      // Seed synthetic render plan rows for Home and About
      await deck.driver.query(
        "INSERT INTO one_trip_render_plans (page_id, seq, family, sql, params_json) VALUES (?, 0, 'test', 'SELECT 1', '[]')",
        [home.cardId],
      );
      await deck.driver.query(
        "INSERT INTO one_trip_render_plans (page_id, seq, family, sql, params_json) VALUES (?, 0, 'test', 'SELECT 1', '[]')",
        [about.cardId],
      );

      // Verify initial closures exist and Future Widget edge is dangling (referee_id IS NULL)
      expect((await readPageClosure(deck.driver, "Home")).cardIds).toContain(banner.cardId);
      expect((await readPageClosure(deck.driver, "About")).cardIds).toContain(about.cardId);

      const danglingBefore = await deck.driver.query<{ referee_id: number | null }>(
        "SELECT referee_id FROM one_trip_edges WHERE referer_id = ? AND referee_key = 'future_widget'",
        [home.cardId],
      );
      expect(danglingBefore.rows[0]?.referee_id).toBeNull();

      // Now create "Future Widget" via CardActionEngine!
      // Because Home had a dangling edge to future_widget, creating Future Widget should:
      // 1. Resolve Home's dangling edge referee_id -> futureWidget.cardId
      // 2. Invalidate Home's closure and render plan
      // 3. Leave About's closure and render plan untouched!
      const futureWidget = await deck.engine.createCard({
        name: "Future Widget",
        typeId: RICH_TEXT_ID,
        content: "Now live [[Banner]]",
      });

      const resolvedEdge = await deck.driver.query<{ referee_id: number | null }>(
        "SELECT referee_id FROM one_trip_edges WHERE referer_id = ? AND referee_key = 'future_widget'",
        [home.cardId],
      );
      expect(resolvedEdge.rows[0]?.referee_id).toBe(futureWidget.cardId);

      // Outgoing link edge from Future Widget -> Banner was also incrementally added
      const widgetEdges = await deck.driver.query<{ referee_id: number | null; kind: string }>(
        "SELECT referee_id, kind FROM one_trip_edges WHERE referer_id = ? AND referee_key = 'banner'",
        [futureWidget.cardId],
      );
      expect(widgetEdges.rows[0]?.referee_id).toBe(banner.cardId);
      expect(widgetEdges.rows[0]?.kind).toBe("link");

      // Home closure and render plan were invalidated
      expect((await readPageClosure(deck.driver, "Home")).cardIds).toEqual([]);
      const homePlans = await deck.driver.query(
        "SELECT * FROM one_trip_render_plans WHERE page_id = ?",
        [home.cardId],
      );
      expect(homePlans.rows.length).toBe(0);

      // About closure and render plan remain intact!
      expect((await readPageClosure(deck.driver, "About")).cardIds).toContain(about.cardId);
      const aboutPlans = await deck.driver.query(
        "SELECT * FROM one_trip_render_plans WHERE page_id = ?",
        [about.cardId],
      );
      expect(aboutPlans.rows.length).toBe(1);

      // Rebuild closure and test card update + delete invalidation
      await buildOneTripClosure({
        corpus: deck.driver,
        side: deck.driver,
        pageNames: ["Home", "About"],
      });
      expect((await readPageClosure(deck.driver, "Home")).cardIds).toContain(futureWidget.cardId);

      // Deleting Future Widget turns Home's edge back into a dangling edge (referee_id = NULL)
      // and invalidates Home's closure while leaving About intact
      await deck.engine.deleteCard({ cardId: futureWidget.cardId });

      const danglingAfterDelete = await deck.driver.query<{ referee_id: number | null }>(
        "SELECT referee_id FROM one_trip_edges WHERE referer_id = ? AND referee_key = 'future_widget'",
        [home.cardId],
      );
      expect(danglingAfterDelete.rows[0]?.referee_id).toBeNull();
      expect((await readPageClosure(deck.driver, "Home")).cardIds).toEqual([]);
      expect((await readPageClosure(deck.driver, "About")).cardIds).toContain(about.cardId);
    } finally {
      deck.close();
    }
  });

  it("deleting an anchored rule card invalidates only pages matching that rule's anchor set (and not unrelated pages)", async () => {
    const deck = await createOneTripTestDeck();
    try {
      await deck.driver.query(
        `INSERT INTO cards (
           id, name, "key", codename, left_id, right_id, current_revision_id,
           created_at, updated_at, creator_id, updater_id,
           read_rule_class, read_rule_id, references_expired, trash, type_id, db_content
         ) VALUES (20, '*type', '*type', 'type', NULL, NULL, NULL, '2026-09-21 00:00:00.000', '2026-09-21 00:00:00.000', 1, 1, '*all', 17, NULL, 0, 3, '')`,
        [],
      );
      const bookType = await deck.engine.createCard({ name: "Book", typeName: "Cardtype" });
      await deck.engine.createCard({
        name: "Book Page",
        typeId: bookType.cardId,
        content: "A book page",
      });
      const unrelatedPage = await deck.engine.createCard({
        name: "Unrelated Page",
        typeId: RICH_TEXT_ID,
        content: "Rich text page",
      });
      await deck.engine.createCard({ name: "Book+*type", typeName: "Set" });
      const bookRule = await deck.engine.createCard({
        name: "Book+*type+*read",
        typeName: "List",
        content: "[[Anyone]]",
      });

      await buildOneTripClosure({
        corpus: deck.driver,
        side: deck.driver,
        pageNames: ["Book Page", "Unrelated Page"],
      });
      expect((await readPageClosure(deck.driver, "Book Page")).cardIds.length).toBeGreaterThan(0);
      expect((await readPageClosure(deck.driver, "Unrelated Page")).cardIds).toContain(
        unrelatedPage.cardId,
      );

      // Delete the anchored rule card Book+*type+*read
      await deck.engine.deleteCard({ cardId: bookRule.cardId });

      // Book Page closure is invalidated, while Unrelated Page closure remains intact!
      expect((await readPageClosure(deck.driver, "Book Page")).cardIds).toEqual([]);
      expect((await readPageClosure(deck.driver, "Unrelated Page")).cardIds).toContain(
        unrelatedPage.cardId,
      );
    } finally {
      deck.close();
    }
  });
});
