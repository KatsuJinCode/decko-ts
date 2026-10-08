// bunny-edge-person-participating-real-deck-replay.test.ts -- the mission
// proof on the REAL production deck: the deployed edge's own boot
// (bootCorpusDeckEngines) over the trial-deck mirror (the db the staging
// bundle ships, db_content schema), rendering /Brandon_WilliamsCraig
// through handleEngineRequest, checked against the RUBY yardstick
// (expected-v2 page-lane, the verbatim oracle capture rendered from this
// corpus).
//
// p2-person-section lane (2026-10-03). The synthetic pin
// (bunny-edge-person-participating-virtual-section.test.ts) proves the boot
// mechanism; THIS block proves it on the 47k-card production deck where the
// defect was found: junction 419 trashed, rule 422 alive, section rendered.
//
// Byte bar: the section's slot + rows must exist verbatim; the FULL-page
// byteDiff against the yardstick is REPORTED (evidence line) but not
// hard-asserted equal -- Brandon's page carries the corpus' known
// link-query-dropped class (focal-denial-page-corpus-replay.test.ts header:
// the wanted-card href loses its ?card[name]= query, a graded-corpus
// divergence family outside this lane's contract).
//
// RUN (machine-local mirror + shard; one whole-deck boot, ~1-2 min):
//   P2_PERSON_REALDECK=1 NODE_OPTIONS=--max-old-space-size=4096 \
//   npx vitest run tests/deploy/bunny-edge-person-participating-real-deck-replay.test.ts \
//     --no-file-parallelism
//
// Outside a machine with the mirror + shard (paths below, both
// lane-provisioned copies), the block skips.

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import readline from "node:readline";
import { describe, expect, it } from "vitest";

import { handleEngineRequest } from "../../deploy/bunny-worker-src/bunny-edge-engine-request.js";
import { bootCorpusDeckEngines } from "../../deploy/bunny-worker-src/bunny-edge-deck-boot.js";
import { LocalSqliteDriver } from "../../src/server/drivers/local-sqlite.js";
import { byteDiff, normalizeSlotIds } from "../../src/testing/diff.js";
import { skipLoud } from "../support/describe-with-corpus.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");
const MIRROR_DB = path.join(
  REPO_ROOT, "tmp", "p2-person-section", "corpus-mirror.sqlite3",
);
const YARDSTICK_SHARD = path.join(
  REPO_ROOT, "tmp", "raw-ground-truth", "expected-v2", "page-lane",
  "recapture-raw-shard-000000.jsonl",
);

const REALDECK_REQUESTED = process.env.P2_PERSON_REALDECK === "1";
const MIRROR_PRESENT = existsSync(MIRROR_DB);
const SHARD_PRESENT = existsSync(YARDSTICK_SHARD);

const PERSON_PAGE_NAME = "Brandon WilliamsCraig";

/** The titled-search slot markers the Ruby yardstick carries for the
 *  "+Project(s) Participating" nest. */
const SECTION_MARKERS = {
  slotClass: "TYPE_PLUS_RIGHT-person-project_s_participating",
  typeName: 'data-card-type-name="Search"',
  slotId: "brandon_morgan-project_s_participating-titled-view",
};

interface PageLaneLine {
  lane: string;
  name: string;
  page_html?: string;
}

async function loadYardstick(): Promise<string | undefined> {
  const { createReadStream } = await import("node:fs");
  const lines = readline.createInterface({
    input: createReadStream(YARDSTICK_SHARD, "utf8"),
  });
  let found: string | undefined;
  for await (const line of lines) {
    if (line.trim() === "" || !line.includes(PERSON_PAGE_NAME)) continue;
    let obj: PageLaneLine;
    try {
      obj = JSON.parse(line) as PageLaneLine;
    } catch {
      continue;
    }
    if (obj.lane === "page" && obj.name === PERSON_PAGE_NAME && obj.page_html) {
      found = obj.page_html;
      break;
    }
  }
  return found;
}

describe("person page +Project(s) Participating section on the REAL production deck", () => {
  it(
    "renders the virtual titled Search section through the deployed boot",
    { timeout: 600_000 },
    async (ctx) => {
      if (!REALDECK_REQUESTED) {
        skipLoud(ctx, "tests/deploy/bunny-edge-person-participating-real-deck-replay.test.ts", "REALDECK_REQUESTED");
        return;
      }
      expect(MIRROR_PRESENT, `trial-deck mirror missing: ${MIRROR_DB}`).toBe(true);
      expect(SHARD_PRESENT, `yardstick shard missing: ${YARDSTICK_SHARD}`).toBe(true);

      const driver = new LocalSqliteDriver({ path: MIRROR_DB, readonly: true });
      const deck = await bootCorpusDeckEngines(driver);
      const response = await handleEngineRequest(
        new Request(`https://script-placeholder.bunny.run/${encodeURIComponent(PERSON_PAGE_NAME)}`),
        deck,
      );
      expect(response.status).toBe(200);
      const actual = await response.text();

      // THE SECTION -- the screenshot lane's finding, closed on the real deck.
      expect(actual).toContain(SECTION_MARKERS.slotClass);
      expect(actual).toContain(SECTION_MARKERS.typeName);
      expect(actual).toContain(SECTION_MARKERS.slotId);
      expect(actual).toContain("mythopsychology");
      expect(actual).toContain("NCDD");

      // Yardstick evidence: the section markers exist on the RUBY side too,
      // and the full-page byte diff is reported (not gated -- the known
      // link-query-dropped class rides this page; see file header).
      const expected = await loadYardstick();
      expect(expected, "yardstick page_html for Brandon WilliamsCraig").toBeDefined();
      const diff = byteDiff(normalizeSlotIds(expected!), normalizeSlotIds(actual));
      console.log(
        "REALDECK byteDiff:",
        JSON.stringify({
          expectedCodeUnits: diff.expectedCodeUnits,
          actualCodeUnits: diff.actualCodeUnits,
          equal: diff.equal,
          firstDiffOffset: diff.firstDifference?.codeUnitOffset ?? null,
        }),
      );
      const normalizedExpected = normalizeSlotIds(expected!);
      expect(normalizedExpected).toContain(SECTION_MARKERS.slotClass);
      expect(normalizedExpected).toContain(SECTION_MARKERS.slotId);

      // Probe artifact (P2_PERSON_REALDECK_PROBE=1): both pages + the
      // first-diff context, for the receipt's divergence characterization.
      if (process.env.P2_PERSON_REALDECK_PROBE === "1") {
        const { mkdirSync, writeFileSync } = await import("node:fs");
        const outDir = path.join(REPO_ROOT, "tmp", "p2-person-section");
        mkdirSync(outDir, { recursive: true });
        writeFileSync(path.join(outDir, "realdeck-actual.html"), actual, "utf8");
        writeFileSync(path.join(outDir, "realdeck-expected.html"), expected!, "utf8");
        const off = diff.firstDifference?.codeUnitOffset ?? 0;
        console.log(
          "PROBE firstDiff context:",
          JSON.stringify({
            offset: off,
            expected: (diff.firstDifference?.expectedExcerpt ?? "").slice(0, 300),
            actual: (diff.firstDifference?.actualExcerpt ?? "").slice(0, 300),
          }),
        );
      }
    },
  );
});
