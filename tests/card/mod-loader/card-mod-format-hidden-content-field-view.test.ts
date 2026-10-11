// The card-mod-format :hidden_content_field view
// (card-mod-format-0.20.0 set/all/content.rb:56-60).
//
// The Ruby body is one call: `hidden_field :content, class: "d0-card-content"`.
//
// BYTE PARITY (re-pinned from an earlier hash-as-name pin): the GRADED
// corpus oracle (reference-harness fixtures synthetic-v2,
// expected/render.jsonl.gz view:admin:Topic 001+summary:hidden_content_field,
// expected manifest oracle variant "stock") pins the FORM-BUILDER bytes —
//
//   <input class="d0-card-content form-control" autocomplete="off"
//          type="hidden" value="<escaped dbContent>"
//          name="card[content]" id="card_content" />
//
// i.e. the call resolving through the format's implicit form machinery
// (card-mod-edit set/all/form.rb:146-149 form -> new_form ->
// instantiate_builder(form_prefix, card), the form-root prefix "card")
// into FormBuilder#hidden_field(method, options) (actionview
// form_helper.rb:2518). The same byte shape is capture-pinned on the
// list surfaces (card-mod-list.ts hiddenContentField, from
// fixtures/captured rules-views.json) and reused verbatim by
// card-mod-permissions' :input literal.
//
// An earlier lane pinned a probe capture whose bytes carried the options
// hash in the name/id slots (a FormHelper#hidden_field(object_name,
// method) mis-bind, actionview-7.2.3.2 form_helper.rb:1214). The graded
// stock-oracle corpus contradicts that capture, and the corpus gate is
// the arbiter — the view renders the oracle bytes and this file pins
// them.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
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
  await seedCard(s, {
    id: 210,
    name: "Hidden Field Probe",
    dbContent: "some body",
  });
  await seedCard(s, {
    id: 211,
    name: "Hidden Field Second Probe",
    dbContent: "different body",
  });
}, 60_000);

afterAll(() => {
  loader?.reset();
  storage?.close();
});

describe("card-mod-format :hidden_content_field (set/all/content.rb:56-60)", () => {
  it("WITHOUT the mod: the view raises UnsupportedViewError", async () => {
    const s = storage!;
    await expect(
      s.engine.render("Hidden Field Probe", "hidden_content_field"),
    ).rejects.toThrow(UnsupportedViewError);
  });

  it("WITH the mod: renders the graded corpus bytes (the form-builder hidden field)", async () => {
    const s = storage!;
    loader = new ModLoader([{ manifest: cardModFormat }]);
    loader.load();
    await loader.installInto(modEngineHost(s.engine, s.fetcher));

    expect(
      await s.engine.render("Hidden Field Probe", "hidden_content_field"),
    ).toBe(
      '<input class="d0-card-content form-control" autocomplete="off" type="hidden" ' +
        'value="some body" name="card[content]" id="card_content" />',
    );
  });

  it("WITH the mod: the value rides the card's own dbContent", async () => {
    const s = storage!;
    expect(
      await s.engine.render("Hidden Field Second Probe", "hidden_content_field"),
    ).toBe(
      '<input class="d0-card-content form-control" autocomplete="off" type="hidden" ' +
        'value="different body" name="card[content]" id="card_content" />',
    );
  });

  it("WITH the mod: registers unknown: true + cache: never (content.rb:57)", async () => {
    const s = storage!;
    const config = loader!.viewConfigFor("hidden_content_field");
    expect(config).toBeDefined();
    expect(config?.unknown).toBe(true);
    expect(config?.cache).toBe("never");
  });
});
