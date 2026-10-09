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
import { LocalAttachmentStore } from "../../../src/card/attachments/attachment-store.js";
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
  await card({ id: ids.pointer, name: "Pointer", codename: "pointer" });
  await card({ id: ids.file, name: "File", codename: "file" });
  await card({ id: ids.skinType, name: "Bootswatch skin", codename: "bootswatch_skin" });
  await card({ id: ids.scss, name: "SCSS", codename: "scss" });
  await card({ id: ids.style, name: "*style", codename: "style" });
  await card({ id: ids.assetInput, name: "*asset input", codename: "asset_input" });
  await card({ id: ids.assetOutput, name: "*asset output", codename: "asset_output" });
  await card({ id: ids.styleMods, name: "style: mods", codename: "style_mods", typeId: ids.pointer, dbContent: "" });
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
});
