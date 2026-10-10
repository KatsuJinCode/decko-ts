// nest-miss-unknown-view-selection-corpus-replay.test.ts -- the p20-nest-
// selection port's gate: the c-structural class's nest-selection disagreement.
//
// MECHANISM (traced, not inferred). The class's two opposite directions are
// ONE mechanism: Card::View::Permission#alter_unknown (card-1.110.0
// lib/card/view/permission.rb:36-43). Every string nest fetches
// `Card.fetch cardish, new: {...}` (lib/card/format/nest/fetch.rb:29-33), so
// a nest whose target has no row still yields a virtual card, and the VIEW
// pipeline then asks whether the requested view survives on an unknown card:
//
//   def alter_unknown
//     return if card.known?
//     unknown_setting = setting :unknown
//     return if unknown_setting&.to_s == "true"
//     configured_view = (unknown || unknown_setting)&.to_sym
//     format.view_for_unknown configured_view   # nested: setting_view || :unknown
//   end
//
// `setting :unknown` resolves through the CARD'S SET CHAIN
// (render.rb:55-57 -> Card::Set::Format.view_setting_method_name) — i.e. only
// the set modules THAT MATCH THIS CARD contribute. The decisive declarations:
//   - card-mod-comment-0.20.0 set/right/discussion.rb:1-6:
//       %i[open open_content titled titled_content].each do |viewname|
//         view viewname, unknown: true do ... end
//       end
//     so a nonexistent `+discussion` renders its requested titled/open view
//     (the 19 Project +discussion slots the oracle emits).
//   - card-mod-bar_and_box-0.20.0 set/all/bar.rb:38 `view :closed -> :mini_bar`
//     (unknown: :mini_bar), so a nonexistent `+body notes` renders mini_bar
//     (the 2 BWjournal pages' seven missing mini_bar slots).
//   - No module declares `open` unknown:true for a List-typed `+Articles`
//     under Research, so that nest substitutes to the html `:unknown` view
//     (card-mod-format-0.20.0 set/all/html/error.rb:10-12) whose `createable`
//     gate (error.rb:15-17) yields "" for the anonymous capture session —
//     the nest emits NOTHING (the oracle renders a bare `<p></p>`), which is
//     the direction the engine got wrong (it rendered a phantom open slot).
//
// The engine's defect: RenderFormat#viewForUnknown consulted `unknown:`
// configs by VIEW NAME ONLY (the flat ModViewConfigTable keyed by view,
// mod-loader/mod-registrar.ts, plus the compiled-in UNKNOWN_VIEW_CONFIG
// fallback whose `open: true` row globalized the discussion right's
// declaration). Ruby's lookup is per-card-set; a flat table cannot answer
// both directions at once — that is the class's signature.
//
// FIX UNDER TEST: the unknown-setting lookup walks the card's own view chain
// (the same loader.viewChain(card.setKeys, view, format) the dispatcher
// walks) and takes the most specific entry that CARRIES an `unknown` key;
// the compiled-in `open: true` row is retired (it was the discussion right's
// per-set declaration encoded as a global).
//
// RUN (machine-local raw corpus + page-lane yardstick):
//   NEST_MISS_REPLAY=1 NODE_OPTIONS=--max-old-space-size=4096 \
//   npx vitest run \
//     tests/card/render/nest-miss-unknown-view-selection-corpus-replay.test.ts \
//     --no-file-parallelism
//
// Outside a corpus machine (no expected-v2 / no sqlite) or with the env gate
// unset, both blocks skip so ordinary suite runs are unaffected.

import { readdirSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, it, expect } from "vitest";
import { byteDiff, normalizeSlotIds } from "../../../src/testing/diff.js";
import { RAW_CORPUS_DB, createRawStructureSeededStorage } from "./raw-corpus-seeding.js";
import { NEST_MISS_PAGE_SUBSET } from "./nest-miss-unknown-view-selection-subset.js";
import { skipLoud } from "../../support/describe-with-corpus.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..");
const PAGE_LANE_DIR = path.join(REPO_ROOT, "tmp", "raw-ground-truth", "expected-v2", "page-lane");
const OUT_DIR = path.join(REPO_ROOT, "tmp", "nest-sel-replay");

const REPLAY_REQUESTED = process.env.NEST_MISS_REPLAY === "1";
const CORPUS_PRESENT = existsSync(RAW_CORPUS_DB);
const SHARDS_PRESENT = existsSync(PAGE_LANE_DIR);

/** The red-first exemplars — one per mechanism direction:
 *  "Associative Inquiry" (missing +discussion titled),
 *  "Diddly Squat" (phantom +Articles open),
 *  "CM 20100717 Sat" (missing seven mini_bar). */
const EXEMPLARS = ["Associative Inquiry", "Diddly Squat", "CM 20100717 Sat"];

interface PageLaneLine {
  lane: string;
  name: string;
  page_html?: string;
}

/** The ordered `card-slot` ids of a rendered page: id + leading view class,
 *  the same projection the mm-cstructural triage used
 *  (tmp/cstruct-index/triage.mjs). */
export function slotList(html: string): string[] {
  const out: string[] = [];
  const re = /<div id="([^"]+)" class="card-slot ([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) out.push(`${m[1]}  [${m[2].split(" ").slice(0, 2).join(" ")}]`);
  return out;
}

export interface SlotSetDiff {
  equal: boolean;
  missing: string[];
  phantom: string[];
  expectedCount: number;
  actualCount: number;
}

