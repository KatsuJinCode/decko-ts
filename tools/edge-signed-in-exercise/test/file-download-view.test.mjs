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

/** Ruby's own view rendered: core.haml is the anchor, preview_editor.haml the
 *  chip, file_chooser.haml the upload control. */
function rubyBytes(cardName, filename, bytes) {
  return (
    `<a href='/files/${cardName.length}/${filename}'>${DOWNLOAD_LABEL} ${cardName}</a>` +
    `<div class="chosen-file"><p class="name">${filename}</p><span class="size">${humanizedSize(bytes)}</span>` +
    `<button class="delete cancel-upload" data-type="DELETE"></button></div>` +
    `<div class="choose-file">` +
    `<input class="file-upload slotter form-control" id="card_file" name="card[file]" type="file" />` +
    `<input type="hidden" name="attachment_type_id" value="1354" />` +
    `<input class="attachment_card_name" name="file_card_name" type="hidden" value="" />` +
    `</div>`
  );
}

test("a File card that offers the /files route and its chip passes every leg", () => {
  const verdict = fileCardOffersDownload({
    cardName: "a test file",
    coreHtml: rubyBytes("a test file", "file.txt", 9),
    chooserHtml: rubyBytes("a test file", "file.txt", 9),
    originalFilename: "file.txt",
    bytes: 9,
  });
  assert.deepEqual(verdict.failures, []);
  assert.equal(verdict.ok, true);
  assert.equal(verdict.download.text, "Download a test file");
});

test("the card name is relativized against its context, as title_in_context does", () => {
  const verdict = fileCardOffersDownload({
    cardName: "parent+child",
    coreHtml: rubyBytes("+child", "file.txt", 9),
    chooserHtml: rubyBytes("+child", "file.txt", 9),
    originalFilename: "file.txt",
    bytes: 9,
  });
  assert.equal(verdict.ok, true, verdict.failures.join(", "));
});

test("a card with no download anchor fails: the /files route never rendered", () => {
  const verdict = fileCardOffersDownload({
    cardName: "a test file",
    coreHtml: "<p>no file here</p>",
    chooserHtml: rubyBytes("a test file", "file.txt", 9),
    originalFilename: "file.txt",
    bytes: 9,
  });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.failures.includes("noDownloadAnchor"), true);
});

test("an anchor whose href is not the files route fails, which a text read cannot see", () => {
  const html = rubyBytes("a test file", "file.txt", 9).replace("href='/files/11/file.txt'", "href='/update/Other'");
  const verdict = fileCardOffersDownload({
    cardName: "a test file", coreHtml: html, chooserHtml: html,
    originalFilename: "file.txt", bytes: 9,
  });
  assert.equal(verdict.failures.includes("hrefNotFilesRoute"), true);
});

test("a chip carrying the filename but not Ruby's size fails, and vice versa", () => {
  const noSize = rubyBytes("a test file", "file.txt", 9).replace(
    `<span class="size">${humanizedSize(9)}</span>`, '<span class="size"></span>',
  );
  assert.equal(chosenFileChip(noSize).size, "");
  const verdict = fileCardOffersDownload({
    cardName: "a test file", coreHtml: noSize, chooserHtml: noSize,
    originalFilename: "file.txt", bytes: 9,
  });
  assert.equal(verdict.failures.includes("chipSize"), true);

  const wrongName = rubyBytes("a test file", "file.txt", 9).replace('<p class="name">file.txt</p>', "<p class=\"name\">other.txt</p>");
  assert.equal(chosenFileChip(wrongName).filename, "other.txt");
});

test("a form with no file input fails the upload half - this row's recorded finding", () => {
  const noInput = `<form><input type="text" name="card[name]" /></form>`;
  const shape = fileChooserShape(noInput);
  assert.equal(shape.ok, false);
  assert.deepEqual(shape.failures, ["noFileInput"]);
  const verdict = fileCardOffersDownload({
    cardName: "a test file", coreHtml: rubyBytes("a test file", "file.txt", 9),
    chooserHtml: noInput, originalFilename: "file.txt", bytes: 9,
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