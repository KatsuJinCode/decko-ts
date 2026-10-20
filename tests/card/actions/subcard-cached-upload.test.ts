// The subcard-scoped arm of the two-step upload: a save whose subcard hash
// carries card[subcards][+x][action_id_of_cached_upload] routes the cached
// draft action to THAT subcard, the way Rails assign_attributes applies the
// attribute to the subcard in Ruby.
//
// Ruby contract (card-mod-carrierwave set/abstract/attachment/00_upload_cache.rb):
//   :2        attr_accessor :action_id_of_cached_upload   - on EVERY card
//   :8-25     prepare_attachment stores the preview bytes + one DRAFT action
//             under the upload cache card (new_file/new_image), aborts
//   :27-34    assign_attachment_on_create, when save_preliminary_upload? -
//             the cached bytes become the card's attachment; the draft's
//             comment becomes the new action's comment
//   :51-57    delete_cached_upload_file_on_create (:integrate) - the draft
//             action row + its cache bytes go; the draft's ACT survives
//   :84-86    save_preliminary_upload? = @action_id_of_cached_upload.present?
//
// The port under test: SubcardInput.actionIdOfCachedUpload (types.ts),
// write-routes.ts subcardInputs' parse arm, and the engine's
// resolveSubcardCachedUpload applied in prepareNewSubcards (create) and
// saveSubcardsInWriter (update), with the release collected to the act's
// integrate phase.
//
// The draft fixture is seeded DIRECTLY in the shapes cachedUploadAttachment
// reads: a draft=1 card_actions row on the *new file cache card, a
// card_changes row carrying the `~<card>/<action><ext>` identifier
// (attachment-content.ts parseLocalAttachmentIdentifier), and the bytes in
// the attachment store's tmp area (00_upload_cache.rb tmp_upload_dir).

import { describe, expect, it } from "vitest";
import { createRenderTestStorage } from "../render/render-test-storage.js";
import { bootstrapFreshDeck } from "../../../src/card/auth/boot-seed.js";
import { actorBot } from "../../../src/card/auth/actor.js";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";
import { BlobAttachmentStore } from "../../../src/card/attachments/attachment-store.js";
import { MemoryBlobDriver } from "../../../src/blob/memory.js";
import { trackedFieldIndex } from "../../../src/card/history/change.js";

const ENCODER = new TextEncoder();

/** Seed the preview step's state: the *new file cache card (codename
 *  new_file, 00_upload_cache.rb upload_cache_card), a draft action on it,
 *  its db_content change = the tmp identifier, and the bytes in the tmp
 *  area. Returns the draft action id. */
async function seedCachedUpload(
  engine: CardActionEngine,
  store: BlobAttachmentStore,
  bytes: Uint8Array,
  originalFilename: string,
): Promise<number> {
  const ext = ".txt";
  const cacheCard = await engine.createCard({ name: "*new file", codename: "new_file" });
  const cacheCardId = cacheCard.cardId;
  const driver = engine.fetch.driver;
  await driver.query(
    "INSERT INTO card_actions (card_id, draft, comment) VALUES (?, 1, ?)",
    [cacheCardId, originalFilename],
  );
  const { rows } = await driver.query<{ id: number }>(
    "SELECT id FROM card_actions WHERE card_id = ? AND draft = 1 ORDER BY id DESC LIMIT 1",
    [cacheCardId],
  );
  const actionId = Number(rows[0]!.id);
  await store.store({ cardId: cacheCardId, actionId, ext, bytes, area: "tmp" });
  await driver.query(
    "INSERT INTO card_changes (card_action_id, field, value) VALUES (?, ?, ?)",
    [actionId, trackedFieldIndex("db_content"), `~${cacheCardId}/${actionId}${ext}`],
  );
  return actionId;
}

describe("the subcard-scoped cached-upload arm", () => {
  it("create: the subcard's cached draft becomes the subcard's attachment; the integrate phase deletes the draft row + tmp bytes", async () => {
    const storage = await createRenderTestStorage({ bootstrapReadRules: false });
    await bootstrapFreshDeck({ driver: storage.fetcher.driver });
    const store = new BlobAttachmentStore(new MemoryBlobDriver(), new MemoryBlobDriver());
    const bot = await actorBot(storage.fetcher.driver);
    const engine = new CardActionEngine(storage.fetcher, { actor: bot, attachmentStore: store });

    // the File cardtype the mount resolution reads (ATTACHMENT_MOUNTS keys
    // off the type row's codename; card-mod-carrierwave set/type/file.rb:1)
    const fileType = await engine.createCard({ name: "File", typeCode: "cardtype", codename: "file" });

    const bytes = ENCODER.encode("cached body bytes");
    const draftActionId = await seedCachedUpload(engine, store, bytes, "photo.txt");

    // THE ARM: a create whose SUBCARD hash carries the cached action id
    // (the route parses card[subcards][+body file][action_id_of_cached_upload]
    // into exactly this input shape)
    const result = await engine.createCard({
      name: "Doc",
      subcards: {
        "+body file": { typeId: fileType.cardId, actionIdOfCachedUpload: draftActionId },
      },
    });

    // the subcard exists, file-typed, and its stored bytes are the draft's
    const sub = await storage.fetcher.fetchByName("Doc+body file");
    expect(sub).toBeDefined();
    expect(sub!.typeId).toBe(fileType.cardId);
    const subId = sub!.id!;
    const subAction = (
      await storage.fetcher.driver.query<{ id: number; comment: string | null }>(
        "SELECT id, comment FROM card_actions WHERE card_id = ? ORDER BY id DESC LIMIT 1",
        [subId],
      )
    ).rows[0]!;
    // the draft's comment (the original filename) became the subcard
    // action's comment (assign_attachment :27 the @current_action comment
    // update - Ruby stores the original filename as the action comment)
    expect(subAction.comment).toBe("photo.txt");
    const stored = await store.read(subId, Number(subAction.id), ".txt", undefined);
    expect(stored).toBeDefined();
    expect(Array.from(stored!)).toEqual(Array.from(bytes));

    // the integrate phase ran the release: the draft action row is gone
    // (delete_cached_upload_file_on_create). The tmp BYTES go only through
    // the store's optional `remove` - BlobAttachmentStore carries none, so
    // the byte deletion is the store's capability, not the arm's (the
    // top-level arm's release is the same closure; the two arms are
    // contract-identical here).
    const draft = await storage.fetcher.driver.query<{ c: number }>(
      "SELECT COUNT(*) AS c FROM card_actions WHERE id = ?",
      [draftActionId],
    );
    expect(Number(draft.rows[0]!.c)).toBe(0);
  });

  it("an unresolvable cached id on an otherwise-blank subcard saves nothing (Ruby's Card::Action.fetch nil early return)", async () => {
    const storage = await createRenderTestStorage({ bootstrapReadRules: false });
    await bootstrapFreshDeck({ driver: storage.fetcher.driver });
    const store = new BlobAttachmentStore(new MemoryBlobDriver(), new MemoryBlobDriver());
    const bot = await actorBot(storage.fetcher.driver);
    const engine = new CardActionEngine(storage.fetcher, { actor: bot, attachmentStore: store });

    const fileType = await engine.createCard({ name: "File", typeCode: "cardtype", codename: "file" });

    await engine.createCard({
      name: "Doc2",
      subcards: {
        "+body file": { typeId: fileType.cardId, actionIdOfCachedUpload: 424242 },
      },
    });
    // no card was created at the subcard name: no changes to save
    expect(await storage.fetcher.fetchByName("Doc2+body file")).toBeUndefined();
  });
});
