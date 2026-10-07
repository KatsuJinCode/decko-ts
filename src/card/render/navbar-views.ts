// The bootstrap navbar view family (card-mod-layout set/all/navbar_links.rb
// + set/abstract/{items,list}.rb + set/self/{account_links,dropdown_divider}.rb
// + card-mod-search set/self/search search_box) — the page-lane head chrome
// the Default Layout's {{:header|core}} / {{:footer|content}} nests pull in.
//
// Ruby scoping is per SET module; this flat registry scopes inside each view
// fn (card key / typeCode), mirroring the home_path seam in views.ts:
// - view :navbar_links — *account links (self-set navbar_items override:
//   sign_up/sign_in for anonymous), Pointer/List types (Abstract::List:
//   items as nests), everything else (the chunk walk: [[target|label]]
//   links nest their target with view :nav_item, title = the label).
// - view :nav_item — *dropdown divider (self-set: the divider div),
//   Pointer/List types (Abstract::Items: wrap_with_nav_item(nav_dropdown)),
//   base (wrap_with_nav_item link_view(class: "nav-link")).
// - view :nav_link_in_dropdown — *dropdown divider, base (link_to_card
//   class: "dropdown-item"). Unknown cards never dispatch here (the
//   renderView unknown substitution runs first — the capture's blank
//   dropdown rows).
//
// Byte shapes are pinned by the page-lane capture (the *all page header
// block) and the expected-v2 view lane; the search box is the
// search_box.haml bytes (haml single-quoted div class).

import { DeckoName } from "../name.js";
import { UnsupportedViewError, wrappedTitleInner } from "./format.js";
import type { RenderFormat, ViewContext, ViewFn } from "./format.js";
import { h } from "./slot-html.js";

/** Abstract::List member cardtypes (item_cards content iteration). */
function isListType(fmt: RenderFormat): boolean {
  return fmt.card.typeCode === "pointer" || fmt.card.typeCode === "list";
}

/** set/all/navbar_links.rb wrap_with_nav_item. */
function wrapNavItem(inner: string): string {
  return `<li class="nav-item">${inner}</li>`;
}

/** The card-title span a link carries: the voo `title` option (the
 *  [[target|label]] label) when set, else the card's title view. The label
 *  arm is wrapped_title (title.rb:38-42) - the joint span per "+" rides the
 *  span itself (format.ts#wrappedTitleInner). */
function linkTitleSpan(ctx: ViewContext): string {
  const label = ctx.voo.opts["title"];
  if (typeof label === "string") {
    return `<span class="card-title" title="${h(label)}">${wrappedTitleInner(h(label))}</span>`;
  }
  return ctx.fmt.renderView("title");
}

/** link_to_card with an extra class: `class="<given> known-card"` — the
 *  known/wanted class appends (links.rb add_known_or_wanted_class). */
function linkToCardWithClass(
  fmt: RenderFormat,
  klass: string,
  titleSpan: string,
): string {
  const known = fmt.card.unknown !== true;
  const cls = known ? `${klass} known-card` : `${klass} wanted-card`;
  return `<a class="${cls}" href="/${h(fmt.urlKey())}">${titleSpan}</a>`;
}

/** set/all/navbar_links.rb view :navbar_links (per-set dispatch; see the
 *  module header). */
