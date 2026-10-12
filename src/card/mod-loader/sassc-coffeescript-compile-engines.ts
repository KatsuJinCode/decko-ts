// Compile engines for the mod asset pipeline: the SassC render path, the
// CoffeeScript compile, and the mod asset-directory walk. These are the
// leaves the carrierwave input path names as its render-input seams, and the
// leaves the admin :styles/:scripts views bottom out in.
//
// Ported behaviour, keyed to the upstream Ruby each function replaces:
//
// 1. card-mod-style set/abstract/01_css.rb:63-67 `def compress input;
//    compress? ? compile(input) : compile(input, :nested) end` alongside
//    :69-73 `def compile input, _style=:compressed; SassC::Engine.new(input,
//    style: :compressed).render end`. The parameter is dead - compile ignores
//    _style and always renders :compressed, as the FIXME on :67-68 admits -
//    so both arms of the compress? ternary land on the same style and this
//    port's compressCss needs no compress? argument.
// 2. card-mod-style set/abstract/02_scss.rb:12-19 compile_scss defaults to
//    SassC style :expanded. Separately, :27-29 makes the scss :core view an
//    UNCOMPILED pass-through, so only the css-format :compiled view compiles,
//    and Abstract::Scss (:3-6) points that view at compile_scss(:expanded).
// 3. card-mod-script set/abstract/02_coffee_script.rb:20-22 compile_coffee,
//    running `::CoffeeScript.compile script, no_wrap: bare_compile`, where
//    bare_compile is false outside the html format (:16-18). The Ruby
//    coffee-script 2.4.1 wrapper (lib/coffee_script.rb) rewrites no_wrap: to
//    {bare:} and hands the source to the bundled coffee-script-source 1.12.2
//    compiler through ExecJS. The npm `coffeescript@1.12.2` package ships
//    that same compiler, which is what makes both no_wrap arms come out
//    byte-identical here.
// 4. card-mod-script set/abstract/00_script.rb:9-12, the js :compressed
//    view: `comment_with_source compress(_render_core)`, where
//    comment_with_source (:20-22) is `"// #{card.name}\n#{js}"` and compress
//    (:25-27) is the identity function under compress_assets=false. The
//    compress_assets=true arm is Uglifier (harmony); nothing equivalent is
//    installed in this engine and none was added, so that arm raises a named
//    error rather than silently returning unminified bytes.
// 5. card-mod-assets set/abstract/asset_group.rb:15-18 item_cards ->
//    relative_paths -> new_asset_file_card (:20-32): name is File.basename,
//    content is the relative path, and type plus set-module follow from the
//    extension (style_group.rb new_asset_constants: .scss/.css;
//    script_group.rb: .js.coffee tested BEFORE .js, since a "x.js.coffee"
//    path ends with both). folder_group.rb relative_paths (:9-12) is
//    `Dir.chdir(path) { Dir.glob("**/*.{ext1,ext2}") }` - recursive,
//    forward-slashed, hidden entries excluded, results sorted.
//    local_manifest_group.rb relative_paths (:8-11) is manifest_group_items
//    (mod_assets.rb:75-77: `manifest&.dig(group_name, "items") || []`).
//
// DEPENDENCY DISCLOSURE - two npm adds, both declared in package.json; the
// lockfile diff is purely additive, with zero removals and zero version
// changes to the pre-existing tree:
//
// - coffeescript@1.12.2: the byte-exact parity engine described in point 3.
// - sass@1.105.0 (Dart Sass): the closest maintained Sass compiler available.
//   npm carries no libsass 3.6.x binding usable on Node 24 (node-sass 9 wraps
//   libsass 3.5.5 with no Node 24 prebuilds; the @amoo-miki/node-sass
//   9.0.0-libsass-3.6.5 fork fails its native node-gyp build), while the Ruby
//   engine compiles through sassc 2.4.0 / libsass 3.6.4 (gem Makefile
//   LIBSASS_VERSION). The libsass-versus-dart byte divergences are normalized
//   in two layers:
//   a. BOM - libsass strips a leading U+FEFF from the input, dart carries it
//      through into the output. The input is therefore stripped before
//      compiling.
//   b. Trailing newline - libsass appends "\n" to every non-empty render in
//      both :compressed and :expanded, and dart never does. A comment-only
//      source compiles to "" under both, so the newline is appended only
//      when the compiled css is non-empty.
//   c. Everything else is normalized by the post-compile byte adapter
//      (libsass-byte-parity-adapter.ts). dart canonicalizes numbers (leading
//      zeros stripped or added, trailing zeros and exponents re-formatted),
//      colors (keywords to hex, hex shortened and lowercased), string escapes
//      (decoded, case lost), attribute-selector quotes (stripped) and calc
//      padding (stripped); it reorders nothing and separates hoisted
//      top-level rules with a single newline in :expanded. libsass 3.6.4, by
//      contrast, preserves the authored token text verbatim and reorders
//      compound selectors into category order. The adapter restores the
//      authored forms from the source (the pipeline holds it) and applies
//      libsass's own conventions. Residuals that output bytes cannot recover
//      are listed in the adapter header.

