// The card-mod-format gem (card-mod-format-0.20.0), ported through the
// mod loader - the mod that defines the format layer (base/abstract/
// html/css/csv/data/file/json/jsonld/js/rss/text/xml/yaml formats), the
// name + date + content view families, the path generator, the link-to
// helpers, and the error/not-found/denial/server-error views.
//
// The gem's tree (card-mod-format-0.20.0): 16 lib files (format/<fmt>_format.rb, the
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
// - set/all/html/views.rb:29-32 the :one_line_content html wrap arm
//   (allHtmlViewsOneLineContentView
//   below): view :one_line_content, unknown: :mini_unknown, wrap:
//   { div: { class: "text-muted" } } around the content.rb:47-49 helper
//   (truncate strip_tags(render_core), voo.size || 60, "..."). Registered
//   on the all/html/views set module; the shadowed All::Base body
//   (base.rb:97-99) is withheld per the MRO record at
//   oneLineContentBody. ORACLE-PINNED: the captured "Oracle One Line
//   Plain Probe" arm of fixtures/captured/layout-one-line.json (the
//   layout fixture review gem-proved those bytes derive
//   exactly from this arm); the standing pin lives in
//   card-mod-format.test.ts.
// - set/type/mod.rb:3-5 view :admin: a simple render_core
//   delegation the headless port implements as fmt.renderView
//   ("core").
//
// Set-module structure (every other set file from the gem, recorded so
// the basket reflects the gem's tree even when the file defines no
// ported view): abstract/jsonld_support, all/base (carries the
// name/date/content/title family), all/content (label +
// closed_content + raw_one_line_content html overrides + smart_label
// + hidden_content_field - both ported (smart_label the follow read path,
// popoverLink anchor; hidden_content_field from a resolved
// live-captured oracle), all/css (css format block), all/csv (csv format
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
// - set/all/html/views.rb :raw_one_line_content html override (:24-27,
//   the text-muted wrap arm around the bare raw_one_line_content
//   helper): PORTED (allHtmlViewsRawOneLineContentView below - the
//   MRO-shadowed
//   All::Content base view registration is withheld per the same
//   later-module-wins record the :one_line_content arm carries at
//   the withheld All::Base :one_line_content record).
//   :smart_label IS PORTED now: the popover anchor rides
//   card-mod-bootstrap's popoverLink export + the render.ts prepare gate
//   warms the +description card.
// - set/all/css.rb / set/all/csv.rb / set/all/data.rb / set/all/file
//   .rb / set/all/js.rb / set/all/json.rb / set/all/jsonld.rb / set/
//   all/rss.rb / set/all/text.rb / set/all/yaml.rb / set/all/haml.rb
//   format blocks + helpers: format-specific (the engine has no
//   format dispatch for css/csv/data/file/js/json/jsonld
//   /rss/text/yaml - the lib/card/format/<fmt>_format.rb classes
//   register the formats Ruby's format :fmt block picks; the
//   headless engine renders the html format only, so the
//   format-specific views render nothing here)
// - set/all/demo.rb :demo: rails (card_form + select_tag +
//   options_for_select + all_admin_configs_of_category; :view_list IS
//   PORTED - the seven demo views compose through the engine's dispatch;
//   :demo IS PORTED now (the mod-porting the first porting wave 2026-10-03 - the
//   frame composition + view_select through cardFormShell +
//   allAdminConfigCodenamesOfCategory; gem-source-derived
//   rendered-unpinned, the harness oracle replays the composition)
// - set/all/links.rb link_to/link_to_card/link_to_view/link_to_resource
//   /smart_link_to helpers + html block overrides: link-helpers
//   (depend on path/contextualize_path/url-helpers)
// - set/all/path.rb #path / #contextualize_path + per-format overrides:
//   url-helpers (card_url/card_path - the engine has no live URL host)
// - set/all/html/* (frame/show/views/wrap/error/header/menu/head +
//   6 haml templates): the SLOT-BODY views and link views that needed
//   the wrap pipeline live in render/views.ts (:header :header_title
//   :type_info :universal_edit_button :rss_links :meta_tags :menu_block
//   :edit_link :edit_button :full_page_link :board_link :help_link
//   :content_panel :content_with_title :conflict :text_without_nests
//   :home_url); this manifest registers the self-contained ones
//   (:flash via all/html/frame, :short_content via all/html/views,
//   :view_list via all/demo). STILL UNPORTED from this group:
//   set/all/html/wrap.rb (the wrap pipeline is the slot machinery),
//   set/all/html/show.rb (page-view rails), set/all/html/error.rb's
//   :not_found frame). :server_error and :debug_server_error are
//   registered on all/html/error; the debug view deliberately renders
//   :server_error (render/debug-server-error.ts).
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
// - set/all/html/menu.rb :menu :menu_edit_link/menu_board_link internals:
//   PORTED views-side (render/views.ts registers :menu_block :edit_button
//   :edit_link :full_page_link :board_link :help_link off the SAME anchor
//   builders the :menu body renders; the anchors were byte-pinned by the
//   corpus menu captures before the split)
// - set/type/mod.rb :bar_right: mod-runtime (the Mod-type body reads
//   card.settings/configurations/cardtypes/tasks - admin_config comes
//   from each mod gem's config/admin.yml and basket[:tasks] - a runtime
//   the headless engine has no surface for; a per-deck hardcode would
//   be fake fidelity, and the type/mod chain registration is free the
//   day the admin-config surface lands - the view-set-scope split
//   removed the old flat-masking hazard)
// - set/type/cardtype.rb :add_link :add_button :add_url :configure_button
//   :configure_link: modal-link/crash-fix STUBS for the first four (the
//   live rails bytes need link_to_view + the board path machinery);
//   :configure_link REGISTERED (cardtypeConfigureLinkView - the rules-board
//   link with the can_configure? predicate in view-perms.ts).
// - set/type/html.rb :input :one_line_content html override
//   :clean_html? :diff_args: rails (input_type = :text_field, chunk_list)
// - set/type/json.rb :core html + validate_json: rails + events
//   (CodeRay, json parse)
// - set/type/number.rb :input_type + validate_number: rails + events
// - set/type/phrase.rb :input_type: rails
// - set/type/plain_text.rb :input_type + :core: rails (CGI.escapeHTML)
// - set/type/toggle.rb :input :labeled_editor :core: RUBY RAISES AS
//   WRITTEN for the first two - toggle.rb:24 `check_box :content` forwards
//   through MethodDelegation to actionview's FormHelper#check_box
//   (form_helper.rb:1345, 2+ required args) and raises ArgumentError on
//   every render (live probe, actionview-7.2.3.2: "wrong number of
//   arguments (given 1, expected 2..5)"); labeled_editor (:19-21 =
//   toggle + toggle_label) inherits the raise. No bytes exist to port;
//   the same defect class the set-only-suggestion disclosure
//   documents. :core stays unported (t :format_toggle_* locales).
// - set/type/uri.rb :title_link :url_link :core html + input_type:
//   link-helpers (link_to_resource - depends on set/all/links.rb)
// - set/abstract/jsonld_support.rb + set/all/jsonld.rb:
//   jsonld-support (no jsonld format dispatch)
// - set/right/head.rb: assign_type (no pattern-modifying surface)
// - set/self/home.rb :home_path: url-helpers (live URL
//   host; the engine has no host resolver). :home_url IS PORTED
//   views-side (render/views.ts - the home_path gate, "/" for the
//   documented no-host divergence).
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
import { modBarRightSections } from "./core-admin-runtime.js";
import { debugServerErrorView, serverErrorHtmlView } from "../../render/debug-server-error.js";
import {
  faviconTagBytes,
  HEAD_VIEWS,
  pageTitleBytes,
  pageTitleTagBytes,
  stylesheetTagsBytes,
  type HeadReadSet,
} from "../../render/head-views.js";
import { RenderFormat, wrappedTitleInner } from "../../render/format.js";
import type { ViewContext, ViewFn } from "../../render/format.js";
import { UnsupportedViewError } from "../../render/format.js";
// an earlier pass merge 5 resolution (read-both-sides, union): both sides each
// added a DIFFERENT import on the same line-region. cardtype-tpl (HEAD)
// added `h` for its add_button producers; roleviews added `DECK_ORIGIN`
// for its ten mod view registrations. Both symbols are used in this file
// and neither subsumes the other, so both imports are kept rather than
// resolving to one side. `h` here is the slot-html escape helper
// (merge 4), not the Haml attribute pass.
// 2026-10-01: the `DECK_ORIGIN` import is GONE from
// this file — roleviews' three `card_url` views (:url, :id_url, :url_link)
// now read the per-render `Card::Env.origin` through the engine's surface
// seam (`fmt.cardUrl`; see render/deck-origin.ts and the urlView docblock),
// so no literal origin remains here. `h` grew a second consumer: the
// :url_link anchor escapes its href the way Rails' content_tag does
// (links.rb:101-106).
import { h } from "../../render/slot-html.js";
import { DeckoName } from "../../name.js";
// 2026-10-01::link/:nav_link share the flat
// HTML_VIEWS bodies (the urlView doctrine at :300-304 of this file) — one
// fn per view, so the two registrations cannot drift again.
import { HTML_VIEWS, linkView, navLinkView } from "../../render/views.js";
import { popoverLink } from "./card-mod-bootstrap.js";
import type {
  DeckoModManifest,
  ModSetModuleFile,
} from "../mod-manifest.js";
import { modSlotWrap } from "../mod-view-helpers.js";
import { cardFormShell } from "../mod-form-substrate.js";
import { allAdminConfigCodenamesOfCategory } from "./core-mod.js";
import { CardActionError } from "../../actions/types.js";
import { jsonValidationMessage, numberValidationMessage } from "./format-validations.js";

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
 *  _render_linkname`.
 *
 *  SURFACE-SCOPED. Ruby's `card_url`
 *  is `"#{Env.origin}#{card_path rel}"` (card-1.110.0 lib/card/env/
 *  location.rb:19-21) and `Env.origin` is a PER-RENDER value
 *  (serializable.rb:20-22 `Cardio.config.deck_origin ||
 *  "#{protocol}#{request&.host_with_port}"`), so the SAME helper renders
 *  two shapes and the frozen record pins BOTH:
 *    - SERVED PAGE: `https://example.com/User` (signup alert email's
 *      `{{_|url}}`, page-surface shard recapture-raw-shard-000016) and
 *      `https://example.com/*changed_card` (follower notification
 *      email's) — that capture sets deck_origin for the page surface only
 *      (capture-dual-$1page-and-view.rb:343, restored at :348);
 *    - VIEW FUNCTION: `/User` — the SAME card 21792, the SAME `{{_|url}}`,
 *      in the view-surface shard of the same recapture; that pass renders
 *      outside the production-config block (:277-287) with a
 *      controller-less `Card::Env.reset` (:439), so origin is "".
 *  The former unconditional DECK_ORIGIN could only ever produce the
 *  first shape, which is what left 21792/21796 pinned red behind an
 *  "reviewed origin, not closable against this fixture" blocker. The
 *  port now resolves the value through `fmt.cardUrl` (RenderFormat.
 *  envOrigin, the same pageConfigActive flag the :content default-nest
 *  view uses), so BOTH shapes are Ruby-true on their own surface.
 *  The earlier bare-linkname return was the "no live URL host" fallback
 *  written before the origin had a single source; mm-roleviews replaced
 *  it and the flat HTML_VIEWS entry (render/views.ts) points at the same
 *  shared body so the two registrations cannot drift. */
const urlView: ViewFn = ({ fmt }) => fmt.cardUrl(fmt.urlKey());

/** set/all/base.rb:29 view :id_url: `card_url "~#{card.id}"`.
 *  The "~<id>" mark (path.rb#interpret_mark -> Card::Name[mark] ->
 *  name.rb#id_from_string -> the codename mark ":id" dispatches to the
 *  card's id) is the id-prefixed mark. Ruby-exact card_url bytes
 *  (env/location.rb:19-22 `card_url rel = "#{Env.origin}#{card_path rel}"`,
 *  card_path location.rb:6-16 prefixing the relative URL root):
 *  `/~<id>` with the origin absent, `https://example.com/~<id>`
 *  with it present. SURFACE-SCOPED like urlView above — the same
 *  `fmt.cardUrl` seam over the same per-render `Env.origin`, so each
 *  surface renders its own Ruby-true form. The no-id arm keeps
 *  the blank return: Ruby's "~#{nil}" would
 *  walk the same chain to a bare "/~" URL, a Card.new edge no corpus
 *  byte exercises (replaces the
 *  bare-"~<id>" disclosed divergence, strand-fold recorded result limitation 4). */
const idUrlView: ViewFn = ({ fmt }) =>
  fmt.card.id === undefined ? "" : fmt.cardUrl(`~${fmt.card.id}`);

/** set/all/base.rb:31-33 view :url_link, perms: :none:
 *  `link_to_resource card_url(_render_linkname)`. RE-REVIEWED
 *  (the former body emitted the bare
 *  unrooted href with an internal-link class — a base-format guess, never
 *  exercised by any fixture, standing-green only because its own pin
 *  asserted it). The html chain:
 *  _render_linkname → base.rb:27 view :linkname → url_key (cardname-0.20.0
 *  lib/cardname/variants.rb:8-13, case-preserving "Oracle_Format_Probe");
 *  card_url (card-1.110.0 lib/card/env/location.rb:19-21) → the
 *  SURFACE-SCOPED resource:
 *  "https://example.com/Oracle_Format_Probe" on the served page,
 *  "/Oracle_Format_Probe" on the view-function surface — Env.origin is a
 *  per-render value, serializable.rb:20-22; the urlView above);
 *  html link_to_resource (set/all/links.rb:127-130) → add_resource_opts
 *  (links.rb:154-157): resource_type (links.rb:67, /^https?:/) —
 *  "external-link" on the page surface, "internal-link" (links.rb:68,
 *  ^/) on the view surface — so target="_blank" (inserted FIRST, and
 *  ONLY for external, links.rb:155) then class (add_class content.rb:
 *  43-47 → css_classes :55-57);
 *  super links.rb:44-47 (clean_resource links.rb:74-81: internal
 *  resources drop the leading slash and html's contextualize_path —
 *  path.rb:68-73 → card_path, location.rb:6-16 — re-roots it, so the
 *  bytes come back identical) → html link_to (links.rb:101-106): href =
 *  the cleaned resource (path.rb:35-36 String bypass — "a String is
 *  treated as a complete path and bypasses all processing"), text =
 *  raw(href) (links.rb:103), so the anchor text IS the url. Attribute
 *  order target→class→href is CAPTURE-PINNED:
 *  fixtures/captured/sass-style-pages/oracle-main-slot-regions.json
 *  carries real decko link_to_resource output `&lt;a target=&quot;_blank&quot;
 *  class=&quot;external-link&quot; href=&quot;https://github.com/...&quot;&gt;`
 *  — the EXTERNAL half; the internal half (target absent, class
 *  "internal-link") is gem-derived from the same chain, as links.rb:155
 *  gates target on the external type. No flat HTML_VIEWS entry
 *  exists for :url_link (loader-less dispatch raises UnsupportedViewError).
 *  The set/type/uri.rb:6-8 override (`link_to_resource _render_raw`, the
 *  card's raw href for URI-type cards) IS ported (the URI card type port
 *  2026-10-01) as the chain-scoped type/uri registration below — the
 *  override never reaches this body: a URI-typed card's chain walk finds
 *  Type::Uri first. */
const urlLinkView: ViewFn = ({ fmt }) => {
  const href = uriCleanResource(fmt.cardUrl(fmt.urlKey()));
  const rt = uriResourceTypeOf(href);
  const target = rt === "external-link" ? ` target="_blank"` : "";
  const cls = rt === undefined ? "" : ` class="${rt}"`;
  return `<a${target}${cls} href="${h(href)}">${href}</a>`;
};

/** set/type/uri.rb (card-mod-format-0.20.0) 1-19: the URI cardtype's
 *  render path. Base block (lines 1-9, format do — every format, and html
 *  reopens the base class so these override the all-set registrations for
 *  URI-typed cards in html dispatch):
 *
 *  - :title_link (2-4) `link_to_resource _render_raw,
 *    render_title_no_link` — hrefs the card's RAW content, text is the
 *    card-title span.
 *  - :url_link (6-8) `link_to_resource _render_raw` — the override the
 *    url-link-divergence recorded result named: a URI card's :url_link hrefs its
 *    own raw content instead of card_url(linkname).
 *
 *  html block (11-19): :core (12-14) `render_title_link` — renders THIS
 *  set's :title_link (render_title_link resolves the view through the set
 *  chain, so the override applies); input_type (16-18) is a form-input
 *  method, not a view — unported like every input_type (phrase/number/
 *  plain_text entries).
 *
 *  The html link_to_resource chain (the same chain the :url_link body
 *  above models, now over the raw content): html link_to_resource
 *  (set/all/links.rb:127-130) → add_resource_opts (links.rb:154-157):
 *  target="_blank" FIRST only for resource_type "external-link", then
 *  add_class (content.rb:43-47 → css_classes :55-57) — attribute order
 *  target→class→href is Hash insertion order (:155, :156, :102), the
 *  capture-pinned order. resource_type (links.rb:65-72, case/when order):
 *  /^https?:/ → "external-link"; ^/ → "internal-link"; /^mailto:/ →
 *  "email-link"; else RESOURCE_TYPE_REGEXP (links.rb:1
 *  /^([a-zA-Z][\-+.a-zA-Z\d]*):/) → "#{scheme}-link"; no match → nil →
 *  no class, no target. super (links.rb:44-47) → clean_resource
 *  (links.rb:74-81): ONLY internal resources are rewritten — the leading
 *  slash is stripped and contextualize_path re-roots it; html's
 *  contextualize_path is card_path (path.rb:68-73 → env/location.rb:6-16),
 *  which re-prefixes the site root: "rest" → "/rest" — the slash is
 *  restored, so the bytes survive unchanged (an already-rooted
 *  "scheme:/..."-shaped remainder passes card_path's ^(https?:)?/ test
 *  untouched). Then html link_to (links.rb:101-106): href = the cleaned
 *  resource (path.rb:35-36 String bypass), text = raw(text || opts[:href])
 *  (links.rb:103) — the anchor BODY is the href verbatim (raw-marked, no
 *  second escape — an earlier split: only the attribute value crosses the
 *  escape boundary, h() here = Rails tag_helper html_escape).
 *
 *  Per Ruby, these three views declare NO options (uri.rb's bare `view
 *  :url_link` / `view :title_link` / `view :core`) → config {}.
 *  Registration is CHAIN-SCOPED (kind nonbase: only
 *  per-set-module table, dispatchable by URI-typed cards through
 *  resolveView's TYPE-uri chain walk — the type/mod pattern); :url_link
 *  here therefore never flattens over the all/base registration. The
 *  :title_link text delegates to the flat :title_no_link (title.rb:20-22
 *  wrapped_title standard_title — the engine's titleNoLinkView,
 *  views.ts) exactly like linkView (views.ts renderView("title_no_link")). */
function uriResourceTypeOf(resource: string): string | undefined {
  if (/^https?:/.test(resource)) return "external-link";
  if (/^\//.test(resource)) return "internal-link";
  if (/^mailto:/.test(resource)) return "email-link";
  const m = /^([a-zA-Z][\-+.a-zA-Z\d]*):/.exec(resource);
  return m === null ? undefined : `${m[1]}-link`;
}

/** links.rb:74-81 clean_resource: internal-link resources are
 *  contextualized (see the uriResourceTypeOf docblock for the
 *  re-root-through-card_path chain); every other resource passes
 *  through byte-unchanged. */
function uriCleanResource(resource: string): string {
  if (uriResourceTypeOf(resource) === "internal-link") {
    const stripped = resource.replace(/^\//, "");
    return /^(https?:)?\//.test(stripped) ? stripped : `/${stripped}`;
  }
  return resource;
}

/** uri.rb:6-8 view :url_link: `link_to_resource _render_raw`. */
const uriUrlLinkView: ViewFn = ({ fmt }) => {
  const resource = uriCleanResource(fmt.renderRaw());
  const rt = uriResourceTypeOf(resource);
  const target = rt === "external-link" ? ` target="_blank"` : "";
  const cls = rt === undefined ? "" : ` class="${rt}"`;
  return `<a${target}${cls} href="${h(resource)}">${resource}</a>`;
};

/** uri.rb:2-4 view :title_link: `link_to_resource _render_raw,
 *  render_title_no_link` — the anchor text is the card-title span. */
const uriTitleLinkView: ViewFn = ({ fmt }) => {
  const resource = uriCleanResource(fmt.renderRaw());
  const rt = uriResourceTypeOf(resource);
  const target = rt === "external-link" ? ` target="_blank"` : "";
  const cls = rt === undefined ? "" : ` class="${rt}"`;
  return `<a${target}${cls} href="${h(resource)}">${fmt.renderView("title_no_link")}</a>`;
};

/** uri.rb:12-14 html view :core: `render_title_link` — renders this
 *  set's :title_link (the type/mod adminView delegation pattern:
 *  fmt.renderView re-walks the chain, Type::Uri first for URI cards). */
const uriCoreView: ViewFn = ({ fmt }) => fmt.renderView("title_link");

/** set/type/html.rb:8-10 (base block) + :24-26 (html block, wrap: {}):
 *  `view :one_line_content do raw_one_line_content end` — the HTML type's
 *  one-line OVERRIDE. The body is the All::Content helper
 *  (set/all/content.rb:43-45): `truncate strip_tags(render_raw),
 *  length: one_line_character_limit` (voo.size || 60, content.rb:51-53) —
 *  the SAME composition the card-mod-layout Right::Head :one_line_content
 *  port renders (rightHeadOneLineContentView), capture-pinned there by
 *  layout-one-line.json (60-char + "..." arm, strip-to-empty meta arm,
 *  short passthrough arm). Without this registration an HTML-typed card
 *  walks past Type::Html to the all/base one_line_content (the
 *  truncate-raw no-strip shape) — Ruby never does: Type::Html precedes
 *  All::* in the set chain.
 *  CORPUS-PRESENT-UNRENDERED: the
 *  sha-verified dump copy (6A44DFDC...) carries 498 HTML-typed cards, 455
 *  of them tag-bearing (453 longer than 60 chars, where strip+truncate
 *  diverges from the fallback shape) — but ZERO captured one_line_content
 *  bytes of any HTML-typed card: the view has no internal call site in
 *  any installed gem (grep over card-1.110.0/mod + card-mod-*, none), so
 *  Ruby renders it only on direct view requests. Pins are gem-derived;
 *  the composition itself is capture-proven on the Right::Head sibling. */
const typeHtmlOneLineContentView: ViewFn = ({ fmt, voo }) => {
  const sizeOpt = voo.opts["size"];
  const length = typeof sizeOpt === "number" ? sizeOpt : ONE_LINE_CHARACTER_LIMIT;
  return truncate(stripTags(fmt.renderRaw()), length, "...");
};


/** set/all/base.rb:35-37 view :link, perms: :none: `link_view`
 *  (base.rb:43-47 `link_to_card card.name, _render_title, opts`) and
 *  :39-41 view :nav_link (`link_view class: "nav-link"`). BOTH bodies live
 *  in render/views.ts (linkView / navLinkView) and are IMPORTED here —
 *  there is exactly ONE Ruby definition across the loaded gems
 *  (set/all/base.rb:35; card-1.110.0 grep: zero view :link;
 *  set/type/html.rb: no :link), and its html-format helper chain —
 *  links.rb:111-116 → 101-108 (rooted href via path.rb:74-77 +
 *  env/location.rb:6-15) + title.rb:19-22,39-42 (card-title span) — is
 *  what renders for every card, so the flat HTML_VIEWS entry and this
 *  registration must be the same fn (the link-registration drift fix
 *  2026-10-01; the former local bodies emitted the bare-urlKey + plain-
 *  title base-format shape, the 21796 oracle's first diff @631). The
 *  urlView shared-body doctrine (:300-304). */

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
 *  `with_nest_mode(:compact) { truncate render_core }` — WITHHELD from
 *  the manifest. Ruby's MRO never
 *  dispatches this body in the html format the engine renders: the
 *  All-set modules load in path order (base.rb < content.rb < html/
 *  views.rb) and each later include shadows the earlier same-named view
 *  (card-1.110.0 config/initializers/01_core_extensions/module.rb:15-22
 *  add_set_modules includes the base-format list in load order, so the
 *  LAST module defining a method wins; registrar.rb:79-84
 *  process_base_format_modules feeds that list), meaning All::Content
 *  (content.rb:9-13) and then All::Html::Views (views.rb:29-32 —
 *  registered below, allHtmlViewsOneLineContentView) replace it for
 *  EVERY html-format render. The same later-module-wins shape the
 *  :titled registration below records for All::Html vs All::Base.
 *  oneLineContentBody still serves the closed_content alias
 *  (content.rb:16), whose Ruby body IS All::Content's captured block
 *  (view_definition.rb:53-63 alias_view_block captures
 *  views[All::Content][:one_line_content] at definition time — the
 *  bare helper shape, never the html wrap arm). */
/** set/all/base.rb:101-103 view :labeled_content, unknown: :mini_unknown:
 *  `render_core`. The base body is the core view's bytes; the
 *  unknown-card substitution routes unknown cards to :mini_unknown.
 *
 *  `render_core` is Ruby's METHOD DELEGATION (method_delegation.rb:41-47
 *  -> `api_render` :14-18 -> `render!`), not a plain dispatch: it opens
 *  its own `wrap_and_render` rescue (format/render.rb:7-14, :96-100), so
 *  a raising core returns the quiet render-error span on a nested format
 *  and only re-raises on the focal (depth-0) one. `renderDelegated` is
 *  that seam. Calling `renderView` here instead skipped the rescue scope
 *  entirely and let the error escape the whole nest chain — the too-deep
 *  chain of the corpus rendered as a thrown adapter error instead of the
 *  quiet span Ruby emits inside the twentieth card's own view. */
const labeledContentView: ViewFn = ({ fmt }) => fmt.renderDelegated("core");

/** set/all/base.rb:105-107 view :titled_content, unknown: :blank:
 *  `render_core`. Same body as :labeled_content, same method-delegation
 *  seam (see above). */
const titledContentView: ViewFn = ({ fmt }) => fmt.renderDelegated("core");

/** set/all/base.rb:109-111 view :blank, perms: :none:
 *  the literal empty string. (HTML_VIEWS already has a blankView; this
 *  port RE-registers it under the mod loader so the basket carries
 *  the set/all/base entry - the view body is identical.) */
const blankView: ViewFn = () => "";

/** set/all/base.rb:125-127 view :labeled: `"#{card.name}: #{_render_
 *  labeled_content}"`. */
const labeledView: ViewFn = ({ fmt }) =>
  `${fmt.card.name.s}: ${fmt.renderView("labeled_content")}`;

/** set/all/html.rb:5-7 and set/type/cardtype.rb:2-4 view :type, unknown:
 *  true: `link_to_card card.type_card, nil, class: "cardtype"` - the html
 *  format's type link (the base format's plain type name, base.rb:57, is
 *  shadowed in html by the html module). */
const htmlTypeView: ViewFn = ({ fmt }) => {
  const type = fmt.card.typeName ?? "";
  return `<a class="cardtype known-card" href="/${h(DeckoName.parse(type).urlKey)}">${type}</a>`;
};

/** set/all/html/views.rb:67-72 view :labeled, unknown: :labeled, cache:
 *  :yes - the html format's wrapped row (title + labeled content + menu),
 *  which shadows base.rb's "name: content" arm in html. The body is the
 *  shared engine view (render/views.ts labeledView), captured before any
 *  mod registration writes the live table. */
const ENGINE_LABELED: ViewFn | undefined = HTML_VIEWS["labeled"];
const htmlLabeledView: ViewFn = (ctx) => (ENGINE_LABELED === undefined ? "" : ENGINE_LABELED(ctx));

// ---------------------------------------------------------------------------
// error views (set/all/error.rb)
// ---------------------------------------------------------------------------

/** set/all/html/error.rb:33-35 view :compact_missing, perms: :none:
 *  `wrap_with :span, h(title_in_context), class: "text-muted"` — the HTML
 *  arm this port's html render surface answers with. title_in_context is
 *  called with NO argument (context_names.rb:48-55: nil title →
 *  `card.name.from(*context_names)`, the voo's explicit :title opt is
 *  NOT consulted — unlike view :title's standard_title composition), and
 *  the html override h()s the result (title.rb:32-35). The BASE-format
 *  arm (set/all/error.rb:2-4, `compact: true`) is the bare "" and is
 *  what the email formats override again (card-mod-email
 *  set/all/email_text.rb:6-8 and email_html.rb:38-40, both ""). 
 *  Reachable only through the compact substitution's unknown-card
 *  fallback (mode.rb:73, ported by the nest-mechanism remainders):
 *  zero captured surface renders it (nest-mode-port census), so the
 *  "" → span body change is byte-neutral on the recorded corpus. */
const compactMissingView: ViewFn = ({ fmt }) =>
  `<span class="text-muted">${h(fmt.card.name.from(...fmt.contextNames))}</span>`;

/** set/all/error.rb:6-8 view :unknown, perms: :none, cache: :never: the
 *  literal empty string, OVERRIDDEN by the html block's createable link
 *  (set/all/html/error.rb:10-12) — which is the body that reaches the wire
 *  and the one registered on All::Error below. The bare "" was the body
 *  registered here until the html-block override was found missing; it is
 *  kept as a named local only if a caller needs the base-format arm again
 *  (no surface renders the base format's :unknown). */

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
 *  engine.
 *
 *  CORRECTED 2026-09-30 (the mm-cardtype-tpl change). This comment used to claim
 *  "the byte equality is not the goal here, the dispatch is" and to
 *  describe the bodies as minimum-viable placeholders wrapping the card's
 *  URL-key in "a cardtype-appropriate anchor". That premise was wrong and
 *  the placeholder SHIPPED: the anchor reached the wire on all 63
 *  Cardtype-typed page renders, carrying an engine-only
 *  `cardtype-add-button` class (0 expected pages, 63 actual), a `/<key>/new`
 *  href (`/new"` 0 expected, 63 actual) and a bare `add` text — against an
 *  oracle that renders the rails `btn btn-secondary slotter` triple
 *  pointing at `/type/<Name>?view=new_in_modal` with an `Add <Name>`
 *  card-title span. `cardtypeAddButtonView` below is now the pinned
 *  oracle shape; see its own doc comment for the measured evidence.
 *
 *  `add_link` and `add_url` remain unpinned: neither
 *  `cardtype-add-link` nor an `add_url` string appears in ANY of the 63
 *  expected page bytes, so their bodies are still the placeholder form and
 *  are deliberately left alone (changing them would be unmeasured). */
function cardtypeUrlKey(fmt: RenderFormatBase): string {
  return fmt.card.key ?? "";
}
/** The cardtype add path's UNDERCORE form of the card's name, case
 *  preserved: the name with every space replaced by an underscore.
 *
 *  EVIDENCE (the 63 Cardtype-typed page fails, each cross-checked
 *  against its expectedHtml): the href is
 *  `/type/<name>.gsub(" ", "_")?view=new_in_modal` for EVERY one of the 62
 *  Cardtype pages that carries the anchor. It is NOT `card.key` / url_key
 *  (both lowercase) and NOT the `cards.codename` column (also the
 *  lowercase key form: the raw corpus stores `uri` for `URI`,
 *  `mirror_list` for `Mirror List`, `java_script` for `JavaScript`), while
 *  the oracle pins `/type/URI`, `/type/Mirror_List`, `/type/JavaScript`.
 *  Same engine idiom as mod-form-substrate-rule-form.ts:153 / :332 and
 *  card-mod-account.ts:341. */
function cardtypeAddPathSegment(fmt: RenderFormatBase): string {
  return (fmt.card.name?.s ?? "").replace(/ /g, "_");
}
function cardtypeAddLinkView({ fmt }: ViewContext): string {
  const url = cardtypeUrlKey(fmt as unknown as RenderFormatBase);
  return `<a class="cardtype-add-link" href="/${url}/new">add</a>`;
}
/** set/type/cardtype.rb :add_button — the cardtype page template's add
 *  affordance, byte-pinned across the captured Cardtype pages.
 *
 *  The oracle anchor (62 of the 63 Cardtype page fails carry it verbatim;
 *  `Mod` carries none, so `Mod` keeps rendering the button — a documented
 *  residual):
 *
 *      <a data-slotter-mode="modal"
 *         data-modal-class="modal-dialog modal-dialog-centered"
 *         class="btn btn-secondary slotter"
 *         href="/type/<Name_underscored>?view=new_in_modal"
 *         data-remote="true"><span class="card-title"
 *         title="Add <Name>">Add <Name></span></a>
 *
 *  Three shape facts the earlier stub got wrong, each measured across the
 *  whole class: (1) the `cardtype-add-button` class is ENGINE-ONLY — it
 *  appears in 63 actual pages and 0 expected pages, so the real class list
 *  is the rails `btn btn-secondary slotter` triple; (2) the href targets
 *  `/type/<Name>?view=new_in_modal`, the type-card modal surface, NOT
 *  `/<key>/new` — `/new"` likewise appears in 63 actual and 0 expected
 *  pages; (3) the anchor body is a `card-title` span carrying
 *  `Add <Name>` in both the title attribute and the text (the same
 *  `<span class="card-title" title="h(n)">h(n)</span>` shape as
 *  views.ts unknown_link, format.ts:1553 and navbar-views.ts:45).
 *
 *  This is the whole remaining divergence on the 12 Cardtype pages whose
 *  `+*type+by_name` member search is empty on BOTH sides (Tracked Item,
 *  event, Proto Item, URI, Group, Log Entry, Task, Mirror List,
 *  Mirrored List, Notification template — an earlier cardtype-template
 *  class); on the other 51 the same anchor is one region among the
 *  search-driven ones. */
function cardtypeAddButtonView({ fmt }: ViewContext): string {
  const base = fmt as unknown as RenderFormatBase;
  const segment = cardtypeAddPathSegment(base);
  const label = `Add ${base.card.name?.s ?? ""}`;
  const safeLabel = h(label);
  // cardtype.rb:24-26 add_link: `voo.title ||= t(:format_add_card, cardname:
  // safe_name); link_to render_title, ...` - the anchor body is the html
  // :title view, so the span is wrapped_title (title.rb:38-42) with the
  // joint span per "+" (format.ts#wrappedTitleInner). No corpus Cardtype
  // name carries a joint, so these bytes are unchanged today.
  return (
    `<a data-slotter-mode="modal" data-modal-class="modal-dialog modal-dialog-centered" ` +
    `class="btn btn-secondary slotter" href="/type/${h(segment)}?view=new_in_modal" ` +
    `data-remote="true"><span class="card-title" title="${safeLabel}">` +
    `${wrappedTitleInner(safeLabel)}</span></a>`
  );
}
function cardtypeAddUrlView({ fmt }: ViewContext): string {
  return `/${cardtypeUrlKey(fmt as unknown as RenderFormatBase)}/new`;
}
interface RenderFormatBase {
  card: { key?: string; name?: { s: string } };
}

/** set/type/cardtype.rb:61-63 (card-mod-format-0.20.0)
 *  `view :configure_button, cache: :never, denial: :blank,
 *  perms: :can_configure? do configure_link "btn btn-secondary" end`.
 *  Ruby's configure_button body IS the configure_link helper called with
 *  "btn btn-secondary" (cardtype.rb:65-75: the anchor is link_to_card to
 *  the rules board, class css_classes("configure-type-link ms-3",
 *  css_class), the text the _render_title "Configure <Plural>" span) —
 *  the ruling that retired this registration's engine-era approximation
 *  ("cardtype-configure-button" + a /configure path, modelled on the
 *  add_button stub, never oracle-shaped). The registration closes the
 *  UnsupportedViewError crash on EVERY Cardtype-typed page (75 cards; the
 *  `Cardtype+*type+*structure` rule 17770 nests `{{_|configure_button}}`,
 *  and `Cardtype+*self+*structure` 38252 repeats it for the Cardtype card
 *  itself — news-item-crash-trace). Permission/degradation parity lives
 *  in view-perms.ts: the predicate (can_configure? = update-ok on
 *  <card>+*type+*structure, cardtype.rb:57-59) resolves through the
 *  engine's canConfigure hook and the denial (:blank) renders "" — the
 *  anonymous surface's bytes, live pins ZERO configure strings on
 *  live_News_Item.html. This body only renders when the predicate ALLOWS
 *  (admin-like viewers). */
function cardtypeConfigureButtonView({ fmt }: ViewContext): string {
  return cardtypeConfigureAnchor(fmt as unknown as RenderFormatBase, "btn btn-secondary");
}

/** set/type/cardtype.rb:53-55 (card-mod-format-0.20.0) view :configure_link,
 *  cache: :never, perms: :can_configure? - the configure_button body's
 *  helper (:65-75), now ported as its own view. The set scope (type/
 *  cardtype.rb = Cardtype-typed cards only) rides the mod loader's chain
 *  dispatch (a type/* registration reaches only cards whose set keys name
 *  Type::Cardtype; other types raise the unsupported-view error exactly
 *  like Ruby's missing-method walk).
 *
 *  Body: `return "" unless Card.fetch(card, :type, :structure, new:
 *  {}).ok? :update` (the perms predicate gates BEFORE dispatch -
 *  view-perms.ts's can_configure? resolution denies anonymous first, so
 *  the body's own re-check is the same fetch the predicate runs);
 *  `voo.title ||= t(:format_configure_card, cardname: safe_name.pluralize)`
 *  (en.yml: format_configure_card = "Configure %{cardname}", Rails
 *  pluralize on the name); `title = _render_title` (the :title view with
 *  the voo.title override - the engine has no voo.title seam, so the body
 *  emits wrapped_title itself: the pinned card-title span with the override
 *  text); the link_to_card anchor with path {view: :board, board: {tab:
 *  :rules_tab}, set: Card::Name[safe_name, :type]} - Card::Path#standard
 *  (lib/card/path.rb:36-39) builds "<mark>/board?<query>" (mark = the
 *  url_key, view deleted into the path base), the query to_param-encodes
 *  (board[tab]=rules_tab, set=Configure+Probe%2B*2Atype-style CGI.escape
 *  bytes) and the attribute emitter escapes & -> &amp;. The class list is
 *  css_classes("configure-type-link ms-3", css_class) (:74) with
 *  link_to_card's known/wanted class appended (links.rb:141-144) - the
 *  configure_button passes "btn btn-secondary" through the same builder
 *  (cardtypeConfigureAnchor), so the two views cannot drift. */
function cardtypeConfigureLinkView({ fmt }: ViewContext): string {
  return cardtypeConfigureAnchor(fmt as unknown as RenderFormatBase, undefined);
}

/** cardtype.rb:65-75's anchor: the rules-board link_to_card both
 *  :configure_link (no extra class) and :configure_button ("btn
 *  btn-secondary", cardtype.rb:62) render through. */
function cardtypeConfigureAnchor(fmt: RenderFormatBase, cssClass: string | undefined): string {
  const card = fmt.card as unknown as { typeName?: string; name: { s: string }; unknown?: boolean };
  if (card.typeName !== "Cardtype") {
    throw new UnsupportedViewError("configure_link", card.name.s);
  }
  const safeName = card.name.s;
  // Rails String#pluralize (active_support/inflector: inflects the last
  // word; the default-rule subset the cardtype names hit: consonant+y ->
  // ies, s/x/z/ch/sh -> es, default -> +s).
  const plural = safeName.replace(/(\S+)$/, (w) =>
    /[^aeiouAEIOU]y$/.test(w)
      ? `${w.slice(0, -1)}ies`
      : /(s|x|z|ch|sh)$/i.test(w)
        ? `${w}es`
        : `${w}s`,
  );
  const titleText = `Configure ${plural}`;
  const escapedTitle = titleText
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  const href =
    `/${(fmt as unknown as { urlKey: () => string }).urlKey()}/board` +
    `?board%5Btab%5D=rules_tab` +
    `&amp;set=${encodeURIComponent(`${safeName}+*type`)
      .replace(/%20/g, "+")
      .replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`;
  const classes = `configure-type-link ms-3${cssClass ? ` ${cssClass}` : ""} ${
    card.unknown === true ? "wanted-card" : "known-card"
  }`;
  return (
    `<a class="${classes}"` +
    ` href="${href}">` +
    `<span class="card-title" title="${escapedTitle}">${escapedTitle}</span></a>`
  );
}

/** set/all/error.rb:28-30 view :errors: `"Problem:\\n\\n" + error_messages.
 *  join("\\n")`. error_messages walks card.errors; the headless
 *  engine's RenderCard carries no `errors` list (the engine has no
 *  error attachment surface), so the join is over an empty list and
 *  the body reduces to the "Problem:\\n\\n" prefix + blank join.
 *  Exported (wave-1 follow family): the follow mod's User+*follow :errors
 *  view's super() arm dispatches THIS body (user/follow.rb:76-78) - the
 *  chain's all-set definition the type_plus_right registration shadows. */
export const errorsView: ViewFn = () => "Problem:\n\n";

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
 *  `view :closed_content, :one_line_content` - the Ruby alias does NOT
 *  re-dispatch the view name: alias_view_block (card-1.110.0
 *  lib/card/set/format/abstract_format/view_definition.rb:53-63) captures
 *  `views[All::Content][:one_line_content]` — the block defined at
 *  content.rb:9-13 — at definition time and defines closed_content with
 *  THAT block. So Ruby's closed_content runs
 *  `with_nest_mode(:compact) { one_line_content }` where the helper call
 *  resolves at RUNTIME through the format's method chain — the All::Content
 *  helper for every card without a more-specific one_line_content HELPER
 *  override (the only gem override is Type::Toggle's, toggle.rb:31-35
 *  `def one_line_content; short_content end`, whose 1-3-char core bytes
 *  are a fixed point of the strip/truncate composition below) — yielding
 *  `truncate strip_tags(render_core), length: one_line_character_limit`
 *  (content.rb:47-49; limit = voo.size || 60, content.rb:1,51-53; the
 *  omission is "...", active_support filters.rb:70-83, mirrored by the
 *  truncate import from text-helpers.ts:203-211). NO text-muted wrap —
 *  the :one_line_content VIEW dispatches to the html wrap arm
 *  (views.rb:29-32) while closed_content stays bare: the two names
 *  diverge in Ruby for every html-format card.
 *
 *  reviewed + PORTED: the
 *  former body (oneLineContentBody: raw fmt.renderRaw() hard-trimmed at
 *  60 — no strip_tags, no omission marker, raw bytes instead of the core
 *  render) diverged from content.rb:47-49 on every tag-bearing or
 *  >60-char content and on every card whose core render differs from the
 *  raw dbContent (nests, html-typed cores). This body is the Ruby-true
 *  composition: the compact nest-mode wrap rides the engine's ported
 *  withNestMode state (nesting/mode.rb:24-30; the compact SUBSTITUTION —
 *  mode.rb:43-51 view swap + nesting.rb:52-63 200-char elision — is
 *  MEASURED zero-observable on the recorded capture surface, so
 *  modalNestView leaving the requested view alone for compact emits
 *  Ruby-true bytes; see format.ts modalNestView docblock for the arm
 *  pins), render_core is fmt.renderView("core") (the same call the
 *  capture-proven :one_line_content html arm makes). Corpus-absent:
 *  the census (sha-verified 6a44dfdc dump copy +
 *  expected-v2 shards) found ZERO closed_content entries in the recorded
 *  capture surface, so the pin is gem-derived. The same census closed
 *  the substitution (sha-verified
 *  6a44dfdc copy + all 97 expected-v2 shards): 30,037 captured
 *  text-muted one-line divs, every one of the 2,689 {{-bearing shapes
 *  LITERAL — every captured one-line arm is raw or nest-free
 *  (right/*default card-mod-content set/right/default.rb:4-7,
 *  right/*structure right/structure.rb:14-16, right/*head card-mod-layout
 *  set/right/head.rb:11-13, type/html card-mod-format set/type/html.rb:
 *  10-16 chunk_list :references, toggle/list arms) — and only 4
 *  nest-bearing rules render any bar (ids 88, 105: right/*default raw;
 *  38250, 38251: raw guide bytes, nests at chars 202/672 beyond the
 *  60-char window), so no recorded surface renders a nest under a
 *  compact parent and the elision has no parent to fire in. The census
 *  pins above stand; the nest-mechanism remainders 2026-10-01 went
 *  the further step and PORTED the compact machinery gem-derivative
 *  (mode.rb:71-84 substitution via COMPACT_TRUE_VIEWS + nesting.rb:52-63
 *  elision via charCount, format.ts) — byte-neutral on the recorded
 *  surface by this census, and the withNestMode("compact") wrap below is
 *  what arms it the day any surface renders the compact-wrapped METHOD
 *  composition on nest-bearing content. */
const closedContentView: ViewFn = ({ fmt, voo }) => {
  const sizeOpt = voo.opts["size"];
  const length = typeof sizeOpt === "number" ? sizeOpt : ONE_LINE_CHARACTER_LIMIT;
  return fmt.withNestMode("compact", () =>
    truncate(stripTags(fmt.renderView("core")), length, "..."),
  );
};

/** set/all/html/views.rb:24-27 view :raw_one_line_content, unknown:
 *  :mini_unknown, wrap: { div: { class: "text-muted" } }:
 *  `raw_one_line_content` — the All::Content helper (set/all/content.rb:
 *  43-45) `truncate strip_tags(render_raw), length: one_line_character_
 *  limit` (voo.size || 60, content.rb:1,51-53; the truncate omission is
 *  "...", filters.rb:71 default). The wrap option's div IS the outer
 *  element (the :one_line_content sibling arm at views.rb:29-32 carries
 *  the same wrap — allHtmlViewsOneLineContentView). render_raw is the
 *  card's dbContent (the engine's fmt.renderRaw(), the same bytes
 *  Ruby's render_raw reads).
 *
 *  WITHHELD: the All::Content base view registration (content.rb:18-20,
 *  formerly rawOneLineContentView, registered bare under the all/content
 *  set module until the format remainder ports 2026-10-01) — Ruby's
 *  MRO never dispatches it in the html format the engine renders: the
 *  All-set modules load in path order (base.rb < content.rb <
 *  html/views.rb) and each later module shadows the earlier same-named
 *  view (card-1.110.0 config/initializers/01_core_extensions/module.rb:
 *  15-22 add_set_modules + registrar.rb:79-84
 *  process_base_format_modules — the LAST module defining the method
 *  wins), so All::Html::Views' arm replaces All::Content's on EVERY
 *  html-format render. The chain walker's ALL-token expansion is FORWARD
 *  load order and dispatch takes chain[0] (render.ts computeResolvedView),
 *  so keeping both registered would dispatch the EARLIER base view — the
 *  inverse of Ruby. Same withholding the :one_line_content arm carries
 *  for All::Base (the withheld :one_line_content record) and the :titled precedent.
 *  Rule cards never reach this arm: card-mod-rules set/rule/bar_view.rb:
 *  24-29 registers Rule::BarView's own :raw_one_line_content (wrap class
 *  "text-muted one-line", unknown: true, the existing_rule_card guard)
 *  and the rule-pattern set-key token outranks the ALL token — the
 *  captured rule-card bytes (<div class="text-muted one-line">Anyone</div>,
 *  fixtures/captured/rules-views.json rule_card/views/raw_one_line_
 *  content) ride THAT arm. This All-set arm has no captured oracle bytes
 *  (the corpus census, the format remainder ports 2026-10-01: zero
 *  raw_one_line_content entries in the expected-v2 view/page shards;
 *  the only captured bytes are the Rule::BarView arm above) — the pin is
 *  gem-derived: the wrap shape is the views.rb:24-27 wrap option, the
 *  inner composition is the capture-proven content.rb:43-45 helper (the
 *  rawOneLineContentView pins this file carried proved the
 *  strip/truncate bytes at the unit level; the sibling :one_line_content
 *  arm's live oracle proved the wrap div emission). */
const allHtmlViewsRawOneLineContentView: ViewFn = ({ fmt, voo }) => {
  const sizeOpt = voo.opts["size"];
  const length = typeof sizeOpt === "number" ? sizeOpt : ONE_LINE_CHARACTER_LIMIT;
  return `<div class="text-muted">${truncate(stripTags(fmt.renderRaw()), length, "...")}</div>`;
};

/** stripTags: regex-based stand-in for Rails' strip_tags
 *  (actionview/lib/action_view/helpers/sanitize_helper.rb:95-110:
 *  the full Rails version also drops <script>/<style>/<textarea>
 *  contents; the captured deck's content is plain text, so the
 *  simple regex form suffices and the corpus oracle is unchanged). */
function stripTags(value: string): string {
  return value.replace(/<[^>]*>/g, "");
}

/**
 * set/all/content.rb:56-60 view :hidden_content_field, unknown: true,
 * cache: :never (html block). The Ruby body is one call:
 *
 *     hidden_field :content, class: "d0-card-content"
 *
 * RESOLVED RECEIVER (derived from the gem sources, not guessed):
 *
 *  1. View bodies run with self = the HtmlFormat instance
 *     (set/format.rb:118-131 class_evals the format block into a per-set
 *     module included into the format instance's singleton class,
 *     card-1.110.0 lib/card/format.rb:62-68).
 *  2. Card::Format includes MethodDelegation (format.rb:27); no
 *     hidden_field is defined anywhere in card/decko/mod gems, so the
 *     call hits MethodDelegation#method_missing -> delegate_to_action_view
 *     (method_delegation.rb:41-47,71-75), which forwards verbatim:
 *     action_view.send :hidden_field, :content, {class: "d0-card-content"}.
 *  3. The receiver is CardActionView < ActionView::Base
 *     (card_action_view.rb:4-8) — the TEMPLATE, never a FormBuilder — so
 *     the 2-arg call binds in FormHelper#hidden_field(object_name, method,
 *     options = {}) (form_helper.rb:1214): object_name=:content,
 *     method={class: "d0-card-content"}, options={}. The class hash lands
 *     in the METHOD slot (Ruby passes it positionally; same on the send).
 *     The FormBuilder#hidden_field(method, options) form
 *     (form_helper.rb:2518) is not in play.
 *  4. Tags::HiddenField.new(:content, {class:...}, template, {}).render:
 *     @method_name = hash.to_s = `{:class=>"d0-card-content"}` (Ruby 3.3
 *     Hash#to_s = inspect) and @object = nil — retrieve_object reads the
 *     template's @content ivar, which nothing ever assigns on a
 *     CardActionView (card_action_view.rb:7 passes only {_routes: nil};
 *     the card is never exposed). TextField#render (tags/text_field.rb:
 *     11-18) emits type=hidden, skips the nil size and value
 *     (tag_helper.rb:298), sets autocomplete="off" first
 *     (tags/hidden_field.rb:7-10), and derives name/id from the
 *     stringified hash (field_name/field_id, form_tag_helper.rb:102-144),
 *     HTML-escaped.
 *
 * The byte string is the LIVE OUTPUT of actionview-7.2.3.2 on Ruby 3.3.0
 * with exactly the forwarded arguments (probed against the booted
 * oracle app; the same run resolved hidden_field to form_helper.rb:1214,
 * confirming the template receiver). The body never reads the card — the bytes are
 * constant on every card, so the port is the literal.
 *
 * This reproduces Ruby's actual behavior, which is a latent decko bug
 * shape (the intended `class: "d0-card-content"` styling never reaches
 * the input): the name/id attributes carry the escaped Hash#to_s. Byte
 * parity with Ruby governs; the intent-shaped markup would be
 * `<input ... name="card[content]" id="card_content"
 * class="d0-card-content">` (that is what the FormBuilder form at
 * form_helper.rb:2518 emits — captured in the same probe run for
 * contrast) — and that is NOT what Ruby renders for this view. */
const hiddenContentFieldView: ViewFn = () =>
  '<input autocomplete="off" type="hidden" name="content[{:class=&gt;&quot;d0-card-content&quot;}]" id="content_{:class=&gt;&quot;d0-card-content&quot;}" />';

// ---------------------------------------------------------------------------
// content.rb set/all/content: :smart_label (:26-41)
// ---------------------------------------------------------------------------

/** set/all/content.rb:26-28 view :smart_label, cache: :never, unknown:
 *  true: `label_with_description render_label, label_description`.
 *  - render_label = the :label view (content.rb:22-24, card.label = name;
 *    labelView above).
 *  - label_description (:37-41): `card.fetch(:description)` — the
 *    +description subcard (the codename card's name IS "description",
 *    card-1.110.0 mod/core/data/real.yml:3-4); nil when it does not
 *    exist, and label_with_description (:30-34) returns the bare label.
 *  - with a description: `"#{label} #{popover_link description}"` — the
 *    anchor is card-mod-bootstrap's popover_link helper
 *    (set/all/bootstrap/helper.rb:41-57), reused via its popoverLink
 *    export (byte-pinned by the live oracle capture
 *    fixtures/captured/help-popover.json "rendered" and this pass's
 *    smart-label capture). The `desc.format.render_core` half renders the
 *    description card's :core in a subformat (nesting.rb subformat shape;
 *    the parent chain carries the naming context).
 *  The +description card is warmed by render.ts's smart_label prepare
 *  gate (prepareItemForRender, the R17 signup-children precedent) — the
 *  sync view reads it from the prepared map. */
const smartLabelView: ViewFn = ({ fmt }) => {
  const label = fmt.renderView("label");
  const desc = fmt.engine.fetchRenderCard(`${fmt.card.name.s}+description`);
  if (desc === undefined || desc.unknown === true) return label;
  const description = new RenderFormat(desc, fmt.engine, {
    parent: fmt,
    maxDepth: fmt.maxDepth,
    nestQuietErrors: fmt.nestQuietErrors,
  }).renderView("core");
  return `${label} ${popoverLink(description)}`;
};

// ---------------------------------------------------------------------------
// set/all/html/frame.rb + set/all/html/views.rb + set/all/demo.rb
// ---------------------------------------------------------------------------

/** set/all/html/frame.rb:2-7 view :flash, cache: :never, unknown: true,
 *  perms: :none:
 *  `flash_notice = params[:flash] || Env.success.flash; return "" unless
 *  flash_notice.present? && focal?; Array(flash_notice).join "\n"`. The
 *  headless render has neither request params nor the Env.success stack,
 *  so flash_notice is always absent and the guard returns "" - the literal
 *  the Ruby body computes for every headless render. */
const flashView: ViewFn = () => "";

/** set/all/html/views.rb:20-22 view :short_content, wrap:
 *  { div: { class: "text-muted" } }:
 *  `short_content` -> :92-94 short_content_items || short_content_fields ||
 *  short_content_from_core. The port covers the branches a headless render
 *  reaches: the TOGGLE override (set/type/toggle.rb:35-37 short_content =
 *  render_core) and short_content_from_core (:112-123: "" -> "empty",
 *  size <= 5 -> the content, newline count < 2 -> "N characters", else
 *  "N+1 lines"). NOT ported: short_content_items (:96-99 - card.count is
 *  the Search-type query count, a runtime the engine has no per-card
 *  surface for) and short_content_fields (:102-110 - the voo.structure /
 *  card.structure nested-field read). The wrap option's div IS the outer
 *  element here (Ruby's wrap: view option wraps the view output).
 *  Ruby's content.size counts characters; the port's .length counts
 *  UTF-16 units - identical bytes for BMP content. */
const shortContentView: ViewFn = ({ fmt }) => {
  let body: string;
  if (fmt.card.typeName === "Toggle") {
    body = fmt.renderView("core");
  } else {
    const content = fmt.renderView("core");
    const newlines = content.match(/\n/g)?.length ?? 0;
    if (content.length === 0) body = "empty";
    else if (content.length <= 5) body = content;
    else if (newlines < 2) body = `${content.length} characters`;
    else body = `${newlines + 1} lines`;
  }
  return `<div class="text-muted">${body}</div>`;
};

/** set/all/html/views.rb:29-32 view :one_line_content, unknown:
 *  :mini_unknown, wrap: { div: { class: "text-muted" } }:
 *  `one_line_content` — the All::Content helper (set/all/content.rb:47-49)
 *  `truncate strip_tags(render_core), length: one_line_character_limit`
 *  (voo.size || ONE_LINE_CHARACTER_LIMIT = 60, content.rb:1,51-53; the
 *  truncate omission is "...", filters.rb:71 default). The wrap option's
 *  div IS the outer element (the :short_content sibling above carries the
 *  same wrap at views.rb:20-22). render_core is the format's render!
 *  :core helper (format.rb:88-92) — fmt.renderView("core") here.
 *
 *  This registration is the ALL-SET HTML DISPATCH of :one_line_content
 *  for every card whose chain reaches the All bucket without a
 *  set-scoped override: Ruby's include order (base.rb < content.rb <
 *  html/views.rb, module.rb:15-22 add_set_modules + registrar.rb:79-84)
 *  makes views.rb's definition shadow All::Content's and All::Base's on
 *  every html-format render — the mechanism that made the All::Base
 *  registration (base.rb:97-99) get WITHHELD (its record sits at
 *  the withheld All::Base :one_line_content record, the :titled
 *  precedent). Set-scoped registrars
 *  (Right::Head card-mod-layout-0.20.0 set/right/head.rb:12-14, Type::
 *  Image card-mod-carrierwave set/type/image.rb:18-20, Self::Signin,
 *  Rule::BarView set/rule/bar_view.rb, ...) outrank this arm through
 *  their own more-specific sets exactly as in Ruby.
 *
 *  ORACLE-PINNED: the "Oracle One
 *  Line Plain Probe" arm of fixtures/captured/layout-one-line.json — a
 *  plain RichText card rendered on the live decko 0.20.0 oracle app —
 *  captured `<div class="text-muted">plain probe body</div>` (16-char
 *  content: strip_tags no-op, truncate no-op, the wrap div). The
 *  layout fixture review gem-proved those bytes derive
 *  exactly from this arm; the standing pin is
 *  card-mod-format.test.ts's layout-one-line plain-probe test.
 *  EXPORTED for the carrierwave mod's polymorphic device guard
 *  (imageOneLineContentView): a non-image card reaching
 *  All::ZzCarrierwavePolymorphic's :one_line_content must answer the
 *  All-set html arm (the Ruby chain walk for a non-Image card), never
 *  the Type::Image icon render — one definition, no drift. */
export const allHtmlViewsOneLineContentView: ViewFn = ({ fmt, voo }) => {
  const sizeOpt = voo.opts["size"];
  const length = typeof sizeOpt === "number" ? sizeOpt : ONE_LINE_CHARACTER_LIMIT;
  return `<div class="text-muted">${truncate(stripTags(fmt.renderView("core")), length, "...")}</div>`;
};

/** set/all/demo.rb:8-12 view :view_list:
 *  `view_list.map { |v| wrap_with :p, [content_tag(:h3, v), render(v,
 *  show: :menu)] end.flatten.join` - content_tag(:h3, v) is `<h3>v</h3>`,
 *  wrap_with :p joins the pair with output's "\\n" (content.rb:70-73
 *  `Array.wrap(content).flatten.compact.join "\\n"`), and flatten.join
 *  joins the seven <p> blocks with NO separator. view_list (:14-16) is the
 *  fixed list [content, titled, labeled, bar, box, open, closed].
 *  DISCLOSED DIVERGENCE: Ruby passes show: :menu, which viz-es the menu
 *  visible inside the rendered arms (the captured slot JSON carries
 *  show:["view_list","menu","content"] and the menu renders); the
 *  engine's renderView has no show-option seam, so the arms render with
 *  their default visibility (the menu hidden - optional: :hide). */
const viewListView: ViewFn = ({ fmt }) => {
  const views = ["content", "titled", "labeled", "bar", "box", "open", "closed"];
  const parts: string[] = [];
  for (const v of views) {
    parts.push(`<p><h3>${v}</h3>\n${fmt.renderView(v)}</p>`);
  }
  return parts.join("");
};

// ---------------------------------------------------------------------------
// set/all/demo.rb:2-7 view :demo (the mod-porting the first porting wave, 2026-10-03)
// ---------------------------------------------------------------------------

// The :demo body lives in render/demo-view.ts so the flat view registry
// (the loader-less graded page surface: Shark's `{{:getting_started|demo}}`)
// and this set/all registration share one definition.
export { demoViewSelect } from "../../render/demo-view.js";
import { demoView } from "../../render/demo-view.js";

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
// type/mod.rb set/type/mod: :bar_right (the second admin-views port)
// ---------------------------------------------------------------------------

/** set/type/mod.rb (card-mod-format-0.20.0) view :bar_right:
 *  `%w[settings configurations tasks cardtypes scripts styles].filter
 *  { |name| card.send("#{name}?") }.join ", "` — the mod card's bar-right
 *  slot lists the mod's PRESENT admin sections. This is the module Ruby
 *  dispatches for a Mod card (card-mod-format loads after core and reopens
 *  Type::Mod). The section predicates and their order are the oracle-pinned
 *  ones every served mod page carries (core-admin-runtime.ts
 *  modBarRightSections, measured over all 30 mod cards): one body, so the
 *  chain and the base table cannot answer differently. */
const typeModBarRightView: ViewFn = (ctx) =>
  modBarRightSections((ctx.fmt.card.record.codename ?? "").replace(/^mod_/, ""));

// ---------------------------------------------------------------------------
// set/type/toggle.rb html block — :input + :labeled_editor raise parity
// ---------------------------------------------------------------------------

/**
 * The card-mod-format set/type/toggle.rb html block views :input and
 * :labeled_editor carry Ruby's ArgumentError parity raise:
 *
 *   view :input do
 *     toggle              # toggle.rb:23-25 -> check_box :content
 *   end
 *
 *   view :labeled_editor do
 *     toggle + toggle_label   # toggle + toggle.rb:27-29 -> label :content, tag
 *   end
 *
 * The actionview-7.2.3.2 FormHelper#check_box(object_name, method,
 * options = {}, checked_value = "1", unchecked_value = "0") signature
 * (form_helper.rb:1345) takes 2-5 args; `check_box :content` is one
 * arg. With nothing else wired in the call resolves through
 * MethodDelegation#method_missing -> delegate_to_action_view
 * (card-1.110.0 lib/card/format/method_delegation.rb:38-46), which
 * forwards verbatim to action_view.send :check_box, :content. actionview
 * raises ArgumentError "wrong number of arguments (given 1, expected
 * 2..5)". VERIFIED LIVE against the oracle app (the :input and
 * :labeled_editor raises).
 *
 * :labeled_editor is `toggle + toggle_label`. `toggle` raises first
 * (leftmost operand in the `+` chain); `toggle_label` would emit
 * `<label for="content_X">X</label>`-shape bytes (live-probed), but
 * the view as written never reaches that half. Same raise shape as
 * :input.
 *
 * The previous pass left these unported for that exact reason —
 * "port the views such that they raise the equivalent error the way
 * Ruby does" IS Ruby parity; the engine rendering something here
 * would be the divergence. Same precedent as card-mod-tabs
 * `:tabs_static` / `:pills_static` (NoMethodError on `args`;
 * card-mod-tabs.ts:518-525) and the json :follow_status defect class
 * on the follow section. The parity message names the Ruby source so
 * a future port that substitutes "real bytes" is forced to either
 * match Ruby's RAISE or update the test with the new shape — pin,
 * don't guess.
 */
function toggleInputParityRaise(view: "input" | "labeled_editor"): never {
  throw new Error(
    `${view}: ArgumentError parity - check_box :content (card-mod-format-0.20.0 ` +
      `set/type/toggle.rb:24 calls check_box :content; actionview-7.2.3.2 ` +
      `FormHelper#check_box(object_name, method, ...) takes 2-5 args, so ` +
      `Ruby raises ArgumentError "wrong number of arguments (given 1, ` +
      `expected 2..5)" on every render; live-verified against the oracle app)`,
  );
}

/** set/type/toggle.rb:15-17 view :input -> toggle (check_box :content). */
const toggleInputView: ViewFn = () => toggleInputParityRaise("input");

/** set/type/toggle.rb:19-21 view :labeled_editor -> toggle + toggle_label. */
const toggleLabeledEditorView: ViewFn = () =>
  toggleInputParityRaise("labeled_editor");

// ---------------------------------------------------------------------------
// the head view family (set/all/head.rb) — the async-view seam
// ---------------------------------------------------------------------------

/**
 * Read the head read-set SYNCHRONOUSLY, out of the render-card map.
 *
 * The mechanism: `ViewFn` is synchronous (render/format.ts:291) and its
 * dispatcher returns `string`, but every head view needs an engine read
 * (`Card::Rule.global_setting(:title)`, `nest :favicon`,
 * `main_stylesheet_path` -> `asset_output_url`). The seam is a
 * prepare-phase PREFETCH — RenderEngine#preloadHeadViewReads
 * (src/card/render.ts) batch-loads exactly these cards into renderCards
 * — and this read is the already-public synchronous
 * `RenderEngineLike#fetchRenderCard` (format.ts:1371) doing a Map lookup.
 * No await, no async view class, no dispatcher change.
 *
 * Design: the view body stays synchronous — one Map lookup, no async
 * view class (the rejected async-class alternative would have awaited
 * a dispatcher change for an already-public synchronous read).
 *
 * The byte builders are imported from render/head-views.ts — the SAME
 * functions the page path calls (render/page.ts headContent). That is
 * the anti-drift property: the page's captured head bytes and these
 * views cannot diverge, because there is one implementation.
 *
 * Names are absolute (`*title`, not the `:title` mark global_setting
 * uses): same card, no dependency on the codename codehash being
 * folded. `Card::Rule.global_setting` is `Card[:name]` (rule/all.rb:5-9)
 * and `Card[:title]` IS the `*title` setting card.
 */
function headReadSetFromMap(ctx: ViewContext): HeadReadSet {
  const engine = ctx.fmt.engine;
  return {
    titleSetting: engine.fetchRenderCard("*title")?.dbContent,
    faviconSource: engine.fetchRenderCard("*favicon")?.dbContent,
    styleAssetOutput: engine.fetchRenderCard("*all+*style+*asset output")?.dbContent,
  };
}

/** set/all/head.rb:19-23 view :page_title (the base format block):
 *  `title_parts = [Card::Rule.global_setting(:title)];`
 *  `title_parts.unshift safe_name if card.name.present?;`
 *  `title_parts.join " - "`. safe_name is the rendering card's own name
 *  (context_names.rb safe_name) — here `fmt.card.name.s`, the same
 *  string the page path passes as `record.name.s`. */
const pageTitleView: ViewFn = (ctx) => pageTitleBytes(headReadSetFromMap(ctx), ctx.fmt.card.name.s);

/** set/all/head.rb:33-35 view :page_title_tag:
 *  `content_tag(:title) { render :page_title }` — Rails' content_tag
 *  with no attributes is `<title>...</title>` around the ESCAPED
 *  :page_title body. */
const pageTitleTagView: ViewFn = (ctx) =>
  pageTitleTagBytes(headReadSetFromMap(ctx), ctx.fmt.card.name.s);

/** set/all/head.rb:37-39 view :favicon_tag:
 *  `nest :favicon, view: :link_tag` — the favicon card's attachment URL
 *  at the :small carrierwave variant. A deck with no favicon renders ""
 *  (Ruby's nest miss is the same empty slot). */
const faviconTagView: ViewFn = (ctx) => faviconTagBytes(headReadSetFromMap(ctx));

/** set/all/head.rb:61-63 view :stylesheet_tags:
 *  `[nest(:style_mods, view: :remote_style_tags), main_stylesheet_tag]`,
 *  cache: :never (head.rb:60). :head's join flattens the array, so the
 *  two tags are newline-joined here. */
const stylesheetTagsView: ViewFn = (ctx) => stylesheetTagsBytes(headReadSetFromMap(ctx));

/** set/all/head.rb:29-31 view :head:
 *  `basket[:head_views].map { |viewname| render viewname }.flatten.compact.join "\n"`.
 *
 * HEAD_VIEWS is the same declared list the page path renders
 * (head-views.ts), so the two agree on ORDER by construction.
 *
 * GUARDED MEMBERSHIP, disclosed: `render` of a view that is not
 * registered on this engine raises UnsupportedViewError
 * (format.ts:527), and three of the nine names are not ported on this
 * branch — :meta_tags (a Haml template, ported with its
 * card-mod-format-head-header-views.test.ts on the branch that carries it),
 * :universal_edit_button and :rss_links, and
 * :javascript_tags / :script_variables / :script_calls
 * (card-mod-script). A member that cannot render contributes nothing
 * rather than unwinding the whole head. This is the same guarded
 * delegation shape the box_bottom port uses for its unported
 * history-board members, and the head is the one place it is safe:
 * the captured pages' bytes for :universal_edit_button and :rss_links
 * ARE the empty string, so a skip is byte-identical there.
 *
 * Consequence to know: on this branch :head omits the :meta_tags
 * constant that the page path emits. When the first mod batch lands, :head picks
 * it up with no change here. The parity test asserts shape + the two
 * data-bearing members, NOT a whole-head literal, for exactly this
 * reason.
 */
const headView: ViewFn = ({ fmt }) => {
  const parts: string[] = [];
  for (const viewName of HEAD_VIEWS) {
    let bytes: string;
    try {
      bytes = fmt.renderView(viewName);
    } catch (error) {
      // NOT REGISTERED (no line at all). Distinct from a registered view
      // that renders blank: Ruby's map/compact/join never had a
      // "member does not exist" state, and skipping keeps the remaining
      // members' lines in place rather than shifting the head.
      if (error instanceof UnsupportedViewError) continue;
      throw error;
    }
    // Ruby's `.compact` drops NIL, not "". A registered member that
    // renders the empty string stays in the array and contributes an
    // EMPTY LINE — Array#join does not skip empties, and that blank is
    // exactly what the captured pages carry for universal_edit_button
    // and rss_links. So this pushes unconditionally.
    parts.push(bytes);
  }
  return parts.join("\n");
};

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
    // alias is to labeled, both pre-registered). :link/:nav_link
    // register the IMPORTED render/views.ts fns (same fns the flat
    // HTML_VIEWS table points at; the link-registration drift fix
    // 2026-10-01 - see their docblock above).
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
          // :one_line_content NOT registered here (base.rb:97-99): the
          // all-set load order (base.rb < content.rb < html/views.rb)
          // shadows it in Ruby's html format on every render — the
          // dispatched view is all/html/views' wrap arm, registered in
          // its own set module below (allHtmlViewsOneLineContentView).
          // Same later-module-wins shape as :titled above.
          // set/all/base.rb:101-103 `view :labeled_content, unknown:
          // :mini_unknown` and :105-107 `view :titled_content, unknown:
          // :blank` — the `unknown:` setting travels WITH the view
          // declaration, so it belongs in this registration's config. These
          // two rows were registered with no config, and a loader-bound
          // engine reads `setting :unknown` through the per-card chain walk
          // (format.ts viewForUnknown -> loader.viewUnknownSettingForCard),
          // where a set module that declared the view WITHOUT the setting
          // does not answer: the walk fell through to the compiled
          // all-set table with allSetOnly=true, dropped these two rows, and
          // the substitution never happened. An absent Cardtype's
          // `{{+description|lead}}` nest rendered the real description view
          // (or "") where Ruby renders its `:unknown` create-link span.
          { view: "labeled_content", viewFn: labeledContentView, config: { unknown: "mini_unknown" } },
          { view: "titled_content", viewFn: titledContentView, config: { unknown: "blank" } },
          { view: "blank", viewFn: blankView, config: { perms: "none" } },
          // NOT registered: :titled. Ruby's All::Base body (base.rb:120-122)
          // is the BARE "name + blank line + core" — but that body never
          // reaches the wire unwrapped: every top-level render! runs
          // with_wrapper (format/render.rb:96-97), and the ajax save
          // response's captured slot carries the standard slot wrap
          // (edit-session capture step-04: 1,867B
          // `card-slot titled-view` div, data-slot {"view":"titled"}).
          // The engine's registered :titled (views.ts titledView) is that
          // wrapped shape; the former bare re-registration shadowed it
          // through the chain once the mod deck was bound at a serving
          // surface, stripping the wrapper from every XHR save response
          // (the session2-gap-8 wiring exposed it).
          // registered :labeled below keeps its own entry.
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
    // headlessly-renderable base-block views (:label, :closed_content
    // - both of which emit bytes without rails, haml, or popover_link)
    // and :hidden_content_field (the resolved
    // hiddenContentFieldView - the Ruby body's bytes are constant and
    // captured live from actionview-7.2.3.2; see the view body comment)
    // AND :smart_label (the follow read path: the popover anchor rides
    // card-mod-bootstrap's popoverLink export, byte-pinned by the live
    // oracle capture fixtures/captured/help-popover.json + this pass's
    // smart-label capture; the +description card is warmed per render
    // by the render.ts smart_label prepare gate).
    setPath: "all/content",
    formats: {
      html: {
        views: [
          { view: "label", viewFn: labelView, config: { perms: "none" } },
          // :closed_content is an alias to :one_line_content in
          // Ruby (content.rb:16) that CAPTURES All::Content's
          // one_line_content block at definition time
          // (view_definition.rb:53-63) - the bare helper shape, NOT
          // the html wrap arm the :one_line_content view dispatches
          // to. The mod loader's flat table has no alias mechanism,
          // so the port registers closed_content as a separate view
          // with that bare body (oneLineContentBody).
          { view: "closed_content", viewFn: closedContentView, config: { perms: "none" } },
          // :raw_one_line_content NOT registered here (content.rb:18-20):
          // the all-set load order (base.rb < content.rb < html/views.rb)
          // shadows it in Ruby's html format on every render — the
          // dispatched view is all/html/views' wrap arm, registered in
          // its own set module below (allHtmlViewsRawOneLineContentView).
          // Same later-module-wins shape as the :one_line_content
          // All::Base withholding and the :titled precedent.
          { view: "hidden_content_field", viewFn: hiddenContentFieldView, config: { unknown: true, cache: "never" } },
          { view: "smart_label", viewFn: smartLabelView, config: { cache: "never", unknown: true } },
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
    // + helpers). Ported :view_list (viewListView - the seven demo views
    // composed through the engine's own view dispatch) and :demo
    // (demoView - the mod-porting the first porting wave 2026-10-03: the frame
    // composition + view_select's cardFormShell/select bytes +
    // allAdminConfigCodenamesOfCategory through the core-mod admin
    // runtime; gem-source-derived rendered-unpinned - the oracle replays
    // the composition).
    setPath: "all/demo",
    formats: {
      html: {
        views: [
          { view: "view_list", viewFn: viewListView },
          { view: "demo", viewFn: demoView },
        ],
      },
    },
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
          // set/all/html/error.rb:10-12 REOPENS this module's html format
          // block and overrides `view :unknown` with the createable link;
          // the BASE block's body (error.rb:6-8) is the bare "". The html
          // block is the one that reaches the wire, so that is the body
          // registered here - without it the per-card chain walk answered
          // the bare "" and every unknown-card substitution rendered
          // nothing where Ruby renders its create-link span. The body is
          // HTML_VIEWS["unknown"], the flat table's own identical
          // html/error.rb:10-12 body, so the two surfaces cannot drift.
          { view: "unknown", viewFn: HTML_VIEWS["unknown"]!, config: { perms: "none", cache: "never" } },
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
    // set/all/html/error.rb:2 view :server_error (the haml "Wild Card!"
    // block a production visitor sees; perms :none comes from the base
    // block's setting, which the html format inherits) and :4-8
    // :debug_server_error, picked for a server error when the session's
    // *debugger card is on. Ruby's body raises NameError in a stock deck
    // (BetterErrors is never loaded) and would otherwise show internals; the
    // port deliberately renders :server_error in its place, with no modal
    // wrap, so the two give the same bytes (render/debug-server-error.ts).
    //
    // :unknown is ALSO declared in this html block (set/all/html/error.rb
    // :10-12) and OVERRIDES the base block's literal "" (error.rb:6-8). It
    // is registered on the All::Error entry's own html block ABOVE rather
    // than here, because Ruby's set/all/html/error.rb REOPENS All::Error's
    // html format block - it is not a set module of its own - while this
    // port's setPath keys a module by camelizing the path
    // (mod-registrar.ts#setModuleShortname), so a row registered under the
    // path "all/html/error" would land on a separate All::Html::Error
    // module no card's set keys name. The same nested-path limitation is
    // what keeps card-mod-bootstrap's :bar_bottom unregistered, per that
    // function's KNOWN DIVERGENCE note.
    setPath: "all/html/error",
    formats: {
      html: {
        views: [
          { view: "server_error", viewFn: serverErrorHtmlView, config: { perms: "none" } },
          { view: "debug_server_error", viewFn: debugServerErrorView, config: { perms: "none" } },
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
    formats: {
      html: {
        views: [{ view: "type", viewFn: htmlTypeView, config: { unknown: true } }],
      },
    },
  },
  {
    // set/all/html/frame.rb:1-51 html format block (view :flash + the
    // frame/standard_frame/with_frame/panel helpers). Ported :flash
    // (flashView - the headless render's params/Env surfaces are absent,
    // so the Ruby body's guard computes "" on every render). The frame
    // helpers stay unported (the wrap pipeline is the slot machinery
    // views.ts already implements - html/wrap.rb).
    setPath: "all/html/frame",
    formats: {
      html: {
        views: [
          { view: "flash", viewFn: flashView, config: { perms: "none", cache: "never", unknown: true } },
        ],
      },
    },
  },
  {
    // set/all/html/views.rb:1-128 html format block (the before hooks +
    // views :content :short_content :raw_one_line_content :one_line_content
    // :content_with_title :content_panel + short_content helpers).
    // Ported HERE: :short_content (shortContentView - the toggle override
    // + short_content_from_core branches; the items/fields branches are
    // the search-count/structure reads the engine lacks),
    // :one_line_content (allHtmlViewsOneLineContentView - the text-muted
    // wrap arm around the content.rb:47-49 helper, unknown: :mini_unknown;
    // the All::Base shadowed body is withheld, see the All::Base
    // :one_line_content record) and :raw_one_line_content
    // (allHtmlViewsRawOneLineContentView - the sibling text-muted wrap arm
    // around the content.rb:43-45 raw helper, unknown: :mini_unknown;
    // the MRO-shadowed
    // All::Content base view is withheld, see the arm's record).
    // :content_panel and :content_with_title are registered in the
    // engine's shared table (render/views.ts) - their bodies wrap in the
    // slot machinery (wrap.rb slot_attributes + class_ups), and the
    // before hooks (:34, :42-45) ride format.ts runBeforeHook.
    setPath: "all/html/views",
    formats: {
      html: {
        views: [
          { view: "short_content", viewFn: shortContentView },
          { view: "one_line_content", viewFn: allHtmlViewsOneLineContentView, config: { unknown: "mini_unknown" } },
          { view: "raw_one_line_content", viewFn: allHtmlViewsRawOneLineContentView, config: { unknown: "mini_unknown" } },
          { view: "labeled", viewFn: htmlLabeledView, config: { unknown: "labeled", cache: "yes" } },
        ],
      },
    },
  },
  {
    // set/all/js.rb:1-9 js format block (default_item_view, view
    // :source). Not ported: format-specific.
    setPath: "all/js",
  },
  {
    // set/all/head.rb:1-70 — the head file: basket[:head_views]
    // (:page_title_tag :meta_tags :favicon_tag :stylesheet_tags
    // :universal_edit_button :rss_links) at :1-4, basket[:cache_seed_
    // names] at :5-13, noindex? at :15-17, the base-format :page_title
    // at :19-23, and the html block (:head, :meta_tags, :page_title_tag,
    // :favicon_tag, :universal_edit_button, :rss_links, :stylesheet_tags
    // + main_stylesheet_tag/main_stylesheet_path/param_or_rule_card/
    // rss_link?).
    //
    // Ported FIVE of the seven views, all of them the ones whose bodies
    // need an engine read:
    //   :page_title (:19-23, base format — perms :none, unknown: true)
    //   :page_title_tag (:33-35)
    //   :favicon_tag (:37-39)
    //   :stylesheet_tags (:61-63, cache: :never)
    //   :head (:29-31)
    // Each reads through the prepare-phase prefetch seam
    // (RenderEngine#preloadHeadViewReads) and the shared byte builders
    // in src/card/render/head-views.ts, which the PAGE path also calls —
    // so the captured head bytes and these views cannot drift apart.
    // Design: these views are synchronous — the byte builders read the
    // prepare-phase warm maps directly (the async-view-class alternative
    // was rejected).
    //
    // NOT ported here (two-word reasons):
    //   :meta_tags — Haml template (meta_tags.haml); ported alongside the
    //     head/header views (card-mod-format-head-header-views.test.ts).
    //   :universal_edit_button, :rss_links — both need path(view: :edit)
    //     / the rss_link? config + an rss_link_tag view; the first mod batch.
    // :head skips an unregistered member rather than raising (see
    // headView's comment); the page path's bytes for the two skipped
    // blank members are "" anyway.
    setPath: "all/head",
    formats: {
      html: {
        views: [
          { view: "head", viewFn: headView, config: { perms: "none", cache: "always" } },
          { view: "favicon_tag", viewFn: faviconTagView, config: { perms: "none" } },
          { view: "page_title_tag", viewFn: pageTitleTagView, config: { perms: "none" } },
          { view: "stylesheet_tags", viewFn: stylesheetTagsView, config: { perms: "none" } },
          // :page_title is declared in the file's BASE format block
          // (head.rb:19-23, the bare `format do`), not the html one.
          // The mod loader has no base-format key — its viewChain doc
          // (src/card/mod-loader.ts:425-429) states the base format
          // record inherits the html chain — so it is registered in the
          // html block, which is what the engine dispatches. Its
          // perms: :none + unknown: true are carried in the config.
          {
            view: "page_title",
            viewFn: pageTitleView,
            config: { perms: "none", unknown: true },
          },
        ],
      },
    },
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
    // :text_without_nests) + text format block (view :core). :text_
    // without_nests IS PORTED views-side (render/views.ts - the nest scan
    // + the shared link expander + the to_text decode). Not ported: the
    // text-format block (no text dispatch in the engine).
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
    // :home_url IS PORTED views-side (render/views.ts, the home_path
    // card-key gate + the documented no-host divergence). :home_path
    // stays views-side too (the flat entry with the same gate).
    setPath: "self/home",
  },
  // pattern: type (10 set/type/*.rb files; the unported-types audit
  // 2026-10-01 census: registrations for cardtype/mod/toggle/uri +
  // toggle/html one_line_content — the engine has no per-type render
  // dispatch of its own beyond the coreView type branches named below)
  {
    // set/type/basic.rb:1-3 — the whole file is `def pod_type; nil; end`.
    // NO views, NO format blocks: a Basic/RichText-typed card's renders all
    // come from the All::* sets (all/base, all/content, all/html/views).
    // Nothing renderable to port (2026-10-01;
    // the corpus's 28,415 RichText cards all dispatch through All::*).
    setPath: "type/basic",
  },
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
          { view: "type", viewFn: htmlTypeView, config: { unknown: true } },
          { view: "add_link", viewFn: cardtypeAddLinkView },
          { view: "add_button", viewFn: cardtypeAddButtonView },
          { view: "add_url", viewFn: cardtypeAddUrlView },
          { view: "configure_button", viewFn: cardtypeConfigureButtonView },
          // cardtype.rb:53-55 configure_link - the helper the configure_
          // button body calls, ported as the view it declares. The perms
          // predicate (can_configure?) rides view-perms.ts's
          // VIEW_PERMS_DIRECTIVES (the configure_button pattern).
          { view: "configure_link", viewFn: cardtypeConfigureLinkView, config: { cache: "never" } },
        ],
      },
    },
  },
  {
    // set/type/html.rb:1-27 base block (clean_html?/diff_args + view
    // :one_line_content override + chunk_list) + html block (input_type +
    // view :one_line_content, wrap: {}). Ported (the unported-types audit
    // 2026-10-01): :one_line_content (typeHtmlOneLineContentView above —
    // the raw_one_line_content composition, capture-proven on the
    // Right::Head sibling). NOTE: card-mod-layout ALSO carries a type/html
    // setModules entry registering :core (layoutCoreView answering the
    // BASE core — html.rb defines no :core); same-shortname/different-view
    // registrations coexist in the chain table (mod-registrar.ts
    // SetModuleViewTable.register). Not ported: input_type (:ace_editor,
    // form-input method — the phrase/number/plain_text convention),
    // clean_html?/diff_args/chunk_list (card-methods, no manifest seam).
    setPath: "type/html",
    formats: {
      html: {
        views: [
          { view: "one_line_content", viewFn: typeHtmlOneLineContentView, config: {} },
        ],
      },
    },
  },
  {
    // set/type/json.rb:1-41 event :validate_json + check_json_syntax/
    // parse_content/item_names/item_values/item_value + html block
    // (view :core + input_type/ace_mode). CORRECTED (unported-types-audit
    // pass 2026-10-01; the prior "Not ported: rails (CodeRay...)" note was
    // stale): view :core IS PORTED views-side — the engine's coreView
    // langForTypeCode branch renders highlight(raw, "json") wrapped in the
    // CodeRay DIV template (render/views.ts:1192-1209 +
    // render/code-highlighting/, byte-pinned by
    // fixtures/captured/coderay/json-tinymce-corpus-53.html — corpus card
    // 53 *TinyMCE). Event :validate_json IS ported (json.rb:3-11; the
    // json 3.0.2 parser messages, format-validations.ts). Not ported: the
    // parse_content/item_* helpers + input_type/ace_mode (form-input
    // machinery).
    setPath: "type/json",
    events: [
      {
        event: "validate_json",
        at: "validate",
        on: ["save"],
        changed: ["content"],
        fn: (card) => {
          const message = jsonValidationMessage(card.dbContent ?? "");
          if (message !== null) throw new CardActionError("user-error", message, message);
        },
      },
    ],
  },
  {
    // set/type/mod.rb:1-16 html format block (view :admin, :bar_right +
    // before_bar helper). Ported: :admin -> render_core (a simple
    // delegation the engine implements as fmt.renderView("core")).
    // :bar_right — the prior "no admin-config
    // surface" blocker moved: ADMIN_CONFIG + CORE_TASK_BASKET landed with
    // the admin sections, so the predicate list is a mirror read. The
    // registration is CHAIN-SCOPED (kind nonbase: the view lands only in
    // the per-set-module table, dispatchable by Mod-typed cards through
    // resolveView's chain walk) — the flat-masking hazard the original
    // note described does not exist for nonbase registrations
    // (mod-loader.ts:282-296 registers only all/abstract kinds flat).
    setPath: "type/mod",
    formats: {
      html: {
        views: [
          { view: "admin", viewFn: adminView },
          { view: "bar_right", viewFn: typeModBarRightView },
        ],
      },
    },
  },
  {
    // set/type/number.rb:1-10 html block (input_type) + event
    // :validate_number (number.rb:7-9, ported: String#number? is Kernel#
    // Float acceptance, format-validations.ts). Not ported: input_type.
    setPath: "type/number",
    events: [
      {
        event: "validate_number",
        at: "validate",
        on: ["save"],
        fn: (card) => {
          const message = numberValidationMessage(card.dbContent ?? "");
          if (message !== null) throw new CardActionError("user-error", message, message);
        },
      },
    ],
  },
  {
    // set/type/phrase.rb:1-6 html block (input_type). Not ported:
    // rails.
    setPath: "type/phrase",
  },
  {
    // set/type/plain_text.rb:1-10 html block (input_type, view :core).
    // CORRECTED (the prior "Not
    // ported: rails (CGI.escapeHTML)" note was stale): view :core IS
    // PORTED views-side — the engine's coreView plain_text branch renders
    // processContent(h(renderRaw)) (render/views.ts:860-869, the
    // CGI.escapeHTML entity set = the shared h(); census pin page 19562,
    // the angieup+source_title content-view bytes). 1,276 PlainText-typed
    // cards in the sha-verified dump copy (6A44DFDC...). Not ported:
    // input_type (:text_area, form-input machinery).
    setPath: "type/plain_text",
  },
  {
    // set/type/toggle.rb:1-38 base block (checked? + view :core) +
    // html block (views :input, :labeled_editor + toggle/toggle_label/
    // one_line_content/short_content).
    //
    // Ported :input and :labeled_editor as ArgumentError parity raises
    // (toggleInputView / toggleLabeledEditorView). The toggle helper
    // (toggle.rb:23-25) calls check_box :content, and actionview-7.2.3.2
    // FormHelper#check_box takes 2-5 args — single-arg call raises
    // ArgumentError on every render. :labeled_editor is `toggle +
    // toggle_label`; toggle raises first. Both views therefore raise
    // Ruby's exact failure shape, not a port-invented bytes shape —
    // same precedent as card-mod-tabs :tabs_static / :pills_static
    // (the NoMethodError on `args`).
    //
    // :core IS PORTED views-side: the engine's coreView toggle branch
    // renders formatToggleCore (render/views.ts:857-859; the "yes"/"no"
    // mapping capture-pinned by recapture-raw:*all+*captcha content/open/
    // closed — the card-mod-toggle Card::Content::Toggle truthy/falsy
    // shape, which supersedes this gem's case/to_i form under mod load
    // order; en.yml:21-22 resolves format_toggle_yes/no to "yes"/"no").
    //
    // :one_line_content is NOT a view of this file: toggle.rb:31-35
    // overrides the one_line_content / short_content METHODS, and the
    // view stays All::Html::Views' (html/views.rb:29-32), whose
    // text-muted wrap of truncate(strip_tags(render_core)) is the same
    // bytes for the "yes"/"no"/"?" core. :short_content
    // is covered views-side (shortContentView's toggle arm). The i18n
    // concern in the old note applied to :core only, and the en locale
    // resolves it to plain "yes"/"no" (config/locales/en.yml:21-22).
    setPath: "type/toggle",
    formats: {
      html: {
        views: [
          { view: "input", viewFn: toggleInputView },
          { view: "labeled_editor", viewFn: toggleLabeledEditorView },
        ],
      },
    },
  },
  {
    // set/type/uri.rb:1-19 base block (views :title_link, :url_link —
    // the URI-type overrides that href the card's RAW content) + html
    // block (view :core = render_title_link + input_type). Ported
    //::title_link,:url_link,:core
    // — the three views above; the overrides dispatch only for URI-typed
    // cards (chain-scoped, TYPE-uri → Type::Uri). Zero corpus usage
    // (sha-verified dump copy 6A44DFDC: the URI cardtype card exists,
    // id 22258, but 0 cards carry type_id 22258) and zero captured
    // bytes — pins are gem-derived (the fixture-less convention).
    // input_type (uri.rb:16-18) not ported: form-input method, no form
    // surface (same as phrase/number/plain_text).
    setPath: "type/uri",
    formats: {
      html: {
        views: [
          { view: "title_link", viewFn: uriTitleLinkView, config: {} },
          { view: "url_link", viewFn: uriUrlLinkView, config: {} },
          { view: "core", viewFn: uriCoreView, config: {} },
        ],
      },
    },
  },
];

const cardModFormat: DeckoModManifest = {
  name: "format",
  gemName: "card-mod-format",
  group: "gem-card",
  setModules,
};

export default cardModFormat;