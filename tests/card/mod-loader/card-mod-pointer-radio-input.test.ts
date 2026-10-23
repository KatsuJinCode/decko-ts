// The pointer radio input pin (registry row cap-C15, "Radio input in a new
// card").
//
// ORACLE-PINNED: fixtures/captured/pointer-radio-input.json, captured from
// the pinned gemset (card-mod-list-0.20.0, card-mod-layout-0.20.0,
// card-mod-edit-0.20.0) by
// tests/card/mod-loader/oracle-capture-pointer-radio-input.rb. The capture
// photographs the pinned gemset's OWN bytes for the owners of the contract
// AND RENDERS the pinned template with the pinned ActionView helpers, so the
// capture carries Ruby's own rendered bytes and not only its source.
//
// What the contract is, in the pinned bytes:
//
//   1. card-mod-list-0.20.0 set/abstract/01_list/html_views/radio_input.haml
//      - the template: the input's name is "pointer_radio_button-#{card.key}",
//      its id is "pointer-radio-#{option_name.to_name.key}", its class is
//      "pointer-radio-button form-check-input", its value is the option's
//      NAME, and the list is ul.pointer-radio-list > li.pointer-radio.radio.form-check
//      with a form-check-label for each option.
//   2. card-mod-layout-0.20.0 set/abstract/items/options_api.rb - options_hash,
//      the option names the radio renders, and option_label, the label.
//   3. card-mod-edit-0.20.0 set/type/pointer.rb - the Pointer type's own
//      input_type_content_options: select, radio, autocomplete.
//
// The port side is the engine's list mod
// (src/card/mod-loader/mods/card-mod-list.ts). The pin compares the port's
// bytes with Ruby's RENDERED bytes, with the probe's own values replaced by
// the port's placeholders, so the two must agree on the whole tag: the
// attribute order, the name, the id, the value, the class (including the
// trailing space Ruby's class interpolation leaves) and the checked arm.
//
// The third leg is the harness's own C15 check, which must grade the radio
// widget and the selection, so it cannot pass on a form that merely renders
// some input.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const capture = JSON.parse(
  readFileSync(
    new URL("./../../../fixtures/captured/pointer-radio-input.json", import.meta.url),
    "utf8",
  ),
);
const portSource = readFileSync(
  new URL("./../../../src/card/mod-loader/mods/card-mod-list.ts", import.meta.url),
  "utf8",
);
const pointerLib = readFileSync(
  new URL("./../../../tools/edge-signed-in-exercise/lib/new-pointer-input.mjs", import.meta.url),
  "utf8",
);
const sharedCheck = readFileSync(
  new URL(
    "./../../../tools/edge-signed-in-exercise/checks-unmeasured-save-edit-create.mjs",
    import.meta.url,
  ),
  "utf8",
);

const rendered = capture.rendered.bytes;
const firstOption = Object.values(capture.rendered.probe_options as Record<string, string>)[0];
const cardKey = capture.rendered.probe_card_key;

describe("the pinned Ruby's own bytes for the pointer radio input", () => {
  it("the template names the input, the id and the class", () => {
    expect(capture.facts.input_name_pattern).toBe("pointer_radio_button-#{card.key}");
    expect(capture.facts.input_id_pattern).toBe("pointer-radio-#{option_name.to_name.key}");
    expect(capture.facts.input_class).toBe('"pointer-radio-button form-check-input');
    expect(capture.facts.list_class).toBe("%ul.pointer-radio-list");
    expect(capture.facts.item_class).toBe("%li.pointer-radio.radio.form-check");
  });

  it("the Pointer type offers the radio widget", () => {
    expect(capture.facts.pointer_widgets).toBe("%w[select radio autocomplete]");
  });

  it("the rendered Ruby bytes carry the input the contract is about", () => {
    expect(rendered).toContain("<ul class='pointer-radio-list'>");
    expect(rendered).toContain("<li class='pointer-radio radio form-check'>");
    expect(rendered).toContain(`name="pointer_radio_button-${cardKey}"`);
    expect(rendered).toContain(`id="pointer-radio-${firstOption}"`);
    expect(rendered).toContain(`value="${firstOption}"`);
    expect(rendered).toContain('class="pointer-radio-button form-check-input "');
    expect(rendered).toContain(`<label class="form-check-label" for="pointer-radio-${firstOption}">`);
  });

  it("the capture names the gemset it photographed", () => {
    expect(capture.oracle.radio_input_template.gem).toBe("card-mod-list-0.20.0");
    expect(capture.oracle.radio_input_template.file_sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("the port renders the same bytes the pinned Ruby renders", () => {
  it("the input tag is byte-identical once the probe's values are the port's placeholders", () => {
    const rubyTag = rendered.match(/<input type="radio"[^>]*\/>/)?.[0] ?? "";
    // The port writes the tag in two literals; the pin joins the port's own
    // halves and asks Ruby's rendered tag to match them.
    expect(portSource).toContain(
      '`<input type="radio" name="${inputName}" id="pointer-radio-${key}" value="${h(option)}" `',
    );
    expect(portSource).toContain('`class="pointer-radio-button form-check-input "${checked} />');
    const portTag =
      '<input type="radio" name="${inputName}" id="pointer-radio-${key}" value="${h(option)}" ' +
      'class="pointer-radio-button form-check-input "${checked} />';
    const normalized = rubyTag
      .replace(`pointer_radio_button-${cardKey}`, "${inputName}")
      .replace(`pointer-radio-${firstOption}`, "pointer-radio-${key}")
      .replace(`value="${firstOption}"`, 'value="${h(option)}"')
      .replace(' checked="checked"', "${checked}");
    expect(normalized).toBe(portTag);
  });

  it("the list, the item and the label carry Ruby's own classes", () => {
    expect(portSource).toContain("`<ul class='pointer-radio-list'>");
    expect(portSource).toContain("`<li class='pointer-radio radio form-check'>");
    expect(portSource).toContain('`<label class="form-check-label" for="pointer-radio-${key}">');
  });

  it("the input's name is the card's key, the way the pinned template names it", () => {
    expect(portSource).toContain("const inputName = `pointer_radio_button-${card.key}`;");
    expect(portSource).toContain('id="pointer-radio-${key}"');
  });
});

describe("the harness's C15 check cannot pass vacuously", () => {
  it("records under the row's exact check name", () => {
    expect(sharedCheck).toContain(
      "C15 a new card form on a cardtype with a pointer slot renders the radio input and a selection persists",
    );
  });

  it("grades the radio widget and the selection, not a form that renders some input", () => {
    expect(pointerLib).toContain("form.locator('input[type=radio]')");
    expect(pointerLib).toContain("Expected radio option absent");
    expect(pointerLib).toContain("input[type=radio][value=\"'+selected[0]+'\"]");
  });
});

describe("the capture lives where the rig writes it", () => {
  it("the fixture file is on disk at the path the rig names", () => {
    expect(capture.contract).toContain("pointer");
    expect(
      readFileSync(repoRoot + "fixtures/captured/pointer-radio-input.json", "utf8"),
    ).toContain('"input_name_pattern"');
  });
});
