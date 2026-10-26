// The compiled asset bundle's file name, both modes
// (DECKO_STRICT_PARITY_SCRIPT_BUNDLE_CLOCK_NAMES,
// src/card/actions/style-asset-events.ts updateAssetOutput):
//
//   default (off)  the name slot is a function of the bundle BYTES
//                  (assetOutputNameSlot): a redeploy that recompiles an
//                  unchanged bundle keeps the same file name and the same
//                  URL. This is the improvement over Ruby.
//   strict (on)    the name slot is the wall clock, floor(epoch seconds):
//                  Ruby's stand-in action id Time.now.to_i
//                  (card-mod-carrierwave
//                  lib/carrier_wave/file_card_uploader.rb:147-151), one for
//                  one: the same bytes at a later clock store under a new
//                  name, which is why every Ruby deploy changes every
//                  bundle URL. The side-effects battery's get-home step is
//                  the recorded evidence.
//
// The fixture mirrors tests/card/actions/style-asset-events-save-path.test.ts:
// the *all+*style rule over a Bootswatch skin, a stub compiler so the
// bundle bytes are exactly controlled, and a controllable clock per engine.

import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";
import { LocalAttachmentStore } from "../../../src/card/attachments/attachment-store.js";
import {
  configureStrictParity,
} from "../../../src/card/parity/strict-parity-flags.js";
import { assetOutputNameSlot } from "../../../src/card/actions/style-asset-events.js";
import {
  createActionsTestStorage,
  seedCard,
  seedStandardDeck,
  JOE,
  IP,
  type ActionsTestStorage,
} from "./actions-test-storage.js";

let storage: ActionsTestStorage;
let filesDirs: string[] = [];

const ids = { pointer: 400, file: 401, skinType: 402, scss: 403, style: 410, assetInput: 411, assetOutput: 412,
  skin: 420, skinTwo: 421, allStyle: 430, output: 431, styleMods: 440 };

async function boot(): Promise<void> {
  storage = await createActionsTestStorage();
  await seedStandardDeck(storage);
  const card = (o: Parameters<typeof seedCard>[1]) => seedCard(storage, o);
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
  await card({ id: ids.skinTwo, name: "Probe Skin Two", typeId: ids.skinType });
  await card({ id: ids.allStyle, name: "*all+*style", leftId: 7, rightId: ids.style, typeId: ids.pointer, dbContent: "Other Skin" });
  await card({ id: ids.output, name: "*all+*style+*asset output", leftId: ids.allStyle, rightId: ids.assetOutput,
    typeId: ids.file, dbContent: ":all+:style+:asset_output/defaults.css" });
}

function newFilesDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "asset-output-naming-"));
  filesDirs.push(dir);
  return dir;
}

/** An engine whose clock is fixed and whose compiler emits fixed bytes. */
function engineAt(epochMs: number, filesDir: string, compiled = "/* compiled */"): CardActionEngine {
  return new CardActionEngine(storage.engine, {
    actor: JOE,
    ipAddress: IP,
    now: () => new Date(epochMs),
    attachmentStore: new LocalAttachmentStore(filesDir),
    scssCompiler: async () => compiled,
  });
}

/** The output card's identifier and one dir's stored files. */
async function storedIn(dir: string): Promise<{ identifier: string; slot: string; files: string[] }> {
  const output = await storage.selectOne<{ db_content: string }>(
    "SELECT db_content FROM cards WHERE id = ?", [ids.output]);
  const m = /^~431\/(\d+)\.css$/.exec(output?.db_content ?? "");
  const files = readdirSync(dir, { recursive: true, withFileTypes: false })
    .filter((f) => String(f).endsWith(".css"))
    .map((f) => String(f).replaceAll("\\", "/"));
  return { identifier: output?.db_content ?? "", slot: m?.[1] ?? "", files };
}

afterEach(() => {
  configureStrictParity(undefined);
  storage?.close();
  for (const dir of filesDirs) rmSync(dir, { recursive: true, force: true });
  filesDirs = [];
});

describe("the asset output's file name slot", () => {
  it("assetOutputNameSlot is content-determined: identical bytes, identical slot", () => {
    const a = new TextEncoder().encode("/* compiled */");
    const b = new TextEncoder().encode("/* compiled */");
    expect(assetOutputNameSlot(a)).toBe(assetOutputNameSlot(b));
    expect(assetOutputNameSlot(a)).not.toBe(assetOutputNameSlot(new TextEncoder().encode("/* other */")));
    expect(Number.isInteger(assetOutputNameSlot(a))).toBe(true);
  });

  it("default: the same bundle bytes store under the same name across deploys (different clocks)", async () => {
    await boot();
    const early = newFilesDir();
    const late = newFilesDir();
    // Two deploys a month apart, the rule moving between two skins whose
    // compiled bundles are byte-identical (the stub emits fixed bytes).
    await engineAt(Date.UTC(2026, 0, 1), early).updateCard({ cardId: ids.allStyle, content: "Probe Skin" });
    const first = await storedIn(early);
    expect(first.slot).toBe(String(assetOutputNameSlot(new TextEncoder().encode("/* compiled */"))));
    storage.engine.expireCard((await storage.engine.fetchById(ids.allStyle))!);
    await engineAt(Date.UTC(2026, 1, 1), late).updateCard({ cardId: ids.allStyle, content: "Probe Skin Two" });
    const second = await storedIn(late);
    expect(second.slot).toBe(first.slot);
    expect(first.files).toEqual([`431/${first.slot}.css`]);
    expect(second.files).toEqual([`431/${first.slot}.css`]);
  });

  it("strict: the name is the wall clock's epoch seconds, Ruby's rule, one for one", async () => {
    configureStrictParity({
      signinDetailedErrors: false,
      revisionRestore500: false,
      skinCreate500: false,
      scriptBundleClockNames: true,
    });
    await boot();
    const early = new Date(Date.UTC(2026, 0, 1, 12, 30, 7, 500));
    const late = new Date(Date.UTC(2026, 0, 1, 12, 30, 8, 100));
    const earlyDir = newFilesDir();
    const lateDir = newFilesDir();
    await engineAt(early.getTime(), earlyDir).updateCard({ cardId: ids.allStyle, content: "Probe Skin" });
    const first = await storedIn(earlyDir);
    expect(first.slot).toBe(String(Math.floor(early.getTime() / 1000)));
    // Ruby's rule names by TIME, not content: the same bytes at a later
    // second store under a new name - the every-deploy-changes-every-URL
    // behaviour the flag reproduces.
    storage.engine.expireCard((await storage.engine.fetchById(ids.allStyle))!);
    await engineAt(late.getTime(), lateDir).updateCard({ cardId: ids.allStyle, content: "Probe Skin Two" });
    const second = await storedIn(lateDir);
    expect(second.slot).toBe(String(Math.floor(late.getTime() / 1000)));
    expect(second.slot).not.toBe(first.slot);
    expect(first.files).toEqual([`431/${first.slot}.css`]);
    expect(second.files).toEqual([`431/${second.slot}.css`]);
  });
});
