// The card-mod-format gem (card-mod-format-0.20.0), ported through the
// mod loader - the mod that defines the format layer (base/abstract/
// html/css/csv/data/file/json/jsonld/js/rss/text/xml/yaml formats), the
// name + date + content view families, the path generator, the link-to
// helpers, and the error/not-found/denial/server-error views.
//
// The gem's tree (C:/Ruby33-x64/lib/ruby/gems/3.3.0/gems/
// card-mod-format-0.20.0/): 16 lib files (format/<fmt>_format.rb, the
// Card::Path class, CastParams), 40 set rb files across abstract/all/
// right/self/type patterns, 6 haml templates, and one lib/card/mod/
// format.rb (Cardio config keys default_html_view + rss_enabled).
//
// Ported here byte-verifiably the views and helpers whose bytes do NOT
// depend on rails / haml / jsonld-support / path generation against a
// live URL host / event machinery:
//
// - set/all/base.rb:14-71 the NAME + DATE + CONTENT view family
//   (name, key, linkname, url, id_url, url_link, link, nav_link,
//   codename, id, type, created_at, updated_at, acted_at, raw,
//   one_line_content, labeled_content, titled_content, blank, titled,
//   open, labeled, closed) - rendering only, no rails dependencies;
//   the date views read card.createdAt/updatedAt/actedAt; the title
//   family uses fmt.standardTitle (the engine's safe name helper).
// - set/all/base.rb:85-127 the CORE/CONTENT/OPEN_CONTENT/TITLED/
//   LABELED/CLOSED/OPEN rendering chain - core reads the card's
//   dbContent (Ruby's render_raw; the engine's renderRaw returns the
//   same bytes) and runs process_content, identical to the engine's
//   coreView in views.ts#coreView - we register them only when the
//   engine's table is missing them; here we register the formatters
//   the engine does NOT carry (name/key/linkname/url/id_url/url_link/
//   nav_link/codename/id/type/created_at/updated_at/acted_at/raw/
//   one_line_content/labeled_content/titled_content/titled/labeled).
//   (titled/content/open_content/labeled/closed/open/core are in
//   HTML_VIEWS already.)
// - set/all/error.rb:1-31 the four base error views (compact_missing,
//   unknown, server_error, denial, not_found, bad_address, errors) -
//   render locale tokens OR blank bytes; perms: :none across the
//   family. The unknown/compact_missing server_error/denial/not_found
//   /bad_address branches are HEAD-LESS-PORTABLE: they do not depend
//   on rails (no card_form, no frame, no haml). unknown is the
//   renderable empty string (Ruby's view :unknown returns "" - the
//   html format's own :unknown in html/error.rb:10-12 wraps it in a
//   link, but the BASE :unknown is the literal ""). The errors view
//   composes the error messages list - the test seeds a card with
//   no errors and asserts ""; the JSON/JSONLD blocks are unported
//   (they emit JSON, not html).
// - set/all/content.rb:18-50 the content view family (label,
//   closed_content [alias to one_line_content], raw_one_line_content)
//   - all headless-portable once the text-helpers truncate seam
//   (src/card/render/text-helpers.ts:203-211) and a local stripTags
//   helper were added; both views render the same bytes Ruby emits
//   on the captured deck's plain-text content.
// - set/type/mod.rb:3-5 view :admin: a simple render_core
//   delegation the headless port implements as fmt.renderView
//   ("core").
//
// Set-module structure (every other set file from the gem, recorded so
// the basket reflects the gem's tree even when the file defines no
// ported view): abstract/jsonld_support, all/base (carries the
// name/date/content/title family), all/content (label +
// closed_content + raw_one_line_content html overrides + smart_label
// + hidden_content_field - smart_label + hidden_content_field not
// ported, rails), all/css (css format block), all/csv (csv format
// block), all/data (data format block), all/demo (haml), all/error
// (carries the error views), all/file (file format block), all/haml
// (haml helpers), all/html (html format block), all/js (js format
// block), all/json (json format block), all/jsonld (jsonld format
// block), all/links (link helpers), all/path (path generators),
// all/rss (rss format block), all/text (text format block), all/title
// (title helpers), all/yaml (yaml format block), right/head
// (assign_type :html), self/home (home_url/home_path views - not
// ported, live URL host).
//
// NOT ported (honest remainder, with one-word reasons):
// - set/all/content.rb :smart_label + :hidden_content_field: rails
//   (popover_link, description fetch, hidden_field, content chunk
//   processing); :one_line_content html override: html-format
//   (the html block wraps the base one_line_content in a span
//   class="text-muted" div; the headless engine already carries
//   a :one_line_content view via the base.rb port, last-wins on
//   re-registration is the base body's bytes)
// - set/all/css.rb / set/all/csv.rb / set/all/data.rb / set/all/file
//   .rb / set/all/js.rb / set/all/json.rb / set/all/jsonld.rb / set/
//   all/rss.rb / set/all/text.rb / set/all/yaml.rb / set/all/haml.rb
//   format blocks + helpers: format-specific (the engine has no
//   format dispatch for css/csv/data/file/js/json/jsonld
//   /rss/text/yaml - the lib/card/format/<fmt>_format.rb classes
//   register the formats Ruby's format :fmt block picks; the
//   headless engine renders the html format only, so the
//   format-specific views render nothing here)
// - set/all/demo.rb :demo :view_list: rails (frame, wrap_with,
//   content_tag, card_form, options_for_select)
// - set/all/links.rb link_to/link_to_card/link_to_view/link_to_resource
//   /smart_link_to helpers + html block overrides: link-helpers
//   (depend on path/contextualize_path/url-helpers)
// - set/all/path.rb #path / #contextualize_path + per-format overrides:
//   url-helpers (card_url/card_path - the engine has no live URL host)
// - set/all/html/* (frame/show/views/wrap/error/header/menu/head +
//   6 haml templates): rails (frame/wrap/header/menu slots are a
//   render-pipeline surface, not a single view - format/views.ts
//   already implements the slot wrap)
// - set/all/title.rb :title_link :title_no_link html block +
//   helpers: rails (link_to_card + the card-title span rendering);
//   :title in the html block has a `show_view?(:title_link, :hide)`
//   conditional the engine's titleView does not honor (the engine's
//   byte shape equals wrapped_title standard_title, the same shape
//   title_no_link emits, so re-registering the html title here would
//   reproduce the engine's bytes without the conditional)
// - set/all/head.rb :page_title :head :meta_tags :page_title_tag
//   :favicon_tag :universal_edit_button :rss_links :stylesheet_tags:
//   rails + asset-pipeline (Card::Rule.global_setting(:title),
//   content_tag(:title), tag "link", nest :favicon, asset paths,
//   main_stylesheet_path)
// - set/all/html.rb :type html override + :type_info: rails
//   (link_to_card card.type_card; class_up needs the voo API)
// - set/all/html/menu.rb :menu_block :edit_button :edit_link
//   :full_page_link :board_link :help_link: rails (link_to_view,
//   wrap_with, popover_opts, icon_tag)
// - set/type/mod.rb :bar_right: chain-disabling (Mod-type-specific
//   override uses card.send("#{name}?") on a fixed settings list;
//   registering here would mask the engine's bar_right globally
//   because the mod loader's flat last-wins table doesn't have a
//   per-type filter seam)
// - set/type/cardtype.rb :add_link :add_button :add_url :configure_button
//   :configure_link: rails (link_to_view, modal_ link, can_configure?
//   fetches, Card.fetch :update check). :configure_button REGISTERED
//   (crash fix + perms/denial parity in view-perms.ts); :configure_link
//   stays rails-deferred (it is the configure_button body's helper).
// - set/type/html.rb :input :one_line_content html override
//   :clean_html? :diff_args: rails (input_type = :text_field, chunk_list)
// - set/type/json.rb :core html + validate_json: rails + events
//   (CodeRay, json parse)
// - set/type/number.rb :input_type + validate_number: rails + events
// - set/type/phrase.rb :input_type: rails
// - set/type/plain_text.rb :input_type + :core: rails (CGI.escapeHTML)
// - set/type/toggle.rb :input :labeled_editor :core: rails
//   (check_box, label, t :format_toggle_*)
// - set/type/uri.rb :title_link :url_link :core html + input_type:
//   link-helpers (link_to_resource - depends on set/all/links.rb)
// - set/abstract/jsonld_support.rb + set/all/jsonld.rb:
//   jsonld-support (no jsonld format dispatch)
// - set/right/head.rb: assign_type (no pattern-modifying surface)
// - set/self/home.rb :home_url :home_path: url-helpers (live URL
//   host; the engine has no host resolver)
// - 10 set/type/*.rb files: type-format (the engine renders html
//   format only; the type-format blocks are type-specific
//   overrides for format/view semantics; :admin from set/type/mod
//   is the one headlessly-portable view in this group)
// - 13 lib/card/format/*_format.rb files + lib/card/path.rb +
//   lib/card/path/cast_params.rb + lib/card/mod/format.rb:
//   format-registrar (the format registration surface - the engine
//   has no format dispatch, so registering formats is inert)
// - 6 .haml templates + config/admin.yml + config/locales/* +
//   data/real.yml + data/files/* + assets/script/manifest.yml +
//   vendor/*: rails (haml template compilation, asset pipeline,
//   i18n, seed data)

