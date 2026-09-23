// The card-mod-carrierwave gem (card-mod-carrierwave-0.20.0), ported
// through the mod loader.
//
// The gem's tree (C:/Ruby33-x64/lib/ruby/gems/3.3.0/gems/
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
// Polymorphic dispatch note: Ruby's Card::Set::All::File and
// Card::Set::All::Image define separate :source / :core views for the file
// and image card types, and Ruby's set-module class hierarchy routes a
// file card's render through the file type's view, an image card's through
// the image type's. The TS render engine has ONE view record per name
// (the live HTML_VIEWS record), so porting the gem's two distinct views
// for the same name would conflict (last registration wins). The headless
// port therefore registers a SINGLE polymorphic view per name that
// dispatches on ctx.fmt.card.typeCode (the type-code field the engine
// populates from the codename registry; set/all/type.rb#type_code).
// File cards (typeCode !== "image") get the file behavior; image cards
// (typeCode === "image") get the image behavior. This preserves both
// bytes paths without requiring the engine to grow a per-card-type view
// dispatch table.
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
// - set/type/file.rb format :html views :input, :preview_editor - both
//   delegate to haml partials (file_chooser.haml, preview_editor.haml) that
//   depend on `card.no_upload?`, `cached_upload_card_name`,
//   `card.selected_action_id`, `card.original_filename`, and the
//   upload-cache-card state - none ported (all carrierwave-runtime)
// - assets/style/file.scss + assets/script/upload.js.coffee - stylesheet +
//   upload JS widget; these are static asset surfaces, not view ports
// - config/locales/*.yml - i18n; no TS consumer
// - config/admin.yml - cardtypes: upload: [file, image] declaration; the
//   admin surface has no TS consumer

import type { ViewContext, ViewFn } from "../../render/format.js";
import { h } from "../../render/slot-html.js";
import type { DeckoModManifest } from "../mod-manifest.js";

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
 *  88-117) define:
 *    coded: mod_dir/file/codename(-variant).ext  (no colon on codename)
 *    local: files_dir/card_id/action_id(-variant).ext
 *    cloud: bucket/bucket_subdir/id/action_id(-variant).ext
 *  The headless port resolves the FILES_WEB_PATH (lib/card/mod/carrierwave.rb:
 *  2 `config.files_web_path = "files"`) for local uploads and the raw URL
 *  for web/cloud. */
function contextualizePath(content: string): string {
  const trimmed = content.trim();
  if (trimmed === "") return "";
  const type = storageTypeFromContent(trimmed);
  if (type === "web") return trimmed;
  if (type === "cloud") {
    // cloud URL is the absolute bucket URL (fog returns it); the headless
    // port returns the content as-is.
    return trimmed;
  }
  if (type === "local") {
    // local: ~/card_id/action_id.ext -> /files/card_id/action_id.ext
    const id = trimmed.replace(/^~/, "");
    return `/files/${id}`;
  }
  if (type === "coded") {
    // coded: :codename/mod_name.ext -> /files/codename.mod_name.ext
    return `/files/${trimmed.replace(/^:/, "").replace(/\//g, ".")}`;
  }
  return "";
}

// ---------------------------------------------------------------------------
// file-type views (set/type/file.rb base format block: lines 19-28).
// `set/type/file.rb:47-50 def source` + `set/type/file.rb:20-22
// view :source`: `card.attachment.url` for local/cloud, the raw
// `card.content` for web, `""` for invalid. `set/type/file.rb:24-28
// view :core`: wraps the source in `<a href="source">source</a>`
// (set/type/file/core.haml:1).
// ---------------------------------------------------------------------------

function fileSource(ctx: ViewContext): string {
  const raw = (ctx.fmt.card.dbContent ?? "").trim();
  return contextualizePath(raw);
}

const fileCoreView: ViewFn = (ctx) => {
  const href = fileSource(ctx);
  if (href === "") return "";
  return `<a href="${h(href)}">${h(href)}</a>`;
};

// ---------------------------------------------------------------------------
// image-type views (set/type/image.rb base format block: lines 13-77).
// `set/type/image.rb:30-37 def source`: web -> card.content raw, otherwise
// contextualize_path. `set/type/image.rb:26-28 view :source, unknown: :blank`.
// `set/type/image.rb:74-76 view :inline` and `:18-20 view :one_line_content`.
// ---------------------------------------------------------------------------

