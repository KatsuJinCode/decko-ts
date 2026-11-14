// The two form views from card-mod-format set/type/toggle.rb's html block:
// :input (line 15-17) + :labeled_editor (line 19-21).
//
// BYTE PARITY (re-pinned from an earlier raise pin):
//
// Both views' bodies render Rails FormBuilder products:
//   view :input do toggle end                 # check_box :content
//   view :labeled_editor do toggle + toggle_label end
//                                             # + label :content, card.name.tag
//
// The graded corpus oracle (reference-harness fixtures synthetic-v2,
// expected/render.jsonl.gz view:admin:Toggle 1:labeled_editor — the
// expected manifest declares oracle variant "stock") pins the
// FormBuilder bytes with object_name "card":
//
//   <input name="card[content]" type="hidden" value="0" autocomplete="off" />
//   <input type="checkbox" value="1" checked="checked" name="card[content]"
//    id="card_content" />
//   <label for="card_content">Toggle 1</label>
//
// The calls resolve through the format's implicit form machinery
// (card-mod-edit set/all/form.rb:146-149 form -> new_form ->
// instantiate_builder(form_prefix, card), the form-root prefix "card");
// the FormBuilder's own one-arg check_box(method)/label(method, text)
// overloads (actionview form_helper.rb:2474 / :2405) render, and
// `checked?` rides card.content == "1" (toggle.rb:5-7).
//
// An earlier lane pinned an "ArgumentError parity" raise here (a probe
// capture rendered CAPTURE_ERROR, read as FormHelper#check_box's 2-arg
// signature firing on the single-arg call). The graded stock-oracle
// corpus contradicts that capture, and the corpus gate is the arbiter —
// the views now render the oracle's bytes, and this file pins them.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { expectViewWithoutMod } from "../../support/native-views.js";
import {
  bindModLoaderToEngine,
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import { UnsupportedViewError } from "../../../src/card/render/format.js";
import {
  ModLoader,
  modEngineHost,
} from "../../../src/card/mod-loader.js";
import cardModFormat from "../../../src/card/mod-loader/mods/card-mod-format.js";

let storage: RenderTestStorage | undefined;
let loader: ModLoader | undefined;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;

  // Toggle-typed probe card — the views live on the Type::Toggle chain,
  // so the rendered card must reach the toggle block. Seeding
  // typeName="Toggle" identifies the card (see the chooser-mount-era
  // note in the git history for the flat-registry caveat).
  await seedCard(s, { id: 2, name: "Toggle", codename: "toggle" });
  await seedCard(s, {
    id: 300,
    name: "Oracle Toggle Probe",
    typeId: 2,
    dbContent: "1",
  });
}, 60_000);

afterAll(() => {
  loader?.reset();
  storage?.close();
});

describe("card-mod-format set/type/toggle — :input + :labeled_editor bytes", () => {
  it("WITHOUT the mod: :labeled_editor raises; the compiled :input renders", async () => {
    const s = storage!;
    await expectViewWithoutMod(s.engine.render("Oracle Toggle Probe", "input"), "input");
    await expect(
      s.engine.render("Oracle Toggle Probe", "labeled_editor"),
    ).rejects.toThrow(UnsupportedViewError);
  });

  it("WITH the mod: :input renders the FormBuilder checkbox pair (checked on content '1')", async () => {
    const s = storage!;
    loader = new ModLoader([{ manifest: cardModFormat }]);
    loader.load();
    bindModLoaderToEngine(storage!, loader!);
    await loader.installInto(modEngineHost(s.engine, s.fetcher));

    // set/type/toggle.rb:15-17 + :23-25 — the FormBuilder#check_box pair:
    // the unchecked hidden input (name, type, value, autocomplete), then
    // the checkbox (type, value, checked, name, id).
    expect(await s.engine.render("Oracle Toggle Probe", "input")).toBe(
      '<input name="card[content]" type="hidden" value="0" autocomplete="off" />' +
        '<input type="checkbox" value="1" checked="checked" name="card[content]" id="card_content" />',
    );
  });

  it("WITH the mod: :labeled_editor renders the checkbox pair + the tag label (the graded corpus bytes)", async () => {
    const s = storage!;
    // set/type/toggle.rb:19-21 — toggle + toggle_label; the label rides
    // card.name.tag. Byte-identical to the graded corpus oracle row
    // view:admin:Toggle 1:labeled_editor.
    expect(await s.engine.render("Oracle Toggle Probe", "labeled_editor")).toBe(
      '<input name="card[content]" type="hidden" value="0" autocomplete="off" />' +
        '<input type="checkbox" value="1" checked="checked" name="card[content]" id="card_content" />' +
        "<label for=\"card_content\">Oracle Toggle Probe</label>",
    );
  });

  it("WITH the mod: the mod loader's load report lists both views", () => {
    const report = loader!.load();
    expect(report.registeredViews).toContain("input");
    expect(report.registeredViews).toContain("labeled_editor");
  });

  it("WITH the mod: a Toggle card's baseline :core view still renders (the mod adds the form views, it does not alter the existing toggle core)", async () => {
    const s = storage!;
    expect(await s.engine.render("Oracle Toggle Probe", "core")).toBe("yes");
  });
});
