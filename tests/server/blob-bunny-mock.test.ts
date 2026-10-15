// BunnyStorageBlobDriver against the shared conformance suite, over a
// local mock of Bunny Storage's documented HTTP API.
//
// No real zone is contacted and no real bytes leave the machine: the
// mock server runs on a loopback port and the driver's fetch is the
// injected one. The provider-difference cases below pin the two gaps
// Bunny's API has — no HEAD, no persisted content type — so they stay
// pinned facts rather than surprises at deploy time.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { join } from "node:path";
import { scratchDir, removeScratchDir } from "../support/scratch-dir.mjs";
import { BunnyError, BunnyStorageBlobDriver } from "../../src/blob/bunny-storage.js";
import { runBlobConformance } from "./blob-conformance.js";
// @ts-expect-error - the mock is plain JS with a JSDoc surface.
import { startMockBunnyStorage } from "./mock-bunny-storage.mjs";

type Mock = Awaited<ReturnType<typeof startMockBunnyStorage>>;
/** One recorded request, as the mock reports it. */
interface RecordedRequest {
  method: string;
  path: string;
  headers: Record<string, string>;
  accessKeyPresent: boolean;
}

describe("BunnyStorageBlobDriver (local mock of the Storage HTTP API)", () => {
  let mock: Mock;

  beforeAll(async () => {
    mock = await startMockBunnyStorage();
  });

  afterAll(async () => {
    await mock?.stop();
  });

  beforeEach(() => {
    mock.reset();
  });

  runBlobConformance("conformance: BunnyStorageBlobDriver (mock Storage API)", () => ({
    driver: driverOver(mock),
  }));

  function driverOver(target: Mock): BunnyStorageBlobDriver {
    return new BunnyStorageBlobDriver({
      endpoint: target.host,
      storageZone: target.zone,
      accessKey: target.password,
      fetch: target.fetch,
    });
  }

  it("retains uploaded bytes and deletion across a local provider restart", async () => {
    const root = scratchDir("bunny-storage-restart-");
    let active: Mock | undefined;
    try {
      const filesRoot = join(root, "files");
      active = await startMockBunnyStorage({ filesRoot });
      await driverOver(active).put("307/asset.js", new Uint8Array([1, 2, 3]));
      await driverOver(active).put("discard/file.txt", new Uint8Array([4]));
      await driverOver(active).delete("discard/file.txt");
      await active.stop();
      active = undefined;
      active = await startMockBunnyStorage({ filesRoot });
      expect(await driverOver(active).getBytes("307/asset.js")).toEqual(new Uint8Array([1, 2, 3]));
      expect(await driverOver(active).getBytes("discard/file.txt")).toBeUndefined();
      expect(() => active!.reset()).toThrow(/staged-root owner/);
    } finally {
      await active?.stop();
      removeScratchDir(root);
    }
  });

  // -------------------------------------------------------------------
  // Provider differences — pinned, not worked around
  // -------------------------------------------------------------------

  it("builds head over the parent listing because Bunny has no HEAD", async () => {
    // If the adapter ever reached for HEAD, the mock answers 405 and
    // this test fails — which is the point: a HEAD dependency would
    // pass nowhere else and fail only in production.
    const driver = driverOver(mock);
    await driver.put("33/44-original.png", new Uint8Array([1, 2, 3]), {
      contentType: "image/png",
    });
    expect(mock.countOf("HEAD", "/")).toBe(0);

    const head = await driver.head("33/44-original.png");
    expect(head!.key).toBe("33/44-original.png");
    expect(head!.size).toBe(3);
    // One GET on the PARENT directory, which is the only metadata route
    // Bunny documents.
    expect(mock.countOf("GET", "/test-zone/33/")).toBeGreaterThanOrEqual(1);
  });

  it("reports a content type only for keys this process wrote", async () => {
    const writer = driverOver(mock);
    await writer.put("written/here.txt", new Uint8Array([1]), { contentType: "text/plain" });
    // The same process remembers what it sent...
    expect((await writer.head("written/here.txt"))!.contentType).toBe("text/plain");
    // ...a fresh adapter over the same zone does not, because Bunny
    // stored nothing to read back. It reports undefined rather than
    // guessing: the engine derives the served type from the bytes and
    // the action's filename, not from here.
    const fresh = driverOver(mock);
    expect((await fresh.head("written/here.txt"))!.contentType).toBeUndefined();
    // The bytes are unaffected, which is what actually matters.
    expect(await fresh.getBytes("written/here.txt")).toEqual(new Uint8Array([1]));
  });

  it("sends the AccessKey header, not an Authorization bearer token", async () => {
    const driver = driverOver(mock);
    await driver.put("auth/probe.txt", new Uint8Array([1]));
    const recorded = mock.requests.find((r: RecordedRequest) => r.method === "PUT")!;
    expect(recorded.accessKeyPresent).toBe(true);
    expect(recorded.headers.authorization).toBeUndefined();
    expect(recorded.headers.accesskey).toBe(mock.password);
  });

  it("keys the URL by region host and zone name", async () => {
    const driver = driverOver(mock);
    await driver.put("url/shape.txt", new Uint8Array([1]));
    const recorded = mock.requests.find((r: RecordedRequest) => r.method === "PUT")!;
    expect(recorded.path).toBe("/test-zone/url/shape.txt");
  });

  it("builds a public CDN url only when a CDN host is configured", async () => {
    const withoutCdn = driverOver(mock);
    expect(withoutCdn.publicUrl("1/2.png")).toBeUndefined();
    const withCdn = new BunnyStorageBlobDriver({
      endpoint: mock.host,
      storageZone: mock.zone,
      accessKey: mock.password,
      fetch: mock.fetch,
      cdnHost: "cdn.example-cdn.net",
    });
    expect(withCdn.publicUrl("1/2.png")).toBe("https://cdn.example-cdn.net/1/2.png");
  });

  it("rejects a configuration missing its endpoint, zone or key", () => {
    expect(
      () => new BunnyStorageBlobDriver({ endpoint: "", storageZone: "z", accessKey: "k" }),
    ).toThrow(/endpoint/);
    expect(
      () => new BunnyStorageBlobDriver({ endpoint: "h", storageZone: " ", accessKey: "k" }),
    ).toThrow(/zone/);
    expect(
      () => new BunnyStorageBlobDriver({ endpoint: "h", storageZone: "z", accessKey: "" }),
    ).toThrow(/access key/);
  });

  it("reports a non-404 provider failure as a BunnyError, not a miss", async () => {
    // A wrong password answers 401 on every call. That is a
    // configuration failure and must NOT read as "no such object" —
    // otherwise a misconfigured deployment silently serves 404s.
    const misconfigured = new BunnyStorageBlobDriver({
      endpoint: mock.host,
      storageZone: mock.zone,
      accessKey: "wrong-password",
      fetch: mock.fetch,
    });
    await expect(misconfigured.get("anything.txt")).rejects.toBeInstanceOf(BunnyError);
    await expect(misconfigured.head("anything.txt")).rejects.toBeInstanceOf(BunnyError);
    try {
      await misconfigured.get("anything.txt");
      expect.unreachable("a wrong password must not look like a miss");
    } catch (error) {
      expect(error).toBeInstanceOf(BunnyError);
      expect((error as BunnyError).status).toBe(401);
    }
  });

  it("lists one directory level, which is what the engine asks for", async () => {
    // Bunny's API lists one directory per request. The interface's list
    // is scoped to one level by contract (see src/blob/driver.ts), so
    // this is a fact to pin rather than a gap: the engine lists a card's
    // own directory, and every rendition is directly in it.
    const driver = driverOver(mock);
    await driver.put("card/1-original.png", new Uint8Array([1]), { contentType: "image/png" });
    await driver.put("card/1-medium.png", new Uint8Array([2]), { contentType: "image/png" });
    await driver.put("other/9.png", new Uint8Array([3]), { contentType: "image/png" });

    const renditions = (await driver.list("card/")).map((e) => e.key).sort();
    expect(renditions).toEqual(["card/1-medium.png", "card/1-original.png"]);
    // Exactly one listing request for the card's directory.
    expect(mock.countOf("GET", "/test-zone/card/")).toBe(1);
  });

  it("does not use HEAD even for a large object, and returns it whole", async () => {
    const driver = driverOver(mock);
    const bytes = new Uint8Array(300 * 1024).fill(9);
    await driver.put("large/whole.bin", bytes);
    expect(mock.countOf("HEAD", "/")).toBe(0);
    expect(await driver.getBytes("large/whole.bin")).toEqual(bytes);
  });
});
