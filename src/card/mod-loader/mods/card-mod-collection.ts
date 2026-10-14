// The card-mod-collection gem (card-mod-collection-0.20.0), ported through
// the mod loader.
//
// The gem's tree (the installed
// card-mod-collection-0.20.0/): six set files (3 abstract, 3 all), one
// lib/ class (Card::PagingLinks - pure data structure, no Rails), and one
// HAML template. Exactly three views the engine does not already cover:
//   count, paging, paging_urls.
//
// Ported here:
// - set/all/item.rb:118-120 (base format view :count) +
//   set/all/item.rb:179-182 (html format view :count with number_with_delimiter)
//   - both formats share the same registered view in the html registry; the
//   html body wins on html cards. The base body is `try :count` which
//   resolves to the card's item-count helper; the html body wraps that in
//   number_with_delimiter. Headlessly: dbContent is the canonical newline-
//   joined item list (item.rb#raw_item_strings: split /\n+/, strip);
//   item_names.size matches that count.
// - set/abstract/paging/paging_views.rb:27-73 (html format block:
//   view :paging + helpers show_paging?/with_paging/paging_links/
//   page_link_li/page_link_li_class/page_link/with_paging_path_args/
//   paging_path_args/page_link_path_args) - the html paging surface.
//   Backed by set/abstract/paging/paging.haml:1-12 and lib/card/paging_links.rb
//   (the PagingLinks class - ported verbatim to TS).
//
// NOT ported (honest remainder):
// - set/abstract/paging/paging_views.rb:75-104 (json format block:
//   paging_urls_hash + view :paging_urls, cache: :never): declared on
//   format :json only. The engine's render pipeline is html-only (the
//   HTML_VIEWS table is the only format populated); JSON/JSONLD views
//   have no live render path. The Ruby code also depends on `path`
//   (the Rails url helper) which the headless engine does not provide.
// - set/abstract/paging/paging_views.rb:106-120 (jsonld format block:
//   view :paging_urls, the hydra:PartialCollectionView emission): same
//   format-availability blocker as the json branch.
// - set/all/item.rb methods (item_names/item_cards/item_ids/item_strings/
//   first_name/first_card/.../nest_item/item_links/implicit_item_view/...):
//   the engine has no cardtype surface for "list/pointer" type cards (the
//   Abstract::List set module lives in card-mod-list, not card-mod-
//   collection); porting item_methods here would register them as
//   view-table helpers no cardtype activates.
// - set/all/item_assignment.rb (items=/<</add_item!/drop_item/drop_item!/
//   insert_item/insert_item!/replace_item/items_content/standardize_item/
//   standardize_items): write-path machinery, save!/content mutators -
//   outside the render pipeline.
// - set/all/recursed.rb (recursed_item_cards/recursed_item_contents/
//   recursable_items?): recursive item walk helpers, no views.
// - set/abstract/items.rb (recursable_items?/item_type_id): overrides,
//   no views.

import type { ViewContext, ViewFn } from "../../render/format.js";
import type {
  DeckoModManifest,
  ModEventCard,
  ModSetModuleFile,
} from "../mod-manifest.js";

// ---------------------------------------------------------------------------
// lib/card/paging_links.rb - the pure-Ruby PagingLinks class, ported to TS
// ---------------------------------------------------------------------------

/** paging_links.rb:4 MAX_PAGES = 100. The total page list is truncated at
 *  100 entries to bound the rendered `<li>` count; pages 101+ collapse to
 *  the "..." ellipsis. */
const MAX_PAGES = 100;

/** paging_links.rb:6-9 initialize total_pages, current_page. */
class PagingLinks {
  readonly totalPages: number;
  readonly currentPage: number;
  private windowStart = 0;
  private windowEnd = 0;
  // Render callback: paging_links.rb#@render_item.call text, page, status,
  // options. Populated by build() and invoked once per emitted link.
  private renderItem:
    | ((
        text: string,
        page: number | null,
        status: LinkStatus,
        options: LinkOptions,
      ) => string)
    | undefined;

  constructor(totalPages: number, currentPage: number) {
    this.totalPages = totalPages;
    this.currentPage = currentPage;
  }

