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
// Deferred (docs/render-port-notes.md): permission denial views, view
// caching/stubs, edit views, mod-specific view overrides, compact nest mode.

import { DeckoName } from "../name.js";
import type { CardRecord } from "../fetch/card-record.js";
import {
  scanNests,
  type NestOptions,
  type ParsedNest,
} from "./nest-syntax.js";
import { h } from "./slot-html.js";

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
  id: number | undefined;
  dbContent: string;
  /** pattern/all.rb#safe_set_keys (the slot class list). */
  setKeys: string;
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
   *  `.merge(view: requested_view)`. */
  slotOptions(): Record<string, unknown> {
    const out: Record<string, unknown> = { ...this.opts, view: this.requestedView };
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
    const voo = new Voo(this.voo ?? undefined, normalized, { ...opts });
    const previous = this.voo;
    this.voo = voo;
    try {
      voo.processVisibility(optional);
      this.runBeforeHook(normalized, voo);
      const viewFn = this.engine.views[normalized];
      if (viewFn === undefined) {
        // render.rb#view_method + error.rb#unsupported_view_error_message
        throw new UnsupportedViewError(normalized, this.card.name.s);
      }
      return viewFn({ fmt: this, voo });
    } finally {
      this.voo = previous;
    }
  }

  /** set/format.rb before(:view) hooks - the captured surface has exactly
   *  one: before(:content) { prepare_content_slot } (html/views.rb:6-8). */
  private runBeforeHook(view: string, voo: Voo): void {
    if (view === "content") {
      // html/views.rb#prepare_content_slot
      voo.classUp("card-slot", "d0-card-content");
    }
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
    const target = this.engine.fetchRenderCard(targetName);
    if (target === undefined) {
      // unknown-card nests need the unknown: views (error.rb) - wave 3
      throw new Error(`nest target not found: ${targetName} (referenced by ${this.card.name.s})`);
    }
    const view = normalizeView(nest.options.view ?? this.defaultNestView());
    const viewOpts: Record<string, unknown> = {
      nest_name: target.name.s, // nest.rb#prepare_view_and_opts! nest_name ||= card.name
      nest_syntax: nest.syntax,
      ...(view === "closed" || view === "edit" ? { home_view: "open" } : { home_view: view }),
      ...this.nestOptionEntries(nest.options),
    };
    const sub = new RenderFormat(target, this.engine, { parent: this, maxDepth: this.maxDepth });
    if (this.depth >= this.maxDepth) {
      throw new Error(`nest depth exceeded (${this.maxDepth}) at ${target.name.s}`);
    }
    return sub.renderView(view, viewOpts);
  }

  /** nest.rb#prepare_view_and_opts! - nest_name/nest_syntax are added
   *  separately above; the remaining shark options ride into the voo. */
  private nestOptionEntries(options: NestOptions): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    if (options.title !== undefined) out["title"] = options.title;
    if (options.size !== undefined) out["size"] = options.size;
    if (options.show !== undefined) out["show"] = options.show;
    if (options.hide !== undefined) out["hide"] = options.hide;
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
}

function normalizeView(view: string): string {
  return view; // Card::View.normalize (to_sym); TS views are strings already
}
