// The registration bookkeeping the mod loader writes into: the port of
// Card::Set::Registrar's module baskets (lib/card/set/registrar.rb), the
// Card::Setting registry (lib/card/setting.rb), and the view + view-config
// tables the set-module DSL populates (lib/card/set/format.rb +
// abstract_format/view_{definition,opts}.rb).
//
// The pre-existing TS registries keep their roles:
// - views land in the LIVE HTML_VIEWS record (src/card/render/views.ts) -
//   the same object reference every RenderEngine hands its formats
//   (render.ts: `this.views = HTML_VIEWS`). Registration mutates that
//   record the way Ruby's define_method replaces the old method
//   (view_definition.rb:18-21); the previous value is kept so an unload
//   restores it. No registry file is edited.
// - view CONFIGS (unknown:/perms:/wrap:/...) have no existing mutable TS
//   table (format.ts keeps private consts), so they live HERE; the
//   coordinator-applicable patch that makes the render path consult them
//   is
// - mod-registered PATTERNS extend the frozen PATTERN_TABLE via an overlay
//   here; patternTable() returns the combined concrete table in Ruby's
//   registration order. The core-only case is byte-identical to the
//   frozen table's order (oracle: help-mod-loader.json pattern_codes).

import type { ViewFn } from "../render/format.js";
import type { PatternSpec } from "../set-patterns/registry.js";
import type {
  ModSettingOpts,
  ModViewConfig,
} from "./mod-manifest.js";

// ---------------------------------------------------------------------------
// set-module name algebra (loader.rb#parts_from_path + helpers.rb#shortname)
// ---------------------------------------------------------------------------

/** loader.rb:61-65: strip the extension and segment-leading NN_ prefixes,
 *  then camelize each segment ("right/07_help" -> "Right::Help" shape).
 *  Rails camelize on snake parts: capitalize the first letter of each. */
function camelizedSegments(setPath: string): string[] {
  return setPath
    .split("/")
    .map((segment) => segment.replace(/^\d+_/, ""))
    .map(camelize);
}