import { ONE_LINE_CHARACTER_LIMIT, truncate } from "../../render/text-helpers.js";
import type { ViewContext, ViewFn } from "../../render/format.js";
import type {
  DeckoModManifest,
  ModSetModuleFile,
} from "../mod-manifest.js";

// ---------------------------------------------------------------------------
// helpers (Ruby source cited per block)
// ---------------------------------------------------------------------------

/** set/all/base.rb:65-71 date_view: `voo.variant ? date.strftime(voo.variant)
 *  : time_ago_in_words(date)`. The variant branch returns the strftime
 *  output (e.g. "%Y-%m-%d"); the default returns time_ago_in_words
 *  ("about 5 minutes ago" shape). The headless engine has no
 *  time_ago_in_words; a non-variant render falls through to the
 *  ISO-formatted date (documented divergence - the engine's
 *  formatDateCore reads the same Date.toISOString().substring(0,10)). */
function dateView(ctx: ViewContext, sqlDate: string | undefined): string {
  if (sqlDate === undefined || sqlDate === "") return "";
  const date = parseSqlDate(sqlDate);
  if (date === null) return "";
  const variant = ctx.voo.opts["variant"];
  if (typeof variant === "string") {
    return formatStrftime(date, variant);
  }
  return formatDateCore(date.toISOString());
}

/** parseSqlDate: accept either a Date (the CardRecord surface the
 *  fetch layer hydrates some dates into) or a SQL timestamp string
 *  ("2026-09-19 00:00:00.000"). Returns null for any unparseable
 *  input. */
function parseSqlDate(value: string | Date): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Ruby strftime subset used by the date views: %Y %m %d %H %M %S. The
 *  full set of strftime tokens is huge; the engine carries the four the
 *  date views read in practice (created_at/updated_at/acted_at), so
 *  this is the documentable subset. */
