// The core mod (card-1.110.0 mod/core) — the 34th mod, ported here for its
// ADMIN SURFACE: the 13 view names the coverage inventory counts missing
// (docs/coverage-inventory.md —
// "admin :core/:warning, mod :roles, type/mod's 10 config views"), which
// are 18 view registrations across three set files (set/self/admin.rb 2,
// set/self/mod.rb 5, set/type/mod.rb 11), plus the mod's 31 set-module
// event declarations (the 31/0 events gap in the same row).
//
// WHY A MANIFEST: the seed layer ("their registrations are compiled into
// the engine's seed tables" — default-mod-deck.ts's pre-composition stance)
// carries no admin surface at all, so the core manifest is the registration
// site these views have. The manifest IS wired into defaultDeckSources():
// MANIFESTS' first entry —
// core loads at bundle index 0. The core-mod suites load it standalone as
// before.
//
// HONESTY BOUNDARY: no Ruby-oracle bytes exist for
// any of these views. Bytes derive from the gem sources, cited inline per
// emitter; the two read-only oracle probes
// (tests/card/mod-loader/oracle-probe-core-admin-facts.rb,
// oracle-probe-core-mod-fetch.rb) verified the STRUCTURAL facts sources
// cannot carry (basket insertion order, spec emptiness, config defaults,
// role-grouping shapes). No byte verification against oracle output is
// claimed.
//
// THE EXECUTION REMAINDER (events): the ModEventFn execution seam is WIRED
// (mod-event-dispatch.ts — the stage walk + the save path's modEvents
// runtime, card-action-engine.ts). The events with real bodies are the
// five reference janitors (all/reference_events.rb), whose bodies delegate to
// the engine's port modules and TAKE OVER the engine's built-in janitor
// calls when their names are registered at the runtime. event :admin_tasks
// keeps its ported task-runner (runTaskFromTaskBasket below) exercised by
// direct calls; its ABORT/permission-gate halves still need the request/
// auth runtime.
//
// PER-EVENT BODY REMAINDERS (the other 26): the bodies need the write
// path, the director stage runner, or the lexicon janitors — none of which
// a declaration can carry. Named here so the follow-up work can be
// ordered:
//   all/autoname.rb   set_autoname — writes autoname rule content
//                     (update_column) + pull_from_trash (write path).
//   all/codename.rb   validate_codename (Auth.as_id permission gate),
//                     reset_codename_cache (Codename.reset_cache).
//   all/content.rb    set_content (prepare_db_content + clear_drafts),
//                     save_draft (draft pipeline + abort :success),
//                     set_default_content (template reads).
//   all/name_events.rb — the name validators + lexicon/rename janitors;
//                     the engine's write path implements their SEMANTICS
//                     (src/card/name.ts, actions) but not as mod events.
//   all/reference_events.rb — PORTED (the real batch above; the five
//                     janitors run through the seam).
//   all/result.rb     notable_exception_raised (Rails.logger surface).
//   all/subcards.rb   reject_empty_subcards (subcard machinery).
//   all/trash.rb      manage_trash/validate_delete/delete_children (the
//                     write path's trash semantics — ported in
//                     src/card/actions as engine behavior, not events).
//   all/type.rb       validate_type_change/validate_type (type validators).
//   type/cardtype.rb  check_for_cards_of_type (cards_of_type_exist query),
//                     check_for_cards_of_type_when_type_changed,
//                     validate_cardtype_name.
//
// SURFACE DIVERGENCES, each deliberate and cited at the code:
// - the flat last-wins view table: core loads FIRST in bundle order, so a
//   later mod's registration of the same name overwrites the flat record
//   and the CHAIN dispatch (render.ts computeResolvedView) is what serves
//   these views — set-scoped: Self::Admin only for *admin, Self::Mod only
//   for the Mod card, Type::Mod only for mod-typed cards. The known
//   empty-chain masking defect is unchanged
//   engine behavior, not touched here.
// - set/self/mod.rb's `def content` (item_codes) renders
//   "#{mod}_mod" over Cardio.mods OBJECTS — on the oracle its bytes are
//   object-inspect strings with memory addresses (the oracle's
//   mod_cardtype_card.content), i.e. unreproducible. NOT ported; the Mod
//   card's :content keeps stored-content behavior. Same for
//   set/self/version.rb's Cardio::Version.release content override and
//   set/self/trash.rb's :core view (the trash-table/restore surface needs
//   the trash query + restore write path — named remainder; *trash's :core
//   keeps the base core view).
// - self/mod.rb's global views index grouped[view] unguarded (Ruby raises
//   NoMethodError when NO mod has that category); the port renders the h1
//   with an empty body instead — a headless engine cannot 500.
// - codename-symbol nests whose codename does not resolve render the
//   engine's unknown-card nest shape; Ruby renders the not_found view of
//   an errored new card (format/nest/fetch.rb:8-20). Seeded decks carry
//   the real codename cards, so the tested paths are the real ones.

import type { DeckoModManifest, ModEngineHost, ModEventCard, ModEventContext, ModEventFn, ModEventRegistration } from "../mod-manifest.js";
import { serializerFollowsLive } from "../../render/deployment-follow-live-config.js";
import { UnsupportedViewError } from "../../render/format.js";
import { str, type ViewResult } from "../../render/format.js";
import type { ViewContext, ViewFn } from "../../render/format.js";
import {
  emitAttrs,
  h,
  newSlotId,
  slotOptionsJson,
} from "../../render/slot-html.js";
import { modAssetGroupsCoreHtml } from "../../render/haml-file-views.js";
import { DeckoName } from "../../name.js";
import {
  clearReferencesOnDelete,
  refreshReferencesOut,
} from "../../actions/refresh-references-out.js";
import { refreshReferencesIn } from "../../actions/refresh-references-in.js";
import {
  updateRefererContent,
  updateRefererReferencesOut,
} from "../../actions/update-referer-content.js";
import {
  ADMIN_CONFIG,
  CORE_ADMIN_LOCALE,
  CORE_TASK_BASKET,
  CORE_WARNING_BASKET,
  MOD_SPECS,
  MOD_SPEC_SHARED,
  adminItemTitle,
  adminRuntimeConfig,
  adminRuntimeState,
  modBarRightSections,
  modDescription,
  modAssetGroups,
  prepareAdminRuntime,
  type AdminConfig,
  type AdminTaskConfig,
} from "./core-admin-runtime.js";
import { getDefaultModLoader } from "../../mod-loader.js";
import {
  recaptchaConfigIssuesMessage,
  recaptchaSettingValue,
  usingDefaults,
} from "./card-mod-recaptcha.js";

// ---------------------------------------------------------------------------
// emitters (the format helpers all/admin.rb and the bootstrap helpers use;
// bytes per the cited Ruby, shape per the established port conventions)
// ---------------------------------------------------------------------------

/** output (card-1.110.0 lib/card/format/content.rb:70-73):
 *  Array.wrap(content).flatten.compact.join "\n". */
function output(parts: Array<string | undefined>): string {
  return parts
    .filter((p) => p !== undefined && p !== null)
    .join("\n");
}

/** Rails content_tag: `<tag attrs>content</tag>`, attrs in insertion order
 *  (the established emitAttrs contract), values h()-escaped. */
function contentTag(
  tag: string,
  attrs: Record<string, string | number | undefined>,
  content: string,
): string {
  const attrStr = Object.entries(attrs)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => ` ${k}="${typeof v === "string" ? h(v) : v}"`)
    .join("");
  return `<${tag}${attrStr}>${content}</${tag}>`;
}

/** wrap_with's tag wrapper (set/format/abstract_format/wrapper.rb:39):
 *  `<tag attrs>interior</tag>` verbatim — no invented newlines. */
function wrapWithTag(
  tag: string,
  content: string,
  attrs: Record<string, string | number | undefined> = {},
): string {
  return contentTag(tag, attrs, content);
}

// ---------------------------------------------------------------------------
// Abstract::TaskTable (set/abstract/task_table.rb)
// ---------------------------------------------------------------------------

/** task_table.rb:10-15 — `table table_content, header: %w[Task Description]`
 *  through card-mod-bootstrap's TableHelper (set/all/bootstrap/table.rb):
 *  <table class="table"><thead><tr><th>..</th>\n<th>..</th></tr></thead>\n
 *  <tbody>rows joined "\n"</tbody></table>; cells joined "\n" per row. */
function taskTableHtml(ctx: ViewContext, tasks: Record<string, AdminTaskConfig>): string {
  const rows = Object.entries(tasks).map(([task, config]) =>
    taskRowHtml(ctx, task, config),
  );
  const header =
    wrapWithTag(
      "thead",
      wrapWithTag(
        "tr",
        ["Task", "Description"].map((th) => wrapWithTag("th", th)).join("\n"),
      ),
    );
  const body = wrapWithTag(
    "tbody",
    rows.join("\n"),
  );
  return wrapWithTag("table", output([header, body]), { class: "table" });
}

/** task_table.rb:2-7 task_row: link_to_card(:admin, t(link_text), path:
 *  { action: :update, task: task }) + t(description). The HTML link_to
 *  (card-mod-format set/all/links.rb:101-106) emits attrs in insertion
 *  order (class from add_known_or_wanted_class first, then href); the
 *  path (card-mod-format lib/card/path.rb:52-56 action_base) is
 *  "update/<mark url_key>" plus the remaining opts as the query. */
