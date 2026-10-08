// The shadow router never runs a write twice.
//
// In a parallel migration the Ruby and TypeScript upstreams share one deck,
// so a write replayed against the TypeScript upstream would run twice
// (rows, history, mail, uploads). These tests pin:
//
//   1. the default (and the shipped policy): every mutating method reaches
//      Ruby exactly once and the TypeScript upstream never;
//   2. "writes": "isolated" replays writes only against a separate upstream
//      that declares a copied deck with external effects off, and refuses an
//      upstream that does not, or that is one of the two primary upstreams;
//   3. the isolated upstream itself (tools/shadow/isolated-write-upstream.mjs
//      with the engine's handler) applies the write to its copy, never to the
//      primary deck file, blocks network calls while it runs, and removes its
//      copy when it closes.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, request as httpRequest, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import {
  createProxyServer,
  loadPolicy,
  shouldShadow,
  shouldShadowWrite,
  verifyIsolatedUpstream,
  type ShadowPolicy,
} from "../../../tools/shadow/shadow-router.mjs";
import { startIsolatedWriteUpstream } from "../../../tools/shadow/isolated-write-upstream.mjs";
import { createIsolatedWriteHandler } from "../../../src/server/shadow-isolated-write-handler.js";
import { createRenderTestStorage, seedCard, seedReference, type RenderTestStorage } from "../../card/render/render-test-storage.js";
import { runAuthMigrations, SessionStore } from "../../../src/card/auth/index.js";
import { scratchDir, cleanupScratch } from "../../support/scratch-dir.mjs";

const MUTATING = ["POST", "PUT", "PATCH", "DELETE"];

interface Counter {
  server: Server;
  url: string;
  hits: Array<{ method: string; path: string; body: string }>;
}

function listen(server: Server): Promise<string> {
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => {
      const a = server.address();
      if (!a || typeof a === "string") throw new Error("bad address");
      resolve(`http://127.0.0.1:${a.port}`);
    }),
  );
}

function close(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

/** A stub upstream that records every request it receives. */
async function counter(
  respond: (req: IncomingMessage, res: ServerResponse) => void = (_q, res) => {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
  },
): Promise<Counter> {
  const hits: Counter["hits"] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      hits.push({ method: req.method ?? "", path: req.url ?? "", body: Buffer.concat(chunks).toString() });
      respond(req, res);
    });
  });
  return { server, url: await listen(server), hits };
}

function send(
  url: string,
  method: string,
  body = "",
  headers: Record<string, string> = {},
): Promise<{ status: number; body: string }> {
  const u = new URL(url);
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        method,
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        headers: body ? { "content-length": String(Buffer.byteLength(body)), ...headers } : headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString() }));
      },
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function logEntries(path: string): Array<Record<string, unknown>> {
  return existsSync(path)
    ? readFileSync(path, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l))
    : [];
}

const everything = (extra: Partial<ShadowPolicy> = {}): ShadowPolicy => ({
  mode: "shadow-everything",
  allowlist: [],
  blocklist: [],
  sampleRate: 100,
  ...extra,
});

let dir: string;
beforeAll(() => {
  dir = scratchDir("shadow-writes-");
});
afterAll(() => {
  cleanupScratch();
});

describe("default mode: a write runs exactly once", () => {
  it("the shipped policy shadows reads and never writes", () => {
    const shipped = loadPolicy(fileURLToPath(new URL("../../../tools/shadow/routes.shadow.json", import.meta.url)));
    expect(shipped.writes).toBe("skip");
    for (const m of MUTATING) {
      expect(shouldShadow(shipped, m, "/update/Example")).toBe(false);
      expect(shouldShadowWrite(shipped, m, "/update/Example")).toBe(false);
    }
    expect(shouldShadow(shipped, "GET", "/Example")).toBe(true);
    expect(shouldShadow(shipped, "HEAD", "/Example")).toBe(true);
  });

  it("every mutating method reaches Ruby once and the TypeScript upstream never", async () => {
    const ruby = await counter();
    const ts = await counter();
    const logPath = join(dir, "default.jsonl");
    const proxy = createProxyServer({ rubyUrl: ruby.url, tsUrl: ts.url, policy: everything(), logPath });
    const proxyUrl = await listen(proxy);
    try {
      for (const m of MUTATING) {
        const r = await send(`${proxyUrl}/update/Example`, m, `card[content]=${m}`, {
          "content-type": "application/x-www-form-urlencoded",
        });
        expect(r.status).toBe(200);
      }
      await send(`${proxyUrl}/Example`, "GET");
      expect(ruby.hits.map((h) => h.method)).toEqual([...MUTATING, "GET"]);
      expect(ruby.hits.slice(0, 4).map((h) => h.body)).toEqual(MUTATING.map((m) => `card[content]=${m}`));
      expect(ts.hits.map((h) => h.method)).toEqual(["GET"]);
      const verdicts = logEntries(logPath).map((e) => e.verdict);
      expect(verdicts.slice(0, 4)).toEqual(Array(4).fill("write-not-shadowed"));
    } finally {
      await Promise.all([close(proxy), close(ruby.server), close(ts.server)]);
    }
  });
});

