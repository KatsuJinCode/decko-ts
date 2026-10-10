// The script SOURCE FILES the site script is built from, vendored from the
// Decko gems into fixtures/vendor/ (tools/oracle/vendor-script-sources.mjs
// copies them and checks each against the sha256 the Ruby oracle read):
//
//   fixtures/vendor/mod-script-assets/manifest.json + <gem>/<path>
//       every file a mod's `+*script` card lists through its script groups
//       (card-mod-assets set/abstract/mod_assets.rb: the mod's assets/script
//       folder group, or its manifest.yml groups minus the remote group),
//       per mod, each group's files in Ruby's order
//
// Reads go through a runtime process.getBuiltinModule probe, never a static
// "node:fs" import, as style-sources.ts explains: this module sits in bundle
// graphs whose runtimes have no node: modules. On such a runtime the reads
// throw (there are no vendored files to read); nothing substitutes an empty
// string for a missing source.

interface NodeSyncFs {
  readFileSync(path: string | URL, encoding: string): string;
  existsSync(path: string | URL): boolean;
}

let nodeFs: NodeSyncFs | undefined;
function fs(): NodeSyncFs {
  if (nodeFs !== undefined) return nodeFs;
  const proc = (globalThis as unknown as { process?: { getBuiltinModule?: (id: string) => unknown } }).process;
  const found = proc?.getBuiltinModule?.("node:fs") as NodeSyncFs | undefined;
  if (found === undefined) {
    throw new Error("script sources need a Node filesystem (the vendored fixtures/vendor/ tree); this runtime has none");
  }
  nodeFs = found;
  return found;
}

/** The repository's fixtures/vendor/ directory. This module runs from src/
 *  (tests) and from dist/src/ (the transpiled harness), so both depths are
 *  tried; the first that holds the vendored tree wins. */
let vendorDir: URL | undefined;
function vendorDirectory(): URL {
  if (vendorDir !== undefined) return vendorDir;
  for (const up of ["../../../", "../../../../"]) {
    const candidate = new URL(`${up}fixtures/vendor/`, import.meta.url);
    if (fs().existsSync(new URL("mod-script-assets/manifest.json", candidate))) {
      vendorDir = candidate;
      return candidate;
    }
  }
  throw new Error("fixtures/vendor/mod-script-assets/manifest.json not found next to the engine sources");
}

export interface ModScriptFile {
  /** Path under fixtures/vendor/mod-script-assets/
   *  ("card-mod-format/assets/script/decko/decko.js.coffee"). */
  file: string;
  /** The asset file card's name — File.basename of the source path
   *  (asset_group.rb new_asset_file_card), the `// <name>` comment of the
   *  leaf's compressed render (00_script.rb comment_with_source). */
  name: string;
  /** The asset file card's type: "java_script" or "coffee_script"
   *  (script_group.rb new_asset_constants, .js.coffee checked first). */
  type: string;
  sha256: string;
}

export interface ModScriptGroup {
  /** The group card's name ("mod: format+*script+group: jquery"). */
  group: string;
  /** The group's type: "local_script_manifest_group" or
   *  "local_script_folder_group". */
  groupType: string;
  files: ModScriptFile[];
}

let manifest: Record<string, ModScriptGroup[]> | undefined;
/** The vendored files of one mod's script groups, in Ruby's order; undefined
 *  for a mod with no script assets (its `+*script` card has no groups). */
export function modScriptGroups(modName: string): readonly ModScriptGroup[] | undefined {
  manifest ??= (JSON.parse(
    fs().readFileSync(new URL("mod-script-assets/manifest.json", vendorDirectory()), "utf8"),
  ) as { mods: Record<string, ModScriptGroup[]> }).mods;
  return manifest[modName];
}

/** An asset file card's `content`: the file's text (Abstract::AssetFile ->
 *  Abstract::CodeFile reads its source path). */
export function modScriptFileContent(file: ModScriptFile): string {
  return fs().readFileSync(new URL(`mod-script-assets/${file.file}`, vendorDirectory()), "utf8");
}

/** Whether this host can read the vendored sources (a Node filesystem with
 *  the vendored tree present). A `<set>+*script` save is refused before
 *  anything is written on a host without them, as a stylesheet rebuild is
 *  refused without the SCSS compiler. */
export function scriptSourcesAvailable(): boolean {
  try {
    vendorDirectory();
    return true;
  } catch {
    return false;
  }
}
