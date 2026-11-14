// The F1 leg - the /files route a File card offers after an upload - graded on
// the bytes Ruby renders.
//
//   node --test tools/edge-signed-in-exercise/test/file-download-view.test.mjs
//
// PINNED AGAINST COMMITTED RUBY REFERENCE BYTES:
//
// fixtures/vendor/card-mod-carrierwave-0.20.0/ holds four files copied verbatim
// out of the gem: set/type/file/core.haml (the download anchor), its config
// locale en.yml (the "Download %{title}" label), file_chooser.haml (the upload
// control and its hidden carriers) and preview_editor.haml (the filename and
// humanized size chip). Test 1 asserts each file's sha256, so a vendored copy
// that drifts from the gem fails here rather than passing quietly. Every other
// expectation below is READ OUT of those bytes or out of the committed capture
// fixtures/captured/oracle-upload-file-tree.json (the real Ruby deck's stored
// upload tree) - none of it is transcribed from memory.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  DOWNLOAD_LABEL,
  attachmentCardNameField,
  chosenFileChip,
  downloadAnchors,
  fileCardOffersDownload,
  fileChooserShape,
  humanizedSize,
  isFileSourceHref,
  isStoredFilePath,
} from "../lib/file-download-view.mjs";

const VENDOR = new URL("../../../fixtures/vendor/card-mod-carrierwave-0.20.0/", import.meta.url);
const TREE = JSON.parse(
  readFileSync(new URL("../../../fixtures/captured/oracle-upload-file-tree.json", import.meta.url), "utf8"),
);

const readVendor = (path) => readFileSync(new URL(path, VENDOR));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

test("the vendored Ruby view bytes are byte-identical to the gem's", () => {
  // Digests taken from card-mod-carrierwave-0.20.0 as installed.
  const expected = {
    "set/type/file/core.haml": "e67dfa80eff6c4855b40b3dfae6c1161a5a56010f6b28274ea22fa7223a8009b",
    "config/locales/en.yml": "147d9e544469992cd77962dd6d4e8ca3512041e8d3eeb2e4f8a81d061a4916be",
    "set/type/file/file_chooser.haml": "680c172346b47bcd7cd47ac021877be22da15412e9a1d31e97c554b5e932dff5",
    "set/type/file/preview_editor.haml": "7afe7308736e0fd63476eca0a4912302032a720e9c3e2e5d1a9811ee57de33af",
  };
  for (const [path, digest] of Object.entries(expected)) {
    assert.equal(sha256(readVendor(path)), digest, `${path} drifted from the gem`);
  }
});

test("the label and the chip structure are read out of Ruby's own bytes", () => {
  const locale = readVendor("config/locales/en.yml").toString("utf8");
  const label = /carrierwave_download:\s*(.+)/.exec(locale);
  assert.equal(label !== null, true, "en.yml declares no carrierwave_download");
  assert.equal(label[1].trim(), "Download %{title}");
  assert.equal(DOWNLOAD_LABEL, label[1].trim().split(" ")[0]);

  const chooser = readVendor("set/type/file/file_chooser.haml").toString("utf8");
  for (const needle of ['.choose-file', "file-upload", 'type: "file"', "attachment_type_id", "attachment_card_name", "file_card_name"]) {
    assert.equal(chooser.includes(needle), true, `file_chooser.haml lacks ${needle}`);
  }

  const preview = readVendor("set/type/file/preview_editor.haml").toString("utf8");
  assert.equal(preview.includes(".chosen-file"), true);
  assert.equal(preview.includes("card.original_filename"), true);
  assert.equal(preview.includes("number_to_human_size card.attachment.size"), true);
});

