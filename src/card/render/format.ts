// The render format: TypeScript port of Card::Format's view pipeline for the
// captured html-format surface.
//
// Truth source (card-1.110.0 lib/card/format.rb + format/**, card-mod-format):
// - format/render.rb  : render! (voo lifecycle, wrap_and_render), view_method
//                       + the unsupported-view UserError
// - format/nest.rb    : Nest#prepare (nest_name, home_view rule, subformat)
// - format/nesting.rb : implicit_nest_view = voo_items_view || default_nest_view
// - card-mod-format lib/card/mod/format.rb:2 + set/all/html.rb:17-19:
//   default_html_view = :titled (the html format's default nest view)
// - card-mod-format set/all/html/header.rb#default_header: main? ? :h1 : :h2
//   (the one-level-down heading shift: nested cards render h2, mains h1)
// - card-1.110.0 lib/card/view/options/visibility.rb: viz_hash, show?/hide?,
//   process_visibility (requested view viz'd via the optional render opt,
//   method_delegation.rb#render_args default :show)
//
// Deliberately in-scope: the machinery the four captured views exercise.
// Landed since: the read-permission denial (view/permission.rb altered_view
// -> src/card/permissions/), and nest MODE (format/nesting/mode.rb - see
// RenderFormat.nestMode / withNestMode / modalNestView). Deferred
// : view caching/stubs, edit views, mod-specific
// view overrides. compact nest mode: the :template arm and the compact
// arms of mode.rb (view substitution mode.rb:71-84 + the nesting.rb:52-63
// 200-char elision) are PORTED gem-derivative with fixture-less pins
// ; the recorded capture
// surface exercises none of them - the nest-mode-port census (sha-verified
// 6a44dfdc dump copy, 97 expected-v2 shards) shows every captured one-line
// render is a raw/nest-free arm, so the compact machinery is byte-neutral
// on the surface (see the modalNestView docblock for the census numbers).

import { DeckoName } from "../name.js";
import {
  CodenameNotFoundError,
  NameNotFoundError,
  UnsupportedIdentifierError,
} from "../name/errors.js";
import type { CardRecord } from "../fetch/card-record.js";
import { virtualSearchCqlFor } from "../fetch/virtual-search-cards.js";
import {
  scanNests,
  type ContentPiece,
  type NestOptions,
  type ParsedNest,
} from "./nest-syntax.js";
import { safeSetKeys } from "./set-keys.js";
import type { SearchResultPaging } from "./search-paging.js";
import { nowCardContent } from "./now-content-bytes.js";
import { cgiEscape, h, htmlEscapeKeepApostrophe, emitAttrs, newSlotId, slotOptionsJson } from "./slot-html.js";
import { viewPermissionDenial, quietDenial, renderOptSkipPerms, resolveViewPerms, viewDenialView, type CrudTask } from "../permissions/view-perms.js";
import type { ReadViewer } from "../permissions/read-rules.js";
import { resolveContentOverride } from "./content-overrides.js";
import { NO_REQUEST_ORIGIN } from "./deck-origin.js";
import { serializerFollowsLive } from "./deployment-follow-live-config.js";
import { mainNestWithoutMainError } from "./errors.js";

/** Per-nest stdout trace (debug only): DECKO_ENGINE_NEST_TRACE=1. */
const ENGINE_NEST_TRACE = typeof process !== "undefined" && process.env?.DECKO_ENGINE_NEST_TRACE === "1";

/** The self-set title overrides, keyed on the rendered card's codename.
 *  Lives HERE, not in views.ts, because TWO surfaces read it: the
 *  readable header (views.ts titleNoLinkView) and the loud-denial frame
 *  (RenderFormat#mainLoudDenialHtml). views.ts imports format.ts, so a
 *  table in views.ts could not be read by format.ts without a cycle. */
const SELF_SET_TITLE_OVERRIDES: ReadonlyMap<string, string> = new Map([
  ["search", "Search Results"],
  ["recent", "Recent Changes"],
  ["signin", "Sign In"],
]);

/** card-1.110.0 lib/card/env/location.rb:6-16 `card_path` — makes a
 *  relative path site-absolute when it is not already rooted. `relative_
 *  url_root` is `Cardio.config.relative_url_root`, nil at boot
 *  (interpolates to ""), so the unrooted arm is "/" + rel. An already
 *  rooted rel (`^(https?:)?/`) passes through untouched — which is why
 *  card_url of a rooted path keeps its leading slash even with no
 *  origin, and why clean_resource's internal-link re-root (links.rb:
 *  74-81) restores the slash it stripped. */
export function cardPath(relPath: string): string {
  return /^(https?:)?\//.test(relPath) ? relPath : `/${relPath}`;
}

/** render.rb#view_method: unknown views raise Card::Error::UserError with
 *  card-mod-format set/all/error.rb#unsupported_view_error_message (en.yml:
 *  "view (%{view}) not supported for %{cardname}"). */
export class UnsupportedViewError extends Error {
  readonly view: string;
  readonly cardName: string;
  constructor(view: string, cardName: string) {
    super(`view (${view}) not supported for ${cardName}`);
    this.name = "UnsupportedViewError";
    this.view = view;
    this.cardName = cardName;
  }
}

/** The enriched card a format renders: the fetched record plus the
 *  type/name-derived attributes the views read (type.rb#type_name,
 *  pattern/all.rb#safe_set_keys inputs). */
export interface RenderCard {
  record: CardRecord;
  name: DeckoName;
  key: string;
  /** mod/core/set/all/type.rb#type_name. */
  typeName: string | undefined;
  typeId: number | undefined;
  /** The TYPE card's codename (e.g. "pointer", "list", "cardtype") -
   *  Ruby's `card.type_code` (mod/core/set/all/type.rb#type_code). The
   *  render engine populates it from the codename registry during
   *  enrichment (RenderEngine.enrichAndStore); the pointer/list core
   *  view reads it to detect the Abstract::List surface. */
  typeCode: string | undefined;
  id: number | undefined;
  dbContent: string;
  /** pattern/all.rb#safe_set_keys (the slot class list). */
  setKeys: string;
  /** mod/core/set/all/states.rb#unknown? - a nest-fetch miss produces a NEW
   *  unknown card (format/nest/fetch.rb#new_card -> Card.fetch new:); its
   *  views route through the unknown-view substitution (see
   *  RenderFormat.viewForUnknown). Real (fetched) cards never set this. */
  unknown?: boolean;
  /** This NEST's own read verdict for an unknown pointer/list item
   *  (RenderEngine#pointerItemVerdict, keyed `${hostKey}|${itemKey}`).
   *  Ruby constructs the item's phantom fresh per nest
   *  (Nest::Fetch#new_card) and runs the read walk on THAT card, so the
   *  per-nest verdict — not the deck-global `deniedVerdictsByKey` entry
   *  another nest happened to fold first — is what the :mini_bar body
   *  gate asks. Set by renderUnknownPointerListItem on the readable arm
   *  only; undefined = no per-nest verdict for this phantom, and every
   *  consumer keeps the deck-global read. */
  pointerItemReadVerdict?: boolean;
  /** A pointer/list item phantom whose type came from its host's item type
   *  (item.rb new_unknown_item_args `Card.fetch name, new: { type: ... }`).
   *  Fetch renews a DUP of the cached default-typed card for the typed
   *  instance (card fetch/results.rb #renew), so name-level questions
   *  (`Card.known?(name)`, links.rb add_known_or_wanted_class) still see the
   *  default type, while the instance's own `known?` sees the item type. */
  hostTyped?: boolean;
}

/** One view render's options object (the voo). Visibility is the ordered
 *  viz_hash (visibility.rb); class_ups are the Classy storage. */
export class Voo {
  readonly parent: Voo | undefined;
  readonly requestedView: string;
  /** normalized (live) options; slot_options reads these. */
  readonly opts: Record<string, unknown>;
  /** visibility.rb#viz_hash - insertion order is preserved because the
   *  data-slot show/hide lists are built in first-touch order. */
  readonly viz = new Map<string, "show" | "hide">();
  /** view/classy.rb class_list (public scope): key -> extra classes. */
  readonly classUps = new Map<string, string>();
  /** Optional override for the data-slot's view field. When set,
   *  slotOptions emits this value as `view` instead of the requested
   *  view. Used by the pointer/list item rendering: the slot id uses
   *  "mini_bar" but the data-slot's view field reads "bar" (matching
   *  the captured corpus bytes for corpus:77 + every pointer/list
   *  sibling). Undefined = data-slot's view equals requestedView. */
  slotViewOverride: string | undefined;
  /** view/options/voo_api.rb:30-32 `define_setter` — `voo.<key> = v` writes
   *  LIVE options, while `slot_options` (:51-56) reads the NORMALIZED ones
   *  and slices them. The two maps are separate in Ruby, so an option a view
   *  body assigns mid-render is readable through the accessor and INVISIBLE
   *  in the slot JSON. Only :title has a live writer today
   *  (card-mod-rules set/type/set/html_views/template.rb:4
   *  `voo.title = parent.voo.nest_syntax if parent`), and the oracle pins
   *  the consequence: the :template_link slot's data-slot carries
   *  view/nest_name/show/home_view/name_context and NO title key. */
  liveTitle: string | undefined;
  /** voo.help = X (the same define_setter mechanics as liveTitle): a live
   *  option readable through the accessor and INVISIBLE in the OWNING
   *  voo's slot JSON — but an HEIR key, so the child voo a nested view
   *  render builds inherits it into its NORMALIZED options and its slot
   *  JSON carries it (the graded setup row: the outer setup slot's
   *  data-slot has no help key; the inner help-view slot's data-slot
   *  carries the help text). */
  liveHelp: string | undefined;

  /** True ONLY for the bare view-surface ROOT render's voo (render.ts#render's
   *  `format.renderView(view, ...)` entry — the one call site whose
   *  `optional` render arg defaults to :show). The live serializer does not
   *  carry the root render's own enrollment (the capture-harness artifact:
   *   "root drops the
   *  requested view"), so slotOptions drops view===viewField exactly here.
   *  Parentless does NOT mean root: the page surface's processLayoutContent
   *  runs on the root format AFTER renderView restored this.voo, so every
   *  card-layout/body nest voo (the *footer content slot, the mod bar
   *  items) is parentless in the port while Ruby's layout nests render with
   *  a seated voo — and the live pages carry their own requested-view
   *  enrollment (`*footer` slot show:["content"], mod bar slots
   *  show:["bar"], Anyone Signed In +description show:["lead"]). */
  readonly viewLaneRoot: boolean;

  constructor(
    parent: Voo | undefined,
    requestedView: string,
    opts: Record<string, unknown>,
    viewLaneRoot = false,
  ) {
    this.parent = parent;
    this.requestedView = requestedView;
    this.opts = opts;
    this.viewLaneRoot = viewLaneRoot;
    // view/options/key_lists.rb heir_keys (= keymap[:both] + keymap[:heir])
    // + voo_api.rb:135-143 inherit_options_from_parent!: a child voo
    // inherits the parent's value for every heir key it did not set itself
    // (`@normalized_options[option_key] ||= parent.live_options[option_key]`).
    // The port carries the one heir key the captured surface provably
    // consumes: :size (the image variant — Ruby's determine_image_size reads
    // voo.size at the CORE render, one voo below the nest's content voo; a
    // size:full nest must render -original through that hop. live capture:
    // Conflict_Done_Well 277091-original.png with data-slot "size":"full";
    // corpus captures: Professional Materials {{bar02|size:full}}). The
    // remaining heir keys (main, home_view, title, variant, joint, ...)
    // stay unported — a documented remainder.
    if (parent !== undefined && opts["size"] === undefined) {
      const inherited = parent.opts["size"];
      if (inherited !== undefined) this.opts["size"] = inherited;
    }
    // :help and :title are heir keys carried by the LIVE writers (the
    // setup view's `voo.help = haml :setup_help` + `voo.title = ...`): the
    // child voo inherits them into its normalized options
    // (inherit_options_from_parent!, voo_api.rb:135-143), which is what
    // slot_options serializes — the graded corpus pins the consequence
    // (the child help-view slot JSON carries "help" AND "title"; the
    // owning setup slot's JSON carries neither).
    if (parent !== undefined && opts["help"] === undefined) {
      const inherited = parent.liveHelp;
      if (inherited !== undefined) this.opts["help"] = inherited;
    }
    if (parent !== undefined && opts["title"] === undefined && this.liveTitle === undefined) {
      const inherited = parent.liveTitle;
      if (inherited !== undefined) this.opts["title"] = inherited;
    }
    // :items is an heir key too (view/options/key_lists.rb
    // keymap[:both]); inherit_options_from_parent! flows it down the voo
    // chain. The consumer is the search card_list TWO voos below the nest:
    // nest(opts.items={view:X}) -> core/content voo -> renderView("card_list")
    // (views.ts coreView search branch) whose fresh voo must still answer
    // item_view_options[:view] (item.rb:157-162) — without the inheritance
    // every internally-dispatched card_list rendered the html
    // default_item_view :bar regardless of the nest's `item:<view>` opt
    // (blog/Latest_News `Latest news item|item:titled` served bar items).
    // Collection nests without an item opt carry items === undefined and
    // inherit nothing; a view body that SETS its own items overrides.
    if (parent !== undefined && opts["items"] === undefined) {
      const inheritedItems = parent.opts["items"];
      if (inheritedItems !== undefined) this.opts["items"] = inheritedItems;
    }
    // :title is an heir key too (keymap[:both], "overrides the name of the
    // card" - options.rb:50). Two consumers pinned it, each with its own oracle arm:
    // (1) the board-stage3 engage_tab oracle arm — the discussion nest
    // carries title: "Discussion" and the :titled frame's header_title ->
    // :title chain reads voo.title two voo levels down (titled ->
    // header_title -> title) - the same inherit_options_from_parent! hop
    // the size recorded result describes (title.rb:30-31 standard_title =
    // name_variant title_in_context(voo.title)); (2) the bar family ONE
    // voo below the nest: field_nest(view:
    // :accordion_bar, title: X) -> the accordion_bar voo carries the opt;
    // its bar_left child voo's :title render must still answer voo.title
    // (title.rb:6-8 standard_title reads voo.title) - without the
    // inheritance the bootswatch field accordions showed the context-
    // shortened card name where the oracle pins the title opt ("Palette
    // and uses of colors"). A voo that SETS its own title overrides;
    // nestless renders never set a parent title, so existing pins are
    // untouched.
    if (parent !== undefined && opts["title"] === undefined) {
      const inheritedTitle = parent.opts["title"];
      if (inheritedTitle !== undefined) this.opts["title"] = inheritedTitle;
    }
    // :home_view is an heir key too (keymap[:both] — "the view rendered when
    // the card is visited from the page"). The read_form field slots pin
    // the shape: the p20-email-views oracle (welcome_email.exp.html) puts
    // "home_view":"read_formgroup" on the INNER :content slot's data-slot
    // JSON — the content voo never sets its own home_view, so
    // inherit_options_from_parent! flows the read_formgroup value down one
    // voo level. A nested NEST always sets its own (nest.rb
    // prepare_view_and_opts!), so the inheritance is a no-op for every
    // nest-in-nest surface and the existing pins are untouched.
    if (parent !== undefined && opts["home_view"] === undefined) {
      const inheritedHomeView = parent.opts["home_view"];
      if (inheritedHomeView !== undefined) this.opts["home_view"] = inheritedHomeView;
    }
  }

  /** visibility.rb#process_visibility: inherit the parent's viz, then viz the
   *  requested view. The `optional: :show` render arg
   *  (method_delegation.rb#render_args -> optional_render_opt default) makes
   *  every delegated sub-render visible by default.
   *  the nest opts' own show/hide lists viz into the map (Ruby lines
   *  75-92: `process_visibility_options live_options` — hide processed
   *  before show, both DELETED from the options so slot_options' final
   *  merge re-derives them from the viz alone). Without this, a view body
   *  that adds its own hide (bar.rb's prepare_bar → bar_middle) REPLACED
   *  the nest's hide list in the emitted slot JSON instead of joining it
   *  (bar_view.rb:11's bar_nav hide vanished from *all+*autoname's
   *  data-slot). */
  /** The view this slot's OWN optional render arg enrolled (set in
   *  processVisibility; undefined = none). Intermediate renders (bar.rb's
   *  bar_bottom -> render :content) enroll their own view; the VIEW-SURFACE
   *  ROOT render's enrollment is the capture-harness artifact the live
   *  serializer does not carry. */
  private optionalEnrolledView: string | undefined;

  /** The viz entries that trace to the VIEW-SURFACE ROOT slot's optional
   *  enrollment - propagated transitively through the voo chain but never
   *  through an intermediate render's OWN enrollment. The live serializer
   *  drops these (Ruby-live's root render never enrolled: the harness
   *  artifact's information is nobody's), keeping an entry only when it
   *  names this slot's own requested view (Guns:open +Discussion pins
   *  ["open","comment_box"]). An intermediate's own enrollment is NOT
   *  marked: the bar_bottom -> content sub-render pins
   *  ["bar_bottom","content"] (bar_bottom kept, open dropped). */
  private rootEnrolledInherited = new Set<string>();

  processVisibility(optional: unknown): void {
    if (this.parent !== undefined) {
      for (const [view, setting] of this.parent.viz) {
        if (!this.viz.has(view)) {
          this.viz.set(view, setting); // reverse_merge!
          if (
            (this.parent.viewLaneRoot && this.parent.optionalEnrolledView === view) ||
            this.parent.rootEnrolledInherited.has(view)
          ) {
            this.rootEnrolledInherited.add(view);
          }
        }
      }
    }
    // visibility.rb:87-92 process_visibility_options — the nest opts' own
    // show/hide lists viz first (hide before show), both removed from the
    // live options.
    const optHide = this.opts["hide"];
    const optShow = this.opts["show"];
    if (optHide !== undefined) {
      delete this.opts["hide"];
      for (const view of normalizeVisibilityList(optHide)) this.viz.set(view, "hide");
    }
    if (optShow !== undefined) {
      delete this.opts["show"];
      for (const view of normalizeVisibilityList(optShow)) this.viz.set(view, "show");
    }
    const requested = this.requestedView;
    // null = NO optional render opt (the show_with_page_layout main render —
    // the captured slot has no "show" viz). JS default params
    // apply on undefined, so the page path passes null, not undefined.
    if (optional !== undefined && optional !== null && optional !== false && !this.viz.has(requested)) {
      this.viz.set(requested, optional === "hide" || optional === false ? "hide" : "show");
      this.optionalEnrolledView = requested;
    }
  }

  /** visibility.rb#show?/#hide?. */
  show(view: string): boolean {
    return this.viz.get(view) !== "hide";
  }

  explicitShow(view: string): boolean {
    return this.viz.get(view) === "show";
  }

  /** visibility.rb#hide!/#show! (force write). */
  setViz(views: string | string[], setting: "show" | "hide"): void {
    const list = Array.isArray(views) ? views : [views];
    for (const view of list) this.viz.set(view, setting);
  }

  /** visibility.rb#viz (visibility.rb:71-79) - the NON-force write:
   *  `next if !force && viz_hash[view]` - the FIRST write on a view wins.
   *  This is Ruby's `voo.show x` / `voo.hide x` setter semantics (plain
   *  show/hide delegate here without force; only the ! variants and
   *  process_visibility_options force). The edit forms depend on the
   *  exact order: edit_content.rb's :edit_form view body runs
   *  `voo.show :edit_type_row` first, then the edit_form METHOD runs
   *  `voo.hide :edit_type_row` - a no-op under first-write-wins, which is
   *  why the captured data-slot lists edit_type_row under "show"
   *  (fixtures/captured/edit-forms.json). */
  private vizWrite(views: string | string[], setting: "show" | "hide"): void {
    const list = Array.isArray(views) ? views : [views];
    for (const view of list) {
      if (this.viz.has(view)) continue;
      this.viz.set(view, setting);
    }
  }

  /** visibility.rb#show (the SETTER form - `voo.show :help` in
   *  edit_content.rb's :edit body). The query form is show() above
   *  (Ruby's show?). */
  showViz(views: string | string[]): void {
    this.vizWrite(views, "show");
  }

  /** visibility.rb#hide (the SETTER form - first write wins; see vizWrite).
   *  The voo.hide :bar_middle idiom (bar.rb) and the :edit body's
   *  `voo.hide :save_button` ride here. */
  hide(views: string | string[]): void {
    this.vizWrite(views, "hide");
  }

  /** view/options/voo_api.rb#slot_options: normalized options + visibility,
   *  restricted to slot keys (the JSON is emitted in slot_keys order by
   *  slot-html.ts#slotOptionsJson). `view: requested_view` wins - Ruby's
   *  `.merge(view: requested_view)`. When `slotViewOverride` is set
   *  (the pointer/list item path - slot id uses "mini_bar" but the
   *  data-slot's view field reads "bar"), that override is emitted
   *  instead of the requested view. */
  slotOptions(): Record<string, unknown> {
    const viewField = this.slotViewOverride ?? this.requestedView;
    const out: Record<string, unknown> = { ...this.opts, view: viewField };
    const show: string[] = [];
    const hide: string[] = [];
    for (const [view, setting] of this.viz) {
      (setting === "show" ? show : hide).push(view);
    }
    // Live-era emission rule (docs/serializer-spec-conditional-data-slot-
    // show-key.md, refined by the frozen-vs-live slot census over all 37
    // swapped entries - frozen and live slot JSONs are IDENTICAL there, so
    // the rule is corpus truth for both eras):
    //   - a ROOT slot does not emit the requested view itself (the view-surface
    //     root render does not enroll it: mod:*:closed roots omit the key,
    //     the discussion open root carries only its body's comment_box);
    //   - a CHILD slot drops the parent-inherited entries (the parent's
    //     information) but keeps its own registrations AND the nest/sub-render
    //     optional enrollment of its requested view (+tags|closed carries
    //     show:["closed"]; the content sub-render carries
    //     ["bar_bottom","content"] with the inherited open dropped;
    //     +Discussion|open carries ["open","comment_box"] with the inherited
    //     open RETAINED because it names the slot's own requested view).
    // UNSET default: the engine's always-enroll + full-inheritance form
    // (the shape the pre-live engine pinned).
    //
    // Root-drop arm: viewLaneRoot (the bare view-surface root render, the one
    // call site whose optional render arg defaults to :show), NOT
    // "parent === undefined" - the page surface's processLayoutContent runs on
    // the root format after renderView restored this.voo, so the card-
    // layout/body nests (the *footer content slot, the mod bar items) are
    // parentless in the port while Ruby renders them with a seated voo
    // (card_layout.rb:10 process_content inside the render) and the live
    // pages carry their own requested-view enrollment (*footer
    // show:["content"]; mod bar slots show:["bar"]; Anyone Signed In
    // +description show:["lead"]). RED pin 6ddba9b4.
    const emittedShow = serializerFollowsLive()
      ? show.filter(
          (view) =>
            !(this.viewLaneRoot && view === viewField) &&
            !(this.rootEnrolledInherited.has(view) && view !== this.requestedView),
        )
      : show;
    if (emittedShow.length > 0) out["show"] = emittedShow;
    if (hide.length > 0) out["hide"] = hide;
    return out;
  }

  /** classy.rb#class_up (scope :subviews - stored on this voo). */
  classUp(klass: string, classier: string): void {
    this.classUps.set(klass, [this.classUps.get(klass), classier].filter((s) => s !== undefined && s !== "").join(" "));
  }

  /** classy.rb#classy: `[classes, extra_classes(classes)].flatten.compact
   *  .join " "` - the base classes first, then the extra classes of the
   *  FIRST listed class (extra_classes takes `klass.first` when handed an
   *  array), resolved through the voo chain (deep_extra_classes self ->
   *  ancestors). That quirk is why the content view's d0-card-content
   *  class_up lands at the END of the slot class list.
   *
   *  Token-level dedup (first occurrence wins): the fixtures pin single
   *  occurrences when class_ups stack nested strings (bar.rb's
   *  `class_up "accordion-item", "bar #{classy 'bar'}"` renders ONE "bar"),
   *  which is Haml's class-merge dedup on the rendered element. */
  classy(...classes: (string | string[])[]): string {
    const flat: string[] = [];
    for (const group of classes) {
      if (Array.isArray(group)) flat.push(...group);
      else if (group !== "") flat.push(group);
    }
    const out = flat.filter((s) => s !== "");
    if (out.length === 0) return "";
    const extra = this.deepExtraClasses(out[0] as string);
    if (extra !== "") out.push(extra);
    const seen = new Set<string>();
    const tokens: string[] = [];
    for (const token of out.join(" ").split(" ")) {
      if (token === "" || seen.has(token)) continue;
      seen.add(token);
      tokens.push(token);
    }
    return tokens.join(" ");
  }

  private deepExtraClasses(klass: string): string {
    const own = this.classUps.get(klass);
    const parent = this.parent?.deepExtraClasses(klass) ?? "";
    return [own, parent].filter((s) => s !== undefined && s !== "").join(" ");
  }
}

/** What a view function receives. Views call back into the format for
 *  sub-renders and nest processing - the shape mirrors `format :html do
 *  view :x do ... end end` where the block runs with self = format. */
export interface ViewContext {
  fmt: RenderFormat;
  voo: Voo;
}

/** A view body's answer. Ruby's view blocks are plain methods: most return
 *  HTML strings, but several return raw values that survive to the render
 *  API boundary — integers (:id, the account token-days views) and nil (the
 *  `return unless` early arms: type/mod.rb's configurations/tasks/scripts,
 *  head.rb's :rss_links) — and the reference capture records those verbatim
 *  (numbers as JSON numbers, nil as null). Anything interpolated INTO
 *  another view passes through Ruby's to_s at that interpolation; only the
 *  top-level render boundary carries the raw value. */
export type ViewResult = string | number | null;

/** Ruby's to_s at interpolation: a view answer embedded in HTML assembly
 *  (nil.to_s is the empty string). The identity for every HTML-string view;
 *  the coercion the interpolating sites owe once view bodies may answer
 *  numbers/null. */
export function str(result: ViewResult): string {
  return result === null ? "" : String(result);
}

export type ViewFn = (ctx: ViewContext) => ViewResult;

/** The menu help-popover resolver (help-popover.ts HelpRulesResolver), when
 *  a composition installed one. Optional: engines without it keep the
 *  help-less placeholder bytes for every card. */
export interface HelpRulesApi {
  /** The unescaped data-bs-content value; "" renders the &nbsp; placeholder
   *  (bootstrap helper.rb:48). */
  menuHelpContentBytes(fmt: RenderFormat): string;
  /** The card-mod-rules Rule-set :help_text view body
   *  (card-mod-rules-0.20.0 set/rule/board_rules_editor.rb:17-19):
   *  `[rule_based_help, setting_link].join(" ")` with setting_link the
   *  `Card.search` count (card-mod-rules set/type/setting.rb:12-14) and
   *  rule_based_help the static-or-`*help`-rule-card processed through
   *  chunk_list :references (card-mod-help set/all/help.rb:40-48). NO
   *  d-none edit_link prefix (card-mod-help set/all/help.rb:18-25's
   *  wrap_help_text is NOT called here - the Rule-set view body returns
   *  the bytes verbatim). The :help_text registration
   *  in card-mod-rules set/rule/board_rules_editor.rb is the canonical
   *  consumer; expose this method so the registration lives in
   *  viewChains (nonbase) rather than re-doing the help-popover seam's
   *  private walks + ruleCounts map. */
  ruleHelpTextBytes(fmt: RenderFormat): string;
  /** card-mod-help set/all/help.rb:40-48 rule_based_help for an ARBITRARY
   *  card: process_content(raw_help_text, chunk_list: :references) with
   *  raw_help_text = help.rb:36-38's `card.try(:raw_help_text) ||
   *  card.help_rule_card&.content` resolved for `card` (not the format's
   *  own card). The card-mod-rules rule_help alert (set/rule/editor.rb
   *  24-28) is this chain over the RULE card, and the setting-card core
   *  (set/type/setting.rb:59-61 -> the *all rule's rule_help) resolves it
   *  for the *all+<setting> rule card on the render layer's loader-less
   *  dispatch (p20-help-content). */
  ruleBasedHelpForCard(fmt: RenderFormat, card: RenderCard): string;
}

/**
 * Nest mode (card-1.110.0 lib/card/format/nesting/mode.rb:3-15). A mode is
 * FORMAT STATE, not a view option: it is set for the span of a
 * `with_nest_mode` block, inherited by subformats, and consulted when a
 * nest's view is chosen.
 *
 *  - "normal"   nests render in the requested view unaltered.
 *  - "template" the view is replaced with :template_nest, which answers a
 *               non-field nest with its own `{{nest_syntax}}` literal
 *               (card-mod-edit set/all/template_nest.rb:2-12) - the mode
 *               card-mod-layout set/type/layout_type.rb:12-18 turns on
 *               around the Layout cardtype's CodeRay core, so a layout's
 *               body is displayed as SOURCE rather than expanded.
 *  - "edit"     view_in_edit_mode - not ported (the edit forms need the
 *               Rails runtime; card-mod-edit's own views are out of scope
 *               for the engine port).
 *  - "compact"  view_in_compact_mode - PORTED (mode.rb:71-84 substitution
 *               + nesting.rb:52-63 elision;
 *               2026-10-01 — see the modalNestView docblock).
 */
export type NestMode = "normal" | "template" | "edit" | "compact";

/**
 * mode.rb:79-84 `configured_view_in_compact_mode` reads
 * `view_setting(:compact, view)` — the `_view_<view>__compact` method each
 * truthy `compact:` view opt defines (view_opts.rb:59-64; falsy/absent
 * opts never define the method, so a later registration without the opt
 * leaves an earlier truthy one resolving — Ruby method fallthrough). The
 * gem carries exactly 24 truthy declarations, ALL on all-set modules (no
 * per-set or per-format divergence exists to model), so the flat
 * gem-derived record below is complete:
 *
 * - card-mod-format set/all/base.rb: name :14, key :26, linkname :27,
 *   url :28, id_url :29, url_link :31, link :35, nav_link :39, codename
 *   :55, id :56, type :57, created_at :61, updated_at :62, acted_at :63,
 *   core :85, one_line_content :97, blank :109
 * - card-mod-format set/all/title.rb: title :2 (the base-format arm; the
 *   html :title redefinition at :15-17 declares no compact and the
 *   base-format opt survives the lookup), title_link :16, title_no_link :20
 * - card-mod-format set/all/error.rb:2 compact_missing
 * - card-mod-follow set/all/notify/base_views.rb: followed :33,
 *   follower :41, unfollow_url :49 (not registered in this port's mod deck
 *   — unreachable, recorded for completeness)
 *
 * `true` keeps the requested view (mode.rb:81 `return view if
 * compact_config == true`); a string is itself the substitute view
 * (mode.rb:83). Views absent here fall to the mode.rb:73 known? fallback.
 */
const COMPACT_TRUE_VIEWS: Record<string, true | string> = {
  name: true,
  key: true,
  linkname: true,
  url: true,
  id_url: true,
  url_link: true,
  link: true,
  nav_link: true,
  codename: true,
  id: true,
  type: true,
  created_at: true,
  updated_at: true,
  acted_at: true,
  core: true,
  one_line_content: true,
  blank: true,
  title: true,
  title_link: true,
  title_no_link: true,
  compact_missing: true,
  followed: true,
  follower: true,
  unfollow_url: true,
};

/**
 * nesting.rb:69-71 `max_char_count` reads `Card.config.max_char_count`;
 * the railtie default is 200 (card-1.110.0 lib/cardio/railtie.rb:16). The
 * headless port has no Cardio config surface — the default is pinned.
 */
const MAX_NEST_CHAR_COUNT = 200;

/** The default when no format set a mode: mode.rb:18 `parent ?
 *  parent.nest_mode : :normal` - a root format with no parent is :normal. */
const DEFAULT_NEST_MODE: NestMode = "normal";

/**
 * `Cardio.config.raise_all_rendering_errors` (cardio/railtie.rb:38, whose
 * stock default is false) - the process-global posture behind error.rb:65-67
 * `loud_error?` (`focal? || raise_all_rendering_errors`). The TS default
 * here is TRUE: the port's bare view lane and the mod-port raise contracts
 * grew up loud (every raise the mod guards pin reaches the caller), and the
 * reference-harness adapters - whose fixtures were captured with the config
 * explicitly false and Rails.env production (the fixtures' MANIFEST
 * "production render-error semantics" contract line) - set it FALSE at
 * boot, so the corpus's quiet rescue postures (nest spans, delegated spans,
 * the root's own wrap_and_render rescue) engage exactly where the oracle
 * captured them.
 */
let raiseAllRenderingErrors = true;

/** `Cardio.config.raise_all_rendering_errors=` - the boot-time posture
 *  switch (the harness adapters set false; nothing else should). */
export function setRaiseAllRenderingErrors(value: boolean): void {
  raiseAllRenderingErrors = value;
}

/** error.rb:65-67's config half: true when EVERY rescue is loud. */
export function allRenderingErrorsRaise(): boolean {
  return raiseAllRenderingErrors;
}

export interface RenderFormatOptions {
  parent?: RenderFormat;
  main?: boolean;
  /** Production render-error semantics (raise_all_rendering_errors=false):
   *  errors from NESTED view renders become the quiet
   *  `render-error alert alert-danger` span instead of propagating
   *  (format/render.rb wrap_and_render rescue + error.rb rescue_view
   *  quiet branch). The focal (main) render still raises. Page-path only;
   *  the bare view surface keeps the development loud behavior. */
  nestQuietErrors?: boolean;
  /** maximum nest depth — Ruby Card.config.max_depth = 20
   *  (prototype/lib/cardio/railtie.rb:17; monitor_depth,
   *  prototype/lib/card/format/error.rb:32-38). An earlier revision carried
   *  decko's old 42 default; the vendored prototype pins 20 and the
   *  adversarial probe battery graded the divergence (self-inclusion,
   *  cycle-two, nest-of-cycle all 500 at the old guard where Ruby renders
   *  the too-deep UserError at 20). Aligned 2026-09-24. */
  maxDepth?: number;
  /** THIS format's format class name ("html" default). Ruby: `card.format
   *  :email_text` builds an EmailTextFormat (email_text_format.rb:
   *  EmailTextFormat < TextFormat < Format — the TEXT lineage, which does
   *  NOT inherit the html format's method table). The name drives (a) the
   *  view-dispatch chain (resolveView's format argument), (b) the
   *  permission-gate denial shape (the BASE :denial is "" for nested
   *  renders, set/all/error.rb:13-15, where the html override is the
   *  quiet span, set/all/html/error.rb:75-77). Subformats inherit the
   *  parent's format (mode.rb:44 "the subformat always has the same
   *  nest_mode as its parent format" — the format class likewise). */
  formatName?: string;
  /** The CARD's @context_card (contextual_content.rb) an enclosing
   *  with_context set — see RenderFormat#contextCard. Explicit here for
   *  withFormatName's re-format (the ivar survives card.format in Ruby
   *  because it lives on the card). */
  contextCard?: RenderCard;
  /** Marks THE bare view-surface root format (render.ts#render's root — the
   *  engine.render(card, view) entry; page.ts builds its own rootFormat
   *  without this). The census-M1 bar-seat reads it: bar-view slots nested
   *  under this root carry the root card's part-filtered name_context
   *  (the serializer follow-up note step 5 row 1 — the graded Guns:open
   *  bytes pin ctx="gun" on the item bars and ctx-less on every non-bar
   *  slot of the same walk). Never set on the page surface. */
  isViewLaneRoot?: boolean;
}

/** Card.config.max_depth (prototype/lib/cardio/railtie.rb:17). */
export const RUBY_MAX_DEPTH = 20;

/** The UserError monitor_depth raises (card-1.110.0 format/error.rb:33-40)
 *  with card-mod-format's `format_too_deep` locale line (en.yml:23). As a
 *  UserError its message renders verbatim in the quiet error span. */
export class TooDeepError extends Error {
  constructor() {
    super("Man, you're too deep.  (Too many levels of nests at a time)");
    this.name = "TooDeepError";
  }
}

/**
 * The setting codenames whose `Right::*` set modules
 * `include_set Abstract::VirtualSet` (card-mod-rules-0.20.0
 * set/abstract/virtual_set.rb:1-3 `def virtual?; new?; end`):
 * set/right/right.rb:1, right/self.rb:1, right/type.rb:1,
 * right/type_plus_right.rb:1.
 *
 * Each of those files is a `pattern: right` module NAMED AFTER ITS RIGHT
 * SIDE, so the test is "the card's right part is the `*right` / `*self` /
 * `*type` / `*type plus right` SETTING card" — NOT "the card matches the
 * self/type/type_plus_right SET PATTERN". The distinction is load-bearing:
 * the `type` set pattern (03_type.rb, `applies: card.type_id != null`)
 * applies to essentially every typed card, so reading it here made every
 * typed nest miss virtual and grew Role+*type+*default's navbar menu by one
 * live row the capture does not carry — the pointer's
 * nav_link_in_dropdown items ARE nests (navbar-views.ts
 * #dropdownMenuItems), and the oracle's post-divider tail is a single
 * `\n<span class="denied">`.
 *
 * A new card in one of these four right-patterns is virtual, hence KNOWN
 * (states.rb:65-67 `known? = real? || virtual?`), so view/permission.rb:37's
 * `return if card.known?` short-circuits alter_unknown and the REQUESTED
 * view renders unaltered instead of being substituted to :unknown
 * (format/error.rb:23 `setting_view || :unknown`, whose html arm is "").
 */
const VIRTUAL_SET_CODENAMES: ReadonlySet<string> = new Set([
  "right",
  "self",
  "type",
  "type_plus_right",
]);

