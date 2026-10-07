// The Bunny Storage blob driver.
//
// Bunny Storage is an HTTP filesystem. Its documented surface
// (bunny.net/docs/storage/http and /api-reference/storage) is:
//
//   PUT    https://<region>.storage.bunnycdn.com/<zone>/<path>
//          AccessKey: <storage zone password>
//          Content-Type: <optional>
//          <raw bytes as the request body>
//   GET    .../<zone>/<path>      the file's bytes
//   GET    .../<zone>/<path>/     a directory, as a JSON array
//   DELETE .../<zone>/<path>
//
// Auth is the AccessKey header carrying the ZONE password — not the
// account API key, not Bearer, not Basic. The hostname is
// region-specific (ny./la./sg. …), so it is a required argument rather
// than a default; guessing `storage.bunnycdn.com` sends a European
// zone's files to the wrong continent.
//
// PROVIDER DIFFERENCES this adapter works around, all documented in
// src/blob/driver.ts and pinned by the conformance suite:
//
// - NO HEAD. Bunny's Storage API documents no HEAD operation and makes
//   no header guarantee, so `head` is implemented over the
//   parent-directory listing: GET .../<dir>/ returns StorageObject
//   records, and the adapter matches ObjectName. This is the documented
//   way to get metadata without downloading bytes.
// - NO PERSISTED CONTENT TYPE. The StorageObject schema
//   (ObjectName, Path, IsDirectory, Length, LastChanged, DateCreated,
//   Guid, StorageZoneName, StorageZoneId, ServerId, UserId) carries no
//   MIME type, no ETag and no custom metadata. So `head`/`get` report a
//   content type ONLY for a key this adapter instance wrote in this
//   process (it remembers what it sent); for anything else it reports
//   undefined rather than inventing one. The engine never depends on
//   this: /files derives the response type from the stored bytes and
//   the action's original filename
//   (src/server/file-routes.ts, detectAttachmentContentType), which is
//   Ruby's own rule.
// - NO STREAMING. The HTTP response body arrives whole, so `get`
//   yields one chunk. The interface promises only byte equivalence.
//
// The listing is one directory deep — there is no recursive listing —
// so `list` walks the prefix segment by segment, and for a prefix that
// cuts a name in half it filters the parent's listing locally. Every
// walk level is one HTTP request; the engine's actual call is
// "<card_id>/", which is one request.

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

/** One record of Bunny's directory listing (the documented
 *  StorageObject schema, plus nothing assumed). */
interface BunnyStorageObject {
  ObjectName: string;
  Path: string;
  IsDirectory: boolean;
  Length: number;
  LastChanged: string;
  DateCreated?: string;
}

/** The subset of fetch this adapter uses. Injected so the conformance
 *  suite can run against a mock and no test ever touches a live zone. */
export type FetchLike = (
  input: string,
  init?: { method?: string; headers?: Record<string, string>; body?: Uint8Array },
) => Promise<{ status: number; ok: boolean; headers: { get(name: string): string | null }; body: ReadableStream<Uint8Array> | null; arrayBuffer(): Promise<ArrayBuffer>; json(): Promise<unknown>; text(): Promise<string> }>;

export interface BunnyStorageOptions {
  /** The zone's storage endpoint HOST, region-specific
   *  ("ny.storage.bunnycdn.com"). The zone name is a separate option,
   *  and the two form the first path segment. */
  endpoint: string;
  /** The storage zone name. */
  storageZone: string;
  /** The storage zone PASSWORD, sent as AccessKey. Never the account
   *  API key. */
  accessKey: string;
  /** Injected fetch. Defaults to the global. */
  fetch?: FetchLike;
  /** Optional CDN hostname. When set, `publicUrl` is available for the
   *  attachment url builder; the adapter itself always reads and
   *  writes over the storage endpoint, because the CDN serves a
   *  different origin and would not carry the AccessKey header. */
  cdnHost?: string;
}

