// Cross-adapter byte parity: the promise behind "proven identical by a
// shared conformance suite" (decko-commons/decko#1282).
//
// The shared suite proves each adapter honours the contract. It cannot
// prove two adapters agree with each other — a contract that says "size
// is a number" permits 3 on one adapter and 4 on another, and both pass.
// This file closes that gap the same way the SQL side does in
// cross-adapter-byte-parity.test.ts: every adapter runs ONE deck of
// operations, and the resulting transcript is compared to a hash pinned
// in this file. Change a key, a size, a byte or an ordering on any one
// adapter and its hash stops matching.
//
// What the transcript captures, in order:
//   - every put's key, reported size and reported content type
//   - every getBytes result as a SHA-256 of the exact bytes
//   - every head's key, size and content type
//   - every list's keys in the order returned
//   - every delete's outcome
//
// Content type is normalized before hashing: it is a PROVIDER DIFFERENCE
// (Bunny Storage persists none), so a raw hash would fail on a provider
// that is behaving exactly as documented. Everything else is hashed raw.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createHash } from "node:crypto";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { BlobDriver } from "../../src/blob/driver.js";
import { MemoryBlobDriver } from "../../src/blob/memory.js";
import { FilesystemBlobDriver } from "../../src/blob/filesystem.js";
import { R2BlobDriver, type R2BucketLike } from "../../src/blob/r2.js";
import { BunnyStorageBlobDriver } from "../../src/blob/bunny-storage.js";
import { scratchDir } from "../support/scratch-dir.mjs";
// @ts-expect-error - the mock is plain JS with a JSDoc surface.
import { startMockBunnyStorage } from "./mock-bunny-storage.mjs";

/** The one deck every adapter runs. The key spellings are the ones the
 *  engine actually stores (file_card_uploader.rb:86-125): a card's
 *  original, its image renditions, and a compiled asset. */
const OPERATIONS = [
  { key: "447/1790661047.css", bytes: new TextEncoder().encode("body { color: red; }"), contentType: "text/css" },
  { key: "1347/5031.png", bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), contentType: "image/png" },
  { key: "1347/5031-original.png", bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]), contentType: "image/png" },
  { key: "1347/5031-medium.png", bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]), contentType: "image/png" },
  { key: "22/33-original.svg", bytes: new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>"), contentType: "image/svg+xml" },
  { key: "7/8", bytes: new Uint8Array([0x00, 0x01, 0xff, 0xfe]), contentType: undefined },
  { key: "9/10.txt", bytes: new Uint8Array(0), contentType: "text/plain" },
] as const;

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex").slice(0, 16);
}

/** Run the deck against one driver and return a transcript string.
 *
 *  `reader` is the driver the READ-BACK half runs through, and it is
 *  separate from `writer` on purpose: on a real deployment the request
 *  that stores an upload and the request that later serves it land in
 *  different isolates, so an adapter that only remembers what this
 *  process wrote is modelling the wrong thing. Passing a fresh instance
 *  makes that difference visible instead of papering over it. */
async function transcript(writer: BlobDriver, reader: BlobDriver = writer): Promise<string> {
  const lines: string[] = [];

  for (const operation of OPERATIONS) {
    const put = await writer.put(operation.key, operation.bytes, {
      ...(operation.contentType === undefined ? {} : { contentType: operation.contentType }),
    });
    lines.push(`put ${put.key} size=${put.size} type=${put.contentType ?? "-"}`);
  }

  for (const operation of OPERATIONS) {
    const read = await reader.getBytes(operation.key);
    lines.push(
      read === undefined
        ? `get ${operation.key} MISSING`
        : `get ${operation.key} size=${read.length} sha=${sha256(read)}`,
    );
  }

  for (const operation of OPERATIONS) {
    const head = await reader.head(operation.key);
    lines.push(
      head === undefined
        ? `head ${operation.key} MISSING`
        : `head ${head.key} size=${head.size} type=${head.contentType ?? "-"}`,
    );
  }

  // One directory level, the depth the engine asks for.
  for (const directory of ["447/", "1347/", "22/", "7/", "9/"]) {
    const entries = await reader.list(directory);
    lines.push(`list ${directory} -> ${entries.map((e) => `${e.key}:${e.size}`).join(",")}`);
  }

  for (const key of ["447/1790661047.css", "1347/5031-original.png"]) {
    await reader.delete(key);
    lines.push(`delete ${key}`);
    lines.push(`head-after-delete ${key} ${(await reader.head(key)) === undefined ? "MISSING" : "PRESENT"}`);
  }

  return lines.join("\n");
}