/**
 * One card's html format. Subformats (nests) are child instances holding a
 * parent pointer (format/nesting/subformat.rb shape). Views live in
 * views.ts; this class is the machinery they call back into.
 */
export class RenderFormat {
  readonly card: RenderCard;
  readonly engine: RenderEngineLike;
  readonly parent: RenderFormat | undefined;
  readonly isMain: boolean;
  readonly maxDepth: number;
  /** Production nested-error semantics flag (see RenderFormatOptions). */
  readonly nestQuietErrors: boolean;
  /** contextual_content.rb:1-3 `def context_card; @context_card || self; end`
   *  — the CARD's @context_card ivar, set for the duration of a
   *  `card.with_context(card)` block (contextual_content.rb:5-12) and read
   *  by format/nest/fetch.rb:12 (`when "_", "_self" then
   *  format.context_card`) to resolve BARE self-nests. Undefined here means
   *  "no with_context is active on this render" — the Ruby fallback answer
   *  is then the card itself. MUTABLE (a plain field, not readonly): Ruby's
   *  with_context assigns, yields, and restores in an ensure — the
   *  Abstract::TestContext :core seam (card-mod-email) writes it around the
   *  super() render exactly the same way. */
  contextCard: RenderCard | undefined;
  /**
   * format.rb:34 `attr_accessor :form, :error_status, :rendered` — Ruby's
   * `@rendered`. Written by wrapper.rb:15 `@rendered = yield` (the view
   * bytes BEFORE the wrappers, then wrapper.rb:23-27 the wrapped bytes) and
   * by the :raw view, whose own with_wrapper lands `structure_card&.content`
   * here (base.rb:75-77) while the :core view is still mid-render — the
   * ORDERING that makes `{{_main}}` inside a card's own content splice the
   * RAW SOURCE (nesting/main.rb:12 `main.rendered || main_nest_render`).
   *
   * The page renderer assigns the main-view body here after the main render
   * (process_layout.rb render_with_layout -> with_wrapper), which is what
   * the LAYOUT body's `{{_main|titled}}` then reads back.
   */
  rendered: string | undefined;
  voo: Voo | undefined;
  private depthCache: number | undefined;
  /** context_names.rb @initial_context_names - the parent-derived context,
   *  lazy-memoized on first access (see initialContextNames). */
  private initialContextNamesCache: string[] | undefined;
  /** context_names.rb @context_names - the working list addNameContext
   *  mutates (see contextNames). */
  private contextNamesCache: string[] | undefined;
  /** nesting/mode.rb @nest_mode - THIS format's own mode, or undefined when
   *  it never ran a with_nest_mode block (the Ruby ivar is likewise unset
   *  until with_altered_nest_mode assigns it, and `nest_mode` below falls
   *  back to the parent). */
  private ownNestMode: NestMode | undefined;
  /**
   * nesting.rb:60 `@char_count` — the compact-mode running total of
   * rendered nest lengths on THIS format instance (a Ruby ivar: subformats
   * start at nil, they do not inherit the parent's count). nil until the
   * first compact-mode nest render completes, which is what makes
   * nest_invisible? (nesting.rb:52-54) false for the first nest however
   * long it is.
   */
  private charCount: number | undefined;
  /** The bare view-surface root marker (RenderFormatOptions.isViewLaneRoot) —
   *  true on exactly the engine.render root format; the census-M1 bar-seat
   *  climbs the parent chain looking for it. */
  readonly isViewLaneRoot: boolean;

  constructor(
    card: RenderCard,
    engine: RenderEngineLike,
    opts: RenderFormatOptions = {},
  ) {
    this.card = card;
    this.engine = engine;
    this.parent = opts.parent;
    this.isMain = opts.main ?? false;
    this.nestQuietErrors = opts.nestQuietErrors ?? false;
    this.maxDepth = opts.maxDepth ?? RUBY_MAX_DEPTH;
    this.formatName = opts.formatName ?? opts.parent?.formatName ?? "html";
    this.contextCard = opts.contextCard;
    this.isViewLaneRoot = opts.isViewLaneRoot ?? false;
  }

  /** THIS format's format class name ("html" default — see
   *  RenderFormatOptions.formatName). */
  readonly formatName: string;

  /** `card.format(:other_format)` — the SAME card rendered through another
   *  format class (email_config.rb's `card.format(:email_text).render_core`
   *  shape): a fresh root format over the same card carrying the other
   *  format's name. Subformat state (nest mode, context names) does NOT
   *  carry — Ruby's #format builds a new format instance. */
  withFormatName(formatName: string): RenderFormat {
    return new RenderFormat(this.card, this.engine, {
      maxDepth: this.maxDepth,
      nestQuietErrors: this.nestQuietErrors,
      formatName,
      // Ruby's @context_card lives on the CARD (contextual_content.rb:5-12
      // assigns the ivar; format.context_card DELEGATES to it), so
      // `card.format(:email_text)` inside a with_context block sees the
      // same context — the email_text :core dispatch's self-nests resolve
      // against the context card exactly like the html render's.
      contextCard: this.contextCard,
    });
  }

  /**
   * nesting/mode.rb:17-19 `nest_mode`: this format's own mode if one was
   * set, else the parent's, else :normal for a root format. A subformat
   * READS the parent's mode but never writes it - the with_nest_mode block
   * that sets the mode restores the previous value when it returns.
   */
  get nestMode(): NestMode {
    if (this.ownNestMode !== undefined) return this.ownNestMode;
    return this.parent?.nestMode ?? DEFAULT_NEST_MODE;
  }

  /**
   * nesting/mode.rb:24-30 `with_nest_mode`: run `body` with `mode` as this
   * format's nest mode, then put the prior mode back. Ruby's `ensure` also
   * restores when the block raises, which is what keeps a failing view
   * from poisoning the rest of the render - a nest rendered inside a
   * with_nest_mode block that throws must not leave the mode changed.
   *
   * Ruby's `if new_mode == @nest_mode then yield` fast path is a
   * no-op-equivalent: assigning the same value and restoring it produces
   * the same observable state, so the port assigns unconditionally.
   */
  withNestMode<T>(mode: NestMode, body: () => T): T {
    const previous = this.ownNestMode;
    this.ownNestMode = mode;
    try {
      return body();
    } finally {
      this.ownNestMode = previous;
    }
  }

  /**
   * nesting/mode.rb:43-51 `modal_nest_view`: the view a nest renders in
   * under the current mode. Ruby runs this on the SUBFORMAT (nest.rb:21
   * `@view = subformat.modal_nest_view @view if @override`), whose
   * nest_mode is the parent's (mode.rb:44) and whose card is the NEST
   * TARGET — so the compact arm's known? check (mode.rb:73) reads the
   * target card, passed as `nestCard`; the mode read here is this
   * format's (the value the subformat inherits one line later).
   *
   * :template → :template_nest (mode.rb:47; card-mod-edit
   * set/all/template_nest.rb re-emits the nest syntax). :edit substitutes
   * per viewInEditMode (mode.rb:56-66 — the multi-card editors' field
   * editors; the edit_nests slice). :compact substitutes per
   * viewInCompactMode below.
   *
   * COMPACT CENSUS (re-verified 2026-10-01
   * on the sha-verified
   * 6a44dfdc dump copy + the 97 expected-v2 shards): the substitution has
   * ZERO observable on the recorded capture surface — every captured
   * one-line render (30,037 divs) is a raw or nest-free arm
   * (card-mod-content set/right/default.rb:4-7 + right/structure.rb:
   * 14-16, card-mod-layout set/right/head.rb:11-13, card-mod-format
   * set/type/html.rb:10-16 chunk_list :references; closed_content: zero
   * captured entries; the five rule bars that do render one-lines carry
   * literal `{{...}}` or nest-free truncated prose first-hand:
   * *all+*head `{{:head|core}}`, Role+*type+*default
   * `RichText : <p>{{+description}}</p>…`, both *guide bars truncate
   * before their first nest at content chars 202/672). The compact arm
   * below is therefore byte-neutral on the surface — it arms the
   * mechanism Ruby would run the day a nest renders under a compact
   * parent (e.g. {{X|titled}} inside a closed_content composition).
   */
  modalNestView(view: string, nestCard: RenderCard = this.card): string {
    if (this.nestMode === "template") return "template_nest";
    if (this.nestMode === "edit") return this.viewInEditMode(view, nestCard);
    if (this.nestMode === "compact") return this.viewInCompactMode(view, nestCard);
    return view;
  }

  /**
   * nesting/mode.rb:56-59 `view_in_edit_mode`:
   * `hide_view_in_edit_mode?(view) ? :blank : :edit_in_form` — a nest
   * under an edit-mode parent (with_nest_mode :edit — the multi-card
   * editors: :edit_nests' multi_card_edit, the structured forms) renders
   * the nest card's :edit_in_form field editor, or :blank when the view
   * never edits (hide_view_in_edit_mode?, mode.rb:62-66:
   * `view_setting(:perms, view) == :none || card.structure ||
   * card.key.blank?` — perms-:none views, a structured card's
   * not-yet-nestable content, and keyless cards). The graded corpus pins
   * both arms: the board/edit_nests field nests all substitute to
   * :edit_in_form, while the Topic template's {{+tags|link}} (link is
   * perms :none) renders nothing.
   */
  private viewInEditMode(view: string, nestCard: RenderCard): string {
    return this.hideViewInEditMode(view, nestCard) ? "blank" : "edit_in_form";
  }

  /** nesting/mode.rb:62-66 hide_view_in_edit_mode? — the three arms in
   *  Ruby's order. The perms arm reads the ported view-perms registry
   *  (the same :none resolution the unknown/denial gates read); the
   *  structure arm is the nest TARGET's *structure rule (the same sync
   *  walk cardStructure reads); the key arm answers blank-key cards. */
  private hideViewInEditMode(view: string, nestCard: RenderCard): boolean {
    if (resolveViewPerms(view).check === false) return true; // perms :none
    const structure = this.engine.structureRuleForSync?.({
      name: nestCard.name.s,
      id: nestCard.id,
      typeId: nestCard.typeId,
      typeName: nestCard.typeName,
      isNew: nestCard.record.isNew === true,
    });
    if (structure !== undefined) return true; // card.structure
    return nestCard.name.s === "" || nestCard.key === ""; // card.key.blank?
  }

  /**
   * nesting/mode.rb:71-74 `view_in_compact_mode`: the configured compact
   * view wins; otherwise the card's known? state picks the fallback —
   * :one_line_content for a known card (real or virtual,
   * mod/core/set/all/states.rb:65-67 `def known?; real? || virtual?;
   * end`), :compact_missing for an unknown one. The port's
   * RenderCard.unknown flag (states.rb#unknown? — set exactly on the
   * fabricated new-card records of buildUnknownNestCard, absent on
   * virtual-known search-family cards) is that predicate.
   */
  private viewInCompactMode(view: string, nestCard: RenderCard): string {
    const configured = this.configuredViewInCompactMode(view);
    if (configured !== undefined) return configured;
    return nestCard.unknown ? "compact_missing" : "one_line_content";
  }

  /**
   * nesting/mode.rb:79-84 `configured_view_in_compact_mode`:
   * `view_setting(:compact, view)` — true keeps the view (mode.rb:81), a
   * symbol is itself the substitute (mode.rb:83), nil falls through to
   * the known? fallback. The gem's 24 declarations are all-set (see
   * COMPACT_TRUE_VIEWS); a future mod-level compact declaration lands in
   * that record with its gem cite.
   */
  private configuredViewInCompactMode(view: string): string | undefined {
    const compactConfig = COMPACT_TRUE_VIEWS[view];
    if (compactConfig === true) return view;
    return compactConfig;
  }

  /** view.rb#depth - the subformat chain depth (recursion guard). */
  get depth(): number {
    if (this.depthCache === undefined) {
      this.depthCache = this.parent === undefined ? 0 : this.parent.depth + 1;
    }
    return this.depthCache;
  }

  /**
   * format/nesting/subformat.rb#subformat + render composition: a NEW
   * RenderFormat for the SAME card with `parent` pointing at this format -
   * fresh voo state (the child voo's visibility inherits from the
   * SUBFORMAT's undefined voo, not the caller's). The rules mod's
   * current_rule_form (rule_form.rb:41-44) renders the inner :rule_form
   * through this boundary: the captured overlay_rule/modal_rule/rule_edit
   * slots carry show/hide lists that do NOT leak into the inner rule_form
   * slot's JSON (rules-views.json: overlay_rule hide [menu,help]; the
   * nested rule_form slot's show list is ["rule_form"] alone), which is
   * Ruby's subformat isolation. Returns the subformat's renderView output.
   */
  subformatView(view: string, opts: Record<string, unknown> = {}): string {
    const sub = new RenderFormat(this.card, this.engine, {
      parent: this,
      maxDepth: this.maxDepth,
      nestQuietErrors: this.nestQuietErrors,
    });
    // the nest chunk result embeds into content: Ruby's to_s layer.
    return str(sub.renderView(view, opts));
  }

  /**
   * context_names.rb#initial_context_names - the parent format's working
   * context filtered to the parts of THIS card's name
   * (relevant_context_names: `yield.select { |n| part_keys.include? n.key }`).
   * A page's direct body nests inherit the page card's key; a nest whose
   * name does not contain that part (simple cards, other-page junctions)
   * filters it out. Lazy like Ruby: the parent's working list is read at
   * THIS format's first context access, so children rendered after the
   * parent's titled header (addNameContext) see the added parts, exactly
   * Ruby's lazy memoization through format ancestry.
   *
   * This is the list the slot JSON's name_context carries (wrap.rb:68-79
   * name_context_slot_option emits initial_context_names, pre-add).
   */
  get initialContextNames(): readonly string[] {
    if (this.initialContextNamesCache === undefined) {
      const inherited = this.parent?.contextNames ?? [];
      const partKeys = this.card.name.partKeys;
      this.initialContextNamesCache = inherited.filter((key) => partKeys.includes(key));
    }
    return this.initialContextNamesCache;
  }

  /**
   * context_names.rb#context_names - the working list. Lazy-initializes to
   * initialContextNames (relevant_context_names over the parent's working
   * list; the params branch context_names_from_params is the AJAX-slot
   * surface, unported - page renders carry no slot_opts params).
   */
  get contextNames(): readonly string[] {
    if (this.contextNamesCache === undefined) {
      this.contextNamesCache = [...this.initialContextNames];
    }
    return this.contextNamesCache;
  }

  /**
   * context_names.rb#add_name_context (default name): append this card's
   * own part keys to the working context. Called by the :titled view AFTER
   * its header renders (html/views.rb:59 `naming { render_header }` -
   * naming yields first, so the titled card's own title renders in the
   * pre-context and stays full while its body nests relativize).
   */
  addNameContext(): void {
    const list = this.contextNamesCache ?? [...this.initialContextNames];
    this.contextNamesCache = list;
    for (const key of this.card.name.partKeys) {
      if (!list.includes(key)) list.push(key);
    }
  }

  /**
   * The name_context key list the slot JSON carries (wrap.rb:74-78
   * name_context_slot_option emits initial_context_names): the
   * parent-derived initial context. slot-html.ts#slotOptionsWithNameContext
   * reads this.
   */
  slotNameContextKeys(): readonly string[] {
    return this.initialContextNames;
  }

  /** The format rendering the page root (context card for relative names). */
  get contextFormat(): RenderFormat {
    return this.parent ?? this;
  }

  /** content.rb:60-70 id_counter + unique_id: the element-id counter is
   *  owned by the format-chain ROOT (every subformat delegates:
   *  `return @parent.id_counter if @parent`), incremented once per call;
   *  the id is "<this card's safe_key>-<n>" (content.rb:69). The editors
   *  consume it - tinymce_editor_input's `id: unique_id` (the captured
   *  edit form's `id="oracle_basic-1"`). */
  uniqueId(): string {
    return `${this.card.name.safeKey}-${this.nextIdNumber()}`;
  }

  /** The next value of the format-chain root's id_counter (content.rb:
   *  60-66 — every subformat delegates up to the root, so one request's
   *  element ids are numbered in render order across all its formats). */
  nextIdNumber(): number {
    let root: RenderFormat = this;
    while (root.parent !== undefined) root = root.parent;
    root.idCounter = (root.idCounter ?? 0) + 1;
    return root.idCounter;
  }

  /** The chain root's counter value after this render (the page lane
   *  hands it to the modal render: Ruby's render_outside_of_layout runs
   *  `render!` on the SAME root format — process_layout.rb:44-48 — so
   *  the modal's editors continue the body's numbering; the layout's
   *  enabled-roles checkboxes consume 1-2 before the modal editor's
   *  3-12, the pointer-input journeys' oracle pins). */
  exportRootIdCounter(): number | undefined {
    let root: RenderFormat = this;
    while (root.parent !== undefined) root = root.parent;
    return root.idCounter;
  }

  /** The other half: a NEW root format (the page lane's modal render)
   *  continues the body render's numbering. */
  seedRootIdCounter(value: number | undefined): void {
    let root: RenderFormat = this;
    while (root.parent !== undefined) root = root.parent;
    if (value !== undefined) root.idCounter = value;
  }

  /** The `read` half of the view-permission gate (format/error.rb:5-8 ok?),
   *  as ONE predicate for both gate call sites.
   *
   *  The deck-global default is `!isDenied(card)`. The one exception is an
   *  unknown pointer/list item whose OWN nest found it readable: Ruby builds
   *  that phantom fresh per nest (Nest::Fetch#new_card) and runs the read
   *  walk on THAT card, so the per-nest verdict
   *  (RenderEngine#pointerItemVerdict, `${hostKey}|${itemKey}`) is the
   *  faithful answer — while `isDenied` reads deniedVerdictsByKey, which
   *  ensurePointerItemVerdicts fills once per item key GLOBALLY (first fold
   *  wins). An item line that appears on many hosts therefore inherits
   *  whichever host the run touched first: `mytho-psychology` sits on ~30
   *  corpus cards and under Quicksilver+Core Project the nest read is true
   *  (Project/398) while the global entry said denied, rendering bar_left
   *  as a quiet denial where the oracle renders the card title. Probed:
   *  cold isDenied false -> full bar; warm isDenied true -> two denied
   *  spans; per-nest verdict read:true in both (M2 recorded result). */
  private cardReadable(): boolean {
    if (this.card.pointerItemReadVerdict === true) return true;
    return !this.engine.isDenied(this.card);
  }

  private idCounter: number | undefined;

  /** html/views.rb @content_body: set on a format by its :titled and
   *  :labeled views and read by wrap_body. The engine sets it where a later
   *  render on the same Ruby format observes it (process_layout.rb
   *  render_outside_of_layout: the denial frame after a titled page body). */
  contentBody = false;

  // -------------------------------------------------------------------------
  // render.rb#render!
  // -------------------------------------------------------------------------

  /**
   * format.render(view) / render_<view>: build the voo, process visibility,
   * run before-hooks, dispatch to the view method. The `optional` argument
   * carries Ruby's optional render opt (:show by default via
   * method_delegation.rb#optional_render_opt; "hide" for optional: :hide).
   */
  renderView(
    view: string,
    opts: Record<string, unknown> = {},
    optional: unknown = "show",
    viewLaneRoot = false,
  ): ViewResult {
    const normalized = normalizeView(view);
    // view.rb#ok_view (view.rb:86 `altered_view || requested_view`): on an
    // unknown card the view is substituted BEFORE dispatch (view/permission.rb
    // #alter_unknown -> format/error.rb#view_for_unknown). The voo keeps the
    // REQUESTED view (Ruby voo @raw_view); only the dispatched view changes.
    // permission.rb:19-23 altered_view runs `return if skip_check?` FIRST:
    // a perms-:none view (or the skip_perms render opt) renders AS REQUESTED
    // on an unknown card — no :unknown substitution. That skip is what makes
    // the compact substitution's :compact_missing fallback (mode.rb:73;
    // set/all/error.rb:2 perms: :none) reachable — without it the
    // substituted view was itself re-substituted to :unknown.
    const effective =
      this.card.unknown === true && !this.unknownGateSkip(normalized, opts)
        ? this.viewForUnknown(normalized, opts)
        : normalized;
    // view/options/voo_api.rb:115-119 #add_implicit_options! — the second
    // line, `@normalized_options[:main] = true if format.main?`. The first
    // line (`@normalized_options[:view] = @raw_view`) is the Voo's own
    // `view` field, already carried by slotOptions()'s `view: viewField`
    // merge. `format.main?` is html_format.rb:11-13 `!@main.nil?`, and
    // `@main` is set by nesting/main.rb:37-39 `main!` — called on the page
    // root format by card-mod-layout-0.20.0 set/all/process_layout.rb:19
    // `show_with_page_layout ... main!`. So EVERY voo a MAIN format renders
    // carries `main: true` in its normalized options, not just the `_main`
    // nest: the page card's own `content` slot (rendered by the same format
    // through the open view's bar_bottom -> render :content) carries it too.
    //
    // ORACLE CENSUS over the sha-verified expected-v2 page surface (6588
    // records, all 48 shards): 6583 pages have a `titled` main view and
    // emit exactly one `main:true` (the `_main` slot, which the page
    // renderer already passes explicitly — page.ts renderView opts); the
    // two `open` main-view pages (1316 shard 000000, 2333 shard 000001) are
    // the only ones whose view body renders a same-format `content` slot on
    // the page card, and both pin `"main":true` there. The 330
    // nest_name-less data-slot entries on OTHER cards (layout-card nests,
    // each rendered on its own subformat via nest()) carry no `main`, so
    // the rule is scoped to the format's OWN main-ness, exactly as
    // `format.main?` is.
    const vooOpts: Record<string, unknown> = { ...opts };
    if (this.isMain) vooOpts["main"] = true;
    const voo = new Voo(this.voo ?? undefined, normalized, vooOpts, viewLaneRoot);
    const previous = this.voo;
    this.voo = voo;
    try {
      voo.processVisibility(optional);
      // voo_api.rb:154 process_live_options: `return :hide if
      // hide_requested_view?` (optional? && hide?(requested_view)) — the
      // render bails with nothing when the caller marked the REQUESTED
      // view hidden via the optional render opt (the discussion core's
      // render_comment_box optional: :hide — the :core view never shows
      // :comment_box, so the box contributes nothing on every :core
      // render, all actors; the open-family views voo.show it and keep
      // the form).
      if (optional !== undefined && optional !== null && voo.viz.get(normalized) === "hide") {
        // view.rb:69 bare return — NIL, which output()'s compact drops (the
        // discussion join loses its separator too).
        return null;
      }
      // view/permission.rb #altered_view (:19-23): the unknown branch ran
      // above; for KNOWN cards the view-permission gate replaces the view
      // before any hook or body runs. Task resolution (view_perms, :13-15),
      // skip_check? (:25-27 — perms :none views and the skip_perms render
      // option), the ok_to_<task>? verdict lookup (format/error.rb:5-8 ok?)
      // and the denial substitution (view_for_denial, error.rb:27-31) live
      // in src/card/permissions/view-perms.ts. Verdicts are precomputed
      // engine state (zero queries here): read through isDenied's verdict
      // map, non-read tasks through the optional isTaskDenied hook (the
      // first ported non-read view is :universal_edit_button, perms :update
      // since 2026-09-28 — the ensureTaskVerdicts prepare step precomputes
      // its verdicts when the requested view needs them; an absent
      // hook leaves those views unverified-allowed, per
      // ).
      if (this.card.unknown !== true) {
        const denial = viewPermissionDenial(normalized, {
          renderOpts: opts,
          isNewCard: this.card.id === undefined,
          formatName: this.formatName,
          taskAllowed: (task: CrudTask): boolean | undefined =>
            task === "read"
              ? this.cardReadable()
              : this.engine.taskAllowed?.(this.card, task),
          // permission.rb:61 method predicates: can_configure? is the one
          // ported predicate (cardtype.rb:68-70 — update-ok on the card's
          // *structure rule card); unported predicates keep the
          // documented remainder (allowed).
          predicateAllowed: (predicate: string): boolean | undefined =>
            predicate === "can_configure?" ? this.engine.canConfigure?.(this.card) : undefined,
        });
        if (denial !== undefined) {
          this.noteFocalDenial(voo);
          // R16 batch 2: error.rb:27-31 view_for_denial substitutes the
          // configured denial VIEW (:denial), and html/error.rb:75-77
          // `view :denial do focal? ? loud_denial : quiet_denial end` —
          // the FOCAL (main, root) denial is the LOUD denial frame,
          // slot-wrapped as `<key>-denial-view` with the ORIGINAL requested
          // view still in the data-slot JSON (the 2,835-page oracle class:
          // a named corpus page, CM 20100614, ...). Non-main formats keep the quiet
          // span (the bare view surface's pinned pointer-item surface; the
          // view-surface capture recorded no per-view bytes for fully denied
          // cards, so nothing graded changes there).
          //
          // Substitution-first applies on the main format too: error.rb:27-31
          // is `view_setting(:denial, view) || :denial`, so a view with its
          // own `denial:` config (the DENIAL_VIEW set in view-perms.ts —
          // comment_box/menu/edit_link/list_of_changes/universal_edit_button/
          // configure_button, all :blank on the ported surface) renders THAT
          // view's bytes on the main format as well ("" for :blank). The loud
          // frame is only the DEFAULT :denial view's focal body
          // (html/error.rb:75-77). Mechanism of the discussion-page +bytes
          // family: the discussion `:core` join (views.ts `render_comment_box
          // (optional: :hide)`, card-mod-comment set/right/discussion.rb:8-10)
          // dispatches a denied comment_box (perms :update, denial :blank) on
          // the page's main format, so the unconditional main arm emitted the
          // 1,377-char loud frame plus one extra closing </div> on every
          // +discussion page where the Ruby oracle renders nothing.
          if (this.isMain && viewDenialView(normalized) === undefined) {
            return this.mainLoudDenialHtml(voo, this.focalDeniedTask(normalized));
          }
          return denial;
        }
      } else if (
        effective === normalized &&
        !PERMS_NONE_VIEWS.has(normalized) &&
        !renderOptSkipPerms(opts)
      ) {
        // permission.rb:22 `alter_unknown || denial`: when the view's
        // `unknown:` config is `true` (the view SUPPORTS unknown —
        // viewForUnknown returned the requested view for exactly that
        // reason), alter_unknown answers nil and the DENIAL check still
        // runs on the unknown card. The captured case is the layout
        // {{*foot|core}} nest (card-mod-edit template_nest.rb:2
        // `unknown: true`): the trashed *foot target's new card is
        // read-denied and Ruby renders the quiet denial span where the
        // pre-fix engine skipped its gate for unknown cards and printed
        // the authored nest syntax. A SUBSTITUTED unknown view (config
        // names a view, or absent -> :unknown) never reaches this arm —
        // Ruby's view_for_unknown returns truthy there and short-circuits
        // the denial (permission.rb:22,42-43).
        const denial = viewPermissionDenial(normalized, {
          renderOpts: opts,
          isNewCard: this.card.id === undefined,
          taskAllowed: (task: CrudTask): boolean | undefined =>
            task === "read"
              ? this.cardReadable()
              : this.engine.taskAllowed?.(this.card, task),
          predicateAllowed: (predicate: string): boolean | undefined =>
            predicate === "can_configure?" ? this.engine.canConfigure?.(this.card) : undefined,
        });
        if (denial !== undefined) {
          this.noteFocalDenial(voo);
          if (this.isMain && viewDenialView(normalized) === undefined) {
            return this.mainLoudDenialHtml(voo, this.focalDeniedTask(normalized));
          }
          return denial;
        }
      }
      if (effective === "not_found" && this.formatName === "html" && this.card.unknown === true) {
        return this.notFoundFrameHtml(voo);
      }
      // voo_api.rb:162-164 process_before_view: `format.before_view
      // requested_view` - the REQUESTED view's before hook, also when an
      // unknown card renders a substituted view (a `{{+x|content}}` miss
      // keeps before(:content)'s d0-card-content class on its unknown slot).
      this.runBeforeHook(normalized, voo);
      // Chain-aware dispatch: when the engine has a mod loader wired up,
      // resolve through the per-card chain (Ruby's MRO walk - set/
      // format.rb:146-150) and return the most-specific set module's
      // view; when NO loader is registered, fall back to the flat
      // engine.views record (byte-identical to the pre-chain path).
      // Without this seam the loader's flat last-wins record would
      // hijack EVERY card with the LAST mod that registered the view
      // (probe: card-mod-recaptcha's :core hijacks every card's :core
      // when it loads last; card-mod-api_key's :content hijacks every
      // card's :content when it loads last - ruby MRO per card fixes
      // both). The cache lives on the engine (closureWarm-style) so a
      // warm render path is zero-cost.
      const viewFn = this.engine.resolveView(this.card, effective, this.formatName);
      try {
        if (viewFn === undefined) {
          // render.rb#view_method + error.rb#unsupported_view_error_message
          // (Ruby substitutes first, so an unsupported REQUESTED view on an
          // unknown card reports the substituted view - same shape here).
          // The raise sits INSIDE the wrap_and_render rescue scope: Ruby's
          // view_method runs under final_render (render.rb:36-41), called
          // from wrap_and_render's begin (render.rb:96-100), so an
          // unsupported view on the root render IS rescued - the quiet span
          // is the render's value (the corpus's boxed/progress_bar/
          // pointer_core/... rows, oracle bytes "view (X) not supported
          // for Y").
          throw new UnsupportedViewError(effective, this.card.name.s);
        }
        return viewFn({ fmt: this, voo });
      } catch (error) {
        // THE ROOT'S OWN wrap_and_render rescue (format/render.rb:115-119),
        // on THE bare view-lane root only. In the serving posture the html
        // format is never focal (html_format.rb:16-18 focal? =
        // show_layout? ? main? : depth.zero? - the adapter's bare render
        // main!s nothing, so focal? is main? = false), loud_error?
        // (error.rb:65-67) is therefore false, and the rescue is QUIET
        // (error.rb:75-78): the span is the render's value. Nested and
        // delegated renders are rescued by their own scopes (nest()'s
        // catch, renderDelegated) - a throw reaching here already escaped
        // those. A focal root re-raises as Ruby's loud_error does
        // (error.rb:69-73); the page lane builds non-viewLaneRoot roots, so
        // it keeps its own error surface. The config half of loud_error?
        // keeps the development posture (the mod-port raise contracts)
        // fully loud.
        if (!viewLaneRoot || allRenderingErrorsRaise()) throw error;
        return quietRenderError(error, this.card, effective, this);
      }
    } finally {
      this.voo = previous;
    }
  }

  /** format/error.rb:27-31 view_for_denial: `root.error_status = 403 if
   *  focal? && voo.root?`. Focal is the page's main format (isMain); the
   *  voo is the root one when this format has no enclosing view (Ruby's
   *  `voo.root?` is `!parent`, and a voo's parent is its format's current
   *  voo, as here). Set before the denial view is chosen, as in Ruby, so a
   *  configured denial view (view_setting(:denial, view)) still answers
   *  403. A denied nested card or a denied sub-view inside the main card's
   *  view leaves the status alone. */
  private noteFocalDenial(voo: Voo): void {
    if (this.isMain && voo.parent === undefined) this.engine.pageErrorStatus = 403;
  }

  /** R16 batch 2: the focal (main) denial — html/error.rb:203-208
   *  loud_denial + :194-198 with_frame, byte-pinned by the 2,835-page
   *  oracle class (a named corpus page / CM 20100614 / Martial Concordance Public
   *  Module 01 page captures):
   *
   *  loud_denial: `voo.hide :menu; frame { [wrap_with(:h1, "Sorry!"),
   *  wrap_with(:div, loud_denial_message)] }`; with_frame additionally
   *  hides :help — the hides land in the slot JSON's hide list while the
   *  data-slot `view` field keeps the REQUESTED view (the wrap is emitted
   *  with view "denial" for the id/class only).
   *
   *  loud_denial_message, Anonymous branch (error.rb:215-222
   *  sign_in_or_up_links(to_do_unauthorized_task)): "Please sign in or
   *  sign up to read this." (format_denied_task: "to %{denied_task} this"
   *  with the read task). The signed-in branch ("You need permission to
   *  read this") is a documented remainder — the captured corpus viewer
   *  is always Anonymous.
   *
   *  Slot wrap: id `<safe-key>-denial-view`, class `card-slot
   *  denial-view <set-keys>`, data attrs from the real card, data-slot
   *  from the ORIGINAL main-nest opts (identical to the readable main
   *  render's slot JSON except the id/class view and the hide list). */
  /** The self-set title overrides (card-mod-search set/self/search.rb:39-42
   *  `view :title do voo.title ||= t(:search_results_title); super end`;
   *  mod/search/set/self/recent.rb:4-7 `voo.title ||= "Recent Changes"`;
   *  card-mod-account set/self/signin.rb:134-137
   *  `voo.title ||= t(:account_sign_in_title)` - en.yml:32 "Sign In").
   *  Ruby binds these to the SELF set modules, which anchor by CODENAME
   *  (set.rb:42-44); the oracle pins the bytes (*search -> "Search Results",
   *  *recent -> "Recent Changes", *signin -> "Sign In"; base dump
   *  000003-_search-title/-closed, 000003-_recent-title,
   *  000015-_signin-title/-closed). Served in the render layer (not as
   *  setModule registrations) because the headless view-surface engine runs
   *  with NO ModLoader bound - the same pattern as openView's discussion
   *  comment_box check. Keys are card codenames. */
  selfSetTitleOverride(): string | undefined {
    return SELF_SET_TITLE_OVERRIDES.get(this.card.record.codename ?? "");
  }

  /** The task the loud denial message names (card/lib/card/format/error.rb:38-42
   *  view_for_denial `@denied_task = task` — the FAILING task, which html/error.rb:214-222
   *  to_do_unauthorized_task interpolates into "to %{denied_task} this"). The view's
   *  perms task (view-perms.ts resolveViewPerms), read for method predicates, and a
   *  new card's update reads as create (error.rb:5-7 ok? `task = :create if
   *  task == :update && card.new_card?`). Both focal-denial arms share this so a
   *  known card's edit denial names update exactly as an unknown-card arm does. */
  private focalDeniedTask(view: string): CrudTask {
    const perms = resolveViewPerms(view);
    const task: CrudTask = perms.check && !perms.predicate ? perms.task : "read";
    return task === "update" && this.card.id === undefined ? "create" : task;
  }

  /** The focal (main-format) arm of html/error.rb's :denial view — public
   *  for the composed deck's all/error html table, whose :denial view
   *  renders `focal? ? loud_denial : quiet_denial` (error.rb:75-77): the
   *  non-focal arm is the quiet span (the corpus's view-lane :denial
   *  bytes), the focal arm is this loud frame (the golden the dual-lane
   *  denial pages pin). The denied task rides focalDeniedTask (this
   *  round's failing-task resolution) unless the caller pins it. */
  mainLoudDenialHtml(voo: Voo, deniedTask: CrudTask = "read"): string {
    voo.hide("menu");
    voo.hide("help");
    const card = this.card;
    // frame.rb:31-33 `def frame_header; _render_header; end` (the loud
    // denial's frame chain: error.rb:191-197 -> frame -> standard_frame ->
    // with_frame slot=true, header=frame_header, html/frame.rb:19-29), and
    // the header view's title is the title view (the readable header build,
    // renders `fmt.renderView("title")`). The SELF-set title
    // overrides fire INSIDE that view (recent.rb:4-7 `voo.title ||=
    // "Recent Changes"`; search.rb:39-42; signin.rb:134-137), and :title is
    // perms:none (title.rb:22-24; view-perms.ts:101-102) so it renders
    // despite the read denial — the *recent:page capture carries
    // `title="Recent Changes"` in the denial frame's header. The previous
    // hand build (`h(name)` twice) froze the BARE NAME into the denial
    // header and the override could never apply (solo probe *recent:page
    // delta -14: 2 x ("Recent Changes") - 2 x ("*recent"), attribute +
    // content). For every card WITHOUT a codename override this call is
    // byte-identical to the old build: titleNoLinkView emits
    // `<span class="card-title" title="${h(name)}">${wrappedTitleInner(h(name))}</span>`
    // and wrappedTitleInner's `/\s*\+\s*/` join equals the old
    // `.split("+")` join wherever no oracle title puts whitespace next to a
    // joint (the census at format.ts:3670-3676: 145,258 of 145,260 captured
    // spans byte-equal; the 2 exceptions are the html_safe explicit-title
    // arm, not joint-related).
    //
    // fold-9 superset note (2026-10-03): wave1's landed cluster-12 fix on
    // this line was a hand build reading SELF_SET_TITLE_OVERRIDES via
    // `selfSetTitleOverride() ?? name`; refill2's landed fix delegates to
    // the real :title view. The delegation is taken because it is
    // capture-census-backed (145,258/145,260) and SUBSUMES the table
    // lookup: titleNoLinkView itself reads the same
    // SELF_SET_TITLE_OVERRIDES table (now single-sourced in this file,
    // read through fmt.selfSetTitleOverride()) — so wave1's override data
    // and refill2's view-delegation mechanism both survive, and the denial
    // header can no longer drift from the readable header's title bytes.
    const header =
      `<div class="d0-card-header card-header">` +
      `<h1 class="d0-card-header-title">` +
      `${this.renderView("title")}</h1></div>`;
    const message = this.loudDenialMessageHtml(deniedTask);
    // wrap.rb wrap_body: the body carries d0-card-content and the set keys
    // once a :titled or :labeled render set @content_body on this format.
    const bodyClasses = this.contentBody ? `d0-card-body d0-card-content ${card.setKeys}` : "d0-card-body";
    const body = `<div class="${bodyClasses} card-body card-text"><h1>Sorry!</h1>\n${message}</div>`;
    const frame = `<div class="d0-card-frame card">${header}\n\n${body}</div>`;
    const attrs = emitAttrs({
      id: `${card.name.safeKey}-denial-view`,
      class: voo.classy(["card-slot", "denial-view", card.setKeys]),
      "data-card-id": card.id === undefined ? undefined : String(card.id),
      // wrap.rb slot_cardname: a new compound card is named by its url key
      "data-card-name": card.id === undefined && card.name.isCompound ? card.name.urlKey : card.name.s,
      "data-card-type-id": card.typeId === undefined ? undefined : String(card.typeId),
      "data-card-type-name": card.typeName,
      "data-card-link-name": this.urlKey(),
      "data-slot-id": newSlotId(),
      "data-slot": slotOptionsJson(voo.slotOptions()),
    });
    return `<div${attrs}>${frame}</div>`;
  }

