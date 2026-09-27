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
// -> src/card/permissions/). Deferred (docs/render-port-notes.md): view
// caching/stubs, edit views, mod-specific view overrides, compact nest mode.

import { DeckoName } from "../name.js";
import { CodenameNotFoundError, NameNotFoundError } from "../name/errors.js";
import type { CardRecord } from "../fetch/card-record.js";
import {
  scanNests,
  type NestOptions,
  type ParsedNest,
} from "./nest-syntax.js";
import { safeSetKeys } from "./set-keys.js";
import { h } from "./slot-html.js";
import { viewPermissionDenial, quietDenial, type CrudTask } from "../permissions/view-perms.js";
import { resolveContentOverride } from "./content-overrides.js";

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

  constructor(parent: Voo | undefined, requestedView: string, opts: Record<string, unknown>) {
    this.parent = parent;
    this.requestedView = requestedView;
    this.opts = opts;
    // view/options/key_lists.rb heir_keys (= keymap[:both] + keymap[:heir])
    // + voo_api.rb:135-143 inherit_options_from_parent!: a child voo
    // inherits the parent's value for every heir key it did not set itself
    // (`@normalized_options[option_key] ||= parent.live_options[option_key]`).
    // The port carries the one heir key the captured surface provably
    // consumes: :size (the image variant — Ruby's determine_image_size reads
    // voo.size at the CORE render, one voo below the nest's content voo; a
    // size:full nest must render -original through that hop. Live receipt:
    // Conflict_Done_Well 277091-original.png with data-slot "size":"full";
    // corpus receipt: Professional Materials {{bar02|size:full}}). The
    // remaining heir keys (main, home_view, title, variant, joint, items,
    // ...) stay unported — a documented remainder.
    if (parent !== undefined && opts["size"] === undefined) {
      const inherited = parent.opts["size"];
      if (inherited !== undefined) this.opts["size"] = inherited;
    }
  }

  /** visibility.rb#process_visibility: inherit the parent's viz, then viz the
   *  requested view. The `optional: :show` render arg
   *  (method_delegation.rb#render_args -> optional_render_opt default) makes
   *  every delegated sub-render visible by default. */
  processVisibility(optional: unknown): void {
    if (this.parent !== undefined) {
      for (const [view, setting] of this.parent.viz) {
        if (!this.viz.has(view)) this.viz.set(view, setting); // reverse_merge!
      }
    }
    const requested = this.requestedView;
    // null = NO optional render opt (the show_with_page_layout main render —
    // the page lane's captured slot has no "show" viz). JS default params
    // apply on undefined, so the page path passes null, not undefined.
    if (optional !== undefined && optional !== null && optional !== false && !this.viz.has(requested)) {
      this.viz.set(requested, optional === "hide" || optional === false ? "hide" : "show");
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

  /** visibility.rb#hide (the voo.hide :bar_middle idiom in bar.rb). */
  hide(views: string | string[]): void {
    this.setViz(views, "hide");
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
    if (show.length > 0) out["show"] = show;
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

export type ViewFn = (ctx: ViewContext) => string;

/** The menu help-popover resolver (help-popover.ts HelpRulesResolver), when
 *  a composition installed one. Optional: engines without it keep the
 *  help-less placeholder bytes for every card. */
export interface HelpRulesApi {
  /** The unescaped data-bs-content value; "" renders the &nbsp; placeholder
   *  (bootstrap helper.rb:48). */
  menuHelpContentBytes(fmt: RenderFormat): string;
}

export interface RenderFormatOptions {
  parent?: RenderFormat;
  main?: boolean;
  /** Production render-error semantics (raise_all_rendering_errors=false):
   *  errors from NESTED view renders become the quiet
   *  `render-error alert alert-danger` span instead of propagating
   *  (format/render.rb wrap_and_render rescue + error.rb rescue_view
   *  quiet branch). The focal (main) render still raises. Page-path only;
   *  the bare view lane keeps the development loud behavior. */
  nestQuietErrors?: boolean;
  /** maximum nest depth — Ruby Card.config.max_depth = 20
   *  (prototype/lib/cardio/railtie.rb:17; monitor_depth,
   *  prototype/lib/card/format/error.rb:32-38). An earlier revision carried
   *  decko's old 42 default; the vendored prototype pins 20 and the
   *  adversarial probe battery graded the divergence (self-inclusion,
   *  cycle-two, nest-of-cycle all 500 at the old guard where Ruby renders
   *  the too-deep UserError at 20). Aligned 2026-09-24. */
  maxDepth?: number;
}

/** Card.config.max_depth (prototype/lib/cardio/railtie.rb:17). */
export const RUBY_MAX_DEPTH = 20;

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
  /** The memoized main-view body (nesting/main.rb main.rendered): set by the
   *  page renderer after the main render; the {{_main}} nest in the layout
   *  body emits it wrapped by wrap_main (<div id="main">). */
  mainNestBody: string | undefined;
  voo: Voo | undefined;
  private depthCache: number | undefined;

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
  }

  /** view.rb#depth - the subformat chain depth (recursion guard). */
  get depth(): number {
    if (this.depthCache === undefined) {
      this.depthCache = this.parent === undefined ? 0 : this.parent.depth + 1;
    }
    return this.depthCache;
  }

  /** The format rendering the page root (context card for relative names). */
  get contextFormat(): RenderFormat {
    return this.parent ?? this;
  }

  // -------------------------------------------------------------------------
  // render.rb#render!
  // -------------------------------------------------------------------------

  /**
   * format.render(view) / render_<view>: build the voo, process visibility,
   * run before-hooks, dispatch to the view method. The `optional` argument
   * carries Ruby's optional render opt (:show by default via
   * method_delegation.rb#optional_render_opt; "hide" for optional: :hide).
   */
  renderView(view: string, opts: Record<string, unknown> = {}, optional: unknown = "show"): string {
    const normalized = normalizeView(view);
    // view.rb#ok_view (view.rb:86 `altered_view || requested_view`): on an
    // unknown card the view is substituted BEFORE dispatch (view/permission.rb
    // #alter_unknown -> format/error.rb#view_for_unknown). The voo keeps the
    // REQUESTED view (Ruby voo @raw_view); only the dispatched view changes.
    const effective =
      this.card.unknown === true ? this.viewForUnknown(normalized, opts) : normalized;
    const voo = new Voo(this.voo ?? undefined, normalized, { ...opts });
    const previous = this.voo;
    this.voo = voo;
    try {
      voo.processVisibility(optional);
      // view/permission.rb #altered_view (:19-23): the unknown branch ran
      // above; for KNOWN cards the view-permission gate replaces the view
      // before any hook or body runs. Task resolution (view_perms, :13-15),
      // skip_check? (:25-27 — perms :none views and the skip_perms render
      // option), the ok_to_<task>? verdict lookup (format/error.rb:5-8 ok?)
      // and the denial substitution (view_for_denial, error.rb:27-31) live
      // in src/card/permissions/view-perms.ts. Verdicts are precomputed
      // engine state (zero queries here): read through isDenied's verdict
      // map, non-read tasks through the optional isTaskDenied hook (the
      // ported view registry carries no non-read view today — an absent
      // hook leaves those views unverified-allowed, per
      // docs/view-perms-notes.md).
      if (this.card.unknown !== true) {
        const denial = viewPermissionDenial(normalized, {
          renderOpts: opts,
          isNewCard: this.card.id === undefined,
          taskAllowed: (task: CrudTask): boolean | undefined =>
            task === "read"
              ? !this.engine.isDenied(this.card)
              : this.engine.taskAllowed?.(this.card, task),
          // permission.rb:61 method predicates: can_configure? is the one
          // ported predicate (cardtype.rb:68-70 — update-ok on the card's
          // *structure rule card); unported predicates keep the
          // documented remainder (allowed).
          predicateAllowed: (predicate: string): boolean | undefined =>
            predicate === "can_configure?" ? this.engine.canConfigure?.(this.card) : undefined,
        });
        if (denial !== undefined) return denial;
      }
      this.runBeforeHook(effective, voo);
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
      const viewFn = this.engine.resolveView(this.card, effective, "html");
      if (viewFn === undefined) {
        // render.rb#view_method + error.rb#unsupported_view_error_message
        // (Ruby substitutes first, so an unsupported REQUESTED view on an
        // unknown card reports the substituted view - same shape here)
        throw new UnsupportedViewError(effective, this.card.name.s);
      }
      return viewFn({ fmt: this, voo });
    } finally {
      this.voo = previous;
    }
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
    const configured = UNKNOWN_VIEW_CONFIG[requested];
    if (configured === true) return requested; // permission.rb:40 unknown_setting == "true"
    if (this.isMain && this.voo === undefined) {
      // format/error.rb#page_view_for_unknown (page branch) - not ported
      throw new Error(
        `unknown-card page render not ported (view_for_unknown main branch): ${this.card.name.s}`,
      );
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
    } else if (view === "bar") {
      if (this.cardIsRule()) {
        // bar_view.rb:10 class_up "card-slot", "_rule-item #{category_classes}"
        const categories = this.ruleSetCategories(this.rightPartCodenameForRule());
        const classExtra = ["_rule-item", ...categories.map((c) => `_category-${c}`)].join(" ");
        voo.classUp("card-slot", classExtra);
      }
      if (this.cardTypeCodename === "search_type" || this.card.typeName === "Search") {
        // search_views.rb:36 voo.hide :one_line_content
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
    // Try the bare key first; fall back to the original rightKey for
    // setting cards whose canonical key preserves the leading "*".
    const right =
      this.engine.fetchRenderCard(bare) ??
      this.engine.fetchRenderCard(rightKey);
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
  private ruleSetCategories(settingCodename: string | undefined): string[] {
    if (settingCodename === undefined) return [];
    const result = ["all"];
    if (FIELD_SETTINGS.has(settingCodename)) result.push("field");
    result.push("recent");
    if (COMMON_SETTINGS.has(settingCodename)) result.push("common");
    return result;
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
  nest(nest: ParsedNest): string {
    if (nest.comment !== undefined) return nest.comment; // content.rb#content_nest comment passthrough
    const targetName = this.resolveNestName(nest.name);
    // Blank reference (`{{}}`): fetch.rb#retrieve_existing skips blank marks
    // (`return unless mark.present?`) and fetch/results.rb#results then
    // returns nil (`return if card.nil?`) - no card, not even an unknown
    // one. The nil-card nest renders through the html denial path
    // (card-mod-format set/all/html/error.rb#quiet_denial, task :read).
    // Corpus oracle: shard-000000 entry 636 renders its `{{}}` inside body
    // text as the bare denied span, byte-pinned in
    // tests/card/render/unknown-nest-blank-reference.test.ts.
    if (targetName.trim() === "") {
      return quietDenial(); // html error.rb quiet_denial, task :read
    }
    const target = this.engine.fetchRenderCard(targetName);
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
      this.buildUnknownNestCard(targetName, this.engine, this.card.typeName);
    const view = normalizeView(nest.options.view ?? this.defaultNestView());
    const viewOpts: Record<string, unknown> = {
      // nest_name = the AUTHORED reference, verbatim: card-mod-content
      // lib/card/content/chunk/nest.rb:23 builds the chunk's options with
      // `@options = interpret_options.merge nest_name: name,
      // nest_syntax: in_brackets` — `name` there is the authored
      // reference (relative "+Source Title" stays relative; authored
      // underscores/casing stay untouched). nest.rb#prepare_view_and_opts!'s
      // `nest_name ||= card.name` is only the fallback for programmatic
      // nests that carry no chunk options. Both oracles pin the authored
      // form: the raw recapture oracle (tmp/raw-ground-truth/expected/
      // recapture-raw-shard-000005.jsonl id 9625) carries
      // nest_name "+Source Title" for a `{{+Source Title}}` nest, and the
      // live wire (tmp/live-wire) carries "+tag"/"+related"/"+Source
      // Title"/"Su$tainability"/"Conflict_Done_Well+class_schedule" —
      // authored bytes, not resolved names. The resolved name still drives
      // data-card-name (the slot's own attribute; id 9625 shows the
      // absolute form there). card-mod-tabs.ts#chunkRefChunks already
      // follows this contract for its chunk walk.
      nest_name: nest.name,
      nest_syntax: nest.syntax,
      ...(view === "closed" || view === "edit" ? { home_view: "open" } : { home_view: view }),
      ...this.nestOptionEntries(nest.options),
    };
    const sub = new RenderFormat(card, this.engine, {
      parent: this,
      maxDepth: this.maxDepth,
      // Page-path config propagates (Ruby's config is render-global): the
      // quiet nested-error semantics. The default nest view needs no
      // threading — every format reads the same engine rule (validated).
      nestQuietErrors: this.nestQuietErrors,
    });
    if (this.depth >= this.maxDepth) {
      throw new Error(`nest depth exceeded (${card.name.s})`);
    }
    // Production render-error semantics (error.rb rescue_view quiet branch,
    // reached through format/render.rb wrap_and_render's rescue): a nested
    // view's error renders the quiet span instead of propagating. UserError
    // messages render verbatim (error.rb rendering_error); other errors use
    // the lib_error_rendering locale line. The focal (main) render never
    // reaches this catch — it runs on the root format, not through nest().
    try {
      return sub.renderView(view, viewOpts);
    } catch (error) {
      if (!this.nestQuietErrors) throw error;
      const msg =
        error instanceof UnsupportedViewError
          ? error.message
          : `Error rendering: ${h(card.name.s)} (${view} view)`;
      return `<span class="render-error alert alert-danger">${msg}</span>`;
    }
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
  private buildUnknownNestCard(
    targetName: string,
    engine: RenderEngineLike,
    leftTypeName?: string,
  ): RenderCard {
    const name = DeckoName.parse(targetName);
    const defaulted = engine.newCardDefaultType?.(name);
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
    return {
      record,
      name,
      key: name.key,
      typeName: defaulted?.typeName,
      typeId: defaulted?.typeId,
      typeCode: undefined,
      id: undefined,
      dbContent: "",
      setKeys: safeSetKeys({
        name,
        typeId: defaulted?.typeId,
        typeName: defaulted?.typeName,
        leftTypeName,
      }),
      unknown: true,
    };
  }

  /** nest.rb#prepare_view_and_opts! - nest_name/nest_syntax are added
   *  separately above; the remaining shark options ride into the voo.
   *  `unknown` rides too: view/permission.rb:42 reads the voo's :unknown
   *  option (the nest's `unknown:` takes precedence over view configs). */
  private nestOptionEntries(options: NestOptions): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    if (options.title !== undefined) out["title"] = options.title;
    if (options.size !== undefined) out["size"] = options.size;
    if (options.show !== undefined) out["show"] = options.show;
    if (options.hide !== undefined) out["hide"] = options.hide;
    if (options.extra["unknown"] !== undefined) out["unknown"] = options.extra["unknown"];
    return out;
  }

  /** nesting.rb#implicit_nest_view -> default_nest_view (html.rb:17-19 ->
   *  Cardio.config.default_html_view; mod/format.rb:2 pins the RAILTIE
   *  default :titled).
   *
   *  The railtie literal is only the FALLBACK: the deck's
   *  `*all+*default html view` rule drives the effective config, and the
   *  live wire bytes agree on all 12 captured pages — every bare nest
   *  renders a content-view (Home, Brandon +bio/+how to contact me, CDW,
   *  Wikirate, blog Latest News, Recommendations ×32; assumption-audit
   *  A-36). The bare recapture oracle disagrees (it shows titled for the
   *  same nests) because the capture bootstrap never applied the deck rule
   *  to Cardio.config — the same capture-path illusion busted twice
   *  before; the oracle lacks the deck-rule context and is NOT the byte
   *  target here. The engine resolves the rule (render.ts folds the
   *  *default html view universe on the cold render) and VALIDATES it: a
   *  value naming no registered view logs loudly and reads as undefined
   *  (render.ts#deckDefaultHtmlView — the anonymized corpus DBs carry rule
   *  card 22769 = "fnvmwmg", an anonymizer token, never renderable as a
   *  view), falling back to the railtie :titled. Rule-driven, not a
   *  hardcoded literal. Fixtures pinned to the oracle's titled side flip
   *  with this fix; the flip is the correction (same class as round 8
   *  lane 3's four expected flips).
   *
   *  (Merge pass 2: the layout lane's defaultNestViewOverride split — bare
   *  lane titled / page lane hardcoded :content — was superseded by this
   *  rule-driven form; page.ts reads the same validated rule through
   *  engine.ensureDeckDefaultHtmlView.) */
  defaultNestView(): string {
    return this.engine.deckDefaultHtmlView?.() ?? "titled";
  }

  /**
   * Nest machinery for an ALREADY-RESOLVED record - collection/item.rb
   * #nest_item's shape (options carry view/size etc.; nest_name is added
   * here; home_view follows the nest.rb rule). Used by the search card_list
   * for its :bar items.
   */
  nestRecord(target: RenderCard, view: string, opts: Record<string, unknown> = {}): string {
    const viewOpts: Record<string, unknown> = {
      nest_name: target.name.s, // nest.rb#prepare_view_and_opts!
      ...(view === "closed" || view === "edit" ? { home_view: "open" } : { home_view: view }),
      ...opts,
    };
    const sub = new RenderFormat(target, this.engine, {
      parent: this,
      maxDepth: this.maxDepth,
      nestQuietErrors: this.nestQuietErrors,
    });
    if (this.depth >= this.maxDepth) {
      throw new Error(`nest depth exceeded (${this.maxDepth}) at ${target.name.s}`);
    }
    return sub.renderView(view, viewOpts);
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
   *  goes through renderLinkChunk. Live receipt:
   *  `[[/wagn/Latest_news_items.rss|{{feed icon|...}}]]` ->
   *  `<a class="internal-link" href="/wagn/Latest_news_items.rss">` +
   *  expanded feed-icon slot + `</a>` (live-wire Latest_News/blog). */
  processContent(content: string): string {
    const pieces = scanNests(content);
    let out = "";
    let i = 0;
    while (i < pieces.length) {
      const piece = pieces[i]!;
      if (piece.kind === "nest") {
        if (piece.nest !== undefined) out += this.nest(piece.nest);
        i += 1;
        continue;
      }
      const opener = matchLinkWrappedNestOpener(piece.text);
      if (opener === undefined) {
        out += expandWikiLinks(piece.text);
        i += 1;
        continue;
      }
      // The opener's prefix text still runs the plain link pass (it may
      // carry complete links of its own).
      out += expandWikiLinks(opener.prefix);
      let label = "";
      let tail: string | undefined;
      let j = i + 1;
      while (j < pieces.length) {
        const inner = pieces[j]!;
        if (inner.kind === "nest") {
          if (inner.nest !== undefined) label += this.nest(inner.nest);
          j += 1;
          continue;
        }
        const closeAt = inner.text.indexOf("]]");
        if (closeAt === -1) {
          label += expandWikiLinks(inner.text);
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
      out += this.renderLinkChunk(opener.target, label);
      out += expandWikiLinks(tail);
      i = j;
    }
    return out;
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
   * nest label lands inside the anchor expanded. Live receipts:
   * `<a class="internal-link" href="/wagn/Latest_news_items.rss">…` (feed
   * icon wrap) and `<a class="internal-link" href="/account/signup">sign-in
   * account</a>` (live Brandon bio; identical bytes in the recapture
   * oracle).
   *
   * Name targets (link.rb:85-86 + 71-75) render view :link on the target
   * card (base.rb:37-39 -> link_view -> link_to_card card.name,
   * _render_title): the known/wanted class rides the target's existence
   * (links.rb add_known_or_wanted_class) and the title option carries the
   * rendered label, so the label bytes sit inside the card-title span.
   */
  private renderLinkChunk(rawTarget: string, label: string): string {
    const target = rawTarget.trim();
    if (/^(\/|https?:|mailto:)/.test(target)) {
      if (/^https?:/.test(target)) {
        return `<a class="external-link" href="${h(target)}" target="_blank">${label}</a>`;
      }
      if (/^mailto:/.test(target)) {
        return `<a class="email-link" href="${h(target)}">${label}</a>`;
      }
      const href = `/${target.replace(/^\/+/, "")}`;
      return `<a class="internal-link" href="${h(href)}">${label}</a>`;
    }
    const named = this.engine.fetchRenderCard(target);
    const known = named !== undefined && named.unknown !== true;
    let href: string;
    try {
      href = `/${DeckoName.parse(target).urlKey}`;
    } catch (err) {
      if (err instanceof CodenameNotFoundError || err instanceof NameNotFoundError) {
        href = `/${target.replace(/ /g, "_")}`; // unresolved mark: plain underscore form
      } else {
        throw err;
      }
    }
    return (
      `<a class="${known ? "known-card" : "wanted-card"}" href="${h(href)}">` +
      `<span class="card-title" title="${h(label || target)}">${label}</span>` +
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
    if (override !== undefined) return override;
    return this.card.dbContent;
  }

  /**
   * Card::Layout::CardLayout#render — the layout card's content processed
   * through the PAGE format (process_content, chunk_list: :references).
   * Identical loop to processContent except the `_main` nest: Ruby's nest
   * dispatch hits nesting/main.rb#main_nest — wrap_main { main.rendered }
   * — the memoized main-view body wrapped in <div id="main"> (html/wrap.rb
   * #wrap_main; no_main_wrap? is false for the page path). Other nests
   * resolve against the PAGE card (the layout renders in the page's format
   * context), including `:codename` marks ({{:header|core}} -> *header).
   */
  processLayoutContent(content: string): string {
    const pieces = scanNests(content);
    let out = "";
    for (const piece of pieces) {
      if (piece.kind === "text") {
        out += expandWikiLinks(piece.text);
      } else if (piece.nest !== undefined) {
        if (piece.nest.name === "_main") {
          // main_nest? -> wrap_main { main.rendered || main_nest_render }
          const body = this.mainNestBody ?? "";
          out += `<div id="main">${body}</div>`;
        } else {
          out += this.nest(piece.nest);
        }
      }
    }
    return out;
  }

  /** title.rb#standard_title via #title_in_context: the name, HTML-escaped
   *  (the html-format title is the escaped name; voo.title overrides are
   *  wave-3). */
  standardTitle(): string {
    return h(this.card.name.s);
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
}

/** Minimal engine surface the format needs (implemented by RenderEngine in
 *  src/card/render.ts). Kept as an interface so views.ts and format.ts never
 *  import the engine concrete class - mirrors the harness's interface-only
 *  rule in spirit. */
export interface RenderEngineLike {
  views: Record<string, ViewFn>;
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
  /** Search execution for Search-type cores (see views.ts card_list). */
  executeSearch(fmt: RenderFormat): RenderCard[];
  /** Read-permission verdict for a prepared card (the ok_to_read? set
   *  membership, card-mod-permissions set/all/permissions.rb:142-143,
   *  precomputed in the engine's prepare phase — never a query here). */
  isDenied(card: RenderCard): boolean;
  /** ok_to_<task>? for the NON-read view tasks (ok_to_update?/create?/
   *  delete?, card-mod-permissions set/all/permissions.rb:148-157) —
   *  precomputed like isDenied, same undefined-means-unverifiable contract
   *  as canReadByRuleLookup (docs/view-perms-notes.md). Optional: engines
   *  without it leave every non-read task unverified-allowed; the ported
   *  view registry carries no non-read view today, so the surface is
   *  unaffected either way. */
  taskAllowed?(card: RenderCard, task: Exclude<CrudTask, "read">): boolean | undefined;
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
  /** All rule cards whose left_id equals the host card's id (Card.search
   *  left: id, limit: 0, sorted by content+name). The set-card Rules
   *  section core override (views.ts setRulesCoreHtml) reads this to
   *  build the per-category accordion. Optional: engines without it
   *  return an empty list (no rule rows — a degenerate Rules section
   *  still renders the h4 header + filter form, no accordion). */
  collectRules?(host: RenderCard): RenderCard[];
  /** lib/card/rule/all.rb:32-51 — does the card satisfy rule? (its right
   *  part is a setting, its left part is a set)? The before(:bar) hook
   *  in format.ts reads this to add the _rule-item + _category-* classes
   *  the bar view needs (bar_view.rb:10). Optional; engines without it
   *  skip the rule class chain. */
  cardIsRule?(card: RenderCard): boolean;
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
  newCardDefaultType?(name: DeckoName): { typeId: number; typeName: string } | undefined;
  /** The deck's effective default html nest view — the `*all+*default html
   *  view` rule's content (Cardio.config.default_html_view; html.rb:17-19
   *  default_nest_view). The engine folds the rule universe on the cold
   *  render (render.ts) and answers the rule's trimmed db_content here
   *  (this corpus: "content"). undefined = no rule exists — the format
   *  falls back to the railtie default :titled (mod/format.rb:2).
   *  Optional: engines without it always take the fallback. */
  deckDefaultHtmlView?(): string | undefined;
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
   *  e.g. `https://culturesmith-production-storage.fra1.cdn.digitaloceanspaces.com`.
   *  The image core resolves `(bucket)/<id>/<file>.<ext>` content to
   *  `<host>/files/<id>/<file>-<variant>.<ext>`; when undefined the same
   *  /files shape renders host-relative. Deck-deployment config (Ruby's
   *  fog bucket host), never derivable from the corpus. */
  readonly imageCdnHost?: string | undefined;
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
 *  does not redefine titled_content/labeled_content). */
const UNKNOWN_VIEW_CONFIG: Record<string, string | true> = {
  mini_bar: true,
  mini_unknown: true,
  bar_left: true,
  bar_menu: true,
  bar_body: true,
  closed: "mini_bar",
  bar: "mini_bar",
  full_bar: "mini_bar",
  bar_middle: "blank",
  bar_right: "blank",
  titled_content: "blank",
  labeled: "labeled",
  labeled_content: "mini_unknown",
  one_line_content: "mini_unknown",
  raw_one_line_content: "mini_unknown",
  // Round 9: `open` renders AS REQUESTED on a nest-miss new card. Oracle:
  // raw-ground-truth 9625/13421/14382 `open` views render the absent
  // "+Discussion" child's full open-view accordion (data-card-type-id=3
  // from the *default rule, EMPTY body — the "*default content is not
  // applied at view time" shape), and live blog.html/Latest_News.html show
  // the same slot for every news item's missing discussion child. The
  // empty-slot-not-denial requirement this pins is round 9's point 2.
  open: true,
};

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

// ---------------------------------------------------------------------------
// Card::Setting category membership (card-mod-rules set/type/set/
// setting_categories.rb:6-7): the per-category setting lists that drive
// the "_category-all", "_category-common", "_category-field" class chain
// the bar view adds to rule cards (bar_view.rb:10 + editor.rb:54-58).
// ---------------------------------------------------------------------------

/** card-mod-rules set/type/set/setting_categories.rb:6 COMMON_SETTINGS. */
const COMMON_SETTINGS: ReadonlySet<string> = new Set([
  "create", "read", "update", "delete", "structure", "default", "guide",
]);

/** card-mod-rules set/type/set/setting_categories.rb:7 FIELD_SETTINGS. */
const FIELD_SETTINGS: ReadonlySet<string> = new Set([
  "default", "help", "input_type", "content_options", "content_option_view",
]);

// ---------------------------------------------------------------------------
// Wiki-link expansion ([[Target]] / [[Target|label]]) — the format/content
// pass that translates Markdown-style wiki-links into the same known-card
// anchor shape the origin bridge used to inject client-side. We emit the
// anchor directly from the engine so the bridge can retire.
// ---------------------------------------------------------------------------

/** card-mod-format set/all/content/chunk/link.rb wiki-link pass (the plain
 *  text-piece half; link-wrapped nests span pieces and go through
 *  RenderFormat#renderLinkChunk instead): `[[Target]]` and
 *  `[[Target|label]]` become the Link chunk's anchor bytes. Backslash
 *  escaping (`\[\[`) is honored so a literal `[[` survives when the author
 *  means the markdown brackets and not a card link. */
const WIKI_LINK_REGEXP = /\\?\[\[([^\[\]\n|]+?)(?:\|([^\[\]\n]+?))?\]\]/g;

function expandWikiLinks(text: string): string {
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
    // (`href="/account/signup">sign-in account`, live Brandon bio), so the
    // branches resolve here identically to renderLinkChunk.
    // (Merge pass 2: the layout lane's b055982 collapsed every explicit
    // resource to one internal-link form from the PCTS/GBA nav pin; the
    // scheme-differentiated classes below carry the LATER raw-oracle pins
    // (external-link target="_blank" — clusters.4shard.after.md #17) and
    // the same no-card-title-span property, which was that lane's fix.)
    const targetTrimmed = target.trim();
    if (/^(\/|https?:|mailto:)/.test(targetTrimmed)) {
      if (/^https?:/.test(targetTrimmed)) {
        return `<a class="external-link" href="${h(targetTrimmed)}" target="_blank">${h(
          (label ?? targetTrimmed).trim(),
        )}</a>`;
      }
      if (/^mailto:/.test(targetTrimmed)) {
        return `<a class="email-link" href="${h(targetTrimmed)}">${h(
          (label ?? targetTrimmed).trim(),
        )}</a>`;
      }
      const href = `/${targetTrimmed.replace(/^\/+/, "")}`;
      return `<a class="internal-link" href="${h(href)}">${h((label ?? targetTrimmed).trim())}</a>`;
    }
    let href: string;
    try {
      // link_to_card's mark path (links.rb:75-80) — the name's url_key
      // form: spaces fold to underscores, `$` folds too (live:
      // /Martial_Nonviolence, /Su_tainability).
      href = `/${DeckoName.parse(targetTrimmed).urlKey}`;
    } catch (err) {
      if (err instanceof CodenameNotFoundError || err instanceof NameNotFoundError) {
        href = `/${targetTrimmed.replace(/ /g, "_")}`;
      } else {
        throw err;
      }
    }
    const displayText = (label ?? targetTrimmed).trim();
    // wrapped_title (title.rb:38-44): the span's title attribute carries
    // the same bytes as the display text (voo.title — link.rb options:
    // `title: link_text || fully_stripped name`); oracle pin: title
    // "Help Desk" display "Help Desk" over href /Help_Desk; live pin:
    // title/display "contributing to the administration..." over the
    // underscored href.
    return (
      `<a class="known-card" href="${h(href)}">` +
      `<span class="card-title" title="${h(displayText)}">${h(displayText)}</span>` +
      `</a>`
    );
  });
}

/** The link-wrapped-nest opener: an UNTERMINATED `[[Target|` at the end of
 *  a text piece (the nest scanner split it from its label and `]]`).
 *  Escaped openers (`\[\[`) don't match; the target charset mirrors the
 *  wiki-link pass. Returns the piece's prefix (still plain-text) and the
 *  target for renderLinkChunk. */
function matchLinkWrappedNestOpener(text: string): { prefix: string; target: string } | undefined {
  const match = /(?<!\\)\[\[([^\[\]\n|]+)\|$/.exec(text);
  if (match === null || match.index === undefined) return undefined;
  return { prefix: text.slice(0, match.index), target: match[1] ?? "" };
}
