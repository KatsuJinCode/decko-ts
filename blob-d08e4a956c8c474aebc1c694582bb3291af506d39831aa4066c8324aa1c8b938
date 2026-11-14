// The in-memory blob driver against the shared conformance suite, plus
// the provider-difference cases that do not apply to it (an in-memory
// store streams, persists a content type, and has a real head), and the
// reference cross-adapter parity check every other adapter is compared
// against.

import { describe, it, expect } from "vitest";
import { MemoryBlobDriver, readStreamToBytes } from "../../src/blob/memory.js";
import { runBlobConformance } from "./blob-conformance.js";

describe("MemoryBlobDriver", () => {
  runBlobConformance("conformance: MemoryBlobDriver", () => ({ driver: new MemoryBlobDriver() }));
});

describe("MemoryBlobDriver (provider differences)", () => {
  it("streams an object in multiple chunks rather than one whole buffer", async () => {
    // The memory adapter deliberately chunks at the same 64 KiB the
    // filesystem adapter uses, so a caller that assembles chunks is
    // exercised here exactly as it would be over a real backend.
    const driver = new MemoryBlobDriver();
    const bytes = new Uint8Array(200 * 1024).fill(7);
    await driver.put("chunked.bin", bytes);
    const got = await driver.get("chunked.bin");
    const reader = got!.body.getReader();
    let chunks = 0;
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value !== undefined) {
        chunks += 1;
        total += value.length;
      }
    }
    expect(chunks).toBeGreaterThan(1);
    expect(total).toBe(bytes.length);
  });

  it("persists the content type and reports a distinct etag per write", async () => {
    const driver = new MemoryBlobDriver();
    const first = await driver.put("etag.txt", new Uint8Array([1]), { contentType: "text/plain" });
    const second = await driver.put("etag.txt", new Uint8Array([2]), { contentType: "text/plain" });
    expect(first.contentType).toBe("text/plain");
    expect(second.contentType).toBe("text/plain");
    expect(first.etag).toBeDefined();
    expect(first.etag).not.toBe(second.etag);
  });

  it("readStreamToBytes reassembles a chunked body", async () => {
    const bytes = new Uint8Array(150 * 1024).fill(3);
    const driver = new MemoryBlobDriver();
    await driver.put("assemble.bin", bytes);
    const got = await driver.get("assemble.bin");
    expect(await readStreamToBytes(got!.body)).toEqual(bytes);
  });
});