test("the stored path shape is the one a real Ruby deck's upload tree holds", () => {
  const paths = TREE.files.map((f) => f.path);
  assert.equal(paths.length > 0, true);
  for (const path of paths.filter((p) => p !== ".keep")) {
    assert.equal(isStoredFilePath(path), true, `${path} is not a Ruby stored path`);
  }
  // The tree's digests and sizes are the real bytes' facts, not placeholders.
  assert.equal(TREE.files.every((f) => typeof f.sha256 === "string" && f.sha256.length === 64), true);
  // And every route the deck serves is under /files.
  assert.equal(isFileSourceHref("/files/1346/5026.png"), true);
  assert.equal(isFileSourceHref("/files/307/1790061389.js"), true);
  // set/type/file.rb:47-50 returns card.attachment.url, so a cloud storage
  // adapter's own absolute URL is a legal source and its path need not start
  // with /files.
  assert.equal(isFileSourceHref("https://cdn.example/deck/1346/5026.png"), true);
  // A relative source has to be the deck's own route.
  assert.equal(isFileSourceHref(""), false);
  assert.equal(isFileSourceHref("/update/Other"), false);
  assert.equal(isFileSourceHref("javascript:alert(1)"), false);
});

test("Rails' humanized sizes are the ones Ruby's own scenario asserts", () => {
  // attach.feature: `Then I should see file "file.txt 9 Bytes"`.
  assert.equal(humanizedSize(9), "9 Bytes");
  // attach.feature: `Then I should see file "image.png 34.3 KB"`. The spec
  // states the HUMANIZED size, so the byte count is the one that humanizes to
  // it: 35123/1024 = 34.299 -> "34.3 KB".
  assert.equal(humanizedSize(35123), "34.3 KB");
  assert.equal(humanizedSize(1024), "1 KB");
  assert.equal(humanizedSize(1048576), "1 MB");
  assert.equal(humanizedSize(-1), null);
  assert.equal(humanizedSize("nine"), null);
});

/** Ruby's own views, rendered. The bytes are the COMMITTED real-Ruby
 *  capture's, not a transcription of the HAML: the capture is
 *  reference-harness/fixtures/synthetic-v2-mod-probes/expected/render.jsonl
 *  (arms probe-view:98:input@set/type/file.rb, the chooser, and
 *  probe-view:96:input@set/self/new_file.rb), and the HAML's attr_wrapper in
 *  this gem is the APOSTROPHE - Ruby's own bytes carry class='chosen-file',
 *  while a browser's DOM serialization of them carries class="chosen-file".
 *  Both quoting styles are read, so both forms are pinned below.
 *
 *  THREE SURFACES, because Ruby's scenario asserts on three:
 *    core.haml          the download anchor, on the SAVED card's page
 *    file_chooser.haml  the upload control and its carriers, on the CREATE form
 *    preview_editor.haml the chip, in the upload round trip's RESPONSE
 *  The chip is NOT on the saved card's page: outside the round trip Ruby
 *  RAISES in that view (set/type/file.rb:145), and the committed capture of
 *  probe-view:100:preview_editor@set/type/file.rb is that raise, verbatim. */
function rubyCoreBytes(cardName, filename) {
  return `<a href='/files/${cardName.length}/${filename}'>${DOWNLOAD_LABEL} ${cardName}</a>`;
}

/** The chooser, as Ruby renders it: the capture's own bytes, with the
 *  bootstrap form class on the hidden field (card-mod-bootstrap's form
 *  component adds it to every field) and the type id the capture carries. */
function rubyChooserBytes(typeId = 282) {
  return (
    `<div class='choose-file'>\n` +
    `\n` +
    `<span class='btn btn-secondary fileinput-button'>\n` +
    `<i class="notranslate material-icons">cloud_upload</i>\n` +
    `<span>Replace File...</span>\n` +
    `<input class='file-upload slotter form-control' id='card_file' name='card[file]' type='file'>\n` +
    `<input type="hidden" name="attachment_type_id" id="attachment_type_id" value="${typeId}" autocomplete="off" />\n` +
    `<input class="attachment_card_name form-control" value="" autocomplete="off" type="hidden" name="card[file]" id="card_file" />\n` +
    `<input type="hidden" name="file_card_name" id="file_card_name" value="*new_file" autocomplete="off" />\n` +
    `</span>\n` +
    `</div>\n` +
    `<div class='progress mb-2' id='progress' style='display: none;'>\n` +
    `<div class='progress-bar progress-bar-success' style='width: 0%;'></div>\n` +
    `</div>\n` +
    `<div class='chosen-file'></div>\n`
  );
}

