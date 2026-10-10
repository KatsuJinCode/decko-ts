// bunny-edge-person-participating-virtual-section.test.ts -- the screenshot
// lane's person-page parity defect pinned through the REAL production boot.
//
// DEFECT (2026-10-03, lane-p2-person-section): on the deployed edge
// (decko-edge-wm2um.bunny.run), the person page /Brandon_WilliamsCraig is
// missing the whole "+Project(s) Participating" section live renders (the
// 171px height delta; deliverables/screenshot-proof/crop-person-bottom-
// {live,edge}.png in brandonDojoTech). The junction row is TRASHED in the
// deck (corpus row 419: trash=1, RichText, empty), and the section is a
// VIRTUAL card: the depth-3 structure rule
//   ((Person + Project(s) Participating) + *type plus right) + *structure
//   (rule 422, type Search/id 30,
//    content {"type":"project","plus":["Participant(s)",{"refer_to":"_left"}]})
// makes every Person's "+Project(s) Participating" junction a live searcher
// over Project cards whose Participant(s) junction refers to the person
// (mythosynth + NXDD on the Ruby yardstick, expected-v2 page-lane).
// Ruby renders it; the edge must too.
//
// The boot under test is deploy/bunny-worker-src/bunny-edge-deck-boot.ts
// bootCorpusDeckEngines -- the EXACT function the entry's bootDeck runs --
// driven here over an in-process sqlite deck shaped like the corpus:
// person card + type-structure rule (the 416 shape) nesting the Organizing
// junction (REAL row, the control that renders on both sides of the
// screenshot) and the Participating nest (NO row -- the virtual case), the
// type-plus-right set junctions, the Search rule, one Project card with a
// Participant(s) junction and its card_references row.
//
// The deck is seeded through RAW SQL on the driver and the boot runs FIRST
// in the process (no prior FetchEngine): the production entry constructs
// the deck engine before anything else, so its engine owns the
// process-global name environment -- a prior test-storage engine here would
// leave the boot's renders parsing codename marks against a cold foreign
// registry (CodenameNotFoundError 500s) and confound the RED.
//
// The seed runs under the DECK inflections (applyDeckInflections before the
// rows are written) -- the same order a Rails deck boot has, and the reason
// the stored keys here match the corpus ("participant_s", not the default
// inflector's "participant_").
//
// RED at the bare boot (engines only): the virtual junction is unknown, the
// nest renders the missing-child arm, the section is absent. GREEN once the
// boot wires the inflection table + the virtual-card universe hook
// (FetchEngine.virtualCardLookup -- "wired by the storage factory, not by
// FetchEngine itself", src/card/fetch/virtual-cards.ts).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { handleEngineRequest } from "../../deploy/bunny-worker-src/bunny-edge-engine-request.js";
import { bootCorpusDeckEngines } from "../../deploy/bunny-worker-src/bunny-edge-deck-boot.js";
import { splitSqlStatements } from "../card/render/render-test-storage.js";
import { LocalSqliteDriver } from "../../src/server/drivers/local-sqlite.js";
import { DeckoName } from "../../src/card/name.js";
import { applyDeckInflections } from "../../src/card/name/inflect.js";
import { ORACLE_DECK_INFLECTIONS } from "../../src/card/name/oracle-deck-inflections.js";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

function edgeGet(pathname: string): Request {
  return new Request(`https://script-placeholder.bunny.run${pathname}`);
}

interface SeedRow {
  id: number;
  name?: string;
  codename?: string;
  leftId?: number;
  rightId?: number;
  typeId: number;
  dbContent?: string;
}

/** One cards INSERT -- the same columns and defaults the render-test
 *  storage's seedCard writes (created/updated stamp, creator/updater 1,
 *  no read-rule state: anonymous reads by the default rule). Junction rows
 *  carry NULL name/key and ride left_id/right_id (the 2020 Lexicon
 *  convention). */
