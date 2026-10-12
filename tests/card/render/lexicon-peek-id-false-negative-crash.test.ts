// A synchronous lexicon peek must not persist a false negative - the
// crash class where rendering "CoffeeScript+*type+*delete" raised
// "card not found" where Ruby rendered the card's full titled page.
//
// Mechanism:
// DbLexicon.peekId is the warm-cache-only SYNC mirror of id() that the CQL
// parser reaches mid-render (render.ts resolveCardId -> peekId, the
// idFromVal path). Its lookup went through CardCache.read, which is Ruby's
// Cache#read = temp.fetch(key) { shared.read(key) } (cache.rb; cache.ts:233)
// - a FETCH: on a cold cache it WRITES the computed undefined into the
// lexicon temporary store. After a within-key-counts reset has wiped the
// warm entries mid-walk (lib/card/cache/temporary.rb#within_key_counts,
// cache.ts:82-87), that write persists a NEGATIVE for a name the database
// actually has. Every later ASYNC resolution short-circuits on the stored
// nil (lexicon.ts cacheFetch: "a stored nil is a hit") and never reaches
// its db fallback, so id("CoffeeScript") -> undefined, and the compound
// name "CoffeeScript+*type+*delete" fails retrieveFromDb with ZERO queries.
// fetchByName then caches a new-card placeholder for the name and returns
// undefined; renderPage raises "card not found".
//
// Ruby parity: Lexicon reads always resolve through the synchronous db
// fallback (lexicon.rb:71-76), so Ruby never produces a cold-cache
// artifact in the first place; a nil Ruby caches is a db-confirmed
// negative. The port's peekId contract already stated the correct shape -
// "reading only what id()/name() already cached; a cold or unresolvable
// entry returns undefined - an UNKNOWN name, never a wrong id"
// (lexicon.ts:71-78) - the implementation violated it by writing.
//
// The fix: peekId reads temp/shared without storing (pure peek), so a
// cold miss stays cold and the async path's db fallback still resolves.

import { describe, expect, it } from "vitest";
import { renderPageBytes } from "../../../src/card/render/page.js";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "./render-test-storage.js";

/** Miniature of the crash shape: a cardtype anchor card
 * ("CoffeeScript"), its *type set junction, the *delete rule tag, and the
 * rule card "CoffeeScript+*type+*delete" stored as a NULL-name junction
 * row (left_id/right_id only), plus the layout trio every page render
 * needs. */
async function seedRuleJunctionDeck(): Promise<RenderTestStorage> {
  const storage = await createRenderTestStorage();
  await seedCard(storage, { id: 2, name: "Basic", codename: "basic", typeId: 2 });
  await seedCard(storage, { id: 900, name: "*all", codename: "all", typeId: 2 });
  await seedCard(storage, { id: 901, name: "*layout", codename: "layout", typeId: 2 });
  await seedCard(storage, { id: 904, name: "*title", codename: "title", typeId: 2 });
  await seedCard(storage, { id: 905, name: "*favicon", codename: "favicon", typeId: 2 });
  await seedCard(storage, { id: 906, name: "*ace", codename: "ace", typeId: 2 });
  await seedCard(storage, { id: 907, name: "*tiny_mce", codename: "tiny_mce", typeId: 2 });
  await seedCard(storage, {
    id: 910,
    leftId: 900,
    rightId: 901,
    typeId: 2,
    dbContent: "Probe Layout",
  });
  await seedCard(storage, {
    id: 911,
    name: "Probe Layout",
    typeId: 2,
    dbContent: "{{_main|titled}}",
  });
  await seedCard(storage, { id: 20586, name: "CoffeeScript", typeId: 2 });
  await seedCard(storage, { id: 266, name: "*type", typeId: 2 });
  await seedCard(storage, { id: 20592, leftId: 20586, rightId: 266, typeId: 2 });
  await seedCard(storage, { id: 6549, name: "*delete", typeId: 2 });
  await seedCard(storage, {
    id: 20595,
    leftId: 20592,
    rightId: 6549,
    typeId: 2,
    dbContent: "rule-body-bytes",
  });
  await storage.fetcher.codenames.ensureLoaded();
  return storage;
}

const ALL_IDS = [2, 900, 901, 904, 905, 906, 907, 910, 911, 20586, 266, 20592, 6549, 20595];

describe("lexicon peekId must not persist a false negative (page 20595 crash class)", () => {
  it("renders the rule card after a sync peek ran against a reset lexicon cache", async () => {
    const storage = await seedRuleJunctionDeck();
    storage.fetcher.installNameEnvironment();
    await storage.fetcher.warmLexicon(ALL_IDS);

    // temporary.rb#within_key_counts: a real overage resets the WHOLE
    // store mid-walk — the boundary the crash's page walk crossed.
    (
      storage.fetcher as unknown as { lexiconCache: { temp: { reset(): void } } }
    ).lexiconCache.temp.reset();

    // The exact sync call the CQL parser makes mid-render
    // (render.ts resolveCardId -> DbLexicon.peekId). On the cold cache it
    // returns undefined - acceptable - but it must not WRITE that
    // undefined into the lexicon store.
    const peeked = storage.fetcher.lexicon.peekId("CoffeeScript");
    if (peeked !== undefined) {
      // A warm repopulation between reset and peek (async warm paths) is
      // fine; the poisoning shape needs the miss, so force the state the
      // crash needs and re-peek.
      (
        storage.fetcher as unknown as { lexiconCache: { temp: { reset(): void } } }
      ).lexiconCache.temp.reset();
      expect(storage.fetcher.lexicon.peekId("CoffeeScript")).toBeUndefined();
    }

    // The async id() walk must still reach its db fallback and resolve.
    await expect(storage.fetcher.lexicon.id("CoffeeScript")).resolves.toBe(20586);

    // The crash: renderPage("CoffeeScript+*type+*delete") raised
    // "card not found" once the negative sat in the store; Ruby renders
    // the rule card's page.
    const page = await renderPageBytes(storage.engine, "CoffeeScript+*type+*delete");
    expect(page).toContain("rule-body-bytes");
  });

  it("leaves a db-confirmed negative in place (peek never invents a hit)", async () => {
    const storage = await seedRuleJunctionDeck();
    storage.fetcher.installNameEnvironment();
    // NO warm for 20586 here: resolve the true negative the way the
    // engine does (async id() on a missing card), then peek.
    await expect(storage.fetcher.lexicon.id("NoSuchCard")).resolves.toBeUndefined();
    expect(storage.fetcher.lexicon.peekId("NoSuchCard")).toBeUndefined();
    // ...and the peek still does not resurrect or alter the entry.
    await expect(storage.fetcher.lexicon.id("NoSuchCard")).resolves.toBeUndefined();
  });
});
