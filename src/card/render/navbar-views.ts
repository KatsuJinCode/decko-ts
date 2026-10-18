import { str } from "./format.js";
// The bootstrap navbar view family (card-mod-layout set/all/navbar_links.rb
// + set/abstract/{items,list}.rb + set/self/{account_links,dropdown_divider}.rb
// + card-mod-search set/self/search search_box) — the page-surface head chrome
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
//   renderView unknown substitution runs first — the blank
//   dropdown rows).
//
// Byte shapes are pinned by the tests under tests/card/render (the *all
// page header block and the view surface); the search box is the
// search_box.haml bytes (haml single-quoted div class).

import { DeckoName } from "../name.js";
import { UnsupportedViewError, wrappedTitleInner } from "./format.js";
import type { RenderFormat, ViewContext, ViewFn } from "./format.js";
import { h, newSlotId } from "./slot-html.js";

/** Abstract::List member cardtypes (item_cards content iteration). */
function isListType(fmt: RenderFormat): boolean {
  return fmt.card.typeCode === "pointer" || fmt.card.typeCode === "list";
}

/** Abstract::Items member cardtypes (card-mod-list set/type/{pointer,list,
 *  link_list}.rb include_set Abstract::Items): their :nav_item is a
 *  dropdown. A Link list includes Abstract::Items but not Abstract::List, so
 *  its dropdown items come from the base chunk walk. */
