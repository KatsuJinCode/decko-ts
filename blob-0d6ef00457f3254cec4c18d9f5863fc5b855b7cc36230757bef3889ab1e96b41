// The card-mod-rules setting-list family + pill links + board tab +
// template link, ported 2026-09-29 (the rules-views port): bar_setting_list,
// pill_setting_list, modal_pill_setting_list, accordion_rule_list,
// accordion_bar_list, overlay_rule_list_link (set/type/set/html_views/
// rule_lists.rb), board_rules_tab + filtered_accordion_rule_list
// (filtered_rule_lists.rb), rule_nest_editor_link + rule_board_link
// (set/rule/editor.rb), template_link (template.rb).
//
// ORACLE-PINNED: fixtures/captured/rules-views.json, captured inside the
// live decko-0.20.0 oracle app (tools/oracle/decko-oracle-app) by
// oracle-capture-rules-views.rb with the in-run no-write proof
// card_actions 4945 -> 4945. Capture normalizations (data-slot-id ->
// RANDOMIZED, select2 seconds -> TIME) apply to BOTH sides. The full-byte
// toBe pins cover every view whose bytes are composed entirely HERE (the
// pill/link views, the filter forms, the accordion frames, template_link);
// bar_setting_list and accordion_bar_list NEST the render layer's :bar
// views, so those two pin the COMPOSITION (slot-id order, wrapper
// absence, join shape) rather than re-pinning the render layer's bar bytes.
//
// Seed provenance: *all (id 7, Set-typed) is the capture deck's own card
// (rules-views.json set_card.meta); the 21 setting cards carry the
// capture's visible codenames (setting_registry.*) with the deck's
// space display forms; *recent_settings carries exactly the capture's
// recent-category membership (captcha, follow, help, input_type, layout,
// read, script, structure, update - visible in the data-category lists
// the pill bytes pin). The rule cards the pills nest are VIRTUAL
// (rule_lists.rb:99 card.fetch setting, new: {} on a deck with no stored
// *all+X rules) - buildVirtualRuleCard's construction; the one STORED
// rule card probe (*all+*read, id 10, List, "Anyone") mirrors the
// capture's rule_card.meta for the direct rule-set view pins.
//
// RED-FIRST: this file was written before the port and run against the
// pristine d6b1957 tree (the base worktree): every WITH-the-mod
// byte test failed there with UnsupportedViewError (the views did not
// dispatch), which is the renders-missing proof.

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
import { UnsupportedViewError, type RenderFormat, type Voo, type ViewContext, type ViewFn } from "../../../src/card/render/format.js";
import {
  ModLoader,
  modEngineHost,
} from "../../../src/card/mod-loader.js";
import { default as cardModRules } from "../../../src/card/mod-loader/mods/card-mod-rules.js";

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
    meta: { id: number; name: string; type_id: number; type_name: string; db_content: string };
    views: Record<string, { bytes?: string }>;
  };
  no_write_proof: { actions_before: number; actions_after: number; unchanged: boolean };
};

/** The capture's own normalization, applied to this side's renders (the
 *  fixture already carries the placeholders). */
