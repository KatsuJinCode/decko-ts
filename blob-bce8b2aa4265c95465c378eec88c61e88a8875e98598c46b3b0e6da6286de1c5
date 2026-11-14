// The style SOURCE FILES a skin's stylesheet is built from, vendored from the
// Decko gems into fixtures/vendor/ by
// tools/oracle/vendor-style-sources.mjs, which copies each file and records
// the sha256 it read:
//
//   fixtures/vendor/mod-style-assets/manifest.json + <gem>/<path>
//       every file a mod's `+*style` card lists through its style groups
//       (card-mod-assets set/abstract/mod_assets.rb: the mod's assets/style
//       folder group, or its manifest.yml groups), per mod, in Ruby's order
//   fixtures/vendor/bootswatch/<theme>/_variables.scss, _bootswatch.scss
//       the Bootswatch theme files a themed skin reads
//       (card-mod-bootstrap set/type/bootswatch_skin.rb scss_from_theme_file)
//   fixtures/vendor/bootstrap-scss/   (read by render/bootstrap-code-files.ts)
//
// Reads go through a runtime process.getBuiltinModule probe, never a static
// "node:fs" import, for the reason render/bootstrap-code-files.ts gives: this
// module sits in bundle graphs whose runtimes have no node: modules. On such
// a runtime the reads fall back to the GENERATED snapshot of the vendored
// tree (vendor/edge-style-source-snapshot.js,
// tools/vendor/build-edge-asset-source-snapshot.mjs), which the edge bundles
// carry; nothing substitutes an empty string for a missing source.

import { edgeAssetSources } from "../../../vendor/edge-style-source-snapshot.js";

interface NodeSyncFs {
  readFileSync(path: string | URL, encoding: string): string;
  existsSync(path: string | URL): boolean;
}

let nodeFs: NodeSyncFs | undefined;
function fsOrNull(): NodeSyncFs | undefined {
  if (nodeFs !== undefined) return nodeFs;
  const proc = (globalThis as unknown as { process?: { getBuiltinModule?: (id: string) => unknown } }).process;
  const found = proc?.getBuiltinModule?.("node:fs") as NodeSyncFs | undefined;
  if (found !== undefined) nodeFs = found;
  return found;
}

function fs(): NodeSyncFs {
  const found = fsOrNull();
  if (found === undefined) {
    throw new Error("style sources need a Node filesystem (the vendored fixtures/vendor/ tree); this runtime has none");
  }
  return found;
}

/** One vendored file's text: from the repository tree on a Node host, from
 *  the generated snapshot on an edge runtime. Undefined when the file is
 *  neither on disk nor in the snapshot — never an empty string. */
function readVendored(relativePath: string): string | undefined {
  const nodeFs = fsOrNull();
  if (nodeFs !== undefined) {
    try {
      return nodeFs.readFileSync(new URL(relativePath, vendorDirectory()), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") throw error;
      return undefined;
    }
  }
  return edgeAssetSources[relativePath];
}

/** The repository's fixtures/vendor/ directory. This module runs from src/
 *  (tests) and from dist/src/ (the transpiled harness), so both depths are
 *  tried; the first that holds the vendored tree wins. */
let vendorDir: URL | undefined;
function vendorDirectory(): URL {
  if (vendorDir !== undefined) return vendorDir;
  for (const up of ["../../../", "../../../../"]) {
    const candidate = new URL(`${up}fixtures/vendor/`, import.meta.url);
    if (fs().existsSync(new URL("mod-style-assets/manifest.json", candidate))) {
      vendorDir = candidate;
      return candidate;
    }
  }
  throw new Error("fixtures/vendor/mod-style-assets/manifest.json not found next to the engine sources");
}

export interface ModStyleFile {
  /** Path under fixtures/vendor/mod-style-assets/ ("card-mod-format/assets/style/common.scss"). */
  file: string;
  /** The asset file card's type: "scss" or "css" (style_group.rb new_asset_constants). */
  type: string;
  sha256: string;
}

/** The stamp of the card-mod gem sources the vendored copies were taken
 *  from. Ruby's `asset_input_needs_refresh?` (mod_assets.rb:134-135,
 *  asset_group.rb:41-45) refreshes an inputter when a source file is newer
 *  than its `+*asset input` row's updated_at, so the first request after the
 *  gems are installed re-stores every input and bundle, and later requests
 *  do not. The port has no file mtimes for the gems, so this constant plays
 *  that role for source invalidation only. Virtual rows retain their actual
 *  save time, even when a frozen clock predates the source stamp. 2026-10-13
 *  is the install date of the gems the vendored copies come from. */
export const STYLE_SOURCES_MTIME: Date = new Date("2026-10-13T00:00:00Z");

let manifest: Record<string, ModStyleGroup[]> | undefined;
function vendoredManifest(): Record<string, ModStyleGroup[]> {
  if (manifest === undefined) {
    const text = readVendored("mod-style-assets/manifest.json");
    if (text === undefined) throw new Error("vendored style sources not found: mod-style-assets/manifest.json");
    manifest = (JSON.parse(text) as { mods: Record<string, ModStyleGroup[]> }).mods;
  }
  return manifest;
}

/** One `mod: X+*style+group: <name>` card: its asset file cards, in Ruby's
 *  order (asset_group.rb:15-18 item_cards over relative_paths). The group is
 *  the unit `style: mods`'s input is assembled from — a mod card's core view
 *  joins the groups, a group card's core view joins the files. */
export interface ModStyleGroup {
  name: string;
  /** The group's type: "local_style_folder_group" or "local_style_manifest_group". */
  type: string;
  files: ModStyleFile[];
}

/** The style groups of one `mod: X+*style` card, in Ruby's order
 *  (mod_assets.rb:5-7 item_cards -> local_group_cards); undefined for a mod
 *  with no style assets (its `+*style` card has no groups). */
export function modStyleGroups(modName: string): readonly ModStyleGroup[] | undefined {
  return vendoredManifest()[modName];
}

/** Every file of every group of one mod, groups in order — the flat
 *  `recursed_item_cards` walk (bootswatch_skin.rb:163-172 load_content maps
 *  recursed_item_cards to content and joins "\n"), which does not read the
 *  group seams. */
export function modStyleFiles(modName: string): readonly ModStyleFile[] | undefined {
  const groups = vendoredManifest()[modName];
  if (groups === undefined) return undefined;
  return groups.flatMap((group) => group.files);
}

/** An asset file card's `content`: the file's text (Abstract::AssetFile ->
 *  Abstract::CodeFile reads its source path). */
export function modStyleFileContent(file: ModStyleFile): string {
  const text = readVendored(`mod-style-assets/${file.file}`);
  if (text === undefined) throw new Error(`vendored style source not found: mod-style-assets/${file.file}`);
  return text;
}

/** bootswatch_skin.rb:74-77 scss_from_theme_file: the theme directory's
 *  `_<file>.scss`, or "" when the file does not exist (a skin with no theme
 *  reads the dist directory itself, which holds neither file). */
export function bootswatchThemeFile(theme: string, file: "variables" | "bootswatch"): string {
  if (theme === "" || /[\\/.]/.test(theme)) return "";
  return readVendored(`bootswatch/${theme}/_${file}.scss`) ?? "";
}
