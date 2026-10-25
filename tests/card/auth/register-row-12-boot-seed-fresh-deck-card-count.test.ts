// The fresh-deck card count, measured on BOTH sides of the seed-source
// divergence (register row 12, card-mod-defaults).
//
// WHAT THE TWO SIDES ARE
//
// - RUBY: a fresh deck seeds the corpus at `Cardio.config.seed_mods[0]`
//   (card-1.110.0 lib/cardio/seed.rb:8-9, :62). The railtie assigns
//   [:core] (lib/cardio/railtie.rb:6), but card-mod-defaults-0.20.0
//   lib/card/mod/defaults.rb:1 UNSHIFTS :defaults, so the array is
//   [:defaults, :core] and index 0 is the DEFAULTS gem's corpus. The
//   generated census (src/card/auth/seed-corpus-census.ts, from
//   tools/oracle/seed-corpus-census.rb over the pinned gemset) counts that
//   corpus: 604 cards.
//
// - THE PORT: boot-seed.ts's layer A transcribes mod/core's ELEVEN-row
//   corpus (the index-1 one) and the capability creates the account-system
//   cards around it. The port names the choice as data
//   (src/card/auth/seed-source.ts: PORT_SEED_SOURCE vs RUBY_SEED_SOURCE)
//   and the corpus it does not land is named as a skip
//   (SKIPPED_CORPUS). The port's own count is measured HERE, on a deck the
//   real capability bootstraps, so the number in the gap sentence is a
//   measurement and not a claim.
//
// The corpus itself is a NAMED SKIP, and the reason is an operator product
// decision, not a port defect: seeding Decko's standard sample deck into
// every fresh port deck changes what every demo and deployment CONTAINS.
// This file does not decide that; it makes the two numbers machine-checkable
// so the decision can be made on evidence.

import { afterEach, describe, expect, it } from "vitest";

import { bootstrapFreshDeck } from "../../../src/card/auth/boot-seed.js";
import { SEED_CORPUS_INDEX } from "../../../src/card/auth/seed-corpus-census.js";
import {
  PORT_SEED_SOURCE,
  RUBY_SEED_MODS_FIRST,
  SKIPPED_CORPUS,
} from "../../../src/card/auth/seed-source.js";
import {
  createRenderTestStorage,
  type RenderTestStorage,
} from "../render/render-test-storage.js";

let storage: RenderTestStorage | undefined;

afterEach(() => {
  storage?.close();
  storage = undefined;
});

/** The card count of the corpus at one seed index, from the generated
 *  census (the Ruby side of the measurement). */
function rubyCorpusCardCount(index: number): number {
  const entry = SEED_CORPUS_INDEX.find((e) => e.index === index);
  const count = entry?.real?.tables["cards"];
  if (count === undefined) throw new Error(`no real corpus at seed index ${index}`);
  return count;
}

describe("the fresh-deck card count on both sides of the seed-source divergence", () => {
  it("Ruby seeds the DEFAULTS corpus at index 0, and the port names core's at index 1", () => {
    // The Ruby side, from the generated census.
    expect(rubyCorpusCardCount(0)).toBe(604);
    expect(rubyCorpusCardCount(1)).toBe(11);
    expect(RUBY_SEED_MODS_FIRST).toBe("defaults");
    expect(PORT_SEED_SOURCE.index).toBe(1);
  });

  it("names the corpus the port does not land, and why", () => {
    expect(SKIPPED_CORPUS.cards).toBe(604);
    expect(SKIPPED_CORPUS.reason.length).toBeGreaterThan(20);
  });

  it("the port's fresh deck holds far fewer cards than a Ruby-fresh deck", async () => {
    storage = await createRenderTestStorage({ bootstrapReadRules: false });
    const deck = storage;
    const outcome = await bootstrapFreshDeck({ driver: deck.fetcher.driver });
    expect(outcome.ok).toBe(true);
    const counted = await deck.fetcher.driver.query<{ n: number }>(
      "SELECT COUNT(*) AS n FROM cards",
      [],
    );
    const portCount = Number(counted.rows[0]?.n ?? 0);
    // The port's own number, measured here. It is the eleven-row core
    // corpus plus the account-system cards the capability creates. The
    // register's gap sentence for this row said 38 (measured 2026-10-22),
    // and the mods lane's own fixture measured 44 at its commit; the
    // MEASURED number was 59 at the tree before the boot's mod card
    // cascade landed, and is 133 since: layer D (boot-mod-cards.ts, the
    // Cardio::Mod.ensure_installed port) adds its seven dependency rows,
    // the 34 mod cards and the 33 mod asset input cards, and this file is
    // the receipt for it.
    expect(portCount).toBe(133);
    // ...and the divergence, stated in one comparison: a Ruby-fresh deck
    // holds the defaults corpus's 604 cards, a port-fresh deck holds these.
    expect(portCount).toBeLessThan(rubyCorpusCardCount(0));
  });
});
