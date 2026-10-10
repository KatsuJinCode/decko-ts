// The +*referred_to_by search result set (census M3, serializer-followup-2
// 2026-10-03): Family+*referred_to_by renders Ruby's virtual-search shape
// (card-mod-search set/right/referred_to_by.rb: cql_content
// { refer_to: "_left", sort_by: "name" }, paging limit 20) over the corpus's
// card_references graph, read-filtered at the relation level
// (card-1.110.0 lib/card/query/sql_statement/where.rb:79-84
// permission_conditions: `read_rule_id IN (viewer's readable rule ids)`,
// BEFORE limit_and_offset — the same seam the engine rides via
// cqlPermissionOptions, render.ts runSearch).
//
// THE MECHANISM THIS PIN CLOSES: the seed used to NULL the stored name on
// EVERY compound row (render-test-storage.ts). For the corpus's 23 SIDE-LESS
// compound rows (left_id/right_id NULL — e.g. 3265 "CM 20101222+Associations")
// the pair-lex path cannot form and the search-item name composition has no
// source, so every search listing whose results hang off those rows rendered
// empty where the graded Family page carries five result bars. The seed keeps
// the stored name on side-less compound rows (the row's only lawful source;
// key === name verbatim there) and the listing closes byte-exact.
//
// DOCUMENTED RESIDUAL (expectation anomaly, M7/M9 class — NOT pinned as a
// match): live's second result bar renders as a read-DENIED mini_bar named
// "BW_20110109+Associations+tags" (underscore inflection). The corpus
// contradicts both surfaces: the card's stored read rule 9121 (left 9120
// "CM 20110109+Associations", right 6547 *read) carries "Anyone" — the
// anonymous viewer READS it and the engine's granted bar is the corpus
// verdict — and the corpus stores the left's name with spaces. The capture's
// permission material and name inflection post-date/pre-date the corpus
// generation; the pre-scrub capture-era deck is not on disk to confirm
// (checked  development.sqlite3: a different
// generation, zero reference rows). The pin asserts the engine's
// corpus-faithful shape for that bar so any future walk change that denies
// it (or renames it) fails here.
//
// Env-gated like every corpus-replay suite (the seed costs ~40s):
//   REFERRED_TO_BY_RESULT_SET_REPLAY=1

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, it, expect } from "vitest";
import { setDeploymentFollowLiveConfig } from "../../../src/card/render/deployment-follow-live-config.js";
import {
  RAW_CORPUS_DB,
  createRawStructureSeededStorage,
} from "./raw-corpus-seeding.js";
import { renderPageBytes } from "../../../src/card/render/page.js";
import { skipLoud } from "../../support/describe-with-corpus.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..");
const FAMILY_PAIR = path.join(
  REPO_ROOT,
  "tmp",
  "serializer-followup",
  "probe-green5",
  "expected--Family__page.html",
);

const REPLAY_REQUESTED = process.env.REFERRED_TO_BY_RESULT_SET_REPLAY === "1";

/** The graded referred_to_by region of the Family page: from the search
 *  view's wrapper div through its matching close (the boundary walk the
 *  census instruments use). */
function gradedFamilyRegion(): string {
  const html = readFileSync(FAMILY_PAIR, "utf8");
  return referredToByRegion(html, "family");
}

/** The referred_to_by :content region of a rendered page, by boundary walk
 *  from the slot's wrapper open to its matching close. */
function referredToByRegion(html: string, key: string): string {
  const marker = `${key}-Xreferred_to_by-content-view`;
  const at = html.indexOf(marker);
  if (at < 0) throw new Error(`no referred_to_by slot for ${key}`);
  const open = html.lastIndexOf("<div", at);
  const tail = html.slice(open, open + 400000);
  let depth = 0;
  const re = /<\/?div/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tail)) !== null) {
    if (m[0] === "<div") depth += 1;
    else {
      depth -= 1;
      if (depth === 0) return tail.slice(0, m.index + m[0].length);
    }
  }
  throw new Error(`unbalanced region for ${key}`);
}

/** Item names in render order (the graded listing's identity). */
function itemNames(region: string): string[] {
  const out: string[] = [];
  const re = /data-card-name="([^"]+)"/g;
  const blocks = region.split('<div class="search-result-item item-bar">').slice(1);
  for (const b of blocks) {
    const m = b.match(/data-card-name="([^"]+)"/);
    out.push(m ? m[1] : "(unnamed)");
  }
  return out;
}

/** The graded-noise fold the probe applies: slot-id VALUES are per-render
 *  (data-slot-id on the slot wrapper and the inner bar div), and the inner
 *  div's data-slot-id attribute quote style varies (live haml single-quotes
 *  it, the engine double-quotes it) — the census instruments fold
 *  "slot-id values + quote style" for exactly this surface. Everything else
 *  compares byte-exact. */
