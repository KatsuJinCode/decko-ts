// The :overlay_rule and :modal_rule views at the addresses the enumeration
// audit's gaps 1 and 2 name (docs/runs/enumeration-audit-2026-10-25.md):
//
//   67 captured anchors of the form
//     /*all+*<setting>/overlay_rule[?slot[items][view]=closed]   (21 settings)
//     /<card>+*self+*<setting>/overlay_rule                      (46 anchors)
//   and the 21 /*all+*<setting>/modal_rule?slot[items][view]=closed anchors
//   the modal_pill_setting_list carries - "the rule surface on every
//   setting board".
//
// The capture bytes are the spec:
//   - rules-views.json's set_card views (pill_setting_list,
//     modal_pill_setting_list, accordion_rule_list, board_rules_tab,
//     filtered_accordion_rule_list, overlay_rule_list_link) are the ANCHOR
//     spec - each is already byte-pinned in card-mod-rules-views.test.ts,
//     so the seating side of the gap is closed there.
//   - rules-views.json's rule_card.views.overlay_rule/.modal_rule are the
//     RESPONSE spec for the *all+*read card - byte-pinned in
//     card-mod-rules-views-3.test.ts.
//   - This file closes what neither pin covers: that the surface answers
//     at EVERY captured address. The 21 settings the anchors name each get
//     a stored *all+*<setting> rule card, and each address is rendered in
//     both views and held against the capture-derived invariants that do
//     not depend on the setting's own editor body (the overlay wrap with
//     its breadcrumb pair, the header title, the overlay menu's help and
//     pop-out links, the rule_form shell with the url_key mark and the
//     overlay_rule success view, and the per-surface button arms). One
//     *self-form leg proves the <card>+*self+*<setting> anchor family the
//     same way.

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
import { ModLoader, modEngineHost } from "../../../src/card/mod-loader.js";
import { default as cardModRules } from "../../../src/card/mod-loader/mods/card-mod-rules.js";
import { default as cardModPermissions } from "../../../src/card/mod-loader/mods/card-mod-permissions.js";
import { default as cardModEdit } from "../../../src/card/mod-loader/mods/card-mod-edit.js";
import { resetPermissionRolesForTests } from "../../../src/card/mod-loader/mods/card-mod-permissions.js";

/** The 21 settings the captured rule-board anchors name, in the anchors'
 *  codename form (the addresses are /*all+*<codename>/overlay_rule). */
const BOARD_SETTINGS = [
  "autoname", "captcha", "create", "default", "delete", "follow", "follow_fields",
  "guide", "head", "help", "input_type", "layout", "on_create", "on_delete",
  "on_update", "read", "script", "structure", "style", "thanks", "update",
] as const;

/** The capture normalizations (data-slot-id, the RuleSetRadio seconds
 *  suffix, data-card-type-id) applied to BOTH sides. */
