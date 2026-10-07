// raw-corpus-p22-rulebar-content-pages.test.ts -- the a work item rule-bar
// one-line-content port's evidence probe. Renders the three pages the plan
// names here (plan §(b)) through the engine's REAL page
// renderer over the RAW ground-truth corpus and records the bar-right
// regions of the named rule bars on both sides:
//
//   Exhibit+Item+*type plus right   shard 000013 -- the *content options
//       rule bar's one-line content renders EMPTY in the engine where the
//       oracle shows the raw db_content JSON, 30 bytes @ offset 53737
//       (p21-cql-item-typing-lane.md leftover #2, measured at the p21
//       bases; this probe re-measures at its own tip)
//   Search                          shard 000000 -- member bar of stored
//       rule card 17743 (Exhibit+Item+*type plus right+*content options,
//       Search-typed): oracle one-line = raw db_content; the p20-cardtype
//       receipt measured the engine rendering the EXECUTED search results
//   Pointer                         shard 000029 -- member bar of stored
//       rule card 11745 (*input type+*right+*content options,
//       Pointer-typed, 11 items): oracle one-line = "11 items"
//
// Report-only (the census contract; this spec never asserts page parity and
// never re-runs a grader): it records evidence to
//   tmp/p22-rulebar-content/results.jsonl   one line per page: verdict,
//       byte gap, first-diff region count, and the extracted bar regions
//   tmp/p22-rulebar-content/pages/<key>.{exp,act}.html
//
// RUN (explicitly; needs the machine-local raw corpus via
// tmp/raw-ground-truth and the page-lane shards -- one corpus boot, three
// page renders):
//   P22_RULEBAR_PAGES=1 NODE_OPTIONS=--max-old-space-size=4096 \
//   npx vitest run tests/card/render/raw-corpus-p22-rulebar-content-pages.test.ts \
//     --maxWorkers=2 --no-file-parallelism
//
// Outside a census machine (no corpus, or the env gate unset) the spec
// skips, so ordinary suite runs neither slow down nor fail on absent data.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, it, expect } from "vitest";
import { byteDiff, normalizeSlotIds } from "../../../src/testing/diff.js";
import { RAW_CORPUS_DB, createRawStructureSeededStorage } from "./raw-corpus-seeding.js";
import { skipLoud } from "../../support/describe-with-corpus.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..");
const PAGE_LANE_DIR = path.join(
  REPO_ROOT, "tmp", "raw-ground-truth", "expected-v2", "page-lane",
);
const OUT_DIR = path.join(REPO_ROOT, "tmp", "p22-rulebar-content");

const REPLAY_REQUESTED = process.env.P22_RULEBAR_PAGES === "1";
const CORPUS_PRESENT = existsSync(RAW_CORPUS_DB);
const SHARDS_PRESENT = existsSync(PAGE_LANE_DIR);

/** page name -> page-lane shard file that carries it (resolved 2026-09-30
 *  by scanning the shards; the id match inside is the ground truth). */
const PAGES: Array<{ key: string; name: string; shard: string }> = [
  { key: "exhibit-item-type-plus-right", name: "Exhibit+Item+*type plus right", shard: "recapture-raw-shard-000013.jsonl" },
  { key: "search", name: "Search", shard: "recapture-raw-shard-000000.jsonl" },
  { key: "pointer", name: "Pointer", shard: "recapture-raw-shard-000029.jsonl" },
  // Blast-radius guards (the census's other Search-typed rule-bar pages):
  // the only three further pages across the 48 shards whose bytes carry a
  // Search-typed *content options rule bar (*script+*right+*content
  // options on 15; *debugger+*self+*content options on 18; the
  // *recent settings self-set's row on 18).
  { key: "script-right", name: "*script+*right", shard: "recapture-raw-shard-000015.jsonl" },
  { key: "debugger-self", name: "*debugger+*self", shard: "recapture-raw-shard-000018.jsonl" },
  { key: "recent-settings-self", name: "*recent settings+*self", shard: "recapture-raw-shard-000018.jsonl" },
];

/** The bar whose bar-right region this suite owns, per page: the slot id
 *  prefix of the bar card (slot ids are slot-id-normalized, so the lexical
 *  id prefix survives normalization) -- the extraction anchor. */
const BAR_ANCHORS: Record<string, string[]> = {
  "exhibit-item-type-plus-right": [
    "exhibit-item-Xtype_plu_right-Xcontent_option-bar-view",
  ],
  search: ["exhibit-item-Xtype_plu_right-Xcontent_option-bar-view"],
  pointer: ["Xinput_type-Xright-Xcontent_option-bar-view"],
};