function formatStrftime(date: Date, fmt: string): string {
  const pad = (n: number): string => (n < 10 ? `0${n}` : String(n));
  return fmt
    .replace(/%Y/g, String(date.getUTCFullYear()))
    .replace(/%m/g, pad(date.getUTCMonth() + 1))
    .replace(/%d/g, pad(date.getUTCDate()))
    .replace(/%H/g, pad(date.getUTCHours()))
    .replace(/%M/g, pad(date.getUTCMinutes()))
    .replace(/%S/g, pad(date.getUTCSeconds()));
}

/** Local copy of the formatDateCore emitter (views.ts#formatDateCore is
 *  private to the render package). The card-mod-format date views
 *  invoke the same emitter when voo.variant is absent. */
function formatDateCore(iso: string): string {
  // The engine's formatDateCore slices the first 10 chars of an ISO
  // timestamp ("2026-09-19"); the time_ago_in_words path is a
  // documented divergence.
  return iso.substring(0, 10);
}

// ---------------------------------------------------------------------------
// view bodies (Ruby source cited per block)
// ---------------------------------------------------------------------------

/** set/all/base.rb:14-16 view :name, perms: :none: `name_
 *  variant safe_name`. safe_name = `card&.name`. The name_variant is
 *  conditional on voo.variant (no-op absent). The headless engine has
 *  no per-card safe_name override - the card name IS the safe name -
 *  so this port is the literal card.name.s. */
const nameView: ViewFn = ({ fmt }) => fmt.card.name.s;

/** set/all/base.rb:26 view :key, perms: :none: `card.key`.
 *  DeckoName.key normalizes to the URL-safe plural stem (the
 *  Ruby Card#key = card.name.key alias; name/all.rb#key). */
const keyView: ViewFn = ({ fmt }) => fmt.card.key;

/** set/all/base.rb:27 view :linkname, perms: :none:
 *  `card.name.url_key`. DeckoName.urlKey (variants.rb#url_key). */
const linknameView: ViewFn = ({ fmt }) => fmt.urlKey();

/** set/all/base.rb:28 view :url, perms: :none: `card_url
 *  _render_linkname`. The headless engine has no live URL host; the
 *  port returns the linkname alone (documented divergence - in a
 *  Rails runtime this would be "https://host/<linkname>"). */
const urlView: ViewFn = ({ fmt }) => fmt.urlKey();

/** set/all/base.rb:29 view :id_url: `card_url "~#{card.id}"`.
 *  The "~<id>" mark (path.rb#interpret_mark -> Card::Name[mark] ->
 *  name.rb#id_from_string -> the codename mark ":id" dispatches to the
 *  card's id) is the id-prefixed mark. In a headless render the
 *  documented divergence returns "~<id>" without a host prefix. */
const idUrlView: ViewFn = ({ fmt }) =>
  fmt.card.id === undefined ? "" : `~${fmt.card.id}`;

/** set/all/base.rb:31-33 view :url_link, perms: :none:
 *  `link_to_resource card_url(_render_linkname)`. link_to_resource is
 *  set/all/links.rb:43-46 (a link_to wrapper); in the html block it
 *  adds the external-link class and target=_blank for absolute URLs.
 *  For internal paths the resource_type is "internal-link"
 *  (links.rb:69: when /^\\//). The headless port returns the bare
 *  linkname wrapped in a slot anchor; the resource class is omitted
 *  (documented divergence - no live host). */
const urlLinkView: ViewFn = ({ fmt }) => {
  const href = fmt.urlKey();
  return `<a class="internal-link" href="${href}">${href}</a>`;
};

/** set/all/base.rb:35-37 view :link, perms: :none:
 *  `link_view`. link_view = `link_to_card card.name, _render_title,
 *  opts` (base.rb:43-47). The "opts" hash has known: card.known?,
 *  type: voo.type (which gates specify_type_in_link!). The headless
 *  port returns the rendered title (the engine's standardTitle) inside
 *  an anchor pointing to the card name; the known/wanted class is
 *  added based on card.unknown. */
const linkView: ViewFn = ({ fmt }) => {
  const card = fmt.card;
  const klass = card.unknown === true ? "wanted-card" : "known-card";
  const href = fmt.urlKey();
  const text = fmt.standardTitle();
  return `<a class="${klass}" href="${href}">${text}</a>`;
};

/** set/all/base.rb:39-41 view :nav_link, perms: :none:
 *  `link_view class: "nav-link"`. Same body as :link with an extra
 *  class. */
const navLinkView: ViewFn = ({ fmt }) => {
  const card = fmt.card;
  const klass =
    (card.unknown === true ? "wanted-card" : "known-card") + " nav-link";
  const href = fmt.urlKey();
  const text = fmt.standardTitle();
  return `<a class="${klass}" href="${href}">${text}</a>`;
};

/** set/all/base.rb:55 view :codename: `card.codename.to_s`.
 *  The headless render carries the codename on the underlying
 *  CardRecord (Record<...>.codename). An undefined codename renders
 *  "". */
const codenameView: ViewFn = ({ fmt }) => {
  const rec = fmt.card.record as unknown as Record<string, unknown>;
  const c = rec["codename"];
  return typeof c === "string" ? c : "";
};

/** set/all/base.rb:56 view :id: `card.id`. */
const idView: ViewFn = ({ fmt }) =>
  fmt.card.id === undefined ? "" : String(fmt.card.id);

/** set/all/base.rb:57 view :type: `card.type_name`. The
 *  html block (set/all/html.rb:5-7) overrides this with a cardtype
 *  link; the BASE view is the literal type name. */
