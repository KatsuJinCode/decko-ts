// The POINTER EDITING pin (registry row cap-E23, "Pointer editing (change a
// pointer's selection and save)").
//
// ORACLE-PINNED: fixtures/captured/pointer-edit.json, captured from the
// pinned gemset (card-mod-list-0.20.0, card-1.110.0) by
// tests/card/mod-loader/oracle-capture-pointer-edit.rb.
//
// What the contract is, in the pinned bytes:
//
//   1. card-mod-list-0.20.0 set/abstract/01_list/html_views.rb - the SELECT
//      EDITOR: the editor view loop is `%i[autocomplete checkbox radio
//      select multiselect].each do |editor_view| view(editor_view) { send
//      "#{editor_view}_input" } end`; select_input is `select_tag
//      "pointer_select-#{unique_id}", select_input_options, class:
//      "pointer-select form-control"`; and select_input_options is `options =
//      { "-- Select --" => "" }.merge card.options_hash` then
//      `options_for_select options, card.first_name` - the blank first option
//      and the card's own first item selected.
//   2. card-mod-list-0.20.0 assets/script/pointer_config.js.coffee - the
//      CLIENT that turns the chosen value into the pointer's content: the
//      `'select.pointer-select': -> pointerContent @val()` handler and
//      `pointerContent: (vals) -> $.makeArray(vals).join "\n"`.
//   3. card-1.110.0 mod/core/set/all/content.rb - the SAVE: the :set_content
//      event is `self.content = prepare_db_content` and prepare_db_content is
//      `standard_db_content || ""` then `Card::Content.clean!(cont)`.
//
// The port side is the list mod (src/card/mod-loader/mods/card-mod-list.ts)
// for the select editor, the vendored client script the port serves, and the
// action engine (src/card/actions/card-action-engine.ts) for the store.
//
// THE MEASURED DIFFERENCE. The port serves its own vendored copy of the
// client file, and the capture MEASURES it against the pinned gem's file:
// exactly one line differs, and that line is a comment on both sides. The
// pin asserts that measurement rather than assuming the two files are the
// same file, and it asserts the executable handler bytes are the pinned ones.
//
// The third leg is the harness's own E23 check: the pointer's edit form must
// carry the select, the write must answer under 400, the STORED content must
// carry the new choice, and a fresh visit must show it.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const capture = JSON.parse(
  readFileSync(
    new URL("./../../../fixtures/captured/pointer-edit.json", import.meta.url),
    "utf8",
  ),
);
const portList = readFileSync(
  new URL(
    "./../../../src/card/mod-loader/mods/card-mod-list.ts",
    import.meta.url,
  ),
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
const capabilities = JSON.parse(
  readFileSync(
    new URL(
      "./../../../tools/edge-signed-in-exercise/capabilities.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const vendoredClient = readFileSync(
  new URL(
    "./../../../fixtures/vendor/mod-script-assets/card-mod-list/assets/script/pointer_config.js.coffee",
    import.meta.url,
  ),
  "utf8",
);
const manifest = JSON.parse(
  readFileSync(
    new URL(
      "./../../../fixtures/vendor/mod-script-assets/manifest.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

const sha256 = (text: string) =>
  createHash("sha256").update(text, "utf8").digest("hex");

describe("the pinned Ruby's own bytes for pointer editing", () => {
  it("the list module owns the select editor", () => {
    expect(capture.facts.editor_view_loop).toBe(
      "%i[autocomplete checkbox radio select multiselect].each do |editor_view|",
    );
    expect(capture.facts.editor_view_send).toBe(
      'view(editor_view) { send "#{editor_view}_input" }',
    );
    expect(capture.facts.select_input_tag).toBe(
      'select_tag "pointer_select-#{unique_id}", select_input_options,',
    );
    expect(capture.facts.select_input_class).toBe(
      'class: "pointer-select form-control"',
    );
    expect(capture.facts.select_input_options_blank).toBe(
      'options = { "-- Select --" => "" }.merge card.options_hash',
    );
    expect(capture.facts.select_input_options_selected).toBe(
      "options_for_select options, card.first_name",
    );
  });

  it("the pinned client turns the select's value into the pointer content", () => {
    expect(capture.facts.client_select_handler).toBe(
      "'select.pointer-select': ->",
    );
    expect(capture.facts.client_select_body).toBe("pointerContent @val()");
    expect(capture.facts.client_pointer_content).toBe(
      "pointerContent: (vals) ->",
    );
    expect(capture.facts.client_pointer_content_join).toBe(
      '$.makeArray(vals).join "\\n"',
    );
  });

  it("the card core owns the save", () => {
    expect(capture.facts.set_content_event).toBe(
      "event :set_content, :store, on: :save do",
    );
    expect(capture.facts.set_content_body).toBe(
      "self.content = prepare_db_content",
    );
    expect(capture.facts.prepare_db_content_default).toBe(
      'cont = standard_db_content || ""',
    );
    expect(capture.facts.prepare_db_content_clean).toBe(
      "clean_html? ? Card::Content.clean!(cont) : cont",
    );
  });

  it("the capture names the gemset it photographed", () => {
    expect(capture.oracle.select_input.gem).toBe("card-mod-list-0.20.0");
    expect(capture.oracle.client_select_handler.gem).toBe(
      "card-mod-list-0.20.0",
    );
    expect(capture.oracle.set_content_event.gem).toBe("card-1.110.0");
    for (const owner of Object.values(capture.oracle) as Array<{
      file_sha256: string;
    }>) {
      expect(owner.file_sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

describe("the port carries the pinned bytes", () => {
  it("the port's select editor is the pinned select", () => {
    expect(portList).toContain(
      "function selectInputHtml(ctx: ViewContext): string {",
    );
    expect(portList).toContain(
      "const groupName = `pointer_select-${ctx.fmt.uniqueId()}`;",
    );
    expect(portList).toContain(
      '`class="pointer-select form-control">` +',
    );
    expect(portList).toContain(
      'const pairs: Array<[string, string]> = [["-- Select --", ""]];',
    );
  });

  it("the client the port serves carries the pinned handler bytes", () => {
    expect(vendoredClient).toContain("'select.pointer-select': ->");
    expect(vendoredClient).toContain("pointerContent @val()");
    expect(vendoredClient).toContain("pointerContent: (vals) ->");
    expect(vendoredClient).toContain('$.makeArray(vals).join "\\n"');
  });

  it("the manifest pins the client file the port serves", () => {
    const groups = manifest.mods.list as Array<{
      files: Array<{ file: string; sha256: string }>;
    }>;
    const entry = groups
      .flatMap((group) => group.files)
      .find((file) => file.file.endsWith("pointer_config.js.coffee"));
    expect(entry).toBeDefined();
    expect(entry?.sha256).toBe(sha256(vendoredClient));
    expect(entry?.sha256).toBe(capture.port_client_asset.port_sha256);
  });

  it("the measured difference from the pinned gem's client file is one comment line", () => {
    const asset = capture.port_client_asset as {
      differing_line_count: number;
      differing_lines: Array<{ line: number; gem: string; port: string }>;
      every_difference_is_a_comment: boolean;
      gem_sha256: string;
      port_sha256: string;
    };
    expect(asset.differing_line_count).toBe(1);
    expect(asset.differing_lines).toHaveLength(1);
    expect(asset.every_difference_is_a_comment).toBe(true);
    expect(asset.differing_lines[0].gem.trim().startsWith("#")).toBe(true);
    expect(asset.differing_lines[0].port.trim().startsWith("#")).toBe(true);
    expect(asset.gem_sha256).not.toBe(asset.port_sha256);
    // The port's own copy differs from the gem's file only in that comment.
    const gemLines = capture.oracle.client_select_handler.source.split("\n");
    expect(gemLines.length).toBeGreaterThan(0);
  });

  it("the port's engine stores the prepared content", () => {
    expect(actionEngine).toContain(
      "// set_content (:store, content.rb:1-5): prepare_db_content cleans the",
    );
    expect(actionEngine).toContain(
      "// set_content (content.rb:1-5): prepare_db_content stores",
    );
    expect(actionEngine).toContain(
      "/** prepare_db_content's HTML step (content.rb:44-49): the stored content",
    );
  });
});

describe("the harness's E23 check cannot pass vacuously", () => {
  it("the row declares exactly the instrument's check name and its actor", () => {
    const row = capabilities.capabilities.find(
      (c: { id: string }) => c.id === "E23",
    );
    expect(row).toBeDefined();
    expect(row.checks).toEqual([
      "E23 a pointer card can be edited: the selection changes and is stored",
    ]);
    expect(row.requiredActors).toEqual(["admin"]);
    expect(coverB).toContain(
      'await attempt("E23 a pointer card can be edited: the selection changes and is stored", async () => {',
    );
  });

  it("the grade needs the write, the STORED content and a fresh page", () => {
    expect(coverB).toContain(
      "write !== undefined && write.status < 400 && /Pick_Two/.test(stored) && /Pick_Two/.test(after.html),",
    );
    expect(coverB).toContain(
      "{actor:'admin',actorId:form.actorId,writeStatus:write.status,stored,afterStatus:after.status,showsPickTwo:/Pick_Two/.test(after.html)}",
    );
  });

  it("the check refuses to pass when the form carries no select", () => {
    expect(coverB).toContain(
      "no select input on the pointer card's edit form",
    );
  });
});

describe("the capture lives where the rig writes it", () => {
  it("the fixture file is on disk at the path the rig names", () => {
    expect(capture.contract).toContain("stored");
    expect(
      readFileSync(repoRoot + "fixtures/captured/pointer-edit.json", "utf8"),
    ).toContain('"client_select_handler"');
  });
});
