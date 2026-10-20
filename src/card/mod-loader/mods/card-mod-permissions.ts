// The card-mod-permissions gem (card-mod-permissions-0.20.0), ported through
// the mod loader.
//
// The gem's tree (the installed
// card-mod-permissions-0.20.0/): eleven set files (1 abstract, 2 all,
// 4 right, 4 self), no lib/, no haml, no set_pattern/, 4 html views
// declared (tools/compat-report/mod-compat-report.json
// #card-mod-permissions-0.20.0: htmlViewsDeclared 4, htmlViewsCovered 1,
// htmlViewsMissingNames ["input", "one_line_content", "pointer_core"]).
//
// Ported here:
// - the three missing views, registered on the abstract/permission set
//   module exactly where Ruby defines them (set/abstract/permission.rb
//   format :html block, lines 9-43): :pointer_core, :one_line_content,
//   :input. Their viewFns carry the set guard Ruby's Right-set inclusion
//   gives them (right/create.rb:1, right/delete.rb:1, right/read.rb:1,
//   right/update.rb:1 - include_set/include Abstract::Permission): a card
//   outside the four permission-right sets raises UnsupportedViewError,
//   the same verdict Ruby's render.rb#view_method produces for
//   :pointer_core there (no reachable definition); for :one_line_content
//   and :input Ruby would fall through to card-mod-list's list-abstract
//   definitions (set/abstract/01_list/html_views.rb:20-26, 37-39) - those
//   are another mod's views, outside this port's scope, and are documented
//   in the guard comments.
// - the mod's :core override as the exported function permissionCoreView
//   (NOT registered - see "why :core is not registered" below).
// - the four setting_opts registrations (set/self/{create,read,update,
//   delete}.rb) - oracle state under the settings registry, group
//   "permission", positions 1-4.
// - prepareEngine: the Auth.as_bot role warm (the port of
//   set/abstract/permission.rb:64-68 group_options' Card.search type_id:
//   RoleID sort_by: "name", run once per engine so the :input view's
//   Groups section renders from warmed state with zero queries - the same
//   boot-time-warm shape card-mod-help's prepareHelpRules uses).
//
// Why :core is not registered: the mod's :core (permission.rb:14-20) is an
// OVERRIDE of the engine's highest-traffic view, scoped in Ruby to the four
// permission-right sets. The TS view table is global (one name, one fn -
//  "View dispatch is global, not set-scoped")
// registering this override would replace :core for EVERY card, and a viewFn
// cannot delegate to the displaced base view (the loader's undo record is
// not reachable from the viewFn). The body is ported and exported as
// permissionCoreView with its full citation so a set-scoped dispatch
// layer can register it verbatim; the tests pin its bytes directly.
//
// NOT ported (honest remainder):
// - the EVENT BODIES of the gem (set/all/permissions.rb:1-26 bodies of
//   set_read_rule / set_field_read_rules / update_read_rule /
//   check_permissions; set/all/update_read_rules.rb:4-11 bodies of
//   update_rule_cache / expire_related; set/right/read.rb:9-14 body of
//   cascade_read_rule + its cascade machinery, 16-77) - the manifest
//   records a DECLARATION for each and the stage walk consults the
//   registry, but no Ruby-equivalent event BUS runs these bodies (the
//   ModEventRegistry is a declaration table plus a stage walk, not a
//   message bus: src/card/mod-loader/mod-event-registry.ts). The
//   DECLARATIONS land on the ModEventRegistry
//   (see the Events section below); the bodies are no-op stubs. The READ
//   half of the permission semantics already exists engine-side:
//   RenderEngineLike.isDenied/taskAllowed cite exactly permissions.rb:
//   142-143 (ok_to_read?) and 148-157 (ok_to_update?/ok_to_create?/
//   ok_to_delete?) as their Ruby source (src/card/render/format.ts:
//   637-648), precomputed in the engine's prepare phase. The persistence
//   half (read_rule_id/read_rule_class columns, update_read_rule's
//   update_all, the without_timestamps write) is DB-write behavior with
//   no TS write-path surface.
// - set/abstract/permission.rb:1-3 standardize_items and 5-7 options_card -
//   card-level methods; the format-level consumer (options_card_name,
//   card-mod-layout set/abstract/items/options_api.rb:51-53) is reproduced
//   in the :input port via the codename warm (cardsWithAccountUrlKey).
// - assets/style/permissions.scss - stylesheet mods are a separate surface.
// - config/admin.yml - the admin surface (settings list) has no TS consumer.
// - data/real.yml + data/test.yml - deck seed content (the *create/*read/
//   *update/*delete setting cards, the *all rules "Anyone [Signed In]",
//   the _left inherit rules on *all_plus) - a deck-fixture surface, not
//   mod code; the seeds DO pin the setting cards' codename convention
//   (name "*create" -> codename "create", real.yml:1-16) this port relies on.
// - config/locales/{en,de}.yml - the single string
//   permission_error_no_action_rule ("No %{action} rule for %{name}",
//   en.yml:2) is consumed only by require_permission_rule!
//   (permissions.rb:77-85), an event-path error with no TS surface.
//
// Events: the seven events the manifest's events[] surface can
// carry verbatim - file coordinates injected by the loader's SetLoader
// phase (mod-loader.ts:283-293, the same path card-mod-list's not-ported
// events would take). Ruby file -> manifest field map:
//   - set/all/permissions.rb:1-26 - events :set_read_rule (`:store`,
//     `on: :save`, `changed: %i[type_id name]` - `changed` is the
//     ModEventRegistration.changed field, mod-manifest.ts:204-207,
//     stored verbatim), :set_field_read_rules (`after: :set_read_rule`,
//     `on: :update`, `changed: :type_id` - `after` is the
//     ModEventRegistration.after field, mod-manifest.ts:209-212, stored
//     verbatim; `changed` is the same surface as above),
//     :update_read_rule (no stage, no opts), :check_permissions
//     (`:validate`, permissions.rb:22-26 - Ruby's validate stage,
//     card-1.110.0 director.rb:18, is in ModEventStage, mod-manifest.ts:
//     155; recorded verbatim).
//   - set/all/update_read_rules.rb:4-11 - events :update_rule_cache
//     (`:finalize, when: :rule?`) and :expire_related (`:finalize`).
//   - set/right/read.rb:9-14 - event :cascade_read_rule (`:finalize,
//     after: :update_rule_cache, when: :rule?` - `after` is the
//     ModEventRegistration.after field, stored verbatim).
//
// Event bodies: every fn is a no-op stub. The bodies live on Ruby's save
// path (set_read_rule mutates read_rule_id/read_rule_class; update_read_rule
// wraps `Card.where(id: id).update_all read_rule_id: ..., read_rule_class:
// ...` in `without_timestamps`, permissions.rb:11-20; cascade_read_rule
// walks the rule set's members and rewrites their read_rule_id,
// read.rb:28-63; check_permissions tracks permission errors and raises
// Card::Error::PermissionDenied, permissions.rb:201-207 / 77-85; the
// `:update_rule_cache` body calls Card::Rule.clear_rule_cache, line 5;
// `:expire_related` resets patterns + pushes structurees to Director.
// expirees, line 8-11). All are DB-write / class-side state with no TS
// write-path surface; the registry pins the DECLARATIONS, recording which
// event names land at which stages, the same surface
// card-mod-integrate pins as OBSERVER_EVENT_DECLARATIONS for the same
// reason.

