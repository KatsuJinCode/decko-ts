// The head read-set and the byte builders for card-mod-format's head
// views — ONE implementation, two callers.
//
// WHY THIS FILE EXISTS
// Five views in card-mod-format set/all/head.rb need an ENGINE READ
// (`Card::Rule.global_setting(:title)`, `nest :favicon`,
// `main_stylesheet_path` -> `asset_output_url`), but `ViewFn` is
// synchronous (src/card/render/format.ts:291). The bytes those reads
// produce already existed and were byte-exercised on every served
// page inside src/card/render/page.ts (headContent -> pageTitleTag /
// META_TAGS / faviconTag / stylesheetTags). Writing the same bodies a
// third time, shaped as ViewFn, would have produced exactly the drift
// this extraction exists to stop.
//
// So: the byte construction lives HERE, as pure synchronous functions
// over a plain read set. Two callers supply the read set from two
// different places and get byte-identical output by construction:
//   - src/card/render/page.ts — the page path, which awaits each card
//     through the fetcher and then calls these builders;
//   - src/card/mod-loader/mods/card-mod-format.ts — the mod's ViewFn
//     views, which read the SAME cards synchronously out of the
//     render-card map that the prepare-phase prefetch
//     (RenderEngine#preloadHeadViewReads, src/card/render.ts) warmed.
//
// The seam that makes the sync read possible is a prepare-phase
// prefetch, not an async view class: an async view class would make
// renderView's return type a Promise for the whole ~200-view registry.
//
// TRUTH SOURCES
// - card-mod-format-0.20.0/set/all/head.rb:1-13 (basket[:head_views] and
//   basket[:cache_seed_names]), :19-23 (:page_title), :29-31 (:head),
//   :33-35 (:page_title_tag), :37-39 (:favicon_tag), :61-63
//   (:stylesheet_tags), :65-70 (main_stylesheet_tag/Path).
// - card-1.110.0/lib/card/rule/all.rb:5-9 (Card::Rule.global_setting —
//   `Card[name]` on the codename mark, the setting card's own
//   db_content, NOT a rule walk).
// - card-mod-assets-0.20.0 asset_outputter.rb (asset_output_url).
// - card-mod-style-0.20.0/set/self/style_mods.rb:8-13
//   (:remote_style_tags — the mod-manifest walk; see REMOTE_STYLE_TAG).

import { h } from "./slot-html.js";
import { attachmentUrl } from "./views.js";
import { mainStylesheetRevisionDigits } from "./deployment-follow-live-config.js";
import type { SQLStatement } from "../../server/driver.js";

/** The carrierwave cloud attachment URL prefix the deployment's fog
 *  storage config produces: endpoint + empty bucket + files_web_path
 *  ("files") + id/action (set/abstract/attachment/cloud.rb +
 *  file_card_uploader.rb:88-117). The paren prefix inside a SOURCE
 *  string is a credential and is never emitted. */
export const CLOUD_URL_PREFIX = "http://s3.amazonaws.com//files/";

/**
 * The three cards the head views read. Every field is a plain string so
 * the same object can be produced by an async fetcher (the page path)
 * and by a sync prepared-map read (the mod views) with no shape
 * negotiation between them.
 */
export interface HeadReadSet {
  /** The *title setting card's db_content — `Card::Rule.global_setting
   *  (:title)`. undefined when the setting card does not exist. */
  titleSetting: string | undefined;
  /** The *favicon card's db_content — the attachment SOURCE string
   *  ("(bucket)/path/file.ext"), not a URL. */
  faviconSource: string | undefined;
  /** The *all+*style+*asset output card's db_content — the compiled
   *  stylesheet's attachment SOURCE string (asset_output_url). */
  styleAssetOutput: string | undefined;
}

/** The cards the prepare prefetch must warm, as `key` COLUMN values —
 *  the normalized (underscored) form the `cards.key` index carries,
 *  which is what a `WHERE key IN (...)` batch has to match. Measured
 *  over every junction-named record
 *  (5,061 of 5,061): each carries a key, and a three-part junction's key is
 *  the underscored full name
 *  (`*all+*style+*asset output` -> `*all+*style+*asset_output`).
 *
 *  The names are listed in dependency order: the *title and *favicon
 *  setting cards first (the `Card[:codename]` reads global_setting and
 *  nest :favicon make), then each `*all+*<setting>+*asset output` chain
 *  asset_output_url walks. The `:codename` marks and the display names
 *  address exactly the same cards — `Card[:title]` IS `*title`
 *  (rule/all.rb:5-9) — so the read side can stay on absolute names and
 *  carry no dependency on the codename codehash being folded.
 */
