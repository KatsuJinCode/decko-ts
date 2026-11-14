// The view :input remainder arms (card-mod-edit-0.20.0 set/all/editor.rb) —
// built on the same seam card-mod-ace-editor-input.test.ts covers:
//
// 1. input_type_from_rule (editor.rb:9-11) —
//    `card.rule(:input_type)&.gsub(/[\[\]]/, "")&.tr(" ", "_")`: the
//    *input type rule read is card.rule (card-1.110.0 lib/card/rule/all.rb:
//    5-7 `rule_card(setting_code, skip_modules: true)&.db_content`), the
//    set-candidates walk in pattern precedence (rule/all.rb:13-15, 66-73 —
//    self before type before *all; first existing candidate wins), with NO
//    ok?(:read) check; the transform strips [ ] then underscores spaces.
//    The *input type rule options are the list_input_options basket
//    (editor.rb:1-2 "text area"/"text field"; card-mod-ace_editor
//    set/all/ace_editor.rb:1 "ace editor"; card-mod-tinymce_editor
//    set/all/tinymce_editor.rb:2 "tinymce editor").
// 2. hidden_input (editor.rb:55-57) — `hidden_field :content, class:
//    classy("d0-card-content")`: hidden_field is the FIRST FIELD_HELPERS
//    entry (card-mod-bootstrap set/all/bootstrap/form.rb:1-4) whose
//    bootstrap_options appends " form-control" (:22-26); hidden_field_tag
//    (actionview-7.2.3.2 lib/action_view/helpers/form_tag_helper.rb:309-311)
//    is `text_field_tag(name, value, options.merge(type: :hidden,
//    autocomplete: "off"))` — caller opts first, generated attrs after
//    (the attribute order form.rb:27-31 emits).
// 3. input_defined_by_card (editor.rb:18-30) — `with_card input_type do
//    |input_card| nest input_card, view: :core end`; with_card (:25-30) is
//    `card = Card[mark]; yield card if card` rescuing
//    Card::Error::CodenameNotFound -> nil. The mark is the transformed
//    input_type string — a NAME lookup (the key "custom_input_card" finds
//    a card named "Custom Input Card").
//
// All three arms are FIXTURE-LESS: no rendered body exists for
// them — every recorded :input render goes through the rich_text/ace arms
// or the tinymce arm, and no seeded card carries an *input type rule. The
// bytes below are gem-source-derived, cited per test.
//
// try-chain order (editor.rb:32-36): try(input_method(input_type)) ||
// input_defined_by_card || send(input_method(default_input_type)) — a
// rule value whose "#{value}_input" method exists never reaches
// input_defined_by_card, and a value with neither a method nor a card
// falls to the default_input_type :rich_text arm (:38-40).

import { describe, expect, it, beforeAll, afterAll } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import { ModLoader, modEngineHost } from "../../../src/card/mod-loader.js";
import cardModEdit, {
  inputTypeFromRule,
} from "../../../src/card/mod-loader/mods/card-mod-edit.js";

let storage: RenderTestStorage | undefined;
let loader: ModLoader | undefined;

