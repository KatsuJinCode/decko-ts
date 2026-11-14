// The subcard-scoped half of the two-step upload — redteam row
// reg-redteam-dispute-3 ("disputed PORTED verdict: B2"), whose blocker
// named the gap: write-routes.ts documented that
// `card[subcards][+x][action_id_of_cached_upload]` "stays unported with the
// rest of the general subcard grammar".
//
// Ruby (card-mod-carrierwave-0.20.0
// set/abstract/attachment/00_upload_cache.rb):
//
//   1  attr_accessor :action_id_of_cached_upload
//   2
//  27  event :assign_attachment_on_create, :initialize,
//  28        after: :assign_action, on: :create, when: :save_preliminary_upload? do
//  29    return unless (action = Card::Action.fetch(@action_id_of_cached_upload))
//  31    upload_cache_card.selected_action_id = action.id
//  32    upload_cache_card.select_file_revision
//  33    assign_attachment upload_cache_card.attachment.file, action.comment
//  34  end
//  36  event :assign_attachment_on_update, :initialize,
//  37        after: :assign_action, on: :update, when: :save_preliminary_upload? do
//  38    return unless (action = Card::Action.fetch(@action_id_of_cached_upload))
//  40    uploaded_file = with_selected_action_id(action.id) { attachment.file }
//  41    assign_attachment uploaded_file, action.comment
//  42  end
//  44  def assign_attachment file, original_filename
//  46    send "#{attachment_name}=", file
//  47    write_identifier
//  48    @current_action&.update! comment: original_filename
//  49  end
//  51  event :delete_cached_upload_file_on_create, :integrate, on: :create,
//  52        when: :save_preliminary_upload? do
//  53    return unless (action = Card::Action.fetch(@action_id_of_cached_upload))
//  55    upload_cache_card.delete_files_for_action action
//  56    action.delete
//  57  end
//  66  event :delete_cached_upload_file_on_update, :integrate, on: :update,
//  67        when: :save_preliminary_upload? do ... end
//
// The accessor is per CARD (:1-2), and a subcard save is a real card save
// inside the parent's act (mod/core/set/all/subcards.rb:32-39 builds a Card
// and saves it), so all four events fire for a subcard exactly as for the
// act card. Nothing in Ruby's half is request-scoped to the top-level card,
// which is why this is a port and not a route special-case.
//
// The legs:
//   CREATE     — a File subcard posting only the action id gets the draft's
//                bytes (`:29-33` reads them under the *new file cache card),
//                the draft's comment (the original filename) becomes the
//                subcard action's comment (`assign_attachment :48` ->
//                :save_original_filename, attachment.rb:20-24), and at
//                integrate the draft action row is deleted while the draft's
//                ACT survives (`:51-57`).
//   UPDATE     — an EXISTING File subcard reads the draft from its OWN files
//                dir (`:40`) and replaces its identifier + comment.
//   UNRESOLVED — an id that fetches nothing returns early (`:29`/`:38`), so
//                the subcard carries no attachment and, having no content
//                either, stores nothing.
//   SHAPE      — a create-arm draft lives in the tmp area under the *new
//                file card; an existing subcard asking for THAT id resolves
//                nothing (the update arm reads the card's own files), so its
//                content is left alone and the draft survives untouched.
//
// File (not Image) is the mount under test: the Image arm additionally runs
// the uploader's decode check (card-action-engine.ts validateFileExist, the
// `imageDecodes` arm), which needs real image bytes and says nothing about
// the routing this file pins.

import { describe, expect, it } from "vitest";
import {
  createActionsTestStorage,
  seedCard,
  seedStandardDeck,
  CARDTYPE_ID,
  JOE,
  IP,
  type ActionsTestStorage,
} from "./actions-test-storage.js";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";
import type {
  AttachmentStore,
  AttachmentStoreInput,
  StoredAttachment,
} from "../../../src/card/attachments/attachment-store.js";

const FILE_TYPE_ID = 700;
const NEW_FILE_ID = 701;
const BYTES_A = new Uint8Array([0x61, 0x6c, 0x70, 0x68, 0x61]); // "alpha"
const BYTES_B = new Uint8Array([0x62, 0x65, 0x74, 0x61]); // "beta"

/** An in-memory blob store addressable by (area, card, action, ext) - the
 *  four coordinates cachedUploadAttachment reads and the draft's release
 *  deletes. */