import { viewWrapInherited } from "../mod-view-helpers.js";
import { str, UnsupportedViewError, type RenderCard, type ViewContext, type ViewFn, type PermissionEditorOptions } from "../../render/format.js";
import { DeckoName } from "../../name.js";
import { PATTERN_TABLE } from "../../set-patterns/registry.js";
import { permissionInheritContentHtml, permissionRuleTask } from "../../render/rule-bar-right.js";
import { rawItemStrings } from "../../render/pointer-list.js";
import { h } from "../../render/slot-html.js";
import type {
  DeckoModManifest,
  ModEngineHost,
  ModEventCard,
  ModEventFn,
  ModEventRegistration,
} from "../mod-manifest.js";
import type { ModEventContext } from "../mod-event-dispatch.js";
import {
  isStandardRuleName,
  isPreferenceName,
} from "../../actions/rule-content-walk.js";

// ---------------------------------------------------------------------------
// the permission-right set guard (right/{create,delete,read,update}.rb)
// ---------------------------------------------------------------------------

/** The tag codenames whose Right set includes Abstract::Permission
 *  (right/create.rb:1, right/delete.rb:1, right/read.rb:1,
 *  right/update.rb:1). The Right pattern applies to a compound card whose
 *  tag card carries the codename (set_pattern/right.rb anchor); the setting
 *  cards' codenames are their bare names (data/real.yml:1-16: name "*create"
 *  -> codename "create"). */
const PERMISSION_TAG_KEYS = new Set(["*create", "*read", "*update", "*delete"]);

/** True when the card is in one of the four permission-right sets - the
 *  applicability Ruby's include_set Abstract::Permission gives the mod's
 *  views. Simple cards and other-tag cards are outside. */
export function isPermissionRuleCard(card: ViewContext["fmt"]["card"]): boolean {
  return card.name.isCompound && PERMISSION_TAG_KEYS.has(card.name.tagName.key);
}

/** The guard every registered view runs first: out-of-set renders raise the
 *  unsupported-view error the way render.rb#view_method does for a view the
 *  card's set does not define. */
function assertPermissionRule(ctx: ViewContext, view: string): void {
  if (!isPermissionRuleCard(ctx.fmt.card)) {
    throw new UnsupportedViewError(view, ctx.fmt.card.name.s);
  }
}

// ---------------------------------------------------------------------------
// set/abstract/permission.rb - the format-level permission helpers
// ---------------------------------------------------------------------------

/** permission.rb:70-78 inheritable?:
 *  `set_name = card.name.trunk_name; set_card = Card.fetch(set_name);
 *  not_set = set_card && set_card.type_id != SetID;
 *  not_set ? false : set_card.inheritable?`.
 *  The trunk of a rule card "Set+*read" is the SET card. The TS render path
 *  has no raise-on-miss fetch (a miss resolves to an unknown card
 *  downstream), so a missing trunk returns false here where Ruby's
 *  Card.fetch raises Card::Error::NotFound - documented divergence.
 *  Set-typedness reads the enriched typeCode (the codename "set"'s card
 *  is the Set cardtype; SetID membership == typeCode "set").
 *  set_card.inheritable? is card-mod-rules set/type/set.rb:21-23:
 *  `compound_only? || (anchor_name&.compound? && self_set?)` - ported in
 *  setInheritable below. */
function inheritable(ctx: ViewContext): boolean {
  const setCard = ctx.fmt.engine.fetchRenderCard(ctx.fmt.card.name.trunkName.s);
  if (setCard === undefined || setCard.typeCode !== "set") return false;
  return setInheritable(setCard.name);
}

/** card-mod-rules set/type/set.rb:15-27 for a set card:
 *  `pattern = tag` (the set card's right part, e.g. "*all"); codename =
 *  the tag name minus the star (the pattern cards' codename convention,
 *  data/real.yml:1-16); `compound_only?` = the pattern spec's compoundOnly
 *  (the PATTERN_TABLE is the ported pattern registry);
 *  `self_set?` = pattern_name == the *self pattern (set.rb:25-27);
 *  `anchor_name&.compound?` = the set card's trunk. */
