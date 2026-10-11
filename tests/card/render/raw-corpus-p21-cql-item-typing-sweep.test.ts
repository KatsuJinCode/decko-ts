// raw-corpus-p21-cql-item-typing-sweep.test.ts -- an earlier CQL item-typing
// port's instrument (lane-p21-cqltype, base 46b6976). The class (p20-phantom-
// verdict-triage.md Family A, the phantom-TYPE arm): phantom list items must
// be TYPED from the winning `*content options` Search card's CQL `type` key
// (rule 1739 -> Project, 2978 -> consideration, 10280 -> Tracked Item), and a
// TYPED item the walk DENIES must render Ruby's plain quiet denial span, not
// the untyped phantom's mini_bar wrap with the two-span body.
//
// BASE MEASUREMENT (this suite, job-1790800593920-f006b263, 46b6976): the
// typing arm's ALLOWED side is already landed at this base -- Daemeon
// Reiydelle and Starhawk render BYTE-EXACT with the typed full bars
// (data-card-type-id 398 Project / 2979 consideration). The residual this
// port owns is the denied-arm SHAPE split:
//   - Social Media Distribution+Tactics: act 3 denial spans / 0 bare items
//     vs oracle 2 / 1 (the Tracked Item phantom 6582-denies but renders the
//     mini_bar two-span body).
//   - Production+design+Graphics+Tactics: act 9 / 2 bare vs oracle 6 / 5
//     (3 of the 4 phantoms render the wrong shape; the 4th, Dena Burd, and
//     the live Task item Merchandise already render the bare span).
// The engine fix seats the split on the host item type: hostItemType
// resolved (typed phantom) + read denied -> bare span; unresolved (template
// walk, the corpus's BasicCs family) -> mini_bar + two-span body unchanged.
//
// Pins (block 2, hard assert, RED at base for SMD/PdG):
//   1+2. Daemeon / Starhawk typed full-bar slots stay byte-exact
//        (regression guards -- GREEN at base, disclosed as such).
//   3.   SMD 1->2: page total 2 denials, one bare denied item.
//   4.   PdG 3->6: page total 6 denials, five bare denied items -- the
//        Merchandise guard lives here (rule 23368 denies the live Task card;
//        a typing change that touched stored-card lookups would flip it and
//        break the count).
//   5.   GUARD Exhibit+Item+*type plus right: 22 full rule bars, denials
//        <= oracle. NOT pinned byte-exact: the page carries a PRE-EXISTING
//        30-byte diff at offset 53737 at this base (the *content options
//        rule bar's one-line content renders empty where the oracle shows
//        the rule JSON) -- a rule-bar content seat outside this suite's
//        class, disclosed in the receipt.
// BW Oversight+ARCHETYPALLY is REPORT-ONLY: its diff is the `_left`
// live-climb arm owned by the sibling port.
//
// RUN (machine-local raw corpus; P21_CQL_ITEM_TYPING=1; ONE corpus boot --
// two boots in one vitest process crash natively on this machine, see the
// p20-perm-residuals receipt's STATUS_STACK_BUFFER_OVERRUN note and this
// suite's job-1790800593920-f006b263):
//   npx vitest run tests/card/render/raw-corpus-p21-cql-item-typing-sweep.test.ts \
//     --no-file-parallelism  (with P21_CQL_ITEM_TYPING=1 in the environment)

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
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
const OUT_DIR = path.join(REPO_ROOT, "tmp", "p21-cql-item-typing");

const SWEEP_REQUESTED = process.env.P21_CQL_ITEM_TYPING === "1";

const CLASS_PAGES = [
  "Emery Lockhart",
  "Starhawk",
  "Social Media Distribution+Tactics",
  "Production+design+Graphics+Tactics",
];
const GUARD_PAGES = ["Exhibit+Item+*type plus right"];
const REPORT_ONLY_PAGES = ["BW Oversight+ARCHETYPALLY"];

/** The oracle slot-opening byte excerpts (read from the page-lane shards
 *  this session) pinning the TYPED FULL item bars. */