class TestBlobStore implements AttachmentStore {
  readonly files = new Map<string, Uint8Array>();
  private key(cardId: number, actionId: number, ext: string, area?: "files" | "tmp"): string {
    return `${area ?? "files"}/${cardId}/${actionId}${ext}`;
  }
  async store(input: AttachmentStoreInput): Promise<StoredAttachment> {
    this.files.set(this.key(input.cardId, input.actionId, input.ext, input.area), input.bytes);
    return {
      identifier: `~${input.cardId}/${input.actionId}${input.ext}`,
      size: input.bytes.byteLength,
    };
  }
  async read(cardId: number, actionId: number, ext: string, _variant?: string, area?: "files" | "tmp") {
    return this.files.get(this.key(cardId, actionId, ext, area));
  }
  async remove(cardId: number, actionId: number, ext: string, area?: "files" | "tmp"): Promise<void> {
    this.files.delete(this.key(cardId, actionId, ext, area));
  }
  async discard(input: AttachmentStoreInput): Promise<void> {
    this.files.delete(this.key(input.cardId, input.actionId, input.ext, input.area));
  }
}

async function deck(): Promise<{ storage: ActionsTestStorage; store: TestBlobStore }> {
  const storage = await createActionsTestStorage();
  await seedStandardDeck(storage);
  await seedCard(storage, { id: FILE_TYPE_ID, name: "File", codename: "file", typeId: CARDTYPE_ID });
  // The upload-cache card (00_upload_cache.rb:75-78 upload_cache_card:
  // `Card::Codename.card("new_#{attachment_name}") { Card[:new_file] }`).
  await seedCard(storage, { id: NEW_FILE_ID, name: "*new file", codename: "new_file", typeId: FILE_TYPE_ID });
  return { storage, store: new TestBlobStore() };
}

function engineFor(storage: ActionsTestStorage, store: TestBlobStore): CardActionEngine {
  return new CardActionEngine(storage.engine, { actor: JOE, ipAddress: IP, attachmentStore: store });
}

function actionRow(storage: ActionsTestStorage, actionId: number) {
  return storage.selectOne<{ id: number; card_id: number | null; comment: string | null; draft: number }>(
    "SELECT id, card_id, comment, draft FROM card_actions WHERE id = ?",
    [actionId],
  );
}

