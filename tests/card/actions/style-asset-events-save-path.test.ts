// The engine runs the style asset events on its save path: updating the
// `*all+*style` rule (what choosing a skin does) stores the site stylesheet
// through the engine's SCSS compiler and attachment store, and a host with no
// compiler is refused before the stylesheet is touched.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";
import { CardActionError } from "../../../src/card/actions/types.js";
import { DeckoName } from "../../../src/card/name.js";
import { LocalAttachmentStore } from "../../../src/card/attachments/attachment-store.js";
import { libsassWasmCompiler } from "../../../src/server/libsass-wasm.js";
import { ModEventRegistry } from "../../../src/card/mod-loader/mod-event-registry.js";
import {
  createActionsTestStorage,
  seedCard,
  seedStandardDeck,
  fakeClock,
  JOE,
  IP,
  SET_TYPE_ID,
  type ActionsTestStorage,
} from "./actions-test-storage.js";

let storage: ActionsTestStorage;
let filesDir: string;
const ids = { pointer: 400, file: 401, skinType: 402, scss: 403, style: 410, assetInput: 411, assetOutput: 412,
  skin: 420, allStyle: 430, output: 431, styleMods: 440 };

beforeEach(async () => {
  storage = await createActionsTestStorage();
  filesDir = mkdtempSync(join(tmpdir(), "style-asset-save-path-"));
  await seedStandardDeck(storage);
  const card = (o: Parameters<typeof seedCard>[1]) => seedCard(storage, o);
  // Read-path refresh runs as the real deck bot, independently of JOE.
  await card({ id: 399, name: "DeckoBot", codename: "decko_bot" });
  await card({ id: ids.pointer, name: "Pointer", codename: "pointer" });
  await card({ id: 404, name: "List", codename: "list" });
  await card({ id: ids.file, name: "File", codename: "file" });
  await card({ id: ids.skinType, name: "Bootswatch skin", codename: "bootswatch_skin" });
  await card({ id: ids.scss, name: "SCSS", codename: "scss" });
  await card({ id: ids.style, name: "*style", codename: "style" });
  await card({ id: ids.assetInput, name: "*asset input", codename: "asset_input" });
  await card({ id: ids.assetOutput, name: "*asset output", codename: "asset_output" });
  await card({ id: ids.styleMods, name: "style: mods", codename: "style_mods", typeId: 404, dbContent: "" });
  await card({ id: ids.skin, name: "Probe Skin", typeId: ids.skinType });
  await card({ id: ids.allStyle, name: "*all+*style", leftId: 7, rightId: ids.style, typeId: ids.pointer, dbContent: "Other Skin" });
  await card({ id: ids.output, name: "*all+*style+*asset output", leftId: ids.allStyle, rightId: ids.assetOutput,
    typeId: ids.file, dbContent: ":all+:style+:asset_output/defaults.css" });
  void SET_TYPE_ID;
});

afterEach(() => {
  storage.close();
  rmSync(filesDir, { recursive: true, force: true });
});

function engine(scssCompiler?: (source: string) => Promise<string>) {
  return new CardActionEngine(storage.engine, {
    actor: JOE,
    ipAddress: IP,
    now: fakeClock(),
    attachmentStore: new LocalAttachmentStore(filesDir),
    ...(scssCompiler === undefined ? {} : { scssCompiler }),
  });
}

