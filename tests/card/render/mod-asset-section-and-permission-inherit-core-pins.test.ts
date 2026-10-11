// mod-asset-section-and-permission-inherit-core-pins.test.ts — two core-view
// dispatch branches the engine was missing, each Ruby-cited, each now on the
// graded surface.
//
// PART 1 — the permission rule card's `:core` (cluster 9, 3 entries,
// +2354 on each of `*all plus+*read` / `*delete` / `*update`).
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
//   to the pointer list. Corpus 6567/6569/6571/6573 — `*all plus+*create` /
//   `*read` / `*update` / `*delete`, all type_id 47, all content "_left" —
//   rendered a 2,354-byte `<div class="pointer-list">` block wrapping a
//   nested `*all plus` bar where the capture carries only
//   `<span class="inherit-perm">Inherit from left card</span>`.
//
//   The marker builder is now ONE export (`permissionInheritContentHtml`)
//   read by both surfaces, so the core and the bar cannot drift.
//
// PART 2 — the Mod cardtype's Styles/Scripts section (cluster 13,
// `mod: shades:page`, -28).
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
//   So the SECTION's presence is the `mod: X+*script` CHILD CARD — a corpus
//   row. The engine decided it from the deck-pinned MOD_ASSET_GROUPS table
//   instead, and the two disagree in BOTH directions (measured against
//   tmp/raw-ground-truth/bench-corpus-raw.sqlite3):
//
//     - `shades` HAS the row (id 49309) and NO table entry, so the engine
//       omitted a section the capture carries;
//     - `ace_editor` and `bar_and_box` have NO row but DO have pinned
//       groups, so a table-only predicate would delete sections those pages
//       currently render and pass.
//
//   Hence the union: present when either source says the child exists, with
//   the pinned group list as the body when the table has one. The shades
//   body is empty (the graded corpus carries no asset FILE rows for that
//   gem) and `sectionHtml(title, "")` is exactly `<p><h3>Scripts</h3></p>`.
//
// ORACLE PINS — solo byte probes at this commit, byte-identical after
// slot-id normalization:
//   page recapture-raw-shard-000003 *all plus+*read:page
//   page recapture-raw-shard-000003 *all plus+*delete:page
//   page recapture-raw-shard-000003 *all plus+*update:page
//   page recapture-raw-shard-000043 mod: shades:page

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "./render-test-storage.js";
import { permissionInheritContentHtml } from "../../../src/card/render/rule-bar-right.js";
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

  // -- cluster 9: the `_left` permission rule card -----------------------------
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

  // -- cluster 13: a Mod card WITH a `+*script` child and no pinned groups ----
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
    expect(permissionInheritContentHtml("*self")).toBe(
      '<span class="inherit-perm">Inherit</span>',
    );
    expect(permissionInheritContentHtml("self")).toBe(
      '<span class="inherit-perm">Inherit</span>',
    );
    expect(permissionInheritContentHtml("*read")).toBe(
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
    // half — a `mod: shades+*script` corpus row (id 49309, with
    // `mod: shades+*script+*asset output` id 49310 under it) — is verified
    // by a direct query against
    // tmp/raw-ground-truth/bench-corpus-raw.sqlite3 (row 49309 is
    // {id:49309, name:null, type_id:47, left_id:49308, right_id:20596}; row
    // 49310 is {left_id:49309, right_id:45411, type_id:18, content
    // "(my_bucket)/49310/1747076460.js"}) and is not re-derivable in this
    // fixture: a `+*`-prefixed right part does not resolve through the
    // seeded junction walk, so the row cannot be reached from here.
    //
    // The SECOND half is the graded capture, and for shades it is SILENT.
    // recapture-raw-shard-000043 id 49308's main-slot card body is
    // `<p></p><br/><p><h3>Scripts</h3></p>` — the section is present, its
    // body is empty — and id 49309's is the empty string. Ruby agrees
    // byte for byte: there is no shades gem among the 32 installed
    // card-mod-* gems, so mod_assets.rb:57-59 `assets_path` is nil,
    // :24-30 `folder_group_card` returns nil, :15-22 `local_group_cards` is
    // [], and :171-181 hands `haml :group_list, groups: []` to a template
    // whose whole body is an `each` over that array — the empty string.
    //
    // Census M5 (serializer-followup2, 0377f4d3) briefly read this the other
    // way, fitting a four-file local group from
    // tmp/serializer-followup/probe-green5/expected--mod_shades__page.html.
    // That file is a live recapture of the production site 44.3 days after
    // this yardstick's capture (a DigitalOcean CSS compile of 2026-09-26 vs
    // this capture's s3 CSS of 2026-08-12), not the graded
    // expected-v2 corpus it was cited as. Adjudicated and repaired
    // 2026-10-04; see an internal work log
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
    // `ace_editor` and `bar_and_box` have NO `+*script` corpus row but DO
    // have pinned groups, which is precisely that risk.
    expect(modAssetGroups("ace_editor", "script")).toBeDefined();
    expect(modAssetGroups("bar_and_box", "script")).toBeDefined();
    expect(modAssetGroups("carrierwave", "script")).toBeDefined();
    expect(modAssetGroups("bootstrap", "style")).toBeDefined();
    // Census M10: the tinymce groups (the graded child-page bytes — the
    // parent page itself 500'd at capture; see
    // mod-tinymce-style-script-group-pins.test.ts).
    expect(modAssetGroups("tinymce_editor", "script")).toBeDefined();
    expect(modAssetGroups("tinymce_editor", "style")).toBeDefined();
  });
});