function normalize(html: string): string {
  return html
    .replace(/data-slot-id=(["'])[0-9a-fA-F]+\1/g, 'data-slot-id="RANDOMIZED"');
}

/** The capture deck's visible settings in the sorted all_settings order
 *  (setting_registry.all_settings_sorted). */
const ALL_SETTINGS_SORTED = [
  "autoname", "captcha", "create", "default", "delete", "follow",
  "follow_fields", "guide", "head", "help", "input_type", "layout",
  "on_create", "on_delete", "on_update", "read", "script", "structure",
  "style", "thanks", "update",
] as const;

/** The setting cards the capture deck's groups walk reads, with the deck's
 *  space display forms (the cards.codename column carries the bare
 *  codename). */
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
];

/** The type cards the virtual rule cards' types resolve against
 *  (virtual-rule-card.ts RULE_TYPE_BY_SETTING). */
const TYPE_CARDS: Array<{ id: number; name: string; codename?: string; typeId?: number }> = [
  { id: 2, name: "RichText" },
  { id: 3, name: "Setting", codename: "setting" },
  { id: 4, name: "List" },
  { id: 5, name: "Set", codename: "set" },
  { id: 51, name: "Toggle" },
  { id: 52, name: "Phrase" },
  { id: 58, name: "Nest list" },
  { id: 60, name: "HTML" },
  { id: 61, name: "Pointer" },
];

let storage: RenderTestStorage | undefined;
let loader: ModLoader | undefined;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;

  await seedCard(s, { id: 7, name: "*all", codename: "all", typeId: 5 });
  // the role cards the read-permission parties join on (read-rules.ts:51-56
  // ANYONE_CODENAME / ANYONE_SIGNED_IN_CODENAME / ANONYMOUS_CODENAME) - the
  // seeded *all+*read grant resolves through the reference graph
  // (seedReference; the bar-box oracle-pinned test's pattern)
  await seedCard(s, { id: 6, name: "Role" });
  await seedCard(s, { id: 8, name: "*anyone", codename: "anyone", typeId: 6 });
  await seedCard(s, { id: 9, name: "*anyone signed in", codename: "anyone_signed_in", typeId: 6 });
  await seedCard(s, { id: 14, name: "*anonymous", codename: "anonymous", typeId: 6 });
  for (const type of TYPE_CARDS) {
    await seedCard(s, { id: type.id, name: type.name, codename: type.codename, typeId: type.typeId });
  }
  for (const setting of SETTING_CARDS) {
    await seedCard(s, { id: setting.id, name: setting.name, codename: setting.codename, typeId: 3 });
  }
  // the capture deck's *recent_settings membership (the data-category
  // lists the pill bytes pin: captcha, create, follow, help, input_type,
  // layout, read, script, structure, update - and nothing else)
  await seedCard(s, {
    id: 130,
    name: "*recent settings",
    codename: "recent_settings",
    typeId: 61,
    dbContent: "*captcha\n*create\n*follow\n*help\n*input type\n*layout\n*read\n*script\n*structure\n*update",
  });
  // the one STORED rule card probe (rules-views.json rule_card.meta:
  // id 10, "*all+*read", List-typed, the deck's "Anyone" grant) - the
  // grant party rides the reference graph (bar-box test's pattern)
  await seedCard(s, {
    id: 10,
    leftId: 7,
    rightId: 105,
    typeId: 4,
    dbContent: "[[Anyone]]",
  });
  await seedReference(s, 10, 8, "anyone");
}, 60_000);

afterAll(() => {
  loader?.reset();
  storage?.close();
});

