// The compile engines substrate: the SassC compile path, the CoffeeScript
// compile, and the mod asset-dir walk - the leaves the carrierwave input
// path names as deps.renderInputView seams, and the leaves the admin
// :styles/:scripts view pins bottom out in.
//
// Ground truth (all oracle-capture-verified, fixtures/captured/
// compile-engines.json, no-write proof 5018 -> 5018):
//
// 1. card-mod-style set/abstract/01_css.rb:63-67 `def compress input;
//    compress? ? compile(input) : compile(input, :nested) end` + :69-73
//    `def compile input, _style=:compressed; SassC::Engine.new(input,
//    style: :compressed).render end` - THE QUIRK: compile IGNORES its
//    _style param (the FIXME on :67-68 admits it), so BOTH compress? arms
//    emit style :compressed. Deck-proven: the jquery_ui_smoothness.css
//    card's :compiled and :compressed oracle bytes are IDENTICAL. The port
//    (compressCss) therefore takes no compress? flag at all.
// 2. card-mod-style set/abstract/02_scss.rb:12-19 compile_scss - SassC
//    style :expanded default. And :27-29 the scss :core is the UNcompiled
//    process_content pass-through (deck-proven: render_core == source
//    bytes) - the compile happens only in the css-format :compiled view,
//    which Abstract::Scss overrides (:3-6) to compile_scss(:expanded).
// 3. card-mod-script set/abstract/02_coffee_script.rb:20-22 compile_coffee -
//    `::CoffeeScript.compile script, no_wrap: bare_compile`; bare_compile is
//    false outside the html format (:16-18). The Ruby coffee-script 2.4.1
//    wrapper (lib/coffee_script.rb) normalizes no_wrap: to {bare:} and calls
//    the bundled coffee-script-source 1.12.2 JS compiler through ExecJS -
//    the SAME compiler the npm `coffeescript@1.12.2` package ships, so the
//    port is BYTE-EXACT on every corpus source in both arms.
// 4. card-mod-script set/abstract/00_script.rb:9-12 the js :compressed view:
//    `comment_with_source compress(_render_core)` where comment_with_source
//    (:20-22) is `"// #{card.name}\n#{js}"` and compress (:25-27) is IDENTITY
//    under compress_assets=false (the oracle deck's config; recorded in the
//    fixture). The compress_assets=true arm is Uglifier (harmony) - no
//    equivalent is installed in the engine and none was added; that arm
//    throws a named error (loud, never a silent wrong-byte path).
// 5. card-mod-assets set/abstract/asset_group.rb:15-18 item_cards ->
//    relative_paths -> new_asset_file_card (:20-32): name = File.basename,
//    content = the relative path, type/set-module by extension (style_group.rb
//    new_asset_constants: .scss/.css; script_group.rb: .js.coffee checked
//    BEFORE .js). folder_group.rb relative_paths (:9-12):
//    `Dir.chdir(path) { Dir.glob("**/*.{ext1,ext2}") }` - recursive,
//    forward-slashed, hidden entries excluded, results sorted.
//    local_manifest_group.rb relative_paths (:8-11) = manifest_group_items
//    (mod_assets.rb:75-77: `manifest&.dig(group_name, "items") || []`).
//
// DEPENDENCY DISCLOSURE (two npm adds, both declared in
// package.json; the lockfile diff is purely additive - zero removals, zero
// version changes to the pre-existing tree):
// - coffeescript@1.12.2: byte-exact parity engine (same compiler as the
//   oracle deck's coffee-script-source 1.12.2). Capture-verified 4/4
//   sources, both no_wrap arms.
// - sass@1.105.0 (Dart Sass): the closest maintained Sass compiler. npm has
//   NO libsass 3.6.x binding usable on Node 24 (node-sass 9 wraps libsass
//   3.5.5 with no Node 24 prebuilds; the @amoo-miki/node-sass
//   9.0.0-libsass-3.6.5 fork fails its native node-gyp build). The oracle
//   compiles through sassc 2.4.0 / libsass 3.6.4 (gem Makefile
//   LIBSASS_VERSION). The libsass-vs-dart byte divergences are normalized in
//   TWO layers, both oracle-verified against fixtures/captured/
//   compile-engines.json (every pin, both styles):
//   a. BOM: libsass strips a leading U+FEFF from the input; dart preserves
//      it into the output (bootstrap-icons.css pin). -> the input is
//      stripped before compiling.
//   b. Trailing newline: libsass appends "\n" to every NON-empty render in
//      both :compressed and :expanded; dart never does (all 10 corpus
//      pins; the material_icons.css pin proves empty output stays empty -
//      libsass's comment-only file renders ""). -> appended when, and only
//      when, the compiled css is non-empty.
//   c. EVERYTHING ELSE is normalized by the post-compile byte adapter
//      (libsass-byte-parity-adapter.ts): dart canonicalizes numbers (leading
//      zeros stripped/added, trailing zeros and exponents re-formatted),
//      colors (keywords -> hex, hex shortened + lowercased), string escapes
//      (decoded, case lost), attribute-selector quotes (stripped), calc
//      padding (stripped), reorders nothing, and separates hoisted top-level
//      rules with a single newline in :expanded - while libsass 3.6.4
//      preserves the authored token text verbatim and reorders compound
//      selectors into category order. The adapter restores the authored forms
//      from the source (the pipeline holds it) and applies libsass's own
//      conventions; the engine's output is byte-identical on the whole
//      oracle-pinned corpus. The residuals that are NOT recoverable from
//      output bytes are listed in the adapter header; none is reachable
//      from the oracle-pinned corpus.

