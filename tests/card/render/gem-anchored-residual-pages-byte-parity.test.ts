// gem-anchored-residual-pages-byte-parity.test.ts -- the gem-anchored-closure
// port's byte verdict for the three nest-selection residual pages the
// replays-adjudication documented and left red (its receipt, verdict
// table b2: 31/34 slot-set, 3 pages engine-side residual):
//
//   GIV-the god of intimate violence  -- the engine dropped the
//       +*referred_to_by content-view slot (the VirtualSearch family's
//       virtual? override was unported; card-mod-search-0.20.0
//       set/abstract/virtual_search.rb:11-12 -- FIXED, see
//       src/card/fetch/virtual-search-cards.ts);
//   *all+*head, PCTS+*self+*head      -- the engine rendered the Setting
//       cardtype's rule listing (rule_help alert + phantom rule bars) where
//       the oracle renders the CodeRay core (card-mod-layout
//       set/right/head.rb:16-18 view :core + set/self/head.rb:14-21
//       view :core -- FIXED in src/card/render/views.ts coreViewBase).
//
// The pins are FULL-PAGE BYTES against the recaptured oracle shards
// (slot ids normalized -- the same projection every page-parity suite
// uses). Env gate (the corpus seed costs ~40s; ordinary suite runs skip):
//   GEM_ANCHORED_CLOSURE_REPLAY=1
//
// RUN (machine-local raw corpus, through the test queue). The queue tool
// resolves its own repo root, so run this from the checkout you want -- the
// path to the tool used to be spelled as an absolute into the machine-root
// checkout, which no longer carries this repo's state:
//   node tools/test-queue/submit-test-job.mjs \
//     --name gemclose-family-pin --cwd <worktree> \
//     --cmd "npx vitest run tests/card/render/gem-anchored-residual-pages-byte-parity.test.ts --no-file-parallelism" \
//     --env GEM_ANCHORED_CLOSURE_REPLAY=1 --timeout-min 3

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, it, expect } from "vitest";
import { byteDiff, normalizeSlotIds } from "../../../src/testing/diff.js";
import { RAW_CORPUS_DB, createRawStructureSeededStorage } from "./raw-corpus-seeding.js";
import { skipLoud } from "../../support/describe-with-corpus.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..");
const PAGE_LANE_DIR = path.join(REPO_ROOT, "tmp", "raw-ground-truth", "expected-v2", "page-lane");

const REPLAY_REQUESTED = process.env.GEM_ANCHORED_CLOSURE_REPLAY === "1";
const CORPUS_PRESENT = existsSync(RAW_CORPUS_DB);
const SHARDS_PRESENT = existsSync(PAGE_LANE_DIR);

/** The three formerly-red pages, named by the replays-adjudication sweep
 *  (its tmp/nest-sel-replay/sweep-results.jsonl slot diffs). */
const PAGES = ["GIV-the god of intimate violence", "*all+*head", "PCTS+*self+*head"];

interface PageLaneLine {
  lane: string;
  name: string;
  page_html?: string;
}

function loadYardstick(names: Set<string>): Map<string, string> {
  const found = new Map<string, string>();
  if (!existsSync(PAGE_LANE_DIR)) return found;
  for (const file of readdirSync(PAGE_LANE_DIR).filter((f) =>
    /^recapture-raw-shard-\d{6}\.jsonl$/.test(f),
  )) {
    for (const line of readFileSync(path.join(PAGE_LANE_DIR, file), "utf8").split("\n")) {
      if (line.trim() === "" || !line.includes('"page"')) continue;
      let obj: PageLaneLine;
      try {
        obj = JSON.parse(line) as PageLaneLine;
      } catch {
        continue;
      }
      if (obj.lane === "page" && names.has(obj.name) && !found.has(obj.name)) {
        found.set(obj.name, obj.page_html ?? "");
      }
    }
  }
  return found;
}

describe("gem-anchored closure: the three residual pages render byte-identical", () => {
  it(
    "each page's bytes equal the oracle shard (slot ids normalized)",
    { timeout: 240_000 },
    async (ctx) => {
      if (!REPLAY_REQUESTED) {
        skipLoud(ctx, "tests/card/render/gem-anchored-residual-pages-byte-parity.test.ts", "REPLAY_REQUESTED");
        return;
      }
      expect(CORPUS_PRESENT, `raw corpus missing: ${RAW_CORPUS_DB}`).toBe(true);
      expect(SHARDS_PRESENT, `page-lane shards missing: ${PAGE_LANE_DIR}`).toBe(true);

      const yardstick = loadYardstick(new Set(PAGES));
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
      try {
        for (const name of PAGES) {
          const expectedHtml = yardstick.get(name);
          expect(expectedHtml, `no page-lane yardstick entry for ${name}`).toBeDefined();
          const expected = normalizeSlotIds(expectedHtml ?? "");
          const actual = normalizeSlotIds(await storage.engine.renderPage(name));
          const diff = byteDiff(expected, actual);
          expect(
            diff.equal,
            `${name}: page bytes must equal the oracle ` +
              `(expected ${diff.expectedCodeUnits}, engine ${diff.actualCodeUnits}; ` +
              `first diff at ${diff.firstDifference?.codeUnitOffset}: ` +
              `oracle ${JSON.stringify(diff.firstDifference?.expectedExcerpt)} vs ` +
              `engine ${JSON.stringify(diff.firstDifference?.actualExcerpt)})`,
          ).toBe(true);
        }
      } finally {
        storage.close();
      }
    },
  );
});
