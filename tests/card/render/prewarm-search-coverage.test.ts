// Pin the byte-level contract of the render-perf prewarm fix: the prewarm
// must discover
// every Search-type card in the seeded deck by the SAME codename the engine
// gates on (card.typeCode === "search_type", the codename the type card's
// codehash carries — src/card/render.ts:1189 sets card.typeCode =
// peekNameForId(typeId) + render.ts:1258 + render.ts:1131). The original
// discovery gate read the type card's NAME ("Search") instead of its
// codename ("search_type"); a deck whose search-type cards carry a
// random-named type card (codename=search_type, name=ztpmqk) made the old
// discovery skip every card → searches=0 → closureWarm returned false
// for every search-type rule card after prewarm → warm renders paid cold
// closures.
//
// The fix: prewarm gates on codename, not name. Since the lazy-parse
// seam (render.ts prepareSearches) a search card whose cql parse fails is
// recorded IN THE ENGINE (searchFailures marker + empty seat) and the walk
// completes — the raise moved to the dispatch boundary (engine.resolveView,
// view-gated on :open/:content), so the prewarm's
// catch arm no longer feeds the render path at all. The pins below lock
// both halves: the seat coverage (closureWarm budget-0) and the boundary
// raise/NoRaise per view.

import { describe, expect, it } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "./render-test-storage.js";
import { prewarmStaticDeck } from "../../support/prewarm-static-deck.js";
import type { RenderCard } from "../../../src/card/render.js";
import type { CardRecord } from "../../../src/card/fetch/card-record.js";

/** Seed the deck's own read substrate, deck-ACCURATELY typed.
 *
 *  This suite's deck is corpus-shaped: card 1 is the Basic type card and
 *  card 2 is the SEARCH type card (random name "ztpmqk", codename
 *  "search_type"), which is also this fixture's default type id. A real
 *  Decko deck's read substrate is never Search-typed — Set and Setting are
 *  Cardtype cards, the party cards carry their own type, and the
 *  `*all+*read` rule junction carries the junction type (captured corpus
 *  rows: fixtures/test-corpus/test-corpus.sqlite3 — codename "set" type_id
 *  = the cardtype card, `*all+*read` type_id = the junction type, neither of
 *  them the Search type). The shared bootstrap seeds those rows with the
 *  deck's DEFAULT type id, which here IS the Search type card, so the
 *  prewarm's gate on typeCode "search_type" legitimately discovered five
 *  substrate rows as search cards and the count pin read 7 instead of 2.
 *
 *  Seeding the deck's own copies takes the codenames and the rule's sides
 *  over from the bootstrap rows (render-test-storage's releaseStockCard /
 *  repointStockReferences), leaving the deck exactly the shape a real deck
 *  has: one `*all` SET card, the `*read` setting, the Anyone/Anonymous
 *  parties, and `*all+*read` -> [[Anyone]] (card/auth/setup.rb:44). */
async function seedTypedReadSubstrate(storage: RenderTestStorage, cardtypeId: number): Promise<void> {
  // Set (cardtype-typed), then *all typed WITH it — the read-rule cache join
  // filters on `sets.type_id = <the Set card's id>` (read_rule_cache.rb), so
  // *all's type must be this deck's own Set card.
  await seedCard(storage, { id: 60, name: "Set", codename: "set", typeId: cardtypeId });
  await seedCard(storage, { id: 61, name: "*all", codename: "all", typeId: 60 });
  await seedCard(storage, { id: 62, name: "*read", codename: "read", typeId: cardtypeId });
  await seedCard(storage, { id: 63, name: "Anyone", codename: "anyone", typeId: cardtypeId });
  await seedCard(storage, { id: 64, name: "Anonymous", codename: "anonymous", typeId: cardtypeId });
  // the rule card: a junction (NULL name/key, sides only - the 2020 Lexicon
  // migration) whose db_content names the party, plus the card_references row
  // that puts it in read_rules_hash (read_rule_cache.rb's join).
  await seedCard(storage, {
    id: 65,
    leftId: 61,
    rightId: 62,
    typeId: cardtypeId,
    dbContent: "[[Anyone]]",
    readRuleId: 65,
    readRuleClass: "*all",
  });
  await seedReference(storage, 65, 63, "anyone");
}

interface EnginePrewarmSeam {
  searchResults: Map<string, RenderCard[]>;
  renderCards: Map<string, RenderCard>;
  closureWarm(record: CardRecord): boolean;
}

interface PrewarmFailingSeed {
  id: number;
  name: string;
  /** The corrupted content (empty or non-JSON) that should trigger the
   *  prewarm's try/catch wrapper and seed searchResults with [] instead
   *  of propagating the BadQuery raise. */
  dbContent: string;
  /** Card key (DeckoName.parse(name).key — pre-canonicalized here). */
  key: string;
}