export const HEAD_READ_SET_KEYS = [
  "*title",
  "*favicon",
  "*all+*style",
  "*all+*style+*asset_output",
  // The page path's javascript_tags and script_variables read the same
  // two-step asset-output chain for *script (page.ts#assetOutputUrl
  // serves both settings). They ride this batch for free (one IN-list)
  // and belong to the same "head read-set"; card-mod-script's
  // :javascript_tags is not ported on this branch, so nothing reads
  // them yet.
  "*all+*script",
  "*all+*script+*asset_output",
  // The *recent settings card:
  // setting_categories.rb:64-67 reads `Card[:recent_settings]` — the same
  // deck-level codename fetch shape as `Card[:title]` (the card carries
  // codename recent_settings) — and the rule-item bar's `_category-recent`
  // arm (format.ts#recentSettingCodenames) reads it through the cache-only
  // fetchRenderCard. No reference closure can reach it, so it rides this
  // batch for free. THREE key spellings ride the IN-list, one per deck
  // shape (the absent forms are simply no-ops). Key derivation in Ruby
  // singularizes PER WORD with a stability guard (cardname 0.20.0
  // lib/cardname.rb:34,106-116 + lib/cardname/variants.rb:56-62:
  // singularize twice, keep the original word unless idempotent), so the
  // gem computes key "*recent_setting" from BOTH "*recent settings" and
  // "*recent_settings" — the CANONICAL shape. One spelling per deck shape:
  // a dump written with the key COLUMN holding the verbatim display form
  // ("*recent settings" — every populated key value there equals the name
  // verbatim, the rest are NULL, so that form is a dump artifact, not
  // cardname-canonical); decks seeded through
  // DeckoName.parse carry the canonical "*recent_setting" —
  // gem-run-verified identical to Ruby's own derivation; and the
  // underscored-but-unsingularized "*recent_settings" is the defensive
  // third shape, reachable only from a deck whose inflections declare
  // "settings" uncountable (ActiveSupport uncountable("settings") flips
  // the gem run to it) or that stores underscored raw keys.
  // (gem-run + SQL-probe verified.)
  // cacheHeadViewReads seats the row under record.name.key (the SAME
  // parse), so the fetch-side lookups hit whichever shape the deck
  // carried.
  "*recent settings",
  "*recent_settings",
  "*recent_setting",
] as const;

/** The head read-set as ONE statement, for the engine's cold-path
 *  batch vehicle (RenderEngine#render's additionalStatements). Folding
 *  it there costs zero extra round trips; issuing it separately added
 *  one to every cold render, which the query-count gates in
 *  tests/card/render (junction-depth-closure, render-engine,
 *  depth-sweep) pin. Measured: the standalone form made exactly those
 *  three gates fail at expected 4-to-be-4 / 3-to-be-3.
 *
 *  Matches the `key` column, so a junction row is found by its
 *  normalized key. trash = 0 excludes deleted cards, matching every
 *  other card read in the engine. */
export function headViewReadStatement(): SQLStatement {
  const placeholders = HEAD_READ_SET_KEYS.map(() => "?").join(",");
  return {
    sql: `SELECT * FROM cards WHERE key IN (${placeholders}) AND trash = 0`,
    params: [...HEAD_READ_SET_KEYS],
  };
}

/** view :page_title (head.rb:19-23, the base format block):
 *  `title_parts = [Card::Rule.global_setting(:title)]`;
 *  `title_parts.unshift safe_name if card.name.present?`;
 *  `title_parts.join " - "`. The join — NOT a tag. safeName is the
 *  rendering card's own name (context.rb safe_name). */
export function pageTitleBytes(read: HeadReadSet, safeName: string): string {
  const parts: string[] = [];
  if (safeName !== "") parts.push(safeName);
  if (read.titleSetting !== undefined && read.titleSetting.trim() !== "") {
    parts.push(read.titleSetting);
  }
  return parts.join(" - ");
}

/** view :page_title_tag (head.rb:33-35):
 *  `content_tag(:title) { render :page_title }` — Rails' content_tag
 *  with no attributes is `<title>...</title>`, and the inner body is
 *  the ESCAPED :page_title. */
export function pageTitleTagBytes(read: HeadReadSet, safeName: string): string {
  return `<title>${h(pageTitleBytes(read, safeName))}</title>`;
}

/** view :favicon_tag (head.rb:37-39): `nest :favicon, view: :link_tag`
 *  — the favicon card's attachment URL at the :small carrierwave
 *  variant. No source (no card, or a source that is not an attachment
 *  path) renders the empty string, which is what a deck
 *  with no favicon carries. */
export function faviconTagBytes(read: HeadReadSet): string {
  const src = cloudAttachmentUrl(read.faviconSource, "small");
  if (src === undefined) return "";
  return `<link rel="shortcut icon" href="${src}" />`;
}

/** view :stylesheet_tags (head.rb:61-63):
 *  `[nest(:style_mods, view: :remote_style_tags), main_stylesheet_tag]`,
 *  flattened by :head's join. The first element is the mod-manifest
 *  walk (:remote_style_tags, card-mod-style set/self/style_mods.rb:8-13)
 *  whose bytes for THIS deck's pinned gems are the constant below —
 *  the same constant src/card/render/page.ts carried before the
 *  extraction, moved here rather than copied. The second is
 *  main_stylesheet_tag (head.rb:65-70), whose href resolves
 *  `*all+*style+*asset output` through asset_output_url. */
