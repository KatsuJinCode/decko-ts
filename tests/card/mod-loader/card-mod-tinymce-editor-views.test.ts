// The card-mod-tinymce_editor html editor views, ported 2026-09-29 (the
// tinymce-views-port): :link_editor + :modal_link_editor
// (set/all/reference_editor/link_editor.rb:2-12).
//
// ORACLE-PINNED: fixtures/captured/tinymce-editor-views.json, captured
// inside the live decko-0.20.0 oracle app (tools/oracle/decko-oracle-app)
// by oracle-capture-tinymce-editor-views.rb with the in-run no-write proof
// (card_actions 4929 -> 4929, the render phase brackets the proof; the
// probe seed create + trash delete ride outside it). Capture normalizations
// (data-slot-id -> RANDOMIZED, data-card-id -> RANDOMIZED,
// authenticity_token -> RANDOMIZED, data-select2-id -> RANDOMIZED) apply to
// BOTH sides. The full-byte toBe pins are possible because the two views'
// bytes compose entirely HERE: the slot wrap (wrap.rb:11-14 wrapper :slot +
// :26-31 slot_attributes + :46-48 wrap_classes), the reference_editor.haml
// chrome, the _link_editor.haml partial, and the Rails tag helpers
// (text_field_tag / check_box_tag / button_tag / link_to / icon_tag) - plus
// the ABSENT-params arm of every param read (link_editor.rb:28-30
// LinkParser.new params[:tm_snippet_raw] -> the default Link struct; the
// headless engine models no request params - the established precedent of
// the mod's js-view port in card-mod-tinymce_editor.ts).
//
// THE OTHER SEVEN html views stay unported with NAMED blockers (see the
// manifest header): nest_editor + modal_nest_editor render the options tab's
// ._templates.d-none block whose nest_show_and_hide_select_template feeds
// options_for_select(all_views) - demo.rb:40-43's ancestor-sliced slice of
// the LIVE Ruby view registry (191 entries for the probe card, recorded in
// the fixture) with no headless equivalent; nest_image + modal_nest_image
// eagerly nest :new_image (create_form, rails-runtime unported) in their
// upload tab on top of the same all_views blocker; nest_content's known
// branch is render_edit_inline and new_image's body is create_form (both
// card-mod-edit rails-runtime); new_image_buttons' body is button_formgroup
// + standard_save_button (rails-runtime) - and the capture shows its arm on
// a non-existent card is the UNKNOWN-view substitution, not the view body.
// Their captured bytes are on record in the same fixture for the next
// increment.
//
// RED-FIRST: this file was written before the port and run against the
// pristine d6b1957 tree (the base worktree): every WITH-the-mod
// byte test failed there with UnsupportedViewError (the views did not
// dispatch), which is the renders-missing proof.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import { UnsupportedViewError } from "../../../src/card/render/format.js";
import { ModLoader, modEngineHost } from "../../../src/card/mod-loader.js";
import { default as cardModTinymceEditor } from "../../../src/card/mod-loader/mods/card-mod-tinymce_editor.js";

const FIXTURE = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL("../../../fixtures/captured/tinymce-editor-views.json", import.meta.url),
    ),
    "utf8",
  ),
) as {
  registered_views: Record<
    string,
    { module: string; defined: boolean; source_location: [string, number] | null }
  >;
  rendered: Record<string, string>;
  no_write_proof: { actions_before: number; actions_after: number; unchanged: boolean };
  helper_facts: {
    view_list: string[];
    all_views_count: number;
    options_card_name: string;
    image_autoname: string;
    image01_exists: boolean;
    probe_left_type: string;
  };
};

const PROBE = "Oracle TinyMCE Editor Probe";

/** The capture's own normalization, applied to this side's renders (the
 *  fixture already carries the placeholders). */
