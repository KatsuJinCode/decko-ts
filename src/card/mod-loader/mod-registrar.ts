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
//   is documented in docs/mod-loader-port-notes.md.
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
export function setModuleShortname(setPath: string): string {
  return setPath
    .split("/")
    .map((segment) => segment.replace(/^\d+_/, ""))
    .map(camelize)
    .join("::");
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

  clear(): void {
    this.base.length = 0;
    this.abstract.length = 0;
    this.nonbase.clear();
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

  register(view: string, config: ModViewConfig | undefined): void {
    if (config === undefined) return;
    this.byView.set(view, config);
  }

  /** format.rb#view_setting's mod half (render.rb:55-57 consults the
   *  _view_<view>__<setting> method; this answers it for mod views). */
  configFor(view: string): ModViewConfig | undefined {
    return this.byView.get(view);
  }

  entries(): ReadonlyMap<string, ModViewConfig> {
    return this.byView;
  }

  clear(): void {
    this.byView.clear();
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
// view registration with override tracking
// ---------------------------------------------------------------------------

/**
 * Mutates the live views record the way Ruby's define_method replaces a
 * method, remembering every replaced/added entry so unload restores the
 * pre-load state exactly.
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

  /** Restore the exact pre-registration state (every touched key back to
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
