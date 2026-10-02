// raw-corpus-p20-perm-residuals-sweep.test.ts -- the pass-20 permission-
// residuals port's sweep runner (lane-p20-perm, base b2f4700). Its
// class is the 11 non-perm-sweep pages routed to it by four earlier port
// receipts, plus a grows-as-pages-flip hard-assert block:
//
//   - 4 mixed18 route-outs booked to perm (tmp/wrong-goal-hunt/mixed18-lane.md
//     round-3 ledger: "the perm regions remain route-out (perm-allow family,
//     as pinned by the dead agents)" on BW Oversight+ARCHETYPALLY, Starhawk,
//     Daemeon Reiydelle, Michael Christensen; the mixed18 engine commits are
//     NOT in this base -- 38ba98e/8991ee9 are not ancestors of b2f4700 -- so
//     these pages carry their full diff here, of which this suite owns the
//     permission-shaped regions);
//   - 3 Role pages whose :configs role->items grouping the mm-roleviews port
//     proved capture-state-bound (tmp/wrong-goal-hunt/mm-roleviews-lane.md
//     leftover 5: Administrator, Administrator+Dashboard, Help Desk);
//   - 3 layout pages the mm-whitespace port left with a `{{*foot|core}}` nest
//     rendering as its literal text where the oracle renders the read-denied
//     span (tmp/wrong-goal-hunt/mm-whitespace-lane.md leftovers: home-layout,
//     bdwilliamscraig-layout, Golden_Bears_Aikido_at_UC_Berkeley main layout).
//
// Block 1 (report-only): renders each page over the full-deck corpus seed,
// writes exp/act pairs + a JSONL line (byte-exact, code units, first-diff
// offset, denial-span counts) to tmp/p20-perm-residuals/.
//
// Block 2 (hard assert): pages this suite has FLIPPED to byte-exact, pinned so
// a regression re-opens loudly. Starts empty; grows with each fix commit.
//
// RUN (machine-local raw corpus; P20_PERM_RESIDUALS=1):
//   npx cross-env P20_PERM_RESIDUALS=1 npx vitest run \
//     tests/card/render/raw-corpus-p20-perm-residuals-sweep.test.ts \
//     --no-file-parallelism

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, it, expect } from "vitest";
import { byteDiff, normalizeSlotIds } from "../../../src/testing/diff.js";
import { RAW_CORPUS_DB, createRawStructureSeededStorage } from "./raw-corpus-seeding.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..");
const PAGE_LANE_DIR = path.join(REPO_ROOT, "tmp", "raw-ground-truth", "expected-v2", "page-lane");
const OUT_DIR = path.join(REPO_ROOT, "tmp", "p20-perm-residuals");

const SWEEP_REQUESTED = process.env.P20_PERM_RESIDUALS === "1";

/** The suite's 11 non-perm-sweep pages, grouped by the receipt that routed
 * them here. The 5 perm-allow-2 triage pages are NOT here -- they have their
 * own instrument (perm-allow-overdeny-corpus-replay.test.ts). */
const LANE_PAGES = [
  { name: "BW Oversight+ARCHETYPALLY", routedBy: "mixed18-r3 route-out (perm regions)" },
  { name: "Daemeon Reiydelle", routedBy: "mixed18-r3 route-out (perm regions)" },
  { name: "Starhawk", routedBy: "mixed18-r3 route-out (perm regions)" },
  { name: "Michael Christensen", routedBy: "mixed18-r3 route-out (perm regions)" },
  { name: "Administrator", routedBy: "mm-roleviews leftover 5 (:configs grouping)" },
  { name: "Administrator+Dashboard", routedBy: "mm-roleviews leftover 5 (:configs grouping)" },
  { name: "Help Desk", routedBy: "mm-roleviews leftover 5 (:configs grouping)" },
  { name: "home-layout", routedBy: "mm-whitespace leftover ({{*foot|core}} literal)" },
  { name: "bdwilliamscraig-layout", routedBy: "mm-whitespace leftover ({{*foot|core}} literal)" },
  {
    name: "Golden_Bears_Aikido_at_UC_Berkeley main layout",
    routedBy: "mm-whitespace leftover ({{*foot|core}} literal)",
  },
];

/** Pages flipped byte-exact by this suite, pinned hard after the flip. */
const FLIPPED_PAGES: ReadonlyArray<string> = [
  "home-layout",
  "bdwilliamscraig-layout",
  "Golden_Bears_Aikido_at_UC_Berkeley main layout",
];

interface PageLaneLine {
  lane?: string;
  name?: string;
  page_html?: string;
  error?: unknown;
}

function loadOraclePageEntries(wanted: Array<string>): Map<string, PageLaneLine> {
  const set = new Set(wanted);
  const out = new Map<string, PageLaneLine>();
  for (const f of readdirSync(PAGE_LANE_DIR)) {
    if (!/^recapture-raw-shard-\d{6}\.jsonl$/.test(f)) continue;
    for (const line of readFileSync(path.join(PAGE_LANE_DIR, f), "utf8").split("\n")) {
      if (line.trim() === "") continue;
      let parsed: PageLaneLine;
      try {
        parsed = JSON.parse(line) as PageLaneLine;
      } catch {
        continue;
      }
      if (parsed.lane === "page" && parsed.name !== undefined && set.has(parsed.name)) {
        out.set(parsed.name, parsed);
      }
    }
  }
  return out;
}

