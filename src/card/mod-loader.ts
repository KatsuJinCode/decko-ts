// The mod loader: TypeScript port of Cardio::Mod::Loader's registration
// mechanism (card-1.110.0 lib/cardio/mod/loader.rb + loader/*.rb), which is
// how a card-mod gem plugs its set patterns, views, and setting
// registrations into the running deck.
//
// Ruby's load (Loader.load_mods, loader.rb:16-21) runs four phases:
//   1. SetPatternLoader.load - every mod's set_pattern/*.rb, in mod order,
//      each file registering a pattern class (front-insert into
//      Pattern.concrete, lib/card/set/pattern/class_methods.rb:13-18)
//   2. SetLoader.load - every mod's set/**/*.rb, walked in
//      Pattern.grouped_codes groups ([:all], [:abstract], then the nonbase
//      patterns in load order - set_loader.rb:26-44 + pattern.rb:47-51),
//      mods outer / patterns inner / files path-sorted. Loading a file
//      registers its set module (registrar.rb:16-29), defines its views on
//      the format module (view_definition.rb:18-21) and runs its
//      setting_opts (advanced_api.rb:10-14)
//   3. Card::Set.process_base_modules (registrar.rb:42-49) - the base
//      include phase; the TS registries have no base-class inclusion to
//      replay (views are table entries), so this phase is a no-op here
//   4. the late initializers (config/late) - the prepareEngine hook covers
//      the mod state that must exist before the first render
//   SetLoader.load finishes with Card::Set.finalize_load (set_loader.rb:
//   17-20); its clean_empty_modules drops modules that defined nothing -
//   nothing to clean in the TS tables.
//
// The loader is HARMFUL-state-free by construction: every registration is
// recorded and reset() restores the pre-load state (views, configs,
// settings, patterns, module baskets).
//
// reload_sets (loader.rb:23-28) is reset() + load().

import { HTML_VIEWS } from "./render/views.js";
import type { ViewFn } from "./render/format.js";
import { PATTERN_TABLE, type PatternSpec } from "./set-patterns/registry.js";
import {
  resolveModOrder,
  normalizeModName,
  ModNameConflictError,
  type ModDirsInput,
  type ResolvedModEntry,
} from "./mod-loader/mod-order.js";
import {
  SetModuleBasket,
  SettingRegistry,
  ModViewConfigTable,
  PatternOverlay,
  ViewRegistrationTable,
  SetModuleViewTable,
  setModuleShortname,
  setPathPattern,
  type RegisteredSetModule,
  type SetModuleKind,
  type ViewChainEntry,
} from "./mod-loader/mod-registrar.js";
import {
  anchoredModuleCandidates,
  rubySelfToken,
  safeKeyToModuleShortname,
} from "./render/set-keys-to-modules.js";
import { SET_INCLUDES } from "./mod-loader/concrete-set-includes.js";
import { getNameEnvironment } from "./name/environment.js";
import {
  ContentOverrideRegistry,
  setDefaultContentOverrideRegistry,
} from "./render/content-overrides.js";
import {
  VirtualCardRegistry,
  setDefaultVirtualCardRegistry,
} from "./render/virtual-card-registry.js";
import {
  registerGemTypeAssignments,
  registerSetTypeAssignment,
  resetSetTypeAssignments,
} from "./set-patterns/set-type-assignment.js";
import { registerModRuleSeed } from "./mod-loader/mod-rule-seeds.js";
/** The registered format names whose Ruby class descends from HtmlFormat
 *  (AbstractFormat#format_ancestry, registration.rb:60-65) and therefore
 *  reopens the html method table when they carry no own registration:
 *  rss (RssFormat < HtmlFormat, card-mod-format-0.20.0 rss_format.rb:6)
 *  and email_html (EmailHtmlFormat < Card::Format::HtmlFormat,
 *  card-mod-email-0.20.0 email_html_format.rb:6). css/js do NOT descend
 *  from html — CssFormat and JsFormat subclass Format DIRECTLY
 *  (css_format.rb:6, js_format.rb:6) — so a css/js chain miss reaches the
 *  BASE tail below, never the html chain (include_set_format_modules,
 *  format.rb:57-63, walks exactly the format_ancestry). The set as it stood
 *  before this scoping was applied also carried css/js, on the model that any
 *  format could reopen the html table; that model is wrong for a format that
 *  does not descend from html. Narrowing the set costs nothing observable:
 *  zero css/js chain requests exist (the only non-html dispatch is email_text,
 *  render/views.ts:1443) and zero css-keyed registrations, so no byte rode
 *  the broader fallback — pinned by tests/card/mod-loader/
 *  view-dispatch-css-js-format-ancestry-census.test.ts. email_text
 *  (EmailTextFormat < TextFormat < Format) does NOT descend; its chain
 *  misses reach the base record, never the html chain. */
const HTML_DESCENDED_FORMATS = new Set(["rss", "email_html"]);

/** The Ruby superclass of each non-base format class (card-mod-format
 *  lib/card/format/*_format.rb): rss and email_html < html; json, yaml and
 *  xml < data; jsonld < json (jsonld_format.rb:6); scss < css. A format
 *  absent from the table sits on Card::Format itself. */
const FORMAT_PARENT: Readonly<Record<string, string>> = {
  rss: "html",
  email_html: "html",
  email_text: "text",
  json: "data",
  yaml: "data",
  xml: "data",
  jsonld: "json",
  scss: "css",
};

/** The format's class chain above it, most specific first, without base:
 *  jsonld -> [jsonld, json, data]; rss -> [rss, html]. */
export function formatLineage(format: string): string[] {
  const out: string[] = [format];
  let parent = FORMAT_PARENT[format];
  while (parent !== undefined && !out.includes(parent)) {
    out.push(parent);
    parent = FORMAT_PARENT[parent];
  }
  return out;
}

/** Whether a format's class descends from HtmlFormat (or is it). */
export function htmlLineage(format: string): boolean {
  return format === "html" || HTML_DESCENDED_FORMATS.has(format);
}
import {
  ModEventRegistry,
  setDefaultModEventRegistry,
} from "./mod-loader/mod-event-registry.js";
import type {
  DeckoModManifest,
  ModBasketTask,
  ModCardAccessor,
  ModEngineHost,
  ModEventRegistration,
  ModEventStage,
  ModSetModuleFile,
  ModViewWrapSpec,
} from "./mod-loader/mod-manifest.js";
import type { ContentFn } from "./render/content-overrides.js";
import type { RegisteredModEvent } from "./mod-loader/mod-event-registry.js";

export { normalizeModName, resolveModOrder } from "./mod-loader/mod-order.js";
export { ModNotFoundError, ModNameConflictError } from "./mod-loader/mod-order.js";
export { SettingRegistry, PatternOverlay, setModuleShortname, SetModuleViewTable } from "./mod-loader/mod-registrar.js";
export type { ViewChainEntry } from "./mod-loader/mod-registrar.js";
export { ModEventRegistry, setDefaultModEventRegistry, eventsForStage } from "./mod-loader/mod-event-registry.js";
export type { RegisteredModEvent } from "./mod-loader/mod-event-registry.js";
export { ContentOverrideRegistry, setDefaultContentOverrideRegistry, contentOverrideFor, resolveContentOverride } from "./render/content-overrides.js";
export type { ContentFn, RegisteredContentOverride } from "./render/content-overrides.js";
export { modEngineHost } from "./mod-loader/mod-engine-host.js";
export { default as cardModHelp } from "./mod-loader/mods/card-mod-help.js";
export { defineMod } from "./mod-loader/mod-dsl.js";
export type { ModDsl, SetDsl, FormatDsl, ViewOptions, EventOptions, AccessorOptions, ModOptions } from "./mod-loader/mod-dsl.js";
export { setKeysToModuleChain } from "./render/set-keys-to-modules.js";
export type { DeckoModManifest, ModEngineHost } from "./mod-loader/mod-manifest.js";
export type { ModViewConfig, ModSetModuleFile, ModSettingOpts, ModPatternRegistration } from "./mod-loader/mod-manifest.js";
export type { ModBasketTask, ModCardAccessor } from "./mod-loader/mod-manifest.js";
export type { ModEventRegistration, ModEventStage, ModEventTrigger, ModEventCard, ModEventFn } from "./mod-loader/mod-manifest.js";
export type { RegisteredSetting } from "./mod-loader/mod-registrar.js";

