// The `when:` predicates of the list / collection / content / assets /
// history / rule set modules — their TRUTH TABLES, pinned from the Ruby
// source, not from the port's own output.
//
// Each case below names the Ruby line it comes from and states the truth
// table the source implies. A predicate that changes behaviour in the port
// without one of these changing is a parity break this file is here to
// catch; the port's rendered bytes are not consulted anywhere in here.
//
//   item_to_insert                mod/list set/abstract/01_list/events.rb:43-45
//   validate_item_type?           mod/list set/abstract/01_list/events.rb:39-41
//   unique_items?                 mod/collection set/all/item_assignment.rb:1-3
//   update_structurees_references? mod/content set/right/structure.rb:34-36
//   codename?                     card/lib/card/codename.rb:10-12
//   asset_inputter?               mod/assets set/abstract/asset_inputter.rb:72-74
//   no_history?                   mod/history set/all/history.rb:6-8
//   preference?                   card/lib/card/rule/all.rb:42-54
//
// The list/collection two read state the deck boot populates per save
// (mod-loader/mod-event-state-sources.ts), so their populated answers are
// exercised here through the real sources over a real read engine rather
// than by hand-setting the field — otherwise the two halves could drift
// apart without any case noticing.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createActionsTestStorage,
  seedCard,
  seedStandardDeck,
  SET_TYPE_ID,
  type ActionsTestStorage,
} from "../actions/actions-test-storage.js";
import { listModEventPredicates } from "../../../src/card/mod-loader/mods/card-mod-list.js";
import { collectionModEventPredicates } from "../../../src/card/mod-loader/mods/card-mod-collection.js";
import { contentModEventPredicates } from "../../../src/card/mod-loader/mods/card-mod-content.js";
import { assetsModEventPredicates } from "../../../src/card/mod-loader/mods/card-mod-assets.js";
import { historyModEventPredicates } from "../../../src/card/mod-loader/mods/card-mod-history.js";
import { permissionsModEventPredicates } from "../../../src/card/mod-loader/mods/card-mod-permissions.js";
import { registerDeckModEventCardStateSources } from "../../../src/card/mod-loader/mod-event-state-sources.js";
import {
  clearModEventCardStateSources,
  modEventCardStateSources,
  populateModEventCardState,
} from "../../../src/card/mod-loader/mod-event-card-state.js";
import { defaultDeckEventPredicates } from "../../../src/card/mod-loader/default-mod-deck.js";
import type { ModEventCard } from "../../../src/card/mod-loader/mod-manifest.js";

// ids for the fixture's type_plus_right cards
const STYLE_TYPE_ID = 200;
const SCRIPT_TYPE_ID = 201;
const STYLESHEETS_TYPE_ID = 202;
const LIST_TYPE_ID = 203;
const JUNCTION_TYPE_ID = 204;
const SKIN_ID = 210;
const SCRIPT_ID = 211;
const SCRIPT_LEFT_SET_ID = 212;
const NON_SET_LEFT_ID = 213;
const BOOTSTRAP_SET_ID = 214;
const SETTING_TYPE_ID = 215;
const USER_TYPE_ID = 216;
const PREF_SET_ID = 217;
const PREF_USER_ID = 218;
const EMAIL_SETTING_ID = 225;
const PLAIN_LIST_ID = 220;
const STYLE_RULE_ID = 221;
const SCRIPT_RULE_ID = 222;
const STYLESHEETS_RULE_ID = 223;
const NON_SET_STYLE_RULE_ID = 224;
const NON_SET_SCRIPT_RULE_ID = 226;
const CODENAMED_CARD_ID = 230;
const PLAIN_CARD_ID = 231;

/** The deck every `hasOkItemTypes` / `preference?` case resolves against:
 *  the Set codename card (seedStandardDeck), the two codename cards the
 *  three type_plus_right sets key on (*style, *script, *bootswatch_skin),
 *  a Set-typed and a non-Set-typed left, and the setting/user names the
 *  preference walk reads. */
