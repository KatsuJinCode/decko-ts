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
import { CodenameNotFoundError, NameNotFoundError } from "../name/errors.js";
import { isNewCard } from "../fetch/card-record.js";
import { emitAttrs, emitHamlAttrs, h, newSlotId, slotOptionsJson } from "./slot-html.js";
import { UnsupportedViewError } from "./format.js";
import type { RenderCard, RenderFormat, SettingClassWithRules, ViewContext, ViewFn } from "./format.js";
import {
  isPointerOrListCard,
  isRuleCardWithPermissionRight,
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
import { buildVirtualRuleCard } from "./virtual-rule-card.js";
import { NAVBAR_VIEWS, accountLinksCoreHtml } from "./navbar-views.js";

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
 *  instead - see the content view).
 *
 *  CLUSTER 15 (whitespace-newline-before-div, 262 entries, +discussion
 *  family): Ruby's wrap helper for the discussion-junction content view
 *  emits a literal `\n` before the closing `</div>` of the content-view
 *  slot wrap. The captured oracle for recapture-raw:News Item+discussion
 *  at tmp/raw-ground-truth/expected/recapture-raw-shard-000000.jsonl:146
 *  shows the closing sequence `</p>\n</div>\n</div>\n</div>\n</div>\n</div>`
 *  - 5 closing `</div>`s each preceded by `\n`. Without this newline, the
 *  engine emits `</p></div>\n</div>\n</div>\n</div>\n</div>` (1 byte
 *  short). The fix targets the discussion-junction path specifically
 *  (card.name.rightName?.key === "discussion"): Ruby's discussion set
 *  module wraps its content view's inner content with the trailing
 *  newline pattern; non-discussion rich-text cards (corpus:639/640/643/
 *  1120/19334 etc., the unintended positive pin set) emit `</p></div>`
 *  INLINE without the newline. The earlier broad "view === content"
 *  fix added the newline to every content view and broke those pins;
 *  the discussion-only gate below preserves both sides. Test pin:
 *  recapture-raw:News Item+discussion:render:open (offset 3187, exp
 *  3222, act 3221 — `\n` between `</p>` and the content-view slot's
 *  closing `</div>`); recapture-raw:Not really monothiests+discussion:
 *  render:open (offset 3490, exp 3525, act 3524). */
/** card-mod-format-0.20.0 set/all/html/wrap.rb:50-53 #slot_cardname:
 *      name = card.name
 *      name = name.url_key if card.new? && name.compound?
 *  An UNSAVED COMPOUND card (Ruby new?, our isNewCard on the record —
 *  buildUnknownNestCard sets isNew: true; fetched real cards are never
 *  new) DISPLAYS its url_key form: case retained, underscores for
 *  spaces ("Conflict Done Well+management" renders as
 *  "Conflict_Done_Well+management"). Saved cards and simple names
 *  display name.s unchanged. This is display-only — the key/id algebra
 *  is untouched. */
function slotCardname(card: RenderCard): string {
  const name = card.name;
  return isNewCard(card.record) && name.isCompound ? name.urlKey : name.s;
}

