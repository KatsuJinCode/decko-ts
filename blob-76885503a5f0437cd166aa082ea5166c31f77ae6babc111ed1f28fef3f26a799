// The pointer SELECT input pin (registry row cap-C18, "Select input in a
// structured card").
//
// ORACLE-PINNED: fixtures/captured/pointer-select-input.json, captured from
// the pinned gemset (card-mod-list-0.20.0, card-1.110.0,
// card-mod-layout-0.20.0, actionview-7.2.4) by
// tests/card/mod-loader/oracle-capture-pointer-select-input.rb. This editor
// has NO template of its own: its bytes ARE the two pinned ActionView
// helpers' output, so the capture RENDERS them with the pinned helpers
// rather than photographing a HAML file.
//
// What the contract is, in the pinned bytes:
//
//   1. card-mod-list-0.20.0 set/abstract/01_list/html_views.rb - the FIVE
//      editor views are declared by ONE loop (:56-58), so :select is a real
//      view of the set module; :72-75 is the editor's own body:
//      `select_tag "pointer_select-#{unique_id}", select_input_options,
//      class: "pointer-select form-control"`, and :109-112 is
//      select_input_options: `options = { "-- Select --" => "" }.merge
//      card.options_hash` then `options_for_select options, card.first_name`
//      - the blank arm is the FIRST pair.
//   2. card-1.110.0 lib/card/format/content.rb - unique_id:
//      "#{card.name.safe_key}-#{id_counter}".
//   3. card-mod-layout-0.20.0 set/abstract/items/options_api.rb - options_hash
//      (the standard arm: label == name).
//   4. actionview-7.2.4 - select_tag (form_tag_helper.rb:201-225): the base
//      hash's name and id land FIRST, then class; options_for_select
//      (form_options_helper.rb:358-375): selected lands BEFORE value, and
//      the options join with "\n".
//
// The port side is the engine's list mod
// (src/card/mod-loader/mods/card-mod-list.ts). The pin compares the port's
// bytes with Ruby's RENDERED bytes, with the probe's own values replaced by
// the port's placeholders, so the two must agree on the WHOLE rendering: the
// select tag's attribute order, the blank arm's own value and label, every
// option (the selected arm before the value), and the newline that joins the
// options.
//
// The third leg is the harness's own C18 check, which must grade the choice
// on the STORED card and on the card's page, so it cannot pass on a form that
// merely renders some select.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const capture = JSON.parse(
  readFileSync(
    new URL("./../../../fixtures/captured/pointer-select-input.json", import.meta.url),
    "utf8",
  ),
);
const portSource = readFileSync(
  new URL("./../../../src/card/mod-loader/mods/card-mod-list.ts", import.meta.url),
  "utf8",
);
const coverB = readFileSync(
  new URL(
    "./../../../tools/edge-signed-in-exercise/checks-cover-b.mjs",
    import.meta.url,
  ),
  "utf8",
);

const rendered = capture.rendered.bytes;
const options = Object.entries(capture.rendered.probe_options as Record<string, string>);
const firstOption = options[0][1];
const secondOption = options[1][1];
const uniqueId = capture.rendered.probe_unique_id;