/** One `basket[:tasks][:name] = {...}` contribution, with the contributing
 *  mod + set path recorded (the registrar's provenance pattern). */
export interface RegisteredBasketTask extends ModBasketTask {
  readonly setPath: string;
  readonly modName: string;
}

/** One `basket[:warnings] << :name` contribution. */
export interface RegisteredBasketWarning {
  readonly warning: string;
  readonly setPath: string;
  readonly modName: string;
}

/** One `card_accessor` / `card_reader` / `card_writer` declaration, with the
 *  contributing mod + set path recorded. */
export interface RegisteredCardAccessor extends ModCardAccessor {
  readonly setPath: string;
  readonly modName: string;
}

/** One mod input: the manifest plus the Dirs bookkeeping. */
export interface ModSource {
  /** the manifest (a ported mod's default export). */
  readonly manifest: DeckoModManifest;
  /** load position group (resolved order carries it; defaults "custom"). */
  readonly group?: string;
}

export interface ModLoadReport {
  /** mods in load order (normalized names). */
  readonly modNames: string[];
  /** pattern codes the MODS registered (front-inserted; lookup order). */
  readonly registeredPatternCodes: string[];
  /** set modules registered, in load order ("All::Help" etc.). */
  readonly registeredSetModules: string[];
  /** view names registered (all formats; later mods' wins recorded). */
  readonly registeredViews: string[];
  /** setting codenames registered via setting_opts. */
  readonly registeredSettings: string[];
  /** set paths with a registered `def content` override, in load order. */
  readonly registeredContentOverrides: string[];
  /** event names registered via manifest events, in load order. */
  readonly registeredEvents: string[];
}

export class ModLoader {
  private readonly sources = new Map<string, ModSource>();
  /** mod load order (empty until load()). */
  private order: ResolvedModEntry[] = [];
  private loaded = false;
  /** Monotonic generation counter incremented on every load() and reset().
   *  The render engine embeds this in its view-dispatch cache key so a
   *  load()/reset() cycle invalidates any cached view fn that was resolved
   *  under the previous generation. Without this the cached entry from
   *  a prior generation would shadow the mod's freshly-registered (or
   *  freshly-removed) view fn — reset() would not appear to "restore
   *  pre-load dispatch" because the cache still served the old fn, and
   *  a fresh load() would not appear to land its hand-typed view fn
   *  because the cache still served the prior base fn.
   *  The counter starts at 0 (pre-load baseline) and is bumped to 1
   *  by the first load()/reset(); subsequent cycles keep incrementing.
   *  Multiple load() calls without a reset() bump the counter each
   *  time (a reload still invalidates prior caches). */
  private generation = 0;

  private readonly views: ViewRegistrationTable;
  /** Per-set-module view table: the chain-aware companion to `views`.
   *  Populated alongside the flat last-wins record so the chain walker can
   *  resolve Ruby's MRO per card and the superView helper can delegate
   *  to the next module's same view (set/format.rb:146-150). */
  private readonly viewChains = new SetModuleViewTable();
  private readonly viewConfigs = new ModViewConfigTable();
  private readonly settings = new SettingRegistry();
  private readonly patterns = new PatternOverlay();
  private readonly basket = new SetModuleBasket();
  /** The set-module `def content` overrides (right/when_created.rb:7 etc.),
   *  registered from ModSetModuleFile.contentOverrides during the SetLoader
   *  phase. The render path consults it via resolveContentOverride
   *  (format.ts renderRaw) once the deck boot binds the default
   *  (setDefaultContentOverrideRegistry) - binding is the composition
   *  seam's job (defaultDeckLoader), never load()'s, so manual wirings
   *  (tests) are not clobbered by an unrelated load(). */
  private readonly contentOverrides = new ContentOverrideRegistry();
  /** The set modules that OVERRIDE `virtual?` (the gem's
   *  `def virtual?; new?; end`), registered from
   *  ModSetModuleFile.virtual during the SetLoader phase. Their cards are
   *  KNOWN without a database row (card-1.110.0 mod/core/set/all/states.rb
   *  :44-50 `virtual?` + :60-62 `known?`), so the render layer's
   *  absent-root seat does not mark them unknown (the create-form arm,
   *  card-mod-format set/all/html/error.rb:81-86). The render path
   *  consults it through src/card/render/virtual-card-registry.ts once the
   *  deck boot binds the default (setDefaultVirtualCardRegistry). */
  private readonly virtualCards = new VirtualCardRegistry();
  /** The set-module `event` declarations (lib/card/set/event.rb DSL),
   *  registered from ModSetModuleFile.events during the SetLoader phase.
   *  The execution seam (the action engine's stages) will consult it via
   *  eventsForStage once the deck boot binds the default. */
  private readonly modEvents = new ModEventRegistry();
  /** The set-module basket contributions (set/self/admin.rb's
   *  `basket[:tasks][:name] = {...}` / `basket[:warnings] << :name`),
   *  collected in load order. The *admin :core/:warning views read the
   *  deck basket = core's own entries merged with these. */
  private readonly basketTaskEntries: RegisteredBasketTask[] = [];
  private readonly basketWarningEntries: RegisteredBasketWarning[] = [];
  /** The set-module trait declarations (lib/card/set/trait.rb), in load
   *  order. */
  private readonly cardAccessorEntries: RegisteredCardAccessor[] = [];

  constructor(mods: readonly ModSource[], views: Record<string, ViewFn> = HTML_VIEWS) {
    this.views = new ViewRegistrationTable(views);
    for (const mod of mods) this.add(mod);
  }

  /** dirs.rb#add_mod's name-conflict gate (dirs.rb:66-71). */
  add(mod: ModSource): void {
    const name = normalizeModName(mod.manifest.name);
    if (this.sources.has(name)) throw new ModNameConflictError(name);
    this.sources.set(name, mod);
    this.loaded = false; // a new mod invalidates the loaded state
  }

  /** dirs.rb#fetch_mod (dirs.rb:100-102): undefined for unknown names. */
  fetchMod(modName: string): ModSource | undefined {
    return this.sources.get(normalizeModName(modName));
  }

  /** "mod not found: X" for a name the deck requires but does not provide
   *  (mod.rb:88-95's required_path raise, surfaced at load time). */
  requireMod(modName: string): ModSource {
    const mod = this.fetchMod(modName);
    if (mod === undefined) {
      throw new Error(`mod not found: ${normalizeModName(modName)}`);
    }
    return mod;
  }

  /** The resolved Cardio::Mod::Dirs order (gems, deck dirs). The compiled-in
   *  core (PATTERN_TABLE + the core views) IS the ported "core mod", so the
   *  loader defaults coreMods to empty - a deck lists no core manifest. */
  resolveOrder(input: ModDirsInput): void {
    this.order = resolveModOrder({ ...input, coreMods: input.coreMods ?? [] });
    // Every listed mod must exist (mod.rb:88-95).
    for (const entry of this.order) this.requireMod(entry.name);
    this.loaded = false;
  }

  get isLoaded(): boolean {
    return this.loaded;
  }