async function seedTypePlusRightDeck(storage: ActionsTestStorage): Promise<void> {
  await seedStandardDeck(storage); // provides the codename-'set' card (SET_TYPE_ID)
  const style = await seedCard(storage, {
    id: STYLE_TYPE_ID, name: "*style", codename: "style",
  });
  const script = await seedCard(storage, {
    id: SCRIPT_TYPE_ID, name: "*script", codename: "script",
  });
  const stylesheets = await seedCard(storage, {
    id: STYLESHEETS_TYPE_ID, name: "*stylesheets", codename: "stylesheets",
  });
  const listType = await seedCard(storage, {
    id: LIST_TYPE_ID, name: "List", codename: "list",
  });
  const junction = await seedCard(storage, {
    id: JUNCTION_TYPE_ID, name: "Search", codename: "search",
  });
  const skin = await seedCard(storage, {
    id: SKIN_ID, name: "*bootswatch_skin", codename: "bootswatch_skin",
  });
    const scriptLeftSet = await seedCard(storage, {
    id: SCRIPT_LEFT_SET_ID, name: "Bootstrap", typeId: SET_TYPE_ID,
  });
  const nonSetLeft = await seedCard(storage, { id: NON_SET_LEFT_ID, name: "NotASet" });
  const bootstrapSet = await seedCard(storage, {
    id: BOOTSTRAP_SET_ID, name: "Bootstrap set", typeId: SET_TYPE_ID,
  });
  const setting = await seedCard(storage, {
    id: SETTING_TYPE_ID, name: "Setting", codename: "setting",
  });
  const userType = await seedCard(storage, {
    id: USER_TYPE_ID, name: "User", codename: "user",
  });
  const prefSet = await seedCard(storage, { id: PREF_SET_ID, name: "Prefs", typeId: SET_TYPE_ID });
  const prefUser = await seedCard(storage, { id: PREF_USER_ID, name: "JOE", typeId: userType.id });
  // the right part must be a SETTING-typed card for the walk's second
  // clause (rule/all.rb:45 `Card.fetch_type_id(name.right) == SettingID`).
  await seedCard(storage, {
    id: EMAIL_SETTING_ID, name: "*email", codename: "email", typeId: setting.id,
  });

  // `<set>+*style` — TypePlusRight::Set::Style (style.rb:1-3)
  await seedCard(storage, {
    id: STYLE_RULE_ID, leftId: bootstrapSet.id, rightId: style.id, typeId: listType.id,
  });
  // `<set>+*script` — TypePlusRight::Set::Script (script.rb:1)
  await seedCard(storage, {
    id: SCRIPT_RULE_ID, leftId: scriptLeftSet.id, rightId: script.id, typeId: junction.id,
  });
  // `<skin>+*stylesheets` — TypePlusRight::BootswatchSkin::Stylesheets
  // (bootswatch_skin/stylesheets.rb:1) — the port registers this set as a
  // passive module (card-mod-bootstrap.ts), so its ok_item_types override
  // is part of the deck even with no views.
  await seedCard(storage, {
    id: STYLESHEETS_RULE_ID, leftId: skin.id, rightId: stylesheets.id, typeId: junction.id,
  });
  // the two NEGATIVE shapes: a right that is *style but a LEFT that is not
  // a Set card, and a right that is *script but a left that is not a Set
  // card. Neither carries the set, so ok_item_types stays nil.
  await seedCard(storage, {
    id: NON_SET_STYLE_RULE_ID, leftId: nonSetLeft.id, rightId: style.id, typeId: listType.id,
  });
  await seedCard(storage, {
    id: NON_SET_SCRIPT_RULE_ID, leftId: nonSetLeft.id, rightId: script.id, typeId: junction.id,
  });
  // a plain card with no codename and one with: the codename? truth table
  // reads both. (seedStandardDeck already seeds a "Pudding" at id 50; the
  // cards table's key column is unique, so these carry distinct names.)
  await seedCard(storage, {
    id: PLAIN_LIST_ID, name: "Plain list card", dbContent: "v1",
  });
  await seedCard(storage, {
    id: CODENAMED_CARD_ID, name: "Codenamed card", codename: "pudding_codenamed",
  });
}

/** Populate one card through the real per-save sources, exactly as the
 *  save path does (card-action-engine.ts#dispatchEventStage). */
async function populated(
  storage: ActionsTestStorage,
  card: ModEventCard,
  params?: Readonly<Record<string, unknown>>,
): Promise<ModEventCard> {
  return populateModEventCardState(card, {
    ...(params !== undefined ? { params } : {}),
    authCurrentId: null,
    isActCard: true,
    driver: storage.driver,
    lexicon: storage.engine.lexicon,
    fetch: storage.engine,
  });
}

