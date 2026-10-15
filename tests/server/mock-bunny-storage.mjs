// A local stand-in for Bunny Storage's HTTP API, faithful to the
// documented surface (bunny.net/docs/storage/http and
// /api-reference/storage) and to its two known gaps:
//
//   PUT    /<zone>/<path>      200, stores the raw request body
//   GET    /<zone>/<path>      200 + bytes, or 404
//   GET    /<zone>/<path>/     200 + a JSON array of StorageObject
//                              records for that ONE directory
//   DELETE /<zone>/<path>      204, or 404 when already gone
//
// Every request must carry AccessKey, or the mock answers 401 — that
// way a test that forgot the header fails, rather than the adapter
// "working" against a mock that never checked.
//
// There is deliberately NO HEAD handler: Bunny's documented API has
// none, so implementing one in the mock would let an adapter that
// wrongly depends on HEAD pass here and fail in production. The
// adapter's `head` is built on the directory listing, and the mock's
// 405 for HEAD is what proves it.

import { createServer } from "node:http";
import { mkdirSync, readdirSync, lstatSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import path from "node:path";

/** Keys sorted, so the listing's order is deterministic. */
class MemoryZone {
  constructor(filesRoot) {
    /** @type {Map<string, {bytes: Buffer, lastChanged: string, dateCreated: string, guid: string}>} */
    this.objects = new Map();
    this.guidCounter = 0;
    this.filesRoot = filesRoot === undefined ? undefined : path.resolve(filesRoot);
    if (this.filesRoot !== undefined) {
      const load = directory => {
        for (const name of readdirSync(directory).sort()) {
          const file = path.join(directory, name);
          const stat = lstatSync(file);
          if (stat.isSymbolicLink()) throw new Error("persistent mock storage cannot traverse links");
          if (stat.isDirectory()) load(file);
          else {
            const key = path.relative(this.filesRoot, file).replaceAll("\\", "/");
            this.objects.set(key, { bytes: readFileSync(file), lastChanged: stat.mtime.toISOString(), dateCreated: stat.birthtime.toISOString(), guid: `guid-${++this.guidCounter}` });
          }
        }
      };
      mkdirSync(this.filesRoot, { recursive: true });
      load(this.filesRoot);
    }
  }

  localPath(key) {
    if (this.filesRoot === undefined) return undefined;
    const file = path.resolve(this.filesRoot, key);
    if (!file.startsWith(this.filesRoot + path.sep) || key.split(/[\\/]/).some(part => part === "..")) throw new Error("storage key escapes its staged root");
    return file;
  }

  put(key, bytes) {
    const file = this.localPath(key);
    if (file !== undefined) {
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, bytes);
    }
    const now = new Date().toISOString();
    this.guidCounter += 1;
    this.objects.set(key, {
      bytes,
      lastChanged: now,
      dateCreated: now,
      guid: `guid-${this.guidCounter}`,
    });
  }

  delete(key) {
    if (this.objects.has(key)) {
      const file = this.localPath(key);
      if (file !== undefined) unlinkSync(file);
    }
    return this.objects.delete(key);
  }

  /** One directory level, exactly as Bunny's list-files documents. */
  listDirectory(directory) {
    const prefix = directory === "" ? "" : `${directory}`;
    const immediate = new Map();
    for (const [key, object] of this.objects) {
      if (!key.startsWith(prefix)) continue;
      const rest = key.slice(prefix.length);
      const slash = rest.indexOf("/");
      const name = slash === -1 ? rest : rest.slice(0, slash);
      if (name === "") continue;
      if (slash === -1) {
        immediate.set(name, { name, isDirectory: false, object });
      } else if (!immediate.has(name)) {
        immediate.set(name, { name, isDirectory: true, object: undefined });
      }
    }
    return [...immediate.values()]
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
      .map((entry) =>
        entry.isDirectory
          ? {
              ObjectName: entry.name,
              Path: prefix,
              IsDirectory: true,
              Length: 0,
              LastChanged: new Date(0).toISOString(),
              DateCreated: new Date(0).toISOString(),
              Guid: "directory",
              StorageZoneName: "",
              StorageZoneId: 0,
              ServerId: 0,
              UserId: 0,
            }
          : {
              ObjectName: entry.name,
              Path: prefix,
              IsDirectory: false,
              Length: entry.object.bytes.length,
              LastChanged: entry.object.lastChanged,
              DateCreated: entry.object.dateCreated,
              Guid: entry.object.guid,
              StorageZoneName: "",
              StorageZoneId: 0,
              ServerId: 0,
              UserId: 0,
            },
      );
  }
}

