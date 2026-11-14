// card-mod-list-base-format-input-super-chain.test.ts
//
// THE PIN: the list family's `:input` view chains to the editor module's
// `:input` view the way Ruby's `super()` does, so a card that is IN the
// list family without BEING a list card renders its editor instead of
// failing.
//
// THE RUBY SOURCE, in two files.
//   card-mod-list-0.20.0/set/abstract/01_list/html_views.rb:32-34
//       view :input do
//         _render_hidden_content_field + super()
//       end
//   card-mod-edit-0.20.0/set/all/editor.rb:32-38
//       view :input, unknown: true, cache: :never do
//         try(input_method(input_type)) ||
//           input_defined_by_card ||
//           send(input_method(default_input_type))
//       end
//       def default_input_type; :rich_text; end
//       def rich_text_input
//         send "#{Cardio.config.rich_text_editor || :text_area}_editor_input"
//       end
//
//   `super()` (view_definition.rb:18-21, set/format.rb:146-150) re-dispatches
//   the SAME view on the next set module in the MRO: the editor module. The
//   editor's view picks the editor by the card's input type and falls back to
//   the rich text editor (the tinymce textarea).
//
// THE CARD THAT NEEDS IT. card-mod-follow-0.20.0/set/type_plus_right/
// user/follow.rb includes Abstract::List, so a User card's "+follow" part is
// in the list family while its own type is not List/Pointer. The matrix
// triage named the gap ("the list-family base-format view ... unported",
// brandonDojoTech/docs/registry/instrument-coverage-matrix.json ACT-155),
// and the surface answered 500 with the port's own message "the base-format
// view (card-mod-format/card-mod-edit) is not ported".
//
// WHAT THIS TEST ASSERTS.
//   1. WITHOUT the fix the surface fails (the port's own not-ported error);
//   2. WITH the fix the create form carries the list family's hidden content
//      field AND the editor module's rich text input (the tinymce textarea)
//      - the two halves of `_render_hidden_content_field + super()`;
//   3. the list family's :input view for a LIST card is unchanged (the
//      pointer list editor), so the chain did not capture a list card.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import {
  ModLoader,
  modEngineHost,
  setDefaultModLoader,
} from "../../../src/card/mod-loader.js";
import cardModList from "../../../src/card/mod-loader/mods/card-mod-list.js";
import cardModEdit from "../../../src/card/mod-loader/mods/card-mod-edit.js";
import { RenderEngine } from "../../../src/card/render.js";
import { FetchEngine } from "../../../src/card/fetch.js";

let storage: RenderTestStorage | undefined;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;
  // registry cards (the codename registry and the rule warm read them)
  await seedCard(s, { id: 2, name: "RichText" });
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: 13 });
  await seedCard(s, { id: 12, name: "*self", codename: "self", typeId: 14 });
  await seedCard(s, { id: 13, name: "*set", codename: "set", typeId: 13 });
  await seedCard(s, { id: 14, name: "*setting", codename: "setting", typeId: 14 });
  await seedCard(s, { id: 15, name: "*input_type", codename: "input_type", typeId: 14 });
  await seedCard(s, { id: 16, name: "*content_options", codename: "content_options", typeId: 14 });
  // cardtypes
  await seedCard(s, { id: 4, name: "List", codename: "list", typeId: 2 });
  await seedCard(s, { id: 56, name: "Pointer", codename: "pointer", typeId: 2 });
  await seedCard(s, { id: 18, name: "User", codename: "user", typeId: 2 });
  // the follow option card (the right part's codename card)
  await seedCard(s, { id: 455, name: "*follow", codename: "follow", typeId: 13 });
  // the user card whose "+follow" part is the card under test
  await seedCard(s, { id: 617, name: "Mira Member", typeId: 18 });
  // a list-family card (the control: its :input view must not change)
  await seedCard(s, { id: 102, name: "Oracle Pointer Probe", typeId: 56, dbContent: "Oracle Probe Child" });
  await seedCard(s, { id: 100, name: "Oracle Probe Child" });
}, 60_000);

afterAll(() => {
  storage?.close();
});

/** Render one view of a card through the mod loader. The "input" view is
 *  the list family's own view for this card (the MRO walk picks it), so
 *  this exercises the chain without the page-level permission arms. */
async function renderView(name: string, view: string): Promise<string> {
  const s = storage!;
  const fetcher = new FetchEngine(s.counting);
  const engine = new RenderEngine(fetcher);
  const mods = new ModLoader([{ manifest: cardModEdit }, { manifest: cardModList }]);
  mods.load();
  try {
    engine.modLoader = mods;
    // the super() walk reads the process-wide default loader
    // (mod-view-helpers.ts superView: "the loader is fetched through the
    // process-wide default (setDefaultModLoader)")
    setDefaultModLoader(mods);
    engine.viewer = { signedIn: true, actorId: 900 };
    engine.pageSession = engine.viewer;
    await mods.installInto(modEngineHost(engine, fetcher));
    return await engine.render(name, view, { absentCard: true, focalRoot: true });
  } finally {
    setDefaultModLoader(undefined);
    mods.reset();
  }
}

describe("the list family's :input view chains to the editor module's :input view (Ruby's super())", () => {
  it("a User card's '+follow' part renders the editor instead of failing", async () => {
    const body = await renderView("Mira Member+follow", "input");
    // the list family's half: the hidden content field
    // (content.rb:57-59 hidden_field :content, class d0-card-content)
    expect(body).toContain('class="d0-card-content form-control" autocomplete="off" type="hidden"');
    // the editor module's half: the rich text editor input
    // (editor.rb:42-44 rich_text_input -> the tinymce textarea)
    expect(body).toContain("tinymce-textarea");
    // and the port's not-ported failure is gone
    expect(body).not.toContain("the base-format view");
  }, 60_000);

  it("a LIST card's :input view is unchanged (the pointer list editor)", async () => {
    const s = storage!;
    const fetcher = new FetchEngine(s.counting);
    const engine = new RenderEngine(fetcher);
    const mods = new ModLoader([{ manifest: cardModEdit }, { manifest: cardModList }]);
    mods.load();
    try {
      engine.modLoader = mods;
      engine.viewer = { signedIn: true, actorId: 900 };
      engine.pageSession = engine.viewer;
      await mods.installInto(modEngineHost(engine, fetcher));
      const body = await engine.render("Oracle Pointer Probe", "input");
      expect(body).toContain("pointer-list-editor");
      expect(body).not.toContain("tinymce-textarea");
    } finally {
      mods.reset();
    }
  }, 60_000);
});
