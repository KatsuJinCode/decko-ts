// The RULE TYPE CHANGE pin (registry row cap-E14, "Edit type for a rule": a
// rule card's type can be changed in the board's Rules tab).
//
// ORACLE-PINNED: fixtures/captured/edit-type-for-rule.json, captured from
// the pinned gemset (card-mod-rules-0.20.0, card-mod-content-0.20.0,
// card-1.110.0) by tests/card/mod-loader/oracle-capture-edit-type-for-rule.rb.
//
// What the contract is, in the pinned bytes:
//
//   1. card-mod-rules-0.20.0 set/rule/editor.rb - the RULE EDITOR half:
//      rules_type_formgroup is `return unless card.right.rule_type_editable`
//      then `wrap_type_formgroup do type_field(href: path(mark: success[:id],
//      view: :rule_form_card_editor, assign: true), class: "type-field
//      rule-type-field _live-type-field", "data-remote" => true) end`.
//   2. card-mod-rules-0.20.0 set/rule/rule_form.rb - the FORM half: the
//      :rule_form_card_editor view renders [rules_type_formgroup,
//      rule_content_formgroup] inside the "card-editor slotter" wrap.
//   3. card-mod-rules-0.20.0 set/all/cardtype_groups.rb - the GROUP TABLE:
//      GROUP is the cardtype groups the select lists, GROUP_MAP is the group
//      each cardtype belongs to, and custom_types is the createable types
//      NOT in GROUP_MAP.
//   4. card-mod-content-0.20.0 set/right/default.rb - the *default RULE's
//      group override (GROUP.slice("Text",  "Data", "Upload") with Organize
//      replaced) and the quick form's own type field.
//   5. card-mod-content-0.20.0 set/right/structure.rb - the *structure
//      RULE's group override (GROUP.slice("Text") with Organize replaced).
//   6. card-1.110.0 mod/core/set/all/type.rb - the STORE: `type=` turns the
//      chosen NAME into the type id, `type_id=` writes it, and
//      extract_type_id! reads the request's own `:type` arg.
//
// The port side is the rules mod
// (src/card/mod-loader/mods/card-mod-rules.ts) for the rule editor's type
// formgroup and its group overrides, the edit mod
// (src/card/mod-loader/mods/card-mod-edit.ts) for the shared select, the
// write route (src/server/write-routes.ts) for the request's card hash, and
// the action engine's type resolution
// (src/card/actions/type-resolution.ts) for the name-to-id store.
//
// The third leg is the harness's own E14 check, which must grade the STORED
// type_id of the RULE card against the chosen type's id, so it cannot pass
// on a form that merely renders a select.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const capture = JSON.parse(
  readFileSync(
    new URL("./../../../fixtures/captured/edit-type-for-rule.json", import.meta.url),
    "utf8",
  ),
);
const portRules = readFileSync(
  new URL(
    "./../../../src/card/mod-loader/mods/card-mod-rules.ts",
    import.meta.url,
  ),
  "utf8",
);
const portEdit = readFileSync(
  new URL(
    "./../../../src/card/mod-loader/mods/card-mod-edit.ts",
    import.meta.url,
  ),
  "utf8",
);
const typeResolution = readFileSync(
  new URL(
    "./../../../src/card/actions/type-resolution.ts",
    import.meta.url,
  ),
  "utf8",
);
const writeRoutes = readFileSync(
  new URL("./../../../src/server/write-routes.ts", import.meta.url),
  "utf8",
);
const coverB = readFileSync(
  new URL(
    "./../../../tools/edge-signed-in-exercise/checks-cover-b.mjs",
    import.meta.url,
  ),
  "utf8",
);