describe("card-mod-rules setting-list family (A/B, oracle-pinned)", () => {
  it("WITHOUT the mod: every ported view raises UnsupportedViewError", async () => {
    const s = storage!;
    for (const [cardName, view] of [
      // p20-email-views: bar_setting_list NO LONGER raises loader-less —
      // the body lives on the flat record (views.ts barSettingListBody,
      // Set-typed guard) because the graded page-lane harness binds no
      // loader and the Shark page nests this view on *all; the raise side
      // of the old pin is carried by the flat entry's own guard (non-Set
      // cards still raise — the arm below). Same move the roleviews suite
      // made for the raise-leadview :lead/:configs flats (its commit
      // c52669f updated the identical A/B shapes).
      ["*all", "pill_setting_list"],
      ["*all", "modal_pill_setting_list"],
      ["*all", "accordion_rule_list"],
      ["*all", "accordion_bar_list"],
      ["*all", "overlay_rule_list_link"],
      ["*all", "board_rules_tab"],
      ["*all", "filtered_accordion_rule_list"],
      // 2026-10-06 a1-mods-validation lane: template_link removed from the
      // raise list. It is flat-registered at src/card/render/views.ts:6322
      // (with its own Set-guard at views.ts:1671-1673 raising
      // UnsupportedViewError for non-Set cards — the render.rb#view_method
      // semantics) because the loader-less page sweep needs it for every
      // :template-mode nest; the mod manifest registers the SAME body for
      // the chain-aware deck (card-mod-rules.ts:2871). Same accepted
      // architecture move as bar_setting_list below (p20-email-views) and
      // the roleviews :lead/:configs flats — a *all render here is the
      // seam working, not a leak. Guard arm pinned in the seam test below.
      ["*all+*read", "rule_board_link"],
      ["*all+*read", "rule_nest_editor_link"],
    ] as const) {
      await expect(s.engine.render(cardName, view), `${view} must not dispatch without the mod`).rejects.toThrow(
        UnsupportedViewError,
      );
    }
  });

  it("WITHOUT the mod: the flat bar_setting_list renders on a Set card (the loader-less seam) and still raises on a non-Set card (the guard)", async () => {
    const s = storage!;
    // The seam arm: *all (Set-typed) renders the rule bars through the SAME
    // body function the WITH-mod registration delegates to (views.ts
    // barSettingListBody) — the with-mod pin below covers the byte shape.
    const html = await s.engine.render("*all", "bar_setting_list");
    expect(html).toContain(`data-card-name="*all+*autoname"`);
    expect(html).toContain(`bar-view`);
    // The guard arm: a non-Set card's chain never reaches Set::Type::Set in
    // Ruby (pattern/all.rb:49-55) — the flat entry reproduces the dispatch
    // raise.
    await expect(s.engine.render("*all+*read", "bar_setting_list")).rejects.toThrow(
      UnsupportedViewError,
    );
    // 2026-10-06 a1-mods-validation lane: same two arms for the flat
    // template_link entry (views.ts:6322) — renders on the Set card
    // *all through the same body the mod manifest registers
    // (card-mod-rules.ts:2871), and the in-view Set-guard still raises
    // for a non-Set card, matching render.rb#view_method.
    const templateLinkHtml = await s.engine.render("*all", "template_link");
    expect(templateLinkHtml).toContain(`card-slot template_link-view`);
    expect(templateLinkHtml).toContain(`modal_nest_rules`);
    await expect(s.engine.render("*all+*read", "template_link")).rejects.toThrow(
      UnsupportedViewError,
    );
  });

  it("WITH the mod loaded: the fixture's no-write proof holds (the oracle capture moved no rows)", () => {
    // the capture's own discipline, pinned so the fixture cannot silently
    // lose it
    expect(FIXTURE.no_write_proof.unchanged).toBe(true);
    expect(FIXTURE.no_write_proof.actions_before).toBe(FIXTURE.no_write_proof.actions_after);
  });

  it("WITH the mod: :pill_setting_list renders the capture bytes byte-for-byte (rule_lists.rb:86-88 second definition)", async () => {
    const s = storage!;
    loader = new ModLoader([{ manifest: cardModRules }]);
    loader.load();
    bindModLoaderToEngine(storage!, loader!);
    await loader.installInto(modEngineHost(s.engine, s.fetcher));

    const html = normalize(await s.engine.render("*all", "pill_setting_list"));
    expect(html).toBe(normalize(FIXTURE.set_card.views.pill_setting_list.bytes));
  });

  it("WITH the mod: :modal_pill_setting_list renders the capture bytes (rule_lists.rb:22-24 - the modal item view, NO slot wrap)", async () => {
    const s = storage!;
    const html = normalize(await s.engine.render("*all", "modal_pill_setting_list"));
    expect(html).toBe(normalize(FIXTURE.set_card.views.modal_pill_setting_list.bytes));
  });

  it("WITH the mod: :accordion_rule_list renders the capture bytes (rule_lists.rb:26-31 - board_pills per group, NO slot wrap)", async () => {
    const s = storage!;
    const html = normalize(await s.engine.render("*all", "accordion_rule_list"));
    expect(html).toBe(normalize(FIXTURE.set_card.views.accordion_rule_list.bytes));
  });

  it("WITH the mod: :board_rules_tab renders the capture bytes (filtered_rule_lists.rb:13-18 - filter form + the class_up'd accordion)", async () => {
    const s = storage!;
    const html = normalize(await s.engine.render("*all", "board_rules_tab"));
    expect(html).toBe(normalize(FIXTURE.set_card.views.board_rules_tab.bytes));
  });

  it("WITH the mod: :filtered_accordion_rule_list renders the capture bytes (filtered_rule_lists.rb:20-22 - the set's own mark in the form action)", async () => {
    const s = storage!;
    const html = normalize(await s.engine.render("*all", "filtered_accordion_rule_list"));
    expect(html).toBe(normalize(FIXTURE.set_card.views.filtered_accordion_rule_list.bytes));
  });

  it("WITH the mod: :overlay_rule_list_link renders the capture bytes (rule_lists.rb:65-72)", async () => {
    const s = storage!;
    const html = await s.engine.render("*all", "overlay_rule_list_link");
    expect(html).toBe(FIXTURE.set_card.views.overlay_rule_list_link.bytes);
  });

  it("WITH the mod: :template_link renders the capture bytes (template.rb:2-7 - the {{...}} literal, view-name link text)", async () => {
    const s = storage!;
    const html = normalize(await s.engine.render("*all", "template_link"));
    expect(html).toBe(normalize(FIXTURE.set_card.views.template_link.bytes));
  });

  it("WITH the mod: :rule_board_link on a stored rule card renders the capture bytes (editor.rb:34-36)", async () => {
    const s = storage!;
    const html = await s.engine.render("*all+*read", "rule_board_link");
    expect(html).toBe(FIXTURE.rule_card.views.rule_board_link.bytes);
  });

  it("WITH the mod: :rule_nest_editor_link on a stored rule card renders the capture bytes (editor.rb:30-32)", async () => {
    const s = storage!;
    const html = await s.engine.render("*all+*read", "rule_nest_editor_link");
    expect(html).toBe(FIXTURE.rule_card.views.rule_nest_editor_link.bytes);
  });

  it("WITH the mod: :bar_setting_list composes the sorted visible settings' rule bars, unwrapped (rule_lists.rb:11-14)", async () => {
    const s = storage!;
    const html = normalize(await s.engine.render("*all", "bar_setting_list"));
    // NO slot wrapper and NO _setting-list class anywhere (the shared-hash
    // wrap consumption - the capture pins the bare join)
    expect(html.startsWith("<div id=\"Xall-bar_setting_list-view\"")).toBe(false);
    expect(html).not.toContain("_setting-list");
    // the nested bar slots appear in the sorted all_settings order, one per
    // visible setting (the safe_key forms: "*follow fields" keys to
    // "*follow_field" and "*thanks" to "*thank" - Cardname's singularizing
    // key; the capture's own slot ids carry both)
    const ids = [...html.matchAll(/<div id="(Xall-X[a-z_]+-bar-view)"/g)].map((m) => m[1]);
    const expected = ALL_SETTINGS_SORTED.map(
      (setting) =>
        setting === "follow_fields"
          ? "Xall-Xfollow_field-bar-view"
          : setting === "thanks"
            ? "Xall-Xthank-bar-view"
            : `Xall-X${setting}-bar-view`,
    );
    expect(ids).toEqual(expected);
    // the items are newline-joined nests (the html_safe join)
    const firstSlot = html.indexOf("<div id=\"Xall-Xautoname-bar-view\"");
    expect(firstSlot).toBe(0);
    // every bar nest carries the full_name hide (bar_setting_list's
    // hide: :full_name - the capture's bar slot hide lists lead with it)
    expect(html).toContain("&quot;hide&quot;:[&quot;full_name&quot;");
  });

  it("WITH the mod: :accordion_bar_list composes the six groups' accordions with :bar items (rule_lists.rb:33-38)", async () => {
    const s = storage!;
    const html = normalize(await s.engine.render("*all", "accordion_bar_list"));
    // the group accordion frame with every group, in declaration order
    const groups = [...html.matchAll(/data-bs-target='#card-Xall-([a-z_]+)-collapse-id'/g)].map((m) => m[1]);
    expect(groups).toEqual(["templating", "permission", "webpage", "editing", "event", "other"]);
    // NO slot wrapper (no opts at all on the view definition)
    expect(html.startsWith("<div class=\"_setting-list\">")).toBe(true);
    // the items are list_tag li's, not pills
    expect(html).toContain('<ul class="nav flex-column"><li class="nav-item">');
    // the bar nests do NOT carry full_name (the accordion's setting_list_
    // item passes no options)
    expect(html).not.toContain("&quot;full_name&quot;");
  });

  it("WITH the mod: the out-of-set guards raise (set-module inclusion)", async () => {
    const s = storage!;
    await expect(s.engine.render("*read", "pill_setting_list")).rejects.toThrow(UnsupportedViewError);
    await expect(s.engine.render("*read", "board_rules_tab")).rejects.toThrow(UnsupportedViewError);
    await expect(s.engine.render("*all", "rule_board_link")).rejects.toThrow(UnsupportedViewError);
    await expect(s.engine.render("*all+*read", "bar_setting_list")).rejects.toThrow(UnsupportedViewError);
  });

  it("WITH the mod: the load report lists the eleven registered views", () => {
    const report = loader!.load();
    for (const view of [
      "bar_setting_list", "pill_setting_list", "modal_pill_setting_list",
      "accordion_rule_list", "accordion_bar_list", "overlay_rule_list_link",
      "board_rules_tab", "filtered_accordion_rule_list",
      "rule_nest_editor_link", "rule_board_link", "template_link",
    ]) {
      expect(report.registeredViews, view).toContain(view);
    }
    // the effective configs (the shared-hash consumption pins the absences)
    expect(loader!.viewConfigFor("pill_setting_list")?.cache).toBe("never");
    expect(loader!.viewConfigFor("board_rules_tab")?.cache).toBe("never");
    expect(loader!.viewConfigFor("overlay_rule_list_link")?.cache).toBe("never");
    expect(loader!.viewConfigFor("template_link")?.cache).toBe("never");
    expect(loader!.viewConfigFor("rule_board_link")?.unknown).toBe(true);
    expect(loader!.viewConfigFor("rule_nest_editor_link")?.unknown).toBe(true);
    expect(loader!.viewConfigFor("bar_setting_list")?.cache).toBeUndefined();
    expect(loader!.viewConfigFor("accordion_rule_list")?.cache).toBeUndefined();
    expect(loader!.viewConfigFor("modal_pill_setting_list")?.cache).toBeUndefined();
    expect(loader!.viewConfigFor("accordion_bar_list")?.cache).toBeUndefined();
    expect(loader!.viewConfigFor("filtered_accordion_rule_list")?.cache).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// stub-harness unit for the filtered bar_setting_list variant (voo.filter -
// engine.render carries no voo opts, the filter read is composition-tested
// here the way the exported-view bodies are)
// ---------------------------------------------------------------------------

function resolveViewFn(view: string): ViewFn | undefined {
  for (const module of cardModRules.setModules ?? []) {
    for (const block of Object.values(module.formats ?? {})) {
      for (const viewDef of block.views ?? []) {
        if (viewDef.view === view) return viewDef.viewFn;
      }
    }
  }
  return undefined;
}

describe("card-mod-rules bar_setting_list filter read (stub harness)", () => {
  it("voo.filter :common selects the COMMON_SETTINGS ∩ visible list in visible order (rule_lists.rb:12)", () => {
    const viewFn = resolveViewFn("bar_setting_list");
    expect(viewFn).toBeDefined();
    const calls: string[] = [];
    const stubCtx = {
      fmt: {
        card: { name: { s: "*all", key: "*all", safeKey: "Xall" }, typeCode: "set" },
        engine: {
          findSettingCard: (codename: string) => ({ codename, name: { s: `*${codename}` } }),
          fetchRenderCard: () => undefined,
          isDenied: () => false,
        },
        nestRecord: (_target: unknown, view: string, opts: Record<string, unknown>) => {
          calls.push(`${opts["nest_name"]}:${view}`);
          return `[${String(opts["nest_name"])}]`;
        },
        urlKey: () => "*all",
      } as unknown as RenderFormat,
      voo: { opts: { filter: "common" }, classUp: () => {}, classy: (c: string | string[]) => Array.isArray(c) ? c.join(" ") : c },
    } as unknown as ViewContext;
    const out = viewFn!(stubCtx);
    // visible ∩ COMMON in the visible (groups) order: structure, default,
    // create, read, update, delete, guide (the capture's common_settings)
    expect(calls).toEqual([
      "*all+*structure:bar",
      "*all+*default:bar",
      "*all+*create:bar",
      "*all+*read:bar",
      "*all+*update:bar",
      "*all+*delete:bar",
      "*all+*guide:bar",
    ]);
    // the view body is the newline-join of the nests it requested
    expect(out).toBe(calls.map((c) => `[${c.split(":")[0]}]`).join("\n"));
  });
});