  /**
   * Loader.load_mods (loader.rb:16-21): the SetPatternLoader phase, the
   * SetLoader phase, and finalize. Ruby runs this ONCE per boot on fresh
   * registries; the TS load() therefore starts every run from that clean
   * slate (patterns reseeded from the compiled-in core, the settings
   * registry cleared) and is idempotent: a second load() produces the same
   * state as the first.
   */
  load(): ModLoadReport {
    this.generation++;
    bumpModGeneration();
    const modNames = this.order.length > 0
      ? this.order.map((entry) => entry.name)
      : [...this.sources.keys()];
    const ordered = modNames.map((name) => {
      const mod = this.sources.get(name);
      if (mod === undefined) throw new Error(`mod not found: ${name}`);
      return mod;
    });

    const registeredPatternCodes: string[] = [];
    const registeredSetModules: string[] = [];
    const registeredViews: string[] = [];
    const registeredSettings: string[] = [];
    const registeredContentOverrides: string[] = [];
    const registeredEvents: string[] = [];
    this.basketTaskEntries.length = 0;
    this.basketWarningEntries.length = 0;

    // The compiled-in core patterns seed the concrete table (the ported
    // "core mod" - mod/core/set_pattern/01..09, oracle order in
    // PATTERN_TABLE); mod registrations then front-insert on top. The
    // settings registry starts empty the way Ruby's boot does. The
    // type-assignment registry likewise: Ruby's Set::Type.assignment is a
    // cattr hash populated ONLY by set-module assign_type lines at boot
    // (advanced_api.rb:5-8), so every load() restarts it from empty and the
    // phase-2 walk re-registers each file's entry.
    this.patterns.seedCore(PATTERN_TABLE.map((spec) => spec.code));
    this.settings.clear();
    this.contentOverrides.clear();
    this.virtualCards.clear();
    this.modEvents.clear();
    resetSetTypeAssignments();

    // ---- phase 1: SetPatternLoader (loader.rb:17) ------------------------
    for (const mod of ordered) {
      const files = [...(mod.manifest.setPatterns ?? [])].sort(byFileName);
      for (const file of files) {
        // SetPatternTemplate postamble: register "<code>", options
        // (set_pattern_loader.rb:55-61) -> ClassMethods#register
        // (class_methods.rb:13-18): front-insert unless :index.
        this.patterns.register(file.code, file.spec, file.index);
        registeredPatternCodes.push(file.code);
      }
    }

    // The gems' assign_type lines for every loaded mod, after the reset
    // above; the phase-2 walk's manifest entries below override them.
    for (const mod of ordered) registerGemTypeAssignments(normalizeModName(mod.manifest.name));

    // ---- phase 2: SetLoader (loader.rb:18) -------------------------------
    // each_file: pattern groups OUTER (grouped_codes), mods, then the
    // group's patterns, files path-sorted (set_loader.rb:26-44).
    const groups = this.patterns.groupedCodes();
    for (const group of groups) {
      for (const mod of ordered) {
        for (const code of group) {
          const files = (mod.manifest.setModules ?? [])
            .filter((file) => setPathPattern(file.setPath) === code)
            .sort(bySetPath);
          for (const file of files) {
            this.registerSetModule(mod.manifest.name, file);
            const shortname = setModuleShortname(file.setPath);
            registeredSetModules.push(shortname);
            const kind: SetModuleKind = kindOfSetPath(file.setPath);
            for (const [formatKey, formatBlock] of Object.entries(file.formats ?? {})) {
              for (const view of formatBlock.views ?? []) {
                // flat last-wins (render-path seam, byte-compatible) -
                // ALL SETS ONLY. Card::Set::Format#register_set_format
                // (set/format.rb:133-144) branches on all_set?: an ALL
                // set's format module goes to Set.modules[:base_format]
                // and process_base_format_modules (registrar.rb:79-84)
                // mixes it into the BASE format class every card's
                // format inherits from, so its views ARE universal and
                // belong on the flat record. A NONBASE set's format
                // module goes to Set.modules[:nonbase_format] and
                // reaches a card only through
                // Card::Set::Pattern::All#set_format_modules
                // (pattern/all.rb:49-55) keyed on that card's OWN
                // pattern module keys - writing one into the shared
                // base record made it the fallthrough for EVERY card:
                // set/right/html_message's :content replaced the engine's
                // main content renderer deck-wide. The guard is
                // tests/card/mod-loader/view-set-scope-fallback.test.ts.
                //
                // FORMAT SCOPING (the flat-table format scoping): the flat record is the
                // HTML-VISIBLE engine
                // table (render.ts `this.views = HTML_VIEWS` - the same
                // object this constructor receives), so an all-set
                // registration lands here only under Ruby's html-visible
                // keys. define_on_format resolves the block's format to a
                // CLASS (format_class_name(:base) -> Card::Format,
                // format/registration.rb:27-30); register_all_set_format
                // files the module under THAT class (set/format.rb:
                // 137-139) and process_base_format_modules mixes each
                // class's list into the class itself (registrar.rb:79-84
                // add_set_modules). An html-keyed module lands on
                // HtmlFormat; a base-keyed one on Card::Format, the root
                // every format inherits (format_ancestry,
                // registration.rb:35-39). A foreign-keyed module
                // (email_text/email_html/json/js/...) lands on ITS class
                // ONLY - HtmlFormat's ancestry never includes it, and
                // subclass modules never back-propagate (EmailHtmlFormat
                // < HtmlFormat, card-mod-email lib/card/format/
                // email_html_format.rb:6; the aliases table maps "email"
                // TOWARD email_html, never a non-html key onto html).
                // The census
                // (tests/card/mod-loader/
                // view-dispatch-flat-record-format-scope-census.test.ts)
                // measured the composed deck: 168 all-set+abstract
                // registrations over keys {html, base, json, email_html,
                // email_text, js}; the foreign rows are all/email_text's
                // compact_missing+unknown+last_action,
                // all/email_html's compact_missing+unknown,
                // all/autocomplete's select2_option (json), and
                // all/reference_editor/nest_image's
                // change_create_to_update+open_nest_editor (js). Before
                // this filter the foreign rows FLAT-REGISTERED and four
                // green html-render pins rode them (the A/B email
                // :last_action "edited", search :select2_option's json
                // bytes, the tinymce :change_create_to_update/
                // :open_nest_editor js bytes) - Ruby raises
                // unsupported-view for every one (the html method table
                // never included those classes); those pins now hold
                // both directions (html rejects, own format renders).
                if (
                  kind !== "nonbase" &&
                  (formatKey === "html" || formatKey === "base")
                ) {
                  this.views.register(view.view, view.viewFn);
                }
                // chain-aware: every view is recorded under its
                // contributing set module so the walker can resolve
                // Ruby's MRO per card (set/format.rb:146-150) and the
                // superView helper can delegate to the next module's
                // same view (Ruby's `super()`). The kind rides along so
                // the empty-chain fallback can tell an all-set
                // registration from a set-scoped one.
                this.viewChains.register(shortname, view.view, view.viewFn, kind, formatKey);
                this.viewConfigs.register(view.view, view.config);
                // Keep the config under its set module
                // too — the per-card `unknown:` setting resolution walks
                // the card's chain and needs each module's OWN declaration
                // (the flat byView record cannot answer per card).
                this.viewConfigs.registerForModule(shortname, view.view, view.config);
                if (!registeredViews.includes(view.view)) registeredViews.push(view.view);
              }
            }
            if (file.settingOpts !== undefined) {
              // advanced_api.rb:10-14: setting_opts derives the codename
              // from the set anchor (setting.rb:96: Self::Help -> "help").
              const anchor = file.setPath
                .split("/")
                .slice(1)
                .join("_")
                .replace(/^\d+_/, "");
              this.settings.register(anchor, file.settingOpts);
              registeredSettings.push(anchor);
            }
            for (const fn of file.contentOverrides ?? []) {
              // set-module `def content` (right/when_created.rb:7-11):
              // registered per set path with the contributing mod named;
              // Map.set last-wins mirrors Ruby's method redefinition.
              // supersedesType: the file declares only `def content` (no
              // assign_type) -> the card KEEPS its type and the cardtype's
              // own :core view still wraps the overridden raw
              // (content-overrides.ts#RegisteredContentOverride).
              this.contentOverrides.register({
                setPath: file.setPath,
                modName: mod.manifest.name,
                fn,
                supersedesType: file.contentKeepsType !== true,
              });
              registeredContentOverrides.push(file.setPath);
            }
            if (file.virtual === true) {
              // set-module `def virtual?; new?; end` (right/followers.rb:22-24,
              // type_plus_right/user/follow.rb:9-11): the set's cards are
              // KNOWN without a row (states.rb:44-50 virtual? + :60-62
              // known?). Registered per set path; the render layer's
              // absent-root seat consults the registry.
              this.virtualCards.register({
                setPath: file.setPath,
                modName: mod.manifest.name,
              });
            }
            for (const event of file.events ?? []) {
              // set-module `event` declarations (lib/card/set/event.rb):
              // recorded verbatim, file coordinates injected; execution
              // wiring is the action engine's stage seam (eventsForStage).
              this.modEvents.register({
                ...event,
                setPath: file.setPath,
                modName: mod.manifest.name,
              });
              registeredEvents.push(event.event);
            }
            for (const task of file.basketTasks ?? []) {
              // set-module `basket[:tasks][:name] = {...}` (set/basket.rb's
              // basket machinery; the self/admin.rb files). Load order is
              // the basket insertion order the *admin task table renders.
              this.basketTaskEntries.push({
                ...task,
                setPath: file.setPath,
                modName: mod.manifest.name,
              });
            }
            for (const warning of file.basketWarnings ?? []) {
              // set-module `basket[:warnings] << :name`.
              this.basketWarningEntries.push({
                warning,
                setPath: file.setPath,
                modName: mod.manifest.name,
              });
            }
            for (const accessor of file.cardAccessors ?? []) {
              // set-module `card_accessor :name` (lib/card/set/trait.rb).
              this.cardAccessorEntries.push({
                ...accessor,
                setPath: file.setPath,
                modName: mod.manifest.name,
              });
            }
          }
        }
      }
    }

    // ---- phase 3+4: process_base_modules / finalize (no-op tables) ------
    this.loaded = true;
    return {
      modNames,
      registeredPatternCodes,
      registeredSetModules,
      registeredViews,
      registeredSettings,
      registeredContentOverrides,
      registeredEvents,
    };
  }