  /** paging_links.rb:19-22 build window=2: stores the block, walks the
   *  page-link set in left-part + window-part + right-part order. */
  build(
    window: number,
    block: (
      text: string,
      page: number | null,
      status: LinkStatus,
      options: LinkOptions,
    ) => string,
  ): string[] {
    this.renderItem = block;
    return this.links(window);
  }

  /** paging_links.rb:26-30 links window: clamps the window to [0, total]
   *  and emits left + window + right. leftPart returns (string|null)[]
   *  because each entry is conditionally included; the spread below flattens
   *  to a flat (string|null)[] which .filter narrows back to string[]. */
  private links(window: number): string[] {
    this.windowStart = Math.max(this.currentPage - window, 0);
    this.windowEnd = Math.min(this.currentPage + window, this.totalPages);
    const flat: (string | null)[] = [
      ...this.leftPart(),
      ...this.windowPart(),
      ...this.rightPart(),
    ];
    return flat.filter((s): s is string => s !== null);
  }

  /** paging_links.rb:33-37 window_part: one direct_page_link per page in
   *  [window_start, window_end]. compact drops nils (page outside
   *  [0, total]). */
  private windowPart(): string[] {
    const out: string[] = [];
    for (let page = this.windowStart; page <= this.windowEnd; page++) {
      const link = this.directPageLink(page);
      if (link !== null) out.push(link);
    }
    return out;
  }

  /** paging_links.rb:39-45 left_part: previous link, the first page link
   *  if the window doesn't start at 0, the ellipse if the window starts
   *  past page 1. compact drops nils. */
  private leftPart(): (string | null)[] {
    return [
      this.previousPageLink(),
      this.windowStart > 0 ? this.directPageLink(0) : null,
      this.windowStart > 1 ? this.ellipse() : null,
    ];
  }

  /** paging_links.rb:47-52 right_part: the next link, optionally preceded
   *  by the final page link (when @total <= MAX_PAGES and @total > window
   *  end) and optionally preceded by the ellipse (when @total > window_end
   *  + 1). The Ruby Array#unshift prepends; the TS port builds the array
   *  in reverse-insertion order so the spread flattens to the same shape. */
  private rightPart(): string[] {
    const parts: (string | null)[] = [];
    if (this.totalPages > this.windowEnd + 1) parts.push(this.ellipse());
    if (this.addFinalPage()) parts.push(this.directPageLink(this.totalPages));
    parts.push(this.nextPageLink());
    return parts.filter((p): p is string => p !== null);
  }

  /** paging_links.rb:54-56 add_final_page?: total within MAX_PAGES AND
   *  total not already in the window. */
  private addFinalPage(): boolean {
    return this.totalPages <= MAX_PAGES && this.totalPages > this.windowEnd;
  }

  /** paging_links.rb:58-61 previous_page_link: text "<span ...>&laquo;</span>",
   *  page = current - 1 if positive, status: :previous. */
  private previousPageLink(): string {
    return this.pagingItem(
      '<span aria-hidden="true">&laquo;</span>',
      this.previousPage(),
      { "aria-label": "Previous", status: "previous" },
    );
  }

  /** paging_links.rb:63-66 next_page_link: text "<span ...>&raquo;</span>",
   *  page = current + 1 if < total, status: :next. */
  private nextPageLink(): string {
    return this.pagingItem(
      '<span aria-hidden="true">&raquo;</span>',
      this.nextPage(),
      { "aria-label": "Next", status: "next" },
    );
  }

  /** paging_links.rb:68-72 direct_page_link page: nil if page not in
   *  [0, total]; else paging_item page+1 (display), page (target). */
  private directPageLink(page: number): string | null {
    if (page < 0 || page > this.totalPages) return null;
    return this.pagingItem(String(page + 1), page, {});
  }

  /** paging_links.rb:74-76 ellipse: text "<span>...</span>", page=nil,
   *  status: :ellipses. */
  private ellipse(): string {
    return this.pagingItem("<span>...</span>", null, { status: "ellipses" });
  }

