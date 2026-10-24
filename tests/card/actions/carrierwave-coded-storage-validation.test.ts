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
// (card-action-engine.ts:1703-1744), run on the create path (:3029) and the
// update path (:4239) whenever the save's attachment carries the coded arm.
// The two errors accumulate and the shown form joins them the way
// ActiveRecord's RecordInvalid joins full messages (the implementation's
// own cite) — the pin below asserts exactly that accumulation.
//
// The event's mod registration (card-mod-carrierwave.ts, setPath
// abstract/attachment/coded) stays the honest stub: the engine runs the
// check directly, so a registered body would double-fire it. The row is
// engine-owned + pinned, not PORTED.
//
// The two refusal texts are read from the PINNED locale this repo vendors
// (fixtures/vendor/card-mod-carrierwave-0.20.0/config/locales/en.yml), so
// the pin asserts the port's own words against the gem's own words and
// not against a copy of them.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  createActionsTestStorage,
  seedStandardDeck,
  seedCard,
  JOE,
  fakeClock,
  type ActionsTestStorage,
} from "../actions/actions-test-storage.js";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";
import { CardActionError } from "../../../src/card/actions/types.js";
import { LocalAttachmentStore } from "../../../src/card/attachments/attachment-store.js";

/** The PINNED locale's own text for one carrierwave key, read from the
 *  vendored gem's locale file, so the pin compares the port's own words
 *  with the gem's own words and not with a copy of them. */
function localeText(key: string): string {
  const file = readFileSync(
    new URL(
      "../../../fixtures/vendor/card-mod-carrierwave-0.20.0/config/locales/en.yml",
      import.meta.url,
    ),
    "utf8",
  );
  const match = file.match(new RegExp(`^\\s*${key}:\\s*(.+)$`, "m"));
  if (match === null) throw new Error(`no locale key ${key}`);
  return match[1].trim();
}

const MOD_REFUSAL = localeText("carrierwave_mod_argument_needed_to_save");
const CODENAME_REFUSAL = localeText("carrierwave_codename_needed_for_storage");

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
    const error = await engine(storage, filesDir)
      .createCard({
        name: "Coded Doc",
        typeId: ids.fileTypeId,
        attachment: { bytes: BYTES, originalFilename: "doc.txt", coded: {} },
      })
      .then(
        () => undefined,
        (thrown: unknown) => thrown,
      );
    // the two PINNED locale's own texts, joined the way ActiveRecord's
    // RecordInvalid joins the full messages: the attribute name in front
    // of each one.
    expect(error).toBeInstanceOf(CardActionError);
    expect((error as CardActionError).message).toBe(
      `Validation failed: Storage type ${MOD_REFUSAL}, Storage type ${CODENAME_REFUSAL}`,
    );
    expect((error as CardActionError).userMessage).toBe(
      `STORAGE TYPE: ${MOD_REFUSAL}, ${CODENAME_REFUSAL}`,
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
    const error = await engine(storage, filesDir)
      .createCard({
        name: "Coded Doc",
        typeId: ids.fileTypeId,
        attachment: { bytes: BYTES, originalFilename: "doc.txt", coded: { mod: "core" } },
      })
      .then(
        () => undefined,
        (thrown: unknown) => thrown,
      );
    expect(error).toBeInstanceOf(CardActionError);
    expect((error as CardActionError).message).toBe(
      `Validation failed: Storage type ${CODENAME_REFUSAL}`,
    );
  });
});
