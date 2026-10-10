// focal-denial-page-corpus-replay.test.ts -- contract statement R3.4.d's
// page-layer proof: when the page's focal/main card is read-denied, Ruby
// renders the LOUD denial frame AS the main content with page chrome around
// it (card-mod-format set/all/html/error.rb:75-77
// `view :denial do focal? ? loud_denial : quiet_denial end`, HtmlFormat#focal?
// = show_layout? ? main? : depth.zero?). The loud class is 3,069 of the 6,588
// page-lane entries (the "-denial-view" main slot; 12.9-13.2 KB pages where
// the frame dominates) -- the perm-leak exemplars' 13,114-byte denial frames
// ARE this shape.
//
// Two gated blocks:
//   1. HARD: the four focal-denial exemplars pin the denial frame
//      byte-for-byte against the expected-v2 page-lane yardstick (slot
//      id/class `<key>-denial-view`, frame header with the card title, h1
//      "Sorry!" + the anonymous sign-in-or-up message). The three readable
//      controls pin the OVER-DENY direction with denial-direction
//      INVARIANTS (no denial frame, no Sorry heading, the main slot still
//      renders) -- deliberately NOT full byte equality, because one control
//      (Casey Morgan 393) carries the corpus' known
//      link-query-dropped class (wanted-card href loses its
//      ?card[name]= query; a graded-corpus divergence family outside this
//      suite's contract -- pinning it here would gate this suite on another
//      port's unit forever). The controls' full byte verdicts ride the
//      block's controls-results.jsonl as evidence.
//   2. REPORT-ONLY CENSUS: the 44-entry stratified slice
//      (focal-denial-page-subset.ts) across the 3,069-entry class, one JSONL
//      line each (verdict, sizes, first-diff offset, denial-frame markers on
//      both sides) to tmp/focal-denial-replay/sweep-results.jsonl. The two
//      boundary:true entries (20120122+CM+RVW 11179, CM 20111201 10623) are
//      the perm-leak port's denial-wrapper-leak exemplars -- on THIS tree's
//      base (before lane-perm-allow's verdict-timing fix 3e50585 merges) the
//      cold prepare crash leaves zero verdicts and the leak class renders
//      the titled body; they ride the census report-only so the flip is
//      visible once it merges. They are NOT this suite's fix surface.
//
// RUN (machine-local raw corpus; ~50 page renders over the 47k-card deck,
// one seed per block, several minutes per seed):
//   FOCAL_DENIAL_REPLAY=1 NODE_OPTIONS=--max-old-space-size=4096 \
//   npx vitest run tests/card/render/focal-denial-page-corpus-replay.test.ts \
//     --no-file-parallelism
//
// Outside a corpus machine (no expected-v2 / no sqlite) or with the env gate
// unset, both blocks skip so ordinary suite runs are unaffected.

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import readline from "node:readline";
import Database from "better-sqlite3";
import { describe, it, expect } from "vitest";
import { byteDiff, normalizeSlotIds } from "../../../src/testing/diff.js";
import { RAW_CORPUS_DB, createRawStructureSeededStorage } from "./raw-corpus-seeding.js";
import { skipLoud } from "../../support/describe-with-corpus.js";
import {
  FOCAL_DENIAL_EXEMPLARS,
  READABLE_CONTROLS,
  FOCAL_DENIAL_CENSUS_SUBSET,
} from "./focal-denial-page-subset.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..");
const PAGE_LANE_DIR = path.join(
  REPO_ROOT, "tmp", "raw-ground-truth", "expected-v2", "page-lane",
);
const OUT_DIR = path.join(REPO_ROOT, "tmp", "focal-denial-replay");

const REPLAY_REQUESTED = process.env.FOCAL_DENIAL_REPLAY === "1";
const CORPUS_PRESENT = existsSync(RAW_CORPUS_DB);
const SHARDS_PRESENT = existsSync(PAGE_LANE_DIR);

interface PageLaneLine {
  lane: string;
  name: string;
  page_html?: string;
  error?: unknown;
}

/** Stream every page-lane shard once; keep the yardstick page_html of the
 *  wanted names. Shard line order is stable, names are unique per shard. */
