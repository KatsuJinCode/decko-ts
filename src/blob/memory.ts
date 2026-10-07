// The in-memory blob driver. Two jobs: the reference implementation
// the conformance suite's other adapters are measured against, and the
// backend for any host that has no filesystem and no bucket (a worker
// test, a one-shot render, an engine boot with no attachments).
//
// It is a complete BlobDriver, not a stub: it stores the bytes, the
// content type and the caller's metadata, streams a real ReadableStream
// chunked the way a filesystem read would chunk, and preserves
// insertion-independent ascending key order on list.

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

interface StoredObject {
  bytes: Uint8Array;
  contentType?: string;
  metadata: Record<string, string>;
  etag: string;
  lastModified: Date;
}

/** How many bytes one streamed chunk carries. Mirrors the filesystem
 *  adapter's read chunk so a test that asserts on chunking sees the
 *  same shape from both, rather than a memory adapter that hands back
 *  one giant chunk and hides a streaming bug in a caller. */
const STREAM_CHUNK = 64 * 1024;

export class MemoryBlobDriver implements BlobDriver {
  private readonly objects = new Map<string, StoredObject>();
  /** Monotonic counter behind the etag. A real provider's etag is
   *  opaque and provider-derived; a memory store has no provider, so a
   *  deterministic per-write value is enough for a caller to notice
   *  "this object was replaced" without pretending to be a hash. */
  private writes = 0;

  async put(key: string, bytes: Uint8Array, options: BlobPutOptions = {}): Promise<PutResult> {
    assertBlobKey(key);
    // Copy: the caller may reuse or mutate its buffer after the await,
    // and a store that aliased it would silently change under them.
    const copy = bytes.slice();
    this.writes += 1;
    const object: StoredObject = {
      bytes: copy,
      contentType: options.contentType,
      metadata: { ...(options.metadata ?? {}) },
      etag: `mem-${this.writes}`,
      lastModified: new Date(0),
    };
    this.objects.set(key, object);
    return this.metadataOf(key, object);
  }

  async get(key: string): Promise<BlobBody | undefined> {
    assertBlobKey(key);
    const object = this.objects.get(key);
    if (object === undefined) return undefined;
    return {
      body: this.streamOf(object.bytes),
      metadata: this.metadataOf(key, object),
    };
  }

  async getBytes(key: string): Promise<Uint8Array | undefined> {
    const got = await this.get(key);
    if (got === undefined) return undefined;
    return readStreamToBytes(got.body);
  }

  async head(key: string): Promise<BlobMetadata | undefined> {
    assertBlobKey(key);
    const object = this.objects.get(key);
    return object === undefined ? undefined : this.metadataOf(key, object);
  }

  async delete(key: string): Promise<void> {
    assertBlobKey(key);
    // Absent key succeeds: delete is idempotent by the interface
    // contract, so a retry after a partial failure is safe.
    this.objects.delete(key);
  }

  async list(prefix: string, options: BlobListOptions = {}): Promise<BlobListEntry[]> {
    assertBlobPrefix(prefix);
    const keys = [...this.objects.keys()].filter((k) => k.startsWith(prefix)).sort();
    const limited = options.limit === undefined ? keys : keys.slice(0, options.limit);
    return limited.map((key) => this.metadataOf(key, this.objects.get(key)!));
  }

  private metadataOf(key: string, object: StoredObject): BlobMetadata {
    return {
      key,
      size: object.bytes.length,
      ...(object.contentType === undefined ? {} : { contentType: object.contentType }),
      etag: object.etag,
      lastModified: object.lastModified,
    };
  }

  /** Chunk the stored bytes the way a filesystem read chunks, so a
   *  caller that assembles chunks sees multiple iterations. */
  private streamOf(bytes: Uint8Array): ReadableStream<Uint8Array> {
    let offset = 0;
    return new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset >= bytes.length) {
          controller.close();
          return;
        }
        const end = Math.min(offset + STREAM_CHUNK, bytes.length);
        controller.enqueue(bytes.slice(offset, end));
        offset = end;
      },
    });
  }
}

/** Concatenate a blob body stream into one buffer. Shared by the
 *  interface's default `getBytes` implementations and by tests. */
export async function readStreamToBytes(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value !== undefined) {
      chunks.push(value);
      total += value.length;
    }
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}