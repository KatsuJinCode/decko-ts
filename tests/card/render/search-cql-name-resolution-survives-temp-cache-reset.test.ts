// The search card's CQL name resolution must survive the lexicon temporary
// cache's own max_keys reset (card-1.110.0 lib/card/cache/temporary.rb#
// within_key_counts, default Cardio.config.max_temporary_cache_keys = 10_000).
//
// Mechanism: Ruby answers every CQL name value synchronously through
// Card::Lexicon (lib/card/query/value.rb#id_from_val -> Card::Lexicon.id ->
// lexicon.rb#lex_to_id), which is cache-first WITH a synchronous SQL
// fallback - a Temporary-cache reset costs a re-query, never a wrong
// "unknown". The port's interpretation resolves through the sync mirror
// DbLexicon.peekId (deliberately db-fallback-free), so on any deck whose
// warm writes exceed the 10k cap every CQL name but the last-warmed tail
// resolves to the -999 sentinel and the search renders search-no-results
// where Ruby rendered result items.
// The fix (src/cql/execute.ts ensureStatementCardNamesCached): executeQuery
// pre-resolves the statement's card-name strings (plus the context and its
// parts, which "_left"-style relative references absolutize from) through
// ParseOptions.ensureCardId - DbLexicon.id, Ruby's cache-first-with-fallback
// walk - in the async phase the port has, so the sync interpretation reads
// warm entries.
//
// This test seeds the participating-section page shape in miniature (a
// person + Project(s) Participating -> a project, whose +Participant(s)
// junction part links the person) plus enough filler cards that
// warmLexicon's writes blow past the 10k cap and reset the mirror exactly
// like a production deck does.

import { describe, expect, it } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "./render-test-storage.js";

const CQL =
  '{"type":"project","plus":["Participant(s)",{"refer_to":"_left"}]}';

/** Filler card count: warmLexicon writes ~2 lexicon-cache entries per card
 *  (id->lex via cacheFetch write-back + the lex->id tap), so 6,000 cards
 *  clear the 10,000-key reset threshold and evict the real cards' entries
 *  (the real cards are seeded FIRST, i.e. the LOWEST ids, so the reset
 *  wipes exactly the entries the search needs). */
const FILLER_CARDS = 6000;

async function seedDeck(storage: RenderTestStorage): Promise<void> {
  // the type cards the render dispatch reads
  await seedCard(storage, { id: 2, name: "RichText", codename: "basic", typeId: 2 });
  await seedCard(storage, { id: 98, name: "Search", codename: "search_type", typeId: 2 });
  // the page shape: Project type card, Participant(s), the person, and a
  // project whose +Participant(s) junction part LINKS the person
  // (card_references row - plus: {refer_to: ...} is reference semantics on
  // the plus part).
  await seedCard(storage, { id: 398, name: "Project", typeId: 2 });
  await seedCard(storage, { id: 406, name: "Participant(s)", typeId: 2 });
  await seedCard(storage, { id: 583, name: "Casey Morgan", typeId: 2 });
  await seedCard(storage, { id: 580, name: "The Myth of Peace", typeId: 398 });
  await seedCard(storage, {
    id: 810,
    name: "The Myth of Peace+Participant(s)",
    leftId: 580,
    rightId: 406,
    typeId: 2,
  });
  await seedReference(storage, 810, 583, "casey_morgan", "L");
  // the search card: the "Casey Morgan+Project(s) Participating"
  // junction page card - its structure-rule CQL content, stored directly.
  await seedCard(storage, { id: 418, name: "Project(s) Participating", typeId: 2 });
  await seedCard(storage, {
    id: 704,
    name: "Casey Morgan+Project(s) Participating",
    leftId: 583,
    rightId: 418,
    typeId: 98,
    dbContent: CQL,
  });
  // filler: seeding it FIRST would leave it below the reset line instead -
  // seed AFTER the real cards so the real ids sit below the reset line
  // (they warm early, the reset wipes them, the tail survives).
  for (let i = 0; i < FILLER_CARDS; i++) {
    await seedCard(storage, { id: 10000 + i, name: `filler card ${i}`, typeId: 2 });
  }
}

