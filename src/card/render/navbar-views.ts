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
import { UnsupportedViewError } from "./format.js";
import type { RenderFormat, ViewContext, ViewFn } from "./format.js";
import { scanNests } from "./nest-syntax.js";
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
 *  [[target|label]] label) when set, else the card's title view. */
function linkTitleSpan(ctx: ViewContext): string {
  const label = ctx.voo.opts["title"];
  if (typeof label === "string") {
    return `<span class="card-title" title="${h(label)}">${h(label)}</span>`;
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
    // li-wrapped when present. Anonymous: sign_up + sign_in (my_card and
    // sign_out are signed_in?-gated, denial :blank -> dropped).
    const links = [
      `<a class="nav-link signup-link known-card" href="/new/Sign_up">Sign up</a>`,
      `<a class="nav-link signin-link known-card" href="/*signin">Sign in</a>`,
    ].map(wrapNavItem);
    return `<ul class="navbar-nav">${links.join("\n")}</ul>`;
  }
  if (isListType(fmt)) {
    // Abstract::List#navbar_items: item_cards as nests.
    const items = listItemsOf(fmt).map((name) => nestItemName(ctx, name, "nav_item"));
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
    if (target !== "") out.push(nestResolvedName(ctx, target, "nav_item", label));
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
 *  menu rows). */
function dropdownMenuItems(ctx: ViewContext): string {
  const items = listItemsOf(ctx.fmt).map((name) =>
    nestItemName(ctx, name, "nav_link_in_dropdown"),
  );
  return items.join("\n");
}

/** Abstract::List item_names (raw_item_strings: newline split, [[ ]] strip). */
function listItemsOf(fmt: RenderFormat): string[] {
  return fmt.card.dbContent
    .split(/\n+/)
    .map((s) => s.replace(/\[\[|\]\]/g, "").trim())
    .filter((s) => s !== "");
}

/** Nest one item NAME with the given navbar view (content_nest). */
function nestItemName(ctx: ViewContext, name: string, view: string): string {
  return nestResolvedName(ctx, name, view, undefined);
}

/** nestChunkTarget: nest the [[target|label]] chunk with view :nav_item. */
function nestChunkTarget(ctx: ViewContext, piece: { target?: string; label?: string }): string {
  return nestResolvedName(ctx, piece.target ?? "", "nav_item", piece.label);
}

function nestResolvedName(
  ctx: ViewContext,
  rawName: string,
  view: string,
  title: string | undefined,
): string {
  const fmt = ctx.fmt;
  let resolved: string;
  try {
    const parsed = DeckoName.parse(rawName);
    resolved = parsed.isAbsolute ? parsed.s : parsed.absoluteName(fmt.card.name).s;
  } catch {
    return ""; // unresolved mark: renders empty on the captured surface
  }
  const nest = {
    name: resolved,
    syntax: resolved,
    options: { view, ...(title !== undefined ? { title } : {}), extra: {} },
    comment: undefined,
  };
  return fmt.nest(nest);
}

/** The [[target|label]] pieces of a card's content (the reference chunks
 *  the navbar chunk-walk renders). */
function nestChunksOf(fmt: RenderFormat): Array<{ text?: string; target?: string; label?: string }> {
  const pieces: Array<{ text?: string; target?: string; label?: string }> = [];
  for (const piece of scanNests(fmt.card.dbContent)) {
    if (piece.kind === "nest" && piece.nest !== undefined) {
      pieces.push({ target: piece.nest.name, label: piece.nest.options.title });
    } else if (piece.kind === "text") {
      pieces.push({ text: piece.text });
    }
  }
  return pieces;
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
