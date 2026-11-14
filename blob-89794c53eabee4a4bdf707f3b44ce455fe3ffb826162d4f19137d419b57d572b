// raw-corpus-raise-leadview-pages.test.ts -- the pin for the two named
// page-fail classes this suite owns (pass15-page-fail-classes.md):
//
//   CLASS 1 -- engine-raise-divergence (23 pages at tip 017b182): the
//   `X+*members` List-typed pages raised NameNotFoundError ("id doesn't
//   exist: N") mid-render and the two Date-typed pages (20190319, 20220323)
//   raised Date::Error, where the oracle renders the page.
//   FIXED, byte-exact here:
//   - the `~id` item marks resolve through the durable lexicon record
//     (DbLexicon#peekDurableName -- the port's substitute for Ruby's
//     synchronous SQL fallback, lexicon.rb:71-76, at the sync parse
//     boundary; the Temporary cache resets at 10,000 keys mid-warm).
//   - the dashed numeric dates Ruby accepts ("19-03-19" -> March 19, 2019;
//     verified against this machine's ruby 3.3) parse through
//     parseRubyDateContent (render/errors.ts) instead of raising.
//
//   CLASS 2 -- unsupported-view gap (34 pages): Role pages emitted
//   "view (lead) not supported" render-error alerts where the oracle
//   renders the lead view (help.rb:27-30: `class_up "card-slot", "lead";
//   _view_content`). FIXED: the lead view is registered in the compiled-in
//   HTML_VIEWS record (the graded page harness binds NO loader, so the
//   flat record is the dispatch), and the Role dashboards' `{{_L|configs}}`
//   nests dispatch the type/role.rb :configs view (also compiled-in, with
//   the admin runtime built lazily by the page prepare).
//
//   NAMED REMAINDER (not pinned here): the :configs view's ROLE -> items
//   grouping. The gem-source derivation (responsible_role: the *update
//   candidate walk over the deck rows) groups every star-named setting
//   under the *star+*update items over the corpus dump, while the captured
//   oracle pages distribute them across different role pages -- the
//   capture deck's live rule state diverged from the dump's rows (evidence
//   chain in an internal work log). For
//   Administrator / Help Desk this pin therefore asserts NO raise, NO
//   render-error alert, and the +description lead slot BYTE-EXACT (the
//   class's actual defect surface), and records the full-page divergence
//   evidence under tmp/raise-leadview/ for the next lane.
//
// RUN (explicitly; needs the machine-local raw corpus via
// tmp/raw-ground-truth -- see RAW_CORPUS_DB -- and ~1 minute of full-deck
// seeding):
//   RAISE_LEADVIEW_REPLAY=1 NODE_OPTIONS=--max-old-space-size=4096 \
//   npx vitest run tests/card/render/raw-corpus-raise-leadview-pages.test.ts \
//     --maxWorkers=2 --no-file-parallelism
//
// Outside a census machine (no corpus, or the env gate unset) the spec
// skips, so ordinary suite runs neither slow down nor fail on absent data.

