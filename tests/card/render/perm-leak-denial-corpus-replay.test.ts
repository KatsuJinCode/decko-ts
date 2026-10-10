// perm-leak-denial-corpus-replay.test.ts -- an earlier triage's
// permission-verdict class, denial-wrapper-leak subset: pages where the
// engine RENDERS a read-denied card's main body where the oracle wraps the
// main slot in the denial frame (130 pages at tip 017b182; the triage is
// an internal work log in REPO_DIR).
//
// Root cause (traced on 20120122+CM+RVW, card 11179): the cold prepare
// render's folded batch died on SQLite's expression-depth limit (the
// prefetch closure's 1019-pair junction OR-tuple — see
// prefetch-side-id-pair-chunk.test.ts), the page path caught the prepare
// error and continued, and the sync render ran with ZERO permission
// verdicts — the unjudged-allowed contract rendered the denied body in
// full (titled-view slot where the oracle emits the denial-view frame).
//
// Two gated blocks:
//   1. THE LEAK EXEMPLARS (hard assert): the triage row's two leak-shaped
//      render byte-identical to the frozen yardstick page bytes
//      (expected-v2 page-lane, normalizeSlotIds-normalized). This is the
//      red-first contract: RED while the leak reproduces, GREEN only when
//      the denial renders where Ruby denies.
//   2. THE SWEEP (report-only): all 130 leak pages, one JSONL line each
//      (verdict, sizes, first-diff offset, denial-frame marker) written to
//      tmp/perm-leak-replay/sweep-results.jsonl — the flip-count evidence
//      for the receipt.
//
// RUN (machine-local raw corpus; ~130 page renders over the 47k-card deck):
//   PERM_LEAK_REPLAY=1 NODE_OPTIONS=--max-old-space-size=4096 \
//   npx vitest run tests/card/render/perm-leak-denial-corpus-replay.test.ts \
//     --no-file-parallelism
//
// Outside a corpus machine (no expected-v2 / no sqlite) or with the env
// gate unset, both blocks skip so ordinary suite runs are unaffected.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import readline from "node:readline";
import Database from "better-sqlite3";
import { describe, it, expect } from "vitest";
import { byteDiff, normalizeSlotIds } from "../../../src/testing/diff.js";
import { RAW_CORPUS_DB, createRawStructureSeededStorage } from "./raw-corpus-seeding.js";
import { PERM_LEAK_PAGE_SUBSET } from "./perm-leak-denial-page-subset.js";
import { skipLoud } from "../../support/describe-with-corpus.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..");
const PAGE_LANE_DIR = path.join(REPO_ROOT, "tmp", "raw-ground-truth", "expected-v2", "page-lane");
const OUT_DIR = path.join(REPO_ROOT, "tmp", "perm-leak-replay");

const REPLAY_REQUESTED = process.env.PERM_LEAK_REPLAY === "1";
const CORPUS_PRESENT = existsSync(RAW_CORPUS_DB);
const SHARDS_PRESENT = existsSync(PAGE_LANE_DIR);

/** The triage row's leak exemplars (denial-wrapper-leak shape: the engine
 *  rendered the read-denied main body where the oracle emits the denial
 *  frame). The row's third named card, FOR CHILDREN’S CLASS+*self, is the
 *  OPPOSITE shape — the oracle RENDERS a virtual rule-card bar
 *  (+*self+*head) the engine over-denies (permission_denied_mismatch sig;
 *  pre-existing at the base, pre-fix actual already carried 21 denial
 *  spans vs the oracle's 18). That is the candidate-walk/rules-algebra
 *  class, not the fail-open leak this suite fixes; this suite's contract
 *  ("deny where Ruby denies") does not permit widening to chase it. It
 *  stays pinned as a remaining diff in the receipt and the sweep
 *  block's JSONL below. */
