// mod: shades' Scripts section — the Ruby-rendered bytes, verbatim.
//
// The parent page's main slot card body, byte for byte:
//
//     <p></p><br/><p><h3>Scripts</h3></p>
//
//   The Scripts SECTION is present; its body is EMPTY. The child page
//   "mod: shades+*script"'s card body is the empty
//   string — there is no group list anywhere on either surface.
//
//   Those two byte shapes are a complete derivation of Ruby's mechanism, not a
//   coincidence:
//
//   card-1.110.0/mod/core/set/type/mod.rb:7-13 view :core —
//     render_section_views(%i[description settings configurations cardtypes
//                             styles scripts tasks views depends_on]
//       .select { |name| card.send("#{name}?") })
//   ...:22-24 def render_section_views — `... .compact.join "<br/>"`, so the
//   description's `content_tag(:p, card.description)` with an empty
//   description is the `<p></p>` and the join separator is the `<br/>`.
//   ...:60-65 view :scripts — `style = card.fetch :script; return unless
//   style; section "Scripts", nest(style, view: :core)`, and
//   ...:115-117 `def scripts?; fetch(:script).present?; end`. The child row
//   exists, so the section IS emitted — with whatever the nested core
//   returns as its body.
//
//   card-mod-assets-0.20.0/set/abstract/mod_assets.rb:15-22 def
//   local_group_cards — no manifest.yml, so `[folder_group_card].compact`;
//   :24-30 def folder_group_card — `return unless assets_path`;
//   :57-59 def assets_path — `mod&.subpath "assets", subpath`. `mod` is
//   `Cardio::Mod.fetch mod_name` (:39-42). THERE IS NO SHADES GEM: the
//   installed gem set holds no card-mod-* gem named shades, so `mod` is nil,
//   `assets_path` is nil, `local_group_cards` is [], and
//   :171-181 view :core hands `haml :group_list, groups: []` — and
//   group_list.haml's whole body is `- groups.each do |(title, items)|`,
//   so an empty array renders the EMPTY STRING. `section "Scripts", ""`
//   is exactly `<p><h3>Scripts</h3></p>`.
//
//   So the expected bytes, the installed Ruby, and the deck rows all agree:
//   THE EMPTY BODY IS THE PREMISE for shades.
//
// WHAT THIS FILE PREVIOUSLY PINNED, AND WHY IT LOST. It pinned a four-file
// local group (decko_logo.js, decko_org.js.coffee, snap.js, snap_svg.js).
// Those four filenames exist nowhere in the installed Ruby gem set or in
// the decko distribution's mod dirs (none of them is shades), so the
// four-file group was a wrong expectation, not an engine regression; the
// empty body is the correct pin.
//
// mod-assets-child-group-list-core.test.ts's "mod: shades+*script renders
// the empty core" pin is this file's sibling and carries the same correct
// expectation.

import { describe, it, expect, afterAll } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "./render-test-storage.js";
import { modAssetGroups } from "../../../src/card/mod-loader/mods/core-admin-runtime.js";

let storage: RenderTestStorage | undefined;

afterAll(() => {
  storage?.close();
});

describe("mod: shades Scripts section — the graded expected-v2 bytes (shard 43, 49308/49309)", () => {
  it(
    "the parent core is the description, a <br/>, and an EMPTY Scripts section",
    async () => {
      const s = await createRenderTestStorage();
      storage = s;
      await seedCard(s, { id: 2, name: "Basic", codename: "basic", typeId: 2 });
      await seedCard(s, { id: 3, name: "Mod", codename: "mod", typeId: 2 });
      await seedCard(s, { id: 60, name: "mod: shades", codename: "mod_shades", typeId: 3 });
      // The child row is NAMELESS in a real deck (its name is built by the
      // + right-part context), so the fixture seeds it the same way the
      // engine meets it: a left mod card, a right *script setting,
      // List-typed.
      await seedCard(s, { id: 61, name: "*script", codename: "script", typeId: 2 });
      await seedCard(s, { id: 62, leftId: 60, rightId: 61, typeId: 13 });

      const core = await s.engine.render("mod: shades", "core");
      // Byte-exact against Ruby's main-slot card body.
      expect(core).toBe("<p></p><br/><p><h3>Scripts</h3></p>");
      // And the shape the pre-fix engine could not produce, named so a
      // regression reads as itself: the section is present but its body is
      // not a group list.
      expect(core).toContain("<h3>Scripts</h3>");
      expect(core).not.toContain("group: local");
      expect(core).not.toContain("list-group-item");
    },
    60_000,
  );

  it(
    "the child core is the empty group_list (mod_assets.rb:171-181 + group_list.haml)",
    async () => {
      const s = await createRenderTestStorage();
      await seedCard(s, { id: 2, name: "Basic", codename: "basic", typeId: 2 });
      await seedCard(s, { id: 3, name: "Mod", codename: "mod", typeId: 2 });
      await seedCard(s, { id: 60, name: "mod: shades", codename: "mod_shades", typeId: 3 });
      await seedCard(s, { id: 61, name: "*script", codename: "script", typeId: 2 });
      await seedCard(s, { id: 62, leftId: 60, rightId: 61, typeId: 13 });

      const core = await s.engine.render("mod: shades+*script", "core");
      expect(core).toBe("");
    },
    60_000,
  );

  it("the parent table is SILENT for shades, in both subpaths", () => {
    // The section's PRESENCE is the union predicate's first half (the child
    // row); the table is the second. For shades the second half contributes
    // nothing: a table entry here would assert group files that exist in no
    // installed gem or decko mod dir.
    expect(modAssetGroups("shades", "script")).toBeUndefined();
    expect(modAssetGroups("shades", "style")).toBeUndefined();
  });
});