  /** paging_links.rb:78-86 paging_item text, page, options: status is
   *  :current when page matches @current, otherwise options[:status] (which
   *  is deleted from the hash before render so it doesn't leak into the
   *  page link). The render block gets text, page, status, the trimmed
   *  options hash. */
  private pagingItem(
    text: string,
    page: number | null,
    options: LinkOptions,
  ): string {
    let status: LinkStatus;
    if (page === this.currentPage) status = "current";
    else status = (options.status ?? null) as LinkStatus | null;
    const cleaned: LinkOptions = { ...options };
    delete cleaned.status;
    const cb = this.renderItem;
    if (cb === undefined) throw new Error("paging_links: render block missing");
    return cb(text, page, status as LinkStatus, cleaned);
  }

  /** paging_links.rb:88-90 previous_page: current - 1 if positive, else
   *  false. False becomes null at the call site (the Ruby :false falsy
   *  vs the TS null/undefined distinction). */
  private previousPage(): number | null {
    return this.currentPage > 0 ? this.currentPage - 1 : null;
  }

  /** paging_links.rb:92-94 next_page: current + 1 if < total, else false. */
  private nextPage(): number | null {
    return this.currentPage < this.totalPages ? this.currentPage + 1 : null;
  }
}

/** The :status field paging_links.rb#paging_item threads to the page_link_li
 *  callback. Ruby uses symbols (:current, :next, :previous, :ellipses, or
 *  nil for plain links); the TS port narrows to a fixed union for clarity. */
type LinkStatus = "current" | "next" | "previous" | "ellipses" | null;

/** Options hash paging_links.rb#paging_item cleans + forwards to the
 *  page_link_li block. The :status key is removed before forwarding;
 *  everything else passes through (the html path uses it to seed aria-*). */
interface LinkOptions {
  status?: LinkStatus;
  "aria-label"?: string;
  [key: string]: unknown;
}

/** paging_views.rb:18 PAGE_LI_CLASS = { ellipses: "disabled",
 *  current: "active" }.freeze - the `<li>` class fragment that joins
 *  "page-item" in page_link_li_class. */
const PAGE_LI_CLASS: Record<string, string> = {
  ellipses: "disabled",
  current: "active",
};

// ---------------------------------------------------------------------------
// set/all/item.rb - the count view (base + html)
// ---------------------------------------------------------------------------

/** item.rb:201-203 raw_item_strings content: `content.to_s.split(/\n+/).
 *  map { |i| strip_item i }` where strip_item removes [[/]] brackets and
 *  trims whitespace. The TS port mirrors this exactly - the headless card's
 *  dbContent IS the newline-joined item list, and the count view reads it
 *  back through the same splitter. Empty lines are filtered out (the split
 *  on /\n+/ yields no empty strings, but a trailing newline on an otherwise
 *  empty content would yield [""] which is dropped). */
function rawItemStrings(content: string): string[] {
  if (content === "") return [];
  return content
    .split(/\n+/)
    .map((item) => item.replace(/^\[\[|\]\]$/g, "").trim())
    .filter((item) => item !== "");
}

/** item.rb:104-106 item_count args={}: `item_names(args).size` - the same
 *  quantity paging.rb:16-17 count_with_params reads as
 *  `card.item_names.count`. The headless port reads dbContent directly
 *  (the engine has no item_names helper); the count is the post-split,
 *  post-strip size. The html :count view (item.rb:179-182) and the paging
 *  helpers both consume this one count.
 *
 *  For a SEARCH card that reading is wrong: the card-mod-search
 *  set/abstract/0_search.rb:20-28 module REPLACES item_names with
 *  `returning(:name, args) { search args }` - the item list is the query
 *  result, not the stored CQL json, and count_with_params
 *  (0_search.rb:52-54) re-runs it with `return: :count`. The engine's
 *  seat holds exactly that number (render.ts searchItemCount, seated in
 *  runSearch beside the items). */
function itemCount(ctx: ViewContext): number {
  const count = ctx.fmt.engine?.searchItemCount?.(ctx.fmt);
  if (count !== undefined) return count;
  return rawItemStrings(ctx.fmt.card.dbContent).length;
}