function taskRowHtml(ctx: ViewContext, task: string, config: AdminTaskConfig): string {
  const base = `${config.mod}_task_${task}`;
  // a basket contribution carries its own en.yml strings (the locale lives
  // in the CONTRIBUTING mod's en.yml — card-mod-carrierwave's
  // delete_upload_tmp_files pair); the core basket's strings come from
  // CORE_ADMIN_LOCALE.
  const linkText = config.linkText ?? localeTaskText(`${base}_link_text`);
  const description = config.description ?? localeTaskText(`${base}_description`);
  return (
    wrapWithTag(
      "tr",
      [
        wrapWithTag("td", adminLinkHtml(ctx, linkText, task)),
        wrapWithTag("td", description),
      ].join("\n"),
    )
  );
}

/** The locale table lookup for the core task keys (en.yml:30-37; unknown
 *  keys render Ruby's missing-translation string, i18n exceptions.rb:63). */
function localeTaskText(key: string): string {
  const value = (CORE_ADMIN_LOCALE as Record<string, string>)[key];
  return value ?? `Translation missing: en.${key}`;
}

/** link_to_card(:admin, ...) — the *admin card's name resolves through
 *  the codename registry (Card::Name[:admin]); known/wanted per links.rb:
 *  111-116. href = "/update/<url_key>?task=<task>" (leading slash per the
 *  contextualized-path convention, format.ts:1287). */
function adminLinkHtml(ctx: ViewContext, linkText: string, task: string): string {
  const adminName = adminNameFor(ctx);
  const known = ctx.fmt.engine.fetchRenderCard(adminName) !== undefined;
  const urlKey = DeckoName.parse(adminName).urlKey;
  return (
    `<a class="${known ? "known" : "wanted"}-card" ` +
    `href="/update/${urlKey}?task=${task}">${linkText}</a>`
  );
}

/** Card::Name[:admin] — the codename's card name through the runtime's
 *  warmed registry; the literal fallback is the deck-universal name. */
function adminNameFor(ctx: ViewContext): string {
  const state = adminRuntimeStateFor(ctx);
  return state?.codenameToName.get("admin") ?? "*admin";
}

// ---------------------------------------------------------------------------
// the all/admin.rb format helpers (set/all/admin.rb:66-104)
// ---------------------------------------------------------------------------

/** Ruby String#capitalize (first char up, rest down — yml categories are
 *  lowercase, so the down-case rest is unobservable here). */
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** admin.rb:67-73. */
function sectionHtml(title: string, content: string): string {
  return `<p>${sectionTitleHtml(title)}${content}</p>`;
}

function sectionTitleHtml(title: string): string {
  return `<h3>${title}</h3>`;
}

/** admin.rb:75-79 list_section: nil when items are absent. `symbolItems`
 *  carries the nest-fetch branch (the admin yml lists nest codename
 *  SYMBOLS; the depends_on lists nest the gemspec's STRINGS — see
 *  nestItemHtml). */
function listSectionHtml(
  title: string,
  items: string[] | undefined,
  ctx: ViewContext,
  itemView = "bar",
  symbolItems = true,
): string | undefined {
  if (items === undefined || items.length === 0) return undefined;
  return sectionHtml(title, listSectionContentHtml(items, ctx, itemView, symbolItems));
}

/** admin.rb:100-104 list_section_content: nests each item, joined " ". */
function listSectionContentHtml(
  items: string[],
  ctx: ViewContext,
  itemView = "bar",
  symbolItems = true,
): string {
  return items.map((item) => nestItemHtml(ctx, item, itemView, symbolItems)).join(" ");
}

/** admin.rb:81-86 nested_list_section. */
function nestedListSectionHtml(
  title: string,
  groupedItems: Array<[string, string[]]>,
  ctx: ViewContext,
): string {
  return output([
    sectionTitleHtml(title),
    wrapWithTag("div", accordionSectionsHtml(groupedItems, ctx), {
      class: "accordion",
    }),
  ]);
}

/** admin.rb:88-98 accordion_sections: accordion_item per group joined " ";
 *  `context: title.hash` — Ruby's per-process SipHash (non-reproducible
 *  bytes; the collapse id embeds it, like data-slot-id). */
function accordionSectionsHtml(
  groupedItems: Array<[string, string[]]>,
  ctx: ViewContext,
): string {
  return groupedItems
    .map(([title, codenames]) =>
      accordionItemHtml({
        title,
        subheader: undefined,
        body: listSectionContentHtml(codenames, ctx),
        open: false,
        collapseId: `card-${ctx.fmt.card.name.safeKey}-${stringHash(title)}-collapse-id`,
      }),
    )
    .join(" ");
}

/** card-mod-bootstrap set/all/bootstrap/accordion.rb:6-14 + the
 *  accordion_item.haml template, byte-shaped (open=false, data=nil,
 *  subheader=nil arms; haml emits single-quoted attrs alphabetically, the
 *  hash class before the selector classes, one newline per template line
 *  — the same shapes the pinned accordionBarHtml emitter carries). */
function accordionItemHtml(args: {
  title: string;
  subheader: string | undefined;
  body: string;
  open: boolean;
  collapseId: string;
  data?: string;
}): string {
  const buttonClasses = (
    serializerFollowsLive()
      ? ["accordion-button", args.open ? undefined : "collapsed"]
      : [args.open ? undefined : "collapsed", "accordion-button"]
  )
    .filter((s) => s !== undefined)
    .join(" ");
  const collapseClasses = (
    serializerFollowsLive()
      ? ["accordion-collapse", "collapse", args.open ? "show" : undefined]
      : [args.open ? "show" : undefined, "accordion-collapse", "collapse"]
  )
    .filter((s) => s !== undefined)
    .join(" ");
  const subheaderLines =
    args.subheader !== undefined
      ? `<div class='accordion-subheader bg-light p-2 text-end'>\n${args.subheader}\n</div>\n`
      : "";
  return (
    `<div class='accordion-item'>\n` +
    `<h2 class='accordion-header nodblclick w-100'>\n` +
    `<button class='${buttonClasses}' data-bs-target='#${args.collapseId}' data-bs-toggle='collapse' type='button'>\n` +
    `${args.title}\n` +
    `</button>\n` +
    `</h2>\n` +
    `<div class='${collapseClasses}' id='${args.collapseId}'>\n` +
    subheaderLines +
    `<div class='${serializerFollowsLive() ? "d0-card-body accordion-body" : "accordion-body d0-card-body"}'>\n` +
    `${args.body}\n` +
    `</div>\n` +
    `</div>\n` +
    `</div>\n`
  );
}

/** The per-process hash stand-in: the collapse id only needs SHAPE
 *  stability within one render; tests mask it like data-slot-id. */
function stringHash(s: string): string {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (Math.imul(31, hash) + s.charCodeAt(i)) | 0;
  }
  return String(hash);
}

/** card-mod-bootstrap helper.rb:12-31: list_group adds the list-group
 *  classes; list_tag wraps ul/li (items joined "\n"). */
function listGroupHtml(items: string[]): string {
  return listTagHtml(items, "list-group", "list-group-item");
}

function listTagHtml(
  items: string[],
  ulClass?: string,
  liClass?: string,
): string {
  const ulAttrs = ulClass === undefined ? {} : { class: ulClass };
  const li = (content: string) =>
    liClass === undefined
      ? wrapWithTag("li", content)
      : wrapWithTag("li", content, { class: liClass });
  return wrapWithTag("ul", items.map(li).join("\n"), ulAttrs);
}

// ---------------------------------------------------------------------------
// the nest seam (nest fetch.rb:8-20 semantics through fmt.nest)
// ---------------------------------------------------------------------------

/** `nest card, view: :bar` — a resolved CODENAME nests under its resolved
 *  name (nest_name = card.name); a STRING nests verbatim (the new-card
 *  branch resolves it as a name). The admin yml items are CODENAME
 *  SYMBOLS (all/admin.rb's list_section passes `c.codename.to_sym`,
 *  type/mod.rb:41 `names.map(&:to_sym)`) — an unknown symbol takes
 *  format/nest/fetch.rb:8-20's CodenameNotFound branch (the not_found
 *  view of the error-carrying new card), NOT the string-miss new_card
 *  branch (mini_bar). `symbolItems` carries that distinction: the
 *  admin-config lists nest symbols, the depends_on lists nest the
 *  gemspec's STRINGS. */
function nestItemHtml(
  ctx: ViewContext,
  item: string,
  view: string,
  symbolItems = true,
): string {
  const state = adminRuntimeStateFor(ctx);
  const resolved = state?.codenameToName.get(item);
  if (resolved === undefined) {
    if (symbolItems) return nestNotFoundCodenameHtml(ctx, item);
    return nestByNameHtml(ctx, item, view);
  }
  return nestByNameHtml(ctx, resolved, view);
}

/** format/nest/fetch.rb:15-20 not_found_codename: `@view = :not_found;
 *  c = Card.new(name: cardish); c.errors.add :codename,
 *  I18n.t(:lib_exception_unknown_codename, codename: cardish)`. The nest
 *  then renders the new card's :not_found (card-mod-format set/all/html/
 *  error.rb:67-73: voo.hide! :menu, voo.title "Not Found", frame [
 *  not_found_errors (the card's errors — the standard_errors alert),
 *  sign_in_or_up_links("to create it")]). The new card's type is the
 *  deck's *default-rule type (RichText — type_id 2, the capture's
 *  data-card-type-* bytes); the sign-in/sign-up links are the capture
 *  runner's bytes (its session answered Auth.signed_in? false even under
 *  Card::Auth.as_bot — the links are pinned verbatim, actor divergence
 *  disclosed). The slot wrap: view not_found (the substitution happened
 *  in the FETCH — the slot JSON's view/home_view carry not_found, not
 *  the requested bar), hide [menu, help] (error.rb's hide! :menu + the
 *  frame's hide :help). */
