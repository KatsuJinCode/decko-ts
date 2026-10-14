// The site script and the script asset inputs it is built from, against the
// Ruby oracle.
//
// Fixture: tests/card/assets/fixtures/site-script-oracle.json, written from
// tools/oracle/site-script-probe.rb run against the oracle deck (and copied
// into fixtures/vendor/mod-script-assets/ by
// tools/oracle/vendor-script-sources.mjs): for every *all+*script item, its
// asset groups, the sha256 of each leaf's file content and of the leaf's js
// :compressed render, and the sha256 and length of the item's assembled
// asset input; plus the sha256 of the whole assembled input.
//
//   1. the sources: the vendored mod script files read as Ruby reads them;
//   2. assembly: every mod script card's asset input equals Ruby's, byte for
//      byte, and so does the whole *all+*script input;
//   3. the write path: creating a JavaScript card stores its asset input;
//      saving *all+*script stores the site script file and every mod script
//      card's input; editing the card rebuilds the file with its new chunk;
//      deleting it rebuilds the file without it (the delete-side
//      asset_input_changed_on_delete); without the CoffeeScript compiler the
//      saves that would need it are refused with a named error;
//   4. compress_assets: every mod script card's minified asset input equals
//      the one production Ruby stores (the scenario battery's committed
//      production recording), and without a compressor the saves that would
//      need it are refused with a named error.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assembleModScriptInput,
  assembleScriptInput,
  SCRIPT_INPUTTER_TYPES,
} from "../../../src/card/assets/site-script.js";
import { StyleAssetUnsupportedError, type StyleAssetDeps, type StyleCard } from "../../../src/card/assets/skin-stylesheet.js";
import { modScriptFileContent, modScriptGroups, scriptSourcesAvailable } from "../../../src/card/assets/script-sources.js";
import { coffeeNpmCompiler } from "../../../src/server/coffee-npm-compiler.js";
import { uglifyHarmonyCompile } from "../../../src/card/assets/uglify-harmony-compile-engine.js";
import { ScriptCompressionError } from "../../../src/card/assets/script-compressor.js";
import { DeckoName } from "../../../src/card/name.js";
import { ActWriter, cardFieldStateFromRow } from "../../../src/card/history/write-path.js";
import { LocalAttachmentStore } from "../../../src/card/attachments/attachment-store.js";
import { VirtualRecordCache } from "../../../src/card/mod-loader/mods/card-mod-virtual.js";
import { newCardRecord } from "../../../src/card/fetch/card-record.js";
import { assertStyleCompilerFor, runStyleAssetEvents, type SavedCard } from "../../../src/card/actions/style-asset-events.js";
import { CardActionError } from "../../../src/card/actions/types.js";
import type { CardsRow } from "../../../src/server/schema.js";
import { createRenderTestStorage, seedCard, type RenderTestStorage } from "../render/render-test-storage.js";

interface Digest {
  sha256: string;
  length: number;
}
interface OracleLeaf {
  name: string;
  type: string;
  content_sha256: string;
  compressed_sha256: string;
  compressed_length: number;
}
interface OracleItem {
  name: string;
  assembled: Digest;
  groups: { name: string; leaves: OracleLeaf[] }[];
}
const ORACLE = JSON.parse(
  readFileSync(join(fileURLToPath(new URL(".", import.meta.url)), "fixtures", "site-script-oracle.json"), "utf8"),
) as { whole: Digest; items: OracleItem[] };

const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const digest = (text: string): Digest => ({ sha256: sha256(text), length: text.length });
const compileCoffee = coffeeNpmCompiler();
const assemblyDeps = (): StyleAssetDeps => ({
  card: async () => undefined,
  cardByCodename: async () => undefined,
  compile: undefined,
  compileCoffee,
});
const scriptCard = (name: string, typeCode?: string, dbContent = ""): StyleCard => ({
  id: 1,
  name,
  key: DeckoName.parse(name).key,
  typeCode,
  codename: undefined,
  dbContent,
  leftId: undefined,
  rightId: undefined,
});