/** The count of ITEMS in `search_with_params` — the rendered window, not the
 *  full count (fewer_results_than_limit?, paging_views.rb:11-15, compares the
 *  limit against `search_with_params.length`). For a search card that is the
 *  executed result list (search.rb:13-20 search_with_params); for every other
 *  card `card.item_names` IS the content item list (item.rb:15-22), so the
 *  content count stands. */
function searchResultItemCount(ctx: ViewContext): number {
  // executeSearch answers [] for any card the search warm never ran on, so
  // the seated full count (present only for an executed search) decides
  // which reading applies.
  if (ctx.fmt.engine?.searchItemCount?.(ctx.fmt) !== undefined) {
    return ctx.fmt.engine.executeSearch(ctx.fmt).length;
  }
  return itemCount(ctx);
}

/** item.rb:180-182 view :count (html format): `number_with_delimiter
 *  try(:count)`. Rails' number_with_delimiter adds thousand-separator
 *  commas in en-US locale (1234567 -> "1,234,567"). The TS port uses
 *  Intl.NumberFormat with the en-US locale, which produces the same
 *  byte sequence for non-negative integers; decimals preserve their
 *  fraction (Intl truncates trailing zeros, number_with_delimiter does
 *  not - the headless item-count is always an integer, so the divergent
 *  decimal path is unreachable from this view). */
function formatWithDelimiter(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

/** The HTML count view (item.rb:179-182): number_with_delimiter(item_count).
 *  Registered as :count on the html format block; the base format's
 *  :count is the integer-as-string shape, but in the html registry the
 *  later format :html block wins (registrar/view_definition.rb#18-21:
 *  reopening the module replaces define_method). The TS mod loader
 *  collapses this to a single registered :count, with the html body. */
const countView: ViewFn = (ctx) => formatWithDelimiter(itemCount(ctx));

// ---------------------------------------------------------------------------
// set/abstract/paging.rb - the limit/offset/count helpers
// ---------------------------------------------------------------------------

/** paging.rb:5-6 limit and :8-9 offset: `contextual_param(:limit) ||
 *  default_limit` / `contextual_param(:offset) || 0` - one
 *  contextual_param read, the key the only difference (env_search_param -
 *  the Rails request env - first, then voo.cql[:key]). The headless port
 *  reads from voo.opts[key] (the render's render_opt); absent, Ruby's
 *  `|| default_limit` decides the limit. */
function readNumericOpt(ctx: ViewContext, key: "limit" | "offset"): number {
  const fromOpts = ctx.voo.opts[key];
  if (typeof fromOpts === "number") return fromOpts;
  if (typeof fromOpts === "string" && fromOpts !== "") {
    const n = Number(fromOpts);
    return Number.isFinite(n) ? n : 0;
  }
  return key === "limit" ? defaultLimit(ctx) : 0;
}

/** paging.rb:15-17 paging_params merge the effective
 *  `{limit:, offset:}` over the card's own cql hash
 *  (cql_search.rb:70-74 standardized_query_args), and Ruby's `limit` is
 *  `contextual_param(:limit) || default_limit` - so the format's
 *  default_limit IS the limit of the paged window whenever no render opt
 *  overrides it.
 *
 *  default_limit, by format (paging.rb:41-43 plus the format blocks):
 *  - search cards (card-mod-search set/abstract/cql_search.rb:80-94:
 *    `card_content_limit || super`, in both the base and the html block):
 *    the cql hash's own `limit` (cql_search.rb:85-87
 *    `card.cql_hash&.dig :limit`) when the card declares one, else the
 *    format default. A cql `limit: 0` is Ruby-truthy and means unlimited,
 *    and so does a `limit` of 0 for the offset fallback - Ruby's `||`
 *    never sees it.
 *  - every other card: the format default (paging.rb:50-54 html
 *    `Cardio.config.paging_limit || 20`; the base block's 100 and the
 *    json/rss blocks' 20/25 are unreachable from a render, which is
 *    always html).
 */
function defaultLimit(ctx: ViewContext): number {
  const fmt = ctx.fmt;
  const card = fmt.card;
  if (card.typeCode === "search" || card.typeName === "Search") {
    // card-content limit: cql_content is the card's cql hash, JSON-decoded
    // (cql_search.rb:8-12). A malformed cql is BadQuery - rescued higher
    // up (0_search.rb:66-77) - and never reaches a count, so the fallback
    // stands.
    let cql: Record<string, unknown> | undefined;
    try {
      const parsed: unknown = JSON.parse(card.dbContent);
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        cql = parsed as Record<string, unknown>;
      }
    } catch {
      cql = undefined;
    }
    const raw = cql?.["limit"];
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
    if (typeof raw === "string" && raw !== "") {
      const n = Number(raw);
      return Number.isFinite(n) ? n : 20;
    }
  }
  // card-mod-search lib/card/mod/search.rb:2 `config.paging_limit = 20`,
  // read by paging.rb:51-53 `Cardio.config.paging_limit || 20`.
  return 20;
}

