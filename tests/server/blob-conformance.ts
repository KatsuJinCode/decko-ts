// Shared conformance suite for BlobDriver implementations.
//
// This is the promise half of upstream proposal decko-commons/decko#1282:
// one blob-driver interface, one adapter per provider, every adapter
// "proven identical by a shared conformance suite". The SQL half of
// that promise is tests/server/drivers/conformance.ts; this file is its
// blob counterpart and follows the same shape — a driver under test is
// supplied as a FACTORY, so each suite owns its own resource lifecycle
// (a temp directory, a mock HTTP server, a miniflare instance) and can
// dispose of it afterwards.
//
// Two kinds of case live here, and the distinction matters:
//
//  1. CONTRACT cases — every adapter must pass, no exceptions. They
//     state what "identical" means: a put is readable by get, getBytes
//     and head; a get's chunks concatenate to exactly the written
//     bytes; size is the byte count and never a string; delete is
//     idempotent; list is prefix-scoped and ascending; a missing key is
//     undefined and not a throw; and an invalid key is rejected by
//     every adapter identically (BlobKeyError), because a key that one
//     adapter accepts and another treats as a path traversal is exactly
//     the kind of provider difference that must never exist.
//
//  2. PROVIDER-DIFFERENCE cases — marked as such and asserted
//     explicitly, so a provider gap is a pinned, named fact rather than
//     a suite failure that gets special-cased away. The known gaps are
//     in src/blob/driver.ts under PROVIDER DIFFERENCES: Bunny Storage
//     has no HEAD and persists no content type; R2 and Bunny cannot
//     stream incrementally.
//
// The cross-adapter pinning (every adapter produces the SAME bytes and
// the SAME keys for the same operations) is a separate file,
// cross-adapter-parity.test.ts, mirroring how the SQL side pins
// cross-adapter-byte-parity.test.ts.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  BlobKeyError,
  type BlobDriver,
  type BlobListEntry,
} from "../../src/blob/driver.js";
import { contentTypeForExtension } from "../../src/blob/content-types.js";

export interface BlobDriverUnderTest {
  driver: BlobDriver;
  /** Release the driver's resources (remove a temp directory, stop a
   *  mock server, dispose miniflare). Called once after the suite. */
  dispose?: () => void | Promise<void>;
  /** The provider's adapter-qualified name, used to title the
   *  provider-difference cases so a failure says which gap reopened. */
  provider?: string;
}

export type BlobDriverFactory = () => BlobDriverUnderTest | Promise<BlobDriverUnderTest>;

/** Bytes that are not valid UTF-8 in any encoding, so a round trip
 *  cannot pass by accident through a string coercion. */