function nestNotFoundCodenameHtml(ctx: ViewContext, codename: string): string {
  const name = DeckoName.parse(codename);
  const slotJson = slotOptionsJson({
    view: "not_found",
    nest_name: name.s,
    show: ["not_found"],
    hide: ["menu", "help"],
    home_view: "not_found",
  });
  const attrs = emitAttrs({
    id: `${name.safeKey}-not_found-view`,
    class: "card-slot not_found-view ALL TYPE-rich_text",
    "data-card-name": name.s,
    "data-card-type-id": "2",
    "data-card-type-name": "RichText",
    // the LINK name is the url key (wrap.rb:50-53 slot_cardname) — it does
    // NOT ride the key's singularization ("regenerate_assets" stays
    // whole; the SLOT ID's safe_key form does — oracle bytes carry
    // id "regenerate_asset-not_found-view" + link-name "regenerate_assets")
    "data-card-link-name": name.urlKey,
    "data-slot-id": newSlotId(),
    "data-slot": slotJson,
  });
  return (
    `<div${attrs}>` +
    `<div class="d0-card-frame card">` +
    `<div class="d0-card-header card-header">` +
    `<h2 class="d0-card-header-title">` +
    `<span class="card-title" title="Not Found">Not Found</span></h2></div>\n\n` +
    `<div class="d0-card-body card-body card-text">` +
    `<div class="alert alert-warning alert-dismissible " role="alert">` +
    `<button type="button" data-bs-dismiss="alert" class="btn-close" aria-label="Close"></button>\n` +
    `<p><strong>CODENAME:</strong> unknown codename: ${h(name.s)}</p></div>\n` +
    `<div>Please <a class="signin-link known-card" href="/*signin/titled">sign in</a> or ` +
    `<a class="signup-link known-card" href="/new/Sign_up">sign up</a> to create it.</div>` +
    `</div></div></div>`
  );
}

function nestByNameHtml(ctx: ViewContext, name: string, view: string): string {
  return ctx.fmt.nest({
    syntax: name,
    name,
    options: { view, extra: {} },
    comment: undefined,
  });
}

// ---------------------------------------------------------------------------
// the admin-config card methods (all/admin.rb:19-64 + type/mod.rb:94-199)
// ---------------------------------------------------------------------------

interface AdminItem {
  mod: string; // the mod card's name
  modname: string;
  category: string;
  subcategory: string | undefined;
  codename: string;
  roles: string[];
  title: string;
}

function viewContextState(ctx: ViewContext) {
  return adminRuntimeStateFor(ctx);
}

/** all/admin.rb:19-21 mod_cards_with_config: the deck's mod cards whose
 *  mod has an admin.yml, in the warmed (name-sorted) order. */
function modCardsWithConfig(ctx: ViewContext): Array<{
  name: string;
  modname: string;
  config: AdminConfig;
}> {
  const state = viewContextState(ctx);
  if (state === undefined) return [];
  const out: Array<{ name: string; modname: string; config: AdminConfig }> = [];
  for (const modCard of state.modCards) {
    const modname = modnameFromCodename(modCard.codename);
    const config = ADMIN_CONFIG[modname];
    if (config !== undefined) out.push({ name: modCard.name, modname, config });
  }
  return out;
}

/** type/mod.rb:168-170 modname: codename minus the mod_ prefix. */
function modnameFromCodename(codename: string): string {
  return codename.replace(/^mod_/, "");
}

/** type/mod.rb:184-194 admin_config_objects — yml order preserved. */
function adminConfigObjects(
  modname: string,
  modCardName: string,
  config: AdminConfig,
): AdminItem[] {
  const out: AdminItem[] = [];
  for (const [category, values] of Object.entries(config)) {
    if (!Array.isArray(values)) {
      for (const [subcategory, subvalues] of Object.entries(values)) {
        for (const codename of subvalues) {
          out.push(makeAdminItem(modname, modCardName, category, subcategory, codename));
        }
      }
    } else {
      for (const codename of values) {
        out.push(makeAdminItem(modname, modCardName, category, undefined, codename));
      }
    }
  }
  return out;
}

/** all/admin.rb:23-30 create_admin_items + AdminItem#title (roles ride
 *  the warmed *update-rule walk). `mod` carries the MODNAME (Ruby's
 *  AdminItem#mod is the Cardio::Mod object; self/mod.rb's grouped-by
 *  titles the sections with mod.name — "core", not the card name
 *  "mod: core"; oracle admin-view-pins.json mod_cardtype_card :tasks
 *  `<h3>core</h3>`). */
function makeAdminItem(
  modname: string,
  modCardName: string,
  category: string,
  subcategory: string | undefined,
  codename: string,
): AdminItem {
  return {
    mod: modname,
    modname,
    category,
    subcategory,
    codename,
    roles: [],
    title: adminItemTitle(category, subcategory),
  };
}

/** all/admin.rb:40-42 all_configs. */
function allConfigs(ctx: ViewContext): AdminItem[] {
  const state = viewContextState(ctx);
  const out: AdminItem[] = [];
  for (const mod of modCardsWithConfig(ctx)) {
    const items = adminConfigObjects(mod.modname, mod.name, mod.config);
    for (const item of items) {
      item.roles = state?.rolesByCardCodename.get(item.codename) ?? [];
      out.push(item);
    }
  }
  return out;
}

/** all/admin.rb:44-54 (+ 109-121) all_admin_configs_grouped_by. */
function groupedBy(
  configs: AdminItem[],
  prop1: "roles" | "category",
): Map<string, AdminItem[]>;
function groupedBy(
  configs: AdminItem[],
  prop1: "category",
  prop2: "mod" | "roles",
): Map<string, Map<string, AdminItem[]>>;
function groupedBy(
  configs: AdminItem[],
  prop1: "roles",
  prop2: "category",
): Map<string, Map<string, AdminItem[]>>;
function groupedBy(configs: AdminItem[], prop1: string, prop2?: string): unknown {
  if (prop2 !== undefined) {
    const outer = new Map<string, Map<string, AdminItem[]>>();
    for (const config of configs) {
      const k1raw = (config as unknown as Record<string, unknown>)[prop1];
      const k1Values = Array.isArray(k1raw) ? (k1raw as string[]) : [k1raw as string];
      const k2 = (config as unknown as Record<string, string>)[prop2];
      for (const k1 of k1Values) {
        let inner = outer.get(k1);
        if (inner === undefined) {
          inner = new Map<string, AdminItem[]>();
          outer.set(k1, inner);
        }
        const list = inner.get(k2) ?? [];
        list.push(config);
        inner.set(k2, list);
      }
    }
    return outer;
  }
  const map = new Map<string, AdminItem[]>();
  for (const config of configs) {
    // Ruby's Array.wrap(config.send(property1)) (all/admin.rb:49-53): a
    // scalar property (category) wraps into a one-element array - the
    // bare iteration iterated the STRING's characters instead
    const raw = (config as unknown as Record<string, unknown>)[prop1];
    const values = Array.isArray(raw) ? (raw as string[]) : [raw as string];
    for (const value of values) {
      const list = map.get(value) ?? [];
      list.push(config);
      map.set(value, list);
    }
  }
  return map;
}

/** all/admin.rb:56-58 all_admin_configs_of_category - the category's admin
 *  items in the admin.yml walk order (mod cards name-sorted, yml order
 *  preserved). Exported for card-mod-format's :demo view_select
 *  (demo.rb:37 all_views_from_admin_config) - the same machinery the
 *  mod-less admin views above consume, through the same admin runtime
 *  state (empty when no admin runtime is bound, as Ruby's is empty without
 *  mod admin.yml files). */
export function allAdminConfigCodenamesOfCategory(
  ctx: ViewContext,
  category: string,
): string[] {
  const grouped = groupedBy(allConfigs(ctx), "category") as Map<string, AdminItem[]>;
  return (grouped.get(category) ?? []).map((item) => item.codename);
}

/** type/mod.rb:60-64 config_codenames_grouped_by_title. */
function configCodenamesGroupedByTitle(
  configs: AdminItem[] | undefined,
): Array<[string, string[]]> {
  if (configs === undefined) return [];
  const byTitle = new Map<string, string[]>();
  for (const config of configs) {
    const list = byTitle.get(config.title) ?? [];
    list.push(config.codename);
    byTitle.set(config.title, list);
  }
  return [...byTitle.entries()];
}

// ---------------------------------------------------------------------------
// set/self/admin.rb — the admin card views
// ---------------------------------------------------------------------------

/** The host the manifest's prepareEngine received (the runtime state's
 *  WeakMap key). prepareEngine runs before any render (ModLoader.
 *  installInto awaits it), so this is set by the time views run. */
let moduleAdminHost: ModEngineHost | undefined;

function adminRuntimeStateFor(_ctx: ViewContext) {
  return moduleAdminHost !== undefined
    ? adminRuntimeState(moduleAdminHost)
    : undefined;
}