/** paging.rb:24-28 total_pages: `return 1 if limit.zero?; (count - 1) / limit`.
 *  Ruby integer division; count < limit yields 0 here (no full page).
 *  Ruby's `((0) / 5).to_i = 0` - the TS port uses Math.floor to match. */
function totalPages(ctx: ViewContext): number {
  const limit = readNumericOpt(ctx, "limit");
  if (limit === 0) return 1;
  const count = itemCount(ctx);
  return Math.floor((count - 1) / limit);
}

/** paging.rb:30-34 current_page: `return 1 if limit.zero?; offset / limit`.
 *  Ruby's offset/limit returns the 0-based page index (page 0 is the first
 *  page). The TS port mirrors this. */
function currentPage(ctx: ViewContext): number {
  const limit = readNumericOpt(ctx, "limit");
  if (limit === 0) return 1;
  const offset = readNumericOpt(ctx, "offset");
  return Math.floor(offset / limit);
}

/** paging.rb:41-43 last_item_on_page: `[count, offset + limit].min`.
 *  Used in the paging-context div ("X-Y of Z"). */
function lastItemOnPage(ctx: ViewContext): number {
  const limit = readNumericOpt(ctx, "limit");
  const offset = readNumericOpt(ctx, "offset");
  return Math.min(itemCount(ctx), offset + limit);
}

// ---------------------------------------------------------------------------
// set/abstract/paging/paging_views.rb - the html block + the :paging view
// ---------------------------------------------------------------------------

/** paging_views.rb:2-4 show_paging?: `return false if limit < 1; return
 *  false if fewer_results_than_limit?; limit < count_with_params`. Three
 *  short-circuits: a zero/negative limit hides paging, an early-exit
 *  short-circuit hides paging when offset=0 and the item count already
 *  fits under the limit, and the canonical case hides paging when limit
 *  >= count. */
function showPaging(ctx: ViewContext): boolean {
  const limit = readNumericOpt(ctx, "limit");
  if (limit < 1) return false;
  if (fewerResultsThanLimit(ctx)) return false;
  return limit < itemCount(ctx);
}

/** paging_views.rb:11-15 fewer_results_than_limit?: `return false unless
 *  offset.zero?; limit > offset + search_with_params.length`. Only when
 *  offset=0 do we know the count WITHOUT running the count query (the
 *  search_with_params returns items, not names - so .length matches the
 *  ITEM count: the executed search's row count for a search card, the
 *  content item count for every other card). */
function fewerResultsThanLimit(ctx: ViewContext): boolean {
  const offset = readNumericOpt(ctx, "offset");
  if (offset !== 0) return false;
  return readNumericOpt(ctx, "limit") > offset + searchResultItemCount(ctx);
}

/** paging_views.rb:36-40 page_link_li_class status: `["page-item",
 *  PAGE_LI_CLASS[status]].compact.join " "`. compact drops the nil for
 *  statuses PAGE_LI_CLASS doesn't carry (:next/:previous/nil). */
function pageLinkLiClass(status: LinkStatus): string {
  const parts: string[] = ["page-item"];
  const cls = status !== null ? PAGE_LI_CLASS[status] : undefined;
  if (cls !== undefined) parts.push(cls);
  return parts.join(" ");
}

