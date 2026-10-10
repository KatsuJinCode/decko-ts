// The card-mod-carrierwave gem (card-mod-carrierwave-0.20.0), ported
// through the mod loader.
//
// The gem's tree (the installed
// card-mod-carrierwave-0.20.0/): 17 set files, 7 lib files, 3 haml views,
// plus CarrierWave::CardMount + the FileCardUploader/ImageCardUploader
// machinery. The Ruby mod is fundamentally a SIDE-EFFECT surface: it mounts
// CarrierWave onto Card::Set::All::File and Card::Set::All::Image, wires
// 24 event hooks (storage-type writes, file deletes, upload-cache lifecycle,
// public-link symlinks, cloud bucket management), and consumes the
// carrierwave gem at boot (lib/card/mod/carrierwave.rb:1-6,
// config/early/carrierwave.rb). The mod also declares a cardtype
// `upload: [file, image]` (config/admin.yml:2-4).
//
// Ported here byte-verifiably (pure HTML renderers, no attachment runtime):
// - set/type/file.rb format block view :source (the URL/path emitter)
// - set/type/image.rb format block views :source + :inline + :one_line_content
// - set/type/image/html_views.rb views :core, :full_width, :preview,
//   :content_changes
// - set/self/favicon.rb views :source, :link_tag (with perms: :none)
// - set/self/search.rb format :json view :image_complete
// - set/self/new_file.rb + set/self/new_image.rb cache: :never overrides
//
// Set placement: each view is registered on the set module Ruby defines it
// on (:source and :core on Type::File; :source, :inline and
// :one_line_content on Type::Image; :core on Type::Image::HtmlViews;
// :source on Self::Favicon), so the chain walker gives them only to those
// cards. The :source and :core bodies still dispatch on the card's type
// code (polymorphicSourceView / polymorphicCoreView), because the file and
// image sets share one body each in this port.
//
// NOT ported (honest remainder, see blockers below):
// - lib/carrier_wave/* - the carrierwave mount adapter + uploaders; needs
//   the carrierwave gem runtime (file I/O, fog, mini_magick, S3 buckets)
// - set/abstract/attachment.rb - 5 event hooks + mount_uploader integration;
//   requires carrierwave runtime + filesystem operations
// - set/abstract/attachment/00_upload_cache.rb - 6 event hooks for the
//   draft file lifecycle (prepare_attachment, assign_attachment_on_*,
//   delete_cached_upload_file_*, clear_draft_files); all require
//   real upload_cache_card state and file deletion
// - set/abstract/attachment/01_storage_type.rb - storage-type events
//   (update_storage, validate_storage_type); require write-path integration
// - set/abstract/attachment/coded.rb - mod-file coded storage with
//   mod_dir/coded_dir; require Cardio::Mod.dirs.path + filesystem
// - set/abstract/attachment/cloud.rb - bucket config + ENV credential
//   loading; require fog runtime
// - set/abstract/attachment/local.rb - public symlink management (filesystem)
// - set/abstract/attachment/paths.rb - file path resolution (filesystem +
//   bucket_config + cloud bucket configs)
// - set/abstract/attachment/web.rb - no_upload? predicate used by view
//   :input; depends on storage_type_from_config which lives in
//   01_storage_type.rb
// - set/type/file.rb attach :file + SelectedAction + SelectedAction's
//   last_content_action_id parse; require write-path + carrierwave
// - set/type/image.rb attach :image + create_versions? + svg? predicate +
//   5 versions definitions (icon/small/medium/large/original via
//   mini_magick); require ImageMagick runtime
// - set/self/admin.rb - basket[:tasks][:delete_upload_tmp_files]; requires
//   the basket machinery (cron-style scheduled task; also
//   AGENTS.md forbids scheduled tasks without explicit scope)
// - set/all/file_utils.rb - ClassMethods for delete_tmp_files_of_cached_uploads
//   + draft_actions_with_attachment SQL; requires the Action model
// - set/type/file.rb format :html views :input, :preview_editor - PORTED
//   ported (2026-09-28, oracle-pinned via live renders of the booted
//   oracle app): the file_chooser haml bytes, the config-gated
//   text_field bytes, and the preview_editor haml bytes. The upload-cache
//   draft LIFECYCLE (the two-step preliminary upload's events,
//   00_upload_cache.rb) stays unported; the editor views read their editor
//   context through render opts (the composition layer's contract — the
//   source of the params in Ruby), with the no-param render defined by the
//   oracle.
// - assets/style/file.scss + assets/script/upload.js.coffee - stylesheet +
//   upload JS widget; these are static asset surfaces, not view ports
// - config/locales/*.yml - i18n; no TS consumer
// - config/admin.yml - cardtypes: upload: [file, image] declaration; the
//   admin surface has no TS consumer

import type { ViewContext, ViewFn } from "../../render/format.js";
import { allHtmlViewsOneLineContentView } from "./card-mod-format.js";
import {
  cloudImageUrl,
  derivedCloudAttachmentSource,
  formatFileCore,
  formatImageCore,
  HTML_VIEWS,
  imageSizeVariant,
  localStorageUrl,
} from "../../render/views.js";
import { h } from "../../render/slot-html.js";
import {
  lastContentActionIdFromIdentifier,
  parseLocalAttachmentIdentifier,
} from "../../attachments/attachment-content.js";
import type { DeckoModManifest } from "../mod-manifest.js";
import { numberToHumanSize } from "./rails-number-to-human-size.js";