describe("the site script's vendored sources and assembly (against Ruby)", () => {
  it("the vendored tree is present (a host without it refuses script rebuilds)", () => {
    expect(scriptSourcesAvailable()).toBe(true);
  });

  it("every leaf's compressed render — CoffeeScript compiled where the file is CoffeeScript", () => {
    for (const item of ORACLE.items) {
      const modName = item.name.replace(/^mod: /, "").replace(/\+\*script$/, "").replace(/ /g, "_");
      const groups = modScriptGroups(modName);
      expect(groups, item.name).toBeDefined();
      const leaves = groups!.flatMap((g) => g.files);
      const oracleLeaves = item.groups.flatMap((g) => g.leaves);
      expect(leaves.map((l) => l.name), item.name).toEqual(oracleLeaves.map((l) => l.name));
      for (const [leafIndex, file] of leaves.entries()) {
        const want = oracleLeaves[leafIndex]!;
        expect(file.sha256, file.name).toBe(want.content_sha256);
        const chunk = `// ${file.name}\n${
          file.type === "coffee_script" ? compileCoffee(modScriptFileContent(file), false) : modScriptFileContent(file)
        }`;
        expect(digest(chunk), file.name).toEqual({ sha256: want.compressed_sha256, length: want.compressed_length });
      }
    }
  });

  for (const item of ORACLE.items) {
    it(`${item.name} assembles Ruby's asset input, byte for byte`, () => {
      const assembled = assembleModScriptInput(assemblyDeps(), scriptCard(item.name));
      expect(digest(assembled ?? "")).toEqual(item.assembled);
    });
  }

  it("the whole *all+*script assembled input is Ruby's", () => {
    const whole = ORACLE.items
      .map((item) => assembleModScriptInput(assemblyDeps(), scriptCard(item.name)))
      .join("\n");
    expect(digest(whole)).toEqual(ORACLE.whole);
  });

  it("a JavaScript card's input is its commented content, a CoffeeScript card's its compiled chunk", () => {
    expect(assembleScriptInput(assemblyDeps(), scriptCard("Probe Script", "java_script", "window.p = 1;\n"))).toBe(
      "// Probe Script\nwindow.p = 1;\n",
    );
    expect(assembleScriptInput(assemblyDeps(), scriptCard("Probe Coffee", "coffee_script", "window.p = 1\n"))).toBe(
      `// Probe Coffee\n${compileCoffee("window.p = 1\n", false)}`,
    );
    expect(assembleScriptInput(assemblyDeps(), scriptCard("Probe", "basic", "x"))).toBeUndefined();
  });

  it("assembling a CoffeeScript chunk without the compiler is refused with a named error", () => {
    const noCoffee: StyleAssetDeps = { ...assemblyDeps(), compileCoffee: undefined };
    expect(() =>
      assembleScriptInput(noCoffee, scriptCard("Probe Coffee", "coffee_script", "window.p = 1\n")),
    ).toThrow(StyleAssetUnsupportedError);
    expect(() =>
      assembleScriptInput(noCoffee, scriptCard("Probe Coffee", "coffee_script", "window.p = 1\n")),
    ).toThrow(/coffeeCompiler/);
  });

  it("the script inputter types are the Abstract::Script types", () => {
    expect([...SCRIPT_INPUTTER_TYPES].sort()).toEqual(["coffee_script", "java_script"]);
  });
});

// ---------------------------------------------------------------------------
// compress_assets
// ---------------------------------------------------------------------------
//
// A deployed site runs compress_assets true (card-1.110.0
// lib/cardio/railtie.rb:35): every script leaf's :compressed render is
// comment_with_source over Uglifier(harmony) (card-mod-script
// 00_script.rb:9-27). The Ruby side of the comparison is the scenario
// battery's committed production recording: its first request
// (get-home) re-stores every mod script card's asset input minified, and the
// trace records each stored input's length and sha256.