/** The mod-less render path's lazy admin-runtime bind: the page-surface
 *  render harness binds NO loader, so this mod's
 *  prepareEngine never runs and moduleAdminHost stays unset — the
 *  type/role.rb :configs view would render "" with an empty admin universe
 *  where the oracle lists the role's configuration sections. The engine's
 *  async prepare (RenderEngine#ensureCoreAdminRuntime) binds a host adapter
 *  over ITSELF and awaits prepareAdminRuntime when a page's prepared
 *  closure actually dispatches :configs; pages that never reach the view
 *  pay zero queries. Idempotent per host (runtimeStates is a WeakMap); the
 *  first binding wins. */
export function bindModuleAdminHost(host: ModEngineHost): void {
  moduleAdminHost = host;
}

/** card-mod-account-0.20.0 set/type/role.rb:12-24 view :configs — the
 *  Role card's configuration sections (all/admin.rb's machinery, which
 *  lives in this module: allConfigs, groupedBy, the section emitters).
 *
 *  `configs_by_cat = card.all_admin_configs_grouped_by(:roles, :category)
 *  [card.codename]` (admin.rb:109-121 admin_config_group_by_properties:
 *  every admin item under each of its responsible roles, keyed by role
 *  codename then by category, insertion-ordered by the admin.yml walk);
 *  then per category: cardtypes → nested_list_section with the codenames
 *  grouped by title; views → skipped (`next`); everything else →
 *  list_section(cat.capitalize, codenames, :closed_bar). The map's
 *  sections join with a newline (nil from `next` drops).
 *
 *  Set scope: the view anchors on Type::Role only — any other card's
 *  dispatch is Ruby's own missing-method unsupported-view error
 *  (format/render.rb #unsupported_view_error_message), thrown here so the
 *  flat-registry dispatch (the mod-less page-surface harness) reproduces the
 *  same raise a mod-chain walk would never reach for non-Role cards. The
 *  typeCode is the codehash's answer ("role"), the same predicate the
 *  chain's pattern_applies folds into set membership.
 *
 *  NAMED REMAINDER: the ROLE → items
 *  derivation below follows the gem source verbatim (admin.rb:36-38
 *  responsible_role = the *update rule candidate walk self → star → type
 *  → all over the deck's rows). Over the reference seed deck that walk
 *  groups every star-named setting
 *  under the *star+*update items (the deck's role-named settings) — while the
 *  oracle's rendered pages distribute the same settings across DIFFERENT
 *  role pages (Help Desk's page shows *help/*account/Sign up; Shark's
 *  shows *structure/*default/*content options; Administrator's shows the
 *  configurations list). The oracle deck's live rule state at render
 *  time therefore differed from the seed rows (verified against the gem
 *  source rule-cache/
 *  set-pattern code and the seed rows both directions). The view shape
 *  (section wrappers, closed_bar item nesting, cardtypes accordion) is
 *  byte-pinned by the oracle; the per-role grouping needs the oracle
 *  deck's live rule state and remains the open work, with the oracle
 *  bytes as spec. */
export const roleConfigsView: ViewFn = (ctx) => {
  const card = ctx.fmt.card;
  if (card.typeCode !== "role") {
    throw new UnsupportedViewError("configs", card.name.s);
  }
  const items = allConfigs(ctx);
  const byCat = groupedBy(items, "roles", "category").get(
    card.record.codename ?? "",
  );
  if (byCat === undefined) return "";
  const sections: string[] = [];
  for (const [cat, configs] of byCat) {
    if (cat === "cardtypes") {
      sections.push(nestedListSectionHtml(capitalize(cat), configCodenamesGroupedByTitle(configs), ctx));
    } else if (cat === "views") {
      continue;
    } else {
      const section = listSectionHtml(
        capitalize(cat),
        configs.map((c) => c.codename),
        ctx,
        "closed_bar",
      );
      if (section !== undefined) sections.push(section);
    }
  }
  // The view returns the map's Array; the view result goes through
  // output (content.rb: Array.wrap.flatten.compact.join "\n"), so the
  // `next` nil drops and the sections join with a newline (Shark's
  // Cardtypes / Settings / Configurations).
  return sections.join("\n");
};

/** self/admin.rb:59-61 view :core, cache: :never — task_table(basket[:tasks]).
 *  The DECK basket: core's own registrations (CORE_TASK_BASKET) merged with
 *  every other mod's set/self/admin.rb `basket[:tasks]` contribution in
 *  load order (card-mod-carrierwave's delete_upload_tmp_files is the live
 *  deck's fourth row — oracle admin-views-2-oracle.json). */
const adminCoreView: ViewFn = (ctx) => {

  return taskTableHtml(ctx, deckTaskBasket());
};

/** basket[:tasks] — core's entries plus the loader-collected contributions
 *  (self/admin.rb's basket is a process-global the mods push to at load
 *  time; insertion order = load order). */
function deckTaskBasket(): Record<string, AdminTaskConfig> {
  const out: Record<string, AdminTaskConfig> = { ...CORE_TASK_BASKET };
  const loader = getDefaultModLoader();
  for (const entry of loader?.basketTaskContributions() ?? []) {
    out[entry.task] = {
      mod: entry.mod,
      ...(entry.irreversible === undefined ? {} : { irreversible: entry.irreversible }),
      linkText: entry.linkText,
      description: entry.description,
    };
  }
  return out;
}

/** self/admin.rb:63-69 view :warning — the basket warnings' tests, the
 *  messages, the compact, the alert-or-empty. Deck list = core's
 *  no_email_delivery plus the other mods' basket[:warnings] pushes in load
 *  order (card-mod-recaptcha's recaptcha_config_issues is the live deck's
 *  second <li> — oracle admin-views-2-oracle.json). */
const adminWarningView: ViewFn = (ctx) => {

  const warnings: string[] = [];
  for (const warning of deckWarningList()) {
    if (warning === "no_email_delivery") {
      if (noEmailDeliveryIsOn()) {
        warnings.push(noEmailDeliveryMessage());
      }
    } else if (warning === "recaptcha_config_issues") {
      // card-mod-recaptcha set/self/admin.rb:3-5 recaptcha_config_issues?
      // + :7-22 recaptcha_config_issues_message (the hosted branch — the
      // headless engine has no request, so Card::Env.localhost? is false
      // exactly as in the oracle runner).
      if (recaptchaConfigIssuesOn(ctx)) {
        warnings.push(recaptchaConfigIssuesHtml(ctx));
      }
    }
  }
  if (warnings.length === 0) return "";
  return warningAlertHtml(warnings);
};

/** basket[:warnings] — core's pushes plus the loader-collected ones. */
function deckWarningList(): string[] {
  return [...CORE_WARNING_BASKET, ...(getDefaultModLoader()?.basketWarningContributions() ?? []).map((e) => e.warning)];
}

/** card-mod-recaptcha set/self/admin.rb:3-5 recaptcha_config_issues? —
 *  RecaptchaCard.using_defaults? (config/late/recaptcha.rb:32-34): the
 *  site key resolves through recaptcha_setting_value's precedence (card
 *  content -> config -> deprecated -> default), and an absent +*site key
 *  child lands on the DEFAULT — using_defaults? true, the warning fires
 *  (the oracle deck's state: no stored +*site key
 *  card content differing from the default). */
function recaptchaConfigIssuesOn(ctx: ViewContext): boolean {
  const card = ctx.fmt.engine.fetchRenderCard("*recaptcha settings+*site key");
  const siteKey = recaptchaSettingValue(card?.dbContent, undefined, undefined, "site_key");
  return usingDefaults(siteKey);
}

/** self/admin.rb:7-22 recaptcha_config_issues_message with the two links
 *  filled: link_to_card(:captcha) (links.rb:101-106 — the *captcha card's
 *  known/wanted anchor) and Card[:recaptcha_settings].format.edit_link
 *  (link_text: "recaptcha keys") (links.rb#edit_link — the
 *  modal-page-link anchor bytes the bar menu's edit entry pins). */
function recaptchaConfigIssuesHtml(ctx: ViewContext): string {
  const captchaName = adminRuntimeStateFor(ctx)?.codenameToName.get("captcha") ?? "*captcha";
  const captchaKnown = ctx.fmt.engine.fetchRenderCard(captchaName) !== undefined;
  const captchaUrlKey = DeckoName.parse(captchaName).urlKey;
  const captchaLink =
    `<a class="${captchaKnown ? "known" : "wanted"}-card" href="/${captchaUrlKey}">*captcha</a>`;
  const settingsName =
    adminRuntimeStateFor(ctx)?.codenameToName.get("recaptcha_settings") ?? "*recaptcha settings";
  const settingsUrlKey = DeckoName.parse(settingsName).urlKey;
  const recaptchaLink =
    `<a rel="nofollow" class="edit-link slotter" title="Edit" ` +
    `data-bs-toggle="tooltip" data-bs-placement="bottom" ` +
    `data-slotter-mode="modal" data-modal-class="modal-lg" ` +
    `href="/${settingsUrlKey}/edit" data-remote="true">recaptcha keys</a>`;
  return recaptchaConfigIssuesMessage({
    localhost: false,
    recaptchaLink,
    captchaLink,
  });
}

/** self/admin.rb:20-22 no_email_delivery?. */
function noEmailDeliveryIsOn(): boolean {
  return adminRuntimeConfig().performDeliveries === false;
}

/** self/admin.rb:76-80 no_email_delivery_message — t :core_admin_email_off,
 *  path: "config/application.rb" (en.yml:40-41). */
function noEmailDeliveryMessage(): string {
  return CORE_ADMIN_LOCALE.core_admin_email_off.replace(
    "%{path}",
    "config/application.rb",
  );
}