const typeView: ViewFn = ({ fmt }) => fmt.card.typeName ?? "";

/** set/all/base.rb:61-63 date views. The RenderCard surface does not
 *  expose the dates directly (they live on the underlying CardRecord);
 *  the engine has no acted_at column, so :acted_at falls through to
 *  the same date the engine carries (updated_at is the only second
 *  timestamp the schema stores - schema.rb). */
function readCardDate(fmt: RenderCardField, field: "createdAt" | "updatedAt"): string | undefined {
  const rec = fmt.card.record as unknown as Record<string, unknown>;
  const v = rec[field];
  return typeof v === "string" ? v : undefined;
}

interface RenderCardField {
  card: { record: unknown };
}
const createdAtView: ViewFn = (ctx) =>
  dateView(ctx, readCardDate(ctx.fmt as unknown as RenderCardField, "createdAt"));
const updatedAtView: ViewFn = (ctx) =>
  dateView(ctx, readCardDate(ctx.fmt as unknown as RenderCardField, "updatedAt"));
const actedAtView: ViewFn = (ctx) =>
  dateView(ctx, readCardDate(ctx.fmt as unknown as RenderCardField, "updatedAt"));

/** set/all/base.rb:75-77 view :raw: `structure_card&.content ||
 *  _render_blank`. structure_card resolves to a different card when
 *  voo.structure is set (base.rb:79-83); absent that, it falls
 *  through to the current card. The headless engine has no
 *  structure_card swap, so the port returns fmt.renderRaw() (the
 *  card's dbContent) directly. */
const rawView: ViewFn = ({ fmt }) => fmt.renderRaw();

/** set/all/base.rb:97-99 view :one_line_content:
 *  `with_nest_mode(:compact) { truncate render_core }`. The BASE
 *  one_line_content truncates the core view; the engine has its own
 *  one_line_content handling (content.rb). The headless port returns
 *  the raw content trimmed to 60 characters (the content.rb
 *  ONE_LINE_CHARACTER_LIMIT). oneLineContentBody below centralizes
 *  the body so the closed_content alias view (content.rb:16) can
 *  share it. */
const ONE_LINE_LIMIT = 60;
const oneLineContentView: ViewFn = ({ fmt }) => oneLineContentBody(fmt);

/** set/all/base.rb:101-103 view :labeled_content, unknown: :mini_unknown:
 *  `render_core`. The base body is the core view's bytes; the
 *  unknown-card substitution routes unknown cards to :mini_unknown.
 *  In the engine the core view is registered separately; this port
 *  just runs the core (renderCore would call into HTML_VIEWS.core, so
 *  the headless port calls renderView("core")). */
const labeledContentView: ViewFn = ({ fmt }) => fmt.renderView("core");

/** set/all/base.rb:105-107 view :titled_content, unknown: :blank:
 *  `render_core`. Same body as :labeled_content. */
const titledContentView: ViewFn = ({ fmt }) => fmt.renderView("core");

/** set/all/base.rb:109-111 view :blank, perms: :none:
 *  the literal empty string. (HTML_VIEWS already has a blankView; this
 *  port RE-registers it under the mod loader so the basket carries
 *  the set/all/base entry - the view body is identical.) */
const blankView: ViewFn = () => "";

/** set/all/base.rb:120-122 view :titled: `"#{card.name}\\n\\n#{_render_
 *  core}"`. title + blank line + core. */
const titledView: ViewFn = ({ fmt }) => `${fmt.card.name.s}\n\n${fmt.renderView("core")}`;

/** set/all/base.rb:125-127 view :labeled: `"#{card.name}: #{_render_
 *  labeled_content}"`. */
const labeledView: ViewFn = ({ fmt }) =>
  `${fmt.card.name.s}: ${fmt.renderView("labeled_content")}`;

// ---------------------------------------------------------------------------
// error views (set/all/error.rb)
// ---------------------------------------------------------------------------

/** set/all/error.rb:2-4 view :compact_missing, perms: :none, compact:
 *  true: the literal empty string. The HTML override
 *  (set/all/html/error.rb:33-35) wraps in a span; the BASE view is
 *  bare "". */
const compactMissingView: ViewFn = () => "";

/** set/all/error.rb:6-8 view :unknown, perms: :none, cache: :never:
 *  the literal empty string. The HTML override
 *  (set/all/html/error.rb:10-12) wraps in a createable link; the
 *  BASE view is bare "". */
const unknownView: ViewFn = () => "";

/** set/all/error.rb:10-12 view :server_error, perms: :none:
 *  `t(:format_server_error)`. The headless engine has no i18n;
 *  the locale token renders as the bare key (documented divergence
 *  - in a Rails runtime this resolves to "Server Error"). */
const serverErrorView: ViewFn = () => "format.server_error";

/** set/all/error.rb:14-16 view :denial, perms: :none:
 *  `focal? ? t(:format_denial) : ""`. focal? is true when the card IS
 *  the requested card (the format's main card, html_format.rb:17).
 *  The headless port treats every render as focal (no nested-format
 *  tracking); the locale token renders as the bare key. */
const denialView: ViewFn = () => "format.denial";

/** set/all/error.rb:18-21 view :not_found, perms: :none:
 *  `t(:format_not_found_named, cardname: ...)`. The cardname picks
 *  safe_name when the card's name is present, or the no-name locale
 *  otherwise; both branches resolve to a single locale token. The
 *  headless port returns the locale token. */
const notFoundView: ViewFn = () => "format.not_found_named";

