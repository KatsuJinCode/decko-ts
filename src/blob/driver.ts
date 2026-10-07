// The blob-storage seam — the missing half of upstream proposal
// decko-commons/decko#1282 ("one abstract SQL driver interface and one
// blob-driver interface; each provider gets one adapter ... proven
// identical by a shared conformance suite"). The SQL half is
// `SQLDatabaseDriver` (src/server/driver.ts); this file is the blob half.
//
// Rules, matching the SQL seam:
// - The engine never imports vendor SDKs. Adapters implement this
//   interface per provider (filesystem, Cloudflare R2, Bunny Storage,
//   the existing Ruby-deck files directory).
// - Every adapter passes the same conformance suite
//   (tests/server/blob-conformance.ts). A provider difference that
//   matters to the engine is stated in a table, not smuggled through a
//   return value — see PROVIDER DIFFERENCES below.
// - Keys are POSIX-style, '/'-separated, no leading or trailing slash,
//   no '.' or '..' segments. Adapters validate and reject anything else
//   with BlobKeyError. This keeps a key a portable name in every
//   provider and makes path traversal impossible by construction
//   rather than by each adapter remembering to check.
//
// What the engine actually needs from a blob store is small: write an
// upload, read it back (streamed, so a large file never sits in memory
// twice), ask whether it exists and how big it is, delete it, and
// enumerate a card's stored renditions. That is this interface.

/** Metadata every provider can report about one stored object. */
export interface BlobMetadata {
  /** The provider-normalized key (see key normalization in the module
   *  header). */
  key: string;
  /** Stored byte count. Always a number, never bigint: an attachment
   *  larger than 2^53 bytes is not a thing a card CMS serves. */
  size: number;
  /** Provider-recorded content type when the put supplied one and the
   *  provider persists it. undefined means the provider stores no
   *  content type — a caller must sniff or fall back, and must not
   *  assume the blob's own bytes imply one. */
  contentType?: string;
  /** Provider version/opaque ETag when available. Opaque: never parse
   *  it, only compare it. */
  etag?: string;
  /** Last modification time when the provider reports one. */
  lastModified?: Date;
}

/** What a successful `put` reports. Same shape as head's result: a
 *  caller that put an object can read its metadata off the return
 *  value without a second round trip. */
export type PutResult = BlobMetadata;

/** The options a write carries. */
export interface BlobPutOptions {
  /** The stored content type. Providers that cannot persist one ignore
   *  it and leave contentType undefined in the result — never guess. */
  contentType?: string;
  /** Small caller-defined values (image variant name, source action id,
   *  original filename). Providers that cannot store metadata ignore
   *  them; the engine never reads them back for correctness, only for
   *  diagnostics, so silently dropping them is safe. */
  metadata?: Record<string, string>;
}

/** The streaming read result. `body` is a ReadableStream of the stored
 *  bytes in order; a driver that holds the whole object in memory still
 *  returns a stream so callers never grow a per-adapter code path. */
export interface BlobBody {
  body: ReadableStream<Uint8Array>;
  metadata: BlobMetadata;
}

/** One entry of a prefix listing. */
export interface BlobListEntry extends BlobMetadata {
  /** The full key, not the suffix below the prefix. */
  key: string;
}

/** The listing options. Deliberately small: the engine only ever lists
 *  one card's directory. */
export interface BlobListOptions {
  /** Return at most this many entries. Providers that cannot page
   *  return everything; the cap is then applied by the adapter. */
  limit?: number;
}

/** The blob-storage driver interface every adapter implements. */
export interface BlobDriver {
  /** Write an object, replacing any object already at `key`
   *  (last-write-wins; providers differ in whether the replace is
   *  atomic — see PROVIDER DIFFERENCES). */
  put(key: string, bytes: Uint8Array, options?: BlobPutOptions): Promise<PutResult>;

  /** Read an object's bytes as a stream, or undefined when no object
   *  is at `key`. A missing object is NOT an error: it is the normal
   *  result of a card whose file was never uploaded, and the /files
   *  route turns undefined into its 404. */
  get(key: string): Promise<BlobBody | undefined>;

  /** Convenience over `get`: read the whole object into one Uint8Array.
   *  Provided on the interface so callers that want the whole thing
   *  (the attachment read path, which serves a card's file as a single
   *  Response body) do not each reimplement buffer-accumulation — and
   *  do not each get it subtly different. Streaming callers use `get`. */
  getBytes(key: string): Promise<Uint8Array | undefined>;

  /** Metadata without the bytes, or undefined when no object is at
   *  `key`. This is the `head` of the interface name: a caller sizing
   *  a response or checking a cache must not download the object. */
  head(key: string): Promise<BlobMetadata | undefined>;