function setInheritable(setName: DeckoName): boolean {
  const code = setName.tagName.s.replace(/^\*/, "").replace(/\s+/g, "_");
  const spec = PATTERN_TABLE.find((candidate) => candidate.code === code);
  const compoundOnly = spec?.compoundOnly ?? false;
  const selfSet = code === "self";
  return compoundOnly || (setName.trunkName.isCompound && selfSet);
}

/** permission.rb:80-82 inheriting?: `inheritable? && card.content == "_left"`. */
function inheriting(ctx: ViewContext): boolean {
  return inheritable(ctx) && ctx.fmt.card.dbContent === "_left";
}

/** permission.rb:98-105 core_inherit_content: a span with the self-set
 *  context's "Inherit ( roles )" bytes or the bare "Inherit from left
 *  card". @set_context is rule-editor state the TS voo carries as the
 *  "set_context" opt (undefined outside the rule editor - the common
 *  render path). */
function coreInheritContent(ctx: ViewContext): string {
  const setContextOpt = ctx.voo.opts["set_context"];
  const setContext = typeof setContextOpt === "string" ? DeckoName.parse(setContextOpt) : undefined;
  // ONE decision for both surfaces (the bar's and this one): the shared
  // marker in rule-bar-right.ts, which owns the permission.rb:98-122 table.
  return permissionInheritContentHtml(setContext, ctx.fmt.engine, permissionRuleTask(ctx.fmt.card));
}

// ---------------------------------------------------------------------------
// the Rails tag emitters the view bodies compose (byte shapes)
// ---------------------------------------------------------------------------

/** Rails ActionView form_tag_helper.rb#check_box_tag (455-460): attribute
 *  order type, name, id (sanitize_to_id(name)), value, then the extra
 *  options, then checked="checked" last when checked. */
function checkBoxTag(
  name: string,
  value: string,
  checked: boolean,
  extraClass: string | undefined,
): string {
  const id = name;
  const classAttr = extraClass === undefined ? "" : ` class="${extraClass}"`;
  const checkedAttr = checked ? ` checked="checked"` : "";
  return (
    `<input type="checkbox" name="${h(name)}" id="${h(id)}" value="${h(value)}"${classAttr}${checkedAttr} />`
  );
}

/** The material icon tag (card-mod-bootstrap set/all/bootstrap/icon.rb:97-107
 *  icon_tag -> 120-123 material_icon_tag: add_class "material-icons",
 *  wrap_with :i) with the basket's material mapping
 *  (mods/card-mod-bootstrap.ts ICON_BASKET.material: new_window ->
 *  "close_fullscreen", reorder -> "reorder", remove -> "close";
 *  the literal "add" name passes through). */
function iconTag(materialName: string, extraClass?: string): string {
  // the oracle's icon_tag output carries the extra class FIRST
  // ("text-muted notranslate material-icons" in the rule-form
  // card editor)
  const cls = extraClass === undefined
    ? "notranslate material-icons"
    : `${extraClass} notranslate material-icons`;
  return `<i class="${cls}">${materialName}</i>`;
}

// ---------------------------------------------------------------------------
// set/abstract/permission.rb format :html - view :pointer_core (10-12)
// ---------------------------------------------------------------------------

/** permission.rb:10-12 view :pointer_core:
 *  `wrap_with :div, pointer_items, class: "pointer-list"`.
 *  pointer_items (card-mod-list set/abstract/01_list/other_views.rb:12-14)
 *  with no args renders EVERY item (no paging on this view) through
 *  listing_list -> listing -> nest_item (card-mod-collection
 *  set/all/item.rb:164-172); the html wrap_item (card-mod-list
 *  set/abstract/01_list/html_views.rb:28-30) gives each item
 *  `<div class="pointer-item item-#{item_view}">`; output() joins the
 *  array with "\n" (card-1.110.0 lib/card/format/content.rb:70-73).
 *  The item view is voo.items' view when the caller set it (the
 *  :one_line_content path passes {view: :link} through core - the
 *  voo-items ride nest_item's item_view_options merge,
 *  item.rb:149-151), else the html default :bar (card-mod-format
 *  set/all/html.rb:21-23). Items nest through fmt.nest (the real
 *  nest_item surface): a fetch miss renders the unknown-card bytes
 *  exactly like Ruby's Card.fetch new: {} item cards. */
function pointerCoreBody(ctx: ViewContext): string {
  const items = rawItemStrings(ctx.fmt.card.dbContent).filter((s) => s.length > 0);
  const itemsOpt = ctx.voo.opts["items"];
  const itemView =
    typeof itemsOpt === "object" && itemsOpt !== null && "view" in itemsOpt
      ? String((itemsOpt as { view: unknown }).view)
      : "bar";
  const rendered = items
    .map((name) =>
      `<div class="pointer-item item-${itemView}">${ctx.fmt.nest({ name, syntax: "", options: { view: itemView, extra: {} }, comment: undefined })}</div>`)
    .join("\n");
  return `<div class="pointer-list">${rendered}</div>`;
}

/** The registered :pointer_core view (the set guard + the body). */
const pointerCoreView: ViewFn = (ctx) => {
  assertPermissionRule(ctx, "pointer_core");
  return pointerCoreBody(ctx);
};

// ---------------------------------------------------------------------------
// set/abstract/permission.rb format :html - view :one_line_content (22-24)
// ---------------------------------------------------------------------------