function foldSlotIds(s: string): string {
  return s
        .replace(/data-slot-id=(["'])[0-9a-f]{20}\1/g, "data-slot-id=SLOTID")
    .replace(/data-slot-id='[0-9a-f]{20}'/g, "data-slot-id=SLOTID");
}

function blocksOf(region: string): string[] {
  const marker = '<div class="search-result-item item-bar">';
  const at: number[] = [];
  let idx = region.indexOf(marker);
  while (idx >= 0) {
    at.push(idx);
    idx = region.indexOf(marker, idx + 1);
  }
  return at.map((start, i) => {
    const end = i + 1 < at.length ? at[i + 1] : region.length;
    return region.slice(start, end);
  });
}

describe("+*referred_to_by: the search result set over the corpus graph", () => {
  it(
    "renders the graded Family listing: five bars in the graded order, granted bars byte-exact",
    { timeout: 240_000 },
    async (ctx) => {
      if (!REPLAY_REQUESTED) {
        skipLoud(ctx, "tests/card/render/referred-to-by-search-result-set-corpus-replay-pins.test.ts", "REPLAY_REQUESTED");
        return;
      }
      // The graded environment's live deployment constants (the probe
      // harness's own binding; serializerFollowsLive() gates the bar-body
      // class order and the rest of the live-mode bytes).
      setDeploymentFollowLiveConfig({
        serializerEra: "live",
        defaultHtmlViewNest: "content",
        mainStylesheetRevisionDigits: "1790384218",
        footerDeckoVersion: "0.19.1",
        recaptchaSiteKey: "6LeRJb4UAAAAANqYxbHo_VwgJY9aWwieAp6493sW",
        deckoRootUrl: "https://example.com/",
      });

      const db = new Database(RAW_CORPUS_DB, { readonly: true });
      const everyLiveId = (
        db.prepare("SELECT id FROM cards WHERE trash = 0 ORDER BY id").all() as Array<{
          id: number;
        }>
      ).map((r) => r.id);
      db.close();

      const storage = await createRawStructureSeededStorage(new Set(everyLiveId));
      storage.fetcher.installNameEnvironment();
      await storage.fetcher.warmLexicon(everyLiveId);
      try {
        const page = await renderPageBytes(storage.engine, "Family");
        const region = referredToByRegion(page, "family");

        // THE PIN: the graded five-bar listing in the graded order. RED at
        // the pre-fix seed (the side-less rows' names were dropped, every bar
        // hanging off them vanished, one item rendered).
        const graded = gradedFamilyRegion();
        const gradedNames = itemNames(graded);
        expect(gradedNames).toEqual([
          "CM 20101222+Associations+tags",
          "BW_20110109+Associations+tags",
          "tracked item test+associations+tags",
          "WilliamsCraig Library+Associations+tags",
          "Schema",
        ]);
        const engineNames = itemNames(region);
        // Bar 2 is the documented residual: the corpus's stored name for the
        // left (3364) carries spaces where the capture-era deck carried the
        // underscore inflection — same key, different stored bytes.
        expect(engineNames).toEqual([
          "CM 20101222+Associations+tags",
          "CM 20110109+Associations+tags",
          "tracked item test+associations+tags",
          "WilliamsCraig Library+Associations+tags",
          "Schema",
        ]);

        // The four corpus-supported bars: byte-exact against the graded
        // bytes (modulo the graded slot-id fold).
        const gradedBlocks = blocksOf(graded);
        const engineBlocks = blocksOf(region);
        expect(gradedBlocks).toHaveLength(5);
        expect(engineBlocks).toHaveLength(5);
        for (const i of [0, 2, 3, 4]) {
          expect(foldSlotIds(engineBlocks[i]), `bar ${i} bytes`).toBe(
            foldSlotIds(gradedBlocks[i]),
          );
        }

        // Bar 2's documented residual, pinned on the corpus-faithful side:
        // the engine renders the GRANTED bar (stored read rule 9121 carries
        // "Anyone") with the corpus-spelled name — not the capture's denied
        // mini_bar. A permission-walk change that denies this card, or a
        // name-composition change that respells it, fails here.
        expect(engineBlocks[1]).toContain('id="bw_20110109-association-tag-bar-view"');
        expect(engineBlocks[1]).toContain('class="card-slot bar-view ');
        expect(engineBlocks[1]).toContain('title="CM 20110109+Associations+tags"');
        expect(engineBlocks[1]).not.toContain('<span class="denied">');
      } finally {
        storage.close();
      }
    },
  );
});