describe("subcard-scoped action_id_of_cached_upload (00_upload_cache.rb:27-72 on a subcard)", () => {
  it("CREATE: a File subcard posting only the action id stores the draft's bytes and deletes the draft action", async () => {
    const { storage, store } = await deck();
    try {
      const engine = engineFor(storage, store);
      const draft = await engine.recordPreliminaryUpload({
        typeId: FILE_TYPE_ID,
        mount: "file",
        attachment: { bytes: BYTES_A, originalFilename: "alpha.txt" },
      });
      expect(await actionRow(storage, draft.actionId)).toMatchObject({
        draft: 1,
        comment: "alpha.txt",
        card_id: NEW_FILE_ID,
      });
      // the draft's ACT is already an orphan (the preliminary save writes no
      // card row) — it must still be there after the final save
      const orphanActs = async (): Promise<number> =>
        Number(
          (await storage.selectOne<{ n: number }>("SELECT COUNT(*) AS n FROM card_acts WHERE card_id IS NULL"))
            ?.n,
        );
      expect(await orphanActs()).toBe(1);
      const actsBefore = await storage.count("card_acts");

      await engine.createCard({
        name: "Upload Parent",
        subcards: { "+*doc": { typeCode: "file", actionIdOfCachedUpload: draft.actionId } },
      });

      // The subcard is a real File card carrying the attachment identifier
      // (~<card>/<action><ext>, write_identifier via assign_attachment).
      const sub = await storage.engine.fetchByName("Upload Parent+*doc");
      expect(sub).toBeDefined();
      expect(sub!.typeId).toBe(FILE_TYPE_ID);
      expect(sub!.dbContent).toMatch(/^~\d+\/\d+\.txt$/);
      // assign_attachment :48 — the draft's comment (the original
      // filename) is the subcard action's comment.
      const actions = await storage.selectAll<{ id: number; comment: string | null }>(
        "SELECT id, comment FROM card_actions WHERE card_id = ? ORDER BY id",
        [sub!.id],
      );
      expect(actions).toHaveLength(1);
      expect(actions[0].comment).toBe("alpha.txt");
      // :51-57 delete_cached_upload_file_on_create — the draft ACTION row
      // goes (Action#delete, so its change rows stay) and its tmp file with
      // it; the draft's ACT survives (the oracle rows pin the orphan act).
      expect(await actionRow(storage, draft.actionId)).toBeUndefined();
      expect(store.files.has(`tmp/${NEW_FILE_ID}/${draft.actionId}.txt`)).toBe(false);
      // the final save filed its own act(s); the draft's orphan act is still
      // the only cardless one
      expect(await storage.count("card_acts")).toBeGreaterThan(actsBefore);
      expect(await orphanActs()).toBe(1);
    } finally {
      storage.close();
    }
  });

  it("UPDATE: an existing File subcard reads the draft from its own files dir and replaces identifier + comment", async () => {
    const { storage, store } = await deck();
    try {
      const engine = engineFor(storage, store);
      const first = await engine.recordPreliminaryUpload({
        typeId: FILE_TYPE_ID,
        mount: "file",
        attachment: { bytes: BYTES_A, originalFilename: "alpha.txt" },
      });
      const parent = await engine.createCard({
        name: "Replace Parent",
        subcards: { "+*doc": { typeCode: "file", actionIdOfCachedUpload: first.actionId } },
      });
      const sub = await storage.engine.fetchByName("Replace Parent+*doc");
      const before = sub!.dbContent;

      // The update arm: a preliminary upload for an EXISTING card files the
      // draft on that card and stores the bytes in ITS files dir
      // (00_upload_cache.rb:40 reads them back from there).
      const second = await engine.recordPreliminaryUpload({
        cardId: sub!.id!,
        typeId: FILE_TYPE_ID,
        mount: "file",
        attachment: { bytes: BYTES_B, originalFilename: "beta.txt" },
      });
      expect(await actionRow(storage, second.actionId)).toMatchObject({ card_id: sub!.id });

      await engine.updateCard({
        cardId: parent.cardId,
        subcards: { "+*doc": { typeCode: "file", actionIdOfCachedUpload: second.actionId } },
      });

      const after = await storage.engine.fetchByName("Replace Parent+*doc");
      expect(after!.id).toBe(sub!.id);
      expect(after!.dbContent).toMatch(/^~\d+\/\d+\.txt$/);
      expect(after!.dbContent).not.toBe(before);
      const latest = await storage.selectOne<{ comment: string | null }>(
        "SELECT comment FROM card_actions WHERE card_id = ? ORDER BY id DESC LIMIT 1",
        [sub!.id],
      );
      expect(latest?.comment).toBe("beta.txt");
      // :66-72 delete_cached_upload_file_on_update.
      expect(await actionRow(storage, second.actionId)).toBeUndefined();
      expect(store.files.has(`files/${sub!.id}/${second.actionId}.txt`)).toBe(false);
    } finally {
      storage.close();
    }
  });

  it("UNRESOLVED: an action id that fetches nothing stores nothing and raises nothing", async () => {
    const { storage, store } = await deck();
    try {
      const engine = engineFor(storage, store);
      await engine.createCard({
        name: "Ghost Parent",
        subcards: { "+*doc": { typeCode: "file", actionIdOfCachedUpload: 999999 } },
      });
      expect(await storage.engine.fetchByName("Ghost Parent+*doc")).toBeUndefined();
      expect(store.files.size).toBe(0);
    } finally {
      storage.close();
    }
  });

  it("SHAPE: a create-arm draft (tmp area) does not attach to an existing subcard, and survives the save", async () => {
    const { storage, store } = await deck();
    try {
      const engine = engineFor(storage, store);
      const first = await engine.recordPreliminaryUpload({
        typeId: FILE_TYPE_ID,
        mount: "file",
        attachment: { bytes: BYTES_A, originalFilename: "alpha.txt" },
      });
      const parent = await engine.createCard({
        name: "Cross Parent",
        subcards: { "+*doc": { typeCode: "file", actionIdOfCachedUpload: first.actionId } },
      });
      const sub = await storage.engine.fetchByName("Cross Parent+*doc");
      const identifier = sub!.dbContent;

      // A SECOND create-arm draft: tmp area, filed on the *new file card.
      const second = await engine.recordPreliminaryUpload({
        typeId: FILE_TYPE_ID,
        mount: "file",
        attachment: { bytes: BYTES_B, originalFilename: "beta.txt" },
      });
      expect(await actionRow(storage, second.actionId)).toMatchObject({ card_id: NEW_FILE_ID });

      // The EXISTING subcard asks for it. The update arm reads the card's
      // own files dir (00_upload_cache.rb:40) and cachedUploadAttachment pins
      // card_id = the card, so a draft filed on *new file resolves to
      // nothing: the subcard keeps the identifier it already had.
      await engine.updateCard({
        cardId: parent.cardId,
        subcards: { "+*doc": { typeCode: "file", actionIdOfCachedUpload: second.actionId } },
      });

      const after = await storage.engine.fetchByName("Cross Parent+*doc");
      expect(after!.id).toBe(sub!.id);
      expect(after!.dbContent).toBe(identifier);
      // the tmp draft is untouched by that save
      expect(store.files.has(`tmp/${NEW_FILE_ID}/${second.actionId}.txt`)).toBe(true);
      expect(await actionRow(storage, second.actionId)).toMatchObject({ draft: 1, comment: "beta.txt" });
    } finally {
      storage.close();
    }
  });
});