/** The preview editor: the chip, as the round trip's response carries it. */
function rubyPreviewBytes(filename, bytes, actionId = 12345) {
  return (
    `<div class='chosen-file'>\n` +
    `<input name='card[file]' type='hidden' value='${actionId}'>\n` +
    `<div class='d-flex'>\n` +
    `\n` +
    `<div class='d-flex flex-column justify-content-between ml-2 w-100'>\n` +
    `<div>\n` +
    `<p class='name'>\n${filename}\n</p>\n` +
    `<span class='size'>\n${humanizedSize(bytes)}\n</span>\n` +
    `</div>\n` +
    `<div class='align-self-end'>\n` +
    `<button class='btn btn-danger delete cancel-upload' data-type='DELETE'>\n` +
    `<i class="notranslate material-icons">delete</i>\n` +
    `<span>\nDelete\n</span>\n` +
    `</button>\n` +
    `</div>\n` +
    `</div>\n` +
    `</div>\n` +
    `</div>\n`
  );
}

/** The chip document: the upload round trip's response, which the gem's
 *  upload.js.coffee swaps into the chooser's `.chosen-file`. */
function rubyChipBytes(filename, bytes) {
  return (
    `<div class="chosen-file"><p class="name">${filename}</p><span class="size">${humanizedSize(bytes)}</span>` +
    `<button class="delete cancel-upload" data-type="DELETE"></button></div>`
  );
}

/** What a browser's DOM serialization of Ruby's bytes looks like: the same
 *  markup, every attribute quoted with the double quote. */
