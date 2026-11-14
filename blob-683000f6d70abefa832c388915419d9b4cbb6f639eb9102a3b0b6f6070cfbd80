// The workers write surface's CRASH BOUNDARY (cloudflare-write-routes.ts
// mountWrite): what a save that throws something the domain layer never
// models — a plain Error, not a CardActionError — answers, on BOTH deployed
// hosts (worker.ts and the Bunny edge's mountBunnyEdgeWriteSurface mount
// their whole write surface through this one function).
//
// WHY THIS EXISTS. handleWriteRequest re-throws every non-CardActionError.
// Before the boundary that throw left the request handler entirely and the
// runtime answered a BARE 500 with an empty body — the live symptom of the
// 2026-10-19 upload fault: a deployed edge whose files area was never armed
// validated the save fine (the no-file control answered the legible 422)
// and then threw at finalizeAttachment, so every multipart create was a
// body-less 500 and no unit of the upload path could be accepted or
// rejected on evidence. The boundary carries the throw site's message into
// a structured 500, and for the missing-files-area rejections appends the
// host's own sentence for what arms its files area
// (WorkersWriteContext.attachmentStoreDiagnosis).
//
// The engine-side throw this pins is real and reachable: a File-typed
// create carrying a card[file] part with NO attachmentStore in the context
// reaches finalizeAttachment and throws
// "attachment save requires the engine's attachmentStore option"
// (card-action-engine.ts finalizeAttachment). Modeled failures keep their
// own shapes: the no-file control must still answer 422 through the same
// surface, and a context WITH a store must still save.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { rmSync } from "node:fs";