  /** set/all/html/error.rb:67-73 view :not_found — `voo.hide! :menu;
   *  voo.title = "Not Found"; frame { [not_found_errors,
   *  sign_in_or_up_links("to create it")] }`: the standard frame (the
   *  header's title is the voo title), not_found.haml naming the card, and
   *  for a signed-out session the sign-in/sign-up sentence (nil, and so
   *  dropped, when signed in). The slot keeps the requested view in its
   *  data-slot, as every substituted view does. */
  private notFoundFrameHtml(voo: Voo): string {
    voo.hide("menu");
    voo.hide("help");
    const card = this.card;
    const title = "Not Found";
    // The frame header's heading level follows the format's main-ness: the
    // page lane (the unknown MAIN card substituted to :not_found, isMain)
    // carries `<h1 class="d0-card-header-title">` (oracle: the
    // page:anonymous:Nonexistent Card bytes) while the bare view lane
    // (`card.format.render(:not_found)`, non-main) carries h2 (oracle: the
    // view:admin:Nonexistent Card:not_found bytes; the seconds corpus's
    // composed-mod view-gap pin, 2026-10-09).
    const heading = this.isMain ? "h1" : "h2";
    const header =
      `<div class="d0-card-header card-header">` +
      `<${heading} class="d0-card-header-title">` +
      `<span class="card-title" title="${title}">${title}</span></${heading}></div>`;
    const errors =
      card.name.s === ""
        ? `<h2>\nCould not find\nthat\n</h2>\n`
        : `<h2>\nCould not find\n<em>\n${h(card.name.s)}\n</em>\n</h2>\n`;
    const parts = [errors];
    if (this.engine.pageSession?.signedIn !== true) {
      parts.push(
        `<div>Please <a class="signin-link known-card" href="/*signin/titled">sign in</a> or ` +
          `<a class="signup-link known-card" href="/new/Sign_up">sign up</a> to create it.</div>`,
      );
    }
    const body = `<div class="d0-card-body card-body card-text">${parts.join("\n")}</div>`;
    const attrs = emitAttrs({
      id: `${card.name.safeKey}-not_found-view`,
      class: voo.classy(["card-slot", "not_found-view", card.setKeys]),
      "data-card-id": card.id === undefined ? undefined : String(card.id),
      // wrap.rb: a new compound card's slot names it by its url key.
      "data-card-name": card.id === undefined && card.name.isCompound ? card.name.urlKey : card.name.s,
      "data-card-type-id": card.typeId === undefined ? undefined : String(card.typeId),
      "data-card-type-name": card.typeName,
      "data-card-link-name": this.urlKey(),
      "data-slot-id": newSlotId(),
      "data-slot": slotOptionsJson(voo.slotOptions()),
    });
    return `<div${attrs}><div class="d0-card-frame card">${header}\n\n${body}</div></div>`;
  }

  /** html/error.rb:203-222 loud_denial_message + loud_denial's
   *  `wrap_with(:div, ...)` wrapper, both session branches.
   *  Ruby picks by SESSION sign-in state, not by as_id:
   *  `when Auth.signed_in? then t(:format_need_permission_task, task:
   *  to_task)` — en.yml: `format_need_permission_task: "You need permission
   *  %{task}."` with format_denied_task "to %{denied_task} this" (the read
   *  task) = the plain STRING "You need permission to read this." inside
   *  the wrap div (golden: `<h1>Sorry!</h1>\n<div>You need permission to
   *  read this.</div>`). The signed-out branch is sign_in_or_up_links,
   *  whose own inner div nests inside the wrap (the captured anonymous
   *  corpus surface, byte-pinned by the dual-lane denial pages —
   *  untouched). The authenticated goldens all render the signed-in branch
   *  because the capture session stays the bot (Auth.current never leaves
   *  the runner session — capture-authenticated-pages.rb:143-153). */
  private loudDenialMessageHtml(deniedTask: string): string {
    if (this.engine.pageSession?.signedIn === true) {
      // html/error.rb:200-204: @denied_task NIL renders t(:format_to_do_that)
      // — "to do that", the controller-rescue denial's wording (a raised
      // PermissionDenied carries no view-level denied task). The page-scoped
      // phrase override is that nil arm; the view-level walk keeps its own
      // task wording.
      const phrase = this.engine.pageLoudDenialTaskPhrase;
      if (phrase !== undefined) return `<div>You need permission to ${phrase}.</div>`;
      return `<div>You need permission to ${deniedTask} this.</div>`;
    }
    return (
      `<div><div>Please <a class="signin-link known-card" href="/*signin/titled">sign in</a> or ` +
      `<a class="signup-link known-card" href="/new/Sign_up">sign up</a> to ${deniedTask} this.</div></div>`
    );
  }

  /**
   * view/permission.rb#alter_unknown + format/error.rb#view_for_unknown for
   * the nested (non-page) surface. Order per Ruby:
   * 1. perms-:none views skip the check entirely (permission.rb#skip_check?)
   * 2. views configured `unknown: true` render as requested
   * 3. configured_view = the nest's `unknown:` option || the view's
   *    `unknown:` config; view_for_unknown -> `setting_view || :unknown`
   *    (the main+root page branch - page_view_for_unknown :not_found/:new -
   *    is not ported: the capture never renders an unknown MAIN card).
   */
  private viewForUnknown(requested: string, opts: Record<string, unknown>): string {
    if (PERMS_NONE_VIEWS.has(requested)) return requested; // permission.rb#skip_check?
    // permission.rb:38 `setting :unknown` resolves through the CARD'S SET
    // CHAIN. With a mod deck bound, the loader's per-card chain walk is the
    // authority for SET-SCOPED declarations (loader.viewUnknownSettingForCard
    // -> viewChain(setKeys...), the same MRO walk the dispatcher uses);
    // `undefined` there means no set module in the card's chain declares the
    // setting. The ALL-SET rows of the compiled decl table still apply on
    // top (Ruby mixes the all-set format modules into every deck's base
    // class — registrar.rb:79-84 — and the core bar/format all-set views
    // are compiled here rather than registered as modules). A loader-LESS
    // engine reads the full compiled table: it transcribes the same
    // set-scoped + all-set declarations, and the set-scoped rows are what
    // the old flat table globalized — the exact defect this replaces.
    const fromChain = this.engine.viewUnknownSettingForCard?.(this.card, requested);
    if (typeof process !== "undefined" && process.env.HARNESS_VERDICT_TRACE === "1" && requested === "edit") {
      console.log(
        `[unknown-trace] card=${this.card.name.s} setKeys=${this.card.setKeys} fromChain=${String(fromChain)} loaderBound=${this.engine.modDeckBound?.()}`,
      );
    }
    const loaderBound = this.engine.modDeckBound?.() === true;
    const configured =
      fromChain !== undefined
        ? fromChain
        : loaderBound
          ? compiledUnknownSettingForCard(this.card, requested, true)
          : compiledUnknownSettingForCard(this.card, requested);
    if (configured === true) return requested; // permission.rb:40 unknown_setting == "true"
    if (this.isMain && this.voo === undefined) {
      // format/error.rb:18-25 view_for_unknown, main+root branch:
      // root.error_status = page_status_for_unknown; page_view_for_unknown —
      // html/error.rb:81-87 `ok?(:create) ? :new : super` (super = the base
      // :not_found) and `ok?(:create) ? 200 : 404`.
      const canCreate = this.engine.taskAllowed?.(this.card, "create") === true;
      this.engine.pageErrorStatus = canCreate ? 200 : 404;
      return canCreate ? "new" : "not_found";
    }
    // permission.rb:42 configured_view = (unknown || unknown_setting)
    const nestOpt = opts["unknown"];
    const effective = nestOpt !== undefined ? nestOpt : configured;
    if (effective === undefined || effective === false || effective === "false") {
      return "unknown"; // format/error.rb:23 `setting_view || :unknown`
    }
    return String(effective);
  }

  /** set/format.rb before(:view) hooks - the captured surface has the
   *  following class_up machinery:
   *  - html/views.rb:6-8 before(:content) { prepare_content_slot }
   *    (`class_up "card-slot", "d0-card-content"`)
   *  - card-mod-rules set/rule/bar_view.rb:9-13 view :bar:
   *    `class_up "card-slot", "_rule-item #{category_classes}"` -
   *    fires for rule cards only (right side is a setting).
   *  - card-mod-search set/abstract/search_views.rb:35-38 view :bar:
   *    `voo.hide :one_line_content; super()` - hides one_line_content
   *    for Search-type cards. Ruby's set-module dispatch fires when the
   *    card's type matches SearchTypeID; in this port, the codename
   *    registry is the source of truth for that match (the corpus's
   *    search_type card has a random NAME, so a typeName check misses). */
  private runBeforeHook(view: string, voo: Voo): void {
    if (view === "content") {
      // html/views.rb#prepare_content_slot
      voo.classUp("card-slot", "d0-card-content");
    } else if (view === "content_panel") {
      // html/views.rb:42-45 before(:content_panel):
      // prepare_content_slot + class_up "card-slot", "card"
      voo.classUp("card-slot", "d0-card-content");
      voo.classUp("card-slot", "card");
    } else if (view === "content_with_title") {
      // html/views.rb:34 before(:content_with_title): prepare_content_slot
      voo.classUp("card-slot", "d0-card-content");
    } else if (view === "conflict") {
      // html/error.rb:39 class_up "card-slot", "error-view"
      voo.classUp("card-slot", "error-view");
    } else if (view === "bar") {
      // the gate is set/rule SET membership (the card's right part is
      // a Setting), not the rule? predicate — bar_view.rb's set covers the
      // 2-part rule shape (`*all+*autoname`) exactly like the 3-part
      // preference shape, and the oracle pins `_rule-item` on both.
      if (this.engine.cardMatchesRuleSet?.(this.card) ?? false) {
        // bar_view.rb:10 class_up "card-slot", "_rule-item #{category_classes}"
        const categories = this.ruleSetCategories(this.rightPartCodenameForRule(), this.card);
        const classExtra = ["_rule-item", ...categories.map((c) => `_category-${c}`)].join(" ");
        voo.classUp("card-slot", classExtra);
      }
      if (
        this.cardTypeCodename === "search_type" ||
        this.cardTypeCodename === "set" ||
        this.card.typeName === "Search"
      ) {
        // search_views.rb:36 voo.hide :one_line_content. Set cards carry it
        // too: card-mod-rules set/type/set.rb includes Type::SearchType.
        voo.hide("one_line_content");
      }
    }
  }

  /** The type card's codename (e.g. "search_type", "set", "list"). Read
   *  through the engine's codename registry — zero-query (the cold
   *  render folds the codehash into the prefetch batch). */
  private get cardTypeCodename(): string | undefined {
    const id = this.card.record.typeId;
    if (id === undefined) return undefined;
    return this.engine.peekCodenameById?.(id);
  }

  /** card.rule? predicate (lib/card/rule/all.rb:32-51): the card is a rule
   *  when its right part is a setting (type=SettingID) and the left part
   *  is a set (type=SetID), for the 3-part shape "SetTypeName+Setting+Setting". */
  private cardIsRule(): boolean {
    const card = this.card;
    if (!card.name.isCompound) return false;
    if (this.engine === undefined) return false;
    return this.engine.cardIsRule?.(card) ?? false;
  }

  /** The right part's setting codename (e.g. "default", "head"). The
   *  card-mod-rules setting card has codename = the bare name (no leading "*"). */
  private rightPartCodenameForRule(): string | undefined {
    const card = this.card;
    if (!card.name.isCompound) return undefined;
    const rightKey = card.name.rightName?.key;
    if (rightKey === undefined) return undefined;
    // The right key may include leading "*" (canonical key of "*default"
    // is "*default" in this port); the codename is the bare form (no "*").
    const bare = rightKey.startsWith("*") ? rightKey.slice(1) : rightKey;
    // Look up the right card via the fetcher's prepared map (cached).
    // STARRED KEY FIRST: for a rule name the right part IS the *setting
    // card, whose canonical key keeps the star — the bare form can
    // collide with an UNRELATED card that merely shares the key (the
    // "layout" key resolves the Layout CARDTYPE once the shared prepared
    // map covers it, codename layout_type, and the rule item then loses
    // _category-recent). Which cards sit in the prepared map depends on
    // what earlier entries in the same process prefetched, so the
    // bare-first order was also a cross-entry nondeterminism. The bare
    // fallback stays for star-less right parts.
    const right =
      this.engine.fetchRenderCard(rightKey) ??
      this.engine.fetchRenderCard(bare);
    if (right === undefined) return undefined;
    return right.record.codename ?? bare;
  }

  /** The fixed Card::Setting.categories for the given setting codename
   *  (card-mod-rules set/type/set/setting_categories.rb:9-15). The
   *  category order (all, field, recent, common) is the byte order the
   *  captured oracle pins — `card.rule_set.categories(setting).map {
   *  ... }` in Ruby returns them in declaration order.
   *
   *  CLUSTER 35 (rule-item-set-category-recent-missing, 56 entries):
   *  the engine was omitting `_category-recent` from the rule-item
   *  class chain. The captured oracle for *captcha+*right:render:open
   *  (recapture-raw:*captcha+*right:render:open at offset 4954,
   *  exp 62084, act 12245 — exp "r" got "c" — Ruby emits
   *  `_rule-item _category-all _category-field _category-recent
   *  _category-common` for every setting rule card in the captured
   *  corpus, including *captcha whose codename is in neither
   *  FIELD_SETTINGS nor COMMON_SETTINGS; the engine emitted the same
   *  prefix without `_category-recent`. Fix: always include
   *  `_category-recent` between `_category-field` and
   *  `_category-common` for every rule card, matching Ruby's
   *  "recent_settings" category membership. Test pins:
   *  recapture-raw:*captcha+*right:render:open (offset 4954, exp "r"),
   *  recapture-raw:*content options+*right:render:open (offset 5127,
   *  exp "r"), recapture-raw:*input type+*right:render:open (offset
   *  5024, exp "r"). */
  /** The Card::Setting categories for the given setting codename — the
   *  faithful port of card-mod-rules set/type/set/setting_categories.rb:9-15
   *  `categories(setting)`:
   *      result = [:all]
   *      result += %i[field recent common].select { |cat|
   *        category_settings(cat)&.include? setting }
   *  with the category memberships:
   *  - field_related_settings = field_settings (setting_categories.rb:52-54:
   *    default, help, input_type, content_options, content_option_view)
   *  - recent_settings = Card[:recent_settings].item_cards — the *recent
   *    settings CARD's pointer items (corpus row 23808, content
   *    "*read *structure *script *content options *input type *default
   *    *layout *help *thanks *update *guide *head *follow *style
   *    *content option view *create *follow fields *delete *captcha
   *    *table of contents *comment" — note AUTONAME and the on_* event
   *    settings are NOT members, which is why the oracle's *all+*autoname
   *    bar pins `_category-all` alone); the `& visible_setting_codenames`
   *    intersection is implicit (only visible settings render here)
   *  - COMMON_SETTINGS = create, read, update, delete, structure, default,
   *    guide (setting_categories.rb:8)
   *
   *  R16 correction of the CLUSTER 35 "always include _category-recent"
   *  overfix: recent is a MEMBERSHIP list, not a constant — the blanket
   *  push made every autoname/on_* bar carry `_category-recent` the oracle
   *  never emits (the *captcha+*right:render:content byte-diff family:
   *  exp `_category-all" data-card-name=...` got `_category-all
   *  _category-recent" ...`). CLUSTER 35's original three pins re-verified:
   *  their settings (captcha et al.) ARE recent members, so those pins
   *  keep their bytes under the membership form.
   *
   *  Correction to the earlier static list: recent is now the FULL
   *  Ruby arm — items ∩ registered ∩ restriction (recentCategoryApplies) —
   *  read from the deck's *recent settings card; the static RECENT_SETTINGS
   *  const is retired. CLUSTER 35's pins keep their bytes (captcha et al.
   *  are recent members under the full arm); the R16 membership correction
   *  stands (autoname/on_* are not items). */
  private ruleSetCategories(settingCodename: string | undefined, ruleCard: RenderCard): string[] {
    if (settingCodename === undefined) return [];
    const result = ["all"];
    if (FIELD_SETTINGS.has(settingCodename)) result.push("field");
    if (this.recentCategoryApplies(settingCodename, ruleCard)) result.push("recent");
    if (COMMON_SETTINGS.has(settingCodename)) result.push("common");
    return result;
  }

  /** setting_categories.rb:64-67 recent_settings:
   *  `Card[:recent_settings].item_cards.map(&:codename).compact` — the
   *  *recent settings POINTER's items (DECK DATA, not code). The item
   *  cards' codenames equal the underscored item names for every canonical
   *  setting name (all 21 raw-corpus row-23808 items: "*content options" ->
   *  content_options, "*follow fields" -> follow_fields), so the derivation
   *  reads the card's db_content lines directly; an absent card yields the
   *  empty membership (Ruby's nil fetch carries no items), never an error. */
  private recentSettingCodenames(): Set<string> {
    const recentCard = this.engine.fetchRenderCard("*recent settings");
    const content =
      recentCard === undefined || recentCard.unknown === true
        ? undefined
        : recentCard.record.dbContent;
    const items = new Set<string>();
    for (const line of (content ?? "").split("\n")) {
      const item = line.trim();
      if (item === "") continue;
      items.add(item.replace(/^\*/, "").toLowerCase().replace(/ +/g, "_"));
    }
    return items;
  }

  /** setting_categories.rb:9-15 categories' recent arm, in full:
   *  recent = (recent-card items) ∩ (REGISTERED settings — set/type/set.rb
   *  :73-85 visible_setting_codenames is Card::Setting.groups, the
   *  setting_opts registrations) ∩ (unrestricted ∨ the set prototype's type
   *  codename ∈ the registration's restricted_to_type — setting.rb:74-77
   *  applies_to_cardtype). Oracle-derived verification (845+ rule-item bars
   *  swept from the page-surface oracle bytes, 2026-09-30):
   *  *table of contents / *comment are registered NOWHERE in the gems (no
   *  set/self/*.rb) and pin `_category-all` alone (Number page: 0 YES /
   *  4 NO); content_options / content_option_view are restricted to
   *  %i[list pointer session] (card-mod-list set/self/content_options.rb:2,
   *  content_option_view.rb:2 — the only restricted registrations), so they
   *  carry recent exactly on list-family-prototype sets (*style+*right YES —
   *  its *default rule card is List-typed; *all NO — BasicCs-typed). */
  private recentCategoryApplies(settingCodename: string, ruleCard: RenderCard): boolean {
    if (!this.recentSettingCodenames().has(settingCodename)) return false;
    if (!REGISTERED_SETTING_CODENAMES.has(settingCodename)) return false;
    const restrictedTo = RESTRICTED_TO_TYPE.get(settingCodename);
    if (restrictedTo === undefined) return true;
    const prototypeCode = this.engine.ruleSetPrototypeTypeCode?.(ruleCard);
    return prototypeCode !== undefined && restrictedTo.has(prototypeCode);
  }

  // -------------------------------------------------------------------------
  // format/nest.rb - the inclusion machinery
  // -------------------------------------------------------------------------

  /**
   * Nest#prepare: resolve the reference against this format's context card,
   * default the view (implicit_nest_view), apply the home_view rule
   * (nest.rb#prepare_view_and_opts!: `view_opts[:home_view] ||=
   * %i[closed edit].member?(view) ? :open : view`), then render in a
   * subformat with fresh voo state.
   */
  nest(nest: ParsedNest, authoredText?: string): string {
    if (nest.comment !== undefined) return nest.comment; // content.rb#content_nest passthrough
    // nesting.rb:12-13 `return "" if nest_invisible?` — the elision gate
    // runs before ANY nest processing (no fetch, no view resolution): once
    // this format's rendered-nest total exceeds max_char_count (200,
    // railtie.rb:16), every further nest it renders is the empty string.
    if (this.nestInvisible()) return "";
    // format/nest/fetch.rb:10-13 fetch_card: `when "_", "_self" then
    // format.context_card` — the BARE self-reference fetches the CARD's
    // @context_card (contextual_content.rb:1-3 `@context_card || self`),
    // NOT a name-absolutized target. This is the seam the Abstract::
    // TestContext with_context wrapper drives (card-mod-email): the
    // notification templates' `{{_|...}}` marks render the CONTEXT card's
    // views. Any other relative form absolutizes against the card as before.
    const rawNestName = nest.name.trim();
    const contextTarget =
      rawNestName === "_" || rawNestName === "_self"
        ? (this.contextCard ?? this.card)
        : undefined;
    const targetName = contextTarget !== undefined ? contextTarget.name.s : this.resolveNestName(nest.name);
    // Blank reference (`{{}}`): fetch.rb#retrieve_existing skips blank marks
    // (`return unless mark.present?`), but the fetch still carries `new:`
    // opts (format/nest/fetch.rb#new_card), so fetch/store.rb#new_for_cache
    // instantiates `Card.new name: ""` and fetch/results.rb#new_result_card
    // RETURNS it (`card if new_opts || card.known?` - new_opts present).
    // The blank nest therefore renders a NEW-CARD SUBFORMAT exactly like any
    // other fetch miss, and the outcome is decided by the VIEW's
    // `unknown:` config (view/permission.rb:19-23 `alter_unknown || denial`):
    //
    //   - a view WITHOUT `unknown: true` substitutes :unknown
    //     (format/error.rb:23 `setting_view || :unknown`), whose createable
    //     gate renders "" for Anonymous - the plain-card shape (corpus
    //     10488 `June Pemberton+Menu`, blank `{{}}` -> empty on content/open;
    //     re-proven LIVE 2026-10-03: example.com/June_Pemberton+Menu
    //     ?view=content|open carry zero denial spans, stored content still
    //     embeds the blank nest).
    //   - a view WITH `unknown: true` lets alter_unknown answer nil and the
    //     DENIAL check still runs; the new card's read verdict denies
    //     (its *default-template type is BasicCs, whose BasicCs+*type+*read
    //     rule 22283 grants "Anyone Signed In" - Anonymous denied; the same
    //     seated verdict the trashed *foot template_nest span pins,
    //     render.ts#seatUnknownRefReadVerdicts population 1) and the nest
    //     renders Ruby's 76-byte quiet denial span - the template-card shape
    //     (corpus 636 `Menu+*right+*default`: is_template? wraps :core in
    //     nest_mode :template, modal_nest_view substitutes :template_nest,
    //     template_nest.rb:2 `unknown: true`). Re-proven LIVE 2026-10-03:
    //     example.com/Menu+*right+*default?view=content renders the
    //     span exactly at the blank-nest position.
    //
    // The earlier "blank renders the nil-card empty result" branch (and its
    // "636 is the anomalous capture" reading) is superseded by that live
    // truth: both shapes are one machinery, split by view unknown-capability,
    // never by a blanket empty-string return.
    const isBlankReference = targetName.trim() === "";
    const target = isBlankReference
      ? undefined // retrieve.rb:7 skips blank marks - straight to the new card
      : (contextTarget ?? this.engine.fetchRenderCard(targetName));
    // format/nest/fetch.rb#new_card: a fetch miss does NOT raise - `Card.fetch
    // cardish, new: new_card_args` returns a NEW unknown card (results.rb:
    // `card if new_opts || card.known?`). Unknown cards need no queries (they
    // do not exist); the view renders from the miss. Round 9: the new card
    // carries the *default rule's type (newCardDefaultType - the
    // type_id_from_template chain), so its slot renders the class chain and
    // data-card-type-* attributes the captured nest-miss bytes show.
    // leftTypeName feeds the *type plus right set-key anchor from the
    // referencing (parent) card's type - the child IS a field of this card.
    const card =
      target ??
      this.buildUnknownNestCard(
        targetName,
        this.engine,
        this.card.typeName,
        nest.options.extra["type"],
      );
    // fetch.rb:47-48 new_card_args: `args[:type] = view_opts[:type]`
    // — an explicit `| type:X ` opt names the NEW card's type. An ID-LESS
    // target is the fetcher's fabricated new-card record (the FetchEngine
    // emulates Card.fetch new: {} on a miss, including the *default
    // template's type) and cannot know the nest's opt — re-type it here
    // when the type card resolves warm (explicit opts beat the template,
    // Card.new precedence). Pinned: the personal-page content/open capture (shard 40)
    // nests `{{+agree | type:Toggle }}` — the oracle slot carries
    // data-card-type-id="51" data-card-type-name="Toggle", the
    // TYPE-toggle ... TYPE_PLUS_RIGHT-sign_up-agree set-key chain, and the
    // toggle core body "no"; the engine pinned RichText (the template's
    // type) and an empty rich-text body.
    const nestTypeOpt = nest.options.extra["type"];
    const effectiveCard =
      target !== undefined &&
      target.id === undefined &&
      target.record.isNew === true &&
      !(this.engine.cardMatchesRuleSet?.(target) ?? false)
        ? this.withNewCardContext(target, typeof nestTypeOpt === "string" ? nestTypeOpt : undefined)
        : card;
    // format/nest.rb:22 `prepare`: `@view = subformat.modal_nest_view @view
    // if @override`. Ruby computes it on the SUBformat (mode.rb:44 "the
    // subformat always has the same nest_mode as its parent format"), so
    // the mode consulted here is this format's - the same value the sub
    // inherits one line later. Only nest_mode can substitute a view; a
    // nest's own `| view:X ` opt is the input to that substitution, not a
    // bypass of it, which is why {{_main|titled}} under :template mode
    // still renders :template_nest.
    const requestedView = normalizeView(nest.options.view ?? this.implicitNestView());
    // The compact arm's known? check (mode.rb:73) reads the SUBFORMAT's
    // card — the nest target — because Ruby runs modal_nest_view on the
    // subformat (nest.rb:21); the mode it consults is this format's.
    const view = this.modalNestView(requestedView, effectiveCard);
    // mode.rb:64's :blank substitute renders NOTHING — the graded board
    // fieldset carries no slot at all for the {{+tags|link}} nest whose
    // :link view hides in edit mode (no wrap, no slot div, no bytes — the
    // nest join's separator only).
    if (view === "blank") return "";
    if (ENGINE_NEST_TRACE) {
      console.log("ENGINE-NEST", JSON.stringify({ requested: requestedView, view, card: effectiveCard?.name?.s, unknown: effectiveCard?.unknown, nestName: nest.name }));
    }
    const viewOpts: Record<string, unknown> = {
      // nest_name = the AUTHORED reference through DeckoName.parse —
      // verbatim for authored/relative forms (card-mod-content
      // lib/card/content/chunk/nest.rb:23 keeps the authored string:
      // "+Source Title" stays relative, underscores/casing untouched —
      // raw recapture oracle id 9625; live wire "+tag"/"+related"/
      // "Su$tainability"/"Conflict_Done_Well+class_schedule"), codename-
      // RESOLVED for mark forms: DeckoName.parse resolves ":codename"
      // marks through the name environment at parse time ({{:footer}} →
      // "*footer", the R16 page-surface pin; junction parts too — the Role
      // template card 322's {{+:description|lead}} pins
      // nest_name "+description" in every Role page oracle: the right
      // part is the codename "description" → card 146's name, and the
      // RELATIVE junction form is kept — the previous
      // effectiveCard.name.s rewrite here emitted the ABSOLUTE form for
      // that shape). That is Ruby's fetch.rb#new_card:31 rewrite
      // `view_opts[:nest_name] = Card::Name[cardish].to_s` with cardish's
      // marks already resolved by the fetch: the resolved name is what
      // lands in the slot JSON. (Parse safety: resolveNestName above
      // already parsed this same string, so a throwing mark never
      // reaches this line.) The resolved name still drives data-card-name
      // (the slot's own attribute; id 9625 shows the absolute form
      // there). card-mod-tabs.ts#chunkRefChunks already follows this
      // contract for its chunk walk.
      nest_name: DeckoName.parse(nest.name).s,
      // Ruby's chunk path (chunk/nest.rb:23) sets nest_syntax = the
      // authored bracket text in @options. Ruby's programmatic nest path
      // omits nest_syntax entirely. The TS chunk parser mirrors the
      // chunk path (nest-syntax.ts: interpretNest sets
      // ParsedNest.chunkNestSyntax = stripped); programmatic nests don't
      // set it. Gate the slot JSON on the field's presence.
      ...(nest.chunkNestSyntax !== undefined
        ? { nest_syntax: nest.chunkNestSyntax }
        : {}),
      // nest.rb:24 `view_opts[:home_view] ||= %i[closed edit].member?(view)
      // ? :open : view` runs inside prepare_view_and_opts!, i.e. BEFORE
      // prepare substitutes modal_nest_view - so the rule reads the
      // REQUESTED view, not the substituted one.
      ...(requestedView === "closed" || requestedView === "edit"
        ? { home_view: "open" }
        : { home_view: requestedView }),
      ...this.nestOptionEntries(nest.options),
    };
    const sub = new RenderFormat(effectiveCard, this.engine, {
      parent: this,
      maxDepth: this.maxDepth,
      // Page-path config propagates (Ruby's config is render-global): the
      // quiet nested-error semantics. The default nest view needs no
      // threading — it is engine state (defaultNestView).
      nestQuietErrors: this.nestQuietErrors,
    });
    // format/error.rb:33-40 monitor_depth runs in the SUBFORMAT's ok_view
    // (view.rb:86), BEFORE its wrap_and_render rescue — outside the nested
    // view's own quiet rescue — so the raise must skip THIS nest's catch and
    // propagate to the enclosing view render's rescue boundary (the
    // renderDelegated seam the titled/content body renders go through):
    // there the nesting format's depth is > 0, so the quiet span replaces
    // that WHOLE view — the synthetic-v2 oracle: Chain 20's body carries
    // ONLY the render-error span (its own paragraph is discarded with the
    // rescued view), 2026-10-09. Rescuing inside this catch (or letting the
    // rethrow die on a lane without quiet errors) is the seconds corpus's
    // TooDeep family: the bare view lane now passes nestQuietErrors like
    // the page lane (render.ts). THE BOUNDARY-GRANULARITY QUESTION (the
    // live v1 oracle vs this v2 pin — the ruling-1 observation,
    // tmp/int/depth-probe/: the live /Chain_01 page renders Chain 20's
    // titled shell + header with the span as the BODY, and the recorded
    // core:Chain 01 pins the span inside Chain 20's core slot — the two
    // fixtures pin OPPOSITE granularities; the reconciliation is the
    // follow-up lane's) is recorded in full in the §10.28 receipt.
    if (sub.depth >= this.maxDepth) {
      throw new TooDeepError();
    }
    // Production render-error semantics (error.rb rescue_view quiet branch,
    // reached through format/render.rb wrap_and_render's rescue): a nested
    // view's error renders the quiet span instead of propagating. UserError
    // messages render verbatim (error.rb rendering_error); other errors use
    // the lib_error_rendering locale line. The focal (main) render never
    // reaches this catch — it runs on the root format, not through nest().
    // The catch's span still feeds count_chars (nesting.rb:17): Ruby's
    // subformat.render returns the rescued span INSIDE the block, so the
    // quiet bytes accumulate like any other nest render; a rethrow
    // (nestQuietErrors off) bypasses count_chars exactly as a Ruby
    // exception bypasses it.
    let rendered: string;
    try {
      // The authored chunk text rides the sub-render's opts for the views
      // whose OWN captured answer is posture-dependent (subedits: the
      // corpus's top-level op pins "" while the follower-email nest pins
      // the authored syntax — and the composed tree's nest subformat
      // carries no voo.parent to discriminate, the miscpins structured-form
      // round's voo model). Chunk::Abstract#result
      // (content/chunk/abstract.rb): `burn_read || @process_chunk ||
      // @processed || @text` — the chunk's answer IS the authored text
      // when the view produced nil; the views that model Ruby's nil answer
      // read the opt and return it verbatim.
      const raw = sub.renderView(
        view,
        authoredText !== undefined ? { ...viewOpts, authoredNestText: authoredText } : viewOpts,
      );
      if (raw === null && authoredText !== undefined) {
        // Chunk::Abstract#result (content/chunk/abstract.rb): `burn_read ||
        // @process_chunk || @processed || @text` — a chunk-level nest whose
        // view body answered Ruby nil keeps its AUTHORED SYNTAX (@text).
        // The authored text bypasses count_chars — Ruby's count rides the
        // subformat's render, which produced nil.
        return authoredText;
      }
      rendered = str(raw);
    } catch (error) {
      if (!this.nestQuietErrors) throw error;
      rendered = quietRenderError(error, card, view, this);
    }
    return this.countNestChars(rendered);
  }

  /**
   * `render_<view>` FROM INSIDE A VIEW BODY — Ruby's
   * card/lib/card/format/method_delegation.rb:41-47 (`method_missing` ->
   * `api_render` :14-18 -> `render!`), which opens its OWN
   * `wrap_and_render` rescue scope (card/lib/card/format/render.rb:7-14,
   * :96-100) on the SAME format object.
   *
   * WHY THIS IS A SEPARATE SEAM FROM nest()'s catch. Every `render!` in
   * Ruby is independently rescued, so an error raised INSIDE a delegated
   * render becomes that render's RETURN VALUE and the enclosing view body
   * — including its `wrap` — completes normally. Two consequences the port
   * was missing, both visible in the frozen record:
   *
   *  1. the enclosing `wrap` still emits the card-slot div. html/views.rb:10-18
   *     `view :content do wrap do [render_menu(...), render_core, ...] end end`
   *     wraps the rescued span, so a `+Date` nest that cannot parse its
   *     content still renders its `content-view` slot.
   *  2. the error is labelled with the DELEGATED view, not the wrapper's.
   *     format/error.rb:80-86 `rendering_error exception, view` interpolates
   *     the view `wrap_and_render` was called with, and html/error.rb:99-101
   *     wraps that text in the render-error span. `render_core` therefore
   *     reports "(core view)" — the corpus bytes for card 34322
   *     `Maturana ...+Date` and its three siblings.
   *
   * The engine raised both facts away: the dispatch seam
   * (src/card/render.ts:1579-1589, the Date::Error / Search BadQuery raise)
   * has no rescue of its own, so the throw escaped `contentView` entirely,
   * `slotWrap` never ran, and nest()'s catch produced the unwrapped span
   * labelled "(content view)".
   *
   * LOUD vs QUIET. error.rb:65-67 `loud_error?` is `focal? ||
   * config.raise_all_rendering_errors`; nesting/subformat.rb:41-43 `focal?`
   * is `depth.zero?`; cardio/railtie.rb:38 sets raise_all_rendering_errors
   * false. A delegated render on a NESTED format is therefore quiet, and on
   * a depth-0 format it re-raises (error.rb:69-73 `loud_error` -> `raise e`)
   * — which is why the corpus pins a bare `format.render(:content)` of a
   * bad-content Date card as CAPTURE_ERROR, not as a page.
   *
   * UnsupportedViewError keeps its own message in both scopes
   * (error.rb:52-54 `unsupported_view_error_message`), so it is passed
   * through verbatim by the same helper nest() uses.
   */
  renderDelegated(
    view: string,
    opts: Record<string, unknown> = {},
    optional: unknown = "show",
  ): string {
    try {
      return str(this.renderView(view, opts, optional));
    } catch (error) {
      // error.rb:65-67 loud_error?: `focal? || raise_all_rendering_errors`.
      // The html format's focal? is show_layout? ? main? : depth.zero?
      // (html_format.rb:16-18) - in the serving posture (layouts shown, the
      // bare render main!s nothing) the html root is NOT focal, so its
      // delegated renders are QUIET too and the span is the delegation's
      // value (the oracle's email_page: the span lands inside the
      // :email_document wrapper, not at the root). Base formats keep the
      // depth-zero focal arm; the page's main!-ed format is focal and
      // re-raises as before. The config half of the disjunction makes every
      // rescue loud (the development posture the mod-port raise contracts
      // pin).
      const focal = this.formatName === "html" ? this.isMain : this.depth === 0;
      if (focal || allRenderingErrorsRaise()) throw error; // error.rb:69-73 loud_error re-raises
      return quietRenderError(error, this.card, view, this);
    }
  }

  /**
   * nesting.rb:52-54 `nest_invisible?`: `nest_mode == :compact &&
   * @char_count && (@char_count > max_char_count)`. The `@char_count &&`
   * guard is load-bearing — the count is nil until the FIRST compact-mode
   * nest render completes, so the first nest renders at full length
   * however long it is (nesting.rb:56-63 accumulates only after a render
   * returns); the elision suppresses every SUBSEQUENT nest, it never
   * truncates the one being rendered.
   */
  private nestInvisible(): boolean {
    return (
      this.nestMode === "compact" &&
      this.charCount !== undefined &&
      this.charCount > MAX_NEST_CHAR_COUNT
    );
  }

