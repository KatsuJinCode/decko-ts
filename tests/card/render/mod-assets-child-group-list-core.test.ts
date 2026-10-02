// mod-assets-child-group-list-core.test.ts -- the p20-help-content suite's
// pins for the Abstract::ModAssets CHILD cards' :core (the pages
// "mod: X+*style" / "mod: X+*script").
//
// Ruby chain: card-mod-style set/type_plus_right/mod/style.rb +
// card-mod-script set/type_plus_right/mod/script.rb both `include_set
// Abstract::ModAssets`, whose format :html view :core
// (card-mod-assets-0.20.0 set/abstract/mod_assets.rb:171-182) renders
// `haml :group_list, groups: groups` — one `<p>\n<h5>\ngroup: <name>\n</h5>`
// plus a `<ul class="list-group">` per group, and the EMPTY STRING when the
// mod ships no assets (groups = []). The engine resolved these cards as
// plain List rows and rendered the pointer-list wrapper instead; the
// dispatch now branches on the set test (left Mod-typed + right the
// *style/*script setting card) in views.ts coreView, and the groups come
// from the deck-pinned tables (core-admin-runtime.ts modChildAssetGroups).
//
// Expected bytes are the ORACLE page bytes transcribed verbatim
// (page-lane shards 000039/000043; tmp/wrong-goal-hunt/
// p20-help-content-lane.md): account.scss for mod: account+*style, the
// eight tinymce script files (the gem's assets/script folder,
// alphabetically — a folder-group mod, no manifest.yml), and the empty
// core for mod: shades+*script (the gem ships no assets/ directory).

import { describe, expect, it } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
} from "./render-test-storage.js";

const CARDTYPE_TYPE_ID = 5;
const SET_TYPE_ID = 10;
const SETTING_TYPE_ID = 11;
// the cardtype CARDS carry these ids; typeId must name the cardtype card
const MOD_TYPE_ID = 12;
const LIST_TYPE_ID = 13;

async function seedDeck(storage: Parameters<typeof seedCard>[0]): Promise<void> {
  await seedCard(storage, { id: 2, name: "Basic", typeId: CARDTYPE_TYPE_ID });
  await seedCard(storage, { id: 5, name: "Cardtype", typeId: CARDTYPE_TYPE_ID });
  await seedCard(storage, { id: 10, name: "Set", codename: "set", typeId: CARDTYPE_TYPE_ID });
  await seedCard(storage, { id: 11, name: "Setting", codename: "setting", typeId: CARDTYPE_TYPE_ID });
  await seedCard(storage, { id: 12, name: "Mod", codename: "mod", typeId: CARDTYPE_TYPE_ID });
  await seedCard(storage, { id: 13, name: "List", codename: "list", typeId: CARDTYPE_TYPE_ID });
  // the mod cards + the two setting cards the children hang off
  await seedCard(storage, { id: 210, name: "*style", codename: "style", typeId: SETTING_TYPE_ID });
  await seedCard(storage, { id: 230, name: "*script", codename: "script", typeId: SETTING_TYPE_ID });
  await seedCard(storage, { id: 220, name: "mod: account", codename: "mod_account", typeId: MOD_TYPE_ID });
  await seedCard(storage, { id: 240, name: "mod: tinymce editor", codename: "mod_tinymce_editor", typeId: MOD_TYPE_ID });
  await seedCard(storage, { id: 250, name: "mod: shades", codename: "mod_shades", typeId: MOD_TYPE_ID });
  // the children (corpus rows 45465 / 45510 / 49309: List-typed junctions)
  await seedCard(storage, { id: 221, leftId: 220, rightId: 210, typeId: LIST_TYPE_ID });
  await seedCard(storage, { id: 241, leftId: 240, rightId: 230, typeId: LIST_TYPE_ID });
  await seedCard(storage, { id: 251, leftId: 250, rightId: 230, typeId: LIST_TYPE_ID });
  // the control: a plain List card that is NOT a mod child keeps the
  // pointer-list core
  await seedCard(storage, { id: 260, name: "my list", typeId: LIST_TYPE_ID, dbContent: "[[A]]\n[[B]]" });
}

describe("p20-help-content: Abstract::ModAssets child :core renders the group_list", () => {
  it("mod: account+*style renders the parent-table group bytes (oracle 45465)", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedDeck(storage);
      const core = await storage.engine.render("mod: account+*style", "core");
      expect(core).toBe(
        "<p>\n<h5>\ngroup: local\n</h5>\n" +
        '<ul class="list-group"><li class="list-group-item">account.scss</li></ul>\n</p>\n',
      );
    } finally {
      storage.close();
    }
  });

  it("mod: tinymce editor+*script renders the folder-group supplement (oracle 45510)", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedDeck(storage);
      const core = await storage.engine.render("mod: tinymce editor+*script", "core");
      expect(core).toBe(
        "<p>\n<h5>\ngroup: local\n</h5>\n" +
        '<ul class="list-group">' +
        '<li class="list-group-item">image_editor.js.coffee</li>\n' +
        '<li class="list-group-item">link_editor.js.coffee</li>\n' +
        '<li class="list-group-item">nest_editor.js.coffee</li>\n' +
        '<li class="list-group-item">nest_editor_name.js.coffee</li>\n' +
        '<li class="list-group-item">nest_editor_options.js.coffee</li>\n' +
        '<li class="list-group-item">nest_editor_rules.js.coffee</li>\n' +
        '<li class="list-group-item">script_tinymce.js</li>\n' +
        '<li class="list-group-item">tinymce_config.js.coffee</li>' +
        "</ul>\n</p>\n",
      );
    } finally {
      storage.close();
    }
  });

  it("mod: shades+*script renders the empty core (oracle 49309: no assets directory)", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedDeck(storage);
      const core = await storage.engine.render("mod: shades+*script", "core");
      expect(core).toBe("");
    } finally {
      storage.close();
    }
  });

  it("a plain List card that is not a mod child keeps the pointer-list core", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedDeck(storage);
      const core = await storage.engine.render("my list", "core");
      expect(core).toContain("card-list card-list-bar pointer-list");
    } finally {
      storage.close();
    }
  });
});
