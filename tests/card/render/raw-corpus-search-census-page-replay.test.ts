// raw-corpus-search-census-page-replay.test.ts -- search-results census
// replay: renders the page-mechanism census's 47 c-structural pages (the
// "David Williams / John Abbe" search-results class, pinned in
// raw-corpus-search-census-page-subset.ts) through the engine's REAL page
// renderer over the RAW ground-truth corpus, and compares byte-for-byte
// against the oracle's captured page HTML with the census's own comparator
// (normalizeSlotIds + byteDiff) and its second-pass mechanism classifier.
//
// Report-only (the census lane's contract): the spec never gates the vitest
// run on parity; it records evidence --
//
//   tmp/census-search-final/results.jsonl   one line per page: identity,
//       verdict, search-flip evidence, sizes, first diff, mechanism set
//   tmp/census-search-final/pages/<id>-<key>.{exp,act}.html
//       both normalized sides, for offline re-analysis
//
// RUN (explicitly; needs the machine-local raw corpus via
// tmp/raw-ground-truth -- see RAW_CORPUS_DB -- and ~47 page renders over the
// 47k-card deck, several minutes):
//   SEARCH_CENSUS_REPLAY=1 NODE_OPTIONS=--max-old-space-size=4096 \
//   npx vitest run tests/card/render/raw-corpus-search-census-page-replay.test.ts \
//     --maxWorkers=2 --no-file-parallelism
//
// Outside a census machine (no corpus, or the env gate unset) the spec skips,
// so ordinary suite runs neither slow down nor fail on absent data.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, it, expect } from "vitest";
import { byteDiff, normalizeSlotIds } from "../../../src/testing/diff.js";
import { RAW_CORPUS_DB, createRawStructureSeededStorage } from "./raw-corpus-seeding.js";
import {
  CENSUS_PHASE_SHARDS,
  CENSUS_SEARCH_PAGE_SUBSET,
} from "./raw-corpus-search-census-page-subset.js";
import { walkDiff } from "./census-page-diff-walker.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..");
const PAGE_LANE_DIR = path.join(
  REPO_ROOT, "tmp", "raw-ground-truth", "expected-v2", "page-lane",
);
const OUT_DIR = path.join(REPO_ROOT, "tmp", "census-search-final");

const REPLAY_REQUESTED = process.env.SEARCH_CENSUS_REPLAY === "1";
const CORPUS_PRESENT = existsSync(RAW_CORPUS_DB);
const SHARDS_PRESENT = existsSync(PAGE_LANE_DIR);

interface PageLaneLine {
  id: number;
  lane: "page";
  name: string;
  layout?: string | null;
  layout_main_view?: { raw: string | null; effective: string } | null;
  page_html?: string;
  error?: unknown;
}

/** Load the oracle bytes for one subset entry: the lane==="page" line with
 *  the entry's id in that phase's shard files. */
function loadOracleEntry(entry: { phase: string; id: number }): PageLaneLine {
  const shards = CENSUS_PHASE_SHARDS[entry.phase];
  if (shards === undefined) throw new Error(`no shard mapping for phase ${entry.phase}`);
  for (const fname of shards) {
    const p = path.join(PAGE_LANE_DIR, fname);
    if (!existsSync(p)) throw new Error(`shard not found: ${p}`);
    for (const line of readFileSync(p, "utf8").split("\n")) {
      if (line.trim() === "") continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }
      const obj = parsed as Record<string, unknown>;
      if (obj.lane !== "page") continue;
      if ((obj as unknown as PageLaneLine).id === entry.id) {
        return parsed as PageLaneLine;
      }
    }
  }
  throw new Error(`no page-lane entry for id ${entry.id} in phase ${entry.phase}`);
}