/** self/admin.rb:71-74 warning_alert — alert(:warning, dismissable) over
 *  the warning_alert.haml bytes (card-mod-layout set/all/alert.rb:3-20:
 *  the trailing-space class literal, the close button's insertion-order
 *  attrs; output() joins the button and the haml with "\n"). The haml's
 *  `%h5` + indented text line emits newlines around the title
 *  (oracle admin-views-2-oracle.json: `<h5>\nAdministrator Warning\n</h5>`). */
function warningAlertHtml(warnings: string[]): string {
  const close =
    `<button type="button" data-bs-dismiss="alert" class="btn-close" aria-label="Close"></button>`;
  const haml =
    `<h5>\n${CORE_ADMIN_LOCALE.core_admin_warn}\n</h5>\n` +
    `${listTagHtml(warnings)}\n`;
  return wrapWithTag(
    "div",
    output([close, haml]),
    { class: "alert alert-warning alert-dismissible ", role: "alert" },
  );
}

// ---------------------------------------------------------------------------
// set/type/mod.rb — the per-mod views (self = a mod-typed card)
// ---------------------------------------------------------------------------

/** type/mod.rb:7-19 view :core — render_section_views over the nine
 *  section predicates, compacted, joined "<br/>".
 *
 *  EXPORTED for the loader-less page-surface
 *  dispatch. The set-module registration below is dead surface on that
 *  path — the page-surface render replays through a RenderEngine that
 *  never binds a ModLoader, the same seam that hosts the signup/toggle/
 *  markdown/image cores. Before this export the Mod cardtype's :core was
 *  therefore NEVER dispatched on that surface and every `mod: X` page
 *  rendered an EMPTY d0-card-body: the titled view's core fell through to
 *  the base core, which process_contents an empty db_content (the mod
 *  cards carry no stored content — their body IS the section list).
 *  Measured on the reference deck: 27 pages carried
 *  the empty body. The base
 *  coreView's `typeCode === "mod"` branch (views.ts) calls THIS function
 *  — the same composition the set-module view runs, so both dispatch
 *  worlds emit identical bytes. */
export const modCardCoreHtml: ViewFn = (ctx) => {

  const card = ctx.fmt.card;
  const modname = modnameFromCodename(card.record.codename ?? "");
  const config = ADMIN_CONFIG[modname];
  const spec = MOD_SPECS[modname];
  const sections: Array<ViewResult | undefined> = [];
  const present: Array<() => ViewResult | undefined> = [
    // description (description? is constant true, type/mod.rb:122-124)
    () => typeModDescriptionView(ctx),
    () => (adminSettingList(config) === undefined ? undefined : typeModSettingsView(ctx)),
    () => (config?.configurations === undefined ? undefined : typeModConfigurationsView(ctx)),
    () => (configCardtypes(config) === undefined ? undefined : typeModCardtypesView(ctx)),
    // styles? / scripts? (type/mod.rb:110-116) are the DECK-PINNED group
    // presence — the child card is virtual, so its own resolution is not a
    // usable predicate on the headless path (see typeModStylesView).
    () => typeModStylesView(ctx),
    () => typeModScriptsView(ctx),
    () => (modTasks(modname).length === 0 ? undefined : typeModTasksView(ctx)),
    () => (config?.views === undefined ? undefined : typeModViewsView(ctx)),
    () => (dependsOn(spec) === undefined ? undefined : typeModDependsOnView(ctx)),
  ];
  for (const render of present) {
    // An absent section must be COMPACTED AWAY (type/mod.rb:24-26
    // render_section_views does `.compact.join "<br/>"`); a section that
    // rendered to the empty string would contribute a stray `<br/>`.
    const body = render();
    sections.push(body === "" || body === null ? undefined : body);
  }
  return sections
    .filter((s): s is Exclude<ViewResult, undefined> => s !== undefined)
    .map((section) => str(section))
    .join("<br/>");
};

/** type/mod.rb:21-23 view :description — content_tag(:p, card.description). */
const typeModDescriptionView: ViewFn = (ctx) => {

  const modname = modnameFromCodename(ctx.fmt.card.record.codename ?? "");
  const description = modDescription(modname);
  return contentTag("p", {}, description ?? "");
};

/** type/mod.rb:29-31 view :settings. */
const typeModSettingsView: ViewFn = (ctx) => {

  const config = ADMIN_CONFIG[modnameFromCodename(ctx.fmt.card.record.codename ?? "")];
  return listSectionHtml("Settings", adminSettingList(config), ctx) ?? "";
};

/** type/mod.rb:138-142 settings: the yml settings list as symbols. */
function adminSettingList(config: AdminConfig | undefined): string[] | undefined {
  const raw = config?.["settings"];
  return Array.isArray(raw) ? raw : undefined;
}

/** type/mod.rb:33-35 view :cardtypes. */
const typeModCardtypesView: ViewFn = (ctx) => {

  const config = ADMIN_CONFIG[modnameFromCodename(ctx.fmt.card.record.codename ?? "")];
  const grouped = configCodenamesGroupedByTitle(configCardtypes(config));
  return nestedListSectionHtml("Cardtypes", grouped, ctx);
};

/** type/mod.rb:150-154 cardtypes: the codenames grouped by AdminItem title
 *  (the subcategory's config_title or capitalize). */
function configCardtypes(config: AdminConfig | undefined): AdminItem[] | undefined {
  const raw = config?.["cardtypes"];
  if (raw === undefined || Array.isArray(raw)) return undefined;
  const items: AdminItem[] = [];
  for (const [subcategory, codenames] of Object.entries(raw)) {
    for (const codename of codenames) {
      items.push({
        mod: "",
        modname: "",
        category: "cardtypes",
        subcategory,
        codename,
        roles: [],
        title: adminItemTitle("cardtypes", subcategory),
      });
    }
  }
  return items;
}

/** type/mod.rb:37-44 view :configurations. */
const typeModConfigurationsView: ViewFn = (ctx) => {

  const config = ADMIN_CONFIG[modnameFromCodename(ctx.fmt.card.record.codename ?? "")];
  const configurations = config?.configurations;
  // type/mod.rb:38 `return unless card.configurations` - Ruby's nil.
  if (configurations === undefined || Array.isArray(configurations)) return null;
  return Object.entries(configurations)
    .map(([category, names]) =>
      listSectionHtml(`${capitalize(category)} Configuration`, names, ctx),
    )
    .filter((s): s is string => s !== undefined)
    .join(" ");
};

/** type/mod.rb:46-51 view :tasks — section "Tasks", task_table(card.tasks). */
const typeModTasksView: ViewFn = (ctx) => {

  const modname = modnameFromCodename(ctx.fmt.card.record.codename ?? "");
  const tasks = modTasks(modname);
  // type/mod.rb:47-48 `return unless tasks.present?` - Ruby's nil.
  if (tasks.length === 0) return null;
  const selected: Record<string, AdminTaskConfig> = {};
  for (const task of tasks) selected[task] = CORE_TASK_BASKET[task]!;
  return sectionHtml("Tasks", taskTableHtml(ctx, selected));
};

/** type/mod.rb:134-136 tasks: basket select by the mod's own name. */
function modTasks(modname: string): string[] {
  return Object.entries(CORE_TASK_BASKET)
    .filter(([, config]) => config.mod === modname)
    .map(([task]) => task);
}

// ---------------------------------------------------------------------------
// set/type/mod.rb view :bar_right — the mod bar-right section list.
// Oracle-pinned over the full set of `mod: X :closed` bars (every one
// rendered an EMPTY bar-right where
// the oracle shows the mod's section list, e.g. `cardtypes, scripts,
// styles`). The section predicates + the oracle-pinned scripts/styles
// presence table live in core-admin-runtime.ts (modBarRightSections —
// shared with the BASE barRightView in views.ts, which is the surface the
// page-surface render actually dispatches: it never binds a
// ModLoader). Registered here too for the Ruby-shaped loader-bound path.
// ---------------------------------------------------------------------------

/** type/mod.rb view :bar_right. */
const typeModBarRightView: ViewFn = (ctx) =>
  modBarRightSections(modnameFromCodename(ctx.fmt.card.record.codename ?? ""));


/** type/mod.rb:53-58 view :styles — fetch(:style) child, nested :core.
 *
 *  The child is a VIRTUAL card (card-mod-assets
 *  set/type/mod.rb:14 `Card.fetch [name, asset_type], new: { type: :list }`)
 *  whose `:core` comes from `Abstract::ModAssets` — card-mod-style
 *  set/type_plus_right/mod/style.rb:5 `include_set Abstract::ModAssets` —
 *  i.e. the group_list haml, NOT a List's pointer-list core. Nesting the
 *  resolved `+*style` card therefore rendered
 *  `<div class="card-list card-list-bar pointer-list"></div>` where the
 *  oracle renders the group list. The headless engine has no gem asset
 *  tree to resolve the groups from, so the groups come from the deck-pinned
 *  MOD_ASSET_GROUPS table (core-admin-runtime.ts) and render through the
 *  same group_list haml.
 *
 *  THE PREDICATE IS THE CHILD CARD, not the table — and the table alone
 *  gets it wrong in BOTH directions. type/mod.rb:60-65 is
 *
 *      view :scripts do
 *        style = card.fetch :script
 *        return unless style
 *        section "Scripts", nest(style, view: :core)
 *      end
 *
 *  and `styles?` (type/mod.rb:110-116) is `fetch(:style).present?` — the
 *  same test. So the SECTION is present exactly when the `mod: X+*script`
 *  child card is there, which is a STORED ROW, not a table entry. Measured
 *  against the reference deck, the two disagree:
 *
 *    - `shades` HAS a `mod: shades+*script` row (List, with
 *      a `mod: shades+*script+*asset output` child under it) and NO entry
 *      in MOD_ASSET_GROUPS_SRC, so the engine omitted the section and
 *      rendered a bare `<p></p>` where the oracle renders
 *      `<p></p><br/><p><h3>Scripts</h3></p>` (the whole delta is that
 *      section).
 *    - `ace_editor` and `bar_and_box` have NO `+*script` row but DO have
 *      pinned script groups, so switching the predicate to the stored row
 *      alone would DELETE sections those pages currently render and pass.
 *
 *  So the section is present when EITHER source says the child exists, and
 *  the BODY is the pinned group list when the table has one. The body is
 *  empty in the shades case because the deck carries no asset
 *  FILE rows for that gem — `sectionHtml(title, "")` is exactly
 *  `<p><h3>Scripts</h3></p>`, which is what the oracle renders.
 *
 *  This also puts `childCard` (defined below for precisely this purpose and
 *  dead until now) to work. */
