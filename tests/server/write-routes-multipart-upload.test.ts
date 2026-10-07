// The upload INPUT half over the write surface (uploads2): the edit
// form's file_chooser posts multipart/form-data to Ruby's own grammar —
// POST /update/<mark> with a card[<mount>] file part — and the write
// surface must parse it with Rack's semantics, route the file into the
// engine's attachment input, enforce validate_file_exist on creates, and
// answer with the same cud_success redirect every other save gets.
//
// Ruby truth pinned from the installed gems (all file:line checked this
// directly; the full citation block lives in the implementing modules):
//   - Rack 2.2.24 multipart: boundary from the content-type (rack
//     multipart.rb:24 MULTIPART regex), per-part heads/body
//     (multipart/parser.rb), filename "" parts contribute NOTHING
//     (parser.rb:131-135 get_data returns nil), the upload's original
//     filename is the CLIENT path's basename (parser.rb:141-145), and
//     repeated scalar params are LAST-WINS (query_parser.rb:142
//     `params[k] = v` — the file_chooser's hidden card[file]="" comes
//     after the file input in the DOM, the file part overwrites it).
//   - card_mount.rb:41-44 `file=`: blank new_file returns early (the
//     no-file-chosen update is a no-op save), fresh uploads always differ
//     from the stored file (identical_file? compares inode identity of
//     the SAME physical file — never fires for browser tempfiles).
//   - attachment.rb:26-34 event :validate_file_exist, :validate, on:
//     :create: web? -> "url is missing" when content blank; otherwise
//     `errors.add attachment_name, "is missing"` when no file is present.
//     storage_type on a NEW card is storage_type_from_config
//     (01_storage_type.rb:55-57), so a create of a File/Image card on a
//     :local deck fails the attachment arm REGARDLESS of card[content]
//     (the web arm is the config's, not the content's).
//   - Message bytes: ActiveRecord::RecordInvalid =
//     "Validation failed: #{errors.full_messages.join(", ")}"
//     (activerecord-7.2.3.2 validations.rb:24-27 + locale/en.yml:17);
//     ActiveModel full_message = "%{attribute} %{message}" with the
//     attribute humanized (activemodel-7.2.3.2 error.rb:15-56) ->
//     "File is missing" / "Image is missing"; the one-arg web arm
//     (attribute "url is missing", default message :invalid) computes to
//     "Url is missing is invalid" (computed from the gem sources, not
//     live-verified).
//   - The gem has NO size/type upload validation (grep over
//     card-mod-carrierwave set/ + lib/: the only validations are
//     validate_file_exist above and validate_storage_type's unknown-type
//     arm) — byte parity means the port invents none either.
//   - Success: response.rb redirect_cud_success — the plain-form 303 hard
//     redirect with the card_url-absolute Location, the exact shape the
//     urlencoded save pinned. The multipart save rides the same
//     path; these tests pin that it does.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "../card/render/render-test-storage.js";
import { runAuthMigrations, SessionStore } from "../../src/card/auth/index.js";
import { type WriteRouteContext } from "../../src/server/write-routes.js";
import { LocalAttachmentStore } from "../../src/card/attachments/attachment-store.js";
import { DeckoName } from "../../src/card/name.js";
import { makeWriteRouteServer as makeServer } from "./write-routes-test-bridge.js";
import { scratchDir } from "../support/scratch-dir.mjs";

const SET_TYPE_ID = 2;
const FILE_TYPE_ID = 30;
const IMAGE_TYPE_ID = 31;
const JOE_ID = 90;

// The synthetic upload payload (a 1234-byte PNG: real magic bytes + filler).
const PNG_MAGIC = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_BYTES = new Uint8Array(1234).fill(0x41, 16);
PNG_BYTES.set(PNG_MAGIC, 0);

let storage: RenderTestStorage | undefined;
let webStorage: RenderTestStorage | undefined;
let filesDir: string;
let webFilesDir: string;
let joeToken = "";
let webJoeToken = "";
let ctx: WriteRouteContext;
let webCtx: WriteRouteContext;
let server: http.Server;
let webServer: http.Server;
let baseUrl = "";
let webBaseUrl = "";

/**
 * The write-permission rule deck (the write-routes.test.ts shape that the
 * engine's ok_to_* walks resolve), plus the attachment cardtypes and one
 * existing File card:
 *   1 *all  2 Set  3 *update  4 *create  5 *delete
 *   6 Anyone  7 Anyone Signed In  8 *type  9 *self  18 *default
 *   10 *all+*update / 11 *all+*create / 12 *all+*delete -> [[Anyone Signed In]]
 *   13 Widget  14 Basic  15 Basic+*type  16 RichText  17 *all+*default
 *   30 File (codename file)  31 Image (codename image)
 *   4000 Logo File (File-typed, seeded identifier)  90 Joe User
 */