  /** SetLoader.load's tail - Card::Set.finalize_load (set_loader.rb:17-20):
   *  clean_empty_modules has no TS surface (a setModules entry with no
   *  registrations is already inert). Kept as the phase's named marker. */
  finalizeLoad(): void {
    this.loaded = true;
  }

  /** reload_sets (loader.rb:23-28): reset + load. */
  reload(): ModLoadReport {
    this.reset();
    return this.load();
  }

  /** Restore the exact pre-load state (the reverse of every registration).
   *  The process-wide default bindings (setDefaultModLoader,
   *  setDefaultContentOverrideRegistry, setDefaultModEventRegistry) are
   *  NOT touched: they belong to the deck boot seam, and an emptied
   *  registry resolves nothing, so a stale binding is observable-identical
   *  to no binding. */
  reset(): void {
    this.generation++;
    bumpModGeneration();
    this.views.unregisterAll();
    this.viewChains.clear();
    this.viewConfigs.clear();
    this.settings.clear();
    this.patterns.clear();
    this.basket.clear();
    this.contentOverrides.clear();
    this.virtualCards.clear();
    this.modEvents.clear();
    this.basketTaskEntries.length = 0;
    this.basketWarningEntries.length = 0;
    this.cardAccessorEntries.length = 0;
    this.loaded = false;
  }

  // -------------------------------------------------------------------------
  // installInto - the prepare phase (phase 4's engine-side state)
  // -------------------------------------------------------------------------

  /**
   * Run every loaded mod's prepareEngine once against one engine host (the
   * boot-time Rule::Cache analog). Await before the first render. Mods
   * without prepareEngine are skipped.
   */
  async installInto(host: ModEngineHost): Promise<void> {
    if (!this.loaded) this.load();
    for (const name of this.modNames()) {
      const mod = this.sources.get(name);
      const prepare = mod?.manifest.prepareEngine;
      if (prepare !== undefined) await prepare(host);
    }
  }

  // -------------------------------------------------------------------------
  // introspection (the registries the loader wrote)
  // -------------------------------------------------------------------------

  modNames(): string[] {
    return this.order.length > 0
      ? this.order.map((entry) => entry.name)
      : [...this.sources.keys()];
  }

  /** The live combined view table (the same record object passed in). */
  viewsTable(): Record<string, ViewFn> {
    return this.views.record();
  }

  /** The per-set-module view table (the chain-aware companion to the
   *  flat last-wins viewsTable). Tests + the superView helper walk it. */
  viewChainTable(): SetModuleViewTable {
    return this.viewChains;
  }

  /**
   * Resolve the view chain for a given card's set module chain + view
   * name. The result is ordered MOST-SPECIFIC-FIRST (Ruby's MRO walk:
   * set/format.rb:146-150 + format.rb:62-68). The first entry is the
   * view the format would dispatch; the rest are the super()-chain the
   * superView helper steps through.
   *
   * `setKeys` is the safe_set_keys string (render/set-keys.ts:63,
   * "ALL TYPE-rich_text SELF-oracle_basic"). Each token is a
   * safe_key from `safeSetKeysForCard`; the input is general-FIRST so
   * we reverse to most-specific-FIRST for the MRO walk.
   *
   * Resolution rules:
   * - anchored token (e.g. "RIGHT-api_key"): resolves to the set
   *   module shortname "Right::ApiKey" via safeKeyToModuleShortname.
   * - anchorless token (e.g. "ALL", "RSTAR", "RULE"): no single
   *   module shortname applies; the walker expands to EVERY registered
 *   set module whose pattern code matches (the ALL token expands
 *   to every All::* module; RSTAR expands to every Rstar::* module
 *   if any registered; RULE expands to every Rule::* module).
 *   Within one token the LATER-registered module comes first (Ruby's
 *   include-order precedence: module.rb:15-22 + registrar.rb:79-84 —
 *   the last-loaded same-view registration shadows the earlier), and
 *   only registrations declared under the requested format's key are
 *   visible (set/format.rb:120-144 files each all-set format module
 *   under its own format class).
   *
   * Format ancestry follows FORMAT_PARENT and then the base-format tail.
   * A non-HTML format never inherits HTML merely because its own chain is
   * empty; EmailTextFormat inherits TextFormat, not HtmlFormat.
   */
  viewChain(setKeys: string, view: string, format: string = "html"): ViewChainEntry[] {
    // Memoized per load generation: a card's chain for a view is asked by
    // the dispatcher, the unknown-setting walk and super() alike.
    this.syncChainMemo();
    const memoKey = `${format}\u0000${view}\u0000${setKeys}`;
    const memoized = this.chainMemo.get(memoKey);
    if (memoized !== undefined) return memoized;
    this.chainIndefinite = false;
    const chain = this.computeViewChain(setKeys, view, format);
    // A chain that leaned on a spelled-out anchor (the name environment
    // could not resolve one) is answered for now only.
    if (this.chainIndefinite) return chain;
    if (this.chainMemo.size >= CHAIN_MEMO_LIMIT) this.chainMemo.clear();
    this.chainMemo.set(memoKey, chain);
    return chain;
  }

  /** Set by tokenEntries when an anchored token could not be resolved by
   *  codename during the chain being computed. */
  private chainIndefinite = false;

