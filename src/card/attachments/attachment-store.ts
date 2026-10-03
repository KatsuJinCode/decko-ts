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
import { renditionFileNames } from "./image-renditions.js";

/** The bytes + names one upload carries into the store. */
export interface AttachmentStoreInput {
  cardId: number;
  actionId: number;
  /** Lowercased extension WITH leading dot ("" allowed — Ruby stores
   *  extensionless files as the bare action id; FileCardUploader#valid?
   *  then reports the upload invalid for URL emission). */
  ext: string;
  bytes: Uint8Array;
  /** The rendition spellings to create alongside the original (the
   *  ImageCardUploader port — image-renditions.ts renditionFileNames:
   *  the original's -original spelling + one file per version). ABSENT =
   *  the plain FileCardUploader shape: exactly one file
   *  <action_id><ext>. */
  renditionNames?: readonly string[];
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
  /** The bytes of one action's file. `variant` resolves the rendition
   *  spelling <action_id>-<variant><ext> (the img src the image views
   *  emit); undefined = no such file. */
  read(cardId: number, actionId: number, ext: string, variant?: string): Promise<Uint8Array | undefined>;
}

/** Local-filesystem implementation of the Ruby files-dir scheme. */
export class LocalAttachmentStore implements AttachmentStore {
  private readonly filesDir: string;

  /** @param filesDir the deck's files directory (Card.paths["files"]). */
  constructor(filesDir: string) {
    this.filesDir = filesDir;
  }

  async store(input: AttachmentStoreInput): Promise<StoredAttachment> {
    await mkdir(join(this.filesDir, String(input.cardId)), { recursive: true });
    // The stored filenames: FileCardUploader shape = <action_id><ext>;
    // ImageCardUploader shape (renditionNames present) = the -original
    // file + one file per version (image_card_uploader.rb:16-27, :44-57;
    // file_card_uploader.rb:266-283). Version bytes are the original's
    // byte-copy (the mini_magick resize is the named seam,
    // image-renditions.ts versionBytes).
    const names = input.renditionNames ?? [`${input.actionId}${input.ext}`];
    for (const name of names) {
      await writeFile(join(this.filesDir, String(input.cardId), name), input.bytes);
    }
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
    // Path resolution per the uploader classes. A VARIANT request resolves
    // the version file <action_id>-<variant><ext> (Versions#full_filename)
    // and falls back to the bare spelling (uploads that predate the
    // rendition machinery / File cards, which have no versions). A
    // version-LESS request (the identifier's own spelling) tries
    // <action_id><ext> first, then <action_id>-original<ext> — the
    // ImageCardUploader's stored spelling for the version-less file
    // (image_card_uploader.rb:44-57; the store seam does not know the
    // card's uploader class, so both spellings resolve). ENOENT and
    // friends read as "no such stored file" — the route turns that into
    // the 404 (Ruby: send_file raises, controller 404s).
    const candidates =
      variant === undefined || variant === ""
        ? [filenameWithVariant(actionId, ext), filenameWithVariant(actionId, ext, "original")]
        : [filenameWithVariant(actionId, ext, variant), filenameWithVariant(actionId, ext)];
    for (const name of candidates) {
      try {
        return new Uint8Array(await readFile(join(this.filesDir, String(cardId), name)));
      } catch {
        // try the next spelling
      }
    }
    return undefined;
  }
}