function imageSource(ctx: ViewContext): string {
  const raw = (ctx.fmt.card.dbContent ?? "").trim();
  if (storageTypeFromContent(raw) === "web") return raw;
  return contextualizePath(raw);
}

const imageInlineView: ViewFn = (ctx) => ctx.fmt.renderView("core");
const imageOneLineContentView: ViewFn = (ctx) =>
  ctx.fmt.renderView("core", { size: "icon" });

// ---------------------------------------------------------------------------
// image html-format views (set/type/image/html_views.rb).
// ---------------------------------------------------------------------------

/** set/type/image/html_views.rb:5-11 view :core. */
const imageHtmlCoreView: ViewFn = (ctx) => {
  const src = imageSource(ctx);
  if (src === "" || src === "missing") {
    // with_valid_source / invalid_image (html_views.rb:13-23 + 31-34):
    // missing source -> "<!-- invalid image for NAME; source: SOURCE -->"
    return `<!-- invalid image for ${h(ctx.fmt.card.name.s)}; source: ${h(src)} -->`;
  }
  return `<img src="${h(src)}" alt="${h(ctx.fmt.card.name.s)}">`;
};

/** set/type/image/html_views.rb:25-29 view :full_width. */
const imageHtmlFullWidthView: ViewFn = (ctx) => {
  const src = imageSource(ctx);
  if (src === "" || src === "missing") {
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

/** set/type/image/html_views.rb:49-51 view :content_changes. */
const imageHtmlContentChangesView: ViewFn = (ctx) => {
  const oldCore = ctx.fmt.renderView("core");
  const newCore = ctx.fmt.renderView("core");
  if (oldCore === "" && newCore === "") return "";
  if (oldCore === "") return newCore;
  return `${oldCore}${newCore}`;
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
 *  card renders the <img> tag (set/type/image/html_views.rb:5-11); any
 *  other carrierwave card (file, etc.) renders the <a href> anchor
 *  (set/type/file/core.haml:1). */
const polymorphicCoreView: ViewFn = (ctx) => {
  if (ctx.fmt.card.typeCode === "image") return imageHtmlCoreView(ctx);
  return fileCoreView(ctx);
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
    { setPath: "type/file" },

    // set/type/image.rb - the image type's format block. NOT ported:
    // `attachment :image, uploader: CarrierWave::ImageCardUploader`
    // (line 1), `create_versions?` + `svg?` (lines 5-11), and the
    // carrierwave mount plumbing (24 events total across the type/image +
    // abstract/attachment modules). Same shape as type/file: registered
    // for bookkeeping, the polymorphic views dispatch on typeCode.
    { setPath: "type/image" },

    // set/type/image/html_views.rb - the image type's html format block.
    // The :full_width, :preview, :content_changes views are
    // image-specific (no Ruby file analog), so they're registered here
    // (the polymorphic :core above handles image-vs-file dispatch).
    // NOT ported: :content_changes's diff rendering (depends on
    // Card::Content::Diff which is a separate surface - the headless
    // port emits the structural pair of :core bytes, without the inline
    // added/deleted chunk highlighting).
    {
      setPath: "type/image/html",
      formats: {
        html: {
          views: [
            { view: "full_width", viewFn: imageHtmlFullWidthView },
            { view: "preview", viewFn: imageHtmlPreviewView },
            { view: "content_changes", viewFn: imageHtmlContentChangesView },
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

    // The polymorphic dispatch views (see file header). These are
    // registered LAST so they win the ViewRegistrationTable's
    // "later-mod-wins" race (mod-registrar.ts#register:303-309).
    // set/type/image.rb's :source (26-28) carries `unknown: :blank` -
    // the image card's :source on an UNKNOWN card substitutes to the
    // :blank view. set/self/favicon.rb's :source (1-5) is folded in:
    // an image-typed favicon uses imageSource, otherwise fileSource.
    // The :inline + :one_line_content views (set/type/image.rb:74-76 +
    // 18-20) are also folded in: they delegate to :core, which now
    // routes through the polymorphic :core below.
    {
      setPath: "all/zz_carrierwave_polymorphic",
      formats: {
        html: {
          views: [
            {
              view: "source",
              viewFn: polymorphicSourceView,
              config: { unknown: "blank" },
            },
            { view: "core", viewFn: polymorphicCoreView },
            { view: "inline", viewFn: imageInlineView },
            { view: "one_line_content", viewFn: imageOneLineContentView },
          ],
        },
      },
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
  faviconLinkTagView,
  searchJsonImageCompleteView,
  FAVICON_RAW_HELP_TEXT,
};
