// navbar-crlf-head-family-pages-byte-parity.test.ts -- the navbar-cr suite's
// byte verdict for the four *head-family rule pages the gem-anchored-closure
// receipt listed as the one residual class (its verdict: each differs
// from its oracle shard by one CR in the navbar join, engine 0 CRs vs oracle
// 1 CR at offset ~4916):
//
//   FrAi+*right+*head, GBA+*right+*head, *head+*self, *head+*right
//
// The navbar CR's source is corpus card 22752 "*main menu", whose db content
// is "[[*Opportunities|Opportunities]]\r\n[[*search|Changes]]" -- exactly one
// CRLF between the two link chunks. Ruby keeps it because navbar_items walks
// process_content(nil, chunk_list: :references) and renders every non-link
// chunk with chunk.process_chunk verbatim (card-mod-layout-0.20.0
// set/all/navbar_links.rb:10-21); the port keeps it the same way -- the walk
// in src/card/render/navbar-views.ts pushes the text BETWEEN link-chunk
// matches with content.slice(lastIndex, m.index), and the seeded dbContent
// carries the corpus bytes verbatim (raw-corpus-seeding.ts dbContent:
// row.content). The prior receipt's "engine 0 CRs" was a measurement
// artifact: the probe dump written at that worktree's own tip
// (tmp/gemclose-probe/cand-*.html) carries the CR at the oracle offset and is
// slot-normalized identical to the oracle shards. This suite pins the
// byte-exact state so the deck-wide class (20,597 corpus cards store CR in
// content) cannot silently regress in the navbar join.
//
// The pins are FULL-PAGE BYTES against the recaptured oracle shards
// (slot ids normalized -- the same projection every page-parity suite uses).
// Env gate (the corpus seed costs ~40s; ordinary suite runs skip):
//   NAVBAR_CR_PARITY=1
//
// RUN (machine-local raw corpus, through the test queue). The queue tool
// resolves its own repo root, so run this from the checkout you want -- the
// path to the tool used to be spelled as an absolute into the machine-root
// checkout, which no longer carries this repo's state:
//   node tools/test-queue/submit-test-job.mjs \
//     --name navbarcr-parity-pin --cwd <worktree> \
//     --cmd "npx vitest run tests/card/render/navbar-crlf-head-family-pages-byte-parity.test.ts --no-file-parallelism" \
//     --env NAVBAR_CR_PARITY=1 --timeout-min 3

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, it, expect } from "vitest";
import { byteDiff, normalizeSlotIds } from "../../../src/testing/diff.js";
import { RAW_CORPUS_DB, createRawStructureSeededStorage } from "./raw-corpus-seeding.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..");
const PAGE_LANE_DIR = path.join(REPO_ROOT, "tmp", "raw-ground-truth", "expected-v2", "page-lane");

const REPLAY_REQUESTED = process.env.NAVBAR_CR_PARITY === "1";
const CORPUS_PRESENT = existsSync(RAW_CORPUS_DB);
const SHARDS_PRESENT = existsSync(PAGE_LANE_DIR);

/** The four *head-family rule pages (the prior receipt's residual class). */
const PAGES = ["FrAi+*right+*head", "GBA+*right+*head", "*head+*self", "*head+*right"];

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

describe("navbar CR class: the four *head-family pages render byte-identical", () => {
  it(
    "each page's bytes equal the oracle shard (slot ids normalized), navbar CRLF preserved",
    { timeout: 240_000 },
    async (ctx) => {
      if (!REPLAY_REQUESTED) {
        ctx.skip();
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