describe("isolated mode: the guards", () => {
  it("loadPolicy rejects unsafe write settings, and a misspelt key falls back to skip", () => {
    const cases: Array<[unknown, RegExp]> = [
      [{ mode: "shadow-everything", sampleRate: 100, writes: "isolated" }, /isolatedUpstream/],
      [{ mode: "shadow-everything", sampleRate: 100, writes: "isolated", isolatedUpstream: "not a url" }, /isolatedUpstream/],
      [{ mode: "shadow-everything", sampleRate: 100, writes: "both" }, /writes/],
      [{ mode: "shadow-everything", sampleRate: 100, isolatedUpstream: "http://127.0.0.1:1" }, /only meaningful/],
    ];
    const misspelt = join(dir, "misspelt.json");
    writeFileSync(misspelt, JSON.stringify({ mode: "shadow-everything", sampleRate: 100, write: "isolated" }));
    expect(loadPolicy(misspelt).writes).toBe("skip");
    cases.forEach(([cfg, err], i) => {
      const p = join(dir, `bad-${i}.json`);
      writeFileSync(p, JSON.stringify(cfg));
      expect(() => loadPolicy(p)).toThrow(err);
    });
    const ok = join(dir, "ok-isolated.json");
    writeFileSync(ok, JSON.stringify({ mode: "shadow-everything", sampleRate: 100, writes: "isolated", isolatedUpstream: "http://127.0.0.1:9" }));
    expect(loadPolicy(ok)).toMatchObject({ writes: "isolated", isolatedUpstream: "http://127.0.0.1:9" });
  });

  it("refuses an isolated upstream that is the Ruby or the TypeScript upstream", () => {
    const rubyUrl = "http://127.0.0.1:4001";
    const tsUrl = "http://127.0.0.1:4002";
    for (const isolatedUrl of [tsUrl, rubyUrl, "http://localhost:4002/"]) {
      expect(() =>
        createProxyServer({ rubyUrl, tsUrl, policy: everything({ writes: "isolated" }), isolatedUrl }),
      ).toThrow(/separate server/);
    }
  });

  it("does not replay a write against an upstream that does not declare isolation", async () => {
    const ruby = await counter();
    const ts = await counter();
    // Answers 200 to everything, but has no isolation declaration.
    const impostor = await counter((req, res) => {
      res.writeHead(req.url === "/_shadow/isolation" ? 404 : 200, { "content-type": "text/plain" });
      res.end("ok");
    });
    const logPath = join(dir, "unverified.jsonl");
    const proxy = createProxyServer({
      rubyUrl: ruby.url,
      tsUrl: ts.url,
      policy: everything({ writes: "isolated" }),
      isolatedUrl: impostor.url,
      logPath,
    });
    const proxyUrl = await listen(proxy);
    try {
      expect((await verifyIsolatedUpstream(impostor.url)).ok).toBe(false);
      await send(`${proxyUrl}/update/Example`, "POST", "card[content]=x");
      expect(ruby.hits.length).toBe(1);
      expect(ts.hits.length).toBe(0);
      expect(impostor.hits.filter((h) => h.method !== "GET")).toEqual([]);
      expect(logEntries(logPath)[0]).toMatchObject({ verdict: "isolation-unverified" });
    } finally {
      await Promise.all([close(proxy), close(ruby.server), close(ts.server), close(impostor.server)]);
    }
  });
});

// ---------------------------------------------------------------------------
// The isolated upstream over a real deck file
// ---------------------------------------------------------------------------

const SET_TYPE_ID = 2;
const JOE_ID = 90;
const ORIGINAL = "widget body before the shadowed write";
const SHADOWED = "widget body written through the isolated shadow";

/** The rule deck the write-route tests use: Widget, editable by Anyone
 *  Signed In, and Joe User. */