describe("raw-corpus search-results census replay (47 c-structural pages)", () => {
  it(
    "renders the subset and records parity/search-flip evidence",
    { timeout: 3_600_000 },
    async (ctx) => {
      if (!REPLAY_REQUESTED) {
        ctx.skip();
        return;
      }
      expect(CORPUS_PRESENT, `raw corpus missing: ${RAW_CORPUS_DB}`).toBe(true);
      expect(SHARDS_PRESENT, `page-lane shards missing: ${PAGE_LANE_DIR}`).toBe(true);

      mkdirSync(path.join(OUT_DIR, "pages"), { recursive: true });

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

      const results: Array<Record<string, unknown>> = [];
      let pass = 0;
      let fail = 0;
      let searchStillEmpty = 0;

      for (const entry of CENSUS_SEARCH_PAGE_SUBSET) {
        const oracle = loadOracleEntry(entry);
        const expected =
          oracle.error !== undefined ? String(oracle.error) : (oracle.page_html ?? "");
        let actual: string;
        let renderError: { name: string; message: string } | null = null;
        try {
          actual = await storage.engine.renderPage(entry.name);
        } catch (error) {
          const err = error as Error;
          actual = `CAPTURE_ERROR: ${err?.name ?? "Error"}: ${err?.message ?? String(error)}`;
          renderError = { name: err?.name ?? "Error", message: String(err?.message ?? error).slice(0, 500) };
        }

        const expN = normalizeSlotIds(expected);
        const actN = normalizeSlotIds(actual);
        const diff = byteDiff(expN, actN);
        if (diff.equal) pass++;
        else fail++;

        // Search-flip evidence at the page level: the class this lane fixes
        // is search-no-results where the oracle lists a search-result list.
        const expHasResults =
          expected.includes("search-result-list") || expected.includes("search-result-item");
        const actHasResults =
          actual.includes("search-result-list") || actual.includes("search-result-item");
        const actHasNoResults = actual.includes("search-no-results");
        const expHasNoResults = expected.includes("search-no-results");
        const searchFlipGap =
          expHasResults && !actHasResults && actHasNoResults && !expHasNoResults;
        if (searchFlipGap) searchStillEmpty++;

        const { regions, resyncFailed } = diff.equal
          ? { regions: [], resyncFailed: false }
          : walkDiff(expN, actN);
        const mechs = [...new Set(regions.map((r) => r.cls))].sort();
        if (renderError !== null) mechs.push("engine-crash");

        const pageKey = `${entry.id}-${String(entry.name).replace(/[^\w.-]+/g, "_").slice(0, 60)}`;
        writeFileSync(path.join(OUT_DIR, "pages", `${pageKey}.exp.html`), expN);
        writeFileSync(path.join(OUT_DIR, "pages", `${pageKey}.act.html`), actN);

        results.push({
          phase: entry.phase,
          id: entry.id,
          name: entry.name,
          layout: oracle.layout ?? null,
          verdict: diff.equal ? "pass" : "fail",
          renderError,
          search: {
            expHasResults,
            actHasResults,
            actHasNoResults,
            searchFlipGap,
          },
          expCodeUnits: diff.expectedCodeUnits,
          actCodeUnits: diff.actualCodeUnits,
          expBytes: diff.expectedBytes,
          actBytes: diff.actualBytes,
          firstDiff: diff.firstDifference
            ? {
                codeUnitOffset: diff.firstDifference.codeUnitOffset,
                byteOffset: diff.firstDifference.byteOffset,
                expectedExcerpt: diff.firstDifference.expectedExcerpt,
                actualExcerpt: diff.firstDifference.actualExcerpt,
              }
            : null,
          regionCount: regions.length,
          resyncFailed,
          mechanisms: mechs,
          regions,
        });
      }

      const outFile = path.join(OUT_DIR, "results.jsonl");
      writeFileSync(outFile, results.map((r) => JSON.stringify(r)).join("\n") + "\n");
      console.log(
        `SEARCH-CENSUS-REPLAY pages=${results.length} byteExact=${pass} failing=${fail} ` +
          `searchStillEmpty=${searchStillEmpty} out=${outFile}`,
      );
      const failing = results.filter((r) => r.verdict === "fail");
      for (const r of failing) {
        console.log(
          `FAIL ${r.id} ${JSON.stringify(r.name)} mechanisms=${JSON.stringify(r.mechanisms)} ` +
            `searchFlipGap=${String((r.search as Record<string, unknown>).searchFlipGap)}`,
        );
      }
      // report-only lane: never gate the vitest run on parity
      expect(results.length).toBe(CENSUS_SEARCH_PAGE_SUBSET.length);
      storage.close();
    },
  );
});
