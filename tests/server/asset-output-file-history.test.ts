// Prepared control for history-less File uploads. The timestamp expectation
// comes from card_mount.rb's selected_action_id=Time.now.to_i unless history?,
// not from the TypeScript adapter or a rewritten reference fixture.
import { describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { CardActionEngine } from "../../src/card/actions/card-action-engine.js";
import { LocalAttachmentStore } from "../../src/card/attachments/attachment-store.js";
import { handleAttachmentRoute, type FileRouteDeps } from "../../src/server/file-routes.js";
import { createActionsTestStorage, seedCard, seedStandardDeck } from "../card/actions/actions-test-storage.js";
import { scratchDir, removeScratchDir } from "../support/scratch-dir.mjs";

const TIME = new Date("2026-09-19T12:00:00Z");
const FIRST = new TextEncoder().encode("first uploaded bytes\n");
const SECOND = new TextEncoder().encode("replacement uploaded bytes\n");
async function withDeck(run: (ctx: {
  engine: CardActionEngine; store: LocalAttachmentStore; deps: FileRouteDeps;
  storage: Awaited<ReturnType<typeof createActionsTestStorage>>; tick: () => void; origin: string; denyWrites: () => void;
}) => Promise<void>) {
  const storage = await createActionsTestStorage();
  const dir = scratchDir("asset-output-file-history-");
  let server: http.Server | undefined;
  try {
    await seedStandardDeck(storage);
    await seedCard(storage, { id: 500, name: "File", codename: "file" });
    await seedCard(storage, { id: 501, name: "*derived attachment", codename: "asset_output" });
    await seedCard(storage, { id: 510, name: "Upload Holder" });
    let now = TIME.getTime();
    const store = new LocalAttachmentStore(dir);
    const actor = { id: 9, name: "Joe User" };
    let allowed = true;
    const engine = new CardActionEngine(storage.engine, { actor, canWrite: () => allowed, attachmentStore: store, now: () => new Date(now), integrationHooks: [] });
    const deps: FileRouteDeps = { driver: storage.driver, fetchEngine: storage.engine, attachmentStore: store, resolveActor: async () => actor, createEngine: () => engine, canReadCard: () => true };
    let origin = "";
    server = http.createServer(async (req, res) => {
      try {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        const raw = Buffer.concat(chunks);
        const request = new Request(origin + req.url, { method: req.method, headers: req.headers as Record<string, string>, ...(raw.length ? { body: new Uint8Array(raw) as BodyInit } : {}) });
        const answer = await handleAttachmentRoute(request, deps);
        res.writeHead(answer?.status ?? 404, answer ? Object.fromEntries(answer.headers) : {});
        res.end(answer ? Buffer.from(await answer.arrayBuffer()) : "not found");
      } catch (error) { res.writeHead(500); res.end(String(error)); }
    });
    await new Promise<void>(resolve => server!.listen(0, "127.0.0.1", resolve));
    origin = "http://127.0.0.1:" + (server.address() as AddressInfo).port;
    await run({ engine, store, deps, storage, origin, denyWrites: () => { allowed = false; }, tick: () => { now += 1000; } });
  } finally {
    server?.closeAllConnections();
    if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
    storage.close(); removeScratchDir(dir);
  }
}
async function upload(origin: string, name: string, bytes: Uint8Array) {
  const form = new FormData();
  form.append("file", new File([bytes as BlobPart], "upload.txt"));
  return await fetch(`${origin}/${encodeURIComponent(name)}/asset`, { method: "POST", body: form });
}
async function download(origin: string, identifier: string) {
  return await fetch(`${origin}/files/${identifier}`);
}

describe("history-less File asset-output upload and download", () => {
  it("creates an actual downloadable asset File using the upload epoch, with no history", async ({ task }) => {
    await withDeck(async ({ engine, storage, origin }) => {
      const made = await engine.createCard({ name: "Upload Holder+*derived attachment", typeId: 500, attachment: { bytes: FIRST, originalFilename: "upload.txt" } });
      const row = (await storage.engine.fetchById(made.cardId))!;
      const served = await download(origin, row.dbContent!);
      expect(served?.status).toBe(200);
      expect(new Uint8Array(await served!.arrayBuffer())).toEqual(FIRST);
      (task.meta as { fileProof?: Record<string, unknown> }).fileProof = { identifier: row.dbContent, downloadStatus: served?.status,
        actions: await storage.selectAll("SELECT * FROM card_actions ORDER BY id"),
        changes: await storage.selectAll("SELECT * FROM card_changes ORDER BY id") };
      expect(row.dbContent).toBe(`~${made.cardId}/${TIME.getTime() / 1000}.txt`);
      expect(await storage.count("card_actions")).toBe(0);
      expect(await storage.count("card_changes")).toBe(0);
    });
  });
  it("replaces an asset File through the real multipart route without fabricating action-zero history", async ({ task }) => {
    await withDeck(async ({ engine, storage, deps, tick, origin, denyWrites }) => {
      const name = "Upload Holder+*derived attachment";
      const made = await engine.createCard({ name, typeId: 500, attachment: { bytes: FIRST, originalFilename: "upload.txt" } });
      tick();
      expect((await upload(origin, name, SECOND))?.status).toBe(200);
      const row = (await storage.engine.fetchById(made.cardId))!;
      const served = await download(origin, row.dbContent!);
      expect(served?.status).toBe(200);
      expect(new Uint8Array(await served!.arrayBuffer())).toEqual(SECOND);
      (task.meta as { fileProof?: Record<string, unknown> }).fileProof = { identifier: row.dbContent, downloadStatus: served?.status,
        actions: await storage.selectAll("SELECT * FROM card_actions ORDER BY id"),
        changes: await storage.selectAll("SELECT * FROM card_changes ORDER BY id") };
      expect(await storage.count("card_changes")).toBe(0);
      expect(await storage.count("card_actions")).toBe(0);
      expect(row.dbContent).toBe(`~${made.cardId}/${TIME.getTime() / 1000 + 1}.txt`);
      const before = await Promise.all(["cards", "card_actions", "card_acts", "card_changes", "card_references", "sqlite_sequence"].map(t => storage.selectAll(`SELECT * FROM ${t} ORDER BY rowid`)));
      denyWrites();
      const refused = await upload(origin, name, FIRST);
      expect(refused.status).toBe(403);
      expect(await Promise.all(["cards", "card_actions", "card_acts", "card_changes", "card_references", "sqlite_sequence"].map(t => storage.selectAll(`SELECT * FROM ${t} ORDER BY rowid`)))).toEqual(before);
      expect(new Uint8Array(await (await download(origin, row.dbContent!)).arrayBuffer())).toEqual(SECOND);
      (task.meta as { fileProof?: Record<string, unknown> }).fileProof = { ...(task.meta as { fileProof?: Record<string, unknown> }).fileProof as object, refusedStatus: refused.status, refusalPreservedRowsAndBytes: true };
    });
  });
  it("preserves ordinary File versions, history and old/current download bytes", async () => {
    await withDeck(async ({ engine, storage, deps, tick, origin, denyWrites }) => {
      const name = "Ordinary Uploaded File";
      const made = await engine.createCard({ name, typeId: 500, attachment: { bytes: FIRST, originalFilename: "upload.txt" } });
      const first = (await storage.engine.fetchById(made.cardId))!.dbContent!;
      tick();
      expect((await upload(origin, name, SECOND))?.status).toBe(200);
      const second = (await storage.engine.fetchById(made.cardId))!.dbContent!;
      expect(second).not.toBe(first);
      expect(await storage.count("card_actions")).toBe(2);
      expect(await storage.count("card_changes")).toBeGreaterThan(0);
      for (const [identifier, bytes] of [[first, FIRST], [second, SECOND]] as const) {
        const served = await download(origin, identifier);
        expect(served?.status).toBe(200);
        expect(new Uint8Array(await served!.arrayBuffer())).toEqual(bytes);
      }
      deps.canReadCard = () => false;
      expect((await download(origin, second)).status).toBe(404);
      deps.canReadCard = () => true;
      const before = await Promise.all(["cards", "card_actions", "card_acts", "card_changes", "card_references", "sqlite_sequence"].map(t => storage.selectAll(`SELECT * FROM ${t} ORDER BY rowid`)));
      denyWrites();
      expect((await upload(origin, name, FIRST)).status).toBe(403);
      expect(await Promise.all(["cards", "card_actions", "card_acts", "card_changes", "card_references", "sqlite_sequence"].map(t => storage.selectAll(`SELECT * FROM ${t} ORDER BY rowid`)))).toEqual(before);
      expect(new Uint8Array(await (await download(origin, second)).arrayBuffer())).toEqual(SECOND);
    });
  });
});