describe("event when: predicates — list / collection / content / assets / history / rule", () => {
  let storage: ActionsTestStorage;

  beforeAll(async () => {
    storage = await createActionsTestStorage();
    await seedTypePlusRightDeck(storage);
    clearModEventCardStateSources();
    registerDeckModEventCardStateSources();
  });

  afterAll(async () => {
    clearModEventCardStateSources();
    await storage.close();
  });

  // -------------------------------------------------------------------------
  // item_to_insert (mod/list set/abstract/01_list/events.rb:43-45)
  // -------------------------------------------------------------------------

  describe("item_to_insert (events.rb:43-45)", () => {
    // Ruby: `def item_to_insert; Env.params["insert_item"]; end` — a plain
    // hash read, and when_condition_applies? takes the returned VALUE's
    // truthiness (all.rb:79-85). Ruby's only falsy values are nil/false,
    // so a missing key is false and an EMPTY STRING is TRUE.
    it("is false when the request carried no insert_item param", () => {
      expect(listModEventPredicates.item_to_insert({ name: "Pudding" })).toBe(false);
      expect(
        listModEventPredicates.item_to_insert({ name: "Pudding", params: {} }),
      ).toBe(false);
      expect(
        listModEventPredicates.item_to_insert({
          name: "Pudding",
          params: { insert_item: undefined as unknown as string },
        }),
      ).toBe(false);
    });

    it("is true when the request carried insert_item, whatever the value", () => {
      expect(
        listModEventPredicates.item_to_insert({
          name: "Pudding",
          params: { insert_item: "MyPudding" },
        }),
      ).toBe(true);
      // Ruby's `""` is truthy, so the event fires and the body splices ""
      // — the gate is presence, not non-emptiness.
      expect(
        listModEventPredicates.item_to_insert({ name: "Pudding", params: { insert_item: "" } }),
      ).toBe(true);
    });

    it("reads the same Env.params the save path populates (coreSource)", async () => {
      const card = await populated(storage, { name: "Pudding", action: "update" }, {
        insert_item: "MyPudding",
      });
      expect(listModEventPredicates.item_to_insert(card)).toBe(true);
      const without = await populated(storage, { name: "Pudding", action: "update" });
      expect(listModEventPredicates.item_to_insert(without)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // validate_item_type? (events.rb:39-41) + its three ok_item_types owners
  // -------------------------------------------------------------------------

  describe("validate_item_type? (events.rb:39-41, ok_item_types.events.rb:35-37)", () => {
    // Ruby: `def ok_item_types; nil; end` + `def validate_item_type?;
    // ok_item_types.present?; end`. The base is nil, so a plain list card
    // is FALSE. Exactly three set modules override ok_item_types, in three
    // different mods.
    it("is false for a plain list card (the nil base, events.rb:35-37)", async () => {
      const card = await populated(storage, { name: "Pudding", action: "update" });
      expect(listModEventPredicates["validate_item_type?"](card)).toBe(false);
    });

    it("is true for `<set>+*style` (style.rb:5-7)", async () => {
      const card = await populated(storage, {
        name: "Bootstrap set+*style",
        action: "update",
      });
      expect(listModEventPredicates["validate_item_type?"](card)).toBe(true);
    });

    it("is true for `<set>+*script` (script.rb:3-5)", async () => {
      const card = await populated(storage, { name: "Bootstrap+*script", action: "update" });
      expect(listModEventPredicates["validate_item_type?"](card)).toBe(true);
    });

    it("is true for a `*bootswatch_skin`-righted card (bootswatch_skin/stylesheets.rb:3-5)", async () => {
      const card = await populated(storage, {
        name: "Bootswatch theme+*bootswatch_skin",
        action: "update",
      });
      expect(listModEventPredicates["validate_item_type?"](card)).toBe(true);
    });

    it("is false when the *style right is there but the LEFT is not a Set card", async () => {
      const card = await populated(storage, { name: "NotASet+*style", action: "update" });
      expect(listModEventPredicates["validate_item_type?"](card)).toBe(false);
    });

    it("is false when the *script right is there but the LEFT is not a Set card", async () => {
      const card = await populated(storage, { name: "NotASet+*script", action: "update" });
      expect(listModEventPredicates["validate_item_type?"](card)).toBe(false);
    });

    it("is false off the read engine (no fetch => unresolvable => the base's nil)", async () => {
      const card = await populateModEventCardState(
        { name: "Bootstrap set+*style", action: "update" },
        {
          authCurrentId: null,
          isActCard: true,
          driver: storage.driver,
          lexicon: storage.engine.lexicon,
        },
      );
      expect(listModEventPredicates["validate_item_type?"](card)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // unique_items? (mod/collection set/all/item_assignment.rb:1-3)
  // -------------------------------------------------------------------------

  describe("unique_items? (item_assignment.rb:1-3)", () => {
    // Ruby: `def unique_items?; false; end`. No set module in the deck's gem
    // tree overrides it (the only other mention is its one caller,
    // item_assignment.rb:75), so the answer is false for EVERY card — which
    // is why mod/list's :validate_item_uniqueness (events.rb:29-33) never
    // fires, exactly as events.rb:25-28's comment says.
    it("is false for every card", async () => {
      const card = await populated(storage, { name: "Pudding", action: "update" });
      expect(collectionModEventPredicates["unique_items?"](card)).toBe(false);
      const style = await populated(storage, { name: "Bootstrap set+*style", action: "update" });
      expect(collectionModEventPredicates["unique_items?"](style)).toBe(false);
    });

    it("reads the state field, so an override would have one place to answer", () => {
      expect(
        collectionModEventPredicates["unique_items?"]({
          name: "Pudding",
          uniqueItems: true,
        }),
      ).toBe(true);
      expect(
        collectionModEventPredicates["unique_items?"]({
          name: "Pudding",
          uniqueItems: false,
        }),
      ).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // update_structurees_references? (mod/content set/right/structure.rb:34-36)
  // -------------------------------------------------------------------------

  describe("update_structurees_references? (structure.rb:34-36)", () => {
    // Ruby: `db_content_changed? || action == :delete` — the ActiveRecord
    // dirty reader for db_content, OR a delete. The :integrate stage runs
    // after the row write, and integration_phase calls
    // `@card.restore_changes_information` first
    // (card/lib/card/director/phases.rb:48) so the act's saved change still
    // reads as changed there. The port's changedFields is that same dirty
    // set, computed from the before/after pair.
    it("is false on an update that did not touch content", () => {
      expect(
        contentModEventPredicates["update_structurees_references?"]({
          name: "Pudding",
          action: "update",
          changedFields: ["name"],
        }),
      ).toBe(false);
    });

    it("is true on an update that changed db_content", () => {
      expect(
        contentModEventPredicates["update_structurees_references?"]({
          name: "Pudding",
          action: "update",
          changedFields: ["name", "db_content"],
        }),
      ).toBe(true);
    });

    it("is true on a create that changed db_content", () => {
      expect(
        contentModEventPredicates["update_structurees_references?"]({
          name: "Pudding",
          action: "create",
          changedFields: ["name", "type_id", "db_content"],
        }),
      ).toBe(true);
    });

    it("is true on a delete regardless of the dirty set (the action arm)", () => {
      expect(
        contentModEventPredicates["update_structurees_references?"]({
          name: "Pudding",
          action: "delete",
          changedFields: ["trash"],
        }),
      ).toBe(true);
      // a delete whose dirty set is empty still fires on the action arm
      expect(
        contentModEventPredicates["update_structurees_references?"]({
          name: "Pudding",
          action: "delete",
          changedFields: [],
        }),
      ).toBe(true);
    });

    it("is false on a save with no dirty set at all", () => {
      expect(
        contentModEventPredicates["update_structurees_references?"]({
          name: "Pudding",
          action: "update",
        }),
      ).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // codename? (card/lib/card/codename.rb:10-12)
  // -------------------------------------------------------------------------

  describe("codename? (codename.rb:10-12)", () => {
    // Ruby: `def codename?; codename.present?; end`. present? is BLANKNESS,
    // not mere non-null: "" and whitespace are blank and answer false.
    it("is true only for a present codename", () => {
      expect(assetsModEventPredicates["codename?"]({ name: "Pudding", codename: "basic" })).toBe(true);
    });

    it("is false for an absent, empty or blank codename", () => {
      expect(assetsModEventPredicates["codename?"]({ name: "Pudding" })).toBe(false);
      expect(assetsModEventPredicates["codename?"]({ name: "Pudding", codename: "" })).toBe(false);
      expect(assetsModEventPredicates["codename?"]({ name: "Pudding", codename: "   " })).toBe(false);
    });

    it("reads the codename the assets state source populated from the row", async () => {
      const card = await populated(storage, {
        name: "Pudding the codenamed",
        id: CODENAMED_CARD_ID,
        action: "delete",
      });
      expect(card.codename).toBe("pudding_codenamed");
      expect(assetsModEventPredicates["codename?"](card)).toBe(true);

      const plain = await populated(storage, {
        name: "Pudding",
        id: PLAIN_CARD_ID,
        action: "delete",
      });
      expect(plain.codename).toBeUndefined();
      expect(assetsModEventPredicates["codename?"](plain)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // asset_inputter? (mod/assets set/abstract/asset_inputter.rb:72-74)
  // -------------------------------------------------------------------------

  describe("asset_inputter? (asset_inputter.rb:72-74)", () => {
    // Ruby: `def asset_inputter?; true; end` — the set's own opt-in flag,
    // marked "for override", true for every card carrying
    // Abstract::AssetInputter. No set module in the gem tree overrides it.
    it("is true for any card (the set's unconditional opt-in)", () => {
      expect(assetsModEventPredicates["asset_inputter?"]({ name: "Pudding" })).toBe(true);
      expect(assetsModEventPredicates["asset_inputter?"]({ name: "", id: 1 })).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // no_history? (mod/history set/all/history.rb:6-8)
  // -------------------------------------------------------------------------

  describe("no_history? (history.rb:6-8)", () => {
    // Ruby: `def history?; true; end` + `def no_history?; !history?; end`.
    // The pair is the SAME flag read under both names; :assign_action's
    // gate (actionable?, events.rb:53) and carrierwave's removal events
    // (card_mount.rb:37/:46/:51) must agree.
    it("is the exact negation of history? for every card", () => {
      const cases = [
        undefined,
        true,
        false,
      ];
      for (const history of cases) {
        const card: ModEventCard = { name: "Pudding", ...(history !== undefined ? { history } : {}) };
        expect(historyModEventPredicates["no_history?"](card)).toBe(
        !historyModEventPredicates["actionable?"](card),
      );
      }
    });

    it("is false for a card whose type keeps history (the default)", () => {
      expect(historyModEventPredicates["no_history?"]({ name: "Pudding" })).toBe(false);
      expect(historyModEventPredicates["no_history?"]({ name: "Pudding", history: true })).toBe(false);
    });

    it("is true for a no-history type (+*password, +*salt, *recent settings)", () => {
      expect(historyModEventPredicates["no_history?"]({ name: "Joe+*password", history: false })).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // preference? (card/lib/card/rule/all.rb:42-54)
  // -------------------------------------------------------------------------

  describe("preference? (rule/all.rb:42-54)", () => {
    // Ruby: `name.parts.length > 2 && (Card.fetch_type_id(name.right) ==
    // SettingID) && (Card.fetch_type_id(name[0..-3]) == SetID) &&
    // valid_preferer?`, where valid_preferer? (rule/all.rb:56-59) is
    // `self[-2, skip_modules: true]` typed User OR codename :all.
    // mod/follow's set/right/follow.rb:7-9 gates
    // :cache_expired_for_new_preference on it.
    const check = (name: string, withFetch = true): Promise<boolean> =>
      permissionsModEventPredicates["preference?"]({ name }, {
        driver: storage.driver,
        lexicon: storage.engine.lexicon,
        stage: "integrate",
        skipEvent: () => false,
        ...(withFetch ? { fetch: storage.engine } : {}),
      });

    it("is true for `<set>+<user>+*setting` (every clause satisfied)", async () => {
      expect(await check("Prefs+JOE+*email")).toBe(true);
    });

    it("is true for `<set>+*all+*setting` (the :all preferer, rule/all.rb:58)", async () => {
      expect(await check("Prefs+*all+*email")).toBe(true);
    });

    it("is false when the right part is not a Setting", async () => {
      // `Pudding` is not setting-typed, so Card.fetch_type_id(name.right)
      // != SettingID fails the second clause.
      expect(await check("Prefs+JOE+Pudding")).toBe(false);
    });

    it("is false when the trunk is not a Set", async () => {
      // `Pudding` is not set-typed, so name[0..-3] != SetID fails.
      expect(await check("Pudding+JOE+*email")).toBe(false);
    });

    it("is false when the preferer is neither User-typed nor *all", async () => {
      // `Pudding` is a plain card (basic type), so valid_preferer? fails.
      expect(await check("Prefs+Pudding+*email")).toBe(false);
    });

    it("is false for a name with two parts (parts.length > 2 fails first)", async () => {
      expect(await check("Pudding")).toBe(false);
      expect(await check("Pudding+Pudding")).toBe(false);
    });

    it("is false for an empty name", async () => {
      expect(await check("")).toBe(false);
    });

    it("is false off the read engine (Ruby's walk needs the deck; absent => false)", async () => {
      expect(await check("Email+JOE+*email", false)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // the deck composition resolves every registered predicate
  // -------------------------------------------------------------------------

  describe("the deck-boot predicate table", () => {
    it("registers one source per mod that contributes predicate state", () => {
      const mods = modEventCardStateSources().map((s) => s.modName);
      expect(new Set(mods)).toEqual(
        new Set(["core", "history", "list", "assets"]),
      );
    });

    it("resolves every registered non-carrierwave when: name", () => {
      const table = defaultDeckEventPredicates();
      for (const name of [
        "item_to_insert",
        "validate_item_type?",
        "unique_items?",
        "update_structurees_references?",
        "codename?",
        "asset_inputter?",
        "no_history?",
        "preference?",
      ] as const) {
        expect(typeof table[name], `${name} must resolve`).toBe("function");
      }
    });
  });
});