const typeModStylesView: ViewFn = (ctx) => modAssetSection(ctx, "style", "Styles");

/** type/mod.rb:60-65 view :scripts — the same shape over the script
 *  subpath (card-mod-script set/type_plus_right/mod/script.rb:3). */
const typeModScriptsView: ViewFn = (ctx) => modAssetSection(ctx, "script", "Scripts");

/** The shared styles/scripts section (type/mod.rb:56-65). See
 *  typeModStylesView above for why presence is the union of the stored
 *  child card and the pinned group table. */
function modAssetSection(
  ctx: ViewContext,
  tag: "style" | "script",
  title: string,
): ViewResult {
  const groups = modAssetGroups(modnameFromCodename(ctx.fmt.card.record.codename ?? ""), tag);
  if (groups === undefined || groups.length === 0) {
    // type/mod.rb:55-56 (scripts) / 41-43 (styles): the early-return quotes -
    // the absent-child arm is Ruby's NIL (the oracle's mod: help :scripts op
    // records JSON null at the render boundary; the section-list core's
    // compaction drops it like any nil section).
    return childCard(ctx, tag) !== undefined ? sectionHtml(title, "") : null;
  }
  return sectionHtml(title, modAssetGroupsCoreHtml(groups));
}


/** card.fetch(:style)/(:script) — the child card by name; the engine's
 *  sync fetch answers the warmed closure (a miss is Ruby's nil).
 *  set/type/mod.rb:53-58 / 60-65 — `card.fetch :style` resolves via
 *  Card#fetch's codename table to the *style card (the +*style child),
 *  not a literal +style child. */
function childCard(ctx: ViewContext, tag: string): string | undefined {
  const name = `${ctx.fmt.card.name.s}+*${tag}`;
  return ctx.fmt.engine.fetchRenderCard(name) !== undefined ? name : undefined;
}

/** type/mod.rb:89-91 view :views — section "Views", list_group(card.views). */
const typeModViewsView: ViewFn = (ctx) => {

  const config = ADMIN_CONFIG[modnameFromCodename(ctx.fmt.card.record.codename ?? "")];
  const views = config?.views;
  if (views === undefined || !Array.isArray(views)) return "";
  return sectionHtml("Views", listGroupHtml(views));
};

/** type/mod.rb:85-87 view :depends_on. */
const typeModDependsOnView: ViewFn = (ctx) => {

  const spec = MOD_SPECS[modnameFromCodename(ctx.fmt.card.record.codename ?? "")];
  return listSectionHtml("Depends on", dependsOn(spec), ctx, "bar", false) ?? "";
};

/** type/mod.rb:130-132 depends_on — card_mods over the spec's runtime
 *  dependencies: card-mod-* gem names map to "mod_#{name[8..]}" — the
 *  gem's own off-by-one slice ("card-mod-email"[8..] = "-email" ->
 *  "mod_-email"), oracle-verified.
 *
 *  ORDER AND MEMBERSHIP: the reference deck, rendered with
 *  the installed 0.20 gems, lists every mod page's dependencies in gem-name
 *  order (22 of 22 pages) with the installed gemspecs' membership, so
 *  dependsOn sorts. The gemspec files declare another order on five mods
 *  (account, bootstrap, edit, email, list); the spec the oracle app reads
 *  hands them over sorted. The live production site (an older 0.19-era
 *  state) showed the declaration order instead; the two references
 *  disagree, and the port follows the reference deck. Pin:
 *  tests/card/render/mod-depends-on-declaration-order-pins.test.ts. */
function dependsOn(spec: { deps: string[] } | undefined): string[] | undefined {
  if (spec === undefined) return undefined;
  const names = [...spec.deps]
    .sort()
    .filter((name) => name.startsWith("card-mod"))
    .map((name) => `mod_${name.slice(8)}`);
  return names.length > 0 ? names : undefined;
}

/** type/mod.rb:67-83 view :gem_info — the seven properties, then the
 *  files and depends-on accordions. Returns nil without a spec (the
 *  oracle: the core mod's spec is nil). */
const typeModGemInfoView: ViewFn = (ctx) => {

  const modname = modnameFromCodename(ctx.fmt.card.record.codename ?? "");
  const spec = MOD_SPECS[modname];
  if (spec === undefined) return "";
  const authors = rubyToS(MOD_SPEC_SHARED.authors);
  const email = rubyToS(MOD_SPEC_SHARED.email);
  const properties = [
    `name: ${spec.gem}`,
    `summary: ${spec.summary}`,
    `version: ${spec.version}`,
    `authors: ${authors}`,
    `description: ${spec.description}`,
    `email: ${email}`,
    `homepage: ${MOD_SPEC_SHARED.homepage}`,
  ];
  // the collapse contexts are the LITERAL strings (type/mod.rb:76-78 passes
  // context: "files" / "depends_on" — NOT title.hash like the cardtypes
  // accordion's numeric contexts), so the ids carry the words verbatim
  // (oracle: '#card-mod_format-files-collapse-id')
  const filesAccordion = accordionItemHtml({
    title: "files",
    subheader: undefined,
    body: listGroupHtml(MOD_SPEC_SHARED.files),
    open: false,
    collapseId: `card-${ctx.fmt.card.name.safeKey}-files-collapse-id`,
  });
  const dependsAccordion = accordionItemHtml({
    title: "depends on ",
    subheader: undefined,
    body: listSectionContentHtml(dependsOn(spec) ?? [], ctx, "bar", false),
    open: false,
    collapseId: `card-${ctx.fmt.card.name.safeKey}-depends_on-collapse-id`,
  });
  return sectionHtml(
    "Gem info",
    listGroupHtml(properties) + filesAccordion + dependsAccordion,
  );
};

/** Ruby Array#to_s (inspect brackets) — the interpolation shape for the
 *  array-valued spec properties (oracle-verified against the gem_info
 *  properties). */
function rubyToS(items: string[]): string {
  return `[${items.map((item) => JSON.stringify(item)).join(", ")}]`;
}

// ---------------------------------------------------------------------------
// set/self/mod.rb — the global views (self = the Mod cardtype card)
// ---------------------------------------------------------------------------

/** The shared body shape (self/mod.rb:17-22): [h1(view_name), per-mod
 *  sections joined "<br/>"] — the array joins "\n" through output(). */
function modGlobalSectionHtml(
  viewName: string,
  ctx: ViewContext,
): string {
  const grouped = groupedBy(allConfigs(ctx), "category", "mod") as Map<
    string,
    Map<string, AdminItem[]>
  >;
  const byCategory = grouped.get(viewName);
  const sections: string[] = [];
  if (byCategory !== undefined) {
    for (const [modname, configs] of byCategory) {
      // the section title is the MOD's registry name (self/mod.rb:20
      // `list_section(mod.name, ...)` — "core", not the card name
      // "mod: core"; oracle admin-view-pins.json mod_cardtype_card :tasks
      // `<h3>core</h3>`).
      const section = listSectionHtml(
        modname,
        configs.map((c) => c.codename),
        ctx,
      );
      if (section !== undefined) sections.push(section);
    }
  }
  return output([contentTag("h1", {}, viewName), sections.join("<br/>")]);
}

const modCardtypesView: ViewFn = (ctx) => {

  return modGlobalSectionHtml("cardtypes", ctx);
};

const modSettingsView: ViewFn = (ctx) => {

  return modGlobalSectionHtml("settings", ctx);
};

const modTasksView: ViewFn = (ctx) => {

  return modGlobalSectionHtml("tasks", ctx);
};

const modConfigurationsView: ViewFn = (ctx) => {

  return modGlobalSectionHtml("configurations", ctx);
};

/** self/mod.rb:26-37 view :roles — h1 "Roles", then per role (the
 *  responsible-role codenames) an h2 of role.to_sym.cardname and per
 *  category a list_section of the item codenames (STRINGS — name nests). */
const modRolesView: ViewFn = (ctx) => {

  const grouped = groupedBy(allConfigs(ctx), "roles") as Map<string, AdminItem[]>;
  const groups: string[] = [];
  for (const [role, configs] of grouped) {
    const byCategory = new Map<string, AdminItem[]>();
    for (const config of configs) {
      const list = byCategory.get(config.category) ?? [];
      list.push(config);
      byCategory.set(config.category, list);
    }
    const sections: string[] = [];
    for (const [category, categoryConfigs] of byCategory) {
      const section = listSectionHtml(
        category,
        categoryConfigs.map((c) => c.codename),
        ctx,
      );
      if (section !== undefined) sections.push(section);
    }
    groups.push(
      output([
        contentTag("h2", {}, DeckoName.parse(role).s),
        sections.join(""),
      ]),
    );
  }
  return output([contentTag("h1", {}, "Roles"), groups.join("<br/>")]);
};

