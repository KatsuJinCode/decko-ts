// The SELECT + MULTISELECT arms of the pointer/list editor (E12) - the two
// editors of card-mod-list's five-view loop that answer a loud "input editor
// not ported" error for an *input_type rule naming select/multiselect (the
// :checkbox arm was closed the same way by card-mod-list-checkbox-editor).
//
// Ruby truth under test
// ---------------------
// card-mod-list-0.20.0 set/abstract/01_list/html_views.rb:56-58
//   `%i[autocomplete checkbox radio select multiselect].each do |editor_view|
//      view(editor_view) { send "#{editor_view}_input" } end`
//   - :select and :multiselect are REAL views of this set module (the same
//   loop that makes :checkbox one), and editor.rb's
//   `try(input_method(input_type))` dispatch reaches them by name off :input.
//
// select_input (html_views.rb:72-75):
//   select_tag "pointer_select-#{unique_id}", select_input_options,
//              class: "pointer-select form-control"
// select_input_options (html_views.rb:109-112, private):
//   options = { "-- Select --" => "" }.merge card.options_hash
//   options_for_select options, card.first_name
// multiselect_input (html_views.rb:93-97):
//   select_tag "pointer_multiselect-#{unique_id}",
//              options_for_select(card.options_hash, card.item_names),
//              multiple: true, class: "pointer-multiselect form-control"
//
// options_hash - card-mod-layout-0.20.0 set/abstract/items/options_api.rb:3-17:
//   json_options? ? options_card.parse_content : option_hash_from_names, and
//   option_hash_from_names = option_names.each_with_object({}) { |name, hash|
//     hash[name] = name } - label == value == the option NAME; option_names =
//   (standard_option_names + item_names).uniq (:10-15). The json_options? arm
//   (a JSON-typed options card) is the checkbox port's own boundary too - the
//   walk here reads the *content_options rule card's items, and a MISSING
//   rule throws (the options_card fallback rule_card || right_type_options ||
//   Card[:all], options_api.rb:56-58, is the unported arm).
//
// select_tag - actionview-7.2.3.2 lib/action_view/helpers/form_tag_helper.rb:201-232:
//   html_name = (options[:multiple] == true && !name.end_with?("[]")) ?
//     "#{name}[]" : name; content_tag "select", option_tags,
//     { "name" => html_name, "id" => sanitize_to_id(name) }
//       .update(options.stringify_keys)
//   - SINGLE select: the base hash {name, id} is updated by {class} (a NEW
//   key, appended) -> attribute order name / id / class.
//   - MULTI select: options.stringify_keys = {multiple: true, class: ...};
//   the update APPENDS both new keys after the base's name/id -> attribute
//   order multiple / class / name / id, with name carrying the "[]" suffix.
//   "multiple" is in TagHelper::BOOLEAN_ATTRIBUTES (tag_helper.rb:21-31), so
//   it emits as the bare boolean form multiple="multiple".
// options_for_select - form_options_helper.rb:358-379: per element,
//   html_attributes[:selected] ||= option_value_selected?(value, selected)
//   BEFORE html_attributes[:value] = value (:369-371), and tag_options
//   (tag_helper.rb:261-305) emits hash-insertion order, skipping false
//   ("selected" is a BOOLEAN_ATTRIBUTES member -> skipped when false,
//   emitted selected="selected" when true). The gem's own rdoc example
//   shows `<option value="Free" selected="selected">` - the rdoc is STALE;
//   the sources emit selected BEFORE value.
//   selected arm: extract_selected_and_disabled(selected) -> Array.wrap ->
//   .map(&:to_s) (:812-820); option_value_selected? = Array(selected)
//   .include? value (:808-810) - exact string match against the option VALUE.
//
// NO RENDERED BYTES EXIST, and why: no card in the reference deck carries an
// `*input_type` rule naming select or multiselect (the only input_type rule
// in db/development.sqlite3 is the empty set card id 149 - the checkbox
// suite's probe, read-only). The bytes below are pinned against the REAL
// ActionView 7.2.3.2 gems on disk
// (the local Ruby gems directory):
// the two select_tag shapes were DERIVED BY RUNNING the gems
// (options_for_select + select_tag, select_input_options' exact argument
// shapes), not hand-written - the run's output is the expected bytes with
// the unique_id counter masked.

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