const TYPED_SLOT_PINS: ReadonlyArray<{ page: string; excerpt: string }> = [
  {
    page: "Emery Lockhart",
    excerpt:
      '<div id="improving_project_success_through_myth_discovery-mini_bar-view" ' +
      'class="card-slot mini_bar-view ALL TYPE-project" ' +
      'data-card-name="Improving Project Success through Myth Discovery" ' +
      'data-card-type-id="398" data-card-type-name="Project"',
  },
  {
    page: "Starhawk",
    excerpt:
      '<div id="starhawk_ha_not_yet_contributed_directly_to_example.com-mini_bar-view" ' +
      'class="card-slot mini_bar-view ALL TYPE-consideration" ' +
      'data-card-name="Starhawk has not yet contributed directly to the reference deck" ' +
      'data-card-type-id="2979" data-card-type-name="consideration"',
  },
];

/** The bare denied pointer-item shape the raw oracle renders for the typed
 *  denied phantoms (SMD x1, PdG x5) -- and for the known-denied live card
 *  Merchandise. */
const BARE_DENIED_ITEM = '<div class="pointer-item item-bar"><span class="denied">';

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

/** Denial-span counts split at the host card's body: spans before it are
 *  page chrome (nav bar), spans after are the page's own content + footer. */
function denialSplit(html: string): { total: number; chrome: number; content: number } {
  const bodyAt = html.indexOf("d0-card-body");
  let chrome = 0;
  let content = 0;
  let idx = 0;
  while ((idx = html.indexOf('class="denied"', idx + 1)) > 0) {
    if (bodyAt >= 0 && idx < bodyAt) chrome++;
    else content++;
  }
  return { total: chrome + content, chrome, content };
}

function countOccurrences(html: string, needle: string): number {
  let n = 0;
  let idx = 0;
  while ((idx = html.indexOf(needle, idx + 1)) > 0) n++;
  return n;
}