/**
 * Start the mock. Returns its host, a factory for the driver's fetch
 * options, and a stop function. Every request is recorded so a test can
 * assert on the wire shape (the AccessKey header, the region host, the
 * method) rather than only on the adapter's return values.
 */
export async function startMockBunnyStorage({ zone = "test-zone", password = "test-password", filesRoot } = {}) {
  /** @type {MemoryZone} */
  let zone1 = new MemoryZone(filesRoot);
  /** @type {{method: string, path: string, headers: Record<string, string>, accessKeyPresent: boolean}[]} */
  const requests = [];

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    const path = url.pathname;
    requests.push({
      method: request.method ?? "",
      path,
      headers: request.headers,
      accessKeyPresent: request.headers.accesskey === password,
    });

    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const body = Buffer.concat(chunks);

      // Auth first: a request without the zone password is a failure,
      // never a silent success.
      if (request.headers.accesskey !== password) {
        response.writeHead(401, { "Content-Type": "text/plain" });
        response.end("unauthorized");
        return;
      }

      // No HEAD: Bunny's Storage API documents none. A 405 makes an
      // adapter that depends on one fail here rather than in production.
      if (request.method === "HEAD") {
        response.writeHead(405, { "Content-Type": "text/plain" });
        response.end("method not allowed");
        return;
      }

      const zonePrefix = `/${zone}/`;
      if (!path.startsWith(zonePrefix)) {
        response.writeHead(404, { "Content-Type": "text/plain" });
        response.end("not found");
        return;
      }
      const key = decodeURIComponent(path.slice(zonePrefix.length));

      if (request.method === "PUT") {
        zone1.put(key, body);
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ success: true, ObjectName: key.split("/").pop() }));
        return;
      }
      if (request.method === "DELETE") {
        const removed = zone1.delete(key);
        response.writeHead(removed ? 204 : 404, { "Content-Type": "text/plain" });
        response.end(removed ? "" : "not found");
        return;
      }
      if (request.method === "GET") {
        // A trailing slash is the directory-listing grammar. The ROOT
        // listing is "/<zone>/", whose key is the empty string — so
        // empty counts as a directory request too.
        if (key === "" || key.endsWith("/")) {
          const listing = zone1.listDirectory(key);
          response.writeHead(200, { "Content-Type": "application/json" });
          response.end(JSON.stringify(listing));
          return;
        }
        const object = zone1.objects.get(key);
        if (object === undefined) {
          response.writeHead(404, { "Content-Type": "text/plain" });
          response.end("not found");
          return;
        }
        response.writeHead(200, {
          "Content-Type": request.headers["content-type"] ?? "application/octet-stream",
          "Content-Length": String(object.bytes.length),
        });
        response.end(object.bytes);
        return;
      }
      response.writeHead(405, { "Content-Type": "text/plain" });
      response.end("method not allowed");
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;

  return {
    /** The host the driver is configured with. The adapter prefixes
     *  "https://", so tests inject a fetch that rewrites the scheme to
     *  plain http for the local mock — the adapter's own URL building
     *  is still asserted through the recorded request paths. */
    host: `127.0.0.1:${port}`,
    zone,
    password,
    requests,
    /** The fetch the driver should use: the global one, with the
     *  scheme rewritten from https:// to http:// for this host only. */
    fetch: async (input, init) => {
      const rewritten = String(input).replace(
        /^https:\/\/127\.0\.0\.1:\d+\//,
        `http://127.0.0.1:${port}/`,
      );
      return globalThis.fetch(rewritten, init);
    },
    /** Count of recorded requests matching a method + path prefix. */
    countOf(method, prefix) {
      return requests.filter((r) => r.method === method && r.path.startsWith(prefix)).length;
    },
    /** Make the next N reads of a path fail with a status, to pin how
     *  the adapter reports a provider error rather than a miss. */
    reset: () => {
      if (filesRoot !== undefined) throw new Error("persistent mock storage must be reset by its staged-root owner");
      zone1 = new MemoryZone();
      requests.length = 0;
    },
    stop: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
