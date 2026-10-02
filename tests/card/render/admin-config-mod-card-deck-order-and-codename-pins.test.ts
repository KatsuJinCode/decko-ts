// admin-config-mod-card-deck-order-and-codename-pins.test.ts -- the
// fama-remainder lane's MEMBER 3 pin (roleConfigsView over-render).
//
// WHAT IS PINNED
//   Two defects in `prepareAdminRuntime`'s mod-card step
//   (src/card/mod-loader/mods/core-admin-runtime.ts), both of which the Ruby
//   sources and the corpus bytes independently demand:
//
//   1. ORDER.  Ruby's `all_configs` is
//        card/mod/core/set/all/admin.rb:19-21,40-42
//          def mod_cards_with_config
//            Card.search(type: :mod).select { |mod| mod.admin_config.present? }
//          end
//          def all_configs
//            mod_cards_with_config.map(&:admin_config_objects).flatten
//          end
//      so a config section's ITEM ORDER is the deck's mod-card order, not
//      the mods' names.  The oracle pins it: the `Configurations` section of
//      the Administrator page reads *title, *credit (mod: format, card
//      45437), *Ace (mod: ace editor, 45475), *TinyMCE (mod: tinymce editor,
//      45509), *home, *main menu, *getting started links (mod: defaults,
//      45513) -- ascending card id.  Name order would have read ace editor,
//      defaults, format, recaptcha, tinymce editor.
//      The port sorted modCards by name; these pins hold the deck order.
//
//   2. CODENAME.  Ruby's `modname` is the CARD's codename with the prefix
//      stripped -- card/mod/core/set/type/mod.rb:164-166
//          def modname
//            codename.to_s.gsub(/^mod_/, "")
//          end
//      but the port derived it from the card NAME via `DeckoName#key` (the
//      url_key), which decays the plural gem names.  Measured over every
//      mod card in bench-corpus-raw.sqlite3 (sha256 6a44dfdc...): the deck
//      stores `mod_defaults`, `mod_permissions`, `mod_rules`, `mod_assets`,
//      `mod_tabs`, `mod_shades`; the key gives `mod_default`,
//      `mod_permission`, `mod_rule`, `mod_asset`, `mod_tab`, `mod_shade`.
//      ADMIN_CONFIG is keyed by GEM name, so the derived key silently
//      dropped whole mods from all_configs -- `mod: defaults` resolved to
//      "default", losing *home, *main menu and *getting started links,
//      which are the last three items of the oracle's Administrator
//      Configurations section.  (`modCardCoreHtml` already read
//      `card.record.codename`; this was the one path that did not.)
//
// RED-VERIFIED by reverting each half in place (see the receipt).
//
// WHAT IS NOT PINNED, AND WHY (the open remainder)
//   The per-ROLE assignment.  Measured this lane, corpus vs oracle:
//        role        corpus walk (Ruby-faithful)          oracle
//        administrator  configurations 9, settings 22    configurations 7
//        shark          cardtypes 37                     cardtypes 8,
//                                                         settings 21,
//                                                         configurations 1
//        help_desk      (nothing)                        settings 1
//   No single walk order over this corpus reproduces the oracle's split:
//   STAR-before-TYPE (the order card/lib/card/set/pattern/all.rb:41
//   `safe_set_keys` pins via the corpus set_keys) sends `*credit`
//   (type HTML, `HTML+*type+*update` = Shark) to Administrator, which the
//   oracle agrees with, but also sends `*head` / `*structure` (type Setting
//   278, for which NO `Setting+*type+*update` row exists) to Administrator,
//   which the oracle contradicts (Shark).  TYPE-before-STAR inverts both.
//   The corpus carries only two relevant rules: `*star+*update` =
//   "Administrator/Wagneer" (id 6556) and nine `<T>+*type+*update` = "Shark".
//   The remaining over-render on the Administrator/Shark/Help Desk pages is
//   the capture-time rule state, the same class as the pointer one-line
//   count pin next door -- not reachable from this deck.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { modEngineHost } from "../../../src/card/mod-loader/mod-engine-host.js";
import { bindModuleAdminHost } from "../../../src/card/mod-loader/mods/core-mod.js";
import {
  ADMIN_CONFIG,
  adminRuntimeState,
  prepareAdminRuntime,
} from "../../../src/card/mod-loader/mods/core-admin-runtime.js";
import { createRenderTestStorage, seedCard, type RenderTestStorage } from "./render-test-storage.js";

/** DECK ids: format(30) < ace editor(31) < tinymce editor(32) < defaults(33).
 *  NAME order would be ace editor < defaults < format < tinymce editor, so
 *  the two orders disagree and this fixture catches a re-introduced sort. */
const MOD_FORMAT = 30;
const MOD_ACE = 31;
const MOD_TINYMCE = 32;
const MOD_DEFAULTS = 33;

const MOD_CARDTYPE = 10;
const STAR = 20;
const UPDATE = 21;
const TYPE_SETTING = 22;
const ALL = 23;
const SET_CARDTYPE = 24;
const ROLE_CARDTYPE = 25;
const ADMINISTRATOR = 26;
const TITLE_CARD = 27;
const HOME_CARD = 28;
const ACE_CARD = 29;
const TINYMCE_CARD = 34;
const MAIN_MENU_CARD = 35;
const GETTING_STARTED_CARD = 36;

