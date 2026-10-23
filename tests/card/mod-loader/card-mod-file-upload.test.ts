// The FILE UPLOAD pin (registry row cap-F1, "Upload a file (/files route
// after upload)").
//
// ORACLE-PINNED: fixtures/captured/file-upload.json, captured from the
// pinned gemset (card-mod-carrierwave-0.20.0) by
// tests/card/mod-loader/oracle-capture-file-upload.rb.
//
// What the contract is, in the pinned bytes:
//
//   1. card-mod-carrierwave-0.20.0 set/type/file/core.haml - the DOWNLOAD
//      LINK: the whole template is `%a{ href: source }<` and `= t
//      :carrierwave_download, title: title_in_context(voo.title)` - ONE
//      anchor whose href is the attachment's source and whose text is the
//      download label.
//   2. card-mod-carrierwave-0.20.0 config/locales/en.yml - the LABEL:
//      `carrierwave_download: Download %{title}`.
//   3. card-mod-carrierwave-0.20.0 set/type/file.rb - the SOURCE: view
//      :source is `source`, view :core is `handle_source do |source| card_url
//      source end` (the card_url of the attachment's source IS the /files
//      route the row names), def source is `file.valid? ?
//      contextualize_path(file.url) : ""`, and def short_content is
//      `number_to_human_size card.attachment.size`.
//   4. card-mod-carrierwave-0.20.0 set/type/file/file_chooser.haml - the
//      CHOOSER: the file input is `%input.file-upload.slotter.form-control{ id:
//      "card_#{card.type_code}", name: "card[#{card.type_code}]", type: "file"
//      }`, beside `= hidden_field_tag "attachment_type_id", card.type_id` and
//      `= hidden_field card.attachment_name, class: "attachment_card_name",
//      value: ""`.
//   5. card-mod-carrierwave-0.20.0 set/type/file/preview_editor.haml - the
//      CHIP: `.chosen-file` over `%p.name = card.original_filename` and
//      `%span.size = number_to_human_size card.attachment.size`.
//
// The port side is the carrierwave mod
// (src/card/mod-loader/mods/card-mod-carrierwave.ts) for the chooser and the
// chip, the render seam (src/card/render/views.ts) for the download anchor,
// and the human-size helper
// (src/card/mod-loader/mods/rails-number-to-human-size.ts) for the size.
//
// The third leg is the harness's own F1 checks: the upload leg must store
// the file, and the download leg must find EXACTLY ONE anchor whose href is
// the /files route and whose label is the card's own name, with the chooser's
// own carriers and the chip's own filename and human size.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const capture = JSON.parse(
  readFileSync(
    new URL("./../../../fixtures/captured/file-upload.json", import.meta.url),
    "utf8",
  ),
);
const portCarrierwave = readFileSync(
  new URL(
    "./../../../src/card/mod-loader/mods/card-mod-carrierwave.ts",
    import.meta.url,
  ),
  "utf8",
);
const renderViews = readFileSync(
  new URL("./../../../src/card/render/views.ts", import.meta.url),
  "utf8",
);
const humanSize = readFileSync(
  new URL(
    "./../../../src/card/mod-loader/mods/rails-number-to-human-size.ts",
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
const manifest = JSON.parse(
  readFileSync(
    new URL(
      "./../../../fixtures/vendor/mod-script-assets/manifest.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const filePredicate = readFileSync(
  new URL(
    "./../../../tools/edge-signed-in-exercise/lib/file-download-view.mjs",
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

describe("the pinned Ruby's own bytes for the file upload", () => {
  it("the file type's core view is the one-anchor download link", () => {
    expect(capture.facts.core_haml_anchor).toBe("%a{ href: source }<");
    expect(capture.facts.core_haml_label).toBe(
      "= t :carrierwave_download, title: title_in_context(voo.title)",
    );
    expect(capture.facts.download_label).toBe(
      "carrierwave_download: Download %{title}",
    );
  });

  it("the file type owns the source and the human size", () => {
    expect(capture.facts.file_view_source).toBe("view :source do");
    expect(capture.facts.file_view_core).toBe("view :core do");
    expect(capture.facts.file_core_body).toBe("card_url source");
    expect(capture.facts.file_source_body).toBe(
      'file.valid? ? contextualize_path(file.url) : ""',
    );
    expect(capture.facts.file_short_content).toBe(
      "number_to_human_size card.attachment.size",
    );
    expect(capture.facts.local_url).toBe(
      "local_url_base(opts), file_dir, full_filename(url_filename)",
    );
  });

  it("the chooser owns the file input and its own carriers", () => {
    expect(capture.facts.chooser_input).toBe(
      '%input.file-upload.slotter.form-control{ id: "card_#{card.type_code}",',
    );
    expect(capture.facts.chooser_input_name).toBe(
      'name: "card[#{card.type_code}]",',
    );
    expect(capture.facts.chooser_input_type).toBe('type: "file" }');
    expect(capture.facts.chooser_attachment_type_id).toBe(
      '= hidden_field_tag "attachment_type_id", card.type_id',
    );
    expect(capture.facts.chooser_attachment_card_name).toBe(
      '= hidden_field card.attachment_name, class: "attachment_card_name", value: ""',
    );
  });

  it("the chip owns the original filename and the human size", () => {
    expect(capture.facts.chip_name).toBe("= card.original_filename");
    expect(capture.facts.chip_size).toBe(
      "= number_to_human_size card.attachment.size",
    );
  });

  it("the chip owns the original filename and the human size", () => {
    expect(capture.facts.chip_name).toBe("= card.original_filename");
    expect(capture.facts.chip_size).toBe(
      "= number_to_human_size card.attachment.size",
    );
  });

  it("the pinned upload client swaps the chip in", () => {
    expect(capture.facts.upload_client_handler).toBe(
      "doneFile: (e, data) ->",
    );
    expect(capture.facts.upload_client_swap).toBe(
      "editor.find('.chosen-file').replaceWith data.result",
    );
  });

  it("the capture names the gemset it photographed", () => {
    expect(capture.oracle.core_haml.gem).toBe("card-mod-carrierwave-0.20.0");
    expect(capture.oracle.file_type_views.gem).toBe(
      "card-mod-carrierwave-0.20.0",
    );
    expect(capture.oracle.file_chooser.gem).toBe(
      "card-mod-carrierwave-0.20.0",
    );
    expect(capture.oracle.preview_editor.gem).toBe(
      "card-mod-carrierwave-0.20.0",
    );
    expect(capture.oracle.upload_client.gem).toBe(
      "card-mod-carrierwave-0.20.0",
    );
    for (const owner of Object.values(capture.oracle) as Array<{
      file_sha256: string;
    }>) {
      expect(owner.file_sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

describe("the port carries the pinned bytes", () => {
  it("the port's chooser carries the pinned file input and carriers", () => {
    expect(portCarrierwave).toContain(
      "`<input class='file-upload slotter form-control' id='card_${mount}' name='card[${mount}]' type='file'>\\n` +",
    );
    expect(portCarrierwave).toContain(
      '`<input type="hidden" name="attachment_type_id" id="attachment_type_id" value="${typeId}" autocomplete="off" />\\n` +',
    );
    expect(portCarrierwave).toContain(
      '`<input class="attachment_card_name form-control" value="" autocomplete="off" type="hidden" name="card[${mount}]" id="card_${mount}" />\\n` +',
    );
  });

  it("the port's chip carries the pinned filename and size", () => {
    expect(portCarrierwave).toContain(
      "\"<div class='chosen-file'>\\n\" +",
    );
    expect(portCarrierwave).toContain("\"<p class='name'>\\n\" +");
    expect(portCarrierwave).toContain("\"<span class='size'>\\n\" +");
    expect(portCarrierwave).toContain("${numberToHumanSize(size)}\\n");
  });

  it("the port's download anchor is the pinned one-anchor shape", () => {
    expect(renderViews).toContain(
      "export function formatFileCore(",
    );
    expect(renderViews).toContain(
      "return `<a href='${h(source)}'>Download ${h(title)}</a>\\n`;",
    );
  });

  it("the port's human size is the pinned number_to_human_size", () => {
    expect(humanSize).toContain(
      "export function numberToHumanSize(size: number): string {",
    );
    expect(humanSize).toContain('if (size === 1) return "1 Byte";');
    expect(humanSize).toContain("return `${size} Bytes`;");
  });

  it("the upload client the port serves IS the pinned gem's own file", () => {
    const asset = capture.port_upload_client_asset as {
      files_are_byte_identical: boolean;
      differing_line_count: number;
      gem_sha256: string;
      port_sha256: string;
    };
    expect(asset.differing_line_count).toBe(0);
    expect(asset.files_are_byte_identical).toBe(true);
    expect(asset.gem_sha256).toBe(asset.port_sha256);
    // The file the port serves carries the pinned chip-swap handler.
    const vendored = readFileSync(
      new URL(
        "./../../../fixtures/vendor/mod-script-assets/card-mod-carrierwave/assets/script/upload.js.coffee",
        import.meta.url,
      ),
      "utf8",
    );
    expect(vendored).toContain("doneFile: (e, data) ->");
    expect(vendored).toContain(
      "editor.find('.chosen-file').replaceWith data.result",
    );
    // The manifest pins that file by its digest.
    const groups = manifest.mods.carrierwave as Array<{
      files: Array<{ file: string; sha256: string }>;
    }>;
    const entry = groups
      .flatMap((group) => group.files)
      .find((file) => file.file.endsWith("upload.js.coffee"));
    expect(entry).toBeDefined();
    expect(entry?.sha256).toBe(asset.port_sha256);
  });
});

describe("the harness's F1 checks cannot pass vacuously", () => {
  it("the row declares exactly the instrument's two check names", () => {
    const row = capabilities.capabilities.find(
      (c: { id: string }) => c.id === "F1",
    );
    expect(row).toBeDefined();
    expect(row.checks).toEqual([
      "F1 a file can be uploaded through the File create form",
      "F1 the uploaded card offers the /files route as a Download link",
    ]);
    for (const name of row.checks) {
      expect(coverB).toContain(`"${name}"`);
    }
  });

  it("the download leg grades exactly one anchor on the /files route", () => {
    expect(filePredicate).toContain(
      'if (anchors.length === 0) failures.push("noDownloadAnchor");',
    );
    expect(filePredicate).toContain(
      'if (anchors.length > 1) failures.push("multipleDownloadAnchors");',
    );
    expect(filePredicate).toContain(
      'if (!isFileSourceHref(anchor.attrs.href)) failures.push("hrefNotFilesRoute");',
    );
    expect(filePredicate).toContain(
      'if (anchor.title !== expected) failures.push("labelNotCardName");',
    );
  });

  it("the download leg grades the chip and the chooser's own carriers", () => {
    expect(filePredicate).toContain(
      'failures.push("noChosenFileChip");',
    );
    expect(filePredicate).toContain(
      'if (!/\\bfile-upload\\b/.test(String(attrs.class ?? ""))) failures.push("notFileUpload");',
    );
    expect(filePredicate).toContain(
      'if (!cardNameField.present) failures.push("noAttachmentCardName");',
    );
    expect(filePredicate).toContain(
      'if (typeId === null) failures.push("noAttachmentTypeId");',
    );
  });

  it("the upload leg grades the stored file, not a 200", () => {
    expect(coverB).toContain(
      "write !== undefined && write.status < 400 && after.status === 200 && verdict.ok,",
    );
  });
});

describe("the capture lives where the rig writes it", () => {
  it("the fixture file is on disk at the path the rig names", () => {
    expect(capture.contract).toContain("/files route");
    expect(
      readFileSync(repoRoot + "fixtures/captured/file-upload.json", "utf8"),
    ).toContain('"core_haml_anchor"');
  });
});
