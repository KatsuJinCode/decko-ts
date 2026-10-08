// The style SOURCE FILES a skin's stylesheet is built from, vendored from the
// Decko gems into fixtures/vendor/ (tools/oracle/vendor-style-sources.mjs
// copies them and checks each against the sha256 the Ruby oracle read):
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
// a runtime the reads throw (there are no vendored files to read); nothing
// substitutes an empty string for a missing source.

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
    throw new Error("style sources need a Node filesystem (the vendored fixtures/vendor/ tree); this runtime has none");
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
  manifest ??= (JSON.parse(
    fs().readFileSync(new URL("mod-style-assets/manifest.json", vendorDirectory()), "utf8"),
  ) as { mods: Record<string, ModStyleFile[]> }).mods;
  return manifest[modName];
}

/** An asset file card's `content`: the file's text (Abstract::AssetFile ->
 *  Abstract::CodeFile reads its source path). */
export function modStyleFileContent(file: ModStyleFile): string {
  return fs().readFileSync(new URL(`mod-style-assets/${file.file}`, vendorDirectory()), "utf8");
}

/** bootswatch_skin.rb:74-77 scss_from_theme_file: the theme directory's
 *  `_<file>.scss`, or "" when the file does not exist (a skin with no theme
 *  reads the dist directory itself, which holds neither file). */
export function bootswatchThemeFile(theme: string, file: "variables" | "bootswatch"): string {
  if (theme === "" || /[\\/.]/.test(theme)) return "";
  const url = new URL(`bootswatch/${theme}/_${file}.scss`, vendorDirectory());
  return fs().existsSync(url) ? fs().readFileSync(url, "utf8") : "";
}