interface PageLaneLine {
  id: number;
  lane: "page";
  name: string;
  page_html?: string;
  error?: unknown;
}

function loadOraclePage(shard: string, name: string): PageLaneLine {
  const p = path.join(PAGE_LANE_DIR, shard);
  for (const line of readFileSync(p, "utf8").split("\n")) {
    if (line.trim() === "") continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    const rec = parsed as PageLaneLine;
    if (rec.lane === "page" && rec.name === name && rec.page_html !== undefined) {
      return rec;
    }
  }
  throw new Error(`page-lane oracle not found: ${name} in ${shard}`);
}

/** Extract every `<slot-start> … +3000` window whose anchor names one of
 *  this suite's bars, so the report carries BOTH sides of the bar-right
 *  region byte-for-byte (the one-line div lives within the bar slot). */
function extractBarRegions(html: string, anchors: string[]): string[] {
  const regions: string[] = [];
  for (const anchor of anchors) {
    let at = html.indexOf(anchor);
    while (at !== -1) {
      const slotStart = html.lastIndexOf("<div", at);
      regions.push(html.slice(slotStart, Math.min(html.length, slotStart + 3200)));
      at = html.indexOf(anchor, at + 1);
    }
  }
  return regions;
}

describe("raw-corpus p22 rule-bar one-line content pages (3 named pages)", () => {
  it(
    "renders the pages and records the named rule bars' bar-right regions",
    { timeout: 3_600_000 },
    async (ctx) => {
      if (!REPLAY_REQUESTED) {
        skipLoud(ctx, "tests/card/render/raw-corpus-p22-rulebar-content-pages.test.ts", "REPLAY_REQUESTED");
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

      // NOTE (probe r3/postfix lesson, job-1790820154566-11c4aa44 and
      // job-1790822005721-8c8b5410): any ISOLATED card render placed
      // BEFORE the page renders poisons them -- the a work item census's
      // "first-render-wins renderCards" mechanism is live on this seat
      // (both pages' 17743 bars rendered the mini-bar shape with no
      // one-line after an isolated :core/:bar render). The pages are
      // rendered FIRST, in page-lane order, with no prior renders; any
      // isolation-based bisection belongs in a SEPARATE boot.

      const results: Array<Record<string, unknown>> = [];
      for (const entry of PAGES) {
        const oracle = loadOraclePage(entry.shard, entry.name);
        const expected = oracle.error !== undefined ? String(oracle.error) : (oracle.page_html ?? "");
        let actual: string;
        let renderError: { name: string; message: string } | null = null;
        try {
          actual = await storage.engine.renderPage(entry.name);
        } catch (error) {
          const err = error as Error;
          actual = `CAPTURE_ERROR: ${err?.name ?? "Error"}: ${err?.message ?? String(error)}`;
          renderError = {
            name: err?.name ?? "Error",
            message: String(err?.message ?? error).slice(0, 500),
          };
        }

        const expN = normalizeSlotIds(expected);
        const actN = normalizeSlotIds(actual);
        const diff = byteDiff(expN, actN);

        writeFileSync(path.join(OUT_DIR, "pages", `${entry.key}.exp.html`), expN);
        writeFileSync(path.join(OUT_DIR, "pages", `${entry.key}.act.html`), actN);

        const barRegionsExp = extractBarRegions(expN, BAR_ANCHORS[entry.key] ?? []);
        const barRegionsAct = extractBarRegions(actN, BAR_ANCHORS[entry.key] ?? []);
        const record: Record<string, unknown> = {
          page: entry.name,
          shard: entry.shard,
          byteEqual: diff.equal,
          expBytes: expN.length,
          actBytes: actN.length,
          byteGap: actN.length - expN.length,
          renderError,
          barRegionsExp,
          barRegionsAct,
        };
        results.push(record);
        console.log(
          `P22-RULEBAR-PAGE ${entry.key} equal=${diff.equal} gap=${record.byteGap as number} ` +
            `expRegions=${barRegionsExp.length} actRegions=${barRegionsAct.length}` +
            (renderError ? ` renderError=${renderError.name}` : ""),
        );
      }

      writeFileSync(
        path.join(OUT_DIR, "results.jsonl"),
        results.map((r) => JSON.stringify(r)).join("\n") + "\n",
      );
      console.log(`P22-RULEBAR-SUMMARY pages=${results.length} -> ${OUT_DIR}`);
    },
  );
});