/** loader.rb:61-65: strip the extension and segment-leading NN_ prefixes,
 *  then camelize each segment ("right/07_help" -> "Right::Help" shape).
 *  Rails camelize on snake parts: capitalize the first letter of each.
 *
 *  KNOWN DIVERGENCE FROM RUBY, MEASURED, NOT FIXED HERE. Ruby builds the
 *  constant chain from every path segment but
 *  Card::Set::Helpers#shortname (set/helpers.rb:11-15, with
 *  num_set_parts at helpers.rb:118-122 and anchor_parts_count at
 *  class_methods.rb:37-39) keeps only `pattern + num_set_parts` of them:
 *
 *    set/type/bootswatch_skin.rb              -> "Type::BootswatchSkin"
 *    set/type/bootswatch_skin/html_views.rb   -> ALSO "Type::BootswatchSkin"
 *      (SetTemplate#to_const, set_template.rb:11-19, nests the constant
 *       and `extend Card::Set` lands on the INNERMOST module
 *       (set_template.rb:112-124), whose `shortname` still spans only the
 *       pattern + its one anchor segment)
 *    set/all/email_html.rb                    -> "All"   (:all is
 *      ANCHORLESS, so anchor_parts_count is 0 — every set/all/* file shares
 *      the one "All" bucket as a single registration LIST)
 *
 *  So a file nested inside an anchor's directory, and every set/all/*
 *  file, get a shortname here that no card's safe_set_keys token can name.
 *  MEASURED consequence of applying the Ruby rule today:
 *  with the Ruby rule applied, 71 -> 53 new mod-loader failures, ~20 of
 *  them basket assertions ("every set module from the gem tree is in the
 *  basket" and friends) that pin the current per-path shortnames. It also
 *  makes SetModuleBasket#recordSetPath lossy - it keys by shortname, so
 *  every set/all/* file would collapse onto one entry and
 *  ModLoader#viewChain's ALL-token expansion (setModuleShortnamesForCode,
 *  which reads setPathFor(shortname)) would see a single set path.
 *  Closing it means re-keying the basket on per-module identity rather than
 *  on shortname, which is a separate change with its own blast radius.
 *
 *  What it blocks HERE: a view declared in a NESTED set file cannot be
 *  reached by any card, because the card's token names the parent anchor
 *  (safeKeyToModuleShortname, set-keys-to-modules.ts:107-113, already
 *  emits the Ruby shape) and this function emits a child name nothing
 *  looks up. That is why card-mod-bootstrap's :bar_bottom — declared in
 *  set/type/bootswatch_skin/html_views.rb — is still unregistered.
 *
 *  TWO FURTHER NAMED DIVERGENCES (both measured, both pinned as it.fails
 *  whose marks come off when the divergence closes):
 *
 *  1. CODENAME-KEY CHAIN WALK — CLOSED for codename-bearing anchors.
 *     Ruby's module lookup does NOT compare safe keys: Pattern::Base#
 *     module_key (set/pattern/base.rb:21-29 + set/pattern/class_methods.rb:
 *     45-50) builds the key from the anchor parts' CODENAMES, camelized.
 *     The walker used to convert safe_set_keys NAME keys (singularized,
 *     X-marked) and missed every plural-module anchor: the card token
 *     `RIGHT-Xenabled_role` (card `*enabled roles`, deck key `*enabled_role`)
 *     never spelled the registered `Right::EnabledRoles`. The codename
 *     resolution landed on this line (f725ec91 anchoredModuleCandidates +
 *     9144e6ec chain memos): rubySelfToken rewrites SELF tokens to the
 *     anchor's codename and anchoredModuleCandidates resolves each anchor
 *     part key -> id -> codename through the installed name environment,
 *     so the token now resolves `Right::EnabledRoles` (probed live on the
 *     composed deck, 2026-10-10: candidates ["Right::EnabledRoles"],
 *     definitive, and viewChain("... RIGHT-Xenabled_role ...", :edit_inline)
 *     answers Right::EnabledRoles first — the same probe rewrites
 *     SELF-Xfollow_default -> Self::FollowDefaults and
 *     SELF-Xaccount_link -> Self::AccountLinks). RESIDUAL: an anchor part
 *     whose key the installed environment cannot resolve (no card, or no
 *     codename) keeps the name-spelling fallback — definitive=false, never
 *     memoized (e.g. `RIGHT-follower` spells Right::Follower; the deck's
 *     anchor card is `*followers`/key `*follower`, so only the X-marked
 *     spelling reaches the codename). Ruby's own rule is the same shape:
 *     anchor_codenames breaks on the first codename-less part and builds
 *     no module key at all.
 *
 *  2. INCLUDE_SET SEAM (base-bucket shadowing of flat abstract
 *     registrations). computeResolvedView gives chain[0] priority over
 *     the flat record; the chainfor narrowing keeps abstract-set views
 *     flat ON PURPOSE (no include_set seam). So card-mod-collection's
 *     All::Item :count (base bucket) shadows Abstract::Search's flat
 *     :count for Search-typed cards; Ruby reaches the search module
 *     through include_set. */
export function setModuleShortname(setPath: string): string {
  return camelizedSegments(setPath).join("::");
}

/** Rails camelize for lowercase snake parts ("help_text" -> "HelpText"). */
function camelize(part: string): string {
  return part
    .split("_")
    .map((word) => (word === "" ? "" : word[0]!.toUpperCase() + word.slice(1)))
    .join("");
}

/** The pattern code of a set path ("right/help" -> "right"). */
export function setPathPattern(setPath: string): string {
  return setPath.split("/")[0] ?? "";
}

// ---------------------------------------------------------------------------
// Card::Set::Registrar - the module baskets (registrar.rb:21-29, 74-77)
// ---------------------------------------------------------------------------

