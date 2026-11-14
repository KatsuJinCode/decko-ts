// The pointer CHECKBOX input pin (registry row cap-C16, "Checkbox input in a
// new card").
//
// ORACLE-PINNED: fixtures/captured/pointer-checkbox-input.json, captured from
// the pinned gemset (card-mod-list-0.20.0, card-mod-layout-0.20.0,
// card-1.110.0, cardname-1.110.0) by
// tests/card/mod-loader/oracle-capture-pointer-checkbox-input.rb. The capture
// photographs the pinned gemset's OWN bytes for the owners of the contract
// AND RENDERS the pinned template with the pinned ActionView helpers, so the
// capture carries Ruby's own rendered bytes and not only its source.
//
// What the contract is, in the pinned bytes:
//
//   1. card-mod-list-0.20.0 set/abstract/01_list/html_views.rb - the FIVE
//      editor views are declared by ONE loop (:56-58), so :checkbox is a real
//      view of the set module; :64-66 renders the template below.
//   2. card-mod-list-0.20.0 set/abstract/01_list/html_views/
//      checkbox_input.haml - the template: the wrapper is
//      .pointer-checkbox-list, one .pointer-checkbox per option, the input's
//      id is "pointer-checkbox-#{option_name.to_name.key}", the checked arm
//      is `card.item_names.include? option_name`, the input's name is
//      "pointer_checkbox-#{unique_id}" and its class is
//      "pointer-checkbox-button #{'_submit-on-change' if submit_on_change}".
//   3. card-1.110.0 lib/card/format/content.rb - unique_id:
//      "#{card.name.safe_key}-#{id_counter}".
//   4. card-mod-layout-0.20.0 set/abstract/items/options_api.rb - options_hash
//      (the standard arm: label == name) and option_label (the label's own
//      bytes: class "form-check-label", for the option's id).
//
// The port side is the engine's list mod
// (src/card/mod-loader/mods/card-mod-list.ts). The pin compares the port's
// bytes with Ruby's RENDERED bytes, with the probe's own values replaced by
// the port's placeholders, so the two must agree on the WHOLE rendering: the
// wrapper, the item, the input tag (attribute order, name, id, value, class
// including the trailing space Ruby's class interpolation leaves, and the
// checked arm) and the label.
//
// The third leg is the harness's own C16 check, which must grade the checked
// value on the STORED card and on the card's page, so it cannot pass on a
// form that merely renders some input.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const capture = JSON.parse(
  readFileSync(
    new URL("./../../../fixtures/captured/pointer-checkbox-input.json", import.meta.url),
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

describe("the pinned Ruby's own bytes for the pointer checkbox input", () => {
  it("the template names the input, the id, the class and the checked arm", () => {
    expect(capture.facts.editor_views).toBe(
      "%i[autocomplete checkbox radio select multiselect]",
    );
    expect(capture.facts.checkbox_input_method).toBe("def checkbox_input");
    expect(capture.facts.checkbox_input_haml_call).toBe(
      "raw haml(:checkbox_input, submit_on_change: @submit_on_change)",
    );
    expect(capture.facts.input_name_pattern).toBe("pointer_checkbox-#{unique_id}");
    expect(capture.facts.input_id_pattern).toBe(
      "pointer-checkbox-#{option_name.to_name.key}",
    );
    expect(capture.facts.input_class).toBe(
      "pointer-checkbox-button #{'_submit-on-change' if submit_on_change}",
    );
    expect(capture.facts.list_class).toBe(".pointer-checkbox-list");
    expect(capture.facts.checked_predicate).toBe(
      "checked = card.item_names.include? option_name",
    );
    expect(capture.facts.unique_id_owner).toBe("#{card.name.safe_key}-#{id_counter}");
  });

  it("the layout owns the options hash and the label's own bytes", () => {
    expect(capture.facts.options_hash_owner).toBe("def options_hash");
    expect(capture.facts.option_label_owner).toBe("def option_label option_name, id");
    expect(capture.facts.option_label_class).toBe(
      'class: "form-check-label", for: id',
    );
    expect(capture.facts.simple_key_owner).toBe("def simple_key");
  });

  it("the rendered Ruby bytes carry the input the contract is about", () => {
    expect(rendered).toContain("<div class='pointer-checkbox-list'>");
    expect(rendered).toContain("<div class='pointer-checkbox'>");
    expect(rendered).toContain(`name="pointer_checkbox-${uniqueId}"`);
    expect(rendered).toContain(`id="pointer-checkbox-${firstOption}"`);
    expect(rendered).toContain(`value="${firstOption}"`);
    expect(rendered).toContain('class="pointer-checkbox-button "');
    expect(rendered).toContain(`<label class="form-check-label" for="pointer-checkbox-${firstOption}">`);
  });

  it("the checked arm is rendered for the option the card already carries", () => {
    const checkedTag = rendered.match(
      new RegExp(`<input type="checkbox"[^>]*id="pointer-checkbox-${secondOption}"[^>]*/>`),
    )?.[0];
    expect(checkedTag).toBeDefined();
    expect(checkedTag).toContain('checked="checked"');
    const uncheckedTag = rendered.match(
      new RegExp(`<input type="checkbox"[^>]*id="pointer-checkbox-${firstOption}"[^>]*/>`),
    )?.[0];
    expect(uncheckedTag).toBeDefined();
    expect(uncheckedTag).not.toContain("checked=");
  });

  it("the capture names the gemset it photographed", () => {
    expect(capture.oracle.checkbox_input_template.gem).toBe("card-mod-list-0.20.0");
    expect(capture.oracle.checkbox_input_template.file_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(capture.oracle.simple_key.gem).toBe("cardname-1.110.0");
  });
});

describe("the port renders the same bytes the pinned Ruby renders", () => {
  it("the whole rendering is byte-identical once the probe's values are the port's placeholders", () => {
    // The port writes the row in four literals; the pin joins the port's own
    // halves and asks Ruby's rendered bytes to match them.
    expect(portSource).toContain("`<div class='pointer-checkbox'>\\n` +");
    expect(portSource).toContain(
      '`<input type="checkbox" name="pointer_checkbox-${ctx.fmt.uniqueId()}" id="${id}" value="${h(option)}" ` +',
    );
    expect(portSource).toContain('`class="pointer-checkbox-button "${checked} />\\n` +');
    expect(portSource).toContain(
      '`<label class="form-check-label" for="${id}">${optionLabelText(ctx, option)}</label>\\n` +',
    );
    expect(portSource).toContain("`<div class='pointer-checkbox-list'>\\n${rows}</div>\\n`");
    const portRow = (checked: string) =>
      "<div class='pointer-checkbox'>\n" +
      '<input type="checkbox" name="pointer_checkbox-${ctx.fmt.uniqueId()}" id="${id}" value="${h(option)}" ' +
      `class="pointer-checkbox-button "${checked} />\n` +
      '<label class="form-check-label" for="${id}">${optionLabelText(ctx, option)}</label>\n' +
      "</div>\n";
    const normalized = rendered
      .replace(
        new RegExp(`pointer_checkbox-${uniqueId}`, "g"),
        "pointer_checkbox-${ctx.fmt.uniqueId()}",
      )
      .replace(
        new RegExp(`pointer-checkbox-${firstOption}`, "g"),
        "${id}",
      )
      .replace(
        new RegExp(`pointer-checkbox-${secondOption}`, "g"),
        "${id}",
      )
      .replace(new RegExp(`value="${firstOption}"`, "g"), 'value="${h(option)}"')
      .replace(new RegExp(`value="${secondOption}"`, "g"), 'value="${h(option)}"')
      .replace(
        new RegExp(`>${firstOption}</label>`, "g"),
        ">${optionLabelText(ctx, option)}</label>",
      )
      .replace(
        new RegExp(`>${secondOption}</label>`, "g"),
        ">${optionLabelText(ctx, option)}</label>",
      );
    const portRendered =
      "<div class='pointer-checkbox-list'>\n" + portRow("") + portRow(' checked="checked"') + "</div>\n";
    expect(normalized).toBe(portRendered);
  });

  it("the port's class arm keeps the trailing space Ruby's interpolation leaves", () => {
    expect(portSource).toContain('`class="pointer-checkbox-button "${checked} />');
  });

  it("the port's id is the option's key, the way the pinned template names it", () => {
    expect(portSource).toContain("const id = `pointer-checkbox-${key}`;");
    expect(portSource).toContain("const key = DeckoName.parse(option).key;");
  });

  it("the port asks for a name only the way Ruby's unique_id answers it", () => {
    expect(portSource).toContain('name="pointer_checkbox-${ctx.fmt.uniqueId()}"');
  });
});

describe("the harness's C16 check cannot pass vacuously", () => {
  it("records under the row's exact check name", () => {
    expect(coverB).toContain(
      "C16 a checkbox pointer input can be checked and stored (card shows the checked value)",
    );
  });

  it("grades the checked value on the stored card and on the card's page", () => {
    expect(coverB).toContain(
      "write.status < 400 && stored.includes(target.value) && /Pick_Two/.test(after.html)",
    );
    expect(coverB).toContain('input[type="checkbox"][value="${target.value}"]');
  });
});

describe("the capture lives where the rig writes it", () => {
  it("the fixture file is on disk at the path the rig names", () => {
    expect(capture.contract).toContain("checkbox");
    expect(
      readFileSync(repoRoot + "fixtures/captured/pointer-checkbox-input.json", "utf8"),
    ).toContain('"input_name_pattern"');
  });
});