async function seedRuleDeck(s: RenderTestStorage): Promise<void> {
  const byId = (id: number, name: string, extra: Omit<Parameters<typeof seedCard>[1], "id" | "name"> = {}) =>
    seedCard(s, { id, name, ...extra });
  await byId(1, "*all", { codename: "all", typeId: SET_TYPE_ID });
  await byId(2, "Set", { codename: "set" });
  await byId(3, "*update", { codename: "update" });
  await byId(4, "*create", { codename: "create" });
  await byId(5, "*delete", { codename: "delete" });
  await byId(6, "Anyone", { codename: "anyone" });
  await byId(7, "Anyone Signed In", { codename: "anyone_signed_in" });
  await byId(8, "*type", { codename: "type" });
  await byId(9, "*self", { codename: "self" });
  await byId(18, "*default", { codename: "default" });
  for (const [id, right] of [[10, 3], [11, 4], [12, 5]] as const) {
    await seedCard(s, { id, leftId: 1, rightId: right, dbContent: "[[Anyone Signed In]]" });
    await seedReference(s, id, 7, "anyone signed in");
  }
  await seedCard(s, { id: 17, leftId: 1, rightId: 18, typeId: SET_TYPE_ID });
  await byId(13, "Widget", { typeId: 14, dbContent: ORIGINAL });
  await byId(14, "Basic");
  await seedCard(s, { id: 15, leftId: 14, rightId: 8, typeId: SET_TYPE_ID });
  await byId(16, "RichText");
  await byId(JOE_ID, "Joe User");
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function widgetContent(path: string): string {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    return (db.prepare("SELECT db_content FROM cards WHERE name = 'Widget'").get() as { db_content: string }).db_content;
  } finally {
    db.close();
  }
}

describe("isolated mode: the isolated upstream over a copy of the deck", () => {
  it("replays the write against the copy only, with the network blocked, and removes the copy", async () => {
    // The primary deck, as a file.
    const primary = join(dir, "primary.sqlite3");
    const storage = await createRenderTestStorage();
    let token = "";
    try {
      await runAuthMigrations(storage.counting);
      await seedRuleDeck(storage);
      token = (await new SessionStore({ driver: storage.counting }).createSession(JOE_ID)).token;
      await storage.counting.query(`VACUUM INTO '${primary.replace(/'/g, "''")}'`, []);
    } finally {
      storage.close();
    }
    const primaryHash = sha256(primary);
    expect(widgetContent(primary)).toBe(ORIGINAL);

    const ruby = await counter((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end('{"verb":"update"}');
    });
    const ts = await counter();
    const realFetch = globalThis.fetch;
    const upstream = await startIsolatedWriteUpstream({ primaryDbPath: primary, createHandler: createIsolatedWriteHandler });
    const logPath = join(dir, "isolated.jsonl");
    const proxy = createProxyServer({
      rubyUrl: ruby.url,
      tsUrl: ts.url,
      policy: everything({ writes: "isolated" }),
      isolatedUrl: upstream.url,
      logPath,
    });
    const proxyUrl = await listen(proxy);
    try {
      expect(await verifyIsolatedUpstream(upstream.url)).toMatchObject({ ok: true });
      // While the isolated upstream runs, network calls fail.
      await expect(globalThis.fetch("http://example.invalid/")).rejects.toThrow(/external effects are off/);

      const r = await send(`${proxyUrl}/update/Widget.json`, "POST", JSON.stringify({ card: { content: SHADOWED } }), {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      });
      expect(r.body).toBe('{"verb":"update"}'); // the client sees Ruby's answer

      // Ruby saw the write once; the TypeScript read upstream never did.
      expect(ruby.hits.map((h) => h.method)).toEqual(["POST"]);
      expect(ts.hits).toEqual([]);
      // The copy took the write ...
      expect(widgetContent(upstream.copyPath)).toBe(SHADOWED);
      // ... and the primary file is byte for byte what it was.
      expect(sha256(primary)).toBe(primaryHash);
      expect(widgetContent(primary)).toBe(ORIGINAL);
      expect(logEntries(logPath)[0]).toMatchObject({ method: "POST", shadow: "isolated", tsStatus: 200 });
    } finally {
      await Promise.all([close(proxy), close(ruby.server), close(ts.server)]);
      await upstream.close();
    }
    expect(globalThis.fetch).toBe(realFetch);
    expect(existsSync(upstream.copyPath)).toBe(false);
    expect(sha256(primary)).toBe(primaryHash);
  });
});
