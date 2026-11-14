// Rule::Cache port tests — the STORAGE side of the codename-form rule cache
// (card-1.110.0 lib/card/rule/cache.rb#lookup_key).
//
// Ruby builds the deck-wide rule lookup hash by joining rule/set/setting
// rows in SQL and mapping each row to the key
// "[anchor_id, pattern_code, setting_code].compact.map(&:to_s).join('+')"
// where pattern_code/setting_code come from the CARDS CODENAME COLUMN via
// Card::Codename[id] (cache.rb:50-56) — rows whose pattern or setting card
// carries no codename are SKIPPED, trashed rows are excluded by the SQL, and
// *follow rules with empty db_content are excluded (cache.rb:20).
//
// The runtime half (Set::Pattern::All#rule_lookup_keys ->
// Rule::All#rule_id_lookup) is already ported (card-patterns.ts#ruleLookupKeysForCard,
// instance.ts#ruleLookupKey) — these tests close the loop: keys the runtime
// builds for a seeded card must hit the hash the storage side builds from
// the same rows.
//
// ORACLE anchor: tests/card/set-patterns/set-pattern-oracle-capture.json
// rule_name_check.rule_lookup_key_sample — 12 entries from Ruby's own
// Card::Rule::Cache, captured in the committed fixture ("all+read" => 10,
// "46+self+read" => 48, ...). The seeds below reproduce that deck's
// codename-relevant rows with the sample's own ids, so the built hash must
// contain every sample pair verbatim.

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import {
  buildRuleLookupHash,
  ruleCacheStatement,
  type RuleCacheRow,
} from "../../../src/card/rules/rule-cache.js";
import { ruleLookupKeysForCard } from "../../../src/card/set-patterns/card-patterns.js";

const ORACLE_CAPTURE = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL("../set-patterns/set-pattern-oracle-capture.json", import.meta.url),
    ),
    "utf-8",
  ),
) as {
  rule_name_check: { rule_lookup_key_sample: Record<string, number> };
};

/** The 12 key->rule-id pairs in Ruby's captured cache sample (the fixture). */
const ORACLE_SAMPLE = ORACLE_CAPTURE.rule_name_check.rule_lookup_key_sample;

let storage: RenderTestStorage | undefined;

// Deck ids mirror the oracle capture's (pattern ids [.., all=7, all_plus=20,
// right=26, self=27]; the sample's rule ids 10/48/53/72/... become the seeded
// rule rows' ids so the built hash reproduces the sample VERBATIM).
const SET_TYPE_ID = 8; // the *set card's id (cache.rb SQL `sets.type_id = SetID`)
const SETTING_TYPE_ID = 11; // the *setting card's id (`settings.type_id = SettingID`)

