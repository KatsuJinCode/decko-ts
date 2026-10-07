// phantom-item-simple-name-basic-cs-corpus-replay.test.ts -- the view187
// lane's RED-then-GREEN pin for the unresolved-host phantom identity.
//
// The mechanism (view187 census, 2026-10-04): a pointer/list item whose name
// has NO row and whose host resolves no item type (hostItemTypeName ->
// undefined) reaches phantomIdentity (src/card/render/views.ts). That chain
// currently returns the RichText card (the literal fitted on the compound
// MNv cascade, recapture-raw-shard-000016 ITM:page) for EVERY unresolved
// phantom. The graded corpus contradicts that for SIMPLE names: across all
// 48 view-lane shards, every mini_bar slot whose data-card-name has no row
// cross-tabs as -- simple x BasicCs 249, simple x RichText 0, compound x
// RichText 52, compound x BasicCs 0 (tmp/view187-census census instrument;
// the non-BasicCs simple types are the hostItemTypeName-resolved rule-typed
// phantoms, e.g. the +tags consideration items). Ruby's chain after the host
// item type misses is the assignment walk || the *default template walk
// (type.rb:58-66, the engine's newCardDefaultType -- render.ts:2076)
// landing on the deck's basic card, then the raw-pinned default: this deck's
// basic codename card is 22281 "BasicCs" (cards row verified; the corpus
// carries NO +*default rule rows at all, so the template walk returns
// undefined on the raw corpus and the raw constants apply).
//
// Graded surface: RVW (List card 4094, content "Rosalie Victoria
// Williamscraig" -- a simple-named phantom). The canvas fail
// dual-lane-view:RVW:render:open is a single -2 region: the engine emits
// data-card-type-id="3"/data-card-type-name="RichText"/TYPE-rich_text where
// the corpus pins 22281/"BasicCs"/basic_c in all four identity spots (slot
// class, slot data attrs, inner bar class, inner bar data attrs). The -2 is
// exactly len("rich_text")-len("basic_c"); id 3 vs 22281 rides the same
// tokens.
//
// RUN (machine-local raw corpus; one seed over the 47k-card deck, ~2-4 min):
//   VIEW187_PHANTOM_REPLAY=1 NODE_OPTIONS=--max-old-space-size=4096 \
//   npx vitest run tests/card/render/phantom-item-simple-name-basic-cs-corpus-replay.test.ts \
//     --no-file-parallelism
//
// Outside a corpus machine (no expected-v2 / no sqlite) or with the env gate
// unset, the suite skips so ordinary runs are unaffected.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, it, expect, afterAll } from "vitest";
import { RAW_CORPUS_DB, createRawStructureSeededStorage } from "./raw-corpus-seeding.js";
import { describeOrSkipLoud } from "../../support/describe-with-corpus.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..");
const VIEW_LANE_DIR = path.join(REPO_ROOT, "tmp", "raw-ground-truth", "expected-v2", "view-lane");

const REPLAY_REQUESTED = process.env.VIEW187_PHANTOM_REPLAY === "1";
const CORPUS_PRESENT = existsSync(RAW_CORPUS_DB);
const SHARDS_PRESENT = existsSync(VIEW_LANE_DIR);

const RUN = REPLAY_REQUESTED && CORPUS_PRESENT && SHARDS_PRESENT;

type RawStorage = Awaited<ReturnType<typeof createRawStructureSeededStorage>>;

let storage: RawStorage | undefined;
afterAll(() => {
  storage?.close();
});

/** One shared raw-corpus boot for the whole suite (seed ~30s). */
async function seedShared(): Promise<RawStorage> {
  if (storage === undefined) {
    const everyLiveId = everyCardId();
    storage = await createRawStructureSeededStorage(new Set(everyLiveId));
    storage.fetcher.installNameEnvironment();
    await storage.fetcher.warmLexicon(everyLiveId);
  }
  return storage;
}

