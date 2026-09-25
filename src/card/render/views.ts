// The html-format view registry: TypeScript ports of the view definitions the
// captured fixtures exercise (:open, :closed, :content, :title and the
// internal views they delegate to). Every view cites its Ruby source; the
// byte shapes (attribute order, quoting, whitespace) are pinned by
// fixtures/captured/smoke.json - HAML templates emit sorted single-quoted
// attributes, Rails helpers emit insertion-order double-quoted attributes,
// and the fixtures record which is which.
//
// View sources:
// - :open / :closed   card-mod-bar_and_box-0.20.0 set/all/bar.rb
//                     (build_accordion_bar, prepare_bar, bar_bottom, card_stub)
// - accordion markup  card-mod-bootstrap-0.20.0 set/all/bootstrap/accordion.rb
//                     + accordion_item.haml
// - bar body markup   card-mod-bar_and_box set/all/bar_body.haml
// - :content          card-mod-format-0.20.0 set/all/html/views.rb
//                     (before(:content) -> prepare_content_slot; menu and
//                     edit button render optional: :hide)
// - :title            card-mod-format set/all/title.rb + html block
//                     (wrapped_title, wrapped_joint - note Ruby's
//                     wrap_with :span, joint, classy("joint") loses the
//                     class to content_tag's block content: the joint span
//                     renders BARE, faithfully reproduced)
// - :titled           card-mod-format set/all/html/views.rb (+ header.rb
//                     default_header: main? ? :h1 : :h2 - the one-level-down
//                     heading shift)
// - :menu             card-mod-format set/all/html/menu.rb (help popover via
//                     bootstrap helper.rb#popover_opts, edit_link, board_link)
//                     + help-popover.ts (the help-rule resolution the
//                     data-bs-content value needs)
// - :core/:card_list  card-mod-search-0.20.0 set/abstract/search_views.rb
//                     (search_result_view -> :card_list) + 0_search/views.rb
//                     (html card_list item wrapping) + card-mod-collection
//                     set/all/item.rb#nest_item (item options: size + view)
// - :bar (items)      card-mod-bar_and_box set/all/bar.rb#view(:bar) + bar.haml
//                     + bar_menu.haml

import { DeckoName } from "../name.js";
import { emitAttrs, emitHamlAttrs, h, newSlotId, slotOptionsJson } from "./slot-html.js";
import type { RenderCard, RenderFormat, ViewContext, ViewFn } from "./format.js";
import {
  isPointerOrListCard,
  pointerListCoreHtml,
  pointerListItemSlot,
  pointerListItemBodyForUnknown,
  rawItemStrings,
  phantomPointerListItem,
} from "./pointer-list.js";
import { readMiniBarCols, readBarCols } from "./bar-cols.js";
import { ruleBarRightHtml } from "./rule-bar-right.js";
import { highlight, langForTypeCode } from "./code-highlighting/index.js";
import { dateError } from "./errors.js";

// ---------------------------------------------------------------------------
// shared emitters
// ---------------------------------------------------------------------------

/** wrap.rb#slot_id. */
function slotId(card: RenderCard, view: string): string {
  return `${card.name.safeKey}-${view}-view`;
}

/** wrap.rb#wrap_classes + slot_attributes: id, class, data (insertion order
 *  - Rails content_tag). `extraClass` carries slot_attr class additions
 *  (the content view's d0-card-content class_up lands via classy extras
 *  instead - see the content view). */
function slotWrap(ctx: ViewContext, view: string, inner: string): string {
  const { fmt, voo } = ctx;
  const card = fmt.card;
  const classes = voo.classy(["card-slot", `${view}-view`, card.setKeys]);
  const attrs = emitAttrs({
    id: slotId(card, view),
    class: classes,
    "data-card-id": card.id === undefined ? undefined : String(card.id),
    "data-card-name": h(card.name.s),
    "data-card-type-id": card.typeId === undefined ? undefined : String(card.typeId),
    "data-card-type-name": card.typeName,
    "data-card-link-name": fmt.urlKey(),
    "data-slot-id": newSlotId(),
    "data-slot": slotOptionsJson(voo.slotOptions()),
  });
  return `<div${attrs}>${inner}</div>`;
}

/** title.rb html block: show_view?(:title_link, :hide) is hide by default
 *  (nothing viz's :title_link) -> render_title_no_link -> wrapped_title
 *  (standard_title). The joint span renders bare - see the module doc. */
const titleView: ViewFn = ({ fmt }) => {
  const escaped = fmt.standardTitle(); // title_in_context: h(name)
  const parts = escaped.split("+").join("<span>+</span>"); // wrapped_title parts.join wrapped_joint
  return `<span class="card-title" title="${escaped}">${parts}</span>`;
};

// ---------------------------------------------------------------------------
// the card menu (menu.rb) - help popover + edit link + board link
// ---------------------------------------------------------------------------

function icon(name: string): string {
  return `<i class="notranslate material-icons">${name}</i>`;
}

function linkToCard(href: string, text: string, attrs: Record<string, string | number | undefined>): string {
  return `<a${emitAttrs(attrs)}>${text}</a>`;
}

/** menu.rb#name_parts_links + #help_title:
 *  "#{name_parts_links} (#{render_type}) #{full_page_link unless card.simple?}". */
function helpTitle(ctx: ViewContext): string {
  const { fmt } = ctx;
  const parts = fmt.card.name.parts
    .map((part) => `<a class="known-card" href="/${h(DeckoName.parse(part).urlKey)}">${h(part)}</a>`)
    .join("+");
  const type = fmt.card.typeName ?? "";
  const typeLink = `<a class="cardtype known-card" href="/${h(DeckoName.parse(type).urlKey)}">${h(type)}</a>`;
  let title = `${parts} (${typeLink}) `;
  if (!fmt.card.name.isSimple) {
    title += `<a class="full-page-link known-card" href="/${h(fmt.urlKey())}">${icon("open_in_full")} </a>`;
  }
  return title;
}

/** menu.rb view :menu (denial/unknown branches deferred - known cards only
 *  in the captured deck). menu_link_classes: "nodblclick" + " _show-on-hover"
 *  (show_view?(:hover_link) default show).
 *
 *  The data-bs-content value comes from the format's helpRules resolver
 *  (help-popover.ts - the full help.rb/popover_opts chain); without an
 *  installed resolver (and for Ruby-blank help text) it is the "&nbsp;"
 *  placeholder helper.rb:48 substitutes - escaped to &amp;nbsp; by the
 *  attribute emitter, the byte shape the corpus pins for help-less cards. */
const menuView: ViewFn = (ctx) => {
  const { fmt, voo } = ctx;
  const url = fmt.urlKey();
  const rawHelp = fmt.menuHelpContentBytes();
  const helpContent = /^\s*$/.test(rawHelp) ? "&nbsp;" : rawHelp;
  const help =
    `<a tabindex="0" data-bs-toggle="popover" data-bs-trigger="hover focus" data-bs-content="${h(helpContent)}"` +
    ` data-bs-placement="left" class="help-link ps-1 _popover_link _card-menu-popover"` +
    ` data-bs-title="${h(helpTitle(ctx))}" href="#">${icon("help")}</a>`;
  const edit =
    `<a rel="nofollow" class="edit-link slotter" title="Edit" data-bs-toggle="tooltip" data-bs-placement="bottom"` +
    ` data-slotter-mode="modal" data-modal-class="modal-lg" href="/${h(url)}/edit" data-remote="true">${icon("edit")} </a>`;
  const board =
    `<a rel="nofollow" class="board-link slotter" title="Advanced" data-bs-toggle="tooltip" data-bs-placement="bottom"` +
    ` href="/${h(url)}/board" data-remote="true">${icon("space_dashboard")} </a>`;
  const menuClasses = `card-menu nodblclick${voo.show("hover_link") ? " _show-on-hover" : ""}`;
  return `<div class="${menuClasses}">${help}\n${edit}\n${board}</div>`;
};

// ---------------------------------------------------------------------------
// :content (html/views.rb)
// ---------------------------------------------------------------------------

