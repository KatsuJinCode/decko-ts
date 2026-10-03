// raw-corpus-type-plus-right-prototype-left-type-pins.test.ts -- the
// tpr-regression-fix lane's byte pins. One card page, THREE surfaces
// (view-lane content + open, page-lane page_html), each asserted BYTE-EXACT
// against the captured Ruby oracle after normalizeSlotIds:
//
//   Search+large image+*type plus right   shard 000013  content + open + page
//
// The entry was regression grade #4 in the fold-4 canvas re-grade: all three
// surfaces grew exactly +327 bytes against every prior tip, and the first-diff
// showed the oracle rendering the inherit-perm span
// (`<span class="inherit-perm">Inherit from left card</span>`,
// card-mod-permissions set/abstract/permission.rb:98-105) where the engine
// resolved the rule row to a stored candidate and rendered a pointer-list item
// ("Shark").
//
// MECHANISM (Ruby, card/mod/core/set_pattern/08_type_plus_right.rb:23-28 +
// card/mod/rules set/type/set.rb:90-93 + mod/rules set/rule/editor.rb:119-130):
// `set_prototype` for a *type plus right rule is
//   Card.fetch("+large image", new: { supercard: Card.new(name: "*dummy", type: "Search") })
// and `existing_rule_from_prototype` reads THAT card's `rule_lookup_keys`
// (card/lib/card/set/pattern/all.rb:63-65 -> pattern/base.rb:75-81) against
// Card::Rule.rule_cache (card/lib/card/rule/cache.rb:42-70). The TPR pattern's
// rule_lookup_key is anchored on `left_type(card) = card.superleft&.type_name`
// (set_pattern/class_methods.rb:59-71) — the prototype's SUPERCARD, typed with
// the set anchor's TRUNK ("Search"), not the registry's unknown-left-type
// default ("RichText"). Corpus:
//   17701+type_plus_right+create MISS, 17700+right+create MISS,
//   22+type+create MISS (the prototype types PlainText, via
//   Search+large image+*type plus right+*structure = rule 17703, PlainText-typed,
//   through templating.rb:52-65 new_card_template/dup_structure)
//   -> all_plus+create HIT *all plus+*create (rule 6567, content "_left")
//   -> permission.rb:14-20 renders core_inherit_content.
//
// With the RichText default the TPR *structure candidate misses, the walk falls
// to `large image+*right+*structure` (rule 17705, HTML-typed), the prototype
// types HTML, and the *create/*update/*delete walks hit
// HTML+*type+*<setting> (rules 6553/6558/6562, "Shark").
//
// The Gallery10 twin is the control: its anchor trunk IS RichText, so the
// default coincides with the Ruby value (its *structure rule 10525 is
// HTML-typed) and its [Shark] rows must keep rendering.
//
// RUN (explicitly; needs the machine-local raw corpus via tmp/raw-ground-truth
// and the view/page lane shards -- one corpus boot, three renders):
//   TPR_REGRESSION_PINS=1 NODE_OPTIONS=--max-old-space-size=6144 \
//   npx vitest run tests/card/render/raw-corpus-type-plus-right-prototype-left-type-pins.test.ts \
//     --maxWorkers=2 --no-file-parallelism
//
// Outside a census machine (no corpus, or the env gate unset) the spec skips,
// so ordinary suite runs neither slow down nor fail on absent data.

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, it, expect } from "vitest";
import { byteDiff, normalizeSlotIds } from "../../../src/testing/diff.js";
import { RAW_CORPUS_DB, createRawStructureSeededStorage } from "./raw-corpus-seeding.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..");
const VIEW_LANE_DIR = path.join(REPO_ROOT, "tmp", "raw-ground-truth", "expected-v2", "view-lane");
const PAGE_LANE_DIR = path.join(REPO_ROOT, "tmp", "raw-ground-truth", "expected-v2", "page-lane");

const PINS_REQUESTED = process.env.TPR_REGRESSION_PINS === "1";
const CORPUS_PRESENT = existsSync(RAW_CORPUS_DB);
const SHARDS_PRESENT = existsSync(VIEW_LANE_DIR) && existsSync(PAGE_LANE_DIR);

/** The card page under repair, and the two shard files carrying it. */
const CARD = "Search+large image+*type plus right";
const VIEW_SHARD = "recapture-raw-shard-000013.jsonl";
const PAGE_SHARD = "recapture-raw-shard-000013.jsonl";

