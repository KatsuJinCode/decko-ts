// The site stylesheet a skin builds, against the Ruby oracle.
//
// Fixture: tests/card/assets/fixtures/skin-stylesheet-oracle.json, written
// from tools/oracle/skin-stylesheet-probe.rb run against the oracle deck: for
// every Bootswatch skin, the field contents, and the sha256 and length of the
// assembled SCSS (`content`) and of the compiled asset input (css
// :compressed, LibSass 3.6.4).
//
//   1. the sources: the vendored bootstrap and mod style files read as Ruby
//      reads them;
//   2. assembly: every skin's SCSS equals Ruby's, byte for byte;
//   3. compile: with LibSass (tools/libsass/build-native.mjs) every skin's
//      stylesheet equals Ruby's. Without the built program these cases are
//      skipped, and say so;
//   4. the write path: choosing a skin stores the stylesheet as Ruby does
//      (the asset output card's file, no action, the asset-input rows, the
//      recent-settings list), and a colour change rebuilds it from the
//      colours as they were before the change, as Ruby does.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { describeOrSkipLoud } from "../../support/describe-with-corpus.js";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  bootswatchSkinContent,
  renderStyleChunks,
  type StyleAssetDeps,
  type StyleCard,
} from "../../../src/card/assets/skin-stylesheet.js";
import { modStyleFileContent, modStyleFiles } from "../../../src/card/assets/style-sources.js";
import { bootstrapCoreScss, bootstrapFunctionsScss } from "../../../src/card/render/bootstrap-code-files.js";
import { libsassProcessCompiler } from "../../../src/server/libsass-process.js";
import { DeckoName } from "../../../src/card/name.js";
import { ActWriter, cardFieldStateFromRow } from "../../../src/card/history/write-path.js";
import { LocalAttachmentStore } from "../../../src/card/attachments/attachment-store.js";
import { VirtualRecordCache } from "../../../src/card/mod-loader/mods/card-mod-virtual.js";
import { newCardRecord } from "../../../src/card/fetch/card-record.js";
import { runStyleAssetEvents, saveRecentlyEditedSettings } from "../../../src/card/actions/style-asset-events.js";
import { CardActionError } from "../../../src/card/actions/types.js";
import type { CardsRow } from "../../../src/server/schema.js";
import { createRenderTestStorage, seedCard, type RenderTestStorage } from "../render/render-test-storage.js";

interface Digest {
  sha256: string;
  length: number;
}
interface OracleSkin {
  name: string;
  codename: string;
  theme: string;
  parent: boolean | null;
  colors: string | null;
  variables: string | null;
  stylesheets: [string, string][] | null;
  content: Digest;
  compressed: Digest;
}
const ORACLE = JSON.parse(
  readFileSync(join(fileURLToPath(new URL(".", import.meta.url)), "fixtures", "skin-stylesheet-oracle.json"), "utf8"),
) as {
  parts: Record<string, Digest>;
  mod_style_cards: { name: string }[];
  skins: OracleSkin[];
};

const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const digest = (text: string): Digest => ({ sha256: sha256(text), length: text.length });
const modName = (modStyleCard: string) => modStyleCard.replace(/^mod: /, "").replace(/\+\*style$/, "").replace(/ /g, "_");

/** The oracle deck as the assembly reads it: the code-file cards, `style:
 *  mods` with its mod style cards, and each skin with its fields. */
function oracleDeckDeps(): StyleAssetDeps {
  const cards = new Map<string, StyleCard>();
  let id = 1;
  const add = (name: string, typeCode: string, dbContent = "", codename?: string) => {
    const card: StyleCard = { id: id++, name, key: DeckoName.parse(name).key, typeCode, codename, dbContent, leftId: undefined, rightId: undefined };
    cards.set(card.key, card);
    return card;
  };
  add("bootstrap: functions", "bootstrap_code_file", "", "bootstrap_functions");
  add("bootstrap: core", "bootstrap_code_file", "", "bootstrap_core");
  add("style: mods", "pointer", ORACLE.mod_style_cards.map((m) => m.name).join("\n"), "style_mods");
  for (const m of ORACLE.mod_style_cards) {
    add(m.name, "pointer");
    add(m.name.replace(/\+\*style$/, ""), "mod", "", `mod_${modName(m.name)}`);
  }
  for (const skin of ORACLE.skins) {
    add(skin.name, "bootswatch_skin", "", skin.codename === "" ? undefined : skin.codename);
    if (skin.colors !== null) add(`${skin.name}+*colors`, "scss", skin.colors);
    if (skin.variables !== null) add(`${skin.name}+*variables`, "scss", skin.variables);
    if (skin.stylesheets !== null) {
      add(`${skin.name}+*stylesheets`, "skin", skin.stylesheets.map(([n]) => n).join("\n"));
      for (const [n, content] of skin.stylesheets) add(n, "scss", content);
    }
  }
  const byCodename = new Map([...cards.values()].filter((c) => c.codename).map((c) => [c.codename!, c]));
  return {
    card: async (name) => cards.get(DeckoName.parse(name).key),
    cardByCodename: async (code) => byCodename.get(code),
    compile: undefined,
  };
}

