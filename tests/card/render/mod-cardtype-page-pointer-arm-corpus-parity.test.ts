// mod-cardtype-page-pointer-arm-corpus-parity.test.ts — the Mod cardtype
// page's pointer-arm routing, byte-for-byte against the raw-oracle page-lane
// yardstick (pageopen lane W2b #11, `Mod:page` +1457).
//
// WHAT THIS CLASS IS. The card named `Mod` (type_id 5, Cardtype) carries the
// core mod's SELF set `set/self/mod.rb` (card-1.110.0
// mod/core/set/self/mod.rb:1 `include_set Abstract::List`). Set modules load
// in pattern order 01_all .. 09_self (mod/core/set_pattern/), so the
// self-set's List html format block executes LAST and its `view :core`
// (`standard_pointer_core`, card-mod-list set/abstract/01_list/html_views.rb
// :2-13) overrides the Cardtype type-set's CqlSearch core
// (card-mod-search set/abstract/search_views.rb) for THIS card only. The
// ITEMS still come from the type-set's search: `item_cards`
// (0_search.rb:20-22 over `cql_content {type_id: id, sort_by: :name}`,
// card-mod-search set/type/cardtype.rb:3-5) outranks the ALL-set content
// default (card-mod-collection set/all/item.rb:26). The oracle page is
// therefore `card-list card-list-bar pointer-list` wrapping 20
// `pointer-item item-bar` bars (the first 20 of 36 Mod-typed cards in name
// order) plus the paging nav — and the card's STORED wiggle template
// (`<p>{{+description|content}}</p><p>{{_|add_button}}{{_|configure_button}}
// </p><p>{{+*type+by name|content}}</p>`, the corpus Mod row's content) never
// renders, which is why the oracle carries no `Add Mod` button. The engine's
// base core fell through to `processContent(renderRaw())` — the stored
// template — and rendered `search-result-item` x20 under
// `search-result-list` plus the `Add Mod` anchor instead (+1457 at base
// 69648930, first diff 7760).
//
// The expected bytes are the raw-oracle page-lane shard under
// tmp/raw-ground-truth/expected-v2/page-lane/ (gitignored, copied into the
// worktree; see REPO_DIR an internal work log).
//
// RUN (explicitly — needs the machine-local raw corpus, ~40s to seed plus
// one page render):
//   MODARM_REPLAY=1 NODE_OPTIONS=--max-old-space-size=6144 \
//   npx vitest run tests/card/render/mod-cardtype-page-pointer-arm-corpus-parity.test.ts \
//     --no-file-parallelism
//
// Outside a corpus machine (no raw corpus / no shards / env gate unset)
// the spec SKIPS, so ordinary suite runs neither slow down nor fail.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { byteDiff, normalizeSlotIds } from "../../../src/testing/diff.js";
import { setDeploymentCloudAssetHost } from "../../../src/card/render/views.js";
import { RAW_CORPUS_DB, createRawStructureSeededStorage } from "./raw-corpus-seeding.js";
import { skipLoud } from "../../support/describe-with-corpus.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..");
const PAGE_LANE_DIR = path.join(REPO_ROOT, "tmp", "raw-ground-truth", "expected-v2", "page-lane");

const REPLAY_REQUESTED = process.env.MODARM_REPLAY === "1";
const CORPUS_PRESENT = existsSync(RAW_CORPUS_DB);
const SHARDS_PRESENT = existsSync(PAGE_LANE_DIR);

interface PageLaneLine {
  lane: string;
  name: string;
  page_html?: string;
}

function loadModYardstick(): { entry: PageLaneLine; shard: string } | undefined {
  if (!SHARDS_PRESENT) return undefined;
  for (const file of readdirSync(PAGE_LANE_DIR).sort()) {
    if (!/^recapture-raw-shard-\d{6}\.jsonl$/.test(file)) continue;
    for (const line of readFileSync(path.join(PAGE_LANE_DIR, file), "utf8").split("\n")) {
      if (line.trim() === "") continue;
      let obj: PageLaneLine;
      try {
        obj = JSON.parse(line) as PageLaneLine;
      } catch {
        continue;
      }
      if (obj.lane === "page" && obj.name === "Mod") return { entry: obj, shard: file };
    }
  }
  return undefined;
}

describe("Mod cardtype page: the self-set pointer arm is oracle-pinned", () => {
  it(
    "renders the Mod page through the pointer-list arm, byte-identical to the oracle",
    { timeout: 3_600_000 },
    async (ctx) => {
      if (!REPLAY_REQUESTED) {
        skipLoud(ctx, "tests/card/render/mod-cardtype-page-pointer-arm-corpus-parity.test.ts", "REPLAY_REQUESTED");
        return;
      }
      expect(CORPUS_PRESENT, `raw corpus missing: ${RAW_CORPUS_DB}`).toBe(true);
      expect(SHARDS_PRESENT, `page-lane shards missing: ${PAGE_LANE_DIR}`).toBe(true);
      // The graded environment's cloud asset host (the corpus boot is a
      // DEPLOYMENT of the engine — fog asset_host; same block the
      // first-diff probe and the cloud-asset-host-deployment-config pin
      // set, BEFORE the corpus boot and the first render). Without it the
      // head bytes carry the engine-default fog s3 form and every
      // attachment URL diverges.
      setDeploymentCloudAssetHost(
        "https://source-deck-production-storage.r1.cdn.objectstore.example",
      );
      const yardstick = loadModYardstick();
      expect(yardstick, "no page-lane yardstick entry for Mod").toBeDefined();
      const expected = normalizeSlotIds(yardstick?.entry.page_html ?? "");

      const idLister = new Database(RAW_CORPUS_DB, { readonly: true });
      const allIds = (
        idLister.prepare("SELECT id FROM cards WHERE trash = 0 ORDER BY id").all() as Array<{
          id: number;
        }>
      ).map((r) => r.id);
      idLister.close();

      const storage = await createRawStructureSeededStorage(new Set(allIds));
      storage.fetcher.installNameEnvironment();
      await storage.fetcher.warmLexicon(allIds);

      const actual = normalizeSlotIds(await storage.engine.renderPage("Mod"));

      // The wrapper census (pageopen-lane.md section 2.3): expected 20
      // pointer-item / 0 search-result-item / no Add Mod button.
      const count = (h: string, token: string) => h.split(token).length - 1;
      expect(count(actual, "pointer-item")).toBe(20);
      expect(count(actual, "search-result-item")).toBe(0);
      expect(count(actual, "search-result-list")).toBe(0);
      expect(count(actual, "card-list card-list-bar pointer-list")).toBe(1);
      expect(count(actual, "Add Mod")).toBe(0);
      // The paging nav rides the paged pointer arm (36 items > limit 20).
      expect(count(actual, "paging-context")).toBe(1);
      expect(actual).toContain("of\n36\n");

      const diff = byteDiff(expected, actual);
      expect(
        diff.equal,
        `Mod page not byte-identical: ${diff.expectedCodeUnits} vs ${diff.actualCodeUnits} bytes, ` +
          `first diff at ${String(diff.firstDifference?.codeUnitOffset)} — ` +
          `${JSON.stringify(String(diff.firstDifference?.expectedExcerpt).slice(0, 200))} vs ` +
          `${JSON.stringify(String(diff.firstDifference?.actualExcerpt).slice(0, 200))}`,
      ).toBe(true);
    },
  );
});