describeOrSkipLoud(!RUN, "tests/card/render/phantom-item-simple-name-basic-cs-corpus-replay.test.ts", "RUN")("unresolved-host phantom identity: simple names take the deck basic card (view187 census)", () => {
  it(
    "RVW:open renders its simple-named phantom item with the deck basic identity (BasicCs/22281/basic_c), not RichText",
    async () => {
      const expected = loadExpected("RVW", "open");
      const s = await seedShared();
      const actual = await s.engine.render("RVW", "open");

      // The graded entry's ONLY divergence at the lane base was the phantom
      // identity tokens (single -2 region, first diff at 2503). Pin all four
      // identity spots on the item slot.
      expect(actual).toContain('id="rosalie_victorium_williamscraig-mini_bar-view"');
      const slotStart = actual.indexOf('id="rosalie_victorium_williamscraig-mini_bar-view"');
      const slotTag = actual.slice(slotStart, actual.indexOf(">", slotStart) + 1);
      expect(slotTag).toContain("TYPE-basic_c");
      expect(slotTag).not.toContain("TYPE-rich_text");
      expect(slotTag).toContain('data-card-type-id="22281"');
      expect(slotTag).toContain('data-card-type-name="BasicCs"');
      // The inner bar body identity rides the same phantom card.
      const bodyStart = actual.indexOf("<div class='bar ", slotStart);
      const bodyTag = actual.slice(bodyStart, actual.indexOf(">", bodyStart) + 1);
      expect(bodyTag).toContain("TYPE-basic_c");
      expect(bodyTag).toContain("data-card-type-id='22281'");
      expect(bodyTag).toContain("data-card-type-name='BasicCs'");
      // Byte-level: the entry's render equals the corpus expectation after
      // slot-id normalization (the graded comparison surface).
      const { compareNormalized } = await import("../../../src/testing/diff.js");
      const diff = compareNormalized(expected, actual);
      expect(diff.equal).toBe(true);
    },
    15 * 60 * 1000,
  );

  it(
    "compound-named phantom items keep the RichText identity (the MNv-cascade corpus pins; compound control)",
    async () => {
      const s = await seedShared();
      // "password reset email" content: its item "Decko_Bot+*account" is a
      // compound phantom the corpus pins RichText/3 (cross-tab compound x
      // RichText 52). This entry PASSES at the lane base via the RichText
      // fallback -- the compound arm must not move.
      const html = await s.engine.render("password reset email", "content");
      expect(html).toContain('data-card-name="Decko_Bot+*account"');
      const i = html.indexOf('data-card-name="Decko_Bot+*account"');
      const tag = html.slice(html.lastIndexOf("<div", i), i + 200);
      expect(tag).toContain("TYPE-rich_text");
      expect(tag).toContain('data-card-type-name="RichText"');
    },
    15 * 60 * 1000,
  );
});

/** -- helpers -- */

function everyCardId(): number[] {
  const db = new Database(RAW_CORPUS_DB, { readonly: true });
  const ids = (db.prepare("SELECT id FROM cards WHERE trash = 0").all() as Array<{ id: number }>).map(
    (r) => r.id,
  );
  db.close();
  return ids;
}

function loadExpected(name: string, view: string): string {
  const files = readdirSync(VIEW_LANE_DIR).filter((f) => f.endsWith(".jsonl")).sort();
  for (const f of files) {
    const lines = readFileSync(path.join(VIEW_LANE_DIR, f), "utf8").split("\n");
    for (const line of lines) {
      if (line.trim() === "" || !line.includes(`"name":"${name}"`)) continue;
      let obj: { lane?: string; name?: string; views?: Record<string, string> };
      try {
        obj = JSON.parse(line);
      } catch {
        continue;
      }
      if (obj.lane === "view" && obj.name === name && obj.views && typeof obj.views[view] === "string") {
        return obj.views[view];
      }
    }
  }
  throw new Error(`no view-lane expectation for ${name}:${view}`);
}
