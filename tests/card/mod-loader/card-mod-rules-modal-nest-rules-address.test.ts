// The :modal_nest_rules view at the address the enumeration audit's gap 4
// names (docs/runs/enumeration-audit-2026-10-25.md, A1 row `:modal_nest_rules`,
// gaps.json "the :modal_nest_rules view"):
//
//   /*all/modal_nest_rules
//
// The capture bytes are the spec. Two recorded surfaces carry this address,
// in two captures, and two existing suites pin them SEPARATELY, on
// different decks:
//   - fixtures/captured/rules-views.json set_card.views.template_link
//     records the ANCHOR - the *all Set card's :template_link render, whose
//     href is exactly "/*all/modal_nest_rules" (the audit's evidence line).
//     card-mod-rules-views.test.ts pins those bytes on ITS seed.
//   - fixtures/captured/rules-nest-views.json set_card.views.modal_nest_rules
//     records the RESPONSE - the modal's filter+list bytes for the same
//     mark. card-mod-rules-nest-oracle-pinned.test.ts pins those bytes on
//     ITS seed.
// What neither pin proves is the CHAIN: that the anchor's href mark, read
// through the same read grammar the serving path uses, dispatches to the
// byte-pinned response IN ONE DECK STATE. This file pins exactly that: the
// template_link anchor extracted from the render, the address it names,
// and the modal_nest_rules response at that address, all on one seed (the
// nest-oracle suite's, mirrored verbatim so its byte pin holds here too).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  bindModLoaderToEngine,
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import {
  ModLoader,
  modEngineHost,
} from "../../../src/card/mod-loader.js";
import { default as cardModRules } from "../../../src/card/mod-loader/mods/card-mod-rules.js";
import { default as cardModPermissions } from "../../../src/card/mod-loader/mods/card-mod-permissions.js";
import { default as cardModEdit } from "../../../src/card/mod-loader/mods/card-mod-edit.js";
import { default as cardModContent } from "../../../src/card/mod-loader/mods/card-mod-content.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RULES_NEST_VIEWS = path.join(HERE, "..", "..", "..", "fixtures", "captured", "rules-nest-views.json");
const RULES_VIEWS = path.join(HERE, "..", "..", "..", "fixtures", "captured", "rules-views.json");

const FIXTURE_PRESENT = existsSync(RULES_NEST_VIEWS) && existsSync(RULES_VIEWS);

const nestFixture = FIXTURE_PRESENT
  ? (JSON.parse(readFileSync(RULES_NEST_VIEWS, "utf8")) as {
      set_card: { meta: { id: number; name: string; type_code: string }; views: Record<string, { bytes: string }> };
    })
  : undefined;

const priorFixture = FIXTURE_PRESENT
  ? (JSON.parse(readFileSync(RULES_VIEWS, "utf8")) as {
      set_card: { views: Record<string, { bytes: string }> };
    })
  : undefined;

/** The capture normalizations the two source suites apply (identical
 *  masks): data-slot-id -> RANDOMIZED, the *all+*default select2 seconds
 *  suffix -> TIME, data-card-type-id -> TYPEID. */
function normalize(html: string): string {
  return html
    .replace(/data-slot-id=(["'])[0-9a-fA-F]+\1/g, 'data-slot-id="RANDOMIZED"')
    .replace(/(Xall-Xread-\d+-)\d+/g, "$1TIME")
    .replace(/(data-select2-id="Xall-Xdefault-\d+-)\d+(")/g, "$1TIME$2")
    .replace(/(data-card-type-id=")[^"]*(")/g, "$1TYPEID$2");
}

/** The setting cards the quick_edit_setting_list item walk renders against
 *  (the nest-oracle suite's seed, mirrored verbatim). */
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

  s.fetcher.installNameEnvironment();
  await s.fetcher.codenames.ensureLoaded();

  loader = new ModLoader([
    { manifest: cardModEdit },
    { manifest: cardModContent },
    { manifest: cardModPermissions },
    { manifest: cardModRules },
  ]);
  loader.load();
  bindModLoaderToEngine(storage!, loader!);
  await loader!.installInto(modEngineHost(s.engine, s.fetcher));
}, 60_000);

afterAll(() => {
  loader?.reset();
  storage?.close();
});

describe(":modal_nest_rules at the audit's address (enumeration gap 4)", () => {
  it("the two captures carry the audit's address chain: the anchor href and the response for the same mark", () => {
    const anchorBytes = priorFixture!.set_card.views.template_link.bytes;
    expect(anchorBytes).toContain('<a rel="nofollow" class="slotter" href="/*all/modal_nest_rules" data-remote="true">modal_nest_rules</a>');
    expect(nestFixture!.set_card.meta.name).toBe("*all");
    expect(nestFixture!.set_card.views.modal_nest_rules.bytes).toContain('action="/*all/quick_edit_setting_list"');
  });

  it("the anchor renders on the same deck: *all's :template_link matches the capture bytes, and its href IS the audit's address", async () => {
    const s = storage!;
    const html = normalize(await s.engine.render("*all", "template_link"));
    expect(html).toBe(normalize(priorFixture!.set_card.views.template_link.bytes));
    // the anchor the audit cites, read back out of the RENDERED bytes
    const match = html.match(/href="(\/[^"]*\/modal_nest_rules)"/);
    expect(match).not.toBeNull();
    expect(match![1]).toBe("/*all/modal_nest_rules");
  });

  it("the address answers on the same deck: modal_nest_rules at the anchor's mark matches the capture bytes", async () => {
    const s = storage!;
    const html = normalize(await s.engine.render("*all", "modal_nest_rules"));
    expect(html).toBe(normalize(nestFixture!.set_card.views.modal_nest_rules.bytes));
  });
});
