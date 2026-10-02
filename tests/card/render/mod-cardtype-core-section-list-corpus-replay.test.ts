// mod-cardtype-core-section-list-corpus-replay.test.ts -- the mm-cstructural
// port's dominant c-structural mechanism: the Mod cardtype's page body.
//
// MECHANISM (traced, not inferred). card-1.110.0 mod/core set/type/mod.rb:7-19
//    view :core do
//      render_section_views(%i[description settings configurations cardtypes
//                               styles scripts tasks views depends_on]
//                             .select { |name| card.send("#{name}?") })
//    end
//    def render_section_views list
//      list.map { |view_name| send("render_#{view_name}") }.compact.join "<br/>"
//    end
// A `mod: X` card stores NO content (the raw corpus's 36 mod-typed rows all
// carry content = ""), so the base core — `fmt.processContent(fmt.renderRaw())`
// over an empty db_content — emitted "". The engine therefore rendered an
// EMPTY `<div class="d0-card-body d0-card-content ALL TYPE-mod SELF-mod_X">`
// where the oracle renders 14-75 KB of section list, and every mod page's
// first difference sat at the same offset (7606 for mod: account): the
// d0-card-body open tag.
//
// The port of :core already existed in the mod module (core-mod.ts) with
// only a set/module registration, which is DEAD SURFACE on the graded path:
// the corpus verifier/census renders through a RenderEngine that never
// binds a ModLoader. The fix exports the same function (modCardCoreHtml) and
// dispatches it from the base coreView's `typeCode === "mod"` branch — the
// seam that already hosts the signup/toggle/markdown/image/file/bootswatch
// per-cardtype cores.
//
// POPULATION: 28 pages (the 27 mech=mod-body-empty rows of the pass-15
// c-structural class plus the mixed `mod: history` row) — see
// mod-cardtype-core-section-list-subset.ts and the triage table in the
// receipt (C:/localProjects/brandonDojoTech/tmp/wrong-goal-hunt/mm-cstructural-lane.md).
//
// TWO GATED BLOCKS:
//   1. THE EXEMPLARS (hard assert): `mod: account` and `mod: content` must
//      render byte-identical to the yardstick page bytes. Red-first: RED
//      while the body renders empty, GREEN only when the section list is
//      there. Both are chosen because they are OPPOSITE section sets —
//      account carries description+cardtypes+styles+scripts+depends_on,
//      content carries description only (no admin.yml sections, no assets).
//   2. THE SWEEP (report-only): all 28 mod pages, one JSONL line each,
//      written to tmp/mod-cardtype-replay/sweep-results.jsonl — the
//      flip-count evidence for the receipt.
//
// THE ONE NORMALIZATION, and why it is here and not in normalizeSlotIds:
// type/mod.rb:88-98 accordion_sections passes `context: title.hash` to
// card-mod-bootstrap's accordion_item.rb:6-14, which embeds it in the
// collapse id. Ruby 3.3's String#hash is SipHash over a PER-PROCESS seed,
// so the token is a property of the capture process, not of the card.
// MEASURED on this machine: `ruby -e '"Admin".hash'` returned 1041172290
// in one process and 967427061 in another; the yardstick carries a third,
// 97674992. The engine's stand-in (core-mod.ts stringHash) is a 31-hash,
// so no value it can produce is ever going to match, and no value the
// oracle produced is derivable. normalizeSlotIds is NOT widened for this:
// it mirrors the RECORDING layer (tools/oracle/capture.rb replaced
// data-slot-id and nothing else), and loosening it would weaken every
// other replay gate in the repo. The mask is local, and BOTH verdicts are
// reported — the strict one included — so nothing is hidden by it.
//
// RUN (machine-local raw corpus; 28 page renders over the 47k-card deck):
//   MOD_CARDTYPE_REPLAY=1 NODE_OPTIONS=--max-old-space-size=4096 \
//   npx vitest run \
//     tests/card/render/mod-cardtype-core-section-list-corpus-replay.test.ts \
//     --no-file-parallelism
//
// Outside a corpus machine (no expected-v2 / no sqlite) or with the env gate
// unset, both blocks skip so ordinary suite runs are unaffected.

import { readdirSync, writeFileSync, mkdirSync, existsSync, createReadStream } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import readline from "node:readline";
import Database from "better-sqlite3";
import { describe, it, expect } from "vitest";
import { byteDiff, normalizeSlotIds } from "../../../src/testing/diff.js";
import { RAW_CORPUS_DB, createRawStructureSeededStorage } from "./raw-corpus-seeding.js";
import { MOD_CARDTYPE_PAGE_SUBSET } from "./mod-cardtype-core-section-list-subset.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..");
const PAGE_LANE_DIR = path.join(REPO_ROOT, "tmp", "raw-ground-truth", "expected-v2", "page-lane");
const OUT_DIR = path.join(REPO_ROOT, "tmp", "mod-cardtype-replay");
const PAGES_DIR = path.join(OUT_DIR, "pages");

