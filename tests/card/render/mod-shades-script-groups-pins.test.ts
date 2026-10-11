// mod: shades' Scripts section — the graded expected-v2 bytes, verbatim.
//
// GRADED CORPUS (the yardstick this engine is graded against:
// tmp/raw-ground-truth/expected-v2/capture-manifest.json — "POST-HOC MANIFEST
// for the frozen pre-M1 yardstick", corpus sha256 739c470e24f88967448fba25f6461
// 70776f52cc4a2634b4fe0817a1031b71eb1, copied down an earlier/13 archive
// chain). The live-site CSS id the capture carries is 1786554352 = 2026-08-12.
//
//   page-lane/recapture-raw-shard-000043.jsonl, id 49308 "mod: shades",
//   the main slot's card body, transcribed byte for byte:
//
//     <p></p><br/><p><h3>Scripts</h3></p>
//
//   The Scripts SECTION is present; its body is EMPTY. id 49309
//   "mod: shades+*script" is the CHILD page and its card body is the empty
//   string — there is no group list anywhere on either surface.
//
//   Those two bytes are a complete derivation of Ruby's mechanism, not a
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
//   49309 exists, so the section IS emitted — with whatever the nested core
//   returns as its body.
//
//   card-mod-assets-0.20.0/set/abstract/mod_assets.rb:15-22 def
//   local_group_cards — no manifest.yml, so `[folder_group_card].compact`;
//   :24-30 def folder_group_card — `return unless assets_path`;
//   :57-59 def assets_path — `mod&.subpath "assets", subpath`. `mod` is
//   `Cardio::Mod.fetch mod_name` (:39-42). THERE IS NO SHADES GEM: the
//   installed gem set C:/Ruby33-x64/lib/ruby/gems/3.3.0/gems holds 32
//   card-mod-* gems and none of them is shades, so `mod` is nil,
//   `assets_path` is nil, `local_group_cards` is [], and
//   :171-181 view :core hands `haml :group_list, groups: []` — and
//   group_list.haml's whole body is `- groups.each do |(title, items)|`,
//   so an empty array renders the EMPTY STRING. `section "Scripts", ""`
//   is exactly `<p><h3>Scripts</h3></p>`.
//
//   So the graded bytes, the installed Ruby, and the corpus deck all agree:
//   THE EMPTY BODY IS THE PREMISE for shades.
//
// WHAT THIS FILE PREVIOUSLY PINNED, AND WHY IT LOST (ERRATA — recorded, not
// rewritten; the superseded assertion is quoted in the receipt
// an internal work log).
// It pinned a four-file local group (decko_logo.js, decko_org.js.coffee,
// snap.js, snap_svg.js) and cited
// tmp/serializer-followup/probe-green5/expected--mod_shades__page.html as
// "the graded expected-v2 corpus". That file is NOT the graded corpus. It
// is a LIVE recapture of the production site taken 2026-09-03, whose
// `decko.cssPath` is production-storage.r1.cdn
// .objectstore.example/files/45514/0000000001.css — object storage
// infrastructure carrying a 2026-09-26 compile, i.e. 44.3 days AFTER the
// graded yardstick's 2026-08-12 s3.amazonaws.com capture. The sibling
// control settles which is which: on the five other mod pages
// (account / core / bootstrap / email / list) the probe and the graded
// corpus agree on every structural byte, differing only in per-request
// RANDOMIZED collapse-ids. `mod: shades` alone differs STRUCTURALLY, at
// offset 32, where the four-file list begins. The site changed between the
// two captures; the frozen yardstick did not. Those four filenames also
// exist nowhere in the installed Ruby gem set or in the decko distribution
// (REPO_ROOT/archive/decko-fork-study/decko/mod has 32 mod dirs,
// none of them shades). The four-file group is a live-server mutation the
// yardstick never recorded, not an engine regression.
//
// The censusport lane's inherited red
// (mod-assets-child-group-list-core.test.ts, "mod: shades+*script renders
// the empty core (oracle 49309: no assets directory)") was this file's
// contradicting twin, and it is the CORRECT one. The donor repaired the
// parent-table twin of that assertion and not the other.

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
      // The corpus child row. 49309 is NAMELESS in the deck (its name is
      // built by the + right-part context: bench-corpus-raw.sqlite3 row
      // 49309 = {id:49309, name:null, type_id:47, left_id:49308,
      // right_id:20596}), so the fixture seeds it the same way the engine
      // meets it: a left mod card, a right *script setting, List-typed.
      await seedCard(s, { id: 61, name: "*script", codename: "script", typeId: 2 });
      await seedCard(s, { id: 62, leftId: 60, rightId: 61, typeId: 13 });

      const core = await s.engine.render("mod: shades", "core");
      // Byte-exact against the graded capture's main-slot card body.
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
    // row); the table is the second. For shades the graded corpus says the
    // second half contributes nothing, so a table entry here is a fit to a
    // capture generation this yardstick does not contain.
    expect(modAssetGroups("shades", "script")).toBeUndefined();
    expect(modAssetGroups("shades", "style")).toBeUndefined();
  });
});