/** permission.rb:22-24 view :one_line_content, cache: :never:
 *  `render_core items: { view: :link }` - the CORE view with the items
 *  opt; the mod's core dispatches to :pointer_core, whose items inherit
 *  the link view (see pointerCoreBody). Registered with the same
 *  cache: :never config. */
const oneLineContentView: ViewFn = (ctx) => {
  assertPermissionRule(ctx, "one_line_content");
  return viewWrapInherited(ctx, "one_line_content", str(ctx.fmt.renderView("core", { items: { view: "link" } })));
};

// ---------------------------------------------------------------------------
// set/abstract/permission.rb format :html - view :core (14-20) - EXPORTED,
// NOT REGISTERED (see the header: global-table clobber)
// ---------------------------------------------------------------------------

/** permission.rb:14-20 view :core, cache: :never: content "_left" renders
 *  the inherit span; anything else renders :pointer_core (render! - the
 *  full pipeline re-dispatch, format.ts#renderView). The items opt rides
 *  into the pointer core (the :one_line_content path). NOT registered -
 *  a set-scoped dispatch layer would register this fn with
 *  config { cache: "never" }. */
export const permissionCoreView: ViewFn = (ctx) => {
  assertPermissionRule(ctx, "core");
  if (ctx.fmt.card.dbContent === "_left") {
    return coreInheritContent(ctx);
  }
  return ctx.fmt.renderView("pointer_core", { items: ctx.voo.opts["items"] });
};

// ---------------------------------------------------------------------------
// set/abstract/permission.rb format :html - view :input (26-43)
// ---------------------------------------------------------------------------

/** Legacy explicit prepareEngine fixture catalog. Concrete RenderEngine
 * instances always use their own freshly prepared PermissionEditorOptions;
 * the process-wide fixture state never supplies a concrete engine's form. */
interface RoleOption {
  name: string;
  key: string;
}
const roleRegistry: RoleOption[] = [];
/** The url_key of Card[:cards_with_account] (permission.rb:5-7
 *  options_card -> card-mod-layout options_api.rb:51-53 options_card_name),
 *  resolved by the same warm; undefined until resolved (the haml drops a
 *  nil data-options-card attribute). */
let cardsWithAccountUrlKey: string | undefined;

/** Test/state reset for the warm registry (the loader's reset() cannot see
 *  module state). */
export function resetPermissionRolesForTests(): void {
  roleRegistry.length = 0;
  cardsWithAccountUrlKey = undefined;
}

/** permission.rb:47-62 groups: one form-check row per role option,
 *  name-sorted; `checked = !item_names.delete(option.name).nil?` - the
 *  role's presence in item_names CHECKS the box AND CONSUMES the name, so
 *  the individuals list (the caller's remaining item_names) excludes
 *  grouped names. Returns the rows AND the consumed list's remainder
 *  (Ruby mutates item_names in place).
 *
 *  BYTE SHAPE (corrected against the oracle - the *all+*read
 *  rule form's perm editor output): each row is the groups helper's <<-HTML heredoc
 *  VERBATIM - the source indentation rides the emitted bytes (8/10/12
 *  leading spaces; the box, the role name and the option link share ONE
 *  line, permission.rb:55), the rows join "\n" (`* "\n"`), and the
 *  option link is link_to_card's attribute order - target (caller opt),
 *  class "known-card" (links.rb:140-144 add_known_or_wanted_class),
 *  href appended LAST (links.rb:105). */
function groupRowsAndRemainingItems(
  itemNames: string[],
  roles: readonly RoleOption[],
): { rows: string; remainingItems: string[] } {
  const remaining = [...itemNames];
  const rows = roles.map((option) => {
    const checked = remaining.indexOf(option.name);
    if (checked !== -1) remaining.splice(checked, 1);
    const icon = iconTag("close_fullscreen", "text-muted");
    const optionLink =
      `<a target="decko_role" class="known-card" href="/${h(DeckoName.parse(option.name).urlKey)}">${icon}</a>`;
    const box = checkBoxTag(
      `${option.key}-perm-checkbox`,
      option.name,
      checked !== -1,
      "perm-checkbox-button",
    );
    return (
      `        <div class="form-check checkbox">\n` +
      `          <label class="form-check-label">\n` +
      `            ${box} ${h(option.name)} ${optionLink}\n` +
      `          </label>\n` +
      `        </div>\n`
    );
  });
  return { rows: rows.join("\n"), remainingItems: remaining };
}

/** card-mod-list set/abstract/01_list/html_views.rb:48-55 list_input +
 *  html_views/list_input.haml: a ul.pointer-list-editor (plus the extra
 *  class) of li.pointer-li.mb-1 rows (handle icon, pointer_item text
 *  field with data-options-card + placeholder, delete button), then the
 *  add-another button. placeholder_text is "" (card-mod-edit
 *  set/all/editor.rb:60-62).
 *
 *  BYTE SHAPE (corrected against the oracle - the rule-form editor
 *  output): the haml
 *  template's single-quoted attributes, one template line per emitted line;
 *  `ul_classes = classy "pointer-list-editor", extra_class` where
 *  extra_class is list_input's OWN "pointer-list-ul" literal (html_views.rb:
 *  49-51) - the caller's extra_css_class: 'perm-indiv-ul' argument is DEAD
 *  (list_input never reads it); items_for_input (html_views.rb:115-118)
 *  maps an EMPTY list to [""] - one value-less row; the haml output ends
 *  with a trailing newline (haml_to_html's template flush). */