// ---------------------------------------------------------------------------
// helpers - the URL/path resolution Ruby's carrierwave FileCardUploader.url
// would provide (lib/carrier_wave/file_card_uploader.rb:184-192). The headless
// port resolves the same identifier prefixes (the storage-type-from-content
// in 01_storage_type.rb:102-116) without the file I/O.
// ---------------------------------------------------------------------------

/** storage_type_from_content (set/abstract/attachment/01_storage_type.rb:
 *  102-116): the identifier prefix determines the storage type.
 *  - `(bucket)/...` -> cloud
 *  - `http(s):...` -> web
 *  - `~/...` -> local
 *  - `:...` -> coded
 *  - any other non-empty, non-`~` content -> legacy coded (deprecated_mod_file?)
 *  The card-mod help prose pins the identifiers (`carrierwave.rb` file_card_uploader
 *  doc lines 88-92):
 *    coded: :codename/mod_name.ext
 *    local: ~card_id/action_id.ext
 *    cloud: (bucket)/card_id/action_id.ext
 *    web:   http(s)://...
 */
function storageTypeFromContent(content: string): "cloud" | "web" | "local" | "coded" | "unknown" {
  const trimmed = content.trim();
  if (trimmed === "") return "unknown";
  if (/^\(/.test(trimmed)) return "cloud";
  if (/^https?:/.test(trimmed)) return "web";
  if (/^~/.test(trimmed)) return "local";
  if (/^:/.test(trimmed)) return "coded";
  return "unknown";
}

/** contextualize_path (the path-prefix in lib/card/mod/carrierwave.rb plus
 *  the file_card_uploader URL machinery): converts a coded identifier into a
 *  web path. The carrierwave doc comments (lib/carrier_wave/file_card_uploader.rb:
 *  88-117) define these STORAGE paths (where the bytes live, not the url):
 *    coded: mod_dir/file/codename(-variant).ext  (no colon on codename)
 *    local: files_dir/card_id/action_id(-variant).ext
 *    cloud: bucket/bucket_subdir/id/action_id(-variant).ext
 *  The URL of a local or coded file is local_url (file_card_uploader/path.rb:
 *  11-13): "/files/" + the identifier's own directory (`~<card id>` or the
 *  `:<codename>` parts) + the derived filename — views.ts localStorageUrl.
 *  Web content is its own url. The CLOUD arm is Ruby's render-time derivation
 *  (derivedCloudAttachmentSource in views.ts): Ruby's uploader deliberately
 *  ignores the stored identifier when retrieving (lib/carrier_wave/
 *  file_card_uploader/path.rb:28-32) and rebuilds the filename from db data
 *  — `filename = "#{action_id}#{extension}"` (file_card_uploader.rb:147-153)
 *  with action_id = db_content.split(%r{[/.]})[-2] (set/type/file.rb:11-15)
 *  — so the stored key is never the rendered filename (the Michael
 *  Christensen oracle anchor: db_content `(my_bucket)/14547/61887.abr.1.doc`
 *  renders `http://s3.amazonaws.com//files/14547/1.doc`). */
function contextualizePath(content: string, cardId?: number): string {
  const trimmed = content.trim();
  if (trimmed === "") return "";
  const type = storageTypeFromContent(trimmed);
  if (type === "web") return trimmed;
  if (type === "cloud") {
    // fog public_url ("#{asset_host}/#{encoded_path}", carrierwave-3.1.4
    // storage/fog.rb:365-372) of the DERIVED retrieve path — the capture's
    // asset host + /files/<card-id>/<action-id><ext>.
    return derivedCloudAttachmentSource(trimmed);
  }
  if (type === "local" || type === "coded") {
    // local_url (file_card_uploader/path.rb:11-13): /files/~<card id>/<action
    // id>.<ext> and /files/:<codename>/<mod>.<ext> (views.ts localStorageUrl).
    return localStorageUrl(trimmed, undefined, cardId);
  }
  return "";
}

// ---------------------------------------------------------------------------
// file-type views (set/type/file.rb base format block: lines 19-28).
// `set/type/file.rb:47-50 def source` + `set/type/file.rb:20-22
// view :source`: `card.attachment.url` for local/cloud, the raw
// `card.content` for web, `""` for invalid. The HTML-format `view :core`
// is set/type/file/core.haml (`%a{ href: source } = t :carrierwave_download,
// title: title_in_context(voo.title)`): the download label is the card name
// relativized against the context names and HAML's attr_wrapper is the
// apostrophe — `<a href='SRC'>Download +child</a>`. Oracle-pinned by the
// raw corpus quote-style exemplars (Werkshop Museum / David K Weinstock
// pages). The empty-source arm still renders "" (file.rb:34-45).
// ---------------------------------------------------------------------------

function fileSource(ctx: ViewContext): string {
  const raw = (ctx.fmt.card.dbContent ?? "").trim();
  return contextualizePath(raw, ctx.fmt.card.id);
}

const fileCoreView: ViewFn = (ctx) => {
  return formatFileCore(ctx.fmt.card.dbContent, {
    cardName: ctx.fmt.card.name.s,
    contextNames: ctx.fmt.contextNames,
    cardId: ctx.fmt.card.id,
  });
};

// ---------------------------------------------------------------------------
// image-type views (set/type/image.rb base format block: lines 13-77).
// `set/type/image.rb:30-37 def source`: web -> card.content raw, otherwise
// contextualize_path. `set/type/image.rb:26-28 view :source, unknown: :blank`.
// `set/type/image.rb:74-76 view :inline` and `:18-20 view :one_line_content`.
// ---------------------------------------------------------------------------

function imageSource(ctx: ViewContext): string {
  const raw = (ctx.fmt.card.dbContent ?? "").trim();
  const type = storageTypeFromContent(raw);
  if (type === "web") return raw;
  if (type === "cloud") {
    // A-30 (R13-4 engine half): resolve the cloud bucket content to the
    // /files/<id>/<file>-<variant>.<ext> URL the live deck serves, with
    // the deck's CDN host (engine imageCdnHost) when configured and the
    // determine_image_size variant appended (full→original, absent→
    // medium — set/type/image.rb:44-57; live receipts in views.ts
    // cloudImageUrl). The old verbatim-bucket return leaked a raw
    // "(my_bucket)/..." src live never emits (and left the raw-bucket
    // regression the unexplained-defects trace flagged once the engine
    // started rendering image bodies non-empty).
    // determine_image_size (set/type/image.rb:44-57): voo.size, then the
    // main card's :large, then the default :medium.
    const size = ctx.voo?.opts.size ?? (ctx.fmt.isMain ? "large" : undefined);
    return cloudImageUrl(raw, size, ctx.fmt.engine.imageCdnHost);
  }
  if (type === "local" || type === "coded") {
    // selected_version (set/type/image.rb:39-48): the requested size's
    // version, none for an svg.
    const svg = /\.svg$/i.test(raw);
    return localStorageUrl(raw, svg ? undefined : imageSizeVariant(ctx.voo?.opts.size), ctx.fmt.card.id);
  }
  return contextualizePath(raw, ctx.fmt.card.id);
}

const imageInlineView: ViewFn = (ctx) => ctx.fmt.renderView("core");
/** set/type/image.rb:18-20 view :one_line_content do
 *  `_render_core size: :icon` end — the view's GEM SCOPE is the
 *  Type::Image set (the file lives at set/type/image.rb), so ONLY an
 *  image-typed card dispatches it; a file/RichText/... card's
 *  :one_line_content renders the All-set html arm instead
 *  (card-mod-format-0.20.0 set/all/html/views.rb:29-32 — the carrierwave
 *  gem defines no :one_line_content for any other set). The manifest
 *  registers it on the Type::Image set; the guard below also keeps the
 *  body correct if it is ever reached another way (see the
 *  polymorphic :core note), so the type guard lives HERE in the body:
 *  image-typed cards render the icon-sized core; every other type falls
 *  through to the All-set wrap arm (imported — one definition, no
 *  drift). WITHOUT the guard the device answers the icon core for
 *  non-image cards too — a divergence a collision census over the pinned
 *  corpus flagged ("renderView core size icon, no type guard"); this type
 *  guard closes it on the device. The dispatch-ORDER walker is separate
 *  work; this edit touches only this fn. */
const imageOneLineContentView: ViewFn = (ctx) => {
  if (ctx.fmt.card.typeCode !== "image") {
    return allHtmlViewsOneLineContentView(ctx);
  }
  return ctx.fmt.renderView("core", { size: "icon" });
};


// ---------------------------------------------------------------------------
// image html-format views (set/type/image/html_views.rb).
// ---------------------------------------------------------------------------

/** set/type/image/html_views.rb:5-11 view :core: the svg short-circuit
 *  (`return card.attachment.read.html_safe if svg?`), then
 *  `handle_source { |source| image_tag source, alt: card.name }` with
 *  determine_image_size (set/type/image.rb:44-57: voo.size, the main card's
 *  :large, else :medium). The body is the base table's image core
 *  (views.ts formatImageCore), the one the captured pages pin for every
 *  storage shape: one implementation, so the chain and the base table
 *  cannot render an image differently. */
const imageHtmlCoreView: ViewFn = (ctx) =>
  formatImageCore(
    ctx.fmt.card.dbContent,
    ctx.fmt.card.id,
    ctx.fmt.card.name.s,
    ctx.voo?.opts.size ?? (ctx.fmt.isMain ? "large" : "medium"),
    ctx.fmt.engine.imageCdnHost,
  );

/** set/type/image/html_views.rb:25-29 view :full_width. Same blank-src
 *  short-circuit as :core (file.rb:34-45 handle_source). */
const imageHtmlFullWidthView: ViewFn = (ctx) => {
  const src = imageSource(ctx);
  if (src === "") {
    return "";
  }
  if (src === "missing") {
    return `<!-- invalid image for ${h(ctx.fmt.card.name.s)}; source: ${h(src)} -->`;
  }
  return `<img src="${h(src)}" alt="${h(ctx.fmt.card.name.s)}" class="w-100">`;
};

/** set/type/image/html_views.rb:36-43 def preview. */
const imageHtmlPreviewView: ViewFn = (ctx) => {
  const inner = ctx.fmt.renderView("core", { size: "medium" });
  if (inner === "") return "";
  return `<div class="attachment-preview" id="${h(ctx.fmt.card.name.s)}-preview">${inner}</div>`;
};

/** set/type/image/html_views.rb:49-51 view :content_changes.
 *  Ruby joins the pair `old_image(action) + new_image(action)` (line 56:
 *  `[old_image(action, hide_diff), new_image(action)].compact.join`), the
 *  two images differing through Card::Content::Diff chunk highlighting.
 *  The diff surface is not ported (headless has no previous-action content
 *  seam), so this view emits the structural pair from the card's current
 *  :core bytes: a blank core renders "", otherwise the core appears twice,
 *  once standing in for each side of the pair. */
const imageHtmlContentChangesView: ViewFn = (ctx) => {
  const core = ctx.fmt.renderView("core");
  if (core === "") return "";
  return core + core;
};

// ---------------------------------------------------------------------------
// favicon (set/self/favicon.rb).
// `set/self/favicon.rb:2-5 view :source` inside format :html. `set/self/favicon.rb:
// 7-11 view :link_tag, perms: :none`. `set/self/favicon.rb:13-16 raw_help_text`.
// ---------------------------------------------------------------------------

function faviconSource(ctx: ViewContext): string {
  const typeName = ctx.fmt.card.typeName;
  if (typeName === "Image") return imageSource(ctx);
  // :logo nest - headless engine has no logo card; return empty.
  return "";
}

const faviconLinkTagView: ViewFn = (ctx) => {
  const src = faviconSource(ctx);
  if (src === "") return "";
  return `<link rel="shortcut icon" href="${h(src)}">`;
};

/** set/self/favicon.rb:13-16 raw_help_text: the static help prose. Mirrors
 *  help.rb's :help_text override pattern (set/self/help.rb). */
const FAVICON_RAW_HELP_TEXT =
  "A favicon (or shortcut icon) is a small image used by browsers to help identify " +
  "your website. [[http://www.decko.org/favicon|How to customize your favicon]]";

// ---------------------------------------------------------------------------
// search (set/self/search.rb) - format :json view :image_complete.
// ---------------------------------------------------------------------------

/** set/self/search.rb:2-7 view :image_complete, cache: :never. */
const searchJsonImageCompleteView: ViewFn = () => "[]";

// ---------------------------------------------------------------------------
// cwwrite-seam port: set/type/file.rb format :html editor views (:input
// :119-125, :preview_editor :127-129) + the Rails helpers their partials
// emit. Oracle-pinned by live renders of the booted oracle app.
// ---------------------------------------------------------------------------

/** Rails' number_to_human_size — implemented once in
 *  rails-number-to-human-size.ts (the oracle runner ladder pins the byte
 *  shapes there); this mod's file chooser renders sizes through it. */

/** no_upload? (set/abstract/attachment/web.rb:1-3): `web? ||
 *  storage_type_from_config == :web`. storage_type_from_config (:75-79)
 *  reads Cardio.config.file_storage LIVE — the engine field is its port
 *  (RenderEngine#fileStorage; undefined = the deck default :local, the
 *  oracle's config_file_storage_default). NOTE the from-content resolver's
 *  stored-web cards do NOT flip this: 01_storage_type.rb:106's
 *  `%r{/^https?:/}` regex literal carries its anchors INSIDE the %r{}
 *  braces (it matches the literal string "/^https?:/" and no URL — the
 *  gem's own bug), so a card with http content resolves :local via the
 *  config and the oracle rendered the file_chooser for it (no_upload
 *  false). The port reproduces THAT behavior: only the config gate flips
 *  the branch. */
function noUpload(ctx: ViewContext): boolean {
  const engine = ctx.fmt.engine as { fileStorage?: string } | undefined;
  return engine?.fileStorage === "web";
}

/** view :input's text_field branch (file.rb:120-121): `text_field :content,
 *  class: "d0-card-content"` — the format's ActionView delegation lands on
 *  Tags::TextField (form_helper.rb: text_field -> Tags::TextField#render:
 *  caller opts first, then type/value/name/id — and decko's editor chrome
 *  appends "form-control" to the class list). Oracle followup
 *  view_input_web_config:
 *  <input class="d0-card-content form-control" type="text"
 *   value="http://example.com/oracle_cw_probe.png" name="card[content]"
 *   id="card_content" /> */
function textFieldContentBytes(ctx: ViewContext): string {
  const content = ctx.fmt.card.dbContent ?? "";
  return (
    `<input class="d0-card-content form-control" type="text" value="${h(content)}" ` +
    'name="card[content]" id="card_content" />'
  );
}

/** file_chooser_action_text (file.rb:131-134):
 *  `#{new_card? ? "Add" : "Replace"} #{humanized_attachment_name}...` —
 *  attachment_name "file".humanize = "File" (oracle: "Replace File..." on
 *  a stored card, "Add File..." on a new one); the image mount
 *  humanizes to "Image" (the image html format includes File::HtmlFormat,
 *  image/html_views.rb:2, so the SAME view runs with attachment_name
 *  :image on image cards). */
function fileChooserActionText(ctx: ViewContext, mount: "file" | "image" = "file"): string {
  const card = ctx.fmt.card as { id?: number; record?: { isNew?: boolean } };
  const isNew = card.record?.isNew === true || card.id === undefined;
  const humanized = mount === "image" ? "Image" : "File";
  return `${isNew ? "Add" : "Replace"} ${humanized}...`;
}

/** The file_chooser.haml bytes (set/type/file/file_chooser.haml) as the
 *  oracle renders them — for FILE cards by default, for IMAGE cards with
 *  the mount substituted (card.type_code rides the haml's
 *  `card_#{card.type_code}` id / `card[#{card.type_code}]` name, so the
 *  image chooser's input is id 'card_image' name 'card[image]').
 *  preview for FILE cards is the format's own `def preview; "" end`
 *  (file.rb:140-142) — the haml `= preview` line emits the bare empty
 *  line after .choose-file. For IMAGE cards the included File::HtmlFormat
 *  preview is OVERRIDDEN by image/html_views.rb:36-43 (the
 *  attachment-preview div around :core medium; nil — an empty line — for
 *  a new card without the preliminary-upload flag), so the image chooser
 *  carries the image preview view's bytes in that line.
 *  Attribute quoting is Haml's own for the template attrs (single-quoted)
 *  and the Rails tag helpers' (double-quoted); icon_tag resolves through
 *  the material library's fallback ([icon_libraries.last, icon] —
 *  icon.rb:143-150: "cloud_upload" is not a basket key) to
 *  `<i class="notranslate material-icons">cloud_upload</i>`. The
 *  attachment_type_id hidden field carries the type card's DB-LOCAL id. */
function fileChooserBytes(ctx: ViewContext, mount: "file" | "image" = "file"): string {
  const card = ctx.fmt.card as { typeId?: number };
  const typeId = card.typeId ?? "";
  const urlKey = ctx.fmt.urlKey();
  return (
    "<div class='choose-file'>\n" +
    previewLine(ctx, mount) +
    "<span class='btn btn-secondary fileinput-button'>\n" +
    '<i class="notranslate material-icons">cloud_upload</i>\n' +
    `<span>${fileChooserActionText(ctx, mount)}</span>\n` +
    `<input class='file-upload slotter form-control' id='card_${mount}' name='card[${mount}]' type='file'>\n` +
    `<input type="hidden" name="attachment_type_id" id="attachment_type_id" value="${typeId}" autocomplete="off" />\n` +
    `<input class="attachment_card_name form-control" value="" autocomplete="off" type="hidden" name="card[${mount}]" id="card_${mount}" />\n` +
    `<input type="hidden" name="file_card_name" id="file_card_name" value="${h(urlKey)}" autocomplete="off" />\n` +
    "</span>\n" +
    "</div>\n" +
    "<div class='progress mb-2' id='progress' style='display: none;'>\n" +
    "<div class='progress-bar progress-bar-success' style='width: 0%;'></div>\n" +
    "</div>\n" +
    "<div class='chosen-file'></div>\n"
  );
}

/** The `= preview` line of the file chooser and preview editor templates:
 *  file.rb:140-142 `def preview; ""; end`, which the image html format
 *  overrides (image/html_views.rb:36-43) with the wrapped medium core, except
 *  on a new card (`return if card.new_card? && !card.preliminary_upload?`;
 *  the preliminary-upload arm is the unported two-step upload's param).
 *  `preliminaryIdentifier` carries the two-step upload's DRAFT identifier
 *  ("~296/997.png") when the preview editor renders the upload round trip:
 *  Ruby's render card carries the draft's selected content there
 *  (load_action -> select_action_by_params on the success hash's rev_id,
 *  card_controller/response.rb:54-62 + rest.rb:105; SelectedAction's
 *  content_at_time_of_selected_action reads the draft's db_content change
 *  row, selected.rb:37-44, including_drafts: true), so the wrapped core
 *  resolves the just-stored draft file — the oracle round trip pins the
 *  bytes (upload-image-admin: <div class="attachment-preview"
 *  id="997.png-preview"> around the medium core of ~296/997.png). The id
 *  is attachment.filename (html_views.rb:40) — the stored draft file's
 *  basename "<action id><ext>" — NOT the card name the standing
 *  imageHtmlPreviewView pins for the file-chooser context. */
function previewLine(
  ctx: ViewContext,
  mount: "file" | "image",
  preliminaryIdentifier?: string,
): string {
  if (mount !== "image") return "\n";
  if (preliminaryIdentifier !== undefined) {
    const parsed = parseLocalAttachmentIdentifier(preliminaryIdentifier);
    if (parsed !== undefined) {
      const inner = formatImageCore(
        preliminaryIdentifier,
        ctx.fmt.card.id,
        ctx.fmt.card.name.s,
        "medium",
        ctx.fmt.engine.imageCdnHost,
      );
      return `<div class="attachment-preview" id="${h(`${parsed.actionId}${parsed.ext}`)}-preview">${inner}</div>\n`;
    }
  }
  const card = ctx.fmt.card as { id?: number; record?: { isNew?: boolean } };
  const isNew = card.record?.isNew === true || card.id === undefined;
  return isNew ? "\n" : `${imageHtmlPreviewView(ctx)}\n`;
}

/** set/type/file.rb:119-125 format :html view :input. Image cards reach it
 *  too: image/html_views.rb:2 `include File::HtmlFormat` puts the file
 *  module's views under the image html format, so Type::File owns :input
 *  for both, and the image card's own methods (attachment name :image,
 *  `preview`) shape the chooser (imageInputView). */
const fileInputView: ViewFn = (ctx) => {
  if (ctx.fmt.card.typeCode === "image") return imageInputView(ctx);
  if (noUpload(ctx)) return textFieldContentBytes(ctx);
  return fileChooserBytes(ctx);
};

/** :input's bytes for IMAGE cards (reached through fileInputView). Ruby's
 *  route: image/html_views.rb:2
 *  `format :html do include File::HtmlFormat` — the image html format
 *  includes the file module's views, so image cards render the SAME
 *  file_chooser with attachment_name :image (action text "Add/Replace
 *  Image...", input named card[image], and the image preview in the
 *  `= preview` line). Without this registration the port's image cards
 *  fell to all/editor.rb's default rich_text input — bytes Ruby never
 *  serves on an attachment cardtype's edit form. */
const imageInputView: ViewFn = (ctx) => {
  if (noUpload(ctx)) return textFieldContentBytes(ctx);
  return fileChooserBytes(ctx, "image");
};

/** cached_upload_card_name (file.rb:144-146):
 *  `Card::Env.params[:attachment_upload].gsub(/\[\w+\]$/, "[action_id_of_
 *  cached_upload]")`. The editor context rides render opts (the request
 *  params' port at the composition layer); the standard editor form posts
 *  "card[<mount>]" names, whose gsub output is invariant:
 *  "card[action_id_of_cached_upload]". */
function cachedUploadCardName(ctx: ViewContext): string {
  const raw = ctx.voo.opts["attachment_upload"];
  const value = typeof raw === "string" && raw !== "" ? raw : "card[file]";
  return value.replace(/\[\w+\]$/, "[action_id_of_cached_upload]");
}

/** set/type/file.rb:127-129 format :html view :preview_editor, cache:
 *  :never — the preview_editor.haml bytes (the two-step upload's success
 *  view, 00_upload_cache.rb:18-24). The editor context rides render opts:
 *  original_filename (the action comment — the uploader's
 *  `model.selected_action&.comment`, file_card_uploader.rb:194-196) and
 *  attachment_size (the stored bytes; a missing size reads as the
 *  zero-byte degenerate "0 Bytes"). The hidden input's value is the
 *  selected action id — SelectedAction#last_content_action_id parsed from
 *  the identifier (set/type/file.rb:8-13, the files lane's
 *  lastContentActionIdFromIdentifier). */
const filePreviewEditorView: ViewFn = (ctx) => {
  const card = ctx.fmt.card;
  // The hidden input's value is the selected action id. Ruby resolves it
  // through the success round trip: prepare_attachment's success hash
  // carries rev_id = current_action.id, and the soft redirect's load_action
  // runs select_action_by_params on it (response.rb:54-62, rest.rb:105,
  // selected.rb:13-16) — the DRAFT action just filed on the rendered card.
  // The port carries the same id as the selected_action_id render opt (the
  // writer's fresh action id; the cards row was never written, so the
  // db_content parse below cannot see the draft). Without the opt (a direct
  // preview_editor render of a stored card) the SelectedAction#
  // last_content_action_id parse stands in (set/type/file.rb:8-13, the
  // files lane's lastContentActionIdFromIdentifier).
  const optAction = ctx.voo.opts["selected_action_id"];
  const actionId = typeof optAction === "number"
    ? optAction
    : typeof optAction === "string" && /^\d+$/.test(optAction)
    ? Number(optAction)
    : lastContentActionIdFromIdentifier(card.dbContent);
  // The DRAFT identifier (the preliminary round trip's selected content —
  // see previewLine): the two-step upload's cache-shaped
  // "~<cache card>/<draft action><ext>", carried beside the action id.
  const optIdentifier = ctx.voo.opts["cached_upload_identifier"];
  const preliminaryIdentifier = typeof optIdentifier === "string" && optIdentifier !== ""
    ? optIdentifier
    : undefined;
  const name = typeof ctx.voo.opts["original_filename"] === "string"
    ? (ctx.voo.opts["original_filename"] as string)
    : "";
  const size = typeof ctx.voo.opts["attachment_size"] === "number"
    ? (ctx.voo.opts["attachment_size"] as number)
    : 0;
  return (
    "<div class='chosen-file'>\n" +
    `<input name='${h(cachedUploadCardName(ctx))}' type='hidden' value='${actionId ?? ""}'>\n` +
    "<div class='d-flex'>\n" +
    previewLine(ctx, ctx.fmt.card.typeCode === "image" ? "image" : "file", preliminaryIdentifier) +
    "<div class='d-flex flex-column justify-content-between ml-2 w-100'>\n" +
    "<div>\n" +
    "<p class='name'>\n" +
    `${h(name)}\n` +
    "</p>\n" +
    "<span class='size'>\n" +
    `${numberToHumanSize(size)}\n` +
    "</span>\n" +
    "</div>\n" +
    "<div class='align-self-end'>\n" +
    "<button class='btn btn-danger delete cancel-upload' data-type='DELETE'>\n" +
    '<i class="notranslate material-icons">delete</i>\n' +
    "<span>\n" +
    "Delete\n" +
    "</span>\n" +
    "</button>\n" +
    "</div>\n" +
    "</div>\n" +
    "</div>\n" +
    "</div>\n"
  );
};

// ---------------------------------------------------------------------------
// polymorphic dispatch (see file header note).
// ---------------------------------------------------------------------------

/** The carrierwave :source view dispatches on the card's typeCode: an image
 *  card uses imageSource (which keeps web URLs raw); any other carrierwave
 *  card (file, the temporary new_file/new_image cards) uses fileSource. */
const polymorphicSourceView: ViewFn = (ctx) => {
  if (ctx.fmt.card.typeCode === "image") return imageSource(ctx);
  return fileSource(ctx);
};

/** The carrierwave :core view dispatches on the card's typeCode: an image
 *  card renders the <img> tag (set/type/image/html_views.rb:5-11); a FILE
 *  card renders the <a href> anchor (set/type/file/core.haml:1); every
 *  OTHER card falls through to the BASE format core.
 *
 *  The fall-through is the Ruby dispatch shape: card-mod-carrierwave has NO
 *  all-set :core (the gem's :core lives only in set/type/file.rb and
 *  set/type/image/html_views.rb, both type-scoped) — the all-set
 *  registrations below (type/file, type/image/html_views) are a TS port
 *  device (the flat view table holds ONE fn per name), so a non-attachment
 *  card reaching this view must answer the base core, exactly as it did
 *  before the registration existed. Routing everything non-image to the
 *  file anchor swallowed every RichText/PlainText/... card's content once
 *  the mod deck was bound at a serving surface (the edit-forms lane's
 *  session2-gap-8 wiring exposed it: the XHR save response's titled slot
 *  rendered title-only because the card body's :core answered ""). */
const BASE_CORE: ViewFn | undefined = HTML_VIEWS["core"];
const polymorphicCoreView: ViewFn = (ctx) => {
  if (ctx.fmt.card.typeCode === "image") return imageHtmlCoreView(ctx);
  if (ctx.fmt.card.typeCode === "file" || ctx.fmt.card.typeName === "File") {
    return fileCoreView(ctx);
  }
  if (BASE_CORE === undefined) return "";
  return BASE_CORE(ctx);
};

// ---------------------------------------------------------------------------
// the manifest
// ---------------------------------------------------------------------------

const cardModCarrierwave: DeckoModManifest = {
  name: "carrierwave",
  gemName: "card-mod-carrierwave",
  group: "gem-defaults",
  setModules: [
    // set/type/file.rb - the file type's format block (lines 19-64).
    // NOT ported: `attachment :file, uploader: CarrierWave::FileCardUploader`
    // (line 1), the `SelectedAction` module + `include SelectedAction` (lines
    // 4-17), and the format :file block (lines 66-106, depends on
    // send_file / Rails response). The file-specific :source + :core
    // bodies live in fileCoreView / fileSource above; the polymorphic
    // registrations at the bottom of this manifest dispatch on
    // typeCode === "image" to route image cards to the image views.
    // The set module itself is registered in the basket for bookkeeping
    // parity with Ruby (set/abstract/loader.rb:185 + registrar.rb:21-29).
    {
      // cwwrite-seam port: set/type/file.rb format :html views :input
      // (:119-125) + :preview_editor (:127-129, unknown: true, cache:
      // :never). Oracle-pinned bytes; the editor context rides render opts.
      setPath: "type/file",
      formats: {
        html: {
          views: [
            // set/type/file.rb view :source (Ruby files it on the base
            // Format; the html chain is where this port dispatches it)
            { view: "source", viewFn: polymorphicSourceView },
            // set/type/file.rb format :html view :core (core.haml)
            { view: "core", viewFn: polymorphicCoreView },
            { view: "input", viewFn: fileInputView },
            {
              view: "preview_editor",
              viewFn: filePreviewEditorView,
              config: { unknown: true, cache: "never" },
            },
          ],
        },
      },
    },

    // set/type/image.rb - the image type's format block. NOT ported:
    // `attachment :image, uploader: CarrierWave::ImageCardUploader`
    // (line 1), `create_versions?` + `svg?` (lines 5-11), and the
    // carrierwave mount plumbing (24 events total across the type/image +
    // abstract/attachment modules). Same shape as type/file: registered
    // for bookkeeping, the polymorphic views dispatch on typeCode.
    {
      // set/type/image.rb format block: :source (unknown: :blank, 26-28),
      // :inline (74-76) and :one_line_content (17-20), filed on the base
      // Format of the Type::Image set in Ruby; dispatched on the html chain
      // here.
      setPath: "type/image",
      formats: {
        html: {
          views: [
            { view: "source", viewFn: polymorphicSourceView, config: { unknown: "blank" } },
            { view: "inline", viewFn: imageInlineView },
            { view: "one_line_content", viewFn: imageOneLineContentView },
          ],
        },
      },
    },

    // set/type/image/html_views.rb - the image type's html format block.
    // The :full_width, :preview, :content_changes views are
    // image-specific (no Ruby file analog), so they're registered here
    // (the polymorphic :core above handles image-vs-file dispatch).
    // NOT ported: :content_changes's diff rendering (depends on
    // Card::Content::Diff which is a separate surface - the headless
    // port emits the structural pair of :core bytes, without the inline
    // added/deleted chunk highlighting).
    {
      setPath: "type/image/html_views",
      formats: {
        html: {
          views: [
            // html_views.rb:5-11 view :core
            { view: "core", viewFn: polymorphicCoreView },
            { view: "full_width", viewFn: imageHtmlFullWidthView },
            { view: "content_changes", viewFn: imageHtmlContentChangesView },
            // image/html_views.rb:2 `include File::HtmlFormat`: :input and
            // :preview_editor come from Type::File (concrete-set-includes.ts),
            // and `preview` is a format method there, not a view.
          ],
        },
      },
    },

    // set/self/favicon.rb - the favicon card. Ported: :link_tag (7-11,
    // perms: :none), raw_help_text (13-16). The :source override
    // (lines 1-5) is folded into the polymorphic :source below; the
    // favicon card's render goes through polymorphicSourceView (which
    // dispatches on typeCode - the favicon card has typeCode === "image"
    // when it's image-typed and falls through to fileSource otherwise).
    {
      setPath: "self/favicon",
      formats: {
        html: {
          views: [
            // favicon.rb:1-5 view :source (base Format in Ruby)
            { view: "source", viewFn: polymorphicSourceView },
            {
              view: "link_tag",
              viewFn: faviconLinkTagView,
              config: { perms: "none" },
            },
          ],
        },
      },
    },

    // set/self/search.rb - the search module. Ported: :image_complete view
    // (json format, lines 1-8). The body returns "[]" in the headless
    // engine (no search backend). The cache: :never config is recorded.
    {
      setPath: "self/search",
      formats: {
        json: {
          views: [
            {
              view: "image_complete",
              viewFn: searchJsonImageCompleteView,
              config: { cache: "never" },
            },
          ],
        },
      },
    },

    // set/self/new_file.rb - the new_file card (the temporary card used for
    // uploads before the real card has an id). NOT ported: the cache:
    // :never override views (:source / :core / :input) call super(), which
    // in Ruby's set-module hierarchy walks UP to type/file's view. The TS
    // engine's flat view table cannot express that - a view that calls
    // renderView on its own name recurses infinitely. The set module's
    // `def upload_dir; tmp_upload_dir; end` (lines 1-3) also cannot be
    // ported - depends on the upload_cache_card (00_upload_cache.rb) which
    // requires the carrierwave upload-cache state.
    // We register the set module in the basket (so the loader's bookkeeping
    // knows Self::NewFile is part of the mod's surface) but emit no
    // format-block views.
    { setPath: "self/new_file" },

    // set/self/new_image.rb - the new_image card. Mirrors new_file's
    // reason-for-not-porting (super() recurses on the flat view table).
    // The set module is registered in the basket.
    { setPath: "self/new_image" },

    // set/self/admin.rb - the admin-surface basket push:
    // `basket[:tasks][:delete_upload_tmp_files] = { mod: :carrierwave,
    // execute_policy: -> { Card.delete_tmp_files_of_cached_uploads } }`
    // (lines 1-4; the commented-out :move_files entry stays unported, as
    // in the gem). The execute_policy lambda shells at the asset pipeline
    // and has no headless surface; the task-table strings are the mod's
    // own en.yml:18-19 (carrierwave_task_delete_upload_tmp_files_*).
    // Oracle-pinned: the *admin :core task table's fourth row
    // (fixtures/captured/admin-views-2-oracle.json).
    {
      setPath: "self/admin",
      basketTasks: [
        {
          task: "delete_upload_tmp_files",
          mod: "carrierwave",
          linkText: "Delete upload tmp files",
          description: "Delete upload tmp files!",
        },
      ],
    },

  ],
};

export default cardModCarrierwave;
// Internal helpers + view fns exported so the test file can verify byte
// parity directly. The mod loader consumes the manifest only; the
// standalone exports are for the test seam.
export {
  contextualizePath,
  storageTypeFromContent,
  fileCoreView,
  imageHtmlCoreView,
  imageHtmlFullWidthView,
  imageHtmlPreviewView,
  imageHtmlContentChangesView,
  imageOneLineContentView,
  faviconLinkTagView,
  searchJsonImageCompleteView,
  FAVICON_RAW_HELP_TEXT,
  fileInputView,
  imageInputView,
  filePreviewEditorView,
  numberToHumanSize,
};
