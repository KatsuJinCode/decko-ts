// raw-corpus-layout-nest-search-preexecute.test.ts -- the RED pin for the
// layout-nest search pre-execution gap (the corrected root cause of the 10
// empty census searches; an internal work log section 3):
// the page renderer's prepare render pre-executes only the MAIN closure's
// Search-type cards (render.ts#prepareSearches walks nest-syntax references;
// relative layout nests are skipped), the layout warm-up
// (page.ts#warmUpLayoutNests -> engine.warmupLayoutReferences) then enriches
// the layout-nest virtual junction searches (<page>+*referred_to_by,
// <page>+*type+by name) WITHOUT executing them, and everything after is
// synchronous -- so the card_list view reads only the pre-executed map
// (render.ts#executeSearch -> searchResults.get(key) ?? []) and renders
// search-no-results where the oracle lists search-result-item bars.
//
// Pins the money page (18253, the probe-pinned representative): the
// `money+*referred_to_by` slot's rendered bytes must equal the oracle's
// search-result-list region byte-for-byte after slot-id normalization.
//
// Ruby parity of the flip: card-mod-search set/abstract/0_search/views.rb
// view :card_list calls search_with_params -> Abstract::Search#search ->
// query.run INSIDE the view dispatch -- the CQL executes during the request,
// synchronously, before the page's bytes are complete. The Ruby request has
// no sync/async split; the port's pre-execution of these layout-nest searches
// during the async warm-up phase IS that view-time execution, completed
// before the sync layout render reads the map.
//
// RUN (explicitly; needs the machine-local raw corpus via tmp/raw-ground-truth
// and the page-lane shards -- same corpus machine as the 47-page replay):
//   SEARCH_CENSUS_REPLAY=1 NODE_OPTIONS=--max-old-space-size=4096 \
//   npx vitest run tests/card/render/raw-corpus-layout-nest-search-preexecute.test.ts \
//     --maxWorkers=2 --no-file-parallelism
//
// Outside a census machine (no corpus, or the env gate unset) the spec skips,
// so ordinary suite runs neither slow down nor fail on absent data.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, it, expect } from "vitest";
import { byteDiff, normalizeSlotIds } from "../../../src/testing/diff.js";
import { RAW_CORPUS_DB, createRawStructureSeededStorage } from "./raw-corpus-seeding.js";
import { loadCensusOraclePageEntry } from "./raw-corpus-search-census-page-subset.js";
import { skipLoud } from "../../support/describe-with-corpus.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..");
const PAGE_LANE_DIR = path.join(
  REPO_ROOT, "tmp", "raw-ground-truth", "expected-v2", "page-lane",
);
const OUT_DIR = path.join(REPO_ROOT, "tmp", "census-search-prepare");

const REPLAY_REQUESTED = process.env.SEARCH_CENSUS_REPLAY === "1";
const CORPUS_PRESENT = existsSync(RAW_CORPUS_DB);
const SHARDS_PRESENT = existsSync(PAGE_LANE_DIR);

/** The balanced-div region of one card slot: from the slot's opening
 *  `<div ...>` (the last open before the card's data-card-name attribute)
 *  through its matching close. Both sides are normalized slot-id bytes, so
 *  the regions are directly comparable. */
function slotRegion(page: string, dataCardName: string): string {
  const anchor = `data-card-name="${dataCardName}"`;
  const at = page.indexOf(anchor);
  if (at < 0) throw new Error(`slot anchor not found: ${anchor}`);
  const start = page.lastIndexOf("<div ", at);
  if (start < 0) throw new Error(`no opening div before anchor: ${anchor}`);
  let depth = 0;
  for (const m of page.slice(start).matchAll(/<div\b|<\/div>/g)) {
    depth += m[0].startsWith("<div") ? 1 : -1;
    if (depth === 0) return page.slice(start, start + (m.index ?? 0) + m[0].length);
  }
  throw new Error(`unbalanced div region for: ${anchor}`);
}

describe("raw-corpus layout-nest search pre-execution (money 18253)", () => {
  it(
    "renders the layout-nest +*referred_to_by search with the oracle's result list",
    { timeout: 1_800_000 },
    async (ctx) => {
      if (!REPLAY_REQUESTED) {
        skipLoud(ctx, "tests/card/render/raw-corpus-layout-nest-search-preexecute.test.ts", "REPLAY_REQUESTED");
        return;
      }
      expect(CORPUS_PRESENT, `raw corpus missing: ${RAW_CORPUS_DB}`).toBe(true);
      expect(SHARDS_PRESENT, `page-lane shards missing: ${PAGE_LANE_DIR}`).toBe(true);

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

      const oracle = loadCensusOraclePageEntry(
        { phase: "006", id: 18253, name: "money" },
        PAGE_LANE_DIR,
      );
      const expected = oracle.error !== undefined ? String(oracle.error) : (oracle.page_html ?? "");
      const actual = await storage.engine.renderPage("money");

      const expN = normalizeSlotIds(expected);
      const actN = normalizeSlotIds(actual);
      const searchCardName = "money+*referred_to_by";
      const expRegion = slotRegion(expN, searchCardName);
      const actRegion = slotRegion(actN, searchCardName);

      mkdirSync(OUT_DIR, { recursive: true });
      writeFileSync(path.join(OUT_DIR, "18253-money.exp.html"), expN);
      writeFileSync(path.join(OUT_DIR, "18253-money.act.html"), actN);
      writeFileSync(path.join(OUT_DIR, "18253-money.search-slot.exp.html"), expRegion);
      writeFileSync(path.join(OUT_DIR, "18253-money.search-slot.act.html"), actRegion);

      // fixture sanity: the oracle region is a real result list with items
      expect(expRegion).toContain("search-result-list");
      expect(expRegion).toContain("search-result-item");
      expect(expRegion).not.toContain("search-no-results");

      // the flip: the rendered slot carries the same list, no no-results span
      expect(actRegion).toContain("search-result-list");
      expect(actRegion).toContain("search-result-item");
      expect(actRegion).not.toContain("search-no-results");

      // byte parity of the whole search slot against the oracle
      const diff = byteDiff(expRegion, actRegion);
      if (!diff.equal) {
        console.log(
          `SEARCH-SLOT-DIFF expCodeUnits=${diff.expectedCodeUnits} ` +
            `actCodeUnits=${diff.actualCodeUnits} ` +
            `first=${JSON.stringify(diff.firstDifference)}`,
        );
      }
      expect(diff.equal).toBe(true);

      storage.close();
    },
  );
});