beforeAll(async () => {
  // No bootstrap: this file exercises Rule::Cache's rule_card_id lookups over
// a deck it builds itself, and the stock *all+*read rule would answer them.
storage = await createRenderTestStorage({ bootstrapReadRules: false });
  const s = storage;

  // -- the registry itself (cards the id constants derive from, generate_id
  //    constants-style: SetID <- codename "set", SettingID <- "setting")
  await seedCard(s, { id: SET_TYPE_ID, name: "*set", codename: "set" });
  await seedCard(s, { id: SETTING_TYPE_ID, name: "*setting", codename: "setting" });

  // -- set-pattern / set cards (type_id = SetID)
  await seedCard(s, { id: 7, name: "*all", codename: "all", typeId: SET_TYPE_ID });
  await seedCard(s, { id: 20, name: "*all plus", codename: "all_plus", typeId: SET_TYPE_ID });
  await seedCard(s, { id: 26, name: "*right", codename: "right", typeId: SET_TYPE_ID });
  await seedCard(s, { id: 27, name: "*self", codename: "self", typeId: SET_TYPE_ID });
  // an anchorless set card with NO codename (its rows must be skipped)
  await seedCard(s, { id: 60, name: "*uncoded set", typeId: SET_TYPE_ID });
  // an anchored set-pattern tag with NO codename (anchored skip arm)
  await seedCard(s, { id: 14, name: "*uncoded tag", typeId: SET_TYPE_ID });

  // -- setting cards (type_id = SettingID)
  await seedCard(s, { id: 9, name: "*read", codename: "read", typeId: SETTING_TYPE_ID });
  await seedCard(s, { id: 12, name: "*follow", codename: "follow", typeId: SETTING_TYPE_ID });
  // a setting card with NO codename (its rules must be skipped)
  await seedCard(s, { id: 13, name: "*custom setting", typeId: SETTING_TYPE_ID });
  // a TRASHED setting card (SQL excludes it)
  await seedCard(s, {
    id: 16,
    name: "*custom2",
    codename: "custom2",
    typeId: SETTING_TYPE_ID,
    trash: true,
  });

  // -- anchors (plain cards; the capture sample's anchor ids verbatim).
  //    Anchor 46 doubles as the card the runtime walk runs for (RichText
  //    type so the *type pattern applies: keys "46+self", "2+type", "all").
  await seedCard(s, { id: 2, name: "RichText", codename: "rich_text" });
  for (const anchorId of [46, 51, 55, 89, 90, 101, 205, 211, 216, 221, 224, 288, 291]) {
    await seedCard(s, { id: anchorId, name: `Anchor ${anchorId}` });
  }

  // -- set junction rows (left=anchor, right=pattern tag, type_id = SetID)
  const setRows: Array<[number, number, number]> = [
    // [set row id, anchor id, pattern tag id]
    [47, 46, 27], [52, 51, 27], [102, 101, 27],
    [206, 205, 26], [212, 211, 26], [217, 216, 26],
    [222, 221, 26], [225, 224, 26],
    [289, 288, 27], [292, 291, 27],
    [56, 55, 14], // uncoded tag — its rule must be skipped
    [84, 90, 27], // trashed set — its rule must be excluded
    [88, 89, 27], // set of the trashed RULE arm (unique junction pairs:
    // the schema's UNIQUE(left_id, right_id) mirrors the deck — a re-created
    // rule card REVIVES the trashed row, trash.rb pull_from_trash!, so
    // trashed and live rows never share a junction pair)
  ];
  for (const [id, leftId, rightId] of setRows) {
    await seedCard(s, {
      id,
      name: `Anchor ${leftId}+${rightId === 27 ? "*self" : rightId === 26 ? "*right" : "*uncoded tag"}`,
      leftId,
      rightId,
      typeId: SET_TYPE_ID,
      trash: id === 84,
    });
  }

  // -- rule rows: the capture sample's pairs verbatim + the skip/exclusion arms
  const rules: Array<{
    id: number;
    leftId: number;
    rightId: number;
    dbContent?: string | null;
    trash?: boolean;
  }> = [
    // the 12 oracle pairs (rule id = the sample's value)
    { id: 10, leftId: 7, rightId: 9 },   // all+read
    { id: 48, leftId: 47, rightId: 9 },  // 46+self+read
    { id: 53, leftId: 52, rightId: 9 },  // 51+self+read
    { id: 72, leftId: 20, rightId: 9 },  // all_plus+read
    { id: 103, leftId: 102, rightId: 9 }, // 101+self+read
    { id: 208, leftId: 206, rightId: 9 }, // 205+right+read
    { id: 213, leftId: 212, rightId: 9 }, // 211+right+read
    { id: 218, leftId: 217, rightId: 9 }, // 216+right+read
    { id: 223, leftId: 222, rightId: 9 }, // 221+right+read
    { id: 226, leftId: 225, rightId: 9 }, // 224+right+read
    { id: 290, leftId: 289, rightId: 9 }, // 288+self+read
    { id: 293, leftId: 292, rightId: 9 }, // 291+self+read
    // *follow with content — INCLUDED as all+follow (unique pair (7,12))
    { id: 71, leftId: 7, rightId: 12, dbContent: '{"view":"noscroll"}' },
    // --- exclusion arms (must NOT appear in the hash; every junction pair
    //     below is unique across the whole seed) ---
    // rule on a setting card with no codename
    { id: 100, leftId: 7, rightId: 13 },
    // rule on a set whose PATTERN tag has no codename (anchored arm)
    { id: 57, leftId: 56, rightId: 9 },
    // rule on an anchorless set card with no codename (anchorless arm)
    { id: 61, leftId: 60, rightId: 9 },
    // *follow rules with empty/NULL content (cache.rb:20): on OTHER sets,
    // since *all+*follow is taken by the content-bearing rule above
    { id: 70, leftId: 47, rightId: 12, dbContent: "" },
    { id: 73, leftId: 52, rightId: 12, dbContent: null },
    // trashed rule on its own set (89+self+read must stay absent)
    { id: 80, leftId: 88, rightId: 9, trash: true },
    // rule on a trashed setting card
    { id: 81, leftId: 7, rightId: 16 },
    // rule on a trashed set
    { id: 85, leftId: 84, rightId: 9 },
  ];
  for (const r of rules) {
    await seedCard(s, {
      id: r.id,
      leftId: r.leftId,
      rightId: r.rightId,
      // undefined (unset) seeds real content; an explicit null/"" seed is
      // the follow-exclusion arm's payload and must reach the column as-is
      dbContent: r.dbContent !== undefined ? r.dbContent : "rule content",
      trash: r.trash === true,
    });
  }

}, 60_000);

