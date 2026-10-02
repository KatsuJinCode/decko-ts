// The card-mod-format :hidden_content_field view
// (card-mod-format-0.20.0 set/all/content.rb:56-60).
//
// The Ruby body is one call: `hidden_field :content, class: "d0-card-content"`.
// Which hidden_field that resolves to, and what the 2-arg call binds, is
// resolved from the installed gem sources and pinned to live bytes captured
// from actionview-7.2.3.2 on Ruby 3.3.0 by the committed probe script
// tests/card/mod-loader/oracle-capture-hidden-content-field-view.rb:
//
//  1. View bodies run with self = the HtmlFormat instance:
//     set/format.rb:118-131 class_evals the `format :html do` block into a
//     per-set module registered for the format instance's singleton class,
//     and card-1.110.0 lib/card/format.rb:62-68 does
//     `singleton_class.send :include, m`.
//  2. Card::Format includes MethodDelegation (format.rb:27). No
//     `hidden_field` is defined anywhere in card-1.110.0, decko-0.20.0, or
//     any installed card-mod gem (grepped), so the call falls through to
//     MethodDelegation#method_missing -> delegate_to_action_view
//     (method_delegation.rb:41-47, 71-75), which forwards the arguments
//     verbatim: action_view.send :hidden_field, :content,
//     {class: "d0-card-content"}.
//  3. The receiver is CardActionView < ActionView::Base
//     (card_action_view.rb:4-8) - the TEMPLATE, never a FormBuilder - so
//     FormHelper#hidden_field(object_name, method, options = {})
//     (form_helper.rb:1214) binds object_name=:content,
//     method={class: "d0-card-content"}, options={}: the trailing hash
//     lands in the `method` slot (Ruby passes it positionally; the same is
//     true of the `send` in step 2). The FormBuilder#hidden_field(method,
//     options) form (form_helper.rb:2518) is NOT in play - decko views are
//     never executed on a FormContext/FormBuilder.
//  4. Tags::HiddenField.new(:content, {class:...}, template, {}).render
//     (form_helper.rb:1215; tags/hidden_field.rb:7-10 setting
//     autocomplete="off"; tags/text_field.rb:11-18; tags/base.rb:11-19):
//     @method_name = {class: "d0-card-content"}.to_s (Ruby 3.3 Hash#to_s =
//     inspect = `{:class=>"d0-card-content"}`), and @object = nil because
//     retrieve_object reads the template's `@content` instance variable,
//     which nothing ever assigns on a CardActionView (its only assigns are
//     {_routes: nil}, card_action_view.rb:7; the card is never exposed).
//     TextField#render therefore emits type=hidden, skips the nil size and
//     value (tag_helper.rb:298 `elsif !value.nil?`), and derives name/id
//     from the stringified hash (field_name/field_id, form_tag_helper.rb:
//     102-144), HTML-escaped by the tag builder.
//
// The pinned byte string below is the LIVE OUTPUT of running the real
// actionview-7.2.3.2 gem with exactly the forwarded arguments
// (tests/card/mod-loader/oracle-capture-hidden-content-field-view.rb —
// method.source_location resolved to form_helper.rb:1214 in the same run,
// confirming the template receiver).

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

// Live-captured Ruby bytes (actionview-7.2.3.2, Ruby 3.3.0, exact forwarded
// arguments - see the header and the research receipt).
const RUBY_ORACLE_BYTES =
  '<input autocomplete="off" type="hidden" name="content[{:class=&gt;&quot;d0-card-content&quot;}]" id="content_{:class=&gt;&quot;d0-card-content&quot;}" />';

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
  // A second card: the Ruby body never reads the card (no card field is
  // consulted anywhere in Tags::Base for this call), so the emitted bytes
  // must be identical on every card.
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

  it("WITH the mod: renders the live-captured Ruby bytes (actionview-7.2.3.2)", async () => {
    const s = storage!;
    loader = new ModLoader([{ manifest: cardModFormat }]);
    loader.load();
    await loader.installInto(modEngineHost(s.engine, s.fetcher));

    expect(
      await s.engine.render("Hidden Field Probe", "hidden_content_field"),
    ).toBe(RUBY_ORACLE_BYTES);
  });

  it("WITH the mod: same bytes on a second card (the body never reads the card)", async () => {
    const s = storage!;
    expect(
      await s.engine.render("Hidden Field Second Probe", "hidden_content_field"),
    ).toBe(RUBY_ORACLE_BYTES);
  });

  it("WITH the mod: registers unknown: true + cache: never (content.rb:57)", async () => {
    const s = storage!;
    const config = loader!.viewConfigFor("hidden_content_field");
    expect(config).toBeDefined();
    expect(config?.unknown).toBe(true);
    expect(config?.cache).toBe("never");
  });
});