  /**
   * nesting.rb:56-63 `count_chars`: wrap the nest render's result —
   * accumulate `result.length` into this format's @char_count when the
   * format is in compact mode and the result is truthy (an empty-string
   * render adds nothing), then return the result unchanged. Runs on the
   * format whose nest() call produced the render, so a compact parent
   * accumulates its direct nests while a nested subformat accumulates its
   * own (Ruby ivars do not cross the subformat boundary).
   */
  private countNestChars(result: string): string {
    if (this.nestMode !== "compact" || !result) return result;
    this.charCount = (this.charCount ?? 0) + result.length;
    return result;
  }

  /**
   * permission.rb:20-22 `altered_view`'s first line — `return if
   * skip_check?` — gating the UNKNOWN substitution exactly as it gates
   * the denial branch: `normalized_options[:skip_perms] ||
   * view_perms == :none` (permission.rb:25-27). Resolution sources match
   * viewPermissionDenial's (resolveViewPerms — the same registry the
   * read-permission wave's denial gate reads).
   */
  private unknownGateSkip(view: string, opts: Record<string, unknown>): boolean {
    if (renderOptSkipPerms(opts)) return true;
    return resolveViewPerms(view).check === false;
  }

  /** fetch.rb:38-49 new_card_args: shape a FABRICATED new-card
   *  record (the FetchEngine's Card.fetch new: {} emulation — id-less,
   *  *default-template typed) the way the nest fetch would:
   *  `args[:type] = view_opts[:type]` — an explicit `| type:X ` opt names
   *  the new card's TYPE (the type card must resolve warm;
   *  enrichNestTypeOptTargets pre-warms the corpus's two shapes; Card.fetch
   *  new: {} does NOT apply the *default template CONTENT — the fabricated
   *  record carries the template bytes and the toggle core of a truthy
   *  template would render "yes" where the oracle renders "no" for the
   *  empty new card); and `.merge(new_supercard_args)` — the new card is
   *  created AS A SUBCARD of the context card, so its set-pattern chain
   *  carries TYPE_PLUS_RIGHT-<supercard type>-<tag> (the safeSetKeys
   *  rebuild with leftTypeName; the fabricated record's own set keys are
   *  parentless). Pins: the personal page's +agree slot (data-card-type-id="51",
   *  TYPE-toggle chain, body "no"); RVW open's +working doc 02 item slot
   *  (TYPE_PLUS_RIGHT-list-working_doc_02 — RVW is List-typed; the
   *  fabricated shape pinned rich_text). */
  /** Card.fetch(type_card_name) for the explicit nest type opt, with the
   *  codename-registry fallback for type cards the cache-only fetch misses
   *  (the Image type card in the image01 nest-miss phantom). */
  private resolveExplicitTypeCard(name: string): RenderCard | undefined {
    const warmed = this.engine.fetchRenderCard(name);
    if (warmed !== undefined && warmed.id !== undefined) return warmed;
    const id = this.engine.peekIdByCodename?.(name);
    if (id === undefined) return undefined;
    const typeName = this.engine.peekRegisteredNameForId?.(id);
    const record = {
      id,
      name: typeName ?? name,
      codename: name,
      typeId: this.engine.peekIdByCodename?.("cardtype"),
    };
    return {
      record: record as never,
      name: (typeName ?? name) as never,
      key: name,
      typeName: typeName ?? name,
      typeId: id,
      typeCode: name,
      id,
      dbContent: "",
      setKeys: "",
    } as unknown as RenderCard;
  }

  private withNewCardContext(target: RenderCard, nestTypeOpt?: string): RenderCard {
    // The cache-only fetchRenderCard misses when the TYPE CARD was never
    // warmed (the image01 nest-miss phantom: the Image type card is not in
    // the prepared map). Ruby's Card.fetch(name, new: { type: X }) resolves
    // the type through the codename registry — the port's peek pair is the
    // same sync surface (Card::Codename.id + Lexicon.name).
    const explicitType =
      nestTypeOpt !== undefined ? this.resolveExplicitTypeCard(nestTypeOpt) : undefined;
    const typeId = explicitType !== undefined && explicitType.id !== undefined ? explicitType.id : target.typeId;
    const typeName =
      explicitType !== undefined && explicitType.id !== undefined
        ? explicitType.name.s // the TYPE CARD's name; its .typeName is the cardtype of the cardtype
        : target.typeName;
    const typeCode =
      explicitType !== undefined && explicitType.id !== undefined
        ? (explicitType.record.codename ?? undefined)
        : target.typeCode;
    // A TOGGLE-typed fabricated record must not carry the virtual
    // resolution's *structure template: the toggle core (views.ts
    // formatToggleCore) formats any truthy string as "yes", so the carried
    // template rendered "yes" where the oracle renders "no" — the p21
    // Group A regression (98 entries: every Sign up person page's `+agree
    // | type:Toggle` slot, corpus rules agree+*right+*structure 28589
    // template / agree+*right+*default 17695 content '0', zero +agree
    // rows; probe-proven). The
    // oracle byte is the toggle core of the *default rule's CONTENT
    // (content/all.rb:17-19 standard_content's new-card branch:
    // default_content = the *default template's db_content; '0' -> "no").
    // The gate is the toggle core's own dispatch condition
    // (typeCode "toggle" / typeName "Toggle") because the hazard is
    // precisely a truthy carried template feeding formatToggleCore —
    // non-toggle types keep the template (the BWjournal +Body structured
    // virtual bodies; structured-child-typed-view.test.ts guards them).
    // No *default rule / unloaded universe degrades to "" — the toggle
    // core of "" is "no" (formatToggleCore), matching standard_content's
    // empty tail.
    const toggleTyped = typeCode === "toggle" || typeName === "Toggle";
    const rebuiltSetKeys = safeSetKeys({
        name: target.name,
        typeId,
        typeName,
        leftTypeName: this.leftTypeNameFor(target.name),
        isNew: true,
      });
    const out = {
      ...target,
      // content/all.rb:8-10 — an id-less warm record with content is a
      // VIRTUAL resolution (states.rb:44-50 virtual?: compound + applicable
      // *structure rule; fetch.ts:388-395 sets dbContent = the rule
      // template). Wiping it here rendered every structured virtual nest
      // (an earlier class's BWjournal +Body titled slot) with an empty
      // body — the seven mini_bar children of Body+*right+*structure
      // vanished with the template. A genuine new-card emulation carries
      // dbContent "" so this keeps byte-identity for it too. Toggle-typed
      // records substitute the *default rule content instead (the block
      // comment above).
      dbContent: toggleTyped
        ? (this.engine.newCardDefaultContent?.(target.name) ?? "")
        : (target.dbContent ?? ""),
      typeId,
      typeName,
      typeCode,
      setKeys: rebuiltSetKeys,
    };
    return out;
  }

  /** The TYPE_PLUS_RIGHT anchor for a NEW compound card: Ruby's pattern
   *  reads the LEFT SIDE's type off the NAME ALGEBRA (superleft.type_name),
   *  not off the nesting format's context card — the RVW open view nests
   *  "RVW+working doc 02" items from INSIDE "RVW+File Storage Area"
   *  (RichText-typed) and the captured slot chain still reads
   *  TYPE_PLUS_RIGHT-list-working_doc_02 (RVW is List). Resolved from the
   *  warm map; an unprepared left falls back to the NEW-CARD DEFAULT type
   *  (see the last return below). */
  /** The codename resolver virtualSearchCqlFor takes, built on the engine's
   *  loaded codename memo (peek): a codename resolves to the KEY of the card
   *  currently holding it, which is how Ruby's Right pattern matches the
   *  family's right part (pattern/base.rb:21-29 keys the pattern on the
   *  right card's codename). Delegates to the module-level builder. */
  private virtualSearchCodenameResolver():
    | ((codename: string) => string | undefined)
    | undefined {
    return virtualSearchCodenameResolverFor(this.engine);
  }

  private leftTypeNameFor(name: DeckoName): string | undefined {
    if (!name.isCompound) return this.card.typeName;
    const leftName = name.leftName;
    if (leftName === undefined) return this.card.typeName;
    const left = this.engine.fetchRenderCard(leftName.s);
    if (left !== undefined && left.typeName !== undefined) return left.typeName;
    // The left is not in the warm map (or carries no type yet): resolve
    // through the engine's loaded *structure universe before the default.
    // Ruby's left_type reads the LEFT CARD's type — for a left
    // that is itself virtual ("PlainText+*type" -> Set via the
    // *type+*right+*structure template) the context card's type is simply
    // the wrong card's type (the census page-22 defect:
    // TYPE_PLUS_RIGHT-cardtype-by_name over the oracle's
    // TYPE_PLUS_RIGHT-set-by_name).
    const virtualLeftType = this.engine.virtualLeftTypeName?.(leftName);
    if (virtualLeftType !== undefined) return virtualLeftType;
    // THE LAST FALLBACK IS NOT THE CONTEXT CARD — this is the cluster-6
    // fix. card/lib/card/set/pattern/class_methods.rb:59-71 is the whole
    // rule:
    //
    //     def left_type card
    //       card.superleft&.type_name || quick_type(card.name.left_name)
    //     end
    //     def quick_type name
    //       if name.present?
    //         card = Card.fetch name, skip_modules: true, new: {}
    //         card.include_set_modules if card.new? && name.to_name.compound?
    //         card&.type_name
    //       else
    //         "RichText"
    //       end
    //     end
    //
    // The NESTING CONTEXT'S TYPE APPEARS NOWHERE IN IT. A left that is not
    // a stored card is a NEW card (quick_type's `new: {}`), and a new
    // compound card carrying no type assignment takes Card's DEFAULT type,
    // RichText — the same default the pattern registry already uses one line
    // away (src/card/set-patterns/registry.ts:186-191,
    // `card.leftTypeName == null ? "RichText" : ...`). These two MUST agree;
    // returning the context card's type made them disagree and produced
    // TYPE_PLUS_RIGHT-list-<tag> wherever a new left was nested from inside
    // a List-typed context card.
    //
    // The removed fallback was correct only when context.type == left.type,
    // which is exactly the RVW case its own block comment describes — and
    // that case is already served by the fetchRenderCard lookup above (RVW
    // IS in the warm map). The pre-fix shape also silently papered over the
    // census page-22 defect that the virtualLeftTypeName line exists to fix.
    //
    // ORACLE PINS — Soma+tic+aikido nested from Soma+tags (a List) reads
    // TYPE_PLUS_RIGHT-rich_text-aikido, and
    // Ellery+Retreats+Shoreline+20180623_0728 reads
    // TYPE_PLUS_RIGHT-rich_text-20180623_0728.
    //
    // THE LAST RESORT IS RUBY'S quick_type BODY, NOT ITS BLANK-NAME
    // BRANCH (W2 restore , $1). class_methods.rb:59-71:
    //
    //     def quick_type name
    //       if name.present?
    //         card = Card.fetch name, skip_modules: true, new: {}
    //         card.include_set_modules if card.new? && name.to_name.compound?
    //         card&.type_name
    //       else
    //         "RichText"
    //       end
    //     end
    //
    // The literal "RichText" fires ONLY when the name is BLANK. A PRESENT
    // name that fetches to nothing still builds `Card.fetch name, new: {}`
    // — a NEW card whose type comes from the *default template chain
    // (type_id_from_template) — which for this deck's simple-name universe
    // is the *all+*default template card (corpus 22281) typed BasicCs.
    // The unconditional "RichText" return skipped that arm and keyed every
    // absent-left junction's TYPE_PLUS_RIGHT anchor off the WRONG type:
    // the password reset / verification email surfaces nest
    // "Decko Bot+*account" (Decko Bot absent from the corpus), and the
    // capture's mini_bar slot chain reads TYPE_PLUS_RIGHT-basic_c-Xaccount
    // — basic_c = BasicCs.underscore.singularize — while the port emitted
    // TYPE_PLUS_RIGHT-rich_text-Xaccount (8 email entries, view+page).
    // The compound-left pins above hold through this arm: quick_type on a
    // compound left ("Soma+tic") resolves the junction *default chain the
    // same way and lands on rich_text there. Engines without the
    // newCardDefaultType hook keep the pre-W2 shape (the "RichText"
    // literal), matching this method's other optional hooks.
    const quickType =
      this.engine.newCardDefaultType?.(leftName) ?? undefined;
    return quickType !== undefined ? quickType.typeName : "RichText";
  }

  /** The new-card a nest fetch miss produces (format/nest/fetch.rb#new_card
   *  -> new_card_args): name = the resolved reference, supercard = the
   *  context card (unmodeled - no write path reads it here), no id/
   *  content. Round 9: the *default rule's type rides along when the
   *  engine resolves one (newCardDefaultType - the type_id_from_template
   *  chain; the raw-oracle pins absent +Discussion children rendering as
   *  RichText-typed slots). The type informs the set keys (TYPE /
   *  RIGHT / TYPE_PLUS_RIGHT tokens the captured class chains show);
   *  dbContent stays "" - Ruby's *default CONTENT is NOT applied at view
   *  time on the captured surface (the oracle's new-child open accordion
   *  body is empty despite the rule's "<p> </p>" template bytes).
   *  The engine records the miss so the closure stays warm without
   *  re-prefetching (fetch.rb has no cache for unknown cards either). */
  /** Card.fetch(name, new: {}) for a name the deck does not carry: the new,
   *  unknown card a nest miss renders (buildUnknownNestCard), for callers
   *  outside the nest path (Abstract::Items#first_card's fetch_item_card). */
  newCardFor(targetName: string): RenderCard {
    return this.buildUnknownNestCard(targetName, this.engine);
  }

  unknownChildCard(targetName: string): RenderCard {
    // A view that nests a field CARD of its own card (`nest image_card,
    // ...`) gets the same new card the nest fetch would build, typed with
    // this card's type as the field's left type.
    return this.buildUnknownNestCard(targetName, this.engine, this.card.typeName, undefined);
  }

  private buildUnknownNestCard(
    targetName: string,
    engine: RenderEngineLike,
    leftTypeName?: string,
    nestTypeOpt?: string,
  ): RenderCard {
    const name = DeckoName.parse(targetName);
    // VirtualSearch family (card-mod-search set/abstract/virtual_search.rb
    // :11-12): a compound name whose right part is one of the 16 family
    // rights is virtual-KNOWN on a fetch miss (`def virtual?; new?; end`,
    // the Right-pattern override of states.rb:44-50), Search-typed
    // (:14-16 assign_type :search_type), carrying the including file’s
    // cql_content as its content. alter_unknown never fires for it
    // (view/permission.rb:37 `return if card.known?`) — the requested view
    // renders normally, which is how the GIV page’s `{{_self+*referred to
    // by}}` nest reaches the search card_list (0 results ->
    // no_search_results) instead of the unknown substitution. The family
    // table + the byte-level contract live in
    // src/card/fetch/virtual-search-cards.ts.
    const virtualSearchCql = virtualSearchCqlFor(name, this.virtualSearchCodenameResolver());
    if (virtualSearchCql !== undefined) {
      const searchTypeId = engine.peekIdByCodename?.("search_type");
      const searchTypeName =
        searchTypeId !== undefined
          ? engine.peekRegisteredNameForId?.(searchTypeId)
          : undefined;
      const record: CardRecord = {
        id: undefined,
        codename: undefined,
        leftId: undefined,
        rightId: undefined,
        typeId: searchTypeId,
        dbContent: virtualSearchCql,
        trash: false,
        creatorId: undefined,
        updaterId: undefined,
        createdAt: undefined,
        updatedAt: undefined,
        currentRevisionId: undefined,
        readRuleClass: undefined,
        readRuleId: undefined,
        referencesExpired: undefined,
        name,
        key: name.key,
        isNew: true,
        fromTrash: false,
        uncacheable: false,
      };
      return {
        record,
        name,
        key: name.key,
        typeName: searchTypeName,
        typeId: searchTypeId,
        typeCode: undefined,
        id: undefined,
        dbContent: virtualSearchCql,
        setKeys: safeSetKeys({
          name,
          typeId: searchTypeId,
          typeName: searchTypeName,
          leftTypeName: this.leftTypeNameFor(name),
          isNew: true, // pattern/all.rb#patterns: new cards drop the SELF token
        }),
        // KNOWN (virtual) — no `unknown` flag: the view pipeline renders the
        // requested view instead of substituting (permission.rb:37).
      };
    }
    // fetch.rb:47-48 new_card_args: `args[:type] = view_opts[:type] if
    // view_opts[:type]` — an explicit `| type:X ` nest opt names the new
    // card's type CARD (Card.fetch name, new: { type: X }; the explicit
    // opt wins over the *default template chain, Card.new's template
    // precedence). R17 evidence: the personal-page content/open capture (shard 40)
    // nests `{{+agree | type:Toggle }}` — no +agree row exists in the
    // corpus, and the oracle's +agree slot carries data-card-type-id="51"
    // data-card-type-name="Toggle" with the TYPE-toggle set-key chain,
    // i.e. the new card is TYPED BY THE OPT, not the *default rule.
    const explicitType =
      nestTypeOpt !== undefined ? engine.fetchRenderCard(nestTypeOpt) : undefined;
    const defaulted =
      explicitType !== undefined && explicitType.id !== undefined
        ? { typeId: explicitType.id, typeName: explicitType.name.s } // the type CARD's name
        : // the *type plus right template candidate anchors on the LEFT
          // part's type (class_methods.rb left_type), as the set keys do
          engine.newCardDefaultType?.(name, this.leftTypeNameFor(name));
    // content/all.rb:17-19 standard_content for a NEW card:
    // `db_content || (new_card? ? default_content : "")` with
    // default_content = template&.db_content (mod/core set/all/content.rb:
    // 26-28) and template = the *default rule card for a nest-miss
    // (templating.rb new_card_template — no *structure rule governs here,
    // else the fetch-level virtual resolution would have produced the card
    // and this builder would not run). The an earlier pass class pins the applied
    // form: the oracle's associative_inquiry-discussion-titled-view body is
    // `<p> </p>\n<p> </p>` — discussion+*right+*default's db_content
    // verbatim. (The Round-9 note below — "the *default CONTENT is not
    // applied at view time" — described the OPEN surface, whose accordion
    // body renders the INNER :content dispatch, itself substituted to
    // :unknown by the same alter_unknown machinery — empty regardless of
    // dbContent. The titled surface reads dbContent directly.)
    const defaultContent = engine.newCardDefaultContent?.(name);
    const record: CardRecord = {
      id: undefined,
      codename: undefined,
      leftId: undefined,
      rightId: undefined,
      typeId: defaulted?.typeId,
      dbContent: undefined,
      trash: false,
      creatorId: undefined,
      updaterId: undefined,
      createdAt: undefined,
      updatedAt: undefined,
      currentRevisionId: undefined,
      readRuleClass: undefined,
      readRuleId: undefined,
      referencesExpired: undefined,
      name,
      key: name.key,
      isNew: true,
      fromTrash: false,
      uncacheable: false,
    };
    engine.reportUnknownCard?.(name.key);
    const setKeys = safeSetKeys({
      name,
      typeId: defaulted?.typeId,
      typeName: defaulted?.typeName,
      // the TYPE_PLUS_RIGHT anchor reads the LEFT SIDE's type off
      // the NAME ALGEBRA (superleft.type_name), not the nesting format's
      // context card — see leftTypeNameFor (RVW open's mini_bar items:
      // TYPE_PLUS_RIGHT-list-working_doc_NN with RVW List-typed).
      leftTypeName: this.leftTypeNameFor(name),
      isNew: true, // pattern/all.rb#patterns: new cards drop the SELF token
    });
    // Abstract::VirtualSet (see VIRTUAL_SET_CODENAMES): a NEW card whose
    // RIGHT SIDE is one of the four virtual-set settings is virtual and
    // therefore KNOWN, so alter_unknown never fires for it.
    //
    // Live shape (corpus 6a44dfdc, page-surface shard 000000, card 105
    // `Role+*type+*default`): the `{{+description}}` nest resolves through
    // card-mod-edit set/all/template_nest.rb:5-8 to
    // `Role+description+*type plus right` — a junction with NO row in the
    // corpus. Ruby renders the :template_link slot for it; the oracle's
    // class list carries RIGHT-Xtype_plu_right for that slot, which IS this
    // membership test. The port substituted :unknown and rendered "" (the
    // `<p></p>` the D2 finding recorded). Sibling card 88
    // `Cardtype+*type+*default`, same nest, where the junction DOES exist
    // (6554) and the same slot renders.
    const rightName = name.rightName;
    const rightCard = rightName === undefined ? undefined : engine.fetchRenderCard(rightName.s);
    const rightCodename = rightCard?.record.codename;
    const virtualSet = rightCodename !== undefined && VIRTUAL_SET_CODENAMES.has(rightCodename);
    // Card#type_code (mod/core set/all/type.rb:30-32) is
    // `Card::Codename[type_id.to_i]` — the codehash answer for the card's
    // RESOLVED type id. A new card Ruby fabricates with `new: { type: X }`
    // (or through the *default template chain — new_card_args sets :type
    // either way) answers its type_code like any stored card; the port's
    // fabricated record must too. Leaving it undefined made every typeCode
    // read on the typed phantom lie while its setKeys claimed the type: the
    // *favicon nest editor's image01 upload-tab phantom carried
    // setKeys "ALL TYPE-image" (so the concrete Type::Image::HtmlViews ->
    // Type::File include dispatched File::HtmlFormat's :input, exactly
    // Ruby's structure) but typeCode undefined, so fileInputView's
    // `typeCode === "image"` mount check failed and the chooser rendered
    // the FILE mount (card[file] / "Add File...") where the oracle pins
    // card[image] / "Add Image..." (file.rb:131-138 humanizes the card's
    // OWN attachment name). peekCodenameById IS Codename[id] (the same
    // sync surface the prepared-card typeCode fixup uses, render.ts).
    const typeCode =
      defaulted?.typeId !== undefined
        ? engine.peekCodenameById?.(defaulted.typeId)
        : undefined;
    if (virtualSet) {
      return {
        record,
        name,
        key: name.key,
        typeName: defaulted?.typeName,
        typeId: defaulted?.typeId,
        typeCode,
        id: undefined,
        dbContent: defaultContent ?? "",
        setKeys,
        // KNOWN (virtual) — no `unknown` flag: permission.rb:37 returns
        // early and the requested view dispatches unaltered.
      };
    }
    return {
      record,
      name,
      key: name.key,
      typeName: defaulted?.typeName,
      typeId: defaulted?.typeId,
      typeCode,
      id: undefined,
      dbContent: defaultContent ?? "",
      setKeys,
      unknown: true,
    };
  }