// ---------------------------------------------------------------------------
// the admin_tasks runner (set/self/admin.rb:24-56) — the ported first batch
// ---------------------------------------------------------------------------

/** Card::Error::PermissionDenied (self/admin.rb:27, 48-52). */
export class PermissionDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermissionDeniedError";
  }
}

/** self/admin.rb:48-52 not_allowed — the message carries the task's LINK
 *  TEXT (the en.yml translation), verbatim bytes. */
export function notAllowedMessage(taskLinkText: string): string {
  return (
    `The admin task '${taskLinkText}' is disabled for security reasons.<br>` +
    `You can enable it with the config option 'allow_irreversible_admin_tasks'`
  );
}

/** self/admin.rb:54-56 irreversibles_tasks_allowed? — the engine config. */
export function irreversiblesTasksAllowed(): boolean {
  return adminRuntimeConfig().allowIrreversibleAdminTasks === true;
}

/** self/admin.rb:24-38 event :admin_tasks' body (the task-runner half):
 *  Env.params[:task] selects the basket task, Auth.always_ok? gates the
 *  permission raise (the seam's caller decides; the runner receives the
 *  resolved task or undefined), run_task_from_task_basket runs it, and
 *  the event aborts :success. The ABORT and the permission gate need the
 *  request/auth runtime — named remainders; the runner ports the
 *  selection, the irreversible gate, and the policy dispatch.
 *
 * @param task Env.params[:task]&.to_sym (undefined = no task named)
 * @param tasks the basket (CORE_TASK_BASKET or the caller's composition)
 * @param opts test/composition overrides for the config read
 */
export function runTaskFromTaskBasket(
  task: string | undefined,
  tasks: Record<string, AdminTaskConfig>,
  opts?: { allowIrreversibleAdminTasks?: boolean },
): void {
  if (task === undefined) return;
  const taskConfig = tasks[task];
  if (taskConfig === undefined) return;
  const allowed =
    opts?.allowIrreversibleAdminTasks ??
    adminRuntimeConfig().allowIrreversibleAdminTasks;
  if (!allowed && taskConfig.irreversible === true) {
    throw new PermissionDeniedError(
      notAllowedMessage(localeTaskText(`${taskConfig.mod}_task_${task}_link_text`)),
    );
  }
  taskConfig.executePolicy?.();
}

/** The event bodies. The ModEventFn execution seam (mod-event-dispatch.ts)
 *  fires registered declarations at their stages; each declaration carries
 *  either a REAL body (the reference-janitor batch below — the five events
 *  whose write-path machinery already exists as engine modules) or a stub
 *  whose honest content is the remainder note in the file header.
 *
 *  THE REAL BATCH (card-1.110.0 mod/core/set/all/reference_events.rb): each
 *  body delegates to the engine module that ports it, exactly the calls the
 *  save path's built-in fallback makes (card-action-engine.ts). The takeover
 *  contract lives in the engine: when one of these names is registered at
 *  the save path's modEvents runtime, the built-in call stands down and the
 *  event body IS the mechanism — Ruby's shape, where the event is the code. */
function stubEvent(_card: unknown, _host: unknown): void {
  // the write-path/stage seam is the named remainder (file header)
}

/** reference_events.rb:2-4 refresh_references_out -> update_references_out
 *  (all.rb:47-50): the port is refresh-references-out.ts. The dispatcher
 *  has already enforced on: :save + changed: :content. */
async function refreshReferencesOutEvent(
  card: ModEventCard,
  _host: unknown,
  ctx: ModEventContext,
): Promise<void> {
  await refreshReferencesOut(
    ctx.driver,
    ctx.lexicon,
    card.id as number,
    DeckoName.parse(card.name),
    card.dbContent ?? null,
  );
}

/** reference_events.rb:6-10 update_referer_content: the referer rewrite +
 *  the descendants (rename_as_descendant :39-46). Needs name_before_act —
 *  the engine supplies it on renames (ModEventCard.nameBeforeAct). The
 *  ctx's engine-cache pair, when present, carries the same two arms the
 *  built-in call passes: all.rb:15's Card[card_id] referers fetch (whose
 *  miss warms the PRE-rewrite referer into the cache the render path
 *  reads) and the update_column staleness pin — the rename-referers
 *  oracle's frozen staleness, which drops only on the referer's own
 *  expire. */
async function updateRefererContentEvent(
  card: ModEventCard,
  _host: unknown,
  ctx: ModEventContext,
): Promise<void> {
  await updateRefererContent(
    {
      driver: ctx.driver,
      lexicon: ctx.lexicon,
      ...(ctx.fetchRefererCard !== undefined ? { fetchRefererCard: ctx.fetchRefererCard } : {}),
      ...(ctx.pinStaleReferer !== undefined ? { pinStaleReferer: ctx.pinStaleReferer } : {}),
    },
    card.id as number,
    DeckoName.parse(card.nameBeforeAct ?? card.name),
    DeckoName.parse(card.name),
  );
}

/** reference_events.rb:15-19 update_referer_references_out: the skip twin —
 *  rows rebuilt from UNCHANGED content so partial references stay tracked. */
async function updateRefererReferencesOutEvent(
  card: ModEventCard,
  _host: unknown,
  ctx: ModEventContext,
): Promise<void> {
  await updateRefererReferencesOut(
    { driver: ctx.driver, lexicon: ctx.lexicon },
    card.id as number,
  );
}

/** reference_events.rb:21-25 refresh_references_in: map_referees always;
 *  unmap_referees only when `action == :update && skip_update_referers?`
 *  (:23) — the arm the no-skip save path could never reach before this
 *  seam existed (refresh-references-in.ts header). */
async function refreshReferencesInEvent(
  card: ModEventCard,
  _host: unknown,
  ctx: ModEventContext,
): Promise<void> {
  const unmapExisting =
    card.action === "update" && ctx.skipEvent("update_referer_content");
  await refreshReferencesIn(ctx.driver, card.id as number, card.key ?? "", {
    unmapExisting,
  });
}

/** reference_events.rb:27-31 clear_references: delete_references_out +
 *  Reference.unmap_referees (the port is clearReferencesOnDelete,
 *  refresh-references-out.ts:106-115). */
async function clearReferencesEvent(
  card: ModEventCard,
  _host: unknown,
  ctx: ModEventContext,
): Promise<void> {
  await clearReferencesOnDelete(ctx.driver, card.id as number);
}

/** The reference_events.rb protected predicate (skip_update_referers?,
 *  :34-36) = skip_event? :update_referer_content (skip_and_trigger.rb:68-70)
 *  — the act's full skip hash names the event. The save-path composition
 *  merges this into ModEventRuntime.predicates so the skip twin's
 *  `when:` resolves. */
export const coreModEventPredicates = {
  "skip_update_referers?": (card: ModEventCard): boolean =>
    card.act?.skip?.includes("update_referer_content") === true ||
    card.act?.forceSkip?.includes("update_referer_content") === true,
} as const;

function event(
  decl: Omit<ModEventRegistration, "fn"> & { fn?: ModEventFn },
): ModEventRegistration {
  return { fn: stubEvent as ModEventFn, ...decl };
}

// ---------------------------------------------------------------------------
// the manifest (one entry per gem set file; setPaths as in the gem tree)
// ---------------------------------------------------------------------------