export type SetModuleKind = "base" | "abstract" | "nonbase";

export interface RegisteredSetModule {
  /** Card::Set::<Pattern>::<Anchor> shortname ("All::Help"). */
  readonly shortname: string;
  readonly kind: SetModuleKind;
  /** the mod that contributed it (bookkeeping Ruby keeps via the module
   *  constant's source_location). */
  readonly modName: string;
}

/** The modules basket (set.rb:137-141 shape; the format baskets ride the
 *  view registrations here). registerSet dedupes like
 *  register_set_of_type: `list << set_module unless list.member?`
 *  (registrar.rb:74-77). */
export class SetModuleBasket {
  readonly base: RegisteredSetModule[] = [];
  readonly abstract: RegisteredSetModule[] = [];
  readonly nonbase: Map<string, RegisteredSetModule[]> = new Map();
  /** shortname -> setPath (the loader's bookkeeping reverse map, used by
   *  the chain walker's anchorless-token expansion to recover the
   *  pattern code for each registered module). */
  private readonly shortnameToSetPath = new Map<string, string>();

  register(module: RegisteredSetModule): void {
    const list =
      module.kind === "base"
        ? this.base
        : module.kind === "abstract"
          ? this.abstract
          : (this.nonbase.get(module.shortname) ?? []);
    if (module.kind === "nonbase") this.nonbase.set(module.shortname, list);
    // Ruby's member? compares the module CONSTANT - the same set path from
    // the same mod is the same module across loads, so dedupe by identity
    // (shortname + contributing mod), not object reference.
    const exists = list.some(
      (m) => m.shortname === module.shortname && m.modName === module.modName,
    );
    if (!exists) list.push(module);
  }

  /** Track a shortname <-> setPath mapping so the chain walker can
   *  recover the pattern code. The loader calls this alongside
   *  registerSetModule so the basket carries the Ruby-source setPath
   *  alongside the shortname (registrar.rb:21-29's bookkeeping). */
  recordSetPath(shortname: string, setPath: string): void {
    this.shortnameToSetPath.set(shortname, setPath);
  }

  /** Look up the setPath for a registered shortname. */
  setPathFor(shortname: string): string | undefined {
    return this.shortnameToSetPath.get(shortname);
  }

  /** Every nonbase RegisteredSetModule, flattened across all shortnames,
   *  in insertion order. Used by the chain walker's anchorless-token
   *  expansion to find every set module whose pattern code matches. */
  allNonbase(): RegisteredSetModule[] {
    const out: RegisteredSetModule[] = [];
    for (const list of this.nonbase.values()) out.push(...list);
    return out;
  }

  clear(): void {
    this.base.length = 0;
    this.abstract.length = 0;
    this.nonbase.clear();
    this.shortnameToSetPath.clear();
  }
}

// ---------------------------------------------------------------------------
// Card::Setting - the settings registry (setting.rb:6-124)
// ---------------------------------------------------------------------------

export interface RegisteredSetting {
  readonly codename: string;
  readonly group: string;
  readonly ruleTypeEditable: boolean;
  readonly shortHelpText: string | undefined;
  /** help_text on the Self set (setting.rb:112-114 stores both). */
  readonly rawHelpText: string | undefined;
  /** help_text on the Right set (setting.rb:112-114). */
  readonly rightRawHelpText: string | undefined;
  /** restricted_to_type cardtype codenames (setting.rb:116-123). */
  readonly restrictedToType: readonly string[];
}

/**
 * The Card::Setting groups/preferences registry. Group arrays keep Ruby's
 * exact shape INCLUDING the nil holes `grp[pos - 1] = self` leaves behind
 * (setting.rb#set_position:101-110) - the oracle capture pins them
 * (help-mod-loader.json setting_groups.editing[1] === null).
 */