  /** nest.rb#prepare_view_and_opts! - nest_name/nest_syntax are added
   *  separately above; the remaining shark options ride into the voo.
   *  `unknown` rides too: view/permission.rb:42 reads the voo's :unknown
   *  option (the nest's `unknown:` takes precedence over view configs).
   *  `items` rides too — nest-syntax.ts folds the `item:<view>` opt
   *  into options[:items][:view] exactly like nest.rb:54-57, but the hash
   *  never reached the voo, so item_view_options (item.rb:157-162) could
   *  not answer and every collection list hardcoded the html
   *  default_item_view :bar. The search card_list consumes it (the
   *  `Latest news item|item:titled` nest renders titled items) and the
   *  slot JSON carries it (live blog recorded result: "items":{"view":"titled"}
   *  after home_view — audit A-25). */
  private nestOptionEntries(options: NestOptions): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    if (options.title !== undefined) out["title"] = options.title;
    if (options.size !== undefined) out["size"] = options.size;
    if (options.show !== undefined) out["show"] = options.show;
    if (options.hide !== undefined) out["hide"] = options.hide;
    if (options.items !== undefined) out["items"] = options.items;
    if (options.extra["unknown"] !== undefined) out["unknown"] = options.extra["unknown"];
    // The type opt rides the slot JSON too (the +agree oracle pin:
    // "nest_syntax":"+agree | type:Toggle ",...,"type":"Toggle"}).
    if (options.extra["type"] !== undefined) out["type"] = options.extra["type"];
    // The `filter` opt: a SHARK key (nest-syntax.ts SHARK_KEYS), so it
    // PARSES into options.extra — and was then dropped here, so the view
    // never saw it. Ruby has no equivalent drop: format/nest.rb's
    // `view_opts` IS the voo's option hash (Nest#initialize line 13,
    // prepare_view_and_opts! only ADDS :nest_name and :home_view), so
    // `voo.filter` reads the nest's own `filter:` verbatim.
    //
    // The one reader is card-mod-rules' :bar_setting_list
    // (mod/rules/set/type/set/html_views/rule_lists.rb:11-14):
    //   group = voo.filter&.to_sym || :all
    //   category_setting_list_items(group, :bar, hide: :full_name)
    // -> category_settings(:webpage) -> group_settings(:webpage)
    // (setting_categories.rb:30-45, 58-60) = the :webpage SETTING GROUP
    // (card/lib/card/setting.rb:46-55 `self.groups = %i[templating
    // permission webpage editing event other]`).
    //
    // `Shark+Dashboard` (corpus row 34818, the card whose content is
    // mod/defaults/data/real.yml:59-76) authors BOTH lists:
    //   <blockquote>{{:all|bar_setting_list; filter:webpage}}</blockquote>
    //   <blockquote>{{:all|bar_setting_list; filter:permission}}</blockquote>
    // With the opt dropped, both fell back to :all and each rendered the
    // full 21-setting sorted list — 42 bar nests where the oracle has 4
    // (head, layout, style, script) and 5 (create, read, update, delete,
    // captcha). Shark:page carried +82,590; 33 of those bytes are this.
    if (options.extra["filter"] !== undefined) out["filter"] = options.extra["filter"];
    return out;
  }

  /** nesting.rb#implicit_nest_view -> default_nest_view (html.rb:17-19 ->
   *  Cardio.config.default_html_view; mod/format.rb:2 pins the RAILTIE
   *  default :titled).
   *
   *  The railtie literal is only the FALLBACK: the deck's
   *  `*all+*default html view` rule drives the effective config, and the
   *  MECHANISM (R17 correction — the A-36 rule-driven form was a
   *  mis-mechanism, busted by the R17 oracle probe
   *  tmp/raw-ground-truth/scripts/r17-nest-default-view-probe.rb): Ruby's
   *  html default_nest_view reads PROCESS CONFIG, never a deck rule —
   *  card-mod-format set/all/html.rb:17-19 `def default_nest_view;
   *  Cardio.config.default_html_view; end`. The pinned oracle's two capture
   *  environments carry DIFFERENT config values, and both are byte targets:
   *   - surface V (bare `card.format.render(view)`, the old-capture dev boot):
   *     no override -> the railtie default :titled
   *     (card-mod-format lib/card/mod/format.rb:2). Probe evidence:
   *     Cardio.config.default_html_view == :titled at boot; implicit nests
   *     render titled-view (the personal page's +agree slot, Colleagues +associations,
   *     Source +Source Title). The decks's `*all+*default html view` rule
   *     card (22769, content "content") is DEAD in 0.20.0 — no code reads
   *     it; the earlier "live wire agrees content" justification conflated
   *     the production deck's CONFIG with a deck rule.
   *   - surface P (the page render): the capture applies the production config
   *     `Cardio.config.default_html_view = :content`
   *     (capture-dual-$1page-and-view.rb:369 inside the config block
   *     whose assignment is :344, the capture's production-equivalent
   *     setting #5) — implicit nests render content-view.
   *  The engine models the process config per render surface:
   *  engine.defaultHtmlViewConfig() returns "content" while a page render
   *  is active (render.ts pageConfigActive) and "titled" otherwise. The
   *  202 explicit `view:` nests (skin +Image -> `nest image_card,
   *  view: :content, size: :large`, bootswatch_skin/core.haml:18) are
   *  unaffected — only the implicit resolution changes. */
  defaultNestView(): string {
    return this.engine.defaultHtmlViewConfig?.() ?? "titled";
  }

  /** nesting.rb:46-48 `implicit_nest_view = voo_items_view ||
   *  default_nest_view` — the format/nest.rb:35 prepare_view resolution for
   *  a nest with NO explicit view opt. voo_items_view (card-mod-collection
   *  set/all/item.rb:139-143) is `voo&.items&.[](:view)`: the nest's folded
   *  `|opt` lists (chunk/nest.rb:31-49) ride the voo of the format RENDERING
   *  the content, and an implicit nest inside that content renders the
   *  ITEMS view, not the format default. Corpus target: message-000004's
   *  `{{+conversation|labeled|link}}` — the labeled view of the missing
   *  +conversation card renders its structure content
   *  `<p>{{_left+conversation search}}</p>` (bench row 25861) whose implicit
   *  nest resolves to :link (base.rb:35, perms :none -> the wanted-card
   *  anchor even on an unknown card), not :content (whose :unknown
   *  createable gate renders "" — the graded -216 defect,
   *  dual-$1page:message-000004:page). */
  private implicitNestView(): string {
    const items = this.voo?.opts["items"];
    if (items !== null && typeof items === "object") {
      const view = (items as Record<string, unknown>)["view"];
      if (typeof view === "string" && view !== "") return view;
    }
    return this.defaultNestView();
  }

  /**
   * `Card::Env.origin` for the surface this render is on — the value
   * `card_url` interpolates (card-1.110.0 lib/card/env/location.rb:19-21
   * `"#{Env.origin}#{card_path rel}"`). Ruby's origin is per-render, not
   * a constant: serializable.rb:20-22 reads `Cardio.config.deck_origin`
   * first (nil at boot, cardio/railtie.rb:28) and falls back to
   * `"#{protocol}#{request&.host_with_port}"`, which is "" for a
   * requestless runner. The value is the DECK'S CONFIGURATION:
   * the capture script itself assigns deck_origin
   * for the page surface (capture-dual-$1page-and-view.rb:391-400,
   * restored at :400; the view-function surface at :277-287 runs outside
   * that block), and the port installs it the same way — through
   * setDeckEnvironment — never as an engine constant. See
   * render/deck-origin.ts for the oracle census.
   */
  envOrigin(): string {
    return this.engine.envOriginConfig?.() ?? NO_REQUEST_ORIGIN;
  }

  /**
   * `card_url rel` — the one helper every absolute card URL in the port
   * routes through (location.rb:19-21): an already-absolute `rel` passes
   * through, anything else becomes `Env.origin + card_path rel`
   * (card_path, location.rb:6-16, prefixes the site root when `rel` is
   * not already rooted). Modeling BOTH halves here is what makes the
   * surface seam load-bearing: the same helper yields `/User` on the
   * view-function surface and `https://example.com/User` on the served
   * page, which is exactly what the frozen record pins on both surfaces.
   */
  cardUrl(rel: string): string {
    if (/^https?:/.test(rel)) return rel;
    return `${this.envOrigin()}${cardPath(rel)}`;
  }

  /**
   * Nest machinery for an ALREADY-RESOLVED record - collection/item.rb
   * #nest_item's shape (options carry view/size etc.; nest_name is added
   * here; home_view follows the nest.rb rule). Used by the search card_list
   * for its :bar items.
   */
  nestRecord(
    target: RenderCard,
    view: string,
    opts: Record<string, unknown> = {},
    nest: { pointerListItem?: boolean } = {},
  ): string {
    // R17 (new_card_args supercard merge): an ID-LESS NEW target is the
    // FetchEngine's fabricated new-card record — its set-pattern chain
    // lacks the supercard context, so rebuild it with THIS card as the
    // parent (same shaping nest() applies; item.rb nest_item's path).
    // The isNew gate excludes VIRTUAL cards (id-less code-backed records —
    // the R16 virtual rule cards) whose dbContent and set keys are their
    // OWN, never a fabricated template's: the rule-set membership check
    // (right side a Setting) keeps every virtual rule card's isRule-enriched
    // set keys and rule content intact.
    const shaped =
      target.id === undefined &&
      target.record.isNew === true &&
      !(this.engine.cardMatchesRuleSet?.(target) ?? false)
        ? this.withNewCardContext(target)
        : target;
    const viewOpts: Record<string, unknown> = {
      nest_name: shaped.name.s, // nest.rb#prepare_view_and_opts!
      ...(view === "closed" || view === "edit" ? { home_view: "open" } : { home_view: view }),
      ...opts,
    };
    const sub = new RenderFormat(shaped, this.engine, {
      parent: this,
      maxDepth: this.maxDepth,
      nestQuietErrors: this.nestQuietErrors,
    });
    if (sub.depth >= this.maxDepth) {
      throw new TooDeepError(); // monitor_depth, see nest()
    }
    return str(sub.renderView(view, viewOpts));
  }

  /** chunk/reference.rb#referee_name: the authored name absolutized against
   *  the REFERENCING card. Relative references resolve through the name
   *  algebra's absoluteName; the context is this format's card. */
  private resolveNestName(raw: string): string {
    const name = DeckoName.parse(raw);
    if (name.isAbsolute) return name.s;
    const context = this.card.name;
    return name.absoluteName(context).s;
  }

  // -------------------------------------------------------------------------
  // format/content.rb - content processing
  // -------------------------------------------------------------------------

  /** content.rb#process_content: chunks the content, yields the literals,
   *  processes the references (nests) in place. Literal bytes pass through
   *  unchanged (Card::Content#to_s).
   *
   *  Wiki-link expansion: text pieces are scanned for `[[Target]]` /
   *  `[[Target|label]]` and rewritten through expandWikiLinks —
   *  `<a class="known-card" href="/Url_Key"><span class="card-title"
   *  title="label">label</span></a>` for card-name targets, the
   *  internal/external/email-link anchor for explicit targets. Pinned by
   *  recapture-raw:*read:render:content where `[[Anyone]]` and
   *  `[[Anyone|Anyone Signed In]]` both appear.
   *
   *  Link-wrapped nests (`[[Target|{{nest}}]]`): the nest scanner SPLITS
   *  such a link into a text piece ending in `[[Target|`, the nest piece,
   *  and a text piece carrying `]]` — so no single text piece holds a
   *  complete link and the plain pass leaks the raw wikitext (20 corpus
   *  cards; blog + Latest_News). Ruby never splits: the Link chunk
   *  (link.rb:14 full_re `[[([^\]]+)]]`) matches BEFORE the nest scan and
   *  re-parses its label as a nested Content (link.rb:113-122 objectify),
   *  so the expanded nest renders INSIDE the anchor. This pass restores
   *  that chunk-level shape over the split pieces: an unterminated
   *  `[[Target|` opener is spanned forward to the first `]]` in a later
   *  text piece, the pieces between render as the label, and the whole
   *  goes through renderLinkChunk. live capture:
   *  `[[/qagn/Latest_news_items.rss|{{feed icon|...}}]]` ->
   *  `<a class="internal-link" href="/qagn/Latest_news_items.rss">` +
   *  expanded feed-icon slot + `</a>` (live-wire Latest_News/blog). */
  /**
   * content.rb:20-27 `content_nest` — the chunk-level dispatch every
   * `{{inclusion}}` in ANY card's content goes through (chunk/nest.rb:73
   * `@processed = format.content_nest(@options)`). The `_main` arm is part
   * of that dispatch, not a layout-only rule: `{{_main}}` in an ordinary
   * card's content (page 470 "AsIn Layout", an Html-typed card whose body
   * is a whole layout template) hits main_nest and splices the main
   * format's @rendered — which at that instant is the RAW SOURCE, because
   * `process_content _render_raw` (base.rb:85-87) evaluated the :raw view
   * (the with_wrapper @rendered assignment) before chunking began.
   *
   * The label arm (link.rb:113-122 re-parses a link label as Content) runs
   * the same dispatch, which is why the caller uses this for both.
   */
  private contentNest(piece: { text: string; nest?: ParsedNest }): string {
    if (this.isMainNest(piece)) return this.mainNest(piece);
    // The authored bracket text rides along: this IS the chunk dispatch
    // (chunk/nest.rb:73), so a view body that answers Ruby nil keeps the
    // AUTHORED SYNTAX here (Chunk::Abstract#result's @text fallback) where
    // every programmatic nest str()s the same nil to "".
    return this.nest(piece.nest as ParsedNest, piece.text);
  }

  processContent(
    content: string,
    chunkList?: "default" | "references" | "nest_only",
  ): string {
    // Ruby's chunk_list seam (content.rb:23 `opts[:chunk_list] ||
    // @format.chunk_list`): when the caller passes no list, the CARD's own
    // `def chunk_list` override decides. The gem's overrides:
    //   - card-mod-format set/all/content.rb:5-7 the base `:default`
    //   - card-mod-format set/type/html.rb:14-16 HTML-typed cards:
    //     `:references` - wiki links + nests, NO URI chunks. This is why
    //     the oracle never autolinks a URL inside ANY Html-typed card's
    //     content (the *header / *credit+image SVG-comment URL
    //     `...Sketch 46.2 (44496) - http://www.bohemiancoding.com/sketch`
    //     renders plain on every page; the former unconditional default
    //     list anchored it).
    //   - card-mod-layout set/type/layout_type.rb:5 `include_set Type::Html`
    //     carries the same :references to Layout-typed cards.
    //   - card-mod-style set/abstract/01_css.rb:15-18 (Abstract::Css,
    //     included by the css + scss cardtypes via 02_scss.rb):
    //     `def chunk_list; :references; end # turn off autodetection of uri's`
    //   - card-mod-script set/abstract/00_script.rb:49-53 (JavaScript/
    //     CoffeeScript): `:nest_only`.
    // :references = [EscapedLiteral, Nest, Link] (wiki links, no URI
    // chunks); :nest_only = [Nest] (nests only).
    // The bootstrap: core page's CodeRay bytes pin the css/scss half: the
    // oracle leaves every bare URL inside the highlighted output verbatim
    // (0 bare-URL autolinks in the entire an earlier pass page-surface oracle).
    // MERGE composition: the compile-engines chunk-list dispatch
    // kept (code-file chunk lists never run the URI autolink pass), with
    // bar-slots V4's context arg threaded through both expansion arms so
    // the wikilink resolution carries this card's name context everywhere
    // the pass runs.
    const list =
      chunkList ??
      rubyChunkListForCardType(this.card.typeCode, this.card.typeName);
    const linkPass = (text: string): string =>
      list === "default"
        ? expandContentLinks(text, this.engine, this.card.name, this.contextNames)
        : list === "references"
          ? expandWikiLinks(text, this.engine, this.card.name, this.contextNames)
          : text;
    const pieces = scanNests(content);
    let out = "";
    let i = 0;
    while (i < pieces.length) {
      const piece = pieces[i]!;
      if (piece.kind === "nest") {
        if (out.endsWith("\\")) {
          // Chunk::EscapedLiteral (card-mod-content
          // chunk/escaped_literal.rb): a backslash immediately before the
          // braces is the escape prefix (prefix_re \\(?:\[\[|\{\{; the
          // backslash is an idx_char, so the chunk claims the region
          // before Chunk::Nest ever sees it) - the braces render as the
          // LITERAL {{...}} bytes, not a nest. interpret
          // (escaped_literal.rb:22) replaces \X with
          // format.escape_literal(X); the markdown format's escape_literal
          // is the identity (markdown.rb:16-18, byte-identical to the base
          // Format#escape_literal), so the backslash is consumed and the
          // nest text passes through verbatim. The kramdown stash restores
          // these bytes WITH the backslash (render/kramdown.ts
          // kramdownToStashedHtml) exactly so this pass consumes it.
          // Corpus oracle: *structure+*right+*guide content
          // (expected-v2/view-surface shard-000032 row 38251) renders
          // "icon ({{}})" - the braces survive, no blank-reference denial.
          out = out.slice(0, -1);
          out += piece.text;
        } else if (piece.nest !== undefined) {
          out += this.contentNest(piece);
        }
        i += 1;
        continue;
      }
      const opener = matchLinkWrappedNestOpener(piece.text);
      if (opener === undefined) {
        const targetOpener = matchLinkTargetNestOpener(piece.text);
        if (targetOpener === undefined) {
          out += linkPass(piece.text);
          i += 1;
          continue;
        }
        // The nest splits the TARGET (`[[/new/{{…}}|label]]`): build the
        // target forward to the pipe, the label to the closer, all from the
        // RAW piece text — Ruby matched the Link chunk before chunking, so
        // the braces survive into the href and the label verbatim.
        const spanned = this.spanLinkTargetOverNest(
          i,
          targetOpener,
          pieces,
          linkPass,
        );
        out += spanned.out;
        i = spanned.next;
        continue;
      }
      // The opener's prefix text still runs the plain link pass (it may
      // carry complete links of its own).
      out += linkPass(opener.prefix);
      let label = "";
      let sawNest = false;
      let tail: string | undefined;
      let j = i + 1;
      while (j < pieces.length) {
        const inner = pieces[j]!;
        if (inner.kind === "nest") {
          sawNest = true;
          if (inner.nest !== undefined) label += this.contentNest(inner);
          j += 1;
          continue;
        }
        const closeAt = inner.text.indexOf("]]");
        if (closeAt === -1) {
          label += linkPass(inner.text);
          j += 1;
          continue;
        }
        // First `]]` terminates the link chunk (Ruby's label charset is
        // [^\]] — a closer cannot appear inside a label).
        label += expandWikiLinks(inner.text.slice(0, closeAt));
        tail = inner.text.slice(closeAt + 2);
        j += 1;
        break;
      }
      if (tail === undefined) {
        // No closer anywhere: Ruby's chunker would not have matched a Link
        // either — emit the opener bytes verbatim (the unterminated text
        // passes through, the pre-span behavior).
        out += `[[${opener.target}|`;
        i += 1;
        continue;
      }
      out += this.renderLinkChunk(opener.target, label, sawNest);
      out += linkPass(tail);
      i = j;
    }
    return out;
  }

  /** Span one `[[Target|nest|label|nest]]` Link chunk whose NEST SPLITS THE
   *  TARGET — the case matchLinkTargetNestOpener detected but the single-piece
   *  walker cannot. Mirrors the label-side span above: walk forward from the
   *  opening piece, accumulate RAW text on both sides of the first `|`, stop
   *  at the first `]]`, and render through renderLinkChunk.
   *
   *  RAW on both sides is the pinned behavior, not an omission: link.rb:14
   *  matches `[[([^\]]+)]]` over the raw string BEFORE the nest scan, so a
   *  nest inside the target stays `{{…}}` inside the href and a nest inside
   *  the label stays `{{…}}` inside the anchor text. The oracle pins exactly
   *  that on `Cardtype+*type+*default` (content + open):
   *  `<a class="internal-link" href="/new/{{_self|linkname}}">add a
   *  {{_self|name}} card</a>`.
   *
   *  Two bail-outs reproduce the un-spanned (verbatim) bytes rather than
   *  guessing: no `|` divider anywhere (a bare `[[Target]]` spanning a nest —
   *  never pinned, so unchanged), and no `]]` closer anywhere (Ruby's chunker
   *  would not have matched a Link either). Both emit the opener bytes
   *  verbatim and resume at the opening piece, exactly the pre-fix path. */
  private spanLinkTargetOverNest(
    openIndex: number,
    opener: { prefix: string; head: string },
    pieces: ContentPiece[],
    linkPass: (text: string) => string,
  ): { out: string; next: number } {
    let target = opener.head;
    let label = "";
    let sawDivider = false;
    let tail: string | undefined;
    let j = openIndex + 1;
    while (j < pieces.length) {
      const inner = pieces[j]!;
      if (inner.kind === "nest") {
        // RAW nest text on both sides — see the doc comment.
        if (sawDivider) label += inner.text;
        else target += inner.text;
        j += 1;
        continue;
      }
      const pipeAt = sawDivider ? -1 : inner.text.indexOf("|");
      const closeAt = inner.text.indexOf("]]");
      if (pipeAt !== -1 && (closeAt === -1 || pipeAt < closeAt)) {
        target += inner.text.slice(0, pipeAt);
        label += inner.text.slice(pipeAt + 1);
        sawDivider = true;
        j += 1;
        continue;
      }
      if (closeAt === -1) {
        if (sawDivider) label += inner.text;
        else target += inner.text;
        j += 1;
        continue;
      }
      const before = inner.text.slice(0, closeAt);
      if (sawDivider) label += before;
      else target += before;
      tail = inner.text.slice(closeAt + 2);
      j += 1;
      break;
    }
    if (!sawDivider || tail === undefined) {
      // No divider, or no closer: emit the opener bytes verbatim and resume
      // at the opening piece (the pre-fix path).
      return { out: `${linkPass(opener.prefix)}[[${opener.head}`, next: openIndex + 1 };
    }
    return {
      out: `${linkPass(opener.prefix)}${this.renderLinkChunk(target, label)}${linkPass(tail)}`,
      next: j,
    };
  }

  /**
   * chunk/link.rb#render_link for one spanned `[[target|label]]` chunk.
   *
   * Explicit targets (link.rb:82-84 `^(/|https?:|mailto:)`) render
   * format.link_to_resource (links.rb html block): anchor class per
   * resource_type (internal/external/email-link; external adds
   * target=_blank), href re-rooted for the internal form (clean_resource
   * strips the leading slash; contextualize_path re-roots it). The label
   * is the ALREADY-RENDERED bytes (link.rb:47 render_obj ran first), so a
   * nest label lands inside the anchor expanded. live capture:
   * `<a class="internal-link" href="/qagn/Latest_news_items.rss">…` (feed
   * icon wrap) and `<a class="internal-link" href="/account/signup">sign-in
   * account</a>` (live Riley bio; identical bytes in the recapture
   * oracle).
   *
   * Name targets (link.rb:85-86 + 71-75) render view :link on the target
   * card (base.rb:37-39 -> link_view -> link_to_card card.name,
   * _render_title): the known/wanted class rides the target's existence
   * (links.rb add_known_or_wanted_class) and the title option carries the
   * rendered label, so the label bytes sit inside the card-title span.
   */
  private renderLinkChunk(rawTarget: string, label: string, labelHtmlSafe = false): string {
    const target = rawTarget.trim();
    if (/^(\/|https?:|mailto:)/.test(target)) {
      if (/^https?:/.test(target)) {
        // links.rb add_resource_opts inserts target BEFORE class, and
        // Rails' url_for inserts href LAST -> target, class, href (the
        // oracle corpus carries 798 external anchors, all target-first;
        // census mechanism "target attribute placement", page 14795).
        return `<a target="_blank" class="external-link" href="${h(target)}">${label}</a>`;
      }
      if (/^mailto:/.test(target)) {
        return `<a class="email-link" href="${h(target)}">${label}</a>`;
      }
      const href = `/${target.replace(/^\/+/, "")}`;
      return `<a class="internal-link" href="${h(href)}">${label}</a>`;
    }
    // reference.rb referee_name: the chunk names the target ABSOLUTIZED
    // against the referencing card (`[[_left|{{_left+image}}]]` inside the
    // virtual `<item>+short` names `<item>`), as the plain link pass does.
    const named = this.engine.fetchRenderCard(absolutizeWikiTarget(target, this.card.name));
    // view-fail class V4: a map miss is NOT absence — Ruby's Card.known?
    // (links.rb:140-144) is a live fetch. The codename registry's loaded
    // memo confirms codenamed cards (the static help popover's
    // [[List]]/[[Pointer]]/[[Search]]) query-free; the prepare-phase
    // link-target warm pass seats regular cards so this miss arm rarely
    // fires for them. Absence stays wanted-card (the People Green pin).
    let known = named !== undefined && named.unknown !== true;
    // view :link renders on the TARGET CARD (base.rb:35-46 link_view ->
    // link_to_card card.name, _render_title): the href carries the
    // RESOLVED card's name while the label/title keep the authored link
    // text. Oracle corpus scan: every case-differing known-card anchor
    // hrefs the real name in both directions ([[narrative]] -> /Narrative,
    // [[Aikido]] -> /aikido for a lowercase-stored card) - census
    // token-swap singleton, page 685 (exp href /Narrative).
    let hrefSource = known && named?.name !== undefined ? named.name.s : target;
    if (named === undefined) {
      // VirtualSearch family (card-mod-search set/abstract/virtual_search.rb
      // :11-12 `def virtual?; new?; end`, :14-16 assign_type :search_type):
      // a compound name whose right part is one of the 16 family rights is
      // VIRTUAL-KNOWN on a row miss, so Card.known? (links.rb:140-144
      // add_known_or_wanted_class) answers true and the anchor renders
      // known-card. The corpus pin: Help Desk's
      // [[:account+:right+:by_name|Account cards]] - Ruby renders
      // known-card (there is no `*account+*right+by name` row and no
      // *structure rule applies; the card is known purely through the
      // Right::ByName module), the pre-fix port answered wanted-card. The
      // nest path already renders this family through the same table (the
      // GIV page's {{_self+*referred to by}}); this is the link arm of the
      // one fetch-level state. Table + contract:
      // src/card/fetch/virtual-search-cards.ts.
      const virtual = virtualSearchKnownName(target, this.engine);
      if (virtual !== undefined) {
        known = true;
        hrefSource = virtual;
      } else {
        const peeked = this.engine.peekKnownCardName?.(target);
        if (peeked !== undefined) {
          known = true;
          hrefSource = peeked;
        }
      }
    }
    let href: string;
    // The RESOLVED name, when the mark resolves. `Eagle+:members` is a
    // codename mark: its `.urlKey` and its `.s` are both `Eagle+*members`,
    // because `:members` resolves to the codenamed `*members` card. Ruby's
    // Card::Path is handed a Cardname, and a Cardname in this position is
    // the resolved one, so BOTH halves of its standardish test see the
    // resolved string. Keeping the resolved form is what lets the decision
    // below compare like with like.
    try {
      const parsedSource = DeckoName.parse(hrefSource);
      href = `/${parsedSource.urlKey}`;
    } catch (err) {
      if (err instanceof CodenameNotFoundError || err instanceof NameNotFoundError) {
        href = `/${target.replace(/ /g, "_")}`; // unresolved mark: plain underscore form
      } else {
        throw err;
      }
    }
    // Card::Path#handle_unknown (card-mod-format path.rb:89-96): a wanted
    // mark whose name is not name_standardish? (path.rb:107-109) carries
    // ?card[name]=<name> (query, path.rb:84-87) — the mindfulness oracle's
    // href `/mytho_psychology?card%5Bname%5D=mytho-psychology` (entry 28173
    // @12,123). Standardish wanted names (People_Green) stay bare.
    //
    // THE COMPARISON IS AGAINST THE RESOLVED NAME, not the authored mark.
    // Pre-fix this passed `hrefSource`, which for a codename mark is the
    // UNRESOLVED `Eagle+:members`, and compared its `urlKey`
    // (`Eagle+*members`) against that same unresolved string — two different
    // spellings of one name, so the test could never be satisfied and the
    // query fired on every codename-marked wanted link. The href beside it
    // was already built from the resolved url_key, so the anchor rendered
    // `/Eagle+*members?card[name]=Eagle+:members` where the capture has a
    // bare `/Eagle+*members` (recapture-raw-shard-000029 `Eagle:page`, +36 —
    // the whole delta is that query). Card 34824 `Eagle+description` is the
    // authored mark: `[[Eagle+:members|Eagle users]]`.
    if (!known) href += wantedHrefQuerySuffix(hrefSource);
    // wrapped_title's title attribute goes through Rails tag_option: a
    // label rendered from content with a nest is an html_safe buffer, so
    // only its double quotes are escaped (the Item+short structure's
    // `[[_left|{{_left+image}}]]` titles the raw denied-nest markup); a
    // plain-text label is fully escaped.
    const titleAttr = labelHtmlSafe && label !== "" ? label.replace(/"/g, "&quot;") : h(label || target);
    return (
      `<a class="${known ? "known-card" : "wanted-card"}" href="${h(href)}">` +
      // wrapped_title (title.rb): the inner text is the title's name parts
      // joined by `<span>+</span>`, over the whole rendered label (the
      // attribute above keeps the unsplit bytes).
      `<span class="card-title" title="${titleAttr}">${wrappedTitleInner(label)}</span>` +
      `</a>`
    );
  }

  /** base.rb (card-mod-format)#core: process_content(_render_raw); the raw
   *  content of the record (content/all.rb:19). Card#content (content/all.rb
   *  :5-7) consults registered set overrides BEFORE falling through to
   *  standard_content; this renderRaw mirrors that - a registered content
   *  override whose setPath matches this card wins, otherwise dbContent
   *  passes through unchanged (the corpus suites pin those bytes). */
  renderRaw(): string {
    const override = resolveContentOverride(this);
    // card-mod-date set/self/now.rb:1-3 — the *now card's `def content`
    // override. The loader-less render boot carries no content-override
    // registry (the mod-loader composition is not loaded there), so the
    // Self::Now chain is consulted directly: the *now card is
    // codename-anchored ("now" — set/pattern Self matching via
    // anchor_codenames) and truly virtual (dbContent ""), the one
    // SELF_MODULE_CHAINS row the graded corpus pins (see
    // now-content-bytes.ts for the byte derivation and the unwired
    // remainder).
    const selfNow =
      override === undefined &&
      (this.card.record.codename === "now" || this.card.key === "*now")
        ? nowCardContent()
        : undefined;
    const raw = override !== undefined ? override : (selfNow ?? this.card.dbContent);
    // Ruby reaches the same bytes through the :raw VIEW, and a view render
    // is `with_wrapper { @rendered = yield; wrap_with_wrapper }`
    // (render.rb:96-97 -> wrapper.rb:15). So every `_render_raw` /
    // `render_raw` call site (base.rb:75-77 `view :raw do
    // structure_card&.content || _render_blank end`, reached from
    // `view :core do process_content _render_raw end` base.rb:85-87) leaves
    // the format's @rendered holding the raw source.
    //
    // ORDER IS THE WHOLE MECHANISM (D6, page 470 "AsIn Layout"):
    // `process_content _render_raw` evaluates its ARGUMENT first, so by the
    // time the content chunker dispatches a `{{_main}}` piece the format's
    // @rendered is the raw source, not the view bytes — and
    // nesting/main.rb:12 `main.rendered || main_nest_render(opts)` returns
    // it. The oracle splices the card's own 469-byte dbContent verbatim
    // (nests and wiki links UNexpanded) inside wrap_main's <div id="main">.
    this.rendered = raw;
    return raw;
  }

  // -------------------------------------------------------------------------
  // nesting/main.rb — the `_main` nest
  // -------------------------------------------------------------------------

  /**
   * nesting/subformat.rb:18-24 `main`, with the html format's override of
   * `main?` (card-mod-format html_format.rb:11-13 `!@main.nil?` — NOT the
   * base `depth.zero?`):
   *
   *     if main? then self elsif !root? then parent.main end
   *
   * i.e. the nearest format flagged main (process_layout.rb:19 `main!` on
   * the page's root format, or nest.rb:46 `sub.main! if view_opts[:main]`),
   * else the walk up the parent chain, else NIL. The nil arm is the frozen
   * record's view-surface CAPTURE_ERROR for 470
   * (`NoMethodError: undefined method 'rendered' for nil`): a bare
   * `card.format.render(:content)` has no main format, so `main.rendered`
   * in main.rb:12 raises before any byte is produced.
   */
  get main(): RenderFormat | undefined {
    if (this.isMain) return this;
    if (this.depth > 0) return this.parent?.main;
    return undefined;
  }
  /**
   * content.rb:20-27 `content_nest`:
   * `return main_nest(opts) if main_nest?(nest_name) && @nest_mode != :template`.
   * `main_nest?` is an EXACT name match (nesting/main.rb:26-28
   * `nest_name == "_main"`), on the AUTHORED reference (chunk/nest.rb:23
   * keeps it verbatim), so only `{{_main}}` / `{{_main|view}}` take this
   * arm. The mode gate reads the format's OWN @nest_mode ivar, not the
   * inherited `nest_mode` — a subformat inherits its parent's mode for
   * modal_nest_view (mode.rb:44) but content.rb:24 tests the local ivar.
   * Layout-typed cards render their :core inside with_nest_mode :template
   * (card-mod-layout set/type/layout_type.rb:13-17), which is what keeps
   * every layout card's own `{{_main|...}}` an ordinary nest.
   */
  private isMainNest(piece: { nest?: ParsedNest }): boolean {
    return piece.nest !== undefined && piece.nest.name === "_main" && this.ownNestMode !== "template";
  }

  /**
   * nesting/main.rb:10-14 `main_nest`: `wrap_main { main.rendered ||
   * main_nest_render(opts) }`. The `||` is a NIL test in Ruby — an empty
   * string is truthy there and must NOT fall through, hence the explicit
   * `!== undefined` rather than a truthiness check.
   */
  mainNest(piece: { nest?: ParsedNest }): string {
    const main = this.main;
    if (main === undefined) {
      // main.rb:12 `main.rendered` on nil — the frozen record's own
      // behaviour for this shape (view-surface shard-000000 entry 470:
      // CAPTURE_ERROR NoMethodError). The port raises rather than inventing
      // bytes; nestQuietErrors turns it into the quiet span upstream.
      throw mainNestWithoutMainError();
    }
    const body = main.rendered !== undefined ? main.rendered : this.mainNestRender(piece);
    return this.wrapMain(body);
  }

  /**
   * html/wrap.rb:118-126 `wrap_main`:
   * `return yield if no_main_wrap?; wrap_with :div, yield, id: "main"`.
   * no_main_wrap? is `Env.ajax? || no_layout?` (params[:layout] == "none");
   * neither applies to a page render, so the div always wraps here — the
   * same unconditional form the pre-D6 layout path emitted.
   */
  private wrapMain(content: string): string {
    return `<div id="main">${content}</div>`;
  }

  /**
   * nesting/main.rb:16-24 `main_nest_render`:
   * `with_nest_mode :normal { nest root.card, opts.merge(main_view: true,
   * main: true) }`. The fallback arm fires only when the main format exists
   * but has not rendered yet (@rendered still nil) — with the main card
   * re-nested in the main view it re-enters the same content, so Ruby's
   * monitor_depth (error.rb:33-39, max_depth 20) is what ends it. The
   * captured corpus never reaches it: page 470's main format has @rendered
   * (the :raw view, above) and every layout body's `{{_main}}` reads the
   * main-view body the page renderer assigned. Implemented faithfully
   * anyway, with the depth guard mirroring Ruby's.
   */
  private mainNestRender(piece: { nest?: ParsedNest }): string {
    const nest = piece.nest;
    const root = this.main;
    if (root === undefined || nest === undefined) return "";
    const view = nest.options.view ?? this.defaultNestView();
    const sub = new RenderFormat(root.card, this.engine, {
      parent: this,
      maxDepth: this.maxDepth,
      nestQuietErrors: this.nestQuietErrors,
      // nest.rb:46 `sub.main! if view_opts[:main]`
      main: true,
    });
    if (sub.depth >= this.maxDepth) {
      // The corpus never reaches this arm (main.rendered memoizes first);
      // the raise stays the recorded posture here — see nest()'s depth
      // guard for the observed quiet shape.
      throw new TooDeepError(); // monitor_depth, see nest()
    }
    return this.withNestMode("normal", () =>
      str(sub.renderView(this.modalNestView(view, root.card), {
        ...(nest.chunkNestSyntax !== undefined ? { nest_syntax: nest.chunkNestSyntax } : {}),
        ...this.nestOptionEntries(nest.options),
        nest_name: nest.name,
        home_view: view === "closed" || view === "edit" ? "open" : view,
        main: true,
        main_view: true,
      })),
    );
  }

  /**
   * card-mod-layout-0.20.0 set/self/head.rb:9-17 view :core —
   * `escape_in_main { nest root.card, view: :head }` — is reachable from a
   * render only when that render's card content carries a nest to the head
   * card asking for its :core view. The engine's ASYNC prepare half asks
   * this before it seats the root card's head bytes (render.ts#seatPageHead),
   * so the head read-set (:title / :favicon / *all+*style+*asset output /
   * :ace / :tiny_mce) rides no render that cannot reach it.
   *
   * The name resolution is the SAME resolveNestName the nest machinery runs
   * (chunk/reference.rb#referee_name: the authored mark absolutized against
   * the referencing card), so both corpus spellings land on the head card's
   * key: `{{:head|core}}` (card 34754 `*all+*head`) and `{{*head|core}}`
   * (card 34758 `ZQVT+*self+*head`, oracle view-surface
   * recapture-raw-shard-000029 views.content — pre 2441 B / 2447 B against
   * the port's pre 0 B).
   *
   * TEMPLATE NEST MODE is the whole Layout carve-out, and it is not a
   * heuristic: `with_nest_mode :template` (card-mod-layout
   * set/type/layout_type.rb:5, the only such call in any installed gem) makes
   * every nest print back as its own literal, so a Layout body's CodeRay <pre>
   * never runs the head card's :core. The oracle proves it on the two Layout
   * cards that nest it — 314 `Classic Layout` and 2575 `home-layout` keep
   * `{{*head|core}}` LITERAL inside a 7750 B / 907 B pre whose `[[...]]`
   * wiki links all expand. Seating bytes for those would be cost, not parity.
   */
  contentNestsHeadCore(): boolean {
    if (this.card.typeCode === "layout_type") return false;
    for (const piece of scanNests(this.card.dbContent)) {
      const nest = piece.nest;
      if (nest === undefined || nest.comment !== undefined) continue;
      // nest.rb#prepare defaults the view; a nest that names any other view
      // never dispatches the head card's :core.
      const view = nest.options.view;
      if (view !== undefined && view !== "core") continue;
      let key: string;
      try {
        key = DeckoName.parse(this.resolveNestName(nest.name)).key;
      } catch {
        continue; // an unparseable mark never reaches a card (nest.rb fetch safety)
      }
      if (key === "*head") return true;
    }
    return false;
  }

  /**
   * Card::Layout::CardLayout#render — the layout card's content processed
   * through the PAGE format (process_content, chunk_list: :references).
   * NOT a separate loop: it IS processContent, because card_layout.rb:10
   * calls the same `process_content` (see the body comment). The `_main`
   * nest needs no special case here either - Ruby's nest dispatch hits
   * nesting/main.rb#main_nest — wrap_main { main.rendered } — the main-view
   * body the page renderer assigned, wrapped in <div id="main">
   * (html/wrap.rb #wrap_main; no_main_wrap? is false for the page path),
   * and processContent's nest arm is `contentNest`, which is exactly the
   * isMainNest ? mainNest : nest pair (contentNest's own comment).
   * Other nests resolve against the PAGE card (the layout renders in the
   * page's format context), including `:codename` marks
   * ({{:header|core}} -> *header).
   *
   * CardLayout#render passes the layout content as process_content's
   * OVERRIDE argument (card_layout.rb:10), so `content_object` never calls
   * render_raw (content.rb:77-82) and the main format's @rendered still
   * holds the main-view bytes here. That is the difference from a `{{_main}}`
   * inside the MAIN card's own content, which reads the raw source instead
   * (mainNest above).
   *
   * The `_main` short-circuit is gated on the nest mode because Ruby's is:
   * content.rb:24 `return main_nest(opts) if main_nest?(nest_name) &&
   * @nest_mode != :template`. Under :template mode a `_main` nest is an
   * ordinary nest, so it goes through nest() and renders :template_nest -
   * the literal `{{_main|titled}}` - instead of splicing in the page body.
   */
  processLayoutContent(content: string): string {
    // There is ONE chunk walk in Ruby and this is it. card_layout.rb:10
    // calls `@format.process_content layout_card.content, chunk_list:
    // :references` — the SAME `process_content` every card's own body runs
    // (card-1.110.0/lib/card/format/content.rb), and the only thing
    // `chunk_list:` changes is the LIST of chunk classes
    // (card-1.110.0/lib/card/content.rb:23 `chunk_list = opts[:chunk_list]
    // // @format.chunk_list`), not the parser: Content::Parser#parse
    // (parser.rb:18-27) scans the RAW string once, in position order, and
    // at each position asks each registered class to `full_match` the raw
    // remainder. So the layout body is not a second kind of render.
    //
    // :references = [EscapedLiteral, Nest, Link] (card-mod-content
    // set/all/content.rb register_list; the port's own note at the
    // processContent chunk-list table) — NO URI chunks, which is why a
    // layout body never autolinks (the svg-comment URL
    // `...Sketch 46.2 (44496) - http://www.bohemiancoding.com/sketch`
    // inside every corpus layout stays plain in the oracle; the former
    // default-list URI pass anchored it, +89 bytes on 14 page-surface
    // entries, probe job-1790846792533).
    //
    // D10 (fixed here): the port had a SECOND, forked walk here -
    // same nest arm, but the text arm ran only the whole-piece
    // `expandWikiLinks` regex and never the Link-chunk-spans-a-Nest arm
    // that processContent runs (matchLinkWrappedNestOpener, above).
    // Ruby's Chunk::Link reaches that shape because its full_re
    // (chunk/link.rb:14 `/\A\[\[([^\]]+)\]\]/`) is matched against the RAW
    // remainder, and `[^\]]+` happily spans a `{{...}}`; `divider_index`
    // (link.rb:99-109, "find the first pipe that's not inside an nest")
    // masks each `\{\{[^}]*\}\}` run with x's to find that pipe, and
    // `objectify` (link.rb:113-122) re-parses the label as Content when it
    // carries a nest. A layout body with a nest INSIDE a link label
    // therefore rendered as literal `[[/ |` + nest + `]]` in the port.
    // Oracle witness (sha-verified corpus + expected-v2, entry-scoped):
    // layout card 2347 `Golden_Bears_Aikido_at_UC_Berkeley main layout`
    // `<div>[[/ |{{HBQ logo - admin area}}]]</div>` on page 1316 and
    // layout 2339 on page 2333; the oracle emits
    // `<a class="internal-link" href="/">` + rendered nest + `</a>`.
    // Five captured layout cards carry the shape (314, 470, 2339, 2347,
    // 11746); none carries an EscapedLiteral `\{\{`, so folding the two
    // walks together is byte-identical everywhere else on the surface.
    return this.processContent(content, "references");
  }

  /** title.rb#standard_title via #title_in_context (context_names.rb:49-55):
   *  the card name relativized against the format's context names
   *  (`title.from(*context_names)` - DeckoName#from strips the leading
   *  parts the context supplies and round-trip-verifies the compression),
   *  HTML-escaped (the html-format override h()s the result). In the page's
   *  own context a junction slot ("Aikido 2+management" under the Aikido 2
   *  page) displays as the relative "+management"; the same card rendered
   *  out of context keeps the full name.
   *
   *  voo.title: an EXPLICIT title option
   *  wins (title.rb:6-8 standard_title = name_variant title_in_context(
   *  voo.title); the html title_in_context marks explicit titles html_safe
   *  - title.rb:25-26 "escape titles generated from card names, but not
   *  those set explicitly" - so they render UNESCAPED). Corpus pressure
   *  zero corpus nests carry a |title: param, so
   *  the only opt-carrying surfaces are the bootswatch skin field_nests
   *  (card-mod-bootstrap set/type/bootswatch_skin/core.haml field_nest
   *  title: opts).
   *
   *  2026-09-29 (view-fail class Z10): settings with an
   *  I18n display title render THAT title
   *  (Card::Setting#title — the `setting_title.<codename>` locale keys;
   *  attribution training-data, the corpus pins the surface bytes) — the
   *  oracle renders `<span class="card-title" title="Search Results">
   *  Search Results</span>` for the *search card's :title/:closed views
   *  where the engine rendered the raw "*search" name. Only the codenames
   *  the corpus pins carry entries (the oracle renders RAW names for
   *  every other setting-codename card it captures — *style, *structure,
   *  *on create, the *read/*create rule rows — so an I18n-table miss falls
   *  through to the plain name, byte-identical to the pre-change
   *  behavior). The swap keys on the RESOLVED title name being a simple
   *  star card whose codename is in the table (a rule row like *content
   *  options+*right+*default is a junction — never simple — and keeps its
   *  rule name).
   *
   *  Merge note (an earlier pass): both merge parents landed the SAME three codenames —
   *  this Z10 table (keyed on the resolved name's codename, here) and
   *  views.ts SELF_SET_TITLE_OVERRIDES (keyed on the rendered card's
   *  codename, consulted first at the view layer) carry identical values
   *  ("Search Results" / "Sign In" / "Recent Changes"); whichever fires
   *  first emits the same bytes, and the Ruby mechanism covers both
   *  (the self-set views' `voo.title ||= t(...)` arrives HERE as voo.title
   *  in the loader-bound world; the headless no-loader surface reads the
   *  codename tables instead). */
  standardTitle(): string {
    // The explicit title reads the LIVE writer through the voo chain:
    // `voo.title = X` lands on the OWNING voo's live options, and the
    // delegated :title render runs on a CHILD voo (render.rb with_voo) —
    // Ruby's accessor falls through to the parent voo, so the setup
    // frame's header renders "Your deck is ready to go!" (the graded row)
    // while neither the owning nor the child slot JSON carries a title
    // key. Own liveTitle first, then the parent chain, then normalized.
    const live =
      this.voo?.liveTitle ??
      (() => {
        let p = this.voo?.parent;
        while (p !== undefined) {
          if (p.liveTitle !== undefined) return p.liveTitle;
          p = p.parent;
        }
        return undefined;
      })();
    if (live !== undefined && live !== "") {
      const absolute = DeckoName.parse(live).absoluteName(this.card.name);
      return absolute.from(...this.contextNames);
    }
    const explicit = this.voo?.opts["title"];
    if (typeof explicit === "string" && explicit !== "") {
      // title.rb:34-37 title_in_context(voo.title): the explicit title is a
      // NAME — `title.to_name.absolute_name(card.name)` then
      // `.from(*context_names)`. The html override (title.rb:25-29) marks
      // the result html_safe, which skips the h() ESCAPE but not the
      // relativization — so an explicit COMPOUND title whose parts the
      // context supplies renders in the relative form ("welcome email+*to"
      // under the welcome-email page renders "+*to", the read_form
      // field-title oracle bytes), while simple titles round-trip verbatim.
      const absolute = DeckoName.parse(explicit).absoluteName(this.card.name);
      return absolute.from(...this.contextNames);
    }
    const resolved = this.card.name.from(...this.contextNames);
    return h(settingDisplayTitle(resolved, this.engine) ?? resolved);
  }

  /** name/all.rb#url_key via DeckoName. */
  urlKey(): string {
    return this.card.name.urlKey;
  }

  /**
   * The :menu view's data-bs-content value (menu.rb help_link -> bootstrap
   * helper.rb popover_opts). Delegates to the installed helpRules resolver;
   * "" (no resolver, or Ruby-blank text) renders the &nbsp; placeholder
   * exactly like the pre-resolution hardcode.
   */
  menuHelpContentBytes(): string {
    return this.engine.helpRules?.menuHelpContentBytes(this) ?? "";
  }

  /** auth/permissions.rb:18-26 Auth.createable_types — the type editor's
   *  select options (edit_type.rb:52-62 raw_type_options + :44-48
   *  type_field). Sync read of the engine's prepare-phase precompute;
   *  [] until prepared (engines without the seam answer [] — the rules
   *  mod's documented headless divergence). */
  createableTypes(): string[] {
    return this.engine.createableTypes?.() ?? [];
  }
}

/** Minimal engine surface the format needs (implemented by RenderEngine in
 *  src/card/render.ts). Kept as an interface so views.ts and format.ts never
 *  import the engine concrete class - mirrors the harness's interface-only
 *  rule in spirit. */
/** 2026-09-29 (view-fail class Z10): the setting display
 *  titles the oracle pins (see RenderFormat#standardTitle's doc block).
 *  The three entries are the corpus's only I18n-covered settings; every
 *  other captured setting-codename card renders its raw name, so a miss
 *  here falls through to the plain name (pre-change bytes). */
const SETTING_DISPLAY_TITLES: Readonly<Record<string, string>> = {
  search: "Search Results",
  signin: "Sign In",
  recent: "Recent Changes",
};

/** The display title for a resolved standard-title name when that name is
 *  a simple star card whose codename carries an I18n title (Z10, above).
 *  Undefined keeps the plain name. */
function settingDisplayTitle(
  resolved: string,
  engine: RenderEngineLike,
): string | undefined {
  if (!resolved.startsWith("*") || resolved.includes("+")) return undefined;
  const card = engine.fetchRenderCard?.(resolved);
  const codename =
    card?.id !== undefined ? engine.peekCodenameById?.(card.id) : undefined;
  if (codename === undefined) return undefined;
  return SETTING_DISPLAY_TITLES[codename];
}

/** The :search_box_complete view's prepared data (card-mod-search
 *  set/self/search.rb:70-72; the seat half lives in render.ts
 *  #prepareSearchBoxComplete, which cites the gem line-by-line). */
export interface SearchBoxCompleteSeat {
  /** search_keyword (search_params.rb:32-34) — undefined when the request
   *  carries neither term nor query[keyword]. */
  readonly term: string | undefined;
  /** Card.fetch(term, new: {}) (:102) — the real row or the fabricated new
   *  card; undefined only when term is. */
  readonly exact: RenderCard | undefined;
  /** exact.known? — a real row exists (the exact-name unshift's gate). */
  readonly exactKnown: boolean;
  /** The goto-item cards in complete-search order (read-filtered; the
   *  exact-name unshift the ViewFn applies on exactKnown). */
  readonly goto: readonly RenderCard[];
  /** The *search cql's failure message (the BadQuery shapes) — the ViewFn
   *  raises it inside the dispatch's own rescue scope, Ruby's raise site. */
  readonly failure: string | undefined;
}

/** The deck's phantom (unknown pointer/list item) type identity: the type a
 *  record-less item carries when no host item type resolves one. In Ruby this
 *  is the deck's own `*all+*default` template type, so it is DECK
 *  configuration rather than an engine constant.
 *  `typeKey` is the type's simpleKey form — the class-chip token
 *  (`TYPE-basic_c`) — which is not derivable from the display name without
 *  the same inflection table the name parser uses, so it travels with the
 *  other two. */
export interface PhantomItemType {
  typeId: number;
  typeName: string;
  typeKey: string;
}