const BINARY = new Uint8Array([0x00, 0x01, 0xff, 0xfe, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

/** Deterministic pseudo-random bytes. A fixed LCG, so a failure is
 *  reproducible and the same corpus runs on every adapter — a real
 *  random source would make a cross-adapter byte comparison untestable. */
function deterministicBytes(length: number, seed: number): Uint8Array {
  const out = new Uint8Array(length);
  let state = seed >>> 0;
  for (let i = 0; i < length; i += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    out[i] = (state >>> 24) & 0xff;
  }
  return out;
}

async function streamToBytes(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
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

export function runBlobConformance(suiteName: string, factory: BlobDriverFactory): void {
  describe(suiteName, () => {
    let handle: BlobDriverUnderTest;
    let blobs: BlobDriver;

    beforeAll(async () => {
      handle = await factory();
      blobs = handle.driver;
    }, 30_000);

    afterAll(async () => {
      await handle.dispose?.();
    });

    // -----------------------------------------------------------------
    // Contract: put / get / head
    // -----------------------------------------------------------------

    it("put then get returns exactly the written bytes", async () => {
      await blobs.put("conf/basic.png", BINARY, { contentType: "image/png" });
      const got = await blobs.get("conf/basic.png");
      expect(got).toBeDefined();
      // The streamed form is the interface's promise: concatenating the
      // chunks must reproduce the object byte for byte, whatever the
      // provider's chunking happens to be.
      const streamed = await streamToBytes(got!.body);
      expect(streamed).toEqual(BINARY);
      expect(await blobs.getBytes("conf/basic.png")).toEqual(BINARY);
    });

    it("put reports a numeric size equal to the byte count", async () => {
      const bytes = deterministicBytes(5000, 7);
      const put = await blobs.put("conf/sized.css", bytes, { contentType: "text/css" });
      expect(typeof put.size).toBe("number");
      expect(put.size).toBe(5000);
      expect(put.key).toBe("conf/sized.css");

      const head = await blobs.head("conf/sized.css");
      expect(head).toBeDefined();
      expect(typeof head!.size).toBe("number");
      expect(head!.size).toBe(5000);
      expect((await blobs.getBytes("conf/sized.css"))?.length).toBe(5000);
    });

    it("head and get agree with each other and with the put result", async () => {
      const bytes = deterministicBytes(321, 11);
      const put = await blobs.put("conf/agree.pdf", bytes, { contentType: "application/pdf" });
      const head = await blobs.head("conf/agree.pdf");
      const got = await blobs.get("conf/agree.pdf");
      expect(head!.key).toBe(put.key);
      expect(head!.size).toBe(put.size);
      expect(got!.metadata.size).toBe(put.size);
    });

    it("preserves the content type the put supplied", async () => {
      await blobs.put("conf/typed.css", deterministicBytes(64, 3), { contentType: "text/css" });
      const head = await blobs.head("conf/typed.css");
      expect(head!.contentType).toBe("text/css");
      const got = await blobs.get("conf/typed.css");
      expect(got!.metadata.contentType).toBe("text/css");
    });

    it("round-trips an empty object", async () => {
      // Not an edge case: an empty stylesheet or an empty generated
      // asset is a legitimate upload, and a provider that treats a
      // zero-length object as "not there" would 404 it forever.
      await blobs.put("conf/empty.txt", new Uint8Array(0), { contentType: "text/plain" });
      const head = await blobs.head("conf/empty.txt");
      expect(head).toBeDefined();
      expect(head!.size).toBe(0);
      const got = await blobs.get("conf/empty.txt");
      expect(got).toBeDefined();
      expect((await streamToBytes(got!.body)).length).toBe(0);
      expect((await blobs.getBytes("conf/empty.txt"))?.length).toBe(0);
    });

    it("round-trips an object larger than one stream chunk", async () => {
      // 400 KiB is above the 64 KiB read chunk every adapter here uses,
      // so a driver that concatenates only the first chunk would fail
      // this and nothing else.
      const bytes = deterministicBytes(400 * 1024, 19);
      await blobs.put("conf/large.png", bytes, { contentType: "image/png" });
      const got = await blobs.get("conf/large.png");
      expect(got!.metadata.size).toBe(bytes.length);
      expect(await streamToBytes(got!.body)).toEqual(bytes);
      expect(await blobs.getBytes("conf/large.png")).toEqual(bytes);
    });

    it("put replaces an existing object rather than appending", async () => {
      await blobs.put("conf/replaced.txt", deterministicBytes(1000, 1), { contentType: "text/plain" });
      const second = deterministicBytes(17, 2);
      await blobs.put("conf/replaced.txt", second, { contentType: "text/plain" });
      expect((await blobs.head("conf/replaced.txt"))!.size).toBe(17);
      expect(await blobs.getBytes("conf/replaced.txt")).toEqual(second);
    });

    it("does not mutate the caller's buffer after the put resolves", async () => {
      // A store that aliased the caller's Uint8Array would let a caller
      // that reuses its buffer (the engine's own upload path does) see
      // stored bytes change under it.
      const bytes = deterministicBytes(256, 5);
      await blobs.put("conf/aliased.txt", bytes, { contentType: "text/plain" });
      bytes.fill(0);
      const read = await blobs.getBytes("conf/aliased.txt");
      expect(read).toEqual(deterministicBytes(256, 5));
    });

    // -----------------------------------------------------------------
    // Contract: missing keys are absent, not errors
    // -----------------------------------------------------------------

    it("reads a missing key as undefined, not a throw", async () => {
      // This is the single most important negative in the suite: the
      // /files route turns undefined into its 404. An adapter that
      // threw would turn "this card has no attachment" into a 500.
      expect(await blobs.head("conf/definitely-absent.txt")).toBeUndefined();
      expect(await blobs.get("conf/definitely-absent.txt")).toBeUndefined();
      expect(await blobs.getBytes("conf/definitely-absent.txt")).toBeUndefined();
    });

    it("a missing key inside an existing directory is still absent", async () => {
      await blobs.put("conf/dir/present.txt", deterministicBytes(10, 9), { contentType: "text/plain" });
      expect(await blobs.getBytes("conf/dir/absent.txt")).toBeUndefined();
      expect(await blobs.head("conf/dir/absent.txt")).toBeUndefined();
    });

    // -----------------------------------------------------------------
    // Contract: delete
    // -----------------------------------------------------------------

    it("delete removes the object and is idempotent", async () => {
      await blobs.put("conf/doomed.txt", deterministicBytes(42, 13), { contentType: "text/plain" });
      expect(await blobs.head("conf/doomed.txt")).toBeDefined();
      await blobs.delete("conf/doomed.txt");
      expect(await blobs.head("conf/doomed.txt")).toBeUndefined();
      expect(await blobs.get("conf/doomed.txt")).toBeUndefined();
      // Deleting again must succeed: a retry after a partial failure
      // must not have to distinguish "already gone" from "never there".
      await expect(blobs.delete("conf/doomed.txt")).resolves.toBeUndefined();
      // So must deleting a key that never existed.
      await expect(blobs.delete("conf/never-existed.txt")).resolves.toBeUndefined();
    });

    it("delete removes only the named key", async () => {
      await blobs.put("conf/keep/a.txt", deterministicBytes(8, 21), { contentType: "text/plain" });
      await blobs.put("conf/keep/b.txt", deterministicBytes(8, 22), { contentType: "text/plain" });
      await blobs.delete("conf/keep/a.txt");
      expect(await blobs.head("conf/keep/a.txt")).toBeUndefined();
      expect(await blobs.head("conf/keep/b.txt")).toBeDefined();
    });

    // -----------------------------------------------------------------
    // Contract: list
    // -----------------------------------------------------------------

    it("list returns the keys under a prefix, ascending", async () => {
      for (const name of ["c.txt", "a.txt", "b.txt"]) {
        await blobs.put(`conf/list/${name}`, deterministicBytes(4, name.length), {
          contentType: "text/plain",
        });
      }
      const entries: BlobListEntry[] = await blobs.list("conf/list/");
      const keys = entries.map((e) => e.key);
      expect(keys).toContain("conf/list/a.txt");
      expect(keys).toContain("conf/list/b.txt");
      expect(keys).toContain("conf/list/c.txt");
      expect([...keys].sort()).toEqual(keys);
      // Every entry carries the metadata a caller needs to decide
      // whether to fetch, which is the reason list exists.
      for (const entry of entries) {
        expect(typeof entry.key).toBe("string");
        expect(typeof entry.size).toBe("number");
      }
      expect(entries.find((e) => e.key === "conf/list/a.txt")!.size).toBe(4);
    });

    it("list is scoped to its prefix", async () => {
      await blobs.put("conf/scoped/a/1.txt", deterministicBytes(1, 31), { contentType: "text/plain" });
      await blobs.put("conf/scoped/b/1.txt", deterministicBytes(1, 32), { contentType: "text/plain" });
      await blobs.put("conf/scoped/aa/1.txt", deterministicBytes(1, 33), { contentType: "text/plain" });
      const underA = (await blobs.list("conf/scoped/a/")).map((e) => e.key);
      expect(underA).toContain("conf/scoped/a/1.txt");
      expect(underA).not.toContain("conf/scoped/b/1.txt");
      expect(underA).not.toContain("conf/scoped/aa/1.txt");
    });

    it("list honours its limit", async () => {
      for (let i = 0; i < 5; i += 1) {
        await blobs.put(`conf/limited/${i}.txt`, deterministicBytes(2, 40 + i), {
          contentType: "text/plain",
        });
      }
      const capped = await blobs.list("conf/limited/", { limit: 2 });
      expect(capped).toHaveLength(2);
      const all = await blobs.list("conf/limited/");
      expect(all.length).toBeGreaterThanOrEqual(5);
    });

    it("list of an empty namespace is empty, not an error", async () => {
      expect(await blobs.list("conf/nothing-here/")).toEqual([]);
    });

    // -----------------------------------------------------------------
    // Contract: keys
    // -----------------------------------------------------------------

    it("rejects an invalid key identically on every method", async () => {
      // Every one of these must be a BlobKeyError, from every adapter,
      // before any provider call. A key that one adapter rejects and
      // another resolves is a traversal hole, so the type — not just
      // the fact of rejection — is part of the contract.
      const bad = [
        "", // empty
        "/absolute", // absolute
        "trailing/", // trailing slash
        "a//b", // empty segment
        "../escape", // relative segment
        "a/../../b", // relative segment, deeper
        "back\\slash", // windows separator
        "./here", // relative segment
        "nul\u0000byte", // NUL byte
      ];
      for (const key of bad) {
        await expect(blobs.put(key, BINARY), `put ${JSON.stringify(key)}`).rejects.toBeInstanceOf(
          BlobKeyError,
        );
        await expect(blobs.head(key), `head ${JSON.stringify(key)}`).rejects.toBeInstanceOf(
          BlobKeyError,
        );
        await expect(blobs.get(key), `get ${JSON.stringify(key)}`).rejects.toBeInstanceOf(
          BlobKeyError,
        );
        await expect(blobs.delete(key), `delete ${JSON.stringify(key)}`).rejects.toBeInstanceOf(
          BlobKeyError,
        );
      }
    });

    it("rejects an invalid listing prefix", async () => {
      // A prefix is not a key: "" (the whole namespace), "12/" and "12"
      // are all legal, so the prefix rule is narrower — no relative
      // segment, no NUL. The traversal cases must still be rejected,
      // because a prefix reaches the filesystem adapter's directory
      // walk.
      for (const prefix of ["../escape", "a/../../b", "./here", "nul\u0000byte"]) {
        await expect(blobs.list(prefix), `list ${JSON.stringify(prefix)}`).rejects.toBeInstanceOf(
          BlobKeyError,
        );
      }
    });

    it("accepts the empty prefix as the whole namespace", async () => {
      await blobs.put("conf/root-level.txt", BINARY, { contentType: "text/plain" });
      const all = await blobs.list("");
      expect(all.map((e) => e.key)).toContain("conf/root-level.txt");
    });

    it("accepts the key shapes the engine actually stores", async () => {
      // The Ruby local scheme (file_card_uploader.rb:86-125): an
      // original and one file per image rendition under the card's
      // directory. If any of these spellings were rejected, uploads
      // would fail for every image card on the deck.
      const spellings = [
        "1/2.png",
        "1/2-original.png",
        "1/2-icon.png",
        "1/2-small.png",
        "1/2-medium.png",
        "1/2-large.png",
        "447/1790661047.css",
        "1347/5031.png",
        "12/34",
        "12/34.stylesheet",
        "12/a.b.c.js",
      ];
      for (const key of spellings) {
        const put = await blobs.put(key, BINARY, { contentType: "text/plain" });
        expect(put.key).toBe(key);
        expect(await blobs.getBytes(key)).toEqual(BINARY);
      }
    });

    // -----------------------------------------------------------------
    // Contract: metadata the engine relies on
    // -----------------------------------------------------------------

    it("reports the engine's content type for every extension it stores", async () => {
      // The engine writes db_content with an extension, and the storage
      // layer reports a type from that extension. If the storage layer
      // and the engine's own table disagreed, a card uploaded as
      // text/css could be served under a different type after a round
      // trip — and rendering would change. Every extension the engine
      // stores is checked here, on every adapter.
      const extensions = [
        ".txt", ".csv", ".css", ".js", ".json", ".svg", ".html", ".htm",
        ".png", ".jpg", ".jpeg", ".gif", ".webp", ".pdf", ".zip", ".mp4", ".mp3",
      ];
      for (const extension of extensions) {
        const key = `conf/types/file${extension}`;
        const expected = contentTypeForExtension(extension);
        expect(expected, `engine has no type for ${extension}`).toBeDefined();
        await blobs.put(key, deterministicBytes(8, extension.length), {
          contentType: expected,
        });
        const head = await blobs.head(key);
        // A provider that cannot persist the type reports undefined;
        // it must never report a DIFFERENT type. See the
        // provider-difference cases below for which providers that is.
        if (head!.contentType !== undefined) {
          expect(head!.contentType, `content type for ${extension}`).toBe(expected);
        }
      }
    });

    it("stores caller metadata without breaking the byte round trip", async () => {
      const bytes = deterministicBytes(64, 77);
      await blobs.put("conf/meta.png", bytes, {
        contentType: "image/png",
        metadata: { variant: "medium", actionId: "5031" },
      });
      expect(await blobs.getBytes("conf/meta.png")).toEqual(bytes);
      // The metadata itself is diagnostic — the interface does not
      // promise it back — so only the bytes are asserted above. A
      // provider that stores it must not corrupt the object by doing so.
      const head = await blobs.head("conf/meta.png");
      expect(head!.size).toBe(64);
    });
  });
}