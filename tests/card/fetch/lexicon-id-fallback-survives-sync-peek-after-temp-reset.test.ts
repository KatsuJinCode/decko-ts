// The sync-peek negative-materialization hazard: the Temporary cache's
// max-keys reset (prototype/lib/card/cache/temporary.rb#within_key_counts,
// default 10_000 keys) evicts warm L-<key> entries mid-render; a subsequent
// SYNC peek (DbLexicon.peekId, documented cache-only, no db fallback) went
// through CardCache.read - temp.fetch(key) { shared.read(key) } - which
// MATERIALIZES the miss as a stored nil. The reference implementation's
// cache.rb#read has the same shape, but it never reads the Lexicon cache over
// cold keys: every lexicon reader there is cache.fetch-shaped
// (lexicon.rb#lex_to_id/#id_to_lex), so a stored nil always means "the db said
// no". A sync peek is an extra reader with no counterpart there, and its
// materialized nil poisons the async fallback: DbLexicon.id -> lex_to_id's
// cacheFetch then sees temp.exist(key) true and answers the stored nil
// WITHOUT the SQL query — "unknown" for a card the db has, which the
// synchronous SQL fallback never answers. In practice that turned
// name-scoped searches into search-no-results on any page whose lexicon keys
// had been evicted.
//
// Parity contract pinned here:
// 1. a peek miss (eviction or cold entry) must NOT become a stored negative;
// 2. the async id() fallback leg still resolves from the db after the peek;
// 3. a REAL db negative (lex_to_id's fetch block ran the SQL) IS still
//    cached - "a stored nil is a hit" stays true for computed negatives;
// 4. compound names neither poison their sides nor their whole key.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFetchTestStorage,
  seedCard,
  type FetchTestStorage,
} from "./fetch-test-storage.js";

let storage: FetchTestStorage;

beforeEach(async () => {
  storage = await createFetchTestStorage();
});

afterEach(() => {
  storage.close();
});

describe("DbLexicon sync peek after a Temporary reset (stored nil vs evicted entry)", () => {
  it("peekId of an evicted-but-existing name must not poison the async id() db fallback", async () => {
    await seedCard(storage, { id: 583, name: "Neutral Placeholder" });
    const lexicon = storage.engine.lexicon;

    // warm: the entry the 10k-key reset wipes mid-render
    expect(await lexicon.id("Neutral Placeholder")).toBe(583);
    expect(lexicon.peekId("Neutral Placeholder")).toBe(583);

    // force the eviction the Temporary max-keys reset performs: the entry is
    // gone, the db row still there
    lexicon.cache.temp.reset();
    expect(lexicon.cache.temp.read("L-dana_okonkwo")).toBeUndefined();

    // the sync peek: cache-only by contract, answers undefined on the miss
    expect(lexicon.peekId("Neutral Placeholder")).toBeUndefined();
    // THE HAZARD: the miss is an EVICTION, not an answer - the peek must
    // not materialize a stored negative, which would otherwise be reachable
    // only through a real SQL negative
    expect(lexicon.cache.temp.exist("L-dana_okonkwo")).toBe(false);

    // the fallback leg: Lexicon.id falls through to SQL on a plain miss
    // (lexicon.rb#lex_to_id cache.fetch compute) - it must not answer the
    // peek's materialized nil
    expect(await lexicon.id("Neutral Placeholder")).toBe(583);
    // and the sync peek reads warm again
    expect(lexicon.peekId("Neutral Placeholder")).toBe(583);
  });

  it("a peek of an evicted COMPOUND name poisons neither its sides nor its key", async () => {
    await seedCard(storage, { id: 10, name: "Left Part" });
    await seedCard(storage, { id: 11, name: "Right Part" });
    await seedCard(storage, { id: 12, name: "Left Part+Right Part" });
    const lexicon = storage.engine.lexicon;

    expect(await lexicon.id("Left Part+Right Part")).toBe(12);
    lexicon.cache.temp.reset();

    // peekLex walks both sides; a poisoned side materializes L-left_part /
    // L-right_part negatives, a poisoned key materializes L-10-11
    expect(lexicon.peekId("Left Part+Right Part")).toBeUndefined();
    expect(lexicon.cache.temp.exist("L-left_part")).toBe(false);
    expect(lexicon.cache.temp.exist("L-right_part")).toBe(false);
    expect(lexicon.cache.temp.exist("L-10-11")).toBe(false);

    // the db fallback resolves the whole walk again
    expect(await lexicon.id("Left Part+Right Part")).toBe(12);
    expect(lexicon.peekId("Left Part+Right Part")).toBe(12);
  });

  it("a REAL db negative is still cached - lex_to_id's fetch block ran the SQL", async () => {
    const lexicon = storage.engine.lexicon;

    // "Nobody Here" has no row: the compute runs, its nil is cached
    // (cache.rb#fetch / temporary.rb#fetch: a stored nil is a hit)
    expect(await lexicon.id("Nobody Here")).toBeUndefined();
    expect(lexicon.cache.temp.exist("L-nobody_here")).toBe(true);
    expect(lexicon.peekId("Nobody Here")).toBeUndefined();

    // the stored negative serves repeat id() calls without re-querying
    const before = storage.counting.queries;
    expect(await lexicon.id("Nobody Here")).toBeUndefined();
    expect(storage.counting.queries).toBe(before);
  });

  it("after a reset even a REAL cached negative re-queries once - resets cost re-queries, never wrong answers", async () => {
    const lexicon = storage.engine.lexicon;

    expect(await lexicon.id("Nobody Here")).toBeUndefined();
    expect(lexicon.cache.temp.exist("L-nobody_here")).toBe(true);
    const queriesWithNegativeCached = storage.counting.queries;

    lexicon.cache.temp.reset();
    expect(lexicon.cache.temp.exist("L-nobody_here")).toBe(false);
    // evicted: the peek does not materialize...
    expect(lexicon.peekId("Nobody Here")).toBeUndefined();
    expect(lexicon.cache.temp.exist("L-nobody_here")).toBe(false);
    // ...so id() re-runs the SQL (still undefined - the db still says no)
    expect(await lexicon.id("Nobody Here")).toBeUndefined();
    expect(storage.counting.queries).toBeGreaterThan(queriesWithNegativeCached);
  });
});
