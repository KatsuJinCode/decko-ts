// Rule-cache type-filter probes for the *structure leg of the cold-write
// template walk (type-resolution.ts templateTypeId's structure loop), using
// the same D-arm convention as the *default leg's probes
// (rule-cache-set-type-decoy-probes.test.ts).
//
// structure_rule_card is rule_card(:structure) — a RULE-CACHE lookup
// (rule/all.rb:9-15 -> rule_id_lookup :66-73). A row enters Card::Rule::Cache
// only when the rule's LEFT part card is Set-typed (`sets.type_id = #{SetID}`,
// rule/cache.rb:17) and its RIGHT part card is Setting-typed
// (`settings.type_id = #{SettingID}`, rule/cache.rb:18). For the structure
// walk the right part is the CONSTANT *structure card (Setting-typed, codename
// "structure"), so the cache.rb:18 gate is LOOP-INVARIANT — checked once, not
// per candidate — while cache.rb:17 is PER-CANDIDATE (the left part differs
// per pattern; a failed gate is a hash-miss fall-through to the next pattern,
// rule/all.rb:66-73). A live card merely SITTING at a "<set>+*structure" name
// whose <set> part is not a Set is NOT a rule candidate; this walk resolves
// candidates by NAME through the plain fetch (type-resolution.ts
// fetchWithOptions), and plain fetches are type-blind in the reference
// implementation too — the filter lives in the CACHE.
//
// Arms (every deck is COLD: setNameEnvironment(undefined)):
//   SD1  mechanism pin: the decoy *structure rule card is name-visible to
//        the exact fetch the structure walk issues — that fetch is a plain
//        Card.fetch-shaped lookup and MUST keep seeing the card; the
//        filter belongs to the walk, not the fetch.
//   SD2  THE DECOY: a live card at "*all+*right+*structure" whose left
//        part "*all+*right" is NOT Set-typed (typeId 3, Cardtype) must NOT
//        type the dup via the *structure rule — the walk falls through to
//        Card.default_type_id, the *all+*default card's type 42. A 90 here
//        is the walk ACCEPTING the decoy.
//   SD3  the accepted direction (control): the same *structure rule with a
//        SET-typed left part (typeId SET_TYPE_ID) MUST resolve 90 —
//        rule/cache.rb:17 passes, rule/all.rb:66-73 finds it, no
//        over-rejection.
//   SD4  Setting-side loop-invariance pin (the mirror of the *default leg's
//        gate): with the *structure card itself NOT Setting-typed,
//        NO "<set>+*structure" row can be in the cache (rule/cache.rb:18) —
//        the walk must resolve nothing and the create falls to 42, even
//        though the set card and the rule row are otherwise genuine.
//   SD5  gate scope: the *default Setting gate belongs to the DEFAULT leg
//        only. With *default NOT Setting-typed (its cache rows all dead)
//        but *structure Setting-typed and the Set-typed "*all+*right"
//        *structure rule in place, the dup rides Card.default_type_id
//        (`type_id || Card.default_type_id`) and the structure rule STILL
//        wins — 90, not 42.
//   SD6  anchorless decoy: a card parked at "*all plus+*structure" (its
//        left part is the *all plus PATTERN card — Setting-typed, never a
//        Set) must not type the dup for a plain compound create "Zed+Woo";
//        rule/cache.rb:17 kills every anchorless non-all candidate,
//        because a rule card whose left part is a Setting card is not in
//        the cache.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createActionsTestStorage,
  seedCard,
  seedReference,
  type ActionsTestStorage,
} from "./actions-test-storage.js";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";
import { DeckoName } from "../../../src/card/name.js";
import { setNameEnvironment } from "../../../src/card/name/environment.js";

const SET_TYPE_ID = 2; // the Set cardtype card's id (codename "set")
const SETTING_TYPE_ID = 21; // the Setting cardtype card's id (codename "setting")
const GLOBAL_DEFAULT_TYPE = 42; // *all+*default rule card's own type (Rich Text)
const DECOY_TYPE = 90; // "Exotic Type" — distinct from the default, so an
// accepted decoy is observationally distinguishable from the 42 fall-through.

