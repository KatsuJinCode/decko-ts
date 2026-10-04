// Pins for the mod: shades Scripts section — the serializer-followup2 census
// mechanism M5 (mod: shades:page, graded delta -247).
//
// Census bytes (tmp/serializer-followup/probe-green5 expected--mod_shades__page.html):
// the live Scripts section body renders the group list —
//   <h3>Scripts</h3><p>\n<h5>\ngroup: local\n</h5>\n<ul class="list-group">
//   <li class="list-group-item">decko_logo.js</li>\n
//   <li class="list-group-item">decko_org.js.coffee</li>\n
//   <li class="list-group-item">snap.js</li>\n
//   <li class="list-group-item">snap_svg.js</li></ul>\n</p>
// The engine renders the section with an EMPTY body
// (`<h3>Scripts</h3></p>`): MOD_ASSET_GROUPS_SRC has no shades entry, so
// modAssetSection falls to the "corpus child row exists, no pinned groups"
// arm (core-mod.ts, the mm-cstructural note) and emits sectionHtml(title, "").
//
// Ruby mechanism (card-1.110.0 mod/core set/type/mod.rb:60-65 view :scripts):
// `section "Scripts", nest(card.fetch(:script), view: :core)` — the nested
// asset card's core view renders the mod's script groups (Abstract::ModAssets
// group_list). The earlier lane fitted the empty body from an older capture
// generation (recapture-raw-shard-000043); the graded expected-v2 corpus
// carries the four-file local group and is the authority this lane grades
// against.

import { describe, it, expect, afterAll } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "./render-test-storage.js";

let storage: RenderTestStorage | undefined;

afterAll(() => {
  storage?.close();
});

async function seedDeck(): Promise<RenderTestStorage> {
  storage = await createRenderTestStorage();
  await seedCard(storage, { id: 2, name: "Basic", codename: "basic", typeId: 2 });
  await seedCard(storage, { id: 3, name: "Mod", codename: "mod", typeId: 2 });
  await seedCard(storage, { id: 60, name: "mod: shades", codename: "mod_shades", typeId: 3 });
  return storage;
}

describe("mod: shades Scripts section (census M5, the pinned local group)", () => {
  it(
    "renders the four-file local group exactly as the graded bytes pin it",
    async () => {
      const s = await seedDeck();
      const html = await s.engine.render("mod: shades", "core");
      expect(html).toContain("<h3>Scripts</h3>");
      expect(html).toContain(
        '<li class="list-group-item">decko_logo.js</li>',
      );
      expect(html).toContain(
        '<li class="list-group-item">decko_org.js.coffee</li>',
      );
      expect(html).toContain('<li class="list-group-item">snap.js</li>');
      expect(html).toContain(
        '<li class="list-group-item">snap_svg.js</li>',
      );
      expect(html).toContain("<h5>\ngroup: local\n</h5>");
    },
  );
});
