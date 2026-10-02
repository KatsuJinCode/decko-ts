// raw-corpus-found-by-type-by-name-search.test.ts -- the RED pin for the
// found_by CQL gap (the residual trio after the search-prepare lane:
// tmp/wrong-goal-hunt/search-prepare-fix.md section 3): the
// `<cardtype>+*type+by name` virtual searches (Sign up 12 / PlainText 22 /
// VAP 827) execute into the SQL generator's found_by refusal
// (src/cql/sql.ts "foundBy" case), runSearch's inner catch seats [] and the
// card_list view renders search-no-results where the oracle lists real
// result bars.
//
// Ruby semantics of the exercised chain (all pinned in the installed gems):
//  - card-mod-search set/right/by_name.rb: the virtual search's cql_content
//    is { found_by: "_left", sort_by: "name" } (the corpus structure rule
//    `by name+*right+*structure`, card 185, carries the same hash).
//  - card-1.110.0 lib/card/query/card_query/found_by.rb:27-39: a string
//    value fetches Card.fetch value.to_name.absolute(context) (`_left` ->
//    context.trunk, cardname-0.20.0 lib/cardname/contextual.rb:110) ->
//    `Sign up+*type`; :14-25 found_by_subquery merges the found card's
//    cql_hash with fasten: :direct, context: the found card's name; :18-25
//    raise BadQuery '"found_by" value must be valid Search' when the card
//    does not respond to cql_hash.
//  - `Sign up+*type` (corpus card 323) is Set-typed with EMPTY db content.
//    It still responds to cql_hash: card-mod-rules set/type/set.rb:1
//    includes Type::SearchType (-> Abstract::CqlSearch), and
//    card-mod-rules set/right/type.rb:5-7 OVERRIDES cql_content to
//    { type: "_left" } for every card tagged *type -- the empty db content
//    is never parsed. The subquery's context `Sign up+*type` absolutizes
//    its `_left` to `Sign up` (id 12): the effective statement is the
//    Sign up-typed cards, which is exactly the oracle's item list.
//
// Pins each of the three pages' `+*type+by name` search slot: the rendered
// region must equal the oracle's slot region byte-for-byte after slot-id
// normalization, with no search-no-results.
//
// RUN (explicitly; needs the machine-local raw corpus via tmp/raw-ground-truth
// and the page-lane shards -- same corpus machine as the 47-page replay):
//   SEARCH_CENSUS_REPLAY=1 NODE_OPTIONS=--max-old-space-size=4096 \
//   npx vitest run tests/card/render/raw-corpus-found-by-type-by-name-search.test.ts \
//     --maxWorkers=2 --no-file-parallelism
//
// Outside a census machine (no corpus, or the env gate unset) the spec skips,
// so ordinary suite runs neither slow down nor fail on absent data.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Database from "better-sqlite3";
import { afterAll, beforeAll, describe, it, expect } from "vitest";
import { byteDiff, normalizeSlotIds } from "../../../src/testing/diff.js";
import {
  RAW_CORPUS_DB,
  createRawStructureSeededStorage,
} from "./raw-corpus-seeding.js";
import type { RenderTestStorage } from "./render-test-storage.js";import {
  CENSUS_SEARCH_PAGE_SUBSET,
  loadCensusOraclePageEntry,
} from "./raw-corpus-search-census-page-subset.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..");
const PAGE_LANE_DIR = path.join(
  REPO_ROOT, "tmp", "raw-ground-truth", "expected-v2", "page-lane",
);
const OUT_DIR = path.join(REPO_ROOT, "tmp", "census-found-by");

const REPLAY_REQUESTED = process.env.SEARCH_CENSUS_REPLAY === "1";
const CORPUS_PRESENT = existsSync(RAW_CORPUS_DB);
const SHARDS_PRESENT = existsSync(PAGE_LANE_DIR);

/** The balanced-div region of one card slot: from the slot's opening
 *  `<div ...>` (the last open before the card's data-card-name attribute)
 *  through its matching close. Both sides are normalized slot-id bytes, so
 *  the regions are directly comparable. (Same extractor the
 *  layout-nest-preexecute pin uses.) */
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

/** The search-result REGION inside a search slot: the card-list div through
 *  its matching close, extended through the paging nav when one follows
 *  (`</div>\n<nav ...>...</nav>` — search_result_list's
 *  output([list, render_paging]).join("\n")). This is the region the
 *  found_by + paging units own. */
function searchResultRegion(page: string, dataCardName: string): string {
  const slot = slotRegion(page, dataCardName);
  const marker = '<div class="card-list card-list-';
  const at = slot.indexOf(marker);
  if (at < 0) return slot; // an empty slot (search-no-results): whole slot
  let depth = 0;
  let end = -1;
  for (const m of slot.slice(at).matchAll(/<div\b|<\/div>/g)) {
    depth += m[0].startsWith("<div") ? 1 : -1;
    if (depth === 0) {
      end = at + (m.index ?? 0) + m[0].length;
      break;
    }
  }
  if (end < 0) throw new Error(`unbalanced card-list region for: ${dataCardName}`);
  let region = slot.slice(at, end);
  const after = slot.slice(end);
  if (after.startsWith("\n<nav")) {
    const navEnd = after.indexOf("</nav>");
    if (navEnd < 0) throw new Error(`unterminated paging nav for: ${dataCardName}`);
    region += after.slice(0, navEnd + "</nav>".length);
  }
  return region;
}

