// parityfix-row8-email-field-type-assignment-survives-cache-reset.test.ts
// -- 2026-10-05 lane-parityfixes-2026-10-05, BUG 3
// (adjudicate-10-rows-lane.md row 8, `welcome email`).
//
// THE BUG, and why the page is sometimes right and sometimes wrong. The
// `welcome email` page's read_form field slots are NEST MISSES:
// `welcome_email+*to` has no cards row, so the render builds a new card and
// asks the engine for its type (render.ts newCardDefaultType, the
// type.rb:58-66 `type_id_from_code || type_id_from_template` shape).
//
// The assignment arm is the set-type-assignment registry: card-mod-email's
// set/right/to.rb declares `assign_type :list`, the engine registers
// ("Right::To" -> "list") at render-layer import (views.ts), and
// findAssignedTypeName keys the walk on the anchor parts' CODENAMES
// (PatternInstance#anchorCodenames, pattern/base.rb:40-44) -- a SYNC read of
// DeckoName#codename, i.e. lexicon.id(key), i.e. the WARM-CACHE-ONLY mirror.
// `*to` is corpus card 64 and has NO page reference, so its lexicon key is
// never primed by a normal warm; the p20-email-views prelude primes it per
// email-template page (render/prefetch.ts, the "email field-setting
// anchors" statement).
//
// THAT PRIME IS EVICTABLE. It lands in the lexicon TEMPORARY cache
// (primeIdsByKey -> CardCache.write, no shared store on this lane), and
// TemporaryCache.within_key_counts throws the whole store away every 10,000
// writes (cache.ts, card-1.110.0 temporary.rb#within_key_counts). So the
// anchor codename is present on the FIRST page of a boot and GONE once
// enough pages have been rendered to trip the reset -- and with
// anchorCodenames nil the module key is nil, the walk returns nothing, and
// newCardDefaultType falls through to the *default rule's RichText.
//
// MEASURED, both ways, on the 47,235-card raw corpus
// (tmp/parityfixes-work/probe-assignment-walk-warmth.mjs):
//   after boot, before any render: moduleKeys
//     ["TypePlusRight::Basic::To","Right::To"], findAssignedTypeName "list"
//   after rendering CM+*right:    moduleKeys [], findAssignedTypeName null
// and the rendered page follows the walk exactly:
//   row 8 rendered 1st/3rd : 21,686 B, data-card-type-name="List"
//   row 8 rendered 7th     : 21,702 B, data-card-type-name="RichText"
// which is the adjudicate lane's byte count to the byte.
//
// Ruby has no cold state on this axis: anchor_codenames reads Card::Lexicon
// and Card::Codename off the db, so Ruby answers List for every viewer on
// every page. The capture agrees (page-lane `welcome email`: List).
//
// THE FIX, and why it is here and not in DbLexicon.peekId. The id->name
// direction already has a durable record for exactly this reset class
// (DbLexicon#durableIdNames, the "~id mark" lane); the name->id direction had
// none, so the sync boundary lost its answer. This adds the mirror record and
// reads it ONLY from the name-environment adapter (fetch.ts
// #peekLexiconId -> the sync `lexicon.id(key)` the DeckoName codename read
// uses). DbLexicon.peekId stays exactly as its two committed pins require
// it: pure, cache-only, no db fallback, no materialized negatives
// (tests/card/fetch/lexicon-id-fallback-survives-sync-peek-after-temp-reset
// .test.ts, tests/card/render/lexicon-peek-id-false-negative-crash.test.ts).
//
// RUN: npx vitest run <this file> --no-file-parallelism

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFetchTestStorage,
  seedCard,
  type FetchTestStorage,
} from "../fetch/fetch-test-storage.js";
import { DeckoName } from "../../../src/card/name.js";
import { registerSetTypeAssignment } from "../../../src/card/set-patterns/set-type-assignment.js";
import { listAssignedTypeNamesForCard } from "../../../src/card/set-patterns/set-type-assignment.js";

let storage: FetchTestStorage;

beforeEach(async () => {
  storage = await createFetchTestStorage();
});

afterEach(() => {
  storage.close();
});

describe("set-type assignment walk vs the Temporary cache's within_key_counts reset (row 8)", () => {
  it("the sync anchor-codename read still answers after the reset wipes the prime", async () => {
    // The corpus shape, in miniature: `*to` is a simple card (id 64 in the
    // census deck), and the assignment the walk reads is registered for the
    // module key its anchor produces.
    await seedCard(storage, { id: 64, name: "*to", codename: "to", typeId: 2 });
    await seedCard(storage, { id: 2, name: "Basic", codename: "basic", typeId: 2 });
    registerSetTypeAssignment("Right::To", "list"); // set/right/to.rb:1

    storage.engine.installNameEnvironment();
    await storage.engine.codenames.ensureLoaded();
    // warm, as warmLexicon + the p20-email-views prelude prime it
    expect(await storage.engine.lexicon.id("*to")).toBe(64);
    expect(DeckoName.parse("*to").codename).toBe("to");
    expect(
      listAssignedTypeNamesForCard({ name: "welcome_email+*to", isNew: true }),
    ).toEqual(["list"]);

    // The Temporary max-keys reset (temporary.rb#within_key_counts). The db
    // row is untouched -- only the cache tier the sync mirror reads.
    storage.engine.lexicon.cache.temp.reset();
    expect(storage.engine.lexicon.cache.temp.read("L-*to")).toBeUndefined();

    // THE BUG. Before the fix this read is the red assertion: after the
    // reset the sync codename read is cold, anchor_codenames is nil
    // (base.rb:41 `|| break`), the module key is nil, and the assignment the
    // deck's rules declare is invisible -
    //   listAssignedTypeNamesForCard(...) -> []      (recorded RED)
    // where Ruby answers ["list"] off the db. Post-fix it stays ["list"]
    // across the reset, which is what makes the page's field type
    // independent of how many pages the boot rendered first.
    expect(
      listAssignedTypeNamesForCard({ name: "welcome_email+*to", isNew: true }),
    ).toEqual(["list"]);

    // THE PIN: the name-environment's lexicon.id answers from the durable
    // record the async path recorded, exactly as Ruby's synchronous db
    // fallback answers.
    expect(DeckoName.parse("*to").codename).toBe("to");

    // And the pins this fix must NOT break: DbLexicon.peekId itself stays
    // the pure cache-only mirror, and the async path still resolves.
    expect(storage.engine.lexicon.peekId("*to")).toBeUndefined();
    expect(await storage.engine.lexicon.id("*to")).toBe(64);
  });

  it("a durable answer is never wrong: an unknown name still answers nothing", async () => {
    await seedCard(storage, { id: 64, name: "*to", codename: "to", typeId: 2 });
    storage.engine.installNameEnvironment();
    await storage.engine.codenames.ensureLoaded();
    await storage.engine.lexicon.id("*to");
    storage.engine.lexicon.cache.temp.reset();
    // Never warmed, never primed: the durable record has no entry, so the
    // sync read answers undefined (an UNKNOWN name, never a wrong id).
    expect(DeckoName.parse("*never warmed").codename).toBeUndefined();
  });
});