async function seedRawCorpusStorage(): Promise<ReturnType<typeof createRawStructureSeededStorage>> {
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

describe(
  "p20 perm-residuals lane sweep (mixed18 perm route-outs + Role :configs + layout foot-nest)",
  () => {
    it(
      "renders the lane's 11 routed pages and records per-page flip evidence",
      { timeout: 3_600_000 },
      async (itCtx) => {
        if (!SWEEP_REQUESTED) {
          itCtx.skip();
          return;
        }
        expect(existsSync(PAGE_LANE_DIR), `page-lane shards missing: ${PAGE_LANE_DIR}`).toBe(true);

        const oracleByPage = loadOraclePageEntries(LANE_PAGES.map((p) => p.name));
        const storage = await seedRawCorpusStorage();
        mkdirSync(OUT_DIR, { recursive: true });
        const lines: string[] = [];
        let pass = 0;
        let fail = 0;
        try {
          for (const page of LANE_PAGES) {
            const oracle = oracleByPage.get(page.name);
            if (oracle === undefined) {
              lines.push(JSON.stringify({ name: page.name, verdict: "NO-ORACLE", routedBy: page.routedBy }));
              fail++;
              continue;
            }
            const expected = normalizeSlotIds(oracle.page_html ?? "");
            let actual: string;
            let renderError: string | null = null;
            try {
              actual = await storage.engine.renderPage(page.name);
            } catch (error) {
              const err = error as Error;
              renderError = `${err?.name ?? "Error"}: ${String(err?.message ?? error).slice(0, 300)}`;
              actual = "";
            }
            const actualN = normalizeSlotIds(actual);
            const diff = byteDiff(expected, actualN);
            if (diff.equal) pass++;
            else fail++;
            lines.push(
              JSON.stringify({
                name: page.name,
                routedBy: page.routedBy,
                verdict: diff.equal ? "pass" : "fail",
                renderError,
                expCodeUnits: diff.expectedCodeUnits,
                actCodeUnits: diff.actualCodeUnits,
                firstDiffOffset: diff.firstDifference?.codeUnitOffset ?? null,
                expDeniedSpans: (expected.match(/class="denied"/g) ?? []).length,
                actDeniedSpans: (actualN.match(/class="denied"/g) ?? []).length,
                actLiteralFootNest: (actualN.match(/\{\{\*foot\|core\}\}/g) ?? []).length,
                expDeniedSpanMarker: (expected.match(/class="denied"/g) ?? []).length,
              }),
            );
            const base = page.name.replace(/[^\w.-]+/g, "_");
            writeFileSync(path.join(OUT_DIR, `${base}.exp.html`), expected);
            writeFileSync(path.join(OUT_DIR, `${base}.act.html`), actualN);
          }
        } finally {
          storage.close();
        }
        writeFileSync(path.join(OUT_DIR, "sweep-results.jsonl"), lines.join("\n") + "\n");
        const exact = LANE_PAGES.length - fail;
        console.error(`P20-PERM-RESIDUALS SWEEP: ${pass}/${LANE_PAGES.length} byte-exact (${fail} fail)`);
        expect(pass + fail).toBe(LANE_PAGES.length);
        expect(exact).toBeGreaterThanOrEqual(0);
      },
    );

    it(
      "keeps every page this lane flipped byte-exact pinned",
      { timeout: 3_600_000 },
      async (itCtx) => {
        if (!SWEEP_REQUESTED) {
          itCtx.skip();
          return;
        }
        if (FLIPPED_PAGES.length === 0) {
          itCtx.skip();
          return;
        }
        expect(existsSync(PAGE_LANE_DIR)).toBe(true);
        const oracleByPage = loadOraclePageEntries([...FLIPPED_PAGES]);
        const storage = await seedRawCorpusStorage();
        try {
          for (const name of FLIPPED_PAGES) {
            const oracle = oracleByPage.get(name);
            expect(oracle, `no page-lane yardstick entry for ${name}`).toBeDefined();
            const expected = normalizeSlotIds(oracle?.page_html ?? "");
            const actual = normalizeSlotIds(await storage.engine.renderPage(name));
            const diff = byteDiff(expected, actual);
            expect(
              diff.equal,
              `${name}: flipped page regressed (exp ${diff.expectedCodeUnits} / act ${diff.actualCodeUnits}` +
                `${diff.firstDifference ? `, first diff at ${diff.firstDifference.codeUnitOffset}` : ""})`,
            ).toBe(true);
          }
        } finally {
          storage.close();
        }
      },
    );
  },
);

function corpusPresent(): boolean {
  return existsSync(RAW_CORPUS_DB) && existsSync(PAGE_LANE_DIR);
}