import { readdirSync, statSync } from "node:fs";
import { compileString, type OutputStyle } from "sass";
import { compile as coffeeCompile } from "coffeescript";
import { adaptDartCssToLibsassBytes } from "./libsass-byte-parity-adapter.js";

/** SassC::Engine style strings (01_css.rb:69-73 style: :compressed,
 *  02_scss.rb:12-14 default :expanded). */
export type SasscStyle = "compressed" | "expanded" | "nested" | "compact";

/** Sass compile failure. Ruby's surface raises Card::Error
 *  (css_compression_error, 01_css.rb:75-85), or Card::Error carrying a
 *  "SassC::SyntaxError (name:backtrace)" message (02_scss.rb:16-19). The two
 *  compilers format their error spans differently, so the message bytes are
 *  not interchangeable; this surface is pinned as a throw rather than as
 *  bytes (compile-engines-pin.test.ts). */
export class SasscCompileError extends Error {
  readonly sourceName: string;

  constructor(sourceName: string, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(
      `SassC compile failed for ${sourceName} (libsass would raise Card::Error here; ` +
        `the dart-vs-libsass error message bytes diverge and are not pinned): ${detail.split("\n")[0]}`,
    );
    this.name = "SasscCompileError";
    this.sourceName = sourceName;
  }
}

/** libsass appends "\n" to every non-empty render, in both styles; dart
 *  never emits it. A comment-only source compiles to "" under libsass, which
 *  is why the empty case is passed through untouched. */
function libsassTrailingNewline(css: string): string {
  return css === "" ? css : `${css}\n`;
}

/** SassC::Engine.new(input, style:).render for a string input (the deck
 *  compiles card/file CONTENT strings, never files with import paths).
 *  Normalizations: (a) input BOM strip + (b) trailing newline here, and
 *  (c) the full libsass byte-convention adapter over the dart output (see
 *  libsass-byte-parity-adapter.ts). */
export function sasscRender(input: string, style: SasscStyle = "compressed"): string {
  // (a) libsass strips a leading U+FEFF; dart carries it into the output.
  const stripped = input.startsWith("\uFEFF") ? input.slice(1) : input;
  let css: string;
  try {
    css = compileString(stripped, { style: style as OutputStyle }).css;
  } catch (cause) {
    throw new SasscCompileError("(inline source)", cause);
  }
  const adapted = adaptDartCssToLibsassBytes(css, stripped, style);
  return libsassTrailingNewline(adapted);
}

/** 01_css.rb:63-67 compress - the css-format compress path. The compress?
 *  config does not reach this port's signature because compile (:69-73)
 *  ignores its _style param: BOTH arms run style :compressed, which is what
 *  makes the :compiled and :compressed bytes identical on the same card. */
export function compressCss(input: string): string {
  return sasscRender(input, "compressed");
}

/** 02_scss.rb:12-19 compile_scss - style :expanded default (the css-format
 *  :compiled view on Scss cards, 02_scss.rb:3-6). The rescue in Ruby's
 *  compile_scss formats a "SassC::SyntaxError (name:backtrace)" message;
 *  this port reports failures as SasscCompileError instead. */
export function compileScss(scss: string, style: "expanded" | "compressed" = "expanded"): string {
  return sasscRender(scss, style);
}

/** 02_coffee_script.rb:20-22 compile_coffee - `CoffeeScript.compile script,
 *  no_wrap: bare_compile` (bare_compile false outside the html format,
 *  :16-18). Byte-exact: the npm coffeescript@1.12.2 package is the same
 *  compiler the Ruby side reaches through coffee-script-source 1.12.2 (the
 *  wrapper maps no_wrap: to {bare:}). */
export function compileCoffeeScript(script: string, noWrap: boolean): string {
  return coffeeCompile(script, { bare: noWrap });
}

/** 00_script.rb:9-12 the js-format :compressed view = comment_with_source
 *  (20-22) over compress (_render_core) (:25-27). Under compress_assets=false
 *  the compress step is the identity function, so the view is the source with
 *  a leading name comment. compressAssets=true is the Uglifier (harmony)
 *  arm: no equivalent is installed and none was added - this port throws
 *  rather than silently returning unminified bytes. */
export function scriptCompressedView(
  cardName: string,
  core: string,
  compressAssets: boolean,
): string {
  if (compressAssets) {
    throw new Error(
      "uglify surface unported: 00_script.rb try_compress runs Uglifier.new(harmony: true).compile; " +
        "no js minifier is installed in the engine (the oracle deck runs compress_assets=false, " +
        "the identity arm this port pins)",
    );
  }
  return `// ${cardName}\n${core}`;
}