describe("skin stylesheet sources (vendored, as Ruby reads them)", () => {
  it("the bootstrap code files", () => {
    expect(digest(bootstrapFunctionsScss())).toEqual(ORACLE.parts.bootstrap_functions);
    expect(digest(bootstrapCoreScss())).toEqual(ORACLE.parts.bootstrap_core);
  });

  it("every mod's style files, in the order `style: mods` lists them", () => {
    const joined = ORACLE.mod_style_cards
      .flatMap((m) => (modStyleFiles(modName(m.name)) ?? []).map((f) => modStyleFileContent(f)))
      .join("\n");
    expect(digest(joined)).toEqual(ORACLE.parts.style_mods_joined);
  });
});

describe("Bootswatch skin SCSS assembly (bootswatch_skin.rb content)", () => {
  for (const skin of ORACLE.skins) {
    it(`${skin.name} (${skin.theme || "no theme"}) assembles Ruby's SCSS`, async () => {
      const deps = oracleDeckDeps();
      const card = await deps.card(skin.name);
      expect(digest(await bootswatchSkinContent(deps, card!))).toEqual(skin.content);
    });
  }
});

describe("link chunks in stylesheet content (css format)", () => {
  it("renders internal, external and titled links as the css format does", () => {
    expect(renderStyleChunks("a{b:url([[/mod/x.png]])}")).toBe("a{b:url(/mod/x.png)}");
    expect(renderStyleChunks("url([[/mod/x.png]])", "/deck")).toBe("url(/deck/mod/x.png)");
    expect(renderStyleChunks("[[https://e.org/f.woff]]")).toBe("https://e.org/f.woff");
    expect(renderStyleChunks("[[/a|label]]")).toBe("label[/a]");
  });

  it("refuses card links and nests rather than storing bytes Ruby would not", () => {
    expect(() => renderStyleChunks("[[Some Card]]")).toThrow(/card link/);
    expect(() => renderStyleChunks("{{Some Card}}")).toThrow(/nest/);
  });
});

const SASSC = join(
  fileURLToPath(new URL("../../../tools/libsass/build/", import.meta.url)),
  process.platform === "win32" ? "sassc-stdin.exe" : "sassc-stdin",
);
// The gate is the presence of the LibSass native program at that path, and
// nothing else. It is built output, not a fixture: a checkout without it has
// not run these cases, whatever else the run did. The skip therefore goes
// through the same loud helper as every other gated suite, so it lands in the
// "Not run" list at the end of every run instead of printing once from
// wherever this module happened to be collected.
const LIBSASS_GATE = `${SASSC} (build it with \`node tools/libsass/build-native.mjs tools/libsass/libsass\`)`;

describeOrSkipLoud(!existsSync(SASSC), "tests/card/assets/skin-stylesheet.test.ts", LIBSASS_GATE)(
  "compiled skin stylesheets (LibSass, against Ruby's bytes)",
  () => {
    for (const skin of ORACLE.skins) {
      it(`${skin.name} compiles to Ruby's stylesheet`, async () => {
        const deps = oracleDeckDeps();
        const card = await deps.card(skin.name);
        const css = await libsassProcessCompiler(SASSC)(renderStyleChunks(await bootswatchSkinContent(deps, card!)), "compressed");
        expect(digest(css)).toEqual(skin.compressed);
      }, 30_000);
    }
  },
);

// ---------------------------------------------------------------------------
// the write path
// ---------------------------------------------------------------------------

const ADMIN = 900;
const T0 = Date.UTC(2026, 9, 7, 12, 0, 0);
let storage: RenderTestStorage;
let filesDir: string;
let clock = T0;
const compiled: string[] = [];
/** A stand-in compiler: a deterministic digest of its input, so the stored
 *  bytes show exactly which SCSS was compiled. */
const stubCompile = async (source: string) => {
  compiled.push(source);
  return `/* ${sha256(source)} */`;
};