describe("search CQL name resolution survives the lexicon temp-cache reset", () => {
  it("renders result items after warmLexicon resets the mirror (Ruby's Lexicon.id db-fallback semantics)", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedDeck(storage);
      // boot shape: warm every card's lexicon entry. The write volume must
      // fire the Temporary cache's max_keys reset - assert the mechanism is
      // actually engaged, not rendering green by accident on a still-warm
      // mirror. Ids are warmed in id order, as the seeding comment above
      // assumes: without ORDER BY the row order is the planner's choice (a
      // covering index on (right_id, trash) returns the two compound cards
      // last, which re-warms the person's entry after the reset).
      const allIds = (
        await storage.fetcher.driver.query<{ id: number }>(
          "SELECT id FROM cards WHERE trash = 0 ORDER BY id",
          [],
        )
      ).rows.map((row) => row.id);
      expect(allIds.length).toBeGreaterThanOrEqual(FILLER_CARDS);
      await storage.fetcher.warmLexicon(allIds);
      const temp = storage.fetcher.lexicon.cache.temp;
      expect(temp.resetCount).toBeGreaterThanOrEqual(1);
      // the reset really did evict the person's entry the search needs
      expect(temp.read("L-casey_morgan")).toBeUndefined();

      const html = await storage.engine.render(
        "Casey Morgan+Project(s) Participating",
        "content",
      );
      // Ruby does NOT render the empty arm for this page: the card_list
      // carries the linked project as the result item.
      expect(html).not.toContain('<div class="search-no-results"></div>');
      // the result bytes: the card_list wrapper + at least one result item
      expect(html).toContain('<div class="card-list card-list-bar search-result-list">');
      const items = html.match(/<div class="search-result-item item-bar">/g);
      expect(items).not.toBeNull();
      expect(items!.length).toBeGreaterThan(0);
      // the actual result: the linked project (the one whose
      // +Participant(s) part links the person)
      expect(html).toContain('data-card-name="The Myth of Peace"');
    } finally {
      storage.close();
    }
  }, 120_000);

  it("resolves the statement's names through the async fallback leg before the sync interpretation", async () => {
    // The narrow seam pin: with the mirror cold (no warm at all), runSearch
    // still returns the row - Ruby's Lexicon.id answers from the database
    // when the cache misses, and the port's pre-parse pass is that leg.
    const storage = await createRenderTestStorage();
    try {
      await seedCard(storage, { id: 2, name: "RichText", codename: "basic", typeId: 2 });
      await seedCard(storage, { id: 98, name: "Search", codename: "search_type", typeId: 2 });
      await seedCard(storage, { id: 398, name: "Project", typeId: 2 });
      await seedCard(storage, { id: 406, name: "Participant(s)", typeId: 2 });
      await seedCard(storage, { id: 583, name: "Casey Morgan", typeId: 2 });
      await seedCard(storage, { id: 580, name: "The Myth of Peace", typeId: 398 });
      await seedCard(storage, {
        id: 810,
        name: "The Myth of Peace+Participant(s)",
        leftId: 580,
        rightId: 406,
        typeId: 2,
      });
      await seedReference(storage, 810, 583, "casey_morgan", "L");
      await seedCard(storage, { id: 418, name: "Project(s) Participating", typeId: 2 });
      await seedCard(storage, {
        id: 704,
        name: "Casey Morgan+Project(s) Participating",
        leftId: 583,
        rightId: 418,
        typeId: 98,
        dbContent: CQL,
      });
      // NO warmLexicon here - the lexicon mirror is fully cold.
      expect(storage.fetcher.lexicon.cache.temp.read("L-project")).toBeUndefined();

      const html = await storage.engine.render(
        "Casey Morgan+Project(s) Participating",
        "content",
      );
      expect(html).not.toContain('<div class="search-no-results"></div>');
      expect(html).toContain('data-card-name="The Myth of Peace"');
    } finally {
      storage.close();
    }
  }, 60_000);
});
