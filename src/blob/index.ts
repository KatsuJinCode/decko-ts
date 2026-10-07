// The blob-storage module — the blob half of upstream proposal
// decko-commons/decko#1282. Public surface:
//
// - driver.ts: the BlobDriver interface every adapter implements, plus
//   the key validator and the PROVIDER DIFFERENCES table that says what
//   a caller must not assume away
// - content-types.ts: content type from a key extension, over the
//   ENGINE's own extension table so the upload path and the storage
//   layer can never disagree about what a card's file is
// - memory.ts: the in-memory adapter (reference implementation, and
//   the backend for a host with no filesystem and no bucket)
// - filesystem.ts: the filesystem adapter — the CarrierWave::Storage::File
//   port, and the reader for an existing Ruby deck's files directory
// - r2.ts: Cloudflare R2 over the Workers binding
// - bunny-storage.ts: Bunny Storage over its HTTP API
//
// The SQL counterpart is src/server/driver.ts; the shared conformance
// suite is tests/server/blob-conformance.ts.

export {
  BlobKeyError,
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

export {
  EXTENSION_CONTENT_TYPES,
  contentTypeForExtension,
} from "./content-types.js";

export { MemoryBlobDriver, readStreamToBytes } from "./memory.js";

export { FilesystemBlobDriver, nodeStreamToWebStream } from "./filesystem.js";

export { R2BlobDriver, type R2BucketLike, type R2ObjectLike } from "./r2.js";

export {
  BunnyError,
  BunnyStorageBlobDriver,
  type BunnyStorageOptions,
  type FetchLike,
} from "./bunny-storage.js";