/** page id -> (render name, the `+*type+by name` slot's data-card-name as
 *  both sides emit it). The three census pages whose only residual
 *  mechanism after the search-prepare lane was the empty found_by search. */
const PAGES: Array<{ id: number; name: string; slot: string }> = [
  { id: 12, name: "Sign up", slot: "Sign_up+*type+by_name" },
  { id: 22, name: "PlainText", slot: "PlainText+*type+by_name" },
  { id: 827, name: "VAP", slot: "VAP+*type+by_name" },
];

describe("raw-corpus found_by search (the +*type+by name trio)", () => {
  let storage: RenderTestStorage;

  beforeAll(async () => {
    if (!REPLAY_REQUESTED) return;
    const idLister = new Database(RAW_CORPUS_DB, { readonly: true });
    const everyLiveId = (
      idLister.prepare("SELECT id FROM cards WHERE trash = 0 ORDER BY id").all() as Array<{
        id: number;
      }>
    ).map((r) => r.id);
    idLister.close();
    storage = await createRawStructureSeededStorage(new Set(everyLiveId));
    storage.fetcher.installNameEnvironment();
    await storage.fetcher.warmLexicon(everyLiveId);
  }, 1_800_000);

  for (const page of PAGES) {
    it(
      `renders ${page.name} (${page.id}) +*type+by name with the oracle's result list`,
      { timeout: 600_000 },
      async (ctx) => {
        if (!REPLAY_REQUESTED) {
          ctx.skip();
          return;
        }
        expect(CORPUS_PRESENT, `raw corpus missing: ${RAW_CORPUS_DB}`).toBe(true);
        expect(SHARDS_PRESENT, `page-lane shards missing: ${PAGE_LANE_DIR}`).toBe(true);

        const subsetEntry = CENSUS_SEARCH_PAGE_SUBSET.find((e) => e.id === page.id);
        expect(subsetEntry, `id ${page.id} not in the census subset`).toBeDefined();
        const oracle = loadCensusOraclePageEntry(subsetEntry!, PAGE_LANE_DIR);
        const expected =
          oracle.error !== undefined ? String(oracle.error) : (oracle.page_html ?? "");
        const actual = await storage.engine.renderPage(page.name);

        const expN = normalizeSlotIds(expected);
        const actN = normalizeSlotIds(actual);

        const expRegion = searchResultRegion(expN, page.slot);
        const actRegion = searchResultRegion(actN, page.slot);
        const expSlot = slotRegion(expN, page.slot);
        const actSlot = slotRegion(actN, page.slot);

        mkdirSync(OUT_DIR, { recursive: true });
        const stem = `${page.id}-${page.name.replace(/\W+/g, "-")}`;
        writeFileSync(path.join(OUT_DIR, `${stem}.exp.html`), expN);
        writeFileSync(path.join(OUT_DIR, `${stem}.act.html`), actN);
        writeFileSync(path.join(OUT_DIR, `${page.id}.search-region.exp.html`), expRegion);
        writeFileSync(path.join(OUT_DIR, `${page.id}.search-region.act.html`), actRegion);
        writeFileSync(path.join(OUT_DIR, `${page.id}.search-slot.exp.html`), expSlot);
        writeFileSync(path.join(OUT_DIR, `${page.id}.search-slot.act.html`), actSlot);

        // fixture sanity: the oracle region is a real result list with items
        expect(expRegion).toContain("search-result-list");
        expect(expRegion).toContain("search-result-item");
        expect(expRegion).not.toContain("search-no-results");

        // the flip: the rendered region carries the same list, no
        // no-results span
        expect(actRegion).toContain("search-result-list");
        expect(actRegion).toContain("search-result-item");
        expect(actRegion).not.toContain("search-no-results");

        // byte parity of the search-result region (card list + paging nav)
        // against the oracle
        const diff = byteDiff(expRegion, actRegion);
        if (!diff.equal) {
          console.log(
            `SEARCH-REGION-DIFF ${page.name} expCodeUnits=${diff.expectedCodeUnits} ` +
              `actCodeUnits=${diff.actualCodeUnits} ` +
              `first=${JSON.stringify(diff.firstDifference)}`,
          );
        }
        expect(diff.equal).toBe(true);

        // Full-slot byte parity for the pages whose slot chrome has no
        // other unit's divergence: Sign up and VAP's found_by targets are
        // corpus rows (Sign up+*type 323 / VAP+*type 6575, both Set-typed).
        // PlainText+*type has NO corpus row; Ruby fabricates a Set-typed
        // pattern card and the slot class chain reads
        // TYPE_PLUS_RIGHT-set-by_name, while the render layer's left-type
        // fallback (format.ts leftTypeNameFor) answers the context card's
        // type (Cardtype) — TYPE_PLUS_RIGHT-cardtype-by_name. That chrome
        // token is the missing-pattern-side set-key unit, NOT the
        // found_by/paging units this pin owns, so PlainText pins the
        // search-result REGION only.
        if (page.id !== 22) {
          expect(byteDiff(expSlot, actSlot).equal).toBe(true);
        }
      },
    );
  }

  afterAll(() => {
    storage?.close();
  });
});