import { existsSync, readdirSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
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
const OUT_DIR = path.join(REPO_ROOT, "tmp", "raise-leadview");

const REPLAY_REQUESTED = process.env.RAISE_LEADVIEW_REPLAY === "1";
const CORPUS_PRESENT = existsSync(RAW_CORPUS_DB);
const SHARDS_PRESENT = existsSync(PAGE_LANE_DIR);

/** Exemplar entries (yardstick page-lane ids pinned 2026-09-29). */
const CLASS1_EXEMPLARS = [
  { id: 34834, name: "Administrator+*members" },
  { id: 34837, name: "Shark+*members" },
  { id: 34188, name: "20190319" },
  { id: 40454, name: "20220323" },
  { id: 45385, name: "CB_role+*members" },
  { id: 45371, name: "Ellery Family+*members" },
] as const;

/** The lead-view pages: full-page byte-exact for Anyone; the two pages
 *  whose configs-role grouping is the named remainder pin their
 *  +description lead slot region instead. */
const LEAD_EXEMPLARS = [
  { id: 8, name: "Anyone", fullPage: true },
  { id: 10, name: "Administrator", fullPage: false },
  { id: 34791, name: "Help Desk", fullPage: false },
] as const;

/** Scan every page-lane shard once and return the entry for each wanted id
 *  (name-keyed; ids pinned from the yardstick 2026-09-29). */
function loadOraclePageEntries(
  wanted: ReadonlyArray<{ id: number; name: string }>,
): Map<string, { page_html?: string; error?: string }> {
  const byId = new Map(wanted.map((w) => [w.id, w]));
  const out = new Map<string, { page_html?: string; error?: string }>();
  for (const f of readdirSync(PAGE_LANE_DIR)) {
    if (!f.startsWith("recapture-raw-shard-") || !f.endsWith(".jsonl")) continue;
    const content = readFileSync(path.join(PAGE_LANE_DIR, f), "utf8");
    for (const line of content.split("\n")) {
      if (line.trim() === "") continue;
      const parsed = JSON.parse(line) as {
        lane?: string; id?: number; page_html?: string; error?: string;
      };
      if (parsed.lane !== "page" || parsed.id === undefined) continue;
      const want = byId.get(parsed.id);
      if (want !== undefined) {
        out.set(want.name, parsed);
      }
    }
  }
  return out;
}

/** The balanced-div region of one card slot: from the slot's opening
 *  `<div ...>` (the last open before the card's data-card-name attribute)
 *  through its matching close (the census specs' region extractor). */
function slotRegion(page: string, dataCardName: string): string {
  const anchor = `data-card-name="${dataCardName}"`;
  const at = page.indexOf(anchor);
  if (at < 0) throw new Error(`slot anchor not found: ${anchor}`);
  const start = page.lastIndexOf("<div ", at);
  if (start < 0) throw new Error(`no opening div before anchor: ${anchor}`);
  let depth = 0;
  for (const m of page.slice(start).matchAll(/<div\b|<\/div>/g)) {
    depth += m[0].startsWith("<div") ? 1 : -1;
    if (depth === 0) return page.slice(start, start + (m.index ?? 0) + m[0].length);
  }
  throw new Error(`unbalanced div region for: ${anchor}`);
}

describe("raw-corpus raise/leadview page exemplars", () => {
  it(
    "renders the class exemplar pages with the oracle's bytes",
    { timeout: 1_800_000 },
    async (ctx) => {
      if (!REPLAY_REQUESTED) {
        skipLoud(ctx, "tests/card/render/raw-corpus-raise-leadview-pages.test.ts", "REPLAY_REQUESTED");
        return;
      }
      expect(CORPUS_PRESENT, `raw corpus missing: ${RAW_CORPUS_DB}`).toBe(true);
      expect(SHARDS_PRESENT, `page-lane shards missing: ${PAGE_LANE_DIR}`).toBe(true);

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

      const oracleByPage = loadOraclePageEntries([
        ...CLASS1_EXEMPLARS,
        ...LEAD_EXEMPLARS,
      ]);

      mkdirSync(OUT_DIR, { recursive: true });
      const failures: string[] = [];
      const render = async (name: string): Promise<{ actual: string; raised: string | null }> => {
        try {
          return { actual: await storage.engine.renderPage(name), raised: null };
        } catch (error) {
          const err = error as Error;
          if (err?.stack) console.log(`STACK ${name}: ${err.stack.split("\n").slice(0, 12).join("\n")}`);
          return {
            actual: `CAPTURE_ERROR: ${err?.name ?? "Error"}: ${err?.message ?? String(error)}`,
            raised: `${err?.name ?? "Error"}: ${String(err?.message ?? error).slice(0, 300)}`,
          };
        }
      };

      // CLASS 1: full-page byte equality, no raise.
      for (const entry of CLASS1_EXEMPLARS) {
        const oracle = oracleByPage.get(entry.name);
        expect(oracle, `no yardstick entry for ${entry.name}`).toBeTruthy();
        const expected = normalizeSlotIds(oracle!.page_html ?? "");
        const { actual, raised } = await render(entry.name);
        const actualN = normalizeSlotIds(actual);
        const base = entry.name.replace(/[^\w.-]+/g, "_");
        writeFileSync(path.join(OUT_DIR, `${base}.exp.html`), expected);
        writeFileSync(path.join(OUT_DIR, `${base}.act.html`), actualN);
        const diff = byteDiff(expected, actualN);
        const detail = raised !== null
          ? `render raised ${raised}`
          : diff.equal
            ? "byte-exact"
            : `first diff at ${diff.firstDifference?.codeUnitOffset}: exp ${diff.firstDifference?.expectedChar} act ${diff.firstDifference?.actualChar}`;
        console.log(`${raised === null && diff.equal ? "PASS" : "FAIL"} ${entry.name}: ${detail}`);
        if (raised !== null || !diff.equal) {
          failures.push(`${entry.name}: ${detail}`);
        }
        expect(raised, `${entry.name} must not raise`).toBeNull();
        expect(diff.equal, `${entry.name} page bytes must equal the oracle`).toBe(true);
      }

      // CLASS 2: the lead view dispatches with the oracle's slot bytes.
      for (const entry of LEAD_EXEMPLARS) {
        const oracle = oracleByPage.get(entry.name);
        expect(oracle, `no yardstick entry for ${entry.name}`).toBeTruthy();
        const expected = normalizeSlotIds(oracle!.page_html ?? "");
        const { actual, raised } = await render(entry.name);
        const actualN = normalizeSlotIds(actual);
        const base = entry.name.replace(/[^\w.-]+/g, "_");
        writeFileSync(path.join(OUT_DIR, `${base}.exp.html`), expected);
        writeFileSync(path.join(OUT_DIR, `${base}.act.html`), actualN);

        expect(raised, `${entry.name} must not raise`).toBeNull();
        // The class defect was the in-page "view (lead) not supported" /
        // "view (configs) not supported" render-error alerts; both views
        // must dispatch. (The oracle pages legitimately carry OTHER
        // render-error spans, so the assertion targets the defect strings,
        // not the class.)
        expect(
          actualN.includes("view (lead) not supported"),
          `${entry.name} must carry no lead render-error alert`,
        ).toBe(false);
        expect(
          actualN.includes("view (configs) not supported"),
          `${entry.name} must carry no configs render-error alert`,
        ).toBe(false);

        // The lead slot (the +description nest the Role template renders
        // with view :lead) is the class's byte surface: pin it exactly.
        const expRegion = slotRegion(expected, `${entry.name}+description`);
        const actRegion = slotRegion(actualN, `${entry.name}+description`);
        expect(
          actRegion,
          `${entry.name} +description lead slot must equal the oracle's`,
        ).toBe(expRegion);

        const diff = byteDiff(expected, actualN);
        const detail = diff.equal
          ? "byte-exact"
          : `full page diverges from ${diff.firstDifference?.codeUnitOffset} (configs role-grouping remainder; evidence written)`;
        console.log(`${diff.equal ? "PASS" : "PARTIAL"} ${entry.name}: ${detail}`);
        if (entry.fullPage) {
          expect(
            diff.equal,
            `${entry.name} full page bytes must equal the oracle`,
          ).toBe(true);
        } else {
          writeFileSync(
            path.join(OUT_DIR, `${base}.remainder.txt`),
            `${entry.name}\n${detail}\n`,
          );
        }
      }
      if (failures.length > 0) {
        console.log(`FAILURES (${failures.length}):\n${failures.join("\n")}`);
      }
      expect(
        failures,
        `class-1 exemplars must render the oracle's bytes (evidence in ${OUT_DIR})`,
      ).toEqual([]);
    },
  );
});