import {
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "../card/render/render-test-storage.js";
import { runAuthMigrations, SessionStore } from "../../src/card/auth/index.js";
import { handleWorkersWriteSurface } from "../../src/server/cloudflare-write-routes.js";
import { LocalAttachmentStore } from "../../src/card/attachments/attachment-store.js";
import { scratchDir } from "../support/scratch-dir.mjs";

const SET_TYPE_ID = 2;
const FILE_TYPE_ID = 30;
const JOE_ID = 90;

const TXT_BYTES = new TextEncoder().encode(
  "crash boundary probe: a small text attachment\n",
);

let storage: RenderTestStorage;
let filesDir: string;
let storeDir: string;
let joeToken = "";

async function seedBoundaryDeck(s: RenderTestStorage): Promise<void> {
  const byId = async (
    id: number,
    name: string,
    extra: Omit<Parameters<typeof seedCard>[1], "id" | "name"> = {},
  ) => seedCard(s, { id, name, ...extra });
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
  await seedCard(s, { id: 10, leftId: 1, rightId: 3, dbContent: "[[Anyone Signed In]]" });
  await seedReference(s, 10, 7, "anyone signed in");
  await seedCard(s, { id: 11, leftId: 1, rightId: 4, dbContent: "[[Anyone Signed In]]" });
  await seedReference(s, 11, 7, "anyone signed in");
  await seedCard(s, { id: 12, leftId: 1, rightId: 5, dbContent: "[[Anyone Signed In]]" });
  await seedReference(s, 12, 7, "anyone signed in");
  await seedCard(s, { id: 17, leftId: 1, rightId: 18, typeId: SET_TYPE_ID });
  await byId(13, "Widget", { typeId: 14, dbContent: "widget body v1" });
  await byId(14, "Basic");
  await seedCard(s, { id: 15, leftId: 14, rightId: 8, typeId: SET_TYPE_ID });
  await byId(16, "RichText");
  await byId(FILE_TYPE_ID, "File", { codename: "file", typeId: SET_TYPE_ID });
  await byId(JOE_ID, "Joe User");
}

function buildMultipartBody(boundary: string, parts: Array<{ name: string; filename?: string; contentType?: string; body: string | Uint8Array }>): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  for (const part of parts) {
    const disposition =
      `Content-Disposition: form-data; name="${part.name}"` +
      (part.filename !== undefined ? `; filename="${part.filename}"` : "") +
      "\r\n";
    const contentType = part.contentType !== undefined ? `Content-Type: ${part.contentType}\r\n` : "";
    chunks.push(encoder.encode(`--${boundary}\r\n${disposition}${contentType}\r\n`));
    chunks.push(typeof part.body === "string" ? encoder.encode(part.body) : part.body);
    chunks.push(encoder.encode("\r\n"));
  }
  chunks.push(encoder.encode(`--${boundary}--\r\n`));
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

/** A File-typed multipart create carrying a real file part — the request
 *  shape that reaches finalizeAttachment and no earlier failure. */
function multipartFileCreate(mark: string, accept: string) {
  const boundary = "----deckoTsCrashBoundary";
  const bodyBytes = buildMultipartBody(boundary, [
    { name: "card[name]", body: mark.replaceAll("_", " ") },
    { name: "card[type]", body: "File" },
    { name: "card[file]", filename: "probe.txt", contentType: "text/plain", body: TXT_BYTES },
  ]);
  return {
    method: "POST",
    pathname: `/update/${mark}`,
    host: "deck.example",
    headers: {
      "content-type": `multipart/form-data; boundary=${boundary}`,
      accept,
      cookie: `decko_ts_session=${joeToken}`,
    },
    body: "",
    bodyBytes,
    secure: false,
    scheme: "http" as const,
  };
}

const WRITE_ARMED = { DECKO_WRITE_PATH: "1" };

/** The two members the surface needs a host render engine for (post-save
 *  rule-cache expiry; the ajax soft redirect). No render happens in this
 *  suite: the crash paths throw before expiry, and the healthy leg asserts
 *  the save, not a render. */
const stubRenderEngine: import("../../src/server/cloudflare-write-routes.js").WorkersRenderEngine = {
  render: async () => {
    throw new Error("no render is expected in the crash-boundary suite");
  },
  expireRenderCard() {},
};

beforeAll(async () => {
  storage = await createRenderTestStorage();
  await runAuthMigrations(storage.counting);
  await seedBoundaryDeck(storage);
  filesDir = scratchDir("decko-ts-crash-boundary-");
  storeDir = scratchDir("decko-ts-crash-boundary-store-");
  joeToken = (await new SessionStore({ driver: storage.counting }).createSession(JOE_ID)).token;
}, 60_000);

afterAll(() => {
  storage?.close();
  rmSync(filesDir, { recursive: true, force: true });
  rmSync(storeDir, { recursive: true, force: true });
});

describe("the write surface's crash boundary", () => {
  it("a files-area-less File create answers a structured 500 naming the throw site and the host's files-area sentence", async () => {
    // No attachmentStore in the context — the deployed miscomposition. This
    // request answered a body-less 500 before the boundary existed.
    const res = await handleWorkersWriteSurface(
      { driver: storage.counting, fetcher: storage.fetcher, renderEngine: stubRenderEngine, attachmentStoreDiagnosis: "set DECKO_STORAGE_ZONE and DECKO_STORAGE_PASSWORD (a pair) to arm this host's files area." },
      multipartFileCreate("Crash_Boundary_Probe", "text/html"),
      WRITE_ARMED,
    );
    expect(res?.status).toBe(500);
    expect(res?.headers["Content-Type"]).toContain("text/html");
    // The throw site's own message, carried verbatim (plainText escapes
    // markup, not apostrophes — "engine's" lands as typed).
    expect(res!.body).toContain("attachment save requires the engine's attachmentStore option");
    // The host's sentence for what arms the files area, appended.
    expect(res!.body).toContain("DECKO_STORAGE_ZONE");
    // Nothing modeled survived into the body as markup: no stack, no raw HTML.
    expect(res!.body).not.toContain("<script");
  });

  it("the same crash through an API client answers JSON carrying the same detail", async () => {
    const res = await handleWorkersWriteSurface(
      { driver: storage.counting, fetcher: storage.fetcher, renderEngine: stubRenderEngine, attachmentStoreDiagnosis: "set DECKO_STORAGE_ZONE and DECKO_STORAGE_PASSWORD (a pair) to arm this host's files area." },
      multipartFileCreate("Crash_Boundary_Json", "application/json"),
      WRITE_ARMED,
    );
    expect(res?.status).toBe(500);
    expect(res?.headers["Content-Type"]).toContain("application/json");
    const parsed = JSON.parse(res!.body) as { error_status: number; errors: { server: string } };
    expect(parsed.error_status).toBe(500);
    expect(parsed.errors.server).toContain("attachment save requires the engine's attachmentStore option");
    expect(parsed.errors.server).toContain("DECKO_STORAGE_ZONE");
  });

  it("without a host diagnosis the 500 still names the throw site, and nothing else is invented", async () => {
    const res = await handleWorkersWriteSurface(
      { driver: storage.counting, fetcher: storage.fetcher, renderEngine: stubRenderEngine },
      multipartFileCreate("Crash_Boundary_No_Diagnosis", "text/html"),
      WRITE_ARMED,
    );
    expect(res?.status).toBe(500);
    expect(res!.body).toContain("attachment save requires the engine's attachmentStore option");
    expect(res!.body).not.toContain("DECKO_STORAGE_ZONE");
  });

  it("a modeled failure keeps its own shape: the no-file control still answers 422 through the same surface", async () => {
    const res = await handleWorkersWriteSurface(
      { driver: storage.counting, fetcher: storage.fetcher, renderEngine: stubRenderEngine },
      {
        method: "POST",
        pathname: "/update/No_File_Control",
        host: "deck.example",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          accept: "text/html",
          cookie: `decko_ts_session=${joeToken}`,
        },
        body: "card%5Bname%5D=No%20File%20Control&card%5Btype%5D=File",
        secure: false,
        scheme: "http",
      },
      WRITE_ARMED,
    );
    expect(res?.status).toBe(422);
    expect(res!.body).toContain("is missing");
  });

  it("a context WITH a store still saves: the boundary changes nothing on the healthy path", async () => {
    const res = await handleWorkersWriteSurface(
      { driver: storage.counting, fetcher: storage.fetcher, renderEngine: stubRenderEngine, attachmentStore: new LocalAttachmentStore(storeDir) },
      multipartFileCreate("Crash_Boundary_Healthy", "text/html"),
      WRITE_ARMED,
    );
    // redirect_cud_success: an HTML-form save answers the hard 303 redirect
    // (the multipart-upload suite's legs pin the same shape), not a crash.
    expect(res?.status).toBe(303);
    const row = await storage.counting.query<{ db_content: string | null }>(
      "SELECT db_content FROM cards WHERE key = ?",
      ["crash_boundary_healthy"],
    );
    expect(row.rows[0]?.db_content).toMatch(/^~\d+\/\d+\.txt$/);
  });
});