const BATTERY_TRACE = join(
  fileURLToPath(new URL("../../../", import.meta.url)),
  "reference-harness", "fixtures", "write-battery-v1", "expected", "side-effects-ruby.json",
);
const compressingDeps = (): StyleAssetDeps => ({
  ...assemblyDeps(),
  compressAssets: true,
  compressScript: uglifyHarmonyCompile,
});

describe("compress_assets: the script leaves minified as a deployed site stores them (against Ruby)", () => {
  it("the recording these pins come from ran with compress_assets true", () => {
    const trace = JSON.parse(readFileSync(BATTERY_TRACE, "utf8")) as { environment?: unknown };
    expect(trace.environment).toEqual({ rails_env: "production", asset_refresh: "cautious", compress_assets: true });
  });

  it("every mod script card's minified asset input is the one production Ruby stores", () => {
    const trace = JSON.parse(readFileSync(BATTERY_TRACE, "utf8")) as {
      steps: { step: string; virtuals: { card: string; length: number; sha256: string }[] }[];
    };
    const stored = trace.steps
      .find((s) => s.step === "get-home")!
      .virtuals.filter((v) => /^mod: .+\+\*script\+\*asset input$/.test(v.card));
    expect(stored.length).toBe(15);
    for (const v of stored) {
      const name = v.card.replace(/\+\*asset input$/, "");
      const assembled = assembleModScriptInput(compressingDeps(), scriptCard(name)) ?? "";
      expect({ length: assembled.length, sha256: sha256(assembled) }, name).toEqual({ length: v.length, sha256: v.sha256 });
    }
  }, 60_000);

  it("a JavaScript card's input is its commented, minified content", () => {
    expect(assembleScriptInput(compressingDeps(), scriptCard("Probe Script", "java_script", "window.p = 1;\n"))).toBe(
      "// Probe Script\nwindow.p=1;",
    );
  });

  it("without a compressor, assembling under compress_assets is refused with a named error", () => {
    const noCompressor: StyleAssetDeps = { ...assemblyDeps(), compressAssets: true };
    expect(() => assembleScriptInput(noCompressor, scriptCard("Probe Script", "java_script", "window.p = 1;\n"))).toThrow(
      StyleAssetUnsupportedError,
    );
    expect(() => assembleScriptInput(noCompressor, scriptCard("Probe Script", "java_script", "window.p = 1;\n"))).toThrow(
      /scriptCompressor/,
    );
  });

  it("a leaf Uglifier cannot parse stops with Ruby's JavaScript::SyntaxError message", () => {
    expect(() => assembleScriptInput(compressingDeps(), scriptCard("Broken Script", "java_script", "var = ;\n"))).toThrow(
      ScriptCompressionError,
    );
    expect(() => assembleScriptInput(compressingDeps(), scriptCard("Broken Script", "java_script", "var = ;\n"))).toThrow(
      /^JavaScript::SyntaxError \(Broken Script\): /,
    );
  });
});

// ---------------------------------------------------------------------------
// the write path
// ---------------------------------------------------------------------------

const ADMIN = 900;
const T0 = Date.UTC(2026, 9, 7, 12, 0, 0);
let storage: RenderTestStorage;
let filesDir: string;
let clock = T0;
/** The JavaScript card the create test made; the edit and delete tests
 *  continue with it, as one harness run does. */
let probeCardId = 0;

const ids = {
  set: 10, setting: 11, pointer: 12, list: 13, file: 14, javaScript: 15, mod: 16, basic: 17,
  coffeeScript: 18,
  all: 20, style: 22, script: 21, assetInput: 26, assetOutput: 27,
  recent: 30, modFormat: 34, modFormatScript: 35,
  allScript: 40, allScriptOutput: 41,
};

