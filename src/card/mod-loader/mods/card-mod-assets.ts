// The card-mod-assets gem (card-mod-assets-0.20.0), ported through the mod
// loader.
//
// The gem's tree (C:/Ruby33-x64/lib/ruby/gems/3.3.0/gems/
// card-mod-assets-0.20.0/): twelve set files (8 abstract, 3 right, 1 type),
// one lib/ module (Card::Assets - boot-time asset pipeline driver), one
// HAML template, one manifest.yml transform, and a config/locales tree.
// The T6 verdict (tools/compat-report/mod-compat-report.json, gem ===
// 'card-mod-assets-0.20.0', metrics.htmlViewsMissingNames) lists the two
// html views the engine does not already cover: :javascript_include_tag
// and :stylesheet_include_tag - both are gem-specific (the engine's
// HTML_VIEWS surface has neither), both live in `set/right/group_remote.rb`
// (the only set file with portable html views), and both iterate over the
// group_remote card's URL list (`urls`) emitting one Rails asset-tag helper
// output per URL.
//
// Ported here byte-for-byte from set/right/group_remote.rb:40-54 - one set
// module, two view registrations.
//
// NOT ported (honest remainder):
// - set/abstract/asset_file.rb:54-59 view :javascript_include_tag - this
//   override iterates over `card.existing_source_paths` (filesystem walks
//   of deck mod asset directories) and calls Rails' `javascript_include_tag`
//   helper on each path. Both the source-path resolution (Card::Mod::Dirs)
//   and the Rails helper sit outside the headless engine; the override is
//   only meaningful when the asset_file set module is included on a real
//   card (CSS / SCSS / JS / CoffeeScript), which the engine has no cardtype
//   for, so registering the view would claim a fidelity no oracle here
//   pins.
// - set/abstract/01_manifest_group.rb:4-7 view :core and
//   set/abstract/mod_assets.rb:171-182 view :core - both override the
//   engine's :core with `list_group card.item_names` /
//   `haml :group_list, groups: groups`; the List-group / HAML renderer
//   surfaces are not in the TS engine's :core path, and the engine's :core
//   (src/card/render/views.ts:163 coreView) already serves the structural
//   bytes these cards need at runtime.
// - set/right/asset_output.rb:24-29 view :not_found - redirects to
//   `outputter.update_asset_output_live` which writes a file via Tempfile
//   + Card::Auth.as_bot (lib/card/asset_outputter.rb:36-59 handle_file +
//   store_output). Live filesystem writes via the asset_outputter's lock
//   acquire / Tempfile.unlink cycle - not portable headlessly.
// - The abstract / type set files (card_accessor / event / include_set
//   / virtual? / history? / chunk_list declarations and the
//   assemble_asset_input_content -> left.format(input_format).render
//   indirection) - the engine has no cardtype for asset inputters /
//   outputters, so registering them would register no rule walk, view,
//   or hook that any TS surface exercises.
// - data/real.yml, data/transform/, config/locales/, lib/card/assets.rb
//   (Card::Assets.refresh / make_output_coded / generate_asset_output_files),
//   lib/tasks/card/assets.rake, the README. The boot-time asset pipeline is
//   Rails-only and was never a render-path surface; the locales' keys move
//   with the views they target.

import type { ViewContext, ViewFn } from "../../render/format.js";
import type {
  DeckoModManifest,
} from "../mod-manifest.js";

// ---------------------------------------------------------------------------
// set/right/group_remote.rb - the card-level methods, then the format :html
// block
// ---------------------------------------------------------------------------

/** group_remote.rb:25-27 urls: `item_configs.map { |path| path["src"] }`.
 *  The Ruby mod's URL source is the manifest's `remote` group
 *  (`item_configs = left.manifest_group_items("remote")`,
 *  group_remote.rb:20-23), and the canonical `content` is exactly this URL
 *  list joined by newlines (group_remote.rb:29-31). The card's stored
 *  content is therefore the URL list one-per-line; the headless port reads
 *  it back as the view's URL source (the body that produced db_content in
 *  Ruby is the same body that consumes it here, byte-for-byte). Empty
 *  lines are filtered so a trailing newline on the card is harmless. */
function urlsFor(ctx: ViewContext): string[] {
  const raw = ctx.fmt.card.dbContent ?? "";
  if (raw === "") return [];
  return raw.split("\n").filter((line) => line !== "");
}

/** group_remote.rb:38 `delegate :urls, to: :card` - the format exposes the
 *  card-level `urls` as `format.urls`. The TS port has no format-class
 *  delegation surface, so the helper above reads `card.dbContent` directly
 *  (the same field Ruby's `delegate :urls, to: :card` reads through).
 *  Kept as a named seam so the port's URL source is one line - the
 *  failure-mode for "card has no urls" is centralized here. */

/** group_remote.rb:44-48 view :javascript_include_tag, cache: :never:
 *  `urls.map { |path| javascript_include_tag path }.join("\n")`. Rails'
 *  javascript_include_tag helper, given a remote URL (no asset-pipeline
 *  digest lookup), emits `<script src="<url>"></script>` (Rails'
 *  asset_tag_helper.rb#javascript_include_tag falls through to
 *  javascript_src_tag, which renders that exact byte shape for a plain URL
 *  with no extension-based source lookup). One tag per URL, joined by a
 *  single newline. The `cache: :never` config (view_opts.rb's VIEW_SETTINGS
 *  list) carries through to ModViewConfigTable; the runtime cache layer
 *  consults it via the coordinator's render-pipeline integration. */
const javascriptIncludeTagView: ViewFn = (ctx) => {
  const urls = urlsFor(ctx);
  return urls.map((path) => `<script src="${path}"></script>`).join("\n");
};

/** group_remote.rb:50-54 view :stylesheet_include_tag:
 *  `urls.map { |path| tag "link", href: path, media: "all", rel:
 *  "stylesheet", type: "text/css" }.join("\n")`. Rails' `tag` helper
 *  emits an HTML element with each named key=value attribute; the four
 *  keys here produce the exact bytes
 *  `<link href="<url>" media="all" rel="stylesheet" type="text/css" />`
 *  - Rails orders attributes per the option Hash's insertion order (the
 *  arg order in the view: href, media, rel, type - that is the byte
 *  order). One tag per URL, joined by a single newline. */
const stylesheetIncludeTagView: ViewFn = (ctx) => {
  const urls = urlsFor(ctx);
  return urls
    .map((path) => `<link href="${path}" media="all" rel="stylesheet" type="text/css" />`)
    .join("\n");
};

// ---------------------------------------------------------------------------
// the manifest (one setModules entry per gem file; format :html block holds
// the two mod-specific views)
// ---------------------------------------------------------------------------

const cardModAssets: DeckoModManifest = {
  name: "assets",
  gemName: "card-mod-assets",
  group: "gem-defaults",
  setModules: [
    {
      // card-mod-assets-0.20.0/set/right/group_remote.rb (the only set file
      // in this gem with portable html views)
      setPath: "right/group_remote",
      formats: {
        html: {
          views: [
            // group_remote.rb:44-48
            {
              view: "javascript_include_tag",
              viewFn: javascriptIncludeTagView,
              config: { cache: "never" },
            },
            // group_remote.rb:50-54
            {
              view: "stylesheet_include_tag",
              viewFn: stylesheetIncludeTagView,
            },
          ],
        },
      },
    },
  ],
};

export default cardModAssets;