function slotWrap(ctx: ViewContext, view: string, inner: string): string {
  const { fmt, voo } = ctx;
  const card = fmt.card;
  const classes = voo.classy(["card-slot", `${view}-view`, card.setKeys]);
  const attrs = emitAttrs({
    id: slotId(card, view),
    class: classes,
    "data-card-id": card.id === undefined ? undefined : String(card.id),
    "data-card-name": h(slotCardname(card)),
    "data-card-type-id": card.typeId === undefined ? undefined : String(card.typeId),
    "data-card-type-name": card.typeName,
    "data-card-link-name": fmt.urlKey(),
    "data-slot-id": newSlotId(),
    "data-slot": slotOptionsJson(voo.slotOptions()),
  });
  // CLUSTER 15 gate: only discussion-junction cards get the trailing
  // `\n` before the closing `</div>` of the content-view slot wrap.
  const isDiscussionJunction =
    view === "content" && card.name.rightName?.key === "discussion";
  const trailingNewline = isDiscussionJunction && !inner.endsWith("\n") ? "\n" : "";
  return `<div${attrs}>${inner}${trailingNewline}</div>`;
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
  // set/self/account_links.rb view :core (card-mod-layout): the logging
  // div wrapping the navbar_item_views lis (anonymous: sign_up + sign_in).
  // The custom layouts nest {{*account links|core}} (PCTS/GBA page-lane
  // bytes: <div id="logging" class="logged-out"><li ...Sign up...). Set
  // -scoped in Ruby; keyed by card key here (the flat-registry seam).
  if (fmt.card.key === "*account_link") {
    return accountLinksCoreHtml(ctx);
  }
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
  // card-mod-rules-0.20.0 set/type/setting.rb:39-55 view :core — the
  // setting cardtype's core opens with the rule_help alert (a nested
  // *all+<setting> rule_help view), then the
  // `<h3>All #{card.name.tr "*", ""} rules that apply to</h3>` header,
  // then per-pattern-class blocks `<p><h5>klass.generic_label.downcase</h5>`
  // with the rule bar nested inside (collapse to `rules.first` view
  // `:bar` with `show: [:full_name]` for the anchorless classes — *all
  // and *all_plus — so the rendered row carries the full left-name,
  // not the bar_left compact one). Pinned at recapture-raw:*read
  // :render:open (the 3,612-line rule listings family; cluster
  // nested-listings in round 8 spec). Without this branch the engine
  // falls through to `fmt.processContent(fmt.renderRaw())` and emits
  // an empty content-view — the "empty body, full oracle" gap.
  if (fmt.card.typeCode === "setting" || fmt.card.typeName === "Setting") {
    return settingCoreHtml(ctx);
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
    return formatImageCore(
      fmt.card.dbContent,
      fmt.card.id,
      fmt.card.name.s,
      // image.rb determine_image_size: voo.size || default_size (:medium).
      fmt.voo?.opts.size ?? "medium",
      fmt.engine.imageCdnHost,
    );
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
export function formatImageCore(
  content: string | null | undefined,
  cardId?: number,
  cardName?: string,
  sizeOpt?: unknown,
  cdnAssetHost?: string,
): string {
  if (content === null || content === undefined || content === "") return "";
  const trimmed = content.trim();
  // Match Ruby's image-source shape: http(s)://, /-rooted path, data:,
  // mailto: (image-source — link to a mail address renders an <img>
  // with src=mailto: in the Ruby cardtype too — uncommon but kept for
  // parity), or an extension-bearing relative path.
  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("data:") ||
    trimmed.startsWith("mailto:")
  ) {
    // image_tag source, alt: card.name — the captured oracle pins the
    // Rails tag shape `alt` first with the haml-style close on BOTH lanes
    // (expected-v2 view-lane *favicon :open; page-lane header logo).
    return `<img alt="${h(cardName ?? "")}" src="${h(trimmed)}" />`;
  }
  // Carrierwave storage: (bucket)/<id>/<action>.<ext> (cloud) and
  // ~<id>/<action>.<ext> (local) and :codename/<mod>.<ext> (coded)
  // are the four file-output shapes the image cardtype renders.
  // Ruby (card-mod-carrierwave set/type/image.rb:30-37 def source)
  // resolves them via contextualize_path; we mirror the resolution
  // and append the size variant suffix.
  // ORACLE SHAPES (expected-v2, both lanes — grep-verified 2026-09-26):
  //   cloud "(bucket)/103/3649.jpg" -> ABSOLUTE fog URL, alt first, haml
  //     close: <img alt="*favicon" src="http://s3.amazonaws.com//files/103/3649-medium.jpg" />
  //     (*favicon :open -> -medium; page header logo size:small -> -small)
  //   coded ":cerulean_skin+:image/bootstrap.png" -> "/files/:cerulean_skin
  //     +:image/bootstrap-<size>.png" (colon and joint KEPT — cerulean/cosmo
  //     skin :open/:closed/:content entries)
  //   default size :medium (image.rb default_size; voo.size wins when set).
  // The CLOUD host is context-conditional: the capture's fog storage config
  // produced the absolute s3 fog URL (endpoint + EMPTY bucket + files path,
  // hence the double slash), so the oracle lanes resolve there when the
  // engine carries no imageCdnHost; a DEPLOYED host sets imageCdnHost
  // (vm-staging-server.mjs -> the production Spaces CDN) and cloudImageUrl
  // swaps only the host, keeping the /files/<id>-<variant> path shape
  // (round-10 live receipts). Never a bare relative form: it matched no
  // oracle bytes on either lane.
  if (trimmed.startsWith("(")) {
    const src = cloudImageUrl(trimmed, sizeOpt, cdnAssetHost);
    if (src === "") return "";
    return `<img alt="${h(cardName ?? "")}" src="${h(src)}" />`;
  }
  if (trimmed.startsWith("~")) {
    // local: ~/card_id/action_id.ext -> /files/card_id/action_id(-size).ext
    const path = trimmed.replace(/^~/, "");
    const sized = appendSizeVariant(path, sizeOpt ?? "medium");
    return `<img alt="${h(cardName ?? "")}" src="${h(`/files/${sized}`)}" />`;
  }
  if (trimmed.startsWith(":")) {
    // coded: :codename/mod.ext -> /files/:codename/mod(-size).ext
    const sized = appendSizeVariant(trimmed, sizeOpt ?? "medium");
    return `<img alt="${h(cardName ?? "")}" src="${h(`/files/${sized}`)}" />`;
  }
  // Non-image source — return empty to match the captured oracle
  // shape for the corpus (and Ruby's behavior for any cardtype-
  // mismatched content).
  return "";
}

/** The image variant suffix for a nest's size option, per carrierwave's
 *  determine_image_size (card-mod-carrierwave-0.20.0 set/type/image.rb
 *  :44-57): the nest's explicit size wins; `voo.size = :original if
 *  voo.size == :full` (:56) is the full→original mapping the live deck's
 *  bytes pin (size:full nests serve -original.png, A-15/R13-4 — 101
 *  corpus cards); absent size falls to default_size :medium (live: the
 *  unsized Brandon +image nest serves 60560-medium.jpg). */
export function imageSizeVariant(sizeOpt: unknown): string {
  if (sizeOpt === undefined || sizeOpt === null || sizeOpt === "") return "medium";
  const size = String(sizeOpt);
  return size === "full" ? "original" : size;
}

/** The carrierwave CLOUD image URL (the `(bucket)/<id>/<file>.<ext>`
 *  content shape): resolve to the `/files/<id>/<file>-<variant>.<ext>`
 *  path the live deck serves, prefixed by the deck's CDN host when the
 *  engine carries one (imageCdnHost — deck-deployment config, e.g.
 *  `https://culturesmith-production-storage.fra1.cdn.digitaloceanspaces.com`).
 *
 *  Live receipts (assumption-audit A-13/A-15/A-30; live-wire bytes):
 *   <img alt="Brandon WilliamsCraig+Image"
 *    src="https://…spaces.com/files/431/60560-medium.jpg" />
 *   <img alt="CDW_…" src="…/files/39355/277091-original.png" />
 *  — alt attribute first, space-slash self-close (Rails image_tag
 *  inserts :src into an options hash that already carries :alt, so alt
 *  wins the byte order; the recapture oracle's coded-content images
 *  carry the same order). The recapture oracle is NOT a byte target for
 *  this branch: Ruby raised "couldn't find credentials for bucket
 *  my_bucket" (CAPTURE_ERROR) for every scrubbed bucket card, so only
 *  live pins these bytes. */
/** The capture's fog storage host for cloud attachments: endpoint + EMPTY
 *  bucket (the double slash) + the /files web path. cloudImageUrl's fallback
 *  when the engine carries no imageCdnHost — the oracle bytes pin the
 *  absolute fog form (expected-v2 both lanes: *favicon, header logo). */
export const FOG_CLOUD_URL_HOST = "http://s3.amazonaws.com/";

export function cloudImageUrl(
  content: string,
  sizeOpt: unknown,
  cdnAssetHost?: string,
): string {
  const trimmed = content.trim();
  const path = trimmed.replace(/^\([^)]*\)\//, "");
  // No (bucket)/ prefix — not a resolvable cloud attachment (the oracle
  // renders nothing for malformed storage content).
  if (path === trimmed) return "";
  const variant = imageSizeVariant(sizeOpt);
  const dotted = path.replace(/\.(?=[^.]*$)/, `-${variant}.`);
  return `${cdnAssetHost ?? FOG_CLOUD_URL_HOST}/files/${dotted}`;
}

/** Append the carrierwave variant suffix before the extension.
 *  card-mod-carrierwave lib/carrier_wave/file_card_uploader.rb:88-117
 *  pins the variant position: `<base>(-<size>).<ext>`. Size defaults
 *  to "medium" for image renders when :size is unset (matches the
 *  preview view which forces size=medium, image.rb:18-20 view
 *  :one_line_content passes size: :icon, and the core view renders
 *  the original when size is absent — we follow the carrierwave
 *  default of the original when no size is requested). R13-4: a
 *  requested size of `full` maps to the `original` variant — Ruby's
 *  determine_image_size (set/type/image.rb:56 `voo.size = :original
 *  if voo.size == :full`); the live deck serves 277091-original.png
 *  for size:full nests (A-15; 101 corpus cards). */
function appendSizeVariant(path: string, sizeOpt: unknown): string {
  if (sizeOpt === undefined || sizeOpt === null || sizeOpt === "") return path;
  const dot = path.lastIndexOf(".");
  const suffix = imageSizeVariant(sizeOpt);
  if (dot === -1) return `${path}-${suffix}`;
  return `${path.slice(0, dot)}-${suffix}${path.slice(dot)}`;
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

/** card-mod-rules-0.20.0 set/type/setting.rb:39-55 + set/type/setting/
 *  core.haml:1-12 view :core — the SETTING cardtype's body: rule_help
 *  alert + `<h3>All N rules that apply to</h3>` (N = the setting name
 *  with `*` stripped) + a per-pattern-class block whose `<h5>` carries
 *  the generic_label.downcase and whose body nests the rule(s) for
 *  that class. The anchorless classes (*all, *all_plus) collapse to a
 *  single `rules.first` view `:bar` with `show: [:full_name]` so the
 *  rendered row carries the full left-name (the bar_right pointer-list
 *  path stays as it would for an anchored row); the anchored classes
 *  (*type, *right, *type_plus_right, *self) iterate each rule view
 *  `:bar`. */
function settingCoreHtml(ctx: ViewContext): string {
  const { fmt } = ctx;
  const card = fmt.card;
  // Setting name without the leading "*" (setting.rb:42
  // `card.name.tr("*", "")`) — Ruby's tr strips every asterisk, not
  // just the prefix; the capture pins "read" / "create" / "update" /
  // "delete" for the four permission settings, and other settings
  // (default / structure / autoname) the same way.
  const settingName = card.name.s.replace(/\*/g, "");
  let body = "";
  // Rule-help alert (setting.rb:41-43 nests the *all rule card's
  // :rule_help view — the ruleHelpView dispatches to setting cards and
  // nests *all+<setting> for them, card-mod-rules.ts:300-308). The
  // alert body renders a fetch miss as "" (the unknown-view :rule_help
  // substitutes :unknown which renders ""), so an absent *all+<setting>
  // is a silent blank rather than a raise.
  const ruleHelp = fmt.renderView("rule_help");
  if (ruleHelp !== "") {
    body += `${ruleHelp}\n`;
  }
  body += `<h3>All ${settingName} rules that apply to</h3>\n`;
  const classes = fmt.engine.setClassesWithRules?.(card) ?? [];
  for (const cls of classes) {
    const heading = cls.klass.genericLabel();
    body += `<p><h5>${h(heading.toLowerCase())}</h5>`;
    if (cls.anchorless) {
      // Anchorless: collapse the per-class group to ONE bar with the
      // full left name (Ruby: anchorless? rows render once with
      // show: :full_name; otherwise the per-rule nesting repeats the
      // generic label for every row, which the oracle never does).
      const rule = cls.rules[0];
      if (rule !== undefined) {
        body += fmt.nestRecord(rule, "bar", {
          nest_name: rule.name.s,
          show: ["bar", "full_name"],
          home_view: "bar",
        });
      }
    } else {
      for (const rule of cls.rules) {
        body += fmt.nestRecord(rule, "bar", {
          nest_name: rule.name.s,
          show: ["bar"],
          home_view: "bar",
        });
      }
    }
    body += `</p>\n`;
  }
  return body;
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


/** rule_lists.rb:40-47 category_accordion + :accordion_bar_list shape.
 *  category_accordion_item (rule_lists.rb:83-90): the group's badge is
 *  `list.size` — the number of VISIBLE settings in the group (each mapped
 *  through setting_list_item), so the count is per-set, not static. */
function renderCategoryAccordion(fmt: RenderFormat, card: RenderCard, rules: RenderCard[]): string {
  const ruleByCodename = new Map<string, RenderCard>();
  for (const rule of rules) {
    const codename = inferSettingCodename(rule);
    if (codename !== undefined) ruleByCodename.set(codename, rule);
  }
  const safeKey = card.name.safeKey;
  let body = `<div class="_setting-list"><div class="accordion bar-accordion">`;
  for (const groupName of SETTING_GROUPS) {
    const settings = visibleSettingsForGroup(fmt, card, groupName);
    const collapseId = `card-${safeKey}-${groupName.toLowerCase()}-collapse-id`;
    body += `<div class='accordion-item _setting-group'>\n`;
    body += `<h2 class='accordion-header nodblclick w-100'>\n`;
    body += `<button class='collapsed accordion-button' data-bs-target='#${collapseId}' data-bs-toggle='collapse' type='button'>\n`;
    body += `${groupName} <span class="_count badge bg-secondary ms-3">${settings.length}</span>\n`;
    body += `</button>\n`;
    body += `</h2>\n`;
    body += `<div class='accordion-collapse collapse' id='${collapseId}'>\n`;
    body += `<div class='accordion-body d0-card-body'>\n`;
    body += `${renderSettingListItems(fmt, settings, ruleByCodename, card)}\n`;
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
 *  card itself is not readable. `settings` is the group's visible list
 *  (visibleSettingsForGroup — the restricted_to_type gate applied).
 *
 *  CLUSTER 14 (deep-read-rule-deny-on-self-or-right, 272 entries on
 *  shard 0): Ruby's setting_list_item builds a virtual rule card on the
 *  fly for each setting whose set card has NO stored child, runs the
 *  live permission walk on it (resolving grants through the *all
 *  pattern precedence), and renders its bar. The engine used to
 *  iterate only stored children (collectRules returns renderCards with
 *  the host's left_id) so every setting without a stored child fell
 *  through to quietDenial — the structural gap. The virtual card
 *  construction lives in virtual-rule-card.ts; this function consults
 *  it after the stored-child lookup misses. Stored children keep
 *  their stored form (the existing nestRecord path); virtual children
 *  render the live-walked bar via the same nestRecord shape with the
 *  additional `hide: ["bar_nav"]` opt Ruby emits for new (id-less)
 *  rule cards (card-mod-rules set/rule/bar_view.rb — the rule's
 *  :bar hook hides the nav box for unsaved cards). */
function renderSettingListItems(
  fmt: RenderFormat,
  settings: ReadonlyArray<string>,
  ruleByCodename: Map<string, RenderCard>,
  setCard: RenderCard,
): string {
  const items = settings.map((settingCodename) => {
    const stored = ruleByCodename.get(settingCodename);
    if (stored !== undefined && !fmt.engine.isDenied(stored)) {
      const slotHtml = fmt.nestRecord(stored, "bar", {
        nest_name: stored.name.s,
        show: ["bar"],
        home_view: "bar",
      });
      return `<li class="nav-item">${slotHtml}</li>`;
    }
    // Stored child missing or denied — try virtual construction.
    // Ruby's setting_list_item builds the virtual card unconditionally
    // when the set card doesn't store a custom rule for this setting;
    // the live permission walk on the virtual resolves through the
    // *all pattern precedence (the *all+*read rule grants everyone).
    const settingCard = fmt.engine.findSettingCard?.(settingCodename);
    if (settingCard !== undefined) {
      const virtual = buildVirtualRuleCard({
        setCard,
        settingCard,
        settingCodename,
      });
      const slotHtml = fmt.nestRecord(virtual, "bar", {
        nest_name: virtual.name.s,
        show: ["bar"],
        hide: ["bar_nav"],
        home_view: "bar",
      });
      return `<li class="nav-item">${slotHtml}</li>`;
    }
    // Setting card itself unknown — the deck has no such setting.
    // Fall through to the original quiet-denial path (engine without
    // findSettingCard would land here too).
    return `<li class="nav-item">${quietDenial("read")}</li>`;
  });
  return `<ul class="nav flex-column">${items.join("\n")}</ul>`;
}

function quietDenial(task: string): string {
  return `<span class="denied"><!-- Sorry, you don't have permission (${task}) --></span>`;
}

// ---------------------------------------------------------------------------
// visible settings: the restricted_to_type gate (setting_categories.rb)
// ---------------------------------------------------------------------------

/** card-mod-rules set/type/set.rb:73-81 visible_settings: the group's
 *  registered settings minus those whose setting module declared
 *  `restricted_to_type:` when the set's PROTOTYPE type is outside the
 *  restriction (`applies_to_cardtype`, card-1.110.0 lib/card/setting.rb
 *  :78-81: `!restricted_to_type || restricted_to_type.include?(type_id)`).
 *  The `applies:` lambda gate is NOT evaluated on this path
 *  (visible_settings calls applies_to_cardtype with ONE argument, so
 *  applies_to_prototype? never fires). A nil/unknown prototype type
 *  rejects every restricted setting (include?(nil) is false in Ruby). */
function visibleSettingsForGroup(
  fmt: RenderFormat,
  setCard: RenderCard,
  groupName: string,
): ReadonlyArray<string> {
  const settings = GROUP_TO_SETTINGS[groupName];
  const engine = fmt.engine;
  if (engine.peekCodenameById === undefined) return settings;
  const prototypeCode = setPrototypeTypeCode(fmt, setCard);
  return settings.filter((codename) => {
    const restricted = SETTING_RESTRICTED_TO_TYPE.get(codename);
    if (restricted === undefined) return true;
    return prototypeCode !== undefined && restricted.includes(prototypeCode);
  });
}

/** Settings that declared `restricted_to_type:` in their setting_opts
 *  (the only two across the loaded mods — grep over card-1.110.0/mod +
 *  card-mod-* 2026-09-26). Values are the permitted type CODES
 *  (card-mod-list set/self/content_options.rb:2 and
 *  set/self/content_option_view.rb:2: `%i[list pointer session]`). */
const SETTING_RESTRICTED_TO_TYPE: ReadonlyMap<string, readonly string[]> = new Map([
  ["content_options", ["list", "pointer", "session"]],
  ["content_option_view", ["list", "pointer", "session"]],
]);

/** Prototype type per set pattern — the port of the prototype chain the
 *  restriction reads (`set.rb:77-81 visible_settings` ->
 *  `prototype.type_id`; `prototype` = set.rb:87-92
 *  `Card.fetch prototype_args(anchor_name), new: prototype_args`).
 *
 *  - SELF (set_pattern/09_self.rb `{name: anchor}`): the anchor card is
 *    REAL — its stored type. Unseeded anchor falls through to the
 *    template chain (the set's own *default rule card's type —
 *    templating.rb new_card_template `rule_card(:default)`).
 *  - TYPE (03_type.rb `{type: anchor}`): the explicit type wins
 *    (type.rb normalize_type_attributes) — the prototype's type IS the
 *    anchor cardtype card's id.
 *  - RIGHT (07_right.rb `{name: "*dummy+#{anchor}"}`): a new compound
 *    card; ensure_type (type.rb:63-79) tries `type_id_from_code` FIRST —
 *    the static `assign_type` registration for the card's first
 *    type-assigning pattern module, here `right::<setting_codename>`
 *    (lib/card/set/pattern/all.rb:74-82 walks patterns with
 *    `assigns_type: true`, which the right pattern declares) — THEN
 *    `type_id_from_template` (the set's *default rule card's type).
 *  - TYPE_PLUS_RIGHT (08_type_plus_right.rb): a `+<right>` part under a
 *    typed supercard; the template chain reads the set's own *default
 *    rule card's type (the TPR static assignments
 *    type_plus_right::<type>::<right> precede it — only three exist
 *    across the mods).
 *  - ALL / RSTAR / ALL_PLUS: prototype_args give a nameless or
 *    `*dummy`-named new card: type_id_from_code has no matching
 *    assignment, and type_id_from_template is `name && template&.type_id`
 *    (nil for the nameless *all prototype; no *dummy template rows) —
 *    undefined, so every restricted setting is rejected.
 *
 *  Oracle-verified (2026-09-26, expected-v2): *all pins editing badge 3
 *  (structure/default/autoname only); `*home+*self` (prototype *home,
 *  stored Pointer) and `*create+*right` (assignment right::create=list)
 *  pin editing badge 5; the raw oracle's virtual `Exhibit+Item+*type
 *  plus right+*autoname` bar carries data-card-type-name Phrase
 *  (assignment right::autoname) and `...+*create` carries List
 *  (assignment right::create) — the assignment layer visible directly in
 *  the captured bytes. */
function setPrototypeTypeCode(fmt: RenderFormat, setCard: RenderCard): string | undefined {
  const engine = fmt.engine;
  /** Card::Codename[id] — the registry lookup is generic id -> codename
   *  (peekCodenameById reads peekNameForId; the param name reflects its
   *  dominant type-id use). */
  const codenameOf = (card: RenderCard | undefined): string | undefined =>
    card?.id !== undefined ? engine.peekCodenameById?.(card.id) : undefined;
  const defaultRuleTypeCode = (): string | undefined => {
    const rule = engine.collectRules?.(setCard).find((candidate) => {
      const rightKey = candidate.name.rightName?.key;
      return rightKey === "default" || rightKey === "*default";
    });
    if (rule === undefined || rule.typeId === undefined) return undefined;
    return engine.peekCodenameById?.(rule.typeId);
  };
  /** The set card's own pattern code: the RIGHT part's codename
   *  (*self / *right / *type / *type plus right) for anchored sets, the
   *  card's own codename for the anchorless *all / *rstar / *all plus
   *  set cards (set.rb subclass_for_set resolves the represented pattern
   *  from the same tag codename). */
  const rightName = setCard.name.rightName;
  const patternCode =
    rightName !== undefined
      ? codenameOf(engine.fetchRenderCard?.(rightName.s))
      : codenameOf(setCard);
  switch (patternCode) {
    // Anchorless patterns: prototype_args give a nameless or *dummy-named
    // new card — no type assignment applies and the template lookup has
    // no name to walk (type_id_from_template = `name && template&.type_id`
    // is nil for the nameless *all prototype) -> undefined rejects every
    // restricted setting.
    case "all":
    case "rstar":
    case "all_plus":
      return undefined;
    // 09_self.rb prototype_args {name: anchor}: the anchor card is REAL —
    // its stored type wins; an unseeded anchor falls through to the
    // template chain (the set's own *default rule card's type —
    // templating.rb new_card_template rule_card(:default)).
    case "self": {
      const anchorName = setCard.name.leftName?.s ?? setCard.name.s;
      const real = engine.fetchRenderCard?.(anchorName);
      if (real !== undefined && real.typeId !== undefined) {
        return engine.peekCodenameById?.(real.typeId);
      }
      return defaultRuleTypeCode();
    }
    // 03_type.rb prototype_args {type: anchor}: the explicit type wins
    // (type.rb normalize_type_attributes) — the prototype's type id IS
    // the anchor cardtype card's id.
    case "type": {
      const anchorName = setCard.name.leftName?.s;
      if (anchorName === undefined) return undefined;
      const typeCard = engine.fetchRenderCard?.(anchorName);
      if (typeCard?.id === undefined) return undefined;
      return engine.peekCodenameById?.(typeCard.id);
    }
    // 07_right.rb prototype_args {name: "*dummy+#{anchor}"}: a new
    // compound card; ensure_type (type.rb:63-79) tries type_id_from_code
    // FIRST — the static assign_type registration for the card's first
    // type-assigning pattern module, here right::<setting_codename>
    // (lib/card/set/pattern/all.rb:74-82 walks patterns carrying
    // `assigns_type: true`, which the right pattern declares) — THEN
    // type_id_from_template (the set's own *default rule card's type).
    case "right": {
      const anchorName = setCard.name.leftName?.s;
      const anchorCard =
        anchorName !== undefined ? engine.fetchRenderCard?.(anchorName) : undefined;
      const anchorCodename = codenameOf(anchorCard);
      if (anchorCodename !== undefined) {
        const assigned = RIGHT_SETTING_TYPE_ASSIGNMENT[anchorCodename];
        if (assigned !== undefined) return assigned;
      }
      return defaultRuleTypeCode();
    }
    // 08_type_plus_right.rb: a `+<right>` part under a typed supercard;
    // type_id_from_code reads type_plus_right::<type>::<right> (only
    // three assignments exist across the mods), then the template chain
    // reads the set's own *default rule card's type.
    case "type_plus_right": {
      const leftName = setCard.name.leftName;
      const typeName = leftName?.leftName?.s;
      const anchorRightName = leftName?.rightName?.s;
      if (typeName !== undefined && anchorRightName !== undefined) {
        const typeCodename = codenameOf(engine.fetchRenderCard?.(typeName));
        const rightCodename = codenameOf(engine.fetchRenderCard?.(anchorRightName));
        if (typeCodename !== undefined && rightCodename !== undefined) {
          const assigned = TYPE_PLUS_RIGHT_TYPE_ASSIGNMENT[`${typeCodename}::${rightCodename}`];
          if (assigned !== undefined) return assigned;
        }
      }
      return defaultRuleTypeCode();
    }
    default:
      return undefined;
  }
}

/** card-1.110.0 Type.assignment for right-pattern module keys — every
 *  `assign_type` declaration in set/right/*.rb across the loaded mods
 *  (grep 2026-09-26; lib/card/set/advanced_api.rb:5-7 registers
 *  Type.assignment[module_key]). Keys are the LEFT (setting) card's
 *  codename; values the assigned type code. */
const RIGHT_SETTING_TYPE_ASSIGNMENT: Readonly<Record<string, string>> = {
  autoname: "phrase",
  email: "phrase",
  password: "phrase",
  roles: "search_type",
  salt: "phrase",
  status: "phrase",
  when_created: "phrase",
  when_last_edited: "phrase",
  input_type: "pointer",
  thanks: "phrase",
  bcc: "list",
  cc: "list",
  from: "list",
  subject: "phrase",
  text_message: "plain_text",
  to: "list",
  contextual_class: "list",
  disappear: "toggle",
  follow: "list",
  follow_fields: "list",
  following: "list",
  message: "phrase",
  head: "html",
  on_create: "list",
  on_delete: "list",
  on_update: "list",
  enabled_roles: "session",
  layout: "pointer",
  content_option_view: "phrase",
  content_options: "list",
  create: "list",
  delete: "list",
  read: "list",
  update: "list",
  captcha: "toggle",
  right: "set",
  self: "set",
  type: "set",
  type_plus_right: "set",
  count: "search_type",
};

/** type_plus_right::<type>::<right> assignments — the complete set across
 *  the mods (card-mod-account set/type_plus_right/role/members.rb:3 list;
 *  card-mod-rules set/type_plus_right/set/setting.rb:1 list;
 *  card-mod-style set/type_plus_right/set/style.rb:3 pointer). */
const TYPE_PLUS_RIGHT_TYPE_ASSIGNMENT: Readonly<Record<string, string>> = {
  "role::members": "list",
  "set::setting": "list",
  "set::style": "pointer",
};

/** The six fixed Card::Setting.groups keys (card-1.110.0 lib/card/setting.rb
 *  :45-54). Ruby's category_accordion iterates these in order; the captured
 *  oracle pins every group with the set's rules, even those with zero
 *  rules (the "0" count badge). Exported for the engine's prepare-phase
 *  virtual-rule verdict pre-population (render.ts#preloadVirtualRuleVerdicts
 *  mirrors views.ts#renderSettingListItems' iteration so every (setCard,
 *  settingCodename) pair the sync view path constructs gets a verdict
 *  before the view fn reads it). */
export const SETTING_GROUPS: ReadonlyArray<string> = [
  "templating",
  "permission",
  "webpage",
  "editing",
  "event",
  "other",
];

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
 *  registration-position order (Card::Setting.groups[group];
 *  register_setting's set_position inserts at the declared `position:`
 *  as mods load, setting.rb:101-110 — sparse-slot semantics, nils
 *  compacted by visible_settings' reject).
 *
 *  ORACLE-PINNED order (expected-v2, 2026-09-26; consistent across all
 *  844 captured set pages in both oracles):
 *  - templating [structure, default, autoname]: registrations autoname
 *    position 4 (core mod, loads first -> sparse [nil,nil,nil,autoname]),
 *    then default position 2 (fills slot 2), then structure position 2
 *    (slot 2 occupied -> insert BEFORE default, setting.rb:105-106) —
 *    autoname LAST. Raw oracle *all:content lis: [DENIED, DENIED,
 *    *all+*autoname]; fixture corpus shard-000000:119 (*input
 *    type+*right): [DENIED, ...+*default, DENIED, ...] — default SECOND
 *    in both. The earlier [autoname, default, structure] reading misread
 *    a denial span as an ordering anchor (the "corpus:268" pin).
 *  - webpage [head, layout, style, script] (positions 1, 3, -, 5) —
 *    script's insertion at the occupied tail slot puts it AFTER style.
 *  - permission [create, read, update, delete, captcha] (1, 2, 3, 4, -).
 *  - editing [help, input_type, guide, content_options,
 *    content_option_view] (1, -, 3, 5, 6).
 *  - event [on_create, on_update, on_delete] (1, 2, 3).
 *  - other [thanks, follow_fields, follow] (3, 5, 7 with nil holes
 *    compacted).
 *  Exported for the engine's prepare-phase virtual-rule verdict
 *  pre-population (see SETTING_GROUPS above). */
export const GROUP_TO_SETTINGS: Readonly<Record<string, ReadonlyArray<string>>> = {
  templating: ["structure", "default", "autoname"],
  permission: ["create", "read", "update", "delete", "captcha"],
  webpage: ["head", "layout", "style", "script"],
  editing: ["help", "input_type", "guide", "content_options", "content_option_view"],
  event: ["on_create", "on_update", "on_delete"],
  other: ["thanks", "follow_fields", "follow"],
};

/** Settings Ruby's visible_settings filters OUT of every set card's
 *  setting list in the captured oracle's mod set.
 *
 *  Mechanism (card-mod-rules set/type/set.rb:77-86 visible_settings):
 *  each group setting must pass `applies_to_cardtype(prototype.type_id)`
 *  (card-1.110.0 lib/card/setting.rb:74-77) = restricted_to_type includes
 *  the prototype type AND the setting's `applies` lambda passes.
 *  content_options and content_option_view (the only restricted settings
 *  in the loaded mods — card-mod-list set/self/content_options.rb:2 and
 *  set/self/content_option_view.rb:2, restricted_to_type list/pointer/
 *  session) additionally gate on `prototype.rule_card(:input_type)
 *  .supports_content_options?` / `supports_content_option_view?` — and
 *  those predicates are FALSE for every card in this mod set
 *  (card-mod-list set/all/supports_content_options.rb:8-15 defines the
 *  all-set defaults false; grep over the loaded gems finds no overriding
 *  set module). The lambdas are therefore constant-false for every
 *  prototype and both settings render for NO set card: the oracle pins
 *  3 editing lis (help, input_type, guide — badge "3") on *sidebar+*self.
 *  Kept as a named filter (not a table deletion) so a future mod port
 *  that overrides the predicates extends this one place. */
const SETTING_NEVER_VISIBLE: ReadonlySet<string> = new Set([
  "content_options",
  "content_option_view",
]);

/** The group's visible settings for one set card — Ruby's
 *  visible_settings(group) collapsed to the deck-wide filter above (the
 *  restricted_to_type arm is subsumed: the applies predicate excludes
 *  these settings for EVERY prototype, list/pointer prototypes included).
 *  The list length feeds the accordion's count badge
 *  (rule_lists.rb:58 count_badge(list.size)). */
export function visibleGroupSettings(groupName: string): ReadonlyArray<string> {
  return GROUP_TO_SETTINGS[groupName].filter(
    (codename) => !SETTING_NEVER_VISIBLE.has(codename),
  );
}

/** The right part's setting codename (without the leading "*"). The
 *  card-mod-rules card.type_card setting card has codename = the bare
 *  name (e.g., "default", "head", "structure"). */
function inferSettingCodename(rule: RenderCard): string | undefined {
  const rightKey = rule.name.rightName?.key;
  if (rightKey === undefined) return undefined;
  // Strip leading "*" if present (codename lookup uses bare name).
  return rightKey.startsWith("*") ? rightKey.slice(1) : rightKey;
}

/** Render one pointer/list item slot around the bar body. The slot
 *  shape splits on the item's READ permission, and both oracles agree
 *  on the split:
 *   * read-denied item (known-but-denied or unknown/phantom): the
 *     mini_bar slot wrap with the denied-spans bar body. Corpus v2
 *     survey: 229/229 pointer-item slots carrying the mini_bar id/class
 *     wrap a read-DENIED item (recapture-shard-000000 entries 400/755
 *     et al. — every one a swtktey-typed denied card).
 *   * readable item: the `bar-view` slot nestRecord produced, with the
 *     full titled bar body. Corpus v2 pins it for the readable items
 *     (42 slots, e.g. id 45410 "yol" content view -> items
 *     awheasxlcszvy-bar-view with data-card-id and the bar-left
 *     card-title body); the live wire pins the same shape
 *     (tmp/live-wire/Aikido_Oak_Cliff.html: the Aikido Oak Cliff+related
 *     list renders `id="aikido_oak_cliff-gallery-bar-view"`
 *     class="card-slot bar-view ..." with the full bar — never
 *     mini_bar). The prior unconditional swap produced mini_bar for
 *     these readable items and failed both oracle families. */
function renderPointerListItem(fmt: RenderFormat, name: string): string {
  // The HOST's item_type_name (card-mod-collection item.rb:149-162
  // determine_item_view_options_type): every item nest carries
  // `options[:type] = card.item_type_name` when the host resolves one, so
  // the item slot's data-slot JSON gains `"type"` (voo.slot_options) and
  // unknown items are constructed typed (new_unknown_item_args,
  // item.rb:245-248). Resolved per host in the prepare phase; undefined =
  // the host has no item type (the type-less JSON the pre-lane bytes
  // pinned).
  const hostItemType = fmt.engine.hostItemTypeName?.(fmt.card);
  const slotTypeName = hostItemType?.typeName;
  // fetchRenderCard parses the item line (DeckoName.parse) — an item line
  // carrying an ID/codename mark whose id the name environment's sync peek
  // cannot resolve (the lexicon temp cache evicts itself at 10000 keys;
  // name.ts#badMark raises) must degrade to the PHANTOM path like any
  // other fetch miss, never fail the whole render. Same tolerance shape
  // as the prepare-phase item walk (render.ts enrichPointerListItems).
  let target: ReturnType<RenderFormat["engine"]["fetchRenderCard"]>;
  try {
    target = fmt.engine.fetchRenderCard(name);
  } catch (err) {
    if (
      err instanceof CodenameNotFoundError ||
      err instanceof NameNotFoundError
    ) {
      const phantom = phantomPointerListItem(name, phantomIdentity(fmt, name, hostItemType));
      const body = pointerListItemBodyForUnknown(name);
      return pointerListItemSlot(phantom, body, slotTypeName);
    }
    throw err;
  }
  if (target === undefined) {
    // Phantom item: the captured oracle (corpus:77 inner yzzw, and
    // every phantom across the corpus) renders a full mini_bar slot
    // wrap with the bar-shaped body containing two denied spans.
    // The identity chain is new_unknown_item_args' host item type
    // (item.rb:245-248) falling to the *default template walk
    // (type.rb:78-80 type_id_from_template — the engine's
    // newCardDefaultType, which lands on the corpus's *all+*default
    // 22281 BasicCs), then the corpus's BasicCs pin.
    const phantom = phantomPointerListItem(name, phantomIdentity(fmt, name, hostItemType));
    const body = pointerListItemBodyForUnknown(name);
    return pointerListItemSlot(phantom, body, slotTypeName);
  }
  // Known card: dispatch the bar view through nestRecord so the
  // permission gate, prepare hooks, and bar.haml body all run as in
  // the standalone item-bar path.
  //
  // The read-denied KNOWN item renders the BARE quiet-denial span: the
  // nested :bar render short-circuits at the view-permission gate into
  // the span (no slot wrap), leaving exactly
  // `<div class="pointer-item item-bar"><span class="denied">...`.
  // expected-v2 census: 538 bare-span denied items (every one a REAL
  // cards row — e.g. "ABCglobal 20100722 Iris Nick Leon Brandon" under
  // "Center for Embodied Change+Pages" open) vs 270 mini_bar slots
  // carrying denial bodies — and EVERY one of those 270 is an
  // ABSENT-ROW item the phantom path above already covers (Test Person
  // 01 / Aikido as Peace Practice, the anonymizer-renamed BasicCs
  // family). Ruby's bar view declares `unknown: :mini_bar`
  // (card-mod-bar_and_box set/all/bar.rb:9) — the mini_bar slot is the
  // UNKNOWN-card substitution, never the readable-card denial shape;
  // the readable-card denial is altered_view's span substitution
  // (view/permission.rb:19-23). The prior explicit mini_bar wrap for
  // denied KNOWN items was the anonymized-corpus shape (where the
  // anonymizer renamed rows and every denied item was a fetch miss)
  // and byte-mismatched every real-denied item in this corpus.
  //
  // The slot-type opt (determine_item_view_options_type,
  // card-mod-collection item.rb:149-162) folds at the NEST level,
  // before any view gate runs, so it rides the readable item's
  // nestRecord opts below; the denied KNOWN item's bare span emits no
  // slot wrap at all (the census above) — no slot JSON, no type field.
  // The type opt's slot-JSON surface is the readable and phantom item
  // paths, which carry it above and below (merge pass 3: the
  // slotjson-type lane's threading retained on both slot-emitting
  // branches; the denied-branch wrap it threaded is retired by the
  // permission lane's census).
  return fmt.nestRecord(target, "bar", {
    nest_name: target.name.s,
    show: ["bar"],
    hide: ["bar_middle"],
    home_view: "bar",
    ...(slotTypeName !== undefined ? { type: slotTypeName } : {}),
  });
}

/** The unknown-item identity chain (new_unknown_item_args, item.rb:245-248
 *  `itype = args[:type] || item_type_name`, falling through Card.new's
 *  ensure_type_id to the *default template walk — type.rb:78-80
 *  type_id_from_template, the engine's newCardDefaultType — and finally the
 *  corpus's *all+*default 22281 BasicCs pin inside phantomPointerListItem).
 *  The host's resolved item type wins when it resolves one; undefined
 *  otherwise. */
function phantomIdentity(
  fmt: RenderFormat,
  name: string,
  hostItemType: { typeName: string; typeId: number } | undefined,
): { typeName: string; typeId: number } | undefined {
  if (hostItemType !== undefined) return hostItemType;
  try {
    return fmt.engine.newCardDefaultType?.(DeckoName.parse(name));
  } catch (err) {
    if (err instanceof CodenameNotFoundError || err instanceof NameNotFoundError) {
      return undefined;
    }
    throw err;
  }
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
  // The SEARCH host's own item_type_name rides the item nest exactly like
  // the pointer/list path: card_list_item -> nest_item (card-mod-search
  // 0_search/views.rb:132-136) -> item_view_options ->
  // determine_item_view_options_type (item.rb:157-162). The cql :type
  // value (cql_search.rb:14-19) lands in each item slot's data-slot JSON.
  const hostItemType = fmt.engine.hostItemTypeName?.(fmt.card);
  const rendered = items.map((item) => {
    // collection item.rb#nest_item: options = voo.items + (size: voo.size);
    // view ||= implicit_item_view (html default_item_view = :bar).
    const html = fmt.nestRecord(item, "bar", {
      size: null,
      ...(hostItemType !== undefined ? { type: hostItemType.typeName } : {}),
    });
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
const barRightView: ViewFn = ({ fmt }) => ruleBarRightHtml(fmt.card, fmt.engine);

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
  // CLUSTER 3 (set-card-pointer-list-vs-nested-content, 690 entries on
  // shard-0): for pointer/list cardtypes Ruby's open-view accordion body
  // wraps the `<div class="card-list … pointer-list">` in a
  // `<div id="X-content-view" class="card-slot content-view …">` slot
  // UNLESS the card matches the rule+permission-right shape (right is
  // `*create` / `*read` / `*update` / `*delete` — corpus:6551
  // *star+*create list rule at fixtures/corpus/shard-000003.jsonl:359,
  // the permfix48 pin). The latter shape is the SAME pattern that
  // pointer-list.ts#isRuleCardWithPermissionRight checks (the OUTER
  // wrapper branches on the same predicate — the simple
  // `<div class="pointer-list">` for the rule+permission shape, the
  // full `<div class="card-list card-list-bar pointer-list">` for
  // everyone else). The two checks align: when Ruby skips the OUTER
  // prefix it also skips the surrounding content-view slot.
  const skipContentWrap =
    isRuleCard || isRuleCardWithPermissionRight(card);
  if (isPointerOrListCard(card)) {
    if (skipContentWrap) {
      // Rule pointer/list (3-part RULE) OR rule+permission-right pointer/
      // list (corpus:6551 *star+*create, 2-part name with right
      // *create): Ruby emits the simple pointer-list wrapper directly
      // inside the accordion-body (no surrounding content-view slot —
      // the same shape pointer-list.ts#isRuleCardWithPermissionRight
      // branches on for the OUTER wrapper).
      return fmt.renderView("core", { home_view: "content" });
    }
    // Non-rule pointer/list: Ruby wraps the pointer-list in a
    // content-view slot (corpus:77 *home at
    // fixtures/corpus/shard-000000.jsonl:44, corpus:792 Brandon
    // WilliamsCraig+Pages, and the 690-entry shard-0 cluster). The
    // `home_view: "content"` opt rides into the nested content view's
    // voo. Per-item slots inside the list still dispatch through
    // renderPointerListItem and carry `view:"bar"` in their data-slot
    // — the change is strictly the OUTER accordion-body wrapper, not
    // the per-item mini_bar slots.
    return fmt.renderView("content", { home_view: "content" });
  }
  // CLUSTER 9/22/40 (rules-form-vs-content-view-generalized,
  // rules-form-filter-vs-content-view): for 3-part rule-card composition
  // junctions X+Y+*type plus right and X+Y+*self (Cardtype+description+
  // *type plus right at tmp/raw-ground-truth/expected/recapture-raw-
  // shard-000003.jsonl:6554 — open-view length 68009 vs engine 9627),
  // Ruby emits a nested `<div id="X-Y-Xtype_plu_right-content-view"
  // class="card-slot content-view …">` slot wrapping the SET card's
  // Rules section body, while the engine emits the Rules form directly
  // (the setRulesCoreHtml return, with no content-view slot around it).
  // The Ruby dispatch for these cards goes through the TYPE-PLUS-RIGHT
  // or SELF set module's :core view, which the engine's `if (isRuleCard)
  // … renderView("core")` branch short-circuits. Fix: for the 3-part
  // composition junction shape (the "right name is *type plus right or
  // *self" predicate below), keep the content-view slot wrap by taking
  // the default `renderView("content", …)` branch — the wrapped content
  // view then calls coreView again, which dispatches setRulesCoreHtml
  // for typeCode === "set" (the card IS a Set type) and emits the
  // captured setKeys including TYPE-set + RIGHT-Xtype_plu_right + the
  // d0-card-content class_up from the content-view hook. Test pins:
  // recapture-raw:Cardtype+description+*type plus right:render:open
  // (offset 2842, exp 68009, act 9627) and
  // recapture-raw:Item+Contributor+*type plus right:render:open (the
  // shard-0 cluster 40 sample; exp 65327, act 12131).
  const rightKey = card.name.rightName?.key;
  const isRuleCardCompositionJunction =
    card.name.isCompound &&
    card.name.parts.length === 3 &&
    (rightKey === "*type plus right" || rightKey === "*self");
  if (isRuleCard && !isRuleCardCompositionJunction) {
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
  // CLUSTER follow-up (A-33, assumption-audit): card-mod-comment
  // set/right/discussion.rb:1-6 overrides :open, :open_content, :titled,
  // :titled_content for right-discussion cards — each runs
  // `voo.show :comment_box` before super(). The openView twin above
  // already open-codes it; without the same hook here the engine omits
  // comment_box from the titled slot's show list. Live receipt
  // (Conflict_Done_Well.html `+discussion|titled` slot):
  // show:["titled","comment_box"]. (:open_content/:titled_content are
  // omitted deliberately: their ported bodies carry no slotOptions wrap,
  // so a show flag there is unobservable — only :open and :titled emit
  // slot JSON on this surface.)
  if (fmt.card.name.rightName?.key === "discussion") {
    voo.setViz("comment_box", "show");
  }
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

/** card-mod-format set/self/home.rb view :home_path (perms :none):
 *  `card_path ""` — the deck-root path. Self-set scoped in Ruby; the flat
 *  registry scopes by card key here (any other card raises the
 *  unsupported-view UserError, matching the Ruby missing-method walk).
 *  Pinned by the *header navbar bytes ({{:home|home_path}} -> "/"). */
const homePathView: ViewFn = ({ fmt }) => {
  if (fmt.card.key !== "*home") {
    throw new UnsupportedViewError("home_path", fmt.card.name.s);
  }
  return "/";
};

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
  home_path: homePathView,
  // The page-lane navbar family (card-mod-layout navbar_links/nav_item/
  // nav_link_in_dropdown + card-mod-search search_box) — set-scoped inside
  // each fn; see src/card/render/navbar-views.ts.
  ...NAVBAR_VIEWS,
};