async function seedUploadDeck(s: RenderTestStorage): Promise<void> {
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
  await byId(IMAGE_TYPE_ID, "Image", { codename: "image", typeId: SET_TYPE_ID });
  await byId(4000, "Logo File", {
    typeId: FILE_TYPE_ID,
    dbContent: "~4000/4001.png",
  });
  await byId(JOE_ID, "Joe User");
}

interface CallResult {
  status: number;
  headers: Record<string, string>;
  body: string;
}

async function call(
  base: string,
  method: string,
  path: string,
  opts: {
    form?: Record<string, string>;
    multipart?: { parts: MultipartTestPart[] };
    cookie?: string;
  } = {},
): Promise<CallResult> {
  const headers: Record<string, string> = {};
  let body: Uint8Array | string | undefined;
  if (opts.multipart !== undefined) {
    const boundary = "----deckoTsUploads2";
    headers["Content-Type"] = `multipart/form-data; boundary=${boundary}`;
    body = buildMultipartBody(boundary, opts.multipart.parts);
  } else if (opts.form !== undefined) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(opts.form).toString();
  }
  if (opts.cookie !== undefined) headers["Cookie"] = opts.cookie;
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body as BodyInit,
    redirect: "manual",
  });
  const text = await res.text();
  const responseHeaders: Record<string, string> = {};
  res.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });
  return { status: res.status, headers: responseHeaders, body: text };
}

/** One multipart test part, in the order the browser serializes the
 *  file_chooser's fields. */
interface MultipartTestPart {
  name: string;
  /** Present = a file part (the filename rides the disposition). */
  filename?: string;
  contentType?: string;
  body: string | Uint8Array;
}

