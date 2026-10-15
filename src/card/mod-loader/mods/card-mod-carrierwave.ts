import { NoMethodError, str } from "../../render/format.js";
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
// EVENTS: all Ruby event declarations are in
// the manifest — the five abstract/attachment save events, the six
// upload-cache lifecycle events, the two storage-type events, the
// cloud/coded/local events, and the ten card_mount dynamic events
// (card_mount.rb's `event :store_#{column}_event` templates, declared per
// column as store_file_event/store_image_event etc.). Engine-owned where
// the attachment save path implements the behavior (card-action-engine.ts
// cites the events per step); stubs carry per-event reasons at their
// declarations below. The earlier "NOT ported ... requires carrierwave
// runtime" claims for the set/abstract/attachment files predate the
// engine's attachment runtime and are superseded by the per-event dispositions.
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
//   the basket machinery (a cron-style scheduled task, which this engine does
//   not run: nothing here schedules background work, so a port would need a
//   scheduler this codebase deliberately does not have)
// - set/all/file_utils.rb - ClassMethods for delete_tmp_files_of_cached_uploads
//   + draft_actions_with_attachment SQL; requires the Action model
// - set/type/file.rb format :html views :input, :preview_editor - PORTED:
//   the file_chooser haml bytes, the config-gated
//   text_field bytes, and the preview_editor haml bytes. The upload-cache
//   draft LIFECYCLE (the two-step preliminary upload's events,
//   00_upload_cache.rb) stays unported; the editor views read their editor
//   context through render opts (the composition layer's contract — the
//   source of the params in Ruby), and the NO-PARAM render is stock
//   Ruby's raise (preview_editor's cached_upload_card_name gsub on nil).
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
import type {
  DeckoModManifest,
  ModEventCard,
  ModEventFn,
  ModEventRegistration,
} from "../mod-manifest.js";
import { engineOwnedEvent } from "../mod-manifest.js";
import { numberToHumanSize } from "./rails-number-to-human-size.js";

/** The set-module event declarations:
 *  stub-bodied unless the engine owns the behavior (then engineOwnedEvent).
 *  Same shape as core-mod.ts's local helper; the per-event owner or stub
 *  reason rides the declaration's comment. */
function event(
  decl: Omit<ModEventRegistration, "fn"> & { fn?: ModEventFn },
): ModEventRegistration {
  return { fn: () => undefined, ...decl };
}

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
 *  — so the stored key is never the rendered filename: the action id split
 *  off the identifier (the segment before the final extension) becomes the
 *  rendered filename, e.g. db_content `(my_bucket)/12/34.abr.1.doc` renders
 *  `http://s3.amazonaws.com//files/12/1.doc`. */
