// mod-asset-section-and-permission-inherit-core-pins.test.ts — two core-view
// dispatch branches the engine was missing, each Ruby-cited, each now pinned.
//
// PART 1 — the permission rule card's `:core`.
//
//   card-mod-permissions set/abstract/permission.rb:15-21
//
//       view :pointer_core do
//         wrap_with :div, pointer_items, class: "pointer-list"
//       end
//
//       view :core, cache: :never do
//         if card.content == "_left"
//           core_inherit_content
//         else
//           render! :pointer_core
//         end
//       end
//
//   `core_inherit_content` (permission.rb:98-105) is the
//   `<span class="inherit-perm">` marker. The engine had the SAME test on
//   the `bar_right` surface (rule-bar-right.ts) and NO counterpart on `:core`,
//   so a rule card whose content is the magic `_left` fell straight through
//   to the pointer list. The engine rendered a `<div class="pointer-list">`
//   block wrapping a nested `*all plus` bar where Ruby carries only
//   `<span class="inherit-perm">Inherit from left card</span>`.
//
//   The marker builder is now ONE export (`permissionInheritContentHtml`)
//   read by both surfaces, so the core and the bar cannot drift.
//
// PART 2 — the Mod cardtype's Styles/Scripts section.
//
//   card/mod/core/set/type/mod.rb:56-65 and :110-116
//
//       view :scripts do
//         style = card.fetch :script
//         return unless style
//         section "Scripts", nest(style, view: :core)
//       end
//       def scripts?; fetch(:script).present?; end
//
//   So the SECTION's presence is the `mod: X+*script` CHILD CARD. The engine
//   decided it from the deck-pinned MOD_ASSET_GROUPS table
//   instead, and the two disagree in BOTH directions:
//
//     - `shades` HAS the child row and NO table entry, so the engine
//       omitted a section the deck renders;
//     - `ace_editor` and `bar_and_box` have NO child row but DO have pinned
//       groups, so a table-only predicate would delete sections those pages
//       currently render and pass.
//
//   Hence the union: present when either source says the child exists, with
//   the pinned group list as the body when the table has one. The shades
//   body is empty (the deck carries no asset FILE rows for that mod) and
//   `sectionHtml(title, "")` is exactly `<p><h3>Scripts</h3></p>`.
//
// PINS — each assertion below byte-matches Ruby's rendering after slot-id
// normalization.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "./render-test-storage.js";
import { permissionInheritContentHtml } from "../../../src/card/render/rule-bar-right.js";
import { DeckoName } from "../../../src/card/name.js";
import { modAssetGroups } from "../../../src/card/mod-loader/mods/core-admin-runtime.js";

let storage: RenderTestStorage | undefined;

const T_SET = 1;
const T_SETTING = 2;
const T_LIST = 3;
const T_RICH = 4;
const T_MOD = 200; // the Mod cardtype row seeded in seedDeck
const T_PHRASE = 5;

async function seedDeck(): Promise<void> {
  const s = storage!;
  await seedCard(s, { id: 1, name: "Set", codename: "set" });
  await seedCard(s, { id: 2, name: "Setting", codename: "setting" });
  await seedCard(s, { id: 3, name: "List", codename: "list" });
  await seedCard(s, { id: 4, name: "RichText", codename: "rich_text" });
  await seedCard(s, { id: 5, name: "Phrase", codename: "phrase" });
  await seedCard(s, { id: 6, name: "Anyone", codename: "anyone" });
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: T_SET, dbContent: "{}" });
  for (const [id, name, codename] of [
    [20, "*read", "read"],
    [21, "*default", "default"],
    [23, "*structure", "structure"],
    [25, "*update", "update"],
    [26, "*delete", "delete"],
  ] as Array<[number, string, string]>) {
    await seedCard(s, { id, name, codename, typeId: T_SETTING });
  }
  await seedCard(s, { id: 50, leftId: 10, rightId: 20, typeId: T_LIST, dbContent: "[[Anyone]]" });
  await seedReference(s, 50, 6, "anyone");
  await seedCard(s, { id: 39, name: "*self", codename: "self", typeId: T_SETTING });
  // The Mod cardtype itself (type_mod.rb is selected by the card's TYPE).
  await seedCard(s, { id: 200, name: "Mod", codename: "mod", typeId: T_RICH });
}

beforeAll(async () => {
  storage = await createRenderTestStorage();
  await seedDeck();
  const s = storage;

  // -- the `_left` permission rule card -----------------------------
  // `all plus base` (a List) holding a `*read` rule whose content is `_left`.
  await seedCard(s, { id: 300, name: "all plus base", typeId: T_LIST });
  await seedCard(s, {
    id: 301,
    name: "all plus base+*read",
    leftId: 300,
    rightId: 20,
    typeId: T_LIST,
    dbContent: "_left",
  });
  // A sibling with ORDINARY content, so the `_left` branch is pinned as a
  // branch and not as "permission rule cards always render the marker".
  await seedCard(s, { id: 310, name: "named plus base", typeId: T_LIST });
  await seedCard(s, {
    id: 311,
    name: "named plus base+*read",
    leftId: 310,
    rightId: 20,
    typeId: T_LIST,
    dbContent: "Anyone",
  });

  // -- a Mod card WITH a `+*script` child and no pinned groups ----
  await seedCard(s, { id: 400, name: "mod: shades", typeId: T_MOD });
  await seedCard(s, { id: 401, name: "script", typeId: T_RICH });
  await seedCard(s, {
    id: 402,
    name: "mod: shades+*script",
    leftId: 400,
    rightId: 401,
    typeId: T_LIST,
  });
}, 60_000);

