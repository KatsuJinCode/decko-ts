// ORACLE-PINNED byte-compares for the compile-engines substrate: the SassC
// compile path, the CoffeeScript compile, and the mod asset-dir walk. The
// oracle bytes are fixtures/captured/compile-engines.json, captured inside
// the live decko-0.20.0 oracle app (tools/oracle/decko-oracle-app relative
// to REPO_ROOT/decko-ts) by
// tests/card/mod-loader/oracle-capture-compile-engines.rb, with the in-run
// no-write proof card_actions 5018 -> 5018 (no_write_proof.unchanged).
//
// Sources are the REAL mod asset files the deck's stylesheets/scripts are
// built from (card-mod-bootstrap/style/account/format gem assets); card-level
// pins run the deck's own view methods on the virtual mod-asset group item
// cards. Compile-surface ground truth:
// - card-mod-style-0.20.0 set/abstract/01_css.rb:63-70 compress +
//   compile:
//   BOTH compress? arms run SassC style :compressed - compile's _style
//   param is dead (the gem source's own comment at :68 notes the ignored
//   "nested" argument). Deck-proven on
//   jquery_ui_smoothness.css: render_compiled == render_compressed.
// - card-mod-style set/abstract/02_scss.rb:12-19 compile_scss: style
//   :expanded default; and :27-29 the scss :core is the UNcompiled
//   process_content pass-through (deck-proven: render_core == source).
// - card-mod-script set/abstract/02_coffee_script.rb:20-22 compile_coffee:
//   CoffeeScript.compile script, no_wrap: bare_compile (false outside html).
// - card-mod-script set/abstract/00_script.rb:9-12+20-22+25-27: the js
//   :compressed view = "// <card name>\n" + (compress? identity under the
//   deck's compress_assets=false).
// - card-mod-assets set/abstract/asset_group.rb:15-18 item_cards ->
//   relative_paths -> new_asset_file_card (name = basename, content =
//   relative path, type by extension); folder_group.rb relative_paths =
//   Dir.chdir(assets_path) { Dir.glob("**/*.{exts}") }; local_manifest_group.rb
//   relative_paths = manifest_group_items (mod_assets.rb:75-77).
//
// DEPENDENCY DISCLOSURE (pinned exact in package.json):
// - coffeescript@1.12.2 - the SAME compiler version the oracle deck runs
//   (coffee-script-source 1.12.2 via the coffee-script 2.4.1 gem wrapper,
//   which normalizes no_wrap: to {bare:} and calls the identical JS
//   compiler). Capture-verified byte-exact on every corpus source, both
//   no_wrap arms.
// - The Sass compile is the REAL LibSass 3.6.4 program (tools/libsass,
//   built from the sassc 2.4.0 gem's bundled source), so its output is the
//   deck's SassC render byte for byte; no normalization layer runs. An earlier
//   version compiled with Dart Sass and rewrote the output toward LibSass's
//   conventions; the class catalogue below names the mechanisms such a
//   rewrite had to cover, and every pin here now matches without one.

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { ensureLibsassProgram } from "../../../tests/support/libsass-program.js";
import { describeOrSkipLoud } from "../../../tests/support/describe-with-corpus.js";
import {
  compressCss,
  compileCoffeeScript,
  compileScss,
  folderGroupRelativePaths,
  manifestGroupItems,
  sasscRender,
  scriptAssetConstants,
  scriptCompressedView,
  styleAssetConstants,
} from "../../../src/card/mod-loader/sassc-coffeescript-compile-engines.js";