// ---------------------------------------------------------------------------
// the mod asset-dir walk (card-mod-assets set/abstract/asset_group.rb +
// folder_group.rb + local_manifest_group.rb)
// ---------------------------------------------------------------------------

/** style_group.rb:17-19 def valid_file_extensions; %w[css scss]. */
export const styleGroupFileExtensions = ["css", "scss"] as readonly string[];

/** script_group.rb def valid_file_extensions; %w[js coffee]. */
export const scriptGroupFileExtensions = ["js", "coffee"] as readonly string[];

function listDirRecursive(base: string, prefix: string): string[] {
  const out: string[] = [];
  let entries;
  try {
    entries = readdirSorted(base);
  } catch {
    return out; // unreadable/missing dir - the walk's empty arm
  }
  for (const entry of entries) {
    // Ruby Dir.glob excludes hidden entries (leading dot) by default.
    if (entry.name.startsWith(".")) continue;
    const rel = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory) {
      out.push(...listDirRecursive(`${base}/${entry.name}`, rel));
    } else {
      out.push(rel);
    }
  }
  return out;
}

function readdirSorted(dir: string): Array<{ name: string; isDirectory: boolean }> {
  const dirents = readDirEntries(dir);
  // Ruby's Dir.glob sorts its results; that sort is codepoint order for the
  // ASCII paths this walk sees (JS default sort is UTF-16 code-unit order).
  return dirents.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

function readDirEntries(dir: string): Array<{ name: string; isDirectory: boolean }> {
  return readdirSync(dir).map((name) => {
    let isDirectory = false;
    try {
      isDirectory = statSync(`${dir}/${name}`).isDirectory();
    } catch {
      isDirectory = false;
    }
    return { name, isDirectory };
  });
}

/** folder_group.rb:9-12 relative_paths:
 *  `Dir.chdir(path) { Dir.glob(search_path) }` where search_path
 *  (folder_group.rb:14-16) is
 *  `File.join("**", "*.{#{valid_file_extensions.join(',')}}")` - the
 *  recursive double-star glob over a brace-expanded extension list, so
 *  every file under assets_path whose extension is in
 *  valid_file_extensions matches, at any depth. Matches are relative,
 *  forward-slashed, hidden entries excluded, sorted. Returns [] when
 *  assets_path is nil (folder_group.rb:10's `return [] unless path`)
 *  or unreadable (asset walk's empty arm). */
export function folderGroupRelativePaths(
  assetsPath: string | undefined | null,
  validFileExtensions: readonly string[],
): string[] {
  if (!assetsPath) return [];
  const all = listDirRecursive(assetsPath, "");
  return all.filter((rel) => validFileExtensions.some((ext) => rel.endsWith(`.${ext}`)));
}

/** folder_group.rb:4-7 paths - the relative walk joined onto the assets dir. */
export function folderGroupPaths(
  assetsPath: string | undefined | null,
  validFileExtensions: readonly string[],
): string[] {
  if (!assetsPath) return [];
  return folderGroupRelativePaths(assetsPath, validFileExtensions).map(
    (rel) => `${assetsPath}/${rel}`,
  );
}

/** mod_assets.rb:75-77 manifest_group_items:
 *  `manifest&.dig(group_name, "items") || []`. The manifest OBJECT is the
 *  parsed manifest.yml (the YAML parse is the deck-side config load,
 *  mod_assets.rb load_manifest); the port consumes the parsed shape, like
 *  Ruby's manifest memo does. */
export function manifestGroupItems(
  manifest: Record<string, { items?: string[] }> | null | undefined,
  groupName: string,
): string[] {
  return manifest?.[groupName]?.items ?? [];
}

/** style_group.rb:21-35 new_asset_constants - extension -> type codename +
 *  set module for STYLE asset files (.scss / .css; anything else -> nil). */
export function styleAssetConstants(
  path: string,
): { typeCode: "scss" | "css"; setModule: "Abstract::AssetScss" | "Abstract::AssetCss" } | undefined {
  if (path.endsWith(".scss")) {
    return { typeCode: "scss", setModule: "Abstract::AssetScss" };
  }
  if (path.endsWith(".css")) {
    return { typeCode: "css", setModule: "Abstract::AssetCss" };
  }
  return undefined;
}

/** script_group.rb new_asset_constants - extension -> type codename + set
 *  module for SCRIPT asset files. ORDER MATTERS: .js.coffee is checked
 *  BEFORE .js (a "x.js.coffee" path ends with both). */
export function scriptAssetConstants(
  path: string,
): { typeCode: "coffee_script" | "java_script"; setModule: "Abstract::AssetCoffeeScript" | "Abstract::AssetJavaScript" } | undefined {
  if (path.endsWith(".js.coffee")) {
    return { typeCode: "coffee_script", setModule: "Abstract::AssetCoffeeScript" };
  }
  if (path.endsWith(".js")) {
    return { typeCode: "java_script", setModule: "Abstract::AssetJavaScript" };
  }
  return undefined;
}