  private computeViewChain(setKeys: string, view: string, format: string): ViewChainEntry[] {
    const tokens = setKeys.split(/\s+/).filter((s) => s !== "");
    // Empty setKeys = "no concrete pattern applies" (the Abstract
    // pseudo-pattern case). Fall back to load-order registration so
    // the chain walker returns every module that registered the view
    // (the abstract sets CodeContent/HamlFile/ReadOnly etc. match here).
    // Format-specific scoping (no per-format registry today): when the
    // format is not html and the abstract-style fallback returns
    // entries, those entries win; otherwise the format-inheritance tail
    // below applies. Only rss/email_html reopen the html chain
    // (HTML_DESCENDED_FORMATS above); css/js — CssFormat/JsFormat <
    // Format (css_format.rb:6, js_format.rb:6) — land on the base tail,
    // and no css/js chain request exists on this codebase (the only
    // non-html dispatch is email_text, render/views.ts:1443; the
    // css/scss asset bytes are the compile-engines leaf seam, never a
    // chain request — view-dispatch-css-js-format-ancestry-census
    // pins the census).
    //
    // RESIDUAL SCOPE: THIS
    // arm is format-blind AND kind-blind - entries() yields every kind
    // (base/abstract/nonbase) under every manifest format key, while
    // Ruby files each module's format block under its OWN format class
    // (set/format.rb:120-144) and never mixes set scopes into one
    // method table. The blindness is reviewed UNOBSERVABLE on this
    // codebase and the arm is retained verbatim: safeSetKeys always
    // carries the ALL token (set-patterns/registry.ts:308-313
    // `applies: () => true`), so no src dispatch reaches it - the only
    // viewChain("") calls are the abstract-pseudo-pattern probes
    // (card-mod-content.test.ts, default-mod-deck.test.ts,
    // view-dispatch-superview.test.ts). The census probe
    // (tests/card/mod-loader/
    // view-dispatch-flat-record-format-scope-census.test.ts) pins the
    // measured spans: over the composed deck the fallback set spans
    // MORE THAN ONE format key for exactly {count, compact_missing,
    // unknown, last_action, last_action_verb} and MORE THAN ONE kind
    // for 18 further views (abstract+nonbase+base mix under key html
    // alone for most). Reopening signal: a src caller that passes an
    // abstract-derived or empty setKeys - or a census-tripping foreign
    // registration - re-adjudicates this arm together with the flat
    // record's format filter at the registration seam.
    if (tokens.length === 0) {
      const out: ViewChainEntry[] = [];
      for (const entry of this.viewChains.entries()) {
        if (entry.view === view) out.push(entry);
      }
      return out;
    }
    this.syncChainMemo();
    const mostSpecificFirst = tokens.slice().reverse();
    const out: ViewChainEntry[] = [];
    const present = new Set<string>();
    for (const token of mostSpecificFirst) {
      const { own, abstracts } = this.tokenEntries(token, view, format);
      for (const entry of own) {
        out.push(entry);
        present.add(entry.setModule);
      }
      // include_set entries already contributed by a more specific token
      // stay where they first appeared (Ruby includes a module once).
      for (const entry of abstracts) {
        if (present.has(entry.setModule)) continue;
        out.push(entry);
        present.add(entry.setModule);
      }
    }
    // Format inheritance: when the named format produces no chain
    // entries, fall back to the html chain — but ONLY for the formats
    // whose Ruby class descends from HtmlFormat (the
    // HTML_DESCENDED_FORMATS gate below): rss (RssFormat < HtmlFormat,
    // rss_format.rb:6) and email_html (EmailHtmlFormat < HtmlFormat,
    // email_html_format.rb:6). Ruby's AbstractFormat#format blocks
    // reopen the html parent class only through that ancestry
    // (include_set_format_modules, format.rb:57-63, walks
    // format_ancestry). css/js do NOT descend — CssFormat/JsFormat
    // subclass Format directly (css_format.rb:6, js_format.rb:6) — so a
    // css/js chain miss skips this arm and lands on the BASE tail below
    // (the census probe pins that no css/js chain request exists to observe
    // the change). EmailTextFormat < TextFormat < Format
    // (email_text_format.rb) likewise never sees the html method table,
    // so an email_text chain miss must reach the BASE (flat) record, not
    // the html chain — falling back there would let the html chain's own
    // :core re-enter itself (the text-message card's html :core
    // dispatches email_text's :core). email_html DOES descend and keeps
    // the fallback.
    if (out.length === 0 && FORMAT_PARENT[format] !== undefined) {
      // the recursion carries the parent level AND (through its own base
      // tail, below) the base level - Ruby's MRO for a format with a
      // superclass (RssFormat < HtmlFormat, JsonldFormat < JsonFormat <
      // DataFormat) is [own] ++ [parent...] ++ [base]
      return this.viewChain(setKeys, view, FORMAT_PARENT[format]!);
    }
    // BASE-FORMAT TAIL: the bare
    // `format do` block files its module on Card::Format ITSELF
    // (register_all_set_format keyed on the base format class,
    // card-1.110.0 lib/card/set/format.rb:142-144;
    // process_base_format_modules, registrar.rb:79-84, mixes it into the
    // class EVERY format inherits). Those views answer in every format,
    // AFTER the format's own registrations (EmailTextFormat -> TextFormat
    // -> Format: the own-format module sits closer in the MRO than the
    // base-class module), and later-registered-wins applies within the
    // base pass exactly as within the format pass. The manifest's
    // documented "base" key (mod-manifest.ts:286-288) marks them; a module
    // that declared the view under BOTH the requested format and base
    // contributes BOTH entries (Ruby compiles separate format-class
    // modules per block - the HtmlFormat module included closer than the
    // Card::Format one - and super() walks exactly that pair). The
    // html-descended recursion above already carries this tail, so it
    // does not run twice.
    let baseScoped = this.baseTailMemo.get(view);
    if (baseScoped === undefined) {
      baseScoped = [];
      for (const shortname of this.memoShortnamesForCode("all")) {
        const baseFn = this.viewChains.viewForFormat(shortname, view, "base");
        if (baseFn !== undefined) {
          baseScoped.push({ setModule: shortname, view, viewFn: baseFn });
        }
      }
      baseScoped.reverse();
      this.baseTailMemo.set(view, baseScoped);
    }
    out.push(...baseScoped);
    return out;
  }

  /** A set module's registration of a view as one format sees it: the
   *  format's own block, then (for the html lineage) the html block, then
   *  the base block every format inherits (format.rb format_ancestry; Ruby
   *  files each format block under its own format class, set/format.rb
   *  120-144). An email_text render therefore never dispatches a module's
   *  html :core, and an html render never a json-only view. */
  private anchoredViewFor(shortname: string, view: string, format: string): ViewFn | undefined {
    for (const level of formatLineage(format)) {
      const fn = this.viewChains.viewForFormat(shortname, view, level);
      if (fn !== undefined) return fn;
    }
    return format !== "base" ? this.viewChains.viewForFormat(shortname, view, "base") : undefined;
  }

