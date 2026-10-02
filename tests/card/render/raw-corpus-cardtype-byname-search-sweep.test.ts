// raw-corpus-cardtype-byname-search-sweep.test.ts -- the p20-cardtype-search
// port's evidence sweep: renders the 51 large-gap Cardtype-typed page-lane
// failures (the pass-15 fail-dump class "Cardtype pages whose byte mass is
// the +*type+by_name member search", pinned with numeric page-lane ids in
// raw-corpus-cardtype-byname-search-subset.json) through the engine's REAL
// page renderer over the RAW ground-truth corpus, and records per-page
// parity/search evidence against the oracle page-lane bytes.
//
// Report-only (the census contract; the graded verifier already ran
// for pass-19 -- this spec never re-runs a grader): it records evidence --
//
//   tmp/census-ctsearch/results.jsonl   one line per page: identity,
//       pass-15 gap, verdict, search-flip evidence, by_name slot region
//       parity, class-token census, first diff, mechanism set, regions
//   tmp/census-ctsearch/pages/<id>-<key>.{exp,act}.html
//       both normalized sides, for offline re-analysis
//
// RUN (explicitly; needs the machine-local raw corpus via tmp/raw-ground-truth
// and the page-lane shards -- several minutes for 51 renders over the
// 47k-card deck):
//   CARDTYPE_SEARCH_SWEEP=1 NODE_OPTIONS=--max-old-space-size=4096 \
//   npx vitest run tests/card/render/raw-corpus-cardtype-byname-search-sweep.test.ts \
//     --maxWorkers=2 --no-file-parallelism
//
// Outside a census machine (no corpus, or the env gate unset) the spec skips,
// so ordinary suite runs neither slow down nor fail on absent data.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, it, expect } from "vitest";
import { byteDiff, normalizeSlotIds } from "../../../src/testing/diff.js";
import { RAW_CORPUS_DB, createRawStructureSeededStorage } from "./raw-corpus-seeding.js";
import { walkDiff } from "./census-page-diff-walker.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..");
const PAGE_LANE_DIR = path.join(
  REPO_ROOT, "tmp", "raw-ground-truth", "expected-v2", "page-lane",
);
const OUT_DIR = path.join(REPO_ROOT, "tmp", "census-ctsearch");

const REPLAY_REQUESTED = process.env.CARDTYPE_SEARCH_SWEEP === "1";
const CORPUS_PRESENT = existsSync(RAW_CORPUS_DB);
const SHARDS_PRESENT = existsSync(PAGE_LANE_DIR);

interface SubsetEntry {
  phase: string;
  id: number;
  name: string;
  pass15Gap: number;
  shard: string;
}
const SUBSET = JSON.parse(
  readFileSync(path.join(HERE, "raw-corpus-cardtype-byname-search-subset.json"), "utf8"),
) as SubsetEntry[];

interface PageLaneLine {
  id: number;
  lane: "page";
  name: string;
  page_html?: string;
  error?: unknown;
}

/** The oracle bytes for one entry: the lane==="page" line with the entry's
 *  numeric id, scanned across every page-lane shard present on disk. (The
 *  pass-15 repro dump's phase tags do NOT map to page-lane shard numbers;
 *  the entries were resolved against the shards directly, and the id match
 *  is the ground truth — a miss is a data error, not a lookup guess.) */
function loadOracleEntry(entry: SubsetEntry): PageLaneLine {
  for (const fname of readdirSync(PAGE_LANE_DIR)) {
    const p = path.join(PAGE_LANE_DIR, fname);
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
  throw new Error(`no page-lane entry for id ${entry.id} (${entry.name})`);
}

describe("raw-corpus cardtype by_name search sweep (51 large-gap Cardtype pages)", () => {
  it(
    "renders the subset and records parity/search evidence",
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

      for (const entry of SUBSET) {
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

        // Search-flip evidence at the page level: the class this suite owns
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

        // partial-result evidence: the engine renders SOME result bars where
        // the oracle renders more (count divergence inside the search)
        const expItems = (expected.match(/search-result-item/g) ?? []).length;
        const actItems = (actual.match(/search-result-item/g) ?? []).length;

        // the by_name member-search slot's class-token census (the
        // TYPE_PLUS_RIGHT-*-by_name chrome divergence the cardtype-tpl
        // receipt flagged): both sides, both tokens
        const tokens = {
          expCardtypeByName: (expN.match(/TYPE_PLUS_RIGHT-cardtype-by_name/g) ?? []).length,
          actCardtypeByName: (actN.match(/TYPE_PLUS_RIGHT-cardtype-by_name/g) ?? []).length,
          expSetByName: (expN.match(/TYPE_PLUS_RIGHT-set-by_name/g) ?? []).length,
          actSetByName: (actN.match(/TYPE_PLUS_RIGHT-set-by_name/g) ?? []).length,
        };

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
          pass15Gap: entry.pass15Gap,
          verdict: diff.equal ? "pass" : "fail",
          renderError,
          search: {
            expHasResults,
            actHasResults,
            actHasNoResults,
            searchFlipGap,
            expResultItems: expItems,
            actResultItems: actItems,
          },
          tokens,
          gapNow: diff.expectedBytes - diff.actualBytes,
          expBytes: diff.expectedBytes,
          actBytes: diff.actualBytes,
          firstDiff: diff.firstDifference
            ? {
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
        `CARDTYPE-SEARCH-SWEEP pages=${results.length} byteExact=${pass} failing=${fail} ` +
          `searchStillEmpty=${searchStillEmpty} out=${outFile}`,
      );
      const failing = results.filter((r) => r.verdict === "fail");
      for (const r of failing) {
        const s = r.search as Record<string, unknown>;
        const t = r.tokens as Record<string, number>;
        console.log(
          `FAIL ${r.id} ${JSON.stringify(r.name)} gapNow=${r.gapNow} pass15Gap=${r.pass15Gap} ` +
            `flip=${String(s.searchFlipGap)} items=${s.actResultItems}/${s.expResultItems} ` +
            `tokens=exp[${t.expCardtypeByName}/${t.expSetByName}]act[${t.actCardtypeByName}/${t.actSetByName}] ` +
            `mechs=${JSON.stringify(r.mechanisms)}`,
        );
      }
      // report-only suite: never gate the vitest run on parity
      expect(results.length).toBe(SUBSET.length);
      storage.close();
    },
  );
});