  /** Remove the object at `key`. Deleting a key that holds nothing
   *  succeeds (idempotent) on every adapter — a retry after a partial
   *  failure must not have to distinguish "already gone" from
   *  "never existed". */
  delete(key: string): Promise<void>;

  /** Enumerate the keys under `prefix`, ascending. The prefix is
   *  matched literally (not as a glob or a path boundary), and
   *  adapters normalize a prefix that lacks a trailing '/' the way a
   *  card directory wants it: the engine passes `"<cardId>/"`. */
  list(prefix: string, options?: BlobListOptions): Promise<BlobListEntry[]>;
}

/** Thrown for a key that is not a valid blob key. A BlobKeyError is a
 *  programming error in the caller, never a provider failure, so
 *  adapters throw it before touching the network or the disk. */
export class BlobKeyError extends Error {
  constructor(key: string, reason: string) {
    super(`invalid blob key ${JSON.stringify(key)}: ${reason}`);
    this.name = "BlobKeyError";
  }
}

/** Reject a key that is empty, absolute, backslash-separated, or that
 *  contains a '.' / '..' / empty segment. Shared by every adapter so
 *  the rule is stated once and cannot drift per provider. */
export function assertBlobKey(key: string): void {
  if (typeof key !== "string" || key.length === 0) throw new BlobKeyError(String(key), "empty");
  if (key.length > 1024) throw new BlobKeyError(key, "longer than 1024 characters");
  if (key.includes("\\")) throw new BlobKeyError(key, "contains a backslash");
  if (key.startsWith("/")) throw new BlobKeyError(key, "absolute");
  if (key.endsWith("/")) throw new BlobKeyError(key, "trailing slash");
  for (const segment of key.split("/")) {
    if (segment.length === 0) throw new BlobKeyError(key, "empty path segment");
    if (segment === "." || segment === "..") throw new BlobKeyError(key, "relative segment");
    if (segment.includes("\0")) throw new BlobKeyError(key, "contains a NUL byte");
  }
}

/** A listing prefix is allowed to be empty (the whole namespace) or to
 *  end in '/'; it may not name a single object. */
export function assertBlobPrefix(prefix: string): void {
  if (prefix === "") return;
  if (prefix.endsWith("/")) {
    assertBlobKey(prefix.slice(0, -1));
    return;
  }
  // A prefix that does not end in '/' is a literal string prefix, so it
  // may cut a segment in half (listing "12" also matches "123/...").
  // It still may not contain a relative segment or a NUL.
  if (prefix.includes("\0")) throw new BlobKeyError(prefix, "contains a NUL byte");
  for (const segment of prefix.split("/")) {
    if (segment === "." || segment === "..") throw new BlobKeyError(prefix, "relative segment");
  }
}

/** PROVIDER DIFFERENCES — the facts a caller must not assume away.
 *
 *  - Metadata persistence. R2 stores custom metadata and httpMetadata
 *    (content type). Bunny Storage's documented listing schema
 *    (ObjectName/Path/IsDirectory/Length/LastChanged/DateCreated/Guid)
 *    carries no MIME type, checksum or custom metadata, and its HTTP
 *    API documents no HEAD. The BunnyStorageAdapter therefore reports
 *    contentType from what the PUT sent and nothing else, and
 *    implements `head` over the parent-directory listing. The
 *    filesystem adapter derives a content type from the file extension
 *    on read, which is a DIFFERENT rule from "what the put said" — a
 *    conformance case pins that the two agree for every extension the
 *    engine stores (.css .js .png .jpg .jpeg .gif .svg .webp .pdf
 *    .html .txt), because a card CMS must serve the right type whether
 *    the bytes came from an upload or a migration.
 *
 *  - Replace atomicity. A filesystem put that fails midway leaves a
 *    partial file; R2 and Bunny PUT a whole object. The conformance
 *    suite does not test mid-failure state (it cannot induce one
 *    portably); callers that need all-or-nothing should write to a
 *    temporary key and rename, which only the filesystem adapter
 *    supports natively.
 *
 *  - Streaming. Only the filesystem adapter returns a true streaming
 *    body (createReadStream); R2 and Bunny buffer the response because
 *    their runtimes hand over a complete body. Callers must not assume
 *    a chunk arrives per storage block, only that concatenating the
 *    chunks reproduces the object byte for byte. A conformance case
 *    pins the concatenated bytes for an object larger than any single
 *    internal buffer of the adapter under test.
 *
 *  - Listing consistency. R2 list is strongly consistent; the
 *    filesystem walk and Bunny's directory listing are too. No adapter
 *    promises cross-provider consistency for a key written between two
 *    concurrent list calls.
 */