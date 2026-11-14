// admin-config-mod-card-deck-order-and-codename-pins.test.ts -- the
// roleConfigsView over-render pin.
//
// WHAT IS PINNED
//   Two defects in `prepareAdminRuntime`'s mod-card step
//   (src/card/mod-loader/mods/core-admin-runtime.ts), both of which the Ruby
//   sources and the deck's own bytes demand:
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
//      the mods' names: the Ruby code flattens the mod cards in deck order.
//      Name order would read ace editor,
//      defaults, format, recaptcha, tinymce editor; deck order reads
//      *title, *credit (format), *Ace (ace editor), *TinyMCE (tinymce
//      editor), *home, *main menu, *getting started links (defaults) --
//      ascending mod-card id.
//      The engine sorted modCards by name; these pins hold the deck order.
//
//   2. CODENAME.  Ruby's `modname` is the CARD's codename with the prefix
//      stripped -- card/mod/core/set/type/mod.rb:164-166
//          def modname
//            codename.to_s.gsub(/^mod_/, "")
//          end
//      but the engine derived it from the card NAME via `DeckoName#key` (the
//      url_key), which decays the plural gem names.  Measured over every
//      mod card in the deck: the deck
//      stores `mod_defaults`, `mod_permissions`, `mod_rules`, `mod_assets`,
//      `mod_tabs`, `mod_shades`; the key gives `mod_default`,
//      `mod_permission`, `mod_rule`, `mod_asset`, `mod_tab`, `mod_shade`.
//      ADMIN_CONFIG is keyed by GEM name, so the derived key silently
//      dropped whole mods from all_configs -- `mod: defaults` resolved to
//      "default", losing *home, *main menu and *getting started links,
//      the last three items of the Administrator
//      Configurations section.  (`modCardCoreHtml` already read
//      `card.record.codename`; this was the one path that did not.)
//
// RED-VERIFIED by reverting each half in place.
//
// WHAT IS NOT PINNED, AND WHY (the open remainder)
//   The per-ROLE assignment. No single walk order over the stored rules
//   reproduces the expected role-page split: STAR-before-TYPE (the order
//   card/lib/card/set/pattern/all.rb:41 `safe_set_keys` pins) sends
//   `*credit` (type HTML, `HTML+*type+*update` = Shark) to Administrator,
//   which the expected output agrees with, but also sends `*head` /
//   `*structure` (type Setting, for which NO `Setting+*type+*update` row
//   exists) to Administrator, which the expected output contradicts (Shark).
//   TYPE-before-STAR inverts both. The stored rule set for this class here
//   is deliberately partial (`*star+*update` plus the per-type `*update`
//   rules); the remaining over-render on the role pages is the serving
//   deck's rule state -- not reachable from this fixture, the same
//   class as the pointer one-line count pin next door.

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