/** Codename + rule skeleton: the cardtype/setting cards the rule/cache.rb:18
 *  gate reads, plus the *structure setting card the structure leg's
 *  loop-invariant gate checks. `*all+*default` (33) is the defaultTypeId tail
 *  card. The gate decks re-type ONE setting card each (SD4: *structure, SD5:
 *  *default) — the override parameter, not a re-seed (ids are UNIQUE). */
async function seedSkeleton(
  s: ActionsTestStorage,
  opts: { starDefaultTypeId?: number; starStructureTypeId?: number } = {},
): Promise<void> {
  await seedCard(s, { id: 1, name: "*all", codename: "all", typeId: SET_TYPE_ID });
  await seedCard(s, { id: 2, name: "Set", codename: "set", typeId: 3 });
  await seedCard(s, { id: 3, name: "Cardtype", codename: "cardtype", typeId: 3 });
  await seedCard(s, { id: 4, name: "*create", codename: "create", typeId: SETTING_TYPE_ID });
  await seedCard(s, { id: 5, name: "*update", codename: "update", typeId: SETTING_TYPE_ID });
  await seedCard(s, { id: 16, name: "*delete", codename: "delete", typeId: SETTING_TYPE_ID });
  await seedCard(s, { id: 6, name: "Anyone", codename: "anyone" });
  await seedCard(s, { id: 7, name: "Editor" });
  await seedCard(s, { id: 8, name: "*type", codename: "type", typeId: SETTING_TYPE_ID });
  await seedCard(s, {
    id: 14, name: "*structure", codename: "structure",
    typeId: opts.starStructureTypeId ?? SETTING_TYPE_ID,
  });
  await seedCard(s, {
    id: 17, name: "*default", codename: "default",
    typeId: opts.starDefaultTypeId ?? SETTING_TYPE_ID,
  });
  await seedCard(s, { id: 18, name: "*right", codename: "right", typeId: SETTING_TYPE_ID });
  await seedCard(s, {
    id: 21, name: "Setting", codename: "setting", typeId: 3,
  });
  await seedCard(s, {
    id: 22, name: "*all plus", codename: "all_plus", typeId: SETTING_TYPE_ID,
  });
  await seedCard(s, { id: 11, name: "Anonymous User", codename: "anonymous" });
  await seedCard(s, { id: 42, name: "Rich Text", typeId: 3 });
  await seedCard(s, {
    id: 33, name: "*all+*default", leftId: 1, rightId: 17,
    typeId: GLOBAL_DEFAULT_TYPE,
  });
  await seedCard(s, { id: 30, name: "Zed", typeId: GLOBAL_DEFAULT_TYPE });
  await seedCard(s, { id: 90, name: "Exotic Type", typeId: 3 });
  // the write fallback every real deck bootstraps: *all+*create -> [[Anyone]]
  await seedCard(s, {
    id: 10, name: "*all+*create", leftId: 1, rightId: 4,
    typeId: SET_TYPE_ID, dbContent: "[[Anyone]]",
  });
  await seedReference(s, 10, 6, "anyone");
}

/** DECOY deck: the *right-set *structure rule's left part is a live card at
 *  "*all+*right" that is NOT Set-typed (typeId 3), and the anchorless
 *  "*all plus+*structure" decoy sits on the Setting-typed pattern card. */
async function seedStructureDecoyDeck(): Promise<ActionsTestStorage> {
  const s = await createActionsTestStorage();
  await seedSkeleton(s);
  await seedCard(s, {
    id: 31, name: "*all+*right", leftId: 1, rightId: 18,
    typeId: 3, // Cardtype — NOT the Set type: the decoy's poisoned left part
  });
  await seedCard(s, {
    id: 32, name: "*all+*right+*structure", leftId: 31, rightId: 14,
    typeId: DECOY_TYPE,
  });
  await seedCard(s, {
    id: 34, name: "*all plus+*structure", leftId: 22, rightId: 14,
    typeId: DECOY_TYPE,
  });
  return s;
}

