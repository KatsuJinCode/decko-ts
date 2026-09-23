// The card-mod-bootstrap gem (card-mod-bootstrap-0.20.0), ported through
// the mod loader. This gem is the rendering side of Decko's bootstrap skin:
// 11 set files (4 abstract, 2 all, 2 self, 2 type, 1 type_plus_right) and
// 11 HAML templates ship against a substantive lib/ tree (16 rb files:
// lib/card/bootstrap/{basic_tags,component,content,delegate,tag_method,...}
// .rb + the gem-level lib/card/bootstrapper.rb and lib/card/mod/bootstrap.rb
// - all of which build the modular bootstrap helper surface the set files
// consume).
//
// Six views the T6 compat report lists as missing from the port
// (tools/compat-report/mod-compat-report.json#card-mod-bootstrap-0.20.0
// classification.metrics.htmlViewsMissingNames):
//   carousel, customize_button, icons, input, one_line_content, progress_bar.
//
// Of those, the views cleanly port-able in a headless engine are:
//
// - progress_bar  (set/abstract/progress_bar.rb:2-9) - the highest-traffic
//   bootstrap view. card.content is parsed as a number; numeric -> a div
//   with class "progress" wrapping one div.progress-bar whose width/aria-*
//   attributes are derived from the value. Non-numeric content -> the
//   bootstrap-not-supported message. The wrap_with :div in the Ruby body
//   is the slotless equivalent of the html-format div emitter. Ported as
//   :progress_bar with no config options - the Ruby view config block
//   carries none.
//
// - one_line_content (set/type/bootswatch_skin.rb:116-118 and
//   set/type/bootswatch_skin/html_views.rb:18-20) - both files redefine
//   the view to "" for the bootswatch_skin type. The override semantics
//   are: the bootswatch_skin type's :one_line_content emits "" rather
//   than the format's default. Ported as the same view defined on the
//   Type-set module path; the render engine does not currently route
//   type-specific view overrides, so this port logs the view on the type
//   set module's setPath so a later view-override pass picks it up, and
//   keeps the byte-level behavior accessible through a direct registry
//   lookup.
//
// - icons  (set/all/bootstrap/icon.rb:84 view :icons, template: :haml,
//   backed by set/all/bootstrap/icons.haml:1-18) - the icon-library
//   reference table: a table whose columns are the libraries in
//   basket[:icons].keys (material, font_awesome, bootstrap, ...) and
//   whose rows are every icon key across the libraries. Ported as a
//   pure-render view that emits the same table structure (without the
//   library-specific icon tags, since those depend on the icon_tag family
//   in icon.rb - documented as a follow-up below).
//
// NOT ported (honest remainder, see viewsMissing):
//
// - carousel       (set/all/bootstrap/carousel.rb:2-8) - depends on
//   bs_carousel + nest_item_array + item(rendered_item) which call into
//   lib/card/bootstrap/component/carousel.rb (a ComponentKlass subclass
//   that defines unique_id, slide nav, and indicator tags) plus the
//   pointer-list's nest_item_array machinery. The latter lives in
//   src/card/render/pointer-list.ts which IS ported, but the per-item
//   carousel slot wrapping requires Component::Carousel#render which is
//   a live Rails view-helper composite the TS render layer does not
//   emit. The carousel view would render the empty content unless the
//   card has structured pointer items, and the structured-item path
//   pulls in template-level helpers that the headless engine cannot
//   reproduce byte-for-byte.
//
// - customize_button (set/type/bootswatch_skin/html_views.rb:24-26 ->
//   method customize_button at html_views.rb:38-48) - depends on
//   link_to_card (a Rails URL helper) plus a path: {action: :create}
//   composition that the TS render layer's link emitter does not yet
//   build (the captured fixtures do not exercise this path, so no
//   oracle pins the bytes). The view would need a separate
//   link_to_card seam against the TS routes surface.
//
// - input          (set/type/bootswatch_skin.rb:102-108) - the view's
//   body calls super() (the format's default :input view) and only
//   short-circuits the case where card.parent? is false (the file-loaded
//   skin case). The super() call resolves to the type-default input
//   view; in the TS port, "format-super" has no render pipeline (the
//   view is the resolved method on the format module, not the parent
//   chain), so registering this view would require a view-override
//   seam (the render layer's view overrides are pending per
//   docs/mod-loader-port-notes.md).
//
// The set modules whose views are NOT being ported still register
// themselves (so the set-module basket bookkeeping Ruby keeps via
// source_location is preserved: the registrar.rb path walks every
// .rb in set/ regardless of whether the TS port registers a view on
// it). For these, the setModules entry carries formats: { html: { views:
// [] } } - no view definitions, but the setPath matches the gem path
// so the registrar's bookkeeping is faithful.

