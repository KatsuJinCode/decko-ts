// The PLAIN INPUT edit-and-save pin (registry row cap-E10, "Edit a
// plain-input card; save").
//
// ORACLE-PINNED: fixtures/captured/plain-input-edit-save.json, captured from
// the pinned gemset (card-mod-edit-0.20.0, decko-0.20.0, card-1.110.0) by
// tests/card/mod-loader/oracle-capture-plain-input-edit-save.rb.
//
// What the contract is, in the pinned bytes:
//
//   1. card-mod-edit-0.20.0 set/all/editor.rb - the EDIT FORM half: the
//      basket offers the plain input ("text area" and "text field" are
//      added to list_input_options), input_type_from_rule reads the *input
//      type rule, input_method turns that into "#{input_type}_input", the
//      :input view dispatches to it, default_input_type is :rich_text, and
//      the plain input's OWN body is text_field_input: `text_field :content,
//      class: classy("d0-card-content"), placeholder: placeholder_text` with
//      placeholder_text "".
//   2. decko-0.20.0 lib/card_controller/rest.rb - the WRITE ROUTE: the
//      update action saves the request's own card hash
//      (`card.update! params[:card]&.to_unsafe_h`).
//   3. card-1.110.0 mod/core/set/all/content.rb - the STORE event
//      (set_content, :store, on: :save) and card-1.110.0
//      lib/card/content/all.rb - the content setter
//      (`self.db_content = standardize_content value`).
//
// The port side is the edit mod
// (src/card/mod-loader/mods/card-mod-edit.ts) for the form, the write route
// (src/server/write-routes.ts) for the request's card hash, and the action
// engine (src/card/actions/card-action-engine.ts) for the store.
//
// The third leg is the harness's own E10 check, which must grade the write
// AND the new content on the card's page, so it cannot pass on a form that
// merely renders an input.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const capture = JSON.parse(
  readFileSync(
    new URL("./../../../fixtures/captured/plain-input-edit-save.json", import.meta.url),
    "utf8",
  ),
);
const portEdit = readFileSync(
  new URL(
    "./../../../src/card/mod-loader/mods/card-mod-edit.ts",
    import.meta.url,
  ),
  "utf8",
);
const contentOverrides = readFileSync(
  new URL("./../../../src/card/render/content-overrides.ts", import.meta.url),
  "utf8",
);
const writeRoutes = readFileSync(
  new URL("./../../../src/server/write-routes.ts", import.meta.url),
  "utf8",
);
const actionEngine = readFileSync(
  new URL(
    "./../../../src/card/actions/card-action-engine.ts",
    import.meta.url,
  ),
  "utf8",
);
const coverB = readFileSync(
  new URL(
    "./../../../tools/edge-signed-in-exercise/checks-cover-b.mjs",
    import.meta.url,
  ),
  "utf8",
);

describe("the pinned Ruby's own bytes for the plain input edit and save", () => {
  it("the edit form owns the plain input's own body", () => {
    expect(capture.facts.list_input_option_text_area).toBe(
      'basket[:list_input_options] << "text area"',
    );
    expect(capture.facts.list_input_option_text_field).toBe(
      'basket[:list_input_options] << "text field"',
    );
    expect(capture.facts.text_field_input).toBe(
      'text_field :content, class: classy("d0-card-content"), placeholder: placeholder_text',
    );
    expect(capture.facts.text_area_input).toBe(
      'text_area :content, rows: 5, class: "d0-card-content",',
    );
    expect(capture.facts.hidden_input).toBe(
      'hidden_field :content, class: classy("d0-card-content")',
    );
    expect(capture.facts.placeholder_text).toBe('def placeholder_text\n    ""');
  });

  it("the edit form owns the input dispatch", () => {
    expect(capture.facts.input_type_from_rule).toBe(
      'card.rule(:input_type)&.gsub(/[\\[\\]]/, "")&.tr(" ", "_")',
    );
    expect(capture.facts.input_method).toBe("def input_method input_type");
    expect(capture.facts.input_method_body).toBe('"#{input_type}_input"');
    expect(capture.facts.input_view_dispatch).toBe(
      "try(input_method(input_type))",
    );
    expect(capture.facts.default_input_type).toBe("def default_input_type");
    expect(capture.facts.default_input_type_body).toBe(
      "def default_input_type\n    :rich_text",
    );
  });

  it("the write route and the store own the save", () => {
    expect(capture.facts.update_route).toBe(
      "card.new_card? ? create : handle { card.update! params[:card]&.to_unsafe_h }",
    );
    expect(capture.facts.set_content_event).toBe(
      "event :set_content, :store, on: :save do",
    );
    expect(capture.facts.set_content_body).toBe(
      "self.content = prepare_db_content",
    );
    expect(capture.facts.content_setter).toBe(
      "self.db_content = standardize_content value",
    );
  });

  it("the capture names the gemset it photographed", () => {
    expect(capture.oracle.editor_set_module.gem).toBe("card-mod-edit-0.20.0");
    expect(capture.oracle.update_route.gem).toBe("decko-0.20.0");
    expect(capture.oracle.set_content_event.gem).toBe("card-1.110.0");
    expect(capture.oracle.editor_set_module.file_sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("the port carries the pinned bytes", () => {
  it("the port renders the plain input as the pinned text field", () => {
    expect(portEdit).toContain(
      '`<input class="d0-card-content form-control" placeholder="" type="text" value="${content}" name="${namePrefix}[content]" id="${idPrefix}_content" />`;',
    );
    expect(portEdit).toContain(
      'ruleContent.replace(/[[\\]]/g, "").replace(/ /g, "_");',
    );
    expect(portEdit).toContain(
      'const method = inputType ?? "rich_text"; // default_input_type (:38-40)',
    );
    expect(portEdit).toContain('phrase: { method: "text_field" },');
  });

  it("the port's basket offers the plain input the way the pinned basket does", () => {
    expect(contentOverrides).toContain("// set/all/editor.rb:1");
    expect(contentOverrides).toContain('"text area",');
    expect(contentOverrides).toContain("// set/all/editor.rb:2");
    expect(contentOverrides).toContain('"text field",');
  });

  it("the port's write route saves the request's own card hash", () => {
    expect(writeRoutes).toContain(
      'content: listItemContent(parsed, card["content"] ?? existing.dbContent ?? "") ?? card["content"],',
    );
  });

  it("the port's store writes the content the way the pinned event does", () => {
    expect(actionEngine).toContain(
      "// set_content (content.rb:1-5): prepare_db_content stores",
    );
    expect(actionEngine).toContain('db_content: input.content ?? "",');
  });
});

describe("the harness's E10 check cannot pass vacuously", () => {
  it("records under the row's exact check name", () => {
    expect(coverB).toContain(
      "E10 a plain-input card can be edited and saved (the new content shows on the card)",
    );
  });

  it("grades the write AND the new content on the card's page", () => {
    expect(coverB).toContain(
      'fieldInfo !== null && write !== undefined && write.status < 400 && after.html.includes("Harness edited phrase")',
    );
    expect(coverB).toContain(
      '#edit_card input[name$="[content]"]:not([type=hidden])',
    );
  });
});

describe("the capture lives where the rig writes it", () => {
  it("the fixture file is on disk at the path the rig names", () => {
    expect(capture.contract).toContain("plain");
    expect(
      readFileSync(repoRoot + "fixtures/captured/plain-input-edit-save.json", "utf8"),
    ).toContain('"text_field_input"');
  });
});