  /** One set-key token's contribution to a view chain: its own set
   *  module entries (the anchorless expansion, or the anchored module and
   *  its nested modules) and the abstract modules it includes. Depends only
   *  on the token, the view, the format and the loaded registrations, so it
   *  is memoized per load generation: every card shares the ALL, TYPE-*,
   *  RIGHT-* tokens, and the walk below would otherwise rerun per card. */
  private tokenEntries(
    setKeyToken: string,
    view: string,
    format: string,
  ): { own: ViewChainEntry[]; abstracts: ViewChainEntry[] } {
    const memoKey = `${format}\u0000${view}\u0000${setKeyToken}`;
    const memoized = this.tokenMemo.get(memoKey);
    if (memoized !== undefined) return memoized;
    const own: ViewChainEntry[] = [];
    const abstracts: ViewChainEntry[] = [];
    // Whether the answer may be memoized: an anchored token the name
    // environment could not resolve is answered by spelling, for now only.
    let definitive = true;
    // SELF tokens resolve by the anchor card's codename, as Ruby keys self
    // modules (rubySelfToken); a codename-less anchor has no self module.
    const selfToken = rubySelfToken(setKeyToken);
    if (selfToken === null) {
      const none = { own, abstracts };
      this.tokenMemo.set(memoKey, none);
      return none;
    }
    const token = selfToken;
      const dashIdx = token.indexOf("-");
      if (dashIdx === -1) {
        // Anchorless: expand to every registered module with this
        // pattern code (e.g. "ALL" -> All::Base, All::Help, ...).
        //
        // SAME-PATTERN ORDER:
        // LATER-REGISTERED WINS within the token. Ruby includes the
        // all-set module list in load order (module.rb:15-22
        // add_set_modules; registrar.rb:42-49 process_base_modules /
        // registrar.rb:79-84 process_base_format_modules) and each later
        // `include` sits directly above the format class, so the
        // LAST-loaded module defining a view shadows the earlier
        // same-view registrations. The chain therefore lists the latest
        // registration FIRST - chain[0] (the render dispatch,
        // render.ts:1511) answers Ruby's MRO head.
        //
        // FORMAT SCOPING: only registrations declared under THIS
        // format's manifest key are visible. Ruby files every all-set
        // format module under its own format class (set/format.rb:
        // 120-144 register_all_set_format keyed on format_class), so an
        // email_text registration of a view never enters the html method
        // table - compact_missing {All::Error(html arm),
        // All::EmailHtml(email_html), All::EmailText(email_text)} are
        // three format classes, not one chain. A non-html format whose
        // own arm is empty falls back via the format-inheritance tail
        // below ONLY when its Ruby class descends from HtmlFormat
        // (rss/email_html — HTML_DESCENDED_FORMATS above); css/js
        // (CssFormat/JsFormat < Format, css_format.rb:6/js_format.rb:6)
        // and EmailTextFormat never do — their misses land on the base
        // tail.
        //
        // RESIDUAL SCOPE:
        // THIS scoping is the anchorless arm's alone. The anchored
        // exact-token arm and the nested-prefix expansion below still
        // probe the format-blind SetModuleViewTable.viewFor, though Ruby
        // files an anchored (nonbase) set's format module under its own
        // format class the same way (set/format.rb:120-144
        // register_standard_set_format; only the requested class's
        // modules reach the card's format singleton - format.rb:62-68
        // include_set_format_modules + pattern/base.rb:30-37
        // format_module_list). The divergence is reviewed
        // UNOBSERVABLE on this codebase and the blindness is retained:
        // the census
        // (tests/card/mod-loader/
        // view-dispatch-anchored-cross-format-collision-census.test.ts)
        // measures 159 anchored registrations - 157 html + 2 json
        // (carrierwave self/search :image_complete, api_key right/
        // api_key :token) - and ZERO cross-format collision groups, so
        // no dispatch can pick the wrong format's bytes BETWEEN two
        // same-token arms. The single-registration leak shapes are
        // bounded: the only non-html chain dispatch in the port is the
        // text-message email_text :core re-entry (render/views.ts:1443),
        // unreachable until a loader-bound surface seeds a
        // codename-bearing *text message (today's seeds carry none -
        // notify-save-path-wiring.test.ts:80), and the two json rows'
        // views have no non-json dispatch (the route json show is the
        // format-families layer, bypassing this walk). A future
        // non-html anchored registration trips the census probe and
        // reopens the review.
        const code = token.toLowerCase();
        const matches = this.memoShortnamesForCode(code);
        const scoped: ViewChainEntry[] = [];
        for (const shortname of matches) {
          const viewFn = this.viewChains.viewForFormat(shortname, view, format);
          if (viewFn !== undefined) {
            scoped.push({ setModule: shortname, view, viewFn });
          }
        }
        scoped.reverse();
        own.push(...scoped);
      } else {
        // Anchored: resolve to the first REGISTERED shortname among the
        // token's candidates (exact conversion first, then the star-marker
        // X-stripped variants - right/api_key.rb registers "Right::ApiKey"
        // while the rule card's token is "RIGHT-Xapi_key"; lookup decides,
        // never string guessing). Unregistered tokens fall through to the
        // next set-key token, Ruby's MRO walk unchanged.
        let matched = false;
        const resolution = anchoredModuleCandidates(token);
        definitive = resolution.definitive;
        for (const shortname of resolution.candidates) {
          const viewFn = this.anchoredViewFor(shortname, view, format);
          if (viewFn !== undefined) {
            own.push({ setModule: shortname, view, viewFn });
            matched = true;
            break;
          }
        }
        if (!matched) {
          // Nested format modules under an ANCHORED pattern/anchor path
          // (type/set/html_views, type/set/setting_categories, ...): the
          // token -> shortname conversion can only produce "Type::Set", but
          // Ruby's set-module inclusion gives a Set card EVERY module under
          // Card::Set::Type::Set (the nested modules reopen the same format
          // class). Expand to every REGISTERED shortname whose setPath sits
          // under the token's pattern/anchor path, in load order - same
          // lookup-decides discipline as the anchorless expansion, scoped
          // to the anchored prefix. This expansion is what makes the rules
          // mod's setting-list family - type/set/html_views/rule_lists -
          // reachable at all; without it the set_label and input chain
          // misses there were the same gap.
          //
          // STAR-MARKER STRIP: a starred anchor's safe key
          // prefixes X ("*account" -> "Xaccount"), but the gem's set-file
          // PATH carries the plain anchor (set/right/account/views.rb ->
          // "right/account/views"). Comparing the raw token would put
          // "right/Xaccount/" against "right/account/" and never match, so
          // every nested set file under a starred anchor (right/account/views'
          // token_days family and its closure) would be unreachable. The
          // setPath side never carries X, so the comparison uses the
          // stripped form.
          //
          // COMPOUND-ANCHOR STRIP: the X marker sits on EACH STARRED
          // SEGMENT of the anchor, not only on the first - the
          // TYPE_PLUS_RIGHT pattern's token anchor is "<left type>-X<right>"
          // ("TYPE_PLUS_RIGHT-bootswatch_skin-Xcolor"), whose set path is
          // "type_plus_right/bootswatch_skin/colors". Stripping only a
          // leading marker left that prefix comparison broken
          // ("bootswatch_skin-Xcolor" vs "bootswatch_skin/colors"), so the
          // whole type_plus_right/* starred family (colors' bar_middle, the
          // set/script and set/style arms) stayed unreachable. The strip
          // now applies per dash-separated segment (the codename segments
          // are the starred ones; the type segment never carries X, and
          // stripping nothing from it is a no-op).
          //
          // SINGULAR/PLURAL + PATH-SEGMENT CANDIDATES:
          // scoped to the TYPE_PLUS_RIGHT pattern - the one installed
          // pattern whose anchor has MULTIPLE parts, which changes both
          // spellings: the token anchor "bootswatch_skin-Xcolor" maps to
          // the path "type_plus_right/bootswatch_skin/colors.rb" (each
          // anchor part is a DIRECTORY - the last dash is a slash), and the
          // right part carries the SINGULARIZED codename ("*colors" -> key
          // "color") while the set-file path spells the codename
          // ("colors.rb" - the registrar's KNOWN DIVERGENCE #1
          // singularization, worked around here at the same level as the
          // X-strip until the codename-key re-key lands). Single-part
          // patterns (right/self/type) keep the singularized form ONLY:
          // their plural divergence (RIGHT-follower -> right/followers) is
          // that same recorded divergence's xfailed territory, with its own
          // seeds and expectations written against the current walk -
          // widening those here would flip tests this code does not own.
          const code = token.slice(0, dashIdx).toLowerCase();
          const strippedAnchor = token
            .slice(dashIdx + 1)
            .split("-")
            .map((seg) => seg.replace(/^X/, ""))
            .join("-")
            .toLowerCase();
          const anchors =
            code !== "type_plus_right"
              ? [strippedAnchor]
              : (() => {
                  // path-segment form: the LAST dash becomes a slash
                  const lastDash0 = strippedAnchor.lastIndexOf("-");
                  const slashForm =
                    lastDash0 === -1
                      ? strippedAnchor
                      : `${strippedAnchor.slice(0, lastDash0)}/${strippedAnchor.slice(lastDash0 + 1)}`;
                  const forms = [strippedAnchor, slashForm];
                  for (const base of [strippedAnchor, slashForm]) {
                    const lastDash = base.lastIndexOf("-");
                    const lastSeg = base.slice(lastDash + 1);
                    if (!lastSeg.endsWith("s")) {
                      forms.push(
                        lastDash === -1
                          ? `${lastSeg}s`
                          : `${base.slice(0, lastDash + 1)}${lastSeg}s`,
                      );
                    }
                  }
                  return forms;
                })();
          // With the anchor codenames known, the set files sit under the
          // codename path, as Ruby's own files do; the spelled-out anchor
          // forms above stand in only when the name environment cannot say.
          const paths = resolution.paths ?? anchors.map((anchor) => `${code}/${anchor}`);
          for (const path of paths) {
            for (const shortname of this.nonbaseUnderPath(path)) {
              const viewFn = this.anchoredViewFor(shortname, view, format);
              if (viewFn !== undefined) {
                own.push({ setModule: shortname, view, viewFn });
              }
            }
          }
        }
        // INCLUDE_SET: the abstract set modules Ruby mixes into this
        // token's set module (include_set, transitively), in Ruby's
        // method-resolution order, sit directly under the module itself and
        // above every less specific token. The table is read off the loaded
        // Ruby deck (set-include-graph.ts); a view the concrete module does
        // not define still resolves through its abstracts.
        abstracts.push(...this.includedAbstractEntries(token, view, format, own));
      }
    const result = { own, abstracts };
    if (definitive) this.tokenMemo.set(memoKey, result);
    else this.chainIndefinite = true;
    return result;
  }

