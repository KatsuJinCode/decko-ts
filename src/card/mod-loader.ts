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
import { safeKeyToModuleShortname, safeKeyToModuleShortnameCandidates } from "./render/set-keys-to-modules.js";
import {
  ContentOverrideRegistry,
  setDefaultContentOverrideRegistry,
} from "./render/content-overrides.js";
import {
  ModEventRegistry,
  setDefaultModEventRegistry,
} from "./mod-loader/mod-event-registry.js";
import type {
  DeckoModManifest,
  ModEngineHost,
  ModEventRegistration,
  ModEventStage,
  ModSetModuleFile,
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
export { setKeysToModuleChain } from "./render/set-keys-to-modules.js";
export type { DeckoModManifest, ModEngineHost } from "./mod-loader/mod-manifest.js";
export type { ModViewConfig, ModSetModuleFile, ModSettingOpts, ModPatternRegistration } from "./mod-loader/mod-manifest.js";
export type { ModEventRegistration, ModEventStage, ModEventTrigger, ModEventCard, ModEventFn } from "./mod-loader/mod-manifest.js";
export type { RegisteredSetting } from "./mod-loader/mod-registrar.js";

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
  /** The set-module `event` declarations (lib/card/set/event.rb DSL),
   *  registered from ModSetModuleFile.events during the SetLoader phase.
   *  The execution seam (the action engine's stages) will consult it via
   *  eventsForStage once the deck boot binds the default. */
  private readonly modEvents = new ModEventRegistry();

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

    // The compiled-in core patterns seed the concrete table (the ported
    // "core mod" - mod/core/set_pattern/01..09, oracle order in
    // PATTERN_TABLE); mod registrations then front-insert on top. The
    // settings registry starts empty the way Ruby's boot does.
    this.patterns.seedCore(PATTERN_TABLE.map((spec) => spec.code));
    this.settings.clear();
    this.contentOverrides.clear();
    this.modEvents.clear();

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
            registeredSetModules.push(setModuleShortname(file.setPath));
            const shortname = setModuleShortname(file.setPath);
            for (const formatBlock of Object.values(file.formats ?? {})) {
              for (const view of formatBlock.views ?? []) {
                // flat last-wins (render-path seam, byte-compatible).
                this.views.register(view.view, view.viewFn);
                // chain-aware: every view is recorded under its
                // contributing set module so the walker can resolve
                // Ruby's MRO per card (set/format.rb:146-150) and the
                // superView helper can delegate to the next module's
                // same view (Ruby's `super()`).
                this.viewChains.register(shortname, view.view, view.viewFn);
                this.viewConfigs.register(view.view, view.config);
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
              this.contentOverrides.register({
                setPath: file.setPath,
                modName: mod.manifest.name,
                fn,
              });
              registeredContentOverrides.push(file.setPath);
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
    this.views.unregisterAll();
    this.viewChains.clear();
    this.viewConfigs.clear();
    this.settings.clear();
    this.patterns.clear();
    this.basket.clear();
    this.contentOverrides.clear();
    this.modEvents.clear();
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
   *   Per-token order is preserved so Ruby's MRO walk is honored.
   */
  viewChain(setKeys: string, view: string): ViewChainEntry[] {
    const tokens = setKeys.split(/\s+/).filter((s) => s !== "");
    // Empty setKeys = "no concrete pattern applies" (the Abstract
    // pseudo-pattern case). Fall back to load-order registration so
    // the chain walker returns every module that registered the view
    // (the abstract sets CodeContent/HamlFile/ReadOnly etc. match here).
    if (tokens.length === 0) {
      const out: ViewChainEntry[] = [];
      for (const entry of this.viewChains.entries()) {
        if (entry.view === view) out.push(entry);
      }
      return out;
    }
    const mostSpecificFirst = tokens.slice().reverse();
    const out: ViewChainEntry[] = [];
    for (const token of mostSpecificFirst) {
      const dashIdx = token.indexOf("-");
      if (dashIdx === -1) {
        // Anchorless: expand to every registered module with this
        // pattern code (e.g. "ALL" -> All::Base, All::Help, ...).
        const code = token.toLowerCase();
        const matches = this.setModuleShortnamesForCode(code);
        for (const shortname of matches) {
          const viewFn = this.viewChains.viewFor(shortname, view);
          if (viewFn !== undefined) {
            out.push({ setModule: shortname, view, viewFn });
          }
        }
      } else {
        // Anchored: resolve to the first REGISTERED shortname among the
        // token's candidates (exact conversion first, then the star-marker
        // X-stripped variants - right/api_key.rb registers "Right::ApiKey"
        // while the rule card's token is "RIGHT-Xapi_key"; lookup decides,
        // never string guessing). Unregistered tokens fall through to the
        // next set-key token, Ruby's MRO walk unchanged.
        for (const shortname of safeKeyToModuleShortnameCandidates(token)) {
          const viewFn = this.viewChains.viewFor(shortname, view);
          if (viewFn !== undefined) {
            out.push({ setModule: shortname, view, viewFn });
            break;
          }
        }
      }
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
   *  coordinator patch; direct callers: tests, tooling). */
  viewConfigFor(view: string): ModViewConfigTableEntry | undefined {
    return this.viewConfigs.configFor(view);
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

  /** The set-module event registry this load populated (the instance the
   *  deck boot binds as the execution seam's default). */
  eventRegistry(): ModEventRegistry {
    return this.modEvents;
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
  }
}

export type ModViewConfigTableEntry = ReturnType<ModViewConfigTable["configFor"]>;

// -------------------------------------------------------------------------
// process-wide default instance - the render-path consultation seam
// -------------------------------------------------------------------------

// The render layer (format.ts) keeps its html view configs as private
// consts; until the coordinator's patch makes it consult mod configs
// (docs/mod-loader-port-notes.md section 4), these accessors expose the
// loaded mod view configs through one process-wide default instance so the
// eventual patch is three lookup lines.

let defaultLoader: ModLoader | undefined;

/** Bind the deck's loader as the default (call after load()). Pass
 *  undefined to clear (tests + reload sequences). */
export function setDefaultModLoader(loader: ModLoader | undefined): void {
  defaultLoader = loader;
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