const contentView: ViewFn = ({ fmt }) => {
  // wrap do [render_menu(optional: :hide), render_core, render_edit_button(...)] end
  // both optionals are :hide in the captured context -> the body is render_core
  // (which dispatches to the search card_list for Search-type cards).
  return slotWrapCommon(fmt, "content", fmt.renderView("core"));
};

function slotWrapCommon(fmt: ViewContext["fmt"], view: string, inner: string): string {
  const voo = fmt.voo;
  if (voo === undefined) throw new Error("slotWrapCommon outside a render");
  return slotWrap({ fmt, voo }, view, inner);
}

// ---------------------------------------------------------------------------
// :core (base.rb + search_views.rb) and the search :card_list
// ---------------------------------------------------------------------------

const coreView: ViewFn = (ctx) => {
  const { fmt } = ctx;
  // Toggle-type core view (card-mod-toggle set/type/toggle.rb: `view :core`
  //   -> the content rendered as "yes" (truthy) or "no" (falsey); the raw
  //   db_content is one of "1", "0", "", "true", "false". Ruby renders the
  //   localized string in both the bar-right :one_line_content and the
  //   accordion body of a rule card's open view; this branch makes the
  //   port's `core` view match. Pinned by
  //   recapture-raw:*all+*captcha:render:content / open / closed and
  //   recapture-raw:*captcha+*right+*default:render:content
  //   (cluster 4 -- boolean-yes-vs-integer-1).
  if (fmt.card.typeCode === "toggle" || fmt.card.typeName === "Toggle") {
    return formatToggleCore(fmt.card.dbContent);
  }
  // Match by codename (card-mod-search type card's codehash has codename
  // "search_type"); the corpus search cards have type cards whose CARD
  // NAME is random (id=101 -> type_card name="qnzkqz"), so the original
  // typeName === "Search" gate silently skipped every corpus-shaped
  // entry. The prepare phase keyed on the same wrong axis (render.ts:
  // 1100 was typeName === SEARCH_TYPE_NAME) — fixed in lockstep here.
  // Same pattern format.ts:378 already uses, with the typeName kept as
  // a fallback for fixture decks that name the Search type card "Search".
  if (fmt.card.typeCode === "search_type" || fmt.card.typeName === "Search") {
    // RULE-CARD EXEMPTION (clusters 8 + 10 — runaway-output-recursion and
    // search-query-content-vs-literal). A search-type card that is ALSO a
    // rule (3-part name, right part a setting — "*layout+*right+*content
    // options", "Family+*right+*content options", …) stores its *content
    // options rule as a JSON spec; Ruby renders the JSON literally through
    // the rule's :content view, NOT by executing it as a CQL search.
    // Without this exemption the engine runs the spec as a search:
    // `{"type":"person"}` resolves to every Person-typed card in the
    // deck (Family+*right+*content options:render:open -> 606,393 bytes;
    // :render:content -> 619,284 bytes vs Ruby's 540/3,645), and the
    // no-results branch still emits the engine's `<div class="card-list
    // card-list-bar search-result-list">` wrapper instead of the JSON
    // literal. Same mechanism as the parse-time exemption in render.ts:
    // 606 (resolveView) — the engine already skips the BadQuery raise for
    // rule-shaped search cards; the render dispatch must mirror that.
    if (fmt.engine.cardIsRule?.(fmt.card) ?? false) {
      return fmt.renderRaw();
    }
    // search_views.rb#search_result_view -> :card_list (html)
    return fmt.renderView("card_list");
  }
  if (isPointerOrListCard(fmt.card)) {
    // Abstract::List#standard_pointer_core (card-mod-list
    // set/abstract/01_list/html_views.rb:6-13): the pointer / list
    // cardtype content renders as a card-list pointer-list wrapper
    // with each item rendered as a mini_bar slot whose data-slot
    // records view="bar". The byte shape is pinned by corpus:77
    // and every pointer/list sibling in fixtures/corpus/shard-*.jsonl.
    // The outer wrapper branches on the parent's RULE pattern +
    // permission-setting right (corpus:6551 pin — see pointer-list.ts
    // doc); the per-item slot wrap is built directly with the mini_bar
    // id/class and bar view in the data-slot. See pointer-list.ts
    // header for the captured-oracle shape. */
    const items = rawItemStrings(fmt.card.dbContent).filter((s) => s.length > 0);
    return pointerListCoreHtml(fmt.card, items, (name) => renderPointerListItem(fmt, name));
  }
  if (fmt.card.typeCode === "set") {
    // card-mod-rules-0.20.0 set/type/set/html_views.rb:6-11 view :core:
    //   [content_tag(:h4, t("rules_header"), class: "mt-3"),
    //    filtered_rule_list(:accordion_bar_list)]
    // The Rules section is the set card's content view body (the
    // content view delegates to core, set/type/set.rb + html/views.rb).
    return setRulesCoreHtml(ctx);
  }
  // Match by codename (card-mod-date type card's codehash has codename
  // "date"); see coreView Search-gate comment for the parallel. The
  // corpus date cards (id=1135 "evog+*right+*default", etc.) have type
  // cards whose CARD NAME is "evog" — the typeName === "Date" gate
  // silently skipped them, so this branch never ran and the engine
  // emitted an empty content body instead of the formatDateCore output
  // (or, on the prepare phase's invalid content, the Date::Error raise
  // — but the same fix in render.ts fires the raise earlier, so this
  // branch is only reached for VALID content the prepare phase passed).
  if (fmt.card.typeCode === "date" || fmt.card.typeName === "Date") {
    // card-mod-date-0.20.0 set/type/date.rb:6-8 `view :core do
    //   ::Date.parse(card.content).strftime "%B %-d, %Y"
    // end`. The captured corpus (shard-000000.jsonl) carries ZERO Date
    // cards with valid content — every Date card the corpus sweep found
    // (id=1135, 1138, 1211, 1218, 1222 and the 24 total in shard-000000,
    // 4021 total across all shards) carries random non-date content; the
    // prepare phase (render.ts:866-872) raises Date::Error for those
    // BEFORE this view body runs (the corpus pins :open and :content as
    // CAPTURE_ERROR). The port mirrors that raise in src/card/render/
    // errors.ts#dateError, so the byte surface of the corpus is
    // unchanged by this branch — this branch fires only for content the
    // prepare phase accepted as a valid date (which the corpus does not
    // exercise).
    //
    // The Date core override is the raw strftime result (no
    // process_content wrap: there's no nest-syntax to scan in a
    // formatted date string). Ruby strftime "%B %-d, %Y" maps to:
    //   %B  -> month full name   ("January", "February", ...)
    //   %-d -> day-of-month, no leading zero
    //   %Y  -> 4-digit year
    // JS Date.parse is stricter than Ruby's Date.parse but the ISO 8601
    // and "Month Day, Year" formats both engines accept. For ISO 8601
    // (YYYY-MM-DD) JS parses as midnight UTC, so the day-of-month is
    // extracted via getUTCDate/getUTCFullYear (a local-timezone read
    // would shift a midnight-UTC date one day back in any zone west of
    // UTC).
    return formatDateCore(fmt.card.dbContent);
  }
  // card-mod-format-0.20.0 set/type/image.rb: `view :core do ... end`
  // — the image cardtype's core view wraps the content in an <img>
  // tag when the content is a real image path; for content that is
  // NOT a recognized image source (the corpus-v2 sweep seeds every
  // image card with random non-URL text — 1019 image-type cards, all
  // of them carrying strings like "janmbtckiogaqbhlewfngdc" that
  // fail the image-source check) the Ruby image cardtype renders
  // empty. The captured oracle (corpus:79 content view, corpus:103
  // content view, corpus:79 open view's d0-card-body, and every
  // corpus:1631 image-nested d0-card-body) emits <div attrs></div>
  // with no inner content; without this branch the engine falls
  // through to fmt.processContent(fmt.renderRaw()) which dumps the
  // raw dbContent as visible text inside the slot wrapper — the
  // "name-leak" family recorded at corpus:79:render:content,
  // corpus:79:render:open, corpus:1631:render:content,
  // corpus:1631:render:open (and the 4000+ image-cardtype renders
  // across shards not in the 2000-cap aggregate sample). Match by
  // typeCode (corpus image-type cards have type_card codename
  // "image"); keep typeName === "Image" as a fallback for fixture
  // decks that name the image type card conventionally.
  if (fmt.card.typeCode === "image" || fmt.card.typeName === "Image") {
    return formatImageCore(fmt.card.dbContent);
  }
  // The File cardtype's :core (card-mod-carrierwave set/type/file.rb:24-28
  // view :core + set/type/file/core.haml:1): the content resolves to an
  // attachment source URL and renders as `<a href="SRC">SRC</a>`; content
  // that resolves to NO source (blank, or no recognized storage prefix)
  // renders "" — the content-view wrapper closes EMPTY. The corpus deck's
  // 319 file cards (type card codename "file"; the card itself is usually
  // named gibberish by the anonymizer) carry either empty content or bare
  // random tokens with no storage prefix, so Ruby rendered every one of
  // them as an empty wrapper (corpus:808:render:content/:open,
  // corpus:3737's nested titled/content bodies, and the 226-view
  // card_name_leaked_as_text bucket of the cfcost-r4 failure ledger).
  // Without this branch the engine fell through to the raw-content dump —
  // the same leak family the image branch above closed. Match by typeCode
  // (the corpus file-type card is NAMED "guwg"); typeName kept as the
  // fixture-deck fallback, mirroring the image gate.
  if (fmt.card.typeCode === "file" || fmt.card.typeName === "File") {
    return formatFileCore(fmt.card.dbContent);
  }
  // The CodeRay cardtypes override :core with
  // `process_content CodeRay.scan(_render_raw, LANG).div` (card-mod-format
  // set/type/json.rb:30-32; layout_type/head/css/script analogs). The
  // typeCode dispatch below is that per-cardtype core override, expressed
  // once; unknown codenames fall through to the standard core.
  const codeLang = langForTypeCode(fmt.card.typeCode);
  if (codeLang !== undefined) {
    return fmt.processContent(highlight(fmt.renderRaw(), codeLang));
  }
  return fmt.processContent(fmt.renderRaw());
};

