// The acceptance's compound-masthead rows: an orphan junction (name+key
// stored, left_id/right_id NULL) fetched through the serving boot renders its
// REQUESTED name, not the canonical key string.
//
// Recorded defect (deployed edge + tip bundle, workerd): /Growth_Circle+Associations
// rendered <title>growth_circle+association - Example Site</title> and a masthead
// keyed "growth_circle+association" where the oracle (body
// 0ab20bb1cea138bf0d72545f, 403, 13,377 B) renders "Growth Circle+Associations"
// in both. Two seams, both Ruby-cited:
//
// 1. THE REQUEST MARK DECODES. card_class.rb:126-131 uri_fetch_opts:
//    `opts[:name] ||= Name[params[:mark]]&.tr "_", " "` — the controller's
//    card load (rest.rb:49 load_card -> Card.uri_fetch) decodes the URL mark
//    before the fetch, so the absent card's placeholder (fetch/store.rb:21-28
//    new_for_cache `Card.new name: mark`) carries the SPACED name. The
//    serving surfaces now decode in decodeName
//    (src/server/worker-shared-surface.ts + its two local copies).
//
// 2. THE PAGE'S OWN RECORD NAMES THE SEAT. The prepare wave seeds absent
//    placeholders through key-form fetches (fetchByKey / fetchByName(key)),
//    so the renderCards seat under the page's key can carry the canonical key
//    STRING as its name. Ruby never fetches by key strings internally, so its
//    seat always carries a real mark. render.ts (the preparedRoot seam) now
//    re-names an id-less NEW seat to the request's own record name — same
//    key, so every key-addressed verdict/rule seat stays valid.
//
// Red evidence (pre-fix): the serving-boot bisect rendered the key-form title
// for BOTH name forms (tmp bisect captures, title
// "growth_circle+association - Example Site", 13,136 B); the bundle run recorded
// the same for /Growth_Circle+Associations (13,759 B, slot-masked identical to
// the deployed edge's sweep body).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LocalSqliteDriver } from "../../../src/server/drivers/local-sqlite.js";
import { bootCorpusDeckEngines } from "../../../deploy/bunny-worker-src/bunny-edge-deck-boot.js";
import { decodeName } from "../../../src/server/worker-shared-surface.js";
import { splitSqlStatements } from "./render-test-storage.js";

const REPO_ROOT = new URL("../../..", import.meta.url);