export class SettingRegistry {
  /** group -> slot array; null = a Ruby nil hole. */
  readonly groups: Map<string, (RegisteredSetting | null)[]> = new Map();
  /** Card::Setting.preferences (setting.rb:56, 95-99). */
  readonly preferences: Set<string> = new Set();

  /**
   * register_setting (setting.rb:63-72) + set_position (101-110) +
   * help_text_for_setting (112-114) + register_preference (95-99).
   * `codename` mirrors setting.rb:96 (the set anchor, underscored); a
   * manifest ModSettingOpts leaves it to the caller to derive from the
   * setPath anchor.
   */
  register(codename: string, opts: ModSettingOpts): RegisteredSetting {
    const group = opts.group ?? "other";
    const entry: RegisteredSetting = {
      codename,
      group,
      ruleTypeEditable: opts.ruleTypeEditable ?? false,
      shortHelpText: opts.shortHelpText,
      rawHelpText: opts.helpText,
      rightRawHelpText: opts.helpText,
      restrictedToType: opts.restrictedToType ?? [],
    };

    const grp = this.groups.get(group) ?? [];
    this.groups.set(group, grp);
    const pos = opts.position;
    if (pos === undefined) {
      grp.push(entry); // set_position without :position -> append
    } else {
      const idx = pos - 1;
      // Ruby truthiness: an occupied slot (any object) inserts BEFORE it;
      // nil (or past the end) assigns - growing the array with nil holes.
      if (grp[idx] !== undefined && grp[idx] !== null) {
        grp.splice(idx, 0, entry);
      } else {
        while (grp.length < idx) grp.push(null);
        grp[idx] = entry;
      }
    }

    if (opts.preference === true) this.preferences.add(codename);
    return entry;
  }

  /** Card::Setting.codenames (setting.rb:36-38): groups' entries flattened
   *  and compacted (nil holes dropped). */
  codenames(): string[] {
    const out: string[] = [];
    for (const grp of this.groups.values()) {
      for (const entry of grp) {
        if (entry !== null) out.push(entry.codename);
      }
    }
    return out;
  }

  /** Card::Setting.preference? (setting.rb:40-42). */
  preferenceIs(codename: string): boolean {
    return this.preferences.has(codename);
  }

  clear(): void {
    this.groups.clear();
    this.preferences.clear();
  }

