// The :modal_nest_rules view at the address the enumeration audit's gap
// names (docs/runs/enumeration-audit-2026-10-25.md, A1 row
// `:modal_nest_rules`; docs/runs/enumeration-audit-2026-10-25.gaps.json, the
// element "the :modal_nest_rules view"):
//
//   /*all/modal_nest_rules   (fixtures/captured/rules-views.json: the
//                            set_card's template_link view carries the
//                            link whose href IS this address)
//
// The capture bytes are the spec, in two layers:
//
//   - The ANCHOR: the capture's own set_card template_link bytes carry the
//     link, and that line is pinned byte-for-byte below, read out of the
//     capture at run time.
//   - The RESPONSE: the view's own bytes at that address are pinned
//     byte-for-byte against the later nest-views capture
//     (fixtures/captured/rules-nest-views.json, set_card.views
//     .modal_nest_rules), which recorded the same deck's modal response.
//
// What the port already carried: the :modal_nest_rules view fn
// (src/card/mod-loader/mods/card-mod-rules.ts, filtered_rule_lists.rb:7-11)
// and its response bytes pinned at "*all" by
// tests/card/mod-loader/card-mod-rules-nest-oracle-pinned.test.ts. What NO
// row named, and what this file adds, is the ADDRESS: nothing proved the
// link that names it - the set card's own template_link - carries it, so
// the surface the anchor points at was never tied to the anchor.

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
import { default as cardModContent } from "../../../src/card/mod-loader/mods/card-mod-content.js";
import { resetPermissionRolesForTests } from "../../../src/card/mod-loader/mods/card-mod-permissions.js";

/** The capture the audit cites for the anchor: the set card's views. */
const RULES_CAPTURE = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../../fixtures/captured/rules-views.json", import.meta.url)),
    "utf8",
  ),
) as {
  set_card: {
    meta: Record<string, unknown>;
    views: Record<string, { bytes?: string }>;
  };
};

/** The nest-views capture: the same deck's modal response bytes. */
const NEST_CAPTURE = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../../fixtures/captured/rules-nest-views.json", import.meta.url)),
    "utf8",
  ),
) as {
  set_card: { meta: Record<string, unknown>; views: Record<string, { bytes: string }> };
  no_write_proof: { actions_before: number; actions_after: number; unchanged: boolean };
};

/** The anchor the audit's evidence names, byte-for-byte out of the
 *  capture's own template_link bytes: the link whose href is the audit's
 *  address. */
function capturedModalNestRulesAnchor(): string {
  const bytes = RULES_CAPTURE.set_card.views.template_link.bytes ?? "";
  const at = bytes.indexOf("modal_nest_rules");
  if (at === -1) throw new Error("the capture's template_link bytes carry no modal_nest_rules link");
  const start = bytes.lastIndexOf("<a ", at);
  const close = bytes.indexOf("</a>", at);
  if (start === -1 || close === -1) throw new Error("the capture's modal_nest_rules link is not an anchor");
  return bytes.slice(start, close + 4);
}

/** The capture's own normalizations (rules-views.json normalizations)
 *  plus the views-3 port's data-card-type-id -> TYPEID (the type ids are
 *  deck data; the type NAME and the TYPE-<name> set-key fragments stay
 *  pinned). */
function normalize(html: string): string {
  return html
    .replace(/data-slot-id=(["'])[0-9a-fA-F]+\1/g, 'data-slot-id="RANDOMIZED"')
    .replace(/(Xall-Xread-\d+-)\d+/g, "$1TIME")
    .replace(/(data-select2-id="Xall-Xdefault-\d+-)\d+(")/g, "$1TIME$2")
    .replace(/(data-card-type-id=")[^"]*(")/g, "$1TYPEID$2");
}

/** The deck shape the quick_edit_setting_list item walk renders against -
 *  the same seed the nest-oracle byte pins pass under. */
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
  // The role cards come AFTER the *anyone party card: the stock read
  // substrate puts the stock Anyone in the catch-all rule's
  // card_references row, and the shared seed seam repoints that referee
  // onto the first card that takes the stock Anyone over. Seeded after,
  // the stock Anyone is already displaced, so the role card named "Anyone"
  // is just another card of the deck.
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
    dbContent:
      "*captcha\n*create\n*follow\n*help\n*input type\n*layout\n*read\n*script\n*structure\n*update",
  });
  await seedCard(s, { id: 11, leftId: 7, rightId: 102, typeId: 2, dbContent: "" });
  await seedCard(s, {
    id: 64,
    name: "*all+*content_option_view",
    leftId: 7,
    rightId: 123,
    typeId: 43,
    dbContent: "",
  });

  s.fetcher.installNameEnvironment();
  await s.fetcher.codenames.ensureLoaded();

  loader = new ModLoader([
    { manifest: cardModEdit },
    { manifest: cardModContent },
    { manifest: cardModPermissions },
    { manifest: cardModRules },
  ]);
  loader.load();
  bindModLoaderToEngine(s, loader);
  await loader.installInto(modEngineHost(s.engine, s.fetcher));
}, 60_000);

afterAll(() => {
  loader?.reset();
  resetPermissionRolesForTests();
  storage?.close();
});

describe("the :modal_nest_rules view at the captured /*all/modal_nest_rules address", () => {
  it("the capture's template_link bytes carry the audit's link, byte-for-byte", () => {
    const anchor = capturedModalNestRulesAnchor();
    // the audit's evidence string: "the capture records the anchor
    // / *all/modal_nest_rules"
    expect(anchor).toBe(
      '<a rel="nofollow" class="slotter" href="/*all/modal_nest_rules" data-remote="true">modal_nest_rules</a>',
    );
    // the capture's own card record, so the pin is anchored to the card
    // the audit names
    expect(RULES_CAPTURE.set_card.meta.name).toBe("*all");
  });

  it("the port's template_link render at *all carries that link", async () => {
    const html = normalize(await storage!.engine.render("*all", "template_link"));
    expect(html).toContain(
      '<a rel="nofollow" class="slotter" href="/*all/modal_nest_rules" data-remote="true">modal_nest_rules</a>',
    );
  });

  it("/*all/modal_nest_rules answers the captured modal response byte-for-byte", async () => {
    const html = normalize(await storage!.engine.render("*all", "modal_nest_rules"));
    expect(html).toBe(normalize(NEST_CAPTURE.set_card.views.modal_nest_rules.bytes));
    // the capture's own no-write proof, so the comparison is about the
    // response and not about a deck that moved under the render
    expect(NEST_CAPTURE.no_write_proof.unchanged).toBe(true);
    expect(NEST_CAPTURE.no_write_proof.actions_before).toBe(NEST_CAPTURE.no_write_proof.actions_after);
    // and the modal's own title, so a comparison that passed on an empty
    // response could not pass
    expect(html).toContain("Rules for nest");
  });
});
