// The card-mod-rules rules-cap port: the two views the rules-views-port-3
// port could only pin by COMPOSITION (no captured bytes existed for them)
// are now ORACLE-PINNED against fixtures/captured/rules-nest-views.json
// (captured live from the oracle deck 2026-09-29 by
// oracle-capture-rules-nest-views.rb, no-write proof card_actions
// 5018 -> 5018):
// - nest_rules (filtered_rule_lists.rb:2-5) on the Set card "*all"
// - modal_nest_rules (filtered_rule_lists.rb:7-11) on the Set card "*all"
// The capture also re-rendered quick_edit_setting_list in the SAME run -
// the cross-capture consistency test below proves both captures saw the
// same deck state (the rules-views.json pin and this file's pin agree).
//
// Capture normalizations (data-slot-id -> RANDOMIZED, select2 seconds ->
// TIME) apply to BOTH sides; data-card-type-id -> TYPEID follows the
// views-3 port's precedent (the type ids are deck data; the type NAME and
// the TYPE-<name> set-key fragments stay pinned).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  bindModLoaderToEngine,
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import { UnsupportedViewError } from "../../../src/card/render/format.js";
import {
  ModLoader,
  modEngineHost,
} from "../../../src/card/mod-loader.js";
import { default as cardModRules } from "../../../src/card/mod-loader/mods/card-mod-rules.js";
import { default as cardModPermissions } from "../../../src/card/mod-loader/mods/card-mod-permissions.js";
import { default as cardModEdit } from "../../../src/card/mod-loader/mods/card-mod-edit.js";
import { default as cardModContent } from "../../../src/card/mod-loader/mods/card-mod-content.js";
import { resetPermissionRolesForTests } from "../../../src/card/mod-loader/mods/card-mod-permissions.js";

const FIXTURE = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../../fixtures/captured/rules-nest-views.json", import.meta.url)),
    "utf8",
  ),
) as {
  set_card: {
    meta: { id: number; name: string; type_code: string };
    views: Record<string, { bytes: string }>;
  };
  type_editable_rule_card: {
    meta: { id: number; name: string };
    views: Record<string, { bytes: string }>;
  };
  no_write_proof: { actions_before: number; actions_after: number; unchanged: boolean };
};

const PRIOR_FIXTURE = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../../fixtures/captured/rules-views.json", import.meta.url)),
    "utf8",
  ),
) as {
  set_card: { views: Record<string, { bytes: string }> };
};

/** The capture's own normalizations plus the views-3 port's
 *  data-card-type-id -> TYPEID (identical to
 *  card-mod-rules-views-3.test.ts normalize). */