afterAll(() => {
  storage?.close();
});

/** Load the registry and build the hash exactly as the engine would: the
 *  cache SQL (registry-resolved Set/Setting type ids) -> rows -> codename
 *  registry id->codename -> keys. */
async function loadRuleCache(): Promise<Map<string, number>> {
  const s = storage!;
  await s.fetcher.codenames.ensureLoaded();
  const statement = ruleCacheStatement(SET_TYPE_ID, SETTING_TYPE_ID);
  const result = await s.fetcher.driver.query<RuleCacheRow>(statement.sql, statement.params);
  return buildRuleLookupHash(
    result.rows,
    (id) => s.fetcher.codenames.peekNameForId(id),
  );
}

describe("Rule::Cache storage side (cache.rb#lookup_key)", () => {
  it("contains every entry of Ruby's live cache sample verbatim", async () => {
    const hash = await loadRuleCache();
    for (const [key, ruleId] of Object.entries(ORACLE_SAMPLE)) {
      expect(hash.get(key), `cache key "${key}"`).toBe(ruleId);
    }
  });

  it("adds the content-bearing *follow rule the sample shape implies", async () => {
    // cache.rb:20 excludes *follow rules with EMPTY content only
    const hash = await loadRuleCache();
    expect(hash.get("all+follow")).toBe(71);
  });

  it("skips rules whose setting card has no codename (setting_code nil)", async () => {
    const hash = await loadRuleCache();
    expect(hash.size).toBe(13); // 12 oracle pairs + all+follow
    expect([...hash.values()]).not.toContain(100);
  });

  it("skips rules whose pattern card has no codename, both arms", async () => {
    const hash = await loadRuleCache();
    // anchored arm: pattern_code from set_tag_id (cache.rb:52-53)
    expect([...hash.values()]).not.toContain(57);
    // anchorless arm: pattern_code from set_id (cache.rb:52)
    expect([...hash.values()]).not.toContain(61);
  });

  it("excludes trashed rules, sets, and settings (cache.rb SQL)", async () => {
    const hash = await loadRuleCache();
    expect(hash.has("89+self+read")).toBe(false); // trashed rule 80
    expect([...hash.values()]).not.toContain(80);
    expect([...hash.values()]).not.toContain(81); // trashed setting
    expect([...hash.values()]).not.toContain(85); // trashed set
  });

  it("excludes *follow rules with empty or NULL content only", async () => {
    const hash = await loadRuleCache();
    // the content-bearing *all+*follow survives; the empty (46+*self+*follow)
    // and NULL (51+*self+*follow) ones do not
    expect(hash.has("46+self+follow")).toBe(false);
    expect(hash.has("51+self+follow")).toBe(false);
  });
});

