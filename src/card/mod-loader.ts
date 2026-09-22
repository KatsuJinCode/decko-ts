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
  setModuleShortname,
  setPathPattern,
  type RegisteredSetModule,
  type SetModuleKind,
} from "./mod-loader/mod-registrar.js";
import type {
  DeckoModManifest,
  ModEngineHost,
  ModSetModuleFile,
} from "./mod-loader/mod-manifest.js";

export { normalizeModName, resolveModOrder } from "./mod-loader/mod-order.js";
export { ModNotFoundError, ModNameConflictError } from "./mod-loader/mod-order.js";
export { SettingRegistry, PatternOverlay, setModuleShortname } from "./mod-loader/mod-registrar.js";
export { modEngineHost } from "./mod-loader/mod-engine-host.js";
export { default as cardModHelp } from "./mod-loader/mods/card-mod-help.js";
export type { DeckoModManifest, ModEngineHost } from "./mod-loader/mod-manifest.js";
export type { ModViewConfig, ModSetModuleFile, ModSettingOpts, ModPatternRegistration } from "./mod-loader/mod-manifest.js";
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
}

export class ModLoader {
  private readonly sources = new Map<string, ModSource>();
  /** mod load order (empty until load()). */
  private order: ResolvedModEntry[] = [];
  private loaded = false;

  private readonly views: ViewRegistrationTable;
  private readonly viewConfigs = new ModViewConfigTable();
  private readonly settings = new SettingRegistry();
  private readonly patterns = new PatternOverlay();
  private readonly basket = new SetModuleBasket();

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

    // The compiled-in core patterns seed the concrete table (the ported
    // "core mod" - mod/core/set_pattern/01..09, oracle order in
    // PATTERN_TABLE); mod registrations then front-insert on top. The
    // settings registry starts empty the way Ruby's boot does.
    this.patterns.seedCore(PATTERN_TABLE.map((spec) => spec.code));
    this.settings.clear();

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
            for (const formatBlock of Object.values(file.formats ?? {})) {
              for (const view of formatBlock.views ?? []) {
                this.views.register(view.view, view.viewFn);
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

  /** Restore the exact pre-load state (the reverse of every registration). */
  reset(): void {
    this.views.unregisterAll();
    this.viewConfigs.clear();
    this.settings.clear();
    this.patterns.clear();
    this.basket.clear();
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

  /** The mod-contributed view-config table (format.ts consults it via the
   *  coordinator patch; direct callers: tests, tooling). */
  viewConfigFor(view: string): ModViewConfigTableEntry | undefined {
    return this.viewConfigs.configFor(view);
  }

  /** The Card::Setting registry port (groups with nil holes, preferences). */
  settingsRegistry(): SettingRegistry {
    return this.settings;
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

/** Bind the deck's loader as the default (call after load()). */
export function setDefaultModLoader(loader: ModLoader): void {
  defaultLoader = loader;
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
