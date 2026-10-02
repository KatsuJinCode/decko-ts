// raw-corpus-p20-help-content-page-sweep.test.ts -- the p20-help-content
// port's sweep: renders the 38 pages the mm-escape-residue receipt attributed
// to the help-content resolver gap (raw-corpus-p20-help-content-pages.ts)
// through the engine's REAL page renderer over the RAW ground-truth corpus,
// and compares byte-for-byte against the oracle's captured page HTML.
//
// Report-only (the escape-family sweep's contract): the spec never gates the
// vitest run on parity; it records evidence --
//
//   tmp/p20-help-sweep/results.jsonl   one line per page: identity, class,
//                                      verdict, sizes, first diff
//   tmp/p20-help-sweep/pages/<id>-<key>.{exp,act}.html
//                                      both normalized sides
//
// The flip count the receipt reports is byteExact here, per class.
// Pages render in the subset's shard/phase order over ONE shared storage --
// the escape-family sweep's own protocol -- because the setting-card pages'
// set-class rows walk the enriched render-card map, whose state reflects the
// pages rendered before them.
//
// RUN (explicitly; needs the machine-local raw corpus via tmp/raw-ground-truth
// -- see RAW_CORPUS_DB -- and the page-lane shards):
//   P20_HELP_SWEEP=1 NODE_OPTIONS=--max-old-space-size=4096 \
//   npx vitest run tests/card/render/raw-corpus-p20-help-content-page-sweep.test.ts \
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
import { P20_HELP_CONTENT_PAGE_SUBSET } from "./raw-corpus-p20-help-content-pages.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..");
const PAGE_LANE_DIR = path.join(
  REPO_ROOT, "tmp", "raw-ground-truth", "expected-v2", "page-lane",
);
const OUT_DIR = path.join(REPO_ROOT, "tmp", "p20-help-sweep");

const SWEEP_REQUESTED = process.env.P20_HELP_SWEEP === "1";
const CORPUS_PRESENT = existsSync(RAW_CORPUS_DB);
const SHARDS_PRESENT = existsSync(PAGE_LANE_DIR);

interface PageLaneLine {
  id: number;
  name: string;
  layout?: string | null;
  page_html?: string;
  error?: unknown;
}

function loadOracleEntry(entry: { shard: string; id: number }): PageLaneLine {
  const p = path.join(PAGE_LANE_DIR, entry.shard);
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
  throw new Error(`no page-lane entry for id ${entry.id} in ${entry.shard}`);
}

describe("raw-corpus p20-help-content sweep (38 pages, two mechanisms)", () => {
  it(
    "renders the subset and records per-class flip evidence",
    { timeout: 3_600_000 },
    async (ctx) => {
      if (!SWEEP_REQUESTED) {
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
      const passByClass: Record<string, number> = {};
      const failByClass: Record<string, number> = {};

      for (const entry of P20_HELP_CONTENT_PAGE_SUBSET) {
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
        if (diff.equal) {
          passByClass[entry.helpClass] = (passByClass[entry.helpClass] ?? 0) + 1;
        } else {
          failByClass[entry.helpClass] = (failByClass[entry.helpClass] ?? 0) + 1;
        }

        const pageKey = `${entry.id}-${String(entry.name).replace(/[^\w.-]+/g, "_").slice(0, 60)}`;
        writeFileSync(path.join(OUT_DIR, "pages", `${pageKey}.exp.html`), expN);
        writeFileSync(path.join(OUT_DIR, "pages", `${pageKey}.act.html`), actN);

        results.push({
          phase: entry.phase,
          id: entry.id,
          name: entry.name,
          helpClass: entry.helpClass,
          layout: oracle.layout ?? null,
          verdict: diff.equal ? "pass" : "fail",
          renderError,
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
        });
      }

      const outFile = path.join(OUT_DIR, "results.jsonl");
      writeFileSync(outFile, results.map((r) => JSON.stringify(r)).join("\n") + "\n");
      console.log(
        `P20-HELP-SWEEP pages=${results.length} byteExact=${results.filter((r) => r.verdict === "pass").length} ` +
          `passByClass=${JSON.stringify(passByClass)} failByClass=${JSON.stringify(failByClass)} out=${outFile}`,
      );
      expect(results.length).toBe(P20_HELP_CONTENT_PAGE_SUBSET.length);
      storage.close();
    },
  );
});
