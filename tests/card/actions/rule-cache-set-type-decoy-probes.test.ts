// DECOY-SHAPE lane — rule-cache type-filter probes for the cold-write
// template walk (type-resolution.ts templateTypeId).
//
// Ruby ground truth (card-1.110.0 lib/card/rule/cache.rb:14-22): the rule
// cache only ever contains rows whose LEFT part card is Set-typed
// (`sets.type_id = #{SetID}`, cache.rb:17) and whose RIGHT part card is
// Setting-typed (`settings.type_id = #{SettingID}`, cache.rb:18) — the
// same Set-type test the lookup side restates as
// `Card.fetch_type_id(name.left) == SetID` (lib/card/rule/all.rb:39).
// rule_card(:default) (rule/all.rb:9-15 -> rule_id_lookup :66-73) can
// therefore never resolve a card that merely SITS at a "<set>+*default"
// name while its <set> part is not a Set. The port's walk resolves
// candidates by NAME through the plain fetch (type-resolution.ts
// templateTypeId -> fetchWithOptions), and plain fetches are type-blind
// in Ruby too — the filter lives in the CACHE, the lookup structure the
// walk is a port of.
//
// Arms (every deck is COLD: setNameEnvironment(undefined)):
//   D1  mechanism pin: the decoy rule card is name-visible to the exact
//       fetch the walk issues — that fetch is a plain Card.fetch-shaped
//       lookup and MUST keep seeing the card; the filter belongs to the
//       walk, not the fetch.
//   D2  THE DECOY: a live card at "*all+*right+*default" whose left part
//       "*all+*right" is NOT Set-typed (typeId 3, Cardtype) must NOT
//       resolve as the new-card template for "Zed+*all" — Ruby falls
//       through to Card.default_type_id (mod/core/set/all/type.rb:3-5),
//       the *all+*default card's type 42. A 90 here is the port ACCEPTING
//       the decoy — the divergence this lane hunts.
//   D3  the accepted direction (control): the same rule with a SET-typed
//       left part (typeId SET_TYPE_ID) MUST resolve 90 — cache.rb:17
//       passes, rule/all.rb:66-73 finds it, no over-rejection.
//   D4  anchorless decoy: a card parked at "*all plus+*default" (its left
//       part is the *all plus PATTERN card — Setting-typed, never a Set)
//       must not resolve for a plain compound create "Zed+Woo"; same
//       fall-through to 42. cache.rb:17 kills every anchorless non-all
//       candidate in Ruby, because a rule card whose left part is a
//       Setting card is not in the cache.

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

/** Codename + rule skeleton (the syncenv-cold-fidelity lane's shape, plus
 *  the Setting cardtype card and Setting-typed setting cards the cache.rb:18
 *  filter reads, and the *right/*all plus pattern cards the decoy set names
 *  hang off). `*all+*default` (33) is the defaultTypeId tail card. */