/** REAL deck: the same *structure rule, but the left part IS Set-typed
 *  (rule/cache.rb:17 passes — this rule is a genuine rule). */
async function seedRealStructureRuleDeck(): Promise<ActionsTestStorage> {
  const s = await createActionsTestStorage();
  await seedSkeleton(s);
  await seedCard(s, {
    id: 31, name: "*all+*right", leftId: 1, rightId: 18,
    typeId: SET_TYPE_ID,
  });
  await seedCard(s, {
    id: 32, name: "*all+*right+*structure", leftId: 31, rightId: 14,
    typeId: DECOY_TYPE,
  });
  return s;
}

/** SETTING-GATE deck (SD4): a genuine Set-typed set card and *structure
 *  rule row, but the *structure card itself is NOT Setting-typed — every
 *  "<set>+*structure" row fails cache.rb:18, so the structure leg resolves
 *  nothing. */
async function seedStructureSettingGateDeck(): Promise<ActionsTestStorage> {
  const s = await createActionsTestStorage();
  await seedSkeleton(s, { starStructureTypeId: 3 }); // *structure NOT Setting-typed
  await seedCard(s, {
    id: 31, name: "*all+*right", leftId: 1, rightId: 18,
    typeId: SET_TYPE_ID,
  });
  await seedCard(s, {
    id: 32, name: "*all+*right+*structure", leftId: 31, rightId: 14,
    typeId: DECOY_TYPE,
  });
  return s;
}

/** GATE-SCOPE deck (SD5): *default is NOT Setting-typed (the default leg's
 *  cache rows are all dead) while the *structure leg's candidates are
 *  genuine — the dup must ride Card.default_type_id and the structure rule
 *  must still win. */
async function seedDefaultGateClosedDeck(): Promise<ActionsTestStorage> {
  const s = await createActionsTestStorage();
  await seedSkeleton(s, { starDefaultTypeId: 3 }); // *default NOT Setting-typed
  await seedCard(s, {
    id: 31, name: "*all+*right", leftId: 1, rightId: 18,
    typeId: SET_TYPE_ID,
  });
  await seedCard(s, {
    id: 32, name: "*all+*right+*structure", leftId: 31, rightId: 14,
    typeId: DECOY_TYPE,
  });
  return s;
}

function anonEngine(s: ActionsTestStorage): CardActionEngine {
  return new CardActionEngine(s.engine, { actor: null, ipAddress: "192.0.2.7" });
}

beforeEach(() => {
  setNameEnvironment(undefined); // declared-cold state for every arm
});

afterEach(() => {
  setNameEnvironment(undefined); // leave no warm env for the next file
});

