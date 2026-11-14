// person-page-plus-projects-participating-corpus-replay.test.ts -- the
// screenshot-comparison lane's person-page parity defect, replayed against
// the Ruby yardstick on the machine-local raw corpus.
//
// DEFECT (2026-10-03, lane-p2-person-section): on the deployed edge, the
// person page /Riley_Ellery is missing the whole "+Project(s)
// Participating" section (171px shorter than live; screenshot lane
// deliverables/screenshot-proof/crop-person-bottom-{live,edge}.png). The
// junction row (id 419) is TRASHED with empty RichText content in the corpus
// deck, but Ruby still renders the section: the junction resolves as a
// VIRTUAL card through the depth-3 structure rule
//   ((Person + Project(s) Participating) + *type plus right) + *structure
//   (rule id 422, type Search/id 30, content
//   {"type":"project","plus":["Participant(s)",{"refer_to":"_left"}]})
// -- the ported chain is src/card/fetch/virtual-cards.ts (states.rb:44-50
// virtual?, templating.rb:40-48 structure, type.rb:78-80
// type_id_from_template). The Ruby yardstick
// (tmp/raw-ground-truth/expected-v2/page-lane, name "Riley Ellery")
// renders the titled slot with data-card-type-name="Search" and the search
// rows mythosynth + NXDD.
//
// RUN (machine-local raw corpus; one whole-deck seed, several minutes):
//   P2_PERSON_REPLAY=1 NODE_OPTIONS=--max-old-space-size=4096 \
//   npx vitest run tests/card/render/person-page-plus-projects-participating-corpus-replay.test.ts \
//     --no-file-parallelism
//
// P2_PERSON_PROBE=1 instead writes tmp/p2-person-section/ts-page.html +
// expected-region.txt diagnostics and skips the hard assertions.
// Outside a corpus machine (no raw deck) both blocks skip.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { RAW_CORPUS_DB, createRawStructureSeededStorage } from "./raw-corpus-seeding.js";
import { skipLoud } from "../../support/describe-with-corpus.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..");
const OUT_DIR = path.join(REPO_ROOT, "tmp", "p2-person-section");

const REPLAY_REQUESTED = process.env.P2_PERSON_REPLAY === "1";
const PROBE_REQUESTED = process.env.P2_PERSON_PROBE === "1";
const CORPUS_PRESENT = existsSync(RAW_CORPUS_DB);

const PERSON_PAGE_NAME = "Riley Ellery";

/** The titled-search slot markers the Ruby yardstick carries for the
 *  "+Project(s) Participating" nest (expected-v2 page-lane verified). */
const SECTION_MARKERS = {
  slotClass: "TYPE_PLUS_RIGHT-person-project_s_participating",
  typeName: 'data-card-type-name="Search"',
  nestName: "&quot;nest_name&quot;:&quot;+Project(s) Participating&quot;",
};

/** The search-result rows the structured search renders on the yardstick
 *  (Project cards whose Participant(s) junction refers to the person). */
const RESULT_ROW_CARDS = ["mythosynth", "NXDD"];

async function seedRawCorpusStorage() {
  const idLister = new Database(RAW_CORPUS_DB, { readonly: true });
  const everyLiveId = (
    idLister.prepare("SELECT id FROM cards WHERE trash = 0 ORDER BY id").all() as Array<{
      id: number;
    }>
  ).map((r) => r.id);
  idLister.close();
  const storage = await createRawStructureSeededStorage(new Set(everyLiveId));
  storage.fetcher.installNameEnvironment();
  await storage.fetcher.warmLexicon(everyLiveId);
  return storage;
}

describe("person page +Project(s) Participating structured search (corpus replay)", () => {
  it(
    "renders the trashed junction as the virtual titled Search section the Ruby yardstick renders",
    { timeout: 3_600_000 },
    async (ctx) => {
      if (!REPLAY_REQUESTED && !PROBE_REQUESTED) {
        skipLoud(ctx, "tests/card/render/person-page-plus-projects-participating-corpus-replay.test.ts", "not (!REPLAY_REQUESTED && !PROBE_REQUESTED)");
        return;
      }
      expect(CORPUS_PRESENT, `raw corpus missing: ${RAW_CORPUS_DB}`).toBe(true);

      const storage = await seedRawCorpusStorage();
      const actual = await storage.engine.renderPage(PERSON_PAGE_NAME);

      if (PROBE_REQUESTED) {
        mkdirSync(OUT_DIR, { recursive: true });
        writeFileSync(path.join(OUT_DIR, "ts-page.html"), actual, "utf8");
        const i = actual.indexOf("Project(s) Organizing");
        writeFileSync(
          path.join(OUT_DIR, "ts-region-after-organizing.txt"),
          i === -1 ? "(no Organizing marker)" : actual.slice(i, i + 4000),
          "utf8",
        );
      }

      expect(actual).toContain(SECTION_MARKERS.slotClass);
      expect(actual).toContain(SECTION_MARKERS.typeName);
      expect(actual).toContain(SECTION_MARKERS.nestName);
      for (const row of RESULT_ROW_CARDS) {
        expect(actual).toContain(row);
      }
    },
  );
});