function asDom(html) {
  return html.replace(/'/g, '"');
}

test("the committed real-Ruby capture's own chooser bytes pass the chooser half", () => {
  // The capture, not a transcription of it:
  // reference-harness/fixtures/synthetic-v2-mod-probes/expected/render.jsonl,
  // arm probe-view:98:input@set/type/file.rb. This is what a real Ruby deck
  // serves for a File card's create form, and the chooser half has to read
  // it - including the bootstrap form class the HAML does not name.
  const capture = readFileSync(
    new URL("../../../reference-harness/fixtures/synthetic-v2-mod-probes/expected/render.jsonl", import.meta.url),
    "utf8",
  );
  const arms = new Map();
  for (const line of capture.split("\n").filter(Boolean)) {
    const parsed = JSON.parse(line);
    arms.set(parsed.id, parsed.result?.html ?? "");
  }
  const chooser = arms.get("probe-view:98:input@set/type/file.rb");
  assert.equal(typeof chooser, "string", "the capture carries no File chooser arm");
  const shape = fileChooserShape(chooser);
  assert.equal(shape.ok, true, shape.failures.join(", "));
  assert.equal(shape.attachmentTypeId, "282");
  assert.equal(shape.attachmentCardName, "");
  assert.equal(shape.control.name, "card[file]");
  // The chooser's own .chosen-file is EMPTY in Ruby: the chip arrives in the
  // round trip's response, not here.
  assert.equal(chosenFileChip(chooser).filename, null);
});

test("the committed real-Ruby capture says the preview editor raises outside the round trip", () => {
  // The same capture, arm probe-view:100:preview_editor@set/type/file.rb:
  // Ruby renders that view ONLY inside the upload round trip. Outside it the
  // view raises, so the chip cannot be on the saved card's page - in Ruby or
  // in the port. This is the reason the chip half is read from the round
  // trip's response.
  const capture = readFileSync(
    new URL("../../../reference-harness/fixtures/synthetic-v2-mod-probes/expected/render.jsonl", import.meta.url),
    "utf8",
  );
  const arm = capture.split("\n").filter(Boolean)
    .map((line) => JSON.parse(line))
    .find((parsed) => parsed.id === "probe-view:100:preview_editor@set/type/file.rb");
  assert.equal(typeof arm, "object", "the capture carries no preview_editor arm");
  const html = arm.result?.html ?? "";
  // The capture HTML-escapes the raise's own message, twice over.
  assert.equal(html.includes("gsub"), true, "the capture's preview_editor arm is not the raise");
  assert.equal(html.includes("for nil"), true, "the capture's preview_editor arm is not the raise");
  assert.equal(html.includes("set/type/file.rb:145"), true, "the raise is not at set/type/file.rb:145");
  assert.equal(chosenFileChip(html), null, "the raise carries no chip");
});

test("a File card that offers the /files route and its chip passes every leg", () => {
  const verdict = fileCardOffersDownload({
    cardName: "a test file",
    coreHtml: rubyCoreBytes("a test file", "file.txt"),
    chooserHtml: rubyChooserBytes(),
    chipHtml: rubyChipBytes("file.txt", 9),
    originalFilename: "file.txt",
    bytes: 9,
  });
  assert.deepEqual(verdict.failures, []);
  assert.equal(verdict.ok, true);
  assert.equal(verdict.download.text, "Download a test file");
});

test("the same three surfaces pass in the browser's own quoting of Ruby's bytes", () => {
  const verdict = fileCardOffersDownload({
    cardName: "a test file",
    coreHtml: asDom(rubyCoreBytes("a test file", "file.txt")),
    chooserHtml: asDom(rubyChooserBytes()),
    previewHtml: asDom(rubyPreviewBytes("file.txt", 9)),
    originalFilename: "file.txt",
    bytes: 9,
  });
  assert.deepEqual(verdict.failures, []);
  assert.equal(verdict.ok, true);
});

test("the chooser's hidden carrier is found by its class TOKEN, as Ruby renders it", () => {
  // Ruby's own bytes carry class="attachment_card_name form-control"
  // (card-mod-bootstrap adds the form class to every field). The field is
  // there; a check that grades the whole attribute value against the HAML's
  // literal reads it as absent.
  const shape = fileChooserShape(rubyChooserBytes());
  assert.equal(shape.ok, true, shape.failures.join(", "));
  assert.equal(shape.attachmentTypeId, "282");
  assert.equal(shape.attachmentCardName, "");
  assert.equal(shape.control.name, "card[file]");
  assert.equal(shape.control.class, "file-upload slotter form-control");
  // And the DOM form of the same bytes.
  const domShape = fileChooserShape(asDom(rubyChooserBytes()));
  assert.equal(domShape.ok, true, domShape.failures.join(", "));
  // A field with a different class is still absent.
  const other = fileChooserShape(rubyChooserBytes().replace("attachment_card_name form-control", "something_else"));
  assert.equal(other.failures.includes("noAttachmentCardName"), true);
});

test("the chip is read from the round trip's preview, not from the saved card's page", () => {
  // The saved card's page carries the core view and nothing else, in Ruby
  // and in the port: the preview editor RAISES outside the round trip
  // (set/type/file.rb:145), so no chip can be there.
  const savedPage = rubyCoreBytes("a test file", "file.txt");
  const verdict = fileCardOffersDownload({
    cardName: "a test file",
    coreHtml: savedPage,
    chooserHtml: rubyChooserBytes(),
    previewHtml: rubyPreviewBytes("file.txt", 9),
    originalFilename: "file.txt",
    bytes: 9,
  });
  assert.equal(verdict.ok, true, verdict.failures.join(", "));
  // With no preview at all, the chip half fails by name.
  const noPreview = fileCardOffersDownload({
    cardName: "a test file",
    coreHtml: savedPage,
    chooserHtml: rubyChooserBytes(),
    originalFilename: "file.txt",
    bytes: 9,
  });
  assert.equal(noPreview.failures.includes("noChosenFileChip"), true);
});

test("the card name is relativized against its context, as title_in_context does", () => {
  const verdict = fileCardOffersDownload({
    cardName: "parent+child",
    coreHtml: rubyCoreBytes("+child", "file.txt"),
    chooserHtml: rubyChooserBytes(),
    chipHtml: rubyChipBytes("file.txt", 9),
    originalFilename: "file.txt",
    bytes: 9,
  });
  assert.equal(verdict.ok, true, verdict.failures.join(", "));
});

test("a card with no download anchor fails: the /files route never rendered", () => {
  const verdict = fileCardOffersDownload({
    cardName: "a test file",
    coreHtml: "<p>no file here</p>",
    chooserHtml: rubyChooserBytes(),
    chipHtml: rubyChipBytes("file.txt", 9),
    originalFilename: "file.txt",
    bytes: 9,
  });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.failures.includes("noDownloadAnchor"), true);
});