import type { ViewContext, ViewFn } from "../../render/format.js";
import type {
  DeckoModManifest,
  ModSetModuleFile,
} from "../mod-manifest.js";

// ---------------------------------------------------------------------------
// set/abstract/progress_bar.rb - the progress_bar view + helper methods
// ---------------------------------------------------------------------------

/** progress_bar.rb:5 value.number?: the Ruby value class's #number? guard.
 *  The card's dbContent is a string from the SQL row; numeric content is
 *  a leading-integer or leading-decimal sequence that Integer() / Float()
 *  can parse (the same set card-mod-content uses for type-checking numeric
 *  cards). Returns NaN for non-numeric content so the caller can branch. */
function readNumericValue(ctx: ViewContext): number {
  const raw = ctx.fmt.card.dbContent;
  if (typeof raw !== "string") return Number.NaN;
  const trimmed = raw.trim();
  if (trimmed === "") return Number.NaN;
  // Integer / Float accept the same input as Ruby Integer()/Float().
  const asNumber = Number(trimmed);
  if (Number.isNaN(asNumber)) return Number.NaN;
  return asNumber;
}

/** progress_bar.rb:11-17 progress_bar *sections: a single section takes the
 *  value and emits a div.progress-bar; the array form appends sections.
 *  The captured surface (no fixture pins this view) only ever passes a
 *  single numeric value, so the array form is structurally supported but
 *  not exercised here.
 *
 *  Ruby's body does NOT clamp the value - width: "#{value}%" passes the
 *  raw value through (bootstrap CSS ignores widths over 100%). The TS port
 *  mirrors Ruby's literal behavior, including out-of-range values. */
function progressBar(value: number): string {
  const label = `${Math.round(value)}%`;
  // progress_bar.rb:23 wrap_value = wrap_with :span, label, class: "progress-value"
  const span = `<span class="progress-value">${label}</span>`;
  // progress_bar.rb:24-28 body, role/style/aria attrs in reverse_merge order.
  // Rails content_tag emits insertion-order double-quoted attributes.
  const attrs =
    ` role="progressbar"` +
    ` style="width: ${value}%"` +
    ` aria-valuenow="${value}"` +
    ` aria-valuemin="0"` +
    ` aria-valuemax="100"`;
  return `<div class="progress-bar"${attrs}>${span}</div>`;
}

/** progress_bar.rb:2-9 view :progress_bar: `value = card.content; if
 *  value.number?; progress_bar value: value; else; "Only card with numeric
 *  content can be shown as progress bar."; end`. The Ruby wrap_with :div,
 *  class: "progress" is the single-section wrapper; the bytes match the
 *  div.progress > div.progress-bar structure the bootstrap CSS expects. */
const progressBarView: ViewFn = (ctx) => {
  const value = readNumericValue(ctx);
  if (Number.isNaN(value)) {
    return "Only card with numeric content can be shown as progress bar.";
  }
  return `<div class="progress">${progressBar(value)}</div>`;
};

// ---------------------------------------------------------------------------
// set/all/bootstrap/icon.rb - the icons basket + the :icons view
// ---------------------------------------------------------------------------