const ids = {
  set: 10, setting: 11, pointer: 12, file: 13, scss: 14, skinType: 15, code: 16, mod: 17, basic: 18,
  all: 20, style: 21, follow: 22, create: 23, colors: 24, variables: 25, assetInput: 26, assetOutput: 27,
  recent: 30, functions: 31, core: 32, styleMods: 33, modFormat: 34, modFormatStyle: 35,
  skin: 40, skinColors: 41, skinVariables: 42, allStyle: 50, allStyleOutput: 51,
};

async function row(id: number): Promise<CardsRow> {
  return (await storage.counting.query<CardsRow>("SELECT * FROM cards WHERE id = ?", [id])).rows[0];
}

function context(compile: typeof stubCompile | undefined) {
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
    compile,
    virtuals: new VirtualRecordCache(),
  };
}

/** An update through the history writer (the engine's save), returning the
 *  saved card for the events. */
async function save(id: number, content: string) {
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

async function seedDeck() {
  const s = storage;
  const card = (id: number, name: string, typeId: number, extra: Record<string, unknown> = {}) =>
    seedCard(s, { id, name, typeId, ...extra });
  await card(ids.set, "Set", 1, { codename: "set" });
  await card(ids.setting, "Setting", 1, { codename: "setting" });
  await card(ids.pointer, "Pointer", 1, { codename: "pointer" });
  await card(ids.file, "File", 1, { codename: "file" });
  await card(ids.scss, "SCSS", 1, { codename: "scss" });
  await card(ids.skinType, "Bootswatch skin", 1, { codename: "bootswatch_skin" });
  await card(ids.code, "Code file", 1, { codename: "bootstrap_code_file" });
  await card(ids.mod, "Mod", 1, { codename: "mod" });
  await card(ids.basic, "Basic", 1, { codename: "basic" });
  await card(ids.all, "*all", ids.set, { codename: "all" });
  await card(ids.style, "*style", ids.setting, { codename: "style" });
  await card(ids.follow, "*follow", ids.setting, { codename: "follow" });
  await card(ids.create, "*create", ids.setting, { codename: "create" });
  await card(ids.colors, "*colors", ids.basic, { codename: "colors" });
  await card(ids.variables, "*variables", ids.basic, { codename: "variables" });
  await card(ids.assetInput, "*asset input", ids.basic, { codename: "asset_input" });
  await card(ids.assetOutput, "*asset output", ids.basic, { codename: "asset_output" });
  await card(ids.recent, "*recent settings", ids.pointer, { codename: "recent_settings", dbContent: "*follow\n*create" });
  await card(ids.functions, "bootstrap: functions", ids.code, { codename: "bootstrap_functions" });
  await card(ids.core, "bootstrap: core", ids.code, { codename: "bootstrap_core" });
  await card(ids.styleMods, "style: mods", ids.pointer, { codename: "style_mods", dbContent: "mod: format+*style" });
  await card(ids.modFormat, "mod: format", ids.mod, { codename: "mod_format" });
  await card(ids.modFormatStyle, "mod: format+*style", ids.pointer, { leftId: ids.modFormat, rightId: ids.style });
  await card(ids.skin, "Probe Skin", ids.skinType);
  await card(ids.skinColors, "Probe Skin+*colors", ids.scss, { leftId: ids.skin, rightId: ids.colors, dbContent: "" });
  await card(ids.skinVariables, "Probe Skin+*variables", ids.scss, { leftId: ids.skin, rightId: ids.variables, dbContent: "" });
  await card(ids.allStyle, "*all+*style", ids.pointer, { leftId: ids.all, rightId: ids.style, dbContent: "Other Skin" });
  await card(ids.allStyleOutput, "*all+*style+*asset output", ids.file, {
    leftId: ids.allStyle, rightId: ids.assetOutput, dbContent: ":all+:style+:asset_output/defaults.css",
  });
}

describe("choosing and editing the current skin (the write path)", () => {
  beforeAll(async () => {
    storage = await createRenderTestStorage();
    filesDir = mkdtempSync(join(tmpdir(), "skin-stylesheet-files-"));
    await seedDeck();
  });
  afterAll(() => {
    storage?.close();
    if (filesDir) rmSync(filesDir, { recursive: true, force: true });
  });

  it("choosing a skin stores its stylesheet as the asset output card's file, with no action", async () => {
    clock = T0 + 1000;
    const actionsBefore = (await storage.counting.query<{ n: number }>("SELECT COUNT(*) AS n FROM card_actions", [])).rows[0].n;
    const saved = await save(ids.allStyle, "Probe Skin");
    compiled.length = 0;
    await runStyleAssetEvents(context(stubCompile), [saved]);

    const stamp = Math.floor((T0 + 1000) / 1000);
    const output = await row(ids.allStyleOutput);
    expect(output.db_content).toBe(`~${ids.allStyleOutput}/${stamp}.css`);
    expect(output.updater_id).toBe(ADMIN);
    // one action: the rule's own update; the output card records none
    const actionsAfter = (await storage.counting.query<{ n: number }>("SELECT COUNT(*) AS n FROM card_actions", [])).rows[0].n;
    expect(Number(actionsAfter) - Number(actionsBefore)).toBe(1);

    // the skin was compiled once: its assembled SCSS with the links rendered
    expect(compiled).toHaveLength(1);
    expect(compiled[0]).toContain(bootstrapFunctionsScss());
    expect(compiled[0]).toContain(modStyleFileContent(modStyleFiles("format")![0]));
    const css = `/* ${sha256(compiled[0])} */`;
    // the stored file holds exactly the compiled skin
    expect(readFileSync(join(filesDir, String(ids.allStyleOutput), `${stamp}.css`), "utf8")).toBe(css);
    // the skin's asset input is stored (card_virtuals), read on the next build
    expect(await virtualOf(ids.skin)).toBe(css);
  });

  it("the saved rule moves its setting to the top of *recent settings, references refreshed", async () => {
    const saved = { cardId: ids.allStyle, actionId: 0, verb: "update" as const };
    const last = (await storage.counting.query<{ id: number }>("SELECT MAX(id) AS id FROM card_actions WHERE card_id = ?", [ids.allStyle])).rows[0].id;
    await saveRecentlyEditedSettings(context(stubCompile), [{ ...saved, actionId: Number(last) }]);
    expect((await row(ids.recent)).db_content).toBe("*style\n*follow\n*create");
    const refs = (await storage.counting.query<{ referee_id: number }>(
      "SELECT referee_id FROM card_references WHERE referer_id = ? ORDER BY id", [ids.recent],
    )).rows.map((r) => Number(r.referee_id));
    expect(refs).toEqual([ids.style, ids.follow, ids.create]);
  });

  it("a colour change rebuilds the stylesheet from the colours as they were before it, as Ruby does", async () => {
    // *all+*style refers to the skin (refresh_references_out of the rule)
    await storage.counting.query(
      "INSERT INTO card_references (referer_id, referee_key, referee_id, ref_type) VALUES (?, ?, ?, 'L')",
      [ids.allStyle, "probe_skin", ids.skin],
    );
    const firstCss = await virtualOf(ids.skin);
    clock = T0 + 2000;
    compiled.length = 0;
    await runStyleAssetEvents(context(stubCompile), [await save(ids.skinColors, "$primary: #345678;")]);
    // the field's own input is its new content
    expect(await virtualOf(ids.skinColors)).toBe("$primary: #345678;");
    // the skin's input and the stylesheet are built from the previous colours
    expect(compiled).toHaveLength(1);
    expect(compiled[0]).not.toContain("#345678");
    expect(await virtualOf(ids.skin)).toBe(firstCss);
    const stamp2 = Math.floor((T0 + 2000) / 1000);
    expect(readFileSync(join(filesDir, String(ids.allStyleOutput), `${stamp2}.css`), "utf8")).toBe(firstCss);

    // the next change picks up the one before it
    clock = T0 + 3000;
    compiled.length = 0;
    await runStyleAssetEvents(context(stubCompile), [await save(ids.skinColors, "$primary: #876543;")]);
    expect(compiled[0]).toContain("$primary: #345678;");
    expect(compiled[0]).not.toContain("#876543");
    const stamp3 = Math.floor((T0 + 3000) / 1000);
    const third = readFileSync(join(filesDir, String(ids.allStyleOutput), `${stamp3}.css`), "utf8");
    expect(third).toBe(`/* ${sha256(compiled[0])} */`);
    expect(third).not.toBe(firstCss);
    expect((await row(ids.allStyleOutput)).db_content).toBe(`~${ids.allStyleOutput}/${stamp3}.css`);
  });

  it("without a compiler the save is refused with a named error, nothing stored", async () => {
    clock = T0 + 4000;
    const before = (await row(ids.allStyleOutput)).db_content;
    const saved = await save(ids.skinColors, "$primary: #000001;");
    await expect(runStyleAssetEvents(context(undefined), [saved])).rejects.toThrow(CardActionError);
    await expect(runStyleAssetEvents(context(undefined), [saved])).rejects.toThrow(/no SCSS compiler/);
    expect((await row(ids.allStyleOutput)).db_content).toBe(before);
  });
});
