// The carrierwave WRITE/output seam: the four views that need
// "carrierwave/fog storage or a live file write"
//
//   card-mod-assets      :asset_output_url  (set/abstract/asset_outputter.rb:61-63)
//   card-mod-assets      :not_found         (set/right/asset_output.rb:24-29)
//   card-mod-carrierwave :input             (set/type/file.rb:119-125, html)
//   card-mod-carrierwave :preview_editor    (set/type/file.rb:127-129, html)
//
// These four view names have no captured rendered bytes to pin against, so
// the byte assertions here are against the shape the gem source and the
// files port's attachment machinery produce — NOT rendered-unpinned ports.
//
// The write half (storeAssetOutput) is the port of the asset outputter's
// live write (asset_outputter.rb:20-59 lock/store_output/handle_file +
// update_asset_output_live) against the files port's attachment machinery
// (CardActionEngine attachment + LocalAttachmentStore). The url bytes it
// produces match the oracle's card-level asset_output_url
// ("/files/~447/1790661047.css" — the tilde MARK form the /files routes
// serve).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import { defaultDeckLoader } from "../../../src/card/mod-loader/default-mod-deck.js";
import {
  assetOutputUrlView,
  assetOutputNotFoundView,
} from "../../../src/card/mod-loader/mods/card-mod-assets.js";
import {
  fileInputView,
  imageInputView,
  filePreviewEditorView,
  numberToHumanSize,
} from "../../../src/card/mod-loader/mods/card-mod-carrierwave.js";
import {
  localAttachmentUrl,
  storeAssetOutput,
} from "../../../src/card/attachments/asset-output-write.js";
import { DeckoName } from "../../../src/card/name.js";
import { UnsupportedViewError, Voo, type RenderFormat, type ViewContext } from "../../../src/card/render/format.js";
import { scratchDir } from "../../support/scratch-dir.mjs";

// ---------------------------------------------------------------------------
// seeds — the shapes the four views read
// ---------------------------------------------------------------------------

/** The ids the byte assertions below substitute into the oracle templates. */
const SET_TYPE_ID = 6; // a cardtype card NAMED "Set" (the outputter anchor type)
const SETTING_TYPE_ID = 7; // a cardtype card NAMED "Setting" (the rule check)
const CARDTYPE_TYPE_ID = 5;
const FILE_TYPE_ID = 20; // the File cardtype card (codename "file")
const OUTPUTTER_ID = 447; // *all+*style — the TypePlusRight::Set::Style card
const ASSET_OUTPUT_SETTING_ID = 12; // the *asset output Setting card

let storage: RenderTestStorage | undefined;