export interface RenderEngineLike {
  views: Record<string, ViewFn>;
  /** The render viewer (render.ts RenderEngine#viewer - the read-verdict
   *  identity). Optional: engines without it answer the SIGNED-OUT surface
   *  (the board sidebar's show_follow?/show_discussion? gates read it;
   *  tab_visibility.rb:11-58). */
  readonly viewer?: { signedIn?: boolean; actorId?: number };
  /** The engine's own synchronous name for a card id (render.ts
   *  RenderEngine#peekNameForId). Optional: views fall back to the
   *  process-wide name environment. */
  peekNameForId?(id: number): string | undefined;
  /** Ruby's `root.error_status` for the page (render.ts
   *  RenderEngine#pageErrorStatus). Optional: engines without it ignore
   *  the status. */
  pageErrorStatus?: number | undefined;
  /** html/error.rb:200-204's @denied_task-nil arm (render.ts
   *  RenderEngine#pageLoudDenialTaskPhrase): the loud denial's "to do that"
   *  wording for a controller-rescue denial. Optional: engines without it
   *  keep the view-level task wording. */
  pageLoudDenialTaskPhrase?: string | undefined;
  /** Chain-aware view resolution for a single (card, view, format) triple.
   *  With a mod loader wired up, walks the per-card MRO chain (set/
   *  format.rb:146-150 + format.rb:62-68) and returns the most-specific
   *  registered view fn; falls back to the flat `views` record when
   *  either no loader is registered OR the chain produces no entries
   *  (the base format view wins - view_definition.rb:18-21).
   *
   *  When no loader is registered, the lookup is byte-identical to
   *  `this.views[view]` — the captured 1080-test render surface stays
   *  green. With a loader registered, the chain walker honors Ruby's
   *  per-card MRO so the LAST mod that registers a view does NOT
   *  hijack every card (the recaptcha/api_key :content probe).
   *
   *  Format inheritance (css/js/rss fall back to the html chain when
   *  their chain is empty - AbstractFormat#format blocks reopen the
   *  parent class). The format parameter names the caller's format
   *  ("html" by default; the dispatch seam reads it directly). */
  resolveView(card: RenderCard, view: string, format?: string): ViewFn | undefined;
  /** Cache-first card resolution (fetch ladder; prefetch made this free). */
  fetchRenderCard(name: string): RenderCard | undefined;
  /** view-fail class V4 (links.rb:140-144 add_known_or_wanted_class): the
   *  live-existence truth for a fetchRenderCard MISS — the codename
   *  registry's loaded codehash memo confirms codenamed cards
   *  ([[List]]/[[Pointer]]/[[Search]], the static help-text targets)
   *  query-free, returning the registered card name for the href source.
   *  Optional: engines without it leave map misses wanted-card. */
  peekKnownCardName?(name: string): string | undefined;
  /** M9 — the resolved html_views.rb:4-11 `new_customized_name` for one
   *  bootswatch_skin card, computed in the engine's ASYNC PREPARE PHASE by
   *  walking `Card.exist?` over `<skin> customized`, `<skin> customized 1`, …
   *  (RenderEngine#cardExists) and memoized here for the synchronous
   *  customize_button ViewFn to read. The view cannot query: this pipeline
   *  dispatches sync ViewFns over a prepared map, and a bootswatch skin's
   *  customized sibling is never in that page's nest closure — the
   *  render-card-map-only gate is what produced the M9 residual (journal /
   *  slate skin pages render the bare name where the oracle emits `+1`).
   *
   *  Optional: undefined = not warmed for this card (an engine with no
   *  prepare phase, or a skin nested into a render rather than being the
   *  root). The view then falls back to the render-card map, which is
   *  exactly its pre-M9 behaviour. */
  peekCustomizedName?(name: string): string | undefined;
  /** Search execution for Search-type cores (see views.ts card_list). */
  executeSearch(fmt: RenderFormat): RenderCard[];
  /** options_hash (card-mod-layout set/abstract/items/options_api.rb:4-6)
   *  for the pointer/list editors — the [label, name] pairs the five editor
   *  views iterate, resolved through the prepared options_card chain
   *  (render.ts optionsCardSource + ensurePointerEditorOptions; the chain's
   *  search member seats in the async prepare phase). Optional: engines
   *  without it fail the list editors loudly (card-mod-list
   *  editorOptionPairs). */
  optionsCardPairs?(card: RenderCard): Array<[string, string]>;
  /** templating.rb:60-71 Card#structure, resolved sync against the boot's
   *  structure universe (render.ts structureRuleForSync :=
   *  resolveStructuredContent): the winning *structure rule's name and
   *  template content; undefined when no rule applies or its content is
   *  "_self". Optional: engines without it render the single-card edit
   *  field (multiCardEditor's card.structure arm answers false). */
  structureRuleForSync?(card: {
    name: string;
    id?: number;
    typeId?: number;
    typeName?: string;
    leftTypeName?: string;
    isNew?: boolean;
  }): { ruleName: string; content: string } | undefined;
  /** The seated paging record for a rendered search (search-paging.ts;
   *  undefined = the show_paging? == false case — the :card_list view
   *  renders no nav). */
  searchResultPaging?(fmt: RenderFormat): SearchResultPaging | undefined;
  /** The pre-executed count of a search whose cql declares
   *  `return: "count"` (undefined for a list search or an engine without
   *  it). The search core renders it as :search_count. */
  searchResultCount?(fmt: RenderFormat): number | undefined;
  /** Ruby's `search_keyword` (card-mod-search
   *  set/abstract/0_search/search_params.rb:32-34: `term_param ||
   *  search_vars&.dig(:keyword)`) - BOTH arms are REQUEST params, so a
   *  headless engine has none. Optional: undefined means "no request term",
   *  which is the truth for every engine in this repo; the only consumer is
   *  the :results_for_keyword view (search.rb:48), whose haml guards on
   *  `search_keyword.present?` and therefore renders the empty string. */
  searchKeyword?(card: RenderCard): string | undefined;
  /** The :search_box_complete view's prepared data (card-mod-search
   *  set/self/search.rb:70-72) — the async prepare phase's seat for the
   *  sync ViewFn: the request term (search_keyword), the exact card
   *  (Card.fetch(term, new: {}) — the real row or the fabricated new card),
   *  whether that card is KNOWN (a real row — the exact-name unshift), the
   *  goto-item cards (complete_search, read-filtered), and the cql failure
   *  message the view raises inside its own rescue scope (Ruby's raise site
   *  is the view body). Undefined = this render never prepared the view
   *  (the mod's view dispatch on a seatless render is a port defect — the
   *  seam stays optional so stub engines fail LOUDLY, not silently). */
  searchBoxCompleteSeat?(card: RenderCard): SearchBoxCompleteSeat | undefined;
  /** Ruby's Auth.always_ok? for the render session's viewer
   *  (auth/permissions.rb:7-13 — the DeckoBot actor or an Administrator-
   *  role member; the engine's ReadPermissionState.alwaysOk, settled in
   *  the prepare phase). error.rb:47-49 show_all_errors? reads it for the
   *  admin arm of the quiet render-error span. Optional: engines without
   *  it (no permission state resolved) take the plain-cardname arm. */
  peekAlwaysOk?(): boolean | undefined;
  /** The Auth::Token runtime's injected key material (render.ts
   *  RenderEngine#tokenConfig, pinned from the host's secret). Ruby reads
   *  Rails' credentials secret_key_base (token.rb:7); a deck without it
   *  signs with "" and jwt's ensure_valid_key! raises. Optional: engines
   *  without it are the no-secret deck — the corpus harness's posture. */
  tokenConfig?: { readonly secret?: string };
  /** Read-permission verdict for a prepared card (the ok_to_read? set
   *  membership, card-mod-permissions set/all/permissions.rb:142-143,
   *  precomputed in the engine's prepare phase — never a query here). */
  isDenied(card: RenderCard): boolean;
  /** ok_to_<task>? for the NON-read view tasks (ok_to_update?/create?/
   *  delete?, card-mod-permissions set/all/permissions.rb:148-157) —
   *  precomputed like isDenied, same undefined-means-unverifiable contract
   *  as canReadByRuleLookup. Optional: engines
   *  without it leave every non-read task unverified-allowed; the ported
   *  view registry carries no non-read view today, so the surface is
   *  unaffected either way. */
  taskAllowed?(card: RenderCard, task: Exclude<CrudTask, "read">): boolean | undefined;
  /** The createable gate of the :unknown / :mini_unknown views (card-mod-
   *  format set/all/html/error.rb `card.ok?(:create) ? yield : ""`): true
   *  only on a computed allow. Engines that compute missing verdicts after
   *  the render (RenderEngine) record the miss here. Optional: engines
   *  without it fall back to taskAllowed(card, "create") === true. */
  unknownCardCreatable?(card: RenderCard): boolean;
  /** A Sign up card's approval-link gates (card-mod-account
   *  set/type/signup/views.rb verification_links): can_approve? and the
   *  card's ok?(:delete). Undefined when not prepared (no links). */
  signupApprovalVerdict?(card: RenderCard): { approve: boolean; delete: boolean } | undefined;
  /** auth/permissions.rb:18-26 Auth.createable_types — the cardtype card
   *  names the viewer's create verdict admits (bot-scope cardtype search
   *  minus the non_createable_types basket codenames, then the per-type
   *  Card.new(type: name).ok?(:create) verdict, sorted), precomputed in the
   *  engine's prepare phase for the views whose body reaches it (the type
   *  editor's select). Optional: engines without it answer [], which
   *  collapses the select to the current-type push + the empty Custom
   *  group — the rules mod's documented headless-engine divergence
   *  (card-mod-rules.ts customTypes port). */
  createableTypes?(): string[];
  /** The page-chrome SESSION (Ruby Auth.current) the page surface reads —
   *  distinct from the read-verdict viewer (Auth.as_id). Ruby keys three
   *  page-chrome surfaces on the session, never on as_id:
   *  - `decko.signed_in` (head_javascript.rb view :script_variables),
   *  - the *account_links navbar branch (set/self/account_links.rb
   *    `Auth.signed_in?`, the my-card link label/href = Auth.current.name),
   *  - the loud-denial copy (html/error.rb:215-222 `when Auth.signed_in?`).
   *  Live serving has session == viewer (viewerFromToken resolves both from
   *  the same token), so engines that don't split the axes stay correct by
   *  omitting this field: undefined = signed-out chrome (the corpus surface,
   *  byte-identical to the pre-session render). The capture instrument
   *  splits the axes (Card::Auth.as(actor) inside a bot session) and sets
   *  this explicitly. */
  readonly pageSession?: ReadViewer;
  /** The signed-in *account_links navbar items (the <li> list), prepared on
   *  the page path while async fetches are legal (the session account name;
   *  known/virtual resolution for the three links — links.rb
   *  add_known_or_wanted_class). Set = the navbar renders the signed-in
   *  chrome verbatim; undefined = the signed-out pair. See navbar-views.ts. */
  readonly pageSessionAccountLinksHtml?: string;
  /** The current request's new-card arguments (Ruby's params[:type] and
   *  card hash for a card that does not exist yet); undefined when the
   *  request carries none. */
  readonly requestNewCard?: { typeId?: number };
  /** The prepared :my_card view body (account_links.rb:56-58 my_card — the
   *  account_dropdown arm, the raw btn-group; the roles arm rides the
   *  session roles the port does not carry yet). Set alongside
   *  pageSessionAccountLinksHtml; undefined = the signed-out blank (the
   *  view's denial :blank). */
  readonly pageSessionMyCardHtml?: string;
  /** The prepared account_dropdown with the session's role checkboxes
   *  (set/right/enabled_roles.rb checkbox_input), or the plain dropdown
   *  when the actor holds a single role; undefined when signed out. */
  readonly pageSessionRolesDropdownHtml?: string;
  /** The ensure_roles mutation seam (set/right/enabled_roles.rb:52): a view
   *  fn that has just consumed the roles-nest html marks the fill so the
   *  NEXT roles nest render of the SAME request serves the filled content
   *  input (Ruby's card object mutates mid-request; the fill does not cross
   *  the request boundary — the oracle's bare view ops pin blank fields).
   *  Optional: engines without a prepared session chrome never carry the
   *  roles nest. */
  markSessionRolesContentFilled?(): void;
  /** ok?(:update) for an arbitrary card, computed on demand (the page head's
   *  universal_edit_button perms: :update gate — card-mod-format
   *  set/all/html/head.rb:46). Optional: engines without it render the
   *  button only for always-ok viewers. Same false-denies contract as
   *  taskAllowed (undefined = unverifiable = allowed). */
  updateVerdictForCard?(card: RenderCard): Promise<boolean | undefined> | boolean | undefined;
  /** The menu help-popover resolver, when the composition installed one
   *  (help-popover.ts installHelpRules). Optional: engines without it render
   *  the help-less &nbsp; placeholder for every card. */
  readonly helpRules?: HelpRulesApi;
  /** Called when a nest resolves to an unknown card (fetch miss). Engines
   *  that track it (RenderEngine may record the key in a negative closure
   *  map) keep warm re-renders at zero queries; the render is byte-correct
   *  without it - the card does not exist and nothing prefetches. Optional
   *  so engines without the tracking hook still satisfy the interface. */
  reportUnknownCard?(key: string): void;
  /** Sync resolution of a compound name's LEFT card's type through the
   *  loaded *structure universe (the same walk the fetch layer's virtual
   *  hook runs). The TYPE_PLUS_RIGHT anchor consumes it when the left is
   *  not in the warm render map: Ruby's left_type reads the left card's
   *  type — for a virtual left ("X+*type" -> Set) the context card's type
   *  is the wrong card's type. Optional: engines without it keep the
   *  context-card fallback. */
  virtualLeftTypeName?(name: DeckoName): string | undefined;
  /** Enrich + memoize a card by name for an on-demand render path
   *  (the pointer/list core view reads items by name from db_content;
   *  the captured corpus bytes always resolve these to real cards, but
   *  the items are not always reachable from the closure walk the
   *  prefetch uses — an item referenced by plain text in db_content is
   *  not in the reference closure). Returns the enriched RenderCard or
   *  undefined for a fetch miss (the engine treats that like the
   *  unknown-card path: an empty slot). Optional: engines without
   *  it skip the enrichment and the render shows the empty-list
   *  fallback. */
  prepareItemForRender?(name: string): Promise<RenderCard | undefined> | RenderCard | undefined;
  /** The codename for the given type id (synchronous; reads the
   *  codename codehash the engine pre-folds). The before(:bar) hook
   *  uses this to detect Search-type cards (the codename registry is
   *  Ruby's authoritative source for SearchTypeID). Optional;
   *  engines without it fall back to a typeName check. */
  peekCodenameById?(typeId: number): string | undefined;
  /** The id for the given codename (synchronous; the same pre-folded
   *  codehash memo, Card::Codename.id). The VirtualSearch family’s
   *  assign_type :search_type (virtual_search.rb:14-16) resolves the
   *  Search type card’s id through this. Optional: engines without it
   *  leave the virtual search card’s typeId unset. */
  peekIdByCodename?(codename: string): number | undefined;
  /** The registered card NAME for a codenamed id (the codehash i2name map,
   *  codename.rb’s Lexicon.name of the id). The virtual search card’s
   *  typeName ("Search") reads here so slot attrs carry the type card’s
   *  actual name. Optional: engines without it leave typeName unset. */
  peekRegisteredNameForId?(id: number): string | undefined;
  /** The page head bytes the page renderer built for a page root
   *  (html/show.rb head_content -> the page card’s :head view bytes,
   *  page.ts headContent). set/self/head.rb:17’s `nest root.card,
   *  view: :head` reads this synchronously at view time — the page path
   *  has already built (and seats) the identical bytes for its own
   *  <head>. Optional: engines without it (or with the root not yet
   *  seated — non-page entry points) render "". */
  pageHeadBytesFor?(rootKey: string): string | undefined;
  /** All rule cards whose left_id equals the host card's id (Card.search
   *  left: id, limit: 0, sorted by content+name). The set-card Rules
   *  section core override (views.ts setRulesCoreHtml) reads this to
   *  build the per-category accordion. Optional: engines without it
   *  return an empty list (no rule rows — a degenerate Rules section
   *  still renders the h4 header + filter form, no accordion). */
  collectRules?(host: RenderCard): RenderCard[];
  /** Rule::All#rule_card_id over the preloaded deck-wide rule cache
   *  (lib/card/rule/cache.rb + rule/all.rb:66-74): the FIRST lookup key
   *  whose "<key>+<setting>" the cache answers, returning the winning
   *  rule's SET identity (cache.rb pattern_code + anchor name) so
   *  Set#label composes without a second lookup. Consumed by
   *  card-mod-rules setInfoHtml's find_existing_rule_card chain (the
   *  new-rule arm's existing_rule_from_prototype walk). Optional: engines
   *  without it render the "--" fallback (the pre-seam behavior). */
  ruleCacheSetLabelWinner?(
    lookupKeys: readonly string[],
    settingCode: string,
  ): { patternCode: string; anchorName: string | undefined } | undefined;
  /** The set's own *default rule card's TYPE ID from the preloaded
   *  full-deck *default universe (defaultRuleUniverseStatement) — the
   *  template leg's cold arm for setPrototypeTypeCode (views.ts
   *  defaultRuleTypeCode). Ruby's rule_card(:default) cascade
   *  (card-mod-content-0.20.0 set/all/templating.rb:27-39 template ->
   *  new_card_template; lib/card/rule/all.rb first-hit) is a DATA lookup
   *  with no render-warmth dependency, so a *default rule that exists in
   *  the deck but was never warmed into the render map (no earlier page
   *  rendered its set) must still resolve. Optional: engines without it
   *  keep the pre-fix not-allowed verdict for cold *default legs. */
  defaultRuleTypeIdForSetName?(setName: string): number | undefined;
  /** lib/card/rule/all.rb:32-51 — does the card satisfy rule? (its right
   *  part is a setting, its left part is a set)? The before(:bar) hook
   *  in format.ts reads this to add the _rule-item + _category-* classes
   *  the bar view needs (bar_view.rb:10). Optional; engines without it
   *  skip the rule class chain. */
  cardIsRule?(card: RenderCard): boolean;
  /** set/rule SET membership — the card's right part is a Setting
   *  (no left-type/3-part requirement; see RenderEngine#cardMatchesRuleSet).
   *  Gates the rule-bar behaviors (bar_view.rb:2-11): _rule-item classes,
   *  three-column bar cols, and the bar_nav hide split. Optional; engines
   *  without it fall back to the rule? predicate shape via cardIsRule. */
  cardMatchesRuleSet?(card: RenderCard): boolean;
  /** card-mod-rules set/type/set.rb #prototype.type_id's codename for a
   *  RULE card's set — the visible_settings input the categories machinery
   *  filters the restricted settings (content_options / content_option_view)
   *  by. Delegates to the SAME oracle-verified port the set-page board's
   *  restricted-setting filter runs (views.ts setPrototypeTypeCode). See
   *  RenderEngine#ruleSetPrototypeTypeCode. Optional: engines without it
   *  answer the restricted-settings recent arm as not-allowed (never
   *  allowed). */
  ruleSetPrototypeTypeCode?(card: RenderCard): string | undefined;
  /** view/permission.rb:38 `setting :unknown` for THIS card: the p20-nest-
   *  selection fix replaces the flat by-view-name lookup with the card's
   *  own set chain (loader.viewUnknownSettingForCard -> viewChain(setKeys,
   *  view) entries, first DEFINED `unknown` config wins — Ruby's method
   *  lookup takes the most specific set module that defined
   *  `_view_<view>__unknown`). Undefined = no loader, or no module declares
   *  the setting for this card+view (the caller then decides between
   *  :unknown and the compiled per-set decl stand-in via modDeckBound).
   *  Optional. */
  viewUnknownSettingForCard?(card: RenderCard, view: string): true | string | false | undefined;
  /** True when a mod deck is bound to this engine (the loader's chain walk
   *  is then the authority for `setting :unknown`; the compiled decl table
   *  must not fire — see viewForUnknown). Optional: engines without the
   *  hook are treated as loader-less. */
  modDeckBound?(): boolean;
  /** the find_existing_rule_card memo for virtual rule cards
   *  (editor.rb:119-131). True = a stored rule exists for this virtual's
   *  (set, setting); false = none; undefined = not preloaded. Consumed by
   *  prepareBar's `voo.hide :bar_nav unless existing_rule_card` and the
   *  one-line-content mini_unknown gate in rule-bar-right. */
  hasExistingRuleFor?(key: string): boolean | undefined;
  /** the resolved existing-rule CARD for a virtual rule card — the
   *  one-line content nest target of rule_short_content (bar_view.rb:39-44).
   *  Undefined = no existing rule (or not preloaded). */
  existingRuleFor?(key: string): RenderCard | undefined;
  /** Look up a card by its codename (the codehash id->codename reverse
   *  direction). Used by the set-card Rules section's virtual rule-card
   *  construction (card-mod-rules set/type/set/html_views/rule_lists.rb
   *  #setting_list_item constructs each setting's child via
   *  `Card.new(name: "#{set}+#{setting_card.name}")` — the engine needs
   *  the setting card's id, typeId, typeName and dbContent to build the
   *  equivalent virtual RenderCard (virtual-rule-card.ts). The engine
   *  prefetches every setting card via preloadAllSettingCards, so this
   *  lookup is cache-hit and synchronous (peekNameForId path). Optional;
   *  engines without it skip virtual rule-card construction and the
   *  missing-setting rows fall through to quietDenial (the pre-fix
   *  behavior, deep-read-rule-deny cluster 14). */
  findSettingCard?(codename: string): RenderCard | undefined;
  /** Synchronous render-card lookup BY ID - the render-card map is keyed
   *  by key, so this walks the map the same way findSettingCard does. The
   *  set-card Rules section's virtual rule-card construction resolves the
   *  DECK's type card at the corpus-pinned template id through this
   *  (virtual-rule-card.ts deckTypeCard): Ruby prints type_name/type_code
   *  of the deck's card at that id, and the deck's names are what the
   *  corpus oracle bytes carry. Optional; engines without it keep the
   *  map's raw-deck literal (the documented degradation). */
  findRenderCardById?(id: number): RenderCard | undefined;
  /** card-mod-rules set/type/setting.rb#set_classes_with_rules: for a
   *  setting-type card (e.g. *read, *create, *update), group the rules
   *  whose right part is this setting by the LEFT pattern class
   *  (*all / *all_plus / *right / *type_plus_right / *self),
   *  and mark each group anchorless when its pattern is unanchored
   *  (the *all and *all_plus classes). Drives the setting card's
   *  :core view (setting.rb:39-55): for each class with rules, emit
   *  `<p><h5>${klass.generic_label.downcase}</h5>` followed by the
   *  per-rule bar nest (or just `rules.first` view `:bar` with
   *  `show: [:full_name]` for the anchorless cases, where Ruby
   *  collapses the per-pattern group into a single full-name row).
   *  Optional; engines without it fall through to the raw-content
   *  dump (the pre-round-8 shape, the 3,612-line *read oracle ->
   *  empty content-view gap). */
  setClassesWithRules?(host: RenderCard): SettingClassWithRules[];
  /** THE SELF/HEAD CORE SEAM read (render.ts preparedHeadBytesFor): the
   *  prepare-phase head bytes for THIS render's root card, undefined when
   *  the render is not a *head surface (or the engine predates the seam —
   *  the stub harnesses). Optional like every engine hook here. */
  preparedHeadBytesFor?(rootKey: string): string | undefined;
  /** Round 9 (the new-child template type): the *default rule card's type
   *  for a nest-miss child NAME — the port of Ruby's new-card type
   *  resolution. Chain: format/nest/fetch.rb#new_card -> Card.fetch new:
   *  -> mod/core/set/all/type.rb:78-80 type_id_from_template ->
   *  `template&.type_id`, where for a NEW card the template is the
   *  *default rule card (card-mod-content set/all/templating.rb
   *  new_card_template). The raw-oracle pins the rendered bytes: absent
   *  "+Discussion" nest children carry data-card-type-id=3 RichText (the
   *  discussion+*right+*default rule card's own type) and absent "+tags"
   *  closed children carry TYPE-list (raw-oracle 9625/13421/14382 open
   *  views; live blog.html/Latest_News.html render the same shape).
   *  Optional; engines without it build type-less unknown cards (the
   *  pre-round-9 shape). */
  newCardDefaultType?(
    name: DeckoName,
    leftTypeName?: string,
  ): { typeId: number; typeName: string } | undefined;
  /** content/all.rb:17-19 standard_content's new_card branch — the winning
   *  *default rule card's db_content for a nest-miss new card
   *  (default_content = template&.db_content, mod/core set/all/content.rb:
   *  26-28). The SAME rule newCardDefaultType reads the type from.
   *  p20-nest-selection: an earlier class pins the applied form — the
   *  oracle's +discussion titled body is `discussion+*right+*default`'s
   *  `<p> </p>` x2 verbatim. Optional; engines without it keep the
   *  new-child dbContent "". */
  newCardDefaultContent?(name: DeckoName): string | undefined;
  /** card-mod-collection set/all/item.rb:149-162 — the HOST card's
   *  item_type_name for its rendered item slots. Ruby's nest_item ->
   *  item_view_options -> determine_item_view_options_type folds
   *  `options[:type] = card.item_type_name` into EVERY item nest (the
   *  slot JSON's `"type"` field rides voo.slot_options), and
   *  new_unknown_item_args (item.rb:245-248) types unknown items with the
   *  same value at fetch. The chain: Search/Set-typed hosts read their own
   *  cql :type (card-mod-search cql_search.rb:14-19); pointer/list hosts
   *  walk the options card (set/abstract/items.rb:5-11 + card-mod-layout
   *  options_api.rb options_card = rule_card(:content_options) ||
   *  right_type_options || Card[:all]). Resolved per host in the prepare
   *  phase (render.ts resolveHostItemTypeName); undefined = no item type.
   *  Optional; engines without it emit the earlier type-less item slots. */
  hostItemTypeName?(card: RenderCard): { typeName: string; typeId: number } | undefined;
  /** The precomputed permission verdicts for one UNKNOWN pointer/list item
   *  (the fetch-miss item lines the prepare phase's pointer walk found):
   *  `read` = canReadByRuleLookup on the phantom's pattern input (the
   *  oracle's radio item renders the FULL bar while the corpus's denied
   *  phantoms render the two-span body - the split IS Ruby's read rule),
   *  `create` = taskVerdictForCard(:create) (the unknown/mini_unknown
   *  views' createable gate, html/error.rb:19-21). Keyed per
   *  (RENDERING HOST key, item key): Ruby builds the fetch-miss phantom
   *  fresh per nest (Nest::Fetch#new_card), so each nest's own fold — its
   *  host's item type — decides its verdict; one host's fold never answers
   *  another host's item slot. Resolved in the prepare phase
   *  (render.ts ensurePointerItemVerdicts); undefined = the (host, item)
   *  pair was never walked (the legacy phantom bytes apply). */
  pointerItemVerdict?(
    hostKey: string,
    key: string,
  ): { read: boolean; create: boolean | undefined } | undefined;
  /** Seat one phantom item's deck-global read verdict from the RENDERING
   *  host's own fold (render.ts ensurePointerItemVerdicts computed it
   *  host-scoped; this publishes it under the bare item key so the
   *  phantom's inner views — bar_left/bar_menu, whose view gate re-reads
   *  the global map — see THIS nest's verdict, not a foreign host's
   *  earlier fold of the same item name). Depth-first rendering makes the
   *  seat + inner-read a per-nest pair, matching Ruby's fresh phantom per
   *  Nest::Fetch#new_card. */
  seatPhantomReadVerdict?(key: string, denied: boolean): void;
  /** p21 CQL the CQL item typing: the phantom-item VIRTUAL resolution
   *  (states.rb:65 known? = real? || virtual?; states.rb:44-50 virtual?
   *  = compound && structure.present?) for one UNKNOWN pointer/list item
   *  whose TYPE the seat knows (the host-resolved item type). Non-
   *  undefined => the phantom is VIRTUAL => KNOWN => Ruby's alter_unknown
   *  returns early (view/permission.rb:33) and the denial check runs on
   *  the requested :bar view itself — the plain quiet denial span;
   *  undefined => the phantom stays UNKNOWN => bar's unknown: :mini_bar
   *  substitution (bar.rb:9) — the mini_bar wrap with the two-span body.
   *  Optional; engines without it keep the legacy phantom bytes. */
  phantomVirtualStructure?(
    name: DeckoName,
    typeName: string | undefined,
    typeId: number | undefined,
  ): { ruleKey: string; templateContent: string; typeId?: number } | undefined;
  /** The effective `Cardio.config.default_html_view` (html.rb:17-19
   *  default_nest_view) for the CURRENT render surface: "content" while a
   *  page render is active (the production config the page capture
   *  applies, capture-dual-$1page-and-view.rb:344), "titled" otherwise
   *  (the railtie default, mod/format.rb:2 — the bare-render capture
   *  boot). See RenderFormat.defaultNestView for the full mechanism.
   *  Optional: engines without it take the railtie "titled" fallback. */
  defaultHtmlViewConfig?(): string;
  /** The effective `Card::Env.origin` (card-1.110.0 lib/card/env/
   *  serializable.rb:20-22 `Cardio.config.deck_origin ||
   *  "#{protocol}#{request&.host_with_port}"`): the DECK'S CONFIGURED
   *  origin (the capture assigns it per surface
   *  at capture-dual-$1page-and-view.rb:391-400, and the port reads it
   *  from the same kind of configuration through setDeckEnvironment), or
   *  "" when nothing is configured (railtie default nil + a requestless
   *  runner). `card_url` interpolates it, so this is what decides
   *  `/User` vs `https://configured.origin/User` for the :url / :id_url /
   *  :url_link views. See RenderFormat.envOrigin and
   *  render/deck-origin.ts for the full mechanism.
   *  Optional: engines without it take the requestless fallback "". */
  envOriginConfig?(): string;
  /** card-mod-format set/type/cardtype.rb:68-70 can_configure? —
   *  `Card.fetch(card, :type, :structure, new: {}).ok? :update`: the
   *  update-ok verdict on the card's *structure rule card, NOT on the card
   *  itself. The engine precomputes it in the prepare phase
   *  (render.ts ensureConfigureVerdict) so the synchronous render gate can
   *  resolve the predicate (view-perms.ts routes predicate tasks through
   *  viewPermissionDenial's predicateAllowed hook). undefined =
   *  unverifiable — the same allow contract as taskAllowed.
   *  Optional: engines without it leave the predicate unverified-allowed
   *  (the documented remainder). */
  canConfigure?(card: RenderCard): boolean | undefined;
  /** The deck's CDN/asset host for carrierwave cloud images
   *  (A-30): the endpoint live serves file URLs from —
   *  e.g. `https://production-storage.r1.cdn.objectstore.example`.
   *  The image core resolves `(bucket)/<id>/<file>.<ext>` content to
   *  `<host>/files/<id>/<file>-<variant>.<ext>`; when undefined the same
   *  /files shape renders host-relative. Deck-deployment config (Ruby's
   *  fog bucket host), never derivable from the corpus. */
  readonly imageCdnHost?: string | undefined;
  /** The deck's phantom (unknown pointer/list item) type identity — the deck
   *  config form of Ruby's `*all+*default` template type (see
   *  PhantomItemType). undefined = the deck configures no such rule and its
   *  unknown items carry no type chip and no type attributes. Deck-deployment
   *  config, never an engine constant: one deck's template type id/name is
   *  not every deck's. */
  readonly phantomItemType?: PhantomItemType | undefined;
  /** Cardio.config.file_storage's port (card-mod-carrierwave
   *  set/abstract/attachment/01_storage_type.rb:75-79): the attachment
   *  storage default the deck is configured with. The file :input view's
   *  no_upload? gate reads it live (web.rb:1-3); undefined = the deck
   *  default :local. Deck-deployment config. */
  readonly fileStorage?: "local" | "web" | "cloud" | "coded" | undefined;
  /** The render-time history seam bundle (src/card/history/render-seam.ts)
   *  for the CURRENT render, when its view is one of the history views
   *  (RenderEngine#HISTORY_SEAM_VIEWS). The card-mod-history views read it
   *  to fetch their own act/action/change rows — loaded in the async
   *  prepare half (RenderEngine#prepareHistoryRender), read synchronously
   *  here. Optional: engines without it register no history views. */
  historyRenderReader?(): import("../history/render-seam.js").HistoryRenderReader | undefined;
  /** The render-time ACT-SEARCH seam bundle (src/card/history/updater-seam.ts)
   *  for the CURRENT render, when its view is one of the updater-seam views
   *  (RenderEngine#UPDATER_SEAM_VIEWS - the two that reach :updated_by). The
   *  :updated_by view reads it for the DISTINCT update-actor cards of the
   *  rendered card (`Card.search(updater_of: {id: card.id})`,
   *  history_board.rb:11) — loaded in the async prepare half
   *  (RenderEngine#prepareUpdaterRender), read synchronously here. Optional:
   *  an engine without it leaves the reader undefined, which the view reads
   *  as "no updaters" (the empty-wrap shape, what a never-updated card
   *  renders anyway). */
  updaterRenderReader?(): import("../history/updater-seam.js").UpdaterRenderReader | undefined;
  /** The render-time follow seam bundle (src/card/follow/follow-render-seam.ts)
   *  for the CURRENT render, when its view is one of FOLLOW_SEAM_VIEWS. The
   *  follow/account views read the actor session (Ruby Auth.current — the
   *  EXPLICIT ACTOR BOUNDARY: resolved from engine.pageSession only), the
   *  card's followed? verdict, the User+*follow editor rows, and the
   *  closure deletions here, synchronously. Optional: engines without it
   *  render those views' signed-out arms. */
  followRenderBundle?(): import("../follow/follow-render-seam.js").FollowRenderBundle | undefined;
  /** The action-level ContentDiff memo (differ.rb:79-86 - the ivar lives
   *  on the cached Action record; engine-lifetime map). Optional: engines
   *  without it build a fresh diff per render (the toggle flag then never
   *  observes a prior render). */
  readonly historyDiffMemo?: Map<number, import("../history/content-diff.js").ContentDiff>;
}

/** One (klass, rules, anchorless) row of the setting-page rule
 *  classification. The `klass` is the PatternSpec from
 *  src/card/set-patterns/registry.ts; `rules` is the prepared cards
 *  whose right part equals the host setting and whose left part is the
 *  klass's patternCardName (e.g. for *read: rules with rightName "*read"
 *  and leftName "*all" / "*all plus" / "*type" / "*right" / "*type plus
 *  right" / "*self"); `anchorless` is true when the pattern ships no
 *  anchor_name (i.e. it's the *all / *all_plus shape). */
export interface SettingClassWithRules {
  klass: import("../set-patterns/registry.js").PatternSpec;
  rules: RenderCard[];
  anchorless: boolean;
}

// ---------------------------------------------------------------------------
// unknown-card view routing (view/permission.rb + the html view configs)
// ---------------------------------------------------------------------------

/** The html format's `unknown:` view configs (view/permission.rb:39
 *  `setting :unknown` -> AbstractFormat#view's `unknown:` option, stored as
 *  `_view_<view>__unknown` setting methods). Values: `true` renders the
 *  requested view as-is; a symbol names the substituted view.
 *
 *  PER-CARD-SET RESOLUTION (the p20-nest-selection fix): Ruby resolves
 *  `setting :unknown` through the CARD'S SET CHAIN — render.rb:55-57
 *  `try Card::Set::Format.view_setting_method_name(view, setting)` dispatches
 *  on the card's format class, so only the set modules THAT MATCH THIS CARD
 *  contribute. A flat view-name table cannot answer both directions of the
 *  nest-selection class at once: it globalized the discussion right's
 *  `open: true` (making every unknown-card `|open` nest render — the 10
 *  Research phantom `+Articles` slots) and had no `titled` answer (the 19
 *  Project `+discussion|titled` slots substituted to :unknown and vanished).
 *  The decls below therefore carry the SET TOKENS the declaring module's set
 *  matches (`setKeys` membership; undefined = an all-set declaration that
 *  reaches every card, the set/all/* bucket Ruby mixes into the base format
 *  class). Resolution is most-specific-set-first, mirroring Ruby's method
 *  lookup: a set-scoped decl beats an all-set decl for the same view.
 *
 *  All-set rows (the loader-less stand-in for the core mods' set/all
 *  declarations):
 *  card-mod-bar_and_box-0.20.0 set/all/bar.rb: bar.rb:15 (mini_bar),
 *  bar.rb:26 (bar_left), bar.rb:35-36 (bar_menu/bar_body), bar.rb:9 (bar ->
 *  mini_bar), bar.rb:20 (full_bar -> mini_bar), bar.rb:27-28 (bar_middle/
 *  bar_right -> blank), bar.rb:38 (closed -> mini_bar);
 *  card-mod-format-0.20.0 set/all/html/error.rb:21 (mini_unknown),
 *  html/views.rb:24,29 (raw_one_line_content/one_line_content ->
 *  mini_unknown), html/views.rb:67 (labeled -> labeled);
 *  card-mod-format-0.20.0 set/all/base.rb:101 (labeled_content ->
 *  mini_unknown), base.rb:105 (titled_content -> blank).
 *  Settings persist across same-module view redefinition (the setting is a
 *  define_method on the format module; ViewDefinition only redefines the
 *  view method itself), and base-format configs inherit into html (html
 *  does not redefine titled_content/labeled_content).
 *
 *  RETIRED: the flat table's `open: true` row. It transcribed the
 *  discussion right's per-set declaration (below) as a global. The oracle
 *  pins the opposite for a List-typed `+Articles` under Research
 *  (card-mod-format set/all/html/error.rb:10-12 `view :unknown` ->
 *  createable -> "" for the anonymous capture session): the nest emits
 *  NOTHING — an earlier class's 10 phantom `+Articles` open slots. */
interface UnknownViewDecl {
  view: string;
  /** true renders the requested view; a string names the substituted view. */
  config: string | true;
  /** setKeys tokens the declaring set matches (whole-token membership).
   *  undefined = all-set (applies to every card). */
  setTokens?: readonly string[];
  /** True for the declarations of a mod whose registrations the port
   *  compiled into the seed tables instead of wiring a manifest —
   *  bar_and_box (default-mod-deck.ts's wiring note: "its registrations
   *  are compiled into the engine's seed tables"). No chain walk can ever
   *  answer for such a module (there is no set module to carry the
   *  declaration), so on a loader-bound engine the compiled row remains
   *  the ONLY source of the setting, exactly as Ruby's bundled
   *  set/type/image.rb answers `setting :unknown` in every deck. The
   *  loader-bound lookup still consults these rows, token-scoped like the
   *  loader-less lane — the globalization defect the allSetOnly skip
   *  guards against applies to MOD-registered modules' rows, not these. */
  seedLayer?: boolean;
}