describe("runtime walk over the built cache (rule/all.rb#rule_id_lookup)", () => {
  it("hits the most-specific lookup key first", async () => {
    const s = storage!;
    await s.fetcher.codenames.ensureLoaded();
    const hash = await loadRuleCache();
    // capture card[0] rule_lookup_keys shape: ["<id>+self", "<typeId>+type", "all"]
    const keys = ruleLookupKeysForCard({
      name: "Anchor 46",
      id: 46,
      typeId: 2,
      typeName: "RichText",
    });
    expect(keys).toEqual(["46+self", "2+type", "all"]);
    expect(keys[keys.length - 1]).toBe("all");
    const settingCode = "read";
    let hit: number | undefined;
    for (const key of keys) {
      hit = hash.get(`${key}+${settingCode}`);
      if (hit !== undefined) break;
    }
    // "46+self+read" (48) beats "all+read" (10) — most-specific first
    expect(hit).toBe(48);
  });

  it("falls through to *all when no specific key hits", async () => {
    const hash = await loadRuleCache();
    const keys = ["599+self", "2+type", "all"];
    let hit: number | undefined;
    for (const key of keys) {
      hit = hash.get(`${key}+read`);
      if (hit !== undefined) break;
    }
    expect(hit).toBe(10);
  });

  it("returns undefined when no key hits at all", async () => {
    const hash = await loadRuleCache();
    let hit: number | undefined;
    for (const key of ["599+self", "all"]) {
      hit = hash.get(`${key}+nonexistent_setting`);
      if (hit !== undefined) break;
    }
    expect(hit).toBeUndefined();
  });
});

