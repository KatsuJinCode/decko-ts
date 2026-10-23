// What a File card shows AFTER an upload, graded on the bytes Ruby renders.
//
// WHAT RUBY'S SPEC ASKS FOR, features/attach.feature:
//
//   Scenario: Uploading a file
//     When I go to new File
//     And I upload the file "file.txt"
//     Then I should see file "file.txt 9 Bytes"
//     When I press "Delete"
//     Then I should see "Add File..."
//     When I upload the file "file.txt"
//     And I fill in "card_name" with "a test file"
//     And I press "Submit"
//     Then I should see "Download a test file"
//
// The last line is the row. F1 is "/files route after upload", and "Download a
// test file" IS the /files route rendered: the card name, after the submit,
// becomes a link to the stored bytes.
//
// THE BYTES, vendored verbatim from the gem under
// fixtures/vendor/card-mod-carrierwave-0.20.0 (the test asserts each file's
// sha256 so the vendored copy cannot drift from the gem):
//
//   set/type/file/core.haml
//     %a{ href: source }<
//       = t :carrierwave_download, title: title_in_context(voo.title)
//
//   config/locales/en.yml:5
//     carrierwave_download: Download %{title}
//
// So the File card's core view is ONE anchor: href = the card's source (the
// stored /files path), text = "Download " + the card's title relativized against
// the context. HAML's attr_wrapper here is the apostrophe, which is why the port
// emits `<a href='SRC'>Download +child</a>`
// (src/card/mod-loader/mods/card-mod-carrierwave.ts:202-208).
//
//   set/type/file/file_chooser.haml
//     .choose-file ... %input.file-upload.slotter.form-control{
//       id: "card_#{card.type_code}", name: "card[#{card.type_code}]",
//       type: "file" }
//     = hidden_field_tag "attachment_type_id", card.type_id
//     = hidden_field card.attachment_name, class: "attachment_card_name", ...
//     = hidden_field_tag 'file_card_name', card.name.url_key
//
//   set/type/file/preview_editor.haml
//     .chosen-file ... %p.name = card.original_filename
//                       %span.size = number_to_human_size card.attachment.size
//
// The chip is what "I should see file 'file.txt 9 Bytes'" reads: the ORIGINAL
// filename beside Rails' humanized byte size. Grading the chip as one string
// would let a page satisfy it with the filename alone, so the two are graded
// separately.
//
// WHERE THE CHIP LIVES. The chip is the PREVIEW EDITOR's bytes, and Ruby
// renders that view ONLY inside the two-step upload's round trip: outside it
// the view RAISES, because preview_editor.haml line 2 calls
// `cached_upload_card_name` (set/type/file.rb:144-146) and
// `Card::Env.params[:attachment_upload]` is nil when the request carries no
// :attachment_upload. The committed real-Ruby capture says so verbatim:
// reference-harness/fixtures/synthetic-v2-mod-probes/expected/render.jsonl,
// arm probe-view:100:preview_editor@set/type/file.rb, is
// "undefined method 'gsub' for nil" at set/type/file.rb:145. The chip
// therefore rides the round trip's RESPONSE, which the browser swaps into the
// form's .chosen-file (upload.js.coffee:48-51, `editor.find('.chosen-file')
// .replaceWith data.result`), and it is on the SAVED card's page in neither
// Ruby nor this port. The saved card's page carries the download anchor
// (core.haml) and nothing else.
//
// Registry row cap-F1 (tools/edge-signed-in-exercise/capabilities.json, id F1)
// carries NO checks at all, and its finding says the generic new-card form has
// no file input. This module grades what the card must look like once a file
// IS there, which is the half the row can be credited on and the half no check
// on this row ever read.

/** Ruby's `carrierwave_download: Download %{title}` (en.yml:5). */
export const DOWNLOAD_LABEL = "Download";

/** The stored path shape a real Ruby deck's upload tree carries, from the
 *  committed capture fixtures/captured/oracle-upload-file-tree.json: entries
 *  like "1346/5026.png" - the card id, then the stored filename. */
const STORED_PATH = /^\d+\/[^/]+$/;

/** Whether a stored path is one a Ruby deck's file tree can hold. */
export function isStoredFilePath(path) {
  return STORED_PATH.test(String(path ?? ""));
}