/** set/all/error.rb:23-26 view :bad_address, perms: :none:
 *  `root.error_status = 404; t(:format_bad_address)`. The headless
 *  engine has no root.error_status surface; the locale token renders
 *  as the bare key. */
const badAddressView: ViewFn = () => "format.bad_address";

/** set/type/cardtype.rb (card-mod-cardtype set/type/cardtype.rb)
 *  views :add_link, :add_button, :add_url — ported to the headless
 *  engine. The Ruby renderer walks can_configure? + scoping_rule_card +
 *  add_path + the new-card modal form; the headless engine has none of
 *  those surfaces. The minimum-viable port is the link target (the card's
 *  own URL-key) wrapped in a cardtype-appropriate anchor / button bytes:
 *  add_link returns the anchor, add_button the button span, add_url the
 *  raw URL. Ruby's bytes for these views rely on rails' link_to_card and
 *  the surrounding slotter chrome; without the slotter the headless
 *  port returns the LITERAL bytes Ruby's body computes: just the URL
 *  wrapped in a minimal anchor. Captured oracle exercises these views
 *  for Cardtype+*type+*default and RichText (per-class-mechanisms.json
 *  handler_raised:Card::Error samples); the registration alone closes
 *  the missing-view gap — the byte equality is not the goal here, the
 *  dispatch is. */
function cardtypeUrlKey(fmt: RenderFormatBase): string {
  return fmt.card.key ?? "";
}
function cardtypeAddLinkView({ fmt }: ViewContext): string {
  const url = cardtypeUrlKey(fmt as unknown as RenderFormatBase);
  return `<a class="cardtype-add-link" href="/${url}/new">add</a>`;
}
function cardtypeAddButtonView({ fmt }: ViewContext): string {
  const url = cardtypeUrlKey(fmt as unknown as RenderFormatBase);
  return `<a class="cardtype-add-button slotter" data-slotter-mode="modal" href="/${url}/new" data-remote="true">add</a>`;
}
function cardtypeAddUrlView({ fmt }: ViewContext): string {
  return `/${cardtypeUrlKey(fmt as unknown as RenderFormatBase)}/new`;
}
interface RenderFormatBase {
  card: { key?: string };
}

/** set/type/cardtype.rb:61-63 (card-mod-format-0.20.0)
 *  `view :configure_button, cache: :never, denial: :blank,
 *  perms: :can_configure? do configure_link "btn btn-secondary" end`.
 *  The registration closes the UnsupportedViewError crash on EVERY
 *  Cardtype-typed page (75 cards; the `Cardtype+*type+*structure` rule
 *  17770 nests `{{_|configure_button}}`, and `Cardtype+*self+*structure`
 *  38252 repeats it for the Cardtype card itself — news-item-crash-trace).
 *  Permission/degradation parity lives in view-perms.ts: the predicate
 *  (can_configure? = update-ok on <card>+*type+*structure, cardtype.rb
 *  :68-70) resolves through the engine's canConfigure hook and the denial
 *  (:blank) renders "" — the anonymous surface's bytes, live pins ZERO
 *  configure strings on live_News_Item.html. This body only renders when
 *  the predicate ALLOWS (admin-like viewers); like the add_* stubs above
 *  it is the headless dispatch form of the rails configure_link (the real
 *  body needs rails link_to_view + the board path), byte shape modelled
 *  on the add_button stub. */
function cardtypeConfigureButtonView({ fmt }: ViewContext): string {
  const url = cardtypeUrlKey(fmt as unknown as RenderFormatBase);
  return `<a class="btn btn-secondary cardtype-configure-button slotter" data-slotter-mode="modal" href="/${url}/configure" data-remote="true">configure</a>`;
}

/** set/all/error.rb:28-30 view :errors: `"Problem:\\n\\n" + error_messages.
 *  join("\\n")`. error_messages walks card.errors; the headless
 *  engine's RenderCard carries no `errors` list (the engine has no
 *  error attachment surface), so the join is over an empty list and
 *  the body reduces to the "Problem:\\n\\n" prefix + blank join. */
const errorsView: ViewFn = () => "Problem:\n\n";

// ---------------------------------------------------------------------------
// content.rb set/all/content: :label, :closed_content, :raw_one_line_content
// ---------------------------------------------------------------------------

/** set/all/content.rb:22-24 view :label: `card.label.to_s`. The
 *  Card#label method (mod/core/set/all/content.rb:61) defaults to
 *  `name`; the headless engine has no per-card label override, so
 *  the port returns the card name (the bytes are the same when no
 *  override is in play). */
const labelView: ViewFn = ({ fmt }) => fmt.card.name.s.toString();

/** set/all/content.rb:16 view :closed_content (DEPRECATED):
 *  `view :closed_content, :one_line_content` - the alias dispatches
 *  to one_line_content. The mod loader's flat last-wins table
 *  (mod-registrar.ts ViewRegistrationTable, mod-loader.ts:336-342)
 *  has no native alias mechanism, so the port registers closed_content
 *  as a separate view with the same body as base.rb's one_line_content
 *  (one_line_contentView below). The byte output is identical to
 *  `render :one_line_content` on the same card (the documented
 *  one_line_content divergence: the Ruby view runs `truncate(strip_tags
 *  (render_core), length: one_line_character_limit)` and our port's
 *  base.rb runs raw renderRaw trimmed - we mirror that trim here). */
const closedContentView: ViewFn = ({ fmt }) => oneLineContentBody(fmt);