async function loadYardstick(names: Set<string>): Promise<Map<string, PageLaneLine>> {
  const found = new Map<string, PageLaneLine>();
  const fs = await import("node:fs");
  const files = existsSync(PAGE_LANE_DIR)
    ? fs.readdirSync(PAGE_LANE_DIR).filter((f) => /^recapture-raw-shard-\d{6}\.jsonl$/.test(f))
    : [];
  for (const file of files) {
    const rl = readline.createInterface({
      input: fs.createReadStream(path.join(PAGE_LANE_DIR, file)),
    });
    for await (const line of rl) {
      if (line.trim() === "") continue;
      if (!line.includes("page")) continue; // cheap prefilter before JSON.parse
      let obj: PageLaneLine;
      try {
        obj = JSON.parse(line) as PageLaneLine;
      } catch {
        continue;
      }
      if (obj.lane !== "page") continue;
      if (names.has(obj.name) && !found.has(obj.name)) found.set(obj.name, obj);
    }
  }
  return found;
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

/** The two markers that distinguish the loud-denial page class from a leaked
 *  titled body and from an ordinary readable page. */
function denialMarkers(html: string): { mainDenialSlot: boolean; sorryH1: boolean } {
  return {
    mainDenialSlot: /id="[^"]*-denial-view"/.test(html),
    sorryH1: html.includes("<h1>Sorry!</h1>"),
  };
}