describe("prewarm-static-deck: Search-type coverage (post-1ec2761 parity fix)", () => {
  // ----- the discovery gate itself ---------------------------------------

  it("discovers Search-type cards by codename 'search_type', not by name 'Search' (corpus-shaped fixture)", async () => {
    // Prewarm fix: the type card's NAME is "ztpmqk" (NOT "Search") —
    // a deck whose search type card is not literally named "Search";
    // the codename is "search_type".
    // The fix discovers this card via peekNameForId(typeId) which reads
    // the codehash (src/card/fetch/codename.ts:80-82). The old
    // typeRecord?.name?.s !== 'Search' gate silently skipped it.
    const storage = await createRenderTestStorage();
    try {
      await seedCard(storage, { id: 1, name: "Basic", codename: "basic", typeId: 1 });
      // The search type card: random name "ztpmqk",
      // codename "search_type".
      await seedCard(storage, { id: 2, name: "ztpmqk", codename: "search_type", typeId: 1 });
      // the Cardtype card this deck types its Set/Setting/party/rule cards
      // with, plus the deck's own read substrate (see seedTypedReadSubstrate:
      // none of it is Search-typed, as in a real deck).
      await seedCard(storage, { id: 3, name: "Cardtype", codename: "cardtype", typeId: 1 });
      await seedTypedReadSubstrate(storage, 3);
      // A pair of search-type cards, both with malformed content (the
      // prewarm's try/catch will catch runSearch throws here).
      const failing: PrewarmFailingSeed[] = [
        { id: 10, name: "search empty", dbContent: "", key: "search_empty" },
        {
          id: 11,
          name: "search non json",
          dbContent: "not even close to json",
          key: "search_non_json",
        },
      ];
      for (const f of failing) {
        await seedCard(storage, { id: f.id, name: f.name, typeId: 2, dbContent: f.dbContent });
      }

      const stats = await prewarmStaticDeck(storage);
      // Pin: the prewarm's `searches` counter must reflect BOTH failing
      // cards. Pre-fix: searches=0 (the name === "Search" gate skipped).
      // Post-fix: searches=2 (the try/catch counted them too).
      expect(stats.searches).toBe(failing.length);

      // Pin: each failing card's seat in searchResults is populated.
      // The engine's closureWarm check (src/card/render.ts:1131) reads
      // searchResults.has(key) — false before the fix, true after.
      const engine = storage.engine as unknown as EnginePrewarmSeam;
      for (const f of failing) {
        expect(engine.searchResults.has(f.key)).toBe(true);
        expect(engine.searchResults.get(f.key)).toEqual([]);
      }
    } finally {
      storage.close();
    }
  });

  // ----- the warm-closure contract the prewarm enables -------------------

  it("after prewarm, closureWarm returns true for every seeded search-type card (the budget-0 contract)", async () => {
    // This is the unit-level pin for the prewarm's closureWarm-coverage
    // promise (zero cold search-type cards after prewarm); we mirror the
    // pattern at the fixture scale (3 search-type
    // cards of varying content validity) so a future prewarm
    // regression lands here.
    const storage = await createRenderTestStorage();
    try {
      await seedCard(storage, { id: 1, name: "Basic", codename: "basic", typeId: 1 });
      await seedCard(storage, { id: 2, name: "ztpmqk", codename: "search_type", typeId: 1 });
      const failing: PrewarmFailingSeed[] = [
        { id: 20, name: "search a", dbContent: "", key: "search_a" },
        { id: 21, name: "search b", dbContent: "x", key: "search_b" },
        { id: 22, name: "search c", dbContent: '{"left":"name"}', key: "search_c" },
      ];
      for (const f of failing) {
        await seedCard(storage, { id: f.id, name: f.name, typeId: 2, dbContent: f.dbContent });
      }

      await prewarmStaticDeck(storage);
      const engine = storage.engine as unknown as EnginePrewarmSeam;

      for (const f of failing) {
        const rec: CardRecord | undefined = await storage.fetcher.fetchByName(f.key);
        if (rec === undefined) throw new Error(`seed-missing ${f.key}`);
        expect(engine.closureWarm(rec)).toBe(true);
      }
    } finally {
      storage.close();
    }
  });

  // ----- the byte-level interaction with the BadQuery sentinel -----------

  it("a non-prewarmed search-type card still raises BadQuery on :open, and :closed renders (the Ruby parity preserve)", async () => {
    // The prewarm's try/catch is permissive ONLY for itself. A direct
    // cold render of a Search-type card with malformed content must
    // still raise BadQueryError exactly as Ruby raises
    // Card::Error::BadQuery — the perf fix MUST NOT silence the
    // render-path raise (search-bad-query-error.test.ts
    // pins the same shape with a unit fixture; this pin covers the
    // prewarm boundary so the fix's catch arm cannot leak into the
    // public render path).
    //
    // Lazy-parse seam: the raise moved from the prepare walk to the
    // dispatch boundary (engine.resolveView) and is VIEW-GATED — Ruby
    // parses only the result-rendering views:
    // :closed/:title never raise; :open/:content raise on invalid
    // content.
    const storage = await createRenderTestStorage();
    try {
      await seedCard(storage, { id: 1, name: "Basic", codename: "basic", typeId: 1 });
      await seedCard(storage, { id: 2, name: "ztpmqk", codename: "search_type", typeId: 1 });
      await seedCard(storage, {
        id: 50,
        name: "search untreated",
        typeId: 2,
        dbContent: "garbage content the parse must reject",
      });

      // :closed renders real bytes (it never raises).
      const closedHtml = await storage.engine.render("search_untreated", "closed");
      expect(closedHtml).toContain("search_untreated-closed-view");

      // :open raises BadQuery (the prewarm did not run here).
      let captured: unknown;
      try {
        await storage.engine.render("search_untreated", "open");
      } catch (err) {
        captured = err;
      }
      expect(captured).toBeInstanceOf(Error);
      const err = captured as Error;
      expect(err.constructor.name).toBe("Card::Error::BadQuery");
      expect(err.message).toBe(
        "Invalid JSON search query: garbage content the parse must reject",
      );
    } finally {
      storage.close();
    }
  });
});