async function seedCards(driver: LocalSqliteDriver, rows: SeedRow[]): Promise<void> {
  for (const row of rows) {
    const hasName = typeof row.name === "string" && row.name.length > 0;
    const nameColumn = hasName && row.name!.includes("+") ? null : (row.name ?? null);
    const keyColumn = hasName ? DeckoName.parse(row.name!).key : null;
    await driver.query(
      `INSERT INTO cards
         (id, name, key, codename, left_id, right_id, current_revision_id,
          created_at, updated_at, creator_id, updater_id, read_rule_class,
          read_rule_id, references_expired, trash, type_id, db_content)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id,
        nameColumn,
        keyColumn,
        row.codename ?? null,
        row.leftId ?? null,
        row.rightId ?? null,
        null,
        "2026-09-19 00:00:00.000",
        "2026-09-19 00:00:00.000",
        1,
        1,
        null,
        null,
        null,
        0,
        row.typeId,
        row.dbContent ?? null,
      ],
    );
  }
}

/** The corpus-shaped deck: the page-shell substrate every edge test seeds
 *  (same ids as tests/deploy/bunny-edge-engine-request-error-mapping.test.ts
 *  so the shapes agree across files), plus the person-page shape. */
function personPageDeckRows(): SeedRow[] {
  return [
    // -- page-shell substrate (verbatim shapes from the error-mapping suite)
    { id: 8, name: "csvqdo", codename: "anyone", typeId: 2 },
    { id: 15, name: "tkmbewlur", codename: "anonymous", typeId: 2 },
    { id: 55, name: "*title", codename: "title", typeId: 52, dbContent: "Test Site" },
    { id: 103, name: "*favicon", codename: "favicon", typeId: 19, dbContent: "(my_bucket)/103/3649.jpg" },
    { id: 400, name: "*ace", codename: "ace", typeId: 52, dbContent: "{}" },
    { id: 401, name: "*tiny_mce", codename: "tiny_mce", typeId: 52, dbContent: "{}" },
    { id: 50, name: "Html", codename: "html", typeId: 5 },
    { id: 2, name: "Basic", codename: "basic", typeId: 5 },
    { id: 600, name: "*all", codename: "all", typeId: 52 },
    { id: 601, name: "*layout", codename: "layout", typeId: 52 },
    // The Default Layout nests {{:header|core}} / {{:footer|content}} --
    // codename marks, so the *header / *footer codename cards must exist.
    { id: 9001, name: "*header", codename: "header", typeId: 52, dbContent: "" },
    { id: 9002, name: "*footer", codename: "footer", typeId: 52, dbContent: "" },
    { id: 22746, name: "*all+*layout", leftId: 600, rightId: 601, typeId: 52, dbContent: "Default Layout" },
    { id: 22747, name: "Default Layout", typeId: 50, dbContent: `<body class="d-flex flex-column h-100">\n  <header>{{:header|core}}</header>\n  <article class="container flex-shrink-0" role="main">{{_main|titled}}</article>\n  <footer class="footer mt-auto py-3">{{:footer|content}}</footer>\n</body>` },

    // -- cardtypes the shape names
    { id: 5, name: "Cardtype", codename: "cardtype", typeId: 5 },
    { id: 3, name: "RichText", codename: "rich_text", typeId: 5 },
    { id: 47, name: "List", codename: "list", typeId: 5 },
    { id: 30, name: "Search", codename: "search_type", typeId: 5 },
    { id: 4, name: "Person", typeId: 5 },
    { id: 398, name: "Project", typeId: 5 },

    // -- settings the structure + universe machinery walks
    { id: 266, name: "*type", codename: "type", typeId: 52 },
    { id: 262, name: "*type plus right", codename: "type_plus_right", typeId: 2 },
    { id: 317, name: "*structure", codename: "structure", typeId: 52 },

    // -- the Person type structure (rule 416 shape): two titled nests; the
    //    first junction has a REAL row (control), the second does not (the
    //    virtual case -- the corpus row 419 is trashed, so a trash=0 deck
    //    holds nothing for it).
    { id: 294, leftId: 4, rightId: 266, typeId: 52 },
    {
      id: 416,
      leftId: 294,
      rightId: 317,
      typeId: 3,
      dbContent: "<p>{{+Project(s) Organizing|titled}}</p>\n<p>{{+Project(s) Participating|titled}}</p>",
    },

    // -- the person card and its REAL child junction (the control)
    { id: 393, name: "Brandon WilliamsCraig", typeId: 4, dbContent: "<p>And here we are.</p>" },
    { id: 1638, name: "Project(s) Organizing", typeId: 2 },
    { id: 1743, leftId: 393, rightId: 1638, typeId: 47, dbContent: "Guardians of Peace" },

    // -- the virtual Participating junction: set chain + Search rule, NO row
    //    for "Brandon WilliamsCraig+Project(s) Participating" itself
    { id: 418, name: "Project(s) Participating", typeId: 2 },
    { id: 420, leftId: 4, rightId: 418, typeId: 52 },
    { id: 421, leftId: 420, rightId: 262, typeId: 52 },
    {
      id: 422,
      leftId: 421,
      rightId: 317,
      typeId: 30,
      dbContent: "{\"type\":\"project\",\n\"plus\":[\"Participant(s)\", {\"refer_to\":\"_left\"}]\n}\n",
    },

    // -- the search's data side: one Project card whose Participant(s)
    //    junction refers to the person (the mythosynth row of the
    //    Ruby yardstick)
    { id: 685, name: "mythosynth", typeId: 398, dbContent: "<p>mythosynth body</p>" },
    { id: 406, name: "Participant(s)", typeId: 2 },
    { id: 690, leftId: 685, rightId: 406, typeId: 47, dbContent: "Brandon WilliamsCraig" },
  ];
}

describe("bunny edge boot renders the person page's virtual +Project(s) Participating section", () => {
  it(
    "boots the corpus deck engines and renders the structured search section",
    { timeout: 120_000 },
    async () => {
      // Deck-boot order: inflections BEFORE any deck row is written (the
      // Rails-initializer moment) so the stored keys match the corpus.
      applyDeckInflections(ORACLE_DECK_INFLECTIONS);

      const driver = new LocalSqliteDriver({ path: ":memory:" });
      const ddl = readFileSync(path.join(REPO_ROOT, "db", "schema.sqlite.sql"), "utf8");
      for (const statement of splitSqlStatements(ddl)) {
        await driver.query(statement, []);
      }
      await seedCards(driver, personPageDeckRows());
      // The reference graph the CQL plus-join reads: the mythosynth
      // Participant(s) junction (referer 690) refers to the person (393) --
      // the row shape the corpus carries (ref_type "L", referee_key the
      // composed key).
      await driver.query(
        `INSERT INTO card_references (referer_id, referee_key, referee_id, ref_type, is_present)
         VALUES (?, ?, ?, ?, NULL)`,
        [690, "brandon_william_craig", 393, "L"],
      );

      // The REAL production boot (the entry's bootDeck delegates here);
      // first engine in the process, exactly like the entry.
      const deck = await bootCorpusDeckEngines(driver);
      const response = await handleEngineRequest(
        edgeGet("/Brandon_WilliamsCraig"),
        deck,
      );
      expect(response.status).toBe(200);
      const html = await response.text();

      // The CONTROL: the real-junction section renders (both sides of the
      // screenshot carry it -- this keeps the pin honest when the page
      // otherwise renders).
      expect(html).toContain("project_s_organizing-titled-view");
      expect(html).toContain("Guardians of Peace");

      // THE SECTION: the virtual junction renders as the structured
      // titled Search slot the Ruby yardstick carries (expected-v2
      // page-lane, name "Brandon WilliamsCraig").
      expect(html).toContain("TYPE_PLUS_RIGHT-person-project_s_participating");
      expect(html).toContain('data-card-type-name="Search"');
      expect(html).toContain("brandon_william_craig-project_s_participating-titled-view");
      // ... and the search finds the referring project (the CQL runs with
      // the junction's own name context, _left -> the person).
      expect(html).toContain("mythosynth");
    },
  );
});
