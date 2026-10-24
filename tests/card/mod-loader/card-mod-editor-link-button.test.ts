// The editor's LINK BUTTON pin (registry row cap-E6, "Link button ([[ ]])
// inserts a link").
//
// ORACLE-PINNED: fixtures/captured/editor-link-button.json, captured from
// the pinned gemset (card-mod-tinymce_editor-0.20.0, card-mod-content-0.20.0)
// by tests/card/mod-loader/oracle-capture-editor-link-button.rb.
//
// What the contract is, in the pinned bytes:
//
//   1. card-mod-tinymce_editor-0.20.0 assets/script/link_editor.js.coffee -
//      the CLIENT half, and the owner of the syntax itself: it opens the
//      editor with the delimiters "[[" and "]]", rebuilds the preview as
//      "[[" + target (+ "|" + title), gives the target a "+" prefix when the
//      field toggle is on, and the preview's own shape is
//      "[[#{target}|#{title}]]".
//   2. card-mod-tinymce_editor-0.20.0 set/all/reference_editor/
//      _link_editor.haml - the dialog's own fields: link_name (class
//      "form-control _link-target _autocomplete"), the field toggle
//      (check_box_tag :field, "field", id "link-editor-field"), link_title
//      (class "form-control _link-title").
//   3. card-mod-tinymce_editor-0.20.0 set/all/reference_editor/
//      reference_editor.haml - the shared chrome: the preview input
//      (text_field_tag "preview", snippet.raw, class "_#{ref_type}-preview
//      w-100 text-muted") and the apply button's class
//      "_#{ref_type}-apply".
//   4. card-mod-tinymce_editor-0.20.0 set/all/reference_editor/link_editor/
//      link_parser.rb - LinkParser: the absent-params arm is
//      `Link.new("", {}, "[[ ]]")`, and init_name strips the "+" from a
//      field's name.
//   5. card-mod-content-0.20.0 lib/card/content/chunk/link.rb - the chunk
//      that MATCHES the inserted text and renders it as a link: full_re
//      /\A\[\[([^\]]+)\]\]/, options { title: ... }, and render_name_link
//      nests the referee at view: :link.
//
// The port side is the editor mod
// (src/card/mod-loader/mods/card-mod-tinymce_editor.ts) for the dialog and
// the chunk, and the VENDORED gem script for the client half: the port
// serves the gem's OWN link_editor.js.coffee bytes, and the pin proves it by
// digest - the vendored copy the engine serves and the manifest's recorded
// digest must both equal the pinned gem file's own SHA-256.
//
// The third leg is the harness's own E6 check, which must grade the stored
// snippet AND the rendered link on the card's page, so it cannot pass on a
// dialog that merely opens.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const capture = JSON.parse(
  readFileSync(
    new URL("./../../../fixtures/captured/editor-link-button.json", import.meta.url),
    "utf8",
  ),
);
const portSource = readFileSync(
  new URL(
    "./../../../src/card/mod-loader/mods/card-mod-tinymce_editor.ts",
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
const vendoredLinkScript = readFileSync(
  new URL(
    "./../../../fixtures/vendor/mod-script-assets/card-mod-tinymce_editor/assets/script/link_editor.js.coffee",
    import.meta.url,
  ),
  "utf8",
);
const dialogs = readFileSync(
  new URL("./../../../tools/edge-signed-in-exercise/lib/editor-dialogs.mjs", import.meta.url),
  "utf8",
);

const sha256 = (text: string) =>
  createHash("sha256").update(text, "utf8").digest("hex");

describe("the pinned Ruby's own bytes for the editor's link button", () => {
  it("the client script owns the syntax and the delimiters", () => {
    expect(capture.facts.open_editor_delimiters).toBe(
      'nest.editParams(tm, "[[", "]]")',
    );
    expect(capture.facts.apply_snippet).toBe(
      'nest.applySnippet("link", tinymce_id, link_start, link_size)',
    );
    expect(capture.facts.preview_target_and_title).toBe(
      '"[[" + link.target() + "|" + link.title()',
    );
    expect(capture.facts.preview_default_shape).toBe(
      "[[#{link.target()}|#{link.title()}]]",
    );
    expect(capture.facts.field_prefix).toBe('then "+#{name}" else name');
    expect(capture.facts.add_plus_arm).toBe('"[[+"');
    expect(capture.facts.remove_plus_arm).toBe('"[[")');
  });

  it("the dialog owns its own field names and classes", () => {
    expect(capture.facts.link_name_field).toBe('text_field_tag "link_name"');
    expect(capture.facts.link_name_class).toBe(
      'class: "form-control _link-target _autocomplete"',
    );
    expect(capture.facts.link_title_field).toBe('text_field_tag "link_title"');
    expect(capture.facts.link_title_class).toBe(
      'class: "form-control _link-title"',
    );
    expect(capture.facts.field_toggle).toBe(
      'check_box_tag :field, "field"',
    );
    expect(capture.facts.field_toggle_id).toBe('id: "link-editor-field"');
    expect(capture.facts.preview_input).toBe(
      'text_field_tag "preview", snippet.raw',
    );
    expect(capture.facts.preview_class).toBe(
      'class: "_#{ref_type}-preview w-100 text-muted", readonly: true',
    );
    expect(capture.facts.apply_class).toBe(
      'class: "_#{ref_type}-apply btn-sm me-3"',
    );
  });

  it("the parser owns the blank raw and the field arm", () => {
    expect(capture.facts.parser_default_raw).toBe('Link.new("", {}, "[[ ]]")');
    expect(capture.facts.parser_field_arm).toBe(
      "@name = @field ? name.to_s[1..] : name",
    );
  });

  it("the content chunk owns the matcher and the link nest", () => {
    expect(capture.facts.chunk_full_re).toBe(
      "full_re: /\\A\\[\\[([^\\]]+)\\]\\]/,",
    );
    expect(capture.facts.chunk_options).toBe(
      "{ title: link_text || @name.to_name.fully_stripped }",
    );
    expect(capture.facts.chunk_render_name_link).toBe(
      "format.nest referee_name, options.merge(view: view)",
    );
  });

  it("the capture names the gemset it photographed", () => {
    expect(capture.oracle.link_editor_script.gem).toBe(
      "card-mod-tinymce_editor-0.20.0",
    );
    expect(capture.oracle.link_chunk.gem).toBe("card-mod-content-0.20.0");
    expect(capture.oracle.link_editor_script.file_sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("the port carries the pinned bytes", () => {
  it("the client script the port serves IS the pinned gem's own file", () => {
    const pinned = capture.oracle.link_editor_script.file_sha256;
    expect(sha256(vendoredLinkScript)).toBe(pinned);
    const groups = manifest.mods.tinymce_editor as Array<{
      files: Array<{ file: string; sha256: string }>;
    }>;
    const entry = groups
      .flatMap((group) => group.files)
      .find((file) => file.file.endsWith("link_editor.js.coffee"));
    expect(entry).toBeDefined();
    expect(entry?.sha256).toBe(pinned);
  });

  it("the dialog carries the pinned field names and classes", () => {
    expect(portSource).toContain('name="link_name" id="link_name"');
    expect(portSource).toContain(
      'class="form-control _link-target _autocomplete"',
    );
    expect(portSource).toContain('name="link_title" id="link_title"');
    expect(portSource).toContain('class="form-control _link-title"');
    expect(portSource).toContain('name="field" id="link-editor-field"');
    expect(portSource).toContain('class="_link-field-toggle"');
    expect(portSource).toContain('class="_link-preview w-100 text-muted"');
    expect(portSource).toContain('class="_link-apply btn-sm me-3');
  });

  it("the port's blank raw is the pinned blank raw", () => {
    expect(portSource).toContain('return new LinkParser("[[ ]]", false, "", {});');
  });

  it("the port's chunk matcher is the pinned matcher", () => {
    expect(portSource).toContain(
      "const match = /^\\[\\[([^\\]]+)\\]\\]/.exec(linkString);",
    );
  });

  it("the port's title option is the pinned title option", () => {
    expect(portSource).toContain(
      "// link.rb#options: { title: link_text || @name.to_name.fully_stripped }",
    );
  });
});

describe("the harness's E6 check cannot pass vacuously", () => {
  it("records under the row's exact check name", () => {
    expect(dialogs).toContain(
      "E6 the editor's link button inserts a reference that renders as a link",
    );
  });

  it("grades the stored snippet AND the rendered link on the card's page", () => {
    expect(dialogs).toContain(
      "saveStatus<400&&stored.includes(preview)&&fresh.status===200&&renderedLink",
    );
    expect(dialogs).toContain(
      "const renderedLink=href!==null&&new URL(href,stack.origin).pathname==='/Home';",
    );
  });
});

describe("the capture lives where the rig writes it", () => {
  it("the fixture file is on disk at the path the rig names", () => {
    expect(capture.contract).toContain("link");
    expect(
      readFileSync(repoRoot + "fixtures/captured/editor-link-button.json", "utf8"),
    ).toContain('"open_editor_delimiters"');
  });
});
