// The FILE SENDER for the general mapping (row D4), measured against the
// PINNED deck's own dispatch and its own sender branch, with the port's own
// arm RUN.
//
// The register's D4 row grades the port PARTIAL: "Ruby's general file
// mapping (ANY unregistered format suffix on a card URL sends the file,
// decko-0.20.0/lib/card_controller/response.rb:102-113) is absent; the
// port only serves bytes under /files/ (src/server/file-routes.ts), so
// /Card.bin 404s everywhere".
//
// The pinned ground is the COMMITTED capture
// (fixtures/captured/explicit-file-route-ruby-oracle.json, recorded by
// tests/server/oracle-capture-explicit-file-route-ruby.rb):
//
//   THE FOLD (response.rb:102-105):
//     def format_name_from_params
//       rf = requested_format
//       explicit_file_format?(rf) ? :file : rf.to_sym
//     end
//     def explicit_file_format? rf
//       params[:explicit_file] || !Card::Format.registered.member?(rf)
//     end
//   So a requested format that is NOT in the pinned registry (the names are
//   strings, card-1.110.0/lib/card/format/registration.rb:6-9) is the FILE
//   sender.
//
//   THE SENDER (response.rb:10-19): a file format at 200 answers
//   `send_file(*result)`, and at 404 it renders the page instead.
//
// WHAT THIS FILE PINS:
//
//   1. THE FOLD, in the port's own grammar helper: an unregistered suffix
//      is split off the mark, and a REGISTERED one is not (row D5's arm
//      owns those).
//   2. THE ANSWER: the card's OWN file, with the file's own content type,
//      the inline disposition and the uploaded-bytes defences - read from
//      the same store the /files/ route reads.
//   3. THE PINNED 404: a card with no attachment has no original extension,
//      so the file format's :core view answers the not-found view
//      (card-mod-carrierwave-0.20.0/set/type/file.rb:70-71).

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LocalAttachmentStore } from "../../src/card/attachments/attachment-store.js";
import { handleAttachmentRoute, splitUnregisteredFormatSuffix } from "../../src/server/file-routes.js";
import { createRenderTestStorage, seedCard } from "../card/render/render-test-storage.js";
import type { RenderTestStorage } from "../card/render/render-test-storage.js";

// A one-pixel PNG: the magic bytes are what the content-type detection
// reads, so the served type is the file's own.
const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);
const REVISION = 1789819200;

describe("the port's own fold, RUN (D4)", () => {
  it("an UNREGISTERED suffix is split off the mark", () => {
    expect(splitUnregisteredFormatSuffix("Alpha.bin")).toEqual({ base: "Alpha", format: "bin" });
    expect(splitUnregisteredFormatSuffix("Alpha.png")).toEqual({ base: "Alpha", format: "png" });
  });

  it("a REGISTERED suffix is NOT folded - the registry decides", () => {
    for (const name of ["css", "scss", "js", "csv", "xml", "text", "txt", "json", "rss", "html"]) {
      expect(splitUnregisteredFormatSuffix(`Alpha.${name}`), name).toBeUndefined();
    }
  });

  it("a segment with no suffix, or with an empty one, is not folded", () => {
    expect(splitUnregisteredFormatSuffix("Alpha")).toBeUndefined();
    expect(splitUnregisteredFormatSuffix("Alpha.")).toBeUndefined();
    expect(splitUnregisteredFormatSuffix(".bin")).toBeUndefined();
  });
});

describe("the port's own file sender, RUN (D4)", () => {
  let storage: RenderTestStorage;
  let filesDir: string;
  let store: LocalAttachmentStore;

  beforeAll(async () => {
    storage = await createRenderTestStorage();
    // The card WITH a file: the db_content carries the stored identifier
    // (~<card id>/<revision><ext>), and the store carries the bytes.
    await seedCard(storage, {
      id: 900,
      name: "Shot Note",
      typeId: 2,
      dbContent: `~900/${REVISION}.png`,
    });
    // The card WITHOUT a file.
    await seedCard(storage, { id: 901, name: "Plain Note", typeId: 2, dbContent: "plain body" });
    filesDir = mkdtempSync(path.join(tmpdir(), "decko-file-sender-"));
    store = new LocalAttachmentStore(filesDir);
    await store.store({ cardId: 900, actionId: REVISION, ext: ".png", bytes: PNG_BYTES });
  });

  afterAll(() => {
    storage?.close();
    rmSync(filesDir, { recursive: true, force: true });
  });

  const deps = () => ({
    driver: storage.fetcher.driver,
    fetchEngine: storage.fetcher,
    attachmentStore: store,
    createEngine: () => {
      throw new Error("the file sender serves reads only");
    },
  });

  it("an unregistered suffix answers the card's OWN file", async () => {
    const response = (await handleAttachmentRoute(
      new Request("http://test.test/Shot_Note.png"),
      deps(),
    )) as Response;
    expect(response.status).toBe(200);
    // The file's own content type, not the card's html page.
    expect(response.headers.get("content-type")).toBe("image/png");
    // The uploaded-bytes defences, the same ones the /files/ route ships.
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    // The inline disposition (the pinned rule: attachment only when the
    // requested format is literally "file").
    expect(response.headers.get("content-disposition")).toContain("inline");
    const body = new Uint8Array(await response.arrayBuffer());
    expect(Array.from(body)).toEqual(Array.from(PNG_BYTES));
  });

  it("a card with no attachment answers the pinned 404", async () => {
    // The file format's :core view returns the not-found view when the
    // card has no attachment (card-mod-carrierwave-0.20.0/set/type/
    // file.rb:70-71: `return _render_not_found unless attachment_format`),
    // and the port answers the same status.
    const response = (await handleAttachmentRoute(
      new Request("http://test.test/Plain_Note.png"),
      deps(),
    )) as Response;
    expect(response.status).toBe(404);
  });

  it("a card that does not exist answers the pinned 404", async () => {
    const response = (await handleAttachmentRoute(
      new Request("http://test.test/Never_Existed.png"),
      deps(),
    )) as Response;
    expect(response.status).toBe(404);
  });

  it("a REGISTERED suffix is NOT the file sender", async () => {
    // The registry decides (the pinned membership test), so "/Shot_Note.css"
    // is the card "Shot Note" in the css format (row D5's arm), never the
    // file sender.
    const response = await handleAttachmentRoute(
      new Request("http://test.test/Shot_Note.css"),
      deps(),
    );
    expect(response).toBeNull();
  });
});