function listInput(itemNames: string[], optionsCardUrlKey: string | undefined): string {
  const items = itemNames.length === 0 ? [""] : itemNames;
  const rows = items
    .map(
      (item) =>
        `<li class='pointer-li mb-1'>\n` +
        `<span class='input-group'>\n` +
        `<span class='input-group-text handle'>\n${iconTag("reorder")}\n</span>\n` +
        `<input type="text" name="pointer_item" id="pointer_item" value="${h(item)}" class="pointer-item-text form-control"` +
        (optionsCardUrlKey === undefined ? "" : ` data-options-card="${h(optionsCardUrlKey)}"`) +
        ` placeholder="" />\n` +
        `<button class='pointer-item-delete btn btn-secondary' type='button'>\n${iconTag("close")}\n</button>\n` +
        `</span>\n` +
        `</li>`,
    )
    .join("\n");
  return (
    `<ul class='pointer-list-editor pointer-list-ul'>\n${rows}\n</ul>\n` +
    `<span class='input-group'>\n` +
    `<button class='_pointer-item-add btn btn-secondary' type='submit'>\n` +
    `${iconTag("add")}\n` +
    `add another\n` +
    `</button>\n` +
    `</span>\n`
  );
}

/** permission.rb:84-96 inheritance_checkbox: rendered only when
 *  inheritable?; the inherit checkbox + a label carrying the inherit
 *  span and the "?" explainer whose title reads the card's tag
 *  (card.name.tag = the right part, e.g. "*read"). */
function inheritanceCheckbox(ctx: ViewContext): string {
  if (!inheritable(ctx)) return "";
  const box = checkBoxTag("inherit", "inherit", inheriting(ctx), undefined);
  const title = `use left's ${ctx.fmt.card.name.tagName.s} rule`;
  return (
    `<div class="perm-inheritance perm-section">` +
    box +
    `<label>${coreInheritContent(ctx)}` +
    `<a title="${h(title)}">?</a>` +
    `</label></div>`
  );
}

/** permission.rb:26-43 view :input: the hidden content field, then the
 *  perm editor (inheritance checkbox when inheritable, the Groups
 *  checkboxes, the Individuals list_input). item_names is EMPTY when
 *  inheriting (the rule inherits; nothing to list).
 *
 *  BYTE SHAPE (corrected against the oracle - the rule-form editor
 *  output): the view body
 *  is the %( ... ) literal VERBATIM - the source indentation rides the
 *  bytes (6-space content lines, 8-space interpolation lines, the blank
 *  line between the Groups and Individuals sections), the literal opens
 *  with "\n" and ends with "\n    " (the closing paren line's indent).
 *  The hidden content field is _render_hidden_content_field (card-mod-format
 *  set/all/content.rb:57-59 `hidden_field :content, class: "d0-card-content"`)
 *  through the bootstrap field-helper override (card-mod-bootstrap
 *  set/all/bootstrap/form.rb:5-11 FIELD_HELPERS + 24-28 bootstrap_options:
 *  " form-control" appended to the class) and Rails' Tags::HiddenField
 *  (autocomplete="off" set BEFORE super) + Tags::TextField#render (options
 *  stringify; size=nil dropped; type/value set; add_default_name_and_id
 *  appends name/id LAST) - attr order class, autocomplete, type, value,
 *  name, id. */
const inputView: ViewFn = (ctx) => {
  assertPermissionRule(ctx, "input");
  const itemNames = inheriting(ctx) ? [] : rawItemStrings(ctx.fmt.card.dbContent);
  const hiddenField =
    `<input class="d0-card-content form-control" autocomplete="off" type="hidden" value="${h(ctx.fmt.card.dbContent)}" name="card[content]" id="card_content" />`;
  // Concrete engines always provide isolated render-prepared state. Legacy
  // stub-only loaders retain their explicit prepareEngine fixture catalog.
  const options = ctx.fmt.engine.permissionEditorOptions?.() ?? {
    roles: roleRegistry, cardsWithAccountUrlKey,
  };
  const { rows, remainingItems } = groupRowsAndRemainingItems(itemNames, options.roles);
  return (
    `\n      ${hiddenField}\n` +
    `      <div class="perm-editor">\n` +
    `        ${inheritanceCheckbox(ctx)}\n` +
    `        <div class="perm-group perm-vals perm-section">\n` +
    `          <h5 class="text-muted">Groups</h5>\n` +
    `          ${rows}` +
    `\n        </div>\n` +
    `\n        <div class="perm-indiv perm-vals perm-section">\n` +
    `          <h5 class="text-muted">Individuals</h5>\n` +
    // Ruby's call passes extra_css_class: 'perm-indiv-ul', but list_input
    // never reads it (html_views.rb:49 hardcodes "pointer-list-ul") - the
    // argument is dead there, so the port's listInput takes none.
    `          ${listInput(remainingItems, options.cardsWithAccountUrlKey)}` +
    `\n        </div>\n` +
    `      </div>\n` +
    `    `
  );
};

// ---------------------------------------------------------------------------
// prepareEngine - the boot-time role + options-card warm
// (permission.rb:64-68 group_options' Card.search, run once per engine)
// ---------------------------------------------------------------------------

/** One batch: the Role-typed cards (Auth.as_bot's search,
 *  permission.rb:65-67: `Card.search({ type_id: RoleID, sort_by: "name" },
 *  "roles by name")`) - trash-free, ordered by name key (Card.search
 *  sort_by: "name" orders by the key column). */
function rolesStatement(roleTypeId: number): { sql: string; params: unknown[] } {
  return {
    sql: "SELECT id FROM cards WHERE type_id = ? AND trash = 0 ORDER BY key ASC",
    params: [roleTypeId],
  };
}

/** The boot warm: every Role card enters the engine's render-card cache
 *  (so the groups' links resolve with zero queries) and this module's
 *  registry (the sorted enumeration group_options renders from), plus the
 *  cards_with_account card for the input's data-options-card. The engine
 *  render path itself never queries for the role list. */