beforeAll(async () => {
  // Bind the composed default deck BEFORE the engine is constructed: the
  // RenderEngine constructor reads the process-wide default loader (the
  // seam defaultDeckLoader binds), and the chain dispatch needs it. A
  // second call rebinds to a fresh loader (the boot seam's reload
  // semantics).
  defaultDeckLoader();
  storage = await createRenderTestStorage();
  const s = storage;
  await seedCard(s, { id: CARDTYPE_TYPE_ID, name: "Cardtype", codename: "cardtype", typeId: CARDTYPE_TYPE_ID });
  await seedCard(s, { id: SET_TYPE_ID, name: "Set", codename: "set", typeId: CARDTYPE_TYPE_ID });
  await seedCard(s, { id: SETTING_TYPE_ID, name: "Setting", codename: "setting", typeId: CARDTYPE_TYPE_ID });
  await seedCard(s, { id: 2, name: "RichText", codename: "basic", typeId: CARDTYPE_TYPE_ID });
  await seedCard(s, { id: FILE_TYPE_ID, name: "File", codename: "file", typeId: CARDTYPE_TYPE_ID });
  // the outputter: a *style rule over the *all Set (TypePlusRight::Set::Style
  // includes Abstract::AssetOutputter — card-mod-style set/type_plus_right/
  // set/style.rb:1). The set keys the gate reads need the LEFT type named
  // "Set" and the compound name *all+*style.
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: SET_TYPE_ID });
  await seedCard(s, { id: 11, name: "*style", codename: "style", typeId: SETTING_TYPE_ID });
  await seedCard(s, {
    id: OUTPUTTER_ID,
    name: "*all+*style",
    leftId: 10,
    rightId: 11,
    typeId: 2,
  });
  await seedCard(s, {
    id: ASSET_OUTPUT_SETTING_ID,
    name: "*asset output",
    codename: "asset_output",
    typeId: SETTING_TYPE_ID,
  });
  // the output's file card: db_content is the local identifier the url
  // builder contextualizes (oracle: "~447/1790661047.css" -> "/files/~447/
  // 1790661047.css")
  await seedCard(s, {
    id: 448,
    name: "*all+*style+*asset output",
    leftId: OUTPUTTER_ID,
    rightId: ASSET_OUTPUT_SETTING_ID,
    typeId: FILE_TYPE_ID,
    dbContent: "~447/1790661047.css",
  });
  // the non-outputter probe: a FILE-typed left (plain Card — the oracle's
  // "left_is_asset_outputter": false branch) with an *asset output child
  await seedCard(s, { id: 500, name: "Oracle Cw Local", typeId: FILE_TYPE_ID, dbContent: "~1347/5031.png" });
  await seedCard(s, {
    id: 501,
    name: "Oracle Cw Local+*asset output",
    leftId: 500,
    rightId: ASSET_OUTPUT_SETTING_ID,
    typeId: FILE_TYPE_ID,
    dbContent: "",
  });
  // a web-content file card for the :input no_upload branch (the oracle's
  // config-gated text_field bytes)
  await seedCard(s, {
    id: 502,
    name: "Oracle Cw Web",
    typeId: FILE_TYPE_ID,
    dbContent: "http://example.com/oracle_cw_probe.png",
  });
}, 60_000);

afterAll(() => {
  storage?.close();
});

// ---------------------------------------------------------------------------
// :asset_output_url — oracle: "/files/~447/1790661047.css"
// ---------------------------------------------------------------------------

describe("card-mod-assets :asset_output_url (oracle-pinned)", () => {
  it("renders the child file card's carrierwave url from the local identifier", async () => {
    const s = storage!;
    // oracle asset_output_url_after: "/files/~447/1790661047.css"
    // (identifier "~447/1790661047.css" — the TILDE mark stays in the url,
    // the /files routes' current grammar /files/:mark/:rev_id.:format)
    const out = await s.engine.render("*all+*style", "asset_output_url");
    expect(out).toBe("/files/~447/1790661047.css");
  });

  it("renders empty when the outputter card has no asset output child (Ruby: file&.url -> nil)", async () => {
    const s = storage!;
    // The capture's view_asset_output_url_before arm shape: an OUTPUTTER
    // card with no +*asset output child. The includer set is anchored
    // left-TYPE "Set" + right "*style" (type_plus_right "set+style" —
    // card-mod-style set/type_plus_right/set/style.rb:1, the only concrete
    // include beside card-mod-script's script.rb:1), so the probe card is
    // a Set-typed left with a +*style right, as *all+*style is. The view
    // body runs, file&.url answers nil, the bytes are "".
    await seedCard(s, { id: 60, name: "*probe", codename: "probe", typeId: SET_TYPE_ID });
    await seedCard(s, { id: 61, name: "*probe+*style", leftId: 60, rightId: 11, typeId: 2 });
    const out = await s.engine.render("*probe+*style", "asset_output_url");
    expect(out).toBe("");
  });

  it("raises unsupported-view off the includer set (Ruby: render.rb:59-63)", async () => {
    const s = storage!;
    // "Set+*once": the left card "Set" is CARDTYPE-typed, so this card's
    // type_plus_right anchor is "cardtype+once" — no set module includes
    // Abstract::AssetOutputter there (gem-wide grep: only
    // type_plus_right/set/style.rb:1 and type_plus_right/set/script.rb:1),
    // so Ruby's view lookup raises unsupported-view
    // (lib/card/format/render.rb:59-63). The earlier "" pin on this arm
    // extrapolated the view past its inclusion set — the receipt
    // (fork-recount-2026-09-29) records the correction.
    await seedCard(s, { id: 62, name: "*once", typeId: SETTING_TYPE_ID });
    await seedCard(s, { id: 63, name: "Set+*once", leftId: 6, rightId: 62, typeId: 2 });
    await expect(s.engine.render("Set+*once", "asset_output_url")).rejects.toThrow(
      UnsupportedViewError,
    );
  });
});