import { readdirSync, statSync } from "node:fs";
import { compileString, type OutputStyle } from "sass";
import { compile as coffeeCompile } from "coffeescript";
import { adaptDartCssToLibsassBytes } from "./libsass-byte-parity-adapter.js";

/** SassC::Engine style strings (01_css.rb:69-73 style: :compressed,
 *  02_scss.rb:12-14 default :expanded). */
export type SasscStyle = "compressed" | "expanded" | "nested" | "compact";

/** Sass compile failure - Ruby's surface raises Card::Error
 *  (css_compression_error, 01_css.rb:75-85) or Card::Error with a
 *  "SassC::SyntaxError (name:backtrace)" message (02_scss.rb:16-19). The
 *  MESSAGE BYTES diverge (dart's span format differs from libsass's); no
 *  deck-resident source exercises the failing path, so the error surface is
 *  pinned as a THROW, not as bytes (compile-engines-pin.test.ts). */
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

/** libsass appends "\n" to every non-empty render (oracle-verified on all 10
 *  corpus pins in BOTH styles); dart never emits it. material_icons.css - a
 *  comment-only file - proves the empty case stays empty (oracle ""). */
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
 *  ignores its _style param: BOTH arms run style :compressed (the dead-param
 *  quirk, deck-proven by the identical :compiled/:compressed bytes on the
 *  smoothness card). */
export function compressCss(input: string): string {
  return sasscRender(input, "compressed");
}

/** 02_scss.rb:12-19 compile_scss - style :expanded default (the css-format
 *  :compiled view on Scss cards, 02_scss.rb:3-6). The error rescue's
 *  "SassC::SyntaxError (name:backtrace)" message bytes are not deck-pinned
 *  (no deck-resident failing source); failures throw SasscCompileError. */
export function compileScss(scss: string, style: "expanded" | "compressed" = "expanded"): string {
  return sasscRender(scss, style);
}

/** 02_coffee_script.rb:20-22 compile_coffee - `CoffeeScript.compile script,
 *  no_wrap: bare_compile` (bare_compile false outside the html format,
 *  :16-18). BYTE-EXACT against the oracle: the npm coffeescript@1.12.2
 *  package is the same compiler the deck's coffee-script-source 1.12.2 gem
 *  ships (the Ruby wrapper maps no_wrap: to {bare:}). */
export function compileCoffeeScript(script: string, noWrap: boolean): string {
  return coffeeCompile(script, { bare: noWrap });
}

/** 00_script.rb:9-12 the js-format :compressed view = comment_with_source
 *  (20-22) over compress (_render_core) (:25-27). Under the deck's
 *  compress_assets=false the compress is IDENTITY - the byte shape the
 *  oracle deck's scripts carry. compressAssets=true is the Uglifier
 *  (harmony) arm: no equivalent is installed and none was added - this port
 *  throws rather than silently returning unminified bytes. */
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
  // Ruby's Dir.glob sorts its results; the sort is codepoint order for the
  // corpus' ASCII paths (JS default sort is UTF-16 code-unit order).
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