const REPLAY_REQUESTED = process.env.MOD_CARDTYPE_REPLAY === "1";
const CORPUS_PRESENT = existsSync(RAW_CORPUS_DB);
const SHARDS_PRESENT = existsSync(PAGE_LANE_DIR);

/** The red-first exemplars — one section-rich, one section-poor. */
const EXEMPLARS = ["mod: account", "mod: content"];

interface PageLaneLine {
  lane: string;
  name: string;
  page_html?: string;
}

/** type/mod.rb:88-98 accordion_sections passes `context: title.hash`, and
 *  card-mod-bootstrap's accordion_item.rb:6-14 embeds it in the collapse id
 *  (`card-#{card.name.safe_key}-#{args[:context]}-collapse-id`). Ruby 3.3's
 *  String#hash is SipHash over a PER-PROCESS seed, so that token is an
 *  artifact of the capture process, not a function of the card. MEASURED on
 *  this machine: `ruby -e '"Admin".hash'` returned 1041172290 in one process
 *  and 967427061 in another; the yardstick carries a third, 97674992. The
 *  engine's stand-in (core-mod.ts stringHash) is a 31-hash, so no value it
 *  can produce will ever match, and no value the oracle produced is
 *  derivable. The sign is part of the value on BOTH sides (the capture's own
 *  rows carry `card-mod_list--681338365-collapse-id`, a negative hash).
 *
 *  This mask is the REPO'S, not this suite's: tests/card/mod-loader/
 *  core-mod-admin-views.test.ts:50-57 and core-mod-admin-views-pin.test.ts
 *  apply `/(card-[0-9a-z_:]+-)-?[0-9]+(-collapse-id)/g -> $1HASH$2` for the
 *  same reason, and fixtures/captured/admin-view-pins.json records
 *  `normalizations: {"collapse-id": "HASH", "data-slot-id": "RANDOMIZED"}`.
 *  The shared normalizeSlotIds (src/testing/diff.ts) is deliberately NOT
 *  widened: it mirrors the RECORDING layer (tools/oracle/capture.rb replaced
 *  data-slot-id and nothing else), and loosening it would weaken every other
 *  replay gate in the repo. BOTH verdicts are reported by the sweep — the
 *  strict one included — so nothing is hidden by the mask. */
function maskCollapseId(s: string): string {
  return s.replace(/(card-[0-9a-z_:]+-)-?[0-9]+(-collapse-id)/g, "$1HASH$2");
}

/** Stream every page-lane shard once; keep the yardstick page_html of the
 *  wanted names. Shard line order is stable, names are unique per shard. */