beforeAll(async () => {
  const s = await createRenderTestStorage();
  storage = s;
  // codename cards (the codename registry reads cards.codename; their type
  // ids follow the card-mod-help.test.ts fixture: *set-typed 13,
  // *setting-typed 14).
  await seedCard(s, { id: 2, name: "RichText", codename: "rich_text" });
  await seedCard(s, { id: 9, name: "Cardtype", codename: "cardtype", typeId: 9 });
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: 13 });
  await seedCard(s, { id: 11, name: "*self", codename: "self", typeId: 14 });
  await seedCard(s, { id: 12, name: "*type", codename: "type", typeId: 13 });
  await seedCard(s, { id: 13, name: "*set", codename: "set", typeId: 13 });
  await seedCard(s, { id: 14, name: "*setting", codename: "setting", typeId: 14 });
  await seedCard(s, { id: 67, name: "*input type", codename: "input_type", typeId: 14 });
  await seedCard(s, { id: 51, name: "HTML", codename: "html", typeId: 9 });
  // the probe cards (RichText = the default type id 2)
  await seedCard(s, { id: 101, name: "Hidden Rule Card", dbContent: "secret body" });
  await seedCard(s, { id: 102, name: "Area Rule Card", dbContent: "area body" });
  await seedCard(s, { id: 103, name: "Field Rule Card", dbContent: "field body" });
  await seedCard(s, { id: 104, name: "Bogus Rule Card", dbContent: "bogus body" });
  await seedCard(s, { id: 105, name: "Custom Input Card", dbContent: "custom input body" });
  await seedCard(s, { id: 106, name: "Custom Rule Card", dbContent: "custom rule body" });
  await seedCard(s, { id: 107, name: "Ace Html Card", typeId: 51, dbContent: "<p>html body</p>" });
  await seedCard(s, { id: 108, name: "Voo Host Card", dbContent: "{{Input Rule Field|view:input}}" });
  await seedCard(s, { id: 109, name: "Input Rule Field", dbContent: "nested body" });
  // the set junctions ("X+*self", "HTML+*type") — set-typed 13
  await seedCard(s, { id: 121, leftId: 101, rightId: 11, typeId: 13 });
  await seedCard(s, { id: 122, leftId: 102, rightId: 11, typeId: 13 });
  await seedCard(s, { id: 123, leftId: 103, rightId: 11, typeId: 13 });
  await seedCard(s, { id: 124, leftId: 104, rightId: 11, typeId: 13 });
  await seedCard(s, { id: 125, leftId: 106, rightId: 11, typeId: 13 });
  await seedCard(s, { id: 126, leftId: 51, rightId: 12, typeId: 13 });
  await seedCard(s, { id: 127, leftId: 109, rightId: 11, typeId: 13 });
  // the *input type rule cards (editor.rb:9 card.rule(:input_type)) —
  // setting-typed 14; dbContent is the raw rule content the transform reads
  await seedCard(s, { id: 201, leftId: 121, rightId: 67, typeId: 14, dbContent: "[[hidden]]" });
  await seedCard(s, { id: 202, leftId: 122, rightId: 67, typeId: 14, dbContent: "[[text area]]" });
  await seedCard(s, { id: 203, leftId: 123, rightId: 67, typeId: 14, dbContent: "text field" });
  await seedCard(s, { id: 204, leftId: 124, rightId: 67, typeId: 14, dbContent: "bogus widget" });
  await seedCard(s, { id: 205, leftId: 125, rightId: 67, typeId: 14, dbContent: "[[custom input card]]" });
  await seedCard(s, { id: 206, leftId: 126, rightId: 67, typeId: 14, dbContent: "[[hidden]]" });
  await seedCard(s, { id: 209, leftId: 127, rightId: 67, typeId: 14, dbContent: "[[hidden]]" });
  s.fetcher.installNameEnvironment();
  await s.fetcher.codenames.ensureLoaded();
  loader = new ModLoader([{ manifest: cardModEdit }]);
  loader.load();
  await loader.installInto(modEngineHost(s.engine, s.fetcher));
}, 60_000);

afterAll(() => {
  loader?.reset();
  storage?.close();
});

describe("inputTypeFromRule — editor.rb:9-11's transform, in isolation", () => {
  it("bracketed basket values transform: [[text area]] -> text_area (editor.rb:1-2)", () => {
    expect(inputTypeFromRule("[[text area]]")).toBe("text_area");
  });

  it("case is preserved (Ruby's respond_to? on 'X_input' is case-sensitive)", () => {
    expect(inputTypeFromRule("[[Ace Editor]]")).toBe("Ace_Editor");
  });

  it("a bracketless rule content still underscores spaces (gsub then tr)", () => {
    expect(inputTypeFromRule("text field")).toBe("text_field");
  });

  it("every bracket goes, not just wrapping pairs (gsub /[[\\]]/ is global)", () => {
    expect(inputTypeFromRule("[a]b [c]d")).toBe("ab_cd");
  });

  it("no rule card -> rule's nil -> undefined (rule/all.rb:5-7 &.db_content)", () => {
    expect(inputTypeFromRule(undefined)).toBeUndefined();
  });

  it("an empty rule content stays empty (input_method '' -> '_input', respond_to? false)", () => {
    expect(inputTypeFromRule("")).toBe("");
  });

  it("'hidden' passes through (the value whose hidden_input method exists)", () => {
    expect(inputTypeFromRule("hidden")).toBe("hidden");
  });
});