describe("the save path's style asset events", () => {
  it("read refresh creates a missing style:mods input once even when the save clock predates sources", async () => {
    let clockReads = 0;
    const readEngine = new CardActionEngine(storage.engine, {
      actor: JOE, now: () => {
        clockReads += 1;
        return new Date("2026-10-07T12:00:00Z");
      },
    });
    const input = () => storage.selectOne<{ id: number; content: string; updated_at: string | null }>(
      "SELECT id, content, updated_at FROM card_virtuals WHERE left_id = ? AND right_id = ?",
      [ids.styleMods, ids.assetInput]);
    expect(await input()).toBeUndefined();
    await readEngine.refreshReadAssetInputs();
    const first = await input();
    expect(first?.content).toBe("");
    expect(first?.updated_at).toBe("2026-10-07 12:00:00");
    expect(clockReads).toBeGreaterThan(0);
    const afterMissingRefresh = clockReads;
    await readEngine.refreshReadAssetInputs();
    expect(await input()).toEqual(first);
    expect(clockReads).toBe(afterMissingRefresh);
  });

  it.each(["retained style input", ""])("read refresh preserves an existing style:mods input (%j) with no source timestamp", async (content) => {
    const readEngine = engine();
    await readEngine.refreshReadAssetInputs();
    await storage.driver.query(
      "UPDATE card_virtuals SET content = ?, updated_at = NULL WHERE left_id = ? AND right_id = ?",
      [content, ids.styleMods, ids.assetInput]);
    await readEngine.refreshReadAssetInputs();
    const row = await storage.selectOne<{ content: string; updated_at: string | null }>(
      "SELECT content, updated_at FROM card_virtuals WHERE left_id = ? AND right_id = ?",
      [ids.styleMods, ids.assetInput]);
    expect(row).toEqual({ content, updated_at: null });
  });

  it("asset virtual timestamps retain the save clock even before the vendored source date", async () => {
    const now = new Date("2026-09-19T12:00:00Z");
    const result = await new CardActionEngine(storage.engine, {
      actor: JOE, now: () => now, scssCompiler: libsassWasmCompiler(),
    }).createCard({ name: "Clocked SCSS", typeId: ids.scss, content: ".clocked { color: red; }" });
    const row = await storage.selectOne<{ updated_at: string; content: string }>(
      "SELECT updated_at, content FROM card_virtuals WHERE left_id = ? AND right_id = ?",
      [result.cardId, ids.assetInput],
    );
    expect(row?.updated_at).toBe("2026-09-19 12:00:00");
    // SCSS asset input is its raw source; the outputter compiles the bundle.
    expect(row?.content).toBe(".clocked { color: red; }");
  });
  it("SCSS preflight skips an empty style rule before requiring a compiler; CSS does not", async () => {
    await storage.driver.query("UPDATE cards SET db_content = '' WHERE id = ?", [ids.allStyle]);
    await seedCard(storage, { id: 460, name: "CSS", codename: "css" });
    // The preflight is deliberately isolated: the independent asset-output
    // capability gate still rejects a full save on a host with no compiler.
    const preflight = (actionEngine: CardActionEngine) => actionEngine as unknown as {
      validateCssSaveTree(name: DeckoName, input: { typeId: number; content: string }): Promise<void>;
    };
    const name = DeckoName.parse("Validation candidate");
    await expect(preflight(engine()).validateCssSaveTree(name, { typeId: ids.scss, content: "invalid {" })).resolves.toBeUndefined();
    await expect(preflight(engine()).validateCssSaveTree(name, { typeId: 460, content: "invalid {" })).rejects.toBeInstanceOf(CardActionError);
    await seedCard(storage, { id: 461, name: "Variables", typeId: ids.scss, dbContent: "$brand: blue;" });
    await storage.driver.query("UPDATE cards SET db_content = 'Variables' WHERE id = ?", [ids.allStyle]);
    storage.engine.expireCard((await storage.engine.fetchById(ids.allStyle))!);
    await expect(preflight(engine()).validateCssSaveTree(name, { typeId: ids.scss, content: ".x { color: $brand; }" })).rejects.toBeInstanceOf(CardActionError);
  });
  it("using a skin finalizes its own unchanged save before updating the rule in one act", async () => {
    await seedCard(storage, { id: 450, name: "*variables", codename: "variables" });
    await seedCard(storage, { id: 451, name: "Probe Skin+*variables", leftId: ids.skin, rightId: 450,
      typeId: ids.scss, dbContent: "body { color: red; }" });
    const order: string[] = [];
    const registry = new ModEventRegistry();
    for (const stage of ["store", "finalize", "integrate"] as const) registry.register({
      event: `observe_${stage}`, at: stage, modName: "phase_control", setPath: "all/phase_control",
      fn: card => { order.push(`${stage}:${card.name}`); },
    });
    const actsBefore = await storage.count("card_acts");
    const result = await new CardActionEngine(storage.engine, {
      actor: JOE, now: fakeClock(), attachmentStore: new LocalAttachmentStore(filesDir),
      scssCompiler: libsassWasmCompiler(), modEvents: { registry },
    }).useAsCurrentSkin(ids.skin);
    expect(result?.cardId).toBe(ids.allStyle);
    expect(order.indexOf("finalize:Probe Skin")).toBeLessThan(order.indexOf("store:*all+*style"));
    expect(order.indexOf("integrate:~420")).toBeLessThan(order.indexOf("integrate:*all+*style"));
    expect(await storage.count("card_acts")).toBe(actsBefore + 1);
    expect((await storage.selectOne<{ card_id: number }>("SELECT card_id FROM card_acts ORDER BY id DESC LIMIT 1"))?.card_id).toBe(ids.skin);
    expect(await storage.selectOne("SELECT id FROM card_actions WHERE card_id = ?", [ids.skin])).toBeUndefined();
    expect((await storage.selectOne<{ db_content: string }>("SELECT db_content FROM cards WHERE id = ?", [ids.allStyle]))?.db_content).toBe("Probe Skin");
    const output = await storage.selectOne<{ db_content: string }>("SELECT db_content FROM cards WHERE id = ?", [ids.output]);
    const match = /^~431\/(\d+)\.css$/.exec(output!.db_content)!;
    expect(readFileSync(join(filesDir, "431", `${match[1]}.css`), "utf8")).toContain("body{color:red}");
  });
  it("updating *all+*style stores the compiled skin as the asset output card's file, with no action of its own", async () => {
    const sources: string[] = [];
    const result = await engine(async (source) => {
      sources.push(source);
      return "/* compiled */";
    }).updateCard({ cardId: ids.allStyle, content: "Probe Skin" });
    expect(result).not.toBeNull();
    expect(sources).toHaveLength(1);
    const output = await storage.selectOne<{ db_content: string }>("SELECT db_content FROM cards WHERE id = ?", [ids.output]);
    const m = /^~431\/(\d+)\.css$/.exec(output!.db_content);
    expect(m).not.toBeNull();
    expect(readFileSync(join(filesDir, "431", `${m![1]}.css`), "utf8")).toBe("/* compiled */");
    const outputActions = await storage.selectAll("SELECT id FROM card_actions WHERE card_id = ?", [ids.output]);
    expect(outputActions).toHaveLength(0);
    const virtual = await storage.selectOne<{ content: string }>(
      "SELECT content FROM card_virtuals WHERE left_id = ? AND right_id = ?", [ids.skin, ids.assetInput]);
    expect(virtual?.content).toBe("/* compiled */");
  });

  it("without a compiler the save is refused before anything is written", async () => {
    const actions = await storage.count("card_actions");
    await expect(engine().updateCard({ cardId: ids.allStyle, content: "Probe Skin" })).rejects.toThrow(CardActionError);
    const output = await storage.selectOne<{ db_content: string }>("SELECT db_content FROM cards WHERE id = ?", [ids.output]);
    expect(output!.db_content).toBe(":all+:style+:asset_output/defaults.css");
    const rule = await storage.selectOne<{ db_content: string }>("SELECT db_content FROM cards WHERE id = ?", [ids.allStyle]);
    expect(rule!.db_content).toBe("Other Skin");
    expect(await storage.count("card_actions")).toBe(actions);
  });

  it("saves that touch no stylesheet need no compiler", async () => {
    const result = await engine().updateCard({ cardId: 50, content: "v2" });
    expect(result).not.toBeNull();
  });

  // update_skin_asset_input (card-mod-bootstrap set/abstract/skin_field.rb:1-5,
  // :finalize): a SKIN FIELD save (the +*colors/+*variables/+*stylesheets
  // right cards) refreshes the SKIN's asset input when the skin itself has no
  // action in this act — Ruby's `return if !left || left.action;
  // left.update_asset_input` (style-asset-events.ts runs it at the finalize
  // position, gate `!savedIds.has(card.leftId)`).
  //
  // THE VIEW THE REFRESH READS. The recorded oracle proves the refresh
  // assembles from the act field's PRE-ACT bytes, giving Ruby's one-save lag:
  // reference-harness/fixtures/write-battery-v1/expected/side-effects-ruby.json,
  // step admin-update-current-skin-colors (save $primary: #345678;) leaves
  // Parity Skin+*asset input UNTOUCHED (the pre-act assembly reproduces the
  // stored input) and writes the stylesheet from it; step
  // admin-update-current-skin-colors-again (save $primary: #876543;) stores
  // as the skin's input the assembly of #345678 — the PRE-ACT content, its
  // sha256 4c45c2ac... byte-identical to the css file written in the same
  // step. This test pins the same shape over two saves of the field.
  it("updating a skin field refreshes the skin's input from the pre-act bytes, landing this save's bytes on the NEXT save (skin_field.rb update_skin_asset_input)", async () => {
    await seedCard(storage, { id: 452, name: "*variables", codename: "variables" });
    await seedCard(storage, { id: 453, name: "Probe Skin+*variables", leftId: ids.skin, rightId: 452,
      typeId: ids.scss, dbContent: "body { color: old; }" });
    const skinInput = () => storage.selectOne<{ content: string; updated_at: string | null }>(
      "SELECT content, updated_at FROM card_virtuals WHERE left_id = ? AND right_id = ?",
      [ids.skin, ids.assetInput]);
    expect(await skinInput()).toBeUndefined();
    const compile = libsassWasmCompiler();
    const result = await engine((source) => compile(source, "compressed")).updateCard({
      cardId: 453,
      // the skin's asset input is the COMPRESSED rendering of its sources
      // (bootswatch_skin.rb:30 include_set Abstract::AssetInputter,
      // input_view: :compressed), so the vector compiles to observable bytes
      content: "$primary: #0aa !default;\nbody { color: $primary; }",
    });
    expect(result).not.toBeNull();
    // no input row existed, so the refresh creates it — from the field's
    // PRE-ACT bytes ("body { color: old; }"), never the bytes this save
    // assigned (the battery's Parity Skin colors-1 shape: the refresh is a
    // no-op when the pre-act assembly reproduces the stored input, and the
    // stored bytes always trail the field by one save)
    const refreshed = await skinInput();
    expect(refreshed).toBeDefined();
    expect(refreshed!.content).toContain("body{color:old}");
    expect(refreshed!.content).not.toContain("body{color:#0aa}");
    // the skin itself has no action in this act (the field's save is the act)
    expect(await storage.selectAll("SELECT id FROM card_actions WHERE card_id = ?", [ids.skin]))
      .toHaveLength(0);
    // the second save lands the FIRST save's bytes in the skin's input (the
    // battery's colors-again shape: the stored input is the pre-act
    // assembly, one save behind the field)
    const second = await engine((source) => compile(source, "compressed")).updateCard({
      cardId: 453,
      content: "$primary: #0bb !default;\nbody { color: $primary; }",
    });
    expect(second).not.toBeNull();
    const lagged = await skinInput();
    expect(lagged!.content).toContain("body{color:#0aa}");
    expect(lagged!.content).not.toContain("body{color:#0bb}");
  });
});
