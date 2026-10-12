// search-paging.ts -- the html search-result paging bytes: the paging nav a
// Search card's :card_list view renders over a paged result window
// (card-mod-search set/abstract/0_search/views.rb:109-116 search_result_list
// -> with_paging -> card-mod-collection set/abstract/paging/paging_views.rb:21
// `with_paging` -> view :paging -> paging.haml, with the links from
// card-mod-collection lib/card/paging_links.rb PagingLinks).
//
// The html search view's limit: card-mod-search set/abstract/0_search/
// search_params.rb:38-40 format :html default_limit = `Cardio.config.
// paging_limit || 20`; search_params (search_params.rb:6-16) merge
// {limit: limit, offset: offset} ON TOP of the card's cql hash
// (cql_search.rb:70-74 standardized_query_args), so the cql's own limit
// survives only through card_content_limit (cql_search.rb:85-87
// `cql_hash&.dig :limit`) and the cql's own offset is overridden to 0.
// Headless renders have no request params (env_search_param) and no ported
// voo.cql (voo_search_param), so limit = cql limit ?? 20, offset = 0.
//
// show_paging? (paging_views.rb:4-9): false when limit < 1, false when
// fewer_results_than_limit? (offset 0 and the limited result list is not
// full), else `limit < count_with_params` (the count search,
// 0_search.rb:52-54, runs with offset 0 / limit 0 — the engine's count path
// ignores limit the same way). The port seats the paging record only in the
// nav-showing case (render.ts runSearch), so rendering is: a seated record
// is exactly show_paging? == true.
//
// Bytes: the paging.haml structure (nav.nav.justify-content-between.
// align-items-center > ul.pagination.paging > joined links + div.paging-
// context "offset+1 - last_item_on_page of count"; haml renders its own
// single-quoted class attributes and one line per value) with the li/a
// shapes from page_link_li/page_link (paging_views.rb:38-52 — Rails
// content_tag double quotes; the a's attribute order aria-label?, class,
// href, data-remote in that order). The nav carries the haml
// document's trailing newline; the output-join places it after the list
// div's newline.

/** PagingLinks::MAX_PAGES (paging_links.rb:5) — the final-page link is
 *  added only up to this page count. */
const MAX_PAGES = 100;

/** One seated paging record for a rendered search (the show_paging? == true
 *  case): the effective limit/offset the list was rendered with and the
 *  full count. */
export interface SearchResultPaging {
  limit: number;
  offset: number;
  count: number;
}

/** The card's URL path form: the name's url key ("Sign up+*type+by name" ->
 *  "Sign_up+*type+by_name" — the same form the slot's data-card-link-name
 *  carries and the hrefs embed). */
function cardUrlPath(name: { urlKey: string }): string {
  return `/${name.urlKey}`;
}

/** page_link (paging_views.rb:46-52): no page -> a plain div.page-link;
 *  a page -> the slotter a.card-paging-link with the card's path + limit/
 *  offset params (page_link_path_args, paging_views.rb:59-61: offset =
 *  page * limit; extra_paging_path_args is empty headless — no query vars).
 *  Attribute order aria-label?, class, href, data-remote. */
function pagingItem(
  text: string,
  page: number | false,
  status: "current" | "ellipses" | "previous" | "next" | undefined,
  ariaLabel: string | undefined,
  urlPath: string,
  limit: number,
  current: number,
): string {
  // page_link_li_class (paging_views.rb:38-41): PAGE_LI_CLASS maps only
  // :ellipses -> "disabled" and :current -> "active"; previous/next have no
  // extra class.
  const liClass =
    status === "current"
      ? "page-item active"
      : status === "ellipses"
        ? "page-item disabled"
        : "page-item";
  const inner =
    page === false
      ? `<div class="page-link">${text}</div>`
      : `<a${ariaLabel !== undefined ? ` aria-label="${ariaLabel}"` : ""} class="card-paging-link slotter page-link" href="${urlPath}?limit=${limit}&amp;offset=${page * limit}" data-remote="true">${text}</a>`;
  return `<li class="${liClass}">${inner}</li>`;
}

/** PagingLinks#build(window=5) (paging_links.rb:19-21, window passed by
 *  paging_links in paging_views.rb:35 `PagingLinks.new(total_pages,
 *  current_page).build 5`) rendered through pagingItem. */