const FIXTURE = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL("../../../fixtures/captured/compile-engines.json", import.meta.url),
    ),
    "utf8",
  ),
) as {
  engine_versions: {
    sassc: string;
    coffee_compiler: string | null;
    compress_assets: boolean | null;
  };
  compile_pins: Array<{
    mod: string;
    relative_path: string;
    kind: string;
    source: string;
    sassc_compressed?: string;
    sassc_expanded?: string;
    coffee_no_wrap_false?: string;
    coffee_no_wrap_true?: string;
  }>;
  card_level_pins: Record<
    string,
    {
      item_type_code?: string;
      item_db_content?: string;
      render_core?: string;
      render_compressed?: string;
      render_compiled?: string;
      error?: string;
    }
  >;
  asset_walk: Record<
    string,
    Record<
      string,
      {
        assets_path: string | null;
        manifest_exists: boolean | null;
        manifest_group_items: Record<string, { items: string[] }> | null;
        groups: Array<{
          group_name: string;
          base_path: string | null;
          relative_paths: string[];
          items: Array<{ name: string; type_code: string | null; content: string }>;
        }>;
      }
    >
  >;
  no_write_proof: { actions_before: number; actions_after: number; unchanged: boolean };
};

function pin(rel: string) {
  const p = FIXTURE.compile_pins.find((x) => x.relative_path === rel);
  if (p === undefined) throw new Error(`pin missing from fixture: ${rel}`);
  return p;
}

// The corpus pins whose oracle bytes exercise the divergence classes
// (number canonicalization, escape decoding, attribute quotes, BOM,
// blank-line separation) between a canonicalizing compiler and LibSass's
// authored-text-preserving one. Each entry names the mechanism; the real
// LibSass program gets every one of them right by construction, so these
// pins assert byte equality through the full pipeline.
const DISCLOSED_SASS_DIVERGENCES: Record<string, string> = {
  "jquery_ui_smoothness.css":
    "dart :compressed re-canonicalizes numbers and colors (e.g. authored '-.25em' -> '-0.25em', 'black' -> '#000'); libsass preserves the authored token",
  "bootstrap-icons.css":
    "dart :compressed decodes string escapes (1200+ content glyphs), strips attribute-selector quotes and re-adds a BOM across the corpus' largest stylesheet; libsass preserves the authored bytes",
  "account.scss":
    "dart :expanded single-newlines hoisted top-level rules (plus :compressed decimal stripping); libsass blank-lines every top-level node",
};

describe("compile-engines oracle fixture integrity", () => {
  it("capture ran write-free against the live deck", () => {
    const proof = FIXTURE.no_write_proof;
    expect(proof.unchanged).toBe(true);
    expect(proof.actions_before).toBe(proof.actions_after);
  });

  it("oracle engine state: SassC 2.4.0, CoffeeScript compiler 1.12.2, compress_assets=false", () => {
    expect(FIXTURE.engine_versions.sassc).toBe("2.4.0");
    expect(FIXTURE.engine_versions.coffee_compiler).toBe("1.12.2");
    expect(FIXTURE.engine_versions.compress_assets).toBe(false);
  });
});

describe("CoffeeScript compile (02_coffee_script.rb:20-22) - byte-exact pins", () => {
  const coffeePins = FIXTURE.compile_pins.filter((p) => p.kind === "coffee");

  it("every corpus coffee source compiles byte-identically in the no_wrap:false arm", () => {
    expect(coffeePins.length).toBeGreaterThan(0);
    for (const p of coffeePins) {
      expect(p.coffee_no_wrap_false, p.relative_path).toBeDefined();
      expect(
        compileCoffeeScript(p.source, false),
        `decko_modal-class corpus source ${p.relative_path}`,
      ).toBe(p.coffee_no_wrap_false);
    }
  });

  it("every corpus coffee source compiles byte-identically in the no_wrap:true arm", () => {
    for (const p of coffeePins) {
      expect(p.coffee_no_wrap_true, p.relative_path).toBeDefined();
      expect(compileCoffeeScript(p.source, true), p.relative_path).toBe(
        p.coffee_no_wrap_true,
      );
    }
  });

  it("card-level: the js :compressed view = comment_with_source over the coffee :core (identity compress under compress_assets=false)", () => {
    const cardPins: Array<[string, string]> = [
      ["bootstrap+*script+bootstrap+decko_modal.js.coffee", "decko_modal.js.coffee"],
      ["bootstrap+*script+bootstrap+decko_popover.js.coffee", "decko_popover.js.coffee"],
      ["account+*script+local+toggle_visibility.js.coffee", "toggle_visibility.js.coffee"],
    ];
    for (const [key, name] of cardPins) {
      const pinData = FIXTURE.card_level_pins[key];
      expect(pinData?.render_compressed, key).toBeDefined();
      const source = pin(key.split("+").pop() as string).source;
      expect(
        scriptCompressedView(name, compileCoffeeScript(source, false), false),
        key,
      ).toBe(pinData.render_compressed);
    }
  });

  it("card-level: plain JavaScript leaves are the identity compress over the raw file (00_script.rb:25-27)", () => {
    const key = "format+*script+jquery+jquery/jquery.autosize.js";
    const pinData = FIXTURE.card_level_pins[key];
    expect(pinData?.render_compressed, key).toBeDefined();
    expect(pinData?.render_core, key).toBeDefined();
    const source = pin("jquery/jquery.autosize.js").source;
    expect(scriptCompressedView("jquery.autosize.js", source, false), key).toBe(
      pinData.render_compressed,
    );
    // the js :core is _render_raw (01_java_script.rb:6-8)
    expect(source).toBe(pinData.render_core);
  });
});