/** card-mod-toggle-0.20.0 set/type/toggle.rb view :core — the content
 *  rendered as the localized truthy/falsy string ("yes" / "no"). The raw
 *  db_content is one of "1", "0", "", "true", "false" (or the booleans
 *  themselves); Ruby's `format toggle.*` calls Card::Content::Toggle
 *  (mod-toggle's content/toggle.rb), which maps truthy -> "yes" and
 *  falsey -> "no". The captured oracle (recapture-raw:*all+*captcha
 *  content/open/closed) pins "yes" verbatim for a *captcha card whose
 *  raw db_content is "1" — the integer-to-display path the cluster 4
 *  map names (boolean-yes-vs-integer-1). */
export function formatToggleCore(content: string | null | undefined): string {
  const normalized = (content ?? "").trim().toLowerCase();
  if (normalized === "0" || normalized === "false" || normalized === "" || normalized === "no") {
    return "no";
  }
  return "yes";
}

/** card-mod-date-0.20.0 set/type/date.rb:7
 *  `::Date.parse(card.content).strftime "%B %-d, %Y"`.
 *  Throws dateError() if the content is not a parseable date — the
 *  prepare phase (render.ts:866-872) raises FIRST for Date-type cards
 *  with invalid content, so this function only runs for content that
 *  passed isValidDateContent. The defensive throw here mirrors the
 *  Ruby shape (`Date::Error: invalid date`) in case the prepare
 *  check is ever bypassed. */
export function formatDateCore(content: string): string {
  const date = new Date(content);
  if (Number.isNaN(date.getTime())) {
    throw dateError();
  }
  // %B = full month name (locale-independent via toLocaleString('en-US'))
  const month = date.toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  // %-d = day-of-month, no leading zero (Ruby); JS getUTCDate returns
  // an integer, so the value is unpadded already.
  const day = date.getUTCDate();
  // %Y = 4-digit year
  const year = date.getUTCFullYear();
  return `${month} ${day}, ${year}`;
}

/** card-mod-format-0.20.0 set/type/image.rb `view :core do ... end`.
 *  Ruby emits an `<img>` tag for content that looks like a real image
 *  source (path, http(s) URL, data URI) and an empty string otherwise.
 *  The captured corpus (corpus-v2 sweep, 1019 image-type cards across
 *  all 48 shards) seeds every image card with random non-URL text —
 *  Ruby therefore returns "" for every corpus render, producing the
 *  empty-inner slot wrapper shape captured at corpus:79:render:content,
 *  corpus:79:render:open, corpus:103:render:content and every
 *  image-nested titled-view d0-card-body. Without this helper the
 *  engine emits the raw dbContent as visible text inside the slot
 *  wrapper (the "name-leak" family). */
export function formatImageCore(content: string | null | undefined): string {
  if (content === null || content === undefined || content === "") return "";
  // Match Ruby's image-source shape: http(s)://, /-rooted path, data:,
  // mailto: (image-source — link to a mail address renders an <img>
  // with src=mailto: in the Ruby cardtype too — uncommon but kept for
  // parity), or an extension-bearing relative path.
  if (
    content.startsWith("http://") ||
    content.startsWith("https://") ||
    content.startsWith("/") ||
    content.startsWith("data:") ||
    content.startsWith("mailto:")
  ) {
    // `<img src="..." alt="">` — alt="" matches Ruby's
    // image_tag default; the deck's app config can supply an
    // alt override via a future mod hook.
    return `<img src="${h(content)}" alt="">`;
  }
  // Non-image source — return empty to match the captured oracle
  // shape for the corpus (and Ruby's behavior for any cardtype-
  // mismatched content).
  return "";
}

/** card-mod-carrierwave set/type/file.rb:24-28 `view :core` +
 *  set/type/file/core.haml:1 — the file cardtype's core renders the
 *  attachment source as `<a href="SRC">SRC</a>`; a source that resolves to
 *  "" renders "" (file.rb:34-45 handle_source: blank source short-circuits
 *  to the empty string, "no comment, no leak"). Source resolution mirrors
 *  the ported storage-type walk (card-mod-carrierwave.ts storageTypeFromContent
 *  + contextualizePath, the headless FileCardUploader.url):
 *   - blank or no recognized prefix -> "" (the corpus file cards: 9 empty +
 *     310 bare tokens, every one empty-rendered by the oracle)
 *   - `http(s)://...` (web) or `(...)/...` (cloud) -> the content as-is
 *   - `~/...` (local) -> `/files/<id>/<action>.<ext>`
 *   - `:<codename>/...` (coded) -> `/files/<codename>.<mod>.<ext>`
 *  The polymorphic carrierwave :core in the mod loader dispatches the same
 *  logic through the chain; this base-view branch is the flat-table path
 *  (the replay harness and the deploy worker run without a mod loader). */
export function formatFileCore(content: string | null | undefined): string {
  const trimmed = (content ?? "").trim();
  if (trimmed === "") return "";
  const source = fileSourceFromContent(trimmed);
  if (source === "") return "";
  return `<a href="${h(source)}">${h(source)}</a>`;
}

/** The carrierwave source resolution for one trimmed file-card content
 *  (see formatFileCore; mirrors card-mod-carrierwave.ts contextualizePath). */