  /** The setting registered for a codename (first match across groups). */
  findByCodename(codename: string): RegisteredSetting | undefined {
    for (const grp of this.groups.values()) {
      for (const entry of grp) {
        if (entry !== null && entry.codename === codename) return entry;
      }
    }
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// view configs (view_opts.rb VIEW_SETTINGS registry) + pattern overlay
// ---------------------------------------------------------------------------

/**
 * The mod-contributed view-config table: the `_view_<view>__<setting>`
 * methods Ruby defines on the format module (view_opts.rb:59-64). Later
 * registrations win, mirroring module reopening.
 */
export class ModViewConfigTable {
  private readonly byView = new Map<string, ModViewConfig>();
  /** (setModule shortname, view) -> config. The per-SET dimension Ruby's
   *  `_view_<view>__<setting>` method resolution answers through: the
   *  setting method exists only on the set modules that declared the view
   *  with the setting, and Ruby's method lookup takes the most specific
   *  defining module. The flat byView map is the base-format seam only
   *  (render-path byte compatibility); the per-card `unknown:` resolution
   *  reads THIS table (see
   *  ModLoader#viewUnknownSettingForCard). */
  private readonly byModuleView = new Map<string, ModViewConfig>();

  register(view: string, config: ModViewConfig | undefined): void {
    if (config === undefined) return;
    this.byView.set(view, config);
  }

  /** Record the config under its contributing set module (same
   *  registration pass as register(), keyed by the module shortname). */
  registerForModule(setModule: string, view: string, config: ModViewConfig | undefined): void {
    if (config === undefined) return;
    this.byModuleView.set(`${setModule}\u0000${view}`, config);
  }

  /** format.rb#view_setting's mod half (render.rb:55-57 consults the
   *  _view_<view>__<setting> method; this answers it for mod views). */
  configFor(view: string): ModViewConfig | undefined {
    return this.byView.get(view);
  }

  /** The config a SPECIFIC set module declared for a view (undefined when
   *  that module did not declare it — the chain walk moves on to the next
   *  module, Ruby's MRO semantics). */
  configForModule(setModule: string, view: string): ModViewConfig | undefined {
    return this.byModuleView.get(`${setModule}\u0000${view}`);
  }

  entries(): ReadonlyMap<string, ModViewConfig> {
    return this.byView;
  }

  clear(): void {
    this.byView.clear();
    this.byModuleView.clear();
  }
}

/**
 * The concrete pattern overlay: core patterns (the frozen PATTERN_TABLE, in
 * its lookup order) plus mod registrations front-inserted the way
 * ClassMethods#register does - `Pattern.concrete.insert opts[:index].to_i,
 * self`, no option = index 0 (class_methods.rb:13-18).
 */
export class PatternOverlay {
  /** codes in CONCRETE (lookup) order, core + mods. */
  private concrete: string[] = [];
  private readonly specs = new Map<string, PatternSpec>();

  /** Seed with the core table's codes in lookup order. */
  seedCore(codes: readonly string[]): void {
    this.concrete = [...codes];
  }

  register(code: string, spec: PatternSpec, index: number | undefined): void {
    this.specs.set(code, spec);
    const at = index ?? 0;
    // Ruby Array#insert clamps out-of-range positions to the end.
    const clamped = Math.max(0, Math.min(at, this.concrete.length));
    this.concrete.splice(clamped, 0, code);
  }

  specFor(code: string): PatternSpec | undefined {
    return this.specs.get(code);
  }

  /** Pattern.concrete (pattern.rb:12-14) - lookup order. */
  concreteCodes(): string[] {
    return [...this.concrete];
  }

  /** Pattern.grouped_codes (pattern.rb:47-51): [[:all], [:abstract],
   *  nonbase reversed]. */
  groupedCodes(withAll = true): string[][] {
    const nonbase = this.concrete.filter((code) => code !== "all").reverse();
    const groups: string[][] = [["abstract"], nonbase];
    if (withAll) groups.unshift(["all"]);
    return groups;
  }

  clear(): void {
    this.concrete = [];
    this.specs.clear();
  }
}

// ---------------------------------------------------------------------------
// view registration with override tracking (flat last-wins, render-path compat)
// ---------------------------------------------------------------------------

/**
 * Mutates the live views record the way Ruby's define_method replaces a
 * method, remembering every replaced/added entry so unload restores the
 * pre-load state exactly.
 *
 * The flat last-wins table is the render-path seam (RenderEngine.views);
 * the per-set-module table below is the chain-aware companion used to
 * resolve views per-card (Ruby's MRO walk: format.rb:62-68 +
 * set/format.rb:146-150) and to provide super()-style delegation
 * (view_definition.rb:18-21).
 */
export class ViewRegistrationTable {
  private readonly undo = new Map<string, ViewFn | undefined>();
  private readonly touched = new Set<string>();

  constructor(private readonly views: Record<string, ViewFn>) {}

  register(view: string, viewFn: ViewFn): void {
    if (!this.touched.has(view)) {
      this.undo.set(view, this.views[view]);
      this.touched.add(view);
    }
    this.views[view] = viewFn; // define_method replace: later wins
  }

  /** The live views record (what RenderEngine hands its formats). */
  record(): Record<string, ViewFn> {
    return this.views;
  }

  /** Restore the exact pre-load state (every touched key back to
   *  its previous value or removed when the loader added it). */
  unregisterAll(): void {
    for (const [view, previous] of this.undo) {
      if (previous === undefined) delete this.views[view];
      else this.views[view] = previous;
    }
    this.undo.clear();
    this.touched.clear();
  }

  touchedViews(): string[] {
    return [...this.touched];
  }
}

// ---------------------------------------------------------------------------
// chain-aware view table (Ruby MRO walk per card, set/format.rb:146-150)
// ---------------------------------------------------------------------------

/**
 * One resolved step in a view chain for a specific card: which set module
 * contributed it and which view fn that module registered. Used by the
 * chain walker + superView helper to delegate to the next set module's
 * same view (Ruby's `super()` in view bodies).
 */
export interface ViewChainEntry {
  readonly setModule: string;
  readonly view: string;
  readonly viewFn: ViewFn;
}

/**
 * The per-set-module view table: Ruby's "module reopening with
 * define_method" (view_definition.rb:18-21) per set module. Each set
 * module contributes the views it defines; later registrations from the
 * SAME set module override earlier ones (mirrors reopening).
 *
 * The loader records each `view :name` call alongside the set module it
 * came from; the format's render path consults this table to walk Ruby's
 * MRO per card (set modules most-specific-first), and the superView helper
 * consults it to find the next module's same view.
 *
 * The table is independent of the flat last-wins ViewRegistrationTable:
 * the live views record is the render-path seam (engine.views[view]) and
 * stays byte-compatible with the existing render layer; the chain table
 * is the new lookup the super()-aware dispatch walks.
 */
export class SetModuleViewTable {
  /** set module shortname -> (view name -> view fn). Insertion order is
   *  preserved per shortname so a later re-registration from the same mod
   *  wins (Ruby reopening). */
  private readonly byModule = new Map<string, Map<string, ViewFn>>();

  /** Insertion-ordered list of (setModule, view, viewFn, kind, format)
   *  tuples across all set modules. Used by the chain walker when the
   *  per-card chain is empty (every view applies) so the walker falls
   *  back to the UNIVERSALLY APPLICABLE registrations in load order -
   *  the set/all/* bucket, never a set-scoped one (see
   *  universallyApplicableModulesFor). `format` is the manifest format
   *  key the view was declared under (set/format.rb:120-144 files each
   *  all-set format module under its own format class) - the anchorless
   *  chain expansion consults it so an html registration never enters an
   *  email_text chain and vice versa. */
  private readonly order: Array<{
    setModule: string;
    view: string;
    viewFn: ViewFn;
    kind: SetModuleKind;
    format: string;
  }> = [];

  /** record(view, viewFn, setModule, kind, format): register a view under
   *  its set module. A re-registration from the same set module + format
   *  replaces (Ruby reopening of the set's format module);
   *  `kind` is the module's registrar.rb:21-29 bucket; "base" (set/all/*)
   *  is the only kind whose views reach a card outside the set.
   *  `format` is the manifest format key (default "html") - Ruby files
   *  the format module per format class (set/format.rb:120-144). */
  register(
    setModule: string,
    view: string,
    viewFn: ViewFn,
    kind: SetModuleKind = "nonbase",
    format = "html",
  ): void {
    let inner = this.byModule.get(setModule);
    if (inner === undefined) {
      inner = new Map<string, ViewFn>();
      this.byModule.set(setModule, inner);
    }
    const first = this.order.find(
      (e) =>
        e.setModule === setModule && e.view === view && e.format === format,
    );
    if (first !== undefined) {
      // Same set module + format re-opened (Ruby reopening of the set's
      // format module, set/format.rb:120-124 const_get_or_set klass):
      // update in place. The tuple's position stays as the "earliest"
      // marker so super() walks past re-openings.
      first.viewFn = viewFn;
      inner.set(view, viewFn);
      this.byModuleViewFormat.set(`${setModule}\u0000${view}\u0000${format}`, viewFn);
      return;
    }
    inner.set(view, viewFn);
    this.order.push({ setModule, view, viewFn, kind, format });
    this.byModuleViewFormat.set(`${setModule}\u0000${view}\u0000${format}`, viewFn);
  }

  /** The view fn a set module registered for the view under ONE format
   *  key (the anchorless chain expansion's per-format probe; the LAST
   *  matching registration wins - Ruby reopening). Undefined when the
   *  module never declared the view in that format. */
  viewForFormat(setModule: string, view: string, format: string): ViewFn | undefined {
    return this.byModuleViewFormat.get(`${setModule}\u0000${view}\u0000${format}`);
  }

  /** (setModule, view, format) -> view fn, kept in step with `order` by
   *  register(): one registration per triple (a reopening updates it). */
  private readonly byModuleViewFormat = new Map<string, ViewFn>();

  /** The view fn a set module registered for the given view name
   *  (undefined if none - the chain walker's "next module" probe). */
  viewFor(setModule: string, view: string): ViewFn | undefined {
    return this.byModule.get(setModule)?.get(view);
  }

  /** Every set module shortname whose registration of this view applies to
   *  EVERY card — the set/all/* bucket, in load order. This is the
   *  "no set applies" case, and it is Ruby's base format class:
   *  process_base_format_modules (registrar.rb:79-84) mixes the all-set
   *  format modules into the class every card's format inherits, so a
   *  plain RichText card resolving :content off an empty chain gets the
   *  base method. A set/type/*, set/right/* or set/abstract/* registration
   *  is NOT in this list: pattern/all.rb:49-55 only reaches
   *  modules[:nonbase_format] through the card's OWN concrete pattern
   *  module keys (pattern/base.rb:35-38), so a card outside the set never
   *  sees it. Returning those here is what let one registration replace a
   *  shared view deck-wide. */
  universallyApplicableModulesFor(view: string): string[] {
    const out: string[] = [];
    for (const e of this.order) {
      if (e.view === view && e.kind === "base" && !out.includes(e.setModule)) {
        out.push(e.setModule);
      }
    }
    return out;
  }

  /**
   * The chain of view fns for (cardChain, view) in MOST-SPECIFIC-FIRST
   * order. cardChain is the set module shortnames for the card being
   * rendered (most-specific first, Ruby's MRO). The walker returns an
   * ordered list of ViewChainEntry so the superView helper can step
   * forward through it.
   *
   * Resolution: for each set module in cardChain (most-specific first),
   * find the LATEST registration of `view` under that set module. The
   * chain terminates when no further set module in cardChain has a
   * registration for `view` AND no fallback is requested.
   *
   * emptyChain: when cardChain is empty, the walker falls back to the
   * UNIVERSALLY APPLICABLE registrations in load order — the set/all/*
   * bucket and nothing else. That is the base format class Ruby resolves
   * to when no set matches (registrar.rb:79-84 mixes the all-set format
   * modules into the class every card's format inherits; a set-scoped
   * module is reachable only through the card's own pattern module keys,
   * pattern/all.rb:49-55). Returning set-scoped modules here let a single
   * registration become the render fallthrough for every card.
   */
  chainFor(cardChain: readonly string[], view: string): ViewChainEntry[] {
    const out: ViewChainEntry[] = [];
    if (cardChain.length === 0) {
      // Fallback: the set/all/* modules, in load order.
      for (const mod of this.universallyApplicableModulesFor(view)) {
        const viewFn = this.viewFor(mod, view);
        if (viewFn !== undefined) out.push({ setModule: mod, view, viewFn });
      }
      return out;
    }
    // Walk the card's set module chain; for each, find the view.
    for (const mod of cardChain) {
      const viewFn = this.viewFor(mod, view);
      if (viewFn !== undefined) out.push({ setModule: mod, view, viewFn });
    }
    return out;
  }

  /** Drop every per-set-module registration. Loader-side reset hook. */
  clear(): void {
    this.byModule.clear();
    this.byModuleViewFormat.clear();
    this.order.length = 0;
  }

  /** Every (setModule, view, format) registration (introspection). */
  entries(): Array<{ setModule: string; view: string; viewFn: ViewFn; format: string }> {
    return [...this.order];
  }
}
