// firstApplicableReadRule's rule-candidate resolution: the equivalence contract
// that lets the write path stop asking for the whole deck's universe.
//
// WHAT IS BEING REPLACED. set-read-rule.ts's firstApplicableReadRule resolves
// the handful of keys ruleNamesForCard(card, "*read") produces — five on the
// serving deck's graded save — and the resolver it called
// (resolveRuleIdsByKeys) answers them by building the WHOLE deck's composed-key
// universe: one recursive CTE over every card, ~19.5k rows on the serving deck.
// expireAfterWrite drops that memo at every committed write and a save
// interleaves reads with them, so one save pays for the walk five times.
// Measured on the serving deck (tools/diagnose-owner-save-statement-ladder.mjs,
// bundle bbd08b61, source a94561e1): 460 ms of the graded save's 549 ms of
// statement execution — 84%.
//
// WHY THIS NEEDS A CONTRACT AND NOT A TEST. Rule resolution feeds read/write
// permission decisions, and it is FAIL-OPEN: a candidate key that resolves to
// nothing falls through to the next candidate and then to the catch-all rule,
// which ALLOWS. A narrower walk that quietly drops one key therefore does not
// throw and does not fail a render — it silently grants. So the contract is an
// EQUALITY against the walk it replaces, on the representative rule set the
// `self` contract already seeded, and the reference is that walk's own shipped
// resolver rather than a reimplementation of it.
//
// THE SHAPE OF THE SWAP. resolveRuleIdsByComposedKeys is the id-only
// projection of the per-key walk (resolveComposedNameIdsByKeys). It must answer
// EXACTLY as resolveRuleIdsByKeys does, because the call site is a
// substitution and not a rewrite: sorted key order, one entry per requested
// key that resolves, absent for a key that does not, and — for a key two cards
// both compose — the whole-deck walk's own collapse, because which of the two
// the universe Map keeps depends on that walk's output order and no cheaper
// walk reproduces it. That last case is the one this file has to earn: it is
// the only place the narrow path can hand work back to the expensive walk, so
// a regression there is invisible on a deck without ambiguous keys.

import { describe, expect, it } from "vitest";
import {
  expireRuleResolutionCache,
  resolveRuleIdsByComposedKeys,
  resolveRuleIdsByKeys,
} from "../../../src/card/permissions/read-rules.js";
import { ruleNamesForCard } from "../../../src/card/set-patterns/rule-names.js";
import type { PatternCardInput } from "../../../src/card/set-patterns/types.js";
import {
  seedComposedNameDeck,
  wholeDeckUniverse,
} from "./composed-name-self-pattern-resolution-equivalence.test.js";
import { seedCard } from "../render/render-test-storage.js";
import { RULE_KEY_UNIVERSE_STATEMENT } from "../../../src/card/permissions/read-rules.js";

/** The whole-deck walk's own SQL, used to recognise the expensive statement
 *  in the counted driver's SQL log. A prefix match: the shipped statement has
 *  no leading whitespace, but a caller may have indented it. */
function isUniverseStatement(sql: string): boolean {
  return sql.replace(/^\s+/, "").startsWith(RULE_KEY_UNIVERSE_STATEMENT.slice(0, 60).trim());
}

describe("the per-key walk answers firstApplicableReadRule's candidates exactly", () => {
  it("matches the whole-deck walk on EVERY composed name the representative deck has", async () => {
    // The population is deliberately the whole universe, not just the
    // rule-shaped subset: the call site only ever asks for rule-shaped keys,
    // but the contract is stated over every key the walk can answer, so a
    // narrower walk that loses a shape fails here rather than silently
    // answering fewer keys on a deck that happens not to exercise them.
    const storage = await seedComposedNameDeck();
    try {
      const universe = await wholeDeckUniverse(storage);
      const ckeys = [...universe.keys()].sort();
      const driver = storage.fetcher.driver;
      const narrow = await resolveRuleIdsByComposedKeys(driver, ckeys);
      const whole = await resolveRuleIdsByKeys(driver, ckeys);
      // Identical maps, entry order included: both are sorted by key.
      expect([...narrow.entries()]).toEqual([...whole.entries()]);
      // And spot-checked per key, so a failure names the key that diverged.
      for (const ckey of ckeys) {
        expect(narrow.get(ckey), `narrow id for ${ckey}`).toBe(whole.get(ckey));
      }
    } finally {
      storage.close();
    }
  });

  it("answers the deck's rule-shaped candidates to the same rule cards", async () => {
    const storage = await seedComposedNameDeck();
    try {
      const driver = storage.fetcher.driver;
      // The rule-shaped keys this deck carries: a stored rule card over one
      // level (*all+*read), a rule card over a TWO-level spine
      // (set_a+set_b+*read), and the setting card's own bare key.
      const candidates = ["*all+*read", "set_a+set_b+*read", "*read"];
      const narrow = await resolveRuleIdsByComposedKeys(driver, candidates);
      const whole = await resolveRuleIdsByKeys(driver, candidates);
      expect(Object.fromEntries(narrow)).toEqual(Object.fromEntries(whole));
      expect(narrow.get("*all+*read")).toBe(13);
      expect(narrow.get("set_a+set_b+*read")).toBe(17);
      expect(narrow.get("*read")).toBe(12);
    } finally {
      storage.close();
    }
  });

  it("names a rule-shaped key the deck does not have as a plain miss, not a guess", async () => {
    const storage = await seedComposedNameDeck();
    try {
      const driver = storage.fetcher.driver;
      // beta+gamma is the TRASHED junction: the deck composes nothing for it.
      // A miss here is the fail-open direction, so it is pinned in both walks.
      for (const key of ["beta+gamma", "no_such_set+*read", "set_a+nope+*read"]) {
        const universe = await wholeDeckUniverse(storage);
        expect(universe.has(key), `deck has ${key}`).toBe(false);
        const narrow = await resolveRuleIdsByComposedKeys(driver, [key]);
        const whole = await resolveRuleIdsByKeys(driver, [key]);
        expect(narrow.get(key), `narrow misses ${key}`).toBeUndefined();
        expect(whole.get(key), `whole-deck misses ${key}`).toBeUndefined();
      }
    } finally {
      storage.close();
    }
  });

  it("answers a candidate list of the shape ruleNamesForCard produces", async () => {
    // The call site's real input: the composed-name candidate list for a card,
    // most specific first. Keys are DeckoName.parse(name).key.
    const storage = await seedComposedNameDeck();
    try {
      const driver = storage.fetcher.driver;
      const card: PatternCardInput = {
        name: "alpha+beta",
        leftName: "alpha",
        rightName: "beta",
        leftId: 1,
        rightId: 2,
        isNew: false,
      } as unknown as PatternCardInput;
      const candidates = ruleNamesForCard(card, "*read");
      expect(candidates.length).toBeGreaterThan(0);
      const keys = candidates.map((name) => name.toLowerCase());
      const narrow = await resolveRuleIdsByComposedKeys(driver, keys);
      const whole = await resolveRuleIdsByKeys(driver, keys);
      expect(Object.fromEntries(narrow)).toEqual(Object.fromEntries(whole));
    } finally {
      storage.close();
    }
  });
});