function normalize(html: string): string {
  return html
    .replace(/data-slot-id=(["'])[0-9a-fA-F]+\1/g, 'data-slot-id="RANDOMIZED"')
    .replace(/(Xall-X[a-z_]+-\d+-)\d+/g, "$1TIME")
    .replace(/(data-card-type-id=")[^"]*(")/g, "$1TYPEID$2");
}

let storage: RenderTestStorage | undefined;
let loader: ModLoader | undefined;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;

  await seedCard(s, { id: 7, name: "*all", codename: "all", typeId: 5 });
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
  await seedCard(s, { id: 15, name: "Cards with accounts", codename: "cards_with_account" });
  const TYPE_CARDS: Array<{ id: number; name: string; codename?: string; typeId?: number }> = [
    { id: 2, name: "RichText" },
    { id: 3, name: "Setting", codename: "setting" },
    { id: 4, name: "List" },
    { id: 5, name: "Set", codename: "set" },
    { id: 11, name: "*self", codename: "self", typeId: 3 },
    { id: 43, name: "Phrase" },
    { id: 51, name: "Toggle" },
    { id: 56, name: "Pointer" },
    { id: 60, name: "HTML" },
  ];
  for (const type of TYPE_CARDS) {
    await seedCard(s, { id: type.id, name: type.name, codename: type.codename, typeId: type.typeId });
  }
  // one setting card per captured codename (named in codename form so the
  // junction resolution and the captured addresses agree literally)
  const SETTING_IDS = new Map<string, number>();
  for (const [i, setting] of BOARD_SETTINGS.entries()) {
    const id = 500 + i;
    SETTING_IDS.set(setting, id);
    await seedCard(s, { id, name: `*${setting}`, codename: setting, typeId: 3 });
  }
  // a stored rule card for every captured /*all+*<setting>/... address
  for (const setting of BOARD_SETTINGS) {
    const settingId = SETTING_IDS.get(setting)!;
    await seedCard(s, {
      id: 600 + settingId,
      name: `*all+*${setting}`,
      leftId: 7,
      rightId: settingId,
      typeId: 2,
      dbContent: setting === "read" ? "Anyone" : "",
    });
    if (setting === "read") {
      await seedReference(s, 600 + settingId, 8, "anyone");
    }
  }
  // the *self-form leg: a probe card, its *self set, and its own read rule
  await seedCard(s, { id: 700, name: "Board Self Probe", typeId: 2, dbContent: "probe body" });
  await seedCard(s, { id: 701, leftId: 700, rightId: 11, typeId: 5 });
  await seedCard(s, {
    id: 702,
    name: "Board Self Probe+*self+*read",
    leftId: 701,
    rightId: SETTING_IDS.get("read")!,
    typeId: 4,
    dbContent: "Administrator",
  });

  s.fetcher.installNameEnvironment();
  await s.fetcher.codenames.ensureLoaded();

  loader = new ModLoader([
    { manifest: cardModEdit },
    { manifest: cardModPermissions },
    { manifest: cardModRules },
  ]);
  loader.load();
  bindModLoaderToEngine(storage!, loader!);
  await loader.installInto(modEngineHost(s.engine, s.fetcher));
  // the overlay_rule help link's rule_based_help resolves [[Set]] through
  // the render closure (the rules-views-3 suite's prepare)
  await storage.engine.prepareItemForRender("Set");
}, 60_000);

afterAll(() => {
  loader?.reset();
  resetPermissionRolesForTests();
  storage?.close();
});

/** The HTML-id-safe key of the *all+*<setting> rule card (variants.rb
 *  #safe_key: the STABLE key singularizes - "*thanks".key is "*thank" and
 *  "*follow_fields".key is "*follow_field"; every other captured setting
 *  is already singular). */
function safeKeyOf(setting: string): string {
  const stable = setting === "thanks" ? "thank" : setting === "follow_fields" ? "follow_field" : setting;
  return `Xall-X${stable}`;
}

describe(":overlay_rule and :modal_rule at every captured rule-board address", () => {
  for (const setting of BOARD_SETTINGS) {
    it(`the *all+*${setting} board answers both views (the captured anchor family)`, async () => {
      const s = storage!;
      const urlKey = `*all+*${setting}`;
      const safe = safeKeyOf(setting);

      const overlay = normalize(await s.engine.render(urlKey, "overlay_rule"));
      // board_rules_editor.rb:2-6 - the overlay wrap with the breadcrumb pair
      expect(overlay.startsWith(`<div id="${safe}-overlay_rule-view"`)).toBe(true);
      expect(overlay).toContain(`overlay_rule-view`);
      expect(overlay).toContain(`_overlay d0-card-overlay bg-body`);
      expect(overlay).toContain(`data-breadcrumb="Rule editing"`);
      expect(overlay).toContain(`data-breadcrumb-class="rules"`);
      // the frame header: edit_rule_title + the overlay menu
      expect(overlay).toContain(`<h5 class="title fw-bold">${setting}</h5>`);
      expect(overlay).toContain(`href="/${urlKey}/overlay_guide"`);
      expect(overlay).toContain(`<a class="text-muted p-1 ms-1 known-card" href="/${urlKey}">`);
      // the current_rule_form subformat render with the success hash
      expect(overlay).toContain(`<div id="${safe}-rule_form-view"`);
      expect(overlay).toContain(`action="/card/update"`);
      expect(overlay).toContain(`name="success[mark]" id="success_mark" value="${urlKey}"`);
      expect(overlay).toContain(`name="success[view]" id="success_view" value="overlay_rule"`);
      // the overlay arm's buttons (form_type defaults :overlay)
      expect(overlay).toContain(`data-cy="save"`);
      expect(overlay).toContain(`data-cy="submit-overlay"`);
      expect(overlay).toContain(`class="_close-overlay btn-sm btn-sm btn btn-secondary" data-bs-dismiss="overlay"`);

      const modal = normalize(await s.engine.render(urlKey, "modal_rule"));
      // board_rules_editor.rb:8-11 - the DEFAULT-size modal (no modal-lg)
      expect(modal.startsWith(`<div class='modal fade _modal-slot' id='modal-container' role='dialog'>`)).toBe(true);
      expect(modal).toContain(`<div class='modal-dialog modal-dialog-centered'>`);
      // the title is the :title view - the card-title span
      expect(modal).toContain(`<span class="card-title" title="${urlKey}">*all<span>+</span>*${setting}</span>`);
      // the default footer Close button (the modal_rule wrap names no footer)
      expect(modal).toContain(`<div class='modal-footer'>`);
      expect(modal).toContain(`data-bs-dismiss="modal">Close</button>`);
      // the overlay-armed form body inside the modal
      expect(modal).toContain(`<div id="${safe}-rule_form-view"`);
      expect(modal).toContain(`data-cy="submit-overlay"`);
      expect(modal).not.toContain(`data-cy="close-modal"`);
    });
  }

  it("the per-card *self form answers: Board Self Probe+*self+*read renders :overlay_rule", async () => {
    const s = storage!;
    const urlKey = "Board Self Probe+*self+*read";
    const html = normalize(await s.engine.render(urlKey, "overlay_rule"));
    expect(html.startsWith(`<div id="board_self_probe-Xself-Xread-overlay_rule-view"`)).toBe(true);
    expect(html).toContain(`data-breadcrumb="Rule editing"`);
    expect(html).toContain(`<h5 class="title fw-bold">read</h5>`);
    expect(html).toContain(`href="/Board_Self_Probe+*self+*read/overlay_guide"`);
    expect(html).toContain(`name="success[mark]" id="success_mark" value="Board_Self_Probe+*self+*read"`);
    expect(html).toContain(`name="success[view]" id="success_view" value="overlay_rule"`);
  });

  it("the captured *all+*read response stays the byte spec (overlay_rule via the capture's own slot shape)", async () => {
    const s = storage!;
    // the *all+*read card here carries "Anyone" like the capture deck; the
    // full byte pin lives in card-mod-rules-views-3. This arm pins the two
    // capture lines every board address shares: the breadcrumb pair and
    // the overlay menu's three links.
    const capture = JSON.parse(
      readFileSync(
        fileURLToPath(new URL("../../../fixtures/captured/rules-views.json", import.meta.url)),
        "utf8",
      ),
    ) as { rule_card: { views: Record<string, { bytes?: string }> } };
    const overlayBytes = capture.rule_card.views.overlay_rule.bytes ?? "";
    for (const line of [
      `data-breadcrumb="Rule editing" data-breadcrumb-class="rules"`,
      `<h5 class="title fw-bold">read</h5>`,
    ]) {
      expect(overlayBytes).toContain(line);
      expect(normalize(await s.engine.render("*all+*read", "overlay_rule"))).toContain(line);
    }
  });
});