/** The source a File card's core view must carry.
 *  set/type/file.rb:47-50
 *      def source
 *        file = card.attachment
 *        file.valid? ? contextualize_path(file.url) : ""
 *      end
 *  is the attachment's own URL, contextualized. For local storage that is the
 *  deck's /files route; for a cloud bucket it is whatever URL the storage
 *  adapter returns, so an ABSOLUTE http(s) URL is a legal source and its path
 *  need not start with /files. Only a RELATIVE source has to be the /files
 *  route, because a relative source is the deck serving its own storage. */
export function isFileSourceHref(href) {
  const raw = String(href ?? "").trim();
  if (raw === "") return false;
  const absolute = /^https?:\/\//i.test(raw);
  if (absolute) return true;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) return false;
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  return /^\/files\/[^/]+\/[^/]+$/.test(path) || isStoredFilePath(path.replace(/^\/files\//, ""));
}

/** Every anchor in `html` whose text starts with Ruby's download label. */
export function downloadAnchors(html) {
  const found = [];
  for (const match of String(html).matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const text = match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (!text.startsWith(`${DOWNLOAD_LABEL} `) && text !== DOWNLOAD_LABEL) continue;
    const attrs = {};
    for (const attr of match[1].matchAll(/([a-zA-Z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
      attrs[attr[1].toLowerCase()] = attr[2] ?? attr[3] ?? "";
    }
    found.push({ attrs, text, title: text.slice(DOWNLOAD_LABEL.length).trim() });
  }
  return found;
}

/** Rails' `number_to_human_size`, the one `preview_editor.haml` renders. 9
 *  bytes is "9 Bytes" (Ruby's own attach.feature asserts exactly that), 34304
 *  is "34.3 KB". Rails switches units at 1024 and prints one decimal for
 *  values that need it, trailing ".0" trimmed. */
export function humanizedSize(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value < 0) return null;
  if (value < 1024) return `${Math.round(value)} Bytes`;
  const units = ["KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
  let scaled = value / 1024;
  let unit = 0;
  while (scaled >= 1024 && unit < units.length - 1) {
    scaled /= 1024;
    unit += 1;
  }
  const rounded = Math.round(scaled * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${text} ${units[unit]}`;
}

/** The chosen-file chip: `.chosen-file` holding `p.name` (the original
 *  filename) and `span.size` (the humanized byte size).
 *
 *  BOTH QUOTING STYLES ARE READ, because this gem's Haml attr_wrapper is the
 *  apostrophe: Ruby's own bytes are `class='chosen-file'`, and a browser's
 *  DOM serialization of them is `class="chosen-file"`. A check that reads one
 *  style only sees the field as absent in the other - the same defect class
 *  the mx-154 leg had (an href read out of the serialized text instead of the
 *  DOM). */
export function chosenFileChip(html) {
  const block = /<div\b[^>]*\sclass\s*=\s*["'][^"']*\bchosen-file\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i.exec(String(html));
  if (block === null) return null;
  const inner = block[1];
  const name = /<p\b[^>]*\sclass\s*=\s*["'][^"']*\bname\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/i.exec(inner);
  const size = /<span\b[^>]*\sclass\s*=\s*["'][^"']*\bsize\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i.exec(inner);
  const strip = (m) => (m === null ? null : m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
  return { filename: strip(name), size: strip(size) };
}

/** The upload control Ruby's chooser renders, and the two hidden fields that
 *  carry the card it belongs to. */
export function fileChooserShape(html) {
  const source = String(html);
  const input = /<input\b([^>]*\btype\s*=\s*["']file["'][^>]*)>/i.exec(source);
  if (input === null) {
    return { ok: false, failures: ["noFileInput"], control: null, attachmentTypeId: null, attachmentCardName: null };
  }
  const attrs = {};
  for (const attr of input[1].matchAll(/([a-zA-Z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    attrs[attr[1].toLowerCase()] = attr[2] ?? attr[3] ?? "";
  }
  const failures = [];
  // file_chooser.haml: class "file-upload slotter form-control", name
  // "card[#{card.type_code}]" - for a File card that is card[file].
  if (!/\bfile-upload\b/.test(String(attrs.class ?? ""))) failures.push("notFileUpload");
  if (!/\bslotter\b/.test(String(attrs.class ?? ""))) failures.push("notSlotter");
  if (!/^card\[/.test(String(attrs.name ?? ""))) failures.push("nameNotCardField");
  const typeId = /\bname\s*=\s*["']attachment_type_id["'][^>]*\bvalue\s*=\s*["']([^"']*)["']/i.exec(source);
  // file_chooser.haml line 11: `= hidden_field card.attachment_name, class:
  // "attachment_card_name", value: ""`. The HAML names the class TOKEN, but
  // the RENDERED bytes carry decko's bootstrap form class as well, because
  // card-mod-bootstrap's form component adds it to every field
  // (card-mod-bootstrap-0.20.0/lib/card/bootstrap/component/form.rb). The
  // committed real-Ruby capture reads
  //   <input class="attachment_card_name form-control" value="" ...>
  // (reference-harness/fixtures/synthetic-v2-mod-probes/expected/render.jsonl,
  // arm probe-view:98:input@set/type/file.rb), so the fact is the class
  // TOKEN. Grading the whole attribute value against the HAML's literal
  // makes a field the port renders byte for byte read as absent.
  const cardName = /<input\b([^>]*\sclass\s*=\s*["'][^"']*\battachment_card_name\b[^"']*["'][^>]*)/i.exec(source);
  if (typeId === null) failures.push("noAttachmentTypeId");
  if (cardName === null) failures.push("noAttachmentCardName");
  const cardNameValue = cardName === null ? null : /\bvalue\s*=\s*["']([^"']*)["']/i.exec(cardName[1]);
  return {
    ok: failures.length === 0,
    failures,
    control: { name: attrs.name ?? null, id: attrs.id ?? null, class: attrs.class ?? null },
    attachmentTypeId: typeId === null ? null : typeId[1],
    attachmentCardName: cardNameValue === null ? null : cardNameValue[1],
  };
}

/**
 * The F1 leg, graded. `evidence`:
 *   cardName          the File card's name, the title in the download label
 *   coreHtml          the SAVED card's rendered page (the :core view: the
 *                     download anchor, and nothing else)
 *   chooserHtml       the create form's file chooser (file_chooser.haml)
 *   previewHtml       the upload round trip's preview (preview_editor.haml:
 *                     the chip). This is a different surface from coreHtml,
 *                     and it has to be: Ruby renders the preview editor ONLY
 *                     inside the round trip and RAISES outside it (see the
 *                     file header).
 *   originalFilename  the upload's original filename ("file.txt")
 *   bytes             the stored byte length (9 in Ruby's own scenario)
 *
 * Returns {ok, failures, download}.
 */
export function fileCardOffersDownload(evidence) {
  const { cardName, coreHtml, originalFilename, bytes } = evidence;
  const failures = [];

  const anchors = downloadAnchors(coreHtml);
  // Exactly one: the label is the whole core view (core.haml is two lines), so
  // zero means the /files route never rendered and two means something else is
  // borrowing Ruby's label.
  if (anchors.length === 0) failures.push("noDownloadAnchor");
  if (anchors.length > 1) failures.push("multipleDownloadAnchors");

  const anchor = anchors[0];
  if (anchor !== undefined) {
    if (!isFileSourceHref(anchor.attrs.href)) failures.push("hrefNotFilesRoute");
    // en.yml:5 `Download %{title}` - the title is the card's name, relativized
    // against the context ("+child" when the card is shown inside its parent).
    const expected = String(cardName ?? "").replace(/^.*?\+/, "+");
    if (anchor.title !== expected) failures.push("labelNotCardName");
  }

  // The chooser half: without a file input there is no upload to grade, which
  // is exactly what this row's finding recorded.
  const chooser = fileChooserShape(evidence.chooserHtml ?? "");
  for (const failure of chooser.failures) failures.push(failure);

  // The chip half: Ruby's `I should see file "file.txt 9 Bytes"` is the
  // original filename beside Rails' humanized size, in the PREVIEW EDITOR's
  // bytes - the round trip's response, which the browser swaps into the
  // form's .chosen-file. Graded as two facts.
  const chip = chosenFileChip(evidence.previewHtml ?? "");
  if (chip === null) {
    failures.push("noChosenFileChip");
  } else {
    if (chip.filename !== String(originalFilename ?? "")) failures.push("chipFilename");
    const wantedSize = humanizedSize(bytes);
    if (wantedSize === null) failures.push("badByteCount");
    else if (chip.size !== wantedSize) failures.push("chipSize");
  }

  return { ok: failures.length === 0, failures, download: anchor ?? null, chip: fileChooserShape ? chooser : null };
}