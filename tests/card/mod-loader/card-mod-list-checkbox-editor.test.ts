// The CHECKBOX arm of the pointer/list editor (E12) - the one editor of
// card-mod-list's five that renders nothing today (the ported set answers a
// loud "input editor not ported" error for an *input_type rule naming
// checkbox). This file pins the bytes the gem + ActionView produce for that
// view.
//
// Ruby truth under test
// ---------------------
// card-mod-list-0.20.0 set/abstract/01_list/html_views.rb:50-52
//   `%i[autocomplete checkbox radio select multiselect].each do |editor_view|
//      view(editor_view) { send "#{editor_view}_input" } end`
//   - FIVE views of this set module, :checkbox among them (a real view, not
//   an :input branch; editor.rb's `try(input_method(input_type))` dispatch
//   reaches it by name).
// :60-62 `def checkbox_input; raw haml(:checkbox_input, submit_on_change:
//   @submit_on_change); end` + set/abstract/01_list/html_views/
//   checkbox_input.haml (the template, read in full - 12 lines):
//     .pointer-checkbox-list
//     - card.options_hash.each do |option_label, option_name|
//       - id = "pointer-checkbox-#{option_name.to_name.key}"
//       - checked = card.item_names.include? option_name
//       .pointer-checkbox
//         = check_box_tag "pointer_checkbox-#{unique_id}", option_name, checked,
//                         id: id, class: "pointer-checkbox-button
//                         #{'_submit-on-change' if submit_on_change}"
//         = option_label option_label, id
// check_box_tag - actionview-7.2.3.2 lib/action_view/helpers/
//   form_tag_helper.rb:455-464:
//     html_options = { "type" => "checkbox", "name" => name, "id" =>
//       sanitize_to_id(name), "value" => value }.update(options.stringify_keys)
//     html_options["checked"] = "checked" if checked
//     tag :input, html_options
//   -> attribute order type / name / id / value / class [checked]: the :id
//   option OVERWRITES the hash's own id (Hash#update rewrites the value and
//   keeps the key's position), :class is a NEW key so it lands last before
//   checked, and tag_helper emits hash-insertion order (no sort).
// option_label - card-mod-layout-0.20.0 set/abstract/items/options_api.rb:73-77
//   `wrap_with :label, class: "form-check-label", for: id do
//      option_label_text option_name end` and :79-85 option_label_text -
//   `return option_name unless (option_card = Card.fetch option_name)` -
//   so a label that is not a card name renders as the bare text; an option
//   card that EXISTS takes the `nest option_card, view: option_view` arm,
//   which this port refuses loudly (the radio editor's own boundary).
// options_hash - options_api.rb:3-19: the options card's item names PLUS the
//   card's own selected items, uniq'd in insertion order.
//
// NOT ORACLE-CAPTURED, and why: no card in the pinned oracle deck carries an
// `*input_type` rule naming checkbox (the only input_type rule in
// db/development.sqlite3 is the empty set card id 149 "*input type" with
// left id 150 and an empty db_content - probed read-only through the decko
// runner). The gem-deck capture that seeded the radio probe
// (tests/card/mod-loader/oracle-capture-list-mod.rb) writes probe cards into
// the SHARED oracle database; this suite was required to prove fresh captures
// wrote nothing, so the checkbox bytes are pinned GEM-SOURCE-DERIVED (haml +
// actionview, cited per line above) instead of capture-pinned. The pins are
// therefore byte-exact against the sources that produce them, and are marked
// rendered-unpinned in the surface inventory.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  bindModLoaderToEngine,
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import { UnsupportedViewError } from "../../../src/card/render/format.js";
import { ModLoader, modEngineHost } from "../../../src/card/mod-loader.js";
import cardModList from "../../../src/card/mod-loader/mods/card-mod-list.js";

let storage: RenderTestStorage | undefined;
let loader: ModLoader | undefined;

/** The committed list suite's seed deck VERBATIM
 *  (card-mod-list.test.ts:76-139 — the rule chain only resolves on the full
 *  deck; a minimal deck silently falls back to the default editor) plus the
 *  checkbox probes on fresh ids: the same shape as the radio probe, with the
 *  *input_type rule reading "checkbox". */
