// The filesystem blob driver against the shared conformance suite.
//
// The suite owns its resource: a throwaway scratch directory removed in
// the teardown, so no test leaves files behind (the Zero Unmanaged
// Scratch policy). The extra cases here cover the filesystem-specific
// behaviour the shared suite cannot state: the key IS the path below the
// root, which is what lets a Ruby deck's files directory be read
// unchanged, and the write-then-rename that keeps a failed put from
// truncating a live object.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { FilesystemBlobDriver } from "../../src/blob/filesystem.js";
import { BlobKeyError } from "../../src/blob/driver.js";
import { scratchDir } from "../support/scratch-dir.mjs";
import { runBlobConformance } from "./blob-conformance.js";

describe("FilesystemBlobDriver", () => {
  runBlobConformance("conformance: FilesystemBlobDriver", async () => {
    const root = scratchDir("blob-fs-conf");
    return {
      driver: new FilesystemBlobDriver(root),
      dispose: () => undefined, // scratch-setup.ts removes the scratch tree
    };
  });
});

describe("FilesystemBlobDriver (Ruby files-directory identity)", () => {
  let root: string;

  beforeEach(() => {
    root = scratchDir("blob-fs-ruby");
  });

  afterEach(() => {
    // scratch-setup.ts's afterAll owns removal; nothing per-test.
  });

  it("writes an attachment at exactly the path Ruby's carrierwave uses", async () => {
    // file_card_uploader.rb:86-125: local storage path is
    //   <files_dir>/<card_id>/<action_id>(-<variant>)<ext>
    // and the key is that path below the root. If this drifts, a
    // migrated Ruby deck's attachments stop resolving.
    const driver = new FilesystemBlobDriver(root);
    await driver.put("447/1790661047.css", new Uint8Array([1, 2, 3]), {
      contentType: "text/css",
    });
    expect(existsSync(join(root, "447", "1790661047.css"))).toBe(true);

    await driver.put("1347/5031-medium.png", new Uint8Array([4, 5]), {
      contentType: "image/png",
    });
    expect(existsSync(join(root, "1347", "5031-medium.png"))).toBe(true);
    expect(readdirSync(join(root, "1347"))).toEqual(["5031-medium.png"]);
  });

  it("reads a pre-existing Ruby files directory without rewriting it", async () => {
    // The migration case: bytes written by Ruby's CarrierWave, laid out
    // exactly as Ruby would, are readable through the driver with no
    // conversion step.
    mkdirSync(join(root, "22"), { recursive: true });
    writeFileSync(join(root, "22", "33-original.svg"), "<svg/>");
    const driver = new FilesystemBlobDriver(root);
    const read = await driver.getBytes("22/33-original.svg");
    expect(new TextDecoder().decode(read!)).toBe("<svg/>");
    const head = await driver.head("22/33-original.svg");
    expect(head!.size).toBe("<svg/>".length);
    // The filesystem driver derives the type from the extension, so a
    // file Ruby wrote without any metadata still serves the right type.
    expect(head!.contentType).toBe("image/svg+xml");
  });

  it("derives the content type from the key extension, matching the engine table", async () => {
    const driver = new FilesystemBlobDriver(root);
    await driver.put("1/2.svg", new Uint8Array([1]));
    const head = await driver.head("1/2.svg");
    expect(head!.contentType).toBe("image/svg+xml");
  });

  it("prefers the content type the put supplied over the extension guess", async () => {
    // A .txt file stored as text/plain agrees with the guess; the
    // interesting case is a caller that knows better.
    const driver = new FilesystemBlobDriver(root);
    const put = await driver.put("1/2.dat", new Uint8Array([1]), { contentType: "text/csv" });
    expect(put.contentType).toBe("text/csv");
    // On a later read the extension wins, because that is what a
    // provider without metadata can honestly report. Documented in
    // src/blob/driver.ts under PROVIDER DIFFERENCES.
    const head = await driver.head("1/2.dat");
    expect(head!.contentType).toBeUndefined();
  });

  it("leaves no .part file behind after a successful put", async () => {
    const driver = new FilesystemBlobDriver(root);
    await driver.put("447/1.css", new Uint8Array([1, 2]));
    expect(readdirSync(join(root, "447"))).toEqual(["1.css"]);
  });

  it("refuses a key that resolves outside the root", async () => {
    const driver = new FilesystemBlobDriver(root);
    expect(() => driver.pathFor("../outside.txt")).toThrow(BlobKeyError);
    expect(() => driver.pathFor("a/../../outside.txt")).toThrow(BlobKeyError);
    expect(() => driver.pathFor("/absolute.txt")).toThrow(BlobKeyError);
  });

  it("pathFor returns the absolute path below the root", () => {
    const driver = new FilesystemBlobDriver(root);
    const path = driver.pathFor("447/1.css");
    expect(path.startsWith(join(root, "447"))).toBe(true);
  });
});