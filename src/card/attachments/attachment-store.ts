// The attachment STORAGE seam — the port of CarrierWave::Storage::File
// for local attachments (the only storage backend the headless engine can
// exercise; cloud/fog and web are explicit non-goals here).
//
// Ruby's local scheme (card-mod-carrierwave-0.20.0):
// - identifier in db_content:  ~<card_id>/<action_id><ext>
//   (lib/carrier_wave/file_card_uploader.rb:88-93 doc table)
// - storage path:              <files_dir>/<card_id>/<action_id>(-<variant>)<ext>
//   (set/abstract/attachment/paths.rb:11-19 upload_dir +
//   lib/carrier_wave/file_card_uploader/path.rb:33-43 store_path/retrieve_path;
//   files_dir = Card.paths["files"], the deck's `files` directory)
//
// The store interface is the seam the deploy worker binds a bucket-backed
// implementation to later (D1 holds no blobs; local FS is the engine/test
// backend). Node-only (node:fs/promises) by design: the engine runs under
// node here, and the worker-lane backend implements the same interface
// against its own storage SDK — path.join keeps every Windows/Unix
// difference inside this module.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { filenameWithVariant, localAttachmentIdentifier } from "./attachment-content.js";

/** The bytes + names one upload carries into the store. */
export interface AttachmentStoreInput {
  cardId: number;
  actionId: number;
  /** Lowercased extension WITH leading dot ("" allowed — Ruby stores
   *  extensionless files as the bare action id; FileCardUploader#valid?
   *  then reports the upload invalid for URL emission). */
  ext: string;
  bytes: Uint8Array;
}

/** What a store returns per successful write. */
export interface StoredAttachment {
  /** The db_content identifier the card row carries: ~<card>/<action><ext>. */
  identifier: string;
  /** Stored byte count (carrierwave's attachment.size; Ruby reads it back
   *  off the file — no DB column exists, so no row carries it). */
  size: number;
}

/** The storage seam the engine's save path calls. */
export interface AttachmentStore {
  store(input: AttachmentStoreInput): Promise<StoredAttachment>;
  /** The bytes of one action's file (variant pass-through: any requested
   *  variant resolves to the stored original — the mini_magick RESIZE is
   *  the named remainder). undefined = no such file. */
  read(cardId: number, actionId: number, ext: string, variant?: string): Promise<Uint8Array | undefined>;
}

/** Local-filesystem implementation of the Ruby files-dir scheme. */
export class LocalAttachmentStore implements AttachmentStore {
  private readonly filesDir: string;

  /** @param filesDir the deck's files directory (Card.paths["files"]). */
  constructor(filesDir: string) {
    this.filesDir = filesDir;
  }

  /** <files_dir>/<card_id>/<action_id(-<variant>)<ext> — upload_dir
   *  (paths.rb:14-16) + store_path (path.rb:33-39) + Versions#full_filename. */
  private storagePath(cardId: number, actionId: number, ext: string, variant?: string): string {
    return join(this.filesDir, String(cardId), filenameWithVariant(actionId, ext, variant));
  }

  async store(input: AttachmentStoreInput): Promise<StoredAttachment> {
    const path = this.storagePath(input.cardId, input.actionId, input.ext);
    await mkdir(join(this.filesDir, String(input.cardId)), { recursive: true });
    await writeFile(path, input.bytes);
    return {
      identifier: localAttachmentIdentifier(input.cardId, input.actionId, input.ext),
      size: input.bytes.length,
    };
  }

  async read(
    cardId: number,
    actionId: number,
    ext: string,
    variant?: string,
  ): Promise<Uint8Array | undefined> {
    // Variant pass-through (the zero-dep remainder): every variant spelling
    // resolves to the STORED ORIGINAL's bytes — store() writes only the
    // original (<action_id><ext>), so the variant suffix must not enter the
    // lookup path or every variant GET 404s. The `variant` argument stays in
    // the signature for a future backend that stores resized variants
    // (the mini_magick resize remains the named remainder).
    void variant;
    try {
      const path = this.storagePath(cardId, actionId, ext);
      return new Uint8Array(await readFile(path));
    } catch {
      // ENOENT and friends read as "no such stored file" — the route turns
      // that into the 404 (Ruby: send_file raises, controller 404s).
      return undefined;
    }
  }
}
