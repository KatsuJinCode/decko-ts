// Engine-owned pin for card-mod-carrierwave set/abstract/attachment/coded.rb
// :7-10 — validate_coded_storage_type (register row carrierwave #12).
//
// Ruby oracle (read this session):
//   event :validate_coded_storage_type, :validate, on: :save, when: :coded? do
//     storage_type_error :mod_argument_needed_to_save unless mod
//     storage_type_error :codename_needed_for_storage unless coded_ok?
//   end
//   ... :18-20 storage_type_error: errors.add :storage_type,
//        t("carrierwave_#{error_name}")
//   ... coded_ok? (:22-24): no blank among codename_parts
//        (:27-31: [codename] when simple, else name.parts.map(&:codename))
// Locale (config/locales/en.yml, read this session):
//   carrierwave_mod_argument_needed_to_save: "mod argument needed to save
//   card as coded"
//   carrierwave_codename_needed_for_storage: "codename needed for storage
//   type coded"
//
// The check is ENGINE-OWNED at base: validateCodedStorageType
// (card-action-engine.ts:1407-1433), run on the create path (:2034) and the
// update path (:3032) whenever the save's attachment carries the coded arm.
// The two errors accumulate and the shown form joins them the way
// ActiveRecord's RecordInvalid joins full messages (the implementation's
// own cite) — the pin below asserts exactly that accumulation.
//
// The event's mod registration (card-mod-carrierwave.ts, setPath
// abstract/attachment/coded) stays the honest stub: the engine runs the
// check directly, so a registered body would double-fire it. The row is
// engine-owned + pinned, not PORTED.

import { describe, expect, it } from "vitest";
import {
  createActionsTestStorage,
  seedStandardDeck,
  seedCard,
  JOE,
  fakeClock,
  type ActionsTestStorage,
} from "../actions/actions-test-storage.js";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";
import { LocalAttachmentStore } from "../../../src/card/attachments/attachment-store.js";

async function codedDeck(storage: ActionsTestStorage): Promise<{
  fileTypeId: number;
}> {
  await seedStandardDeck(storage);
  const fileType = await seedCard(storage, { id: 474, name: "File", codename: "file", typeId: 3 });
  return { fileTypeId: fileType.id };
}

function engine(storage: ActionsTestStorage, filesDir: string): CardActionEngine {
  return new CardActionEngine(storage.engine, {
    actor: JOE,
    ipAddress: "192.0.2.7",
    now: fakeClock(),
    attachmentStore: new LocalAttachmentStore(filesDir),
  });
}

const BYTES = new Uint8Array([1, 2, 3, 4]);

describe("validate_coded_storage_type (coded.rb:7-10, engine-owned)", () => {
  it("a coded save with no mod and no codename parts reports BOTH errors, joined", async () => {
    const storage = await createActionsTestStorage();
    const ids = await codedDeck(storage);
    const filesDir = `.tmp-coded-${Date.now()}`;
    await expect(
      engine(storage, filesDir).createCard({
        name: "Coded Doc",
        typeId: ids.fileTypeId,
        attachment: { bytes: BYTES, originalFilename: "doc.txt", coded: {} },
      }),
    ).rejects.toThrow(
      /mod argument needed to save card as coded.*codename needed for storage type coded/s,
    );
    // The refusal stored nothing.
    expect(
      await storage.selectOne("SELECT id FROM cards WHERE key = 'coded_doc'", []),
    ).toBeUndefined();
  });

  it("a coded save with a mod but a bare (uncodenamed) name still refuses on the codename arm", async () => {
    const storage = await createActionsTestStorage();
    const ids = await codedDeck(storage);
    const filesDir = `.tmp-coded-${Date.now()}-b`;
    await expect(
      engine(storage, filesDir).createCard({
        name: "Coded Doc",
        typeId: ids.fileTypeId,
        attachment: { bytes: BYTES, originalFilename: "doc.txt", coded: { mod: "core" } },
      }),
    ).rejects.toThrow(/codename needed for storage type coded/);
  });
});