let storage: RenderTestStorage;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const seed = async (opts: Parameters<typeof seedCard>[1]) => {
    await seedCard(storage, opts);
  };

  // -- the set-pattern + role vocabulary the *update walk reads ----------
  await seed({ id: MOD_CARDTYPE, name: "Mod", codename: "mod", typeId: SET_CARDTYPE, typeName: "Cardtype" });
  await seed({ id: SET_CARDTYPE, name: "Cardtype", codename: "cardtype", typeId: SET_CARDTYPE, typeName: "Cardtype" });
  await seed({ id: ROLE_CARDTYPE, name: "Role", codename: "role", typeId: SET_CARDTYPE, typeName: "Cardtype" });
  await seed({ id: ADMINISTRATOR, name: "Administrator", codename: "administrator", typeId: ROLE_CARDTYPE, typeName: "Role" });
  await seed({ id: STAR, name: "*star", codename: "star", typeId: SET_CARDTYPE, typeName: "Set" });
  await seed({ id: ALL, name: "*all", codename: "all", typeId: SET_CARDTYPE, typeName: "Set" });
  await seed({ id: TYPE_SETTING, name: "*type", codename: "type", typeId: 2, typeName: "Setting" });
  await seed({ id: UPDATE, name: "*update", codename: "update", typeId: 2, typeName: "Setting" });

  // -- the star-named setting codename cards ------------------------------
  await seed({ id: TITLE_CARD, name: "*title", codename: "title", typeId: TYPE_SETTING, typeName: "Setting" });
  await seed({ id: ACE_CARD, name: "*Ace", codename: "ace", typeId: TYPE_SETTING, typeName: "Setting" });
  await seed({ id: TINYMCE_CARD, name: "*TinyMCE", codename: "tiny_mce", typeId: TYPE_SETTING, typeName: "Setting" });
  await seed({ id: HOME_CARD, name: "*home", codename: "home", typeId: 3, typeName: "Pointer" });
  await seed({ id: MAIN_MENU_CARD, name: "*main menu", codename: "main_menu", typeId: 3, typeName: "Pointer" });
  await seed({ id: GETTING_STARTED_CARD, name: "*getting started links", codename: "getting_started_links", typeId: 3, typeName: "Pointer" });

  // -- the four mod cards, DECK order, with their stored plural codenames -
  await seed({ id: MOD_FORMAT, name: "mod: format", codename: "mod_format", typeId: MOD_CARDTYPE, typeName: "Mod" });
  await seed({ id: MOD_ACE, name: "mod: ace editor", codename: "mod_ace_editor", typeId: MOD_CARDTYPE, typeName: "Mod" });
  await seed({ id: MOD_TINYMCE, name: "mod: tinymce editor", codename: "mod_tinymce_editor", typeId: MOD_CARDTYPE, typeName: "Mod" });
  await seed({ id: MOD_DEFAULTS, name: "mod: defaults", codename: "mod_defaults", typeId: MOD_CARDTYPE, typeName: "Mod" });

  // -- `*star+*update` = Administrator: the rule the walk finds ----------
  await seed({ id: 200, name: "*star+*update", leftId: STAR, rightId: UPDATE, typeId: 47, typeName: "List", dbContent: "Administrator\nWagneer" });
});

afterAll(() => {
  storage?.close();
});

async function runtimeState() {
  const host = modEngineHost(storage.engine, storage.fetcher);
  bindModuleAdminHost(host);
  await prepareAdminRuntime(host);
  const state = adminRuntimeState(host);
  if (state === undefined) throw new Error("no admin runtime state");
  return state;
}

describe("admin config items: the mod-card deck order (admin.rb:19-21,40-42)", () => {
  it("keeps modCards in deck order, not name order", async () => {
    const state = await runtimeState();
    const names = state.modCards.map((m) => m.name);
    expect(names).toEqual([
      "mod: format",
      "mod: ace editor",
      "mod: tinymce editor",
      "mod: defaults",
    ]);
    // the order the pin is really about, spelled out so a name sort fails here
    expect(names.indexOf("mod: defaults")).toBeGreaterThan(names.indexOf("mod: tinymce editor"));
  });
});

describe("admin config items: the mod card's stored codename (type/mod.rb:164-166)", () => {
  it("reads cards.codename, so the plural gem names survive", async () => {
    const state = await runtimeState();
    const byName = new Map(state.modCards.map((m) => [m.name, m.codename]));
    expect(byName.get("mod: defaults")).toBe("mod_defaults");
    expect(byName.get("mod: ace editor")).toBe("mod_ace_editor");
    expect(byName.get("mod: tinymce editor")).toBe("mod_tinymce_editor");
    expect(byName.get("mod: format")).toBe("mod_format");
  });

  it("every gem-named mod resolves into ADMIN_CONFIG (modnameFromCodename)", async () => {
    const state = await runtimeState();
    for (const modCard of state.modCards) {
      const modname = modCard.codename.replace(/^mod_/, "");
      expect(
        ADMIN_CONFIG[modname],
        `${modCard.name} (${modCard.codename}) has no ADMIN_CONFIG entry`,
      ).toBeDefined();
    }
    // the specific regression: "default" is not a gem name, "defaults" is
    expect(ADMIN_CONFIG["default"]).toBeUndefined();
    expect(ADMIN_CONFIG["defaults"]).toBeDefined();
  });

  it("the defaults mod's three configuration codenames are reachable", async () => {
    const state = await runtimeState();
    for (const codename of ["home", "main_menu", "getting_started_links"]) {
      expect(state.rolesByCardCodename.get(codename)).toEqual(["administrator"]);
    }
    expect(state.rolesByCardCodename.get("title")).toEqual(["administrator"]);
    expect(state.rolesByCardCodename.get("ace")).toEqual(["administrator"]);
    expect(state.rolesByCardCodename.get("tiny_mce")).toEqual(["administrator"]);
  });
});