  private chainMemo = new Map<string, ViewChainEntry[]>();
  private baseTailMemo = new Map<string, ViewChainEntry[]>();
  private tokenMemo = new Map<string, { own: ViewChainEntry[]; abstracts: ViewChainEntry[] }>();
  private codeMemo = new Map<string, string[]>();
  private pathIndex: Map<string, string[]> | undefined;
  private memoGeneration = -1;

  /** Drop the chain memos when a load or reset changed the registrations. */
  private syncChainMemo(): void {
    // Anchored and SELF tokens resolve through the deck's codenames, so the
    // token and chain memos hold for one deck's name environment: a
    // different lexicon or codename registry (another deck, a fresh engine
    // pair) starts them over. The base tail and the path index depend on
    // the registrations alone.
    const env = getNameEnvironment();
    if (env?.lexicon !== this.memoLexicon || env?.codename !== this.memoCodenames) {
      this.chainMemo.clear();
      this.tokenMemo.clear();
      this.memoLexicon = env?.lexicon;
      this.memoCodenames = env?.codename;
    }
    if (this.memoGeneration === this.generation) return;
    this.chainMemo.clear();
    this.baseTailMemo.clear();
    this.tokenMemo.clear();
    this.codeMemo.clear();
    this.pathIndex = undefined;
    this.memoGeneration = this.generation;
  }

  private memoLexicon: unknown;
  private memoCodenames: unknown;

  /** setModuleShortnamesForCode, memoized per load generation. */
  private memoShortnamesForCode(code: string): string[] {
    this.syncChainMemo();
    let list = this.codeMemo.get(code);
    if (list === undefined) {
      list = this.setModuleShortnamesForCode(code);
      this.codeMemo.set(code, list);
    }
    return list;
  }

  /** The registered nonbase modules whose setPath is `path` or sits under
   *  it, in load order (the nested-module expansion of an anchored token). */
  private nonbaseUnderPath(path: string): readonly string[] {
    if (this.pathIndex === undefined) {
      const index = new Map<string, string[]>();
      for (const mod of this.basket.allNonbase()) {
        const setPath = this.basket.setPathFor(mod.shortname);
        if (setPath === undefined) continue;
        const parts = setPath.split("/");
        for (let i = 1; i <= parts.length; i++) {
          const prefix = parts.slice(0, i).join("/");
          let list = index.get(prefix);
          if (list === undefined) index.set(prefix, (list = []));
          list.push(mod.shortname);
        }
      }
      this.pathIndex = index;
    }
    return this.pathIndex.get(path) ?? [];
  }

  /** The abstract-set chain entries for one anchored token: every module
   *  the token's set module (and its nested modules) includes, per
   *  SET_INCLUDES, html includes first and then base ones, each
   *  contributing its registration of the view once. */
  private includedAbstractEntries(
    token: string,
    view: string,
    format: string,
    already: readonly ViewChainEntry[],
  ): ViewChainEntry[] {
    const out: ViewChainEntry[] = [];
    const seen = new Set(already.map((e) => e.setModule));
    for (const candidate of anchoredModuleCandidates(token).candidates) {
      const owners = includeGraphOwners(candidate);
      if (owners.length === 0) continue;
      for (const owner of owners) {
        const includes = SET_INCLUDES[owner]!;
        // HtmlFormat mixes in the html includes and inherits Card::Format's;
        // a format outside the html lineage (email_text) sees only the base
        // ones (format.rb format_ancestry).
        const lists = htmlLineage(format) ? [...(includes.html ?? []), ...(includes.base ?? [])] : [...(includes.base ?? [])];
        for (const abstract of lists) {
          if (seen.has(abstract)) continue;
          seen.add(abstract);
          const viewFn = this.anchoredViewFor(abstract, view, format);
          if (viewFn !== undefined) out.push({ setModule: abstract, view, viewFn });
        }
      }
      break;
    }
    return out;
  }

  /**
   * Every registered set module shortname whose pattern code matches
   * `code`. Used by viewChain's anchorless-token expansion: "ALL"
   * expands to every set module whose setPath's first segment is "all"
   * (the base bucket + the All::* nonbase entries). Load order is
   * preserved (base first, then nonbase in insertion order).
   */
  setModuleShortnamesForCode(code: string): string[] {
    const out: string[] = [];
    for (const mod of this.basket.base) {
      const setPath = this.basket.setPathFor(mod.shortname);
      if (setPath === undefined) continue;
      if (setPath.startsWith(`${code}/`) || setPath === code) out.push(mod.shortname);
    }
    for (const mod of this.basket.allNonbase()) {
      const setPath = this.basket.setPathFor(mod.shortname);
      if (setPath === undefined) continue;
      if (setPath.startsWith(`${code}/`) || setPath === code) out.push(mod.shortname);
    }
    return out;
  }

  /** The mod-contributed view-config table (format.ts consults it via the
   *  render path; direct callers: tests, tooling). */
  viewConfigFor(view: string): ModViewConfigTableEntry | undefined {
    return this.viewConfigs.configFor(view);
  }

  /** view/permission.rb:38 `setting :unknown` for ONE card. Walks the card's
   *  own view chain
   *  (viewChain: the same MRO walk the dispatcher uses, most-specific set
   *  first) and answers the first chain entry whose set module CARRIES an
   *  `unknown` config for the view. Ruby dispatches
   *  `try _view_<view>__<setting>` on the card's format class: the method
   *  exists only on set modules that declared the view with an `unknown:`
   *  option, and the most specific defining module wins — a module that
   *  defines the view WITHOUT the setting does not answer, so the walk
   *  skips it (exactly the configForModule-undefined case).
   *  Undefined = no module in the card's chain declares the setting (the
   *  caller substitutes :unknown; format/error.rb:23 `setting_view ||
   *  :unknown`). */
  /** Ruby's view_setting(:wrap, view) (card-1.110.0 lib/card/format/render.rb:55-57):
   *  `try "_view_<view>__wrap"` on the card's format class. The method is
   *  defined on the set module that declared the wrap, and the most specific
   *  chain module that declares one answers, whichever module supplied the
   *  view body. A declaration of `wrap: {}` answers "no wrap" and stops the
   *  walk. Undefined = no module in the chain declares a wrap. */
  viewWrapForCard(
    setKeys: string,
    view: string,
    format: string = "html",
  ): ModViewWrapSpec | undefined {
    for (const entry of this.viewChain(setKeys, view, format)) {
      const wrap = this.viewConfigs.configForModule(entry.setModule, view)?.wrap;
      if (wrap !== undefined && typeof wrap === "object" && !Array.isArray(wrap)) return wrap;
    }
    return undefined;
  }

