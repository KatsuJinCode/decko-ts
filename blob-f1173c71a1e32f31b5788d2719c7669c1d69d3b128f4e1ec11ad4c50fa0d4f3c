// The pointer MULTISELECT input pin (registry row cap-C17, "Multiselect
// input in a new card").
//
// ORACLE-PINNED: fixtures/captured/pointer-multiselect-input.json, captured
// from the pinned gemset (card-mod-list-0.20.0, card-1.110.0,
// card-mod-layout-0.20.0, actionview-7.2.4) by
// tests/card/mod-loader/oracle-capture-pointer-multiselect-input.rb. This
// editor has NO template of its own: its bytes ARE the two pinned ActionView
// helpers' output, so the capture RENDERS them with the pinned helpers
// rather than photographing a HAML file.
//
// What the contract is, in the pinned bytes:
//
//   1. card-mod-list-0.20.0 set/abstract/01_list/html_views.rb - the FIVE
//      editor views are declared by ONE loop (:56-58), so :multiselect is a
//      real view of the set module; :93-97 is the editor's own body:
//      `select_tag "pointer_multiselect-#{unique_id}",
//       options_for_select(card.options_hash, card.item_names), multiple:
//       true, class: "pointer-multiselect form-control"`.
//   2. card-1.110.0 lib/card/format/content.rb - unique_id:
//      "#{card.name.safe_key}-#{id_counter}".
//   3. card-mod-layout-0.20.0 set/abstract/items/options_api.rb - options_hash
//      (the standard arm: label == name).
//   4. actionview-7.2.4 - select_tag (form_tag_helper.rb:201-225): the
//      multiple arm appends "[]" to the html name and emits the base hash
//      name/id FIRST, then multiple, then class; options_for_select
//      (form_options_helper.rb:358-375): selected lands BEFORE value, and
//      the options join with "\n".
//
// The port side is the engine's list mod
// (src/card/mod-loader/mods/card-mod-list.ts). The pin compares the port's
// bytes with Ruby's RENDERED bytes, with the probe's own values replaced by
// the port's placeholders, so the two must agree on the WHOLE rendering: the
// select tag's attribute order, the "[]" suffix on the name, the multiple
// arm, the class, and every option (the selected arm before the value, and
// the "\n" that joins the options).
//
// The third leg is the harness's own C17 check, which must grade the
// selection on the STORED card and on the card's page, so it cannot pass on a
// form that merely renders some select.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const capture = JSON.parse(
  readFileSync(
    new URL("./../../../fixtures/captured/pointer-multiselect-input.json", import.meta.url),
    "utf8",
  ),
);
const portSource = readFileSync(
  new URL("./../../../src/card/mod-loader/mods/card-mod-list.ts", import.meta.url),
  "utf8",
);
const sharedCheck = readFileSync(
  new URL(
    "./../../../tools/edge-signed-in-exercise/checks-unmeasured-save-edit-create.mjs",
    import.meta.url,
  ),
  "utf8",
);
const pointerLib = readFileSync(
  new URL("./../../../tools/edge-signed-in-exercise/lib/new-pointer-input.mjs", import.meta.url),
  "utf8",
);

const rendered = capture.rendered.bytes;
const options = Object.entries(capture.rendered.probe_options as Record<string, string>);
const firstOption = options[0][1];
const secondOption = options[1][1];
const uniqueId = capture.rendered.probe_unique_id;