/** Bunny's HTTP status for "no such object" on GET/HEAD. A 404 from a
 *  DELETE or a PUT means an auth or zone problem, not a missing key —
 *  only the reads treat it as absent. */
const NOT_FOUND = 404;

export class BunnyStorageBlobDriver implements BlobDriver {
  private readonly endpoint: string;
  private readonly storageZone: string;
  private readonly accessKey: string;
  private readonly doFetch: FetchLike;
  private readonly cdnHost: string | undefined;
  /** What this process wrote and the content type it sent. Bunny
   *  stores no type, so this process-local memo is the only honest
   *  source; see the module header. */
  private readonly writtenContentTypes = new Map<string, string>();

  constructor(options: BunnyStorageOptions) {
    if (options.endpoint.trim() === "") throw new Error("bunny storage endpoint is required");
    if (options.storageZone.trim() === "") throw new Error("bunny storage zone is required");
    if (options.accessKey === "") throw new Error("bunny storage access key is required");
    this.endpoint = options.endpoint.replace(/\/+$/, "");
    this.storageZone = options.storageZone;
    this.accessKey = options.accessKey;
    this.doFetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init as RequestInit) as never);
    this.cdnHost = options.cdnHost;
  }

  /** The public URL for a key, when the zone has a CDN hostname
   *  configured. The engine's asset-output url builder uses this; an
   *  unconfigured zone returns undefined and the caller falls back to
   *  serving through its own /files route. */
  publicUrl(key: string): string | undefined {
    if (this.cdnHost === undefined) return undefined;
    assertBlobKey(key);
    return `https://${this.cdnHost}/${key}`;
  }

  async put(key: string, bytes: Uint8Array, options: BlobPutOptions = {}): Promise<PutResult> {
    assertBlobKey(key);
    const response = await this.doFetch(this.urlFor(key), {
      method: "PUT",
      headers: {
        AccessKey: this.accessKey,
        // Bunny stores no metadata; the header is harmless and some
        // Bunny edge configurations read it, so send it when known.
        ...(options.contentType === undefined ? {} : { "Content-Type": options.contentType }),
      },
      body: bytes,
    });
    if (!response.ok) throw new BunnyError(response.status, key, "put");
    if (options.contentType !== undefined) this.writtenContentTypes.set(key, options.contentType);
    return {
      key,
      size: bytes.length,
      ...(options.contentType === undefined ? {} : { contentType: options.contentType }),
    };
  }

  async get(key: string): Promise<BlobBody | undefined> {
    assertBlobKey(key);
    const response = await this.doFetch(this.urlFor(key), {
      method: "GET",
      headers: { AccessKey: this.accessKey },
    });
    if (response.status === NOT_FOUND) return undefined;
    if (!response.ok) throw new BunnyError(response.status, key, "get");
    // The HTTP body arrives whole. Handing it over as one chunk keeps
    // the caller honest about the interface's real promise (bytes, not
    // chunks) and avoids a pointless re-chunk loop.
    const buffer = new Uint8Array(await response.arrayBuffer());
    return {
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(buffer);
          controller.close();
        },
      }),
      metadata: {
        key,
        size: buffer.length,
        ...contentTypeOrOmit(this.writtenContentTypes.get(key)),
      },
    };
  }

  async getBytes(key: string): Promise<Uint8Array | undefined> {
    const got = await this.get(key);
    if (got === undefined) return undefined;
    return readStreamToBytes(got.body);
  }

  async head(key: string): Promise<BlobMetadata | undefined> {
    assertBlobKey(key);
    const slash = key.lastIndexOf("/");
    const directory = slash === -1 ? "" : key.slice(0, slash + 1);
    const name = key.slice(slash + 1);
    const listing = await this.listDirectory(directory);
    const found = listing.find((entry) => entry.ObjectName === name && !entry.IsDirectory);
    if (found === undefined) return undefined;
    return {
      key,
      size: found.Length,
      ...contentTypeOrOmit(this.writtenContentTypes.get(key)),
      ...lastModifiedOrOmit(found.LastChanged),
    };
  }

  async delete(key: string): Promise<void> {
    assertBlobKey(key);
    const response = await this.doFetch(this.urlFor(key), {
      method: "DELETE",
      headers: { AccessKey: this.accessKey },
    });
    // Idempotent by the interface contract. Bunny answers 404 for a key
    // that is already gone, which is success here, not an error.
    if (!response.ok && response.status !== NOT_FOUND) {
      throw new BunnyError(response.status, key, "delete");
    }
    this.writtenContentTypes.delete(key);
  }

  async list(prefix: string, options: BlobListOptions = {}): Promise<BlobListEntry[]> {
    assertBlobPrefix(prefix);
    const entries: BlobListEntry[] = [];
    if (prefix === "") {
      // The root listing. One directory is all Bunny exposes; a prefix
      // of "" means the caller wants everything, which is one level.
      for (const entry of await this.listDirectory("")) {
        if (!entry.IsDirectory) entries.push(this.entryFor("", entry));
      }
    } else {
      const cut = prefix.lastIndexOf("/");
      const directory = cut === -1 ? "" : prefix.slice(0, cut + 1);
      const remainder = prefix.slice(cut + 1);
      for (const entry of await this.listDirectory(directory)) {
        if (entry.IsDirectory) continue;
        const key = `${directory}${entry.ObjectName}`;
        if (!key.startsWith(prefix)) continue;
        entries.push(this.entryFor(directory, entry));
        if (options.limit !== undefined && entries.length >= options.limit) break;
      }
      void remainder;
    }
    entries.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    return options.limit === undefined ? entries : entries.slice(0, options.limit);
  }

  private entryFor(directory: string, entry: BunnyStorageObject): BlobListEntry {
    const key = `${directory}${entry.ObjectName}`;
    return {
      key,
      size: entry.Length,
      ...contentTypeOrOmit(this.writtenContentTypes.get(key)),
      ...lastModifiedOrOmit(entry.LastChanged),
    };
  }

  /** One directory listing. A missing directory lists as empty: a card
   *  with no stored files is the normal case, not a failure. */
  private async listDirectory(directory: string): Promise<BunnyStorageObject[]> {
    const response = await this.doFetch(`${this.base()}${directory}`, {
      method: "GET",
      headers: { Accept: "application/json", AccessKey: this.accessKey },
    });
    if (response.status === NOT_FOUND) return [];
    if (!response.ok) throw new BunnyError(response.status, directory, "list");
    const parsed = (await response.json()) as unknown;
    if (!Array.isArray(parsed)) {
      throw new BunnyError(response.status, directory, "list (response was not a JSON array)");
    }
    return parsed.filter(isStorageObject);
  }

  private base(): string {
    return `https://${this.endpoint}/${this.storageZone}/`;
  }

  private urlFor(key: string): string {
    return `${this.base()}${key}`;
  }
}

function contentTypeOrOmit(type: string | undefined): { contentType?: string } {
  return type === undefined ? {} : { contentType: type };
}

function lastModifiedOrOmit(value: string | undefined): { lastModified?: Date } {
  if (value === undefined) return {};
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? {} : { lastModified: parsed };
}

function isStorageObject(value: unknown): value is BunnyStorageObject {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.ObjectName === "string" && typeof record.IsDirectory === "boolean";
}

/** A Bunny Storage request that did not succeed. Carries the status so
 *  a caller can tell an auth failure (401/403) from a missing key
 *  (404) instead of logging "storage error" for both. */
export class BunnyError extends Error {
  readonly status: number;
  readonly key: string;
  readonly operation: string;

  constructor(status: number, key: string, operation: string) {
    super(`bunny storage ${operation} failed for ${JSON.stringify(key)} with status ${status}`);
    this.name = "BunnyError";
    this.status = status;
    this.key = key;
    this.operation = operation;
  }
}