describe("SassC compile (01_css.rb compress/compile, 02_scss.rb compile_scss)", () => {
  beforeAll(() => {
    // the compile seam runs the real LibSass 3.6.4 program
    ensureLibsassProgram();
  }, 600_000);
  it("css/scss :compressed - GREEN on sources free of the disclosed divergence classes", () => {
    const green = ["decko_bootstrap.scss", "jquery_ui_decko.scss", "material_icons.css"];
    for (const rel of green) {
      const p = pin(rel);
      expect(p.sassc_compressed, rel).toBeDefined();
      expect(sasscRender(p.source, "compressed"), rel).toBe(p.sassc_compressed);
    }
  });

  it("css/scss :compressed - every pin through the real LibSass program (byte-exact)", () => {
    for (const [rel, mechanism] of Object.entries(DISCLOSED_SASS_DIVERGENCES)) {
      const p = pin(rel);
      expect(p.sassc_compressed, rel).toBeDefined();
      const compiled = sasscRender(p.source, "compressed");
      // The program IS libsass 3.6.4, the engine sassc 2.4.0 drives, so the
      // bytes must match; DISCLOSED_SASS_DIVERGENCES names the mechanisms that
      // used to be normalized by hand and now need no normalization.
      expect(compiled, `${rel}: ${mechanism}`).toBe(p.sassc_compressed);
    }
  });

  it("scss :expanded (compile_scss default, 02_scss.rb:12-14) - GREEN where free of the divergence classes", () => {
    const green = ["decko_bootstrap.scss", "jquery_ui_decko.scss"];
    for (const rel of green) {
      const p = pin(rel);
      expect(p.sassc_expanded, rel).toBeDefined();
      expect(compileScss(p.source), rel).toBe(p.sassc_expanded);
    }
  });

  it("scss :expanded - blank-line separation pin through the real LibSass program (byte-exact)", () => {
    const mechanism = DISCLOSED_SASS_DIVERGENCES["account.scss"] as string;
    const p = pin("account.scss");
    expect(compileScss(p.source), `account.scss: ${mechanism}`).toBe(p.sassc_expanded);
  });

  it("the compress quirk: compressCss compiles BOTH compress? arms to style :compressed (the dead _style param)", () => {
    // Sources chosen free of the divergence classes so this pin isolates the
    // QUIRK (the arms' byte-identity), not the compiler divergence (covered
    // by the pins above). smoothness's quirk
    // proof deck-side is the :compiled == :compressed equality pin below.
    for (const rel of ["decko_bootstrap.scss", "jquery_ui_decko.scss", "material_icons.css"]) {
      const p = pin(rel);
      expect(p.sassc_compressed, rel).toBeDefined();
      // compressCss takes no compress? flag: the Ruby method ignores it
      // (compile's _style is dead), so the port has one output either way.
      expect(compressCss(p.source), rel).toBe(p.sassc_compressed);
    }
  });

  it("deck-proven quirk pair: the smoothness card's :compiled and :compressed oracle bytes are IDENTICAL (01_css.rb:52-58)", () => {
    const pinData = FIXTURE.card_level_pins["style+*style+local+jquery_ui_smoothness.css"];
    expect(pinData.render_compiled).toBeDefined();
    expect(pinData.render_compressed).toBeDefined();
    expect(pinData.render_compiled).toBe(pinData.render_compressed);
  });

  it("deck-proven pass-through: the scss :core is the UNcompiled process_content raw (02_scss.rb:27-29)", () => {
    const pinData = FIXTURE.card_level_pins["bootstrap+*style+bootstrap_decko+decko_bootstrap.scss"];
    const p = pin("decko_bootstrap.scss");
    expect(pinData.render_core).toBeDefined();
    expect(pinData.render_core).toBe(p.source);
  });

  it("card-level css/scss renders on nest-free sources pin through the ported compile path", () => {
    // decko_bootstrap.scss has no [[...]] nests, so the deck's _render_core
    // input IS the file source and the card-level renders must equal the
    // direct compile of that source.
    const p = pin("decko_bootstrap.scss");
    const pinData = FIXTURE.card_level_pins["bootstrap+*style+bootstrap_decko+decko_bootstrap.scss"];
    expect(compressCss(p.source)).toBe(pinData.render_compressed);
    expect(compileScss(p.source)).toBe(pinData.render_compiled);
  });

  it("error surface: the corpus source libsass rejects standalone throws in the port too (bootstrap_colorpicker.scss)", () => {
    const p = pin("bootstrap_colorpicker.scss");
    expect(p.sassc_compressed?.startsWith("CAPTURE_ERROR")).toBe(true);
    // Oracle: "CAPTURE_ERROR: SassC::SyntaxError: Error: Undefined variable:
    // \"$white\"." - a real deck asset that only compiles inside the skin
    // compile where bootstrap's variables exist. The byte-level error MESSAGES
    // differ between compilers - not deck-pinned (no deck-resident source
    // renders this error), so the pin is the THROW itself.
    expect(() => sasscRender(p.source, "compressed")).toThrow();
    expect(() => compileScss(p.source)).toThrow();
  });
});