function isItemsType(fmt: RenderFormat): boolean {
  return isListType(fmt) || fmt.card.typeCode === "link_list";
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
  return str(ctx.fmt.renderView("title"));
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
    const prepared = ctx.fmt.engine.pageSessionAccountLinksHtml;
    if (prepared !== undefined) {
      // The prepared string embeds the my_card roles nest, whose render is
      // ensure_roles' mutation point (set/right/enabled_roles.rb:52
      // checkbox_input): consuming it marks the fill for the rest of the
      // request. The page's main view renders BEFORE the layout that holds
      // this navbar (card/lib/card/format/wrapper.rb:15 `@rendered =
      // yield`, then the layout wrapper at :20-28), so on the *account
      // links and *header pages the main body's roles nest came first and
      // this navbar nest reads the filled input; on every other page this
      // nest is the request's first and reads the blank input.
      ctx.fmt.engine.markSessionRolesContentFilled?.();
      return `<ul class="navbar-nav">${fillUniqueIds(prepared, fmt)}</ul>`;
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
  return `<ul class="navbar-nav">${chunkNavbarItems(ctx, "nav_item", "nav-link")}</ul>`;
};

/** set/all/navbar_links.rb navbar_items(view:, link_class:) — the base
 *  content-chunk walk every card without Abstract::List's item override
 *  takes: reference chunks ([[target|label]] name-links nest their target
 *  with `view`, title = the label); literal text chunks pass through
 *  verbatim (the \r\n separators between menu links are in the
 *  emitted bytes). Explicit links (link.rb `^(/|https?:|mailto:)` targets) render
 *  link_to_resource with explicit_link_opts {class: link_class} — the given
 *  class first, the resource type's class appended, then target=_blank for
 *  an external link — and navbar_link_chunk li-wraps them under :nav_item
 *  (`chunk.explicit_link? && view == :nav_item`). */
function chunkNavbarItems(ctx: ViewContext, view: string, linkClass: string): string {
  const content = ctx.fmt.card.dbContent;
  const out: string[] = [];
  let lastIndex = 0;
  for (const m of content.matchAll(/\[\[([^\][\n]+?)\]\]/g)) {
    out.push(content.slice(lastIndex, m.index));
    const spec = m[1] ?? "";
    const split = spec.indexOf("|");
    const target = (split === -1 ? spec : spec.slice(0, split)).trim();
    const label = split === -1 ? undefined : spec.slice(split + 1).trim();
    if (/^(\/|https?:|mailto:)/.test(target)) {
      const text = label ?? target;
      let link: string;
      if (/^https?:/.test(target)) {
        link = `<a class="${linkClass} external-link" target="_blank" href="${h(target)}">${text}</a>`;
      } else if (/^mailto:/.test(target)) {
        link = `<a class="${linkClass} email-link" href="${h(target)}">${text}</a>`;
      } else {
        link = `<a class="${linkClass} internal-link" href="${h(`/${target.replace(/^\/+/, "")}`)}">${text}</a>`;
      }
      out.push(view === "nav_item" ? wrapNavItem(link) : link);
    } else if (target !== "") {
      const link = nestResolvedName(ctx, target, view, label);
      if (link !== undefined) out.push(link);
    }
    lastIndex = (m.index ?? 0) + m[0].length;
  }
  out.push(content.slice(lastIndex));
  return out.join("");
}

/** set/all/navbar_links.rb view :nav_item (per-set dispatch). */
const navItemView: ViewFn = (ctx) => {
  const { fmt } = ctx;
  if (fmt.card.key === "*dropdown_divider") {
    // set/self/dropdown_divider.rb view :nav_item.
    return `<div class="dropdown-divider"></div>`;
  }
  if (isItemsType(fmt)) {
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
  // base: link_to_card card, render_title, class: "dropdown-item" —
  // render_title carries a link chunk's label (voo title) when one is set.
  return linkToCardWithClass(fmt, "dropdown-item", linkTitleSpan(ctx));
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
 *  dispatch (the unknown substitution renders "" — the blank
 *  menu rows).
 *
 *  Unresolvable ITEM NAMES and EMPTY renders drop from the join entirely:
 *  Ruby's item walk renders ITEM CARDS (Abstract::List#list_cards —
 *  set/abstract/list.rb, the card-mod-layout module this file ports), so a
 *  raw item string that is no card reference ("https://example.com/
 *  card/new|New Card" on an *Undertakings card) never becomes a
 *  render and its join separator vanishes with it; the same for a render
 *  that resolves to no bytes (the engine's unknown-card substitution).
 *  A kept empty row would emit `divider\n\n<denied>`, whereas the correct
 *  bytes are `divider + "\n" + <denied>` — so no `\n\n` sequence may appear
 *  inside any dropdown-menu block. */
function dropdownMenuItems(ctx: ViewContext): string {
  // A Link list (Abstract::Items without Abstract::List) keeps the base
  // navbar_items: the chunk walk with the dropdown view and class
  // (navbar_links.rb dropdown_menu_items).
  if (!isListType(ctx.fmt)) return chunkNavbarItems(ctx, "nav_link_in_dropdown", "dropdown-item");
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
 *  search_form/search_box_contents) — byte-pinned by the render tests. */
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

/** The pieces the mod deck's chain registers on their Ruby sets
 *  (card-mod-layout):
 *  - navbarLinksForMethodOverride: the all-set :navbar_links view as it
 *    renders for the two sets that override the navbar_items METHOD
 *    (set/self/account_links.rb, set/abstract/list.rb). The view itself
 *    stays All::NavbarLinks in Ruby; only the method differs, so the
 *    all-set view fn calls this for those cards;
 *  - abstractItemsNavItemView: set/abstract/items.rb view :nav_item;
 *  - dropdownDividerView: set/self/dropdown_divider.rb :nav_item and
 *    :nav_link_in_dropdown. */
export function navbarItemsOverridden(fmt: RenderFormat): boolean {
  return fmt.card.key === "*account_link" || isListType(fmt);
}
export const navbarLinksForMethodOverride: ViewFn = (ctx) => navbarLinksView(ctx);
export const abstractItemsNavItemView: ViewFn = (ctx) => wrapNavItem(navDropdown(ctx));
export const dropdownDividerView: ViewFn = () => `<div class="dropdown-divider"></div>`;

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
 *  dropped from the compact).
 *
 *  The prepared items embed the my_card roles nest, whose edit_inline render
 *  is where Ruby's ensure_roles mutates the session card (set/right/
 *  enabled_roles.rb:52) — so consuming the prepared items here marks the
 *  fill for the REST of this request: this core render (the page's MAIN
 *  body, rendered before the layout) serves the blank content input the
 *  oracle pins, and the navbar's later roles nest serves the filled one. */
export function accountLinksCoreHtml(ctx: ViewContext): string {
  const prepared = ctx.fmt.engine.pageSessionAccountLinksHtml;
  if (prepared !== undefined) {
    // The view body runs navbar_items (set/self/account_links.rb:8-27,
    // my_card first — the roles nest and its ensure_roles mutation point),
    // so consuming it here marks the fill for every LATER roles nest in the
    // request: the layout header's {{:account_links|navbar_links}} nest,
    // which renders after the main body (card/lib/card/format/wrapper.rb:15
    // then :20-28). This page's own nest reads the blank input: the content
    // field is emitted BEFORE checkbox_input's ensure_roles fills it.
    ctx.fmt.engine.markSessionRolesContentFilled?.();
    return `<div id="logging" class="logged-in">${fillUniqueIds(prepared, ctx.fmt)}</div>`;
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
 *  - my_card (account_links.rb view :my_card): account_dropdown.rb:7-12
 *    account_dropdown when the actor holds one current role, otherwise the
 *    +*enabled_roles :edit_inline slot (enabledRolesDropdownHtml; the caller
 *    passes it as myCardHtml). The dropdown arm:
 *    split_dropdown_button(link_to_mycard) { account_dropdown_items }
 *    (dropdown.rb:14-22) = the btn-group div joining [main, toggle, list]
 *    with "\n"; the toggle is split_dropdown_button_toggle's reverse_merge
 *    shape (dropdown.rb:28-38); the list is dropdown_list's
 *    `<ul class="dropdown-menu dropdown-menu-right" role="menu">` with the
 *    items li-wrapped and "\n"-joined (dropdown.rb:42-53).
 *  - the Account item's mark is [Auth.current, :account_settings]
 *    (account_dropdown.rb:21) — Card::Name[[a, :sym]] composes the junction
 *    with the codename-resolved setting name (name.rb:77 Codename.name!);
 *    its href is the NAME path form ("/<account>+*account_settings").
 *  - sign_out (account_links.rb view :sign_out + the Account dropdown item):
 *    link_to_card :signin, "Sign out", path: {action: :delete} — the
 *    "/delete/*signin" action path.
 *
 *  The known/wanted classes are inputs (RenderEngine.prepareSessionAccountLinks
 *  resolves them while async fetches are legal); the byte shapes here are
 *  pinned by the tests (every navbar block they render).
 */
export function signedInAccountLinksInnerHtml(
  actorName: string,
  known: { actor: boolean; accountSettings: boolean; signin: boolean },
  myCardHtml?: string,
): string {
  const knownClass = (isKnown: boolean): string => (isKnown ? "known-card" : "wanted-card");
  const myCardLi =
    `<li class="nav-item">` +
    (myCardHtml ?? myCardDropdownInnerHtml(actorName, known, [])) +
    `</li>`;
  const signOutLi =
    `<li class="nav-item"><a class="nav-link signout-link ${knownClass(known.signin)}" href="/delete/*signin">Sign out</a></li>`;
  return `${myCardLi}\n${signOutLi}`;
}

/** account_dropdown.rb:7-12 account_dropdown (the RAW btn-group, no
 *  navbar <li>) — split_dropdown_button(link_to_mycard) { items }: the
 *  btn-group div joining [main, toggle, list] with "\n"; the list is
 *  dropdown_list's `<ul class="dropdown-menu dropdown-menu-right"
 *  role="menu">` with the items li-wrapped and "\n"-joined. `roleItems`
 *  carries the roles-dropdown entries (account_dropdown.rb:26-35, each
 *  li-wrapped here; special_roles? gates them on 2+ current roles). The
 *  :my_card and :edit_inline views compose through this. */
export function myCardDropdownInnerHtml(
  actorName: string,
  known: { actor: boolean; accountSettings: boolean; signin: boolean },
  roleItems: string[],
): string {
  const namePath = actorName.replace(/ /g, "_");
  const knownClass = (isKnown: boolean): string => (isKnown ? "known-card" : "wanted-card");
  const items = [
    `<li><a class="dropdown-item ${knownClass(known.accountSettings)}" href="/${namePath}+*account_settings">Account</a></li>`,
    `<li><a class="dropdown-item ${knownClass(known.signin)}" href="/delete/*signin">Sign out</a></li>`,
    ...roleItems.map((item) => `<li>${item}</li>`),
  ];
  return (
    `<div class="btn-group">` +
    `<a id="my-card-link" class="nav-link my-card ${knownClass(known.actor)}" href="/${namePath}">${h(actorName)}</a>\n` +
    `<a href="#" class="dropdown-toggle dropdown-toggle-split nav-link" data-bs-toggle="dropdown" aria-haspopup="true" aria-expanded="false"><span class="visually-hidden">Toggle Dropdown</span></a>\n` +
    `<ul class="dropdown-menu dropdown-menu-right" role="menu">` +
    items.join("\n") +
    `</ul></div>`
  );
}

/** The session facts the interactive roles dropdown needs, resolved by the
 *  engine's async prepare step. */
export interface SessionRolesInput {
  readonly actorName: string;
  /** The actor card's type key (the TYPE_PLUS_RIGHT set anchor). */
  readonly actorTypeKey: string;
  readonly sessionTypeId: number;
  readonly sessionTypeName: string;
  /** Auth.current_roles: Anyone Signed In, then the role member cards'
   *  roles. */
  readonly roles: readonly string[];
  readonly enabledRoles?: readonly string[];
}

/** card-mod-layout set/self/account_links.rb view :my_card, its
 *  interactive_roles_dropdown arm (can_disable_roles?: the actor holds more
 *  than one current role and the *enabled_roles codename exists): the nest
 *  of `Auth.current.fetch :enabled_roles, new: { type_id: SessionID }` with
 *  view :edit_inline, hiding edit_inline_buttons and name_formgroup.
 *
 *  set/right/enabled_roles.rb: :edit_inline is perms :none, wrap :slot;
 *  the form posts to /update/<name> (the card is new, so the form id is
 *  "new_card"), carries success[reload] (edit_success) and the Session
 *  type id (hidden_form_tags), and its checkbox_input wraps the
 *  account_dropdown in div.pointer-checkbox-list, with one role_checkbox
 *  per current role after a "Roles" dropdown header (account_dropdown.rb
 *  account_dropdown_roles). ensure_roles fills the session card's blank
 *  content with every current role, so every box renders checked. The
 *  content input renders before checkbox_input runs, so the first render
 *  in a cache lifetime shows it blank (contentFilled false); the filled card
 *  stays cached and every later render carries the roles.
 *  The checkbox names count up per role (unique_id). */
/** Stands for the next value of the page's element-id counter (content.rb
 *  unique_id: the root format's id_counter, shared by every format of the
 *  request) in prepared session HTML; fillUniqueIds draws the values at
 *  render time, so the numbers continue from whatever the page body used. */
export const UNIQUE_ID_TOKEN = "\u0000unique-id\u0000";

/** Replace each UNIQUE_ID_TOKEN with the next id-counter value of the
 *  format's root (RenderFormat#uniqueId, which counts at the root). */
export function fillUniqueIds(html: string, fmt: RenderFormat): string {
  if (!html.includes(UNIQUE_ID_TOKEN)) return html;
  const parts = html.split(UNIQUE_ID_TOKEN);
  let out = parts[0] ?? "";
  for (let i = 1; i < parts.length; i++) {
    const id = fmt.uniqueId();
    out += id.slice(id.lastIndexOf("-") + 1) + parts[i];
  }
  return out;
}

/** set/right/enabled_roles.rb checkbox_input's account_dropdown: the
 *  btn-group with a "Roles" header and one role_checkbox per current role
 *  (role_checkbox.haml), every box checked (ensure_roles). */
export function rolesAccountDropdownHtml(
  input: SessionRolesInput,
  known: { actor: boolean; accountSettings: boolean; signin: boolean },
): string {
  const safeKey = DeckoName.parse(`${input.actorName}+*enabled roles`).safeKey;
  const roleItems = [
    `<h6 class="dropdown-header">Roles</h6>`,
    ...input.roles.map((role) => {
      const roleName = DeckoName.parse(role);
      return (
        `<div class='pointer-checkbox dropdown-item'>\n` +
        `<input type="checkbox" name="pointer_checkbox-${safeKey}-${UNIQUE_ID_TOKEN}" id="pointer-checkbox-${h(roleName.key)}" ` +
        `value="${h(role)}" class="pointer-checkbox-button _submit-on-change me-2"${(input.enabledRoles ?? input.roles).includes(role) ? ' checked="checked"' : ''} />\n` +
        `<a class="known-card" href="/${h(roleName.urlKey)}">${h(role)}</a>\n` +
        `</div>\n`
      );
    }),
  ];
  return myCardDropdownInnerHtml(input.actorName, known, roleItems);
}

export function enabledRolesDropdownHtml(
  input: SessionRolesInput,
  known: { actor: boolean; accountSettings: boolean; signin: boolean },
  contentFilled = true,
): string {
  const name = DeckoName.parse(`${input.actorName}+*enabled roles`);
  const urlKey = name.urlKey;
  const safeKey = name.safeKey;
  const dropdown = rolesAccountDropdownHtml(input, known);
  const slot = JSON.stringify({
    view: "edit_inline",
    nest_name: name.s,
    show: ["edit_inline"],
    hide: ["edit_inline_buttons", "name_formgroup", "type_formgroup"],
    home_view: "edit_inline",
  });
  const rightKey = "Xenabled_role";
  return (
    `<div id="${safeKey}-edit_inline-view" class="card-slot edit_inline-view ALL ALL_PLUS TYPE-${DeckoName.parse(input.sessionTypeName).key} RSTAR RIGHT-${rightKey} TYPE_PLUS_RIGHT-${input.actorTypeKey}-${rightKey}" ` +
    `data-card-name="${h(urlKey)}" data-card-type-id="${input.sessionTypeId}" data-card-type-name="${h(input.sessionTypeName)}" ` +
    `data-card-link-name="${h(urlKey)}" data-slot-id="${newSlotId()}" data-slot="${h(slot)}">` +
    `<form class="card-form slotter autosave" id="new_card" action="/update/${h(urlKey)}" accept-charset="UTF-8" data-remote="true" method="post">` +
    `<input name="utf8" type="hidden" value="&#x2713;" autocomplete="off" />` +
    `<input type="hidden" name="success[reload]" id="success_reload" value="true" autocomplete="off" /> ` +
    `<input type="hidden" name="card[type_id]" id="card_type_id" value="${input.sessionTypeId}" autocomplete="off" />` +
    `<fieldset class="card-editor editor"><div class="editor content-editor">` +
    `<input class="d0-card-content form-control" autocomplete="off" type="hidden"${contentFilled || input.enabledRoles !== undefined ? ` value="${h((input.enabledRoles ?? input.roles).join("\n"))}"` : ""} name="card[content]" id="card_content" />` +
    `<div class="pointer-checkbox-list">${dropdown}</div>` +
    `</div></fieldset></form></div>`
  );
}