async function seedSkeleton(s: ActionsTestStorage): Promise<void> {
  await seedCard(s, { id: 1, name: "*all", codename: "all", typeId: SET_TYPE_ID });
  await seedCard(s, { id: 2, name: "Set", codename: "set", typeId: 3 });
  await seedCard(s, { id: 3, name: "Cardtype", codename: "cardtype", typeId: 3 });
  await seedCard(s, { id: 4, name: "*create", codename: "create", typeId: SETTING_TYPE_ID });
  await seedCard(s, { id: 5, name: "*update", codename: "update", typeId: SETTING_TYPE_ID });
  await seedCard(s, { id: 16, name: "*delete", codename: "delete", typeId: SETTING_TYPE_ID });
  await seedCard(s, { id: 6, name: "Anyone", codename: "anyone" });
  await seedCard(s, { id: 7, name: "Editor" });
  await seedCard(s, { id: 8, name: "*type", codename: "type", typeId: SETTING_TYPE_ID });
  await seedCard(s, { id: 17, name: "*default", codename: "default", typeId: SETTING_TYPE_ID });
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

/** DECOY deck: the *right-set default rule's left part is a live card at
 *  "*all+*right" that is NOT Set-typed (typeId 3), and the anchorless
 *  "*all plus+*default" decoy sits on the Setting-typed pattern card. */
async function seedDecoyDeck(): Promise<ActionsTestStorage> {
  const s = await createActionsTestStorage();
  await seedSkeleton(s);
  await seedCard(s, {
    id: 31, name: "*all+*right", leftId: 1, rightId: 18,
    typeId: 3, // Cardtype — NOT the Set type: the decoy's poisoned left part
  });
  await seedCard(s, {
    id: 32, name: "*all+*right+*default", leftId: 31, rightId: 17,
    typeId: DECOY_TYPE,
  });
  await seedCard(s, {
    id: 34, name: "*all plus+*default", leftId: 22, rightId: 17,
    typeId: DECOY_TYPE,
  });
  return s;
}

/** REAL deck: the same *right-set default rule, but the left part IS
 *  Set-typed (cache.rb:17 passes — this rule is a genuine rule). */
async function seedRealRuleDeck(): Promise<ActionsTestStorage> {
  const s = await createActionsTestStorage();
  await seedSkeleton(s);
  await seedCard(s, {
    id: 31, name: "*all+*right", leftId: 1, rightId: 18,
    typeId: SET_TYPE_ID,
  });
  await seedCard(s, {
    id: 32, name: "*all+*right+*default", leftId: 31, rightId: 17,
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

describe("rule-cache Set-type decoy probes (cache.rb:17-18 vs the name-form template walk)", () => {
  it("D1 (mechanism): the decoy card is name-visible to the exact fetch the walk issues", async () => {
    const s = await seedDecoyDeck();
    // type-resolution.ts templateTypeId fetches [setName, "*default"] — the
    // plain, type-blind lookup. Ruby's plain fetch sees the card too
    // (fetch is not the filter; the RULE CACHE is — cache.rb:17-18).
    const ruleCard = await s.engine.fetchWithOptions(
      [DeckoName.parse("*all+*right"), DeckoName.parse("*default")],
      { skipModules: true },
    );
    expect(ruleCard?.typeId).toBe(DECOY_TYPE);
  });

  it("D2 (THE DECOY, Ruby: fall through to *all+*default): non-Set left part must not resolve — new card gets 42, not 90", async () => {
    const s = await seedDecoyDeck();
    const engine = anonEngine(s);
    const result = await engine.createCard({ name: "Zed+*all" }); // no explicit type
    expect(result?.cardId).toBeDefined();
    const row = await s.selectOne<{ type_id: number }>(
      "SELECT type_id FROM cards WHERE left_id = 30 AND right_id = 1",
    );
    // Ruby: rule_id_lookup walks the cache (rule/all.rb:66-73); the decoy
    // row is absent (cache.rb:17: sets.type_id 3 != SetID 2) -> template nil
    // -> Card.default_type_id -> *all+*default (33) -> type 42.
    expect(row?.type_id).toBe(GLOBAL_DEFAULT_TYPE);
  });

  it("D3 (control, the accepted direction): a SET-typed left part resolves the rule — 90", async () => {
    const s = await seedRealRuleDeck();
    const engine = anonEngine(s);
    const result = await engine.createCard({ name: "Zed+*all" }); // no explicit type
    expect(result?.cardId).toBeDefined();
    const row = await s.selectOne<{ type_id: number }>(
      "SELECT type_id FROM cards WHERE left_id = 30 AND right_id = 1",
    );
    // Ruby: the rule row passes cache.rb:17 (sets.type_id == SetID) and
    // cache.rb:18 (*default is Setting-typed) -> rule_id_lookup finds
    // "1+right+default" -> template type 90. Pins that the filter does not
    // over-reject genuine rules.
    expect(row?.type_id).toBe(DECOY_TYPE);
  });

  it("D4 (anchorless decoy): a card at '*all plus+*default' must not resolve for a plain compound create", async () => {
    const s = await seedDecoyDeck();
    const engine = anonEngine(s);
    const result = await engine.createCard({ name: "Zed+Woo" }); // no explicit type
    expect(result?.cardId).toBeDefined();
    const row = await s.selectOne<{ type_id: number }>(
      `SELECT c.type_id FROM cards c JOIN cards r ON c.right_id = r.id
       WHERE c.left_id = 30 AND r.key = 'woo'`,
    );
    // Ruby: the *all plus candidate's lookup key ("all_plus+default") never
    // appears in the cache — the row's left part (*all plus, a Setting card)
    // fails cache.rb:17. Fall through to the 42 default.
    expect(row?.type_id).toBe(GLOBAL_DEFAULT_TYPE);
  });
});