/** The Gallery10 control: same pattern, anchor trunk IS RichText, [Shark] rows. */
const CONTROL = "RichText+Gallery10+*type plus right";
const CONTROL_SHARD = "recapture-raw-shard-000006.jsonl";

interface ShardLine {
  name: string;
  views?: Record<string, string>;
  lane?: string;
  page_html?: string;
}

function readShard(dir: string, shard: string): ShardLine[] {
  return (readFileSync(path.join(dir, shard), "utf8")
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => JSON.parse(l) as ShardLine));
}

function pageOracle(dir: string, shard: string, name: string): string | undefined {
  return readShard(dir, shard).find((l) => l.name === name)?.page_html;
}

describe.runIf(PINS_REQUESTED && CORPUS_PRESENT && SHARDS_PRESENT)(
  "type-plus-right prototype left-type pins (view-lane + page-lane oracle bytes)",
  () => {
    it("renders the trio byte-exact against the oracle (fix IN)", async () => {
      const idLister = new Database(RAW_CORPUS_DB, { readonly: true });
      const everyLiveId = (
        idLister.prepare("SELECT id FROM cards WHERE trash = 0").all() as Array<{
          id: number;
        }>
      ).map((r) => r.id);
      idLister.close();
      const storage = await createRawStructureSeededStorage(new Set(everyLiveId));
      try {
        storage.fetcher.installNameEnvironment();
        await storage.fetcher.warmLexicon(everyLiveId);
        const viewShards = new Map<string, ShardLine[]>();
        const readViewShard = (shard: string): ShardLine[] => {
          let lines = viewShards.get(shard);
          if (lines === undefined) {
            lines = readShard(VIEW_LANE_DIR, shard);
            viewShards.set(shard, lines);
          }
          return lines;
        };
        const failures: string[] = [];

        // --- the repaired trio: view-lane content + open, page-lane page ---
        const line = readViewShard(VIEW_SHARD).find((l) => l.name === CARD);
        expect(line, `${CARD}: MISSING ORACLE (view-lane ${VIEW_SHARD})`).toBeDefined();
        for (const view of ["content", "open"] as const) {
          const expected = line?.views?.[view];
          expect(expected, `${CARD}::${view}: MISSING ORACLE`).toBeDefined();
          const actual = await storage.engine.render(CARD, view);
          const d = byteDiff(normalizeSlotIds(expected ?? ""), normalizeSlotIds(actual));
          if (!d.equal) {
            failures.push(
              `${CARD}::${view} (expected ${d.expectedCodeUnits}, engine ${d.actualCodeUnits}` +
                `${d.firstDifference != null ? `, first diff @${d.firstDifference.codeUnitOffset}` : ""})`,
            );
          }
        }
        const pageExpected = pageOracle(PAGE_LANE_DIR, PAGE_SHARD, CARD);
        expect(pageExpected, `${CARD}: MISSING ORACLE (page-lane ${PAGE_SHARD})`).toBeDefined();
        const pageActual = await storage.engine.renderPage(CARD);
        const pageDiff = byteDiff(
          normalizeSlotIds(pageExpected ?? ""),
          normalizeSlotIds(pageActual),
        );
        if (!pageDiff.equal) {
          failures.push(
            `${CARD}::page (expected ${pageDiff.expectedCodeUnits}, engine ${pageDiff.actualCodeUnits}` +
              `${pageDiff.firstDifference != null ? `, first diff @${pageDiff.firstDifference.codeUnitOffset}` : ""})`,
          );
        }

        // --- the Gallery10 control: the [Shark] rows must NOT regress ---
        const controlLine = readViewShard(CONTROL_SHARD).find((l) => l.name === CONTROL);
        for (const view of ["content", "open"] as const) {
          const expected = controlLine?.views?.[view];
          expect(expected, `${CONTROL}::${view}: MISSING ORACLE`).toBeDefined();
          const actual = await storage.engine.render(CONTROL, view);
          const d = byteDiff(normalizeSlotIds(expected ?? ""), normalizeSlotIds(actual));
          if (!d.equal) {
            failures.push(
              `CONTROL ${CONTROL}::${view} (expected ${d.expectedCodeUnits}, engine ${d.actualCodeUnits}` +
                `${d.firstDifference != null ? `, first diff @${d.firstDifference.codeUnitOffset}` : ""})`,
            );
          }
        }

        expect(failures).toEqual([]);
      } finally {
        storage.close();
      }
    }, 900_000);
  },
);