test("an anchor whose href is not the files route fails, which a text read cannot see", () => {
  const html = rubyCoreBytes("a test file", "file.txt").replace("href='/files/11/file.txt'", "href='/update/Other'");
  const verdict = fileCardOffersDownload({
    cardName: "a test file", coreHtml: html,
    chooserHtml: rubyChooserBytes(), chipHtml: rubyChipBytes("file.txt", 9),
    originalFilename: "file.txt", bytes: 9,
  });
  assert.equal(verdict.failures.includes("hrefNotFilesRoute"), true);
});

test("a chip carrying the filename but not Ruby's size fails, and vice versa", () => {
  const noSize = rubyChipBytes("file.txt", 9).replace(
    `<span class="size">${humanizedSize(9)}</span>`, '<span class="size"></span>',
  );
  assert.equal(chosenFileChip(noSize).size, "");
  const verdict = fileCardOffersDownload({
    cardName: "a test file", coreHtml: rubyCoreBytes("a test file", "file.txt"),
    chooserHtml: rubyChooserBytes(), chipHtml: noSize,
    originalFilename: "file.txt", bytes: 9,
  });
  assert.equal(verdict.failures.includes("chipSize"), true);

  const wrongName = rubyChipBytes("file.txt", 9).replace('<p class="name">file.txt</p>', "<p class=\"name\">other.txt</p>");
  assert.equal(chosenFileChip(wrongName).filename, "other.txt");
});

test("a form with no file input fails the upload half - this row's recorded finding", () => {
  const noInput = `<form><input type="text" name="card[name]" /></form>`;
  const shape = fileChooserShape(noInput);
  assert.equal(shape.ok, false);
  assert.deepEqual(shape.failures, ["noFileInput"]);
  const verdict = fileCardOffersDownload({
    cardName: "a test file", coreHtml: rubyCoreBytes("a test file", "file.txt"),
    chooserHtml: noInput, chipHtml: rubyChipBytes("file.txt", 9),
    originalFilename: "file.txt", bytes: 9,
  });
  assert.equal(verdict.failures.includes("noFileInput"), true);
});

test("a file input missing Ruby's carriers fails on the carriers, not on the input", () => {
  const bare = `<input type="file" name="card[file]" />`;
  const shape = fileChooserShape(bare);
  assert.equal(shape.failures.includes("notFileUpload"), true);
  assert.equal(shape.failures.includes("noAttachmentTypeId"), true);
  // HAML's attr_wrapper in this gem is the apostrophe, so the port emits
  // href='SRC' - both quoting styles must be read.
  assert.equal(downloadAnchors("<a href=\"/files/1/f.txt\">Download f</a>").length, 1);
  assert.equal(downloadAnchors("<a href='/files/1/f.txt'>Download f</a>").length, 1);
  assert.equal(downloadAnchors("<a href='/update/x\">Downlo</a>").length, 0);
});

