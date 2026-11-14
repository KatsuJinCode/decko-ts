// The count of a count-returning CQL is the count for the VIEWER, not for the
// deck. Ruby computes it lazily under the current user (set/abstract/0_search.rb:
// 35-39, `count` forces `return: :count` through the same query as the item
// search), and the query carries the viewer's read filter (card-1.110.0
// lib/card/query/sql_statement/where.rb:79-84, permission_conditions:
// `read_rule_id IN (readable rules)` unless Auth.always_ok?).
//
// The port warms counts once per engine, before any viewer exists, and splits
// each count by stored read rule (card-mod-search.ts prepareSearchCounts). Each
// view then applies the viewer's read scope to those groups. These pins hold
// the anonymous and always-ok counts to Ruby's answers on decks where read
// rules differ card by card.
//
// Ruby values for these decks were measured on the Ruby oracle
// (reference-harness/oracle/app, decko 0.20.0 / card 1.110.0) with the same
// rows, on 2026-10-14.

import { describe, it, expect } from "vitest";
import {
  BOOTSTRAP_READ_SUBSTRATE_IDS,
  bindModLoaderToEngine,
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import { ModLoader, modEngineHost, setDefaultModLoader } from "../../../src/card/mod-loader.js";
import cardModSearch from "../../../src/card/mod-loader/mods/card-mod-search.js";

const CATCH_ALL = BOOTSTRAP_READ_SUBSTRATE_IDS.rule;
const CARDTYPE = 5;
const BASIC = 2;
const SET_TYPE = BOOTSTRAP_READ_SUBSTRATE_IDS.set;
const DECKO_BOT = 1;
const ADMINISTRATOR = 710;
const ADMIN_RULE = 721;

/** The deck every case shares: the Basic items, the count card, and the
 *  codename cards the always-ok viewer and the rule walk resolve.
 *  `differing` gives the items three different read rules: a catch-all item,
 *  an item whose rule only Administrator holds, and an item with no rule. */
async function seedDeck(s: RenderTestStorage, differing: boolean): Promise<void> {
  await seedCard(s, { id: 5, name: "Cardtype", codename: "cardtype", typeId: CARDTYPE, readRuleId: CATCH_ALL, readRuleClass: "*all" });
  await seedCard(s, { id: BASIC, name: "Basic", typeId: CARDTYPE, readRuleId: CATCH_ALL, readRuleClass: "*all" });
  await seedCard(s, { id: 200, name: "Search", codename: "search_type", typeId: CARDTYPE, readRuleId: CATCH_ALL, readRuleClass: "*all" });
  await seedCard(s, { id: DECKO_BOT, name: "Decko Bot", codename: "decko_bot", typeId: CARDTYPE, readRuleId: CATCH_ALL, readRuleClass: "*all" });
  await seedCard(s, {
    id: 302,
    name: "Counting Search",
    typeId: 200,
    dbContent: '{"type":"Basic","return":"count"}',
    readRuleId: CATCH_ALL,
    readRuleClass: "*all",
  });
  await seedCard(s, { id: 401, name: "Open Item", typeId: BASIC, dbContent: "open", readRuleId: CATCH_ALL, readRuleClass: "*all" });
  if (differing) {
    // The rule only the Administrator role reads through: a set card, its
    // *read junction, referenced to the role card (not to Anyone).
    await seedCard(s, { id: ADMINISTRATOR, name: "Administrator", codename: "administrator", typeId: CARDTYPE, readRuleId: CATCH_ALL, readRuleClass: "*all" });
    await seedCard(s, { id: 720, name: "Restricted Set", typeId: SET_TYPE, readRuleId: CATCH_ALL, readRuleClass: "*all" });
    await seedCard(s, { id: ADMIN_RULE, leftId: 720, rightId: BOOTSTRAP_READ_SUBSTRATE_IDS.read, typeId: 4, readRuleId: CATCH_ALL, readRuleClass: "*all" });
    await seedReference(s, ADMIN_RULE, ADMINISTRATOR, "administrator");
    await seedCard(s, { id: 402, name: "Restricted Item", typeId: BASIC, dbContent: "admin", readRuleId: ADMIN_RULE, readRuleClass: "*all" });
    // No stored rule: never readable through the stored id, so no viewer counts it
    // except the always-ok one.
    await seedCard(s, { id: 403, name: "Unruled Item", typeId: BASIC, dbContent: "unruled" });
  } else {
    await seedCard(s, { id: 402, name: "Second Item", typeId: BASIC, dbContent: "two", readRuleId: CATCH_ALL, readRuleClass: "*all" });
    await seedCard(s, { id: 403, name: "Third Item", typeId: BASIC, dbContent: "three", readRuleId: CATCH_ALL, readRuleClass: "*all" });
  }
}

/** A fresh deck with its own warm, read under one viewer. The count warm is
 *  per engine and last-warm-wins (card-mod-search.ts module note), so each case
 *  builds its own deck and installs its own warm before it renders. */
async function countFor(
  differing: boolean,
  viewer: { signedIn: boolean; actorId?: number },
): Promise<string> {
  const s = await createRenderTestStorage();
  try {
    await seedDeck(s, differing);
    const loader = new ModLoader([{ manifest: cardModSearch }]);
    loader.load();
    bindModLoaderToEngine(s, loader);
    await loader.installInto(modEngineHost(s.engine, s.fetcher));
    s.engine.viewer = viewer;
    return await s.engine.render("Counting Search", "count");
  } finally {
    s.close();
    setDefaultModLoader(undefined);
  }
}

describe("card-mod-search count follows the viewer's read scope (where.rb:79-84)", () => {
  it("uniform rules: the anonymous count is the readable items plus the stock rule junction typed Basic (Ruby: 4)", async () => {
    // Three catch-all items, plus the *all+*read rule junction, which the
    // default substrate types Basic and stamps with the catch-all. The
    // substrate's other Basic-typed rows carry no stored rule, and the read
    // filter drops them for anonymous. Ruby: 4.
    expect(await countFor(false, { signedIn: false })).toBe("4");
  });

  it("differing rules: the anonymous count admits only the rules Anonymous reads through (Ruby: 2)", async () => {
    // Open Item (catch-all) and the rule junction count. Restricted Item's
    // rule is referenced to Administrator, which Anonymous does not hold, and
    // Unruled Item has no rule, so IN (...) excludes both.
    expect(await countFor(true, { signedIn: false })).toBe("2");
  });

  it("differing rules: the always-ok viewer counts every Basic row, including the unruled one (Ruby: 8)", async () => {
    // Decko Bot is always-ok (permissions.rb:7-14, DeckoBotID), so the filter is
    // not applied: all three items and the five substrate rows typed Basic.
    expect(await countFor(true, { signedIn: true, actorId: DECKO_BOT })).toBe("8");
  });
});