  viewUnknownSettingForCard(
    setKeys: string,
    view: string,
    format: string = "html",
  ): true | string | false | undefined {
    for (const entry of this.viewChain(setKeys, view, format)) {
      const config = this.viewConfigs.configForModule(entry.setModule, view);
      if (config !== undefined && config.unknown !== undefined) {
        return config.unknown;
      }
    }
    return undefined;
  }

  /** The Card::Setting registry port (groups with nil holes, preferences). */
  settingsRegistry(): SettingRegistry {
    return this.settings;
  }

  /** The set-module content-override registry this load populated (the
   *  instance the deck boot binds as the render-path default). */
  contentOverrideRegistry(): ContentOverrideRegistry {
    return this.contentOverrides;
  }

  /** The set modules that override `virtual?` (the instance the deck boot
   *  binds as the render path's known-virtual-card registry). */
  virtualCardRegistry(): VirtualCardRegistry {
    return this.virtualCards;
  }

  /** The set-module event registry this load populated (the instance the
   *  deck boot binds as the execution seam's default). */
  eventRegistry(): ModEventRegistry {
    return this.modEvents;
  }

  /** The `basket[:tasks]` contributions in load order (the deck task
   *  basket is core's own CORE_TASK_BASKET merged with these — the *admin
   *  :core task table and type/mod #tasks read it). */
  basketTaskContributions(): readonly RegisteredBasketTask[] {
    return this.basketTaskEntries;
  }

  /** The `basket[:warnings]` contributions in load order (the deck warning
   *  list the *admin :warning view walks). */
  basketWarningContributions(): readonly RegisteredBasketWarning[] {
    return this.basketWarningEntries;
  }

  /** The `card_accessor` / `card_reader` / `card_writer` declarations in
   *  load order. */
  cardAccessorDeclarations(): readonly RegisteredCardAccessor[] {
    return this.cardAccessorEntries;
  }

  /** The concrete pattern table INCLUDING mod patterns, in lookup order.
   *  Core-only decks: byte-identical to the frozen PATTERN_TABLE order. */
  patternTable(): PatternSpec[] {
    return this.patterns.concreteCodes().map((code) => {
      const modded = this.patterns.specFor(code);
      if (modded !== undefined) return modded;
      const core = PATTERN_TABLE.find((spec) => spec.code === code);
      if (core === undefined) {
        throw new Error(`pattern spec missing for code: ${code}`);
      }
      return core;
    });
  }

  /** The set-module basket (Card::Set.modules port). */
  setModules(): SetModuleBasket {
    return this.basket;
  }

  private registerSetModule(modName: string, file: ModSetModuleFile): void {
    const shortname = setModuleShortname(file.setPath);
    const kind: SetModuleKind = kindOfSetPath(file.setPath);
    const module: RegisteredSetModule = { shortname, kind, modName };
    this.basket.register(module);
    // Record the shortname <-> setPath mapping so the chain walker
    // can recover the pattern code for anchorless-token expansion.
    this.basket.recordSetPath(shortname, file.setPath);
    // advanced_api.rb:5-8 `assign_type type, module_key=nil`:
    // `module_key ||= shortname; Type.assignment[module_key] = type`. The
    // manifest field carries the type argument verbatim (the codename or
    // name string the gem's line named, e.g. "list" on set/right/to.rb).
    if (file.assignsType !== undefined) {
      registerSetTypeAssignment(shortname, file.assignsType);
    }
    // The mod's data rule seeds (data/real.yml rule rows): the form-side
    // gate's synchronous read (mod-rule-seeds.ts — the validate side stays
    // storage-only, per the header note there).
    for (const seed of file.ruleSeeds ?? []) {
      registerModRuleSeed(modName, seed.name, seed.content);
    }
  }
}

export type ModViewConfigTableEntry = ReturnType<ModViewConfigTable["configFor"]>;

// -------------------------------------------------------------------------
// process-wide default instance - the render-path consultation seam
// -------------------------------------------------------------------------

// The render layer (format.ts) keeps its html view configs as private
// consts; until the render path is made to consult mod configs
//, these accessors expose the
// loaded mod view configs through one process-wide default instance so the
// eventual patch is three lookup lines.

let defaultLoader: ModLoader | undefined;

/** Bind the deck's loader as the default (call after load()). Pass
 *  undefined to clear (tests + reload sequences). */
export function setDefaultModLoader(loader: ModLoader | undefined): void {
  defaultLoader = loader;
}

/** Process-wide mod lifecycle generation. Bumped on every ModLoader.load()
 *  and ModLoader.reset() so the render engine can invalidate any cached
 *  view fn that was resolved under a previous lifecycle. Decks with no
 *  loader hold generation 0 indefinitely — the no-mod render path stays
 *  byte-identical to the pre-chain dispatcher. */
let generation = 0;

/** The current mod lifecycle generation. The render engine embeds this
 *  in its view-dispatch cache key so load()/reset() invalidates prior
 *  caches without explicit per-engine wiring (a test that creates a
 *  loader, calls load(), and never binds it to the engine still picks
 *  up the new generation on the next render — the cache miss path runs
 *  computeResolvedView again, which reads engine.views[view], which is
 *  the same HTML_VIEWS record the loader mutates). */
export function modGeneration(): number {
  return generation;
}

/** Internal hook: bump the global generation. Called by ModLoader.load()
 *  and ModLoader.reset(). */
export function bumpModGeneration(): void {
  generation++;
}

/** Read the deck's default loader (the seam the superView helper
 *  consults when no per-engine loader is exposed on ctx.fmt yet).
 *  Undefined when setDefaultModLoader has not been called. */
export function getDefaultModLoader(): ModLoader | undefined {
  return defaultLoader;
}

/** The mod view's `unknown:` config for the unknown-card routing
 *  (view/permission.rb:39-42): true renders as requested, a string names
 *  the substituted view, undefined = no mod config. */
export function modViewUnknown(view: string): string | boolean | undefined {
  return defaultLoader?.viewConfigFor(view)?.unknown;
}

/** The mod view's `perms:` config (view_opts.rb:17; "none" skips the read
 *  check, permission.rb#skip_check?). */
export function modViewPerms(view: string): string | undefined {
  return defaultLoader?.viewConfigFor(view)?.perms;
}

/** registrar.rb:21-29: all_set? -> base bucket; abstract_set? -> abstract;
 *  everything else nonbase. The pattern determines the bucket: "all" is the
 *  base set; the abstract pseudo-pattern holds "abstract/*" paths. */
function kindOfSetPath(setPath: string): SetModuleKind {
  const pattern = setPathPattern(setPath);
  if (pattern === "all") return "base";
  if (pattern === "abstract") return "abstract";
  return "nonbase";
}

/** Ruby Dir.glob.sort - byte order on the path string. */
function bySetPath(a: { setPath: string }, b: { setPath: string }): number {
  return a.setPath < b.setPath ? -1 : a.setPath > b.setPath ? 1 : 0;
}

function byFileName<T extends { code: string }>(a: T, b: T): number {
  return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
}

/** Bound on memoized whole-card chains (a long-lived isolate renders many
 *  cards); the memo is simply restarted when it fills. */
const CHAIN_MEMO_LIMIT = 50_000;

/** SET_INCLUDES owners by module prefix: "Type::Set" -> the graph keys
 *  equal to it or nested under it (Type::Set, Type::Set::HtmlViews, ...), in
 *  the graph's key order. Built once; the graph is a generated constant. */
let includeGraphOwnerIndex: Map<string, string[]> | undefined;

function includeGraphOwners(candidate: string): readonly string[] {
  if (includeGraphOwnerIndex === undefined) {
    const index = new Map<string, string[]>();
    for (const key of Object.keys(SET_INCLUDES)) {
      const parts = key.split("::");
      for (let i = 1; i <= parts.length; i++) {
        const prefix = parts.slice(0, i).join("::");
        let list = index.get(prefix);
        if (list === undefined) index.set(prefix, (list = []));
        list.push(key);
      }
    }
    includeGraphOwnerIndex = index;
  }
  return includeGraphOwnerIndex.get(candidate) ?? [];
}
