// Pins for the mod: tinymce editor Styles/Scripts section bodies.
//
// THE PARENT PAGE'S 500. Ruby's own render of mod: tinymce editor :page
// fails (a 500 shell), but the mod's ASSET CHILDREN render perfectly:
//   mod: tinymce editor+*script :page -> "group: local" +
//     image_editor.js.coffee, link_editor.js.coffee, nest_editor.js.coffee,
//     nest_editor_name.js.coffee, nest_editor_options.js.coffee,
//     nest_editor_rules.js.coffee, script_tinymce.js, tinymce_config.js.coffee
//   mod: tinymce editor+*style :page -> "group: local" + nest_editor.scss
// and the mod card's own :closed view rendered fine.
// Ruby mechanism (card-1.110.0 mod/core set/type/mod.rb:53-65): the parent
// page's view :styles / :scripts nest the SAME Abstract::ModAssets cards the
// child pages render (nest(child, view: :core)) — the parent section body IS
// the child core body, wrapped in the section shape. So the group bodies
// are Ruby fact, not a fit: the engine's parent sections must carry
// these exact bodies (MOD_ASSET_GROUPS_SRC gains the tinymce_editor entry).
//
// THE CRASH ITSELF IS NOT DERIVABLE (documented, no code change):
// section-by-section the 0.20 reference chain is exonerated — styles/scripts
// by the children's pages, depends_on by the sibling mod pages
// (account/bootstrap/list pass with the same Depends-on shape),
// configurations/description render cleanly in the reference source and are
// the only sections unique to this page. The serving app ran an older gem
// bundle whose code is not on disk, and logged no tinymce backtrace. A
// faithful crash would invent a mechanism; the engine renders its lawful
// page.

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
  await seedCard(storage, {
    id: 45509,
    name: "mod: tinymce editor",
    codename: "mod_tinymce_editor",
    typeId: 3,
  });
  return storage;
}

describe("mod: tinymce editor Styles/Scripts sections (census M10, the graded child-page groups)", () => {
  it(
    "renders the graded group lists: the eight-file local script group and the style group",
    async () => {
      const s = await seedDeck();
      const html = await s.engine.render("mod: tinymce editor", "core");

      // The Styles section body: the +*style child core.
      expect(html).toContain("<h3>Styles</h3>");
      expect(html).toContain('<li class="list-group-item">nest_editor.scss</li>');

      // The Scripts section body: the +*script child core, all eight files
      // in order.
      expect(html).toContain("<h3>Scripts</h3>");
      for (const file of [
        "image_editor.js.coffee",
        "link_editor.js.coffee",
        "nest_editor.js.coffee",
        "nest_editor_name.js.coffee",
        "nest_editor_options.js.coffee",
        "nest_editor_rules.js.coffee",
        "script_tinymce.js",
        "tinymce_config.js.coffee",
      ]) {
        expect(html).toContain(`<li class="list-group-item">${file}</li>`);
      }

      // The group-list wrapper shape the child cores pin.
      expect(html).toContain("<h5>\ngroup: local\n</h5>");
    },
  );
});