function normalize(html: string): string {
  return html
    .replace(/data-slot-id=(["'])[0-9a-fA-F]+\1/g, 'data-slot-id="RANDOMIZED"')
    .replace(/data-card-id=(["'])\d+\1/g, 'data-card-id="RANDOMIZED"');
}

let storage: RenderTestStorage | undefined;
let loader: ModLoader | undefined;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  // the capture deck's RichText type card (id 2, data-card-type-id "2" in
  // the captured slot wraps) + the probe card - the name is the only thing
  // the slot ids/set keys/data attrs derive from (safeKey
  // oracle_tiny_mce_editor_probe), and it must equal the capture's.
  await seedCard(storage, { id: 2, name: "RichText" });
  await seedCard(storage, {
    id: 99001,
    name: PROBE,
    typeId: 2,
    typeName: "RichText",
    dbContent: "probe card body",
  });
}, 60_000);

afterAll(() => {
  loader?.reset();
  storage?.close();
});

describe("tinymce-editor-views oracle fixture", () => {
  it("carries the no-write proof (the render phase moved no card_actions)", () => {
    expect(FIXTURE.no_write_proof.unchanged).toBe(true);
    expect(FIXTURE.no_write_proof.actions_before).toBe(
      FIXTURE.no_write_proof.actions_after,
    );
  });

  it("links both link-editor views to their gem files", () => {
    for (const view of ["link_editor", "modal_link_editor"]) {
      const reg = FIXTURE.registered_views[view];
      expect(reg.defined).toBe(true);
      // Ruby method source_location: [path, line] - link_editor.rb:2 and
      // :9 are exactly the gem lines the port cites.
      const loc = FIXTURE.registered_views[view].source_location ?? [];
      expect(loc[0]).toContain(
        "card-mod-tinymce_editor-0.20.0/set/all/reference_editor/link_editor.rb",
      );
    }
  });

  it("records the helper facts the port (and the remainders) cite", () => {
    // link_editor.haml:9 / nest_editor.haml:10 data-options-card -
    // [:all, :by_name].to_name renders "*all+by name" (the *all codename,
    // NOT "all"), measured, and exactly what the emitter pins.
    expect(FIXTURE.helper_facts.options_card_name).toBe("*all+by name");
    // demo.rb:14-16 - the ONLY view_list definition in the bundle (the
    // nest View select unshifts nil onto it)
    expect(FIXTURE.helper_facts.view_list).toEqual([
      "content", "titled", "labeled", "bar", "box", "open", "closed",
    ]);
    // demo.rb:40-43 all_views - the NAMED blocker for nest_editor /
    // modal_nest_editor: 191 ancestor-sliced live-registry view names the
    // headless engine cannot reproduce.
    expect(FIXTURE.helper_facts.all_views_count).toBe(191);
    // nest_image.rb:33 card.autoname("image01") - "image01" is free, so the
    // autoname resolves to the bare name
    expect(FIXTURE.helper_facts.image_autoname).toBe("image01");
    expect(FIXTURE.helper_facts.image01_exists).toBe(false);
    // nest_editor.rb:1-3 left_type_for_nest_editor_set_selection
    expect(FIXTURE.helper_facts.probe_left_type).toBe("RichText");
  });
});

describe("card-mod-tinymce_editor link editors (A/B)", () => {
  it("WITHOUT the mod: both views raise UnsupportedViewError", async () => {
    const s = storage!;
    // render.rb#view_method - the views are not in the live registry yet
    await expect(
      s.engine.render(PROBE, "link_editor"),
    ).rejects.toThrow(UnsupportedViewError);
    await expect(
      s.engine.render(PROBE, "modal_link_editor"),
    ).rejects.toThrow(UnsupportedViewError);
  });

  it("WITH the mod: :link_editor emits the capture's exact bytes", async () => {
    const s = storage!;
    loader = new ModLoader([{ manifest: cardModTinymceEditor }]);
    loader.load();
    await loader.installInto(modEngineHost(s.engine, s.fetcher));

    const html = await s.engine.render(PROBE, "link_editor");
    expect(normalize(html)).toBe(
      normalize(FIXTURE.rendered[`${PROBE}#link_editor`]),
    );
  });

  it("WITH the mod: :modal_link_editor emits the capture's exact bytes", async () => {
    const s = storage!;
    loader = new ModLoader([{ manifest: cardModTinymceEditor }]);
    loader.load();
    await loader.installInto(modEngineHost(s.engine, s.fetcher));

    const html = await s.engine.render(PROBE, "modal_link_editor");
    expect(normalize(html)).toBe(
      normalize(FIXTURE.rendered[`${PROBE}#modal_link_editor`]),
    );
  });

  it("WITH the mod: the load report lists all eleven ported views", () => {
    const report = loader!.load();
    // the two format :js views (change_create_to_update, open_nest_editor)
    // plus this suite's two html views, plus the form-substrate port's
    // :new_image_buttons (nest_image.rb:21-24) landed by the pass16
    // rules-views3 merge - a consequence of that port, the same count
    // movement card-mod-tinymce_editor.test.ts discloses
    expect(report.registeredViews).toContain("change_create_to_update");
    expect(report.registeredViews).toContain("open_nest_editor");
    expect(report.registeredViews).toContain("link_editor");
    expect(report.registeredViews).toContain("modal_link_editor");
    expect(report.registeredViews).toContain("new_image_buttons");
    expect(report.registeredViews).toHaveLength(11);
  });

  it("WITH the mod: both new views carry Ruby's view config (link_editor.rb:2,9)", () => {
    // view :link_editor, cache: :never, unknown: true, wrap: {...}
    // view :modal_link_editor, cache: :never, unknown: true, wrap: {...}
    // (the wrap HASH rides the viewFn's own slot-wrap emitter - the manifest
    // schema's wrap field takes only the string forms)
    expect(loader!.viewConfigFor("link_editor")?.cache).toBe("never");
    expect(loader!.viewConfigFor("link_editor")?.unknown).toBe(true);
    expect(loader!.viewConfigFor("modal_link_editor")?.cache).toBe("never");
    expect(loader!.viewConfigFor("modal_link_editor")?.unknown).toBe(true);
  });

  it("WITH the mod: the reference_editor set-module basket is unchanged", () => {
    const basket = loader!.setModules();
    const base = basket.base.map((m) => m.shortname);
    expect(base).toEqual([
      "All::ReferenceEditor",
      "All::ReferenceEditor::LinkEditor",
      "All::ReferenceEditor::NestEditor",
      "All::ReferenceEditor::NestEditor::NestEditorOptions",
      "All::ReferenceEditor::NestEditor::NestEditorTabs",
      "All::ReferenceEditor::NestImage",
      "All::TinymceEditor",
    ]);
    const nonbase = [...basket.nonbase.values()].flat().map((m) => m.shortname);
    expect(nonbase).toEqual(["Self::TinyMce"]);
  });
});