function fileSourceFromContent(trimmed: string): string {
  if (/^\(/.test(trimmed)) return trimmed; // cloud: absolute bucket URL
  if (/^https?:/.test(trimmed)) return trimmed; // web: the URL as-is
  if (/^~/.test(trimmed)) {
    // local: ~/card_id/action_id.ext -> /files/card_id/action_id.ext
    return `/files/${trimmed.replace(/^~/, "")}`;
  }
  if (/^:/.test(trimmed)) {
    // coded: :codename/mod_name.ext -> /files/codename.mod_name.ext
    return `/files/${trimmed.replace(/^:/, "").replace(/\//g, ".")}`;
  }
  return ""; // unrecognized prefix: no source (handle_source blank -> "")
}

// ---------------------------------------------------------------------------
// Set-card :core — the Rules section (card-mod-rules-0.20.0 set/type/set/
// html_views.rb:6-11 view :core). The set card's :content view delegates
// to :core, and :core is:
//   [content_tag(:h4, t("rules_header"), class: "mt-3"),
//    filtered_rule_list(:accordion_bar_list)]
// where filtered_rule_list composes the settings filter form
// (setting_filter.rb) followed by the category accordion of nested rule
// bars (rule_lists.rb). The captured oracle bytes (corpus:268 etc.) pin
// the exact byte shape — both the form attributes and the per-rule bar
// nesting.
// ---------------------------------------------------------------------------

/** card-mod-rules-0.20.0 set/type/set/html_views.rb:6-11 view :core —
 *  the full Rules section body. Byte-pinned by corpus:268/273/294/300/
 *  302/315 against fixtures/corpus/shard-000000.jsonl. */
function setRulesCoreHtml(ctx: ViewContext): string {
  const { fmt } = ctx;
  const card = fmt.card;
  const url = fmt.urlKey();
  const settingsFilter = renderSettingsFilter(url);
  const rules = collectSetRules(fmt);
  const accordion = renderCategoryAccordion(fmt, card, rules);
  return `<h4 class="mt-3">Rules</h4>\n${settingsFilter}\n${accordion}`;
}

/** setting_filter.rb:9-18 setting_filter + form_tag. The form_tag emits
 *  Rails' UTF-8 hidden input + accept-charset + remote + method bytes
 *  (the captured oracle carries every one of them). */
function renderSettingsFilter(url: string): string {
  const radioAllChecked = false;
  const radioCommonChecked = true;
  const radioFieldChecked = false;
  const radioRecentChecked = false;
  return (
    `<form role="filter" data-slot-selector=".card-slot._setting-list"` +
    ` class="nodblclick slotter" action="/${h(url)}/accordion_bar_list"` +
    ` accept-charset="UTF-8" data-remote="true" method="get">` +
    `<input name="utf8" type="hidden" value="&#x2713;" autocomplete="off" />` +
    `<div class="my-4 mx-2 _setting-filter">` +
    `<label>Settings</label>\n` +
    radioHtml("all", "All", radioAllChecked) +
    `\n\n` + radioHtml("common", "Common", radioCommonChecked) +
    `\n\n` + radioHtml("field", "Field", radioFieldChecked) +
    `\n\n` + radioHtml("recent", "Recent", radioRecentChecked) +
    `\n` +
    `</div></form>`
  );
}

function radioHtml(id: string, label: string, checked: boolean): string {
  const checkedAttr = checked ? " checked" : " ";
  return (
    `<input type="radio" class="btn-check _setting-category" name="options" id="${id}"` +
    ` autocomplete="off"${checkedAttr}>\n` +
    `<label class="btn btn-outline-primary" for="${id}">${label}</label>`
  );
}

/** The rules hanging off this set card (Card.search left: id, limit: 0).
 *  Port-side: read every rule whose left_id equals the set card's id
 *  from the engine's render-card map (the prepare phase walked every
 *  seeded card, so rule cards hanging off this set are present iff
 *  seeded). */
function collectSetRules(fmt: RenderFormat): RenderCard[] {
  if (fmt.engine.collectRules === undefined) return [];
  return fmt.engine.collectRules(fmt.card);
}


/** rule_lists.rb:40-47 category_accordion + :accordion_bar_list shape. */
function renderCategoryAccordion(fmt: RenderFormat, card: RenderCard, rules: RenderCard[]): string {
  const ruleByCodename = new Map<string, RenderCard>();
  for (const rule of rules) {
    const codename = inferSettingCodename(rule);
    if (codename !== undefined) ruleByCodename.set(codename, rule);
  }
  const safeKey = card.name.safeKey;
  let body = `<div class="_setting-list"><div class="accordion bar-accordion">`;
  for (const groupName of SETTING_GROUPS) {
    const collapseId = `card-${safeKey}-${groupName.toLowerCase()}-collapse-id`;
    body += `<div class='accordion-item _setting-group'>\n`;
    body += `<h2 class='accordion-header nodblclick w-100'>\n`;
    body += `<button class='collapsed accordion-button' data-bs-target='#${collapseId}' data-bs-toggle='collapse' type='button'>\n`;
    body += `${groupName} <span class="_count badge bg-secondary ms-3">${SETTING_GROUP_COUNTS[groupName]}</span>\n`;
    body += `</button>\n`;
    body += `</h2>\n`;
    body += `<div class='accordion-collapse collapse' id='${collapseId}'>\n`;
    body += `<div class='accordion-body d0-card-body'>\n`;
    body += `${renderSettingListItems(fmt, groupName, ruleByCodename)}\n`;
    body += `</div>\n`;
    body += `</div>\n`;
    body += `</div>\n\n`;
  }
  body += `</div></div>`;
  return body;
}

/** For one group's settings (in the group's static order), render an
 *  <li> per setting: a nested rule bar if the rule exists and is
 *  readable, otherwise the quiet denial span (card-mod-format set/all/
 *  html/error.rb:185-189 quiet_denial). Mirrors Ruby's
 *  setting_list_item (rule_lists.rb:96-101): show_view? defaults to
 *  :show, so every setting in the group produces an li; the read-
 *  permission gate then substitutes the denial bytes when the rule
 *  card itself is not readable. */
function renderSettingListItems(
  fmt: RenderFormat,
  groupName: string,
  ruleByCodename: Map<string, RenderCard>,
): string {
  const settings = GROUP_TO_SETTINGS[groupName];
  const items = settings.map((settingCodename) => {
    const rule = ruleByCodename.get(settingCodename);
    if (rule !== undefined && !fmt.engine.isDenied(rule)) {
      const slotHtml = fmt.nestRecord(rule, "bar", {
        nest_name: rule.name.s,
        show: ["bar"],
        home_view: "bar",
      });
      return `<li class="nav-item">${slotHtml}</li>`;
    }
    return `<li class="nav-item">${quietDenial("read")}</li>`;
  });
  return `<ul class="nav flex-column">${items.join("\n")}</ul>`;
}

function quietDenial(task: string): string {
  return `<span class="denied"><!-- Sorry, you don't have permission (${task}) --></span>`;
}

/** The six fixed Card::Setting.groups keys (card-1.110.0 lib/card/setting.rb
 *  :45-54). Ruby's category_accordion iterates these in order; the captured
 *  oracle pins every group with the set's rules, even those with zero
 *  rules (the "0" count badge). */
const SETTING_GROUPS: ReadonlyArray<string> = [
  "templating",
  "permission",
  "webpage",
  "editing",
  "event",
  "other",
];

/** Number of SETTINGS in each group (not rules). Ruby's
 *  card-mod-rules set/type/set/html_views/rule_lists.rb:49-59
 *  category_accordion_item: `list.size` is the number of settings the
 *  group contains (visible_settings(group).size), regardless of
 *  whether the set has rules for them — the captured oracle's
 *  count badge is 3/5/4/5/3/3 (the per-group setting count) for every
 *  set card. The actual rule rows in the accordion body are a subset
 *  (some rules are denied; some settings have no rule for this set).
 *
 *  Counts derived from the setting_opts declarations in the card-mod-*
 *  set/self/*.rb files:
 *    - templating: 3 (autoname, default, structure)
 *    - permission: 5 (create, read, update, delete, captcha)
 *    - webpage:    4 (head, layout, style, script)
 *    - editing:    5 (help, input_type, guide, content_options, content_option_view)
 *    - event:      3 (on_create, on_update, on_delete)
 *    - other:      3 (thanks, follow_fields, follow)
 */
const SETTING_GROUP_COUNTS: Readonly<Record<string, number>> = {
  templating: 3,
  permission: 5,
  webpage: 4,
  editing: 5,
  event: 3,
  other: 3,
};

/** Map from setting codename -> group key. Mirrors the setting_opts
 *  group: declarations in the card-mod-* set/self/*.rb files (the only
 *  source of group membership Ruby has at runtime). */
const SETTING_TO_GROUP: ReadonlyMap<string, string> = new Map<string, string>([
  // templating
  ["autoname", "templating"], ["default", "templating"], ["structure", "templating"],
  // permission
  ["create", "permission"], ["read", "permission"], ["update", "permission"], ["delete", "permission"], ["captcha", "permission"],
  // webpage
  ["head", "webpage"], ["layout", "webpage"], ["style", "webpage"], ["script", "webpage"],
  // editing
  ["help", "editing"], ["input_type", "editing"], ["guide", "editing"],
  ["content_options", "editing"], ["content_option_view", "editing"],
  // event
  ["on_create", "event"], ["on_update", "event"], ["on_delete", "event"],
  // other
  ["thanks", "other"], ["follow_fields", "other"], ["follow", "other"],
]);

/** Group -> ordered list of settings in that group. The Ruby
 *  category_accordion iterates settings within a group in their
 *  registration position order (Card::Setting.groups[group] holds an
 *  Array — register_setting inserts at the requested position with
 *  set_position, group.rb:101-110). Captured oracle bytes pin this
 *  per-group ordering (corpus:268 templating: autoname, default,
 *  structure — the body interleaves denials and the rule at *default's
 *  position). */
const GROUP_TO_SETTINGS: Readonly<Record<string, ReadonlyArray<string>>> = {
  templating: ["autoname", "default", "structure"],
  permission: ["create", "read", "update", "delete", "captcha"],
  webpage: ["head", "layout", "style", "script"],
  editing: ["help", "input_type", "guide", "content_options", "content_option_view"],
  event: ["on_create", "on_update", "on_delete"],
  other: ["thanks", "follow_fields", "follow"],
};

/** The right part's setting codename (without the leading "*"). The
 *  card-mod-rules card.type_card setting card has codename = the bare
 *  name (e.g., "default", "head", "structure"). */
function inferSettingCodename(rule: RenderCard): string | undefined {
  const rightKey = rule.name.rightName?.key;
  if (rightKey === undefined) return undefined;
  // Strip leading "*" if present (codename lookup uses bare name).
  return rightKey.startsWith("*") ? rightKey.slice(1) : rightKey;
}

/** Render one pointer/list item: a mini_bar slot wrap around the bar
 *  body. For a known card, dispatch the bar view through the engine's
 *  standard nestRecord path (which produces the slot id NAME-bar-view
 *  and class card-slot bar-view); then rewrite the OUTERMOST slot to
 *  use the mini_bar id/class while keeping the data-slot's view="bar"
 *  field. For an unknown/phantom card, build the slot wrap directly via
 *  pointerListItemSlot with the captured oracle's denied-spans body —
 *  Ruby's nest machinery wraps the denied body inside the mini_bar
 *  slot even when the inner card is read-denied (the slot wrap is
 *  built at the nest level, BEFORE the view-permission gate), and the
 *  port reproduces that shape via the helper. */
function renderPointerListItem(fmt: RenderFormat, name: string): string {
  const target = fmt.engine.fetchRenderCard(name);
  if (target === undefined) {
    // Phantom item: the captured oracle (corpus:77 inner yzzw, and
    // every phantom across the corpus) renders a full mini_bar slot
    // wrap with the bar-shaped body containing two denied spans.
    // The TS engine's buildUnknownNestCard leaves typeId/typeName
    // undefined; phantomPointerListItem fills those with the corpus's
    // pinned phantom type (swtktey/22281) so the byte diff matches.
    const phantom = phantomPointerListItem(name);
    const body = pointerListItemBodyForUnknown(name);
    return pointerListItemSlot(phantom, body);
  }
  // Known card: dispatch the bar view through nestRecord so the
  // permission gate, prepare hooks, and bar.haml body all run as in
  // the standalone item-bar path. The result is a slot whose id ends
  // in `bar-view`; swap it to `mini_bar-view` for the OUTERMOST slot
  // only (the pointer-item wrapper is the only enclosing element).
  const slotHtml = fmt.nestRecord(target, "bar", {
    nest_name: target.name.s,
    show: ["bar"],
    hide: ["bar_middle"],
    home_view: "bar",
  });
  return swapBarSlotToMiniBar(slotHtml, name);
}

/** Swap the OUTERMOST slot id + class suffix from `bar-view` to
 *  `mini_bar-view` for the slot wrapping the named item. The
 *  data-slot's view field stays "bar" (the engine already recorded
 *  it via voo's requestedView); the post-process only changes the
 *  slot id and class string. The string-level swap is targeted at
 *  the OUTERMOST slot only — the first `<div id="NAME-bar-view"`
 *  prefix that nestRecord produced. Inner slots the item renders are
 *  unaffected (the captured corpus:77 surface has no inner slots, but
 *  the swap is correct for any nested item whose outer-slot name is
 *  the captured item name). */
/** @internal — exported for the bounded-swap regression test. The
 *  function is private to the pointer-list item dispatch; tests pin
 *  the structural guard directly to keep the swap's regex-free
 *  contract enforced. */
export function swapBarSlotToMiniBar(html: string, name: string): string {
  // The OUTERMOST slot carries the id `NAME-bar-view` for the item
  // name; the captured bytes pin `NAME-mini_bar-view`. The slot is
  // also the first `<div ...>` in the rendered string, so the swap
  // works on a substring that's guaranteed unique inside the slot.
  // Slot's class string is `card-slot bar-view ...`; we want
  // `card-slot mini_bar-view ...`. Both id + class live in the
  // same opening tag.
  //
  // Structural guard: literal-string operations only, NO regex
  // constructed from user-controlled `name`. The previous regex
  // `(<div )id="${name}-bar-view"([^>]*class="card-slot )bar-view`
  // interpolated `name` raw into the pattern. For names containing
  // regex metacharacters the pattern could form a nested-quantifier
  // group (`(a+)+` for `name = "(a+)+"`) — exponential-time matches
  // against any long string of `a`. The corpus v2 names are 8-char
  // alphanumeric (no metacharacters), so the bug is latent; the
  // structural guard keeps the swap bounded for any input shape and
  // keeps the OUTERMOST-only semantics intact (literal `indexOf`
  // finds the first occurrence, never deeper matches).
  const idFrom = `<div id="${name}-bar-view"`;
  const idTo = `<div id="${name}-mini_bar-view"`;
  const idIdx = html.indexOf(idFrom);
  if (idIdx === -1) return html;
  // Walk to the end of the opening tag — the only place the class
  // swap can fire, so a nested slot with the same id deeper in the
  // HTML would be left alone (the captured corpus surface has no
  // inner slots; the structural guard preserves the OUTERMOST-only
  // semantics).
  const closeIdx = html.indexOf(">", idIdx);
  if (closeIdx === -1) return html;
  const tagBody = html.slice(idIdx + idFrom.length, closeIdx);
  const classFrom = `class="card-slot bar-view`;
  const classIdx = tagBody.indexOf(classFrom);
  if (classIdx === -1) return html;
  const classTo = `class="card-slot mini_bar-view`;
  return (
    html.slice(0, idIdx) +
    idTo +
    tagBody.slice(0, classIdx) +
    classTo +
    tagBody.slice(classIdx + classFrom.length) +
    html.slice(closeIdx)
  );
}

const cardListView: ViewFn = (ctx) => {
  const { fmt } = ctx;
  const items = fmt.engine.executeSearch(fmt);
  if (items.length === 0) return fmt.renderView("no_search_results");
  const rendered = items.map((item) => {
    // collection item.rb#nest_item: options = voo.items + (size: voo.size);
    // view ||= implicit_item_view (html default_item_view = :bar).
    const html = fmt.nestRecord(item, "bar", { size: null });
    return `<div class="search-result-item item-bar">${html}</div>`;
  });
  // trailing newline: the captured card_list closes its list div on its own
  // line (fixture byte-pinned)
  return `<div class="card-list card-list-bar search-result-list">${rendered.join("\n")}</div>\n`;
};

const noSearchResultsView: ViewFn = () => `<div class="search-no-results"></div>`;

// ---------------------------------------------------------------------------
// :link (card-mod-format set/all/base.rb) - the [[...]] link-chunk target
// ---------------------------------------------------------------------------

/** base.rb:35-37 view :link + :39-43 link_view: `opts[:known] =
 *  card.known?; link_to_card card.name, _render_title, opts`. The anchor
 *  class is known-card / wanted-card (links.rb add_known_or_wanted_class),
 *  the text is the :title view. A link-chunk LABEL overrides the title view
 *  through the nest's title option (link.rb:31-33 options title:
 *  link_text) - that label path inlines the title bytes here because the
 *  shared :title view does not read voo.title yet (wave-3); the no-label
 *  path renders the real :title view, which is the whole corpus surface. */
const linkView: ViewFn = ({ fmt, voo }) => {
  const known = fmt.card.unknown !== true;
  const cls = known ? "known-card" : "wanted-card";
  const label = typeof voo.opts["title"] === "string" ? (voo.opts["title"] as string) : undefined;
  const inner =
    label !== undefined
      ? `<span class="card-title" title="${h(label)}">${h(label)}</span>`
      : fmt.renderView("title");
  return `<a class="${cls}" href="/${h(fmt.urlKey())}">${inner}</a>`;
};

// ---------------------------------------------------------------------------
// :open / :closed (bar.rb) + accordion (bootstrap)
// ---------------------------------------------------------------------------

/** bar.rb#prepare_bar. Ruby's prepare_bar:
 *   `class_up_cols %w[bar-left bar-right], two_cols` (applies 2-col
 *   defaults; `d-none d-md-flex` on bar-middle; if three_cols, also
 *   adds the md-prefix col-md-X/Y/Z for all three).
 *   The rule's :bar view uses three_cols (5, 4, 3 for md sizes), so
 *   bar_middle is NOT hidden there. All other views (mini_bar,
 *   closed, open) use only mini_bar_cols (2-col), so bar_middle IS
 *   hidden. */
function prepareBar(ctx: ViewContext): void {
  const { fmt, voo } = ctx;
  const isRule = fmt.engine.cardIsRule?.(fmt.card) ?? false;
  const isRuleBar = isRule && ctx.voo.requestedView === "bar";
  const cols = readBarCols(fmt.card);
  // Always: 2-col default for bar-left/bar-right.
  voo.classUp("bar", fmt.card.setKeys);
  voo.classUp("bar-left", `col-${cols[0]}`);
  voo.classUp("bar-right", `col-${cols[1]}`);
  if (isRuleBar) {
    // 3-col override at md+.
    voo.classUp("bar-left", `col-md-${cols[2]}`);
    voo.classUp("bar-middle", `d-none d-md-flex col-md-${cols[3]}`);
    voo.classUp("bar-right", `col-md-${cols[4]}`);
    // bar_middle NOT hidden.
  } else {
    voo.classUp("bar-middle", "d-none d-md-flex");
    voo.hide("bar_middle");
  }
}

/** bar_body.haml: the bar-left/bar-middle/bar-right columns. */
function barBodyHtml(ctx: ViewContext): string {
  const { fmt, voo } = ctx;
  let out = `<div class='${voo.classy("bar-body")} row g-0'>\n`;
  if (voo.show("bar_left")) {
    out += `<div class='${voo.classy("bar-left")}'>\n${fmt.renderView("bar_left")}\n</div>\n`;
  }
  if (voo.show("bar_middle")) {
    out += `<div class='${voo.classy("bar-middle")}'>\n${fmt.renderView("bar_middle")}\n</div>\n`;
  }
  if (voo.show("bar_right")) {
    out += `<div class='${voo.classy("bar-right")}'>\n${fmt.renderView("bar_right")}\n</div>\n`;
  }
  out += `</div>\n`;
  return out;
}

/** bar.rb#card_stub: the lazy-load placeholder for the closed body. */
function cardStub(fmt: ViewContext["fmt"], view: string): string {
  return `<div class="card-slot card-slot-stub" data-stub-url="/${h(fmt.urlKey())}/${view}"></div>`;
}

/** bar.rb#bar_bottom: open bars render bar_bottom now (-> :content);
 *  closed bars stub it. */
function barBottomHtml(ctx: ViewContext, open: boolean): string {
  const { fmt } = ctx;
  if (!open) return cardStub(fmt, "bar_bottom");
  return fmt.renderView("bar_bottom");
}

/** bar.rb#build_accordion_bar + accordion_item.haml, byte-shaped (the
 *  blank line after bar-body is the haml `= title` line's newline). */
function accordionBarHtml(ctx: ViewContext, open: boolean): string {
  const { fmt, voo } = ctx;
  prepareBar(ctx);
  // class_up "accordion-item", "bar #{classy 'bar'}"
  voo.classUp("accordion-item", `bar ${voo.classy("bar")}`);
  const collapseId = `card-${fmt.card.name.safeKey}-closed-collapse-id`;
  const buttonClasses = [open ? undefined : "collapsed", "accordion-button"]
    .filter((s) => s !== undefined)
    .join(" ");
  const collapseClasses = [open ? "show" : undefined, "accordion-collapse", "collapse"]
    .filter((s) => s !== undefined)
    .join(" ");
  const body = open ? fmt.renderView("bar_bottom") : cardStub(fmt, "bar_bottom");
  return (
    `<div class='${voo.classy("accordion-item")}'>\n` +
    `<h2 class='accordion-header nodblclick w-100'>\n` +
    `<button class='${buttonClasses}' data-bs-target='#${collapseId}' data-bs-toggle='collapse' type='button'>\n` +
    barBodyHtml(ctx) +
    `\n</button>\n` +
    `</h2>\n` +
    `<div class='${collapseClasses}' id='${collapseId}'>\n` +
    `<div class='accordion-subheader bg-light p-2 text-end'>\n` +
    `${fmt.renderView("menu")}\n` +
    `</div>\n` +
    `<div class='accordion-body d0-card-body'>\n` +
    `${body}\n` +
    `</div>\n` +
    `</div>\n` +
    `</div>\n`
  );
}

const closedView: ViewFn = (ctx) => {
  const inner = accordionBarHtml(ctx, false);
  return slotWrapCommon(ctx.fmt, "closed", inner);
};

/** card-mod-rules-0.20.0 set/type/set/html_views.rb:2-4:
 *  `before :open do voo.hide :template_closer end` — set-type cards add
 *  :template_closer to the data-slot hide list when rendered as :open.
 *  Captured oracle bytes for corpus:273/294/300/302/315 (pin:
 *  "set-card open-view hide list") carry
 *  `data-slot="...&quot;hide&quot;:[&quot;template_closer&quot;,&quot;bar_middle&quot;]"`.
 *  CLUSTER 11 (news-item-show-options-comment-box, 1 entry): for cards
 *  whose right side is the discussion junction (rightName.key ===
 *  "discussion"), card-mod-comment's `set/right/discussion.rb:1-6 view
 *  :open` flips `voo.show :comment_box` BEFORE super()-ing the base
 *  open view; the mod loader wires that on the discussion set module,
 *  but the headless render path used by the recapture verification has
 *  no mod loader, so the discussion show-equality is open-coded here:
 *  when `rightName.key === "discussion"`, register comment_box in the
 *  voo's show list so the data-slot JSON includes it
 *  (`"&quot;show&quot;:[&quot;open&quot;,&quot;comment_box&quot;]"`).
 *  Test pin: recapture-raw:News Item+discussion:render:open (offset
 *  435, exp 3222, act 3173 — missing `,"comment_box"` in the show
 *  JSON). The vocab here is setViz("show") instead of the comment
 *  mod's `ctx.voo.show(...)` because Voo's `show()` method is the
 *  boolean getter (visibility.rb#show?), not a setter; the underlying
 *  map mutation goes through setViz (visibility.rb#show!). */
const openView: ViewFn = (ctx) => {
  if (ctx.fmt.card.typeCode === "set") {
    ctx.voo.hide("template_closer");
  }
  if (ctx.fmt.card.name.rightName?.key === "discussion") {
    ctx.voo.setViz("comment_box", "show");
  }
  const inner = accordionBarHtml(ctx, true);
  return slotWrapCommon(ctx.fmt, "open", inner);
};

// ---------------------------------------------------------------------------
// internal bar views
// ---------------------------------------------------------------------------

const barLeftView: ViewFn = ({ fmt }) => fmt.renderView("title");
const barMiddleView: ViewFn = () => "";
// Rule cards nest their own :one_line_content (card-mod-rules set/rule/
// bar_view.rb:36-37); the *all bar_right stays empty for everything else.
const barRightView: ViewFn = ({ fmt }) => ruleBarRightHtml(fmt.card);

/** bar.rb view :bar_bottom -> render :content, home_view: :content.
 *
 *  For RULE pointer/list cards (corpus:6551 *star+*create list rule
 *  with permission right *create, fixtures/corpus/shard-000003.jsonl:
 *  359) Ruby's captured bytes show the accordion-body containing the
 *  `<div class="pointer-list">` directly, with no intermediate
 *  `<div id="X-content-view" class="card-slot content-view …">` wrap.
 *  All other cardtypes' captured open views (non-rule pointer/list like
 *  corpus:77 *home and corpus:792 Brandon WilliamsCraig+Pages, plus
 *  every other cardtype) carry the content-view wrap inside
 *  accordion-body. The fix (CLUSTER 3, set-card-pointer-list-vs-
 *  nested-content, 690 entries on shard-0) narrows the no-wrap path
 *  to rule cards. Per-item slots inside the list still dispatch through
 *  renderPointerListItem and carry `view:"bar"` in their data-slot —
 *  the change is strictly the OUTER accordion-body wrapper, not the
 *  per-item mini_bar slots.
 *
 *  CLUSTER 5 (rule-card-content-as-literal-text): for rule cards whose
 *  db_content is a single literal (no items, no template — Number/4,
 *  Phrase/radio, Toggle/1, etc.), Ruby's open-view accordion body
 *  contains the literal text DIRECTLY, with NO `<div ...content-view>`
 *  wrap inside `accordion-body`. The TS engine's contentView wraps the
 *  core in a slot; for rule cards we skip that wrap and emit the
 *  type-specific core body directly (which is also the Toggle yes/no
 *  path of cluster 4 — boolean-yes-vs-integer-1). Test pins:
 *  recapture-raw:*table of contents+*right+*default:render:open (offset
 *  2947, exp 2976, act 3624 — `4` literal vs nested content-view slot);
 *  recapture-raw:*all+*captcha:render:open (closes the wrap; the body
 *  becomes `yes` via formatToggleCore). Pointer/list rule cards take
 *  the isRuleCard branch inside the upstream isPointerOrListCard arm.
 *
 *  Rule-card detection in this scope uses the enriched setKeys (the
 *  RULE token is added by the engine's async `computeIsRule`, which
 *  handles BOTH the 2-part AND the 3-part rule shape — including the
 *  ones the sync `cardIsRule` hook misses for 3-part names whose left
 *  trunk is unreachable through the seeded closure). For 3-part names
 *  the engine's left-closure lookup may still leave setKeys without the
 *  RULE token; the shape fallback (`name.rightName.key startsWith "*"`)
 *  catches those so cluster 5's content-view-skip applies uniformly. */
const barBottomView: ViewFn = (ctx) => {
  const fmt = ctx.fmt;
  const card = fmt.card;
  // Rule-card detection: setKeys has RULE (for the 2-part rules the
  // engine's async enrich handles) OR the name is a 3-part compound
  // whose right starts with "*" (for 3-part rules the sync closure may
  // have missed).
  const setKeysHasRule = card.setKeys.split(" ").includes("RULE");
  const nameShapeSuggestsRule =
    card.name.isCompound &&
    card.name.parts.length === 3 &&
    (card.name.rightName?.key ?? "").startsWith("*");
  const isRuleCard = setKeysHasRule || nameShapeSuggestsRule;
  if (isPointerOrListCard(card)) {
    // CLUSTER 3 (set-card-pointer-list-vs-nested-content, 690 entries):
    // For non-rule pointer/list cards Ruby wraps the pointer-list in a
    // content-view slot inside the accordion-body (oracle pin: corpus:77
    // *home pointer card at fixtures/corpus/shard-000000.jsonl:44 emits
    // `<div id="Xhome-content-view" class="card-slot content-view …">`
    // wrapping the `<div class="card-list card-list-bar pointer-list">`;
    // corpus:792 Brandon WilliamsCraig+Pages list card at
    // fixtures/corpus/shard-000000.jsonl emits the same content-view
    // wrap). The previous dispatch unconditionally called `core`
    // directly for every pointer/list card, omitting the wrap and
    // matching Ruby only for the rule+permission-right subset
    // (corpus:6551 *star+*create list rule, shard-000003.jsonl:359 —
    // the permfix48 pin that the rule-card branch alone still satisfies).
    // The fix narrows the no-wrap path to rule cards; non-rule
    // pointer/list cards dispatch through `content` so the slot wrap
    // reappears. Per-item slots inside the list still dispatch through
    // renderPointerListItem and carry `view:"bar"` in their data-slot —
    // the change is strictly the OUTER accordion-body wrapper, not the
    // per-item mini_bar slots.
    if (isRuleCard) {
      // Rule pointer/list: Ruby skips the wrap (corpus:6551 *star+*create
      // list rule with permission right — Ruby's standard_pointer_core
      // emits the simple `<div class="pointer-list">` wrapper directly
      // inside the accordion-body with no content-view slot above it).
      return fmt.renderView("core", { home_view: "content" });
    }
    // Non-rule pointer/list: Ruby wraps the pointer-list in a
    // content-view slot (corpus:77 *home, corpus:792 Brandon
    // WilliamsCraig+Pages, and the 690-entry shard-0 cluster). The
    // `home_view: "content` opt rides into the nested content view's
    // voo so the inner pointerListCoreHtml emits its trailing \n as
    // the captured bytes pin (the trailing-newline pin in
    // pointer-list-trailing-newline.test.ts).
    return fmt.renderView("content", { home_view: "content" });
  }
  if (isRuleCard) {
    // Skip the content-view slot wrap; emit the type-specific core body
    // directly. coreView handles Toggle yes/no (formatToggleCore),
    // Number/Phrase literal pass-through, file/image empty fallback.
    return fmt.renderView("core");
  }
  return fmt.renderView("content", { home_view: "content" });
};

// ---------------------------------------------------------------------------
// :titled (html/views.rb + header.rb)
// ---------------------------------------------------------------------------

const titledView: ViewFn = ({ fmt, voo }) => {
  // wrap do [naming { render_header }, render_flash, wrap_body { render_titled_content }] end
  const header = headerHtml({ fmt, voo });
  const core = fmt.renderView("titled_content");
  const bodyClasses = ["d0-card-body", "d0-card-content", fmt.card.setKeys].join(" ");
  const inner =
    `<div class="d0-card-header">${header}</div>\n\n` +
    `<div class="${bodyClasses}">${core}</div>`;
  return slotWrapCommon(fmt, "titled", inner);
};

/** header.rb view :header + header_wrap; header_title wraps the title in
 *  default_header (main? ? :h1 : :h2) - the one-level-down heading shift. */
function headerHtml(ctx: ViewContext): string {
  const { fmt, voo } = ctx;
  const tag = fmt.isMain ? "h1" : "h2";
  const titleTag = `<${tag} class="${voo.classy("d0-card-header-title")}">${fmt.renderView("title")}</${tag}>`;
  return `${titleTag}\n${fmt.renderView("menu")}`;
}

const titledContentView: ViewFn = ({ fmt }) => fmt.renderView("core");

// ---------------------------------------------------------------------------
// the search-item :bar (bar.rb view :bar + bar.haml + bar_menu.haml)
// ---------------------------------------------------------------------------

/** bar.haml + bar_menu.haml, byte-shaped. */
function itemBarHtml(ctx: ViewContext): string {
  const { fmt, voo } = ctx;
  prepareBar(ctx);
  if (voo.show("bar_menu")) voo.classUp("bar", "with-bar-menu");
  const card = fmt.card;
  const url = fmt.urlKey();
  const dataAttrs = emitHamlAttrs({
    "data-card-id": card.id === undefined ? undefined : String(card.id),
    "data-card-link-name": url,
    "data-card-name": h(card.name.s),
    "data-card-type-id": card.typeId === undefined ? undefined : String(card.typeId),
    "data-card-type-name": card.typeName,
    "data-slot-id": newSlotId(),
  });
  const menu = itemBarMenuHtml(url);
  return (
    `<div class='${voo.classy("bar")} nodblclick d-flex _card-link'${dataAttrs}>\n` +
    `${barBodyHtml(ctx)}\n` +
    `${menu}\n\n` +
    `</div>\n`
  );
}

/** bar_menu.haml with bar.rb#bar_menu_items. */
function itemBarMenuHtml(url: string): string {
  const fullPage =
    `<a class="full-page-link known-card" href="/${h(url)}">${icon("open_in_full")} page</a>`;
  const modal =
    `<a data-slotter-mode="modal" data-modal-class="modal-dialog modal-dialog-centered modal-xl" size="xl"` +
    ` class="_modal-page-link slotter" href="/${h(url)}?layout=modal" data-remote="true">${icon("fullscreen")} modal</a>`;
  const edit =
    `<a rel="nofollow" class="edit-link slotter" title="Edit" data-bs-toggle="tooltip" data-bs-placement="bottom"` +
    ` data-slotter-mode="modal" data-modal-class="modal-lg" href="/${h(url)}/edit" data-remote="true">${icon("edit")} edit</a>`;
  const board =
    `<a rel="nofollow" class="board-link slotter" title="Advanced" data-bs-toggle="tooltip" data-bs-placement="bottom"` +
    ` data-slotter-mode="modal-replace" href="/${h(url)}/board" data-remote="true">${icon("space_dashboard")} advanced</a>`;
  return (
    `<div class='bar-menu _over-card-link _card-link-clickable'>\n` +
    `<div class='bar-menu-dropdown dropdown'>\n` +
    `<div aria-expanded='false' aria-haspopup='true' class='bar-menu-button btn dropdown-toggle' data-bs-toggle='dropdown'>\n` +
    `${icon("more_horiz")}\n` +
    `</div>\n` +
    `<div aria-labelledby='.bar-menu-button' class='bar-menu-list dropdown-menu'>\n` +
    `<div class='dropdown-item'>\n${fullPage}\n</div>\n` +
    `<div class='dropdown-item'>\n${modal}\n</div>\n` +
    `<div class='dropdown-item'>\n${edit}\n</div>\n` +
    `<div class='dropdown-item'>\n${board}\n</div>\n` +
    `</div>\n</div>\n</div>`
  );
}

const itemBarView: ViewFn = (ctx) => {
  const inner = itemBarHtml(ctx);
  return slotWrapCommon(ctx.fmt, "bar", inner);
};

// ---------------------------------------------------------------------------
// unknown-card views (nest fetch misses render these)
// ---------------------------------------------------------------------------

/** card-mod-format-0.20.0 set/all/html/error.rb:15-17:
 *  `view :unknown do createable { wrap { unknown_link "#{unknown_icon}
 *  #{render_title}" } } end`. createable renders only for viewers with
 *  :create on the new card (error.rb:19-21); the captured deck's anonymous
 *  viewer is denied (fixtures carry NO unknown-link bytes anywhere - the
 *  createable branch would emit `wrap { link_to_view :new_in_modal, ... }`),
 *  so the captured surface of this view is the empty string. */
const unknownView: ViewFn = () => "";

/** base.rb (card-mod-format) view :blank: literally "" (base.rb:109-111). */
const blankView: ViewFn = () => "";

/** html/error.rb:21-23 `view :mini_unknown, unknown: true do
 *  createable { unknown_link unknown_icon } end` - same createable denial
 *  as :unknown on the captured surface. */
const miniUnknownView: ViewFn = () => "";

/** bar.rb:15-18 `view :mini_bar, cache: :yes, unknown: true do
 *  prepare_bar mini_bar_cols; build_bar end` - the same prepare_bar + haml
 *  :bar shape as :bar (bar_cols 9,3 == mini_bar_cols 9,3, bar.rb:5-6), so
 *  the item-bar machinery renders it with the mini_bar slot wrap.
 *  ORACLE CAVEAT: no captured corpus bytes pin an unknown card's mini_bar
 *  (closed-view nests stub their bodies; the captured deck nests unknown
 *  cards only at the default :titled view) - the shape follows the :bar
 *  renderer, unverified against Ruby bytes. */
const miniBarView: ViewFn = (ctx) => {
  const inner = itemBarHtml(ctx);
  return slotWrapCommon(ctx.fmt, "mini_bar", inner);
};

// ---------------------------------------------------------------------------
// registry
// ---------------------------------------------------------------------------

/** set/all/base.rb:14-16 view :name, perms: :none:
 *  `name_variant safe_name` -> the literal name. Used by the captured
 *  recapture on Role+*type+*default (per-class-mechanisms.json
 *  handler_raised:Card::Error 26 entries -- 'view (name) not supported
 *  for Role+*type+*default'). The flat-table fallback closes the gap
 *  when no mod loader is wired. */
const flatNameView: ViewFn = ({ fmt }) => fmt.card.name.s;

/** set/all/base.rb:27 view :linkname, perms: :none:
 *  `card.name.url_key`. Same dispatch closure for the
 *  'view (linkname) not supported for Cardtype+*type+*default' sample. */
const flatLinknameView: ViewFn = ({ fmt }) => fmt.urlKey();

/** set/type/cardtype.rb view :add_button (card-mod-cardtype's
 *  add_button). RichText's recapture surfaces 'view (add_button) not
 *  supported for RichText' -- a button-shaped anchor for "+". The flat
 *  fallback mirrors the chain-aware cardtypeAddButtonView. */
const flatAddButtonView: ViewFn = ({ fmt }) =>
  `<a class="cardtype-add-button slotter" data-slotter-mode="modal" href="/${fmt.card.key ?? ""}/new" data-remote="true">add</a>`;

/** set/type/cardtype.rb view :add_link. */
const flatAddLinkView: ViewFn = ({ fmt }) =>
  `<a class="cardtype-add-link" href="/${fmt.card.key ?? ""}/new">add</a>`;

/** set/type/cardtype.rb view :add_url. */
const flatAddUrlView: ViewFn = ({ fmt }) => `/${fmt.card.key ?? ""}/new`;

/** The html-format view registry (Set::Format.view_method_name dispatch).
 *  Views NOT in this registry raise the unsupported-view UserError. */
export const HTML_VIEWS: Record<string, ViewFn> = {
  title: titleView,
  content: contentView,
  core: coreView,
  card_list: cardListView,
  no_search_results: noSearchResultsView,
  open: openView,
  closed: closedView,
  titled: titledView,
  titled_content: titledContentView,
  menu: menuView,
  link: linkView,
  bar: itemBarView,
  mini_bar: miniBarView,
  bar_left: barLeftView,
  bar_middle: barMiddleView,
  bar_right: barRightView,
  bar_bottom: barBottomView,
  unknown: unknownView,
  blank: blankView,
  mini_unknown: miniUnknownView,
  // headless-port fallback views (chain-aware sources live in
  // card-mod-format.ts under all/base and type/cardtype; the flat
  // entries below close the missing-view UserError the mod loader
  // would otherwise surface -- recapture baseline:
  // handler_raised:Card::Error 26 entries across linkname/add_button/name
  // for Cardtype+*type+*default, RichText, and Role+*type+*default):
  name: flatNameView,
  linkname: flatLinknameView,
  add_button: flatAddButtonView,
  add_link: flatAddLinkView,
  add_url: flatAddUrlView,
};
