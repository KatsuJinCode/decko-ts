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

let manifest: Record<string, ModStyleFile[]> | undefined;
/** The vendored files of one mod's style groups, in Ruby's order; undefined
 *  for a mod with no style assets (its `+*style` card has no groups). */
export function modStyleFiles(modName: string): readonly ModStyleFile[] | undefined {
  if (manifest === undefined) {
    const text = readVendored("mod-style-assets/manifest.json");
    if (text === undefined) throw new Error("vendored style sources not found: mod-style-assets/manifest.json");
    manifest = (JSON.parse(text) as { mods: Record<string, ModStyleFile[]> }).mods;
  }
  return manifest[modName];
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