describe("the pinned Ruby's own bytes for the rule type change", () => {
  it("the rule editor owns the type field and its gate", () => {
    expect(capture.facts.rules_type_formgroup_guard).toBe(
      "return unless card.right.rule_type_editable",
    );
    expect(capture.facts.rules_type_formgroup_href).toBe(
      "href: path(mark: success[:id], view: :rule_form_card_editor, assign: true),",
    );
    expect(capture.facts.rules_type_formgroup_class).toBe(
      'class: "type-field rule-type-field _live-type-field",',
    );
    expect(capture.facts.rules_type_formgroup_data_remote).toBe(
      '"data-remote" => true',
    );
  });

  it("the rule form owns the editor body", () => {
    expect(capture.facts.rule_form_card_editor_view).toBe(
      "view :rule_form_card_editor, cache: :never, unknown: true do",
    );
    expect(capture.facts.rule_form_card_editor_body).toBe(
      "rules_type_formgroup,\n        rule_content_formgroup",
    );
    expect(capture.facts.rule_form_card_editor_wrap).toBe(
      'wrap true, class: "card-editor slotter" do',
    );
  });

  it("the group table owns the listed groups and the custom arm", () => {
    expect(capture.facts.group_text).toBe(
      '"Text" => %w[RichText PlainText Markdown Phrase HTML]',
    );
    expect(capture.facts.group_data).toBe(
      '"Data" => %w[Number Toggle Date URI]',
    );
    expect(capture.facts.group_organize).toBe(
      '"Organize" => ["List", "Pointer", "Search", "Link list", "Nest list"]',
    );
    expect(capture.facts.group_map).toBe(
      "GROUP_MAP = GROUP.each_with_object({}) do |(cat, types), h|",
    );
    expect(capture.facts.custom_types).toBe(
      "custom_types << type unless All::CardtypeGroups::GROUP_MAP[type]",
    );
  });

  it("the right-set overrides own the rule-specific groups", () => {
    expect(capture.facts.default_visible_cardtype_groups).toBe(
      'hash = All::CardtypeGroups::GROUP.slice("Text",  "Data", "Upload")',
    );
    expect(capture.facts.default_organize).toBe(
      'hash["Organize"] = ["List", "Pointer", "Link list", "Nest list"]',
    );
    expect(capture.facts.default_quick_editor_type_field).toBe(
      'type_field class: "type-field rule-type-field _submit-on-select"',
    );
    expect(capture.facts.structure_visible_cardtype_groups).toBe(
      'hash = All::CardtypeGroups::GROUP.slice("Text")',
    );
    expect(capture.facts.structure_organize).toBe(
      'hash["Organize"] = ["Search", "Nest list"]',
    );
  });

  it("the store owns the name-to-id write", () => {
    expect(capture.facts.type_setter).toBe(
      "self.type_id = type_name.card_id",
    );
    expect(capture.facts.type_id_setter).toBe(
      "write_card_or_id :type_id, card_or_id",
    );
    expect(capture.facts.extract_type_id_type_arm).toBe(
      "when (type_name = args.delete :type)",
    );
    expect(capture.facts.type_id_from_cardname).toBe(
      "type_id_or_error(type_name) { type_name.card_id }",
    );
  });

  it("the capture names the gemset it photographed", () => {
    expect(capture.oracle.rules_type_formgroup.gem).toBe("card-mod-rules-0.20.0");
    expect(capture.oracle.right_default_groups.gem).toBe(
      "card-mod-content-0.20.0",
    );
    expect(capture.oracle.type_store.gem).toBe("card-1.110.0");
    expect(capture.oracle.rules_type_formgroup.file_sha256).toMatch(
      /^[0-9a-f]{64}$/,
    );
  });
});

describe("the port carries the pinned bytes", () => {
  it("the port's rule editor gates on rule_type_editable the way the pinned one does", () => {
    expect(portRules).toContain(
      "if (registry === undefined || !registry.ruleTypeEditable) return undefined;",
    );
    expect(portRules).toContain(
      "const href = `/${ctx.fmt.urlKey()}/rule_form_card_editor?assign=true&mark=`;",
    );
    expect(portRules).toContain(
      'cls: "type-field rule-type-field _live-type-field",',
    );
    expect(portRules).toContain("groups: ruleTypeGroups(setting),");
    expect(portRules).toContain("hrefFirst: true,");
  });

  it("the port's rule group overrides carry the pinned groups", () => {
    expect(portRules).toContain(
      'if (setting === "default") return RIGHT_DEFAULT_CARDTYPE_GROUPS;',
    );
    expect(portRules).toContain(
      'if (setting === "structure") return RIGHT_STRUCTURE_CARDTYPE_GROUPS;',
    );
    expect(portRules).toContain(
      'if (setting === "content_options") return { Organize: ["List", "Pointer", "Search"] };',
    );
    expect(portRules).toContain(
      'Organize: ["List", "Pointer", "Link list", "Nest list"],',
    );
    expect(portRules).toContain('Organize: ["Search", "Nest list"],');
  });

  it("the port renders the rule's type select in the pinned attribute order", () => {
    expect(portEdit).toContain(
      '`<select name="card[type]" id="card_type"${href} class="${classBase} form-control"`',
    );
  });

  it("the port's store turns the chosen type name into the type id", () => {
    expect(typeResolution).toContain(
      "const id = await fetcher.lexicon.id(DeckoName.parse(spec.typeName as Nameish).key);",
    );
  });

  it("the port's write route passes the request's own card[type]", () => {
    expect(writeRoutes).toContain('typeName: card["type"],');
  });
});

describe("the harness's E14 check cannot pass vacuously", () => {
  it("records under the row's exact check name", () => {
    expect(coverB).toContain(
      "E14 a rule card's type can be changed in the board's Rules tab (the write answers 200)",
    );
  });

  it("grades the STORED type_id of the RULE card against the chosen type's id", () => {
    expect(coverB).toContain(
      "write !== undefined && write.status < 400 && stored?.type_id === expected.id,",
    );
    expect(coverB).toContain(
      'const expected = fixtureType(ctx.database(), "PlainText");',
    );
  });
});

describe("the capture lives where the rig writes it", () => {
  it("the fixture file is on disk at the path the rig names", () => {
    expect(capture.contract).toContain("stored type becomes");
    expect(
      readFileSync(
        repoRoot + "fixtures/captured/edit-type-for-rule.json",
        "utf8",
      ),
    ).toContain('"rules_type_formgroup_guard"');
  });
});
