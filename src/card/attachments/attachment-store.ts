// The attachment STORAGE seam — the port of CarrierWave::Storage::File
// for local attachments, now expressed over the blob-driver interface
// (src/blob/driver.ts) instead of reaching for node:fs directly.
//
// Ruby's local scheme (card-mod-carrierwave-0.20.0):
// - identifier in db_content:  ~<card_id>/<action_id><ext>
//   (lib/carrier_wave/file_card_uploader.rb:88-93 doc table)
// - storage path:              <files_dir>/<card_id>/<action_id>(-<variant>)<ext>
//   (set/abstract/attachment/paths.rb:11-19 upload_dir +
//   lib/carrier_wave/file_card_uploader/path.rb:33-43 store_path/retrieve_path;
//   files_dir = Card.paths["files"], the deck's `files` directory)
//
// That path below <files_dir> IS the blob key, unchanged — which is
// what lets a host swap the storage backend without the cards noticing:
// a host that mounts an R2 or Bunny bucket keys the same
// "<card_id>/<action_id><ext>" and the db_content identifiers,
// identifiers-to-urls and rendered HTML are all identical. The store's
// job is therefore only to translate the engine's numeric
// (cardId, actionId, ext, variant) call into a blob key, and to apply
// the two naming rules Ruby's uploader classes encode. It holds no
// storage logic of its own, so there is nothing provider-specific left
// below it.

import { resolve } from "node:path";
import type { BlobDriver } from "../../blob/driver.js";
import { FilesystemBlobDriver } from "../../blob/filesystem.js";
import { contentTypeForExtension } from "../../blob/content-types.js";
import {
  codedAttachmentIdentifier,
  filenameWithVariant,
  localAttachmentIdentifier,
} from "./attachment-content.js";
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
  /** The processed bytes of each rendition, by stored file name
   *  (image-resize.ts). A rendition without an entry stores the
   *  original's bytes. */
  renditionBytes?: Readonly<Record<string, Uint8Array>>;
  /** "tmp": the upload cache of a two-step upload for a card that does not
   *  exist yet (card-mod-carrierwave 00_upload_cache.rb tmp_upload_dir,
   *  files_base_dir("tmp")/files/<cache card id>), kept apart from the
   *  deck's files. Absent = the files area. */
  area?: "files" | "tmp";
  /** Coded storage (set/abstract/attachment/coded.rb): the files live under
   *  the mod's data/files/<codename parts> directory, not the deck's files
   *  area, keyed by codename and mount name instead of card and action id.
   *  `dirParts` is the card name's codename parts in order; `mountName` is
   *  "image" or "file" (the mounted attribute, set/type/image.rb:1 and
   *  set/type/file.rb:1). */
  coded?: { mod: string; dirParts: readonly string[]; mountName: string };
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
  read(cardId: number, actionId: number, ext: string, variant?: string, area?: "files" | "tmp"): Promise<Uint8Array | undefined>;
  /** Remove one action's file and its renditions (delete_files_for_action,
   *  00_upload_cache.rb / attachment.rb). Optional: a store without it
   *  keeps the files. */
  remove?(cardId: number, actionId: number, ext: string, area?: "files" | "tmp"): Promise<void>;
  /** Delete exactly the files store(input) writes, when a save that
   *  stored them rolled back. Idempotent; a missing file is not an error.
   *  Optional: a store without it leaves such files unreferenced. */
  discard?(input: AttachmentStoreInput): Promise<void>;
}

/** The attachment store over any blob driver — the one implementation
 *  of the store, and the reason a host can change storage providers by
 *  changing one constructor argument. */
export class BlobAttachmentStore implements AttachmentStore {
  private readonly blobs: BlobDriver;
  /** The cache area's own driver ("tmp"): carrierwave's
   *  files_base_dir("tmp") is a directory APART from the deck's files, so
   *  the two-step upload's cache never lands inside them. Bucket drivers
   *  leave this unset and the cache keys under tmp/ in the one namespace. */
  private readonly tmpBlobs?: BlobDriver;

  constructor(blobs: BlobDriver, tmpBlobs?: BlobDriver) {
    this.blobs = blobs;
    this.tmpBlobs = tmpBlobs;
  }

  private blobsFor(area?: "files" | "tmp"): BlobDriver {
    return (area === "tmp" && this.tmpBlobs !== undefined ? this.tmpBlobs : this.blobs);
  }

  /** The blob key for one stored file: <cardId>/<name>. */
  private key(cardId: number, name: string): string {
    return `${cardId}/${name}`;
  }

  /** The blob key for one stored file. The tmp upload cache of a two-step
   *  upload lives under the cache area, never among the deck's served files:
   *  - with a separate cache driver (LocalAttachmentStore), the key is
   *    Ruby's tmp_upload_dir RELATIVE to that driver — files_base_dir("tmp")
   *    IS the driver root, and the path below it is a literal "files/"
   *    segment plus the cache card id (00_upload_cache.rb:88-91,
   *    file_card_uploader/path.rb:24-25 cache_dir);
   *  - with one namespace (a bucket, no cache driver), a "tmp/" prefix keeps
   *    the cache distinguishable from the served files. */
  private keyFor(cardId: number, name: string, area?: "files" | "tmp"): string {
    if (area !== "tmp") return `${cardId}/${name}`;
    return this.tmpBlobs !== undefined ? `files/${cardId}/${name}` : `tmp/${cardId}/${name}`;
  }