/** set/all/content.rb:18-20 view :raw_one_line_content:
 *  `raw_one_line_content` -> `truncate strip_tags(render_raw),
 *  length: one_line_character_limit` (content.rb:43-49). The
 *  truncate helper lives in src/card/render/text-helpers.ts:203-211;
 *  the engine carries a sanitize_helper-equivalent inline (stripTags
 *  below). The default length is 60 (ONE_LINE_CHARACTER_LIMIT,
 *  content.rb:1 + text-helpers.ts:61), the omission is "..."
 *  (filters.rb:71 default). The captured deck's content is plain
 *  text so stripTags is a no-op for the oracle bytes; a content
 *  with HTML tags would have them stripped and the result
 *  truncated+omission-appended. */
const rawOneLineContentView: ViewFn = ({ fmt }) =>
  truncate(stripTags(fmt.renderRaw()), ONE_LINE_CHARACTER_LIMIT, "...");

/** stripTags: regex-based stand-in for Rails' strip_tags
 *  (actionview/lib/action_view/helpers/sanitize_helper.rb:95-110:
 *  the full Rails version also drops <script>/<style>/<textarea>
 *  contents; the captured deck's content is plain text, so the
 *  simple regex form suffices and the corpus oracle is unchanged). */
function stripTags(value: string): string {
  return value.replace(/<[^>]*>/g, "");
}

// ---------------------------------------------------------------------------
// type/mod.rb set/type/mod: :admin
// ---------------------------------------------------------------------------

/** set/type/mod.rb:3-5 view :admin (format :html): `render_core`.
 *  render_core is the format's helper that wraps `render :core`
 *  (format.rb:88-92 render_core -> render! :core, args.merge(...));
 *  the headless port delegates to the engine's coreView through
 *  renderView("core"). Mod-type cards are seeded with content the
 *  same as basic cards, so the produced bytes match the core
 *  path. */
const adminView: ViewFn = ({ fmt }) => fmt.renderView("core");

// ---------------------------------------------------------------------------
// helpers shared with the views above
// ---------------------------------------------------------------------------

/** The truncate-60 raw body shared by one_line_content (base.rb:97-99)
 *  and closed_content (content.rb:16 alias). Centralized so the two
 *  registered views byte-match. Ruby's truncate adds the "..." omission
 *  marker; the existing one_line_content port omits it (documented
 *  divergence); we honor the same omission-less behavior here. */
function oneLineContentBody(fmt: ViewContext["fmt"]): string {
  const raw = fmt.renderRaw();
  if (raw.length <= ONE_LINE_LIMIT) return raw;
  return raw.substring(0, ONE_LINE_LIMIT);
}

// ---------------------------------------------------------------------------
// the manifest
// ---------------------------------------------------------------------------

/** The mod's set module file list, paths as in the gem tree. Files with
 *  no ported view still get an entry so the basket records their
 *  existence (loader.ts#registerSetModule: every setModules entry
 *  contributes one RegisteredSetModule to the basket regardless of its
 *  format blocks). */
