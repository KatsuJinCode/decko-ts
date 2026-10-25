// The fresh-deck seed, closed on the Ruby defaults corpus (register row 12,
// card-mod-defaults).
//
// WHAT THE ROW WAS
//
// The port seeded the ELEVEN-row core corpus (mod/core's data/fixtures/real,
// the seed_mods[1] corpus) where Ruby seeds the SIX-HUNDRED-FOUR-row
// defaults corpus at seed_mods[0] (card-1.110.0 lib/cardio/seed.rb:8-9/:62;
// card-mod-defaults-0.20.0 lib/card/mod/defaults.rb:1 unshifts :defaults).
// A port-fresh deck held 59 cards where a Ruby-fresh deck held 604. The gap
// was a named skip (SKIPPED_CORPUS) whose reason was an operator product
// call, and the unblock was written into the skip itself.
//
// THE CLOSE (port/regfix-1-20261025)
//
// The corpus is landed: generated from the pinned gem by
// tools/oracle/defaults-seed-corpus.rb into the deploy seed asset
// deploy/seed/defaults-seed-corpus.json (cards + the corpus's own
// action/act/reference rows - Cardio::Seed::TABLES minus the two Ruby
// migration ledgers, which record the RUBY schema's versions, not deck
// content). The corpus is boot-time data, not engine code - compiled in,
// it crossed the engine bundle's boot-safe budget - so the boot loads the
// asset at seed time (defaults-seed-corpus-asset.ts) and passes it to the
// capability. boot-seed.ts's layer A inserts it directly, seed.rb:20-22's
// FixtureSet.create_fixtures semantics, verbatim values. The boot is
// db:setup exactly: no ensure layers run over the corpus, because Ruby's
// fresh-deck path runs no eat over it either (the eat machinery is `card
// update`, card.rake:22), and an ensure create over the dump's historical
// key forms would DUPLICATE rows, not repair them.
//
// The assertions below measure both sides live: the corpus lands card for
// card, and the account system a fresh deck needs rides the corpus rows.

import { afterEach, describe, expect, it } from "vitest";

import { bootstrapFreshDeck } from "../../../src/card/auth/boot-seed.js";
import { loadDefaultsSeedCorpusAsset } from "../../../src/card/auth/defaults-seed-corpus-asset.js";
import { SEED_CORPUS_INDEX } from "../../../src/card/auth/seed-corpus-census.js";
import {
  LANDED_DEFAULTS_CORPUS,
  PORT_SEED_SOURCE,
  RUBY_SEED_MODS_FIRST,
  rubyDefaultSeedSource,
} from "../../../src/card/auth/seed-source.js";
import { actorAnonymous, actorBot } from "../../../src/card/auth/actor.js";
import { resolveAccountCodenameIds as resolveAccountIds } from "../../../src/card/auth/signin.js";
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