const coreMod: DeckoModManifest = {
  name: "core",
  gemName: "card",
  group: "gem-card",
  setModules: [
    {
      // mod/core/set/abstract/task_table.rb — the task_table/task_row
      // format helpers (ported as this module's emitters)
      setPath: "abstract/task_table",
    },
    {
      // mod/core/set/all/admin.rb — the admin-config card methods + the
      // format helpers (section/list_section/nested_list_section/
      // accordion_sections/list_section_content) + basket[:tasks] =
      // {} + basket[:config_title] init (ported: core-admin-runtime.ts)
      setPath: "all/admin",
    },
    {
      // mod/core/set/all/assign_attributes.rb — write-path attribute
      // assignment (engine behavior, not ported)
      setPath: "all/assign_attributes",
    },
    {
      // mod/core/set/all/autoname.rb — event :set_autoname + the
      // autoname?/no_autoname? predicates
      setPath: "all/autoname",
      events: [
        event({
          event: "set_autoname",
          at: "prepare_to_store",
          on: ["create"],
          when: "autoname?",
        }),
      ],
    },
    {
      // mod/core/set/all/codename.rb — events :validate_codename +
      // :reset_codename_cache + the codename validators
      setPath: "all/codename",
      events: [
        event({
          event: "validate_codename",
          at: "validate",
          on: ["update"],
          changed: ["codename"],
        }),
        event({
          event: "reset_codename_cache",
          at: "integrate",
          changed: ["codename"],
        }),
      ],
    },
    {
      // mod/core/set/all/content.rb — events :set_content, :save_draft,
      // :set_default_content + the draft/default-content predicates
      setPath: "all/content",
      events: [
        event({ event: "set_content", at: "store", on: ["save"] }),
        event({
          event: "save_draft",
          at: "store",
          on: ["update"],
          when: "draft?",
        }),
        event({
          event: "set_default_content",
          at: "prepare_to_validate",
          on: ["create"],
          when: "use_default_content?",
        }),
      ],
    },
    {
      // mod/core/set/all/debug.rb — to_s/inspect (dev surface)
      setPath: "all/debug",
    },
    {
      // mod/core/set/all/initialize.rb — Card.new arg normalization
      setPath: "all/initialize",
    },
    {
      // mod/core/set/all/name_events.rb — the nine name events. The two
      // `skip: :allowed` declarations (validate_uniqueness_of_name :12,
      // validate_renaming :46) now carry the field — the execution seam's
      // ModEventRegistration.skip grew it (admin-surface's divergence #6).
      // They stay STUBS: their bodies run as the engine's built-in
      // validations (validateNameLegality/assertNameAvailable/the rename
      // guards), and the takeover contract covers only the real batch.
      setPath: "all/name_events",
      events: [
        event({
          event: "validate_name",
          at: "validate",
          on: ["save"],
          changed: ["name"],
          when: "no_autoname?",
        }),
        event({ event: "validate_uniqueness_of_name", skip: "allowed" }),
        event({ event: "validate_legality_of_name" }),
        event({
          event: "validate_key",
          after: "validate_name",
          on: ["save"],
          when: "no_autoname?",
        }),
        event({
          event: "validate_renaming",
          at: "validate",
          on: ["update"],
          changed: ["name"],
          skip: "allowed",
        }),
        event({
          event: "expire_old_name",
          at: "store",
          changed: ["name"],
          on: ["update"],
        }),
        event({
          event: "rename_in_trash",
          after: "expire_old_name",
          on: ["update"],
        }),
        event({
          event: "prepare_left_and_right",
          at: "store",
          changed: ["name"],
          on: ["save"],
        }),
        event({ event: "update_lexicon", at: "store", changed: ["name"] }),
      ],
    },
    {
      // mod/core/set/all/reference_events.rb — the five reference janitors.
      // These are the events with REAL bodies (the engine's own
      // port modules); when these names are registered at the save path's
      // modEvents runtime, the engine's built-in janitor calls stand down
      // and these bodies ARE the mechanism (card-action-engine.ts
      // runFinalizeEvents). Ruby's declarations verbatim:
      //   :2-4  refresh_references_out, :finalize, on: :save, changed: :content
      //   :6-10 update_referer_content, :finalize, on: :update, changed:
      //         :name, skip: :allowed
      //   :15-19 update_referer_references_out, :finalize, changed: :name,
      //         on: :update, when: :skip_update_referers?
      //   :21-25 refresh_references_in, :finalize, changed: :name, on: :save
      //   :27-31 clear_references, :finalize, on: :delete
      setPath: "all/reference_events",
      events: [
        event({
          event: "refresh_references_out",
          at: "finalize",
          on: ["save"],
          changed: ["content"],
          fn: refreshReferencesOutEvent as ModEventFn,
        }),
        event({
          event: "update_referer_content",
          at: "finalize",
          on: ["update"],
          changed: ["name"],
          skip: "allowed",
          fn: updateRefererContentEvent as ModEventFn,
        }),
        event({
          event: "update_referer_references_out",
          at: "finalize",
          changed: ["name"],
          on: ["update"],
          when: "skip_update_referers?",
          fn: updateRefererReferencesOutEvent as ModEventFn,
        }),
        event({
          event: "refresh_references_in",
          at: "finalize",
          changed: ["name"],
          on: ["save"],
          fn: refreshReferencesInEvent as ModEventFn,
        }),
        event({
          event: "clear_references",
          at: "finalize",
          on: ["delete"],
          fn: clearReferencesEvent as ModEventFn,
        }),
      ],
    },
    {
      // mod/core/set/all/result.rb — event :notable_exception_raised (no
      // stage/triggers) + the abort/success machinery
      setPath: "all/result",
      events: [event({ event: "notable_exception_raised" })],
    },
    {
      // mod/core/set/all/states.rb — real/virtual/unknown predicates
      setPath: "all/states",
    },
    {
      // mod/core/set/all/subcards.rb — event :reject_empty_subcards
      setPath: "all/subcards",
      events: [event({ event: "reject_empty_subcards", at: "prepare_to_validate" })],
    },
    {
      // mod/core/set/all/trash.rb — basket[:tasks][:empty_trash] (in
      // core-admin-runtime.ts, FIRST in the probed load order) + events
      // :manage_trash/:validate_delete/:delete_children
      setPath: "all/trash",
      events: [
        event({ event: "manage_trash", at: "prepare_to_store", on: ["create"] }),
        event({ event: "validate_delete", at: "validate", on: ["delete"] }),
        event({
          event: "delete_children",
          after: "validate_delete",
          on: ["delete"],
        }),
      ],
    },
    {
      // mod/core/set/all/type.rb — events :validate_type_change +
      // :validate_type + the type readers
      setPath: "all/type",
      events: [
        event({
          event: "validate_type_change",
          at: "validate",
          on: ["update"],
          changed: ["type_id"],
        }),
        event({
          event: "validate_type",
          at: "validate",
          changed: ["type_id"],
          on: ["save"],
        }),
      ],
    },
    {
      // mod/core/set/all/utils.rb — mod_path + the t delegate
      setPath: "all/utils",
    },
    {
      // mod/core/set/right/autoname.rb — assign_type :phrase + history?
      setPath: "right/autoname",
    },
    {
      // mod/core/set/self/admin.rb — basket task merges + warnings +
      // no_email_delivery? + event :admin_tasks + views :core/:warning
      setPath: "self/admin",
      formats: {
        html: {
          views: [
            { view: "core", viewFn: adminCoreView, config: { cache: "never" } },
            { view: "warning", viewFn: adminWarningView },
          ],
        },
      },
      events: [event({ event: "admin_tasks", at: "initialize", on: ["update"] })],
    },
    {
      // mod/core/set/self/autoname.rb — the *autoname setting_opts
      setPath: "self/autoname",
      settingOpts: {
        group: "templating",
        position: 4,
        helpText:
          "Autogenerate name for new cards by incrementing this value. [[http://decko.org/autonaming|more]]",
      },
    },
    {
      // mod/core/set/self/mod.rb — views :cardtypes/:settings/:tasks/
      // :configurations/:roles (+ the object-inspect content override,
      // NOT ported — header note)
      setPath: "self/mod",
      formats: {
        html: {
          views: [
            { view: "cardtypes", viewFn: modCardtypesView },
            { view: "settings", viewFn: modSettingsView },
            { view: "tasks", viewFn: modTasksView },
            { view: "configurations", viewFn: modConfigurationsView },
            { view: "roles", viewFn: modRolesView },
          ],
        },
      },
    },
    {
      // mod/core/set/self/trash.rb — view :core (the trash table +
      // restore links; needs the trash query + restore write path — the
      // named remainder in the header; *trash's :core keeps the base view)
      setPath: "self/trash",
    },
    {
      // mod/core/set/self/version.rb — the Cardio::Version.release content
      // override + ok_to_read? (NOT ported — header note)
      setPath: "self/version",
    },
    {
      // mod/core/set/type/cardtype.rb — basket[:non_createable_types] +
      // the three cardtype events. check_for_cards_of_type_when_type_
      // changed's `changing: :type` (:19-20) now carries the manifest
      // field (the seam's alias of changed:, event.rb:57); its when:
      // predicate (was_cardtype?) stays unported — the dispatcher reports
      // the skip as predicate-unresolved if a runtime ever walks it
      // without porting the predicate.
      setPath: "type/cardtype",
      events: [
        event({ event: "check_for_cards_of_type", after: "validate_delete" }),
        event({
          event: "check_for_cards_of_type_when_type_changed",
          at: "validate",
          changing: ["type"],
          when: "was_cardtype?",
        }),
        event({
          event: "validate_cardtype_name",
          at: "validate",
          on: ["save"],
          changed: ["name"],
        }),
      ],
    },
    {
      // mod/core/set/type/mod.rb — the eleven per-mod views + the
      // admin_config card methods (ported here and in
      // core-admin-runtime.ts)
      setPath: "type/mod",
      formats: {
        html: {
          views: [
            { view: "core", viewFn: modCardCoreHtml },
            { view: "description", viewFn: typeModDescriptionView },
            { view: "settings", viewFn: typeModSettingsView },
            { view: "cardtypes", viewFn: typeModCardtypesView },
            { view: "configurations", viewFn: typeModConfigurationsView },
            { view: "tasks", viewFn: typeModTasksView },
            { view: "styles", viewFn: typeModStylesView },
            { view: "scripts", viewFn: typeModScriptsView },
            { view: "gem_info", viewFn: typeModGemInfoView },
            { view: "depends_on", viewFn: typeModDependsOnView },
            { view: "views", viewFn: typeModViewsView },
            // type/mod.rb view:bar_right — registered here on the type/mod
            // module; the page-surface render never binds a ModLoader, so
            // this registration alone does not dispatch there. See the base
            // barRightView in views.ts for that surface.
            { view: "bar_right", viewFn: typeModBarRightView },
          ],
        },
      },
    },
  ],
  prepareEngine: async (host) => {
    moduleAdminHost = host;
    await prepareAdminRuntime(host);
  },
};

export default coreMod;

// re-exports: the tests (and a composition's boot seam) read the runtime
// surface through the mod module
export {
  CORE_TASK_BASKET,
  CORE_WARNING_BASKET,
  adminRuntimeConfig,
  setAdminRuntimeConfig,
  resetAdminRuntimeConfig,
} from "./core-admin-runtime.js";
