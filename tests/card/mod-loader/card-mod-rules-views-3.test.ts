// The card-mod-rules rules-views-port-3 suite: the form-blocked rule-editor
// surfaces, ported 2026-09-29 after the form-builder substrate (b49cb96)
// unblocked the card_form/success/formgroup half of their chains:
// - rule_form + rule_form_card_editor (set/rule/rule_form.rb)
// - rule_edit (set/rule/editor.rb:17-22), modal_rule + overlay_rule
//   (set/rule/board_rules_editor.rb:2-11)
// - quick_edit_setting_list (set/type/set/html_views/rule_lists.rb:6-8),
//   nest_rules + modal_nest_rules (filtered_rule_lists.rb:2-11)
// plus the RuleSetRadio machinery (set/rule/rule_form/set_selection.rb +
// rule_set_radio.rb) that increment-2 named as the rule_form blocker.
//
// ORACLE-PINNED: fixtures/captured/rules-views.json (the rules-views lane's
// committed capture, no-write proof card_actions 4945 -> 4945). Capture
// normalizations (data-slot-id -> RANDOMIZED) apply to BOTH sides; this
// lane adds the RuleSetRadio id normalization (rule_set_radio.rb:19 @id =
// "#{unique_id}-#{Time.now.to_i}" - the seconds suffix is nondeterministic,
// frozen port-side and normalized to TIME here, the select2 precedent from
// the increment-2 port).
//
// nest_rules + modal_nest_rules were captured COMPOSITION-pinned here (the
// rules-views capture did not render them - honest disclosure). The
// rules-cap follow-up port captured their bytes
// (fixtures/captured/rules-nest-views.json, no-write proof 5018 -> 5018)
// and the full byte pins now live in card-mod-rules-nest-oracle-pinned.
// test.ts; the capture's diff CORRECTED two arms of the modal_nest_rules
// composition (the mark-less filter action and the slot-wrapped list
// body), so the assertions below pin the CAPTURED shapes, not the
// originally-composed ones.
//
// RED-FIRST: this file was written before the port and run against the
// merged tree (22e7a69): every WITH-the-mod byte test failed there
// with UnsupportedViewError (the views did not dispatch), which is the
// renders-missing proof.

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
import { resetPermissionRolesForTests } from "../../../src/card/mod-loader/mods/card-mod-permissions.js";

const FIXTURE = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../../fixtures/captured/rules-views.json", import.meta.url)),
    "utf8",
  ),
) as {
  set_card: {
    meta: { id: number; name: string; type_id: number; type_name: string };
    views: Record<string, { bytes: string }>;
  };
  rule_card: {
    meta: {
      id: number;
      name: string;
      type_id: number;
      type_name: string;
      db_content: string;
    };
    views: Record<string, { bytes?: string }>;
  };
  setting_registry: { prototype_type: string };
  no_write_proof: { actions_before: number; actions_after: number; unchanged: boolean };
};

/** The capture's own normalization (data-slot-id) plus this suite's:
 *  - the RuleSetRadio id freeze (rule_set_radio.rb:19 - the seconds
 *    suffix; the port freezes the unique_id rand to "1"),
 *  - the select2 id seconds suffix (the increment-2 precedent),
 *  - data-card-type-id -> TYPEID: the type ids are DECK DATA (the capture
 *    deck assigns Pointer=56/Phrase=43; the corpus-derived
 *    RULE_TYPE_BY_SETTING map carries the corpus deck's ids - 34843 etc.).
 *    The id attribute is normalized on BOTH sides; the data-card-type-name
 *    and the TYPE-<name> set-key fragments stay pinned. */
