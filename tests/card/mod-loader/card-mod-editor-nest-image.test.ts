// The NEST IMAGE editor pin (registry row cap-E8, "Nest image editor").
//
// ORACLE-PINNED: fixtures/captured/editor-nest-image.json, captured from the
// pinned gemset (card-mod-tinymce_editor-0.20.0, card-mod-content-0.20.0) by
// tests/card/mod-loader/oracle-capture-editor-nest-image.rb.
//
// What the contract is, in the pinned bytes:
//
//   1. card-mod-tinymce_editor-0.20.0 assets/script/image_editor.js.coffee -
//      the CLIENT half, and the owner of the inserted syntax: the preview is
//      written as "{{ #{name} | view: #{view}; size: #{size} }}" and the
//      preview slot is reloaded from "#{name}?view=#{view}&size=#{size}"; the
//      view and size selects are wired to that update by the select2:select
//      handlers on ._image-view-select and ._image-size-select.
//   2. card-mod-tinymce_editor-0.20.0 set/all/reference_editor/nest_editor/
//      _image_options.haml - the dialog's View and Size groups.
//   3. card-mod-tinymce_editor-0.20.0 set/all/reference_editor/nest_editor/
//      _image_find.haml - the image name select (class "_image-card-select
//      _image-name _no-select2-init").
//   4. card-mod-tinymce_editor-0.20.0 set/all/reference_editor/nest_editor/
//      nest_editor_options.rb - the two selects' own bodies (view: class
//      "tags _image-view-select" with data-placeholder "Select view"; size:
//      size_select_options(:medium) with class "_image-size-select").
//   5. card-mod-content-0.20.0 lib/card/content/chunk/nest.rb - the chunk
//      that READS the inserted options: the option string splits on ";" and
//      each pair on ":", and a value without a key is the view
//      (DEFAULT_OPTION = :view).
//
// The port side is the editor mod
// (src/card/mod-loader/mods/card-mod-tinymce_editor.ts) for the dialog, the
// nest syntax reader (src/card/render/nest-syntax.ts) for the option parsing,
// and the VENDORED gem script for the client half: the port serves the gem's
// OWN image_editor.js.coffee bytes, and the pin proves it by digest - the
// vendored copy the engine serves and the manifest's recorded digest must
// both equal the pinned gem file's own SHA-256.
//
// The third leg is the harness's own E8 check, which must grade the inserted
// nest's view and size options on the STORED card, so it cannot pass on a
// dialog that merely opens.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const capture = JSON.parse(
  readFileSync(
    new URL("./../../../fixtures/captured/editor-nest-image.json", import.meta.url),
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
const nestSyntax = readFileSync(
  new URL("./../../../src/card/render/nest-syntax.ts", import.meta.url),
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
const vendoredImageScript = readFileSync(
  new URL(
    "./../../../fixtures/vendor/mod-script-assets/card-mod-tinymce_editor/assets/script/image_editor.js.coffee",
    import.meta.url,
  ),
);
const dialogs = readFileSync(
  new URL("./../../../tools/edge-signed-in-exercise/lib/editor-dialogs.mjs", import.meta.url),
  "utf8",
);

const sha256 = (text: string) =>
  createHash("sha256").update(text, "utf8").digest("hex");

describe("the pinned Ruby's own bytes for the nest image editor", () => {
  it("the client script owns the inserted syntax", () => {
    expect(capture.facts.preview_syntax).toBe(
      'syntaxPreview.val("{{ #{name} | view: #{view}; size: #{size} }}")',
    );
    expect(capture.facts.preview_path).toBe(
      'path = "#{name}?view=#{view}&size=#{size}"',
    );
    expect(capture.facts.view_select_event).toBe(
      "on 'select2:select', '._image-view-select'",
    );
    expect(capture.facts.size_select_event).toBe(
      "on 'select2:select', '._image-size-select'",
    );
  });

  it("the dialog owns the view and size groups and the name select", () => {
    expect(capture.facts.image_options_view).toBe("= image_view_select snippet.view");
    expect(capture.facts.image_options_size).toBe("= image_size_select");
    expect(capture.facts.image_name_select).toBe(
      'select_tag "image-name-select", "",',
    );
    expect(capture.facts.image_name_select_class).toBe(
      'class: "_image-card-select _image-name _no-select2-init"',
    );
  });

  it("the two selects own their own names, classes and default", () => {
    expect(capture.facts.image_view_select_name).toBe(
      "select_tag :view, options_for_select(view_list.unshift(nil), selected: selected)",
    );
    expect(capture.facts.image_view_select_class).toBe(
      'class: "tags _image-view-select"',
    );
    expect(capture.facts.image_view_select_placeholder).toBe(
      '"data-placeholder": "Select view"',
    );
    expect(capture.facts.image_size_select_name).toBe(
      "select_tag :size, size_select_options(:medium)",
    );
    expect(capture.facts.image_size_select_class).toBe(
      'class: "_image-size-select"',
    );
  });

  it("the nest chunk owns the option parsing", () => {
    expect(capture.facts.nest_default_option).toBe("DEFAULT_OPTION = :view");
    expect(capture.facts.nest_option_list_split).toBe(
      'attr_string.strip.split(";").each do |pair|',
    );
    expect(capture.facts.nest_option_pair_split).toBe(
      'value, key = pair.split(":", 2).reverse',
    );
  });

  it("the capture names the gemset it photographed", () => {
    expect(capture.oracle.image_editor_script.gem).toBe(
      "card-mod-tinymce_editor-0.20.0",
    );
    expect(capture.oracle.nest_chunk.gem).toBe("card-mod-content-0.20.0");
    expect(capture.oracle.image_editor_script.file_sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("the port carries the pinned bytes", () => {
  it("the client script the port serves IS the pinned gem's own file", () => {
    const pinned = capture.oracle.image_editor_script.file_sha256;
    expect(sha256(vendoredImageScript)).toBe(pinned);
    const groups = manifest.mods.tinymce_editor as Array<{
      files: Array<{ file: string; sha256: string }>;
    }>;
    const entry = groups
      .flatMap((group) => group.files)
      .find((file) => file.file.endsWith("image_editor.js.coffee"));
    expect(entry).toBeDefined();
    expect(entry?.sha256).toBe(pinned);
  });

  it("the dialog carries the pinned select names and classes", () => {
    expect(portSource).toContain('["class", "tags _image-view-select"]');
    expect(portSource).toContain('["data-placeholder", "Select view"]');
    expect(portSource).toContain('["class", "_image-size-select"]');
    expect(portSource).toContain(
      '<select name="image-name-select" id="image-name-select" class="_image-card-select _image-name _no-select2-init" data-dropdown-parent="true"></select>',
    );
  });

  it("the port's option reader splits the way the pinned chunk splits", () => {
    expect(nestSyntax).toContain('const DEFAULT_OPTION = "view";');
    expect(nestSyntax).toContain('for (const pair of listString.trim().split(";")) {');
    expect(nestSyntax).toContain(
      "const key = (colon === -1 ? DEFAULT_OPTION : pair.slice(0, colon)).trim();",
    );
  });
});

describe("the harness's E8 check cannot pass vacuously", () => {
  it("records under the row's exact check name", () => {
    expect(dialogs).toContain(
      "E8 the nest image editor inserts a nest with view and size options",
    );
  });

  it("grades the inserted view and size options on the stored card", () => {
    expect(dialogs).toContain(
      "hasSnippet(inserted,image.name)&&saveStatus<400&&hasSnippet(stored,image.name)",
    );
    expect(dialogs).toContain(
      "const hasSnippet=(value,name)=>value.includes(name)&&value.includes('{{')&&/view:\\s*titled/.test(value)&&/size:\\s*small/.test(value);",
    );
  });
});

describe("the capture lives where the rig writes it", () => {
  it("the fixture file is on disk at the path the rig names", () => {
    expect(capture.contract).toContain("image");
    expect(
      readFileSync(repoRoot + "fixtures/captured/editor-nest-image.json", "utf8"),
    ).toContain('"preview_syntax"');
  });
});