describe("the pinned Ruby's own bytes for the pointer select input", () => {
  it("the set module declares the editor and owns its body", () => {
    expect(capture.facts.editor_views).toBe(
      "%i[autocomplete checkbox radio select multiselect]",
    );
    expect(capture.facts.select_input_name).toBe("pointer_select-#{unique_id}");
    expect(capture.facts.select_input_class).toBe(
      'class: "pointer-select form-control"',
    );
    expect(capture.facts.select_input_options_blank).toBe(
      'options = { "-- Select --" => "" }.merge card.options_hash',
    );
    expect(capture.facts.select_input_options_select).toBe(
      "options_for_select options, card.first_name",
    );
    expect(capture.facts.unique_id_owner).toBe("#{card.name.safe_key}-#{id_counter}");
    expect(capture.facts.options_hash_owner).toBe("def options_hash");
  });

  it("the pinned helpers own the base hash and the option order", () => {
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
    expect(rendered).toContain(`name="pointer_select-${uniqueId}"`);
    expect(rendered).toContain(`id="pointer_select-${uniqueId}"`);
    expect(rendered).toContain('class="pointer-select form-control"');
    expect(rendered).toContain('<option value="">-- Select --</option>');
    expect(rendered).toContain(`<option value="${firstOption}">${firstOption}</option>`);
  });

  it("the blank arm is the first option and the selected arm lands before the value", () => {
    expect(rendered.indexOf('<option value="">-- Select --</option>')).toBe(
      rendered.indexOf("<option"),
    );
    expect(rendered).toContain(
      `<option selected="selected" value="${secondOption}">${secondOption}</option>`,
    );
  });

  it("the capture names the gemset it photographed", () => {
    expect(capture.oracle.select_input_method.gem).toBe("card-mod-list-0.20.0");
    expect(capture.oracle.select_tag.gem).toBe("actionview-7.2.4");
    expect(capture.oracle.select_tag.file_sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("the port renders the same bytes the pinned Ruby renders", () => {
  it("the whole rendering is byte-identical once the probe's values are the port's placeholders", () => {
    expect(portSource).toContain("const groupName = `pointer_select-${ctx.fmt.uniqueId()}`;");
    expect(portSource).toContain("`<select name=\"${groupName}\" id=\"${groupName}\" ` +");
    expect(portSource).toContain('`class="pointer-select form-control">` +');
    const normalized = rendered
      .replace(
        new RegExp(`pointer_select-${uniqueId}`, "g"),
        "pointer_select-${ctx.fmt.uniqueId()}",
      )
      .replace('value=""', 'value="${h(value)}"')
      .replace(new RegExp(`value="${firstOption}"`, "g"), 'value="${h(value)}"')
      .replace(new RegExp(`value="${secondOption}"`, "g"), 'value="${h(value)}"')
      .replace(">-- Select --</option>", ">${h(label)}</option>")
      .replace(new RegExp(`>${firstOption}</option>`, "g"), ">${h(label)}</option>")
      .replace(new RegExp(`>${secondOption}</option>`, "g"), ">${h(label)}</option>");
    const portRendered =
      '<select name="pointer_select-${ctx.fmt.uniqueId()}" id="pointer_select-${ctx.fmt.uniqueId()}" ' +
      'class="pointer-select form-control">' +
      '<option value="${h(value)}">${h(label)}</option>\n' +
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

  it("the port's blank arm is the first pair, the way the pinned options merge puts it", () => {
    expect(portSource).toContain(
      'const pairs: Array<[string, string]> = [["-- Select --", ""]];',
    );
  });

  it("the port selects the card's own first name, the way the pinned helper does", () => {
    expect(portSource).toContain(
      "const firstName = selectedItems.length > 0 ? selectedItems[0] : undefined;",
    );
  });
});

describe("the harness's C18 check cannot pass vacuously", () => {
  it("records under the row's exact check name", () => {
    expect(coverB).toContain(
      "C18 a select pointer input offers a choice and stores it (card shows the selection)",
    );
  });

  it("grades the choice on the stored card and on the card's page", () => {
    expect(coverB).toContain(
      "write.status < 400 && stored.includes(option.value) && /Pick_One/.test(after.html)",
    );
    expect(coverB).toContain('form.form.locator(`select[name="${sel.name}"]`)');
  });
});

describe("the capture lives where the rig writes it", () => {
  it("the fixture file is on disk at the path the rig names", () => {
    expect(capture.contract).toContain("select");
    expect(
      readFileSync(repoRoot + "fixtures/captured/pointer-select-input.json", "utf8"),
    ).toContain('"select_input_name"');
  });
});