/** Live render preparation: one full-row query, not one fetch per role.
 * Ruby group_options deliberately runs as Bot, independent of the viewer's
 * readable roles. Only the form's role catalog bypasses actor filtering;
 * the form's own read/update gates remain unchanged. No process-global state. */
export async function readPermissionEditorOptions(host: ModEngineHost): Promise<PermissionEditorOptions> {
  await host.codenames.ensureLoaded();
  const roleId = host.codenames.peekId("role");
  const optionsId = host.codenames.peekId("cards_with_account");
  if (roleId === undefined) return {roles: []};
  const results = await host.batch([{
    sql: "SELECT c.* FROM cards c WHERE c.trash = 0 AND (c.type_id = ? OR c.id = ?) ORDER BY c.key ASC",
    params: [roleId, optionsId ?? -1],
  }]);
  const rows = (results[0] as {rows: {id: number; type_id: number}[]}).rows;
  const roleIds = new Set(rows.filter(row => Number(row.type_id) === roleId).map(row => Number(row.id)));
  const records = await host.composeAndCacheRows(rows);
  const roles: RoleOption[] = [];
  let optionsKey: string | undefined;
  for (const record of records) {
    if (record.id === undefined || record.name === undefined) continue;
    if (roleIds.has(record.id)) roles.push({name: record.name.s, key: record.key ?? DeckoName.parse(record.name.s).key});
    if (record.id === optionsId) optionsKey = DeckoName.parse(record.name.s).urlKey;
  }
  return {roles, ...(optionsKey !== undefined ? {cardsWithAccountUrlKey: optionsKey} : {})};
}

export async function preparePermissionRoles(host: ModEngineHost): Promise<void> {
  resetPermissionRolesForTests();
  await host.codenames.ensureLoaded(); // memoized; first call only
  const roleTypeId = host.codenames.peekId("role");
  if (roleTypeId === undefined) return; // degenerate deck: no Role cardtype
  const results = await host.batch([rolesStatement(roleTypeId)]);
  const rows = (results[0] as { rows: { id: number }[] } | undefined)?.rows ?? [];
  for (const row of rows) {
    const record = await host.fetchById(row.id);
    if (record === undefined || record.name === undefined) continue;
    await host.cacheFetchedRecord(record);
    roleRegistry.push({ name: record.name.s, key: record.key ?? DeckoName.parse(record.name.s).key });
  }
  roleRegistry.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const withAccountId = host.codenames.peekId("cards_with_account");
  if (withAccountId !== undefined) {
    const record = await host.fetchById(withAccountId);
    if (record?.name !== undefined) {
      await host.cacheFetchedRecord(record);
      cardsWithAccountUrlKey = DeckoName.parse(record.name.s).urlKey;
    }
  }
}

// ---------------------------------------------------------------------------
// the manifest (one entry per gem file; setPaths as in the gem tree)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// the event bodies (lib/card/set/event.rb registrations; fn signature
// (card, host) -> void | Promise<void> per mod-manifest.ts:177-180)
// ---------------------------------------------------------------------------

/** permissions.rb:1-5 `event :set_read_rule, :store, on: :save, changed:
 *  %i[type_id name] do ... end`. Body: `read_rule_id, read_rule_class =
 *  permission_rule_id_and_class(:read); self.read_rule_id = read_rule_id;
 *  self.read_rule_class = read_rule_class` - mutates the acting card's
 *  read_rule columns on save. DB-write behavior with no TS write-path
 *  surface; the registry carries the declaration, the fn is a no-op. */
const setReadRuleFn: ModEventFn = (_card, _host) => {
  // no-op: see the header's "Event bodies" paragraph.
};

/** permissions.rb:7-9 `event :set_field_read_rules, after: :set_read_rule,
 *  on: :update, changed: :type_id do each_field_as_bot(&:update_read_rule)
 *  end`. Body: walks the card's field cards as Auth.as_bot and calls
 *  update_read_rule on each. The TS field-walk + Auth.as_bot role + the
 *  update_read_rule recursion are all DB-write surfaces. */
const setFieldReadRulesFn: ModEventFn = (_card, _host) => {
  // no-op: see the header's "Event bodies" paragraph.
};

/** permissions.rb:11-20 `event :update_read_rule do without_timestamps do
 *  reset_patterns; set_read_rule; Card.where(id: id).update_all
 *  read_rule_id: read_rule_id, read_rule_class: read_rule_class; expire
 *  :shared; update_field_read_rules end end`. Body: full read-rule
 *  recomputation + update_all over a Card.where + pattern reset + cache
 *  expiration. All DB-write / cache-write; the registry carries the
 *  declaration only. */
const updateReadRuleFn: ModEventFn = (_card, _host) => {
  // no-op: see the header's "Event bodies" paragraph.
};

/** update_read_rules.rb:4-6 `event :update_rule_cache, :finalize, when:
 *  :rule? do Card::Rule.clear_rule_cache end`. Body: clears the
 *  process-wide Rule::Cache (rule/cache.rb - the lookup table the
 *  rule_card walk reads). Cache-write on a class-side object; no TS
 *  consumer; the registry carries the declaration only. */
const updateRuleCacheFn: ModEventFn = (_card, _host) => {
  // no-op: see the header's "Event bodies" paragraph.
};

/** update_read_rules.rb:8-11 `event :expire_related, :finalize do
 *  reset_patterns; structuree_names.each { |name| Director.expirees <<
 *  name } if is_structure? end`. Body: pattern reset + push structuree
 *  names onto the Director's expirees queue. Class-side / director-side
 *  state with no TS consumer. */
const expireRelatedFn: ModEventFn = (_card, _host) => {
  // no-op: see the header's "Event bodies" paragraph.
};