// The RUNTIME half, and the three places where it differs from walking
// rule card NAMES. Ruby reads rules through the cache exclusively:
// Card::Rule::All#rule_card_id is `rule_id_lookup Card::Rule.rule_cache,
// setting_code` (card-1.110.0 lib/card/rule/all.rb:23-27) and
// #rule_card fetches that id (:19-21). There is no name-based fallback in
// Ruby, so each divergence below is one where a name walk answers and Ruby
// does not — the port must answer Ruby's way.
describe("Rule::Cache runtime half (rule/all.rb#rule_card_id)", () => {
  let s: RenderTestStorage;

  beforeEach(async () => {
    s = await createRenderTestStorage({ bootstrapReadRules: false });
    // The registry cards cache.rb's SQL binds (lib/card/rule/cache.rb:17-18
    // `#{SetID}` / `#{SettingID}`, generated from the codename table at boot —
    // codename.rb:107-110 generate_id_constants).
    await seedCard(s, { id: SET_TYPE_ID, name: "*set", codename: "set" });
    await seedCard(s, { id: SETTING_TYPE_ID, name: "*setting", codename: "setting" });
    await seedCard(s, { id: 7, name: "*all", codename: "all", typeId: SET_TYPE_ID });
    await seedCard(s, { id: 27, name: "*self", codename: "self", typeId: SET_TYPE_ID });
    await seedCard(s, { id: 9, name: "*read", codename: "read", typeId: SETTING_TYPE_ID });
    // The render prepare warms the registry before any rule walk (Ruby's
    // SetID/SettingID are generated at boot, codename.rb:107-110); the
    // cache SQL's type-id binds are peeks, so they need it loaded.
    await s.fetcher.codenames.ensureLoaded();
  });

  afterEach(() => s.close());

  it("finds a *self rule whose set row the name walk cannot compose (no side ids)", async () => {
    // Ruby keys every rule by IDS: a card's *self rule is keyed
    // "<card id>+self+<setting>" whatever its NAME
    // (cache.rb:50-56 + lib/card/set/pattern/base.rb:75-80). A legacy
    // junction that stores its compound name with no side ids therefore
    // stays reachable by id, while Card::Name cannot compose it from the
    // lexicon.
    await seedCard(s, { id: 46, name: "Anchor 46", typeId: 2 });
    // a *self set junction whose stored NAME is not the composed one
    await seedCard(s, { id: 47, name: "composed_name", leftId: 46, rightId: 27, typeId: SET_TYPE_ID });
    await seedCard(s, { id: 48, name: "composed_name+*read", leftId: 47, rightId: 9, typeId: SETTING_TYPE_ID });
    const found = await s.engine.ruleCardForSetting(
      { name: "Anchor 46" as never, id: 46, typeId: 2, typeName: "RichText" },
      "read",
    );
    expect(found?.id).toBe(48);
  });

  it("does NOT reach a rule whose setting card carries no codename (cache.rb:44)", async () => {
    // cache.rb#lookup_key returns false when setting_code is nil
    // (`return false unless (setting_code = setting_code(row))`, :51) and
    // lookup_hash skips those rows (:44) — the rule is not in the cache at
    // all, so rule_card cannot answer with it, whatever its name.
    await seedCard(s, { id: 46, name: "Anchor 46", typeId: 2 });
    await seedCard(s, { id: 13, name: "*custom setting", typeId: SETTING_TYPE_ID }); // no codename
    await seedCard(s, { id: 47, name: "Anchor 46+*self", leftId: 46, rightId: 27, typeId: SET_TYPE_ID });
    await seedCard(s, { id: 48, name: "Anchor 46+*self+*custom setting", leftId: 47, rightId: 13, typeId: SETTING_TYPE_ID });
    const found = await s.engine.ruleCardForSetting(
      { name: "Anchor 46" as never, id: 46, typeId: 2, typeName: "RichText" },
      "custom_setting",
    );
    expect(found).toBeUndefined();
  });

  it("does NOT reach a rule whose anchored set-pattern card carries no codename (cache.rb:59-62 + :44)", async () => {
    // pattern_code is Card::Codename[set_tag_id] (cache.rb:59-62); an
    // uncoded tag yields nil, the row is skipped (:44-47), and the rule is
    // unreachable through the cache.
    await seedCard(s, { id: 46, name: "Anchor 46", typeId: 2 });
    await seedCard(s, { id: 14, name: "*uncoded tag", typeId: SET_TYPE_ID }); // no codename
    await seedCard(s, { id: 47, name: "Anchor 46+*uncoded tag", leftId: 46, rightId: 14, typeId: SET_TYPE_ID });
    await seedCard(s, { id: 48, name: "Anchor 46+*uncoded tag+*read", leftId: 47, rightId: 9, typeId: SETTING_TYPE_ID });
    // The *all arm still answers: the rule cache holds "all+read" and the
    // walk falls through to it, which is what Ruby does too
    // (rule/all.rb:66-74 walks every key).
    await seedCard(s, { id: 275, name: "the all read rule", leftId: 7, rightId: 9, typeId: SETTING_TYPE_ID });
    const found = await s.engine.ruleCardForSetting(
      { name: "Anchor 46" as never, id: 46, typeId: 2, typeName: "RichText" },
      "read",
    );
    expect(found?.id).toBe(275);
  });

  it("does NOT reach a trashed rule, set or setting (cache.rb:20-22)", async () => {
    await seedCard(s, { id: 46, name: "Anchor 46", typeId: 2 });
    await seedCard(s, { id: 47, name: "Anchor 46+*self", leftId: 46, rightId: 27, typeId: SET_TYPE_ID });
    await seedCard(s, { id: 48, name: "Anchor 46+*self+*read", leftId: 47, rightId: 9, typeId: SETTING_TYPE_ID, trash: true });
    const found = await s.engine.ruleCardForSetting(
      { name: "Anchor 46" as never, id: 46, typeId: 2, typeName: "RichText" },
      "read",
    );
    // falls through to *all, which has no read rule here
    expect(found).toBeUndefined();
  });

  it("walks the keys in pattern order, so the *self rule beats the *all rule", async () => {
    // rule/all.rb:66-74 iterates rule_lookup_keys in order and returns the
    // FIRST hit; Base#rule_lookup_key is "<anchor id>+<pattern code>"
    // (base.rb:75-80) so the anchored key precedes the anchorless "all".
    await seedCard(s, { id: 46, name: "Anchor 46", typeId: 2 });
    await seedCard(s, { id: 275, name: "the all read rule", leftId: 7, rightId: 9, typeId: SETTING_TYPE_ID });
    await seedCard(s, { id: 47, name: "Anchor 46+*self", leftId: 46, rightId: 27, typeId: SET_TYPE_ID });
    await seedCard(s, { id: 48, name: "the self read rule", leftId: 47, rightId: 9, typeId: SETTING_TYPE_ID });
    const found = await s.engine.ruleCardForSetting(
      { name: "Anchor 46" as never, id: 46, typeId: 2, typeName: "RichText" },
      "read",
    );
    expect(found?.id).toBe(48);
  });
});