const navbarLinksView: ViewFn = (ctx) => {
  const { fmt } = ctx;
  if (fmt.card.key === "*account_link") {
    // set/self/account_links.rb: the navbar_items METHOD override —
    // navbar_item_views (my_card/sign_out/sign_up/sign_in) rendered and
    // li-wrapped when present. Signed-in session: the prepared my_card +
    // sign_out items (set/self/account_links.rb's own navbar_items override,
    // card-mod-layout); the prepared string is the shared navbar_items
    // product both this view and :core render. Signed out: sign_up +
    // sign_in (my_card and sign_out are signed_in?-gated, denial :blank ->
    // dropped).
    const signedInItems = ctx.fmt.engine.pageSessionAccountLinksHtml;
    if (signedInItems !== undefined) {
      return `<ul class="navbar-nav">${signedInItems}</ul>`;
    }
    const links = [
      `<a class="nav-link signup-link known-card" href="/new/Sign_up">Sign up</a>`,
      `<a class="nav-link signin-link known-card" href="/*signin">Sign in</a>`,
    ].map(wrapNavItem);
    return `<ul class="navbar-nav">${links.join("\n")}</ul>`;
  }
  if (isListType(fmt)) {
    // Abstract::List#navbar_items: item_cards as nests.
    const items = listItemsOf(fmt)
      .map((name) => nestItemName(ctx, name, "nav_item"))
      .filter((s): s is string => s !== undefined);
    return `<ul class="navbar-nav">${items.join("")}</ul>`;
  }
  // set/all/navbar_links.rb: the content-chunk walk — reference chunks
  // ([[target|label]] name-links nest their target with view :nav_item,
  // render_name_link, title = the label); literal text chunks pass through
  // verbatim (the \r\n separators between menu links are in the captured
  // bytes).
  const content = fmt.card.dbContent;
  const out: string[] = [];
  let lastIndex = 0;
  for (const m of content.matchAll(/\[\[([^\][\n]+?)\]\]/g)) {
    out.push(content.slice(lastIndex, m.index));
    const spec = m[1] ?? "";
    const split = spec.indexOf("|");
    const target = (split === -1 ? spec : spec.slice(0, split)).trim();
    const label = split === -1 ? undefined : spec.slice(split + 1).trim();
    if (target !== "") {
      const link = nestResolvedName(ctx, target, "nav_item", label);
      if (link !== undefined) out.push(link);
    }
    lastIndex = (m.index ?? 0) + m[0].length;
  }
  out.push(content.slice(lastIndex));
  return `<ul class="navbar-nav">${out.join("")}</ul>`;
};

/** set/all/navbar_links.rb view :nav_item (per-set dispatch). */
const navItemView: ViewFn = (ctx) => {
  const { fmt } = ctx;
  if (fmt.card.key === "*dropdown_divider") {
    // set/self/dropdown_divider.rb view :nav_item.
    return `<div class="dropdown-divider"></div>`;
  }
  if (isListType(fmt)) {
    // Abstract::Items#nav_item: wrap_with_nav_item(nav_dropdown).
    return wrapNavItem(navDropdown(ctx));
  }
  // base: wrap_with_nav_item link_view(class: "nav-link").
  return wrapNavItem(linkToCardWithClass(fmt, "nav-link", linkTitleSpan(ctx)));
};

/** set/all/navbar_links.rb view :nav_link_in_dropdown (per-set dispatch). */
const navLinkInDropdownView: ViewFn = (ctx) => {
  const { fmt } = ctx;
  if (fmt.card.key === "*dropdown_divider") {
    return `<div class="dropdown-divider"></div>`;
  }
  // base: link_to_card card, render_title, class: "dropdown-item".
  return linkToCardWithClass(fmt, "dropdown-item", fmt.renderView("title"));
};

/** Abstract::Items#nav_dropdown: toggle link + menu. */
function navDropdown(ctx: ViewContext): string {
  const toggle =
    `<a href="#" class="nav-link dropdown-toggle" data-bs-toggle="dropdown">` +
    `${linkTitleSpan(ctx)}</a>`;
  const menu = `<div class="dropdown-menu">${dropdownMenuItems(ctx)}</div>`;
  return `<li class="nav-item dropdown">${toggle}\n${menu}</li>`;
}

/** Abstract::List#navbar_items(view: :nav_link_in_dropdown): the pointer's
 *  items, each nested with the dropdown-item view; unknown items never
 *  dispatch (the unknown substitution renders "" — the capture's blank
 *  menu rows).
 *
 *  Unresolvable ITEM NAMES and EMPTY renders drop from the join entirely:
 *  Ruby's item walk renders ITEM CARDS (Abstract::List#list_cards —
 *  set/abstract/list.rb, the card-mod-layout module this file ports), so a
 *  raw item string that is no card reference ("https://example.com/
 *  card/new|New Card", corpus card 38283 *Opportunities) never becomes a
 *  render and its join separator vanishes with it; the same for a render
 *  that resolves to no bytes (the engine's unknown-card substitution).
 *  Live receipt: ZERO `\n\n` sequences inside any captured dropdown-menu
 *  block (the *Opportunities menu renders `divider + "\n" + <denied>` —
 *  the engine's kept empty row emitted `divider\n\n<denied>`, the graded
 *  +1 on every page whose nav carries that menu). */
