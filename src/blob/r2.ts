// The Cloudflare R2 blob driver.
//
// R2 is S3-shaped but reached through the Workers R2 binding rather
// than an S3 SDK: the edge runtime has the binding, and the engine
// never imports a vendor SDK (the rule every driver here follows). The
// binding is declared structurally — R2BucketLike and friends — for the
// same reason src/server/drivers/d1.ts does it: @cloudflare/workers-types
// is not a dependency of this repo.
//
// What R2 gives, and what the interface therefore reports:
// - httpMetadata / customMetadata persist, so a put's contentType comes
//   back on head and get.
// - put is atomic and last-write-wins; a concurrent put to the same key
//   leaves exactly one whole object.
// - get returns a body the runtime has already buffered, so `get`
//   hands over one chunk. The interface promises only that concatenating
//   chunks reproduces the bytes, and the conformance suite pins that,
//   not the chunking.
// - list is strongly consistent and returns keys ascending, with
//   `delimiter` unused: the engine lists one card's directory as a flat
//   prefix, and a delimiter would split "12/" into a common prefix and
//   suppress the keys themselves.

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

/** The structural slice of R2Bucket this adapter uses.
 *
 *  A miss reads as `null`, not `undefined` — that is R2's actual return
 *  (verified against miniflare's local emulation, which is where the
 *  conformance suite caught it). The type says so, and `head`/`get`
 *  normalize both to undefined, because the blob interface states a
 *  miss as undefined and a caller must not have to know which provider
 *  spells it which way. */
export interface R2BucketLike {
  put(
    key: string,
    value: ArrayBuffer | Uint8Array | ReadableStream,
    options?: {
      httpMetadata?: { contentType?: string };
      customMetadata?: Record<string, string>;
    },
  ): Promise<{ key: string; size: number; etag: string; uploaded: Date; httpMetadata?: { contentType?: string } }>;
  get(key: string): Promise<R2ObjectLike | null | undefined>;
  head(key: string): Promise<R2ObjectLike | null | undefined>;
  delete(key: string): Promise<void>;
  list(options: { prefix?: string; limit?: number; cursor?: string }): Promise<{
    objects: R2ObjectLike[];
    truncated: boolean;
    cursor?: string;
  }>;
}

/** The structural slice of an R2 object body. */
export interface R2ObjectLike {
  key: string;
  size: number;
  etag: string;
  uploaded: Date;
  httpMetadata?: { contentType?: string };
  body: ReadableStream<Uint8Array>;
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
}

/** The structural slice of an R2Objects list entry (no body). */
interface R2ObjectEntryLike {
  key: string;
  size: number;
  etag: string;
  uploaded: Date;
  httpMetadata?: { contentType?: string };
}

export class R2BlobDriver implements BlobDriver {
  private readonly bucket: R2BucketLike;

  /** @param bucket the R2 binding, or any object with this shape. */
  constructor(bucket: R2BucketLike) {
    this.bucket = bucket;
  }

  async put(key: string, bytes: Uint8Array, options: BlobPutOptions = {}): Promise<PutResult> {
    assertBlobKey(key);
    const stored = await this.bucket.put(key, bytes, {
      // Only pass the optional metadata objects when the caller gave
      // them: R2 stores an explicitly-empty customMetadata as an empty
      // object, and a conformance case asserts the caller's metadata
      // survives verbatim, which is easier to reason about when the
      // absent case is genuinely absent.
      ...(options.contentType === undefined
        ? {}
        : { httpMetadata: { contentType: options.contentType } }),
      ...(options.metadata === undefined ? {} : { customMetadata: { ...options.metadata } }),
    });
    return {
      key: stored.key,
      size: stored.size,
      ...(stored.httpMetadata?.contentType === undefined
        ? {}
        : { contentType: stored.httpMetadata.contentType }),
      etag: stored.etag,
      lastModified: stored.uploaded,
    };
  }

  async get(key: string): Promise<BlobBody | undefined> {
    assertBlobKey(key);
    const object = await this.bucket.get(key);
    if (object == null) return undefined;
    return { body: object.body, metadata: metadataOf(object) };
  }

  async getBytes(key: string): Promise<Uint8Array | undefined> {
    assertBlobKey(key);
    const object = await this.bucket.get(key);
    if (object == null) return undefined;
    return new Uint8Array(await object.arrayBuffer());
  }

  async head(key: string): Promise<BlobMetadata | undefined> {
    assertBlobKey(key);
    const object = await this.bucket.head(key);
    return object == null ? undefined : metadataOf(object);
  }

  async delete(key: string): Promise<void> {
    assertBlobKey(key);
    // R2's delete is idempotent: deleting a missing key succeeds.
    await this.bucket.delete(key);
  }

  async list(prefix: string, options: BlobListOptions = {}): Promise<BlobListEntry[]> {
    assertBlobPrefix(prefix);
    const collected: BlobListEntry[] = [];
    let cursor: string | undefined;
    for (;;) {
      // Page until R2 says it is done or the caller's cap is reached.
      // A single call would silently truncate a large directory.
      const page: { objects: R2ObjectEntryLike[]; truncated: boolean; cursor?: string } =
        await this.bucket.list({
          ...(prefix === "" ? {} : { prefix }),
          limit: options.limit === undefined ? undefined : options.limit - collected.length,
          ...(cursor === undefined ? {} : { cursor }),
        });
      for (const object of page.objects) collected.push(metadataOf(object));
      if (options.limit !== undefined && collected.length >= options.limit) {
        return collected.slice(0, options.limit);
      }
      if (!page.truncated || page.cursor === undefined) break;
      cursor = page.cursor;
    }
    collected.sort(byKey);
    return collected;
  }
}

function metadataOf(object: R2ObjectEntryLike): BlobMetadata {
  return {
    key: object.key,
    size: object.size,
    ...(object.httpMetadata?.contentType === undefined
      ? {}
      : { contentType: object.httpMetadata.contentType }),
    etag: object.etag,
    lastModified: object.uploaded,
  };
}

function byKey(a: { key: string }, b: { key: string }): number {
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}