describe("the fresh deck seeds the Ruby defaults corpus (register row 12's close)", () => {
  it("the port's seed source is the corpus Ruby's own rule reads", () => {
    expect(rubyCorpusCardCount(0)).toBe(604);
    expect(RUBY_SEED_MODS_FIRST).toBe("defaults");
    expect(PORT_SEED_SOURCE.index).toBe(0);
    expect(PORT_SEED_SOURCE.env).toBe("real");
    expect(LANDED_DEFAULTS_CORPUS.cards).toBe(604);
    expect(rubyDefaultSeedSource()?.tables.cards).toBe(604);
  });

  it("a port-fresh deck holds the corpus, table for table", async () => {
    storage = await createRenderTestStorage({ bootstrapReadRules: false });
    const driver = storage.fetcher.driver;
    const corpus = loadDefaultsSeedCorpusAsset();
    const outcome = await bootstrapFreshDeck({ driver, defaultsCorpus: corpus });
    expect(outcome.ok).toBe(true);
    // The per-table INSERT counts equal the corpus's own row counts.
    expect(outcome.defaultsRowsInserted).toEqual({
      cards: corpus.cards.length,
      actions: corpus.actions.length,
      acts: corpus.acts.length,
      changes: corpus.changes.length,
      references: corpus.references.length,
    });
    expect(outcome.defaultsRowsInserted?.cards).toBe(604);
    // The measured fresh-deck count equals Ruby's.
    const counted = await driver.query<{ n: number }>("SELECT COUNT(*) AS n FROM cards", []);
    expect(Number(counted.rows[0]?.n ?? 0)).toBe(604);
    // The ensure layers stood down: nothing created, nothing updated.
    expect(outcome.modCardsCreated).toEqual([]);
    expect(outcome.modCardsUpdated).toEqual([]);
  });

  it("the deck's cards row matches the corpus card for card", async () => {
    storage = await createRenderTestStorage({ bootstrapReadRules: false });
    const driver = storage.fetcher.driver;
    const corpus = loadDefaultsSeedCorpusAsset();
    await bootstrapFreshDeck({ driver, defaultsCorpus: corpus });
    const result = await driver.query<{
      id: number;
      name: string | null;
      key: string | null;
      codename: string | null;
      left_id: number | null;
      right_id: number | null;
      created_at: string;
      updated_at: string;
      creator_id: number | null;
      updater_id: number | null;
      read_rule_class: string | null;
      read_rule_id: number | null;
      trash: number;
      type_id: number | null;
      db_content: string | null;
    }>("SELECT id, name, key, codename, left_id, right_id, created_at, updated_at, creator_id, updater_id, read_rule_class, read_rule_id, trash, type_id, db_content FROM cards ORDER BY id", []);
    const rows = result.rows;
    expect(rows.length).toBe(corpus.cards.length);
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      const corpusRow = corpus.cards[i]!;
      expect(row.id, `row ${i} id`).toBe(corpusRow.id);
      expect(row.name, `row ${corpusRow.id} name`).toBe(corpusRow.name);
      expect(row.key, `row ${corpusRow.id} key`).toBe(corpusRow.key);
      expect(row.codename, `row ${corpusRow.id} codename`).toBe(corpusRow.codename);
      expect(row.left_id, `row ${corpusRow.id} left_id`).toBe(corpusRow.leftId);
      expect(row.right_id, `row ${corpusRow.id} right_id`).toBe(corpusRow.rightId);
      expect(row.created_at, `row ${corpusRow.id} created_at`).toBe(corpusRow.createdAt);
      expect(row.updated_at, `row ${corpusRow.id} updated_at`).toBe(corpusRow.updatedAt);
      expect(row.creator_id, `row ${corpusRow.id} creator_id`).toBe(corpusRow.creatorId);
      expect(row.updater_id, `row ${corpusRow.id} updater_id`).toBe(corpusRow.updaterId);
      expect(row.read_rule_class, `row ${corpusRow.id} read_rule_class`).toBe(corpusRow.readRuleClass);
      expect(row.read_rule_id, `row ${corpusRow.id} read_rule_id`).toBe(corpusRow.readRuleId);
      expect(row.trash, `row ${corpusRow.id} trash`).toBe(corpusRow.trash);
      expect(row.type_id, `row ${corpusRow.id} type_id`).toBe(corpusRow.typeId);
      expect(row.db_content, `row ${corpusRow.id} db_content`).toBe(corpusRow.dbContent);
    }
  });

  it("the fresh deck's account system rides the corpus rows (the boot contract)", async () => {
    storage = await createRenderTestStorage({ bootstrapReadRules: false });
    const driver = storage.fetcher.driver;
    await bootstrapFreshDeck({ driver, defaultsCorpus: loadDefaultsSeedCorpusAsset() });
    // leg 1 - the system actors resolve (actor.ts:50's bootstrapped sense)
    const bot = await actorBot(driver);
    const anon = await actorAnonymous(driver);
    expect(bot.name).toBe("Decko Bot");
    expect(anon.name).toBe("Anonymous");
    // leg 2 - the account field ids resolve (signin.ts:124's codenames)
    expect(await resolveAccountIds(driver)).not.toBeNull();
  });
});