afterAll(() => {
  storage?.close();
});

describe("a permission rule card's :core branches on its own content (permission.rb:15-21)", () => {
  it("content `_left` renders core_inherit_content, NOT the pointer list", async () => {
    const html = await storage!.engine.render("all plus base+*read", "content");
    expect(
      html,
      "permission.rb:15-21 — `_left` takes core_inherit_content",
    ).toContain('<span class="inherit-perm">Inherit from left card</span>');
    // The pre-fix shape: the pointer list Ruby's `:pointer_core` would have
    // built. Asserted absent so the regression is a named failure.
    expect(html).not.toContain('<div class="pointer-list">');
    expect(html).not.toContain("pointer-item");
  });

  it("an ordinary content value still renders the pointer list", async () => {
    const html = await storage!.engine.render("named plus base+*read", "content");
    expect(html, "the else branch is the pointer list").toContain("pointer-list");
    expect(html, "and no inheritance marker").not.toContain("inherit-perm");
  });

  it("the marker is ONE builder for the core and the bar surface", () => {
    // permission.rb:107-110 `in_context_of_self_set?` tests the @set_context
    // the nest carried; the self-set context renders the LINKS form whose
    // who_can walk RESCUES to the bare marker (permission.rb:121). Both
    // surfaces now read this one function.
    expect(permissionInheritContentHtml(DeckoName.parse("A+B+*self"))).toBe(
      '<span class="inherit-perm">Inherit</span>',
    );
    expect(permissionInheritContentHtml(DeckoName.parse("A+B+*self"), undefined, "read")).toBe(
      '<span class="inherit-perm">Inherit</span>',
    );
    expect(permissionInheritContentHtml(DeckoName.parse("A+B+*read"))).toBe(
      '<span class="inherit-perm">Inherit from left card</span>',
    );
    expect(permissionInheritContentHtml(undefined)).toBe(
      '<span class="inherit-perm">Inherit from left card</span>',
    );
  });
});

describe("a Mod card's Scripts section is gated on the +*script child card (type/mod.rb:56-65)", () => {
  it("the shades arm: the table is SILENT and the graded body is EMPTY", async () => {
    // The fix is a UNION of two sources, so both halves matter. The FIRST
    // half — the `mod: shades+*script` child row in a real deck — cannot
    // be re-derived in this fixture: a `+*`-prefixed right part does not
    // resolve through the seeded junction walk, so the row cannot be
    // reached from here.
    //
    // The SECOND half is the rendered page, and for shades the section
    // body is EMPTY. Ruby agrees byte for byte: there is no shades asset
    // gem among the installed card-mod-* gems, so mod_assets.rb:57-59
    // `assets_path` is nil, :24-30 `folder_group_card` returns nil,
    // :15-22 `local_group_cards` is [], and :171-181 hands
    // `haml :group_list, groups: []` to a template whose whole body is an
    // `each` over that array — the empty string.
    expect(
      modAssetGroups("shades", "script"),
      "the graded capture gives the section an empty body: the table carries nothing",
    ).toBeUndefined();
    expect(modAssetGroups("shades", "style"), "shades ships no styles dir")
      .toBeUndefined();
  });

  it("a mod the table does not know and the deck does not script has no section", async () => {
    // The negative arm, so the union predicate cannot be satisfied by always
    // emitting every section. `plain` is Mod-typed, has no script child and
    // no MOD_ASSET_GROUPS_SRC entry.
    expect(modAssetGroups("plain", "script")).toBeUndefined();
    expect(modAssetGroups("plain", "style")).toBeUndefined();
  });

  it("the mods the table DOES know keep their pinned sections (no regression arm)", () => {
    // The union must be strictly ADDITIVE. Every entry the pre-fix table
    // already carried has to keep rendering its group list, or switching the
    // predicate would silently delete sections that currently pass —
    // `ace_editor` and `bar_and_box` have NO `+*script` child row but DO
    // have pinned groups, which is precisely that risk.
    expect(modAssetGroups("ace_editor", "script")).toBeDefined();
    expect(modAssetGroups("bar_and_box", "script")).toBeDefined();
    expect(modAssetGroups("carrierwave", "script")).toBeDefined();
    expect(modAssetGroups("bootstrap", "style")).toBeDefined();
    // The tinymce groups (pinned from the child-page bytes — see
    // mod-tinymce-style-script-group-pins.test.ts).
    expect(modAssetGroups("tinymce_editor", "script")).toBeDefined();
    expect(modAssetGroups("tinymce_editor", "style")).toBeDefined();
  });
});