const UNKNOWN_VIEW_DECLS: readonly UnknownViewDecl[] = [
  // card-mod-comment-0.20.0 set/right/discussion.rb:1-6:
  //   %i[open open_content titled titled_content].each do |viewname|
  //     view viewname, unknown: true do voo.show :comment_box; super() end
  //   end
  // and :8-10 `view :core, unknown: true`. This is why a NONEXISTENT
  // +discussion renders its requested titled view with the *default rule's
  // content body (an earlier class's 19 Project pages; oracle slot
  // associative_inquiry-discussion-titled-view carries show:[titled,
  // comment_box] and body <p> </p> x2 = discussion+*right+*default's
  // db_content). The comment_box show flip itself is already open-coded in
  // the base views (views.ts openView/titledView rightName.key ===
  // "discussion" guards).
  { view: "open", config: true, setTokens: ["RIGHT-discussion"] },
  { view: "open_content", config: true, setTokens: ["RIGHT-discussion"] },
  { view: "titled", config: true, setTokens: ["RIGHT-discussion"] },
  { view: "titled_content", config: true, setTokens: ["RIGHT-discussion"] },
  { view: "core", config: true, setTokens: ["RIGHT-discussion"] },
  // card-mod-bar_and_box-0.20.0 set/type/image.rb:6-12: `view :boxed,
  // unknown: true` and `view :boxed_link, unknown: true`. An absent image
  // renders its box, and the box's core is the unknown view (a skin's
  // missing +Image offers its create link inside the box). bar_and_box
  // carries no mod-deck manifest (default-mod-deck.ts: its registrations
  // are compiled into the seed tables), so these rows are the only
  // `setting :unknown` source on a loader-bound engine — seedLayer keeps
  // them consultable there (the corpus's admin *search page: a skin bar's
  // absent +Image nests :boxed; without the declaration the view
  // substituted to :unknown and the whole box collapsed, where the oracle
  // renders the box with the unknown card's create link inside).
  { view: "boxed", config: true, setTokens: ["TYPE-image"], seedLayer: true },
  { view: "boxed_link", config: true, setTokens: ["TYPE-image"], seedLayer: true },
  // all-set rows
  { view: "mini_bar", config: true },
  { view: "mini_unknown", config: true },
  { view: "bar_left", config: true },
  { view: "bar_menu", config: true },
  { view: "bar_body", config: true },
  { view: "closed", config: "mini_bar" },
  { view: "bar", config: "mini_bar" },
  { view: "full_bar", config: "mini_bar" },
  { view: "bar_middle", config: "blank" },
  { view: "bar_right", config: "blank" },
  { view: "titled_content", config: "blank" },
  { view: "labeled", config: "labeled" },
  { view: "labeled_content", config: "mini_unknown" },
  { view: "one_line_content", config: "mini_unknown" },
  { view: "raw_one_line_content", config: "mini_unknown" },
  // card-mod-edit set/all/template_nest.rb:2 `view :template_nest, cache:
  // :never, unknown: true`. A :template-mode nest whose target does not
  // resolve must still render :template_nest (which answers from
  // voo.nest_syntax and needs no card) rather than :unknown.
  { view: "template_nest", config: true },
  // card-mod-format set/all/html/menu.rb:29 `view :board_link, unknown: true
  // do board_link end`. The captured `{{\_|board_link}}` nest (corpus 38250
  // `Cardtype+*type+*guide`, content+open) targets a NEW card whose name
  // `\_` keys to "" (cardname.rb:107-118 simple_key: `\` is outside
  // OK4KEY_RE `\p{Word}\*`, so `\_` gubs to `_` and splits away) - an
  // unknown card. Ruby's alter_unknown answers nil for this unknown-capable
  // view (permission.rb:38-40) and the denial check still runs; the new
  // card's read verdict denies (BasicCs+*type+*read = "Anyone Signed In",
  // Anonymous denied) and the nest renders the 76-byte quiet denial span.
  // LIVE-PROVEN 2026-10-03: example.com/Cardtype+*type+*guide
  // ?view=content|open render the span at "click its ellipses icon (...)"
  // in both the frozen capture and today's live bytes.
  { view: "board_link", config: true },
  // card-mod-format set/all/html/menu.rb `view :menu, denial: :blank,
  // unknown: true` (whose body answers "" for an unknown card). A signed-in
  // reader's bar menu over an absent +discussion renders nothing, where the
  // substituted :unknown view would render its create link.
  { view: "menu", config: true },
  // card-mod-comment set/all/comment.rb `view :comment_box, denial: :blank,
  // unknown: true, perms: :update`: an absent +discussion renders its create
  // form for an actor who may create it.
  { view: "comment_box", config: true },
  // card-mod-edit set/all/formgroup.rb:13 `view :read_formgroup, template:
  // :haml, unknown: true, wrap: :slot` — the p20-email-views read_form
  // field nests target virtual field cards (welcome email+*to et al.);
  // the loader-less page surface reads this compiled row where the mod
  // registry would answer (the flat readFormgroupBody in views.ts).
  { view: "read_formgroup", config: true },
  // The board/edit flat seam's unknown:true rows (the 422 surface) — the
  // flat view fns live in HTML_VIEWS, so the loader-less path needs the
  // same `setting :unknown` answers the manifest's per-module configs
  // give the chain walk:
  // - editing.rb:3 `view :board, perms: :update, unknown: true` and
  //   edit_content.rb:28 `view :edit, ... unknown: true` — a nest
  //   targeting an UNKNOWN card still dispatches the requested view
  //   (alter_unknown answers nil; the update denial check still runs).
  // - editing.rb:13 `view :cardboard, :board` (the manifest models the
  //   alias with unknown: true, cache: never).
  // - help.rb:6 `view :help, unknown: true` and guide.rb's `view :guide,
  //   unknown: true` — the frame_help renders inside the board/edit
  //   bodies on unknown-card nests too.
  // - tab_views.rb:47-49 `view :guide_tab, unknown: true`, tab_views.rb:
  //   22-31 `view :rules_tab, unknown: true`, form.rb's content_formgroups
  //   (manifest config unknown: true, cache: never).
  { view: "board", config: true },
  { view: "cardboard", config: true },
  { view: "edit", config: true },
  { view: "help", config: true },
  // card-mod-format set/all/html/menu.rb:8 `view :menu, denial: :blank,
  // unknown: true` (its body returns "" for an unknown card).
  { view: "menu", config: true },
  // card-mod-edit set/all/new.rb:4,23 — :new and :new_fields render for
  // the new card itself.
  { view: "new", config: true },
  { view: "new_fields", config: true },
  // card-mod-edit set/all/form.rb:26 `view :conflict_tracker, cache:
  // :never, unknown: true`.
  { view: "conflict_tracker", config: true },
  { view: "guide", config: true },
  { view: "guide_tab", config: true },
  { view: "rules_tab", config: true },
  { view: "content_formgroups", config: true },
  // form.rb:17-19 `view :content_formgroup, cache: :never, unknown: true`
  // and editor.rb's `view :input, unknown: true, cache: :never` (the
  // manifest's set/all/editor registration) — the edit-form field slots
  // dispatch these on unknown-card nests.
  { view: "content_formgroup", config: true },
  { view: "input", config: true },
  // card-mod-help set/all/help.rb:14-16 `view :help_text, unknown: true,
  // cache: :never` — an ALL-SET declaration, so the loader-less path needs
  // the same `setting :unknown` answer the manifest's config gives the
  // chain walk: a nest targeting an UNKNOWN card still dispatches
  // :help_text (alter_unknown answers nil; the view has no perms
  // directive). Companion to the help/guide rows above (help.rb:6 and
  // guide.rb:6) — the same base file, the same all-set status.
  { view: "help_text", config: true },
];

/**
 * The compiled half of `setting :unknown` for ONE card (view/permission.rb:
 * 38). Set-scoped decls win over all-set decls (Ruby's method lookup takes
 * the most specific module that DEFINED the `_view_<view>__unknown` method);
 * within the same scope the last declaration wins (module reopening).
 * Undefined = no declaration matches this card — Ruby's setting answers nil
 * and the view substitutes to :unknown (format/error.rb:23
 * `setting_view || :unknown`).
 *
 * `allSetOnly` bounds the lookup to the ALL-SET rows plus the SEED-LAYER
 * rows for a LOADER-BOUND engine: Ruby mixes the all-set format modules
 * into the base class of EVERY deck (registrar.rb:79-84
 * process_base_format_modules), so their declarations hold on top of any
 * loaded mod deck — and bar_and_box's set-scoped declarations (its module
 * is compiled into the seed tables, never registered) are answered by the
 * bundled set module in every Ruby deck too, so their compiled rows stay
 * live here, token-scoped. A set-scoped declaration of a MOD-REGISTERED
 * module (right/discussion's) must still come from the deck's own module
 * (the chain walk), never from this compiled stand-in, or it would
 * globalize again. The all-set rows model the core bar/format modules the
 * TS deck compiles instead of registering (there is no
 * card-mod-bar_and_box.ts — set/all/bar.rb's views are the compiled
 * HTML_VIEWS), so they are not "already answered" by the chain.
 */
function compiledUnknownSettingForCard(
  card: { setKeys: string },
  view: string,
  allSetOnly = false,
): string | true | undefined {
  const tokens = new Set(card.setKeys.split(/\s+/).filter((t) => t !== ""));
  if (!allSetOnly) {
    let scoped: string | true | undefined;
    for (const decl of UNKNOWN_VIEW_DECLS) {
      if (decl.view !== view || decl.setTokens === undefined) continue;
      if (decl.setTokens.some((t) => tokens.has(t))) scoped = decl.config;
    }
    if (scoped !== undefined) return scoped;
  } else {
    // Seed-layer modules' rows stay consultable on a loader-bound engine:
    // no chain walk can answer for a module the port compiled into the
    // seed tables (bar_and_box), and Ruby's bundled set module answers
    // `setting :unknown` in every deck. Still token-scoped — the same
    // whole-token membership the loader-less lane checks — so nothing
    // globalizes. See the seedLayer note on UnknownViewDecl.
    let seeded: string | true | undefined;
    for (const decl of UNKNOWN_VIEW_DECLS) {
      if (decl.view !== view || decl.seedLayer !== true || decl.setTokens === undefined) continue;
      if (decl.setTokens.some((t) => tokens.has(t))) seeded = decl.config;
    }
    if (seeded !== undefined) return seeded;
  }
  let all: string | true | undefined;
  for (const decl of UNKNOWN_VIEW_DECLS) {
    if (decl.view === view && decl.setTokens === undefined) all = decl.config;
  }
  return all;
}

/** Views with `perms: :none` - permission.rb#skip_check? short-circuits
 *  altered_view entirely, so unknown cards render them AS REQUESTED. From
 *  card-mod-format-0.20.0 set/all/title.rb:2 (title - survives the :title
 *  redefinition at :12: settings persist), :16, :20 (title_link,
 *  title_no_link), set/all/base.rb:14,31,35,39 (name, url_link, link,
 *  nav_link), base.rb:109 (blank), set/all/error.rb (denial, errors,
 *  server_error, not_found, bad_address), set/all/html/header.rb:5,15
 *  (header, header_title). Only the registry views among these matter for
 *  dispatch; the rest are listed for the record. */
const PERMS_NONE_VIEWS: ReadonlySet<string> = new Set([
  "title",
  "title_link",
  "title_no_link",
  "name",
  "url_link",
  "link",
  "nav_link",
  "header",
  "header_title",
  "blank",
  "denial",
  "errors",
  "server_error",
  "not_found",
  "bad_address",
]);

function normalizeView(view: string): string {
  return view; // Card::View.normalize (to_sym); TS views are strings already
}

/**
 * An error reproducing a Ruby raise whose oracle page embeds the debug page
 * (html/error.rb's backtrace_link title). The engine's own V8 stack is 8-10
 * frames (Node's Error.stackTraceLimit cap included); Ruby's
 * `exception.backtrace * "<br>\n"` is boot-inclusive, 51-168 frames on the
 * corpus's debug-span ops. The N6 canonicalization (reference-harness/
 * runner/normalize.mjs) replaces each `<br>\n`-separated frame line with its
 * marker and leaves the frame COUNT as the compared invariant — the count is
 * port-owned structure the raise site must satisfy (the N6 receipt: "the
 * raise sites must emit a Ruby-shaped frame structure"). The site therefore
 * declares the oracle's measured boot-inclusive depth (the committed capture
 * at reference-harness/fixtures/synthetic-v2/expected, re-verified live on
 * the capture host), and the debug page renders that many frame lines. The
 * lines' text is host-VM identity in N5's/N6's class — canonicalized away on
 * both sides — so the emitted lines are canonical placeholders, not a
 * replay of the capture's frames (the raise-posture receipt's rule).
 */
export interface RubyBacktraceError extends Error {
  rubyBacktraceFrames: string[];
}

export function rubyBacktraceError(message: string, oracleFrameDepth: number): RubyBacktraceError {
  const error: RubyBacktraceError = new Error(message) as RubyBacktraceError;
  error.rubyBacktraceFrames = Array.from(
    { length: oracleFrameDepth },
    (_, i) => `ruby-vm:0:in \`oracle backtrace frame ${i + 1}'`,
  );
  return error;
}

/** html/error.rb:47-49 `show_all_errors?`:
 *
 *     def show_all_errors?
 *       # make configurable by env
 *       Auth.always_ok? || Rails.env.development?
 *     end
 *
 * The engine runs the production posture everywhere (the oracle captures
 * render under `with_production_render`; no engine surface models a
 * development env), so the always-ok half is the whole predicate. It is
 * SESSION-global (Auth is a module singleton), so any format on the render
 * answers identically. */
function showAllErrors(fmt: RenderFormat | undefined): boolean {
  return fmt?.engine.peekAlwaysOk?.() === true;
}

/** html/error.rb:66-70 `error_message` — the debug page the admin-only
 *  title carries, over the raise's message and backtrace:
 *
 *     %{
 *       <h3>Error message (visible to admin only)</h3>
 *       <p><strong>#{CGI.escapeHTML exception.message}</strong></p>
 *       <div>#{exception.backtrace * "<br>\n"}</div>
 *     }
 *
 * The message escapes once here (CGI.escapeHTML == the h() table) and once
 * more when backtrace_link builds the title attribute (Rails' content_tag
 * html_escape), which is why the capture's embedded quotes read &amp;#39;.
 * The frames are the ENGINE's own stack (Ruby embeds its own backtrace);
 * the instrument's N5 canonicalization blanks the machine-specific path
 * tokens on both sides and N6 replaces each frame line with its marker, so
 * the compared residual is the frame COUNT - the engine's V8 stack depth
 * against Ruby's boot-inclusive backtrace (the debug-span pins' recorded
 * residual). An error carrying a declared Ruby-shaped frame structure
 * (rubyBacktraceError — the raise sites that reproduce an oracle failure
 * under the reproduced-upstream-failure ruling) renders that structure
 * instead, satisfying the N6 count invariant. */
function errorDebugPage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const declared = (error as Partial<RubyBacktraceError>).rubyBacktraceFrames;
  const frames =
    declared !== undefined
      ? declared
      : error instanceof Error && typeof error.stack === "string"
        ? error.stack.split("\n").slice(1).map((line) => line.trim())
        : [];
  return (
    "\n      <h3>Error message (visible to admin only)</h3>\n" +
    `      <p><strong>${h(message)}</strong></p>\n` +
    `      <div>${frames.join("<br>\n")}</div>\n    `
  );
}

/** html/error.rb:72-74 `backtrace_link`:
 *
 *     wrap_with(:span, title: error_message(exception)) { cardname }
 *
 * over error.rb:42-45 `error_cardname`'s show_all_errors? arm — the safe
 * cardname becomes a span whose title carries the debug page. The content
 * block is NOT escaped (Ruby's wrap_with emits block content verbatim);
 * the title attribute escapes once through h(). */
function backtraceLink(card: RenderCard, error: unknown): string {
  return `<span title="${h(errorDebugPage(error))}">${h(card.name.s)}</span>`;
}

/** The hex object-address token Ruby's NoMethodError/NameError messages
 *  embed when they inspect the receiver ("for #<Card:0x0000028dfcc01048>").
 *  The engine has no heap addresses; the instrument's N5 canonicalization
 *  blanks the hex run on BOTH sides (normalize.mjs HEAP_ADDRESS), so the
 *  port derives a stable pseudo-address from the object's id — the
 *  inspection token stays shape-true (0x + a hex run) without pretending
 *  to be a heap pointer. Shared by the view-body raise sites that port
 *  Ruby runtime errors carrying inspected receivers. */
export function rubyInspectionAddress(id: number | undefined): string {
  const n = id === undefined ? 0 : (id * 0x9e3779b1) >>> 0;
  return "0x" + n.toString(16).padStart(8, "0");
}

/**
 * html/error.rb:99-101 `rendering_error`:
 *
 *     def rendering_error exception, view
 *       wrap_with(:span, class: "render-error alert alert-danger") { super }
 *     end
 *
 * over format/error.rb:80-86, which returns the exception message verbatim
 * for a UserError (`unsupported_view_error_message` is the one that reaches
 * here in practice, error.rb:52-54) and otherwise the `lib_error_rendering`
 * locale line — `Error rendering: <cardname> (<view> view)`, where
 * error_cardname's ADMIN arm (html/error.rb:42-45, show_all_errors?) wraps
 * the cardname in backtrace_link's title span (see backtraceLink).
 *
 * Shared by the three rescue scopes that mirror Ruby's per-`render!`
 * `wrap_and_render` (render.rb:96-100): nest()'s, the `render_<view>`
 * delegation's (RenderFormat#renderDelegated), and the bare view-lane
 * root's (renderView's viewLaneRoot catch) — plus renderPointerListItem's
 * per-item rescue (views.ts), the item subformat's own render!. One
 * helper, so the scopes cannot drift. `fmt` feeds the admin arm only;
 * every scope holds a format on the same session, so any of them answers
 * identically.
 */
/** MODULE-EXPORTED for renderPointerListItem's per-item rescue (views.ts):
 *  the item nest is the item subformat's own render!, whose rescue is the
 *  same span builder — one helper, so the nest/delegation/item/root scopes
 *  cannot drift. */
export function quietRenderError(
  error: unknown,
  card: RenderCard,
  view: string,
  fmt?: RenderFormat,
): string {
  const msg =
    error instanceof UnsupportedViewError ||
    error instanceof TooDeepError ||
    error instanceof CodenameNotFoundError
      ? error.message
      : showAllErrors(fmt)
        ? `Error rendering: ${backtraceLink(card, error)} (${view} view)`
        : `Error rendering: ${h(card.name.s)} (${view} view)`;
  return `<span class="render-error alert alert-danger">${msg}</span>`;
}

/** View.normalize_list (visibility.rb:89) — a visibility option value is
 *  one view name or an array of them. */
function normalizeVisibilityList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  return typeof value === "string" ? [value] : [];
}

// ---------------------------------------------------------------------------
// Card::Setting category membership (card-mod-rules set/type/set/
// setting_categories.rb:6-7): the per-category setting lists that drive
// the "_category-all", "_category-common", "_category-field" class chain
// the bar view adds to rule cards (bar_view.rb:10 + editor.rb:54-58).
// ---------------------------------------------------------------------------

/** card-mod-rules set/type/set/setting_categories.rb:6 COMMON_SETTINGS.
 *  EXPORTED for the flat bar_setting_list body (views.ts — the graded
 *  page-surface harness binds no loader, so the Set::Type::Set view lives on
 *  the flat record; see barSettingListBody). */
export const COMMON_SETTINGS: ReadonlySet<string> = new Set([
  "create", "read", "update", "delete", "structure", "default", "guide",
]);

/** card-mod-rules set/type/set/setting_categories.rb:7 FIELD_SETTINGS.
 *  EXPORTED for views.ts barSettingListBody (same seam note). */
export const FIELD_SETTINGS: ReadonlySet<string> = new Set([
  "default", "help", "input_type", "content_options", "content_option_view",
]);

/** set/type/set.rb:73-85 visible_setting_codenames —
 *  the setting_opts REGISTRY (Card::Setting.groups). Gem-complete census
 *  across the installed gems: exactly these 23 codenames
 *  register. *table of contents and *comment have NO set/self/*.rb in any
 *  gem — never in the groups — so the recent intersection drops them (the
 *  R16-era static RECENT_SETTINGS const carried both and is retired; the
 *  corpus-derived membership lives in the deck's *recent settings card,
 *  read live by recentSettingCodenames). */
export const REGISTERED_SETTING_CODENAMES: ReadonlySet<string> = new Set([
  "autoname",                                            // card-1.110.0 mod/core
  "create", "delete", "read", "update",                  // card-mod-permissions
  "default", "structure",                                // card-mod-content
  "input_type",                                          // card-mod-edit
  "follow", "follow_fields",                             // card-mod-follow
  "guide", "help",                                       // card-mod-help
  "on_create", "on_delete", "on_update", "thanks",       // card-mod-integrate
  "head", "layout",                                      // card-mod-layout
  "content_options", "content_option_view",              // card-mod-list
  "captcha",                                             // card-mod-recaptcha
  "script",                                              // card-mod-script
  "style",                                               // card-mod-style
]);

/** card-mod-list set/self/content_options.rb:2 + content_option_view.rb:2 —
 *  restricted_to_type: %i[list pointer session]. The ONLY restricted
 *  registrations in the installed gems (setting.rb:74-77
 *  applies_to_cardtype: an unrestricted registration applies to every
 *  cardtype) — the same census as views.ts SETTING_RESTRICTED_TO_TYPE (the
 *  board filter's copy; a format->views import would close a value cycle,
 *  so the two-entry table lives here too). Compared against the set
 *  prototype's type codename (RenderEngineLike#ruleSetPrototypeTypeCode). */
const RESTRICTED_TO_TYPE: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["content_options", new Set(["list", "pointer", "session"])],
  ["content_option_view", new Set(["list", "pointer", "session"])],
]);

// ---------------------------------------------------------------------------
// Wiki-link expansion ([[Target]] / [[Target|label]]) — the format/content
// pass that translates Markdown-style wiki-links into the same known-card
// anchor shape the origin bridge used to inject client-side. We emit the
// anchor directly from the engine so the bridge can retire.
// ---------------------------------------------------------------------------

/** The INNER content of Ruby's `wrapped_title` span (card-mod-format-0.20.0
 *  set/all/title.rb:38-42 `wrap_with :span, class: classy("card-title"),
 *  title: title do title.to_name.parts.join wrapped_joint end`, with
 *  `wrapped_joint` :44-46 = `wrap_with :span, (voo.joint || "+")`).
 *
 *  EVERY card-title span in the corpus is wrapped_title — the html :title
 *  view (title.rb:11-22) and, through it, `link_view`'s link text
 *  (set/all/base.rb:35-46 `link_to_card card.name, _render_title`) and the
 *  Link chunk (card-mod-content-0.20.0 lib/card/content/chunk/link.rb:31-33
 *  `options title: link_text || @name.to_name.fully_stripped`, :71-75
 *  `format.nest referee_name, options.merge(view: :link)`). So the split is
 *  not a title-view decoration: it is what every junction link's anchor
 *  text carries, in the body content pass as much as in a title.
 *
 *  The split itself: `parts` are `Cardname.split_parts`
 *  (cardname-0.20.0 lib/cardname/class_methods.rb:46-48 — a split on the
 *  joint with surrounding whitespace CONSUMED and a limit of -1, so
 *  leading/trailing empties are KEPT; `JOINT_RE` is `Regexp.escape joint`
 *  — cardname.rb:38 — a literal plus sign for the default joint).
 *  That -1 limit is why a leading-joint title (`+musings`, the relative
 *  form `title.from(*context_names)` produces — card-1.110.0
 *  lib/card/format/context_names.rb:49-54) renders a LEADING joint span.
 *
 *  The joint span carries NO class in the corpus: `classy("joint")`
 *  (card-1.110.0 lib/card/view/classy.rb:50-53) joins "joint" with the
 *  extra classes, but the frozen record carries 102,508 bare `<span>+</span>`
 *  and ZERO `class="joint"` across all 96 expected-v2 shards. (The two
 *  `<span class="joint">+</span>` emitters in the port — card-mod-tabs.ts:326
 *  and the rules `jointClass` override at src/card/rules/apply.ts:128-132 —
 *  are a separate divergence; apply.ts rewrites the bare form, which is the
 *  oracle shape.)
 *
 *  ORACLE CENSUS (all 96 expected-v2 shards, 48 page-surface + 48 view-surface,
 *  sha-verified copies): 145,260 `card-title` spans, 61,309 of them
 *  carrying a `+` in the title attribute — for 145,258 of the 145,260 the
 *  inner content is byte-equal to this function's output; the 2 exceptions
 *  are the `html_safe` explicit-title arm (title.rb:32-36: authored
 *  entities survive UNESCAPED in the inner — title `Pages tagged with
 *  &quot;Process Arts&quot;` over inner `Pages tagged with "Process Arts"`),
 *  not joint-related. No oracle title puts whitespace next to a joint, so
 *  the `\s*` consumption is unobserved but faithful. */
export function wrappedTitleInner(title: string): string {
  return title.split(/\s*\+\s*/).join("<span>+</span>");
}

/** card-mod-format set/all/content/chunk/link.rb wiki-link pass (the plain
 *  text-piece half; link-wrapped nests span pieces and go through
 *  RenderFormat#renderLinkChunk instead): `[[Target]]` and
 *  `[[Target|label]]` become the Link chunk's anchor bytes. Backslash
 *  escaping (`\[\[`) is honored so a literal `[[` survives when the author
 *  means the markdown brackets and not a card link.
 *
 *  THE TARGET ATOM ADMITS A WHOLE NEST. `[[/new/{{_self|linkname}}|label]]`
 *  carries a PIPE INSIDE the target, and a bare `[^…|]` class split at that
 *  pipe: target `/new/{{_self`, label `linkname}}|add a {{_self|name}} card`
 *  (measured on the oracle's own source line). Ruby splits at the divider
 *  index of the RAW `[[...]]` span, where the nest is opaque — so the atom is
 *  `(?:[^\[\]\n|{]|\{\{[^{}]*\}\})+?`: any ordinary char, or a whole `{{…}}`
 *  consumed as one unit.
 *
 *  The `{` EXCLUSION is load-bearing, not cosmetic. With `{` left in the
 *  literal arm the lazy quantifier never reaches the nest arm — the shortest
 *  target `/new/{{_self` is reachable char by char, matches, and the change is
 *  a no-op (measured: new and old agreed on 9/9 cases). Excluding `{` forces
 *  `{{` down the nest arm, so the nest's own `|` is inside the target. The
 *  two arms stay disjoint on their first character, so there is no ambiguous
 *  path. A MALFORMED nest (`[[a{{b|c]]`, no closing braces) now fails to match
 *  where the old class matched a truncated target — the old match was itself
 *  the bug. */