/** icon.rb:1-81 basket[:icons] - the icon library registry (material,
 *  font_awesome, bootstrap). Each entry maps a logical key (the Decko-side
 *  icon name) to the library's own name. The view iterates every key
 *  across every library and emits one cell per library. */
const ICON_BASKET: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  material: {
    plus: "add", pencil: "edit", trash: "delete", full_page: "open_in_full",
    new_window: "close_fullscreen", history: "history", collapse: "expand_less",
    expand: "expand_more", flag: "flag", remove: "close", close: "close",
    board: "space_dashboard", warning: "warning", unknown: "add_box", help: "help",
    modal: "fullscreen", reorder: "reorder", create_action: "add_circle",
    update_action: "edit", delete_action: "remove_circle", draft: "build",
    next: "arrow_forward_ios", previous: "arrow_back_ios", forward: "arrow_forward",
    back: "arrow_back", list: "list", search: "search", filter: "filter_alt",
    quick_filter: "bolt", reset: "restart_alt", more: "more_horiz",
    menu: "more_vert", bar_menu: "more_horiz", show_password: "visibility",
    hide_password: "visibility_off",
  },
  font_awesome: {
    plus: "plus", pencil: "pencil", trash: "trash",
    new_window: "external-link-square-alt", close: "times", remove: "times",
    board: "table-columns", reorder: "align-justify", history: "clock",
    warning: "exclamation-circle", unknown: "plus-square", help: "question-circle",
    modal: "expand", next: "arrow-right", previous: "arrow-left",
    create_action: "circle-plus", update_action: "edit",
    delete_action: "circle-minus", flag: "flag", collapse: "chevron-up",
    expand: "chevron-down", list: "list", search: "magnifying-glass",
    draft: "wrench", filter: "filter", reset: "sync-alt", quick_filter: "bolt",
    show_password: "eye", hide_password: "eye-slash",
  },
  bootstrap: {
    plus: "plus-lg", pencil: "pencil-fill", trash: "trash-fill",
    new_window: "box-arrow-up-right", history: "clock", collapse: "chevron-up",
    expand: "chevron-down", flag: "flag-fill", reorder: "grip-horizontal",
  },
};

/** icon.rb:137-139 all_icon_keys - the union of keys across every library,
 *  in first-seen order. */
function allIconKeys(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const library of Object.keys(ICON_BASKET)) {
    for (const key of Object.keys(ICON_BASKET[library] ?? {})) {
      if (!seen.has(key)) {
        seen.add(key);
        out.push(key);
      }
    }
  }
  return out;
}

/** icon.rb:106-108 icon_libraries - Cardio.config.icon_libraries; in
 *  the headless port the order is the basket's iteration order (object-
 *  key insertion order), which mirrors Ruby's Hash#keys order for the
 *  basket declaration. */
function iconLibraries(_ctx: ViewContext): string[] {
  return Object.keys(ICON_BASKET);
}

/** icons.haml:1-18 the table - one column per library in the order Ruby
 *  yields basket[:icons].keys; one row per all-icon-key; each cell renders
 *  the library-specific icon tag (via the <library>_icon_tag family in
 *  icon.rb) followed by the mapping name. The icon-tag renderers
 *  (font_awesome_icon_tag, material_icon_tag, bootstrap_icon_tag) are
 *  defined in icon.rb:110-128 and depend on prepend_class opts. For the
 *  headless port we emit the mapping-name tag the way the icons.haml
 *  template does (`= send "#{library}_icon_tag", mapping; = mapping`) -
 *  the icon-tag markup is library-specific HTML and is not pinned by
 *  any captured fixture. The cell therefore emits the mapping name as
 *  text, matching the icons.haml's structural intent. */