function normalize(html: string): string {
  return html
    .replace(/data-slot-id=(["'])[0-9a-fA-F]+\1/g, 'data-slot-id="RANDOMIZED"')
    .replace(/(Xall-Xread-\d+-)\d+/g, "$1TIME")
    .replace(/(data-select2-id="Xall-Xdefault-\d+-)\d+(")/g, "$1TIME$2")
    .replace(/(data-card-type-id=")[^"]*(")/g, "$1TYPEID$2");
}

/** The deck shape the quick_edit_setting_list item walk renders against -
 *  the SAME seed the views-3 byte pins pass under (mirrored verbatim). */
const SETTING_CARDS: Array<{ id: number; name: string; codename: string }> = [
  { id: 101, name: "*structure", codename: "structure" },
  { id: 102, name: "*default", codename: "default" },
  { id: 103, name: "*autoname", codename: "autoname" },
  { id: 104, name: "*create", codename: "create" },
  { id: 105, name: "*read", codename: "read" },
  { id: 106, name: "*update", codename: "update" },
  { id: 107, name: "*delete", codename: "delete" },
  { id: 108, name: "*captcha", codename: "captcha" },
  { id: 109, name: "*head", codename: "head" },
  { id: 110, name: "*layout", codename: "layout" },
  { id: 111, name: "*style", codename: "style" },
  { id: 112, name: "*script", codename: "script" },
  { id: 113, name: "*help", codename: "help" },
  { id: 114, name: "*input type", codename: "input_type" },
  { id: 115, name: "*guide", codename: "guide" },
  { id: 116, name: "*on create", codename: "on_create" },
  { id: 117, name: "*on update", codename: "on_update" },
  { id: 118, name: "*on delete", codename: "on_delete" },
  { id: 119, name: "*thanks", codename: "thanks" },
  { id: 120, name: "*follow fields", codename: "follow_fields" },
  { id: 121, name: "*follow", codename: "follow" },
  { id: 122, name: "*content options", codename: "content_options" },
  { id: 123, name: "*content option view", codename: "content_option_view" },
];

const TYPE_CARDS: Array<{ id: number; name: string; codename?: string; typeId?: number }> = [
  { id: 2, name: "RichText" },
  { id: 3, name: "Setting", codename: "setting" },
  { id: 4, name: "List" },
  { id: 5, name: "Set", codename: "set" },
  { id: 43, name: "Phrase" },
  { id: 51, name: "Toggle" },
  { id: 56, name: "Pointer" },
  { id: 60, name: "HTML" },
];

let storage: RenderTestStorage | undefined;
let loader: ModLoader | undefined;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;

  await seedCard(s, { id: 7, name: "*all", codename: "all", typeId: 5 });
  await seedCard(s, { id: 6, name: "Role", codename: "role" });
  await seedCard(s, { id: 8, name: "*anyone", codename: "anyone", typeId: 3 });
  // The role cards come AFTER the *anyone party card: the stock substrate's
  // read substrate puts the stock Anyone (id BOOTSTRAP...anyone) in the
  // catch-all rule's card_references row, and the shared seed seam
  // repoints that referee onto the first card that takes the stock Anyone
  // over (render-test-storage.ts releaseStockCard matches on the card's
  // NAME key too, so a role card named "Anyone" displaces it as well). The
  // role card "Anyone" must not be that one — it is a different card from
  // the `*anyone` party (the codename card the anonymous viewer resolves
  // through) and the rule's grant has to land on the party. Seeded after,
  // the stock Anyone is already displaced and repointed to id 8, so the role
  // card is just another card of the deck, as it is in Ruby (where the
  // Anyone ROLE card is a distinct card from the *anyone party pointer).
  const ROLE_CARDS = [
    "Administrator", "Anyone", "Anyone Signed In", "Eagle", "Help Desk", "Shark",
  ] as const;
  for (const [i, role] of ROLE_CARDS.entries()) {
    await seedCard(s, { id: 201 + i, name: role, typeId: 6 });
  }
  await seedCard(s, { id: 9, name: "*anyone signed in", codename: "anyone_signed_in", typeId: 3 });
  await seedCard(s, { id: 14, name: "*anonymous", codename: "anonymous", typeId: 3 });
  await seedCard(s, { id: 15, name: "Cards with accounts", codename: "cards_with_account" });
  for (const type of TYPE_CARDS) {
    await seedCard(s, { id: type.id, name: type.name, codename: type.codename, typeId: type.typeId });
  }
  for (const setting of SETTING_CARDS) {
    await seedCard(s, { id: setting.id, name: setting.name, codename: setting.codename, typeId: 3 });
  }
  await seedCard(s, {
    id: 130,
    name: "*recent settings",
    codename: "recent_settings",
    typeId: 61,
    dbContent: "*captcha\n*create\n*follow\n*help\n*input type\n*layout\n*read\n*script\n*structure\n*update",
  });
  await seedCard(s, {
    id: 11,
    leftId: 7,
    rightId: 102,
    typeId: 2,
    dbContent: "",
  });
  await seedCard(s, {
    id: 64,
    name: "*all+*content_option_view",
    leftId: 7,
    rightId: 123,
    typeId: 43,
    dbContent: "",
  });
}, 60_000);

afterAll(() => {
  loader?.reset();
  resetPermissionRolesForTests();
  storage?.close();
});

describe("card-mod-rules nest views (rules-cap lane, oracle-pinned)", () => {
  it("WITHOUT the mod: both nest views raise UnsupportedViewError", async () => {
    const s = storage!;
    await expect(s.engine.render("*all", "nest_rules")).rejects.toThrow(UnsupportedViewError);
    await expect(s.engine.render("*all", "modal_nest_rules")).rejects.toThrow(UnsupportedViewError);
  });

  it("WITH the mod: the fixture's no-write proof holds (the oracle capture moved no rows)", () => {
    expect(FIXTURE.no_write_proof.unchanged).toBe(true);
    expect(FIXTURE.no_write_proof.actions_before).toBe(FIXTURE.no_write_proof.actions_after);
    expect(FIXTURE.set_card.meta.type_code).toBe("set");
  });

  it("WITH the mod: the same-run quick_edit_setting_list bytes match the prior capture (cross-capture deck-state consistency)", async () => {
    const s = storage!;
    loader = new ModLoader([
      { manifest: cardModEdit },
      { manifest: cardModContent },
      { manifest: cardModPermissions },
      { manifest: cardModRules },
    ]);
    loader.load();
    bindModLoaderToEngine(storage!, loader!);
    await loader.installInto(modEngineHost(s.engine, s.fetcher));

    const html = normalize(await s.engine.render("*all", "quick_edit_setting_list"));
    expect(html).toBe(normalize(FIXTURE.set_card.views.quick_edit_setting_list.bytes));
    expect(normalize(FIXTURE.set_card.views.quick_edit_setting_list.bytes)).toBe(
      normalize(PRIOR_FIXTURE.set_card.views.quick_edit_setting_list.bytes),
    );
  });

  it("WITH the mod: :nest_rules renders the capture bytes byte-for-byte (filtered_rule_lists.rb:2-5 - the slot-wrapped quick_edit_setting_list render)", async () => {
    const s = storage!;
    const html = normalize(await s.engine.render("*all", "nest_rules"));
    expect(html).toBe(normalize(FIXTURE.set_card.views.nest_rules.bytes));
  });

  it("WITH the mod: :modal_nest_rules renders the capture bytes byte-for-byte (filtered_rule_lists.rb:7-11 - the filter+list pair in the modal wrap)", async () => {
    const s = storage!;
    const html = normalize(await s.engine.render("*all", "modal_nest_rules"));
    expect(html).toBe(normalize(FIXTURE.set_card.views.modal_nest_rules.bytes));
  });

  it("WITH the mod: :rule_form_card_editor on *all+*default renders the capture bytes (the rulesTypeFormgroup TYPE-EDITABLE branch - editor.rb:93-105, *default's setting_opts rule_type_editable: true)", async () => {
    const s = storage!;
    const html = normalize(await s.engine.render("*all+*default", "rule_form_card_editor"));
    expect(html).toBe(normalize(FIXTURE.type_editable_rule_card.views.rule_form_card_editor.bytes));
  });
});