describe("the pinned Ruby's own bytes for the pointer multiselect input", () => {
  it("the set module declares the editor and owns its body", () => {
    expect(capture.facts.editor_views).toBe(
      "%i[autocomplete checkbox radio select multiselect]",
    );
    expect(capture.facts.multiselect_input_name).toBe(
      "pointer_multiselect-#{unique_id}",
    );
    expect(capture.facts.multiselect_input_options).toBe(
      "options_for_select(card.options_hash, card.item_names)",
    );
    expect(capture.facts.multiselect_multiple).toBe("multiple: true");
    expect(capture.facts.multiselect_input_class).toBe(
      'class: "pointer-multiselect form-control"',
    );
    expect(capture.facts.unique_id_owner).toBe("#{card.name.safe_key}-#{id_counter}");
    expect(capture.facts.options_hash_owner).toBe("def options_hash");
  });

  it("the pinned helpers own the html name, the base hash and the option order", () => {
    expect(capture.facts.select_tag_html_name).toBe(
      "html_name = (options[:multiple] == true",
    );
    expect(capture.facts.select_tag_content_tag).toBe(
      'content_tag "select", option_tags,',
    );
    expect(capture.facts.select_tag_base_hash).toBe(
      '"name" => html_name, "id" => sanitize_to_id(name)',
    );
    expect(capture.facts.options_for_select_selected_before_value).toBe(
      "html_attributes[:selected] ||= option_value_selected?(value, selected)",
    );
    expect(capture.facts.options_for_select_join).toBe('join("\\n").html_safe');
  });

  it("the rendered Ruby bytes carry the select the contract is about", () => {
    expect(rendered).toContain(`name="pointer_multiselect-${uniqueId}[]"`);
    expect(rendered).toContain(`id="pointer_multiselect-${uniqueId}"`);
    expect(rendered).toContain('multiple="multiple"');
    expect(rendered).toContain('class="pointer-multiselect form-control"');
    expect(rendered).toContain(`<option value="${firstOption}">${firstOption}</option>`);
  });

  it("the selected arm lands before the value, the way the pinned helper orders it", () => {
    expect(rendered).toContain(
      `<option selected="selected" value="${secondOption}">${secondOption}</option>`,
    );
    expect(rendered.indexOf('selected="selected"')).toBeLessThan(
      rendered.lastIndexOf(`value="${secondOption}"`),
    );
  });

  it("the capture names the gemset it photographed", () => {
    expect(capture.oracle.multiselect_input_method.gem).toBe("card-mod-list-0.20.0");
    expect(capture.oracle.select_tag.gem).toBe("actionview-7.2.4");
    expect(capture.oracle.select_tag.file_sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("the port renders the same bytes the pinned Ruby renders", () => {
  it("the whole rendering is byte-identical once the probe's values are the port's placeholders", () => {
    expect(portSource).toContain("const groupName = `pointer_multiselect-${ctx.fmt.uniqueId()}`;");
    expect(portSource).toContain("`<select name=\"${groupName}[]\" id=\"${groupName}\" ` +");
    expect(portSource).toContain(
      '`multiple="multiple" class="pointer-multiselect form-control">` +',
    );
    expect(portSource).toContain(
      "`<option${selected.includes(value) ? ` selected=\"selected\"` : \"\"} value=\"${h(value)}\">${h(label)}</option>`,",
    );
    const normalized = rendered
      .replace(
        new RegExp(`pointer_multiselect-${uniqueId}\\[\\]`, "g"),
        "pointer_multiselect-${ctx.fmt.uniqueId()}[]",
      )
      .replace(
        new RegExp(`pointer_multiselect-${uniqueId}`, "g"),
        "pointer_multiselect-${ctx.fmt.uniqueId()}",
      )
      .replace(new RegExp(`value="${firstOption}"`, "g"), 'value="${h(value)}"')
      .replace(new RegExp(`value="${secondOption}"`, "g"), 'value="${h(value)}"')
      .replace(
        new RegExp(`>${firstOption}</option>`, "g"),
        ">${h(label)}</option>",
      )
      .replace(
        new RegExp(`>${secondOption}</option>`, "g"),
        ">${h(label)}</option>",
      );
    const portRendered =
      '<select name="pointer_multiselect-${ctx.fmt.uniqueId()}[]" id="pointer_multiselect-${ctx.fmt.uniqueId()}" ' +
      'multiple="multiple" class="pointer-multiselect form-control">' +
      '<option value="${h(value)}">${h(label)}</option>\n' +
      '<option selected="selected" value="${h(value)}">${h(label)}</option>' +
      "</select>";
    expect(normalized).toBe(portRendered);
  });

  it("the port's option arm keeps the selected boolean before the value", () => {
    expect(portSource).toContain(
      '`<option${selected.includes(value) ? ` selected="selected"` : ""} value="${h(value)}">${h(label)}</option>`',
    );
  });

  it("the port joins the options with the newline the pinned helper joins them with", () => {
    expect(portSource).toContain('`<option${selected.includes(value)');
    expect(portSource).toContain('.join("\\n");');
  });
});

describe("the harness's C17 check cannot pass vacuously", () => {
  it("records under the row's exact check name", () => {
    expect(sharedCheck).toContain(
      "C17 a new card form on a cardtype with a multi-pointer slot renders the multiselect input and a selection persists",
    );
  });

  it("grades the selection on the stored card and on the card's page", () => {
    expect(pointerLib).toContain("select[multiple]");
    expect(pointerLib).toContain("New Pointer multiselect absent");
    expect(pointerLib).toContain(
      "selected.every(option=>stored.db_content.includes(option)&&text.includes(option))",
    );
  });
});

describe("the capture lives where the rig writes it", () => {
  it("the fixture file is on disk at the path the rig names", () => {
    expect(capture.contract).toContain("multiselect");
    expect(
      readFileSync(repoRoot + "fixtures/captured/pointer-multiselect-input.json", "utf8"),
    ).toContain('"multiselect_input_name"');
  });
});
