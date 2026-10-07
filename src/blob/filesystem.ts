// The filesystem blob driver — the port of CarrierWave::Storage::File,
// and the backend that reads an existing Ruby deck's files directory
// unchanged.
//
// Key mapping. The Ruby files directory (Card.paths["files"]) holds, per
// card-mod-carrierwave's own doc table
// (file_card_uploader.rb:86-125):
//
//   local  identifier ~<card_id>/<action_id><ext>
//          path       <files_dir>/<card_id>/<action_id>(-<variant>)<ext>
//
// so the blob key IS the path below <files_dir>, with '/' already where
// the filesystem wants a separator:
//
//   "<card_id>/<action_id><ext>"            the original
//   "<card_id>/<action_id>-<variant><ext>"   one image rendition
//
// That identity is the point of this adapter: a migration reads the
// existing deck by handing it the same <files_dir> Ruby used, with no
// rewriting and no parallel copy. Every other adapter keeps the same
// key shape, so switching a live deck from local storage to R2 or Bunny
// changes WHERE bytes live without changing what the cards say.
//
// Node-only (node:fs/promises) by design: the engine runs under node
// here, and this adapter is what an edge bundle uses through a
// bucket-backed implementation instead.

import { createReadStream } from "node:fs";
import { mkdir, opendir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import {
  assertBlobKey,
  assertBlobPrefix,
  type BlobBody,
  type BlobDriver,
  type BlobListEntry,
  type BlobListOptions,
  type BlobMetadata,
  type BlobPutOptions,
  type PutResult,
} from "./driver.js";
import { readStreamToBytes } from "./memory.js";
import { contentTypeForExtension } from "./content-types.js";

/** Byte size of one filesystem read chunk. */
const READ_CHUNK = 64 * 1024;

/** The filesystem-backed blob driver over one root directory. */
export class FilesystemBlobDriver implements BlobDriver {
  private readonly root: string;

  /** @param root the directory holding the key namespace. For the Ruby
   *  files directory this is Card.paths["files"]. */
  constructor(root: string) {
    // Absolute + normalized so the containment check below compares like
    // with like: a relative root would make `startsWith(root)` true for
    // keys that escape only under one cwd.
    this.root = resolve(root);
  }

  /** The absolute path one key resolves to. Exposed because the
   *  attachment store's error messages and the migration report both
   *  need the real path, and because it is the single place the key
   *  becomes a path. */
  pathFor(key: string): string {
    assertBlobKey(key);
    const path = resolve(this.root, ...key.split("/"));
    // Belt and braces: assertBlobKey already rejects '..' and absolute
    // keys, so this can only fail on a symlink or a case-folding quirk.
    // The check is cheap and makes the containment property local and
    // auditable rather than dependent on the key validator alone.
    if (path !== this.root && !path.startsWith(this.root + sep)) {
      throw new Error(`blob key ${JSON.stringify(key)} resolves outside the blob root`);
    }
    return path;
  }

  async put(key: string, bytes: Uint8Array, options: BlobPutOptions = {}): Promise<PutResult> {
    const path = this.pathFor(key);
    await mkdir(dirnameOf(path), { recursive: true });
    // Write-then-rename. A write that fails partway leaves the previous
    // object intact rather than a truncated file under the same name,
    // which is the difference between "the old image is still there"
    // and "every card on the deck now has a broken image".
    const temporary = `${path}.${randomUUID()}.part`;
    try {
      await writeFile(temporary, bytes);
      await rename(temporary, path);
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined);
      throw error;
    }
    const info = await stat(path);
    return {
      key,
      size: info.size,
      contentType:
        options.contentType ??
        contentTypeForExtension(extensionOf(key)) ??
        undefined,
      lastModified: info.mtime,
    };
  }

  async get(key: string): Promise<BlobBody | undefined> {
    const path = this.pathFor(key);
    let size: number;
    try {
      size = (await stat(path)).size;
    } catch {
      // ENOENT, ENOTDIR, EACCES: a file the caller cannot read is
      // "no object here" from the engine's point of view — the /files
      // route turns undefined into its 404 either way, and a provider
      // that threw would turn a missing attachment into a 500.
      return undefined;
    }
    return {
      body: nodeStreamToWebStream(createReadStream(path, { highWaterMark: READ_CHUNK })),
      metadata: {
        key,
        size,
        ...contentTypeOrOmit(contentTypeForExtension(extensionOf(key))),
        lastModified: (await stat(path)).mtime,
      },
    };
  }

  async getBytes(key: string): Promise<Uint8Array | undefined> {
    const path = this.pathFor(key);
    try {
      return new Uint8Array(await readFile(path));
    } catch {
      return undefined;
    }
  }

  async head(key: string): Promise<BlobMetadata | undefined> {
    const path = this.pathFor(key);
    try {
      const info = await stat(path);
      if (!info.isFile()) return undefined;
      return {
        key,
        size: info.size,
        ...contentTypeOrOmit(contentTypeForExtension(extensionOf(key))),
        lastModified: info.mtime,
      };
    } catch {
      return undefined;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }

  async list(prefix: string, options: BlobListOptions = {}): Promise<BlobListEntry[]> {
    assertBlobPrefix(prefix);
    const entries: BlobListEntry[] = [];
    // A prefix that names a directory subtree is walked; one that cuts
    // a name in half (the engine passes "<card_id>/", but the interface
    // allows "12") is filtered against the flat file list. Both end up
    // matching on the key string, so the result is identical either way
    // and a caller does not have to know which form it passed.
    await this.walk(this.root, (key, info) => {
      if (!key.startsWith(prefix)) return;
      entries.push({
        key,
        size: info.size,
        ...contentTypeOrOmit(contentTypeForExtension(extensionOf(key))),
        lastModified: info.mtime,
      });
    }, options.limit);
    entries.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    return options.limit === undefined ? entries : entries.slice(0, options.limit);
  }

  /** Depth-first walk yielding every regular file's blob key. `limit`
   *  stops the walk early: a listing that only needs the first 10
   *  entries must not read a 100k-file directory. */
  private async walk(
    directory: string,
    emit: (key: string, info: { size: number; mtime: Date }) => void,
    limit?: number,
  ): Promise<void> {
    if (limit !== undefined && limit <= 0) return;
    let dir;
    try {
      dir = await opendir(directory);
    } catch {
      return; // a missing directory is an empty namespace, not an error
    }
    for await (const entry of dir) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) {
        await this.walk(full, emit, limit);
        continue;
      }
      if (!entry.isFile()) continue;
      const key = full.slice(this.root.length + 1).split(sep).join("/");
      emit(key, await stat(full));
    }
  }
}

function dirnameOf(path: string): string {
  const cut = path.lastIndexOf(sep);
  return cut <= 0 ? path : path.slice(0, cut);
}

function extensionOf(key: string): string {
  const dot = key.lastIndexOf(".");
  if (dot <= key.lastIndexOf("/") + 1) return "";
  return key.slice(dot).toLowerCase();
}

function contentTypeOrOmit(type: string | undefined): { contentType?: string } {
  return type === undefined ? {} : { contentType: type };
}

/** A node Readable as the web ReadableStream the blob interface
 *  promises. Both halves ship in the edge runtimes and under node, so
 *  one helper serves every backend. */
export function nodeStreamToWebStream(source: Readable): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      source.on("data", (chunk: Buffer | string) => {
        controller.enqueue(typeof chunk === "string" ? new TextEncoder().encode(chunk) : new Uint8Array(chunk));
      });
      source.on("end", () => controller.close());
      source.on("error", (error) => controller.error(error));
    },
    cancel() {
      source.destroy();
    },
  });
}

export { readStreamToBytes };