/** right/read.rb:9-14 `event :cascade_read_rule, :finalize, after:
 *  :update_rule_cache, when: :rule? do return unless name_is_changing? ||
 *  trash_is_changing?; update_read_ruled_cards end`. Body: walks the rule
 *  set's members, calls update_read_rule on each, and rewrites
 *  read_rule_id-bearing cards via Auth.as_bot. read.rb:28-63.
 * AUDIT 2026-10-20 (events tranche 5, register events-table row): the
 * "no TS consumer" note predated the sibling rows landing — the body IS
 * ported, as cascadeReadRuleAfterRuleSave
 * (permissions/set-read-rule.ts:443+), wired at five save-path call sites
 * (card-action-engine.ts:2291, 2426, 3530, 4279, 4384), carrying Ruby's
 * guard ORDER: the name/trash return (read.rb:11) before the rule? gate,
 * then set members (read.rb:39-47) and cards whose stored read_rule_id
 * names this rule (read.rb:56-63). The fn stays the honest stub; the
 * declaration and the engine owner are pinned by
 * tests/card/mod-loader/card-mod-permissions-read-rule-events.test.ts. */
const cascadeReadRuleFn: ModEventFn = (_card, _host) => {
  // no-op: see the header's "Event bodies" paragraph.
};

/** permissions.rb:22-26 `event :check_permissions, :validate do
 *  track_permission_errors do ok? action_for_permission_check end end`.
 *  Body: tracks permission errors via `@permission_errors` and routes
 *  through the action-specific ok_to_*? predicates
 *  (permissions.rb:142-157). The read half lives engine-side
 *  (RenderEngineLike.isDenied/taskAllowed, format.ts:637-648, citing
 *  permissions.rb:142-157); the validate-stage write path
 *  (`errors.add :permission_denied` + `raise Card::Error::PermissionDenied`,
 *  permissions.rb:77-85).
 *  AUDIT 2026-10-20 (events tranche 5, register events-table row): the
 *  body IS ported — the engine's assertMayUpdate / assertCanWrite
 *  (card-action-engine.ts:4907+) run the same algebra and throw
 *  permission-denied. Measured, not assumed, by
 *  tests/card/mod-loader/card-mod-permissions-read-rule-events.test.ts:
 *  with the deck's delete rule removed the same delete REFUSES (and the
 *  row is untouched), with it present the same delete SUCCEEDS. The fn
 *  stays the honest stub. */
const checkPermissionsFn: ModEventFn = (_card, _host) => {
  // no-op: see the header's "Event bodies" paragraph.
};

/** A set-module entry that registers no views (the passive files:
 *  events carry separately into events[], see the headers below; setting
 *  opts are the same). The setPaths follow the gem tree verbatim. The
 *  events are plain ModEventRegistration records (mod-manifest.ts:232-276 -
 *  the full Ruby director stage list and the `changed`/`after` fields);
 *  the registration seam injects setPath + modName per file. */
function setModuleEntry(
  setPath: string,
  events?: readonly ModEventRegistration[],
): { setPath: string; events?: readonly ModEventRegistration[] } {
  return events === undefined ? { setPath } : { setPath, events };
}

/** The permissions mod's `when:` predicates, reached by Ruby's `send`
 *  (set/event/all.rb:82).
 *
 *  rule? (card/lib/card/rule/all.rb:33-35) is `standard_rule? ||
 *  preference?`, and both halves are already ported against this same
 *  Ruby source as the rule-pattern operands (actions/rule-content-walk.ts
 *  isStandardRuleName / isPreferenceName, citing rule/all.rb:37-40 and
 *  :42-54). This reuses them rather than restating the walk — one
 *  definition of "is this name a rule" in the engine.
 *
 *  Gates :update_rule_cache (set/all/update_read_rules.rb:4) and
 *  :cascade_read_rule (set/right/read.rb:9). */
export const permissionsModEventPredicates = {
  "rule?": async (card: ModEventCard, ctx?: ModEventContext): Promise<boolean> => {
    const fetch = ctx?.fetch;
    if (fetch === undefined || card.name === undefined) return false;
    const name = DeckoName.parse(card.name);
    if (name.s === "") return false;
    return (
      (await isStandardRuleName(fetch, name)) || (await isPreferenceName(fetch, name))
    );
  },
  /** preference? (rule/all.rb:42-54) — the second half of the rule?
   *  definition above (rule/all.rb:33-35), reached on its own by
   *  mod/follow's set/right/follow.rb:7-9 (:integrate,
   *  `when: :preference?` on :cache_expired_for_new_preference). Ruby
   *  defines it once, on Card; the port keeps the one definition here,
   *  beside rule?, because both walk the same name parts. */
  "preference?": async (card: ModEventCard, ctx?: ModEventContext): Promise<boolean> => {
    const fetch = ctx?.fetch;
    if (fetch === undefined || card.name === undefined) return false;
    const name = DeckoName.parse(card.name);
    if (name.s === "") return false;
    return isPreferenceName(fetch, name);
  },
} as const;

