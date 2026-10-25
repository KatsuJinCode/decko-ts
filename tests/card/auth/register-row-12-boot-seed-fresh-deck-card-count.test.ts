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
// tools/oracle/defaults-seed-corpus.rb into
// src/card/auth/defaults-seed-corpus.ts (cards + the corpus's own
// action/act/reference rows - Cardio::Seed::TABLES minus the two Ruby
// migration ledgers, which record the RUBY schema's versions, not deck
// content). boot-seed.ts's layer A inserts it directly, seed.rb:20-22's
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
import { DEFAULTS_FIXTURE_ACTS, DEFAULTS_FIXTURE_ACTIONS, DEFAULTS_FIXTURE_CARDS, DEFAULTS_FIXTURE_CHANGES, DEFAULTS_FIXTURE_REFERENCES } from "../../../src/card/auth/defaults-seed-corpus.js";
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
    const outcome = await bootstrapFreshDeck({ driver });
    expect(outcome.ok).toBe(true);
    // The per-table INSERT counts equal the corpus's own row counts.
    expect(outcome.defaultsRowsInserted).toEqual({
      cards: DEFAULTS_FIXTURE_CARDS.length,
      actions: DEFAULTS_FIXTURE_ACTIONS.length,
      acts: DEFAULTS_FIXTURE_ACTS.length,
      changes: DEFAULTS_FIXTURE_CHANGES.length,
      references: DEFAULTS_FIXTURE_REFERENCES.length,
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
    await bootstrapFreshDeck({ driver });
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
    expect(rows.length).toBe(DEFAULTS_FIXTURE_CARDS.length);
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      const corpus = DEFAULTS_FIXTURE_CARDS[i]!;
      expect(row.id, `row ${i} id`).toBe(corpus.id);
      expect(row.name, `row ${corpus.id} name`).toBe(corpus.name);
      expect(row.key, `row ${corpus.id} key`).toBe(corpus.key);
      expect(row.codename, `row ${corpus.id} codename`).toBe(corpus.codename);
      expect(row.left_id, `row ${corpus.id} left_id`).toBe(corpus.leftId);
      expect(row.right_id, `row ${corpus.id} right_id`).toBe(corpus.rightId);
      expect(row.created_at, `row ${corpus.id} created_at`).toBe(corpus.createdAt);
      expect(row.updated_at, `row ${corpus.id} updated_at`).toBe(corpus.updatedAt);
      expect(row.creator_id, `row ${corpus.id} creator_id`).toBe(corpus.creatorId);
      expect(row.updater_id, `row ${corpus.id} updater_id`).toBe(corpus.updaterId);
      expect(row.read_rule_class, `row ${corpus.id} read_rule_class`).toBe(corpus.readRuleClass);
      expect(row.read_rule_id, `row ${corpus.id} read_rule_id`).toBe(corpus.readRuleId);
      expect(row.trash, `row ${corpus.id} trash`).toBe(corpus.trash);
      expect(row.type_id, `row ${corpus.id} type_id`).toBe(corpus.typeId);
      expect(row.db_content, `row ${corpus.id} db_content`).toBe(corpus.dbContent);
    }
  });

  it("the fresh deck's account system rides the corpus rows (the boot contract)", async () => {
    storage = await createRenderTestStorage({ bootstrapReadRules: false });
    const driver = storage.fetcher.driver;
    await bootstrapFreshDeck({ driver });
    // leg 1 - the system actors resolve (actor.ts:50's bootstrapped sense)
    const bot = await actorBot(driver);
    const anon = await actorAnonymous(driver);
    expect(bot.name).toBe("Decko Bot");
    expect(anon.name).toBe("Anonymous");
    // leg 2 - the account field ids resolve (signin.ts:124's codenames)
    expect(await resolveAccountIds(driver)).not.toBeNull();
  });
});