// The asset-walk describe pins Dir.glob semantics LIVE against the gem
// directories the capture recorded: fixtures/captured/compile-engines.json
// stores the oracle machine's absolute assets_path values (C:/Ruby33-x64/...)
// and the walk runs against those directories on disk. On a machine without
// them the walk returns [] and every recorded relative_paths list fails —
// a portability failure, not a divergence. Skip loudly instead: the fixture
// records a machine-specific compile verification, and the byte-level
// compile pins above carry the portable half of the guarantee.
const RECORDED_GEM_DIRS = [
  ...new Set(
    Object.values(FIXTURE.asset_walk)
      .flatMap((byKind) => Object.values(byKind))
      .flatMap((walk) => [walk.assets_path, ...walk.groups.map((g) => g.base_path)])
      .filter((p): p is string => typeof p === "string" && p.length > 0),
  ),
];
const GEM_DIRS_PRESENT = RECORDED_GEM_DIRS.every((p) => existsSync(p));

describeOrSkipLoud(
  !GEM_DIRS_PRESENT,
  "tests/card/mod-loader/compile-engines-pin.test.ts (mod asset-dir walk)",
  `the fixture's recorded gem directories are present on this machine (${RECORDED_GEM_DIRS.join(", ")}) — the fixture records a machine-specific compile verification: its absolute assets_path values point at the oracle machine's Ruby gem tree, and the walk is pinned live against them`,
)("mod asset-dir walk (asset_group.rb relative_paths)", () => {
  it("folder-group walk: Dir.glob('**/*.{exts}') semantics pinned live against the recorded gem dirs", () => {
    const styleWalk = FIXTURE.asset_walk["style"]?.["style"];
    expect(styleWalk?.assets_path).toBeDefined();
    expect(
      folderGroupRelativePaths(styleWalk.assets_path as string, ["css", "scss"]),
    ).toEqual(styleWalk?.groups[0]?.relative_paths);

    const accountStyle = FIXTURE.asset_walk["account"]?.["style"];
    expect(accountStyle?.assets_path).toBeDefined();
    expect(
      folderGroupRelativePaths(accountStyle.assets_path as string, ["css", "scss"]),
    ).toEqual(accountStyle?.groups[0]?.relative_paths);

    const accountScript = FIXTURE.asset_walk["account"]?.["script"];
    expect(accountScript?.assets_path).toBeDefined();
    expect(
      folderGroupRelativePaths(accountScript.assets_path as string, ["js", "coffee"]),
    ).toEqual(accountScript?.groups[0]?.relative_paths);
  });

  it("folder-group walk: the empty-directory and missing-directory arms return [] (folder_group.rb return [] unless assets_path)", () => {
    expect(folderGroupRelativePaths(undefined, ["css", "scss"])).toEqual([]);
    expect(folderGroupRelativePaths("Z:/definitely/not/a/dir", ["css", "scss"])).toEqual([]);
  });

  it("manifest-group walk: manifest_group_items resolves each group's item list verbatim", () => {
    const scriptWalk = FIXTURE.asset_walk["bootstrap"]?.["script"];
    expect(scriptWalk?.manifest_exists).toBe(true);
    const manifest = scriptWalk?.manifest_group_items;
    expect(manifest).toBeDefined();
    const bootstrapGroup = scriptWalk?.groups.find((g) => g.group_name === "bootstrap");
    expect(bootstrapGroup?.relative_paths.length).toBeGreaterThan(0);
    expect(manifestGroupItems(manifest as Record<string, { items?: string[] }>, "bootstrap")).toEqual(
      bootstrapGroup?.relative_paths,
    );
    expect(manifestGroupItems(manifest as Record<string, { items?: string[] }>, "remote")).toEqual([]);

    // card-mod-format's script assets carry TWO manifest groups (jquery, decko);
    // each group's walk output must equal its manifest item list.
    const formatWalk = FIXTURE.asset_walk["format"]?.["script"];
    expect(formatWalk?.manifest_exists).toBe(true);
    const formatManifest = formatWalk?.manifest_group_items;
    for (const group of formatWalk?.groups ?? []) {
      expect(
        manifestGroupItems(formatManifest as Record<string, { items?: string[] }>, group.group_name),
        group.group_name,
      ).toEqual(group.relative_paths);
    }
  });

  it("asset file constants: extension -> type codename + set module (style_group.rb / script_group.rb new_asset_constants)", () => {
    expect(styleAssetConstants("decko_bootstrap.scss")).toEqual({
      typeCode: "scss",
      setModule: "Abstract::AssetScss",
    });
    expect(styleAssetConstants("bootstrap-icons.css")).toEqual({
      typeCode: "css",
      setModule: "Abstract::AssetCss",
    });
    expect(styleAssetConstants("README.md")).toBeUndefined();
    expect(scriptAssetConstants("decko_modal.js.coffee")).toEqual({
      typeCode: "coffee_script",
      setModule: "Abstract::AssetCoffeeScript",
    });
    expect(scriptAssetConstants("bootstrap.bundle.js")).toEqual({
      typeCode: "java_script",
      setModule: "Abstract::AssetJavaScript",
    });
    expect(scriptAssetConstants("notes.txt")).toBeUndefined();
  });

  it("walk decomposition: every recorded group item's type resolves from its relative path", () => {
    for (const [mod, byTag] of Object.entries(FIXTURE.asset_walk)) {
      for (const [tag, walk] of Object.entries(byTag)) {
        for (const group of walk.groups) {
          for (const item of group.items) {
            const constants =
              tag === "style"
                ? styleAssetConstants(item.content)
                : scriptAssetConstants(item.content);
            expect(
              item.type_code,
              `${mod}+*${tag}+${group.group_name} item ${item.name} (${item.content})`,
            ).toBe(constants === undefined ? null : constants.typeCode);
          }
        }
      }
    }
  });
});