export function stylesheetTagsBytes(read: HeadReadSet): string {
  return [
    REMOTE_STYLE_TAG,
    `<link media="all" rel="stylesheet" type="text/css" href="${
      applyDeploymentCssRevision(cloudAttachmentUrl(read.styleAssetOutput) ?? "")
    }" />`,
  ].join("\n");
}

/** The deployment's compiled-CSS revision digits
 *  (deployment-follow-live-config.ts mainStylesheetRevisionDigits): the
 *  A deployment that recompiled the deck stylesheet serves the new
 *  attachment revision (/files/45514/0000000001.css) where an
 *  unconfigured host serves its own digits
 *  (9999999999). Rewrites ONLY the 10-digit revision component of a
 *  main-stylesheet attachment URL; UNSET = identity. Exported for the
 *  deployment-config pin test. */
export function applyDeploymentCssRevision(url: string): string {
  const digits = mainStylesheetRevisionDigits();
  if (digits === undefined) return url;
  return url.replace(/(\/\d+\/)(\d{10})(\.css)$/, `$1${digits}$3`);
}

/** The mod-manifest CDN stylesheet for this deck's pinned gems: the
 *  Material Icons font stylesheet the mod-manifest's "remote" group
 *  emits for card-mod-style. Constant for every deck, the
 *  same shape REMOTE_SCRIPT_TAGS carries for the script side. */
export const REMOTE_STYLE_TAG =
  `<link href="https://fonts.googleapis.com/css2?family=Material+Icons" media="all" rel="stylesheet" type="text/css" />`;

/** The :meta_tags template's bytes (head.rb:32 declares
 *  `view :meta_tags, template: :haml`; the template's output is this
 *  two-line constant). Exported because the page path's META_TAGS and
 *  any eventual :meta_tags port must be the same bytes. */
export const META_TAGS =
  `<meta charset='UTF-8'>\n<meta content='width=device-width, initial-scale=1.0' name='viewport'>`;

/**
 * basket[:head_views] as declared by card-mod-format set/all/head.rb:1-4,
 * in Ruby's order, extended with the three names card-mod-script's
 * set/all/head_javascript.rb:7 appends (`basket[:head_views] +=
 * %w[javascript_tags script_variables script_calls]`). :head renders
 * this list in order and joins with "\n" (head.rb:29-31); a member that
 * renders blank contributes an empty line, which is what
 * served pages carry for :universal_edit_button and :rss_links.
 */
export const HEAD_VIEWS: readonly string[] = [
  "page_title_tag",
  "meta_tags",
  "favicon_tag",
  "stylesheet_tags",
  "universal_edit_button",
  "rss_links",
  "javascript_tags",
  "script_variables",
  "script_calls",
];

/** (bucket)/<id>/<file>.<ext> -> the absolute fog cloud URL; the :size
 *  variant suffix rides the file name when requested (favicon :small).
 *  Returns undefined when the source is absent or is not an attachment
 *  path — the "no card" branch every caller renders as "".
 *  The served filename is Ruby's RENDER-TIME DERIVATION, not the stored
 *  key: the uploader rebuilds `filename = "#{action_id}#{extension}"`
 *  (card-mod-carrierwave-0.20.0 lib/carrier_wave/file_card_uploader.rb:
 *  147-153, action_id from set/type/file.rb:11-15's [-2] [/.] split) and
 *  deliberately ignores the stored identifier on retrieval
 *  (lib/carrier_wave/file_card_uploader/path.rb:28-32), with `extension`
 *  ending `.downcase` (file_card_uploader.rb:155-162) — so a stored
 *  "(my_bucket)/12/34.JPG" serves ".../0000000004-small.jpg", and a stored
 *  "(my_bucket)/14547/61887.abr.1.doc" serves "/14547/1.doc".
 *  The stored source keeps its upload case; only the SERVED URL normalizes
 *  (views.ts cloudImageUrl is
 *  the image-side twin of this derivation). The derivation lives in
 *  views.ts#derivedCloudAttachmentSource (shared with the :source/:core
 *  file arms), whose default host FOG_CLOUD_URL_HOST + "/files/" IS this
 *  path's prefix; CLOUD_URL_PREFIX stays exported as the
 *  same shape's constant for readers. */
export function cloudAttachmentUrl(
  content: string | null | undefined,
  size?: string,
): string | undefined {
  if (content === undefined || content === null) return undefined;
  // Local (~<id>/...) and coded (:<codename>/...) identifiers resolve through
  // Ruby's local_url (views.ts attachmentUrl); an svg carries no versions
  // (image.rb:39-48 selected_version).
  const variant = size !== undefined && /\.svg\s*$/i.test(content) ? undefined : size;
  const source = attachmentUrl(content, variant);
  if (source === "") return undefined;
  return source;
}