const LEAK_EXEMPLARS = ["20120122+CM+RVW", "CM 20111201"];

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
  const files = existsSync(PAGE_LANE_DIR)
    ? (await import("node:fs")).readdirSync(PAGE_LANE_DIR).filter((f) => /^recapture-raw-shard-\d{6}\.jsonl$/.test(f))
    : [];
  for (const file of files) {
    const rl = readline.createInterface({
      input: (await import("node:fs")).createReadStream(path.join(PAGE_LANE_DIR, file)),
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

describe("perm-leak denial-wrapper corpus replay (130 triage pages)", () => {
  it(
    "renders the exemplars byte-identical to the yardstick denial pages",
    { timeout: 3_600_000 },
    async (ctx) => {
      if (!REPLAY_REQUESTED) {
        skipLoud(ctx, "tests/card/render/perm-leak-denial-corpus-replay.test.ts", "REPLAY_REQUESTED");
        return;
      }
      expect(CORPUS_PRESENT, `raw corpus missing: ${RAW_CORPUS_DB}`).toBe(true);
      expect(SHARDS_PRESENT, `page-lane shards missing: ${PAGE_LANE_DIR}`).toBe(true);

      const yardstick = await loadYardstick(new Set(LEAK_EXEMPLARS));
      const storage = await seedRawCorpusStorage();
      try {
        for (const name of LEAK_EXEMPLARS) {
          const oracle = yardstick.get(name);
          expect(oracle, `no page-lane yardstick entry for ${name}`).toBeDefined();
          const expected = oracle?.page_html ?? "";
          const actual = await storage.engine.renderPage(name);
          const diff = byteDiff(normalizeSlotIds(expected), normalizeSlotIds(actual));
          expect(
            diff.equal,
            `${name}: engine page must equal the yardstick denial page ` +
              `(exp ${diff.expectedCodeUnits} / act ${diff.actualCodeUnits} code units` +
              `${diff.firstDifference ? `, first diff at ${diff.firstDifference.codeUnitOffset}` : ""}: ` +
              `${diff.firstDifference?.expectedExcerpt ?? ""} VS ${diff.firstDifference?.actualExcerpt ?? ""})`,
          ).toBe(true);
        }
      } finally {
        storage.close();
      }
    },
  );

  it(
    "sweeps the 130 leak pages and records flip evidence",
    { timeout: 3_600_000 },
    async (ctx) => {
      if (!REPLAY_REQUESTED) {
        skipLoud(ctx, "tests/card/render/perm-leak-denial-corpus-replay.test.ts", "REPLAY_REQUESTED");
        return;
      }
      expect(CORPUS_PRESENT, `raw corpus missing: ${RAW_CORPUS_DB}`).toBe(true);
      expect(SHARDS_PRESENT, `page-lane shards missing: ${PAGE_LANE_DIR}`).toBe(true);

      mkdirSync(OUT_DIR, { recursive: true });
      const names = new Set(PERM_LEAK_PAGE_SUBSET.map((e) => e.name));
      const yardstick = await loadYardstick(names);
      const storage = await seedRawCorpusStorage();
      const lines: string[] = [];
      let pass = 0;
      let fail = 0;
      try {
        for (const entry of PERM_LEAK_PAGE_SUBSET) {
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
          lines.push(
            JSON.stringify({
              name: entry.name,
              triageSig: entry.sig,
              verdict: diff.equal ? "pass" : "fail",
              renderError,
              missingYardstick: oracle === undefined,
              expCodeUnits: diff.expectedCodeUnits,
              actCodeUnits: diff.actualCodeUnits,
              firstDiffOffset: diff.firstDifference?.codeUnitOffset ?? null,
              // The leak marker: the page card's MAIN slot must be the
              // denial frame (denial-view), never the rendered body view.
              actDenialFrame: /-denial-view" class="card-slot denial-view /.test(actN),
              expDenialFrame: /-denial-view" class="card-slot denial-view /.test(expN),
            }),
          );
        }
      } finally {
        storage.close();
      }
      writeFileSync(path.join(OUT_DIR, "sweep-results.jsonl"), lines.join("\n") + "\n");
      console.error(`PERM-LEAK SWEEP: ${pass}/${PERM_LEAK_PAGE_SUBSET.length} byte-exact (${fail} fail)`);
      expect(pass + fail).toBe(PERM_LEAK_PAGE_SUBSET.length);
    },
  );
});