/** paging_views.rb:46-53 page_link text, page, options:
 *  - no page (the ellipsis, and previous/next at the edges):
 *    `content_tag(:div, text.html_safe, class: "page-link")`.
 *  - a page: `options.merge! class: ..., remote: true, path:
 *    page_link_path_args(page)` then the html `link_to` (card-mod-format
 *    set/all/links.rb:101-106): `opts[:href] ||= path opts.delete(:path)`
 *    appends href after the merged keys, and interpret_data_opts_to_link_to
 *    (links.rb:146-151) moves `remote` to a trailing `data-remote`. Rails
 *    content_tag writes the hash in insertion order, so the attributes read
 *    aria-label (paging_links.rb's option, when present), class, href,
 *    data-remote.
 *  The href is `path(limit:, offset:)` - the card's url path with the two
 *  query params in hash order (paging_path_args, paging_views.rb:63-72:
 *  `reverse_merge!(limit:, offset:)`, `merge offset: page * limit`;
 *  extra_paging_path_args is the empty hash of paging.rb:37-39). The `&`
 *  is escaped as `&amp;` in the attribute. */
function pageLink(
  text: string,
  page: number | null,
  options: LinkOptions,
  urlPath: string,
  limit: number,
): string {
  if (page === null) {
    return `<div class="page-link">${text}</div>`;
  }
  const ariaLabel = options["aria-label"];
  const ariaAttr = typeof ariaLabel === "string" ? ` aria-label="${ariaLabel}"` : "";
  return (
    `<a${ariaAttr} class="card-paging-link slotter page-link"` +
    ` href="${urlPath}?limit=${limit}&amp;offset=${page * limit}" data-remote="true">${text}</a>`
  );
}

/** paging_views.rb:29-33 paging_links: `PagingLinks.new(total_pages,
 *  current_page).build 5 do |text, page, status, options|; page_link_li
 *  text, page, status, options; end`. Window=5 (the Ruby literal).
 *  page_link_li (paging_views.rb:35-40) wraps each link in
 *  `<li class=...>`. */
function pagingLinks(ctx: ViewContext): string[] {
  const tp = totalPages(ctx);
  const cp = currentPage(ctx);
  const limit = readNumericOpt(ctx, "limit");
  const urlPath = `/${ctx.fmt.card.name.urlKey}`;
  return new PagingLinks(tp, cp).build(5, (text, page, status, options) => {
    const liClass = pageLinkLiClass(status);
    const link = pageLink(text, page, options, urlPath, limit);
    return `<li class="${liClass}">${link}</li>`;
  });
}

/** paging.haml:1-10, rendered by `view :paging, cache: :never, template:
 *  :haml` (paging_views.rb:27). Under `- if show_paging?`:
 *
 *    %nav.nav.justify-content-between.align-items-center
 *      %ul.pagination.paging
 *        = paging_links.join
 *      .paging-context
 *        = offset + 1
 *        = "-"
 *        = last_item_on_page
 *        of
 *        = count_with_params
 *
 *  Haml writes class attributes single-quoted, each tag and each line of
 *  inline content on its own line, the joined links on ONE line (`join`
 *  with no separator), and ends the document with a newline after
 *  `</nav>`. A hidden nav (show_paging? false) is the empty document. */
const pagingView: ViewFn = (ctx) => {
  if (!showPaging(ctx)) return "";
  const context = [
    String(readNumericOpt(ctx, "offset") + 1),
    "-",
    String(lastItemOnPage(ctx)),
    "of",
    String(itemCount(ctx)),
  ].join("\n");
  return (
    `<nav class='nav justify-content-between align-items-center'>\n` +
    `<ul class='pagination paging'>\n${pagingLinks(ctx).join("")}\n</ul>\n` +
    `<div class='paging-context'>\n${context}\n</div>\n` +
    `</nav>\n`
  );
};

// ---------------------------------------------------------------------------
// the manifest (one setModules entry per gem file; format :html block holds
// the two ported views). Files whose views are not ported carry a passive
// `{ setPath, formats: { html: { views: [] } } }` entry - written inline so
// the basket reflects the gem's set/ tree (registrar.rb walks every file
// regardless of whether the TS port registers a view on it).
// ---------------------------------------------------------------------------

