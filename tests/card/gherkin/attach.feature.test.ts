// Gherkin port — attach.feature (decko-commons/decko
// decko/features/attach.feature, "File Upload", 7 scenarios).
//
// The upstream scenarios are @javascript Capybara flows over the upload
// form; this port executes each scenario's business behavior against the
// attachment write path (CardActionEngine attachment events +
// LocalAttachmentStore — card-mod-carrierwave's mount machinery, the same
// path the /files POST route drives). Per-scenario state is named in each
// it() header: GREEN (the engine behavior covers the scenario) or
// NOT-PORTABLE-TODAY with the missing capability named.
//
// Named boundary (test setup, consistent with the other slices): the
// editor's live form states ("I should see file 'file.txt 9 Bytes'",
// "Add File...", "Save and Close") are browser surfaces. The
// engine-observable facts behind them are the stored identifier, the
// on-disk bytes, and the rendered :core view.

import { describe, expect, it } from "vitest";
import {
  closeAttachmentWorld,
  freshAttachmentWorld,
  storedFileBytes,
  thenFileCardShowsDownload,
  walkStoredTree,
  whenUploadFile,
  ATTACH_IDS,
  type AttachmentWorld,
} from "./gherkin-attachment-steps.js";
import { thenCardTrashed, whenDeleteCard } from "./gherkin-steps.js";
import { seedCard } from "./gherkin-storage.js";

/** The fixtures' upload payloads. "file.txt" is the 9-byte text the
 *  upstream asserts as "file.txt 9 Bytes"; the png/jpg bytes are
 *  synthetic (extension-driven behavior only — the store's extension
 *  handling never reads the bytes' magic). */
const FILE_TXT = new Uint8Array(9).fill(0x61); // "aaaaaaaaa" — 9 Bytes
const PNG_BYTES = (() => {
  const b = new Uint8Array(512).fill(0x41, 16);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  return b;
})();
const JPG_BYTES = (() => {
  const b = new Uint8Array(700).fill(0x42, 16);
  b.set([0xff, 0xd8, 0xff], 0);
  return b;
})();