describe("structure-leg rule-cache decoy probes (cache.rb:17-18 vs the *structure template walk)", () => {
  it("SD1 (mechanism): the decoy *structure card is name-visible to the exact fetch the walk issues", async () => {
    const s = await seedStructureDecoyDeck();
    // type-resolution.ts's structure loop fetches [setName, "*structure"] —
    // the plain, type-blind lookup. Ruby's plain fetch sees the card too
    // (fetch is not the filter; the RULE CACHE is — cache.rb:17-18).
    const ruleCard = await s.engine.fetchWithOptions(
      [DeckoName.parse("*all+*right"), DeckoName.parse("*structure")],
      { skipModules: true },
    );
    expect(ruleCard?.typeId).toBe(DECOY_TYPE);
  });

  it("SD2 (THE DECOY, Ruby: fall through to *all+*default): non-Set left part must not type the dup — new card gets 42, not 90", async () => {
    const s = await seedStructureDecoyDeck();
    const engine = anonEngine(s);
    const result = await engine.createCard({ name: "Zed+*all" }); // no explicit type
    expect(result?.cardId).toBeDefined();
    const row = await s.selectOne<{ type_id: number }>(
      "SELECT type_id FROM cards WHERE left_id = 30 AND right_id = 1",
    );
    // Ruby: rule_id_lookup walks the cache (rule/all.rb:66-73); the decoy
    // row is absent (cache.rb:17: sets.type_id 3 != SetID 2) -> structure
    // nil -> template = the *default rule (none name-scoped here) ->
    // Card.default_type_id -> *all+*default (33) -> type 42.
    expect(row?.type_id).toBe(GLOBAL_DEFAULT_TYPE);
  });

  it("SD3 (control, the accepted direction): a SET-typed left part lets the *structure rule type the dup — 90", async () => {
    const s = await seedRealStructureRuleDeck();
    const engine = anonEngine(s);
    const result = await engine.createCard({ name: "Zed+*all" }); // no explicit type
    expect(result?.cardId).toBeDefined();
    const row = await s.selectOne<{ type_id: number }>(
      "SELECT type_id FROM cards WHERE left_id = 30 AND right_id = 1",
    );
    // Ruby: the rule row passes cache.rb:17 (sets.type_id == SetID) and
    // cache.rb:18 (*structure is Setting-typed) -> rule_id_lookup finds
    // "1+right+structure" -> structure_rule_card IS the template
    // -> its type 90. Pins that the filter does not
    // over-reject genuine *structure rules.
    expect(row?.type_id).toBe(DECOY_TYPE);
  });

  it("SD4 (Setting-side loop-invariance): a *structure card that is not Setting-typed kills the whole structure walk — 42", async () => {
    const s = await seedStructureSettingGateDeck();
    const engine = anonEngine(s);
    const result = await engine.createCard({ name: "Zed+*all" }); // no explicit type
    expect(result?.cardId).toBeDefined();
    const row = await s.selectOne<{ type_id: number }>(
      "SELECT type_id FROM cards WHERE left_id = 30 AND right_id = 1",
    );
    // Ruby: every "<set>+*structure" row's right part IS the constant
    // *structure card; with settings.type_id 3 != SettingID (cache.rb:18)
    // NO structure row is in the cache, whatever the set side looks like
    // -> structure_rule_card nil -> default_type_id 42. The walk checks
    // this ONCE (loop-invariant), not per candidate.
    expect(row?.type_id).toBe(GLOBAL_DEFAULT_TYPE);
  });

  it("SD5 (gate scope): a *default card that is not Setting-typed blinds only the default leg — the *structure rule still wins, 90", async () => {
    const s = await seedDefaultGateClosedDeck();
    const engine = anonEngine(s);
    const result = await engine.createCard({ name: "Zed+*all" }); // no explicit type
    expect(result?.cardId).toBeDefined();
    const row = await s.selectOne<{ type_id: number }>(
      "SELECT type_id FROM cards WHERE left_id = 30 AND right_id = 1",
    );
    // Ruby: rule_card(:default) misses (cache.rb:18 kills every *default
    // row) -> default nil -> dup_structure types the dup
    // Card.default_type_id (`type_id || Card.default_type_id`) and structure_rule_card runs
    // on the dup: the *all+*right+*structure row passes :17 AND :18 ->
    // template type 90. The two Setting gates are independent.
    expect(row?.type_id).toBe(DECOY_TYPE);
  });

  it("SD6 (anchorless decoy): a card at '*all plus+*structure' must not type the dup for a plain compound create", async () => {
    const s = await seedStructureDecoyDeck();
    const engine = anonEngine(s);
    const result = await engine.createCard({ name: "Zed+Woo" }); // no explicit type
    expect(result?.cardId).toBeDefined();
    const row = await s.selectOne<{ type_id: number }>(
      `SELECT c.type_id FROM cards c JOIN cards r ON c.right_id = r.id
       WHERE c.left_id = 30 AND r.key = 'woo'`,
    );
    // Ruby: the *all plus candidate's lookup key ("all_plus+structure")
    // never appears in the cache — the row's left part (*all plus, a
    // Setting card) fails cache.rb:17. Fall through to the 42 default.
    expect(row?.type_id).toBe(GLOBAL_DEFAULT_TYPE);
  });
});