function normalize(html: string): string {
  return html
    .replace(/data-slot-id=(["'])[0-9a-fA-F]+\1/g, 'data-slot-id="RANDOMIZED"')
    .replace(/(Xall-Xread-\d+-)\d+/g, "$1TIME")
    .replace(/(data-select2-id="Xall-Xdefault-\d+-)\d+(")/g, "$1TIME$2")
    .replace(/(data-card-type-id=")[^"]*(")/g, "$1TYPEID$2");
}

/** The capture deck's visible settings in the sorted all_settings order
 *  (setting_registry.all_settings_sorted) - the quick_edit_setting_list
 *  item walk needs the field-category settings as real setting cards. */
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
  // the two HIDDEN field-category settings (not in visible_setting_codenames
  // but in setting_categories.rb:37-39 field_settings - the
  // quick_edit_setting_list walk renders them; show_view? gates on READ
  // permission, not visibility)
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
  // the role cardtype (codename "role" - the permissions warm's peekId) and
  // the capture deck's six role cards (permission.rb:64-68 group_options:
  // Card.search type_id: RoleID, sort_by name - the perm-editor's Groups
  // checkboxes, key-sorted). The *anyone/*anonymous cards are NOT
  // Role-typed in the capture deck's group_options output (the captured
  // Groups list carries only the six unstarred roles).
  await seedCard(s, { id: 6, name: "Role", codename: "role" });
  const ROLE_CARDS = [
    "Administrator", "Anyone", "Anyone Signed In", "Eagle", "Help Desk", "Shark",
  ] as const;
  for (const [i, role] of ROLE_CARDS.entries()) {
    await seedCard(s, { id: 201 + i, name: role, typeId: 6 });
  }
  await seedCard(s, { id: 8, name: "*anyone", codename: "anyone", typeId: 3 });
  await seedCard(s, { id: 9, name: "*anyone signed in", codename: "anyone_signed_in", typeId: 3 });
  await seedCard(s, { id: 14, name: "*anonymous", codename: "anonymous", typeId: 3 });
  // the options card the perm editor's pointer rows carry (permission.rb:5-7
  // options_card -> Card[:cards_with_account]; the captured
  // data-options-card is the url_key form "Cards_with_accounts")
  await seedCard(s, { id: 15, name: "Cards with accounts", codename: "cards_with_account" });
  for (const type of TYPE_CARDS) {
    await seedCard(s, { id: type.id, name: type.name, codename: type.codename, typeId: type.typeId });
  }
  for (const setting of SETTING_CARDS) {
    await seedCard(s, { id: setting.id, name: setting.name, codename: setting.codename, typeId: 3 });
  }
  // the capture deck's *recent_settings membership
  await seedCard(s, {
    id: 130,
    name: "*recent settings",
    codename: "recent_settings",
    typeId: 61,
    dbContent: "*captcha\n*create\n*follow\n*help\n*input type\n*layout\n*read\n*script\n*structure\n*update",
  });
  // the STORED rule cards the capture pins: *all+*read (id 10 - the
  // capture deck's db_content carries the item names WITHOUT the [[...]]
  // pointer brackets; rules-views.json rule_card.meta db_content "Anyone"),
  // *all+*default (id 11, empty content, RichText), *all+*content option
  // view (id 64 - the capture deck stores the rule card under the
  // codename-form name the rule editor's radio submits)
  await seedCard(s, {
    id: 10,
    leftId: 7,
    rightId: 105,
    typeId: 4,
    dbContent: "Anyone",
  });
  await seedReference(s, 10, 8, "anyone");
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
    rightId: 123, // the *content option view setting card
    typeId: 43, // the capture deck's Phrase id (rules-views.json: the id-64 rule card is Phrase-typed)
    dbContent: "",
  });
  // the capture deck's read-rule COUNT is deck data: the overlay help
  // link's setting_link pins " (17 read rules)" (board_rules_editor.rb:
  // 21-27 - the help-popover seam's ruleCounts, whose query JOINs
  // sets.type_id = SetID - the rule LEFTS must be Set-typed). The deck
  // holds 17 *X+*read rules; this seed has *all+*read plus these sixteen
  // on other Set-typed sets.
  for (let i = 0; i < 16; i++) {
    await seedCard(s, { id: 400 + i, name: `Set${i + 1}+*right`, typeId: 5 });
    await seedCard(s, {
      id: 420 + i,
      name: `Set${i + 1}+*right+*read`,
      leftId: 400 + i,
      rightId: 105,
      typeId: 4,
      dbContent: "Anyone",
    });
  }
}, 60_000);

afterAll(() => {
  loader?.reset();
  resetPermissionRolesForTests();
  storage?.close();
});

describe("card-mod-rules form-blocked views (rules-views-port-3, oracle-pinned)", () => {
  it("WITHOUT the mod: every target view raises UnsupportedViewError", async () => {
    const s = storage!;
    for (const [cardName, view] of [
      ["*all+*read", "rule_form"],
      ["*all+*read", "rule_form_card_editor"],
      ["*all+*read", "rule_edit"],
      ["*all+*read", "modal_rule"],
      ["*all+*read", "overlay_rule"],
      ["*all", "quick_edit_setting_list"],
      ["*all", "nest_rules"],
      ["*all", "modal_nest_rules"],
    ] as const) {
      await expect(s.engine.render(cardName, view), `${view} must not dispatch without the port`).rejects.toThrow(
        UnsupportedViewError,
      );
    }
  });

  it("WITH the mod: the fixture's no-write proof holds (the oracle capture moved no rows)", () => {
    expect(FIXTURE.no_write_proof.unchanged).toBe(true);
    expect(FIXTURE.no_write_proof.actions_before).toBe(FIXTURE.no_write_proof.actions_after);
  });

  it("WITH the mod: :rule_form renders the capture bytes byte-for-byte (rule_form.rb:2-13)", async () => {
    const s = storage!;
    loader = new ModLoader([
      { manifest: cardModEdit },
      { manifest: cardModPermissions },
      { manifest: cardModRules },
    ]);
    loader.load();
    bindModLoaderToEngine(storage!, loader!);
    await loader.installInto(modEngineHost(s.engine, s.fetcher));
    // the overlay_rule help link's rule_based_help renders the [[Set]]
    // reference of the *read help text - "Set" is reachable only through a
    // plain-text reference (not the render closure), so the cache-only
    // fetchRenderCard needs the on-demand enrichment before the sync render
    await s.engine.prepareItemForRender("Set");

    const html = normalize(await s.engine.render("*all+*read", "rule_form"));
    expect(html).toBe(normalize(FIXTURE.rule_card.views.rule_form.bytes!));
  });

  it("WITH the mod: :rule_form_card_editor renders the capture bytes (rule_form.rb:22-28 - the perm-editor input chain)", async () => {
    const s = storage!;
    const html = normalize(await s.engine.render("*all+*read", "rule_form_card_editor"));
    expect(html).toBe(normalize(FIXTURE.rule_card.views.rule_form_card_editor.bytes!));
  });

  it("WITH the mod: :rule_edit renders the capture bytes (editor.rb:17-22 - the large modal wrap)", async () => {
    const s = storage!;
    const html = normalize(await s.engine.render("*all+*read", "rule_edit"));
    expect(html).toBe(normalize(FIXTURE.rule_card.views.rule_edit.bytes!));
  });

  it("WITH the mod: :modal_rule renders the capture bytes (board_rules_editor.rb:8-11 - the default-size modal, title = render_title, default footer)", async () => {
    const s = storage!;
    const html = normalize(await s.engine.render("*all+*read", "modal_rule"));
    expect(html).toBe(normalize(FIXTURE.rule_card.views.modal_rule.bytes!));
  });

  it("WITH the mod: :overlay_rule renders the capture bytes (board_rules_editor.rb:2-6 - the overlay wrap with breadcrumb)", async () => {
    const s = storage!;
    const html = normalize(await s.engine.render("*all+*read", "overlay_rule"));
    expect(html).toBe(normalize(FIXTURE.rule_card.views.overlay_rule.bytes!));
  });

  it("WITH the mod: :quick_edit_setting_list renders the capture bytes (rule_lists.rb:6-8 - the quick_edit items with the Right-module body overrides)", async () => {
    const s = storage!;
    const html = normalize(await s.engine.render("*all", "quick_edit_setting_list"));
    expect(html).toBe(normalize(FIXTURE.set_card.views.quick_edit_setting_list.bytes));
  });

  it("WITH the mod: :nest_rules composes the slot-wrapped quick_edit_setting_list (filtered_rule_lists.rb:2-5 - byte pin in card-mod-rules-nest-oracle-pinned.test.ts)", async () => {
    const s = storage!;
    const nested = normalize(await s.engine.render("*all", "nest_rules"));
    const list = normalize(await s.engine.render("*all", "quick_edit_setting_list"));
    // the body IS the quick_edit_setting_list render's LIST (Ruby: `render
    // :quick_edit_setting_list` - the inner slot's data-slot show list
    // legitimately accumulates ["nest_rules","quick_edit_setting_list"]
    // through the shared voo, so the comparison target is the <ul> body),
    // inside the nest_rules slot wrap (wrap: :slot, no class)
    const ul = list.slice(list.indexOf("<ul "));
    expect(nested).toContain(ul);
    expect(nested.startsWith(`<div id="Xall-nest_rules-view"`)).toBe(true);
    expect(nested).toContain(`class="card-slot nest_rules-view`);
  });

  it("WITH the mod: :modal_nest_rules composes the filter+list in the modal wrap (filtered_rule_lists.rb:7-11 - byte pins in card-mod-rules-nest-oracle-pinned.test.ts; this composition pin carries the CAPTURED shapes)", async () => {
    const s = storage!;
    const html = normalize(await s.engine.render("*all", "modal_nest_rules"));
    // the modal frame (modal.rb modal_dialog.haml: default size - no modal-lg)
    expect(html.startsWith(`<div class='modal fade _modal-slot' id='modal-container' role='dialog'>`)).toBe(true);
    expect(html).toContain(`<div class='modal-dialog modal-dialog-centered'>`);
    // the literal string title (cast_modal_option: a String passes through raw)
    expect(html).toContain(`Rules for nest`);
    // the default footer (modal_footer's Close button)
    expect(html).toContain(`<div class='modal-footer'>`);
    // filtered_rule_list(:quick_edit_setting_list, :field_related): the
    // filter form's FIELD radio is the checked one (setting_filter.rb:16-24
    // maps the :field_related category onto the "field" radio) and the list
    // body is the full quick_edit_setting_list VIEW render (the captured
    // rules-nest-views.json bytes - no mark opt, so path(view:) resolves
    // against the format's own card; the slot-wrapped list accumulates the
    // modal view name through the shared voo)
    expect(html).toContain(`<input type="radio" class="btn-check _setting-category" name="options" id="field" autocomplete="off" checked>`);
    expect(html).toContain(`action="/*all/quick_edit_setting_list"`);
    for (const setting of ["default", "help", "input_type", "content_option", "content_option_view"]) {
      expect(html, setting).toContain(`Xall-X${setting}-quick_edit-view`);
    }
  });

  it("WITH the mod: the out-of-set guards raise (set-module inclusion)", async () => {
    const s = storage!;
    await expect(s.engine.render("*read", "quick_edit_setting_list")).rejects.toThrow(UnsupportedViewError);
    await expect(s.engine.render("*all+*read", "quick_edit_setting_list")).rejects.toThrow(UnsupportedViewError);
    await expect(s.engine.render("*all", "rule_form")).rejects.toThrow(UnsupportedViewError);
  });

  it("WITH the mod: the load report lists the eight newly registered views", () => {
    const report = loader!.load();
    for (const view of [
      "rule_form", "rule_form_card_editor", "rule_edit", "modal_rule",
      "overlay_rule", "quick_edit_setting_list", "nest_rules", "modal_nest_rules",
    ]) {
      expect(report.registeredViews, view).toContain(view);
    }
    // the effective configs (the Ruby view declarations)
    expect(loader!.viewConfigFor("rule_form")?.cache).toBe("never");
    expect(loader!.viewConfigFor("rule_form")?.unknown).toBe(true);
    expect(loader!.viewConfigFor("rule_form_card_editor")?.cache).toBe("never");
    expect(loader!.viewConfigFor("rule_form_card_editor")?.unknown).toBe(true);
    expect(loader!.viewConfigFor("rule_edit")?.cache).toBe("never");
    expect(loader!.viewConfigFor("rule_edit")?.unknown).toBe(true);
    expect(loader!.viewConfigFor("modal_rule")?.cache).toBe("never");
    expect(loader!.viewConfigFor("modal_rule")?.unknown).toBe(true);
    expect(loader!.viewConfigFor("overlay_rule")?.cache).toBe("never");
    expect(loader!.viewConfigFor("overlay_rule")?.unknown).toBe(true);
    expect(loader!.viewConfigFor("quick_edit_setting_list")?.cache).toBe("never");
    expect(loader!.viewConfigFor("nest_rules")?.cache).toBe("never");
    expect(loader!.viewConfigFor("nest_rules")?.unknown).toBe(true);
    expect(loader!.viewConfigFor("modal_nest_rules")?.cache).toBe("never");
    expect(loader!.viewConfigFor("modal_nest_rules")?.unknown).toBe(true);
  });
});