describe(
  "p21 CQL item-typing lane sweep (typed phantom items: full bar when readable, bare denial span when denied)",
  () => {
    it(
      "renders the class + guard pages, records flip evidence, pins the guards (single corpus boot)",
      { timeout: 3_600_000 },
      async (itCtx) => {
        if (!SWEEP_REQUESTED) {
          skipLoud(itCtx, "tests/card/render/raw-corpus-p21-cql-item-typing-sweep.test.ts", "SWEEP_REQUESTED");
          return;
        }
        expect(existsSync(PAGE_LANE_DIR), `page-lane shards missing: ${PAGE_LANE_DIR}`).toBe(true);

        const allPages = [...CLASS_PAGES, ...GUARD_PAGES, ...REPORT_ONLY_PAGES];
        const oracleByPage = loadOraclePageEntries(allPages);
        const storage = await seedRawCorpusStorage();
        mkdirSync(OUT_DIR, { recursive: true });
        const lines: string[] = [];
        const rendered = new Map<string, string>();
        try {
          for (const name of allPages) {
            const oracle = oracleByPage.get(name);
            if (oracle === undefined) {
              lines.push(JSON.stringify({ name, verdict: "NO-ORACLE" }));
              continue;
            }
            const expected = normalizeSlotIds(oracle.page_html ?? "");
            let actual: string;
            let renderError: string | null = null;
            try {
              actual = normalizeSlotIds(await storage.engine.renderPage(name));
            } catch (error) {
              const err = error as Error;
              renderError = `${err?.name ?? "Error"}: ${String(err?.message ?? error).slice(0, 300)}`;
              actual = "";
            }
            rendered.set(name, actual);
            const diff = byteDiff(expected, actual);
            const expSplit = denialSplit(expected);
            const actSplit = denialSplit(actual);
            lines.push(
              JSON.stringify({
                name,
                pinned: CLASS_PAGES.includes(name) || GUARD_PAGES.includes(name),
                verdict: diff.equal ? "pass" : "fail",
                renderError,
                expCodeUnits: diff.expectedCodeUnits,
                actCodeUnits: diff.actualCodeUnits,
                firstDiffOffset: diff.firstDifference?.codeUnitOffset ?? null,
                expDenied: expSplit,
                actDenied: actSplit,
                expBareDeniedItems: countOccurrences(expected, BARE_DENIED_ITEM),
                actBareDeniedItems: countOccurrences(actual, BARE_DENIED_ITEM),
                expBarViews: countOccurrences(expected, "card-slot bar-view"),
                actBarViews: countOccurrences(actual, "card-slot bar-view"),
                actTypedSlotPins: TYPED_SLOT_PINS.filter((p) => p.page === name).map((p) => ({
                  present: actual.includes(p.excerpt),
                })),
              }),
            );
            const base = name.replace(/[^\w.-]+/g, "_");
            writeFileSync(path.join(OUT_DIR, `${base}.exp.html`), expected);
            writeFileSync(path.join(OUT_DIR, `${base}.act.html`), actual);
          }
        } finally {
          storage.close();
        }
        writeFileSync(path.join(OUT_DIR, "sweep-results.jsonl"), lines.join("\n") + "\n");
        console.error(`P21-CQL-ITEM-TYPING SWEEP: wrote ${lines.length} page lines`);
        expect(lines.length).toBe(allPages.length);

        // ---- pins (asserted AFTER the artifacts are written so a red pin
        // still leaves the full exp/act pairs + JSONL on disk) ----

        // PINS 1+2 (regression guards, GREEN at base): the allowed arm's
        // typed full bars stay.
        for (const pin of TYPED_SLOT_PINS) {
          expect(
            rendered.get(pin.page)?.includes(pin.excerpt),
            `${pin.page}: the phantom item must keep its typed full bar`,
          ).toBe(true);
        }

        // PIN 3 (SMD 1->2, RED at base): the Tracked Item-typed phantom
        // (10280) denies via 6582 and renders the BARE quiet denial span.
        {
          const act = rendered.get("Social Media Distribution+Tactics") ?? "";
          expect(
            denialSplit(act).total,
            `SMD page denial count (act split ${JSON.stringify(denialSplit(act))})`,
          ).toBe(2);
          expect(
            countOccurrences(act, BARE_DENIED_ITEM),
            "SMD bare denied item slots",
          ).toBe(1);
        }

        // PIN 4 (PdG 3->6, RED at base): the 4 phantoms deny (6582 x4,
        // bare spans) AND the live Task item Merchandise STAYS denied
        // (23368 -- a stored-card rule no typing change may touch).
        {
          const act = rendered.get("Production+design+Graphics+Tactics") ?? "";
          expect(
            denialSplit(act).total,
            `PdG page denial count (act split ${JSON.stringify(denialSplit(act))})`,
          ).toBe(6);
          expect(
            countOccurrences(act, BARE_DENIED_ITEM),
            "PdG bare denied item slots (4 phantoms + Merchandise)",
          ).toBe(5);
        }

        // PIN 5 (GUARD, counts only -- see the file header for the
        // pre-existing one-line-content diff this suite does not own):
        // Exhibit+Item's 22 full rule bars stay and the page gains no
        // denial.
        {
          const oracle = oracleByPage.get("Exhibit+Item+*type plus right");
          expect(oracle, "no page-lane yardstick entry for Exhibit+Item+*type plus right").toBeDefined();
          const expected = normalizeSlotIds(oracle?.page_html ?? "");
          const act = rendered.get("Exhibit+Item+*type plus right") ?? "";
          expect(countOccurrences(act, "card-slot bar-view"), "Exhibit+Item rule bar count").toBe(22);
          expect(
            denialSplit(act).total,
            "Exhibit+Item denial count must not exceed the oracle's",
          ).toBeLessThanOrEqual(denialSplit(expected).total);
        }
      },
    );
  },
);

function corpusPresent(): boolean {
  return existsSync(RAW_CORPUS_DB) && existsSync(PAGE_LANE_DIR);
}
