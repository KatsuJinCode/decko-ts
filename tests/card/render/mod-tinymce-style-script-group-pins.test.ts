// Pins for the mod: tinymce editor Styles/Scripts section bodies — the
// serializer-followup2 census mechanism M10 (the mandated tinymce
// adjudication), the M5 family.
//
// THE ADJUDICATION (full record in the lane receipt): the graded capture of
// mod: tinymce editor :page is the Wild Card 500 shell — but the SAME
// capture rendered the mod's ASSET CHILDREN perfectly (expected-v2
// page-lane shard 000039, records 200/201):
//   mod: tinymce editor+*script :page -> "group: local" +
//     image_editor.js.coffee, link_editor.js.coffee, nest_editor.js.coffee,
//     nest_editor_name.js.coffee, nest_editor_options.js.coffee,
//     nest_editor_rules.js.coffee, script_tinymce.js, tinymce_config.js.coffee
//   mod: tinymce editor+*style :page -> "group: local" + nest_editor.scss
// and the view-lane :closed capture of the mod card itself rendered fine.
// Ruby mechanism (card-1.110.0 mod/core set/type/mod.rb:53-65): the parent
// page's view :styles / :scripts nest the SAME Abstract::ModAssets cards the
// child pages render (nest(child, view: :core)) — the parent section body IS
// the child core body, wrapped in the section shape. So the group truth is
// graded-capture fact, not a fit: the engine's parent sections must carry
// these exact bodies (MOD_ASSET_GROUPS_SRC gains the tinymce_editor entry,
// the M5 mechanism).
//
// THE CRASH ITSELF IS NOT CORPUS-DERIVABLE (documented, no code change):
// section-by-section the 0.20 reference chain is exonerated — styles/scripts
// by the children's graded pages, depends_on by the sibling mod pages
// (account/bootstrap/list pass with the same Depends-on shape),
// configurations/description render cleanly in the reference source and are
// the only sections unique to this page. The capture app ran the 0.19.1-era
// gem bundle (footerDeckoVersion), whose code is not on disk, and logged no
// backtrace (checked decko-oracle-app-2026-10-03 log/development.log: the
// only exceptions are the email-stylesheet view errors, an account-token
// HMAC error, and DelayedJob argument errors — none tinymce). A faithful
// crash would invent a mechanism; the engine renders its lawful page and the
// page target stays FAIL on the 500-shell expectation.

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

      // The Styles section body: the graded +*style child core (shard
      // 000039 record 201).
      expect(html).toContain("<h3>Styles</h3>");
      expect(html).toContain('<li class="list-group-item">nest_editor.scss</li>');

      // The Scripts section body: the graded +*script child core (shard
      // 000039 record 200), all eight files in the graded order.
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

      // The group-list wrapper shape the child cores (and the shades M5
      // pin) grade against.
      expect(html).toContain("<h5>\ngroup: local\n</h5>");
    },
  );
});
