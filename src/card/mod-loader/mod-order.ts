// The mod load-order resolution: TypeScript port of Cardio::Mod::Dirs
// (card-1.110.0 lib/cardio/mod/dirs.rb) and its name rules
// (lib/cardio/mod/class_methods.rb).
//
// Ruby's order (dirs.rb:51-63):
//   1. core mods - the card gem's own mod/ directory, added via
//      add_from_dir -> Dir.entries.sort (dirs.rb:152-157, 168-172),
//      group "gem-card"
//   2. gem mods - every bundle spec whose name starts with "card-mod-" or
//      that carries metadata["card-mod"] (class_methods.rb:102-113), in
//      Bundler's spec order, group from metadata["card-mod-group"]
//      (default "gem", dirs.rb:144-150)
//   3. deck mod dirs - per path: a Modfile (explicit mod/mod_gem order,
//      dirs.rb:159-166) or the alphabetically sorted directory listing
//      (add_from_dir), group :custom (mod.rb:47-53 defaults nil -> :custom)
//   Duplicate names raise at insertion (dirs.rb:66-71); a mod whose path
//   does not exist raises "mod not found" at construction (mod.rb:88-95).
//
// The gem ORDER is the deck's Bundler resolve order - a dependency-closure
// order, NOT name-sorted (oracle capture fixtures/captured/help-mod-loader
// .json "mods": collection, content, format, list, markdown, permissions,
// help, ... - card-mod-help loads after its markdown/permissions
// dependencies). Bundler's resolve is the deck's input, so the TS port
// takes the gem order as INPUT (the ordered list from the deck's bundle),
// exactly like Ruby takes it from Bundler.definition.specs
// (class_methods.rb:61-65).
//
// CARD_MODS=none: Cardio::Mod.load returns before Loader.load_mods
// (class_methods.rb:7-8); loadMods skips with an empty report.

/** "card-mod-help" -> "help"; "help" stays "help"
 *  (class_methods.rb:26-28 `name.to_s.sub(/^card-mod-/, "")`). */
export function normalizeModName(name: string): string {
  return name.replace(/^card-mod-/, "");
}

/** Ruby Array#sort on directory entries: byte order (upper before lower,
 *  digits before letters). JS default string comparison is code-unit order,
 *  which matches byte order for the ASCII names mods use. */
export function byteSort(values: readonly string[]): string[] {
  return [...values].sort();
}

export interface ModDirsInput {
  /** deck-local mod directories: each an explicit ordered list (Modfile
   *  shape) OR a directory listing to sort alphabetically. */
  readonly deckModDirs?: readonly {
    /** the mod names the directory provides (Modfile entries or the
     *  listing; sorting happens here when modfile is absent). */
    readonly listing?: readonly string[];
    /** a Modfile's explicit order (wins over listing, dirs.rb:159-166). */
    readonly modfile?: readonly string[];
  }[];

  /** the gem mods in the deck's bundle order (Bundler's resolve order;
   *  names may carry the card-mod- prefix - normalization strips it). */
  readonly gemMods?: readonly string[];

  /** the core mod names (the card gem's mod/ subdirectories); sorted
   *  alphabetically like add_from_dir. Default: ["core"]. */
  readonly coreMods?: readonly string[];
}

export interface ResolvedModEntry {
  /** normalized name. */
  readonly name: string;
  readonly group: string;
}

/** "mod not found: X" (mod.rb:88-95). */
export class ModNotFoundError extends Error {
  readonly modName: string;
  constructor(modName: string) {
    super(`mod not found: ${modName}`);
    this.name = "ModNotFoundError";
    this.modName = modName;
  }
}

/** `name conflict: mod with name "X" already loaded` (dirs.rb:66-71). */
export class ModNameConflictError extends Error {
  readonly modName: string;
  constructor(modName: string) {
    super(`name conflict: mod with name "${modName}" already loaded`);
    this.name = "ModNameConflictError";
    this.modName = modName;
  }
}

/**
 * The Dirs port: resolve the full mod load order from the deck's inputs.
 * Pure ordering - the manifests are joined by the ModLoader.
 */
export function resolveModOrder(input: ModDirsInput = {}): ResolvedModEntry[] {
  const entries: ResolvedModEntry[] = [];
  const byName = new Set<string>();

  const add = (rawName: string, group: string): void => {
    const name = normalizeModName(rawName);
    if (byName.has(name)) throw new ModNameConflictError(name);
    byName.add(name);
    entries.push({ name, group });
  };

  // 1. core mods (dirs.rb:152-157): the card gem's mod/ dir, sorted.
  for (const name of byteSort(input.coreMods ?? ["core"])) {
    add(name, "gem-card");
  }

  // 2. gem mods (dirs.rb:138-150): the deck's bundle order, group from the
  //    card-mod-group metadata (default "gem"; the oracle deck's defaults
  //    all declare "gem-defaults").
  for (const name of input.gemMods ?? []) {
    add(name, "gem-defaults");
  }

  // 3. deck mod dirs (dirs.rb:57-61): Modfile order wins over the sorted
  //    listing (add_from_modfile || add_from_dir).
  for (const dir of input.deckModDirs ?? []) {
    if (dir.modfile !== undefined) {
      for (const name of dir.modfile) add(name, "custom");
    } else {
      for (const name of byteSort(dir.listing ?? [])) add(name, "custom");
    }
  }

  return entries;
}