const setModules: ModSetModuleFile[] = [
  // pattern: all (the "base" bucket per loader.rb#parts_from_path)
  {
    // card-mod-collection-0.20.0/set/all/item.rb - the item-list surface.
    // The base format's :count (item.rb:118-120 `try :count`) and the
    // html format's :count (item.rb:180-182 `number_with_delimiter`) are
    // the same view name in the html registry; the html body wins (Ruby
    // reopens the module - view_definition.rb:18-21). The TS port
    // collapses to a single :count registration whose body is the html
    // variant. All other item.rb methods (item_names/item_cards/...) are
    // view-table helpers no cardtype activates; not registered.
    setPath: "all/item",
    formats: {
      html: {
        views: [{ view: "count", viewFn: countView }],
      },
    },
  },
  {
    // card-mod-collection-0.20.0/set/all/item_assignment.rb - the
    // add_item/drop_item/insert_item/<</items=/items_content/etc. write
    // helpers. Methods only, no views. Registered as a passive entry so
    // the basket reflects the gem's tree.
    setPath: "all/item_assignment",
    formats: { html: { views: [] } },
  },
  {
    // card-mod-collection-0.20.0/set/all/recursed.rb - recursed_item_cards
    // /recursed_item_contents/recursable_items?/delegate. Methods only,
    // no views. Passive.
    setPath: "all/recursed",
    formats: { html: { views: [] } },
  },
  // pattern: abstract
  {
    // card-mod-collection-0.20.0/set/abstract/items.rb - recursable_items?
    // override + item_type_id. Methods only.
    setPath: "abstract/items",
    formats: { html: { views: [] } },
  },
  {
    // card-mod-collection-0.20.0/set/abstract/paging.rb - the format do
    // block (limit/offset/search_with_params/count_with_params/
    // no_results?/total_pages/current_page/extra_paging_path_args/
    // last_item_on_page/contextual_param/env_search_param/
    // legal_search_param/voo_search_param). The html :paging view lives
    // in the paging/ sub-file; this file is the format's method
    // surface. Methods only.
    setPath: "abstract/paging",
    formats: { html: { views: [] } },
  },
  {
    // card-mod-collection-0.20.0/set/abstract/paging/paging_views.rb -
    // the html format block (view :paging, cache: :never, template:
    // :haml) + helpers (show_paging?/with_paging/page_link_li/
    // page_link_li_class/page_link/with_paging_path_args/
    // paging_path_args/page_link_path_args) + json format block
    // (page_link_path_args override + view :paging_urls +
    // paging_urls_hash/add_paging_url) + jsonld format block
    // (view :paging_urls). Ported: the html :paging view.
    setPath: "abstract/paging/paging_views",
    formats: {
      html: {
        views: [
          // paging_views.rb:27 view :paging, cache: :never, template: :haml
          {
            view: "paging",
            viewFn: pagingView,
            config: { cache: "never" },
          },
        ],
      },
    },
  },
  // The HAML template (set/abstract/paging/paging.haml) is consumed
  // through the view's `template: :haml` config in Ruby; the TS port
  // inlines the template's bytes into the view function above so the
  // haml file has no separate registration.
];

// ---------------------------------------------------------------------------
// the when: predicate (set/all/item_assignment.rb)
// ---------------------------------------------------------------------------

/** unique_items? (item_assignment.rb:1-3) is the set-module method Ruby's
 *  `when:` reaches with `send` (card/lib/card/set/event/all.rb:82). The
 *  collection mod defines it `false` and NO set module in the deck's gem
 *  tree overrides it (the only definitions are this one and its one caller,
 *  item_assignment.rb:75 `array.uniq! if unique_items?`), so the answer is
 *  false for every card and :validate_item_uniqueness
 *  (mod/list set/abstract/01_list/events.rb:29-33) never fires — which is
 *  what events.rb:25-28's comment says ("At present this may never generate
 *  an error").
 *
 *  It reads the state field rather than hardcoding false, so a set module
 *  that DOES override it (a downstream deck can) has one place to answer.
 */
export const collectionModEventPredicates = {
  "unique_items?": (card: ModEventCard): boolean => card.uniqueItems === true,
} as const;

const cardModCollection: DeckoModManifest = {
  name: "collection",
  gemName: "card-mod-collection",
  group: "gem-defaults",
  setModules,
};

export default cardModCollection;