const cardModPermissions: DeckoModManifest = {
  name: "permissions",
  gemName: "card-mod-permissions",
  group: "gem-defaults", // the gemspec metadata card-mod-group (permissions-0.20.0.gemspec)
  setModules: [
    {
      // card-mod-permissions-0.20.0/set/abstract/permission.rb
      // (the format :html block, lines 9-43; the mod's :core override is
      // exported above, NOT registered - see the header)
      setPath: "abstract/permission",
      formats: {
        html: {
          views: [
            { view: "pointer_core", viewFn: pointerCoreView },
            { view: "one_line_content", viewFn: oneLineContentView, config: { cache: "never" } },
            { view: "input", viewFn: inputView },
          ],
        },
      },
    },
    {
      // card-mod-permissions-0.20.0/set/all/permissions.rb - events
      // set_read_rule / set_field_read_rules / update_read_rule /
      // check_permissions + the ok?/permit/who_can machinery (the read
      // half lives engine-side as isDenied/taskAllowed,
      // format.ts:637-648, citing permissions.rb:142-157)
      //
      // Events (permissions.rb:1-26) - the four declarations record the
      // Ruby clauses verbatim now that ModEventRegistration carries
      // `changed` and `after` (mod-manifest.ts:204-212) and the full Ruby
      // director stage list including :validate (mod-manifest.ts:151-163):
      //   - :set_read_rule (`:store, on: :save, changed: %i[type_id name]`,
      //     lines 1-5) - `changed: ["type_id", "name"]` is the field gate.
      //   - :set_field_read_rules (`after: :set_read_rule, on: :update,
      //     changed: :type_id`, lines 7-9) - `after` names the dependency,
      //     `changed: ["type_id"]` is the single-field gate.
      //   - :update_read_rule (lines 11-20) - no stage, no on, no opts.
      //   - :check_permissions (`:validate`, lines 22-26) - :validate is
      //     the Ruby validate stage (card-1.110.0 director.rb:18), present
      //     in ModEventStage; recorded verbatim.
      ...setModuleEntry("all/permissions", [
        {
          event: "set_read_rule",
          at: "store",
          on: ["save"],
          changed: ["type_id", "name"],
          fn: setReadRuleFn,
        },
        {
          event: "set_field_read_rules",
          after: "set_read_rule",
          on: ["update"],
          changed: ["type_id"],
          fn: setFieldReadRulesFn,
        },
        {
          event: "update_read_rule",
          fn: updateReadRuleFn,
        },
        {
          event: "check_permissions",
          at: "validate",
          fn: checkPermissionsFn,
        },
      ]),
    },
    {
      // card-mod-permissions-0.20.0/set/all/update_read_rules.rb - events
      // update_rule_cache (`:finalize, when: :rule?`, lines 4-6) +
      // expire_related (`:finalize`, lines 8-11). Both are recordable
      // verbatim.
      ...setModuleEntry("all/update_read_rules", [
        {
          event: "update_rule_cache",
          at: "finalize",
          when: "rule?",
          fn: updateRuleCacheFn,
        },
        {
          event: "expire_related",
          at: "finalize",
          fn: expireRelatedFn,
        },
      ]),
    },
    {
      // card-mod-permissions-0.20.0/set/right/create.rb - include_set
      // Abstract::Permission + assign_type :list. Each module's html format
      // includes Abstract::Permission::HtmlFormat, so the perm-editor
      // :input body registers under EACH Right::<setting> shortname - the
      // chained dispatch resolves :input HERE for every *X+<setting> rule
      // card (the rule_form_card_editor chain;
      // the abstract/permission registration above stays for the abstract
      // home - the include-materialized shape).
      ...setModuleEntry("right/create"),
      formats: {
        html: {
          views: [{ view: "input", viewFn: inputView }],
        },
      },
    },
    {
      // card-mod-permissions-0.20.0/set/right/delete.rb - same shape
      ...setModuleEntry("right/delete"),
      formats: {
        html: {
          views: [{ view: "input", viewFn: inputView }],
        },
      },
    },
    {
      // card-mod-permissions-0.20.0/set/right/read.rb - include +
      // assign_type :list + the html-format include + event
      // cascade_read_rule (`:finalize, after: :update_rule_cache, when:
      // :rule?`, lines 9-14) and the read-rule cascade machinery (16-77).
      // All three clauses land: `after: "update_rule_cache"` is the
      // relative ordering recorded verbatim, `at: "finalize"` is the
      // stage, `when: "rule?"` is the named predicate.
      ...setModuleEntry("right/read", [
        {
          event: "cascade_read_rule",
          at: "finalize",
          after: "update_rule_cache",
          when: "rule?",
          fn: cascadeReadRuleFn,
        },
      ]),
      formats: {
        html: {
          views: [{ view: "input", viewFn: inputView }],
        },
      },
    },
    {
      // card-mod-permissions-0.20.0/set/right/update.rb - same shape
      ...setModuleEntry("right/update"),
      formats: {
        html: {
          views: [{ view: "input", viewFn: inputView }],
        },
      },
    },
    {
      // card-mod-permissions-0.20.0/set/self/create.rb
      setPath: "self/create",
      settingOpts: {
        group: "permission",
        position: 1,
        ruleTypeEditable: false,
        shortHelpText: "who can create cards",
        helpText: "Who can create new cards",
      },
    },
    {
      // card-mod-permissions-0.20.0/set/self/delete.rb
      setPath: "self/delete",
      settingOpts: {
        group: "permission",
        position: 4,
        ruleTypeEditable: false,
        shortHelpText: "who can delete cards",
        helpText: "Who can delete cards",
      },
    },
    {
      // card-mod-permissions-0.20.0/set/self/read.rb
      setPath: "self/read",
      settingOpts: {
        group: "permission",
        position: 2,
        ruleTypeEditable: false,
        shortHelpText: "who can view cards",
        helpText: "Who can view cards in the [[Set]].",
      },
    },
    {
      // card-mod-permissions-0.20.0/set/self/update.rb
      setPath: "self/update",
      settingOpts: {
        group: "permission",
        position: 3,
        ruleTypeEditable: false,
        shortHelpText: "who can update cards",
        helpText: "Who can update cards",
      },
    },
  ],
  prepareEngine: preparePermissionRoles,
};

export default cardModPermissions;
