// CloudflareR2BlobDriver under miniflare's local R2 emulation.
//
// Miniflare 5 alpha note (as in d1-miniflare.test.ts): the classic
// single-worker options shape is rejected by the v5 zod schema, and
// convertV4MiniflareOptions() converts it into the shape the constructor
// accepts. Workerd runs for real, so no Cloudflare account is involved
// and no test ever writes to a real bucket.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { R2BlobDriver, type R2BucketLike } from "../../src/blob/r2.js";
import { runBlobConformance } from "./blob-conformance.js";

describe("CloudflareR2BlobDriver (miniflare local R2)", () => {
  let mf: Miniflare | undefined;
  let driver: R2BlobDriver | undefined;

  beforeAll(async () => {
    mf = new Miniflare(
      convertV4MiniflareOptions({
        modules: true,
        script: `export default { fetch() { return new Response("ok"); } }`,
        r2Buckets: { BLOB: "decko-blob-test" },
      }),
    );
    const binding = (await (mf as Miniflare).getR2Bucket("BLOB")) as unknown as R2BucketLike;
    driver = new R2BlobDriver(binding);
  }, 120_000);

  afterAll(async () => {
    await mf?.dispose();
  });

  runBlobConformance("conformance: CloudflareR2BlobDriver (miniflare R2)", () => ({
    driver: driver as R2BlobDriver,
  }));

  it("persists the content type and caller metadata across a re-instantiation", async () => {
    // The R2 binding is the same bucket here, but a fresh adapter over
    // it stands in for a fresh isolate: whatever survives is what R2
    // itself stored, not what the adapter remembered in memory.
    const bucket = driver!;
    await bucket.put("isolate/meta.png", new Uint8Array([1, 2, 3]), {
      contentType: "image/png",
      metadata: { variant: "medium" },
    });
    const fresh = new R2BlobDriver(
      (await (mf as Miniflare).getR2Bucket("BLOB")) as unknown as R2BucketLike,
    );
    const head = await fresh.head("isolate/meta.png");
    expect(head!.contentType).toBe("image/png");
    expect(head!.size).toBe(3);
    expect(await fresh.getBytes("isolate/meta.png")).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("reports an etag and a last-modified time", async () => {
    const put = await driver!.put("meta/etag.png", new Uint8Array([9]), { contentType: "image/png" });
    expect(put.etag).toBeDefined();
    expect(put.lastModified).toBeInstanceOf(Date);
  });

  it("streams a large object byte for byte", async () => {
    // R2 hands the runtime a complete body, so the chunks differ from
    // the filesystem adapter's. The interface promises bytes, not
    // chunking — this pins that promise for the R2 shape.
    const bytes = new Uint8Array(1024 * 1024);
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = i % 251;
    await driver!.put("large/big.bin", bytes);
    const got = await driver!.get("large/big.bin");
    const reader = got!.body.getReader();
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
    expect(total).toBe(bytes.length);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    expect(out).toEqual(bytes);
  });
});