function contextualizePath(content: string, cardId?: number): string {
  const trimmed = content.trim();
  if (trimmed === "") return "";
  const type = storageTypeFromContent(trimmed);
  if (type === "web") return trimmed;
  if (type === "cloud") {
    // fog public_url ("#{asset_host}/#{encoded_path}", carrierwave-3.1.4
    // storage/fog.rb:365-372) of the DERIVED retrieve path — the asset
    // host + /files/<card-id>/<action-id><ext>.
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
// apostrophe — `<a href='SRC'>Download +child</a>`. The empty-source arm
// still renders "" (file.rb:34-45).
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
    // resolve the cloud bucket content to the
    // /files/<id>/<file>-<variant>.<ext> URL the deck serves, with
    // the deck's CDN host (engine imageCdnHost) when configured and the
    // determine_image_size variant appended (full→original, absent→
    // medium — set/type/image.rb:44-57; see cloudImageUrl in views.ts).
    // The old verbatim-bucket return leaked a raw "(my_bucket)/..." src
    // the oracle never emits — a regression once the engine started
    // rendering image bodies non-empty.
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
 *  non-image cards too — a divergence a type-collision audit flagged
 *  ("renderView core size icon, no type guard"); this type
 *  guard closes it. The dispatch-ORDER walker is separate
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
 *  (views.ts formatImageCore), shared for every storage shape: one
 *  implementation, so the chain and the base table cannot render an image
 *  differently. */
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
  // Rails' image_tag attr order (Tags::Base#render): the caller opts first
  // (alt, class), src LAST, and the void tag self-closes (" />").
  return `<img alt="${h(ctx.fmt.card.name.s)}" class="w-100" src="${h(src)}" />`;
};

/** set/type/image/html_views.rb:36-43 def preview. */
/** The coded attachment's ORIGINAL filename, keyed by the codename part
 *  of the source URL: the favicon's coded files are image.png (+ the
 *  -medium/-icon/-large versions under mod/carrierwave/data/files/
 *  favicon/), so the attachment's filename is image.png. */
const CODED_ORIGINAL_FILENAMES: Record<string, string> = {
  favicon: "image.png",
};

function codedOriginalFilename(source: string): string | undefined {
  const match = /\/files\/:([a-z0-9_-]+)\//.exec(source);
  if (match === null) return undefined;
  return CODED_ORIGINAL_FILENAMES[match[1].toLowerCase()];
}

const imageHtmlPreviewView: ViewFn = (ctx) => {
  const inner = ctx.fmt.renderView("core", { size: "medium" });
  if (inner === "") return "";
  // html_views.rb:40 preview id: `card.attachment.filename` — the
  // attachment's ORIGINAL filename (image.png for the coded favicon), not
  // the card name.
  const source = str(ctx.fmt.renderView("source", { size: "medium" }));
  const originalName =
    codedOriginalFilename(source) ?? ctx.fmt.card.name.s;
  return `<div class="attachment-preview" id="${h(originalName)}-preview">${inner}</div>`;
};

/** card/lib/card/content/diff.rb:16-18 `render_added_chunk` -
 *  `<ins class='diffins diff-added'>#{text}</ins>` (the class order is the
 *  literal's). Its sibling :20-22 `render_deleted_chunk`
 *  (`<del class='diffdel diff-deleted'>`, the deleted side) is named in the
 *  old-image remainder below. */
function renderAddedChunk(text: string): string {
  return `<ins class='diffins diff-added'>${text}</ins>`;
}

/** set/type/image/html_views.rb:49-51 view :content_changes —
 *  `content_changes card.last_action, :expanded` (hide_diff defaults
 *  false, so the old side renders). The body (html_views.rb:53-56) is
 *  `voo.size = diff_type == :summary ? :icon : :medium` (the expanded diff
 *  is the medium size) then `[old_image(action, hide_diff),
 *  new_image(action)].compact.join`.
 *
 *  old_image (html_views.rb:58-66) renders NOTHING unless the card has an
 *  earlier db_content change (`card.last_change_on(:db_content,
 *  before: action)`, html_views.rb:68-72; last.rb:9-21's before: window
 *  scopes out create actions — last.rb:27-29 create_action_last_change?),
 *  so a card whose last action is the create that uploaded the file has
 *  no deleted side and the pair joins to the added side alone (the oracle
 *  bytes for synthetic-v2 `view:admin:*favicon:content_changes` are
 *  exactly the single `<ins class='diffins diff-added'><img .../></ins>`).
 *  When an earlier change exists, old_image renders the core as of that
 *  change's action, which is the file version this port has no read seam
 *  for (attachment versions are not in the act bundle); that arm raises a
 *  named not-ported error instead of emitting a partial pair.
 *
 *  new_image (html_views.rb:74-78) is the CURRENT core in an added chunk:
 *  `card.with_selected_action_id action.id { Diff.render_added_chunk
 *  _render_core }`. The action carries no db_content Change row of its own
 *  for a plain upload (the attachment lives in the file column), so
 *  value(:db_content) is nil and Action#content_diff
 *  (card/action/content.rb) falls back to the card's current content —
 *  the same :core bytes the view renders. */
const imageHtmlContentChangesView: ViewFn = (ctx) => {
  const reader = ctx.fmt.engine.historyRenderReader?.();
  if (reader === undefined) {
    throw new Error("content_changes: the history render seam is not prepared for this render (card.last_action is unreadable)");
  }
  const action = reader.cardLastAction;
  if (action === undefined) {
    // new_image (html_views.rb:74-75) calls `action.id`; a card with no
    // action raises NoMethodError on nil there.
    throw new Error("content_changes: card has no last action (Ruby nil.id NoMethodError, html_views.rb:75)");
  }
  // old_image's gate (html_views.rb:58-66 -> old_image_change :68-72):
  // `card.last_change_on(:db_content, before: action)` - a Change row on
  // this card's db_content older than this action (last.rb:9-21; a CREATE
  // action scopes the window out, last.rb:27-29). The seam's change rows
  // are the bundle's actions' changes (render.ts valueCache /
  // previousCache build), so the earlier db_content change is the one
  // previous_value(:db_content) reads.
  if (reader.previousValue(action, "db_content") !== undefined) {
    // old_image renders the card's core AS OF that change's action inside
    // render_deleted_chunk (html_views.rb:61-65). The core of an earlier
    // attachment revision is not ported; the render fails loudly rather
    // than dropping the deleted side.
    throw new Error("content_changes: old_image for an earlier db_content change is not ported (html_views.rb:58-66)");
  }
  // new_image (html_views.rb:74-78): the added chunk wraps the core
  // unconditionally, a blank core included.
  return renderAddedChunk(str(ctx.fmt.renderView("core")));
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
  // favicon.rb:7-11: `return unless (source = render :source, size: :small)`
  // - the source renders at the SMALL carrierwave variant (imageSource's
  // voo.size read, via a size-small ctx clone), and the nil arm (a blank
  // source) renders Ruby's nil (the headless "").
  const smallCtx = {
    ...ctx,
    voo: { ...(ctx.voo ?? {}), opts: { ...(ctx.voo?.opts ?? {}), size: "small" } },
  } as unknown as typeof ctx;
  const src = imageSource(smallCtx);
  if (src === "") return "";
  return `<link rel="shortcut icon" href="${h(src)}" />`;
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
// emit.
// ---------------------------------------------------------------------------

/** Rails' number_to_human_size — implemented once in
 *  rails-number-to-human-size.ts (its tests pin the byte
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
 *  appends "form-control" to the class list), e.g. web content renders
 *  <input class="d0-card-content form-control" type="text"
 *   value="http://example.com/attach.png" name="card[content]"
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
 *  ("~<cache card>/<draft action><ext>") when the preview editor renders
 *  the upload round trip:
 *  Ruby's render card carries the draft's selected content there
 *  (load_action -> select_action_by_params on the success hash's rev_id,
 *  card_controller/response.rb:54-62 + rest.rb:105; SelectedAction's
 *  content_at_time_of_selected_action reads the draft's db_content change
 *  row, selected.rb:37-44, including_drafts: true), so the wrapped core
 *  resolves the just-stored draft file. The id
 *  is attachment.filename (html_views.rb:40) — the stored draft file's
 *  basename "<action id><ext>" — NOT the card name the standing
 *  imageHtmlPreviewView uses for the file-chooser context. */
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
 *  "card[action_id_of_cached_upload]". Outside the two-step upload round
 *  trip the param is absent, Ruby's `params[:attachment_upload]` is nil and
 *  `nil.gsub` raises NoMethodError "undefined method `gsub' for nil" at
 *  card-mod-carrierwave-0.20.0 set/type/file.rb:145; the port raises on the
 *  same absent param. */
function cachedUploadCardName(ctx: ViewContext): string {
  const raw = ctx.voo.opts["attachment_upload"];
  if (typeof raw !== "string") {
    throw new NoMethodError("undefined method `gsub' for nil");
  }
  return raw.replace(/\[\w+\]$/, "[action_id_of_cached_upload]");
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
 *  lastContentActionIdFromIdentifier).
 *
 *  THE NO-PARAM ARM RAISES. Ruby's haml line 2 calls cached_upload_card_name
 *  (file.rb:144-146): `Card::Env.params[:attachment_upload].gsub(...)` —
 *  outside the two-step upload round trip the request params carry no
 *  :attachment_upload, so the gsub lands on nil and the view raises
 *  NoMethodError "undefined method `gsub' for nil" (file.rb:145). The port
 *  raises from its cachedUploadCardName on the same absent param. The
 *  round-trip surface passes the param and keeps the editor bytes below. */
const filePreviewEditorView: ViewFn = (ctx) => {
  // preview_editor.haml line 2 is the first Ruby the template evaluates;
  // it raises there when the request carries no :attachment_upload.
  const uploadCardName = cachedUploadCardName(ctx);
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
    `<input name='${h(uploadCardName)}' type='hidden' value='${actionId ?? ""}'>\n` +
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
 *  the mod deck was bound at a serving surface (a serving-surface bug
 *  exposed it: the XHR save response's titled slot
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
// the `when:` predicates (mod-loader/mod-event-card-state.ts supplies the
// state they read; the table itself is the Ruby method bodies).
//
// A predicate here is a card method in Ruby (set/event/all.rb:79-85: a
// Symbol condition is sent to the card), so each is written against the
// fields the carrierwave state source populates from the same Ruby
// definitions — never against what the port happens to do.
// ---------------------------------------------------------------------------

/** deprecated_mod_file? (set/abstract/attachment/coded.rb:73-75):
 *  `content.present? && !content.match?(/^~/) && content.split("\n")&.size == 4`
 *  — the pre-codename four-line mod-file content still in card_changes
 *  (coded.rb:76-78). */
function deprecatedModFile(content: string | null | undefined): boolean {
  if (content === undefined || content === null) return false;
  if (content.trim() === "") return false;
  if (/^~/.test(content)) return false;
  return content.split("\n").length === 4;
}

/** storage_type_from_content (set/abstract/attachment/01_storage_type.rb:
 *  102-116) with its `configured` fallback spelled out:
 *
 *      case content
 *      when /^\(/          then :cloud
 *      when %r{/^https?:/} then :web
 *      when /^~/           then :local
 *      when /^:/           then :coded
 *      else deprecated_mod_file? ? :coded : storage_type_from_config
 *      end
 *
 *  The render-side `storageTypeFromContent` above answers "unknown" for the
 *  last arm because a view has no config to fall back to; a `when:` does,
 *  so this is the grammar the predicates read. */
export function rubyStorageTypeFromContent(
  content: string | null | undefined,
  configured: string,
): string {
  if (content === undefined || content === null) return configured;
  if (/^\(/.test(content)) return "cloud";
  if (/^https?:/.test(content)) return "web";
  if (/^~/.test(content)) return "local";
  if (/^:/.test(content)) return "coded";
  return deprecatedModFile(content) ? "coded" : configured;
}

/** bucket_from_content (cloud.rb:72-76): the `(bucket)` prefix of a cloud
 *  identifier. Nil when the content names none. */
export function rubyBucketFromContent(content: string | null | undefined): string | undefined {
  if (content === undefined || content === null) return undefined;
  const m = /^\(([^)]+)\)/.exec(content);
  return m !== null ? m[1] : undefined;
}

/** mod_from_content (coded.rb:35-40) — `m[1]` of `^:[:\w/+]+/([^./]+)\.` for
 *  the current identifier format, else the deprecated four-line content's
 *  last line (mod_from_deprecated_content, :78-80). Nil when neither. */
export function rubyModFromContent(content: string | null | undefined): string | undefined {
  if (content === undefined || content === null) return undefined;
  const m = /^:[:\w/+]+\/([^./]+)\./.exec(content);
  if (m !== null) return m[1];
  return deprecatedModFile(content)
    ? (content.split("\n").at(-1) ?? undefined)
    : undefined;
}

/** activeSupport `present?` — not nil and not blank (an all-whitespace
 *  string is blank). The predicates Ruby writes with `.present?` share
 *  this one definition. */
function present(value: unknown): boolean {
  if (value === undefined || value === null || value === false) return false;
  if (typeof value === "string") return value.trim() !== "";
  return true;
}

/** Ruby truthiness for a value read off a params hash: only nil and false
 *  are falsy, so an EMPTY STRING is true (00_upload_cache.rb:80-82's
 *  `Card::Env.params[:attachment_upload]` returns the value itself). */
function truthy(value: unknown): boolean {
  return value !== undefined && value !== null && value !== false;
}

/** storage_type (01_storage_type.rb:45-47) resolved by the state source:
 *  `coded?` (:32-34) / `local?` (:28-30) / `web?` (:24-26) /
 *  `cloud?` (:20-22) all read this one memoized value. */
function storageTypeIs(card: ModEventCard, type: string): boolean {
  return card.storageType === type;
}

export const carrierwaveModEventPredicates = {
  /** `store_#{column}_event?` (lib/carrier_wave/card_mount.rb:59-63):
   *  `!coded? || ENV["STORE_CODED_FILES"]` — a coded attachment (a mod
   *  file) is NOT written to the deck's files unless the deck opts in.
   *  One method per mounted column; the bodies are identical. */
  "store_file_event?": (card: ModEventCard): boolean =>
    !storageTypeIs(card, "coded") || card.storeCodedFiles === true,
  "store_image_event?": (card: ModEventCard): boolean =>
    !storageTypeIs(card, "coded") || card.storeCodedFiles === true,
  /** incorrect_identifier? (set/abstract/attachment.rb:40-45):
   *  `return false if web?; correct_id = attachment.db_content;
   *   correct_id.present? && db_content != correct_id` — the mounted
   *  column must carry the identifier the mount computed, which needs the
   *  card id and so can only be known after the row exists (the event's
   *  own comment, :13-14). */
  "incorrect_identifier?": (card: ModEventCard): boolean =>
    !storageTypeIs(card, "web") &&
    present(card.attachmentIdentifierContent) &&
    card.dbContent !== card.attachmentIdentifierContent,
  /** write_identifier? (attachment.rb:47-49): `!web?` — a web card's
   *  content IS its url and is never overwritten with an identifier. */
  "write_identifier?": (card: ModEventCard): boolean => !storageTypeIs(card, "web"),
  /** file_ready_to_save? (attachment.rb:51-56): a file rides the save,
   *  it is not a preliminary upload and not the two-step upload's final
   *  save, and the mount's column is changing. */
  "file_ready_to_save?": (card: ModEventCard): boolean =>
    card.attachmentPresent === true &&
    !truthy(card.params?.["attachment_upload"]) &&
    !present(card.actionIdOfCachedUpload) &&
    card.attachmentIsChanging === true,
  /** preliminary_upload? (set/abstract/attachment/00_upload_cache.rb:
   *  80-82): `Card::Env.params[:attachment_upload]` — the first step of a
   *  two-step upload, the save that only caches the bytes. */
  "preliminary_upload?": (card: ModEventCard): boolean =>
    truthy(card.params?.["attachment_upload"]),
  /** save_preliminary_upload? (00_upload_cache.rb:84-86):
   *  `@action_id_of_cached_upload.present?` — the second step, the save
   *  that adopts the cached draft's file. */
  "save_preliminary_upload?": (card: ModEventCard): boolean =>
    present(card.actionIdOfCachedUpload),
  /** storage_changed? (01_storage_type.rb:49-53): the saved storage type,
   *  bucket or mod differs from the card's stored one (`current`, :12-14
   *  `refresh true`). */
  "storage_changed?": (card: ModEventCard): boolean =>
    card.storageType !== card.currentStorageType ||
    card.currentStorageBucket !== card.savedStorageBucket ||
    card.currentStorageMod !== card.savedStorageMod,
  /** coded? (01_storage_type.rb:32-34): `storage_type == :coded`. */
  "coded?": (card: ModEventCard): boolean => storageTypeIs(card, "coded"),
  /** local? (01_storage_type.rb:28-30): `storage_type == :local`. */
  "local?": (card: ModEventCard): boolean => storageTypeIs(card, "local"),
  /** change_bucket_if_read_only? (set/abstract/attachment/cloud.rb:118-120):
   *  `cloud? && bucket_config[:read_only] && attachment_is_changing?` — a
   *  read-only bucket's cloud card falls back to the configured storage
   *  when a new file arrives. */
  "change_bucket_if_read_only?": (card: ModEventCard): boolean =>
    storageTypeIs(card, "cloud") &&
    card.bucketReadOnly === true &&
    card.attachmentIsChanging === true,
  /** uncode? (set/abstract/attachment/coded.rb:26-28):
   *  `(@explicit_storage_type != :coded) && !set_specific[:mod].present? &&
   *   current.coded?` — a coded card that this save did not ask to stay
   *  coded moves to the configured storage. */
  "uncode?": (card: ModEventCard): boolean =>
    card.explicitStorageType !== "coded" &&
    !present(card.assignedMod) &&
    storageTypeIs(card, "coded") === false &&
    card.currentStorageType === "coded",
} as const;

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
    // set/type/file.rb format :html views :input
    // (:119-125) + :preview_editor (:127-129, unknown: true, cache:
    // :never). The editor context rides render opts.
    //
    // Events: the five card_mount dynamic
    // events for the :file column (lib/carrier_wave/card_mount.rb:32-53 —
    // Abstract::Attachment's included-hook extends CarrierWave::CardMount
    // onto Type::File, attachment.rb:11-13, and the mount defines these on
    // the host set). A literal `event :name` scan of the source only sees
    // the TEMPLATE `event :store_#{column}_event`; the concrete events Ruby
    // loads are these two per-column
    // pairs + trio, declared here under their real names.
    setPath: "type/file",
    events: [
      // card_mount.rb:32-34 `event :store_#{column}_event, :finalize,
      // when: :store_#{column}_event?` — engine: the save path's
      // :store_attachment! step (card-action-engine.ts:774, 1714-1723,
      // the AttachmentStore.store call).
      engineOwnedEvent({ event: "store_file_event", at: "finalize", when: "store_file_event?" }),
      // card_mount.rb:37-39 `event :remove_#{column}_event, :finalize,
      // on: :delete, when: :no_history?` — STUB, named remainder: the
      // delete path has no stored-file cleanup yet (no attachment arm on
      // deleteCard; the files of a deleted card's actions stay on disk,
      // matching the action rows a restore would need). Ruby runs it only
      // for no-history cards.
      event({ event: "remove_file_event", at: "finalize", on: ["delete"], when: "no_history?" }),
      // card_mount.rb:41-43 `event :mark_remove_#{column}_false_event,
      // :finalize, on: :update` — STUB: CarrierWave's mounter dirty-state
      // reset (mark_remove_#{column}_false); the port's attachment input
      // has no remove flag to reset (the AR mounter state machine has no
      // TS counterpart).
      event({ event: "mark_remove_file_false_event", at: "finalize", on: ["update"] }),
      // card_mount.rb:45-48 `event :reset_previous_changes_for_#{column}_event,
      // :finalize, when: :no_history?` — STUB: ActiveRecord
      // dirty-tracking glue (reset_previous_changes_for_#{column}); the
      // port's save path has no AR changes accumulator to reset.
      event({ event: "reset_previous_changes_for_file_event", at: "finalize", when: "no_history?" }),
      // card_mount.rb:50-53 `event :remove_previously_stored_#{column}_event,
      // :finalize, on: :update, when: :no_history?` — STUB: fires only on
      // no-history attachment saves; File/Image cards keep history (the
      // engine's NO_HISTORY set lists right codenames, never the mount
      // types), so the gate is false in both systems' common case.
      event({ event: "remove_previously_stored_file_event", at: "finalize", on: ["update"], when: "no_history?" }),
    ],
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
    // (line 1), `create_versions?` + `svg?` (lines 5-11). Same shape as
    // type/file: registered for bookkeeping, the polymorphic views
    // dispatch on typeCode.
    //
    // Events: the five card_mount dynamic
    // events for the :image column (card_mount.rb:32-53; see the type/file
    // block for the per-event disposition — identical bodies, one column
    // apart).
    {
      // set/type/image.rb format block: :source (unknown: :blank, 26-28),
      // :inline (74-76) and :one_line_content (17-20), filed on the base
      // Format of the Type::Image set in Ruby; dispatched on the html chain
      // here.
      setPath: "type/image",
      events: [
        engineOwnedEvent({ event: "store_image_event", at: "finalize", when: "store_image_event?" }),
        event({ event: "remove_image_event", at: "finalize", on: ["delete"], when: "no_history?" }),
        event({ event: "mark_remove_image_false_event", at: "finalize", on: ["update"] }),
        event({ event: "reset_previous_changes_for_image_event", at: "finalize", when: "no_history?" }),
        event({ event: "remove_previously_stored_image_event", at: "finalize", on: ["update"], when: "no_history?" }),
      ],
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
    // own en.yml:18-19 (carrierwave_task_delete_upload_tmp_files_*); the
    // task table row shows in the *admin card's :core.
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

    // ------------------------------------------------------------------
    // The abstract/attachment set files.
    // The events' BEHAVIOR lives in the engine's attachment save path
    // (src/card/actions/card-action-engine.ts — the attachment runtime,
    // whose per-step comments cite these very events) and the local-only
    // AttachmentStore; stubs below carry per-event reasons.
    // ------------------------------------------------------------------

    {
      // set/abstract/attachment.rb — the five attachment save events.
      // Abstract::Attachment is included by exactly Type::File and
      // Type::Image (attachment :file / attachment :image).
      setPath: "abstract/attachment",
      events: [
        // attachment.rb:9-11 `event :select_file_revision, after:
        // :select_action` — STUB, named remainder: runtime retrieval of a
        // selected action's stored bytes (retrieve_from_store!); the port
        // reads CURRENT bytes through the store seam and has no
        // action-scoped retrieval surface.
        event({ event: "select_file_revision", after: "select_action" }),
        // attachment.rb:15-18 `event :correct_identifier, :finalize,
        // on: :save, when: :incorrect_identifier?` — engine: the save
        // path's raw db_content column write (card-action-engine.ts:863,
        // citing attachment.rb:15-17; index.ts:11-12 names the pair).
        engineOwnedEvent({ event: "correct_identifier", at: "finalize", on: ["save"], when: "incorrect_identifier?" }),
        // attachment.rb:20-24 `event :save_original_filename,
        // :prepare_to_store, on: :save, when: :file_ready_to_save?` —
        // engine: the action row's comment carries the upload's original
        // filename (card-action-engine.ts:1685-1687).
        engineOwnedEvent({ event: "save_original_filename", at: "prepare_to_store", on: ["save"], when: "file_ready_to_save?" }),
        // attachment.rb:26-34 `event :validate_file_exist, :validate,
        // on: :create, skip: :allowed` — engine:
        // card-action-engine.ts validateFileExist (:910-971, "url is
        // missing" / "is missing" arms; called at :1416).
        engineOwnedEvent({ event: "validate_file_exist", at: "validate", on: ["create"], skip: "allowed" }),
        // attachment.rb:36-38 `event :write_identifier, after:
        // :save_original_filename, when: :write_identifier?` — engine:
        // the db_content identifier write at prepare_to_store
        // (card-action-engine.ts:2244-2251) + the finalizer pair
        // (:1714-1723).
        engineOwnedEvent({ event: "write_identifier", after: "save_original_filename", when: "write_identifier?" }),
      ],
    },
    {
      // set/abstract/attachment/00_upload_cache.rb — the draft-upload
      // cache lifecycle. Engine: the preliminary-upload flow
      // (card-action-engine.ts:3659+ — the abort + cachedUploadAttachment
      // walk citing these events) and the fromCachedUpload flag.
      setPath: "abstract/attachment/00_upload_cache",
      events: [
        // 00_upload_cache.rb:8-25 `event :prepare_attachment,
        // :prepare_to_validate, on: :save, when: :preliminary_upload?` —
        // engine: the preliminary-upload abort arm
        // (card-action-engine.ts:3659, "a preliminary upload requires the
        // engine's attachmentStore option"; the cached-draft flow).
        engineOwnedEvent({ event: "prepare_attachment", at: "prepare_to_validate", on: ["save"], when: "preliminary_upload?" }),
        // :27-34 `event :assign_attachment_on_create, :initialize,
        // after: :assign_action, on: :create, when:
        // :save_preliminary_upload?` — engine: cachedUploadAttachment
        // (card-action-engine.ts:3702-3707 cites this event pair).
        engineOwnedEvent({ event: "assign_attachment_on_create", at: "initialize", after: "assign_action", on: ["create"], when: "save_preliminary_upload?" }),
        // :36-43 assign_attachment_on_update — engine: same walk.
        engineOwnedEvent({ event: "assign_attachment_on_update", at: "initialize", after: "assign_action", on: ["update"], when: "save_preliminary_upload?" }),
        // :51-58 delete_cached_upload_file_on_create — engine: the flow
        // deletes the cached draft's files + action (:3704-3705).
        engineOwnedEvent({ event: "delete_cached_upload_file_on_create", at: "integrate", on: ["create"], when: "save_preliminary_upload?" }),
        // :62-64 `event :clear_draft_files, :integrate_with_delay,
        // priority: 100, on: :create` — STUB with an architecture reason:
        // the sweep deletes stray tmp files of canceled creates
        // (Card.delete_tmp_files_of_cached_uploads); the port holds cached
        // uploads in memory (bytes ride the save input), so the stray-tmp
        // state the sweep plugs cannot arise. The admin basket task that
        // calls the same sweep stays (self/admin above).
        event({ event: "clear_draft_files", at: "integrate_with_delay", priority: 100, on: ["create"] }),
        // :66-72 delete_cached_upload_file_on_update — engine: same walk.
        engineOwnedEvent({ event: "delete_cached_upload_file_on_update", at: "integrate", on: ["update"], when: "save_preliminary_upload?" }),
      ],
    },
    {
      // set/abstract/attachment/01_storage_type.rb — storage-type moves.
      // The port is single-backend (local files dir; web URLs ride the
      // attachment input's typed arms) — the storage-type TRANSITION
      // machinery has no backend to target.
      setPath: "abstract/attachment/01_storage_type",
      events: [
        // 01_storage_type.rb:3-6 `event :update_storage, :store,
        // on: :update, when: :storage_changed?` — STUB, named remainder:
        // re-stores the file under the NEW storage type's backend
        // (send "#{attachment_name}=", current.attachment.file); the port
        // has exactly one backend, so a storage change has no move to
        // perform.
        event({ event: "update_storage", at: "store", on: ["update"], when: "storage_changed?" }),
        // :8-10 `event :validate_storage_type, :validate, on: :save` —
        // STUB: errors.add :storage_type for a content-derived storage
        // type outside CarrierWave::STORAGE_TYPES; the port never derives
        // a storage type from content (the identifier grammar it parses,
        // attachment-content.ts, is the local one).
        event({ event: "validate_storage_type", at: "validate", on: ["save"] }),
      ],
    },
    {
      // set/abstract/attachment/cloud.rb — S3/fog buckets. No cloud
      // runtime in the port (the gem's own fog dependency stays Ruby-side).
      setPath: "abstract/attachment/cloud",
      events: [
        // cloud.rb:3-6 `event :change_bucket_if_read_only, :initialize,
        // on: :update, when: :change_bucket_if_read_only?` — STUB: resets
        // the storage type for read-only-bucket cloud decks; no cloud
        // backend exists.
        event({ event: "change_bucket_if_read_only", at: "initialize", on: ["update"], when: "change_bucket_if_read_only?" }),
      ],
    },
    {
      // set/abstract/attachment/coded.rb — mod-file coded storage
      // (identifiers like ":mod/path/file.ext" resolved against
      // Cardio::Mod.dirs). The port's local backend is deck-files only.
      setPath: "abstract/attachment/coded",
      events: [
        // coded.rb:3-5 `event :uncode_attachment_storage, :initialize,
        // on: :update, when: :uncode?` — STUB: transitions a coded-stored
        // attachment to the configured storage; no coded backend to
        // transition from.
        event({ event: "uncode_attachment_storage", at: "initialize", on: ["update"], when: "uncode?" }),
        // coded.rb:7-10 `event :validate_coded_storage_type, :validate,
        // on: :save, when: :coded?` — STUB: the mod/codename argument
        // validation for coded saves; unreachable without coded storage.
        event({ event: "validate_coded_storage_type", at: "validate", on: ["save"], when: "coded?" }),
      ],
    },
    {
      // set/abstract/attachment/local.rb — public symlink management.
      // The port serves files through its own routes
      // (src/server/file-routes.ts); there is no public symlink dir to
      // maintain (and no read-rule-driven symlink flip).
      setPath: "abstract/attachment/local",
      events: [
        // local.rb:1-3 update_public_link_on_create — STUB (symlinks).
        event({ event: "update_public_link_on_create", at: "integrate", on: ["create"], when: "local?" }),
        // local.rb:5-7 remove_public_link_on_delete — STUB (symlinks).
        event({ event: "remove_public_link_on_delete", at: "integrate", on: ["delete"], when: "local?" }),
        // local.rb:9-17 update_public_link (after: :update_read_rule) —
        // STUB (symlinks; the read-rule hook fires after the permission
        // refresh event the permissions mod declares).
        event({ event: "update_public_link", after: "update_read_rule", when: "local?" }),
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