function dropdownMenuItems(ctx: ViewContext): string {
  const items = listItemsOf(ctx.fmt)
    .map((name) => nestItemName(ctx, name, "nav_link_in_dropdown"))
    .filter((s): s is string => s !== undefined && s !== "");
  return items.join("\n");
}

/** Abstract::List item_names (raw_item_strings: newline split, [[ ]] strip). */
function listItemsOf(fmt: RenderFormat): string[] {
  return fmt.card.dbContent
    .split(/\n+/)
    .map((s) => s.replace(/\[\[|\]\]/g, "").trim())
    .filter((s) => s !== "");
}

/** Nest one item NAME with the given navbar view (content_nest). Undefined
 *  = the mark did not resolve (the item is skipped by the joiners — see
 *  dropdownMenuItems). */
function nestItemName(ctx: ViewContext, name: string, view: string): string | undefined {
  return nestResolvedName(ctx, name, view, undefined);
}

function nestResolvedName(
  ctx: ViewContext,
  rawName: string,
  view: string,
  title: string | undefined,
): string | undefined {
  const fmt = ctx.fmt;
  let resolved: string;
  try {
    const parsed = DeckoName.parse(rawName);
    resolved = parsed.isAbsolute ? parsed.s : parsed.absoluteName(fmt.card.name).s;
  } catch {
    return undefined; // unresolved mark: never becomes a render
  }
  const nest = {
    name: resolved,
    syntax: resolved,
    options: { view, ...(title !== undefined ? { title } : {}), extra: {} },
    comment: undefined,
  };
  return fmt.nest(nest);
}

/** card-mod-search set/self/search view :search_box (search_box.haml +
 *  search_form/search_box_contents) — byte-pinned by the page capture. */
const searchBoxView: ViewFn = ({ fmt }) => {
  if (fmt.card.key !== "*search") {
    // set/self/search-scoped in Ruby; other cards raise the unsupported
    // view UserError (the missing-method walk).
    throw new UnsupportedViewError("search_box", fmt.card.name.s);
  }
  return (
    `<div class='d0-search-box'>\n` +
    `<form role="search" class="search-box-form" action="/*search" accept-charset="UTF-8" method="get">` +
    `<input name="utf8" type="hidden" value="&#x2713;" autocomplete="off" />` +
    `<input type="text" name="query[keyword]" id="query_keyword" class="_search-box search-box form-control w-100" autocomplete="off" data-completepath="/*search/search_box_complete.json" placeholder="Search" /></form>\n` +
    `</div>\n`
  );
};

export const NAVBAR_VIEWS: Record<string, ViewFn> = {
  navbar_links: navbarLinksView,
  nav_item: navItemView,
  nav_link_in_dropdown: navLinkInDropdownView,
  search_box: searchBoxView,
};

/** set/self/account_links.rb view :core: wrap_with(:div, id: "logging",
 *  class: signed_in? ? "logged-in" : "logged-out") { navbar_items.join "\n" }.
 *  Session-aware: a signed-in chrome session renders the prepared signed-in
 *  items (the same navbar_items the :navbar_links view renders — Ruby's
 *  navbar_items METHOD is shared by both views); otherwise the sign_up +
 *  sign_in pair (my_card/sign_out are signed_in?-gated with denial :blank —
 *  dropped from the compact). */
export function accountLinksCoreHtml(ctx: ViewContext): string {
  const signedInItems = ctx.fmt.engine.pageSessionAccountLinksHtml;
  if (signedInItems !== undefined) {
    return `<div id="logging" class="logged-in">${signedInItems}</div>`;
  }
  const links = [
    `<li class="nav-item"><a class="nav-link signup-link known-card" href="/new/Sign_up">Sign up</a></li>`,
    `<li class="nav-item"><a class="nav-link signin-link known-card" href="/*signin">Sign in</a></li>`,
  ].join("\n");
  return `<div id="logging" class="logged-out">${links}</div>`;
}