async function loadYardstick(names: Set<string>): Promise<Map<string, PageLaneLine>> {
  const found = new Map<string, PageLaneLine>();
  if (!existsSync(PAGE_LANE_DIR)) return found;
  const files = readdirSyncShards();
  for (const file of files) {
    const rl = readline.createInterface({
      input: createReadStream(path.join(PAGE_LANE_DIR, file)),
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

function readdirSyncShards(): string[] {
  return readdirSync(PAGE_LANE_DIR).filter((f: string) =>
    /^recapture-raw-shard-\d{6}\.jsonl$/.test(f),
  );
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

describe("Mod cardtype core: the type/mod.rb section list (28 c-structural pages)", () => {
  it(
    "renders the exemplars byte-identical to the yardstick mod pages",
    { timeout: 3_600_000 },
    async (ctx) => {
      if (!REPLAY_REQUESTED) {
        ctx.skip();
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
          const expected = oracle?.page_html ?? "";
          const actual = await storage.engine.renderPage(name);
          const diff = byteDiff(normalizeSlotIds(expected), normalizeSlotIds(actual));
          const modDiff = byteDiff(
            maskCollapseId(normalizeSlotIds(expected)),
            maskCollapseId(normalizeSlotIds(actual)),
          );
          expect(
            modDiff.equal,
            `${name}: engine page must equal the yardstick mod page apart from the ` +
              `capture-process collapse id (strict verdict ${diff.equal ? "pass" : "fail"}; ` +
              `exp ${diff.expectedCodeUnits} / act ${diff.actualCodeUnits} code units` +
              `${modDiff.firstDifference ? `, first diff at ${modDiff.firstDifference.codeUnitOffset}` : ""}: ` +
              `${modDiff.firstDifference?.expectedExcerpt ?? ""} VS ${modDiff.firstDifference?.actualExcerpt ?? ""})`,
          ).toBe(true);
        }
      } finally {
        storage.close();
      }
    },
  );

  it(
    "sweeps the 28 mod pages and records flip evidence",
    { timeout: 3_600_000 },
    async (ctx) => {
      if (!REPLAY_REQUESTED) {
        ctx.skip();
        return;
      }
      expect(CORPUS_PRESENT, `raw corpus missing: ${RAW_CORPUS_DB}`).toBe(true);
      expect(SHARDS_PRESENT, `page-lane shards missing: ${PAGE_LANE_DIR}`).toBe(true);

      mkdirSync(OUT_DIR, { recursive: true });
      mkdirSync(PAGES_DIR, { recursive: true });
      const yardstick = await loadYardstick(new Set(MOD_CARDTYPE_PAGE_SUBSET));
      const storage = await seedRawCorpusStorage();
      const lines: string[] = [];
      let pass = 0;
      let fail = 0;
      let modPass = 0;
      let modFail = 0;
      try {
        for (const name of MOD_CARDTYPE_PAGE_SUBSET) {
          const oracle = yardstick.get(name);
          const expected = oracle?.page_html ?? "";
          let actual: string;
          let renderError: string | null = null;
          try {
            actual = await storage.engine.renderPage(name);
          } catch (error) {
            const err = error as Error;
            renderError = `${err?.name ?? "Error"}: ${String(err?.message ?? error).slice(0, 200)}`;
            actual = "";
          }
          const diff = byteDiff(normalizeSlotIds(expected), normalizeSlotIds(actual));
          if (diff.equal) pass++;
          else fail++;
          // The second verdict isolates the ONE difference no pure function
          // of the card can reproduce: type/mod.rb's accordion_sections
          // passes `context: title.hash`, and Ruby 3.3's String#hash is
          // SipHash over a PER-PROCESS seed (measured: two `ruby -e` runs
          // on this machine gave 1041172290 and 967427061 for "Admin"; the
          // oracle capture carries a third value, 97674992). So the
          // collapse id is a capture-process artifact, not engine behavior.
          // equalModuloCollapseId says whether anything ELSE differs.
          const modDiff = byteDiff(
            maskCollapseId(normalizeSlotIds(expected)),
            maskCollapseId(normalizeSlotIds(actual)),
          );
          if (modDiff.equal) modPass++;
          else modFail++;
          // The two sides on disk, so a residual can be diffed without a
          // re-render: `<safe>.expected.html` / `<safe>.actual.html`.
          const safe = name.replace(/[^A-Za-z0-9+._-]/g, "_");
          writeFileSync(path.join(PAGES_DIR, `${safe}.expected.html`), expected);
          writeFileSync(path.join(PAGES_DIR, `${safe}.actual.html`), actual);
          lines.push(
            JSON.stringify({
              name,
              verdict: diff.equal ? "pass" : "fail",
              verdictModuloCollapseId: modDiff.equal ? "pass" : "fail",
              modFirstDiffOffset: modDiff.firstDifference?.codeUnitOffset ?? null,
              modExpectedExcerpt: modDiff.firstDifference?.expectedExcerpt ?? null,
              modActualExcerpt: modDiff.firstDifference?.actualExcerpt ?? null,
              renderError,
              expectedBytes: diff.expectedCodeUnits,
              actualBytes: diff.actualCodeUnits,
              firstDiffOffset: diff.firstDifference?.codeUnitOffset ?? null,
              expectedExcerpt: diff.firstDifference?.expectedExcerpt ?? null,
              actualExcerpt: diff.firstDifference?.actualExcerpt ?? null,
              // the body-empty fingerprint this suite closed: the engine's
              // d0-card-body for a mod-typed card is empty
              engineBodyEmpty: /d0-card-content ALL TYPE-mod SELF-[^"]*"><\/div>/.test(actual),
              oracleBodyEmpty: /d0-card-content ALL TYPE-mod SELF-[^"]*"><\/div>/.test(expected),
            }),
          );
        }
      } finally {
        storage.close();
      }
      writeFileSync(path.join(OUT_DIR, "sweep-results.jsonl"), lines.join("\n") + "\n");
      // eslint-disable-next-line no-console
      console.log(
        `MOD_CARDTYPE_SWEEP strict pass=${pass} fail=${fail} of ${MOD_CARDTYPE_PAGE_SUBSET.length}; ` +
          `modulo-capture-collapse-id pass=${modPass} fail=${modFail}; ` +
          `results -> ${path.join(OUT_DIR, "sweep-results.jsonl")}`,
      );
      expect(
        modFail,
        `every mod page must equal its yardstick page apart from the capture-process ` +
          `collapse id; see ${path.join(OUT_DIR, "sweep-results.jsonl")}`,
      ).toBe(0);
    },
  );
});
