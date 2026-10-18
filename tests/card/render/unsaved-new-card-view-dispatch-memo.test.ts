// An unsaved new card's view dispatch must not be served from another
// unsaved new card's memo entry (exhaustive ACT-143 "F1 Upload a file" and
// ACT-148 "F7 Member uploads a file").
//
// Mechanism pinned here: RenderEngine.resolveView memoizes the resolved
// ViewFn under `<format>|<card_key>|<view>|g<modGeneration>`. Unsaved cards
// do not have unique keys — an unnamed new card's key is "" — so before the
// guard (src/card/render.ts resolveView, "UNSAVED CARDS ARE NEVER MEMOIZED")
// the FIRST typed /new/<Type> form rendered in a process decided the :input
// ViewFn for every later typed new card: /new/Basic's generic rich-text
// editor was served to /new/File, the type/file :input file_chooser never
// ran, and the upload input[type=file] the F1/F3/F7 contract names was
// absent from the page. Ruby resolves a view per format object with no
// cross-card memo at all, so the memo is sound only where the key is unique
// per card.
//
// The pin is two synthetic RenderCards that share the empty new-card key,
// one typed File and one typed Basic, dispatched through ONE engine in one
// process. With the memo the second dispatch returns the first's ViewFn;
// with the guard each resolves on its own set chain.

import { describe, expect, it } from "vitest";

/** The two new-card prototypes an editor request carries: same empty key,
 *  different types, no id. isNew mirrors the seated-new-card shape
 *  (id undefined, record.isNew true). */
function newCard(setKeys: string, typeCode: string, dbContent = "") {
  return {
    key: "",
    setKeys,
    typeCode,
    dbContent,
    typeName: undefined,
    typeId: undefined,
    id: undefined,
    dbContentType: "text/html",
    name: { s: "" },
    record: { isNew: true },
  } as never;
}

describe("unsaved new-card view dispatch", () => {
  it("resolves each typed new card's :input view on its own set chain", { timeout: 120_000 }, async () => {
    const { defaultDeckLoader } = await import("../../../src/card/mod-loader/default-mod-deck.js");
    const { RenderEngine } = await import("../../../src/card/render.js");
    const { fileInputView } = await import("../../../src/card/mod-loader/mods/card-mod-carrierwave.js");

    const loader = defaultDeckLoader();
    const engine = new RenderEngine({} as never);
    engine.modLoader = loader;

    // The File card's :input must reach type/file's file_chooser view, not a
    // neighbor's generic editor — the assertion ACT-143's input[type=file]
    // locate makes against the rendered page.
    const fileView = engine.resolveView(newCard("ALL TYPE-file", "file"), "input");
    expect(fileView).toBe(fileInputView);

    // A Basic new card dispatched afterwards in the SAME engine resolves its
    // own chain, and a second File dispatch still resolves the chooser: with
    // the shared-key memo in place the File lookups above/ here return
    // whichever unsaved card dispatched first.
    const basicView = engine.resolveView(newCard("ALL TYPE-basic", "basic"), "input");
    expect(basicView).not.toBe(fileInputView);
    expect(engine.resolveView(newCard("ALL TYPE-file", "file"), "input")).toBe(fileInputView);

    // The chain the guard restores is a real one: type/file registers :input.
    expect(loader.viewChain("ALL TYPE-file", "input", "html")[0]?.viewFn).toBe(fileInputView);
  });

  it("still memoizes saved cards, whose keys are unique", async () => {
    const { defaultDeckLoader } = await import("../../../src/card/mod-loader/default-mod-deck.js");
    const { RenderEngine } = await import("../../../src/card/render.js");

    const engine = new RenderEngine({} as never);
    engine.modLoader = defaultDeckLoader();
    const saved = {
      key: "Date 1",
      setKeys: "ALL TYPE-date SELF-Date_1",
      typeCode: "date",
      dbContent: "2026-01-11",
      typeName: undefined,
      typeId: 1,
      id: 7,
      name: { s: "Date 1" },
      record: { isNew: false },
    } as never;
    const first = engine.resolveView(saved, "core");
    expect(engine.resolveView(saved, "core")).toBe(first);
    // The memo is doing work for stored cards: the same ViewFn identity comes
    // back without a second chain walk (identity is the observable).
    expect(first).toBe(engine.resolveView(saved, "core"));
  });
});