async function row(id: number): Promise<CardsRow> {
  return (await storage.counting.query<CardsRow>("SELECT * FROM cards WHERE id = ?", [id])).rows[0];
}

function context(coffee: typeof compileCoffee | undefined) {
  return {
    fetch: storage.fetcher,
    clock: () => new Date(clock),
    newWriter: () => new ActWriter({ driver: storage.counting, actorId: ADMIN, now: () => new Date(clock) }),
    expire: async (cardId: number, name: DeckoName) => {
      const record = newCardRecord(name);
      record.id = cardId;
      storage.fetcher.expireCard(record);
    },
    attachmentStore: new LocalAttachmentStore(filesDir),
    compile: undefined,
    compileCoffee: coffee,
    virtuals: new VirtualRecordCache(),
  };
}

async function save(id: number, content: string): Promise<SavedCard> {
  const before = await row(id);
  const state = cardFieldStateFromRow(before);
  const writer = new ActWriter({ driver: storage.counting, actorId: ADMIN, now: () => new Date(clock) });
  const name = (await storage.fetcher.fetchById(id))!.name!;
  const saved = await writer.updateCard({ cardId: id, before: state, after: { ...state, db_content: content } });
  const record = newCardRecord(name);
  record.id = id;
  storage.fetcher.expireCard(record);
  return { cardId: id, actionId: saved!.actionId, verb: "update" as const, contentBefore: before.db_content };
}

async function virtualOf(leftId: number): Promise<string | undefined> {
  return (
    await storage.counting.query<{ content: string }>(
      "SELECT content FROM card_virtuals WHERE left_id = ? AND right_id = ?",
      [leftId, ids.assetInput],
    )
  ).rows[0]?.content;
}

function outputFile(stamp: number): string {
  return join(filesDir, String(ids.allScriptOutput), `${stamp}.js`);
}

async function actionCount(): Promise<number> {
  return Number(
    (await storage.counting.query<{ n: number }>("SELECT COUNT(*) AS n FROM card_actions", [])).rows[0].n,
  );
}

async function seedDeck(): Promise<void> {
  const s = storage;
  const card = (id: number, name: string, typeId: number, extra: Record<string, unknown> = {}) =>
    seedCard(s, { id, name, typeId, ...extra });
  await card(ids.set, "Set", 1, { codename: "set" });
  await card(ids.setting, "Setting", 1, { codename: "setting" });
  await card(ids.pointer, "Pointer", 1, { codename: "pointer" });
  await card(ids.list, "List", 1, { codename: "list" });
  await card(ids.file, "File", 1, { codename: "file" });
  await card(ids.javaScript, "JavaScript", 1, { codename: "java_script" });
  await card(ids.coffeeScript, "CoffeeScript", 1, { codename: "coffee_script" });
  await card(ids.mod, "Mod", 1, { codename: "mod" });
  await card(ids.basic, "Basic", 1, { codename: "basic" });
  await card(ids.all, "*all", ids.set, { codename: "all" });
  await card(ids.script, "*script", ids.setting, { codename: "script" });
  await card(ids.style, "*style", ids.setting, { codename: "style" });
  await card(ids.assetInput, "*asset input", ids.basic, { codename: "asset_input" });
  await card(ids.assetOutput, "*asset output", ids.basic, { codename: "asset_output" });
  await card(ids.recent, "*recent settings", ids.pointer, { codename: "recent_settings", dbContent: "*follow\n*create" });
  await card(ids.modFormat, "mod: format", ids.mod, { codename: "mod_format" });
  await card(ids.modFormatScript, "mod: format+*script", ids.list, {
    leftId: ids.modFormat, rightId: ids.script, dbContent: "",
  });
  await card(ids.allScript, "*all+*script", ids.list, {
    leftId: ids.all, rightId: ids.script, dbContent: "mod: format+*script",
  });
  await card(ids.allScriptOutput, "*all+*script+*asset output", ids.file, {
    leftId: ids.allScript, rightId: ids.assetOutput, dbContent: ":all+:script+:asset_output/defaults.js",
  });
}