test("the chooser's attachment_card_name field is read out of the COMMITTED RUBY CAPTURE", () => {
  // THE DEFECT THIS PINS. The signed-in run of 2026-10-22 recorded the F1 leg
  // as failures ["noAttachmentCardName","noChosenFileChip"] on a chooser that
  // renders exactly as Ruby renders it.
  //
  // THE CLASS LIST. file_chooser.haml says
  //   = hidden_field card.attachment_name, class: "attachment_card_name", value: ""
  // and the committed Ruby capture of the gem's own bytes renders that field
  // as
  //   <input class="attachment_card_name form-control" value="" autocomplete="off" type="hidden" name="card[image]" id="card_image" />
  // The class attribute carries BOTH classes, so a reader that requires the
  // class attribute to be exactly "attachment_card_name" finds nothing in
  // Ruby's own bytes.
  const capture = JSON.parse(
    readFileSync(new URL("../../../fixtures/captured/tinymce-editor-views.json", import.meta.url), "utf8"),
  );
  const arm = capture.rendered["new:image01#new_image"];
  assert.ok(typeof arm === "string", "the new_image arm is in the committed capture");
  const field = attachmentCardNameField(arm);
  assert.equal(field.present, true);
  assert.deepEqual(field.classes, ["attachment_card_name", "form-control"]);
  assert.equal(field.value, "");
  assert.equal(field.name, "card[image]");
  assert.equal(field.id, "card_image");
  // The shape the predicate grades is green on Ruby's own bytes.
  const shape = fileChooserShape(arm);
  assert.equal(shape.failures.includes("noAttachmentCardName"), false, JSON.stringify(shape.failures));
  assert.equal(shape.attachmentCardNameField.name, "card[image]");
  // A field whose class attribute is exactly "attachment_card_name" is ALSO
  // accepted - the reader grades the class LIST, not the whole string.
  const narrow = fileChooserShape(
    `<input class="file-upload slotter form-control" name="card[file]" type="file" />` +
    `<input type="hidden" name="attachment_type_id" value="1354" />` +
    `<input class="attachment_card_name" name="card[file]" type="hidden" value="" />`,
  );
  assert.equal(narrow.failures.includes("noAttachmentCardName"), false, JSON.stringify(narrow.failures));
  // A field with NO value attribute is not Ruby's field (Ruby writes value:""
  // explicitly), and is named as such.
  const noValue = fileChooserShape(
    `<input class="file-upload slotter form-control" name="card[file]" type="file" />` +
    `<input type="hidden" name="attachment_type_id" value="1354" />` +
    `<input class="attachment_card_name" name="card[file]" type="hidden" />`,
  );
  assert.equal(noValue.failures.includes("attachmentCardNameHasNoValue"), true);
});

test("the chip is read out of the document that renders it, not the core view", () => {
  // THE DEFECT THIS PINS, the second half. The chip is preview_editor.haml's
  // `.chosen-file` block, and Ruby's own flow puts it in the FORM: the gem's
  // upload.js.coffee:48-51 swaps the upload round trip's response into the
  // chooser's `.chosen-file`. The core view is core.haml - ONE anchor. A leg
  // that looks for the chip in the core view looks for it in a document that
  // never carries it.
  const chip = rubyChipBytes("file.txt", 9);
  assert.equal(chosenFileChip(chip).filename, "file.txt");
  assert.equal(chosenFileChip(chip).size, "9 Bytes");
  // The core view alone carries no chip, and the leg says so.
  const verdict = fileCardOffersDownload({
    cardName: "a test file",
    coreHtml: rubyCoreBytes("a test file", "file.txt"),
    chooserHtml: rubyChooserBytes(),
    chipHtml: "",
    originalFilename: "file.txt",
    bytes: 9,
  });
  assert.equal(verdict.failures.includes("noChosenFileChip"), true);
  // The chip's class attributes are read with EITHER quote character: this
  // deck's Haml attr_wrapper is the apostrophe.
  const singleQuoted = chip.replace(/"/g, "'");
  assert.equal(chosenFileChip(singleQuoted).filename, "file.txt");
  assert.equal(chosenFileChip(singleQuoted).size, "9 Bytes");
  // The caller reads the chip from the round trip's response.
  const coverB = readFileSync(new URL("../checks-cover-b.mjs", import.meta.url), "utf8");
  assert.match(coverB, /chipHtml,/);
  assert.match(coverB, /attachment_upload: attachmentUpload,/);
  assert.match(coverB, /view: 'preview_editor',/);
});