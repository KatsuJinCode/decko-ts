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
import type { CardRecord } from "../fetch/card-record.js";
import {
  scanNests,
  type NestOptions,
  type ParsedNest,
} from "./nest-syntax.js";
import { safeSetKeys } from "./set-keys.js";
import { h } from "./slot-html.js";
import { viewPermissionDenial, quietDenial, type CrudTask } from "../permissions/view-perms.js";

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
    if (optional !== undefined && optional !== false && !this.viz.has(requested)) {
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
  /** maximum nest depth (Ruby Card.config.max_depth; decko default 42). */
  maxDepth?: number;
}

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
    this.maxDepth = opts.maxDepth ?? 42;
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
        });
        if (denial !== undefined) return denial;
      }
      this.runBeforeHook(effective, voo);
      const viewFn = this.engine.views[effective];
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
   *    fires for rule cards only (right side is a setting). */
  private runBeforeHook(view: string, voo: Voo): void {
    if (view === "content") {
      // html/views.rb#prepare_content_slot
      voo.classUp("card-slot", "d0-card-content");
    } else if (view === "bar" && this.cardIsRule()) {
      // bar_view.rb:10 class_up "card-slot", "_rule-item #{category_classes}"
      const categories = this.ruleSetCategories(this.rightPartCodenameForRule());
      const classExtra = ["_rule-item", ...categories.map((c) => `_category-${c}`)].join(" ");
      voo.classUp("card-slot", classExtra);
    }
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
   *  category order (all, field, common) is the byte order the captured
   *  oracle pins — `card.rule_set.categories(setting).map { ... }` in
   *  Ruby returns them in declaration order. */
  private ruleSetCategories(settingCodename: string | undefined): string[] {
    if (settingCodename === undefined) return [];
    const result = ["all"];
    if (FIELD_SETTINGS.has(settingCodename)) result.push("field");
    if (COMMON_SETTINGS.has(settingCodename)) result.push("common");
    // "recent" requires the deck's recent_settings list — the corpus
    // capture doesn't exercise it (no corpus card has a recent rule).
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
    // do not exist); the view renders from the miss.
    const card =
      target ??
      this.buildUnknownNestCard(targetName, this.engine);
    const view = normalizeView(nest.options.view ?? this.defaultNestView());
    const viewOpts: Record<string, unknown> = {
      nest_name: card.name.s, // nest.rb#prepare_view_and_opts! nest_name ||= card.name
      nest_syntax: nest.syntax,
      ...(view === "closed" || view === "edit" ? { home_view: "open" } : { home_view: view }),
      ...this.nestOptionEntries(nest.options),
    };
    const sub = new RenderFormat(card, this.engine, { parent: this, maxDepth: this.maxDepth });
    if (this.depth >= this.maxDepth) {
      throw new Error(`nest depth exceeded (${card.name.s})`);
    }
    return sub.renderView(view, viewOpts);
  }

  /** The new-card a nest fetch miss produces (format/nest/fetch.rb#new_card
   *  -> new_card_args): name = the resolved reference, supercard = the
   *  context card (unmodeled - no write path reads it here), no id/type/
   *  content. The engine records the miss so the closure stays warm without
   *  re-prefetching (fetch.rb has no cache for unknown cards either). */
  private buildUnknownNestCard(targetName: string, engine: RenderEngineLike): RenderCard {
    const name = DeckoName.parse(targetName);
    const record: CardRecord = {
      id: undefined,
      codename: undefined,
      leftId: undefined,
      rightId: undefined,
      typeId: undefined,
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
      typeName: undefined,
      typeId: undefined,
      typeCode: undefined,
      id: undefined,
      dbContent: "",
      setKeys: safeSetKeys({ name, typeId: undefined, typeName: undefined, leftTypeName: undefined }),
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
   *  Cardio.config.default_html_view = :titled, mod/format.rb:2). */
  defaultNestView(): string {
    return "titled";
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
    const sub = new RenderFormat(target, this.engine, { parent: this, maxDepth: this.maxDepth });
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
   *  unchanged (Card::Content#to_s). */
  processContent(content: string): string {
    const pieces = scanNests(content);
    let out = "";
    for (const piece of pieces) {
      if (piece.kind === "text") {
        out += piece.text;
      } else if (piece.nest !== undefined) {
        out += this.nest(piece.nest);
      }
    }
    return out;
  }

  /** base.rb (card-mod-format)#core: process_content(_render_raw); the raw
   *  content of the record (content/all.rb:19). */
  renderRaw(): string {
    return this.card.dbContent;
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