async function seedCheckboxDeck(s: RenderTestStorage): Promise<void> {
  await seedCard(s, { id: 2, name: "RichText" });
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: 13 });
  await seedCard(s, { id: 12, name: "*self", codename: "self", typeId: 14 });
  await seedCard(s, { id: 13, name: "*set", codename: "set", typeId: 13 });
  await seedCard(s, { id: 14, name: "*setting", codename: "setting", typeId: 14 });
  await seedCard(s, { id: 15, name: "*input_type", codename: "input_type", typeId: 14 });
  await seedCard(s, { id: 16, name: "*content_options", codename: "content_options", typeId: 14 });
  await seedCard(s, { id: 17, name: "by name", codename: "by_name", typeId: 2 });
  await seedCard(s, { id: 4, name: "List", codename: "list", typeId: 2 });
  await seedCard(s, { id: 56, name: "Pointer", codename: "pointer", typeId: 2 });
  await seedCard(s, { id: 57, name: "Nest list", codename: "nest_list", typeId: 2 });
  await seedCard(s, { id: 58, name: "Link list", codename: "link_list", typeId: 2 });
  await seedCard(s, { id: 100, name: "Oracle Probe Child", dbContent: "probe item body" });
  await seedCard(s, {
    id: 101,
    name: "Oracle List Probe",
    typeId: 4,
    dbContent: "Oracle Probe Child\nOracle Probe Wanted",
  });
  await seedCard(s, {
    id: 102,
    name: "Oracle Pointer Probe",
    typeId: 56,
    dbContent: "Oracle Probe Child\nSecond Item",
  });
  await seedCard(s, { id: 103, name: "Oracle Radio Probe", typeId: 56, dbContent: "Option One" });
  await seedCard(s, { id: 110, leftId: 103, rightId: 12, typeId: 13 });
  await seedCard(s, { id: 111, leftId: 110, rightId: 15, typeId: 14, dbContent: "radio" });
  await seedCard(s, {
    id: 112,
    leftId: 110,
    rightId: 16,
    typeId: 4,
    dbContent: "Option One\nOption Two",
  });

  // ---- the checkbox probes (ids 130+) ---------------------------------
  // probe 1: selects "Option One", which the options card lists
  await seedCard(s, {
    id: 130,
    name: "Oracle Checkbox Probe",
    typeId: 56,
    dbContent: "Option One",
  });
  await seedCard(s, { id: 131, leftId: 130, rightId: 12, typeId: 13 });
  await seedCard(s, { id: 132, leftId: 131, rightId: 15, typeId: 14, dbContent: "checkbox" });
  await seedCard(s, {
    id: 133,
    leftId: 131,
    rightId: 16,
    typeId: 4,
    dbContent: "Option One\nOption Two",
  });
  // probe 2: selects an item the options card does NOT list (the union arm)
  await seedCard(s, {
    id: 134,
    name: "Oracle Checkbox Union Probe",
    typeId: 56,
    dbContent: "Option Three",
  });
  await seedCard(s, { id: 135, leftId: 134, rightId: 12, typeId: 13 });
  await seedCard(s, { id: 136, leftId: 135, rightId: 15, typeId: 14, dbContent: "checkbox" });
  await seedCard(s, { id: 137, leftId: 135, rightId: 16, typeId: 4, dbContent: "Option One" });
  // probe 3: its option card EXISTS (option_label_text's nest arm)
  await seedCard(s, { id: 138, name: "Option Real", typeId: 2, dbContent: "a real card" });
  await seedCard(s, {
    id: 139,
    name: "Oracle Checkbox Real Option",
    typeId: 56,
    dbContent: "Option Real",
  });
  await seedCard(s, { id: 140, leftId: 139, rightId: 12, typeId: 13 });
  await seedCard(s, { id: 141, leftId: 140, rightId: 15, typeId: 14, dbContent: "checkbox" });
  await seedCard(s, { id: 142, leftId: 140, rightId: 16, typeId: 4, dbContent: "Option Real" });
  // probe 4: no *content_options rule (the unported fallback walk)
  await seedCard(s, {
    id: 143,
    name: "Oracle Checkbox Orphan",
    typeId: 56,
    dbContent: "Option One",
  });
  await seedCard(s, { id: 144, leftId: 143, rightId: 12, typeId: 13 });
  await seedCard(s, { id: 145, leftId: 144, rightId: 15, typeId: 14, dbContent: "checkbox" });
  // probe 5: a Nest list card — :checkbox lives on Abstract::List only
  await seedCard(s, {
    id: 146,
    name: "Oracle Checkbox Nest Probe",
    typeId: 57,
    dbContent: "{{Option One}}",
  });
}

beforeAll(async () => {
  storage = await createRenderTestStorage();
  await seedCheckboxDeck(storage);
  loader = new ModLoader([{ manifest: cardModList }]);
  loader.load();
  bindModLoaderToEngine(storage!, loader!);
  // the loader's install step (the committed list suite's line 177): the
  // view registry + rule machinery the *input_type lookup walks. Without it
  // every *input_type rule resolves to nothing and the :input dispatch
  // silently falls back to the default editor.
  await loader.installInto(modEngineHost(storage!.engine, storage!.fetcher));
}, 60_000);

afterAll(() => {
  loader?.reset();
  storage?.close();
});

/** The exact bytes :input produces for the seeded probe: the hidden content
 *  field (html_views.rb:32-34 `_render_hidden_content_field + super()`) then
 *  the checkbox editor - two options, "Option One" selected. unique_id
 *  (content.rb:60-70's chain-shared counter, ported as
 *  RenderFormat#uniqueId) is the render-scoped counter, so the group name
 *  is masked the way the capture scripts mask the random slot ids. */
function expectedInputBytes(groupId: string): string {
  return (
    `<input class="d0-card-content form-control" autocomplete="off" type="hidden" ` +
    `value="Option One" name="card[content]" id="card_content" />` +
    expectedCheckboxEditorBytes(groupId)
  );
}