describe("script assets on the write path", () => {
  beforeAll(async () => {
    storage = await createRenderTestStorage();
    filesDir = mkdtempSync(join(tmpdir(), "site-script-files-"));
    await seedDeck();
  });
  afterAll(() => {
    storage?.close();
    if (filesDir) rmSync(filesDir, { recursive: true, force: true });
  });

  it("creating a JavaScript card stores its asset input and nothing else", async () => {
    clock = T0 + 1000;
    const writer = new ActWriter({ driver: storage.counting, actorId: ADMIN, now: () => new Date(clock) });
    const created = await writer.createCard({
      name: "Probe Script",
      key: DeckoName.parse("Probe Script").key,
      type_id: ids.javaScript,
      db_content: "window.parityProbe = 1;\n",
    });
    const actionsBefore = await actionCount();
    await runStyleAssetEvents(context(compileCoffee), [
      { cardId: created.cardId, actionId: created.actionId, verb: "create" },
    ]);

    // the asset input: `// <card name>\n` + the content (the
    // comment_with_source wrapper over the identity compress)
    probeCardId = created.cardId;
    expect(await virtualOf(probeCardId)).toBe("// Probe Script\nwindow.parityProbe = 1;\n");
    // the card's create was the only action; the output card untouched
    expect((await actionCount()) - actionsBefore).toBe(0);
    expect((await row(ids.allScriptOutput)).db_content).toBe(":all+:script+:asset_output/defaults.js");
    expect(existsSync(join(filesDir, String(ids.allScriptOutput)))).toBe(false);
  });

  it("saving *all+*script stores the site script file and every mod script input", async () => {
    clock = T0 + 2000;
    // the rule references its items (refresh_references_out of the save)
    await storage.counting.query(
      "INSERT INTO card_references (referer_id, referee_key, referee_id, ref_type) VALUES (?, ?, ?, 'L')",
      [ids.allScript, DeckoName.parse("mod: format+*script").key, ids.modFormatScript],
    );
    const actionsBefore = await actionCount();
    const saved = await save(ids.allScript, "mod: format+*script\nProbe Script");
    await runStyleAssetEvents(context(compileCoffee), [saved]);

    const stamp = Math.floor((T0 + 2000) / 1000);
    const modInput = assembleModScriptInput(assemblyDeps(), scriptCard("mod: format+*script"));
    // the site script: the items' asset inputs joined "\n"
    expect(readFileSync(outputFile(stamp), "utf8")).toBe(`${modInput}\n// Probe Script\nwindow.parityProbe = 1;\n`);
    expect((await row(ids.allScriptOutput)).db_content).toBe(`~${ids.allScriptOutput}/${stamp}.js`);
    // the mod script card's input is stored (card_virtuals), assembled from
    // the vendored files
    expect(await virtualOf(ids.modFormatScript)).toBe(modInput);
    // the output card records no action; the rule's own update is the only one
    expect((await actionCount()) - actionsBefore).toBe(1);
  });

  it("editing the JavaScript card rebuilds the site script with its new chunk", async () => {
    clock = T0 + 3000;
    // the rule references the probe card (the save's reference refresh)
    await storage.counting.query(
      "INSERT INTO card_references (referer_id, referee_key, referee_id, ref_type) VALUES (?, ?, ?, 'L')",
      [ids.allScript, DeckoName.parse("Probe Script").key, probeCardId],
    );
    const saved = await save(probeCardId, "window.parityProbe = 2;\n");
    await runStyleAssetEvents(context(compileCoffee), [saved]);

    const stamp = Math.floor((T0 + 3000) / 1000);
    expect(await virtualOf(probeCardId)).toBe("// Probe Script\nwindow.parityProbe = 2;\n");
    const modInput = assembleModScriptInput(assemblyDeps(), scriptCard("mod: format+*script"));
    expect(readFileSync(outputFile(stamp), "utf8")).toBe(`${modInput}\n// Probe Script\nwindow.parityProbe = 2;\n`);
    expect((await row(ids.allScriptOutput)).db_content).toBe(`~${ids.allScriptOutput}/${stamp}.js`);
  });

  it("deleting the JavaScript card rebuilds the site script without it", async () => {
    clock = T0 + 4000;
    const before = await row(probeCardId);
    const writer = new ActWriter({ driver: storage.counting, actorId: ADMIN, now: () => new Date(clock) });
    const trashed = await writer.trashCard({ cardId: probeCardId, before: cardFieldStateFromRow(before), superActionId: null });
    const probeName = (await storage.fetcher.fetchById(probeCardId))!.name!;
    storage.fetcher.expireCard({ ...newCardRecord(probeName), id: probeCardId });
    await runStyleAssetEvents(context(compileCoffee), [
      { cardId: probeCardId, actionId: trashed!.actionId, verb: "delete" as const },
    ]);

    const stamp = Math.floor((T0 + 4000) / 1000);
    const modInput = assembleModScriptInput(assemblyDeps(), scriptCard("mod: format+*script"));
    // the trashed item contributes nothing (input_item_cards rejects trash)
    expect(readFileSync(outputFile(stamp), "utf8")).toBe(modInput);
    expect((await row(ids.allScriptOutput)).db_content).toBe(`~${ids.allScriptOutput}/${stamp}.js`);
    // the deleted card's stored input stays, as Ruby's does
    expect(await virtualOf(probeCardId)).toBe("// Probe Script\nwindow.parityProbe = 2;\n");
  });

  it("without the CoffeeScript compiler the saves that need it are refused, with a named error", async () => {
    const ctx = context(undefined);
    // a CoffeeScript card's input compiles
    await expect(
      assertStyleCompilerFor(ctx, DeckoName.parse("Some Coffee Card"), ids.coffeeScript),
    ).rejects.toThrow(/coffeeCompiler/);
    // a `<set>+*script` rule's save rebuilds the site script
    await expect(
      assertStyleCompilerFor(ctx, DeckoName.parse("*all+*script"), ids.list),
    ).rejects.toThrow(/coffeeCompiler/);
    // a JavaScript card's input is raw: no compiler needed
    await expect(
      assertStyleCompilerFor(ctx, DeckoName.parse("Some Js Card"), ids.javaScript),
    ).resolves.toBeUndefined();
    // a `<set>+*style` rule still refuses for the SCSS compiler alone
    await expect(
      assertStyleCompilerFor(ctx, DeckoName.parse("*all+*style"), ids.list),
    ).rejects.toThrow(/scssCompiler/);
  });

  it("under compress_assets without a compressor, the script saves are refused, with a named error", async () => {
    const ctx = { ...context(compileCoffee), compressAssets: true };
    await expect(
      assertStyleCompilerFor(ctx, DeckoName.parse("Some Js Card"), ids.javaScript),
    ).rejects.toThrow(/scriptCompressor/);
    await expect(
      assertStyleCompilerFor(ctx, DeckoName.parse("Some Coffee Card"), ids.coffeeScript),
    ).rejects.toThrow(/scriptCompressor/);
    await expect(
      assertStyleCompilerFor(ctx, DeckoName.parse("*all+*script"), ids.list),
    ).rejects.toThrow(/scriptCompressor/);
    // with the compressor the same saves go ahead
    const armed = { ...ctx, compressScript: uglifyHarmonyCompile };
    await expect(
      assertStyleCompilerFor(armed, DeckoName.parse("Some Js Card"), ids.javaScript),
    ).resolves.toBeUndefined();
    await expect(
      assertStyleCompilerFor(armed, DeckoName.parse("*all+*script"), ids.list),
    ).resolves.toBeUndefined();
  });
});