describe("focal (loud) denial page corpus replay (R3.4.d)", () => {
  it(
    "renders the focal-denial exemplars and readable controls byte-identical to the yardstick",
    { timeout: 3_600_000 },
    async (ctx) => {
      if (!REPLAY_REQUESTED) {
        skipLoud(ctx, "tests/card/render/focal-denial-page-corpus-replay.test.ts", "REPLAY_REQUESTED");
        return;
      }
      expect(CORPUS_PRESENT, `raw corpus missing: ${RAW_CORPUS_DB}`).toBe(true);
      expect(SHARDS_PRESENT, `page-lane shards missing: ${PAGE_LANE_DIR}`).toBe(true);

      const wanted = new Set([
        ...FOCAL_DENIAL_EXEMPLARS.map((e) => e.name),
        ...READABLE_CONTROLS.map((e) => e.name),
      ]);
      const yardstick = await loadYardstick(wanted);
      const storage = await seedRawCorpusStorage();
      const evidence: string[] = [];
      const failures: string[] = [];
      try {
        for (const exemplar of FOCAL_DENIAL_EXEMPLARS) {
          const oracle = yardstick.get(exemplar.name);
          expect(oracle, `no page-lane yardstick entry for ${exemplar.name}`).toBeDefined();
          const expected = oracle?.page_html ?? "";
          let actual = "";
          let renderError: string | null = null;
          try {
            actual = await storage.engine.renderPage(exemplar.name);
          } catch (error) {
            const err = error as Error;
            renderError = `${err?.name ?? "Error"}: ${String(err?.message ?? error).slice(0, 200)}`;
          }
          const diff = byteDiff(normalizeSlotIds(expected), normalizeSlotIds(actual));
          evidence.push(
            JSON.stringify({
              role: "exemplar",
              name: exemplar.name,
              id: exemplar.id,
              verdict: diff.equal ? "pass" : "fail",
              renderError,
              expCodeUnits: diff.expectedCodeUnits,
              actCodeUnits: diff.actualCodeUnits,
              firstDiffOffset: diff.firstDifference?.codeUnitOffset ?? null,
              expExcerpt: diff.firstDifference?.expectedExcerpt ?? null,
              actExcerpt: diff.firstDifference?.actualExcerpt ?? null,
            }),
          );
          if (!diff.equal) {
            failures.push(
              renderError !== null
                ? `${exemplar.name} (id ${exemplar.id}): render raised — ${renderError}`
                : `${exemplar.name} (id ${exemplar.id}): engine page must equal the ` +
                  `yardstick denial page (exp ${diff.expectedCodeUnits} / ` +
                  `act ${diff.actualCodeUnits} code units` +
                  `${diff.firstDifference ? `, first diff at ${diff.firstDifference.codeUnitOffset}` : ""}: ` +
                  `${diff.firstDifference?.expectedExcerpt ?? ""} VS ` +
                  `${diff.firstDifference?.actualExcerpt ?? ""})`,
            );
          }
        }
        for (const control of READABLE_CONTROLS) {
          const oracle = yardstick.get(control.name);
          expect(oracle, `no page-lane yardstick entry for ${control.name}`).toBeDefined();
          const expected = oracle?.page_html ?? "";
          const actual = await storage.engine.renderPage(control.name);
          const actN = normalizeSlotIds(actual);
          const diff = byteDiff(normalizeSlotIds(expected), actN);
          const markers = denialMarkers(actN);
          evidence.push(
            JSON.stringify({
              role: "control",
              name: control.name,
              id: control.id,
              byteVerdict: diff.equal ? "byte-exact" : "byte-diff",
              byteFirstDiffOffset: diff.firstDifference?.codeUnitOffset ?? null,
              byteDiffNote:
                diff.equal ||
                !diff.firstDifference?.actualExcerpt ||
                !diff.firstDifference.expectedExcerpt
                  ? null
                  : `${diff.firstDifference.expectedExcerpt} VS ${diff.firstDifference.actualExcerpt}`,
              actDenialFrame: markers.mainDenialSlot,
              actSorryH1: markers.sorryH1,
            }),
          );
          // The over-deny contract: the readable page keeps its body -- the
          // page layer must not start denying it. Full byte equality is
          // evidence-only (see the module doc: the corpus' known
          // link-query-dropped class is another port's unit).
          expect(markers.mainDenialSlot, `${control.name}: readable control must not render a denial frame`).toBe(false);
          expect(markers.sorryH1, `${control.name}: readable control must not render the loud denial heading`).toBe(false);
          expect(actN.length, `${control.name}: readable control must render a body, not an empty page`).toBeGreaterThan(1000);
        }
      } finally {
        storage.close();
      }
      mkdirSync(OUT_DIR, { recursive: true });
      writeFileSync(
        path.join(OUT_DIR, "exemplars-and-controls-results.jsonl"),
        evidence.join("\n") + "\n",
      );
      expect(failures, failures.join("\n")).toEqual([]);
    },
  );

  it(
    "sweeps the stratified loud-denial census and records page-layer evidence",
    { timeout: 3_600_000 },
    async (ctx) => {
      if (!REPLAY_REQUESTED) {
        skipLoud(ctx, "tests/card/render/focal-denial-page-corpus-replay.test.ts", "REPLAY_REQUESTED");
        return;
      }
      expect(CORPUS_PRESENT, `raw corpus missing: ${RAW_CORPUS_DB}`).toBe(true);
      expect(SHARDS_PRESENT, `page-lane shards missing: ${PAGE_LANE_DIR}`).toBe(true);

      mkdirSync(OUT_DIR, { recursive: true });
      const names = new Set(FOCAL_DENIAL_CENSUS_SUBSET.map((e) => e.name));
      const yardstick = await loadYardstick(names);
      const storage = await seedRawCorpusStorage();
      const lines: string[] = [];
      let pass = 0;
      let fail = 0;
      try {
        for (const entry of FOCAL_DENIAL_CENSUS_SUBSET) {
          const oracle = yardstick.get(entry.name);
          const expected = oracle?.page_html ?? "";
          let actual: string;
          let renderError: string | null = null;
          try {
            actual = await storage.engine.renderPage(entry.name);
          } catch (error) {
            const err = error as Error;
            renderError = `${err?.name ?? "Error"}: ${String(err?.message ?? error).slice(0, 200)}`;
            actual = "";
          }
          const expN = normalizeSlotIds(expected);
          const actN = normalizeSlotIds(actual);
          const diff = byteDiff(expN, actN);
          if (diff.equal) pass++;
          else fail++;
          const expM = denialMarkers(expN);
          const actM = denialMarkers(actN);
          lines.push(
            JSON.stringify({
              name: entry.name,
              id: entry.id,
              boundary: entry.boundary === true,
              verdict: diff.equal ? "pass" : "fail",
              renderError,
              expCodeUnits: diff.expectedCodeUnits,
              actCodeUnits: diff.actualCodeUnits,
              firstDiffOffset: diff.firstDifference?.codeUnitOffset ?? null,
              expDenialFrame: expM.mainDenialSlot,
              actDenialFrame: actM.mainDenialSlot,
              actSorryH1: actM.sorryH1,
              expExcerpt: diff.firstDifference?.expectedExcerpt ?? null,
              actExcerpt: diff.firstDifference?.actualExcerpt ?? null,
            }),
          );
        }
      } finally {
        storage.close();
      }
      writeFileSync(path.join(OUT_DIR, "sweep-results.jsonl"), lines.join("\n") + "\n");
      // Report-only: the census NEVER gates the run. The line below is the
      // TOTALS evidence the receipt cites.
      console.log(`FOCAL-DENIAL-CENSUS TOTALS: ${pass} pass / ${fail} fail / ${pass + fail} pages`);
      expect(pass + fail).toBe(FOCAL_DENIAL_CENSUS_SUBSET.length);
    },
  );
});
