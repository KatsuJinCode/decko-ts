// Register entry 27 (card-mod-script): the js :compressed view.
//
// PROOF SHAPE. The bytes are the gem's own. The committed capture script
// tests/card/mod-loader/oracle-capture-script-compressed.rb slices the
// `format :js do` block out of card-mod-script-0.20.0
// set/abstract/00_script.rb, class_eval's it on a harness that supplies only
// what the block reads from outside itself (the card name, _render_core,
// and a Cardio.config.compress_assets stub), and runs the view body over the
// cases in fixtures/script-compressed-cases.json. compress /
// try_compress / comment_with_source / compression_error_message are the
// gem's methods, not a transcription of them. Ruby 3.4 with uglifier-4.2.1
// from C:/localProjects/decko-ruby-oracle-gems produced
// fixtures/script-compressed-oracle.json.
//
// The port answers the same view under the same engine seams
// (RenderEngine#compressAssets / #scriptCompressor), and the test drives
// both arms plus the failure path.
//
// 00_script.rb line map, read this session:
//   :9-12  view :compressed -> compress(_render_core) then comment_with_source
//   :14-16 comment_with_source -> "// #{card.name}\n#{js}"
//   :18-20 compress -> compress? ? try_compress(input) : input
//   :22-30 try_compress -> Uglifier.new(harmony: true).compile(input)
//   :32-38 compression_error_message -> Card::Error.current.message, else
//          "JavaScript::SyntaxError (#{name}): #{e.message}"
//   :40-42 compress? -> Cardio.config.compress_assets
// card-1.110.0 config/environments/development.rb:11 sets compress_assets
// false; lib/cardio/railtie.rb:35 sets it true. An absent engine seam is
// the development value.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ModLoader } from "../../../src/card/mod-loader.js";
import cardModScript from "../../../src/card/mod-loader/mods/card-mod-script.js";
import { ScriptCompressionError } from "../../../src/card/assets/script-compressor.js";
import {
  uglifyHarmonyCompile,
  uglifyHarmonyRawError,
} from "../../../src/card/assets/uglify-harmony-compile-engine.js";
import {
  bindModLoaderToEngine,
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../render/render-test-storage.js";

interface OracleRow {
  name: string;
  card_name: string;
  core: string;
  compress_assets: boolean;
  value?: string;
  error?: string;
}

const ORACLE: OracleRow[] = JSON.parse(
  readFileSync(new URL("fixtures/script-compressed-oracle.json", import.meta.url), "utf8"),
);

/** The Node host's compressor: Uglifier(harmony) over the core, and a parse
 *  failure thrown with the RAW Uglifier diagnostic as its message - the
 *  exact bytes Ruby's `Uglifier.new(harmony: true).compile` raises with,
 *  ANSI source excerpt included, because 00_script.rb:36 interpolates
 *  `e.message` raw. (The save-validate path reads the same e.message through
 *  Cardio::Utils.ansi2html instead - type/java_script.rb:8 - which is the
 *  other spelling, uglifyHarmonySyntaxError.) The engine exports the parse
 *  and the compile separately; a host composes them; this is that
 *  composition. */
const hostCompressor = (js: string): string => {
  const diagnostic = uglifyHarmonyRawError(js);
  if (diagnostic !== undefined) throw new Error(diagnostic);
  return uglifyHarmonyCompile(js);
};

describe("script register entry 27: the js :compressed view matches Ruby", () => {
  let storage: RenderTestStorage;
  let loader: ModLoader;

  beforeAll(async () => {
    storage = await createRenderTestStorage();
    await seedCard(storage, { id: 44, name: "JavaScript", codename: "java_script", typeId: 44 });
    await seedCard(storage, { id: 45, name: "CoffeeScript", codename: "coffee_script", typeId: 45 });
    await seedCard(storage, { id: 50, name: "*script", codename: "script", typeId: 40 });
    await seedCard(storage, { id: 40, name: "Set", codename: "set", typeId: 40 });
    await seedCard(storage, { id: 41, name: "Setting", codename: "setting", typeId: 41 });
    await seedCard(storage, { id: 10, name: "*all", codename: "all", typeId: 40 });
    loader = new ModLoader([{ manifest: cardModScript }]);
    loader.load();
    bindModLoaderToEngine(storage, loader);
  });
  afterAll(async () => {
    loader?.reset();
    await storage?.close();
  });

  for (const row of ORACLE) {
    it(`${row.name}: the gem's own view body over the same core`, async () => {
      const id = 600 + ORACLE.indexOf(row);
      await seedCard(storage, { id, name: row.card_name, typeId: 44, dbContent: row.core });
      // compress? -> Cardio.config.compress_assets (00_script.rb:40-42)
      storage.engine.compressAssets = () => row.compress_assets;
      storage.engine.scriptCompressor = hostCompressor;
      if (row.error !== undefined) {
        let thrown: unknown;
        try {
          await storage.engine.renderRaw(row.card_name, "compressed", { format: "js" });
        } catch (e) {
          thrown = e;
        }
        // compression_error_message (00_script.rb:32-38), else branch:
        // Card::Error.current is unset mid-render, so the message is
        // "JavaScript::SyntaxError (<name>): <uglifier message>".
        expect(thrown).toBeInstanceOf(ScriptCompressionError);
        expect((thrown as Error).message).toBe(row.error);
        return;
      }
      expect(await storage.engine.renderRaw(row.card_name, "compressed", { format: "js" })).toBe(row.value);
    });
  }

  it("compress_assets off takes Ruby's identity arm with no compressor needed", async () => {
    await seedCard(storage, { id: 700, name: "off.js", typeId: 44, dbContent: "var x = 1;\n" });
    storage.engine.compressAssets = () => false;
    storage.engine.scriptCompressor = undefined;
    expect(await storage.engine.renderRaw("off.js", "compressed", { format: "js" })).toBe(
      "// off.js\nvar x = 1;\n",
    );
  });

  it("an absent compressAssets seam is the development value (identity arm)", async () => {
    await seedCard(storage, { id: 701, name: "absent.js", typeId: 44, dbContent: "var y = 2;\n" });
    storage.engine.compressAssets = undefined;
    storage.engine.scriptCompressor = undefined;
    expect(await storage.engine.renderRaw("absent.js", "compressed", { format: "js" })).toBe(
      "// absent.js\nvar y = 2;\n",
    );
  });

  it("compress_assets on with no compressor raises the named error, never unminified bytes", async () => {
    await seedCard(storage, { id: 702, name: "nocomp.js", typeId: 44, dbContent: "var z = 3;\n" });
    storage.engine.compressAssets = () => true;
    storage.engine.scriptCompressor = undefined;
    await expect(storage.engine.renderRaw("nocomp.js", "compressed", { format: "js" })).rejects.toThrow(
      /script compressor configured/,
    );
  });

  it("the registration is js-format scoped: the html :core of a java_script card is untouched", async () => {
    await seedCard(storage, { id: 703, name: "scoped.js", typeId: 44, dbContent: "var w = 4;\n" });
    storage.engine.compressAssets = () => true;
    storage.engine.scriptCompressor = hostCompressor;
    // :compressed under html is NOT registered - the js registration does
    // not answer for the html format (render.ts computeResolvedView keeps
    // the format arms apart).
    await expect(storage.engine.renderRaw("scoped.js", "compressed", { format: "html" })).rejects.toThrow(
      /not supported/,
    );
  });

  it("the view is registered on abstract/00_script under the js format, not flat", () => {
    const scriptModule = cardModScript.setModules!.find((m) => m.setPath === "abstract/00_script")!;
    const jsViews = scriptModule.formats?.js?.views ?? [];
    expect(jsViews.map((v) => v.view)).toEqual(["compressed"]);
    // no other set module declares a js-format view
    for (const m of cardModScript.setModules!) {
      if (m.setPath === "abstract/00_script") continue;
      expect(m.formats?.js).toBeUndefined();
    }
  });
});