/** The committed checkbox suite's seed deck VERBATIM
 *  (card-mod-list-checkbox-editor.test.ts:78-169 - the rule chain only
 *  resolves on the full deck) plus the select/multiselect probes on fresh
 *  ids: the same shape, with the *input_type rule reading select /
 *  multiselect. */
async function seedSelectDeck(s: RenderTestStorage): Promise<void> {
  await seedCard(s, { id: 2, name: "RichText" });
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: 13 });
  await seedCard(s, { id: 12, name: "*self", codename: "self", typeId: 14 });
  await seedCard(s, { id: 13, name: "*set", codename: "set", typeId: 13 });
  await seedCard(s, { id: 14, name: "*setting", codename: "setting", typeId: 14 });
  await seedCard(s, { id: 15, name: "*input_type", codename: "input_type", typeId: 14 });
  await seedCard(s, { id: 16, name: "*content_options", codename: "content_options", typeId: 14 });
  await seedCard(s, { id: 4, name: "List", codename: "list", typeId: 2 });
  await seedCard(s, { id: 56, name: "Pointer", codename: "pointer", typeId: 2 });
  await seedCard(s, { id: 57, name: "Nest list", codename: "nest_list", typeId: 2 });

  // ---- probe S1: select, one item selected (ids 150+) -----------------
  await seedCard(s, {
    id: 150,
    name: "Oracle Select Probe",
    typeId: 56,
    dbContent: "Option One",
  });
  await seedCard(s, { id: 151, leftId: 150, rightId: 12, typeId: 13 });
  await seedCard(s, { id: 152, leftId: 151, rightId: 15, typeId: 14, dbContent: "select" });
  await seedCard(s, {
    id: 153,
    leftId: 151,
    rightId: 16,
    typeId: 4,
    dbContent: "Option One\nOption Two",
  });

  // ---- probe S2: multiselect, union of options card + own items -------
  await seedCard(s, {
    id: 154,
    name: "Oracle Multiselect Probe",
    typeId: 56,
    dbContent: "Option Two\nOption Three",
  });
  await seedCard(s, { id: 155, leftId: 154, rightId: 12, typeId: 13 });
  await seedCard(s, { id: 156, leftId: 155, rightId: 15, typeId: 14, dbContent: "multiselect" });
  await seedCard(s, {
    id: 157,
    leftId: 155,
    rightId: 16,
    typeId: 4,
    dbContent: "Option One\nOption Two",
  });

  // ---- probe S3: select with no *content_options rule (the fallback
  //      walk boundary) --------------------------------------------------
  await seedCard(s, {
    id: 158,
    name: "Oracle Select Orphan",
    typeId: 56,
    dbContent: "Option One",
  });
  await seedCard(s, { id: 159, leftId: 158, rightId: 12, typeId: 13 });
  await seedCard(s, { id: 160, leftId: 159, rightId: 15, typeId: 14, dbContent: "select" });

  // ---- probe S4: a Nest list card - :select lives on Abstract::List only
  await seedCard(s, {
    id: 161,
    name: "Oracle Select Nest Probe",
    typeId: 57,
    dbContent: "{{Option One}}",
  });

  // ---- probe S5: an EMPTY pointer - first_name is nil, nothing selected
  await seedCard(s, {
    id: 162,
    name: "Oracle Select Empty Probe",
    typeId: 56,
    dbContent: "",
  });
  await seedCard(s, { id: 163, leftId: 162, rightId: 12, typeId: 13 });
  await seedCard(s, { id: 164, leftId: 163, rightId: 15, typeId: 14, dbContent: "select" });
  await seedCard(s, {
    id: 165,
    leftId: 163,
    rightId: 16,
    typeId: 4,
    dbContent: "Option One\nOption Two",
  });

  // ---- probe A1: autocomplete, one item (ids 170+) --------------------
  await seedCard(s, {
    id: 170,
    name: "Oracle Autocomplete Probe",
    typeId: 56,
    dbContent: "Option One",
  });
  await seedCard(s, { id: 171, leftId: 170, rightId: 12, typeId: 13 });
  await seedCard(s, { id: 172, leftId: 171, rightId: 15, typeId: 14, dbContent: "autocomplete" });
  await seedCard(s, {
    id: 173,
    leftId: 171,
    rightId: 16,
    typeId: 4,
    dbContent: "Option One\nOption Two",
  });

  // ---- probe A2: an EMPTY pointer - items_for_input's [""] fallback ----
  await seedCard(s, {
    id: 174,
    name: "Oracle Autocomplete Empty Probe",
    typeId: 56,
    dbContent: "",
  });
  await seedCard(s, { id: 175, leftId: 174, rightId: 12, typeId: 13 });
  await seedCard(s, { id: 176, leftId: 175, rightId: 15, typeId: 14, dbContent: "autocomplete" });
  await seedCard(s, {
    id: 177,
    leftId: 175,
    rightId: 16,
    typeId: 4,
    dbContent: "Option One\nOption Two",
  });
}