export function diffSlotSets(expected: string[], actual: string[]): SlotSetDiff {
  const expSet = new Set(expected);
  const actSet = new Set(actual);
  const missing = expected.filter((s) => !actSet.has(s));
  const phantom = actual.filter((s) => !expSet.has(s));
  return {
    equal: missing.length === 0 && phantom.length === 0 && expected.length === actual.length,
    missing,
    phantom,
    expectedCount: expected.length,
    actualCount: actual.length,
  };
}

async function loadYardstick(names: Set<string>): Promise<Map<string, PageLaneLine>> {
  const found = new Map<string, PageLaneLine>();
  if (!existsSync(PAGE_LANE_DIR)) return found;
  const files = readdirSync(PAGE_LANE_DIR).filter((f) =>
    /^recapture-raw-shard-\d{6}\.jsonl$/.test(f),
  );
  for (const file of files) {
    const { readFileSync } = await import("node:fs");
    const lines = readFileSync(path.join(PAGE_LANE_DIR, file), "utf8").split("\n");
    for (const line of lines) {
      if (line.trim() === "") continue;
      if (!line.includes('"page"')) continue;
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

describe("nest-miss unknown-view selection (34 c-structural nest-selection pages)", () => {
  it(
    "renders the exemplars with slot sets identical to the oracle pages",
    { timeout: 3_600_000 },
    async (ctx) => {
      if (!REPLAY_REQUESTED) {
        skipLoud(ctx, "tests/card/render/nest-miss-unknown-view-selection-corpus-replay.test.ts", "REPLAY_REQUESTED");
        return;
      }
      expect(CORPUS_PRESENT, `raw corpus missing: ${RAW_CORPUS_DB}`).toBe(true);
      expect(SHARDS_PRESENT, `page-lane shards missing: ${PAGE_LANE_DIR}`).toBe(true);

      const yardstick = await loadYardstick(new Set(EXEMPLARS));
      const storage = await seedRawCorpusStorage();
      try {
        for (const name of EXEMPLARS) {
          const oracle = yardstick.get(name);
          expect(oracle, `no page-lane yardstick entry for ${name}`).toBeDefined();
          const expected = normalizeSlotIds(oracle?.page_html ?? "");
          const actual = normalizeSlotIds(await storage.engine.renderPage(name));
          const diff = diffSlotSets(slotList(expected), slotList(actual));
          expect(
            diff.equal,
            `${name}: slot sets must match the oracle page ` +
              `(expected ${diff.expectedCount} slots, engine ${diff.actualCount}; ` +
              `missing: ${JSON.stringify(diff.missing)}; phantom: ${JSON.stringify(diff.phantom)})`,
          ).toBe(true);
        }
      } finally {
        storage.close();
      }
    },
  );

  it(
    "sweeps the 34 nest-selection pages and records flip evidence",
    { timeout: 3_600_000 },
    async (ctx) => {
      if (!REPLAY_REQUESTED) {
        skipLoud(ctx, "tests/card/render/nest-miss-unknown-view-selection-corpus-replay.test.ts", "REPLAY_REQUESTED");
        return;
      }
      expect(CORPUS_PRESENT, `raw corpus missing: ${RAW_CORPUS_DB}`).toBe(true);
      expect(SHARDS_PRESENT, `page-lane shards missing: ${PAGE_LANE_DIR}`).toBe(true);

      mkdirSync(OUT_DIR, { recursive: true });
      const yardstick = await loadYardstick(new Set(NEST_MISS_PAGE_SUBSET));
      const storage = await seedRawCorpusStorage();
      const lines: string[] = [];
      let slotPass = 0;
      let slotFail = 0;
      try {
        for (const name of NEST_MISS_PAGE_SUBSET) {
          const oracle = yardstick.get(name);
          const expected = normalizeSlotIds(oracle?.page_html ?? "");
          let actual = "";
          let renderError: string | null = null;
          try {
            actual = normalizeSlotIds(await storage.engine.renderPage(name));
          } catch (error) {
            const err = error as Error;
            renderError = `${err?.name ?? "Error"}: ${String(err?.message ?? error).slice(0, 200)}`;
          }
          const diff = diffSlotSets(slotList(expected), slotList(actual));
          if (diff.equal) slotPass++;
          else slotFail++;
          // Full-page byte verdict (slot ids normalized; both sides read
          // through normalizeSlotIds): the exemplars pinned byte-identical
          // after the fix — this records whether every class page does.
          const bytes = byteDiff(expected, actual);
          lines.push(
            JSON.stringify({
              name,
              slotEqual: diff.equal,
              expectedSlots: diff.expectedCount,
              actualSlots: diff.actualCount,
              missing: diff.missing,
              phantom: diff.phantom,
              bytesEqual: bytes.equal,
              expectedCodeUnits: bytes.expectedCodeUnits,
              actualCodeUnits: bytes.actualCodeUnits,
              firstByteDiff: bytes.firstDifference
                ? {
                    codeUnitOffset: bytes.firstDifference.codeUnitOffset,
                    expectedExcerpt: bytes.firstDifference.expectedExcerpt,
                    actualExcerpt: bytes.firstDifference.actualExcerpt,
                  }
                : null,
              renderError,
            }),
          );
        }
      } finally {
        storage.close();
      }
      writeFileSync(path.join(OUT_DIR, "sweep-results.jsonl"), lines.join("\n") + "\n");
      // eslint-disable-next-line no-console
      console.log(
        `NEST_MISS_SWEEP slot-set pass=${slotPass} fail=${slotFail} of ${NEST_MISS_PAGE_SUBSET.length}; ` +
          `results -> ${path.join(OUT_DIR, "sweep-results.jsonl")}`,
      );
    },
  );
});