describe("the fallback an AMBIGUOUS rule-shaped candidate triggers", () => {
  it("gives the whole-deck walk's own answer, not a guess", async () => {
    // A rule-shaped key two cards both compose: the keyless junction that
    // composes set_a+set_b+*read (card 17) and a stored compound key that
    // says the same thing. cards.key is UNIQUE, so the two can only meet this
    // way — one side composing what another stores.
    const storage = await seedComposedNameDeck();
    try {
      await seedCard(storage, {
        id: 18,
        name: "Set_a+Set_b+*read",
        key: "set_a+set_b+*read",
        typeId: 3,
      });
      expireRuleResolutionCache(storage.fetcher.driver);

      const universe = await wholeDeckUniverse(storage);
      expect([...(universe.get("set_a+set_b+*read") ?? [])].sort((a, b) => a - b)).toEqual([17, 18]);

      const driver = storage.fetcher.driver;
      const narrow = await resolveRuleIdsByComposedKeys(driver, ["set_a+set_b+*read"]);
      const whole = await resolveRuleIdsByKeys(driver, ["set_a+set_b+*read"]);
      // The narrow walk must return exactly ONE id, and it must be the id the
      // universe Map decides — the walk's output order is the only thing that
      // picks between them, so the narrow path runs that walk rather than
      // choosing.
      expect(narrow.size).toBe(1);
      expect(narrow.get("set_a+set_b+*read")).toBe(whole.get("set_a+set_b+*read"));
    } finally {
      storage.close();
    }
  });

  it("answers an ambiguous candidate in the SAME call as unambiguous ones", async () => {
    const storage = await seedComposedNameDeck();
    try {
      await seedCard(storage, {
        id: 18,
        name: "Set_a+Set_b+*read",
        key: "set_a+set_b+*read",
        typeId: 3,
      });
      expireRuleResolutionCache(storage.fetcher.driver);
      const driver = storage.fetcher.driver;
      const keys = ["*all+*read", "set_a+set_b+*read", "*read"];
      const narrow = await resolveRuleIdsByComposedKeys(driver, keys);
      const whole = await resolveRuleIdsByKeys(driver, keys);
      expect(Object.fromEntries(narrow)).toEqual(Object.fromEntries(whole));
    } finally {
      storage.close();
    }
  });
});

describe("the cost claim the swap rests on", () => {
  it("issues NO whole-deck universe statement for an unambiguous candidate list", async () => {
    // The whole point: on a deck with no ambiguous candidate, the write path
    // never composes the deck. The counted driver records every SQL string
    // issued, so this is a direct observation rather than a timing.
    const storage = await seedComposedNameDeck();
    try {
      const driver = storage.fetcher.driver;
      // Warm nothing: a fresh cache means the narrow walk cannot be answering
      // from a universe some earlier call happened to build.
      expireRuleResolutionCache(driver);
      storage.counting.reset();
      await resolveRuleIdsByComposedKeys(driver, ["*all+*read", "set_a+set_b+*read"]);
      const universeWalks = storage.counting.statements.filter(isUniverseStatement);
      expect(universeWalks, "whole-deck universe statements issued").toEqual([]);
      // And the narrow walk really did work — a zero-statement pass would
      // "pass" the assertion above while answering nothing.
      expect(storage.counting.statements.length).toBeGreaterThan(0);
    } finally {
      storage.close();
    }
  });

  it("DOES fall back to the universe statement when a candidate is ambiguous", async () => {
    // The other half of the contract: the narrow path must not answer an
    // ambiguous key on its own. If this ever stops being true, the cost claim
    // above is still sound but the ANSWER would have become a guess.
    const storage = await seedComposedNameDeck();
    try {
      await seedCard(storage, {
        id: 18,
        name: "Set_a+Set_b+*read",
        key: "set_a+set_b+*read",
        typeId: 3,
      });
      expireRuleResolutionCache(storage.fetcher.driver);
      storage.counting.reset();
      await resolveRuleIdsByComposedKeys(storage.fetcher.driver, ["set_a+set_b+*read"]);
      const universeWalks = storage.counting.statements.filter(isUniverseStatement);
      expect(universeWalks.length, "ambiguous fallback walks").toBe(1);
    } finally {
      storage.close();
    }
  });
});