beforeAll(async () => {
  storage = await createRenderTestStorage();
  await seedSelectDeck(storage);
  loader = new ModLoader([{ manifest: cardModList }]);
  loader.load();
  bindModLoaderToEngine(storage!, loader!);
  await loader.installInto(modEngineHost(storage!.engine, storage!.fetcher));
}, 60_000);

afterAll(() => {
  loader?.reset();
  storage?.close();
});

/** The unique_id counter value in the rendered group name(s). The name
 *  attribute of a multiselect carries the [] SUFFIX (pointer_multiselect-3[]),
 *  the id attribute the bare name - both extracted here by matching up to
 *  the first quote-or-bracket. */
function groupIdOf(html: string, kind: "select" | "multiselect"): string {
  const match = new RegExp(`name="pointer_${kind}-([^"\\[\\]]+)`).exec(html);
  if (match === null) throw new Error(`no ${kind} group name in: ${html}`);
  return match[1] as string;
}

/** Mask the render-scoped unique_id counter so two renders compare equal. */
function maskUids(s: string): string {
  return s.replace(/pointer_(select|multiselect)-[^"[]+/g, "pointer_$1-UID");
}

/** The select editor alone - what view :select renders
 *  (html_views.rb:72-75 + :109-112; bytes DERIVED BY RUNNING the on-disk
 *  actionview-7.2.3.2 gems with this exact call shape). groupId is the
 *  render-scoped counter value. */
function expectedSelectEditorBytes(groupId: string): string {
  return (
    `<select name="pointer_select-${groupId}" id="pointer_select-${groupId}" ` +
    `class="pointer-select form-control">` +
    `<option value="">-- Select --</option>\n` +
    `<option selected="selected" value="Option One">Option One</option>\n` +
    `<option value="Option Two">Option Two</option></select>`
  );
}

/** The multiselect editor alone (html_views.rb:93-97; same derivation).
 *  The union: the options card's items then the card's own, uniq'd
 *  (options_api.rb:10-15); both own items carry selected="selected". */
function expectedMultiselectEditorBytes(groupId: string): string {
  return (
    `<select name="pointer_multiselect-${groupId}[]" id="pointer_multiselect-${groupId}" ` +
    `multiple="multiple" class="pointer-multiselect form-control">` +
    `<option value="Option One">Option One</option>\n` +
    `<option selected="selected" value="Option Two">Option Two</option>\n` +
    `<option selected="selected" value="Option Three">Option Three</option></select>`
  );
}

/** The empty-pointer select editor: first_name nil -> no selected arm. */
function expectedEmptySelectEditorBytes(groupId: string): string {
  return (
    `<select name="pointer_select-${groupId}" id="pointer_select-${groupId}" ` +
    `class="pointer-select form-control">` +
    `<option value="">-- Select --</option>\n` +
    `<option value="Option One">Option One</option>\n` +
    `<option value="Option Two">Option Two</option></select>`
  );
}

/** The hidden content field :input prepends (html_views.rb:32-34). */
function hiddenField(): string {
  return (
    `<input class="d0-card-content form-control" autocomplete="off" type="hidden" ` +
    `value="Option One" name="card[content]" id="card_content" />`
  );
}

describe("card-mod-list: the :select + :multiselect editors (html_views.rb:56-58, :72-75, :93-97)", () => {
  it("an *input_type rule naming select dispatches the select editor off :input", async () => {
    const html = await storage!.engine.render("Oracle Select Probe", "input");
    expect(html).toBe(`${hiddenField()}${expectedSelectEditorBytes(groupIdOf(html, "select"))}`);
  });

  it(":select is a registered view of the set module (html_views.rb:56-58's loop) and is the editor WITHOUT the hidden content field", async () => {
    const viaView = await storage!.engine.render("Oracle Select Probe", "select");
    expect(viaView).toBe(expectedSelectEditorBytes(groupIdOf(viaView, "select")));
    const viaInput = await storage!.engine.render("Oracle Select Probe", "input");
    expect(maskUids(viaInput.replace(/<input class="d0-card-content[^>]*\/>/, ""))).toBe(
      maskUids(viaView),
    );
  });

  it("the select bytes carry the derived attribute orders: name/id/class, then the blank option, selected BEFORE value (the gem rdoc is stale)", async () => {
    const html = await storage!.engine.render("Oracle Select Probe", "select");
    expect(html).toBe(expectedSelectEditorBytes(groupIdOf(html, "select")));
    expect(html.startsWith(`<select name="pointer_select-`)).toBe(true);
    expect(html).toContain(`<option value="">-- Select --</option>`);
    expect(html).toContain(`<option selected="selected" value="Option One">Option One</option>`);
  });

  it("an *input_type rule naming multiselect dispatches the multiselect editor, with the [] name suffix and the boolean multiple attribute", async () => {
    const viaInput = await storage!.engine.render("Oracle Multiselect Probe", "input");
    const groupId = groupIdOf(viaInput, "multiselect");
    expect(viaInput.endsWith(expectedMultiselectEditorBytes(groupId))).toBe(true);
    const viaView = await storage!.engine.render("Oracle Multiselect Probe", "multiselect");
    expect(viaView).toBe(expectedMultiselectEditorBytes(groupIdOf(viaView, "multiselect")));
  });

  it("multiselect selects every own item, including one the options card does not list (options_api.rb:10-15 union)", async () => {
    const html = await storage!.engine.render("Oracle Multiselect Probe", "multiselect");
    const order = [...html.matchAll(/<option( selected="selected")? value="([^"]+)">/g)].map(
      (m) => m[2],
    );
    expect(order).toEqual(["Option One", "Option Two", "Option Three"]);
    expect(html).toContain(`<option selected="selected" value="Option Two">Option Two</option>`);
    expect(html).toContain(
      `<option selected="selected" value="Option Three">Option Three</option>`,
    );
  });

  it("an EMPTY pointer renders the select with nothing selected (first_name nil)", async () => {
    const html = await storage!.engine.render("Oracle Select Empty Probe", "select");
    expect(html).toBe(expectedEmptySelectEditorBytes(groupIdOf(html, "select")));
    expect(html).not.toContain(`selected="selected"`);
  });

  it("a select probe with no *content_options rule falls back to the *all card's items plus its own (options_api.rb:47-49)", async () => {
    // probe S3 (ids 158-160): an *input_type rule naming select and NO
    // *content_options rule. The chain's last arm is Card[:all]; the seed
    // deck's *all has no items, so the union arm supplies the card's own
    // selected "Option One" alone - the same fallback shape the checkbox
    // orphan probe pins (the options walk landed; the loud boundary is
    // gone).
    const html = await storage!.engine.render("Oracle Select Orphan", "select");
    expect(html).toBe(
      `<select name="pointer_select-oracle_select_orphan-1" id="pointer_select-oracle_select_orphan-1" ` +
        `class="pointer-select form-control">` +
        `<option value="">-- Select --</option>\n` +
        `<option selected="selected" value="Option One">Option One</option></select>`,
    );
  });

  it("the sibling list types still refuse :select (the view lives on Abstract::List only)", async () => {
    // probe S4 (id 161): a Nest list card
    await expect(
      storage!.engine.render("Oracle Select Nest Probe", "select"),
    ).rejects.toThrow(UnsupportedViewError);
  });

  // ---------------------------------------------------------------------
  // The :autocomplete arm (html_views.rb:56-58's loop + :60-62
  // autocomplete_input -> card-mod-search set/all/autocomplete.rb:14-19
  // autocomplete_field -> haml :autocomplete_input - card-mod-search
  // set/all/autocomplete/autocomplete_input.haml, 3 lines:
  //     .pointer-list-editor.pointer-list-ul
  //       = text_field_tag 'pointer_item', item, class: "pointer-item-text
  //           form-control _autocomplete #{extra_classes}",
  //           "data-options-card": options_card, placeholder: placeholder_text
  //   The list-mod call passes items_for_input.first (:60-62) and the
  //   CONTENT OPTIONS card (options_card_name, options_api.rb:51-53 - not
  //   the search mod's hardcoded *all+by_name). placeholder_text is ""
  //   (card-mod-edit set/all/editor.rb:60-62); extra_classes is the default
  //   "" so the class value keeps its TRAILING SPACE. Bytes DERIVED BY
  //   RUNNING the on-disk haml-5.2.2 + actionview-7.2.3.2 gems with this
  //   exact template (the run's output, id-masked).
  // ---------------------------------------------------------------------
  it("an *input_type rule naming autocomplete dispatches the autocomplete editor off :input, and :autocomplete is the editor WITHOUT the hidden content field", async () => {
    const expectedEditor = (groupId: string): string =>
      `<div class='pointer-list-editor pointer-list-ul'>\n` +
      `<input type="text" name="pointer_item" id="pointer_item" value="Option One" ` +
      `class="pointer-item-text form-control _autocomplete " ` +
      `data-options-card="${groupId}" placeholder="" />\n` +
      `</div>\n`;
    const viaInput = await storage!.engine.render("Oracle Autocomplete Probe", "input");
    const dataCard = /data-options-card="([^"]+)"/.exec(viaInput)![1];
    // options_card_name = options_card&.name&.url_key (options_api.rb:51-53):
    // the RULE CARD's url_key. Ruby's rule_card(:content_options) finds the
    // *self-set rule junction, and url_key (cardname-0.20.0
    // variants.rb:8-13) KEEPS CASE - no downcase, spaces to underscores
    // (the same url_key the oracle's own href="/User" bytes carry).
    expect(dataCard).toBe("Oracle_Autocomplete_Probe+*self+*content_options");
    expect(viaInput.startsWith(`<input class="d0-card-content form-control"`)).toBe(true);
    expect(viaInput.endsWith(expectedEditor(dataCard))).toBe(true);
    const viaView = await storage!.engine.render("Oracle Autocomplete Probe", "autocomplete");
    expect(viaView).toBe(expectedEditor("Oracle_Autocomplete_Probe+*self+*content_options"));
  });

  it("an EMPTY pointer's autocomplete editor carries the blank items_for_input fallback value", async () => {
    // items_for_input (html_views.rb:115-118): empty item_names -> [""],
    // so text_field_tag's value renders empty, not absent
    const html = await storage!.engine.render("Oracle Autocomplete Empty Probe", "autocomplete");
    expect(html).toBe(
      `<div class='pointer-list-editor pointer-list-ul'>\n` +
        `<input type="text" name="pointer_item" id="pointer_item" value="" ` +
        `class="pointer-item-text form-control _autocomplete " ` +
        `data-options-card="Oracle_Autocomplete_Empty_Probe+*self+*content_options" placeholder="" />\n` +
        `</div>\n`,
    );
  });
});