  async store(input: AttachmentStoreInput): Promise<StoredAttachment> {
    // The stored filenames: FileCardUploader shape = <action_id><ext>;
    // ImageCardUploader shape (renditionNames present) = the -original
    // file + one file per version (image_card_uploader.rb:16-27, :44-57;
    // file_card_uploader.rb:266-283). Coded storage keys the same shapes by
    // mount name ("image-original.svg", "file.txt") under the codename
    // directory, and its identifier is the coded one (file_card_uploader.rb
    // :171-177 url_filename for a coded card: "<mod><ext>").
    const coded = input.coded;
    // The key: local storage keys by card id (<card_id>/<action_id><ext>,
    // file_card_uploader.rb store path); CODED storage keys by the codename
    // parts under the mod's data/files (coded.rb coded_dir), no card id.
    const prefix = coded === undefined ? `${input.cardId}/` : `${coded.dirParts.join("/")}/`;
    const names = input.renditionNames ?? [coded === undefined ? filenameWithVariant(input.actionId, input.ext) : `${coded.mountName}${input.ext}`];
    let stored = 0;
    for (const name of names) {
      // The versions are real resizes when the caller supplies their bytes
      // (image-resize.ts imageVersionBytes); the -original spelling and any
      // name the resizer did not produce store the original bytes.
      const bytes = input.renditionBytes?.[name] ?? input.bytes;
      const result = await this.blobsFor(input.area).put(
        // Local keys ride keyFor so the two-step upload's cache keeps its own
        // area (carrierwave's cache/store split); coded keys are the mod's
        // own directory, no area.
        coded === undefined ? this.keyFor(input.cardId, name, input.area) : `${prefix}${name}`,
        bytes,
        { contentType: contentTypeForExtension(input.ext) },
      );
      // The size reported is the ORIGINAL's byte count, which is what
      // carrierwave's attachment.size means: every rendition of an
      // upload is a byte-copy of the original in this port, and the
      // resize is the named remainder. Taking the max (rather than the
      // last write's result) keeps the value correct if a host ever
      // enables a real resize that makes a rendition smaller.
      stored = Math.max(stored, result.size);
    }
    return {
      identifier:
        coded !== undefined
          ? codedAttachmentIdentifier(coded.dirParts, coded.mod, input.ext)
          : localAttachmentIdentifier(input.cardId, input.actionId, input.ext),
      size: Math.max(stored, input.bytes.length),
    };
  }

  async discard(input: AttachmentStoreInput): Promise<void> {
    const coded = input.coded;
    const prefix = coded === undefined ? `${input.cardId}/` : `${coded.dirParts.join("/")}/`;
    const names = input.renditionNames ?? [coded === undefined ? filenameWithVariant(input.actionId, input.ext) : `${coded.mountName}${input.ext}`];
    for (const name of names) {
      await this.blobsFor(input.area).delete(
        coded === undefined ? this.keyFor(input.cardId, name, input.area) : `${prefix}${name}`,
      );
    }
  }

  async read(
    cardId: number,
    actionId: number,
    ext: string,
    variant?: string,
    area?: "files" | "tmp",
  ): Promise<Uint8Array | undefined> {
    // Path resolution per the uploader classes. A VARIANT request resolves
    // the version file <action_id>-<variant><ext> (Versions#full_filename)
    // and falls back to the bare spelling (uploads that predate the
    // rendition machinery / File cards, which have no versions). A
    // version-LESS request (the identifier's own spelling) tries
    // <action_id><ext> first, then <action_id>-original<ext> — the
    // ImageCardUploader's stored spelling for the version-less file
    // (image_card_uploader.rb:44-57; the store seam does not know the
    // card's uploader class, so both spellings resolve). A key with no
    // object behind it reads as "no such stored file" — the route turns
    // that into the 404 (Ruby: send_file raises, controller 404s).
    const candidates =
      variant === undefined || variant === ""
        ? [filenameWithVariant(actionId, ext), filenameWithVariant(actionId, ext, "original")]
        : [filenameWithVariant(actionId, ext, variant), filenameWithVariant(actionId, ext)];
    for (const name of candidates) {
      const bytes = await this.blobsFor(area).getBytes(this.keyFor(cardId, name, area));
      if (bytes !== undefined) return bytes;
    }
    return undefined;
  }
}

/** Local-filesystem implementation of the Ruby files-dir scheme, over
 *  the blob-driver interface. Retained by name because it is what every
 *  host composes today; a host that mounts a bucket instead composes
 *  {@link BlobAttachmentStore} over that bucket's driver instead. */
export class LocalAttachmentStore extends BlobAttachmentStore {
  /** @param filesDir the deck's files directory (Card.paths["files"]). The
   *  two-step upload's cache area roots at its PARENT — carrierwave's
   *  files_base_dir("tmp") is a sibling of files/, never inside it
   *  (card-mod-carrierwave 00_upload_cache.rb tmp_upload_dir). */
  constructor(filesDir: string) {
    const resolved = resolve(filesDir);
    super(new FilesystemBlobDriver(resolved), new FilesystemBlobDriver(resolve(resolved, "..", "tmp")));
  }
}