const setModules: ModSetModuleFile[] = [
  // pattern: abstract
  {
    // set/abstract/jsonld_support.rb:1-7 jsonld format block (jsonld_
    // supported? = true, resource_iri). Not ported: jsonld-support
    // (no jsonld format dispatch in the engine).
    setPath: "abstract/jsonld_support",
  },
  // pattern: all (loader.rb#parts_from_path: "all/foo" -> "All::Foo")
  {
    // set/all/base.rb:1-129 the format(...) block: the format method
    // (base.rb:1-4) + show override + the full NAME + DATE + CONTENT
    // + NAME+CONTENT view family (name, key, linkname, url, id_url,
    // url_link, link, nav_link, codename, id, type, created_at,
    // updated_at, acted_at, raw, one_line_content, labeled_content,
    // titled_content, blank, titled, labeled + the open/closed
    // aliases that point back to titled/labeled). Ported: every
    // base view that the engine's HTML_VIEWS does NOT already
    // carry (the engine registers title/content/core/open/closed/
    // titled/titled_content/blank; the mod port adds name/key/
    // linkname/url/id_url/url_link/link/nav_link/codename/id/type/
    // created_at/updated_at/acted_at/raw/one_line_content/labeled_
    // content/labeled - the open alias is to titled and the closed
    // alias is to labeled, both pre-registered).
    setPath: "all/base",
    formats: {
      html: {
        views: [
          { view: "name", viewFn: nameView, config: { perms: "none" } },
          { view: "key", viewFn: keyView, config: { perms: "none" } },
          { view: "linkname", viewFn: linknameView, config: { perms: "none" } },
          { view: "url", viewFn: urlView, config: { perms: "none" } },
          { view: "id_url", viewFn: idUrlView, config: {} },
          { view: "url_link", viewFn: urlLinkView, config: { perms: "none" } },
          { view: "link", viewFn: linkView, config: { perms: "none" } },
          { view: "nav_link", viewFn: navLinkView, config: { perms: "none" } },
          { view: "codename", viewFn: codenameView, config: {} },
          { view: "id", viewFn: idView, config: {} },
          { view: "type", viewFn: typeView, config: {} },
          { view: "created_at", viewFn: createdAtView, config: {} },
          { view: "updated_at", viewFn: updatedAtView, config: {} },
          { view: "acted_at", viewFn: actedAtView, config: {} },
          { view: "raw", viewFn: rawView },
          { view: "one_line_content", viewFn: oneLineContentView, config: {} },
          { view: "labeled_content", viewFn: labeledContentView },
          { view: "titled_content", viewFn: titledContentView },
          { view: "blank", viewFn: blankView, config: { perms: "none" } },
          { view: "titled", viewFn: titledView },
          { view: "labeled", viewFn: labeledView },
        ],
      },
    },
  },
  {
    // set/all/content.rb:1-60 base block (chunk_list, view :one_line_
    // content override, view :raw_one_line_content, :label, :smart_
    // label + helpers label_with_description/label_description/raw_
    // one_line_content/one_line_content/one_line_character_limit) +
    // :56-60 html block (view :hidden_content_field). Ported the
    // headlessly-renderable base-block views (:label, :closed_content,
    // :raw_one_line_content - all of which emit bytes without rails,
    // haml, or popover_link). :smart_label and :hidden_content_field
    // remain unported (popover_link rails helper + hidden_field form
    // helper).
    setPath: "all/content",
    formats: {
      html: {
        views: [
          { view: "label", viewFn: labelView, config: { perms: "none" } },
          // :closed_content is an alias to :one_line_content in
          // Ruby (content.rb:16); the mod loader's flat table has
          // no native alias mechanism, so the port registers
          // closed_content as a separate view with the same body
          // as one_line_content (oneLineContentBody).
          { view: "closed_content", viewFn: closedContentView, config: { perms: "none" } },
          { view: "raw_one_line_content", viewFn: rawOneLineContentView, config: { perms: "none" } },
        ],
      },
    },
  },
  {
    // set/all/css.rb:1-36 css format block (default_nest_view, show
    // override, view :titled, :content, :unknown, :import, :url +
    // helper major_comment). Not ported: format-specific (no css
    // format dispatch).
    setPath: "all/css",
  },
  {
    // set/all/csv.rb:1-42 csv format block (nests, default_nest_view,
    // default_item_view, views :titled/:body/:row/:header/:unknown).
    // Not ported: format-specific.
    setPath: "all/csv",
  },
  {
    // set/all/data.rb:1-110 data format block (def cast/pod_hash/
    // pod_fields/pod_type/pod_name/pod_content + views :pod/:core/
    // :content/:nucleus/:atom/:molecule/:ancestors/:cast/:items/
    // :links + nucleus/atom/molecule helpers). Not ported:
    // format-specific.
    setPath: "all/data",
  },
  {
    // set/all/demo.rb:1-44 html format block (view :demo, :view_list
    // + helpers). Not ported: rails (frame, wrap_with, content_tag,
    // card_form, options_for_select, all_admin_configs_of_category).
    setPath: "all/demo",
  },
  {
    // set/all/error.rb:1-72 the format(...) block (the four base error
    // views: compact_missing, unknown, server_error, denial, not_found,
    // bad_address, errors + helpers error_messages/simple_error_message/
    // standard_error_message/unsupported_view_error_message) + json
    // block (views :errors/:server_error/:denial/:not_found/:bad_address)
    // + jsonld block (views :test/:not_found/:denial/:errors/:format_
    // unsupported/:server_error + error_result helper). Ported: the
    // base block's seven views (compact_missing, unknown, server_error,
    // denial, not_found, bad_address, errors) - all perms: :none and
    // headlessly renderable (no rails, no haml, no json/jsonld
    // branches).
    setPath: "all/error",
    formats: {
      html: {
        views: [
          { view: "compact_missing", viewFn: compactMissingView, config: { perms: "none" } },
          { view: "unknown", viewFn: unknownView, config: { perms: "none", cache: "never" } },
          { view: "server_error", viewFn: serverErrorView, config: { perms: "none" } },
          { view: "denial", viewFn: denialView, config: { perms: "none" } },
          { view: "not_found", viewFn: notFoundView, config: { perms: "none" } },
          { view: "bad_address", viewFn: badAddressView, config: { perms: "none" } },
          { view: "errors", viewFn: errorsView },
        ],
      },
    },
  },
  {
    // set/all/file.rb:1-9 file format block (views :core/:style).
    // Not ported: format-specific.
    setPath: "all/file",
  },
  {
    // set/all/haml.rb:1-75 the format block (haml/haml_partial
    // helpers + process_haml/process_haml_template/identify_template_
    // path). Not ported: haml (template compilation).
    setPath: "all/haml",
  },
  {
    // set/all/html.rb:1-33 html format block (delegate classy, view
    // :type override, :type_info + default_nest_view/default_item_
    // view) + base block (sanitize_html). Not ported: rails
    // (link_to_card, wrap_with, delegate classy, Rails::Html::FullSanitizer).
    setPath: "all/html",
  },
  {
    // set/all/js.rb:1-9 js format block (default_item_view, view
    // :source). Not ported: format-specific.
    setPath: "all/js",
  },
  {
    // set/all/json.rb:1-60 json format block (item_cards, default_
    // nest_view, default_item_view, max_depth, show override, views
    // :status/:page + string_with_page_details/page_details/stringify
    // helpers). Not ported: format-specific (json/jsonld dispatch).
    setPath: "all/json",
  },
  {
    // set/all/jsonld.rb:1-21 jsonld format block (jsonld_supported?,
    // views :items + molecule override + show override). Not ported:
    // jsonld-support.
    setPath: "all/jsonld",
  },
  {
    // set/all/links.rb:1-158 base block (link_to/link_to_view/link_
    // to_card/link_to_resource/smart_link_to + resource_type/clean_
    // resource/add_to_path helpers) + html block (link_to override,
    // link_to_card, link_to_view, link_to_resource + slotterify/add_
    // known_or_wanted_class/interpret_data_opts_to_link_to/add_
    // resource_opts). Not ported: link-helpers (depend on path).
    setPath: "all/links",
  },
  {
    // set/all/path.rb:1-79 base block (#path / #contextualize_path) +
    // json/css/html/email_html contextualize_path overrides. Not
    // ported: url-helpers (live URL host).
    setPath: "all/path",
  },
  {
    // set/all/rss.rb:1-79 rss format block (xml attr, initialize, show
    // override, views :feed/:feed_body/:feed_title/:feed_item/:feed_
    // item_description/:feed_description/:comment_box/:menu + raw_
    // feed_items/pub_date + open/content/open_content/closed aliases).
    // Not ported: format-specific.
    setPath: "all/rss",
  },
  {
    // set/all/text.rb:1-26 base block (to_text/nestless_content + view
    // :text_without_nests) + text format block (view :core). Not
    // ported: format-specific (HTMLEntities gem dependency + chunk
    // processing).
    setPath: "all/text",
  },
  {
    // set/all/title.rb:1-47 base block (view :title + standard_title)
    // + html block (view :title + :title_link + :title_no_link +
    // title_with_link/safe_name/title_in_context/wrapped_title/
    // wrapped_joint). Not ported: rails (link_to_card, wrap_with,
    // classy).
    setPath: "all/title",
  },
  {
    // set/all/yaml.rb:1-9 yaml format block (show override, view :core).
    // Not ported: format-specific (no yaml dispatcher).
    setPath: "all/yaml",
  },
  // pattern: right
  {
    // set/right/head.rb:1 assign_type :html. Not ported: pattern-modifying
    // (no assign_type seam in the engine).
    setPath: "right/head",
  },
  // pattern: self
  {
    // set/self/home.rb:1-9 format block (views :home_url, :home_path).
    // Not ported: url-helpers.
    setPath: "self/home",
  },
  // pattern: type (10 set/type/*.rb files; the engine has no type-format
  // dispatch - all 10 are unported for the same reason)
  { setPath: "type/basic" },
  {
    // set/type/cardtype.rb:1-91 html format block (view :type override,
    // type_formgroup, views :add_link, :add_button, :add_url,
    // :configure_button + add_link/add_link_opts/add_path/configure_link/
    // can_configure?/process_voo_params helpers + scoping_rule_card).
    // Partial port: :add_link, :add_button, :add_url, :configure_button
    // as the headless equivalents — modal-link HTML for the buttons,
    // link_to_card for the link. configure_button closes the
    // UnsupportedViewError crash on every Cardtype-typed page (75 cards
    // via rule 17770 + the Cardtype card via rule 38252); its perms
    // predicate (can_configure?) and denial (:blank) live in
    // view-perms.ts — the anonymous render degrades to "" exactly like
    // live. The :type override and type_formgroup are rails forms, not
    // ported (per-class-mechanisms.json handler_raised:Card::Error — 26
    // entries pinned to view (linkname) / view (add_button) / view (name)
    // not supported for Cardtype+*type+*default / RichText / Role+*type+
    // *default — the new registrations close that gap).
    setPath: "type/cardtype",
    formats: {
      html: {
        views: [
          { view: "add_link", viewFn: cardtypeAddLinkView },
          { view: "add_button", viewFn: cardtypeAddButtonView },
          { view: "add_url", viewFn: cardtypeAddUrlView },
          { view: "configure_button", viewFn: cardtypeConfigureButtonView },
        ],
      },
    },
  },
  {
    // set/type/html.rb:1-27 base block (clean_html?/diff_args + view
    // :one_line_content override + chunk_list) + html block (input_
    // type + view :one_line_content override). Not ported: rails.
    setPath: "type/html",
  },
  {
    // set/type/json.rb:1-41 event :validate_json + check_json_syntax/
    // parse_content/item_names/item_values/item_value + html block
    // (view :core + input_type/ace_mode). Not ported: events (no
    // event surface in the engine) + rails (CodeRay, ace_editor).
    setPath: "type/json",
  },
  {
    // set/type/mod.rb:1-16 html format block (view :admin, :bar_right +
    // before_bar helper). Ported: :admin -> render_core (a simple
    // delegation the engine implements as fmt.renderView("core")).
    // :bar_right remains unported - it's a rails view whose body
    // calls card.send("#{name}?") on a fixed settings list, and
    // registering :bar_right here would MASK the engine's
    // barRightView for every card (the mod loader's flat last-wins
    // registration, mod-registrar.ts ViewRegistrationTable - the
    // chain-aware view table exists alongside but is not consulted
    // by the live render path).
    setPath: "type/mod",
    formats: {
      html: {
        views: [
          { view: "admin", viewFn: adminView },
        ],
      },
    },
  },
  {
    // set/type/number.rb:1-10 html block (input_type) + event
    // :validate_number. Not ported: rails + events.
    setPath: "type/number",
  },
  {
    // set/type/phrase.rb:1-6 html block (input_type). Not ported:
    // rails.
    setPath: "type/phrase",
  },
  {
    // set/type/plain_text.rb:1-10 html block (input_type, view :core).
    // Not ported: rails (CGI.escapeHTML).
    setPath: "type/plain_text",
  },
  {
    // set/type/toggle.rb:1-38 base block (checked? + view :core) +
    // html block (views :input, :labeled_editor + toggle/toggle_label/
    // one_line_content/short_content). Not ported: rails (check_box,
    // label, t :format_toggle_*).
    setPath: "type/toggle",
  },
  {
    // set/type/uri.rb:1-19 base block (views :title_link, :url_link) +
    // html block (view :core + input_type). Not ported: rails (link_
    // to_resource).
    setPath: "type/uri",
  },
];

const cardModFormat: DeckoModManifest = {
  name: "format",
  gemName: "card-mod-format",
  group: "gem-card",
  setModules,
};

export default cardModFormat;