function pagingLinks(
  total: number,
  current: number,
  urlPath: string,
  limit: number,
): string {
  const window = 5;
  const item = (
    text: string,
    page: number | false,
    status: "current" | "ellipses" | "previous" | "next" | undefined,
    ariaLabel?: string,
  ): string => pagingItem(text, page, status, ariaLabel, urlPath, limit, current);
  const direct = (page: number): string | undefined =>
    page >= 0 && page <= total ? item(String(page + 1), page, page === current ? "current" : undefined) : undefined;
  // previous_page/next_page (paging_links.rb:79-85): false at the edges.
  const prev = current > 0 ? current - 1 : false;
  const next = current < total ? current + 1 : false;
  const windowStart = Math.max(current - window, 0);
  const windowEnd = Math.min(current + window, total);
  // left_part (paging_links.rb:55-59): prev, page 0 when the window starts
  // past it, the ellipse when a gap remains.
  const left: string[] = [
    item('<span aria-hidden="true">&laquo;</span>', prev, prev === false ? "previous" : undefined, prev === false ? undefined : "Previous"),
  ];
  if (windowStart > 0) {
    const first = direct(0);
    if (first !== undefined) left.push(first);
  }
  if (windowStart > 1) left.push(item("<span>...</span>", false, "ellipses"));
  // window_part (paging_links.rb:61-65): windowStart..windowEnd inclusive.
  const middle: string[] = [];
  for (let page = windowStart; page <= windowEnd; page++) {
    const link = direct(page);
    if (link !== undefined) middle.push(link);
  }
  // right_part (paging_links.rb:67-73): ellipse, final page (when <=
  // MAX_PAGES and past the window), next — unshift order puts the ellipse
  // first.
  const right: string[] = [];
  if (total > windowEnd + 1) right.push(item("<span>...</span>", false, "ellipses"));
  if (total <= MAX_PAGES && total > windowEnd) {
    const last = direct(total);
    if (last !== undefined) right.push(last);
  }
  right.push(
    item('<span aria-hidden="true">&raquo;</span>', next, next === false ? "next" : undefined, next === false ? undefined : "Next"),
  );
  return [...left, ...middle, ...right].join("");
}

/** total_pages (paging.rb:26-29): ((count - 1) / limit).to_i; 1 when
 *  limit is 0 (unpaged, never reached — a seated record implies limit >= 1).
 *  Integer division with positive operands: floor. */
function totalPages(count: number, limit: number): number {
  return limit === 0 ? 1 : Math.floor((count - 1) / limit);
}

/** current_page (paging.rb:31-34): (offset / limit).to_i. */
function currentPage(offset: number, limit: number): number {
  return limit === 0 ? 1 : Math.floor(offset / limit);
}

/** last_item_on_page (paging.rb:44-46): [count, offset + limit].min. */
function lastItemOnPage(count: number, offset: number, limit: number): number {
  return Math.min(count, offset + limit);
}

/** The full paging nav bytes for one seated record — paging.haml rendered:
 *
 *   <nav class='nav justify-content-between align-items-center'>
 *   <ul class='pagination paging'>
 *   {joined links}
 *   </ul>
 *   <div class='paging-context'>
 *   {offset + 1}
 *   -
 *   {last_item_on_page}
 *   of
 *   {count}
 *   </div>
 *   </nav>
 *
 * with the haml document's trailing newline after </nav> (the
 *  bytes close the slot directly after it: "</nav>\n</div>"; the
 * show_paging? == false case renders the empty string, which is what makes
 * the unpaged card_list's output-join trailing newline the ONLY one).
 */
export function searchPagingNav(name: { urlKey: string }, paging: SearchResultPaging): string {
  const { limit, offset, count } = paging;
  const total = totalPages(count, limit);
  const current = currentPage(offset, limit);
  const links = pagingLinks(total, current, cardUrlPath(name), limit);
  return (
    `<nav class='nav justify-content-between align-items-center'>\n` +
    `<ul class='pagination paging'>\n` +
    links +
    `\n</ul>\n` +
    `<div class='paging-context'>\n` +
    [String(offset + 1), "-", String(lastItemOnPage(count, offset, limit)), "of", String(count)].join("\n") +
    `\n</div>\n` +
    `</nav>\n`
  );
}
