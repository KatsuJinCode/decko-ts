// Port receipt for card-mod-carrierwave set/abstract/attachment/
// 01_storage_type.rb:8-10 — validate_storage_type (register row carrierwave
// #13), landed by the events tranche 4 lane. The event now runs its REAL
// body through the ModEventFn execution seam:
//
// Ruby oracle (read this session):
//   event :validate_storage_type, :validate, on: :save do
//     errors.add :storage_type, unknown_storage_type unless known_storage_type?
//   end
//   known_storage_type? (:33-35): storage_type.in?(
//     CarrierWave::FileCardUploader::STORAGE_TYPES)  # %i[cloud web coded local]
//   unknown_storage_type (:36-38): t :carrierwave_unknown_storage_type,
//     new_storage_type: storage_type    # en.yml:12 "unknown storage type %{...}"
//   storage_type (:44-47): assigned || (new/attaching ? config : content
//   grammar) — so a save whose deck configures a storage type outside
//   STORAGE_TYPES dies on it, and an existing card whose CONTENT names a
//   known backend (:cloud / ~local / :coded) passes even on a broken
//   config, exactly as storage_type_from_content answers.
//
// The event's set is abstract/attachment, which applies to File and Image
// cards: the `attachment :file` macro includes Abstract::Attachment
// (card-1.110.0 lib/card/set/advanced_api.rb:34-35), called only by
// set/type/file.rb:1 and set/type/image.rb:1. The serving runtime resolves
// that abstract path against the card's type codename
// (write-routes.ts observedModEventRuntime); the test supplies the same
// shape. Creates carry a real file because validate_file_exist
// (attachment.rb:26, the abstract set's earlier-registered :validate
// event, on: :create) refuses a file card without one first — Ruby's own
// registration order.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createActionsTestStorage,
  seedStandardDeck,
  seedCard,
  JOE,
  fakeClock,
  type ActionsTestStorage,
} from "../actions/actions-test-storage.js";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";
import { ModLoader } from "../../../src/card/mod-loader.js";
import cardModCarrierwave, {
  carrierwaveModEventPredicates,
} from "../../../src/card/mod-loader/mods/card-mod-carrierwave.js";
import cardModHistory, {
  historyModEventPredicates,
} from "../../../src/card/mod-loader/mods/card-mod-history.js";
import cardModPermissions, {
  permissionsModEventPredicates,
} from "../../../src/card/mod-loader/mods/card-mod-permissions.js";
import { registerDeckModEventCardStateSources } from "../../../src/card/mod-loader/mod-event-state-sources.js";
import { LocalAttachmentStore } from "../../../src/card/attachments/attachment-store.js";

registerDeckModEventCardStateSources();

let filesDir: string;
beforeEach(() => {
  filesDir = mkdtempSync(join(tmpdir(), "storage-type-validation-"));
});
afterEach(() => {
  rmSync(filesDir, { recursive: true, force: true });
});

/** Carrierwave's events sit on before/after chains whose anchors live in
 *  sibling mods (assign_attachment_on_* after :assign_action, history;
 *  update_public_link after :update_read_rule, permissions), so the registry
 *  composes those three manifests — the same closure the full deck runtime
 *  (defaultDeckEventRuntime) walks — with the three predicate tables merged
 *  the way the deck boot merges them. */
function carrierwaveRegistry() {
  const loader = new ModLoader([
    { manifest: cardModCarrierwave },
    { manifest: cardModHistory },
    { manifest: cardModPermissions },
  ]);
  loader.resolveOrder({ gemMods: ["carrierwave", "history", "permissions"] });
  loader.load();
  return loader.eventRegistry();
}

async function deck(storage: ActionsTestStorage): Promise<{ fileTypeId: number }> {
  await seedStandardDeck(storage);
  const fileType = await seedCard(storage, { id: 474, name: "File", codename: "file", typeId: 3 });
  return { fileTypeId: fileType.id };
}

function engine(
  storage: ActionsTestStorage,
  opts: { fileStorage: string; fileTypeId: number },
): CardActionEngine {
  return new CardActionEngine(storage.engine, {
    actor: JOE,
    ipAddress: "192.0.2.7",
    now: fakeClock(),
    fileStorage: opts.fileStorage,
    attachmentStore: new LocalAttachmentStore(filesDir),
    modEvents: {
      registry: carrierwaveRegistry(),
      predicates: {
        ...carrierwaveModEventPredicates,
        ...historyModEventPredicates,
        ...permissionsModEventPredicates,
      },
      // the serving runtime's abstract-attachment arm
      // (write-routes.ts observedModEventRuntime): the attachment macro's
      // include_set applies to File and Image cards only.
      setMember: (setPath, card) => {
        if (!setPath.startsWith("abstract/attachment")) return false;
        return card.typeId === opts.fileTypeId;
      },
    },
  });
}

const FILE_INPUT = {
  bytes: new Uint8Array([1, 2, 3, 4]),
  originalFilename: "doc.txt",
};

describe("validate_storage_type (01_storage_type.rb:8-10, ported body)", () => {
  it("a file create on a deck configured with an unknown storage type is refused", async () => {
    const storage = await createActionsTestStorage();
    const ids = await deck(storage);
    await expect(
      engine(storage, { fileStorage: "bogus", fileTypeId: ids.fileTypeId }).createCard({
        name: "Store Me",
        typeId: ids.fileTypeId,
        attachment: { ...FILE_INPUT },
      }),
    ).rejects.toThrow(/unknown storage type bogus/);
    expect(
      await storage.selectOne("SELECT id FROM cards WHERE key = 'store_me'", []),
    ).toBeUndefined();
  });

  it("the same create on the :local config proceeds", async () => {
    const storage = await createActionsTestStorage();
    const ids = await deck(storage);
    const result = await engine(storage, { fileStorage: "local", fileTypeId: ids.fileTypeId }).createCard({
      name: "Store Me",
      typeId: ids.fileTypeId,
      attachment: { ...FILE_INPUT },
    });
    expect(result.cardId).toBeGreaterThan(0);
  });

  it("an existing coded-content card updates fine on a bogus config (the content arm answers, not the config)", async () => {
    const storage = await createActionsTestStorage();
    const ids = await deck(storage);
    // A create with coded CONTENT but no file is refused by
    // validate_file_exist (attachment.rb:26-30, Ruby-shaped: only web?
    // cards may create with content alone) — so the row is seeded
    // directly, the way an imported deck's row exists.
    await seedCard(storage, {
      id: 480,
      name: "Coded Already",
      typeId: ids.fileTypeId,
      dbContent: ":core/data/files/logo.png",
    });
    await expect(
      engine(storage, { fileStorage: "bogus", fileTypeId: ids.fileTypeId }).updateCard({
        cardId: 480,
        content: ":core/data/files/logo2.png",
      }),
    ).resolves.toBeDefined();
  });

  it("a non-attachment card on a bogus config is untouched (the abstract set does not apply)", async () => {
    const storage = await createActionsTestStorage();
    await deck(storage);
    const result = await engine(storage, { fileStorage: "bogus", fileTypeId: 474 }).createCard({
      name: "Plain Note",
      content: "hi",
    });
    expect(result.cardId).toBeGreaterThan(0);
  });
});