const WIKI_LINK_REGEXP =
  /\\?\[\[((?:[^\[\]\n|{]|\{\{[^{}]*\}\})+?)(?:\|([^\[\]\n]+?))?\]\]/g;

// card-mod-content lib/card/content/chunk/uri.rb -- the THREE URI chunk
// classes (Uri / HostUri / EmailUri) ride the DEFAULT chunk list
// (card-1.110.0 lib/card/content/chunk.rb:84-86: `%i[Uri HostUri EmailUri
// EscapedLiteral Nest Link]`), so bare URLs and host.tld names in content
// autolink through link_to_resource (card-mod-format set/all/links.rb
// html block: target="_blank" for external-link + the resource_type
// class). The parser (content/parser.rb) consumes the EARLIEST chunk
// match first, so a wiki-link span that starts before a URI swallows it
// (the URI inside [[...]] never chunks) -- the combined scanner below
// walks positions and handles whichever class matches first.
// REJECTED_PREFIX_RE context (uri.rb:30-32 + context_ok? :53-56): the two
// chars before the match must not end !, ": ", ', or ](. Trailing
// punctuation (uri.rb:66-73): a final `, . ) ! ? :` chops off the match
// and re-attaches AFTER the anchor; a remaining trailing dot strips.
// `(?:&nbsp;)+` runs vanish from the match. Observed-form guard
// (corpus-wide): the expected bytes carry ZERO autolinks inside an
// existing HTML tag (0 `href="...<a` manglings across all 48 view-surface
// shards), so the scanner skips matches between < and >.
//
// TRAILING WORD BOUNDARY (host + email classes; the
// ms.paula fix, page 11251): Ruby's prefix_re carries a `\b` after the
// pattern for BOTH classes -- HostUri: `(?:(?!#{REJECTED_PREFIX_RE})#{HOST})\b`
// (uri.rb:123-127) and EmailUri: `(?:(?!#{REJECTED_PREFIX_RE})#{EMAIL})\b`
// (uri.rb:83-90). Without it the engine autolinked `ms.pa` INSIDE
// `ms.paula` (label `ms.` + TLD `pa`, the trailing `ula` left plain) where
// the oracle leaves the whole string plain: `a`->`u` is word->word, so
// Ruby's `\b` fails the prefix match and no chunk registers. The Uri
// (scheme) class carries NO `\b` in Ruby (uri.rb:38-42) and the scheme
// regexp below has none either.
//
// TLD LIST (the HOST alternation is Ruby's GENERIC+COUNTRY verbatim,
// uri.rb:103-121): the engine carried `me` (not in the gem's COUNTRY
// list -- the gem goes md|mg) and lacked `si` (gem: sh|si|sj). Both flip
// engine-only autolink decisions, so both were divergence, not
// optimization: a `.me` host autolinked where the oracle leaves plain, a
// `.si` host left plain where the oracle autolinks. The list below is the
// gem's order with those two corrected.
const URI_SCHEME_REGEXP =
  /(?:irc|http|https|ftp|ssh|git|sftp|file|ldap|ldaps|mailto):/g;
const URI_HOST_REGEXP =
  /(?:[a-zA-Z\d](?:[-a-zA-Z\d]*[a-zA-Z\d])?\.)+(?:aero|biz|com|coop|edu|gov|info|int|mil|museum|name|net|org|ad|ae|af|ag|ai|al|am|an|ao|aq|ar|as|at|au|aw|az|ba|bb|bd|be|bf|bg|bh|bi|bj|bm|bn|bo|br|bs|bt|bv|bw|by|bz|ca|cc|cf|cd|cg|ch|ci|ck|cl|cm|cn|co|cr|cs|cu|cv|cx|cy|cz|de|dj|dk|dm|do|dz|ec|ee|eg|eh|er|es|et|fi|fj|fk|fm|fo|fr|fx|ga|gb|gd|ge|gf|gh|gi|gl|gm|gn|gp|gq|gr|gs|gt|gu|gw|gy|hk|hm|hn|hr|ht|hu|id|ie|il|in|io|iq|ir|is|it|jm|jo|jp|ke|kg|kh|ki|km|kn|kp|kr|kw|ky|kz|la|lb|lc|li|lk|lr|ls|lt|lu|lv|ly|ma|mc|md|mg|mh|mk|ml|mm|mn|mo|mp|mq|mr|ms|mt|mu|mv|mw|mx|my|mz|na|nc|ne|nf|ng|ni|nl|no|np|nr|nt|nu|nz|om|pa|pe|pf|pg|ph|pk|pl|pm|pn|pr|pt|pw|py|qa|re|ro|ru|rw|sa|sb|sc|sd|se|sg|sh|si|sj|sk|sl|sm|sn|so|sr|st|su|sv|sy|sz|tc|td|tf|tg|th|tj|tk|tm|tn|to|tp|tr|tt|tv|tw|tz|ua|ug|uk|um|us|uy|uz|va|vc|ve|vg|vi|vn|vu|wf|ws|ye|yt|yu|za|zm|zr|zw|eu)\b/g;
// Ruby's EmailUri PREFIX is the local part + "@" only (uri.rb:81-90: EMAIL
// then \b AFTER the @) - the full extent comes from URI_FULL_REGEXP below,
// so the domain is NOT part of the candidate.
const URI_EMAIL_REGEXP = /[a-zA-Z\d](?:[-a-zA-Z\d.]*[a-zA-Z\d])?@\b/g;
// uri.rb:38 REJECTED_PREFIX_RE = %w{! ": " ' ](}.map { |s| Regexp.escape s }
// * "|" - the %w literal whitespace-splits into FIVE elements ["!", "\":",
// "\"", "'", "]("] (the author's `": "` intent degrades into `":` plus a
// BARE double quote), so the escaped alternation is `!|":|\"|'|\]\(`, and
// uri.rb:54 anchors it at END: `preceding_string !~ /(?:#{REJECTED_PREFIX_RE})$/`.
// The $ matters exactly where the oracle autolinks INSIDE authored markup:
// a URL in the LABEL of a literal `<a href="X">URL</a>` is preceded by
// `">` - the two-char window CONTAINS a quote but does not END with one,
// so Ruby autolinks it (the nested-anchor oracle bytes: the synthetic deck's
// card B's `(<a href="http://example.net/"><a target=...>`), while a URI
// inside a quoted attribute is preceded by `="` - ends with `"` - and is
// rejected (73 quoted src="..." regions across the view-surface oracle, ZERO
// anchored). The unanchored port regex rejected BOTH classes; the $
// restores Ruby's split.
const URI_REJECTED_PREFIX = /(?:!|":|"|'|]\()$/;
const URI_TRAILING_PUNCTUATION = new Set([",", ".", ")", "!", "?", ":"]);
/** uri.rb:43-44 + uri.rb:83/126 full_re = /\A#{URI::DEFAULT_PARSER.make_regexp(SCHEMES)}/.
 *  THE EXTENT RULE: the prefix only SELECTS a candidate; this full URI
 *  regexp - run over prepend_str + the content slice - decides how many
 *  bytes the chunk consumes (the scheme/host body continues through
 *  path/query/fragment per the RFC 2396 productions). Transcribed from
 *  Ruby 3.3.0's URI::DEFAULT_PARSER.make_regexp (Regexp#to_s with the /x
 *  wrapper group removed, `(?-mix:` -> `(?:`, `\h` -> `[0-9a-fA-F]`,
 *  `(?#...)` comments and free-spacing whitespace dropped) and validated
 *  byte-identical against the Ruby regexp on scheme+path, quoted-stop,
 *  entity-swallow, and userinfo/host/port forms. */
const URI_FULL_REGEXP_SOURCE =
  '(?=(?:irc|http|https|ftp|ssh|git|sftp|file|ldap|ldaps|mailto):)([a-zA-Z][\\-+.a-zA-Z\\d]*):(?:((?:[\\-_.!~*\'()a-zA-Z\\d;?:@&=+$,]|%[a-fA-F\\d]{2})(?:[\\-_.!~*\'()a-zA-Z\\d;\\/?:@&=+$,\\[\\]]|%[a-fA-F\\d]{2})*)|(?:(?:\\/\\/(?:(?:(?:((?:[\\-_.!~*\'()a-zA-Z\\d;:&=+$,]|%[a-fA-F\\d]{2})*)@)?(?:((?:(?:[a-zA-Z0-9\\-.]|%[0-9a-fA-F][0-9a-fA-F])+|\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}|\\[(?:(?:[a-fA-F\\d]{1,4}:)*(?:[a-fA-F\\d]{1,4}|\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3})|(?:(?:[a-fA-F\\d]{1,4}:)*[a-fA-F\\d]{1,4})?::(?:(?:[a-fA-F\\d]{1,4}:)*(?:[a-fA-F\\d]{1,4}|\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}))?)\\]))(?::(\\d*))?))?|((?:[\\-_.!~*\'()a-zA-Z\\d$,;:@&=+]|%[a-fA-F\\d]{2})+))|(?!\\/\\/))(\\/(?:[\\-_.!~*\'()a-zA-Z\\d:@&=+$,]|%[a-fA-F\\d]{2})*(?:;(?:[\\-_.!~*\'()a-zA-Z\\d:@&=+$,]|%[a-fA-F\\d]{2})*)*(?:\\/(?:[\\-_.!~*\'()a-zA-Z\\d:@&=+$,]|%[a-fA-F\\d]{2})*(?:;(?:[\\-_.!~*\'()a-zA-Z\\d:@&=+$,]|%[a-fA-F\\d]{2})*)*)*)?)(?:\\?((?:[\\-_.!~*\'()a-zA-Z\\d;\\/?:@&=+$,\\[\\]]|%[a-fA-F\\d]{2})*))?)(?:\\#((?:[\\-_.!~*\'()a-zA-Z\\d;\\/?:@&=+$,\\[\\]]|%[a-fA-F\\d]{2})*))?';const URI_FULL_REGEXP = new RegExp(URI_FULL_REGEXP_SOURCE);

interface UriMatch {
  start: number;
  end: number;
  /** the anchor href (resource) -- http:// prepended for bare hosts. */
  href: string;
  /** the anchor text (link_text -- scheme stripped for host/email forms). */
  text: string;
  /** links.rb resource_type -> the class; "external-link" adds target. */
  resourceType: string;
  /** uri.rb:63-68 @trailing_punctuation - the [,.)!:?] char chopped off
   *  the match, re-emitted AFTER the anchor by process_uri_chunk
   *  (uri.rb:86-89 `"#{link}#{@trailing_punctuation}"`). "" when the
   *  match did not end in punctuation. */
  trailing: string;
}

/** The next URI-class match at/after `from`, or undefined. Ruby's parser
 *  walk (content/parser.rb#match_prefices + record_chunk + uri.rb
 *  full_match), transcribed two-phase:
 *
 *  1. PREFIX SELECTION: the earliest match among the three registered
 *     prefix_res - Uri (scheme+":"), HostUri (host body + \\b), EmailUri
 *     (local part + "@" + \\b) - registration order breaking ties. A prefix
 *     only SELECTS a candidate position.
 *  2. FULL EXTENT: `full_match` (uri.rb:45-54) prepends the class's
 *     prepend_str ("http://" host / "mailto:" email / none for schemes,
 *     whose prefix already ends in ":") and runs URI_FULL_REGEXP anchored
 *     at the candidate; the match MINUS the prepend is the chunk's byte
 *     span. A full-match failure advances ONE character (parser.rb
 *     `@position += 1`) and rescans.
 *  3. CONTEXT VERDICT AFTER THE ADVANCE: record_chunk (parser.rb:75-99)
 *     moves past the match end BEFORE `context_ok?` (uri.rb:47-49 - the
 *     two preceding characters against REJECTED_PREFIX_RE, whose
 *     bare-quote element rejects every URI inside a quoted HTML
 *     attribute). A context-rejected candidate CONSUMES its whole span -
 *     the span becomes plain interval text and scanning resumes at its
 *     end, so nothing inside it (the www.youtube.com host inside the
 *     rejected https:// URI of the What Do We Need To Know?+discussion
 *     oracle) is ever reconsidered. The former engine guard that skipped
 *     "URIs inside HTML tags" was a corpus approximation of exactly this
 *     mechanism and is gone: the rejected-prefix rule IS Ruby's rule. */
function findUriMatch(text: string, from: number): UriMatch | undefined {
  const prefixes: Array<[RegExp, "scheme" | "host" | "email", string]> = [
    [URI_SCHEME_REGEXP, "scheme", ""],
    [URI_HOST_REGEXP, "host", "http://"],
    [URI_EMAIL_REGEXP, "email", "mailto:"],
  ];
  let pos = from;
  for (;;) {
    // PREFIX SELECTION: the earliest prefix match across the three classes
    // (registration order Uri, HostUri, EmailUri breaks ties).
    let bestStart = -1;
    let bestKind: "scheme" | "host" | "email" | undefined;
    for (const [regexp, kind] of prefixes) {
      regexp.lastIndex = pos;
      const m = regexp.exec(text);
      // m.index is ABSOLUTE (lastIndex seeded the scan): no pos offset.
      if (m !== null && (bestStart === -1 || m.index < bestStart)) {
        bestStart = m.index;
        bestKind = kind;
      }
      regexp.lastIndex = 0;
    }
    if (bestStart === -1 || bestKind === undefined) return undefined;
    const prepend = prefixes.find(([_, kind]) => kind === bestKind)![2];
    // FULL EXTENT (uri.rb full_match): the prefix only selects; the full
    // URI regexp over prepend_str + slice decides the chunk's byte span.
    const full = URI_FULL_REGEXP.exec(prepend + text.slice(bestStart));
    if (full === null || full[0].length <= prepend.length) {
      // parser.rb: no full match -> look at the next character
      pos = bestStart + 1;
      continue;
    }
    const end = bestStart + full[0].length - prepend.length;
    // record_chunk advanced past the match BEFORE the context verdict: a
    // rejected span is consumed whole (plain bytes), never re-scanned.
    if (bestStart >= 2 && URI_REJECTED_PREFIX.test(text.slice(bestStart - 2, bestStart))) {
      pos = end;
      continue;
    }
    // uri.rb interpret, gem order, with the TWO distinct post-interpret
    // strings: chunk (match[0], prepend included) becomes @link_text —
    // &nbsp; strip, ONE trailing-punctuation chop, then the single
    // trailing-dot strip (uri.rb:69, a REAL removal) — while @text (the
    // raw span, prepend excluded) takes ONLY the punctuation chop. The
    // anchor's href is @link_text but its TEXT is process_text, which is
    // @link_text for the Uri class yet the chopped @text for Host/EmailUri
    // — so the host-span oracle's bare-host span
    // `sample-host.example/resources.)` renders the DOT inside the anchor
    // text (`...resources.</a>)`) while the href drops it. The earlier
    // single-chunk form dropped the dot from both.
    const rawSpan = text.slice(bestStart, end);
    let chunk = prepend + rawSpan;
    const lastChar = chunk.slice(-1);
    let trailing = "";
    let choppedRaw = rawSpan;
    if (URI_TRAILING_PUNCTUATION.has(lastChar)) {
      trailing = lastChar;
      chunk = chunk.slice(0, -1);
      choppedRaw = choppedRaw.slice(0, -1);
    }
    chunk = chunk.replace(/(?:&nbsp;)+/g, "");
    chunk = chunk.replace(/\.$/, "");
    if (chunk === "") {
      pos = end;
      continue;
    }
    // REVERTED (2026-10-09): the uri.rb:72-77 `rescue ::URI::Error` port —
    // a URI.parse-invalid chunk (brackets/braces/angle quotes and bad
    // percent escapes, boundary probed against the 3.3.0 gem's RFC3986
    // parser) rendered as verbatim @text — reproduced the depth-psychology
    // oracle's plain-text `[mailto:reader@sample-site.example]`
    // but destabilized the +*referred_to_by search-result family (44
    // pages per actor: the Archetypal referer list rendered a different
    // result SET with the gate present and the capture's own set with it
    // disabled, isolate bisect probes probe-iso2/iso4), through an
    // interaction this pass could not trace inside its box. The item is
    // pinned deliberate: the engine anchors the bracketed Outlook mailto
    // where the oracle keeps it plain, exactly the pre-gate bytes.
    // links.rb:65-72 resource_type runs on the RESOURCE (@link_text):
    // a colonless chunk ("file", "mailto" — the scheme colon was chopped
    // as trailing punctuation) matches NO rule, so no class attribute.
    // The previous `chunk.slice(0, chunk.indexOf(":"))` turned -1 into a
    // last-char chop and emitted the engine-only `fil-link`/`mailt-link`
    // classes (several publisher, bookseller and bookstore
    // capture sites).
    const schemeResourceType =
      /^https?:/.test(chunk)
        ? "external-link"
        : /^mailto:/.test(chunk)
          ? "email-link"
          : /^([a-zA-Z][\-+.a-zA-Z\d]*):/.test(chunk)
            ? `${(/^([a-zA-Z][\-+.a-zA-Z\d]*):/.exec(chunk) as RegExpExecArray)[1]}-link`
            : "";
    return bestKind === "scheme"
      ? {
          start: bestStart,
          end,
          href: chunk,
          text: chunk,
          resourceType: schemeResourceType,
          trailing,
        }
      : bestKind === "host"
        ? {
            start: bestStart,
            end,
            href: chunk,
            text: choppedRaw,
            resourceType: "external-link",
            trailing,
          }
        : {
            start: bestStart,
            end,
            href: chunk,
            text: choppedRaw,
            resourceType: "email-link",
            trailing,
          };
  }
}

/** The combined link expander the processContent literal pieces run (the
 *  DEFAULT chunk list's position-order walk): whichever of the wiki Link
 *  chunk and the three URI chunk classes matches FIRST wins its span.
 *  expandWikiLinks keeps the whole-text replace shape; this wrapper walks
 *  positions so a URI before a [[wiki link]] autolinks without the wiki
 *  pass eating it (and vice versa -- the Ruby parser consumes spans in
 *  position order, single pass).
 *
 *  Exported for the text_without_nests view (views.ts): Card::Content#
 *  process_chunks runs the same chunk-list walk over the strip_nests
 *  survivors, so the nest-free text needs this exact expander - a second
 *  emitter here would drift from the pinned link bytes. */
/** The gem's per-cardtype `def chunk_list` overrides, as a lookup:
 *  card-mod-format set/type/html.rb:14-16 (:references, carried to
 *  Layout-typed cards by card-mod-layout set/type/layout_type.rb:5
 *  `include_set Type::Html`), card-mod-style set/abstract/01_css.rb:15-18
 *  (:references for css + scss), card-mod-script set/abstract/00_script.rb
 *  49-53 (:nest_only for JavaScript/CoffeeScript). Everything else answers
 *  the base :default (card-mod-format set/all/content.rb:5-7).
 *
 *  Dispatch key = typeCode, FALLING BACK to the type card's NAME key.
 *  Ruby's Type set pattern (card-1.110.0 mod/core/set_pattern/03_type.rb:
 *  19-25) applies by type_id with anchor_name = `card.type_name` - the
 *  set-module dispatch NEVER consults a codename, so `def chunk_list` in
 *  set/type/html.rb binds even when the deck's HTML cardtype card carries
 *  no codename column value (the capture deck's is exactly that shape -
 *  bar-box-format-views-seed.json html_type_card {id 39, name "HTML"} has
 *  no codename key). The port's typeCode is the codename codehash answer
 *  (render.ts peekNameForId by typeId), undefined for such uncoded type
 *  cards, so the codename-only lookup answered :default and the URI pass
 *  autolinked the SVG comment URL Ruby leaves verbatim (the bar-box
 *  deck_level/box `Generator: Sketch ... bohemiancoding.com` oracle
 *  bytes). Name-key derivation mirrors Ruby's Card::Name#key (downcase,
 *  whitespace to underscore) for these single-word type names. */
export function rubyChunkListForCardType(
  typeCode: string | undefined,
  typeName: string | undefined,
): "default" | "references" | "nest_only" {
  const code = typeCode ?? typeName?.toLowerCase().replace(/\s+/g, "_");
  switch (code) {
    case "html":
    case "css":
    case "scss":
    case "layout_type":
      return "references";
    case "java_script":
    case "coffee_script":
      return "nest_only";
    default:
      return "default";
  }
}

/** The codename resolver virtualSearchCqlFor takes, built on the engine's
 *  loaded codename memo (peek): a codename resolves to the KEY of the card
 *  currently holding it, which is how Ruby's Right pattern matches the
 *  family's right part (pattern/base.rb:21-29 keys the pattern on the
 *  right card's codename). Undefined engine hooks answer undefined, and
 *  virtualSearchCqlFor falls back to the stock seed's keys. */
function virtualSearchCodenameResolverFor(
  engine: RenderEngineLike | undefined,
): ((codename: string) => string | undefined) | undefined {
  if (engine?.peekIdByCodename === undefined || engine.peekRegisteredNameForId === undefined) {
    return undefined;
  }
  return (codename) => {
    const id = engine.peekIdByCodename?.(codename);
    const holder = id !== undefined ? engine.peekRegisteredNameForId?.(id) : undefined;
    return holder !== undefined ? DeckoName.parse(holder).key : undefined;
  };
}

/** The VirtualSearch family's link-classifier arm (card-mod-search
 *  set/abstract/virtual_search.rb :11-12 `def virtual?; new?; end`, :14-16
 *  assign_type :search_type): a compound name whose right part is one of the
 *  16 family rights is VIRTUAL-KNOWN on a row miss, so Card.known?
 *  (links.rb:140-144 add_known_or_wanted_class) answers true and the anchor
 *  renders known-card. The corpus pin: Help Desk's
 *  `[[:account+:right+:by_name|Account cards]]` — Ruby renders known-card
 *  (there is no `*account+*right+by name` row and no *structure rule
 *  applies; the card is known purely through the Right::ByName module), the
 *  pre-fix port answered wanted-card. The nest path already renders this
 *  family through the same table (the GIV page's `{{_self+*referred to
 *  by}}`); this is the link arm of the one fetch-level state, shared by the
 *  two link classifiers (renderLinkChunk + expandWikiLinks). Table +
 *  contract: src/card/fetch/virtual-search-cards.ts.
 *
 *  @returns the RESOLVED target name (the codename marks folded, e.g.
 *  `:account+:right+:by_name` -> `*account+*right+by name` — the href
 *  source link_to_card receives), or undefined when the mark is not a
 *  virtual-search name and the caller's other arms decide.
 *
 *  MODULE-EXPORTED for the follow views' item links (card-mod-follow.ts
 *  followItemLink): links.rb:140-144 add_known_or_wanted_class answers
 *  Card.known? = real? || virtual? (card core set/all/states.rb:65-67), so
 *  a link whose target is a VirtualSearch-family name is known-card on a
 *  row miss, exactly as the two link classifiers treat it here. */
export function virtualSearchKnownName(
  target: string,
  engine: RenderEngineLike | undefined,
): string | undefined {
  let name: DeckoName;
  try {
    name = DeckoName.parse(target);
  } catch (err) {
    if (err instanceof CodenameNotFoundError || err instanceof NameNotFoundError) {
      return undefined;
    }
    throw err;
  }
  if (virtualSearchCqlFor(name, virtualSearchCodenameResolverFor(engine)) === undefined) {
    return undefined;
  }
  return name.s;
}

export function expandContentLinks(
  text: string,
  engine?: RenderEngineLike,
  context?: DeckoName,
  titleContextNames?: readonly string[],
): string {
  if (!/[:.@]/.test(text)) return expandWikiLinks(text, engine, context, titleContextNames);
  let out = "";
  let pos = 0;
  for (;;) {
    const rest = text.slice(pos);
    const uri = findUriMatch(text, pos);
    WIKI_LINK_REGEXP.lastIndex = 0;
    const wiki = WIKI_LINK_REGEXP.exec(rest);
    const wikiStart = wiki === null ? Infinity : pos + wiki.index;
    if (uri === undefined && wiki === null) {
      out += rest;
      break;
    }
    if (uri !== undefined && uri.start <= wikiStart) {
      out += text.slice(pos, uri.start);
      // links.rb add_resource_opts (:154-157): target first for
      // external-link, then the resource_type class — a nil resource_type
      // (colonless resource) emits NO class attribute (content.rb
      // add_class with nil is a no-op).
      const target = uri.resourceType === "external-link" ? ` target="_blank"` : "";
      const cls = uri.resourceType === "" ? "" : ` class="${uri.resourceType}"`;
      // links.rb html link_to: `text = raw(text || opts[:href])` - the
      // label is raw-marked and content_tag renders it VERBATIM (uri.rb
      // process_text keeps the stored bytes, authored entities included).
      // Only the href crosses the attribute boundary (Rails tag_helper
      // html_escape): authored `&amp;` doubles to `&amp;amp;` there and a
      // raw `&` escapes once - the sample-council exemplar's exact split. An
      // h() on the label (the earlier code) double-escaped every entity
      // in the visible anchor text (earlier "double-escape" class).
      // uri.rb:86-89: process_uri_chunk appends @trailing_punctuation
      // AFTER the anchor (`"#{link}#{@trailing_punctuation}"`) - the
      // source's chopped [,.)!:?] byte renders right behind `</a>` (the
      // `source.example.org</a>.` oracle bytes) - and the SECOND trailing
      // dot from uri.rb:69's `sub!(/\.$/,'')` is a REAL removal, so it is
      // not re-emitted here.
      out += `<a${target}${cls} href="${h(uri.href)}">${uri.text}</a>${uri.trailing}`;
      pos = uri.end;
      continue;
    }
    // wiki link first: emit everything up to and including the wiki
    // chunk's expansion, resume after it (the URI scan skips the span).
    WIKI_LINK_REGEXP.lastIndex = 0;
    const wikiGlobal = WIKI_LINK_REGEXP.exec(rest);
    out += text.slice(pos, wikiStart);
    out += expandWikiLinks(wikiGlobal![0], engine, context, titleContextNames);
    pos = wikiStart + wikiGlobal![0].length;
  }
  return out;
}

/** content/chunk/reference.rb:11-15 referee_name: the reference target
 *  absolutizes against the CARD WHOSE CONTENT HOLDS IT ("card.name" in
 *  Ruby = the format's card rendering that content), so a relative target
 *  ("_left+*members" inside Help Desk+description) fetches the real card
 *  and renders the known-card shape. Links carry the label/title bytes
 *  verbatim (authored form) - only the fetch/href side resolves. Parse
 *  failures (unknown codename marks etc.) keep the authored form; the
 *  fetch miss then decides, exactly the pre-context behavior. */
/** link.rb#options' label fallback, `@name.to_name.fully_stripped`, for a
 *  link with no label. Unparseable marks keep the authored bytes. */
function linkFallbackTitle(target: string): string {
  try {
    return DeckoName.parse(target).fullyStripped.s;
  } catch (err) {
    if (err instanceof CodenameNotFoundError || err instanceof NameNotFoundError) return target;
    throw err;
  }
}

function absolutizeWikiTarget(target: string, context: DeckoName | undefined): string {
  if (context === undefined) return target;
  try {
    const parsed = DeckoName.parse(target);
    if (parsed.isAbsolute) return target;
    return parsed.absoluteName(context).s;
  } catch (err) {
    if (err instanceof CodenameNotFoundError || err instanceof NameNotFoundError) {
      return target;
    }
    throw err;
  }
}

/** The name the Link chunk's NEST SUBFORMAT is built on. link.rb:71-75
 *  `format.nest referee_name, options.merge(view: :link)` hands the nest the
 *  ABSOLUTIZED target (reference.rb:11-18 `referee_raw_name.absolute_name
 *  card.name`), and subformat.rb:57-61 `subformat_card` resolves that mark
 *  with `Card.fetch` — so `card.name` inside the nest, the `card.name`
 *  title_in_context absolutizes against, is the STORED name when the card
 *  exists and the mark's own name when it does not. Unparseable marks answer
 *  undefined (the caller keeps the authored bytes), the same guard shape as
 *  absolutizeWikiTarget above. */
function linkNestCardName(
  fetchTarget: string,
  resolvedName: DeckoName | undefined,
): DeckoName | undefined {
  if (resolvedName !== undefined) return resolvedName;
  try {
    return DeckoName.parse(fetchTarget);
  } catch (err) {
    if (
      err instanceof CodenameNotFoundError ||
      err instanceof NameNotFoundError ||
      err instanceof UnsupportedIdentifierError
    ) {
      return undefined;
    }
    throw err;
  }
}

/** card-mod-format set/all/title.rb:32-36 `title_in_context`, over
 *  card-1.110.0 lib/card/format/context_names.rb:49-54:
 *
 *      title = title ? title.to_name.absolute_name(card.name) : card.name
 *      newtitle = title.from(*context_names)
 *
 *  This is the SAME expression the :title view runs (title.rb:6-8
 *  `standard_title = name_variant title_in_context(voo.title)`), reached on
 *  the body-link path because link.rb:31-33 puts
 *  `title: link_text || @name.to_name.fully_stripped` in the nest's view
 *  options and base.rb:35-46 renders the anchor text as that view's
 *  `_render_title`.
 *
 *  WHY IT MOVES ON THE PAGE SURFACE AND NOT ON THE VIEW SURFACE. The
 *  `from` list is the nest subformat's context_names — context_names.rb:20-29
 *  `relevant_context_names { parent ? parent.context_names : ... }`, the
 *  PARENT format's working list filtered to THIS card's part keys. The
 *  working list is populated only by `add_name_context`, which the :titled
 *  view calls around its own header (context_names.rb:44-47 `naming { yield }
 *  add_name_context name`; the port's RenderFormat#addNameContext). A bare
 *  view-surface :content / :open render never calls it, so the list is empty,
 *  `name_from` returns `self` (contextual.rb:46-51: `from.compact.present?`
 *  false ⇒ `return self`) and the title keeps its full name.
 *
 *  FROZEN ORACLE (the two halves of D7, entry 10488 `June Pemberton+Menu`,
 *  `[[june jessup+musings]]` in its RichText body):
 *    page surface  `<span class="card-title" title="+musings">…`
 *    view surface  `<span class="card-title" title="june jessup+musings">…`
 *  for BOTH views.content and views.open. The round-trip guard in
 *  `name_from` (contextual.rb:50 `key == compressed.absolute_name(from).key`)
 *  is why the view-surface half is not "june jessup+musings" compressed
 *  either: it never gets a context to compress against, and when it does get
 *  one, `from` refuses any compression that would not absolutize back.
 *
 *  Unparseable titles keep the authored bytes — this is name algebra, and a
 *  title that is not a name is not the port's to reinterpret. */
function linkTitleInContext(
  title: string,
  cardName: DeckoName,
  contextNames: readonly string[],
): string {
  try {
    return DeckoName.parse(title).absoluteName(cardName).from(...contextNames);
  } catch (err) {
    if (
      err instanceof CodenameNotFoundError ||
      err instanceof NameNotFoundError ||
      err instanceof UnsupportedIdentifierError
    ) {
      return title;
    }
    throw err;
  }
}

/** Card::Path#handle_unknown (card-mod-format-0.20.0/lib/card/path.rb:89-96)
 *  + #query (path.rb:84-87): when a path's mark names an UNKNOWN card that
 *  is not "standardish" — name_standardish? (path.rb:107-109):
 *  `name.url_key == name.tr(" ", "_")` — Ruby stashes
 *  `opts[:card][:name] = name` so the query renders
 *  `?card%5Bname%5D=<name>` (Hash#to_param), letting the create form
 *  prefill the intended name. Known cards and standardish names emit the
 *  bare url_key path. Oracle: mindfulness 28173 wanted-card href
 *  `/mytho_psychology?card%5Bname%5D=mytho-psychology` (dash name —
 *  url_key strips non-OK4KEY bytes, so NOT standardish); the wanted
 *  [[People Green]] pin stays bare (People_Green IS standardish).
 *  Returns "" when the mark carries no query bytes (unparseable marks keep
 *  the plain-underscore fallback href, the corpus's only wanted shape). */
export function wantedHrefQuerySuffix(hrefSource: string): string {
  // path.rb:107-109 name_standardish?: `name.url_key == name.tr(" ", "_")`
  // ("no name info will be lost by using url_key"). The name under test is
  // the MARK-RESOLVED one: links.rb:36 passes `mark: Card::Name[cardish]`
  // and path.rb:64-69 interpret_mark yields that Card::Name[] — whose
  // per-part resolution turns a codename mark into its star name (name.ts
  // parse: ":members" -> "*members" through the codename registry) — so
  // "Eagle+:members" tests as "Eagle+*members", whose "*" IS in OK4KEY
  // (cardname.rb:37 `OK4KEY_RE = '\p{Word}\*'`; url_key, variants.rb
  // :8-13) — standardish, BARE href. The oracle: card 34824's authored
  // `[[Eagle+:members|Eagle users]]` (no `Eagle+*members` row exists) renders
  // `/Eagle+*members` with no query (recapture-raw-shard-000029 Eagle:page,
  // delta +36 — the pre-fix helper tested the UNRESOLVED mark form, where
  // ":" is not OK4KEY, and appended the create query). The mindfulness
  // exemplar keeps its query ("-" is not OK4KEY: url_key "mytho_psychology"
  // != "mytho-psychology", entry 28173) and People_Green stays bare
  // (path.rb's own doc example).
  try {
    const parsed = DeckoName.parse(hrefSource);
    // BOTH SIDES OF THE STANDARDISH TEST MUST SEE THE RESOLVED NAME.
    //
    // Ruby's Cardname is a String subclass and Card::Path is handed the
    // Card the mark resolved to, so `name.url_key` (path.rb:107-109) and
    // `name.tr(" ", "_")` are two spellings of ONE already-resolved name.
    //
    // The pre-fix code compared `parsed.urlKey` — which resolves — against
    // `hrefSource` — which does not — so a mark carrying a codename could
    // never satisfy the test and the query fired on every such link. Card
    // 34824 `Eagle+description` authors `[[Eagle+:members|Eagle users]]`:
    //
    //     hrefSource          "Eagle+:members"   (authored)
    //     parsed.urlKey       "Eagle+*members"   (resolved)
    //     resolved nameParts  ["Eagle","*members"] -> "Eagle+*members"
    //
    // The href beside this was ALREADY built from the resolved url_key, so
    // the anchor came out `/Eagle+*members?card%5Bname%5D=Eagle%2B%3Amembers`
    // where the capture has a bare `/Eagle+*members` (recapture-raw-shard-
    // 000029 `Eagle:page`, +36 — the whole delta is that query).
    //
    // `parts.join(joint)` (src/card/name.ts:354-356, `nameParts.map(p => p.s)`)
    // is the same construction url_key uses (cardname/lib/cardname/variants.rb
    // :8-13 maps part_names), without the lossy key-stripping, so it IS the
    // resolved name.
    //
    // fold-9 superset note (2026-10-03): refill2 independently derived the
    // SAME standardish fix on its line (urlKey === name.s.replace(...),
    // citing this same Eagle oracle, cardname.rb:37 OK4KEY_RE and
    // links.rb:36 mark-resolution). Its side is not taken verbatim because
    // its query arm carries the AUTHORED spelling (hrefSource) while this
    // landed form carries the RESOLVED name, citing path.rb:89-96 (the
    // same Cardname assigned to opts[:card][:name] that the test used) —
    // the stricter reading; the two agree wherever no codename mark reaches
    // the query arm in the corpus (mindfulness exemplar: no mark, identical
    // strings). No corpus-observable behavior differs; the wave1 form is
    // the already-pinned one on this line.
    const resolved = parsed.parts.join(DeckoName.JOINT);
    if (parsed.urlKey === resolved.replace(/ /g, "_")) return "";
    // The query carries the RESOLVED name too — path.rb:89-96 assigns the
    // same Cardname to `opts[:card][:name]` that it tested. The mindfulness
    // pin is unaffected: `mytho_psychology` has no codename mark, so its
    // resolved and authored spellings are the same string.
    return `?card%5Bname%5D=${cgiEscape(resolved)}`;
  } catch {
    return "";
  }
}

/** WIKI_LINK_REGEXP's replacement pass. `context` is the name of the card
 *  whose content holds the links (referee_name's absolutization context);
 *  `titleContextNames` is that card's FORMAT's working context_names list,
 *  which is the input title_in_context relativizes against (see
 *  linkTitleInContext below for why the list is per-nest and why it is
 *  empty on the bare view surface). Both are optional so the nestless
 *  to_s callers keep their current bytes. */
export function expandWikiLinks(
  text: string,
  engine?: RenderEngineLike,
  context?: DeckoName,
  titleContextNames?: readonly string[],
): string {
  return text.replace(WIKI_LINK_REGEXP, (match, target: string, label: string | undefined) => {
    if (match.startsWith("\\")) {
      // Escaped wiki-link: drop the backslash, keep the literal brackets.
      return `[[${label !== undefined ? `${target}|${label}` : target}]]`;
    }
    // The name branch and the explicit branch share link.rb's split
    // (renderLinkChunk carries the full citation; A-37: the plain pass
    // used to run EVERY target through the known-card shape with the raw
    // spaced target as href — the oracle pins the underscored url_key form
    // (`href="/Help_Desk" title="Help Desk"`, recapture-raw shard-000000)
    // and live pins internal-link for explicit targets
    // (`href="/account/signup">sign-in account`, live Riley bio), so the
    // branches resolve here identically to renderLinkChunk.
    // (b055982 collapsed every explicit resource to one internal-link
    // form from the ZQVT/HBQ nav pin; the scheme-differentiated classes
    // below carry the LATER raw-oracle pins (external-link
    // target="_blank" — clusters.4shard.after.md #17) and the same
    // no-card-title-span property.)
    const targetTrimmed = target.trim();
    if (/^(\/|https?:|mailto:)/.test(targetTrimmed)) {
      if (/^https?:/.test(targetTrimmed)) {
        // links.rb add_resource_opts order: target, class, href (see
        // renderLinkChunk; oracle corpus 798/798 target-first). The label
        // rides html link_to's `raw(text)` - VERBATIM stored bytes (the
        // URI-autolink emitter above carries the same composition; an
        // h() here double-escaped authored entities in the label).
        return `<a target="_blank" class="external-link" href="${h(targetTrimmed)}">${
          (label ?? targetTrimmed).trim()
        }</a>`;
      }
      if (/^mailto:/.test(targetTrimmed)) {
        return `<a class="email-link" href="${h(targetTrimmed)}">${
          (label ?? targetTrimmed).trim()
        }</a>`;
      }
      const href = `/${targetTrimmed.replace(/^\/+/, "")}`;
      return `<a class="internal-link" href="${h(href)}">${(label ?? targetTrimmed).trim()}</a>`;
    }
    // The fetch carries the CONTEXT-RESOLVED target (reference.rb:15
    // referee_name); the label/title keep the authored bytes.
    const fetchTarget = absolutizeWikiTarget(targetTrimmed, context);
    const namedLink = engine?.fetchRenderCard(fetchTarget);
    // view-fail class V4: same live-existence arm as renderLinkChunk — a
    // map miss consults the codename registry's memo (peekKnownCardName)
    // before declaring the anchor wanted-card. Absence stays wanted (the
    // a personal card's `[[People Green]]` pin below is the guard). `let`:
    // the peek arm below reassigns (bar-slots merge obligation kept).
    let known = namedLink !== undefined && namedLink.unknown !== true;
    // The href carries the RESOLVED card's name (view :link on the target
    // card, base.rb:35-46 link_to_card card.name) - see renderLinkChunk;
    // the label/title keep the authored form (oracle corpus: 25 anchors
    // href the capitalized real name over lowercase authored text and 11
    // the reverse).
    let hrefSource =
      known && namedLink?.name !== undefined ? namedLink.name.s : targetTrimmed;
    if (namedLink === undefined && engine !== undefined) {
      // VirtualSearch family arm — same classifier renderLinkChunk runs
      // (virtual_search.rb:11-12 `def virtual?; new?`; see
      // virtualSearchKnownName). The Help Desk corpus pins ride THIS pass
      // (basic-typed content: the :default chunk list), not the chunk
      // walker above.
      const virtual = virtualSearchKnownName(targetTrimmed, engine);
      if (virtual !== undefined) {
        known = true;
        hrefSource = virtual;
      } else {
        const peeked = engine.peekKnownCardName?.(targetTrimmed);
        if (peeked !== undefined) {
          known = true;
          hrefSource = peeked;
        }
      }
    }
    let href: string;
    try {
      // link_to_card's mark path (links.rb:75-80) — the name's url_key
      // form: spaces fold to underscores, `$` folds too (live:
      // /Martial_Concordance, /Su_tainability).
      href = `/${DeckoName.parse(hrefSource).urlKey}`;
    } catch (err) {
      if (err instanceof CodenameNotFoundError || err instanceof NameNotFoundError) {
        href = `/${targetTrimmed.replace(/ /g, "_")}`;
      } else {
        throw err;
      }
    }
    // Card::Path#handle_unknown (card-mod-format path.rb:89-96) — same
    // wanted-mark query as renderLinkChunk above (mindfulness entry 28173).
    if (!known) href += wantedHrefQuerySuffix(hrefSource);
    // a personal card's content, `[[People Green]]` renders WANTED-card (the
    // corpus has no such row; the R17 probe shows the warm-map answer
    // byte-matches). The earlier hardcoded known-card was the pre-fix
    // shape (every name link claimed known).
    // link.rb#options: `title: link_text || @name.to_name.fully_stripped` —
    // with no label, the contextual parts (`_left`, `_self`, ...) and the
    // blank parts are dropped (cardname variants.rb fully_stripped), so a
    // bare `[[_left]]` titles "" (the Item+short structure's `<h2>`).
    const displayText = label !== undefined ? label.trim() : linkFallbackTitle(targetTrimmed);
    // the span's title is NOT the authored bytes — it is
    // title_in_context(voo.title) as run inside the nest subformat
    // (linkTitleInContext above). The nest's `card.name` is the resolved
    // card's stored name when the mark hit one (subformat.rb:57-61
    // subformat_card -> Card.fetch), and its context_names are the parent
    // format's working list filtered to that card's part keys
    // (context_names.rb:20-29). Oracle entry 10488 page surface: the authored
    // `[[june jessup+musings]]` under the page card `June Pemberton+Menu`
    // renders `title="+musings"`; the same link on the view surface keeps
    // `title="june jessup+musings"` because nothing called add_name_context
    // there. Entry 21923 `Task+discussion` is the second corpus instance
    // (`[[Task+*type+*structure]]` -> `+*type+*structure`).
    const nestCard = linkNestCardName(fetchTarget, known ? namedLink?.name : undefined);
    const nestContextNames =
      nestCard === undefined || titleContextNames === undefined
        ? []
        : titleContextNames.filter((key) => nestCard.partKeys.includes(key));
    const titleText =
      nestCard === undefined
        ? displayText
        : linkTitleInContext(displayText, nestCard, nestContextNames);
    // wrapped_title (title.rb:38-44): the span's title attribute carries
    // the same bytes as the display text (voo.title — link.rb options:
    // `title: link_text || fully_stripped name`, relativized above);
    // oracle pin: title
    // "Help Desk" display "Help Desk" over href /Help_Desk; live pin:
    // title/display "contributing to the administration..." over the
    // underscored href. The INNER content is the joint-split title
    // (wrappedTitleInner): a junction link's anchor text carries
    // `<span>+</span>` per joint — oracle entry 10488 view-surface `content`
    // pin: `<a class="known-card" href="/June_Pemberton+musings"><span
    // class="card-title" title="june jessup+musings">steven
    // goldin<span>+</span>musings</span></a>`, and the page-surface
    // `+musings` half splits the SAME way
    // (`title="+musings"><span>+</span>musings`): wrapped_title splits
    // whatever title_in_context produced, so the split follows the
    // relativization, not the authored text.
    //
    // The attribute escape is QUOTE-ONLY: a link's title opt is always
    // set (chunk/link.rb:31-33), so title_in_context's keep_safe arm
    // (context_names.rb:49-55 `keep_safe ? newtitle.html_safe : newtitle`)
    // hands wrapped_title an html_safe string, the html format's `h super`
    // (title.rb:31-35) is ERB::Util's no-op on html_safe input, and only
    // actionview tag_helper.rb tag_option :322's unconditional quote gsub
    // touches the bytes. Oracle: a sample employer's position wanted-link span
    // renders `title="<a href=&quot;/20191213+CM+Time_Tracking+1400?view=
    // bar&quot;>20191213+CM+Time Tracking+1400</a>"` with RAW brackets
    // (the previous htmlEscapeKeepApostrophe emitted `&lt;a href=...`
    // there, and the Dungeons and Dragons +SCa rule-link span the same
    // `&lt;/a&gt;` where the capture has `</a>`).
    return (
      `<a class="${known ? "known-card" : "wanted-card"}" href="${h(href)}">` +
      `<span class="card-title" title="${titleText.replace(/"/g, "&quot;")}">` +
      `${wrappedTitleInner(titleText)}</span>` +
      `</a>`
    );
  });
}

/** The link-wrapped-nest opener: an UNTERMINATED `[[Target|` at the end of
 *  a text piece (the nest scanner split it from its label and `]]`).
 *  Escaped openers (`\[\[`) don't match; the target charset mirrors the
 *  wiki-link pass. Whitespace MAY trail the pipe: the label side is
 *  objectify'd (link.rb:113-122 raw.strip!) so `[[/ | {{logo}}]]` - the
 *  space between pipe and label - is Ruby's own shape (divider_index
 *  splits at the pipe; the label keeps its leading space until
 *  objectify strips it), and the classic-layout oracle pins exactly that
 *  byte shape: `[[/ | {{*logo}}]]` in the layout source renders
 *  `<a class="internal-link" href="/">{{*logo}}</a>` INSIDE the CodeRay
 *  output (view-surface shard-000000 entry 314, content view). Returns the
 *  piece's prefix (still plain-text) and the target for renderLinkChunk
 *  (which trims the target - objectify strips it too). */
function matchLinkWrappedNestOpener(text: string): { prefix: string; target: string } | undefined {
  const match = /(?<!\\)\[\[([^\[\]\n|]+)\|\s*$/.exec(text);
  if (match === null || match.index === undefined) return undefined;
  return { prefix: text.slice(0, match.index), target: match[1] ?? "" };
}

/** The link TARGET opener: an UNTERMINATED `[[Target` at the end of a text
 *  piece, with the pipe still to come. This is the sibling case
 *  matchLinkWrappedNestOpener cannot see — there the nest splits the LABEL
 *  (`[[/ | {{*logo}}]]`, pipe and `[[` in one piece), here the nest splits
 *  the TARGET: `<p>[[/new/{{_self|linkname}}|add a …]]` scans into
 *  `<p>[[/new/` + nest `{{_self|linkname}}` + `|add a ` + nest + ` card]]`,
 *  so no single text piece holds both `[[` and `|`.
 *
 *  Ruby's Link chunk (link.rb:14 `full_re /\[\[([^\]]+)\]\]/`) matches the
 *  RAW string BEFORE any nest chunking, and its target charset `[^\]]`
 *  admits braces — so the target is the RAW `"/new/{{_self|linkname}}"` and
 *  the oracle's href carries the braces verbatim
 *  (`expected-v2/view-surface recapture-raw-shard-000000.jsonl`,
 *  `Cardtype+*type+*default`, content + open: `<a class="internal-link"
 *  href="/new/{{_self|linkname}}">add a {{_self|name}} card</a>`). The
 *  un-spanned form leaked the whole `[[…]]` wikitext; that is the -32-byte
 *  view-surface byte-diff on this card in both views.
 *
 *  SCOPE: the head charset excludes `{`/`}` as well as the bracket/pipe/newline
 *  set, so only a PLAIN target head opens the span. A `[[{{nest}}]]` form
 *  (brace as the FIRST target character) keeps the old verbatim behavior
 *  rather than guessing a resolution this branch was not pinned for. The
 *  caller additionally requires a `|` divider before rendering, so a bare
 *  `[[Target]]` spanning a nest is unchanged too. */
function matchLinkTargetNestOpener(text: string): { prefix: string; head: string } | undefined {
  const match = /(?<!\\)\[\[([^{}[\]\n|]*)$/.exec(text);
  if (match === null || match.index === undefined) return undefined;
  return { prefix: text.slice(0, match.index), head: match[1] ?? "" };
}