/** The checkbox editor alone - what view :checkbox renders
 *  (`view(:checkbox) { send "checkbox_input" }`, no hidden field). */
function expectedCheckboxEditorBytes(groupId: string): string {
  return (
    `<div class='pointer-checkbox-list'>\n` +
    `<div class='pointer-checkbox'>\n` +
    `<input type="checkbox" name="pointer_checkbox-${groupId}" id="pointer-checkbox-option_one" ` +
    `value="Option One" class="pointer-checkbox-button" checked="checked" />\n` +
    `<label class="form-check-label" for="pointer-checkbox-option_one">Option One</label>\n` +
    `</div>\n` +
    `<div class='pointer-checkbox'>\n` +
    `<input type="checkbox" name="pointer_checkbox-${groupId}" id="pointer-checkbox-option_two" ` +
    `value="Option Two" class="pointer-checkbox-button" />\n` +
    `<label class="form-check-label" for="pointer-checkbox-option_two">Option Two</label>\n` +
    `</div>\n` +
    `</div>\n`
  );
}

/** The unique_id counter value in the rendered group name. */
function groupIdOf(html: string): string {
  const match = /name="pointer_checkbox-([^"]+)"/.exec(html);
  if (match === null) throw new Error(`no checkbox group name in: ${html}`);
  return match[1] as string;
}

describe("card-mod-list: the :checkbox editor (html_views.rb:50-52, :60-62)", () => {
  it("an *input_type rule naming checkbox dispatches the checkbox editor off :input", async () => {
    const html = await storage!.engine.render("Oracle Checkbox Probe", "input");
    expect(html).toBe(expectedInputBytes(groupIdOf(html)));
  });

  it(":checkbox is a registered view of the set module (html_views.rb:50-52's loop) and is the editor WITHOUT the hidden content field", async () => {
    const viaView = await storage!.engine.render("Oracle Checkbox Probe", "checkbox");
    // the two renders carry their own unique_id counter value; compare the
    // shapes with the group name masked.
    const mask = (s: string): string => s.replace(/pointer_checkbox-[^"]+/g, "pointer_checkbox-UID");
    expect(mask(viaView)).toBe(mask(expectedCheckboxEditorBytes("UID")));
    // and :input is exactly the hidden field + that editor
    const viaInput = await storage!.engine.render("Oracle Checkbox Probe", "input");
    expect(mask(viaInput.replace(/<input class="d0-card-content[^>]*\/>/, ""))).toBe(
      mask(viaView),
    );
  });

  it("every checkbox shares ONE group name per render (check_box_tag's name is unique_id, not per option)", async () => {
    const html = await storage!.engine.render("Oracle Checkbox Probe", "checkbox");
    const names = [...html.matchAll(/name="(pointer_checkbox-[^"]+)"/g)].map((m) => m[1]);
    expect(names).toHaveLength(2);
    expect(new Set(names).size).toBe(1);
  });

  it("the selected item is the checked one and the ids are the option names' keys", async () => {
    const html = await storage!.engine.render("Oracle Checkbox Probe", "checkbox");
    expect(html).toContain('id="pointer-checkbox-option_one" value="Option One" class="pointer-checkbox-button" checked="checked"');
    expect(html).toContain('id="pointer-checkbox-option_two" value="Option Two" class="pointer-checkbox-button" />');
  });

  it("options_hash unions the card's own selected items into the option list (options_api.rb:3-19)", async () => {
    // the union probe selects "Option Three", which the options card does
    // not list; it is still checked, and it comes AFTER the options card's
    // items (option_names = (standard_option_names + selected).uniq).
    const html = await storage!.engine.render("Oracle Checkbox Union Probe", "checkbox");
    const order = [...html.matchAll(/value="([^"]+)" class="pointer-checkbox-button/g)].map(
      (m) => m[1],
    );
    expect(order).toEqual(["Option One", "Option Three"]);
    expect(html).toContain('value="Option Three" class="pointer-checkbox-button" checked="checked"');
  });

  it("an option whose card EXISTS raises rather than rendering a guessed :smart_label nest (options_api.rb:79-85)", async () => {
    // the radio editor's boundary, carried to the checkbox arm: the nest
    // arm needs the content-option view dispatch, which is not ported.
    await expect(storage!.engine.render("Oracle Checkbox Real Option", "checkbox")).rejects.toThrow(
      /checkbox option labels for EXISTING cards nest :smart_label/,
    );
  });

  it("a checkbox probe with no *content_options rule raises (the options fallback walk is unported)", async () => {
    // the orphan probe is seeded in beforeAll (id 143; it has an
    // *input_type rule naming checkbox and NO *content_options rule)
    await expect(
      storage!.engine.render("Oracle Checkbox Orphan", "checkbox"),
    ).rejects.toThrow(/checkbox input without a \*content_options rule is not ported/);
  });

  it("the sibling list types still refuse :checkbox (the view lives on Abstract::List only)", async () => {
    // the Nest list probe is seeded in beforeAll (id 146)
    await expect(
      storage!.engine.render("Oracle Checkbox Nest Probe", "checkbox"),
    ).rejects.toThrow(UnsupportedViewError);
  });
});