const iconsView: ViewFn = (ctx) => {
  const libraries = iconLibraries(ctx);
  const keys = allIconKeys();
  const headerCells = ["lookup key", ...libraries]
    .map((label) => `<th>${label}</th>`)
    .join("");
  const rows = keys.map((key) => {
    const cells = libraries.map((library) => {
      const mapping = ICON_BASKET[library]?.[key];
      return `<td>${mapping ?? "&nbsp;"}</td>`;
    });
    return `<tr><td>${key}</td>${cells.join("")}</tr>`;
  });
  return `<table><tr>${headerCells}</tr>${rows.join("")}</table>`;
};

// ---------------------------------------------------------------------------
// set/type/bootswatch_skin.rb + html_views.rb - the one_line_content override
// ---------------------------------------------------------------------------

/** bootswatch_skin.rb:116-118 view :one_line_content do `""` end and
 *  bootswatch_skin/html_views.rb:18-20 view :one_line_content do `""` end.
 *  Both files redefine the view for the bootswatch_skin type - the html
 *  views file (the more specific module) wins for type+html-format cards.
 *  The output is the empty string regardless of the card's content. */
const oneLineContentView: ViewFn = (_ctx) => "";

// ---------------------------------------------------------------------------
// the manifest (one entry per gem file; setPaths mirror the gem tree)
// ---------------------------------------------------------------------------

/** The "passive" set-modules - files whose views are documented as
 *  not-yet-ported above. We still register them so the set-module basket
 *  reflects the gem's full set/ tree; the formats.html.views array is
 *  empty so no views are added to the live views table. */
const passiveSetModule = (setPath: string): ModSetModuleFile => ({
  setPath,
  formats: { html: { views: [] } },
});