async function seedOrphanJunctionDeck(): Promise<LocalSqliteDriver> {
  const driver = new LocalSqliteDriver({ path: ":memory:" });
  const ddl = readFileSync(new URL("db/schema.sqlite.sql", REPO_ROOT), "utf8");
  for (const statement of splitSqlStatements(ddl)) await driver.query(statement, []);
  // The pattern/setting cards the universe walk and the rule seed need.
  const simple = async (id: number, name: string, key: string, typeId = 3) =>
    driver.query(
      "INSERT INTO cards (id, name, key, trash, type_id, db_content, created_at, updated_at, creator_id, updater_id) VALUES (?, ?, ?, 0, ?, NULL, '2026-01-01 00:00:00', '2026-01-01 00:00:00', 1, 1)",
      [id, name, key, typeId],
    );
  await simple(100, "*right", "*right");
  await simple(101, "*structure", "*structure");
  await simple(102, "*all", "*all");
  await simple(103, "*read", "*read");
  await simple(104, "*layout", "*layout");
  await simple(50, "HTML", "html");
  // the layout card's type carries the html codename so the card-layout
  // check (page.ts resolvePageLayout) accepts it
  await driver.query("UPDATE cards SET codename = 'html' WHERE id = 50", []);
  await simple(9001, "Growth Circle", "growth_circle");
  await simple(9002, "Associations", "association");
  // The structure rule the orphan junction's virtual resolution matches: the
  // corpus's rule 869 shape — set card "Associations+*right" (junction,
  // name/key NULL) holding "<p>{{+tag}}</p>" under *structure. Deliberately
  // the SPECIFIC right-set, not "*all plus": a broad *structure rule would
  // virtualize the *layout walk's own rule candidates and break rule lookup.
  await driver.query(
    "INSERT INTO cards (id, name, key, left_id, right_id, trash, type_id, created_at, updated_at, creator_id, updater_id) VALUES (9004, NULL, NULL, 9002, 100, 0, 3, '2026-01-01 00:00:00', '2026-01-01 00:00:00', 1, 1)",
    [],
  );
  await driver.query(
    "INSERT INTO cards (id, name, key, left_id, right_id, trash, type_id, db_content, created_at, updated_at, creator_id, updater_id) VALUES (9005, NULL, NULL, 9004, 101, 0, 3, '<p>template body</p>', '2026-01-01 00:00:00', '2026-01-01 00:00:00', 1, 1)",
    [],
  );
  // *all+*read = "Anyone" (the deck rule of record, rule card 6568's shape).
  await driver.query(
    "INSERT INTO cards (id, name, key, left_id, right_id, trash, type_id, db_content, created_at, updated_at, creator_id, updater_id) VALUES (9006, NULL, NULL, 102, 103, 0, 3, 'Anyone', '2026-01-01 00:00:00', '2026-01-01 00:00:00', 1, 1)",
    [],
  );
  // *all+*layout = "Default Layout" + the layout card itself (the deck's
  // rule 275 / Default Layout card shape) so the page shell resolves.
  await driver.query(
    "INSERT INTO cards (id, name, key, left_id, right_id, trash, type_id, db_content, created_at, updated_at, creator_id, updater_id) VALUES (9007, NULL, NULL, 102, 104, 0, 3, 'Default Layout', '2026-01-01 00:00:00', '2026-01-01 00:00:00', 1, 1)",
    [],
  );
  await simple(9008, "Default Layout", "default_layout", 50);
  await driver.query(
    "UPDATE cards SET db_content = '{{_main}}' WHERE id = 9008",
    [],
  );
  // The orphan junction itself (the corpus's 3270 shape).
  await driver.query(
    "INSERT INTO cards (id, name, key, left_id, right_id, trash, type_id, db_content, read_rule_class, read_rule_id, created_at, updated_at, creator_id, updater_id) VALUES (9003, 'Growth Circle+Associations', 'growth_circle+association', NULL, NULL, 0, 3, '<p>template body</p>', '*all', 9006, '2026-01-01 00:00:00', '2026-01-01 00:00:00', 1, 1)",
    [],
  );
  return driver;
}

describe("absent-junction masthead renders the requested name", () => {
  it("decodes the URI mark per uri_fetch_opts", () => {
    expect(decodeName("Growth_Circle%2BAssociations")).toBe("Growth Circle+Associations");
    expect(decodeName("Growth_Circle+Associations")).toBe("Growth Circle+Associations");
    // the joint survives (the '%' decode must not eat it)
    expect(decodeName("Home")).toBe("Home");
  });

  it("renders the underscored URL's page with the spaced requested name", { timeout: 120_000 }, async () => {
    const driver = await seedOrphanJunctionDeck();
    try {
      const deck = await bootCorpusDeckEngines(driver);
      // the worker surface decodes the URI mark before the fetch
      // (decodeName is what parsePath hands renderPage)
      const page = await deck.render.renderPage(decodeName("Growth_Circle+Associations") as string);
      const title = (page.match(/<title>([^<]*)/) ?? ["", ""])[1];
      expect(title).toBe("Growth Circle+Associations");
      // the bare fixture renders the code-default layout (no card-header h1);
      // the denial slot still carries the url-key form of the requested name
      // data-card-name keeps Ruby's url_key form for an id-less compound
      // (format.ts: card.id === undefined && isCompound -> name.urlKey).
      expect(page.includes('data-card-name="Growth_Circle+Associations"')).toBe(true);
      expect(page.includes("growth_circle+association")).toBe(false);
    } finally {
      driver.close();
    }
  });
});
