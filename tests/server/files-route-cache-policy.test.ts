// The cache policy the /files route now states for shared caches.
//
// WHAT THIS PINS. /files carries the deck's compiled stylesheet and its
// images — the assets every page pulls. Before this change the route set
// `Expires` a year out and NO Cache-Control at all: a browser honors the
// HTTP/1.0-era `Expires`, but a CDN or shared cache is not obliged to, and
// this deck's file traffic is exactly what goes through one
// (tools/perf/asset-bytes/measure-asset-http-delivery.mjs, baseline run).
//
// WHY max-age=86400 AND NOT `immutable`. The base spelling
// (<action id><ext>) is content-addressed and would take `immutable`. A
// VARIANT spelling is not: the store falls back to the bare file when no
// rendition exists (src/card/attachments/attachment-store.ts:198-211), so
// the same URL can start serving different bytes once a rendition is
// written. `immutable` tells caches never to re-check, and that URL would
// then serve a stale image indefinitely. These tests hold the day-long
// policy AND hold that it is deliberately not `immutable`, so a later change
// to `immutable` has to come through this file on purpose.
import { describe, expect, it } from "vitest";
import { handleAttachmentRoute, type FileRouteDeps } from "../../src/server/file-routes.js";
import { BlobAttachmentStore } from "../../src/card/attachments/attachment-store.js";
import { MemoryBlobDriver } from "../../src/blob/memory.js";
import type { SQLDatabaseDriver } from "../../src/server/driver.js";
import type { FetchEngine } from "../../src/card/fetch.js";

const CSS_TEXT = ".btn{display:inline-block;border:1px solid transparent}";
const PNG_BYTES = Buffer.from("89504e470d0a1a0a", "hex");

const cards = new Map([
  [45514, { id: 45514, name: "*all+*style+*asset output", key: "all_style_asset_output", type_id: 2, db_content: "~45514/1759300000.css", codename: null }],
  [103, { id: 103, name: "Logo", key: "logo", type_id: 3, db_content: "~103/3649.png", codename: null }],
]);

// The store's own in-memory adapter (src/blob/memory.ts), not a hand-rolled
// stub: the point of this suite is what the ROUTE emits, and a real adapter
// keeps the fixture honest about the interface it satisfies.
const blobs = new MemoryBlobDriver();
await blobs.put("45514/1759300000.css", new Uint8Array(Buffer.from(CSS_TEXT, "utf8")));
await blobs.put("103/3649.png", new Uint8Array(PNG_BYTES));

const driver = {
  async query(sql: string, params: unknown[]) {
    if (/FROM cards WHERE id/.test(sql)) {
      const row = cards.get(Number(params[0]));
      return { rows: row === undefined ? [] : [row] };
    }
    return { rows: [] };
  },
  async batch() {
    throw new Error("the /files read path issues no batch");
  },
} as unknown as SQLDatabaseDriver;

// Only fetchByName is exercised here (the /files GET resolves a `~<id>` mark
// straight from the driver), so the fetcher is the real FetchEngine's shape
// narrowed to the one method this route calls.
const fetchEngine = {
  async fetchByName(name: string) {
    const row = [...cards.values()].find((c) => c.name === name);
    return row === undefined ? undefined : { id: row.id, name: { s: row.name }, key: row.key, typeId: row.type_id, dbContent: row.db_content, codename: row.codename };
  },
} as unknown as FetchEngine;

const deps: FileRouteDeps = {
  driver,
  fetchEngine,
  attachmentStore: new BlobAttachmentStore(blobs),
  createEngine() {
    throw new Error("the read path must not build a write engine");
  },
};

describe("/files cache policy", () => {
  it("states an explicit shared-cache policy alongside Expires", async () => {
    for (const path of ["/files/~45514/1759300000.css", "/files/~103/3649-small.png"]) {
      const response = (await handleAttachmentRoute(new Request(`https://local.test${path}`), deps))!;
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("public, max-age=86400");
      // The browser-facing Expires header stays: the route has always sent it.
      expect(response.headers.get("expires")).toMatch(/GMT$/);
    }
  });

  it("is NOT immutable, because a variant URL can start serving different bytes", async () => {
    // With no -small rendition stored, /files/~103/3649-small.png falls back
    // to the bare file (attachment-store.ts:198-211). Writing that rendition
    // later changes what this same URL serves, so the policy must leave room
    // to re-check.
    const response = (await handleAttachmentRoute(new Request("https://local.test/files/~103/3649-small.png"), deps))!;
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).not.toContain("immutable");
  });

  it("keeps serving the bytes unchanged", async () => {
    const response = (await handleAttachmentRoute(new Request("https://local.test/files/~45514/1759300000.css"), deps))!;
    expect(Buffer.from(await response.arrayBuffer()).toString("utf8")).toBe(".btn{display:inline-block;border:1px solid transparent}");
    expect(response.headers.get("content-type")).toBe("text/css");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("still 404s an unknown file rather than caching a miss", async () => {
    const response = (await handleAttachmentRoute(new Request("https://local.test/files/~45514/9999999999.css"), deps))!;
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBeNull();
  });
});