describe("view :input — the rule arm through the walk (editor.rb:9-11 + 32-36)", () => {
  it("a *self+*input type rule of [[hidden]] renders the hidden_input arm byte-exact (editor.rb:55-57)", async () => {
    const html = await storage!.engine.render("Hidden Rule Card", "input");
    expect(html).toBe(
      '<input class="d0-card-content form-control" autocomplete="off" type="hidden"' +
        ' value="secret body" name="card[content]" id="card_content" />',
    );
  });

  it("[[text area]] reaches the text_area_input arm (editor.rb:46-49) with the type code", async () => {
    const html = await storage!.engine.render("Area Rule Card", "input");
    expect(html).toBe(
      '<textarea rows="5" class="d0-card-content form-control" data-card-type-code="rich_text"' +
        ' name="card[content]" id="card_content">\narea body</textarea>',
    );
  });

  it("a bracketless rule value transforms the same way (gsub then tr are independent)", async () => {
    const html = await storage!.engine.render("Field Rule Card", "input");
    expect(html).toBe(
      '<input class="d0-card-content form-control" placeholder="" type="text"' +
        ' value="field body" name="card[content]" id="card_content" />',
    );
  });

  it("a rule value with no method and no card falls to the default rich_text arm (editor.rb:32-36's last send)", async () => {
    const html = await storage!.engine.render("Bogus Rule Card", "input");
    // the id is content.rb:69 "#{card.name.safe_key}-#{id_counter}" - the
    // engine's safe_key singularizes ("Bogus" -> "bogu"), the same shape
    // the content-inputs oracle ids show
    expect(html).toBe(
      '<textarea rows="3" class="tinymce-textarea d0-card-content form-control"' +
        ' id="bogu_rule_card-1" name="card[content]">\nbogus body</textarea>',
    );
  });

  it("the TYPE-set override shadows the rule (html.rb:19-21 overrides the whole input_type method)", async () => {
    // "Ace Html Card+*type+*input type" says [[hidden]]; the html MRO
    // override never reads the rule — the ace arm renders
    const html = await storage!.engine.render("Ace Html Card", "input");
    expect(html).toBe(
      '<textarea rows="5" class="d0-card-content ace-editor-textarea form-control"' +
        ' data-ace-mode="html" name="card[content]" id="card_content">\n' +
        "&lt;p&gt;html body&lt;/p&gt;</textarea>",
    );
  });

  it("the rule arm fires through a content nest too (the nested render reaches the same view)", async () => {
    const html = await storage!.engine.render("Voo Host Card", "core");
    expect(html).toContain(
      '<input class="d0-card-content form-control" autocomplete="off" type="hidden"',
    );
  });
});

describe("view :input — input_defined_by_card (editor.rb:18-30)", () => {
  it("a rule value naming an existing card nests that card's :core (with_card + nest)", async () => {
    // "[[custom input card]]" -> input_type "custom_input_card" -> the mark
    // fetch finds "Custom Input Card" by key; try("custom_input_card_input")
    // missed first (no such method). The nested :core of a bare RichText
    // card is the processed body verbatim (the nest composition rides the
    // guide-pinned nest seam, card-mod-edit.ts guideText's shape).
    const html = await storage!.engine.render("Custom Rule Card", "input");
    expect(html).toBe("custom input body");
  });

  it("the mark fetch is a NAME lookup: the underscored key finds the spaced name", async () => {
    // Ruby Card["custom_input_card"] keys identically to "Custom Input Card"
    // — this is the same lookup the previous test rode; pinned here through
    // the direct fetch the arm uses (with_card's Card[mark], :25-30)
    const record = storage!.engine.fetchRenderCard("custom_input_card");
    expect(record?.key).toBe("custom_input_card");
    expect(record?.name.s).toBe("Custom Input Card");
  });
});

describe("view :input — the walk's specificity (rule/all.rb:66-73, own storage)", () => {
  let allStorage: RenderTestStorage | undefined;
  let allLoader: ModLoader | undefined;

  beforeAll(async () => {
    const s = await createRenderTestStorage();
    allStorage = s;
    await seedCard(s, { id: 2, name: "RichText", codename: "rich_text" });
    await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: 13 });
    await seedCard(s, { id: 11, name: "*self", codename: "self", typeId: 14 });
    await seedCard(s, { id: 13, name: "*set", codename: "set", typeId: 13 });
    await seedCard(s, { id: 14, name: "*setting", codename: "setting", typeId: 14 });
    await seedCard(s, { id: 67, name: "*input type", codename: "input_type", typeId: 14 });
    // the *all+*input type rule — the WIDEST candidate
    await seedCard(s, { id: 210, leftId: 10, rightId: 67, typeId: 14, dbContent: "[[text field]]" });
    await seedCard(s, { id: 301, name: "All Only Card", dbContent: "all body" });
    await seedCard(s, { id: 302, name: "Self Beats All Card", dbContent: "sba body" });
    await seedCard(s, { id: 303, leftId: 302, rightId: 11, typeId: 13 });
    await seedCard(s, { id: 304, leftId: 303, rightId: 67, typeId: 14, dbContent: "[[text area]]" });
    s.fetcher.installNameEnvironment();
    await s.fetcher.codenames.ensureLoaded();
    allLoader = new ModLoader([{ manifest: cardModEdit }]);
    allLoader.load();
    await allLoader.installInto(modEngineHost(s.engine, s.fetcher));
  }, 60_000);

  afterAll(() => {
    allLoader?.reset();
    allStorage?.close();
  });

  it("a card with no closer rule reads the *all rule (the widest candidate)", async () => {
    const html = await allStorage!.engine.render("All Only Card", "input");
    expect(html).toBe(
      '<input class="d0-card-content form-control" placeholder="" type="text"' +
        ' value="all body" name="card[content]" id="card_content" />',
    );
  });

  it("the self candidate precedes *all (first existing candidate wins)", async () => {
    const html = await allStorage!.engine.render("Self Beats All Card", "input");
    expect(html).toBe(
      '<textarea rows="5" class="d0-card-content form-control" data-card-type-code="rich_text"' +
        ' name="card[content]" id="card_content">\nsba body</textarea>',
    );
  });
});
