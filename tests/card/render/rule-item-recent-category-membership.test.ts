// rule-item-recent-category-membership.test.ts -- the p22-rules-table lane's
// red-first pin for the rule-item `_category-recent` token (the bar-view
// category chain, bar_view.rb:10 class_up -> editor.rb:54-57 category_classes
// -> setting_categories.rb:9-15 categories(setting)).
//
// MECHANISM (traced from the installed gems, all cited):
//   recent(setting) =
//     (1) the *recent settings card's items (setting_categories.rb:64-67
//         `Card[:recent_settings].item_cards.map(&:codename).compact` — DECK
//         DATA, read live, not a code constant),
//   INTERSECT
//     (2) the REGISTERED settings (set/type/set.rb:73-85
//         visible_setting_codenames = Card::Setting.groups — the setting_opts
//         registrations; gem-complete census 2026-09-30: 23 codenames,
//         *table of contents and *comment registered NOWHERE),
//   INTERSECT
//     (3) unrestricted, OR the set prototype's type carries the
//         registration's restricted_to_type (setting.rb:74-77
//         applies_to_cardtype; the only restricted registrations are
//         content_options/content_option_view -> %i[list pointer session],
//         card-mod-list set/self/content_options.rb:2 + content_option_view.rb:2).
//
// The pre-fix engine derived recent from a static 21-item const that carried
// table_of_contents and comment (and knew nothing of the restriction), so it
// emitted `_category-recent` on bars the oracle omits it from. Oracle-derived
// verification (845+ rule-item bars swept from the page-lane oracle bytes,
// 2026-09-30 — tmp-lane-p22-rulestable/probe-oracle-membership-table.mjs):
//   - `*all+*table of contents` (Number page): 0 YES / 4 NO in the oracle;
//   - `*all+*content option view` (Phrase page): NO recent (set *all's
//     prototype is not list-family);
//   - `*style+*right+*content option view`: recent PRESENT (the set's
//     *default rule card is List-typed -> list-family prototype);
//   - `*all+*head`: recent PRESENT (member + registered + unrestricted);
//   - `*all+*autoname`: NO recent (autoname is registered but NOT a recent
//     item — the R16 control, kept green).
//
// The fixture nests each rule item at view :bar from a host page — the same
// runBeforeHook("bar") class_up path the set-page boards render
// (bar_view.rb:10), so the slot class chain is the graded surface.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "./render-test-storage.js";

let storage: RenderTestStorage | undefined;

const SET_TYPE_ID = 1;
const SETTING_TYPE_ID = 2;
const LIST_TYPE_ID = 3;
const RICH_TYPE_ID = 4;
const POINTER_TYPE_ID = 5;

const RECENT_ITEMS_CONTENT =
  "*read\n*structure\n*script\n*content options\n*input type\n*default\n*layout\n*help\n*thanks\n*update\n*guide\n*head\n*follow\n*style\n*content option view\n*create\n*follow fields\n*delete\n*captcha\n*table of contents\n*comment";

async function seedDeck(): Promise<void> {
  const s = storage!;
  // Type cards (the codename column feeds the codehash; the RESTRICTED list
  // compares the prototype's type CODENAME against list/pointer/session).
  await seedCard(s, { id: 1, name: "Set", codename: "set" });
  await seedCard(s, { id: 2, name: "Setting", codename: "setting" });
  await seedCard(s, { id: 3, name: "List", codename: "list" });
  await seedCard(s, { id: 4, name: "RichText", codename: "rich_text" });
  await seedCard(s, { id: 5, name: "Pointer", codename: "pointer", typeId: 2 });
  await seedCard(s, { id: 9, name: "Basic", codename: "basic" });
  // Parties.
  await seedCard(s, { id: 6, name: "Anyone", codename: "anyone" });
  // The catch-all set card + pattern cards.
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: SET_TYPE_ID, dbContent: "{}" });
  await seedCard(s, { id: 39, name: "*self", codename: "self", typeId: SETTING_TYPE_ID });
  await seedCard(s, { id: 40, name: "*right", codename: "right", typeId: SETTING_TYPE_ID });
  // Setting cards. table_of_contents deliberately has a Setting-typed CARD
  // (the corpus's row 89 exists) but NO registration — the exact corpus shape.
  const settings: Array<[number, string, string]> = [
    [20, "*read", "read"],
    [21, "*default", "default"],
    [22, "*autoname", "autoname"],
    [28, "*head", "head"],
    [30, "*style", "style"],
    [36, "*follow fields", "follow_fields"],
    [80, "*content options", "content_options"],
    [81, "*content option view", "content_option_view"],
    [82, "*table of contents", "table_of_contents"],
  ];
  for (const [id, name, codename] of settings) {
    await seedCard(s, { id, name, codename, typeId: SETTING_TYPE_ID });
  }
  // The deck's readable grant: *all+*read -> [[Anyone]].
  await seedCard(s, { id: 50, leftId: 10, rightId: 20, typeId: LIST_TYPE_ID, dbContent: "[[Anyone]]" });
  await seedReference(s, 50, 6, "anyone");
  // The *recent settings card: the DECK DATA the recent membership reads
  // (corpus row 23808's 21-item list, verbatim; Pointer-typed in the corpus).
  await seedCard(s, {
    id: 42,
    name: "*recent settings",
    codename: "recent_settings",
    typeId: POINTER_TYPE_ID,
    dbContent: RECENT_ITEMS_CONTENT,
  });
  // The *style+*right set card, whose *default rule card is LIST-typed — the
  // template arm that makes the set's prototype list-family (the oracle's
  // `*style+*right+*content option view` bar carries _category-recent).
  await seedCard(s, { id: 60, leftId: 30, rightId: 40, typeId: SET_TYPE_ID });
  await seedCard(s, { id: 61, leftId: 60, rightId: 21, typeId: LIST_TYPE_ID, dbContent: "" });
  // A stored *all+*table of contents rule card (the corpus's id 279 shape).
  await seedCard(s, { id: 62, leftId: 10, rightId: 82, typeId: RICH_TYPE_ID, dbContent: "1" });
  // Stored rows for the remaining pinned rule items: a bare nest resolves a
  // VIRTUAL rule card through the unknown-view substitution (mini_bar — no
  // bar_view class_up), while the oracle's graded bars ride the stored
  // shapes; the class_up path (bar_view.rb:10) is the same either way.
  await seedCard(s, { id: 63, leftId: 10, rightId: 81, typeId: RICH_TYPE_ID, dbContent: "" });
  await seedCard(s, { id: 64, leftId: 60, rightId: 81, typeId: RICH_TYPE_ID, dbContent: "" });
  await seedCard(s, { id: 65, leftId: 10, rightId: 28, typeId: RICH_TYPE_ID, dbContent: "" });
  await seedCard(s, { id: 66, leftId: 10, rightId: 22, typeId: RICH_TYPE_ID, dbContent: "" });
  // The host page nesting every pinned rule item at :bar.
  await seedCard(s, {
    id: 90,
    name: "Category Pin Host",
    typeId: RICH_TYPE_ID,
    dbContent:
      "{{*all+*table of contents|bar}}\n{{*all+*content option view|bar}}\n" +
      "{{*style+*right+*content option view|bar}}\n{{*all+*head|bar}}\n{{*all+*autoname|bar}}",
  });
}