// ---------------------------------------------------------------------------
// :not_found on right/asset_output — oracle: the live branch returns the
// url bytes; the super() branch delegates to the standard not_found
// ---------------------------------------------------------------------------

describe("card-mod-assets :not_found on +*asset output (oracle-pinned)", () => {
  it("an outputter left renders the asset output url (the live-write branch bytes)", async () => {
    const s = storage!;
    // oracle view_not_found_first: "/files/~447/1790661047.css"
    // (update_asset_output_live's `card_path asset_output_url` return; the
    // re-write side effect is the async storeAssetOutput seam — a ViewFn is
    // synchronous, so the write is a composition-layer call)
    const out = await s.engine.render("*all+*style+*asset output", "not_found");
    expect(out).toBe("/files/~447/1790661047.css");
  });

  it("a non-outputter left delegates to super() — the engine's own not_found bytes", async () => {
    const s = storage!;
    // oracle not_found_super.view_not_found: the html not_found FRAME the
    // engine's chain produces for this card (left is a plain Card, not an
    // Abstract::AssetOutputter). The view's own contract is the DELEGATION:
    // its bytes must equal what the engine renders for :not_found without
    // the right/asset_output registration (the frame gap itself is the
    // card-mod-format surface, not this view's).
    const direct = await s.engine.render("Oracle Cw Local+*asset output", "not_found");
    expect(typeof direct).toBe("string");
    expect(direct).not.toBe("/files/~1347/5031.png");
    expect(direct.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// :input on type/file — oracle: the file_chooser haml bytes
// ---------------------------------------------------------------------------

/** The oracle's file_chooser byte template (carrierwave-write-seam-oracle.json
 *  view_input), with the two DB-local values parameterized: the type id the
 *  attachment_type_id hidden field carries and the card's url key. */
function fileChooserOracleBytes(typeId: number, urlKey: string, actionText: string): string {
  return (
    "<div class='choose-file'>\n" +
    "\n" +
    "<span class='btn btn-secondary fileinput-button'>\n" +
    "<i class=\"notranslate material-icons\">cloud_upload</i>\n" +
    `<span>${actionText} File...</span>\n` +
    "<input class='file-upload slotter form-control' id='card_file' name='card[file]' type='file'>\n" +
    `<input type="hidden" name="attachment_type_id" id="attachment_type_id" value="${typeId}" autocomplete="off" />\n` +
    "<input class=\"attachment_card_name form-control\" value=\"\" autocomplete=\"off\" type=\"hidden\" name=\"card[file]\" id=\"card_file\" />\n" +
    `<input type="hidden" name="file_card_name" id="file_card_name" value="${urlKey}" autocomplete="off" />\n` +
    "</span>\n" +
    "</div>\n" +
    "<div class='progress mb-2' id='progress' style='display: none;'>\n" +
    "<div class='progress-bar progress-bar-success' style='width: 0%;'></div>\n" +
    "</div>\n" +
    "<div class='chosen-file'></div>\n"
  );
}

describe("card-mod-carrierwave :input on type/file (oracle-pinned)", () => {
  it("renders the file_chooser bytes for a stored local file card (Replace)", async () => {
    const s = storage!;
    const out = await s.engine.render("Oracle Cw Local", "input");
    expect(out).toBe(fileChooserOracleBytes(FILE_TYPE_ID, "Oracle_Cw_Local", "Replace"));
  });

  it("a NEW file card says Add, not Replace (oracle view_input_new_card)", async () => {
    // Card.new shape: the action text flips; every other byte identical.
    // Rendered through the exported view fn (an unsaved card has no fetch
    // row); the harness mirrors makeCtx from card-mod-carrierwave.test.ts.
    const ctx = makeFileCtx("Oracle Cw New", "", { isNew: true });
    const out = fileInputView(ctx);
    expect(out).toBe(fileChooserOracleBytes(FILE_TYPE_ID, "Oracle_Cw_New", "Add"));
  });

  it("no_upload (config web) renders the text_field bytes (oracle followup)", async () => {
    const s = storage!;
    s.engine.fileStorage = "web";
    try {
      const out = await s.engine.render("Oracle Cw Web", "input");
      // oracle followup view_input_web_config
      expect(out).toBe(
        '<input class="d0-card-content form-control" type="text" ' +
          'value="http://example.com/oracle_cw_probe.png" ' +
          'name="card[content]" id="card_content" />',
      );
    } finally {
      s.engine.fileStorage = undefined;
    }
  });
});

// ---------------------------------------------------------------------------
// :input on type/image — gem-derived pin (image/html_views.rb:2
// `include File::HtmlFormat`): the image html format inherits the file
// module's :input, so image cards render the SAME file_chooser haml with
// the image mount substituted (card.type_code in the id/name, "Image"
// humanized in the action text, and the image preview override in the
// `= preview` line with its new-card nil guard, html_views.rb:37).
// DISCLOSED: code-read pin from the haml + html_views sources — no oracle
// capture of an image edit form exists (the cwinput oracle rendered FILE
// cards), so these bytes are gem-derived, not oracle-captured.
// ---------------------------------------------------------------------------

describe("card-mod-carrierwave :input on type/image (gem-derived pin)", () => {
  it("a NEW image card renders the chooser with the image mount and the empty preview line", () => {
    const ctx = makeFileCtx("Oracle Cw Img", "", { isNew: true });
    const out = imageInputView(ctx);
    expect(out).toBe(
      "<div class='choose-file'>\n" +
        "\n" +
        "<span class='btn btn-secondary fileinput-button'>\n" +
        '<i class="notranslate material-icons">cloud_upload</i>\n' +
        "<span>Add Image...</span>\n" +
        "<input class='file-upload slotter form-control' id='card_image' name='card[image]' type='file'>\n" +
        `<input type="hidden" name="attachment_type_id" id="attachment_type_id" value="${FILE_TYPE_ID}" autocomplete="off" />\n` +
        '<input class="attachment_card_name form-control" value="" autocomplete="off" type="hidden" name="card[image]" id="card_image" />\n' +
        '<input type="hidden" name="file_card_name" id="file_card_name" value="Oracle_Cw_Img" autocomplete="off" />\n' +
        "</span>\n" +
        "</div>\n" +
        "<div class='progress mb-2' id='progress' style='display: none;'>\n" +
        "<div class='progress-bar progress-bar-success' style='width: 0%;'></div>\n" +
        "</div>\n" +
        "<div class='chosen-file'></div>\n",
    );
  });

  it("an existing image card carries the attachment-preview line and Replace Image text", () => {
    const ctx = makeFileCtx("Oracle Cw Img", "~1347/5031.png");
    (ctx.fmt as unknown as { renderView: (v: string, o?: Record<string, unknown>) => string })
      .renderView = () => '<img src="/files/~1347/5031-medium.png" alt="Oracle Cw Img">';
    const out = imageInputView(ctx);
    expect(out).toContain('<div class="attachment-preview" id="Oracle Cw Img-preview">');
    expect(out).toContain("<span>Replace Image...</span>");
    expect(out).toContain("id='card_image' name='card[image]'");
  });
});

// ---------------------------------------------------------------------------
// :preview_editor on type/file — oracle: the preview_editor haml bytes
// ---------------------------------------------------------------------------

describe("card-mod-carrierwave :preview_editor on type/file (oracle-pinned)", () => {
  it("renders the chosen-file editor bytes (name, human size, delete button)", () => {
    // oracle view_preview_editor, parameterized: the hidden input's value is
    // the selected action id (parsed from the identifier per SelectedAction),
    // the name is the upload's original filename (the action comment — the
    // composition passes it), the size renders through Rails'
    // number_to_human_size (oracle ladder: 1234 -> "1.21 KB").
    const ctx = makeFileCtx("Oracle Cw Local", "~1347/5031.png");
    ctx.voo.opts["original_filename"] = "oracle_cw_probe.png";
    ctx.voo.opts["attachment_size"] = 1234;
    const out = filePreviewEditorView(ctx);
    expect(out).toBe(
      "<div class='chosen-file'>\n" +
        "<input name='card[action_id_of_cached_upload]' type='hidden' value='5031'>\n" +
        "<div class='d-flex'>\n" +
        "\n" +
        "<div class='d-flex flex-column justify-content-between ml-2 w-100'>\n" +
        "<div>\n" +
        "<p class='name'>\n" +
        "oracle_cw_probe.png\n" +
        "</p>\n" +
        "<span class='size'>\n" +
        "1.21 KB\n" +
        "</span>\n" +
        "</div>\n" +
        "<div class='align-self-end'>\n" +
        "<button class='btn btn-danger delete cancel-upload' data-type='DELETE'>\n" +
        "<i class=\"notranslate material-icons\">delete</i>\n" +
        "<span>\n" +
        "Delete\n" +
        "</span>\n" +
        "</button>\n" +
        "</div>\n" +
        "</div>\n" +
        "</div>\n" +
        "</div>\n",
    );
  });

  it("attachment_upload params ride the gsub to the cached-upload action name", () => {
    // cached_upload_card_name (file.rb:144-146): params[:attachment_upload]
    // .gsub(/\[\w+\]$/, "[action_id_of_cached_upload]") — "card[image]"
    // normalizes to the same hidden name "card[file]" does.
    const ctx = makeFileCtx("Oracle Cw Local", "~1347/5031.png");
    ctx.voo.opts["attachment_upload"] = "card[image]";
    const out = filePreviewEditorView(ctx);
    expect(out).toContain("<input name='card[action_id_of_cached_upload]' type='hidden'");
  });

  it("the dispatch lands through the engine (registration, not just the export)", async () => {
    const s = storage!;
    const out = await s.engine.render("Oracle Cw Local", "preview_editor");
    expect(out.startsWith("<div class='chosen-file'>\n")).toBe(true);
    expect(out).toContain("value='5031'");
  });
});

// ---------------------------------------------------------------------------
// number_to_human_size — the oracle ladder (runner probe, 2026-09-28)
// ---------------------------------------------------------------------------

describe("numberToHumanSize — the Rails ladder (oracle-pinned)", () => {
  it("matches Rails' number_to_human_size on every probed size", () => {
    // oracle: {"0":"0 Bytes","1":"1 Byte","512":"512 Bytes","1023":
    // "1023 Bytes","1024":"1 KB","1025":"1 KB","1234":"1.21 KB",
    // "1536":"1.5 KB","9999":"9.76 KB","10000":"9.77 KB","1048576":"1 MB",
    // "1572864":"1.5 MB","1073741824":"1 GB"}
    const ladder: [number, string][] = [
      [0, "0 Bytes"],
      [1, "1 Byte"],
      [512, "512 Bytes"],
      [1023, "1023 Bytes"],
      [1024, "1 KB"],
      [1025, "1 KB"],
      [1234, "1.21 KB"],
      [1536, "1.5 KB"],
      [9999, "9.76 KB"],
      [10000, "9.77 KB"],
      [1048576, "1 MB"],
      [1572864, "1.5 MB"],
      [1073741824, "1 GB"],
    ];
    for (const [size, expected] of ladder) {
      expect(numberToHumanSize(size)).toBe(expected);
    }
  });
});

// ---------------------------------------------------------------------------
// the write seam — storeAssetOutput over the files-port machinery
// ---------------------------------------------------------------------------

describe("storeAssetOutput — update_asset_output_live's write half", () => {
  it("creates the missing +*asset output child, stores bytes, returns the /files url", async () => {
    const harness = await makeWriteHarness();
    try {
      await harness.seedOutputter("Style Probe");
      const { url } = await storeAssetOutput(
        { engine: harness.engine, fetchByName: harness.fetchByName },
        "Style Probe",
        ".probe { color: red; }",
        ".css",
      );
      expect(url).toMatch(/^\/files\/~\d+\/\d+\.css$/);
      // the identifier form the oracle pins: ~<card_id>/<action_id><ext>
      const child = await harness.fetchByName("Style Probe+*asset output");
      expect(child).toBeDefined();
      expect(child?.dbContent).toMatch(/^~\d+\/\d+\.css$/);
      expect(url).toBe(localAttachmentUrl(child?.dbContent ?? ""));
    } finally {
      harness.close();
    }
  });

  it("re-stores over an existing child (the update path) and refreshes the url", async () => {
    const harness = await makeWriteHarness();
    try {
      await harness.seedOutputter("Style Probe");
      const { url: first } = await storeAssetOutput(
        { engine: harness.engine, fetchByName: harness.fetchByName },
        "Style Probe",
        "v1",
        ".css",
      );
      const { url: second } = await storeAssetOutput(
        { engine: harness.engine, fetchByName: harness.fetchByName },
        "Style Probe",
        "v2",
        ".css",
      );
      expect(second).toMatch(/^\/files\/~\d+\/\d+\.css$/);
      expect(second).not.toBe(first);
      const child = await harness.fetchByName("Style Probe+*asset output");
      expect(localAttachmentUrl(child?.dbContent ?? "")).toBe(second);
    } finally {
      harness.close();
    }
  });

  it("localAttachmentUrl keeps the ~ mark (oracle: /files/~447/1790661047.css)", () => {
    expect(localAttachmentUrl("~447/1790661047.css")).toBe("/files/~447/1790661047.css");
    expect(localAttachmentUrl("http://x/y.png")).toBe("http://x/y.png");
    expect(localAttachmentUrl("")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// harness helpers
// ---------------------------------------------------------------------------

/** A ViewContext over a file-typed card (the same shape
 *  card-mod-carrierwave.test.ts's makeCtx builds). */
function makeFileCtx(
  name: string,
  dbContent: string,
  opts: { isNew?: boolean } = {},
): ViewContext {
  const card = {
    dbContent,
    name: { s: name, safeKey: name.replace(/\W+/g, "_"), isCompound: false, urlKey: () => name.replace(/\s+/g, "_") } as unknown as DeckoName,
    typeName: "File",
    typeCode: "file",
    typeId: FILE_TYPE_ID,
    id: opts.isNew === true ? undefined : 1347,
    record: {} as never,
    key: name.toLowerCase().replace(/\s+/g, "_"),
    setKeys: "ALL TYPE-file",
    unknown: false,
  };
  const fmt = {
    card,
    engine: { fileStorage: undefined },
    urlKey: () => name.replace(/\s+/g, "_"),
  } as unknown as RenderFormat;
  return { fmt, voo: new Voo(undefined, "input", {}) };
}

/** The write-path harness: driver + fetch engine + action engine with the
 *  LocalAttachmentStore, composed like tests/server/file-routes.test.ts. */
async function makeWriteHarness() {
  const { LocalSqliteDriver } = await import("../../../src/server/drivers/local-sqlite.js");
  const { FetchEngine } = await import("../../../src/card/fetch.js");
  const { CardActionEngine } = await import("../../../src/card/actions/card-action-engine.js");
  const { LocalAttachmentStore } = await import("../../../src/card/attachments/attachment-store.js");
  const { splitSqlStatements } = await import("../render/render-test-storage.js");

  const driver = new LocalSqliteDriver({ path: ":memory:" });
  const ddl = readFileSync(
    fileURLToPath(new URL("../../../db/schema.sqlite.sql", import.meta.url)),
    "utf8",
  );
  for (const statement of splitSqlStatements(ddl)) {
    await driver.query(statement, []);
  }
  // the write path's minimum (the same seeds tests/server/file-routes.test.ts
  // uses): the codename-bearing type cards + the *all+*default rule the
  // type-assignment walk reads.
  const CARDTYPE_ID = 5;
  const seedSimple = async (id: number, name: string, codename?: string, typeId?: number) => {
    await driver.query(
      "INSERT INTO cards (id, name, key, codename, type_id, trash, created_at, updated_at, creator_id, updater_id) VALUES (?, ?, ?, ?, ?, 0, '2026-09-28 00:00:00.000', '2026-09-28 00:00:00.000', 1, 1)",
      [id, name, name.toLowerCase().replace(/\s+/g, "_"), codename ?? null, typeId ?? CARDTYPE_ID],
    );
  };
  await seedSimple(1, "RichText", "basic", CARDTYPE_ID);
  await seedSimple(CARDTYPE_ID, "Cardtype", "cardtype", CARDTYPE_ID);
  // *all is TYPED SET (typeId SET_TYPE_ID) — the who_can batch joins rule
  // rows' left cards on the 'set' codename card's id
  // (view-task-rules.ts viewTaskPermissionStatements; proven fixture shape
  // tests/server/file-routes.test.ts:161-165), so the fallback rules below
  // resolve only with *all typed Set.
  await seedSimple(7, "*all", "all", SET_TYPE_ID);
  await seedSimple(8, "*default", "default", CARDTYPE_ID);
  await driver.query(
    "INSERT INTO cards (id, key, left_id, right_id, type_id, trash, created_at, updated_at, creator_id, updater_id) VALUES (?, ?, ?, ?, ?, 0, '2026-09-28 00:00:00.000', '2026-09-28 00:00:00.000', 1, 1)",
    [9, "*all+*default", 7, 8, 1],
  );
  await seedSimple(20, "File", "file", CARDTYPE_ID);
  // The write-rule machinery every real decko deck bootstraps (mirrors
  // tests/server/file-routes.test.ts:170-186 <- actions-test-storage.ts
  // seedStandardDeck rows 300-307; card-mod-permissions-0.20.0 data/real.yml
  // all-fields block :14-19 bootstraps *all+*create Anyone Signed In):
  // under the deny-by-default write gate a rule-less
  // deck refuses every save (who_can -> [] -> among? -> false,
  // permissions.rb:47-49/:100-118), and the engine's canWrite hook can
  // never allow what the rules deny (card-action-engine.ts:2094-2100) —
  // the storeAssetOutput create/re-store paths under test need the *all
  // fallbacks -> [[Anyone]] (account_holder.rb:31-37: every actor passes
  // the Anyone arm; this suite exercises the asset-outputter write
  // machinery, not the permission matrix). Scoped to this harness.
  await seedSimple(6, "Set", "set", 1);
  await seedSimple(30, "*create", "create", 1);
  await seedSimple(31, "*update", "update", 1);
  await seedSimple(32, "*delete", "delete", 1);
  await seedSimple(33, "Anyone", "anyone", 1);
  for (const [ruleId, rightId, ruleName] of [
    [34, 30, "*all+*create"],
    [35, 31, "*all+*update"],
    [36, 32, "*all+*delete"],
  ] as const) {
    await driver.query(
      "INSERT INTO cards (id, name, key, left_id, right_id, type_id, trash, created_at, updated_at, creator_id, updater_id, db_content) VALUES (?, ?, ?, ?, ?, ?, 0, '2026-09-28 00:00:00.000', '2026-09-28 00:00:00.000', 1, 1, ?)",
      [ruleId, ruleName, ruleName, 7, rightId, SET_TYPE_ID, "[[Anyone]]"],
    );
    await driver.query(
      "INSERT INTO card_references (referer_id, referee_key, referee_id, ref_type, is_present) VALUES (?, 'anyone', 33, 'L', NULL)",
      [ruleId],
    );
  }
  const fetchEngine = new FetchEngine(driver);
  const filesDir = scratchDir("decko-ts-cwwrite-seam-test-");
  const store = new LocalAttachmentStore(filesDir);
  const actor = { id: 1, name: DeckoName.parse("Joe Admin") } as never;
  const engine = new CardActionEngine(fetchEngine, {
    actor,
    ipAddress: "192.0.2.7",
    now: () => new Date("2026-09-28T12:00:00Z"),
    canWrite: async () => true,
    attachmentStore: store,
  });
  return {
    engine,
    store,
    fetchByName: (name: string) => fetchEngine.fetchByName(name),
    async seedOutputter(name: string) {
      const res = await engine.createCard({ name, typeCode: "basic" });
      return res;
    },
    close() {
      driver.close();
      rmSync(filesDir, { recursive: true, force: true });
    },
  };
}