function buildMultipartBody(boundary: string, parts: MultipartTestPart[]): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  for (const part of parts) {
    const disposition =
      `Content-Disposition: form-data; name="${part.name}"` +
      (part.filename !== undefined ? `; filename="${part.filename}"` : "") +
      "\r\n";
    const contentType =
      part.contentType !== undefined ? `Content-Type: ${part.contentType}\r\n` : "";
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

async function actionCount(cardId: number): Promise<number> {
  const rows = await storage!.counting.query<{ n: number }>(
    "SELECT COUNT(*) AS n FROM card_actions WHERE card_id = ?",
    [cardId],
  );
  return rows.rows[0]?.n ?? 0;
}

async function dbContentOf(cardId: number): Promise<string | null> {
  const rows = await storage!.counting.query<{ db_content: string | null }>(
    "SELECT db_content FROM cards WHERE id = ?",
    [cardId],
  );
  return rows.rows[0]?.db_content ?? null;
}

beforeAll(async () => {
  storage = await createRenderTestStorage();
  await runAuthMigrations(storage.counting);
  await seedUploadDeck(storage);
  webStorage = await createRenderTestStorage();
  await runAuthMigrations(webStorage.counting);
  await seedUploadDeck(webStorage);

  filesDir = scratchDir("decko-ts-uploads2-local-");
  webFilesDir = scratchDir("decko-ts-uploads2-web-");

  ctx = {
    driver: storage.counting,
    fetcher: storage.fetcher,
    attachmentStore: new LocalAttachmentStore(filesDir),
  };
  // The web-config deck (Cardio.config.file_storage = :web) — the
  // validate_file_exist arm flip and the noUpload input branch's config.
  webCtx = {
    driver: webStorage.counting,
    fetcher: webStorage.fetcher,
    attachmentStore: new LocalAttachmentStore(webFilesDir),
    fileStorage: "web",
  };

  const sessions = new SessionStore({ driver: storage.counting });
  joeToken = (await sessions.createSession(JOE_ID)).token;
  const webSessions = new SessionStore({ driver: webStorage.counting });
  webJoeToken = (await webSessions.createSession(JOE_ID)).token;

  const bridge = await makeServer(storage, ctx, { get: "not-found", bodyBytes: true });
  server = bridge.server;
  baseUrl = bridge.url;
  const webBridge = await makeServer(webStorage, webCtx, { get: "not-found", bodyBytes: true });
  webServer = webBridge.server;
  webBaseUrl = webBridge.url;
}, 60_000);

afterAll(() => {
  server?.close();
  webServer?.close();
  storage?.close();
  webStorage?.close();
  rmSync(filesDir, { recursive: true, force: true });
  rmSync(webFilesDir, { recursive: true, force: true });
});

describe("multipart upload: the file_chooser POST stores the file", () => {
  it("an existing card's update with a card[file] part saves the upload: 303 absolute redirect, identifier, bytes, action comment", async () => {
    const before = await actionCount(4000);
    // The file_chooser's exact field set in DOM order (fileChooserBytes):
    // the FILE part first, then attachment_type_id, then the hidden
    // card[file]="" (whose LAST-WINS overwrite the file part must beat),
    // then file_card_name. _method=patch rides the real edit form.
    const res = await call(baseUrl, "POST", "/update/Logo_File", {
      cookie: joeToken === "" ? undefined : `decko_ts_session=${joeToken}`,
      multipart: {
        parts: [
          {
            name: "card[file]",
            filename: "oracle_cw_probe.png",
            contentType: "image/png",
            body: PNG_BYTES,
          },
          { name: "attachment_type_id", body: String(FILE_TYPE_ID) },
          { name: "card[file]", body: "" },
          { name: "file_card_name", body: "Logo_File" },
          { name: "_method", body: "patch" },
        ],
      },
    });
    expect(res.status).toBe(303);
    // redirect_cud_success: the hard redirect, Location absolutized
    // through card_url (response.rb:31 + :40-42).
    expect(res.headers.location).toBe(`${baseUrl}/Logo_File`);

    // The identifier: db_content carries ~<card_id>/<action_id>.png (the
    // extension downcased from the original name) and the bytes sit at the
    // same relative path in the store.
    const dbContent = await dbContentOf(4000);
    expect(dbContent).toMatch(/^~4000\/\d+\.png$/);
    const rel = (dbContent ?? "").slice(1);
    const stored = await readFile(join(filesDir, rel));
    expect(stored.length).toBe(PNG_BYTES.length);
    expect(Buffer.from(stored.subarray(0, 8)).equals(Buffer.from(PNG_MAGIC))).toBe(true);

    // :save_original_filename — the action comment carries the original
    // upload filename (attachment.rb:20-24).
    const comment = await storage!.counting.query<{ comment: string | null }>(
      "SELECT comment FROM card_actions WHERE card_id = ? ORDER BY id DESC LIMIT 1",
      [4000],
    );
    expect(comment.rows[0]?.comment).toBe("oracle_cw_probe.png");

    // A real upload is never a no-op: exactly one new action.
    expect(await actionCount(4000)).toBe(before + 1);
  });

  it("a no-file-chosen update is a no-op save: nothing stored, no new action, still a 303", async () => {
    const before = await actionCount(4000);
    const dbContentBefore = await dbContentOf(4000);
    // The browser's empty file input serializes as a part with
    // filename="" (Rack drops it, parser.rb:131-135) plus the hidden
    // card[file]="" text part (card_mount.rb:41-42 blank -> early return).
    const res = await call(baseUrl, "POST", "/update/Logo_File", {
      cookie: `decko_ts_session=${joeToken}`,
      multipart: {
        parts: [
          { name: "card[file]", filename: "", contentType: "application/octet-stream", body: PNG_BYTES },
          { name: "card[file]", body: "" },
          { name: "_method", body: "patch" },
        ],
      },
    });
    expect(res.status).toBe(303);
    expect(await actionCount(4000)).toBe(before);
    expect(await dbContentOf(4000)).toBe(dbContentBefore);
  });

  it("a second real upload accumulates: a new action's file lands next to the old one", async () => {
    const before = await actionCount(4000);
    const dbContentBefore = await dbContentOf(4000);
    const res = await call(baseUrl, "POST", "/update/Logo_File", {
      cookie: `decko_ts_session=${joeToken}`,
      multipart: {
        parts: [
          {
            name: "card[file]",
            filename: "Photo.JPG",
            contentType: "image/jpeg",
            body: PNG_BYTES,
          },
          { name: "_method", body: "patch" },
        ],
      },
    });
    expect(res.status).toBe(303);
    expect(await actionCount(4000)).toBe(before + 1);
    const dbContent = await dbContentOf(4000);
    expect(dbContent).not.toBe(dbContentBefore);
    // Ruby's store is copy_to: the prior action's file is never unlinked
    // by a plain update (carrierwave storage/file.rb:31-38).
    expect(await readFile(join(filesDir, (dbContentBefore ?? "").slice(1)))).toBeTruthy();
    expect(await readFile(join(filesDir, (dbContent ?? "").slice(1)))).toBeTruthy();
    // The extension is downcased at the uploader's case expression
    // (file_card_uploader.rb:155-162) — the .JPG upload stores .jpg.
    expect(dbContent).toMatch(/\.jpg$/);
  });
});

describe("multipart upload: creates", () => {
  it("an update of a missing mark routes to create with the file: File-typed card, identifier, bytes", async () => {
    // rest.rb:14-16 — update of a new card creates it. The create form's
    // card[type] names the type ("File").
    const res = await call(baseUrl, "POST", "/update/Fresh_Upload", {
      cookie: `decko_ts_session=${joeToken}`,
      multipart: {
        parts: [
          { name: "card[name]", body: "Fresh Upload" },
          { name: "card[type]", body: "File" },
          {
            name: "card[file]",
            filename: "fresh.png",
            contentType: "image/png",
            body: PNG_BYTES,
          },
          { name: "_method", body: "patch" },
        ],
      },
    });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe(`${baseUrl}/Fresh_Upload`);
    const rows = await storage!.counting.query<{
      id: number;
      type_id: number;
      db_content: string | null;
    }>("SELECT id, type_id, db_content FROM cards WHERE key = ?", [
      DeckoName.parse("Fresh Upload").key,
    ]);
    const row = rows.rows[0];
    expect(row).toBeDefined();
    expect(row?.type_id).toBe(FILE_TYPE_ID);
    expect(row?.db_content).toMatch(/^~\d+\/\d+\.png$/);
    const stored = await readFile(join(filesDir, (row?.db_content ?? "").slice(1)));
    expect(stored.length).toBe(PNG_BYTES.length);
  });
});

describe("validate_file_exist (attachment.rb:26-34, on :create only)", () => {
  it("a :local deck's File create without an upload fails: 422 'Validation failed: File is missing'", async () => {
    // storage_type on a NEW card is storage_type_from_config (:local) —
    // the web arm never fires from content, so a create without a file
    // errors regardless of card[content].
    for (const form of [
      { "card[name]": "No Upload Here", "card[type]": "File", "card[content]": "" },
      {
        "card[name]": "Content Only File",
        "card[type]": "File",
        "card[content]": "http://example.com/x.png",
      },
    ] as Record<string, string>[]) {
      const res = await call(baseUrl, "POST", "/update/No_Upload_Here", {
        cookie: `decko_ts_session=${joeToken}`,
        form,
      });
      expect(res.status).toBe(422);
      expect(res.body).toContain("Validation failed: File is missing");
    }
  });

  it("the same failure for the Image mount: 422 'Validation failed: Image is missing'", async () => {
    const res = await call(baseUrl, "POST", "/update/No_Image_Upload", {
      cookie: `decko_ts_session=${joeToken}`,
      form: { "card[name]": "No Image Upload", "card[type]": "Image" },
    });
    expect(res.status).toBe(422);
    expect(res.body).toContain("Validation failed: Image is missing");
  });

  it("a multipart create without a file part fails the same way", async () => {
    const res = await call(baseUrl, "POST", "/update/Multipart_No_File", {
      cookie: `decko_ts_session=${joeToken}`,
      multipart: {
        parts: [
          { name: "card[name]", body: "Multipart No File" },
          { name: "card[type]", body: "File" },
        ],
      },
    });
    expect(res.status).toBe(422);
    expect(res.body).toContain("Validation failed: File is missing");
  });

  it("updates are never validate_file_exist targets: a File card's content-less urlencoded update stays a 303 no-op", async () => {
    const before = await actionCount(4000);
    const res = await call(baseUrl, "POST", "/update/Logo_File", {
      cookie: `decko_ts_session=${joeToken}`,
      form: { _method: "patch" },
    });
    expect(res.status).toBe(303);
    expect(await actionCount(4000)).toBe(before);
  });
});

describe("the web-config deck (file_storage = :web): validate_file_exist's first arm", () => {
  it("a File create with content succeeds (the web arm skips the attachment check)", async () => {
    const res = await call(webBaseUrl, "POST", "/update/Web_Sourced_File", {
      cookie: `decko_ts_session=${webJoeToken}`,
      form: {
        "card[name]": "Web Sourced File",
        "card[type]": "File",
        "card[content]": "http://example.com/web.png",
      },
    });
    expect(res.status).toBe(303);
    const rows = await webStorage!.counting.query<{ db_content: string | null }>(
      "SELECT db_content FROM cards WHERE key = ?",
      [DeckoName.parse("Web Sourced File").key],
    );
    expect(rows.rows[0]?.db_content).toBe("http://example.com/web.png");
  });

  it("a File create with blank content fails: 422 'Validation failed: Url is missing is invalid'", async () => {
    // The gem's one-arg errors.add "url is missing" (default message
    // :invalid) computes to this full message through ActiveModel's
    // "%{attribute} %{message}" format (activemodel error.rb:15-56) —
    // computed from the gem sources, not live-verified.
    const res = await call(webBaseUrl, "POST", "/update/Web_Blank_File", {
      cookie: `decko_ts_session=${webJoeToken}`,
      form: { "card[name]": "Web Blank File", "card[type]": "File" },
    });
    expect(res.status).toBe(422);
    expect(res.body).toContain("Validation failed: Url is missing is invalid");
  });
});