function slotClassFor(html: string, barId: string): string {
  const at = html.indexOf(`${barId}-bar-view`);
  if (at === -1) return "";
  const slotStart = html.lastIndexOf("<div", at);
  return html.slice(slotStart, slotStart + 700);
}

beforeAll(async () => {
  storage = await createRenderTestStorage();
  await seedDeck();
  // Warm the cards the prototype resolution and recent derivation read:
  // the set's *default rule card (collectRules reads renderCards), the
  // *recent settings card, and the setting cards the bars resolve.
  for (const name of [
    "*recent settings",
    "*style+*right+*default",
    "*head",
    "*default",
    "*autoname",
    "*content options",
    "*content option view",
    "*table of contents",
    "*style",
  ]) {
    try {
      await storage.engine.render(name, "open");
    } catch {
      // best-effort warm-up only (virtual rule cards render too)
    }
  }
}, 60_000);

afterAll(() => {
  storage?.close();
});

describe("rule-item _category-recent: items ∩ registered ∩ restriction", () => {
  it("OMITS recent on the *all+*table of contents bar (unregistered setting)", async () => {
    const html = await storage!.engine.render("Category Pin Host", "content");
    const slot = slotClassFor(html, "Xall-Xtable_of_content");
    expect(slot).toContain("_rule-item");
    expect(slot).toContain("_category-all");
    expect(slot, "toc is registered NOWHERE — the recent intersection drops it")
      .not.toContain("_category-recent");
  });

  it("OMITS recent on the *all+*content option view bar (restricted; *all prototype is not list-family)", async () => {
    const html = await storage!.engine.render("Category Pin Host", "content");
    const slot = slotClassFor(html, "Xall-Xcontent_option_view");
    expect(slot).toContain("_rule-item");
    // field stands (field_settings is NOT intersected with visible —
    // setting_categories.rb:59-61); recent is dropped by the restriction.
    expect(slot).toContain("_category-all _category-field");
    expect(slot, "the *all prototype is not list-family — restricted settings drop recent")
      .not.toContain("_category-recent");
  });

  it("KEEPS recent on the *style+*right+*content option view bar (List-typed *default rule card)", async () => {
    const html = await storage!.engine.render("Category Pin Host", "content");
    const slot = slotClassFor(html, "Xstyle-Xright-Xcontent_option_view");
    expect(slot).toContain("_rule-item");
    expect(slot).toContain("_category-all _category-field _category-recent");
  });

  it("KEEPS recent on the *all+*head bar (member + registered + unrestricted)", async () => {
    const html = await storage!.engine.render("Category Pin Host", "content");
    const slot = slotClassFor(html, "Xall-Xhead");
    expect(slot).toContain("_rule-item");
    expect(slot).toContain("_category-all _category-recent");
  });

  it("keeps the R16 control: no recent on the *all+*autoname bar (not a recent item)", async () => {
    const html = await storage!.engine.render("Category Pin Host", "content");
    const slot = slotClassFor(html, "Xall-Xautoname");
    expect(slot).toContain("_rule-item");
    expect(slot).toContain("_category-all");
    expect(slot).not.toContain("_category-recent");
  });
});