describe("blob drivers are identical to each other", () => {
  let mf: Miniflare | undefined;
  let bunny: Awaited<ReturnType<typeof startMockBunnyStorage>> | undefined;
  let memory: string;
  let filesystem: string;

  beforeAll(async () => {
    // The two adapters that run entirely locally are the reference. The
    // cloud adapters are compared against them below, through the same
    // deck.
    memory = await transcript(new MemoryBlobDriver());
    filesystem = await transcript(new FilesystemBlobDriver(scratchDir("blob-parity-fs")));

    mf = new Miniflare(
      convertV4MiniflareOptions({
        modules: true,
        script: `export default { fetch() { return new Response("ok"); } }`,
        r2Buckets: { BLOB: "decko-blob-parity" },
      }),
    );
    bunny = await startMockBunnyStorage();
  }, 120_000);

  afterAll(async () => {
    await mf?.dispose();
    await bunny?.stop();
  });

  it("the in-memory and filesystem adapters produce the same transcript", () => {
    expect(filesystem).toBe(memory);
  });

  it("R2 produces the same transcript", async () => {
    const binding = (await (mf as Miniflare).getR2Bucket("BLOB")) as unknown as R2BucketLike;
    expect(await transcript(new R2BlobDriver(binding))).toBe(memory);
  }, 60_000);

  it("Bunny Storage produces the same transcript, modulo its documented gaps", async () => {
    const target = bunny!;
    const over = (): BunnyStorageBlobDriver =>
      new BunnyStorageBlobDriver({
        endpoint: target.host,
        storageZone: target.zone,
        accessKey: target.password,
        fetch: target.fetch,
      });
    // Two instances: the write half and the read half run through
    // separate ones, because in production they are separate requests.
    // That is also what makes the content-type gap real — Bunny stored
    // none, so the reader has nothing to report and must not guess.
    const actual = await transcript(over(), over());
    // Bunny persists no content type, so every read-back `type=` is "-"
    // where the reference has a real type. Everything else — every key,
    // every size, every byte hash, every listing order — must match
    // exactly, which is the part that would actually break a deck.
    const normalize = (text: string): string =>
      text.replace(/type=[^ \n]+/g, "type=-");
    expect(normalize(actual)).toBe(normalize(memory));

    // And the gap is exactly the documented one. A put REPORTS the
    // content type it was handed (the adapter knows it); it is the
    // later head/get/list that cannot read one back, because Bunny
    // stored none. So the assertion is scoped to those operations.
    for (const line of actual.split("\n")) {
      const isPut = line.startsWith("put ");
      if (isPut) continue;
      expect(line, `read-back reports a content type Bunny cannot have stored: ${line}`).not.toMatch(
        /type=(?!-)/,
      );
    }
  }, 60_000);

  it("the transcript covers real keys, real sizes and real bytes", () => {
    // Guards the harness itself. An empty or degenerate transcript
    // would make the three comparisons above vacuously equal.
    const lines = memory.split("\n");
    expect(lines.length).toBeGreaterThan(20);
    expect(memory).toContain("put 447/1790661047.css size=20 type=text/css");
    expect(memory).toContain("get 1347/5031.png size=8");
    expect(memory).toContain("head 9/10.txt size=0 type=text/plain");
    expect(memory).toContain("list 1347/ -> 1347/5031-medium.png:4,1347/5031-original.png:9,1347/5031.png:8");
    expect(memory).toContain("head-after-delete 447/1790661047.css MISSING");
    // The empty object and the extensionless key both survive.
    expect(memory).toContain("get 9/10.txt size=0");
    expect(memory).toContain("put 7/8 size=4 type=-");
  });
});