describe("Gherkin port: attach.feature / File Upload", () => {
  let aw: AttachmentWorld;

  // ---------------------------------------------------------------------
  // Scenario: Block creating a new empty file — GREEN (engine validates)
  // ---------------------------------------------------------------------

  it("GREEN / Block creating a new empty file — a File save without an upload is rejected ('is missing')", async () => {
    aw = await freshAttachmentWorld();
    // upstream: When I go to new File / And I fill in "card_name" with
    // "a test file" / And I press "Submit" / Then I should see "Problems
    // with" / And I should see "is missing"
    //
    // The rejection IS validate_file_exist (card-mod-carrierwave
    // set/abstract/attachment.rb:26-34, on: :create): the save refuses and
    // the error message carries "is missing" ("Problems with" is the form
    // re-render's banner — the browser shell this port names as out of
    // scope).
    await expect(
      aw.engine.createCard({ name: "a test file", typeCode: "file" }),
    ).rejects.toMatchObject({
      code: "attachment-missing",
      message: "Validation failed: File is missing",
    });
  });

  // ---------------------------------------------------------------------
  // Scenario: Uploading a file — GREEN (upload, download view, delete,
  // re-upload)
  // ---------------------------------------------------------------------

  it("GREEN / Uploading a file — stored at ~<cid>/<aid>.txt with the bytes, renders 'Download <name>', deletes, re-uploads", async () => {
    aw = await freshAttachmentWorld();
    // upstream: When I go to new File / And I upload the file "file.txt" /
    // Then I should see file "file.txt 9 Bytes"
    //
    // The editor's unnamed temp-card flow collapses to one save in the
    // engine (the port's upload creates the card in the same act); the
    // business facts the preview asserts are the stored identifier and the
    // byte count, asserted at the store level.
    const identifier = await whenUploadFile(aw, {
      name: "a test file",
      bytes: FILE_TXT,
      originalFilename: "file.txt",
    });
    expect(identifier).toMatch(/^~\d+\/\d+\.txt$/);
    const stored = await storedFileBytes(aw, identifier);
    expect(stored.length).toBe(9); // the "9 Bytes" fact

    // upstream: Then I should see "Download a test file" (the Submit
    // arm's landing view — the file card's :core download anchor).
    await thenFileCardShowsDownload(aw, "a test file");

    // upstream: When I press "Delete" / Then I should see "Add File..." —
    // the removal: the card is trashed (trash.rb:11-21); the editor's
    // empty-state banner is the browser shell.
    await whenDeleteCard(aw.world, "a test file");
    await thenCardTrashed(aw.world, "a test file");

    // upstream: When I upload the file "file.txt" / And I fill in
    // "card_name" with "a test file" / And I press "Submit" / Then I should
    // see "Download a test file" — the re-upload under the same name (the
    // trashed row is revived, trash.rb:57-62).
    const identifier2 = await whenUploadFile(aw, {
      name: "a test file",
      bytes: FILE_TXT,
      originalFilename: "file.txt",
    });
    expect(identifier2).toMatch(/^~\d+\/\d+\.txt$/);
    await thenFileCardShowsDownload(aw, "a test file");
  });

  // ---------------------------------------------------------------------
  // Scenario: Uploading and changing an image — NOT-PORTABLE-TODAY
  // (renditions) with the boundary pinned
  // ---------------------------------------------------------------------

  it("NOT-PORTABLE-TODAY (image rendition/version machinery) / Uploading and changing an image — the original swap ports; the size/type views do not", async () => {
    aw = await freshAttachmentWorld();
    // Upstream asserts rendered RENDITIONS: "I should see an image of size
    // 'large' and type 'png'", then after uploading image2.jpg "of size
    // 'large' and type 'jpg'". The port has NO rendition/version machinery
    // (image_card_uploader.rb:16-27 create_versions! — the captured oracle
    // tree carries zero rendition files and the port writes originals
    // only; upload-tree-oracle-pattern.test.ts documents the class). The
    // swap half DOES port: the update writes the new original under a new
    // action. This pin holds the boundary so the rendition machinery's
    // arrival must update this file.
    await whenUploadFile(aw, {
      name: "a test image",
      bytes: PNG_BYTES,
      originalFilename: "image.png",
      typeCode: "image",
    });
    const engine = aw.engine;
    const card = await aw.world.storage.fetcher.fetchByName("a test image");
    expect(card).toBeDefined();
    const update = await engine.updateCard({
      cardId: card!.id!,
      attachment: { bytes: JPG_BYTES, originalFilename: "image2.jpg" },
    });
    expect(update).not.toBeNull();
    const row = await aw.world.storage.selectOne<{ db_content: string | null }>(
      "SELECT db_content FROM cards WHERE id = ?",
      [card!.id],
    );
    expect(row?.db_content).toMatch(/\.jpg$/); // the swap landed
    const stored = await storedFileBytes(aw, row!.db_content!);
    expect(stored.length).toBe(JPG_BYTES.length);
    // The boundary: no rendition files exist for the image (no
    // -icon/-small/-medium/-large/-original spellings anywhere).
    const tree = await walkStoredTree(aw.filesDir);
    for (const p of tree) {
      expect(p).not.toMatch(/-(icon|small|medium|large|original)\./);
    }
  });

  // ---------------------------------------------------------------------
  // Scenario: Changing a coded image — GREEN (the coded->deck-owned
  // replacement writes a non-coded image)
  // ---------------------------------------------------------------------

  it("GREEN / Changing a coded image — editing a coded image uploads a non-coded copy", async () => {
    aw = await freshAttachmentWorld();
    // upstream: When I edit "yeti skin+Image" / And I upload the image
    // "image2.jpg" / ... / Then I should see a non-coded image ...
    //
    // The coded shape (":<codename-parts>/<file>" — card-mod-carrierwave
    // set/abstract/attachment/coded.rb:41-57) seeds here the way the
    // vendor test seeds it; the update-with-attachment replaces the coded
    // reference with a deck-owned local store row
    // (~<cid>/<aid>.<ext>), which IS the "non-coded image" the scenario
    // asserts (the size/type rendition half is the boundary named in the
    // previous it).
    await seedCard(aw.world.storage, { name: "yeti skin" });
    const yetiSkin = await aw.world.storage.fetcher.fetchByName("yeti skin");
    await seedCard(aw.world.storage, {
      leftId: yetiSkin!.id,
      rightId: ATTACH_IDS.image,
      typeId: ATTACH_IDS.image,
      dbContent: ":decko_logo/carrierwave.svg",
    });
    const card = await aw.world.storage.fetcher.fetchByName("yeti skin+Image");
    expect(card?.dbContent).toMatch(/^:/); // coded before the edit
    await aw.engine.updateCard({
      cardId: card!.id!,
      attachment: { bytes: JPG_BYTES, originalFilename: "image2.jpg" },
    });
    const row = await aw.world.storage.selectOne<{ db_content: string | null }>(
      "SELECT db_content FROM cards WHERE id = ?",
      [card!.id],
    );
    expect(row?.db_content).toMatch(/^~\d+\/\d+\.jpg$/); // non-coded after
    const stored = await storedFileBytes(aw, row!.db_content!);
    expect(stored.length).toBe(JPG_BYTES.length);
  });

  // ---------------------------------------------------------------------
  // Scenarios: file/image as a field in a form (3) — GREEN engine slice
  // ---------------------------------------------------------------------

  it("GREEN / uploading a file as a field in a form — the structured field carries the upload", async () => {
    aw = await freshAttachmentWorld();
    // upstream: /new Cardtype "complicated_card"; HTML card
    // "complicated card+*type+*structure" "{{+image}}{{+description}}";
    // /new complicated_card "Vignesh has a complicated relationship";
    // upload image.png into the field; Submit; see an image of size
    // medium type png.
    await aw.engine.createCard({ name: "complicated_card", typeCode: "cardtype" });
    await aw.engine.createCard({
      name: "complicated card+*type+*structure",
      content: "{{+image}}{{+description}}",
    });
    await aw.engine.createCard({ name: "Vignesh has a complicated relationship" });
    // The form's field upload: the +image subcard save with the attachment.
    const identifier = await whenUploadFile(aw, {
      name: "Vignesh has a complicated relationship+image",
      bytes: PNG_BYTES,
      originalFilename: "image.png",
      typeCode: "image",
    });
    expect(identifier).toMatch(/^~\d+\/\d+\.png$/);
    const stored = await storedFileBytes(aw, identifier);
    expect(stored.length).toBe(PNG_BYTES.length);
  });

  it("GREEN / updating a file as a field in a form — the field's replacement writes a new action's file", async () => {
    aw = await freshAttachmentWorld();
    await aw.engine.createCard({ name: "complicated_card", typeCode: "cardtype" });
    await aw.engine.createCard({
      name: "complicated card+*type+*structure",
      content: "{{+Image}}{{+description}}",
    });
    await aw.engine.createCard({ name: "Vignesh has a complicated relationship" });
    await whenUploadFile(aw, {
      name: "Vignesh has a complicated relationship+Image",
      bytes: PNG_BYTES,
      originalFilename: "image.png",
      typeCode: "image",
    });
    // upstream: And I edit "Vignesh has a complicated relationship" /
    // And I upload the image "image2.jpg" / ... / Then I should see file
    // "image2.jpg ..." — the field update.
    const card = await aw.world.storage.fetcher.fetchByName(
      "Vignesh has a complicated relationship+Image",
    );
    const update = await aw.engine.updateCard({
      cardId: card!.id!,
      attachment: { bytes: JPG_BYTES, originalFilename: "image2.jpg" },
    });
    expect(update).not.toBeNull();
    const row = await aw.world.storage.selectOne<{ db_content: string | null }>(
      "SELECT db_content FROM cards WHERE id = ?",
      [card!.id],
    );
    expect(row?.db_content).toMatch(/\.jpg$/);
  });

  it("GREEN / submit a form without updating a file — a main-card save that never touches the field leaves the field's file intact", async () => {
    aw = await freshAttachmentWorld();
    await aw.engine.createCard({ name: "complicated_card", typeCode: "cardtype" });
    await aw.engine.createCard({
      name: "complicated card+*type+*structure",
      content: "{{+Image}}{{+description}}",
    });
    await aw.engine.createCard({ name: "Vignesh has a complicated relationship" });
    const identifier = await whenUploadFile(aw, {
      name: "Vignesh has a complicated relationship+Image",
      bytes: PNG_BYTES,
      originalFilename: "image.png",
      typeCode: "image",
    });
    const fieldCard = await aw.world.storage.fetcher.fetchByName(
      "Vignesh has a complicated relationship+Image",
    );
    expect(fieldCard).toBeDefined();
    // upstream: And I edit "Vignesh has a complicated relationship" /
    // And I press "Save and Close" (no new upload) / Then I should see
    // "+Image" / And I should see an image ... — the save WITHOUT the
    // field: the main card updates; the +Image subcard's stored file and
    // identifier are untouched.
    const main = await aw.world.storage.fetcher.fetchByName(
      "Vignesh has a complicated relationship",
    );
    await aw.engine.updateCard({ cardId: main!.id!, content: "" });
    const field = await aw.world.storage.selectOne<{ db_content: string | null }>(
      "SELECT db_content FROM cards WHERE id = ?",
      [fieldCard!.id!],
    );
    expect(field?.db_content).toBe(identifier);
    const stored = await storedFileBytes(aw, identifier);
    expect(stored.length).toBe(PNG_BYTES.length);
  });
});