/** The signed-in *account_links navbar_items — the port of
 *  card-mod-layout set/self/account_links.rb's navbar_items method override
 *  (navbar_item_views %i[my_card sign_out sign_up sign_in] with
 *  signed_in?-gated perms; signed in: my_card + sign_out, the sign_up/
 *  sign_in denials render :blank and drop from the compact) joined "\n":
 *
 *  - my_card (account_dropdown.rb:7-12 account_dropdown — can_disable_roles?
 *    is false for the capture session, whose actor holds no roles):
 *    split_dropdown_button(link_to_mycard) { account_dropdown_items }
 *    (dropdown.rb:14-22) = the btn-group div joining [main, toggle, list]
 *    with "\n"; the toggle is split_dropdown_button_toggle's reverse_merge
 *    shape (dropdown.rb:28-38); the list is dropdown_list's
 *    `<ul class="dropdown-menu dropdown-menu-right" role="menu">` with the
 *    items li-wrapped and "\n"-joined (dropdown.rb:42-53).
 *  - the Account item's mark is [Auth.current, :account_settings]
 *    (account_dropdown.rb:21) — Card::Name[[a, :sym]] composes the junction
 *    with the codename-resolved setting name (name.rb:77 Codename.name!);
 *    its href is the NAME path form ("/Decko_Bot_1+*account_settings").
 *  - sign_out (account_links.rb view :sign_out + the Account dropdown item):
 *    link_to_card :signin, "Sign out", path: {action: :delete} — the
 *    "/delete/*signin" action path.
 *
 *  The known/wanted classes are inputs (RenderEngine.prepareSessionAccountLinks
 *  resolves them while async fetches are legal); the byte shapes here are
 *  pinned against the authenticated goldens (every capture's navbar block).
 *  Remainder (no golden pins it): the roles dropdown items
 *  (account_dropdown_roles — special_roles? when the session actor holds
 *  2+ roles) render []; the capture's bot session holds none.
 */
export function signedInAccountLinksInnerHtml(
  actorName: string,
  known: { actor: boolean; accountSettings: boolean; signin: boolean },
): string {
  const namePath = actorName.replace(/ /g, "_");
  const knownClass = (isKnown: boolean): string => (isKnown ? "known-card" : "wanted-card");
  const myCardLi =
    `<li class="nav-item">` +
    myCardDropdownInnerHtml(actorName, known, []) +
    `</li>`;
  const signOutLi =
    `<li class="nav-item"><a class="nav-link signout-link ${knownClass(known.signin)}" href="/delete/*signin">Sign out</a></li>`;
  return `${myCardLi}\n${signOutLi}`;
}

/** account_dropdown.rb:7-12 account_dropdown (the RAW btn-group, no
 *  navbar <li>) — split_dropdown_button(link_to_mycard) { items }: the
 *  btn-group div joining [main, toggle, list] with "\n"; the list is
 *  dropdown_list's `<ul class="dropdown-menu dropdown-menu-right"
 *  role="menu">` with the items li-wrapped and ""-joined. `roleItems`
 *  carries the roles-dropdown entries (account_dropdown.rb:26-35) — the
 *  port's session machinery carries no roles runtime yet, so callers pass
 *  [] (the capture sessions hold none either; special_roles? gates the
 *  block on 2+ roles). The :my_card and
 *  :edit_inline views compose through this. */
export function myCardDropdownInnerHtml(
  actorName: string,
  known: { actor: boolean; accountSettings: boolean; signin: boolean },
  roleItems: string[],
): string {
  const namePath = actorName.replace(/ /g, "_");
  const knownClass = (isKnown: boolean): string => (isKnown ? "known-card" : "wanted-card");
  return (
    `<div class="btn-group">` +
    `<a id="my-card-link" class="nav-link my-card ${knownClass(known.actor)}" href="/${namePath}">${h(actorName)}</a>\n` +
    `<a href="#" class="dropdown-toggle dropdown-toggle-split nav-link" data-bs-toggle="dropdown" aria-haspopup="true" aria-expanded="false"><span class="visually-hidden">Toggle Dropdown</span></a>\n` +
    `<ul class="dropdown-menu dropdown-menu-right" role="menu">` +
    `<li><a class="dropdown-item ${knownClass(known.accountSettings)}" href="/${namePath}+*account_settings">Account</a></li>\n` +
    `<li><a class="dropdown-item ${knownClass(known.signin)}" href="/delete/*signin">Sign out</a></li>` +
    roleItems.join("") +
    `</ul></div>`
  );
}