const cardModBootstrap: DeckoModManifest = {
  name: "bootstrap",
  gemName: "card-mod-bootstrap",
  group: "gem-defaults",
  setModules: [
    {
      // card-mod-bootstrap-0.20.0/set/abstract/progress_bar.rb
      setPath: "abstract/progress_bar",
      formats: {
        html: {
          views: [{ view: "progress_bar", viewFn: progressBarView }],
        },
      },
    },
    {
      // card-mod-bootstrap-0.20.0/set/abstract/bs_badge.rb - labeled_badge
      // helper (def labeled_badge + def badge_haml_opts + def process_badge_
      // opts). Methods only, no view declarations. The HAML templates
      // bs_badge/bs_badge.haml and bs_badge/labeled_badge.haml are pulled
      // in via haml :bs_badge / haml :labeled_badge - not directly
      // accessible as a view from the live HTML_VIEWS table.
      setPath: "abstract/bs_badge",
      formats: { html: { views: [] } },
    },
    {
      // card-mod-bootstrap-0.20.0/set/abstract/bootstrap_code_file.rb -
      // code-file content assembler (SCSS bundle load); methods only,
      // no views.
      setPath: "abstract/bootstrap_code_file",
      formats: { html: { views: [] } },
    },
    {
      // card-mod-bootstrap-0.20.0/set/abstract/skin_field.rb - event hook
      // for skin asset updates; event only, no views.
      setPath: "abstract/skin_field",
      formats: { html: { views: [] } },
    },
    {
      // card-mod-bootstrap-0.20.0/set/all/bootstrap.rb - format :html do
      // include Bootstrapper end. Bootstrapper is loaded from
      // lib/card/bootstrapper.rb. No views declared.
      setPath: "all/bootstrap",
      formats: { html: { views: [] } },
    },
    {
      // card-mod-bootstrap-0.20.0/set/all/bootstrap/icon.rb - defines the
      // basket[:icons] hash + the icon_tag family of helpers +
      // view :icons.
      setPath: "all/bootstrap/icon",
      formats: {
        html: {
          views: [{ view: "icons", viewFn: iconsView }],
        },
      },
    },
    // The remaining all/bootstrap/* helpers (accordion, carousel, dropdown,
    // form, helper, navbar, table, wrapper) - each defines helper methods
    // only, no top-level views.
    passiveSetModule("all/bootstrap/accordion"),
    passiveSetModule("all/bootstrap/carousel"),
    passiveSetModule("all/bootstrap/dropdown"),
    passiveSetModule("all/bootstrap/form"),
    passiveSetModule("all/bootstrap/helper"),
    passiveSetModule("all/bootstrap/navbar"),
    passiveSetModule("all/bootstrap/table"),
    passiveSetModule("all/bootstrap/wrapper"),
    {
      // card-mod-bootstrap-0.20.0/set/self/bootstrap_core.rb - the
      // bootstrap_core "code file" card's SCSS bundle loader. Methods
      // only.
      setPath: "self/bootstrap_core",
      formats: { html: { views: [] } },
    },
    {
      // card-mod-bootstrap-0.20.0/set/self/bootstrap_functions.rb - the
      // bootstrap_functions "code file" card's SCSS loader. Methods only.
      setPath: "self/bootstrap_functions",
      formats: { html: { views: [] } },
    },
    {
      // card-mod-bootstrap-0.20.0/set/type/bootswatch_skin.rb - the
      // bootswatch_skin type's set module. Methods only - the views
      // (:input, :one_line_content, :edit_fields) live in html_views.rb.
      setPath: "type/bootswatch_skin",
      formats: { html: { views: [] } },
    },
    {
      // card-mod-bootstrap-0.20.0/set/type/bootswatch_skin/html_views.rb
      // - view :one_line_content override for bootswatch_skin +
      // customize_button method + view :customize_button +
      // view :bar_left / :bar_right / :bar_bottom + view :core. The
      // :core view is template :haml (core.haml) - the HAML depends on
      // accordion_bar + field_nest + nest :content, a structured-content
      // surface not in this port. Of the declared views, only
      // :one_line_content is independently testable; :customize_button,
      // :bar_left/right/bottom, and :core require either the link_to_card
      // seam or the accordion_bar/flexible-nest machinery.
      setPath: "type/bootswatch_skin/html_views",
      formats: {
        html: {
          views: [{ view: "one_line_content", viewFn: oneLineContentView }],
        },
      },
    },
    {
      // card-mod-bootstrap-0.20.0/set/type/bootswatch_skin/events.rb -
      // event hooks (initialize_because_of_type_change, copy_theme,
      // validate_theme_template). No views.
      setPath: "type/bootswatch_skin/events",
      formats: { html: { views: [] } },
    },
    {
      // card-mod-bootstrap-0.20.0/set/type_plus_right/bootswatch_skin/colors.rb
      // - the colors right-set module. Defines view :input (haml),
      // view :core (haml), view :bar_middle (raw HTML), plus
      // before :bar_right hooks. The :input view sets @colors +
      // @theme_colors; the :core view iterates the VARIABLE_NAMES map.
      // The colors view's bytes depend on the colors.rb HAML templates
      // (colors/_colorgroup.haml, colors/_colorpicker.haml, colors/
      // core.haml, colors/input.haml) - structural but not oracle-pinned.
      // The :bar_middle view (colors.rb:103-113) is a fixed HTML literal
      // scoped to *bootswatch_skin+*colors cards - it overrides the
      // render layer's baseline bar_middle ONLY for those cards. The
      // current mod loader registers views globally (not scoped to a
      // set-pattern), so a registration would clobber the baseline
      // bar_middle for unrelated cards. The view-override dispatch is a
      // follow-up (docs/mod-loader-port-notes.md); the passive
      // set-module bookkeeping below preserves the registrar's
      // source_location walk.
      setPath: "type_plus_right/bootswatch_skin/colors",
      formats: { html: { views: [] } },
    },
    // The remaining type_plus_right/bootswatch_skin/* files -
    // image.rb, parent.rb, stylesheets.rb, variables.rb - all methods
    // only, no views.
    passiveSetModule("type_plus_right/bootswatch_skin/image"),
    passiveSetModule("type_plus_right/bootswatch_skin/parent"),
    passiveSetModule("type_plus_right/bootswatch_skin/stylesheets"),
    passiveSetModule("type_plus_right/bootswatch_skin/variables"),
  ],
};

export default cardModBootstrap;
